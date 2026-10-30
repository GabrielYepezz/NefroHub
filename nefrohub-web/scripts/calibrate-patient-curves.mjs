// scripts/calibrate-patient-curves.mjs
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
  console.error('ERRO: Variáveis de ambiente ausentes')
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
    stage,
  }
}

// Parâmetros de curva por estágio e trajetória
function generateCalibratedScr(stage, trajectory, index, total, age, sex) {
  const progress = total > 1 ? index / (total - 1) : 1

  switch (stage) {
    case 'G1':
      // Estável com função preservada (> 90 mL/min)
      return sex === 'F' ? Number((0.65 + Math.sin(index) * 0.03).toFixed(2)) : Number((0.82 + Math.sin(index) * 0.04).toFixed(2))

    case 'G2':
      // Estável ou leve declínio (60 a 89 mL/min)
      if (trajectory.includes('Piora') || trajectory.includes('Declínio')) {
        return sex === 'F' ? Number((0.88 + progress * 0.25).toFixed(2)) : Number((1.02 + progress * 0.28).toFixed(2))
      }
      return sex === 'F' ? Number((0.92 + Math.sin(index) * 0.03).toFixed(2)) : Number((1.10 + Math.sin(index) * 0.04).toFixed(2))

    case 'G3a':
      // Leve a moderado (45 a 59 mL/min)
      if (trajectory.includes('IRA') || trajectory.includes('Hidratação')) {
        // Insulto agudo no meio da curva
        const isSpike = index === Math.floor(total / 2)
        return isSpike ? 1.85 : Number((1.36 + progress * 0.06).toFixed(2))
      }
      if (trajectory.includes('Declínio')) {
        return sex === 'F' ? Number((1.18 + progress * 0.22).toFixed(2)) : Number((1.30 + progress * 0.25).toFixed(2))
      }
      return sex === 'F' ? Number((1.16 + Math.sin(index) * 0.03).toFixed(2)) : Number((1.40 + Math.sin(index) * 0.04).toFixed(2))

    case 'G3b':
      // Moderado a grave (30 a 44 mL/min)
      if (trajectory.includes('Acelerado') || trajectory.includes('GESF')) {
        return sex === 'F' ? Number((1.50 + progress * 0.90).toFixed(2)) : Number((1.60 + progress * 1.05).toFixed(2))
      }
      if (trajectory.includes('Oscilatório') || trajectory.includes('Cardiorrenal')) {
        return Number((1.80 + Math.sin(index * 2) * 0.35).toFixed(2))
      }
      return sex === 'F' ? Number((1.55 + progress * 0.15).toFixed(2)) : Number((1.85 + progress * 0.20).toFixed(2))

    case 'G4':
      // Grave / Pré-diálise (15 a 29 mL/min)
      if (trajectory.includes('Declínio') || trajectory.includes('Contínuo')) {
        return sex === 'F' ? Number((2.20 + progress * 1.40).toFixed(2)) : Number((2.40 + progress * 1.80).toFixed(2))
      }
      return sex === 'F' ? Number((2.35 + Math.sin(index) * 0.08).toFixed(2)) : Number((2.70 + Math.sin(index) * 0.10).toFixed(2))

    case 'G5':
      // Falência renal (< 15 mL/min)
      return sex === 'F' ? Number((4.10 + progress * 2.80).toFixed(2)) : Number((4.50 + progress * 3.60).toFixed(2))

    default:
      return 1.20
  }
}

async function main() {
  console.log('===================================================================')
  console.log('  CALIBRAÇÃO FISIOPATOLÓGICA DAS CURVAS TEMPORAIS (G1 A G5)       ')
  console.log('===================================================================')

  const manifestRaw = fs.readFileSync('docs/demo-patients-manifest.json', 'utf8')
  const manifest = JSON.parse(manifestRaw)

  // 1. Obter médico demo
  const { data: docUser } = await supabase
    .from('users')
    .select('id, name')
    .eq('email', 'demo-medico@nefrohub.test')
    .single()

  let calibratedCount = 0

  for (const pat of manifest.patients) {
    const { data: records } = await supabase
      .from('clinical_records')
      .select('id, clinical_date')
      .eq('patient_id', pat.patientId)
      .eq('record_type', 'LAB_EXAM')
      .order('clinical_date', { ascending: true })

    if (!records || records.length === 0) continue

    console.log(`\n[CALIBRANDO P${pat.num.toString().padStart(2, '0')}] ${pat.name} (${pat.stage} - ${pat.trajectory}) - ${records.length} pontos`)

    for (let i = 0; i < records.length; i++) {
      const rec = records[i]
      const scr = generateCalibratedScr(pat.stage, pat.trajectory, i, records.length, pat.age, pat.sex)
      const { egfr, stage } = calculateCKDEPI(scr, pat.age, pat.sex)

      // Atualizar ou inserir lab_results
      const { data: existingLabs } = await supabase
        .from('lab_results')
        .select('id, exam_name')
        .eq('clinical_record_id', rec.id)

      if (existingLabs && existingLabs.length > 0) {
        // Atualizar valores de Creatinina e eTFG
        for (const lab of existingLabs) {
          if (lab.exam_name.toLowerCase().includes('creatinina')) {
            await supabase.from('lab_results').update({ numeric_value: scr }).eq('id', lab.id)
          } else if (lab.exam_name.toLowerCase().includes('tfg') || lab.exam_name.toLowerCase().includes('egfr')) {
            await supabase.from('lab_results').update({ numeric_value: egfr }).eq('id', lab.id)
          }
        }
      } else {
        // Inserir novo par
        await supabase.from('lab_results').insert([
          { clinical_record_id: rec.id, exam_name: 'Creatinina Sérica', exam_code: 'CREATININE', numeric_value: scr, original_unit: 'mg/dL', source_origin: 'MANUAL_INPUT' },
          { clinical_record_id: rec.id, exam_name: 'TFGe (CKD-EPI 2021)', exam_code: 'EGFR', numeric_value: egfr, original_unit: 'mL/min/1.73m²', source_origin: 'MANUAL_INPUT' },
        ])
      }

      // Upsert em calculation_runs
      await supabase.from('calculation_runs').upsert({
        clinical_record_id: rec.id,
        patient_id: pat.patientId,
        executed_by_user_id: docUser.id,
        formula_version: 'CKD-EPI-2021-CR',
        calculated_egfr: egfr,
        ckd_stage: stage,
        raw_inputs: { creatinine: scr, age: pat.age, sex: pat.sex, referenceDate: rec.clinical_date },
      }, { onConflict: 'clinical_record_id' })

      calibratedCount++
      console.log(`  -> [${rec.clinical_date}] Creatinina: ${scr.toFixed(2).padStart(4)} mg/dL | TFGe: ${egfr.toFixed(2).padStart(6)} mL/min (${stage})`)
    }
  }

  console.log('\n===================================================================')
  console.log(`  SUCESSO: ${calibratedCount} PONTOS DA CURVA TEMPORAL CALIBRADOS!  `)
  console.log('===================================================================')
}

main().catch((err) => {
  console.error('[ERRO CRÍTICO]:', err)
  process.exit(1)
})
