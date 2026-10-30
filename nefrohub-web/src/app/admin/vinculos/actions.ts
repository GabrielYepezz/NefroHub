'use server'

import { createClient } from '@/lib/supabase/server'
import { createServerClient } from '@supabase/ssr'
import { revalidatePath } from 'next/cache'

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
 * Validação de privilégio administrativo no servidor (PRD Seção 2.2)
 */
async function verifyAdminAuthorization() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    throw new Error('Não autorizado: Sessão não encontrada.')
  }

  const role = (user.user_metadata?.role as string | undefined)?.toUpperCase()
  if (role !== 'ADMIN') {
    throw new Error('Acesso negado: Apenas administradores do hospital podem gerenciar vínculos e representações.')
  }

  return user.id
}

/**
 * Atribuição de Vínculo Médico-Paciente pelo Administrador (PRD Seção 4.1)
 * - Suporta designação de médico principal (isPrimary = true) ou assistente (isPrimary = false)
 * - Se for principal, rebaixa o principal anterior para assistente (transição rastreada)
 */
export async function createPhysicianPatientLinkAction({
  patientId,
  physicianUserId,
  isPrimary,
  reason,
}: {
  patientId: string
  physicianUserId: string
  isPrimary: boolean
  reason?: string
}) {
  try {
    const adminId = await verifyAdminAuthorization()
    const supabaseAdmin = getAdminClient()

    if (!patientId || !physicianUserId) {
      return { error: 'Identificadores de paciente e médico são obrigatórios.' }
    }

    // 1. Verificar se já existe vínculo ativo entre este médico e paciente
    const { data: existingLink } = await supabaseAdmin
      .from('physician_patient_links')
      .select('id, status, is_primary')
      .eq('patient_id', patientId)
      .eq('physician_user_id', physicianUserId)
      .eq('status', 'ACTIVE')
      .maybeSingle()

    if (existingLink) {
      return { error: 'Este médico já possui um vínculo ativo com o paciente informado.' }
    }

    // 2. Se o novo vínculo for PRIMÁRIO, garantir a invariante de exatamente UM responsável principal
    if (isPrimary) {
      const { data: currentPrimary } = await supabaseAdmin
        .from('physician_patient_links')
        .select('id, physician_user_id')
        .eq('patient_id', patientId)
        .eq('is_primary', true)
        .eq('status', 'ACTIVE')
        .maybeSingle()

      if (currentPrimary) {
        // Rebaixar para médico assistente secundário para manter o histórico
        await supabaseAdmin
          .from('physician_patient_links')
          .update({ is_primary: false })
          .eq('id', currentPrimary.id)

        // Registrar evento de reatribuição
        await supabaseAdmin.from('physician_patient_link_events').insert({
          link_id: currentPrimary.id,
          previous_status: 'ACTIVE',
          next_status: 'ACTIVE',
          changed_by_user_id: adminId,
          reason: 'Reatribuição de médico principal por decisão institucional',
        })
      }
    }

    // 3. Inserir novo vínculo ativo
    const { data: newLink, error: insertError } = await supabaseAdmin
      .from('physician_patient_links')
      .insert({
        patient_id: patientId,
        physician_user_id: physicianUserId,
        status: 'ACTIVE',
        is_primary: isPrimary,
        created_by_user_id: adminId,
        activated_at: new Date().toISOString(),
        reason: reason || 'Vínculo assistencial atribuído pela governança hospitalar',
      })
      .select('id')
      .single()

    if (insertError) {
      return { error: `Erro ao criar vínculo clínico: ${insertError.message}` }
    }

    // 4. Registrar evento de transição formal (PRD Seção 4.3)
    await supabaseAdmin.from('physician_patient_link_events').insert({
      link_id: newLink.id,
      previous_status: 'PENDING',
      next_status: 'ACTIVE',
      changed_by_user_id: adminId,
      reason: reason || 'Vínculo inicial formalmente homologado',
    })

    // 5. Trilha de Auditoria Append-Only
    await supabaseAdmin.from('audit_events').insert({
      user_id: adminId,
      action: 'PHYSICIAN_PATIENT_LINK_CREATED',
      resource: 'physician_patient_links',
      patient_id: patientId,
      result: 'SUCCESS',
      metadata: {
        link_id: newLink.id,
        physician_user_id: physicianUserId,
        is_primary: isPrimary,
        reason,
      },
    })

    revalidatePath('/admin/vinculos')
    revalidatePath('/admin/pacientes')
    revalidatePath('/doctor')
    return { success: true, message: 'Vínculo clínico médico-paciente estabelecido com sucesso!' }
  } catch (err: any) {
    return { error: err.message || 'Falha ao estabelecer vínculo clínico.' }
  }
}

/**
 * Encerramento de Vínculo Clínico (PRD Seção 4.4 e 4.5)
 */
export async function endPhysicianPatientLinkAction(linkId: string, reason: string) {
  try {
    const adminId = await verifyAdminAuthorization()
    const supabaseAdmin = getAdminClient()

    if (!reason || reason.trim().length < 3) {
      return { error: 'Informe uma justificativa institucional válida para encerrar o vínculo.' }
    }

    // Buscar vínculo atual
    const { data: link } = await supabaseAdmin
      .from('physician_patient_links')
      .select('id, patient_id, physician_user_id, is_primary, status')
      .eq('id', linkId)
      .single()

    if (!link || link.status !== 'ACTIVE') {
      return { error: 'Vínculo não encontrado ou já encerrado.' }
    }

    // Regra Seção 4.1: Não deixar paciente ativo sem responsável clínico principal
    if (link.is_primary) {
      const { count: otherActiveLinks } = await supabaseAdmin
        .from('physician_patient_links')
        .select('*', { count: 'exact', head: true })
        .eq('patient_id', link.patient_id)
        .eq('status', 'ACTIVE')
        .neq('id', linkId)

      if (!otherActiveLinks || otherActiveLinks === 0) {
        return {
          error: 'Bloqueio de Invariante Clínica: O paciente não pode ficar ativo sem nenhum médico responsável. Atribua um substituto antes de encerrar o vínculo primário.',
        }
      }
    }

    // Encerrar vínculo
    const { error: updateError } = await supabaseAdmin
      .from('physician_patient_links')
      .update({
        status: 'ENDED',
        ended_at: new Date().toISOString(),
        reason: reason.trim(),
      })
      .eq('id', linkId)

    if (updateError) {
      return { error: `Erro ao encerrar vínculo: ${updateError.message}` }
    }

    // Evento de transição
    await supabaseAdmin.from('physician_patient_link_events').insert({
      link_id: linkId,
      previous_status: 'ACTIVE',
      next_status: 'ENDED',
      changed_by_user_id: adminId,
      reason: reason.trim(),
    })

    // Auditoria
    await supabaseAdmin.from('audit_events').insert({
      user_id: adminId,
      action: 'PHYSICIAN_PATIENT_LINK_ENDED',
      resource: 'physician_patient_links',
      patient_id: link.patient_id,
      result: 'SUCCESS',
      justification: reason.trim(),
      metadata: { link_id: linkId, reason },
    })

    revalidatePath('/admin/vinculos')
    revalidatePath('/admin/pacientes')
    revalidatePath('/doctor')
    return { success: true, message: 'Vínculo clínico encerrado conforme protocolo.' }
  } catch (err: any) {
    return { error: err.message || 'Falha ao encerrar vínculo.' }
  }
}

/**
 * Revogação Administrativa de Representação Legal (PRD Seção 5)
 */
export async function revokeRepresentationAdminAction(representationId: string, reason: string) {
  try {
    const adminId = await verifyAdminAuthorization()
    const supabase = await createClient()

    if (!reason || reason.trim().length < 3) {
      return { error: 'Informe uma justificativa institucional válida para revogar a representação.' }
    }

    // Invocar RPC atômica de revogação
    const { error: rpcError } = await supabase.rpc('rpc_revoke_representation', {
      p_representation_id: representationId,
      p_reason: reason.trim(),
    })

    if (rpcError) {
      return { error: `Erro ao revogar representação via RPC: ${rpcError.message}` }
    }

    revalidatePath('/admin/vinculos')
    revalidatePath('/admin/filas')
    revalidatePath('/patient/dashboard')
    return { success: true, message: 'Representação revogada administrativamente com sucesso.' }
  } catch (err: any) {
    return { error: err.message || 'Falha ao revogar representação.' }
  }
}
