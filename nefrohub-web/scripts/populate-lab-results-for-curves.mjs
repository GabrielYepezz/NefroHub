// scripts/populate-lab-results-for-curves.mjs
import fs from 'fs'
import { createClient } from '@supabase/supabase-js'

// 1. Carregar variáveis de .env.local
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
  console.error('ERRO: NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY ausentes')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// Equação oficial CKD-EPI 2021
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
  return Number(egfr.toFixed(2))
}

async function main() {
  console.log('===================================================================')
  console.log('  POPULAÇÃO DE LAB_RESULTS PARA ALIMENTAR A CURVA LONGITUDINAL    ')
  console.log('===================================================================')

  // 1. Obter médico demo
  const { data: docUser } = await supabase
    .from('users')
    .select('id, name')
    .eq('email', 'demo-medico@nefrohub.test')
    .single()

  // 2. Obter vínculos ativos
  const { data: links } = await supabase
    .from('physician_patient_links')
    .select('patient_id, patient_profiles(id, full_name, birth_date, biological_sex)')
    .eq('physician_user_id', docUser.id)
    .eq('status', 'ACTIVE')

  console.log(`[MÉDICO] ${docUser.name} - ${links.length} pacientes vinculados.`)

  let totalLabsInserted = 0

  for (const link of links) {
    const p = link.patient_profiles
    if (!p) continue

    const age = new Date().getFullYear() - new Date(p.birth_date).getFullYear()
    const sex = p.biological_sex

    // Buscar todos os registros do tipo LAB_EXAM deste paciente sem join em calculation_runs
    const { data: examRecords, error: exErr } = await supabase
      .from('clinical_records')
      .select('id, clinical_date, lab_results(id)')
      .eq('patient_id', p.id)
      .eq('record_type', 'LAB_EXAM')
      .order('clinical_date', { ascending: true })

    if (exErr) {
      console.error(`Erro ao buscar exames de ${p.full_name}:`, exErr.message)
      continue
    }

    if (!examRecords || examRecords.length === 0) continue

    for (const rec of examRecords) {
      // Se já tem lab_results suficientes, pular
      if (rec.lab_results && rec.lab_results.length >= 2) continue

      // Buscar calculation_runs desacoplado se existir
      const { data: calcRuns } = await supabase
        .from('calculation_runs')
        .select('calculated_egfr, raw_inputs')
        .eq('clinical_record_id', rec.id)
        .limit(1)

      const calcRun = calcRuns?.[0]
      let scr = calcRun?.raw_inputs?.creatinine
      let egfr = calcRun?.calculated_egfr

      if (!scr) {
        // Se não houver calculation_runs, derivar valor de creatinina coerente
        const year = new Date(rec.clinical_date).getFullYear()
        const month = new Date(rec.clinical_date).getMonth() + 1
        const timeFactor = (year - 2025) * 0.1 + (month / 12) * 0.05
        scr = Number((1.1 + timeFactor).toFixed(2))
        egfr = calculateCKDEPI(scr, age, sex)
      } else if (!egfr) {
        egfr = calculateCKDEPI(scr, age, sex)
      }

      // Estimar valores de apoio plausíveis
      const urea = Math.round(scr * 35)
      const k = Number((4.0 + (scr > 2.5 ? 1.0 : scr > 1.5 ? 0.5 : 0.2)).toFixed(1))
      const hb = Number((14.5 - (scr > 3.0 ? 5.0 : scr > 2.0 ? 3.0 : scr > 1.2 ? 1.5 : 0.5)).toFixed(1))

      // Inserir resultados completos com source_origin: 'MANUAL_INPUT'
      const rows = [
        {
          clinical_record_id: rec.id,
          exam_name: 'Creatinina Sérica',
          exam_code: 'CREATININE',
          numeric_value: scr,
          original_unit: 'mg/dL',
          comparator: '=',
          source_origin: 'MANUAL_INPUT',
        },
        {
          clinical_record_id: rec.id,
          exam_name: 'TFGe (CKD-EPI 2021)',
          exam_code: 'EGFR',
          numeric_value: egfr,
          original_unit: 'mL/min/1.73m²',
          comparator: '=',
          source_origin: 'MANUAL_INPUT',
        },
        {
          clinical_record_id: rec.id,
          exam_name: 'Ureia Sérica',
          exam_code: 'UREA',
          numeric_value: urea,
          original_unit: 'mg/dL',
          comparator: '=',
          source_origin: 'MANUAL_INPUT',
        },
        {
          clinical_record_id: rec.id,
          exam_name: 'Potássio Sérico',
          exam_code: 'POTASSIUM',
          numeric_value: k,
          original_unit: 'mEq/L',
          comparator: '=',
          source_origin: 'MANUAL_INPUT',
        },
        {
          clinical_record_id: rec.id,
          exam_name: 'Hemoglobina',
          exam_code: 'HEMOGLOBIN',
          numeric_value: hb,
          original_unit: 'g/dL',
          comparator: '=',
          source_origin: 'MANUAL_INPUT',
        },
      ]

      const { error: insertErr } = await supabase.from('lab_results').insert(rows)
      if (insertErr) {
        console.error(`Erro ao inserir lab_results em ${rec.clinical_date}:`, insertErr.message)
      } else {
        totalLabsInserted += rows.length
      }
    }

    console.log(`[P] ${p.full_name.padEnd(30)} -> ${examRecords.length} exames configurados na curva.`)
  }

  console.log('\n===================================================================')
  console.log(`  CONCLUÍDO COM SUCESSO: ${totalLabsInserted} RESULTADOS INSERIDOS EM LAB_RESULTS!`)
  console.log('===================================================================')
}

main().catch((err) => {
  console.error('[ERRO CRÍTICO]:', err)
  process.exit(1)
})
