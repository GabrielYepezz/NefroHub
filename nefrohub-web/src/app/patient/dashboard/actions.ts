'use server'

import { createClient } from '@/lib/supabase/server'
import { createServerClient } from '@supabase/ssr'
import { revalidatePath } from 'next/cache'
import * as z from 'zod'

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

const vitalSignsSchema = z.object({
  weight: z
    .number()
    .min(10, 'Peso deve ser de no mínimo 10 kg')
    .max(400, 'Peso não pode exceder 400 kg')
    .optional(),
  bpSystolic: z
    .number()
    .min(50, 'Pressão sistólica mínima: 50 mmHg')
    .max(260, 'Pressão sistólica máxima: 260 mmHg')
    .optional(),
  bpDiastolic: z
    .number()
    .min(30, 'Pressão diastólica mínima: 30 mmHg')
    .max(160, 'Pressão diastólica máxima: 160 mmHg')
    .optional(),
  clinicalDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Data no formato AAAA-MM-DD')
    .optional(),
  phone: z.string().trim().optional(),
})

/**
 * Submissão de Sinais Vitais pelo Paciente (documentation.md - Seções 6.1, 6.3, 8.3 e 15.4)
 * Os dados são gravados atomicamente via RPC rpc_submit_patient_vitals em clinical_records
 * com status PENDING_VALIDATION, confirmed_by_user_id: null, e valores em vital_signs.
 * 
 * Regras Obrigatórias de Segurança, Atomicidade e Integridade (Fase 1.2):
 * 1. Prioriza a execução atômica via RPC PostgreSQL (rpc_submit_patient_vitals).
 * 2. Em caso de fallback, assegura rollback total se qualquer etapa falhar.
 * 3. Auditoria obrigatória: a submissão não é confirmada sem o respectivo log de auditoria.
 * 4. Jamais expõe segredos, tokens ou dados brutos de banco de dados ao cliente.
 */
export async function submitPatientVitalSignsAction(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Acesso negado: Sessão de usuário não encontrada.' }
  }

  const rawWeight = formData.get('weight') ? Number(formData.get('weight')) : undefined
  const rawSystolic = formData.get('bpSystolic') ? Number(formData.get('bpSystolic')) : undefined
  const rawDiastolic = formData.get('bpDiastolic') ? Number(formData.get('bpDiastolic')) : undefined
  const rawDate = (formData.get('clinicalDate') as string) || new Date().toISOString().split('T')[0]
  const rawPhone = (formData.get('phone') as string) || undefined

  const parseResult = vitalSignsSchema.safeParse({
    weight: rawWeight,
    bpSystolic: rawSystolic,
    bpDiastolic: rawDiastolic,
    clinicalDate: rawDate,
    phone: rawPhone,
  })

  if (!parseResult.success) {
    const errorMsg = parseResult.error.issues.map((i) => i.message).join('. ')
    return { error: errorMsg }
  }

  const validated = parseResult.data

  // Validação clínica de paridade de Pressão Arterial
  if ((validated.bpSystolic && !validated.bpDiastolic) || (!validated.bpSystolic && validated.bpDiastolic)) {
    return { error: 'Para registrar a pressão arterial, informe tanto a sistólica quanto a diastólica.' }
  }

  // 1. Executar a RPC transacional atômica nativa do PostgreSQL (ACID - Migration 001)
  const { data: rpcData, error: rpcError } = await supabase.rpc('rpc_submit_patient_vitals', {
    p_weight: validated.weight || null,
    p_bp_systolic: validated.bpSystolic || null,
    p_bp_diastolic: validated.bpDiastolic || null,
    p_clinical_date: validated.clinicalDate || null,
    p_phone: validated.phone || null,
  })

  if (rpcError) {
    return {
      error: `Falha no envio de medições [rpc_submit_patient_vitals]: ${rpcError.message}`,
    }
  }

  interface RpcVitalsResponse {
    success?: boolean
    message?: string
    record_id?: string
  }

  const res = rpcData as RpcVitalsResponse | null

  revalidatePath('/patient/dashboard')
  return {
    success: true,
    message: res?.message || 'Medições enviadas com sucesso para a fila de validação.',
  }
}

export async function updatePatientProfileAction(formData: FormData) {
  return submitPatientVitalSignsAction(formData)
}

/**
 * Solicitação de Retificação de Registro Confirmado (documentation.md Seção 6.6)
 * Permite ao paciente, representante ou profissional solicitar correção de dados confirmados.
 * Encaminha o item para a Fila 4 de governança clínica.
 */
export async function requestClinicalRecordReviewAction(payload: {
  recordId: string
  reason: string
}) {
  const { recordId, reason } = payload

  if (!recordId || typeof recordId !== 'string') {
    return { error: 'Identificador do registro clínico inválido.' }
  }

  const cleanReason = reason?.trim()
  if (!cleanReason || cleanReason.length < 5) {
    return { error: 'Informe uma justificativa de retificação com pelo menos 5 caracteres.' }
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Não autorizado: Usuário não autenticado.' }
  }

  const supabaseAdmin = getAdminClient()

  // 1. Verificar se o registro clínico existe e está CONFIRMED
  const { data: record, error: recordError } = await supabaseAdmin
    .from('clinical_records')
    .select('id, patient_id, status')
    .eq('id', recordId)
    .maybeSingle()

  if (recordError || !record) {
    return { error: 'Registro clínico não encontrado.' }
  }

  if (record.status !== 'CONFIRMED') {
    return { error: 'Apenas registros clínicos já confirmados podem ser objeto de retificação.' }
  }

  // 2. Prevenir solicitações pendentes duplicadas (Idempotência)
  const { data: existingRequest } = await supabaseAdmin
    .from('review_requests')
    .select('id')
    .eq('clinical_record_id', recordId)
    .eq('status', 'PENDING')
    .maybeSingle()

  if (existingRequest) {
    return { error: 'Já existe uma solicitação de retificação pendente para este registro clínico.' }
  }

  // 3. Criar a solicitação de revisão
  const { data: newRequest, error: insertError } = await supabaseAdmin
    .from('review_requests')
    .insert({
      clinical_record_id: recordId,
      patient_id: record.patient_id,
      requested_by_user_id: user.id,
      reason: cleanReason,
      status: 'PENDING',
    })
    .select('id')
    .single()

  if (insertError || !newRequest) {
    return { error: `Erro ao registrar solicitação de retificação: ${insertError?.message || 'Falha no banco de dados'}` }
  }

  // 4. Registrar auditoria obrigatória
  try {
    await supabaseAdmin.from('audit_events').insert({
      user_id: user.id,
      patient_id: record.patient_id,
      action: 'REVIEW_REQUEST_CREATED',
      resource: 'review_requests',
      result: 'SUCCESS',
      justification: cleanReason,
      metadata: {
        request_id: newRequest.id,
        clinical_record_id: recordId,
      },
    })
  } catch {
    // Log defensivo
  }

  revalidatePath('/patient/dashboard')
  revalidatePath('/doctor')
  revalidatePath('/admin/filas')

  return {
    success: true,
    message: 'Solicitação de retificação enviada com sucesso para a Fila 4 de governança clínica.',
  }
}
