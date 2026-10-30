'use server'

import { createClient } from '@/lib/supabase/server'
import { createServerClient } from '@supabase/ssr'
import { revalidatePath } from 'next/cache'
import {
  conditionSchema,
  updateConditionStatusSchema,
  medicationSchema,
  updateMedicationStatusSchema,
  ConditionInput,
  UpdateConditionStatusInput,
  MedicationInput,
  UpdateMedicationStatusInput,
} from '@/lib/validators/clinical-history'

interface RpcResponse {
  success?: boolean
  message?: string
  condition_id?: string
  medication_id?: string
}

interface RepresentationScope {
  can_view_records?: boolean
}

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
 * Validação Estrita de Vínculo Clínico Ativo do Médico (documentation.md - Seções 2.3 e 4.1)
 * Zero-Trust: Apenas médicos com vínculo formal ACTIVE têm acesso de leitura e escrita ao prontuário.
 */
export async function verifyPhysicianAuthorization(physicianUserId: string, patientId: string): Promise<boolean> {
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

/**
 * Verificação de Autorização de Leitura para Prontuário Clínico (Médico, Paciente Titular ou Representante Ativo)
 */
export async function verifyClinicalReadAccess(userId: string, patientId: string) {
  const supabaseAdmin = getAdminClient()

  // 1. Paciente Titular
  const { data: patientProfile } = await supabaseAdmin
    .from('patient_profiles')
    .select('id, user_id')
    .eq('id', patientId)
    .single()

  if (patientProfile && patientProfile.user_id === userId) {
    return { authorized: true, role: 'PATIENT' }
  }

  // 2. Médico com Vínculo Ativo
  const hasLink = await verifyPhysicianAuthorization(userId, patientId)
  if (hasLink) {
    return { authorized: true, role: 'DOCTOR' }
  }

  // 3. Representante Legal Ativo e Homologado com escopo de leitura
  const { data: rep } = await supabaseAdmin
    .from('patient_representations')
    .select('id, status, scope, valid_until')
    .eq('patient_id', patientId)
    .eq('representative_user_id', userId)
    .eq('status', 'ACTIVE')
    .maybeSingle()

  if (rep) {
    const isNotExpired = !rep.valid_until || new Date(rep.valid_until) >= new Date()
    const scope = rep.scope as RepresentationScope | null
    const canView = scope?.can_view_records === true
    if (isNotExpired && canView) {
      return { authorized: true, role: 'REPRESENTATIVE' }
    }
  }

  // 4. Administrador da Instituição
  const { data: adminUser } = await supabaseAdmin
    .from('users')
    .select('role')
    .eq('id', userId)
    .single()

  if (adminUser?.role === 'ADMIN') {
    return { authorized: true, role: 'ADMIN' }
  }

  return { authorized: false }
}

/**
 * 1. Cadastro de Comorbidade / Doença de Base no Prontuário (Fase 4.3)
 */
export async function recordConditionAction(payload: ConditionInput) {
  const parsed = conditionSchema.safeParse(payload)
  if (!parsed.success) {
    const errorMsg = parsed.error.issues.map((i) => i.message).join('. ')
    return { error: errorMsg }
  }

  const { patientId, name, cid10, onsetDate, status, notes } = parsed.data

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Não autorizado: Sessão de usuário não encontrada.' }
  }

  const userRole = (user.user_metadata?.role as string | undefined)?.toUpperCase()
  if (userRole === 'PATIENT' || userRole === 'LEGAL_REPRESENTANT') {
    return { error: 'Acesso negado: Pacientes e representantes não possuem permissão para registrar comorbidades diretamente.' }
  }

  // Validar vínculo clínico ativo
  const isAuthorized = await verifyPhysicianAuthorization(user.id, patientId)
  if (!isAuthorized) {
    return { error: 'Acesso negado: Você não possui vínculo clínico ativo e autorizado com este paciente.' }
  }

  // 1. Executar via RPC transacional atômica nativa do PostgreSQL (Migration 006)
  const { data: rpcData, error: rpcError } = await supabase.rpc('rpc_record_condition', {
    p_patient_id: patientId,
    p_name: name,
    p_cid10: cid10 || null,
    p_onset_date: onsetDate || null,
    p_status: status || 'ACTIVE',
    p_notes: notes || null,
  })

  if (rpcError) {
    if (rpcError.code === 'PGRST202') {
      return {
        error: 'Erro de integridade transacional: A rotina atômica rpc_record_condition não está instalada no banco de dados (Migration 006 pendente no Supabase remoto). Operações clínicas exigem transação atômica única no PostgreSQL.',
      }
    }
    return {
      error: `Falha no registro da comorbidade [rpc_record_condition]: ${rpcError.message}`,
    }
  }

  const res = rpcData as RpcResponse
  revalidatePath('/doctor')
  revalidatePath('/patient/dashboard')
  return {
    success: true,
    message: res.message || 'Comorbidade registrada com sucesso.',
    conditionId: res.condition_id,
  }
}

/**
 * 2. Atualização de Estado de Comorbidade com Bloqueio Otimista (Fase 4.3)
 */
export async function updateConditionStatusAction(payload: UpdateConditionStatusInput) {
  const parsed = updateConditionStatusSchema.safeParse(payload)
  if (!parsed.success) {
    const errorMsg = parsed.error.issues.map((i) => i.message).join('. ')
    return { error: errorMsg }
  }

  const { conditionId, patientId, nextStatus, reason, expectedVersion } = parsed.data

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Não autorizado: Sessão de usuário não encontrada.' }
  }

  const userRole = (user.user_metadata?.role as string | undefined)?.toUpperCase()
  if (userRole === 'PATIENT' || userRole === 'LEGAL_REPRESENTANT') {
    return { error: 'Acesso negado: Pacientes e representantes não possuem permissão para alterar comorbidades diretamente.' }
  }

  const isAuthorized = await verifyPhysicianAuthorization(user.id, patientId)
  if (!isAuthorized) {
    return { error: 'Acesso negado: Você não possui vínculo clínico ativo e autorizado com este paciente.' }
  }

  // 1. Executar via RPC PostgreSQL transacional (Migration 006)
  const { data: rpcData, error: rpcError } = await supabase.rpc('rpc_update_condition_status', {
    p_condition_id: conditionId,
    p_next_status: nextStatus,
    p_reason: reason,
    p_expected_version: expectedVersion,
  })

  if (rpcError) {
    if (rpcError.code === 'PGRST202') {
      return {
        error: 'Erro de integridade transacional: A rotina atômica rpc_update_condition_status não está instalada no banco de dados (Migration 006 pendente no Supabase remoto). Operações clínicas com controle de concorrência exigem transação atômica única.',
      }
    }
    return {
      error: `Falha na alteração de status da comorbidade [rpc_update_condition_status]: ${rpcError.message}`,
    }
  }

  const res = rpcData as RpcResponse
  revalidatePath('/doctor')
  revalidatePath('/patient/dashboard')
  return {
    success: true,
    message: res.message || 'Status da comorbidade atualizado com sucesso.',
  }
}

/**
 * 3. Registro de Medicamento de Uso Contínuo no Prontuário (Fase 4.3)
 */
export async function recordMedicationAction(payload: MedicationInput) {
  const parsed = medicationSchema.safeParse(payload)
  if (!parsed.success) {
    const errorMsg = parsed.error.issues.map((i) => i.message).join('. ')
    return { error: errorMsg }
  }

  const {
    patientId,
    name,
    dosage,
    unit,
    route,
    frequency,
    startDate,
    endDate,
    status,
    isPrescription,
    notes,
  } = parsed.data

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Não autorizado: Sessão de usuário não encontrada.' }
  }

  const userRole = (user.user_metadata?.role as string | undefined)?.toUpperCase()
  if (userRole === 'PATIENT' || userRole === 'LEGAL_REPRESENTANT') {
    return { error: 'Acesso negado: Pacientes e representantes não possuem permissão para registrar medicamentos diretamente.' }
  }

  const isAuthorized = await verifyPhysicianAuthorization(user.id, patientId)
  if (!isAuthorized) {
    return { error: 'Acesso negado: Você não possui vínculo clínico ativo e autorizado com este paciente.' }
  }

  // 1. Executar via RPC PostgreSQL transacional (Migration 006)
  const { data: rpcData, error: rpcError } = await supabase.rpc('rpc_record_medication', {
    p_patient_id: patientId,
    p_name: name,
    p_dosage: dosage || null,
    p_unit: unit || null,
    p_route: route || null,
    p_frequency: frequency || null,
    p_start_date: startDate || null,
    p_end_date: endDate || null,
    p_status: status || 'ACTIVE',
    p_is_prescription: isPrescription || false,
    p_notes: notes || null,
  })

  if (rpcError) {
    if (rpcError.code === 'PGRST202') {
      return {
        error: 'Erro de integridade transacional: A rotina atômica rpc_record_medication não está instalada no banco de dados (Migration 006 pendente no Supabase remoto). Operações clínicas farmacológicas exigem transação atômica única no PostgreSQL.',
      }
    }
    return {
      error: `Falha no registro do medicamento [rpc_record_medication]: ${rpcError.message}`,
    }
  }

  const res = rpcData as RpcResponse
  revalidatePath('/doctor')
  revalidatePath('/patient/dashboard')
  return {
    success: true,
    message: res.message || 'Medicamento registrado com sucesso no prontuário.',
    medicationId: res.medication_id,
  }
}

/**
 * 4. Atualização de Estado de Medicamento com Bloqueio Otimista (Fase 4.3)
 */
export async function updateMedicationStatusAction(payload: UpdateMedicationStatusInput) {
  const parsed = updateMedicationStatusSchema.safeParse(payload)
  if (!parsed.success) {
    const errorMsg = parsed.error.issues.map((i) => i.message).join('. ')
    return { error: errorMsg }
  }

  const { medicationId, patientId, nextStatus, reason, endDate, expectedVersion } = parsed.data

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Não autorizado: Sessão de usuário não encontrada.' }
  }

  const userRole = (user.user_metadata?.role as string | undefined)?.toUpperCase()
  if (userRole === 'PATIENT' || userRole === 'LEGAL_REPRESENTANT') {
    return { error: 'Acesso negado: Pacientes e representantes não possuem permissão para alterar medicamentos diretamente.' }
  }

  const isAuthorized = await verifyPhysicianAuthorization(user.id, patientId)
  if (!isAuthorized) {
    return { error: 'Acesso negado: Você não possui vínculo clínico ativo e autorizado com este paciente.' }
  }

  // 1. Executar via RPC PostgreSQL transacional (Migration 006)
  const { data: rpcData, error: rpcError } = await supabase.rpc('rpc_update_medication_status', {
    p_medication_id: medicationId,
    p_next_status: nextStatus,
    p_reason: reason,
    p_end_date: endDate || null,
    p_expected_version: expectedVersion,
  })

  if (rpcError) {
    if (rpcError.code === 'PGRST202') {
      return {
        error: 'Erro de integridade transacional: A rotina atômica rpc_update_medication_status não está instalada no banco de dados (Migration 006 pendente no Supabase remoto). Operações de farmacoterapia com bloqueio otimista exigem transação atômica única.',
      }
    }
    return {
      error: `Falha na alteração de status do medicamento [rpc_update_medication_status]: ${rpcError.message}`,
    }
  }

  const res = rpcData as RpcResponse
  revalidatePath('/doctor')
  revalidatePath('/patient/dashboard')
  return {
    success: true,
    message: res.message || 'Status do medicamento atualizado com sucesso.',
  }
}
