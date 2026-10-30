import fs from 'fs'
import path from 'path'
import { createClient } from '@supabase/supabase-js'

// Carregar variáveis de .env.local
const envPath = path.resolve(process.cwd(), '.env.local')
const envContent = fs.readFileSync(envPath, 'utf8')
const envVars = Object.fromEntries(
  envContent
    .split('\n')
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => {
      const [k, ...v] = line.split('=')
      return [k.trim(), v.join('=').trim().replace(/^['"]|['"]$/g, '')]
    })
)

export const supabaseAdmin = createClient(
  envVars.NEXT_PUBLIC_SUPABASE_URL,
  envVars.SUPABASE_SERVICE_ROLE_KEY
)

export const ADMIN_CREDENTIALS = {
  email: 'admin@nefrohub.com.br',
  password: 'NefroAdmin@2026',
}

/**
 * Criação de Médico Sintético para Teste E2E
 */
export async function createE2EDoctor(options: {
  email?: string
  password?: string
  name?: string
  crm?: string
  crmUf?: string
  status?: 'ACTIVE' | 'PENDING_APPROVAL' | 'DEACTIVATED'
}) {
  const timestamp = Date.now()
  const email = options.email || `e2e-doc-${timestamp}@nefrohub.test`
  const password = options.password || 'DocSenhaForte@2026'
  const name = options.name || `Dr. E2E Teste ${timestamp.toString().slice(-4)}`
  const crm = options.crm || `${Math.floor(100000 + Math.random() * 900000)}`
  const crmUf = options.crmUf || 'SP'
  const status = options.status || 'ACTIVE'

  // 1. Criar usuário no Supabase Auth
  const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      name,
      role: 'DOCTOR',
    },
  })

  if (authError || !authUser.user) {
    throw new Error(`Falha ao criar médico de teste no Auth: ${authError?.message}`)
  }

  const userId = authUser.user.id

  // 2. Atualizar ou criar registro em public.users
  await supabaseAdmin
    .from('users')
    .upsert({
      id: userId,
      email,
      name,
      role: 'DOCTOR',
      status,
      phone: '11999990000',
    })

  // 3. Obter uma instituição padrão
  const { data: inst } = await supabaseAdmin.from('institutions').select('id').limit(1).single()
  const institutionId = inst?.id || '00000000-0000-0000-0000-000000000001'

  // 4. Inserir perfil médico
  await supabaseAdmin
    .from('physician_profiles')
    .upsert({
      user_id: userId,
      institution_id: institutionId,
      crm,
      crm_uf: crmUf,
      specialty: 'Nefrologia',
      validation_status: status === 'ACTIVE' ? 'VALIDATED' : 'PENDING',
      is_master: false,
      is_active: status === 'ACTIVE',
    })

  return {
    userId,
    email,
    password,
    name,
    crm,
    crmUf,
    status,
  }
}

/**
 * Criação de Paciente Sintético para Teste E2E com Vínculo Médico
 */
export async function createE2EPatient(options: {
  email?: string
  password?: string
  fullName?: string
  doctorUserId: string
  birthDate?: string
  biologicalSex?: 'M' | 'F'
}) {
  const timestamp = Date.now()
  const email = options.email || `e2e-pat-${timestamp}@nefrohub.test`
  const password = options.password || 'PatSenhaForte@2026'
  const fullName = options.fullName || `Paciente E2E ${timestamp.toString().slice(-4)}`
  const birthDate = options.birthDate || '1980-05-15'
  const biologicalSex = options.biologicalSex || 'M'

  // 1. Criar usuário no Supabase Auth
  const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      name: fullName,
      role: 'PATIENT',
    },
  })

  if (authError || !authUser.user) {
    throw new Error(`Falha ao criar paciente de teste no Auth: ${authError?.message}`)
  }

  const userId = authUser.user.id

  // 2. Atualizar em public.users
  await supabaseAdmin
    .from('users')
    .upsert({
      id: userId,
      email,
      name: fullName,
      role: 'PATIENT',
      status: 'ACTIVE',
    })

  // 3. Instituição
  const { data: inst } = await supabaseAdmin.from('institutions').select('id').limit(1).single()
  const institutionId = inst?.id || '00000000-0000-0000-0000-000000000001'

  // 4. Criar patient_profile
  const { data: profile, error: profError } = await supabaseAdmin
    .from('patient_profiles')
    .insert({
      user_id: userId,
      institution_id: institutionId,
      full_name: fullName,
      normalized_name: fullName.toUpperCase(),
      birth_date: birthDate,
      biological_sex: biologicalSex,
      status: 'ACTIVE',
      created_by_user_id: options.doctorUserId,
    })
    .select('id')
    .single()

  if (profError || !profile) {
    throw new Error(`Falha ao criar perfil do paciente de teste: ${profError?.message}`)
  }

  const patientId = profile.id

  // 5. Criar vínculo ACTIVE primário com o médico
  await supabaseAdmin
    .from('physician_patient_links')
    .insert({
      patient_id: patientId,
      physician_user_id: options.doctorUserId,
      status: 'ACTIVE',
      is_primary: true,
      created_by_user_id: options.doctorUserId,
      activated_at: new Date().toISOString(),
      reason: 'Vínculo E2E inicial para teste automatizado.',
    })

  return {
    userId,
    patientId,
    email,
    password,
    fullName,
  }
}

/**
 * Limpeza segura e cirúrgica de dados sintéticos criados por testes E2E
 * Apaga apenas registros que contenham prefixos de teste E2E comprovados.
 * NOTA DE SEGURANÇA: Desativada por padrão em banco compartilhado.
 */
export async function cleanupE2ETestData(tag: string) {
  if (!tag || !tag.startsWith('e2e-')) return

  // Trava de segurança para banco compartilhado (Diretriz de Segurança Seção 2.1 e 8)
  if (process.env.ENABLE_E2E_REMOTE_CLEANUP !== 'true') {
    console.log(`[cleanupE2ETestData] Limpeza automática suspensa por segurança no banco compartilhado para: ${tag}`)
    return
  }

  try {
    // Buscar usuários do teste
    const { data: users } = await supabaseAdmin
      .from('users')
      .select('id, email')
      .ilike('email', `%${tag}%`)

    if (users && users.length > 0) {
      for (const u of users) {
        // Remover vínculo
        await supabaseAdmin.from('physician_patient_links').delete().eq('physician_user_id', u.id)
        // Remover perfil médico
        await supabaseAdmin.from('physician_profiles').delete().eq('user_id', u.id)
        // Remover patient_profiles
        await supabaseAdmin.from('patient_profiles').delete().eq('user_id', u.id)
        // Remover public.users
        await supabaseAdmin.from('users').delete().eq('id', u.id)
        // Remover do Auth
        await supabaseAdmin.auth.admin.deleteUser(u.id).catch(() => {})
      }
    }
  } catch (err: any) {
    console.warn('[cleanupE2ETestData] Falha na limpeza segura:', err.message)
  }
}
