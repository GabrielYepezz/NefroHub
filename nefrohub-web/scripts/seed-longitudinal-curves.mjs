// scripts/seed-longitudinal-curves.mjs
import fs from 'fs'
import { createClient } from '@supabase/supabase-js'

// 1. Carregar configuração de .env.local
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
  console.error('ERRO: Variáveis de ambiente ausentes em .env.local')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// Equação oficial CKD-EPI 2021 sem coeficiente racial (Inker et al., NEJM 2021)
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
  let stage = 'G1'
  if (egfr < 15) stage = 'G5'
  else if (egfr < 30) stage = 'G4'
  else if (egfr < 45) stage = 'G3b'
  else if (egfr < 60) stage = 'G3a'
  else if (egfr < 90) stage = 'G2'

  return {
    egfr: Number(egfr.toFixed(2)),
    rounded: Math.round(egfr),
    stage,
  }
}

// Modelagem de séries temporais ricas para cada paciente (4 a 8 pontos de 2025 a 2026)
// Cobertura completa de padrões: Estável, Declínio Lento, Declínio Acelerado, Recuperação de IRA, Flutuante e Terminal
const LONGITUDINAL_SERIES = {
  // P01: Lucas Gabriel Albuquerque (25a, M, G1 Estável)
  1: [
    { date: '2025-04-10', scr: 0.88, urea: 26, k: 4.0, hb: 15.1, sys: 120, dia: 80, weight: 70.2 },
    { date: '2025-08-15', scr: 0.86, urea: 24, k: 4.1, hb: 14.9, sys: 122, dia: 80, weight: 70.5 },
    { date: '2025-12-05', scr: 0.84, urea: 25, k: 4.2, hb: 15.0, sys: 118, dia: 78, weight: 70.0 },
    { date: '2026-03-20', scr: 0.85, urea: 23, k: 4.0, hb: 14.8, sys: 120, dia: 80, weight: 70.4 },
    { date: '2026-07-18', scr: 0.83, urea: 22, k: 4.1, hb: 15.2, sys: 121, dia: 79, weight: 70.1 },
    { date: '2026-10-22', scr: 0.84, urea: 24, k: 4.1, hb: 15.0, sys: 120, dia: 80, weight: 70.3 },
  ],

  // P02: Beatriz Vasconcelos Lima (27a, F, G1 Estável)
  2: [
    { date: '2025-05-12', scr: 0.68, urea: 22, k: 4.0, hb: 13.5, sys: 115, dia: 75, weight: 58.0 },
    { date: '2025-09-18', scr: 0.66, urea: 21, k: 3.9, hb: 13.3, sys: 118, dia: 76, weight: 58.2 },
    { date: '2026-01-20', scr: 0.67, urea: 23, k: 4.1, hb: 13.1, sys: 116, dia: 75, weight: 58.5 },
    { date: '2026-05-15', scr: 0.65, urea: 20, k: 3.9, hb: 13.4, sys: 114, dia: 74, weight: 58.1 },
    { date: '2026-09-10', scr: 0.66, urea: 21, k: 4.0, hb: 13.2, sys: 115, dia: 75, weight: 58.3 },
  ],

  // P04: Camila Fernandes Queiroz (36a, F, Lúpus nefrite - Flutuante com remissão)
  4: [
    { date: '2025-03-10', scr: 1.15, urea: 38, k: 4.3, hb: 11.8, sys: 135, dia: 88, weight: 64.0 }, // Crise lúpica
    { date: '2025-06-12', scr: 0.95, urea: 32, k: 4.1, hb: 12.5, sys: 128, dia: 82, weight: 63.5 }, // Resposta corticoide
    { date: '2025-10-05', scr: 0.80, urea: 28, k: 4.0, hb: 13.1, sys: 120, dia: 80, weight: 62.8 },
    { date: '2026-02-14', scr: 0.72, urea: 25, k: 4.0, hb: 13.6, sys: 118, dia: 78, weight: 62.2 },
    { date: '2026-06-20', scr: 0.70, urea: 24, k: 4.1, hb: 13.8, sys: 118, dia: 78, weight: 62.0 },
    { date: '2026-10-15', scr: 0.71, urea: 25, k: 4.0, hb: 13.7, sys: 119, dia: 79, weight: 62.1 },
  ],

  // P05: Eduardo Martins Fontes (44a, M, G2 Estável com HAS)
  5: [
    { date: '2025-03-15', scr: 1.15, urea: 40, k: 4.5, hb: 14.8, sys: 140, dia: 90, weight: 88.0 },
    { date: '2025-07-20', scr: 1.12, urea: 38, k: 4.4, hb: 14.6, sys: 134, dia: 86, weight: 87.2 },
    { date: '2025-11-10', scr: 1.10, urea: 37, k: 4.3, hb: 14.5, sys: 130, dia: 84, weight: 86.5 },
    { date: '2026-03-12', scr: 1.09, urea: 36, k: 4.3, hb: 14.7, sys: 128, dia: 82, weight: 86.0 },
    { date: '2026-07-15', scr: 1.11, urea: 37, k: 4.4, hb: 14.4, sys: 130, dia: 84, weight: 86.3 },
    { date: '2026-10-18', scr: 1.08, urea: 35, k: 4.2, hb: 14.6, sys: 128, dia: 82, weight: 85.8 },
  ],

  // P07: Antônio Carlos Moreira (51a, M, G2 -> G3a - Declínio Lento por DM2)
  7: [
    { date: '2025-02-10', scr: 0.98, urea: 34, k: 4.2, hb: 14.2, sys: 130, dia: 84, weight: 82.0 },
    { date: '2025-06-15', scr: 1.05, urea: 37, k: 4.3, hb: 14.0, sys: 134, dia: 86, weight: 82.8 },
    { date: '2025-10-18', scr: 1.12, urea: 40, k: 4.5, hb: 13.8, sys: 136, dia: 88, weight: 83.5 },
    { date: '2026-02-20', scr: 1.18, urea: 43, k: 4.6, hb: 13.6, sys: 138, dia: 88, weight: 84.0 },
    { date: '2026-06-15', scr: 1.24, urea: 46, k: 4.7, hb: 13.4, sys: 140, dia: 90, weight: 84.5 },
    { date: '2026-10-20', scr: 1.30, urea: 49, k: 4.8, hb: 13.2, sys: 142, dia: 92, weight: 85.0 },
  ],

  // P12: Sérgio Ramos Peixoto (67a, M, G3a - Nefroesclerose progressiva)
  12: [
    { date: '2025-03-20', scr: 1.28, urea: 44, k: 4.4, hb: 13.3, sys: 145, dia: 92, weight: 79.5 },
    { date: '2025-07-25', scr: 1.34, urea: 47, k: 4.5, hb: 13.1, sys: 144, dia: 90, weight: 80.0 },
    { date: '2025-11-18', scr: 1.38, urea: 49, k: 4.6, hb: 12.9, sys: 142, dia: 90, weight: 80.5 },
    { date: '2026-02-15', scr: 1.42, urea: 51, k: 4.7, hb: 12.7, sys: 140, dia: 90, weight: 80.8 },
    { date: '2026-05-20', scr: 1.45, urea: 53, k: 4.8, hb: 12.5, sys: 142, dia: 92, weight: 81.0 },
    { date: '2026-08-25', scr: 1.48, urea: 55, k: 4.9, hb: 12.3, sys: 144, dia: 92, weight: 81.3 },
    { date: '2026-10-22', scr: 1.52, urea: 57, k: 5.0, hb: 12.1, sys: 145, dia: 94, weight: 81.5 },
  ],

  // P14: Waldir Cavalcante Rocha (70a, M, G3a - Insulto Agudo de IRA seguido de estabilização)
  14: [
    { date: '2025-05-10', scr: 1.36, urea: 44, k: 4.4, hb: 12.9, sys: 130, dia: 80, weight: 74.0 },
    { date: '2025-09-12', scr: 1.38, urea: 45, k: 4.5, hb: 12.8, sys: 132, dia: 82, weight: 74.2 },
    { date: '2026-01-08', scr: 1.85, urea: 76, k: 5.2, hb: 12.1, sys: 110, dia: 70, weight: 71.5 }, // IRA desidratação diurética
    { date: '2026-02-05', scr: 1.52, urea: 55, k: 4.8, hb: 12.5, sys: 125, dia: 78, weight: 73.0 }, // Recuperação
    { date: '2026-05-10', scr: 1.40, urea: 46, k: 4.5, hb: 12.7, sys: 128, dia: 80, weight: 73.8 },
    { date: '2026-08-15', scr: 1.38, urea: 45, k: 4.5, hb: 12.8, sys: 130, dia: 80, weight: 74.0 },
    { date: '2026-10-14', scr: 1.39, urea: 46, k: 4.5, hb: 12.7, sys: 130, dia: 80, weight: 74.1 },
  ],

  // P19: Cláudio Márcio Mendonça (60a, M, G3b - GESF - Fast Progressor)
  19: [
    { date: '2025-04-05', scr: 1.45, urea: 48, k: 4.4, hb: 12.4, sys: 145, dia: 92, weight: 85.0 },
    { date: '2025-07-10', scr: 1.62, urea: 54, k: 4.6, hb: 12.0, sys: 148, dia: 94, weight: 86.2 },
    { date: '2025-10-15', scr: 1.78, urea: 61, k: 4.8, hb: 11.6, sys: 150, dia: 96, weight: 87.0 },
    { date: '2026-01-20', scr: 1.95, urea: 68, k: 5.0, hb: 11.2, sys: 152, dia: 98, weight: 88.0 },
    { date: '2026-04-22', scr: 2.10, urea: 76, k: 5.2, hb: 10.8, sys: 155, dia: 100, weight: 88.8 },
    { date: '2026-07-18', scr: 2.25, urea: 83, k: 5.4, hb: 10.4, sys: 158, dia: 102, weight: 89.5 },
    { date: '2026-10-25', scr: 2.45, urea: 92, k: 5.6, hb: 10.0, sys: 160, dia: 104, weight: 90.2 },
  ],

  // P23: Renato Barreto Antunes (74a, M, G3b - Cardiorrenal Flutuante)
  23: [
    { date: '2025-03-08', scr: 1.80, urea: 62, k: 4.7, hb: 11.3, sys: 135, dia: 80, weight: 72.0 },
    { date: '2025-06-15', scr: 2.15, urea: 78, k: 5.3, hb: 10.6, sys: 150, dia: 90, weight: 75.5 }, // Descompensação IC
    { date: '2025-09-20', scr: 1.85, urea: 64, k: 4.8, hb: 11.1, sys: 130, dia: 78, weight: 71.8 }, // Pós otimização diurética
    { date: '2026-01-10', scr: 1.92, urea: 67, k: 4.9, hb: 10.9, sys: 138, dia: 82, weight: 72.4 },
    { date: '2026-05-18', scr: 2.20, urea: 80, k: 5.4, hb: 10.4, sys: 155, dia: 92, weight: 76.0 },
    { date: '2026-08-22', scr: 1.88, urea: 65, k: 4.8, hb: 11.0, sys: 132, dia: 80, weight: 72.1 },
    { date: '2026-10-20', scr: 1.95, urea: 68, k: 5.0, hb: 10.8, sys: 135, dia: 82, weight: 72.5 },
  ],

  // P25: Marcos Vinícius Fagundes (61a, M, G4 - Pré-Diálise Severo com perda contínua)
  25: [
    { date: '2025-02-15', scr: 2.30, urea: 76, k: 4.8, hb: 11.2, sys: 148, dia: 92, weight: 80.0 },
    { date: '2025-05-20', scr: 2.55, urea: 85, k: 5.0, hb: 10.8, sys: 150, dia: 94, weight: 80.8 },
    { date: '2025-08-18', scr: 2.80, urea: 95, k: 5.2, hb: 10.4, sys: 154, dia: 96, weight: 81.5 },
    { date: '2025-11-22', scr: 3.05, urea: 106, k: 5.4, hb: 9.9, sys: 156, dia: 98, weight: 82.0 },
    { date: '2026-02-18', scr: 3.30, urea: 118, k: 5.6, hb: 9.5, sys: 158, dia: 100, weight: 82.4 },
    { date: '2026-05-25', scr: 3.55, urea: 130, k: 5.8, hb: 9.1, sys: 160, dia: 102, weight: 82.8 },
    { date: '2026-08-20', scr: 3.80, urea: 142, k: 6.0, hb: 8.8, sys: 162, dia: 104, weight: 83.2 },
    { date: '2026-10-26', scr: 4.10, urea: 155, k: 6.2, hb: 8.4, sys: 165, dia: 105, weight: 83.5 },
  ],

  // P26: Heloísa Helena Alencar (63a, F, G4 - Estável sob nefroproteção intensiva)
  26: [
    { date: '2025-04-10', scr: 2.35, urea: 78, k: 4.9, hb: 10.2, sys: 138, dia: 85, weight: 65.0 },
    { date: '2025-08-15', scr: 2.38, urea: 80, k: 5.0, hb: 10.1, sys: 136, dia: 84, weight: 65.2 },
    { date: '2025-12-05', scr: 2.42, urea: 82, k: 5.1, hb: 10.0, sys: 135, dia: 84, weight: 65.0 },
    { date: '2026-03-20', scr: 2.40, urea: 81, k: 5.0, hb: 10.1, sys: 134, dia: 82, weight: 64.8 },
    { date: '2026-07-15', scr: 2.44, urea: 83, k: 5.2, hb: 9.9, sys: 135, dia: 84, weight: 65.1 },
    { date: '2026-10-22', scr: 2.41, urea: 82, k: 5.1, hb: 10.0, sys: 134, dia: 82, weight: 65.0 },
  ],

  // P31: Gilberto Mendonça Ramos (59a, M, G5 - Uremia Terminal e Preparação Dialítica)
  31: [
    { date: '2025-03-10', scr: 3.80, urea: 120, k: 5.3, hb: 9.8, sys: 155, dia: 95, weight: 81.0 },
    { date: '2025-06-15', scr: 4.40, urea: 145, k: 5.7, hb: 9.2, sys: 160, dia: 98, weight: 82.5 },
    { date: '2025-09-20', scr: 5.10, urea: 170, k: 6.0, hb: 8.7, sys: 165, dia: 100, weight: 83.8 },
    { date: '2025-12-18', scr: 5.80, urea: 195, k: 6.3, hb: 8.2, sys: 168, dia: 102, weight: 84.5 },
    { date: '2026-03-22', scr: 6.50, urea: 220, k: 6.6, hb: 7.8, sys: 170, dia: 105, weight: 85.2 },
    { date: '2026-06-25', scr: 7.20, urea: 245, k: 6.8, hb: 7.4, sys: 172, dia: 106, weight: 86.0 },
    { date: '2026-10-25', scr: 8.10, urea: 275, k: 7.1, hb: 7.0, sys: 175, dia: 108, weight: 86.5 },
  ],

  // P35: Sebastião Vilela Fontoura (79a, M, G5 - Uremia em Diálise com FAV)
  35: [
    { date: '2025-04-12', scr: 4.20, urea: 135, k: 5.5, hb: 9.2, sys: 160, dia: 95, weight: 70.0 },
    { date: '2025-08-18', scr: 5.10, urea: 165, k: 5.8, hb: 8.7, sys: 165, dia: 100, weight: 71.2 },
    { date: '2025-12-15', scr: 5.90, urea: 195, k: 6.2, hb: 8.2, sys: 168, dia: 102, weight: 72.0 },
    { date: '2026-03-20', scr: 6.60, urea: 220, k: 6.5, hb: 7.8, sys: 170, dia: 105, weight: 72.5 },
    { date: '2026-06-22', scr: 7.20, urea: 240, k: 6.7, hb: 7.5, sys: 172, dia: 106, weight: 72.8 },
    { date: '2026-10-24', scr: 7.80, urea: 260, k: 7.0, hb: 7.1, sys: 175, dia: 108, weight: 73.2 },
  ],
}

async function main() {
  console.log('===================================================================')
  console.log('  ENRIQUECIMENTO DE SÉRIES LONGITUDINAIS PARA O GRÁFICO RECHARTS  ')
  console.log('===================================================================')

  // 1. Identificar o Médico Demo
  const { data: docUser } = await supabase
    .from('users')
    .select('id, name')
    .eq('email', 'demo-medico@nefrohub.test')
    .single()

  if (!docUser) {
    console.error('Médico demo-medico@nefrohub.test não encontrado.')
    process.exit(1)
  }

  const docUserId = docUser.id
  console.log(`[MÉDICO DEMO] ${docUser.name} (${docUserId})`)

  // 2. Carregar manifesto dos pacientes
  const manifestRaw = fs.readFileSync('docs/demo-patients-manifest.json', 'utf8')
  const manifest = JSON.parse(manifestRaw)

  let insertedCount = 0

  // 3. Iterar sobre os pacientes configurados para enriquecimento longitudinal
  for (const [pNumStr, series] of Object.entries(LONGITUDINAL_SERIES)) {
    const pNum = Number(pNumStr)
    const patMeta = manifest.patients.find((p) => p.num === pNum)

    if (!patMeta) {
      console.warn(`Paciente P${pNum} não localizado no manifesto.`)
      continue
    }

    const patientId = patMeta.patientId
    const patAge = patMeta.age
    const patSex = patMeta.sex

    console.log(`\n[ENRIQUECENDO P${pNum.toString().padStart(2, '0')}] ${patMeta.name} (${patMeta.stage} - ${patMeta.trajectory})`)

    for (const ex of series) {
      // Verificar se exame nessa data já existe
      const { data: exRec } = await supabase
        .from('clinical_records')
        .select('id')
        .eq('patient_id', patientId)
        .eq('clinical_date', ex.date)
        .eq('record_type', 'LAB_EXAM')
        .maybeSingle()

      if (!exRec) {
        const { egfr, stage } = calculateCKDEPI(ex.scr, patAge, patSex)

        // Criar registro clínico confirmado
        const { data: newRec, error: recErr } = await supabase
          .from('clinical_records')
          .insert({
            patient_id: patientId,
            record_type: 'LAB_EXAM',
            status: 'CONFIRMED',
            clinical_date: ex.date,
            created_by_user_id: docUserId,
            confirmed_by_user_id: docUserId,
            confirmed_at: `${ex.date}T16:00:00Z`,
            created_at: `${ex.date}T15:30:00Z`,
          })
          .select('id')
          .single()

        if (recErr || !newRec) {
          console.error(`Erro ao criar registro em ${ex.date}:`, recErr?.message)
          continue
        }

        const recordId = newRec.id

        // Inserir resultados do exame laboratorial
        await supabase.from('lab_results').insert([
          { clinical_record_id: recordId, exam_code: 'CREATININE', exam_name: 'Creatinina Sérica', numeric_value: ex.scr, original_unit: 'mg/dL' },
          { clinical_record_id: recordId, exam_code: 'EGFR', exam_name: 'Taxa de Filtração Glomerular Estimada (CKD-EPI 2021)', numeric_value: egfr, original_unit: 'mL/min/1.73m²' },
          { clinical_record_id: recordId, exam_code: 'UREA', exam_name: 'Ureia Sérica', numeric_value: ex.urea, original_unit: 'mg/dL' },
          { clinical_record_id: recordId, exam_code: 'POTASSIUM', exam_name: 'Potássio Sérico', numeric_value: ex.k, original_unit: 'mEq/L' },
          { clinical_record_id: recordId, exam_code: 'HEMOGLOBIN', exam_name: 'Hemoglobina', numeric_value: ex.hb, original_unit: 'g/dL' },
        ])

        // Persistir metadados em calculation_runs
        await supabase.from('calculation_runs').insert({
          clinical_record_id: recordId,
          patient_id: patientId,
          executed_by_user_id: docUserId,
          formula_version: 'CKD-EPI-2021-CR',
          calculated_egfr: egfr,
          ckd_stage: stage,
          raw_inputs: { creatinine: ex.scr, age: patAge, sex: patSex, referenceDate: ex.date },
        })

        // Inserir sinais vitais correspondentes sincronizados com a data
        if (ex.sys && ex.dia && ex.weight) {
          const { data: vitRec } = await supabase
            .from('clinical_records')
            .insert({
              patient_id: patientId,
              record_type: 'VITAL_SIGNS',
              status: 'CONFIRMED',
              clinical_date: ex.date,
              created_by_user_id: docUserId,
              confirmed_by_user_id: docUserId,
              confirmed_at: `${ex.date}T16:05:00Z`,
              created_at: `${ex.date}T15:35:00Z`,
            })
            .select('id')
            .single()

          if (vitRec) {
            await supabase.from('vital_signs').insert([
              { clinical_record_id: vitRec.id, sign_code: 'BP_SYSTOLIC', numeric_value: ex.sys, unit: 'mmHg' },
              { clinical_record_id: vitRec.id, sign_code: 'BP_DIASTOLIC', numeric_value: ex.dia, unit: 'mmHg' },
              { clinical_record_id: vitRec.id, sign_code: 'WEIGHT', numeric_value: ex.weight, unit: 'kg' },
            ])
          }
        }

        insertedCount++
        console.log(`  -> Adicionado [${ex.date}]: Creatinina ${ex.scr.toFixed(2)} mg/dL | eTFG ${egfr.toFixed(2)} mL/min | PA ${ex.sys}x${ex.dia} mmHg | Peso ${ex.weight} kg`)
      }
    }
  }

  console.log('\n===================================================================')
  console.log(`  CONCLUÍDO: ${insertedCount} NOVOS REGISTROS TEMPORAIS ADICIONADOS ÀS CURVAS! `)
  console.log('===================================================================')
}

main().catch((err) => {
  console.error('[ERRO CRÍTICO]:', err)
  process.exit(1)
})
