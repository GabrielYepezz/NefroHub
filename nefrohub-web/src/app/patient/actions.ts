'use server'

import { createServerClient } from '@supabase/ssr'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { RegisterFormValues, registerSchema } from '@/lib/validators/auth'
import { createPatientSchema, CreatePatientFormValues } from '@/lib/validators/patient'
import { normalizeName, maskCpf, generateCpfHash } from '@/lib/patient-utils'
import { PatientStatus } from '@/types/database'

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
 * Criação de Paciente conforme as regras de negócio:
 * 1. Separação de pessoa atendida (patient_profiles) e conta de acesso (auth.users).
 * 2. Deduplicação via HMAC do CPF ou (nome normalizado + data de nascimento).
 * 3. Criação atômica do vínculo com o médico responsável principal (physician_patient_links).
 */
export async function createPatientAction(data: CreatePatientFormValues) {
  const validation = createPatientSchema.safeParse(data)

  if (!validation.success) {
    const errorMessages = validation.error.issues.map((i) => i.message).join('. ')
    return { error: errorMessages || 'Dados inválidos fornecidos no formulário.' }
  }

  const payload = validation.data
  const supabase = await createClient()
  const { data: authData } = await supabase.auth.getUser()

  // Se não houver usuário autenticado no contexto de dev, usamos o cliente admin com um ID default de sistema
  const supabaseAdmin = getAdminClient()
  const createdByUserId = authData.user?.id || '00000000-0000-0000-0000-000000000000'
  const institutionId = (authData.user?.user_metadata?.institution_id as string) || '00000000-0000-0000-0000-000000000001'

  const normalizedName = normalizeName(payload.fullName)

  // 1. Verificação de Duplicidade (Seção 3.2 e 3.3)
  let cpfHash: string | null = null
  let cpfMasked: string | null = null
  let duplicateWarning: string | null = null
  let patientStatus: PatientStatus = 'ACTIVE'
  let duplicateCheckFlag = false

  if (payload.cpf) {
    cpfHash = generateCpfHash(payload.cpf)
    cpfMasked = maskCpf(payload.cpf)

    const { data: existingCpf } = await supabaseAdmin
      .from('patient_profiles')
      .select('id, full_name')
      .eq('cpf_hash', cpfHash)
      .maybeSingle()

    if (existingCpf) {
      return {
        error: `Já existe um paciente cadastrado com este CPF (${existingCpf.full_name}).`,
      }
    }
  } else {
    // Busca por homônimo provável (Nome normalizado + Data de nascimento)
    const { data: probableDuplicates } = await supabaseAdmin
      .from('patient_profiles')
      .select('id, full_name')
      .eq('normalized_name', normalizedName)
      .eq('birth_date', payload.birthDate)

    if (probableDuplicates && probableDuplicates.length > 0) {
      duplicateCheckFlag = true
      patientStatus = 'PENDING_REVIEW'
      duplicateWarning = `Atenção: Identificado(s) ${probableDuplicates.length} paciente(s) com mesmo nome e data de nascimento. O cadastro foi registrado para revisão de homônimo provável.`
    }
  }

  // 2. Inserção do Perfil do Paciente (patient_profiles)
  const { data: newPatient, error: patientError } = await supabaseAdmin
    .from('patient_profiles')
    .insert({
      institution_id: institutionId,
      full_name: payload.fullName,
      normalized_name: normalizedName,
      birth_date: payload.birthDate,
      biological_sex: payload.biologicalSex,
      cpf_masked: cpfMasked,
      cpf_hash: cpfHash,
      cpf_hash_version: 1,
      cns: payload.cns || null,
      medical_record_number: payload.medicalRecordNumber || null,
      phone: payload.phone || null,
      email: payload.email || null,
      status: patientStatus,
      duplicate_check_flag: duplicateCheckFlag,
      created_by_user_id: createdByUserId,
    })
    .select('id')
    .single()

  if (patientError || !newPatient) {
    return { error: `Erro ao criar perfil do paciente: ${patientError?.message || 'Falha no banco de dados'}` }
  }

  // 3. Criação obrigatória do vínculo com o médico responsável (Seção 3.4 e 4.1)
  const { error: linkError } = await supabaseAdmin
    .from('physician_patient_links')
    .insert({
      patient_id: newPatient.id,
      physician_user_id: payload.primaryPhysicianUserId,
      status: 'ACTIVE',
      is_primary: true,
      created_by_user_id: createdByUserId,
      activated_at: new Date().toISOString(),
      reason: 'Atribuição inicial de médico responsável no cadastro do paciente.',
    })

  if (linkError) {
    // Reversão defensiva se o vínculo falhar para não deixar paciente ativo sem médico responsável
    await supabaseAdmin.from('patient_profiles').delete().eq('id', newPatient.id)
    return { error: `Erro ao associar médico responsável: ${linkError.message}` }
  }

  revalidatePath('/patient')
  return {
    success: true,
    patientId: newPatient.id,
    warning: duplicateWarning || undefined,
  }
}

/**
 * Mantido para compatibilidade operacional com criação de usuários internos
 */
export async function adminCreateUserAction(data: RegisterFormValues) {
  const result = registerSchema.safeParse(data)

  if (!result.success) {
    return { error: 'Dados inválidos fornecidos no formulário.' }
  }

  const supabaseAdmin = getAdminClient()

  const { error } = await supabaseAdmin.auth.admin.createUser({
    email: result.data.email,
    password: result.data.password,
    email_confirm: true,
    user_metadata: {
      name: result.data.name,
      role: result.data.role,
      phone: result.data.phone || null,
    },
  })

  if (error) {
    return { error: error.message }
  }

  revalidatePath('/patient')
  return { success: true }
}
