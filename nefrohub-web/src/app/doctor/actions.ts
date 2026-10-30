'use server'

import { createClient } from '@/lib/supabase/server'
import { createServerClient } from '@supabase/ssr'
import { revalidatePath } from 'next/cache'
import { calculateCKDEPI2021 } from '@/lib/calculators/ckd-epi'
import * as z from 'zod'
import { sendTransactionalEmail } from '@/lib/email/service'
import { createPatientGenericUpdateEmail } from '@/lib/email/templates'
import { assertServerMFAAssurance } from '@/lib/security/mfa-guard'

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
 * Validação de Autorização Clínica do Médico (documentation.md - Seções 2.3 e 4.1):
 * Um médico só pode atuar sobre registros de um paciente se possuir vínculo ACTIVE com ele.
 */
async function verifyPhysicianAuthorization(physicianUserId: string, patientId: string) {
  const supabaseAdmin = getAdminClient()

  const { data: link } = await supabaseAdmin
    .from('physician_patient_links')
    .select('id, status, is_primary')
    .eq('physician_user_id', physicianUserId)
    .eq('patient_id', patientId)
    .eq('status', 'ACTIVE')
    .maybeSingle()

  return !!link
}

const labExamSchema = z.object({
  patientId: z.string().uuid('ID do paciente inválido'),
  examName: z.string().trim().min(2, 'Nome do exame é obrigatório'),
  numericValue: z.number().positive('O valor deve ser estritamente positivo'),
  originalUnit: z.string().trim().min(1, 'Unidade do exame é obrigatória'),
  clinicalDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data no formato AAAA-MM-DD'),
  calculateEgfr: z.boolean().optional(),
})

export type RecordLabExamDTO = z.infer<typeof labExamSchema>

/**
 * Registro Estruturado de Exame Laboratorial e Cálculo da CKD-EPI 2021 (Fase 3.2)
 * 
 * Regras de Negócio e Segurança:
 * 1. O médico só pode lançar exames para pacientes com vínculo ACTIVE comprovado.
 * 2. Lança registro com status 'CONFIRMED' no prontuário oficial (imutável).
 * 3. Se for Creatinina Sérica, calcula eTFG pela equação CKD-EPI 2021 (sem raça)
 *    e persiste o evento em calculation_runs (Seção 10.4).
 * 4. Grava auditoria obrigatória (sem supressão de erro).
 */
export async function recordLabExamAction(payload: RecordLabExamDTO) {
  const validation = labExamSchema.safeParse(payload)
  if (!validation.success) {
    const msg = validation.error.issues.map((i) => i.message).join('. ')
    return { error: msg }
  }

  const { patientId, examName, numericValue, originalUnit, clinicalDate, calculateEgfr } = validation.data

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Não autorizado: Usuário não autenticado.' }
  }

  // 1. Validar autorização por vínculo ativo
  const isAuthorized = await verifyPhysicianAuthorization(user.id, patientId)
  if (!isAuthorized) {
    return { error: 'Acesso negado: Você não possui vínculo clínico ativo e autorizado com este paciente.' }
  }

  // 2. Executar via RPC PostgreSQL transacional atômica (ACID - Migration 002)
  const isCreatinine = examName.toLowerCase().includes('creatinina')
  const shouldCalculate = calculateEgfr || isCreatinine

  const { data: rpcData, error: rpcError } = await supabase.rpc('rpc_record_lab_exam', {
    p_patient_id: patientId,
    p_exam_name: examName,
    p_numeric_value: numericValue,
    p_original_unit: originalUnit,
    p_clinical_date: clinicalDate,
    p_calculate_egfr: shouldCalculate,
  })

  if (rpcError) {
    if (rpcError.code === 'PGRST202') {
      return {
        error: 'Erro de integridade transacional: A rotina atômica rpc_record_lab_exam não está instalada no banco de dados (Migration 002 pendente no Supabase remoto). Para garantir integridade e prevenir registros órfãos, lançamentos de exames exigem transação atômica única no PostgreSQL.',
      }
    }
    return {
      error: `Falha na gravação do exame clínico [rpc_record_lab_exam]: ${rpcError.message}`,
    }
  }

  interface LabExamRpcResponse {
    success?: boolean
    message?: string
    egfr?: number | null
    stage?: string | null
  }

  const res = rpcData as LabExamRpcResponse | null

  revalidatePath('/doctor')
  revalidatePath('/patient/dashboard')
  return {
    success: true,
    message: res?.message || 'Exame laboratorial registrado com sucesso.',
    egfr: res?.egfr,
    stage: res?.stage,
  }
}

function shouldCreatinineCalculation(examName: string, flag?: boolean): boolean {
  return !!flag || examName.toLowerCase().includes('creatinina')
}

/**
 * Confirmação de Registro Clínico pelo Médico Responsável (Seção 6.1 e 6.3)
 */
export async function confirmClinicalRecordAction(recordId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Não autorizado: Usuário não autenticado.' }
  }

  const { data: rpcData, error: rpcError } = await supabase.rpc('rpc_confirm_clinical_record', {
    p_record_id: recordId,
  })

  if (rpcError) {
    return {
      error: `Falha na confirmação clínica [rpc_confirm_clinical_record]: ${rpcError.message}`,
    }
  }

  interface RpcConfirmResponse {
    success?: boolean
    message?: string
  }

  const res = rpcData as RpcConfirmResponse | null

  revalidatePath('/doctor')
  return {
    success: true,
    message: res?.message || 'Registro clínico validado e confirmado com sucesso.',
  }
}

/**
 * Rejeição de Submissão do Paciente (Seção 6.5)
 * Transiciona o registro clínico para status REJECTED e grava o evento correspondente
 * na tabela rejected_submission_events com o código de recusa através da RPC rpc_reject_clinical_record.
 */
export async function rejectClinicalRecordAction(
  recordId: string,
  rejectionCode: 'INVALID_VALUE' | 'DUPLICATE' | 'UNREADABLE' | 'INCOMPLETE' | 'OTHER',
  rejectionReason?: string
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Não autorizado: Usuário não autenticado.' }
  }

  const { data: rpcData, error: rpcError } = await supabase.rpc('rpc_reject_clinical_record', {
    p_record_id: recordId,
    p_rejection_code: rejectionCode,
    p_rejection_reason: rejectionReason || null,
  })

  if (rpcError) {
    return {
      error: `Falha na rejeição clínica [rpc_reject_clinical_record]: ${rpcError.message}`,
    }
  }

  interface RpcRejectResponse {
    success?: boolean
    message?: string
  }

  const res = rpcData as RpcRejectResponse | null

  // Notificação genérica ao paciente (documentation.md Seção 6.5 & 7.4)
  // ESTRITAMENTE SEM DADOS CLÍNICOS, SEM VALORES E SEM MOTIVOS SENSÍVEIS
  try {
    const supabaseAdmin = getAdminClient()
    const { data: record } = await supabaseAdmin
      .from('clinical_records')
      .select('patient_id, patient_profiles:patient_id(full_name, email, user_id, users:user_id(email))')
      .eq('id', recordId)
      .maybeSingle()

    const pProfile = (record as any)?.patient_profiles
    const patientEmail = pProfile?.email || pProfile?.users?.email

    if (patientEmail) {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
      const emailContent = createPatientGenericUpdateEmail({
        patientName: pProfile?.full_name || 'Paciente',
        portalLink: `${appUrl}/patient/dashboard`,
      })
      sendTransactionalEmail({
        to: patientEmail,
        subject: emailContent.subject,
        html: emailContent.html,
        text: emailContent.text,
        eventType: 'CLINICAL_SUBMISSION_REJECTED_GENERIC_NOTICE',
        targetUserId: pProfile?.user_id || undefined,
        idempotencyKey: `CLINICAL_REJECTED:${recordId}`,
      }).catch((err) => console.warn('[rejectClinicalRecordAction] Aviso no envio de e-mail ao paciente:', err))
    }
  } catch (err: any) {
    console.warn('[rejectClinicalRecordAction] Falha defensiva ao disparar notificação:', err.message)
  }

  revalidatePath('/doctor')
  return {
    success: true,
    message: res?.message || 'Submissão rejeitada conforme o protocolo clínico.',
  }
}

const emergencyCoverageSchema = z.object({
  patientId: z.string().uuid('Identificador do paciente inválido'),
  justification: z
    .string()
    .trim()
    .min(15, 'A justificativa de cobertura emergencial deve ter no mínimo 15 caracteres'),
  coverageType: z.enum(['PLANTÃO', 'SUBSTITUIÇÃO', 'INTERCORRÊNCIA', 'COORDENAÇÃO']),
})

/**
 * Ativação de Cobertura Emergencial pelo Doctor Master (documentation.md Seção 2.4 - RF-004)
 * - Restrito a usuários com papel DOCTOR_MASTER ou is_master=true.
 * - Justificativa clínica formal e auditável obrigatória.
 * - Registro append-only em audit_events sem bypass.
 */
export async function assumeDoctorMasterCoverageAction(payload: z.infer<typeof emergencyCoverageSchema>) {
  const validation = emergencyCoverageSchema.safeParse(payload)
  if (!validation.success) {
    return { error: validation.error.issues.map((i) => i.message).join('. ') }
  }

  const { patientId, justification, coverageType } = validation.data
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Não autenticado.' }
  }

  // 1. Validar se o usuário possui perfil DOCTOR_MASTER
  const { data: dbUser } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single()

  const { data: docProfile } = await supabase
    .from('physician_profiles')
    .select('is_master')
    .eq('user_id', user.id)
    .maybeSingle()

  const isMaster = dbUser?.role === 'DOCTOR_MASTER' || docProfile?.is_master === true

  if (!isMaster) {
    return {
      error: 'Acesso negado: Apenas profissionais com papel de Doctor Master (Coordenação Clínica) podem assumir cobertura emergencial.',
    }
  }

  // 2. Verificar MFA AAL2 no servidor
  const mfaCheck = await assertServerMFAAssurance(supabase, 'DOCTOR_MASTER')
  if (!mfaCheck.authorized) {
    return { error: mfaCheck.error }
  }

  // 3. Criar ou ativar vínculo de cobertura com service role
  const supabaseAdmin = getAdminClient()

  const { data: patient } = await supabaseAdmin
    .from('patient_profiles')
    .select('id, full_name')
    .eq('id', patientId)
    .maybeSingle()

  if (!patient) {
    return { error: 'Paciente não encontrado no sistema institucional.' }
  }

  const coverageReason = `COBERTURA_EMERGENCIAL_${coverageType}: ${justification}`

  const { error: linkError } = await supabaseAdmin
    .from('physician_patient_links')
    .upsert(
      {
        patient_id: patientId,
        physician_user_id: user.id,
        is_primary: false,
        status: 'ACTIVE',
        reason: coverageReason,
        activated_at: new Date().toISOString(),
        created_by_user_id: user.id,
      },
      { onConflict: 'physician_user_id,patient_id' }
    )

  if (linkError) {
    return { error: `Falha ao registrar vínculo de cobertura: ${linkError.message}` }
  }

  // 4. Trilha de auditoria append-only obrigatória (Seção 2.4 e 15.4)
  await supabaseAdmin
    .from('audit_events')
    .insert({
      user_id: user.id,
      action: 'DOCTOR_MASTER_EMERGENCY_COVERAGE_ACTIVATED',
      resource_type: 'PATIENT_PROFILE',
      resource_id: patientId,
      details: {
        coverage_type: coverageType,
        justification,
        patient_name: patient.full_name,
        timestamp: new Date().toISOString(),
      },
    })

  revalidatePath('/doctor')
  return { success: true, message: `Cobertura emergencial ativada para o paciente ${patient.full_name}.` }
}

/**
 * Encerramento de Cobertura pelo Doctor Master (RF-004)
 */
export async function endDoctorMasterCoverageAction(payload: { patientId: string; reason?: string }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }

  const supabaseAdmin = getAdminClient()
  const { error } = await supabaseAdmin
    .from('physician_patient_links')
    .update({ status: 'ENDED', ended_at: new Date().toISOString() })
    .eq('physician_user_id', user.id)
    .eq('patient_id', payload.patientId)

  if (error) return { error: error.message }

  await supabaseAdmin
    .from('audit_events')
    .insert({
      user_id: user.id,
      action: 'DOCTOR_MASTER_EMERGENCY_COVERAGE_ENDED',
      resource_type: 'PATIENT_PROFILE',
      resource_id: payload.patientId,
      details: {
        reason: payload.reason || 'Encerramento regular de cobertura emergencial',
        ended_at: new Date().toISOString(),
      },
    })

  revalidatePath('/doctor')
  return { success: true }
}
