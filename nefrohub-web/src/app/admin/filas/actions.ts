'use server'

import { createClient } from '@/lib/supabase/server'
import { createServerClient } from '@supabase/ssr'
import { revalidatePath } from 'next/cache'
import { sendTransactionalEmail } from '@/lib/email/service'
import {
  createDoctorApprovedEmail,
  createDoctorRejectedEmail,
  createLinkApprovedEmail,
  createRepresentationDecisionEmail,
} from '@/lib/email/templates'

function getAdminClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: {
        getAll: () => [],
        setAll: () => {},
      },
    }
  )
}

/**
 * Validação de privilégio administrativo no servidor (Seção 2.2)
 */
async function verifyAdminAuthorization() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    throw new Error('Não autorizado: Sessão não encontrada.')
  }

  const role = (user.user_metadata?.role as string | undefined)?.toUpperCase()
  if (role !== 'ADMIN') {
    throw new Error('Acesso negado: Apenas administradores podem despachar filas de governança.')
  }

  return user.id
}

/**
 * FILA 1: Homologação Institucional de Médico
 */
export async function approveDoctorQueueAction(userId: string) {
  try {
    const adminId = await verifyAdminAuthorization()
    const supabaseAdmin = getAdminClient()

    const { data: updatedUsers, error: userError } = await supabaseAdmin
      .from('users')
      .update({ status: 'ACTIVE' })
      .eq('id', userId)
      .eq('status', 'PENDING_APPROVAL')
      .select('id, name, email')

    if (userError) {
      return { error: `Erro ao aprovar médico: ${userError.message}` }
    }

    if (!updatedUsers || updatedUsers.length === 0) {
      return { error: 'Médico já processado ou não se encontra pendente de homologação.' }
    }

    const doctorUser = updatedUsers[0]

    await supabaseAdmin
      .from('physician_profiles')
      .update({
        validation_status: 'VALIDATED',
        validated_by_user_id: adminId,
        validated_at: new Date().toISOString(),
      })
      .eq('user_id', userId)

    await supabaseAdmin.from('audit_events').insert({
      user_id: adminId,
      action: 'PHYSICIAN_APPROVED',
      resource: 'users',
      result: 'SUCCESS',
      metadata: { target_user_id: userId },
    })

    // Disparo seguro de e-mail de homologação com idempotencyKey
    if (doctorUser?.email) {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
      const emailContent = createDoctorApprovedEmail({
        doctorName: doctorUser.name,
        loginLink: `${appUrl}/login`,
      })
      sendTransactionalEmail({
        to: doctorUser.email,
        subject: emailContent.subject,
        html: emailContent.html,
        text: emailContent.text,
        eventType: 'PHYSICIAN_APPROVED',
        targetUserId: userId,
        idempotencyKey: `PHYSICIAN_APPROVED:${userId}`,
      }).catch((err) => console.warn('[approveDoctorQueueAction] Falha no e-mail:', err))
    }

    revalidatePath('/admin/filas')
    revalidatePath('/admin/medicos')
    return { success: true, message: 'Médico homologado e ativado com sucesso.' }
  } catch (err: any) {
    return { error: err.message || 'Falha ao processar homologação de médico.' }
  }
}

/**
 * FILA 1: Recusa Institucional de Médico
 */
export async function rejectDoctorQueueAction(userId: string, reason: string) {
  try {
    const adminId = await verifyAdminAuthorization()
    const supabaseAdmin = getAdminClient()

    const { data: updatedUsers, error: userError } = await supabaseAdmin
      .from('users')
      .update({ status: 'DEACTIVATED' })
      .eq('id', userId)
      .eq('status', 'PENDING_APPROVAL')
      .select('id, name, email')

    if (userError) {
      return { error: `Erro ao recusar médico: ${userError.message}` }
    }

    if (!updatedUsers || updatedUsers.length === 0) {
      return { error: 'Médico já processado ou não se encontra pendente de homologação.' }
    }

    const doctorUser = updatedUsers[0]

    await supabaseAdmin
      .from('physician_profiles')
      .update({
        validation_status: 'REJECTED',
        validated_by_user_id: adminId,
        validated_at: new Date().toISOString(),
      })
      .eq('user_id', userId)

    await supabaseAdmin.from('audit_events').insert({
      user_id: adminId,
      action: 'PHYSICIAN_REJECTED',
      resource: 'users',
      result: 'SUCCESS',
      justification: reason,
      metadata: { target_user_id: userId, reason },
    })

    // Disparo seguro de e-mail de recusa institucional com idempotencyKey
    if (doctorUser?.email) {
      const emailContent = createDoctorRejectedEmail({
        doctorName: doctorUser.name,
      })
      sendTransactionalEmail({
        to: doctorUser.email,
        subject: emailContent.subject,
        html: emailContent.html,
        text: emailContent.text,
        eventType: 'PHYSICIAN_REJECTED',
        targetUserId: userId,
        idempotencyKey: `PHYSICIAN_REJECTED:${userId}`,
      }).catch((err) => console.warn('[rejectDoctorQueueAction] Falha no e-mail:', err))
    }

    revalidatePath('/admin/filas')
    revalidatePath('/admin/medicos')
    return { success: true, message: 'Cadastro médico recusado.' }
  } catch (err: any) {
    return { error: err.message }
  }
}

/**
 * FILA 2: Aprovação de Vínculo Médico-Paciente
 */
export async function approveLinkQueueAction(linkId: string) {
  try {
    const adminId = await verifyAdminAuthorization()
    const supabaseAdmin = getAdminClient()

    const now = new Date().toISOString()
    const { data: updatedLinks, error: linkError } = await supabaseAdmin
      .from('physician_patient_links')
      .update({
        status: 'ACTIVE',
        activated_at: now,
      })
      .eq('id', linkId)
      .eq('status', 'PENDING')
      .select('id, physician_user_id')

    if (linkError) {
      return { error: `Erro ao ativar vínculo: ${linkError.message}` }
    }

    if (!updatedLinks || updatedLinks.length === 0) {
      return { error: 'Vínculo já homologado ou não se encontra pendente.' }
    }

    await supabaseAdmin.from('physician_patient_link_events').insert({
      link_id: linkId,
      previous_status: 'PENDING',
      next_status: 'ACTIVE',
      action_by_user_id: adminId,
      reason: 'Aprovação institucional pela Fila 2 do backoffice.',
      origin: 'ADMIN_QUEUE',
    })

    await supabaseAdmin.from('audit_events').insert({
      user_id: adminId,
      action: 'PHYSICIAN_PATIENT_LINK_APPROVED',
      resource: 'physician_patient_links',
      result: 'SUCCESS',
      metadata: { link_id: linkId },
    })

    // Notificar médico sobre novo vínculo ativo
    const { data: linkRecord } = await supabaseAdmin
      .from('physician_patient_links')
      .select('physician_user_id, users:physician_user_id(name, email)')
      .eq('id', linkId)
      .maybeSingle()

    const docObj = (linkRecord as any)?.users
    if (docObj?.email) {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
      const emailContent = createLinkApprovedEmail({
        recipientName: docObj.name,
        portalLink: `${appUrl}/doctor`,
      })
      sendTransactionalEmail({
        to: docObj.email,
        subject: emailContent.subject,
        html: emailContent.html,
        text: emailContent.text,
        eventType: 'LINK_APPROVED',
        targetUserId: linkRecord?.physician_user_id,
        idempotencyKey: `LINK_APPROVED:${linkId}`,
      }).catch((err) => console.warn('[approveLinkQueueAction] Falha no e-mail:', err))
    }

    revalidatePath('/admin/filas')
    revalidatePath('/admin/vinculos')
    return { success: true, message: 'Vínculo médico-paciente homologado e ativado.' }
  } catch (err: any) {
    return { error: err.message }
  }
}

/**
 * FILA 2: Recusa de Vínculo Médico-Paciente
 */
export async function rejectLinkQueueAction(linkId: string, reason: string) {
  try {
    const adminId = await verifyAdminAuthorization()
    const supabaseAdmin = getAdminClient()

    const { data: updatedLinks, error: linkError } = await supabaseAdmin
      .from('physician_patient_links')
      .update({
        status: 'REJECTED',
      })
      .eq('id', linkId)
      .eq('status', 'PENDING')
      .select('id')

    if (linkError) {
      return { error: `Erro ao rejeitar vínculo: ${linkError.message}` }
    }

    if (!updatedLinks || updatedLinks.length === 0) {
      return { error: 'Vínculo já processado ou não se encontra pendente.' }
    }

    await supabaseAdmin.from('physician_patient_link_events').insert({
      link_id: linkId,
      previous_status: 'PENDING',
      next_status: 'REJECTED',
      action_by_user_id: adminId,
      reason: reason || 'Recusa administrativa de vínculo.',
      origin: 'ADMIN_QUEUE',
    })

    await supabaseAdmin.from('audit_events').insert({
      user_id: adminId,
      action: 'PHYSICIAN_PATIENT_LINK_REJECTED',
      resource: 'physician_patient_links',
      result: 'SUCCESS',
      justification: reason,
      metadata: { link_id: linkId, reason },
    })

    revalidatePath('/admin/filas')
    revalidatePath('/admin/vinculos')
    return { success: true, message: 'Solicitação de vínculo recusada.' }
  } catch (err: any) {
    return { error: err.message }
  }
}

/**
 * FILA 2: Homologação de Representação Legal / Cuidador (Fase 4.1 - Seção 5)
 */
export async function approveRepresentationQueueAction(representationId: string) {
  try {
    const adminId = await verifyAdminAuthorization()
    const supabase = await createClient()

    // 1. Executar via RPC transacional atômica (Migration 004)
    const { data: rpcData, error: rpcError } = await supabase.rpc('rpc_approve_representation', {
      p_representation_id: representationId,
    })

    if (rpcError) {
      if (rpcError.code === 'PGRST202') {
        return {
          error: 'Erro de integridade transacional: A rotina atômica rpc_approve_representation não está instalada no banco de dados (Migration 004 pendente no Supabase remoto). Homologações de representação exigem transação atômica única.',
        }
      }
      return {
        error: `Falha na homologação da representação [rpc_approve_representation]: ${rpcError.message}`,
      }
    }

    // Notificar representante sobre homologação
    const supabaseAdmin = getAdminClient()
    const { data: rep } = await supabaseAdmin
      .from('patient_representations')
      .select('representative_user_id, users:representative_user_id(name, email)')
      .eq('id', representationId)
      .maybeSingle()

    const repObj = (rep as any)?.users
    if (repObj?.email) {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
      const emailContent = createRepresentationDecisionEmail({
        representativeName: repObj.name,
        approved: true,
        portalLink: `${appUrl}/patient/dashboard`,
      })
      sendTransactionalEmail({
        to: repObj.email,
        subject: emailContent.subject,
        html: emailContent.html,
        text: emailContent.text,
        eventType: 'REPRESENTATION_APPROVED',
        targetUserId: rep?.representative_user_id,
        idempotencyKey: `REPRESENTATION_APPROVED:${representationId}`,
      }).catch((err) => console.warn('[approveRepresentationQueueAction] Falha no e-mail:', err))
    }

    revalidatePath('/admin/filas')
    revalidatePath('/admin/vinculos')
    return { success: true, message: (rpcData as { message?: string } | null)?.message || 'Representação homologada.' }
  } catch (err: any) {
    return { error: err.message || 'Falha ao homologar representação.' }
  }
}

/**
 * FILA 2: Recusa de Representação Legal / Cuidador (Fase 4.1 - Seção 5)
 */
export async function rejectRepresentationQueueAction(representationId: string, reason: string) {
  try {
    await verifyAdminAuthorization()
    const supabase = await createClient()

    const { data: rpcData, error: rpcError } = await supabase.rpc('rpc_reject_representation', {
      p_representation_id: representationId,
      p_reason: reason,
    })

    if (rpcError) {
      if (rpcError.code === 'PGRST202') {
        return {
          error: 'Erro de integridade transacional: A rotina atômica rpc_reject_representation não está instalada no banco de dados (Migration 004 pendente no Supabase remoto).',
        }
      }
      return {
        error: `Falha na recusa da representação [rpc_reject_representation]: ${rpcError.message}`,
      }
    }

    // Notificar representante sobre parecer institucional
    const supabaseAdmin = getAdminClient()
    const { data: rep } = await supabaseAdmin
      .from('patient_representations')
      .select('representative_user_id, users:representative_user_id(name, email)')
      .eq('id', representationId)
      .maybeSingle()

    const repObj = (rep as any)?.users
    if (repObj?.email) {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
      const emailContent = createRepresentationDecisionEmail({
        representativeName: repObj.name,
        approved: false,
        portalLink: `${appUrl}/login`,
      })
      sendTransactionalEmail({
        to: repObj.email,
        subject: emailContent.subject,
        html: emailContent.html,
        text: emailContent.text,
        eventType: 'REPRESENTATION_REJECTED',
        targetUserId: rep?.representative_user_id,
        idempotencyKey: `REPRESENTATION_REJECTED:${representationId}`,
      }).catch((err) => console.warn('[rejectRepresentationQueueAction] Falha no e-mail:', err))
    }

    revalidatePath('/admin/filas')
    revalidatePath('/admin/vinculos')
    return { success: true, message: (rpcData as { message?: string } | null)?.message || 'Representação recusada.' }
  } catch (err: any) {
    return { error: err.message || 'Falha ao recusar representação.' }
  }
}

/**
 * FILA 4: Decisão sobre Solicitação de Retificação/Correção (Seção 6.6)
 */
export async function decideReviewRequestQueueAction(
  requestId: string,
  decision: 'APPROVED' | 'REJECTED',
  decisionReason?: string
) {
  try {
    const adminId = await verifyAdminAuthorization()
    const supabaseAdmin = getAdminClient()

    // 1. Bloqueio otimista de concorrência: update atômico se status for PENDING
    const { data: updatedRequests, error: reviewError } = await supabaseAdmin
      .from('review_requests')
      .update({
        status: decision,
        decided_by_user_id: adminId,
        decision_reason: decisionReason || null,
        decided_at: new Date().toISOString(),
      })
      .eq('id', requestId)
      .eq('status', 'PENDING')
      .select('id, clinical_record_id, patient_id, reason')

    if (reviewError) {
      return { error: `Erro ao despachar pedido de revisão: ${reviewError.message}` }
    }

    if (!updatedRequests || updatedRequests.length === 0) {
      return { error: 'Solicitação de retificação já despachada ou não se encontra pendente.' }
    }

    const reqItem = updatedRequests[0]

    // 2. Se for APPROVED: criar nova versão encadeada com supersedes_record_id (documentation.md Seção 6.6)
    if (decision === 'APPROVED') {
      const { data: originalRecord } = await supabaseAdmin
        .from('clinical_records')
        .select('*')
        .eq('id', reqItem.clinical_record_id)
        .maybeSingle()

      if (originalRecord) {
        const nextVersion = (originalRecord.version || 1) + 1

        const { data: newRecord, error: newRecError } = await supabaseAdmin
          .from('clinical_records')
          .insert({
            patient_id: originalRecord.patient_id,
            clinical_date: originalRecord.clinical_date,
            record_type: originalRecord.record_type,
            status: 'CONFIRMED',
            supersedes_record_id: originalRecord.id,
            created_by_user_id: originalRecord.created_by_user_id || adminId,
            confirmed_by_user_id: adminId,
            confirmed_at: new Date().toISOString(),
          })
          .select('id')
          .single()

        if (newRecord) {
          // Copiar sinais vitais preservando a cadeia histórica
          const { data: originalVitals } = await supabaseAdmin
            .from('vital_signs')
            .select('*')
            .eq('clinical_record_id', originalRecord.id)

          if (originalVitals && originalVitals.length > 0) {
            const vitalsToCopy = originalVitals.map((v: any) => ({
              clinical_record_id: newRecord.id,
              sign_code: v.sign_code,
              numeric_value: v.numeric_value,
              unit: v.unit,
            }))
            await supabaseAdmin.from('vital_signs').insert(vitalsToCopy)
          }

          // Copiar resultados laboratoriais se houver
          const { data: originalLabs } = await supabaseAdmin
            .from('lab_results')
            .select('*')
            .eq('clinical_record_id', originalRecord.id)

          if (originalLabs && originalLabs.length > 0) {
            const labsToCopy = originalLabs.map((l: any) => ({
              clinical_record_id: newRecord.id,
              exam_name: l.exam_name,
              numeric_value: l.numeric_value,
              original_unit: l.original_unit,
              normalized_value: l.normalized_value,
            }))
            await supabaseAdmin.from('lab_results').insert(labsToCopy)
          }

          // Registrar auditoria de nova versão encadeada
          await supabaseAdmin.from('audit_events').insert({
            user_id: adminId,
            patient_id: reqItem.patient_id,
            action: 'CLINICAL_RECORD_SUPERSEDED',
            resource: 'clinical_records',
            result: 'SUCCESS',
            justification: decisionReason || reqItem.reason,
            metadata: {
              previous_record_id: originalRecord.id,
              new_record_id: newRecord.id,
              supersedes_record_id: originalRecord.id,
              version: nextVersion,
              review_request_id: requestId,
            },
          })
        }
      }
    } else {
      // Se for REJECTED: registrar auditoria
      await supabaseAdmin.from('audit_events').insert({
        user_id: adminId,
        patient_id: reqItem.patient_id,
        action: 'REVIEW_REQUEST_REJECTED',
        resource: 'review_requests',
        result: 'SUCCESS',
        justification: decisionReason,
        metadata: { request_id: requestId, decision },
      })
    }

    revalidatePath('/admin/filas')
    revalidatePath('/doctor')
    revalidatePath('/patient/dashboard')

    return {
      success: true,
      message: `Solicitação de retificação ${decision === 'APPROVED' ? 'aprovada (nova versão imutável gerada no prontuário)' : 'recusada'} com sucesso.`,
    }
  } catch (err: any) {
    return { error: err.message }
  }
}

/**
 * FILA 5: Despacho de Destinação e Descarte de Documentos/Exames Rejeitados (Seção 6.5)
 */
export async function processDocumentDisposalAction(
  eventId: string,
  decision: 'EXPURGED' | 'ARCHIVED'
) {
  try {
    const adminId = await verifyAdminAuthorization()
    const supabaseAdmin = getAdminClient()

    const { data: updatedRows, error: eventError } = await supabaseAdmin
      .from('rejected_submission_events')
      .update({
        disposal_status: decision,
      })
      .eq('id', eventId)
      .eq('disposal_status', 'PENDING_DISPOSAL')
      .select('id')

    if (eventError) {
      return { error: `Erro ao processar destinação: ${eventError.message}` }
    }

    if (!updatedRows || updatedRows.length === 0) {
      return { error: 'Item já processado ou não se encontra pendente de destinação.' }
    }

    await supabaseAdmin.from('audit_events').insert({
      user_id: adminId,
      action: `DOCUMENT_DISPOSAL_${decision}`,
      resource: 'rejected_submission_events',
      result: 'SUCCESS',
      metadata: { event_id: eventId, decision },
    })

    revalidatePath('/admin/filas')
    return { success: true, message: `Item destinado com status ${decision}.` }
  } catch (err: any) {
    return { error: err.message }
  }
}
