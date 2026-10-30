// scripts/seed-clinical-demo.mjs
import fs from 'fs'
import crypto from 'crypto'
import { createClient } from '@supabase/supabase-js'

// 1. Carregar variáveis de ambiente de .env.local
const envFile = fs.readFileSync('.env.local', 'utf8')
const env = Object.fromEntries(
  envFile
    .split('\n')
    .filter((l) => l.trim() && !l.trim().startsWith('#'))
    .map((l) => {
      const [k, ...v] = l.split('=')
      return [k.trim(), v.join('=').trim().replace(/^['"]|['"]$/g, '')]
    })
)

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceRoleKey) {
  console.error('ERRO: NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY ausentes em .env.local')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const HMAC_SECRET = process.env.BLIND_INDEX_SECRET || 'nefrohub-blind-index-secret-key-2026'

function generateCpfHash(cpfDigits) {
  return crypto.createHmac('sha256', HMAC_SECRET).update(cpfDigits).digest('hex')
}

// Implementação matemática direta da Equação Oficial CKD-EPI 2021
function calculateCKDEPI(scr, age, sex) {
  const isFemale = sex === 'F'
  const kappa = isFemale ? 0.7 : 0.9
  const alpha = isFemale ? -0.241 : -0.302
  const sexFactor = isFemale ? 1.012 : 1.0

  const ratio = scr / kappa
  const minPart = Math.min(ratio, 1) ** alpha
  const maxPart = Math.max(ratio, 1) ** -1.2
  const ageFactor = 0.9938 ** age

  const egfr = 142 * minPart * maxPart * ageFactor * sexFactor
  return {
    egfr: Number(egfr.toFixed(2)),
    rounded: Math.round(egfr),
  }
}

async function getOrCreateUser(email, password, name, role) {
  // Verificar se o usuário já existe no Auth
  const { data: usersList } = await supabase.auth.admin.listUsers()
  let authUser = usersList?.users?.find((u) => u.email.toLowerCase() === email.toLowerCase())

  if (!authUser) {
    const { data: created, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name, role },
    })
    if (error) throw new Error(`Falha ao criar usuário ${email}: ${error.message}`)
    authUser = created.user
    console.log(`[AUTH] Usuário criado: ${email} (${role})`)
  } else {
    await supabase.auth.admin.updateUserById(authUser.id, {
      password,
      user_metadata: { name, role },
    })
    console.log(`[AUTH] Usuário atualizado: ${email} (${role})`)
  }

  // Garantir na tabela public.users com mfa_enabled = false para facilidade de demonstração
  await supabase.from('users').upsert({
    id: authUser.id,
    email,
    name,
    role,
    status: 'ACTIVE',
    mfa_enabled: false,
    phone: '11988887777',
    updated_at: new Date().toISOString(),
  })

  return authUser.id
}

async function main() {
  console.log('===================================================================')
  console.log('  NEFROHUB: POPULAÇÃO DE CENÁRIO CLÍNICO REALISTA (DEMO OPÇÃO 1)  ')
  console.log('===================================================================')

  // 1. Obter instituição padrão
  const { data: inst } = await supabase.from('institutions').select('id').limit(1).single()
  const institutionId = inst?.id || '00000000-0000-0000-0000-000000000001'

  // 2. Médico Nefrologista Assistente
  const docEmail = 'demo-medico@nefrohub.test'
  const docPassword = 'DocSenhaForte@2026'
  const docName = 'Dr. Roberto Guimarães (Nefrologia)'
  const docUserId = await getOrCreateUser(docEmail, docPassword, docName, 'DOCTOR')

  await supabase.from('physician_profiles').upsert(
    {
      user_id: docUserId,
      institution_id: institutionId,
      crm: '123456',
      crm_uf: 'SP',
      is_master: false,
    },
    { onConflict: 'user_id' }
  )
  console.log(`[MÉDICO] Perfil profissional ativo: CRM 123456-SP`)

  // 3. Paciente 1: DRC Progressiva (Carlos Eduardo Silva - 62 anos)
  const pat1Email = 'demo-paciente1@nefrohub.test'
  const pat1Password = 'PatSenhaForte@2026'
  const pat1Name = 'Sr. Carlos Eduardo Silva (DRC Progressiva)'
  const pat1Birth = '1964-03-15'
  const pat1Age = 62
  const pat1Sex = 'M'
  const pat1UserId = await getOrCreateUser(pat1Email, pat1Password, pat1Name, 'PATIENT')

  // Upsert perfil do paciente 1
  const pat1CpfDigits = '78190234812'
  const pat1CpfHash = generateCpfHash(pat1CpfDigits)

  const { data: existingPat1 } = await supabase
    .from('patient_profiles')
    .select('id')
    .eq('user_id', pat1UserId)
    .maybeSingle()

  let pat1Id = existingPat1?.id

  if (!pat1Id) {
    const { data: createdPat1, error: p1Err } = await supabase
      .from('patient_profiles')
      .insert({
        user_id: pat1UserId,
        institution_id: institutionId,
        full_name: pat1Name,
        normalized_name: pat1Name.toUpperCase(),
        birth_date: pat1Birth,
        biological_sex: pat1Sex,
        status: 'ACTIVE',
        created_by_user_id: docUserId,
        phone: '11988881111',
        cpf_hash: pat1CpfHash,
        cpf_masked: '***.781.902-**',
      })
      .select('id')
      .single()

    if (p1Err) throw new Error(`Erro ao criar perfil paciente 1: ${p1Err.message}`)
    pat1Id = createdPat1.id
  }

  console.log(`[PACIENTE 1] Perfil pronto: ${pat1Name} (ID: ${pat1Id})`)

  // Estabelecer vínculo médico-paciente ativo primário
  await supabase.from('physician_patient_links').upsert(
    {
      patient_id: pat1Id,
      physician_user_id: docUserId,
      is_primary: true,
      status: 'ACTIVE',
      reason: 'Acompanhamento ambulatorial nefrológico de DRC progressiva.',
      activated_at: '2026-01-10T09:00:00Z',
    },
    { onConflict: 'physician_user_id,patient_id' }
  )

  // 4. Paciente 2: DRC Estável (Dra. Maria Helena Costa - 54 anos)
  const pat2Email = 'demo-paciente2@nefrohub.test'
  const pat2Password = 'PatSenhaForte@2026'
  const pat2Name = 'Dra. Maria Helena Costa (DRC Estável)'
  const pat2Birth = '1972-07-22'
  const pat2Age = 54
  const pat2Sex = 'F'
  const pat2UserId = await getOrCreateUser(pat2Email, pat2Password, pat2Name, 'PATIENT')

  const pat2CpfDigits = '31945820199'
  const pat2CpfHash = generateCpfHash(pat2CpfDigits)

  const { data: existingPat2 } = await supabase
    .from('patient_profiles')
    .select('id')
    .eq('user_id', pat2UserId)
    .maybeSingle()

  let pat2Id = existingPat2?.id

  if (!pat2Id) {
    const { data: createdPat2, error: p2Err } = await supabase
      .from('patient_profiles')
      .insert({
        user_id: pat2UserId,
        institution_id: institutionId,
        full_name: pat2Name,
        normalized_name: pat2Name.toUpperCase(),
        birth_date: pat2Birth,
        biological_sex: pat2Sex,
        status: 'ACTIVE',
        created_by_user_id: docUserId,
        phone: '11977772222',
        cpf_hash: pat2CpfHash,
        cpf_masked: '***.319.458-**',
      })
      .select('id')
      .single()

    if (p2Err) throw new Error(`Erro ao criar perfil paciente 2: ${p2Err.message}`)
    pat2Id = createdPat2.id
  }

  console.log(`[PACIENTE 2] Perfil pronto: ${pat2Name} (ID: ${pat2Id})`)

  // Estabelecer vínculo médico-paciente ativo primário
  await supabase.from('physician_patient_links').upsert(
    {
      patient_id: pat2Id,
      physician_user_id: docUserId,
      is_primary: true,
      status: 'ACTIVE',
      reason: 'Seguimento ambulatorial de glomerulopatia crônica estabilizada.',
      activated_at: '2026-01-15T10:00:00Z',
    },
    { onConflict: 'physician_user_id,patient_id' }
  )

  // 5. Histórico Longitudinal do Paciente 1 (Curva Recharts: Declínio de G3a para G4)
  console.log('\n--- Lançando Histórico de Exames Laboratoriais (Paciente 1: Declínio) ---')
  const p1Exams = [
    { date: '2026-01-15', scr: 1.30, urea: 48, k: 4.4, hb: 12.5 },
    { date: '2026-04-10', scr: 1.65, urea: 58, k: 4.7, hb: 11.8 },
    { date: '2026-07-20', scr: 2.00, urea: 72, k: 5.0, hb: 10.9 },
    { date: '2026-10-15', scr: 2.45, urea: 85, k: 5.4, hb: 10.1 },
  ]

  for (const ex of p1Exams) {
    const { egfr, rounded } = calculateCKDEPI(ex.scr, pat1Age, pat1Sex)

    // Criar registro clínico confirmado
    const { data: rec } = await supabase
      .from('clinical_records')
      .insert({
        patient_id: pat1Id,
        record_type: 'LAB_EXAM',
        status: 'CONFIRMED',
        clinical_date: ex.date,
        created_by_user_id: docUserId,
        confirmed_by_user_id: docUserId,
        confirmed_at: `${ex.date}T14:30:00Z`,
        created_at: `${ex.date}T14:00:00Z`,
      })
      .select('id')
      .single()

    // Inserir resultados
    await supabase.from('lab_results').insert([
      { clinical_record_id: rec.id, exam_code: 'CREATININE', exam_name: 'Creatinina Sérica', numeric_value: ex.scr, original_unit: 'mg/dL' },
      { clinical_record_id: rec.id, exam_code: 'EGFR', exam_name: 'Taxa de Filtração Glomerular Estimada (CKD-EPI 2021)', numeric_value: egfr, original_unit: 'mL/min/1.73m²' },
      { clinical_record_id: rec.id, exam_code: 'UREA', exam_name: 'Ureia Sérica', numeric_value: ex.urea, original_unit: 'mg/dL' },
      { clinical_record_id: rec.id, exam_code: 'POTASSIUM', exam_name: 'Potássio Sérico', numeric_value: ex.k, original_unit: 'mEq/L' },
      { clinical_record_id: rec.id, exam_code: 'HEMOGLOBIN', exam_name: 'Hemoglobina', numeric_value: ex.hb, original_unit: 'g/dL' },
    ])

    // Registrar em calculation_runs
    await supabase.from('calculation_runs').insert({
      clinical_record_id: rec.id,
      patient_id: pat1Id,
      executed_by_user_id: docUserId,
      formula_version: 'CKD-EPI-2021-CR',
      calculated_egfr: egfr,
      ckd_stage: egfr >= 60 ? 'G2' : egfr >= 45 ? 'G3a' : egfr >= 30 ? 'G3b' : 'G4',
      raw_inputs: { creatinine: ex.scr, age: pat1Age, sex: pat1Sex, referenceDate: ex.date },
    })

    console.log(`  -> ${ex.date}: Creatinina ${ex.scr} mg/dL | eTFG: ${egfr} mL/min (CKD-EPI 2021)`)
  }

  // 6. Histórico Longitudinal do Paciente 2 (Curva Recharts: Estável G2)
  console.log('\n--- Lançando Histórico de Exames Laboratoriais (Paciente 2: Estável G2) ---')
  const p2Exams = [
    { date: '2026-02-10', scr: 0.90, urea: 32, k: 4.1, hb: 13.6 },
    { date: '2026-05-18', scr: 0.92, urea: 34, k: 4.2, hb: 13.4 },
    { date: '2026-08-22', scr: 0.88, urea: 30, k: 4.0, hb: 13.7 },
    { date: '2026-10-20', scr: 0.90, urea: 33, k: 4.2, hb: 13.5 },
  ]

  for (const ex of p2Exams) {
    const { egfr } = calculateCKDEPI(ex.scr, pat2Age, pat2Sex)

    const { data: rec } = await supabase
      .from('clinical_records')
      .insert({
        patient_id: pat2Id,
        record_type: 'LAB_EXAM',
        status: 'CONFIRMED',
        clinical_date: ex.date,
        created_by_user_id: docUserId,
        confirmed_by_user_id: docUserId,
        confirmed_at: `${ex.date}T11:30:00Z`,
        created_at: `${ex.date}T11:00:00Z`,
      })
      .select('id')
      .single()

    await supabase.from('lab_results').insert([
      { clinical_record_id: rec.id, exam_code: 'CREATININE', exam_name: 'Creatinina Sérica', numeric_value: ex.scr, original_unit: 'mg/dL' },
      { clinical_record_id: rec.id, exam_code: 'EGFR', exam_name: 'Taxa de Filtração Glomerular Estimada (CKD-EPI 2021)', numeric_value: egfr, original_unit: 'mL/min/1.73m²' },
      { clinical_record_id: rec.id, exam_code: 'UREA', exam_name: 'Ureia Sérica', numeric_value: ex.urea, original_unit: 'mg/dL' },
      { clinical_record_id: rec.id, exam_code: 'POTASSIUM', exam_name: 'Potássio Sérico', numeric_value: ex.k, original_unit: 'mEq/L' },
      { clinical_record_id: rec.id, exam_code: 'HEMOGLOBIN', exam_name: 'Hemoglobina', numeric_value: ex.hb, original_unit: 'g/dL' },
    ])

    await supabase.from('calculation_runs').insert({
      clinical_record_id: rec.id,
      patient_id: pat2Id,
      executed_by_user_id: docUserId,
      formula_version: 'CKD-EPI-2021-CR',
      calculated_egfr: egfr,
      ckd_stage: 'G2',
      raw_inputs: { creatinine: ex.scr, age: pat2Age, sex: pat2Sex, referenceDate: ex.date },
    })

    console.log(`  -> ${ex.date}: Creatinina ${ex.scr} mg/dL | eTFG: ${egfr} mL/min (CKD-EPI 2021 Estável)`)
  }

  // 7. Sinais Vitais Domiciliares Pendentes de Curadoria (Paciente 1)
  console.log('\n--- Criando Aferições Domiciliares Pendentes para Curadoria Médica ---')
  const { data: pendingVitalsRec } = await supabase
    .from('clinical_records')
    .insert({
      patient_id: pat1Id,
      record_type: 'VITAL_SIGNS',
      status: 'PENDING_VALIDATION',
      clinical_date: '2026-10-29',
      created_by_user_id: pat1UserId,
      created_at: new Date().toISOString(),
    })
    .select('id')
    .single()

  await supabase.from('vital_signs').insert([
    { clinical_record_id: pendingVitalsRec.id, sign_code: 'BP_SYSTOLIC', numeric_value: 145, unit: 'mmHg' },
    { clinical_record_id: pendingVitalsRec.id, sign_code: 'BP_DIASTOLIC', numeric_value: 95, unit: 'mmHg' },
    { clinical_record_id: pendingVitalsRec.id, sign_code: 'WEIGHT', numeric_value: 78.4, unit: 'kg' },
  ])
  console.log(`[CURADORIA] Submissão PENDING_VALIDATION criada para Paciente 1 (PA 145x95 mmHg, Peso 78.4 kg)`)

  // Sinais vitais confirmados históricos do Paciente 1
  const { data: confVitalsRec } = await supabase
    .from('clinical_records')
    .insert({
      patient_id: pat1Id,
      record_type: 'VITAL_SIGNS',
      status: 'CONFIRMED',
      clinical_date: '2026-10-15',
      created_by_user_id: pat1UserId,
      confirmed_by_user_id: docUserId,
      confirmed_at: '2026-10-15T15:00:00Z',
    })
    .select('id')
    .single()

  await supabase.from('vital_signs').insert([
    { clinical_record_id: confVitalsRec.id, sign_code: 'BP_SYSTOLIC', numeric_value: 140, unit: 'mmHg' },
    { clinical_record_id: confVitalsRec.id, sign_code: 'BP_DIASTOLIC', numeric_value: 90, unit: 'mmHg' },
    { clinical_record_id: confVitalsRec.id, sign_code: 'WEIGHT', numeric_value: 77.0, unit: 'kg' },
  ])

  // Sinais vitais do Paciente 2 (Confirmados)
  const { data: confVitalsRec2 } = await supabase
    .from('clinical_records')
    .insert({
      patient_id: pat2Id,
      record_type: 'VITAL_SIGNS',
      status: 'CONFIRMED',
      clinical_date: '2026-10-20',
      created_by_user_id: pat2UserId,
      confirmed_by_user_id: docUserId,
      confirmed_at: '2026-10-20T12:00:00Z',
    })
    .select('id')
    .single()

  await supabase.from('vital_signs').insert([
    { clinical_record_id: confVitalsRec2.id, sign_code: 'BP_SYSTOLIC', numeric_value: 120, unit: 'mmHg' },
    { clinical_record_id: confVitalsRec2.id, sign_code: 'BP_DIASTOLIC', numeric_value: 80, unit: 'mmHg' },
    { clinical_record_id: confVitalsRec2.id, sign_code: 'WEIGHT', numeric_value: 62.5, unit: 'kg' },
  ])

  // 8. Comorbidades e Doenças de Base (CID-10)
  console.log('\n--- Cadastrando Comorbidades (Fase 4.3) ---')
  await supabase.from('conditions').insert([
    { patient_id: pat1Id, name: 'Diabetes Mellitus Tipo 2 com Nefropatia Incipiente', cid10: 'E11.2', status: 'ACTIVE', notes: 'Glicemia de jejum com controle irregular.', created_by_user_id: docUserId },
    { patient_id: pat1Id, name: 'Hipertensão Arterial Sistêmica Estágio 2', cid10: 'I10', status: 'ACTIVE', notes: 'Em terapia combinada com IECA e diurético.', created_by_user_id: docUserId },
    { patient_id: pat2Id, name: 'Glomerulonefrite Crônica Estabilizada', cid10: 'N03', status: 'ACTIVE', notes: 'Proteinúria residual estável < 0.5g/24h.', created_by_user_id: docUserId },
  ])
  console.log('[COMORBIDADES] Diagnósticos ativos vinculados aos prontuários.')

  // 9. Medicamentos de Uso Contínuo
  console.log('\n--- Cadastrando Medicamentos de Uso Contínuo (Fase 4.3) ---')
  await supabase.from('medications').insert([
    { patient_id: pat1Id, name: 'Enalapril', dosage: '20', unit: 'mg', route: 'Oral', frequency: '12 em 12 horas', status: 'ACTIVE', is_prescription: true, notes: 'Monitorar potássio sérico quinzenalmente.', created_by_user_id: docUserId },
    { patient_id: pat1Id, name: 'Furosemida', dosage: '40', unit: 'mg', route: 'Oral', frequency: 'Pela manhã em jejum', status: 'ACTIVE', is_prescription: true, notes: 'Controle de edema perimaleolar.', created_by_user_id: docUserId },
    { patient_id: pat1Id, name: 'Eritropoetina Alfa Recombinante', dosage: '4000', unit: 'UI', route: 'Subcutânea', frequency: '1 vez por semana', status: 'ACTIVE', is_prescription: true, notes: 'Manejo de anemia secundária à DRC.', created_by_user_id: docUserId },
    { patient_id: pat2Id, name: 'Losartana Potássica', dosage: '50', unit: 'mg', route: 'Oral', frequency: '1 vez ao dia', status: 'ACTIVE', is_prescription: true, notes: 'Nefroproteção antiproteinúrica.', created_by_user_id: docUserId },
  ])
  console.log('[MEDICAÇÕES] Prescrições contínuas ativas registradas.')

  // 10. Alergias e Reações Adversas com Triplo Estado (RF-054)
  console.log('\n--- Cadastrando Alergias com Triplo Estado (RF-054) ---')
  await supabase.from('allergies').insert([
    // Paciente 1: Alergia Conhecida Grave (KNOWN)
    {
      patient_id: pat1Id,
      substance: 'Contraste Iodado',
      reaction: 'Edema de glote e urticária generalizada após tomografia em 2024.',
      severity: 'GRAVE',
      status: 'KNOWN',
    },
    // Paciente 2: Nega Alergias Conhecidas (NO_KNOWN_ALLERGIES)
    {
      patient_id: pat2Id,
      substance: 'NEGA_ALERGIAS_CONHECIDAS',
      reaction: 'Paciente refere não apresentar alergias prévias a medicamentos ou alimentos.',
      severity: 'LEVE',
      status: 'NO_KNOWN_ALLERGIES',
    },
  ])
  console.log('[ALERGIAS] Paciente 1 com alergia GRAVE e Paciente 2 com declaração de NEGA ALERGIAS.')

  console.log('\n===================================================================')
  console.log('  CENÁRIO CLÍNICO DE DEMONSTRAÇÃO POPULADO COM SUCESSO!            ')
  console.log('===================================================================')
  console.log('\nCREDENCIAIS DISPONÍVEIS PARA DEMONSTRAÇÃO:')
  console.log('-------------------------------------------------------------------')
  console.log('MÉDICO NEFROLOGISTA:')
  console.log(`  E-mail : ${docEmail}`)
  console.log(`  Senha  : ${docPassword}`)
  console.log(`  Painel : http://localhost:3000/doctor`)
  console.log('-------------------------------------------------------------------')
  console.log('PACIENTE 1 (DRC Progressiva - Estágio G3b / G4):')
  console.log(`  E-mail : ${pat1Email}`)
  console.log(`  Senha  : ${pat1Password}`)
  console.log(`  Painel : http://localhost:3000/patient/dashboard`)
  console.log('-------------------------------------------------------------------')
  console.log('PACIENTE 2 (DRC Estável - Estágio G2):')
  console.log(`  E-mail : ${pat2Email}`)
  console.log(`  Senha  : ${pat2Password}`)
  console.log(`  Painel : http://localhost:3000/patient/dashboard`)
  console.log('===================================================================')
}

main().catch((err) => {
  console.error('[ERRO CRÍTICO NO SEED]:', err)
  process.exit(1)
})
