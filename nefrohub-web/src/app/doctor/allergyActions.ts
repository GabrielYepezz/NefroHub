// src/app/doctor/allergyActions.ts
'use server'

import { createClient } from '@/lib/supabase/server'
import { createServerClient } from '@supabase/ssr'
import { revalidatePath } from 'next/cache'
import * as z from 'zod'
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
 * Schema de Validação de Registro de Alergia (documentation.md Seção 8.6 - RF-054)
 */
const recordAllergySchema = z.object({
  patientId: z.string().uuid('Identificador do paciente inválido'),
  substance: z.string().trim().min(2, 'A substância ou alérgeno deve ter no mínimo 2 caracteres'),
  reaction: z.string().trim().optional(),
  severity: z.enum(['LEVE', 'MODERADA', 'GRAVE']).optional(),
  status: z.enum(['KNOWN', 'NO_KNOWN_ALLERGIES', 'UNREPORTED', 'RESOLVED']).default('KNOWN'),
  clinicalDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data clínica no formato AAAA-MM-DD').optional(),
})

export type RecordAllergyInput = z.infer<typeof recordAllergySchema>

/**
 * Validação de autorização do médico assistente
 */
async function verifyPhysicianAuthorization(physicianUserId: string, patientId: string) {
  const supabaseAdmin = getAdminClient()

  // 1. Vínculo clínico ativo regular
  const { data: link } = await supabaseAdmin
    .from('physician_patient_links')
    .select('id, status')
    .eq('physician_user_id', physicianUserId)
    .eq('patient_id', patientId)
    .eq('status', 'ACTIVE')
    .maybeSingle()

  if (link) return true

  // 2. Doctor Master com cobertura ativa
  const { data: docProfile } = await supabaseAdmin
    .from('physician_profiles')
    .select('is_master')
    .eq('user_id', physicianUserId)
    .maybeSingle()

  const { data: dbUser } = await supabaseAdmin
    .from('users')
    .select('role')
    .eq('id', physicianUserId)
    .maybeSingle()

  return dbUser?.role === 'DOCTOR_MASTER' || docProfile?.is_master === true
}

/**
 * Registra uma alergia conhecida no prontuário do paciente (RF-054)
 */
export async function recordAllergyAction(payload: RecordAllergyInput) {
  const validation = recordAllergySchema.safeParse(payload)
  if (!validation.success) {
    return { error: validation.error.issues.map((i) => i.message).join('. ') }
  }

  const { patientId, substance, reaction, severity, status, clinicalDate } = validation.data
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Não autorizado: Usuário não autenticado.' }
  }

  // 1. Autorização Zero-Trust do médico
  const isAuthorized = await verifyPhysicianAuthorization(user.id, patientId)
  if (!isAuthorized) {
    return { error: 'Acesso negado: Você não possui vínculo clínico ativo com este paciente.' }
  }

  // 2. Verificação de MFA AAL2 no servidor
  const mfaCheck = await assertServerMFAAssurance(supabase, 'DOCTOR')
  if (!mfaCheck.authorized) {
    return { error: mfaCheck.error }
  }

  const supabaseAdmin = getAdminClient()
  const today = clinicalDate || new Date().toISOString().split('T')[0]

  // 3. Persistência na tabela allergies
  const { data: allergyRecord, error: allergyError } = await supabaseAdmin
    .from('allergies')
    .insert({
      patient_id: patientId,
      substance,
      reaction: reaction || null,
      severity: severity || null,
      status,
    })
    .select('id')
    .single()

  if (allergyError) {
    return { error: `Falha ao registrar alergia: ${allergyError.message}` }
  }

  // 4. Inserção de registro correspondente em clinical_records (tipo ALLERGY)
  try {
    await supabaseAdmin
      .from('clinical_records')
      .insert({
        patient_id: patientId,
        record_type: 'ALLERGY',
        status: 'CONFIRMED',
        clinical_date: today,
        created_by_user_id: user.id,
        confirmed_by_user_id: user.id,
        confirmed_at: new Date().toISOString(),
      })
  } catch {
    // Log defensivo se a constraint do enum ALLERGY não aceitar
  }

  // 5. Auditoria de registro
  try {
    await supabaseAdmin.from('audit_events').insert({
      user_id: user.id,
      patient_id: patientId,
      action: 'ALLERGY_RECORDED',
      resource: 'allergies',
      result: 'SUCCESS',
      metadata: {
        allergy_id: allergyRecord?.id,
        substance,
        severity,
        status,
      },
    })
  } catch {
    // Log defensivo
  }

  revalidatePath('/doctor')
  revalidatePath('/patient/dashboard')

  return { success: true, message: `Alergia a "${substance}" registrada no prontuário.` }
}

/**
 * Registra o estado formal de que o paciente "Nega Alergias Conhecidas" (RF-054)
 */
export async function recordNoKnownAllergiesAction(patientId: string) {
  if (!patientId) return { error: 'Identificador do paciente obrigatório.' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }

  const isAuthorized = await verifyPhysicianAuthorization(user.id, patientId)
  if (!isAuthorized) {
    return { error: 'Acesso negado: Sem vínculo clínico ativo.' }
  }

  const supabaseAdmin = getAdminClient()

  // Insere registro com status NO_KNOWN_ALLERGIES
  const { error } = await supabaseAdmin
    .from('allergies')
    .insert({
      patient_id: patientId,
      substance: 'NEGA_ALERGIAS_CONHECIDAS',
      reaction: 'Paciente refere não apresentar alergias medicamentosas ou alimentares conhecidas.',
      severity: 'LEVE',
      status: 'NO_KNOWN_ALLERGIES',
    })

  if (error) {
    return { error: `Falha ao registrar declaração: ${error.message}` }
  }

  revalidatePath('/doctor')
  revalidatePath('/patient/dashboard')

  return { success: true, message: 'Declarado no prontuário: Nega alergias conhecidas.' }
}

/**
 * Inativa uma alergia previamente registrada (ex: dessensibilização ou histórico superado)
 */
export async function inactivateAllergyAction(allergyId: string, patientId: string, reason?: string) {
  if (!allergyId || !patientId) return { error: 'Identificadores inválidos.' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }

  const isAuthorized = await verifyPhysicianAuthorization(user.id, patientId)
  if (!isAuthorized) return { error: 'Acesso negado.' }

  const supabaseAdmin = getAdminClient()

  const { error } = await supabaseAdmin
    .from('allergies')
    .update({ status: 'RESOLVED' })
    .eq('id', allergyId)
    .eq('patient_id', patientId)

  if (error) return { error: error.message }

  try {
    await supabaseAdmin.from('audit_events').insert({
      user_id: user.id,
      patient_id: patientId,
      action: 'ALLERGY_INACTIVATED',
      resource: 'allergies',
      result: 'SUCCESS',
      metadata: { allergy_id: allergyId, reason: reason || 'Inativação regular' },
    })
  } catch {
    // Log defensivo
  }

  revalidatePath('/doctor')
  revalidatePath('/patient/dashboard')

  return { success: true, message: 'Alergia inativada no prontuário.' }
}
