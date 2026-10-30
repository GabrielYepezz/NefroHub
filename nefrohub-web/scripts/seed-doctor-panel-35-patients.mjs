// scripts/seed-doctor-panel-35-patients.mjs
import fs from 'fs'
import crypto from 'crypto'
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

// Implementação determinística oficial CKD-EPI 2021 (Inker et al., NEJM 2021)
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

// Definição clínica estruturada dos 35 pacientes
const PATIENTS_DATA = [
  // ESTÁGIO G1 (Função renal normal com evidência de lesão parenquimatosa) - 4 pacientes
  {
    num: 1, name: 'Lucas Gabriel Albuquerque', sex: 'M', birth: '2001-04-12', age: 25,
    cpfDigits: '10192837401', cpfMask: '***.928.374-**', phone: '11981110001',
    stage: 'G1', trajectory: 'Estável',
    exams: [
      { date: '2026-01-10', scr: 0.85, urea: 24, k: 4.1, hb: 14.8 },
      { date: '2026-05-12', scr: 0.82, urea: 22, k: 4.0, hb: 15.0 },
      { date: '2026-09-18', scr: 0.84, urea: 25, k: 4.2, hb: 14.9 },
    ],
    conditions: [{ name: 'Microalbuminúria Diabética Incipiente', cid10: 'E10.2' }],
    meds: [{ name: 'Insulina Glargina', dosage: '18', unit: 'UI', frequency: 'À noite' }],
    allergies: [{ substance: 'Penicilina', severity: 'MODERADA', reaction: 'Exantema macular difuso', status: 'KNOWN' }],
  },
  {
    num: 2, name: 'Beatriz Vasconcelos Lima', sex: 'F', birth: '1998-11-03', age: 27,
    cpfDigits: '20293847502', cpfMask: '***.938.475-**', phone: '11981110002',
    stage: 'G1', trajectory: 'Estável',
    exams: [
      { date: '2026-02-14', scr: 0.65, urea: 20, k: 3.9, hb: 13.2 },
      { date: '2026-06-20', scr: 0.68, urea: 22, k: 4.1, hb: 13.0 },
      { date: '2026-10-10', scr: 0.66, urea: 21, k: 4.0, hb: 13.1 },
    ],
    conditions: [{ name: 'Hematúria Microscópica Recorrente Benigna', cid10: 'R31' }],
    meds: [],
    allergies: [{ status: 'NO_KNOWN_ALLERGIES', substance: 'NEGA_ALERGIAS_CONHECIDAS' }],
  },
  {
    num: 3, name: 'Matheus Henrique Nogueira', sex: 'M', birth: '1993-08-25', age: 33,
    cpfDigits: '30394857603', cpfMask: '***.948.576-**', phone: '11981110003',
    stage: 'G1', trajectory: 'Estável',
    exams: [
      { date: '2026-01-20', scr: 0.88, urea: 28, k: 4.3, hb: 15.5 },
      { date: '2026-07-15', scr: 0.86, urea: 27, k: 4.2, hb: 15.2 },
    ],
    conditions: [{ name: 'Rim Único Congênito Hipoplásico', cid10: 'Q60.0' }],
    meds: [],
    allergies: [], // UNREPORTED
  },
  {
    num: 4, name: 'Camila Fernandes Queiroz', sex: 'F', birth: '1990-03-14', age: 36,
    cpfDigits: '40495867704', cpfMask: '***.958.677-**', phone: '11981110004',
    stage: 'G1', trajectory: 'Estável',
    exams: [
      { date: '2026-03-05', scr: 0.70, urea: 24, k: 4.0, hb: 13.8 },
      { date: '2026-09-02', scr: 0.72, urea: 26, k: 4.1, hb: 13.5 },
    ],
    conditions: [{ name: 'Lúpus Eritematoso Sistêmico com Nefrite Grau II', cid10: 'M32.1' }],
    meds: [{ name: 'Hidroxicloroquina', dosage: '400', unit: 'mg', frequency: '1 vez ao dia' }],
    allergies: [{ substance: 'Dipirona', severity: 'LEVE', reaction: 'Prurido cutâneo', status: 'KNOWN' }],
  },

  // ESTÁGIO G2 (Redução leve da função renal - eTFG 60-89) - 7 pacientes
  {
    num: 5, name: 'Eduardo Martins Fontes', sex: 'M', birth: '1982-05-19', age: 44,
    cpfDigits: '50596877805', cpfMask: '***.968.778-**', phone: '11981110005',
    stage: 'G2', trajectory: 'Estável',
    exams: [
      { date: '2026-01-15', scr: 1.10, urea: 36, k: 4.3, hb: 14.5 },
      { date: '2026-05-10', scr: 1.12, urea: 38, k: 4.4, hb: 14.2 },
      { date: '2026-09-22', scr: 1.08, urea: 35, k: 4.2, hb: 14.6 },
    ],
    conditions: [{ name: 'Hipertensão Arterial Primária', cid10: 'I10' }],
    meds: [{ name: 'Losartana', dosage: '50', unit: 'mg', frequency: '1x ao dia' }],
    allergies: [{ status: 'NO_KNOWN_ALLERGIES', substance: 'NEGA_ALERGIAS_CONHECIDAS' }],
  },
  {
    num: 6, name: 'Renata Silveira Campos', sex: 'F', birth: '1979-09-30', age: 47,
    cpfDigits: '60697887906', cpfMask: '***.978.879-**', phone: '11981110006',
    stage: 'G2', trajectory: 'Estável',
    exams: [
      { date: '2026-02-18', scr: 0.95, urea: 32, k: 4.0, hb: 12.9 },
      { date: '2026-06-15', scr: 0.98, urea: 34, k: 4.2, hb: 12.8 },
      { date: '2026-10-18', scr: 0.94, urea: 31, k: 4.1, hb: 13.0 },
    ],
    conditions: [{ name: 'Dislipidemia Mista', cid10: 'E78.2' }],
    meds: [{ name: 'Atorvastatina', dosage: '20', unit: 'mg', frequency: 'À noite' }],
    allergies: [],
  },
  {
    num: 7, name: 'Antônio Carlos Moreira', sex: 'M', birth: '1974-12-08', age: 51,
    cpfDigits: '70798898007', cpfMask: '***.988.980-**', phone: '11981110007',
    stage: 'G2', trajectory: 'Leve Piora',
    exams: [
      { date: '2026-01-25', scr: 1.05, urea: 38, k: 4.4, hb: 14.0 },
      { date: '2026-06-10', scr: 1.15, urea: 42, k: 4.6, hb: 13.8 },
      { date: '2026-10-25', scr: 1.22, urea: 45, k: 4.8, hb: 13.5 },
    ],
    conditions: [{ name: 'Diabetes Mellitus Tipo 2', cid10: 'E11' }, { name: 'Hipertensão', cid10: 'I10' }],
    meds: [{ name: 'Metformina', dosage: '850', unit: 'mg', frequency: '2x ao dia' }, { name: 'Enalapril', dosage: '10', unit: 'mg', frequency: '1x ao dia' }],
    allergies: [{ status: 'NO_KNOWN_ALLERGIES', substance: 'NEGA_ALERGIAS_CONHECIDAS' }],
    pendingVital: { systolic: 138, diastolic: 88, weight: 84.5 },
  },
  {
    num: 8, name: 'Juliana Pires Rezende', sex: 'F', birth: '1970-07-11', age: 56,
    cpfDigits: '80899908108', cpfMask: '***.999.081-**', phone: '11981110008',
    stage: 'G2', trajectory: 'Estável',
    exams: [
      { date: '2026-03-12', scr: 0.90, urea: 30, k: 4.1, hb: 13.4 },
      { date: '2026-08-14', scr: 0.92, urea: 32, k: 4.2, hb: 13.2 },
    ],
    conditions: [{ name: 'Nefrolitíase de Repetição por Oxalato de Cálcio', cid10: 'N20.0' }],
    meds: [{ name: 'Hidroclorotiazida', dosage: '25', unit: 'mg', frequency: 'Pela manhã' }],
    allergies: [{ substance: 'Ibuprofeno', severity: 'MODERADA', reaction: 'Edema periorbitário', status: 'KNOWN' }],
  },
  {
    num: 9, name: 'Fernando Seixas Bittencourt', sex: 'M', birth: '1968-02-28', age: 58,
    cpfDigits: '90901018209', cpfMask: '***.010.182-**', phone: '11981110009',
    stage: 'G2', trajectory: 'Estável',
    exams: [
      { date: '2026-02-05', scr: 1.18, urea: 40, k: 4.5, hb: 14.1 },
      { date: '2026-07-08', scr: 1.15, urea: 39, k: 4.3, hb: 14.3 },
    ],
    conditions: [{ name: 'Sobrepeso e Esteatose Hepática Grau I', cid10: 'E66.0' }],
    meds: [],
    allergies: [],
  },
  {
    num: 10, name: 'Luciana Prado Mendonça', sex: 'F', birth: '1965-10-15', age: 61,
    cpfDigits: '10102128310', cpfMask: '***.021.283-**', phone: '11981110010',
    stage: 'G2', trajectory: 'Estável',
    exams: [
      { date: '2026-01-30', scr: 0.96, urea: 33, k: 4.2, hb: 12.6 },
      { date: '2026-06-25', scr: 0.94, urea: 31, k: 4.0, hb: 12.8 },
      { date: '2026-10-12', scr: 0.95, urea: 34, k: 4.1, hb: 12.7 },
    ],
    conditions: [{ name: 'Hipotireoidismo Primário', cid10: 'E03.9' }],
    meds: [{ name: 'Levotiroxina Sódica', dosage: '75', unit: 'mcg', frequency: 'Jejum' }],
    allergies: [{ status: 'NO_KNOWN_ALLERGIES', substance: 'NEGA_ALERGIAS_CONHECIDAS' }],
  },
  {
    num: 11, name: 'Geraldo Magela Fagundes', sex: 'M', birth: '1961-04-03', age: 65,
    cpfDigits: '11113238411', cpfMask: '***.132.384-**', phone: '11981110011',
    stage: 'G2', trajectory: 'Estável',
    exams: [
      { date: '2026-03-20', scr: 1.12, urea: 37, k: 4.4, hb: 13.9 },
      { date: '2026-09-10', scr: 1.14, urea: 39, k: 4.5, hb: 13.7 },
    ],
    conditions: [{ name: 'Gota Úrica Primária', cid10: 'M10.0' }],
    meds: [{ name: 'Alopurinol', dosage: '100', unit: 'mg', frequency: '1x ao dia' }],
    allergies: [{ substance: 'AAS', severity: 'LEVE', reaction: 'Epigastralgia e náuseas', status: 'KNOWN' }],
  },

  // ESTÁGIO G3a (Redução leve a moderada - eTFG 45-59) - 7 pacientes
  {
    num: 12, name: 'Sérgio Ramos Peixoto', sex: 'M', birth: '1959-06-22', age: 67,
    cpfDigits: '12124348512', cpfMask: '***.243.485-**', phone: '11981110012',
    stage: 'G3a', trajectory: 'Declínio Lento',
    exams: [
      { date: '2026-01-18', scr: 1.35, urea: 46, k: 4.5, hb: 13.0 },
      { date: '2026-04-20', scr: 1.40, urea: 49, k: 4.6, hb: 12.8 },
      { date: '2026-07-28', scr: 1.44, urea: 52, k: 4.8, hb: 12.5 },
      { date: '2026-10-22', scr: 1.48, urea: 55, k: 4.9, hb: 12.2 },
    ],
    conditions: [{ name: 'Nefrosclerose Hipertensiva Benigna', cid10: 'I12.9' }],
    meds: [{ name: 'Anlodipino', dosage: '5', unit: 'mg', frequency: 'Pela manhã' }, { name: 'Valsartana', dosage: '160', unit: 'mg', frequency: 'À noite' }],
    allergies: [{ status: 'NO_KNOWN_ALLERGIES', substance: 'NEGA_ALERGIAS_CONHECIDAS' }],
    pendingVital: { systolic: 142, diastolic: 92, weight: 81.0 },
  },
  {
    num: 13, name: 'Tereza Cristina Viana', sex: 'F', birth: '1957-01-14', age: 69,
    cpfDigits: '13135458613', cpfMask: '***.354.586-**', phone: '11981110013',
    stage: 'G3a', trajectory: 'Estável',
    exams: [
      { date: '2026-02-12', scr: 1.15, urea: 42, k: 4.3, hb: 12.1 },
      { date: '2026-06-18', scr: 1.18, urea: 44, k: 4.4, hb: 12.0 },
      { date: '2026-10-05', scr: 1.14, urea: 41, k: 4.2, hb: 12.2 },
    ],
    conditions: [{ name: 'Diabetes Tipo 2 com Retinopatia e Nefropatia', cid10: 'E11.2' }],
    meds: [{ name: 'Gliclazida MR', dosage: '60', unit: 'mg', frequency: 'Manhã' }, { name: 'Losartana', dosage: '50', unit: 'mg', frequency: '12/12h' }],
    allergies: [],
  },
  {
    num: 14, name: 'Waldir Cavalcante Rocha', sex: 'M', birth: '1955-11-29', age: 70,
    cpfDigits: '14146568714', cpfMask: '***.465.687-**', phone: '11981110014',
    stage: 'G3a', trajectory: 'Melhora Parcial Pós-Hidratação',
    exams: [
      { date: '2026-01-08', scr: 1.60, urea: 64, k: 4.9, hb: 12.4 }, // Episódio de desidratação (IRA sobre DRC)
      { date: '2026-03-15', scr: 1.42, urea: 48, k: 4.6, hb: 12.7 },
      { date: '2026-07-10', scr: 1.38, urea: 45, k: 4.5, hb: 12.8 },
      { date: '2026-10-14', scr: 1.40, urea: 47, k: 4.5, hb: 12.6 },
    ],
    conditions: [{ name: 'Insuficiência Cardíaca Congestiva NYHA II', cid10: 'I50.0' }, { name: 'DRC Estágio 3a', cid10: 'N18.3' }],
    meds: [{ name: 'Carvedilol', dosage: '12.5', unit: 'mg', frequency: '12/12h' }, { name: 'Furosemida', dosage: '20', unit: 'mg', frequency: '1x ao dia' }],
    allergies: [{ substance: 'Sulfametoxazol', severity: 'MODERADA', reaction: 'Urticária e prurido', status: 'KNOWN' }],
  },
  {
    num: 15, name: 'Sônia Regina Meireles', sex: 'F', birth: '1953-03-08', age: 73,
    cpfDigits: '15157678815', cpfMask: '***.576.788-**', phone: '11981110015',
    stage: 'G3a', trajectory: 'Estável',
    exams: [
      { date: '2026-02-22', scr: 1.18, urea: 43, k: 4.4, hb: 11.9 },
      { date: '2026-06-28', scr: 1.20, urea: 45, k: 4.5, hb: 11.8 },
      { date: '2026-10-20', scr: 1.17, urea: 42, k: 4.3, hb: 12.0 },
    ],
    conditions: [{ name: 'Osteoporose Senil com Fratura Prévia', cid10: 'M81.0' }],
    meds: [{ name: 'Colecalciferol (Vit D)', dosage: '50000', unit: 'UI', frequency: 'Semanal' }],
    allergies: [{ status: 'NO_KNOWN_ALLERGIES', substance: 'NEGA_ALERGIAS_CONHECIDAS' }],
  },
  {
    num: 16, name: 'Paulo Roberto Guarita', sex: 'M', birth: '1950-09-17', age: 76,
    cpfDigits: '16168788916', cpfMask: '***.687.889-**', phone: '11981110016',
    stage: 'G3a', trajectory: 'Estável',
    exams: [
      { date: '2026-03-01', scr: 1.45, urea: 50, k: 4.6, hb: 12.3 },
      { date: '2026-08-30', scr: 1.48, urea: 52, k: 4.7, hb: 12.1 },
    ],
    conditions: [{ name: 'Doença Arterial Coronariana Estável', cid10: 'I25.1' }],
    meds: [{ name: 'Mononitrato de Isossorbida', dosage: '20', unit: 'mg', frequency: '12/12h' }],
    allergies: [],
    pendingVital: { systolic: 135, diastolic: 85, weight: 76.2 },
  },
  {
    num: 17, name: 'Marise Helena Toledo', sex: 'F', birth: '1948-05-24', age: 78,
    cpfDigits: '17179899017', cpfMask: '***.798.990-**', phone: '11981110017',
    stage: 'G3a', trajectory: 'Flutuante',
    exams: [
      { date: '2026-01-12', scr: 1.22, urea: 46, k: 4.6, hb: 11.7 },
      { date: '2026-05-14', scr: 1.30, urea: 51, k: 4.8, hb: 11.5 },
      { date: '2026-09-20', scr: 1.25, urea: 48, k: 4.7, hb: 11.6 },
    ],
    conditions: [{ name: 'Fibrilação Atrial Crônica', cid10: 'I48.2' }],
    meds: [{ name: 'Apixabana', dosage: '2.5', unit: 'mg', frequency: '12/12h' }],
    allergies: [{ substance: 'Dipirona', severity: 'MODERADA', reaction: 'Broncoespasmo', status: 'KNOWN' }],
  },
  {
    num: 18, name: 'João Batista Medeiros', sex: 'M', birth: '1944-12-05', age: 81,
    cpfDigits: '18180909118', cpfMask: '***.809.091-**', phone: '11981110018',
    stage: 'G3a', trajectory: 'Estável Senil',
    exams: [
      { date: '2026-02-28', scr: 1.50, urea: 54, k: 4.7, hb: 12.0 },
      { date: '2026-07-22', scr: 1.52, urea: 55, k: 4.8, hb: 11.9 },
    ],
    conditions: [{ name: 'Doença Renal Crônica do Idoso', cid10: 'N18.3' }],
    meds: [{ name: 'Anlodipino', dosage: '5', unit: 'mg', frequency: '1x ao dia' }],
    allergies: [{ status: 'NO_KNOWN_ALLERGIES', substance: 'NEGA_ALERGIAS_CONHECIDAS' }],
  },

  // ESTÁGIO G3b (Redução moderada a grave - eTFG 30-44) - 6 pacientes
  {
    num: 19, name: 'Cláudio Márcio Mendonça', sex: 'M', birth: '1966-07-04', age: 60,
    cpfDigits: '19191019219', cpfMask: '***.910.192-**', phone: '11981110019',
    stage: 'G3b', trajectory: 'Declínio Acelerado',
    exams: [
      { date: '2026-01-10', scr: 1.70, urea: 58, k: 4.7, hb: 11.5 },
      { date: '2026-04-12', scr: 1.88, urea: 65, k: 5.0, hb: 11.1 },
      { date: '2026-07-19', scr: 2.05, urea: 74, k: 5.2, hb: 10.7 },
      { date: '2026-10-16', scr: 2.25, urea: 82, k: 5.4, hb: 10.3 },
    ],
    conditions: [{ name: 'Glomeruloesclerose Segmentar e Focal (GESF)', cid10: 'N04.1' }, { name: 'Hipertensão Severa', cid10: 'I10' }],
    meds: [{ name: 'Prednisona', dosage: '20', unit: 'mg', frequency: 'Pela manhã' }, { name: 'Espironolactona', dosage: '25', unit: 'mg', frequency: '1x ao dia' }],
    allergies: [{ substance: 'Contraste Iodado', severity: 'GRAVE', reaction: 'Choque anafilático prévio', status: 'KNOWN' }],
    pendingVital: { systolic: 155, diastolic: 100, weight: 89.2 },
  },
  {
    num: 20, name: 'Elza Mara Penteado', sex: 'F', birth: '1963-03-21', age: 63,
    cpfDigits: '20202129320', cpfMask: '***.021.293-**', phone: '11981110020',
    stage: 'G3b', trajectory: 'Estável',
    exams: [
      { date: '2026-02-15', scr: 1.55, urea: 56, k: 4.6, hb: 11.0 },
      { date: '2026-06-14', scr: 1.58, urea: 58, k: 4.8, hb: 10.8 },
      { date: '2026-10-22', scr: 1.54, urea: 55, k: 4.7, hb: 11.1 },
    ],
    conditions: [{ name: 'Nefropatia Diabética com Proteinúria Macroscópica', cid10: 'E11.2' }],
    meds: [{ name: 'Dapagliflozina', dosage: '10', unit: 'mg', frequency: '1x ao dia' }, { name: 'Losartana', dosage: '100', unit: 'mg', frequency: 'Manhã' }],
    allergies: [{ status: 'NO_KNOWN_ALLERGIES', substance: 'NEGA_ALERGIAS_CONHECIDAS' }],
  },
  {
    num: 21, name: 'Osmar Dias Sobrinho', sex: 'M', birth: '1960-11-18', age: 65,
    cpfDigits: '21213239421', cpfMask: '***.132.394-**', phone: '11981110021',
    stage: 'G3b', trajectory: 'Declínio Lento',
    exams: [
      { date: '2026-01-22', scr: 1.80, urea: 62, k: 4.8, hb: 11.2 },
      { date: '2026-05-25', scr: 1.90, urea: 67, k: 5.0, hb: 10.9 },
      { date: '2026-09-30', scr: 2.02, urea: 71, k: 5.1, hb: 10.6 },
    ],
    conditions: [{ name: 'Doença Renal Policística Autossômica Dominante (DRPAD)', cid10: 'Q61.2' }],
    meds: [{ name: 'Tolvaptan', dosage: '45', unit: 'mg', frequency: '2x ao dia' }],
    allergies: [],
  },
  {
    num: 22, name: 'Nadir Aparecida Gouveia', sex: 'F', birth: '1956-08-09', age: 70,
    cpfDigits: '22224349522', cpfMask: '***.243.495-**', phone: '11981110022',
    stage: 'G3b', trajectory: 'Estável',
    exams: [
      { date: '2026-03-08', scr: 1.62, urea: 59, k: 4.7, hb: 10.8 },
      { date: '2026-08-12', scr: 1.65, urea: 61, k: 4.9, hb: 10.6 },
    ],
    conditions: [{ name: 'Nefrite Intersticial Crônica por Analgésicos', cid10: 'N11.9' }],
    meds: [{ name: 'Bicarbonato de Sódio', dosage: '500', unit: 'mg', frequency: '3x ao dia' }],
    allergies: [{ substance: 'Anti-inflamatórios Não Esteroidais (AINEs)', severity: 'GRAVE', reaction: 'Piora aguda da função renal', status: 'KNOWN' }],
    pendingVital: { systolic: 148, diastolic: 90, weight: 68.0 },
  },
  {
    num: 23, name: 'Renato Barreto Antunes', sex: 'M', birth: '1952-04-16', age: 74,
    cpfDigits: '23235459623', cpfMask: '***.354.596-**', phone: '11981110023',
    stage: 'G3b', trajectory: 'Oscilatório',
    exams: [
      { date: '2026-01-30', scr: 1.95, urea: 68, k: 5.0, hb: 11.0 },
      { date: '2026-06-02', scr: 2.10, urea: 75, k: 5.3, hb: 10.5 },
      { date: '2026-10-10', scr: 1.92, urea: 66, k: 4.9, hb: 10.9 },
    ],
    conditions: [{ name: 'Cardiopatia Isquêmica com Síndrome Cardiorrenal', cid10: 'I50.9' }],
    meds: [{ name: 'Furosemida', dosage: '40', unit: 'mg', frequency: '12/12h' }],
    allergies: [{ status: 'NO_KNOWN_ALLERGIES', substance: 'NEGA_ALERGIAS_CONHECIDAS' }],
  },
  {
    num: 24, name: 'Ivone Marcondes Duarte', sex: 'F', birth: '1946-10-27', age: 80,
    cpfDigits: '24246569724', cpfMask: '***.465.697-**', phone: '11981110024',
    stage: 'G3b', trajectory: 'Estável',
    exams: [
      { date: '2026-02-10', scr: 1.70, urea: 62, k: 4.8, hb: 10.4 },
      { date: '2026-07-15', scr: 1.74, urea: 65, k: 5.0, hb: 10.2 },
    ],
    conditions: [{ name: 'Aterosclerose Renal com Estenose Moderada', cid10: 'I70.1' }],
    meds: [{ name: 'Clopidogrel', dosage: '75', unit: 'mg', frequency: '1x ao dia' }],
    allergies: [],
  },

  // ESTÁGIO G4 (Redução grave - eTFG 15-29, Pré-diálise) - 6 pacientes
  {
    num: 25, name: 'Marcos Vinícius Fagundes', sex: 'M', birth: '1965-09-02', age: 61,
    cpfDigits: '25257679825', cpfMask: '***.576.798-**', phone: '11981110025',
    stage: 'G4', trajectory: 'Declínio para Pré-Diálise',
    exams: [
      { date: '2026-01-15', scr: 2.60, urea: 88, k: 5.1, hb: 10.5 },
      { date: '2026-04-18', scr: 2.85, urea: 98, k: 5.3, hb: 10.0 },
      { date: '2026-07-22', scr: 3.10, urea: 110, k: 5.6, hb: 9.6 },
      { date: '2026-10-18', scr: 3.40, urea: 125, k: 5.8, hb: 9.2 },
    ],
    conditions: [{ name: 'Nefropatia Diabética Estágio Avançado', cid10: 'E11.2' }, { name: 'Hiperparatireoidismo Secundário à DRC', cid10: 'N25.8' }],
    meds: [{ name: 'Carbonato de Cálcio', dosage: '500', unit: 'mg', frequency: 'Com as refeições' }, { name: 'Eritropoetina', dosage: '4000', unit: 'UI', frequency: '2x/semana' }, { name: 'Poliestirenossulfonato de Cálcio (Sorcal)', dosage: '30', unit: 'g', frequency: 'Ao dia' }],
    allergies: [{ substance: 'Contraste Baritado', severity: 'MODERADA', reaction: 'Obstipação severa e cólica', status: 'KNOWN' }],
    pendingVital: { systolic: 160, diastolic: 95, weight: 82.5 },
  },
  {
    num: 26, name: 'Heloísa Helena Alencar', sex: 'F', birth: '1962-12-14', age: 63,
    cpfDigits: '26268789926', cpfMask: '***.687.899-**', phone: '11981110026',
    stage: 'G4', trajectory: 'Estável em G4',
    exams: [
      { date: '2026-02-05', scr: 2.40, urea: 82, k: 5.0, hb: 9.9 },
      { date: '2026-06-10', scr: 2.45, urea: 85, k: 5.2, hb: 9.8 },
      { date: '2026-10-12', scr: 2.42, urea: 83, k: 5.1, hb: 9.9 },
    ],
    conditions: [{ name: 'Amiloidose Renal Secundária', cid10: 'E85.4' }],
    meds: [{ name: 'Furosemida', dosage: '40', unit: 'mg', frequency: '12/12h' }, { name: 'Quelante de Fósforo (Sevelamer)', dosage: '800', unit: 'mg', frequency: '3x ao dia' }],
    allergies: [{ status: 'NO_KNOWN_ALLERGIES', substance: 'NEGA_ALERGIAS_CONHECIDAS' }],
  },
  {
    num: 27, name: 'Valdemar Gusmão Passos', sex: 'M', birth: '1958-08-30', age: 68,
    cpfDigits: '27279890027', cpfMask: '***.798.900-**', phone: '11981110027',
    stage: 'G4', trajectory: 'Declínio Contínuo',
    exams: [
      { date: '2026-01-28', scr: 2.70, urea: 92, k: 5.2, hb: 10.2 },
      { date: '2026-05-30', scr: 2.95, urea: 104, k: 5.4, hb: 9.7 },
      { date: '2026-09-25', scr: 3.25, urea: 118, k: 5.7, hb: 9.3 },
    ],
    conditions: [{ name: 'Glomerulonefrite Membranoproliferativa', cid10: 'N03.5' }, { name: 'Acidose Metabólica Crônica', cid10: 'E87.2' }],
    meds: [{ name: 'Bicarbonato de Sódio 8.4%', dosage: '1000', unit: 'mg', frequency: '3x ao dia' }],
    allergies: [],
  },
  {
    num: 28, name: 'Cleusa Maria Bittencourt', sex: 'F', birth: '1954-04-05', age: 72,
    cpfDigits: '28280901128', cpfMask: '***.809.011-**', phone: '11981110028',
    stage: 'G4', trajectory: 'Estável em G4',
    exams: [
      { date: '2026-03-10', scr: 2.50, urea: 86, k: 5.1, hb: 9.5 },
      { date: '2026-08-15', scr: 2.55, urea: 89, k: 5.3, hb: 9.4 },
    ],
    conditions: [{ name: 'Anemia Secundária à Doença Renal Crônica', cid10: 'D63.8' }],
    meds: [{ name: 'Sacarato de Hidróxido de Ferro (Noripurum EV)', dosage: '100', unit: 'mg', frequency: 'Quinzenal' }],
    allergies: [{ substance: 'Dipirona', severity: 'GRAVE', reaction: 'Hipotensão e broncoespasmo severo', status: 'KNOWN' }],
    pendingVital: { systolic: 150, diastolic: 90, weight: 71.0 },
  },
  {
    num: 29, name: 'Aristides Nogueira Sobrinho', sex: 'M', birth: '1949-01-20', age: 77,
    cpfDigits: '29291012229', cpfMask: '***.910.122-**', phone: '11981110029',
    stage: 'G4', trajectory: 'Declínio Lento',
    exams: [
      { date: '2026-02-18', scr: 2.90, urea: 100, k: 5.4, hb: 9.8 },
      { date: '2026-07-20', scr: 3.15, urea: 112, k: 5.6, hb: 9.4 },
    ],
    conditions: [{ name: 'Nefropatia Isquêmica Bilateral', cid10: 'I70.1' }],
    meds: [{ name: 'Hidralazina', dosage: '50', unit: 'mg', frequency: '8/8h' }],
    allergies: [{ status: 'NO_KNOWN_ALLERGIES', substance: 'NEGA_ALERGIAS_CONHECIDAS' }],
  },
  {
    num: 30, name: 'Alzira Guimarães da Silva', sex: 'F', birth: '1942-06-18', age: 84,
    cpfDigits: '30302123330', cpfMask: '***.021.233-**', phone: '11981110030',
    stage: 'G4', trajectory: 'Estável em G4 Avançado',
    exams: [
      { date: '2026-03-25', scr: 2.80, urea: 96, k: 5.2, hb: 9.1 },
      { date: '2026-09-28', scr: 2.85, urea: 99, k: 5.3, hb: 9.0 },
    ],
    conditions: [{ name: 'Fragilidade Senil com DRC Grave', cid10: 'R54' }],
    meds: [{ name: 'Calcitriol', dosage: '0.25', unit: 'mcg', frequency: '1x ao dia' }],
    allergies: [],
  },

  // ESTÁGIO G5 (Falência Renal - eTFG < 15, Indicação de Diálise / Uremia) - 5 pacientes
  {
    num: 31, name: 'Gilberto Mendonça Ramos', sex: 'M', birth: '1967-03-12', age: 59,
    cpfDigits: '31313234431', cpfMask: '***.132.344-**', phone: '11981110031',
    stage: 'G5', trajectory: 'Uremia Terminal',
    exams: [
      { date: '2026-01-05', scr: 4.80, urea: 160, k: 6.0, hb: 8.8 },
      { date: '2026-04-10', scr: 5.40, urea: 185, k: 6.2, hb: 8.4 },
      { date: '2026-07-15', scr: 6.20, urea: 210, k: 6.5, hb: 8.0 },
      { date: '2026-10-20', scr: 7.10, urea: 240, k: 6.8, hb: 7.6 },
    ],
    conditions: [{ name: 'Doença Renal Crônica Estágio 5 Dialítica', cid10: 'N18.5' }, { name: 'Hipercalemia Grave', cid10: 'E87.5' }],
    meds: [{ name: 'Sevelamer', dosage: '1600', unit: 'mg', frequency: 'Com almoço e jantar' }, { name: 'Furosemida', dosage: '80', unit: 'mg', frequency: 'Manhã' }, { name: 'Eritropoetina', dosage: '4000', unit: 'UI', frequency: '3x/semana' }],
    allergies: [{ substance: 'Vancomicina', severity: 'GRAVE', reaction: 'Síndrome do Homem Vermelho com hipotensão', status: 'KNOWN' }],
    pendingVital: { systolic: 170, diastolic: 105, weight: 86.0 },
  },
  {
    num: 32, name: 'Vera Lúcia Bittencourt', sex: 'F', birth: '1964-08-20', age: 62,
    cpfDigits: '32324345532', cpfMask: '***.243.455-**', phone: '11981110032',
    stage: 'G5', trajectory: 'Declínio Terminal Rápido',
    exams: [
      { date: '2026-02-12', scr: 4.20, urea: 140, k: 5.7, hb: 8.9 },
      { date: '2026-06-18', scr: 5.10, urea: 175, k: 6.1, hb: 8.3 },
      { date: '2026-10-15', scr: 6.00, urea: 205, k: 6.4, hb: 7.8 },
    ],
    conditions: [{ name: 'Nefropatia Diabética Terminal', cid10: 'E11.2' }, { name: 'Sobrecarga Hídrica Refratária', cid10: 'E87.7' }],
    meds: [{ name: 'Carbonato de Cálcio', dosage: '1000', unit: 'mg', frequency: '3x ao dia' }],
    allergies: [{ status: 'NO_KNOWN_ALLERGIES', substance: 'NEGA_ALERGIAS_CONHECIDAS' }],
  },
  {
    num: 33, name: 'Benedito Silveira Bueno', sex: 'M', birth: '1959-10-30', age: 67,
    cpfDigits: '33335456633', cpfMask: '***.354.566-**', phone: '11981110033',
    stage: 'G5', trajectory: 'Pré-Transplante Renal',
    exams: [
      { date: '2026-01-20', scr: 5.50, urea: 180, k: 5.9, hb: 8.5 },
      { date: '2026-06-25', scr: 6.10, urea: 200, k: 6.3, hb: 8.1 },
      { date: '2026-10-10', scr: 6.80, urea: 225, k: 6.6, hb: 7.9 },
    ],
    conditions: [{ name: 'Insuficiência Renal Crônica Terminal em Hemodiálise', cid10: 'N18.5' }],
    meds: [{ name: 'Cinacalcete', dosage: '30', unit: 'mg', frequency: '1x ao dia' }],
    allergies: [],
    pendingVital: { systolic: 165, diastolic: 100, weight: 79.5 },
  },
  {
    num: 34, name: 'Margarida Antunes Soares', sex: 'F', birth: '1955-02-17', age: 71,
    cpfDigits: '34346567734', cpfMask: '***.465.677-**', phone: '11981110034',
    stage: 'G5', trajectory: 'Conservador Paliativo',
    exams: [
      { date: '2026-03-05', scr: 4.50, urea: 150, k: 5.6, hb: 8.6 },
      { date: '2026-08-10', scr: 5.20, urea: 180, k: 6.0, hb: 8.0 },
    ],
    conditions: [{ name: 'Doença Renal Crônica Avançada - Tratamento Conservador', cid10: 'N18.5' }],
    meds: [{ name: 'Morfina Solução Oral', dosage: '5', unit: 'mg', frequency: 'SOS para dispneia' }],
    allergies: [{ substance: 'Codeína', severity: 'MODERADA', reaction: 'Náuseas incoercíveis e confusão', status: 'KNOWN' }],
  },
  {
    num: 35, name: 'Sebastião Vilela Fontoura', sex: 'M', birth: '1947-11-09', age: 79,
    cpfDigits: '35357678835', cpfMask: '***.576.788-**', phone: '11981110035',
    stage: 'G5', trajectory: 'Terminal com Fístula AV',
    exams: [
      { date: '2026-02-20', scr: 5.00, urea: 165, k: 5.8, hb: 8.4 },
      { date: '2026-07-28', scr: 6.30, urea: 215, k: 6.4, hb: 7.7 },
      { date: '2026-10-24', scr: 7.50, urea: 250, k: 6.9, hb: 7.2 },
    ],
    conditions: [{ name: 'Uremia Terminal com FAV em Braço Esquerdo', cid10: 'N18.5' }, { name: 'Hipertensão Arterial Refratária', cid10: 'I15.0' }],
    meds: [{ name: 'Clonidina', dosage: '0.150', unit: 'mg', frequency: '8/8h' }, { name: 'Sevelamer', dosage: '2400', unit: 'mg', frequency: 'Com refeições' }],
    allergies: [{ status: 'NO_KNOWN_ALLERGIES', substance: 'NEGA_ALERGIAS_CONHECIDAS' }],
    pendingVital: { systolic: 175, diastolic: 110, weight: 73.0 },
  },
]

async function main() {
  console.log('===================================================================')
  console.log('  NEFROHUB: SEED MASSIVO DE 35 PACIENTES CLÍNICOS PARA DEMO DO MÉDICO')
  console.log('===================================================================')

  // 1. Obter instituição padrão
  const { data: inst } = await supabase.from('institutions').select('id').limit(1).single()
  const institutionId = inst?.id || '00000000-0000-0000-0000-000000000001'

  // 2. Identificar o Médico Nefrologista de Demonstração
  const docEmail = 'demo-medico@nefrohub.test'
  const { data: usersList } = await supabase.auth.admin.listUsers()
  let docAuthUser = usersList?.users?.find((u) => u.email.toLowerCase() === docEmail.toLowerCase())

  if (!docAuthUser) {
    console.log('Médico demo não encontrado no Auth. Criando demo-medico@nefrohub.test...')
    const { data: created, error } = await supabase.auth.admin.createUser({
      email: docEmail,
      password: 'DocSenhaForte@2026',
      email_confirm: true,
      user_metadata: { name: 'Dr. Roberto Guimarães (Nefrologia)', role: 'DOCTOR' },
    })
    if (error) throw new Error(`Falha ao criar médico demo: ${error.message}`)
    docAuthUser = created.user
  }

  const docUserId = docAuthUser.id
  await supabase.from('users').upsert({
    id: docUserId,
    email: docEmail,
    name: 'Dr. Roberto Guimarães (Nefrologia)',
    role: 'DOCTOR',
    status: 'ACTIVE',
    mfa_enabled: false,
    phone: '11988887777',
  })

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
  console.log(`[MÉDICO DEMO PRONTO] Dr. Roberto Guimarães (ID: ${docUserId})`)

  const manifest = []

  // 3. Iterar e cadastrar os 35 pacientes de forma idempotente
  for (const pat of PATIENTS_DATA) {
    const patEmail = `demo-p${pat.num.toString().padStart(2, '0')}@nefrohub.test`
    const patPassword = 'PatSenhaForte@2026'

    // Obter ou criar usuário no Auth
    let authUser = usersList?.users?.find((u) => u.email.toLowerCase() === patEmail.toLowerCase())
    if (!authUser) {
      const { data: createdUser, error: authErr } = await supabase.auth.admin.createUser({
        email: patEmail,
        password: patPassword,
        email_confirm: true,
        user_metadata: { name: pat.name, role: 'PATIENT' },
      })
      if (authErr) {
        console.warn(`Aviso ao criar usuário Auth ${patEmail}: ${authErr.message}`)
      } else {
        authUser = createdUser.user
      }
    }

    const patUserId = authUser?.id || null

    // Atualizar public.users se authUser existir
    if (patUserId) {
      await supabase.from('users').upsert({
        id: patUserId,
        email: patEmail,
        name: pat.name,
        role: 'PATIENT',
        status: 'ACTIVE',
        mfa_enabled: false,
        phone: pat.phone,
      })
    }

    // Criar ou obter patient_profiles
    const patCpfHash = generateCpfHash(pat.cpfDigits)
    const { data: existingProf } = await supabase
      .from('patient_profiles')
      .select('id')
      .eq('cpf_hash', patCpfHash)
      .maybeSingle()

    let patientId = existingProf?.id

    if (!patientId) {
      const { data: createdProf, error: profErr } = await supabase
        .from('patient_profiles')
        .insert({
          user_id: patUserId,
          institution_id: institutionId,
          full_name: pat.name,
          normalized_name: pat.name.toUpperCase(),
          birth_date: pat.birth,
          biological_sex: pat.sex,
          status: 'ACTIVE',
          created_by_user_id: docUserId,
          phone: pat.phone,
          cpf_hash: patCpfHash,
          cpf_masked: pat.cpfMask,
        })
        .select('id')
        .single()

      if (profErr) {
        throw new Error(`Falha ao criar patient_profile ${pat.name}: ${profErr.message}`)
      }
      patientId = createdProf.id
    }

    // Vincular ativamente ao médico assistente de demonstração
    const { data: exLink } = await supabase
      .from('physician_patient_links')
      .select('id')
      .eq('patient_id', patientId)
      .eq('physician_user_id', docUserId)
      .maybeSingle()

    if (!exLink) {
      const { error: linkErr } = await supabase.from('physician_patient_links').insert({
        patient_id: patientId,
        physician_user_id: docUserId,
        status: 'ACTIVE',
        is_primary: true,
        created_by_user_id: docUserId,
        activated_at: '2026-01-01T08:00:00Z',
        reason: `Acompanhamento ambulatorial de DRC estágio ${pat.stage} (${pat.trajectory}).`,
      })
      if (linkErr) console.error(`Erro ao vincular ${pat.name}:`, linkErr)
    }

    // Lançar série histórica de exames laboratoriais (Creatinina + eTFG)
    for (const ex of pat.exams) {
      const { egfr, stage } = calculateCKDEPI(ex.scr, pat.age, pat.sex)

      // Verificar se o registro na data já existe para não duplicar
      const { data: existingRec } = await supabase
        .from('clinical_records')
        .select('id')
        .eq('patient_id', patientId)
        .eq('clinical_date', ex.date)
        .eq('record_type', 'LAB_EXAM')
        .maybeSingle()

      let recordId = existingRec?.id

      if (!recordId) {
        const { data: newRec, error: recErr } = await supabase
          .from('clinical_records')
          .insert({
            patient_id: patientId,
            record_type: 'LAB_EXAM',
            status: 'CONFIRMED',
            clinical_date: ex.date,
            created_by_user_id: docUserId,
            confirmed_by_user_id: docUserId,
            confirmed_at: `${ex.date}T15:00:00Z`,
            created_at: `${ex.date}T14:30:00Z`,
          })
          .select('id')
          .single()

        if (!recErr && newRec) {
          recordId = newRec.id

          await supabase.from('lab_results').insert([
            { clinical_record_id: recordId, exam_code: 'CREATININE', exam_name: 'Creatinina Sérica', numeric_value: ex.scr, original_unit: 'mg/dL' },
            { clinical_record_id: recordId, exam_code: 'EGFR', exam_name: 'Taxa de Filtração Glomerular Estimada (CKD-EPI 2021)', numeric_value: egfr, original_unit: 'mL/min/1.73m²' },
            { clinical_record_id: recordId, exam_code: 'UREA', exam_name: 'Ureia Sérica', numeric_value: ex.urea, original_unit: 'mg/dL' },
            { clinical_record_id: recordId, exam_code: 'POTASSIUM', exam_name: 'Potássio Sérico', numeric_value: ex.k, original_unit: 'mEq/L' },
            { clinical_record_id: recordId, exam_code: 'HEMOGLOBIN', exam_name: 'Hemoglobina', numeric_value: ex.hb, original_unit: 'g/dL' },
          ])

          await supabase.from('calculation_runs').insert({
            clinical_record_id: recordId,
            patient_id: patientId,
            executed_by_user_id: docUserId,
            formula_version: 'CKD-EPI-2021-CR',
            calculated_egfr: egfr,
            ckd_stage: stage,
            raw_inputs: { creatinine: ex.scr, age: pat.age, sex: pat.sex, referenceDate: ex.date },
          })
        }
      }
    }

    // Sinais vitais pendentes (Fila Clínica de Curadoria) se aplicável
    if (pat.pendingVital) {
      const { data: existingPend } = await supabase
        .from('clinical_records')
        .select('id')
        .eq('patient_id', patientId)
        .eq('status', 'PENDING_VALIDATION')
        .maybeSingle()

      if (!existingPend) {
        const { data: newPend } = await supabase
          .from('clinical_records')
          .insert({
            patient_id: patientId,
            record_type: 'VITAL_SIGNS',
            status: 'PENDING_VALIDATION',
            clinical_date: '2026-10-29',
            created_by_user_id: patUserId || docUserId,
            created_at: new Date().toISOString(),
          })
          .select('id')
          .single()

        if (newPend) {
          await supabase.from('vital_signs').insert([
            { clinical_record_id: newPend.id, sign_code: 'BP_SYSTOLIC', numeric_value: pat.pendingVital.systolic, unit: 'mmHg' },
            { clinical_record_id: newPend.id, sign_code: 'BP_DIASTOLIC', numeric_value: pat.pendingVital.diastolic, unit: 'mmHg' },
            { clinical_record_id: newPend.id, sign_code: 'WEIGHT', numeric_value: pat.pendingVital.weight, unit: 'kg' },
          ])
        }
      }
    }

    // Inserir Comorbidades
    for (const cond of pat.conditions) {
      const { data: exCond } = await supabase
        .from('conditions')
        .select('id')
        .eq('patient_id', patientId)
        .eq('name', cond.name)
        .maybeSingle()

      if (!exCond) {
        await supabase.from('conditions').insert({
          patient_id: patientId,
          name: cond.name,
          cid10: cond.cid10 || null,
          status: 'ACTIVE',
          created_by_user_id: docUserId,
        })
      }
    }

    // Inserir Medicamentos
    for (const med of pat.meds) {
      const { data: exMed } = await supabase
        .from('medications')
        .select('id')
        .eq('patient_id', patientId)
        .eq('name', med.name)
        .maybeSingle()

      if (!exMed) {
        await supabase.from('medications').insert({
          patient_id: patientId,
          name: med.name,
          dosage: med.dosage,
          unit: med.unit,
          frequency: med.frequency,
          status: 'ACTIVE',
          is_prescription: true,
          created_by_user_id: docUserId,
        })
      }
    }

    // Inserir Alergias
    for (const alg of pat.allergies) {
      const { data: exAlg } = await supabase
        .from('allergies')
        .select('id')
        .eq('patient_id', patientId)
        .eq('substance', alg.substance)
        .maybeSingle()

      if (!exAlg) {
        await supabase.from('allergies').insert({
          patient_id: patientId,
          substance: alg.substance,
          reaction: alg.reaction || null,
          severity: alg.severity || 'LEVE',
          status: alg.status,
        })
      }
    }

    // Calcular eTFG atual para o manifesto
    const latestExam = pat.exams[pat.exams.length - 1]
    const currentCalc = calculateCKDEPI(latestExam.scr, pat.age, pat.sex)

    manifest.push({
      num: pat.num,
      patientId,
      name: pat.name,
      sex: pat.sex,
      age: pat.age,
      cpfMask: pat.cpfMask,
      email: patEmail,
      stage: pat.stage,
      trajectory: pat.trajectory,
      currentScr: latestExam.scr,
      currentEgfr: currentCalc.egfr,
      kdigo: currentCalc.stage,
      hasPendingCuration: !!pat.pendingVital,
    })

    console.log(`[P${pat.num.toString().padStart(2, '0')}] ${pat.name.padEnd(32)} | Estágio: ${pat.stage.padEnd(4)} | eTFG: ${currentCalc.egfr.toString().padStart(5)} mL/min | Curadoria: ${pat.pendingVital ? 'SIM' : 'NÃO'}`)
  }

  // 4. Inserir Laudos de Documentos Fictícios em Pacientes Selecionados
  console.log('\n--- Inserindo Metadados de Documentos Clínicos Fictícios ---')
  const docsToSeed = [
    { pNum: 1, title: 'Ultrassonografia Renal e Vias Urinárias', type: 'IMAGEM', size: 1048576, hash: 'a1b2c3d4e5f60718293a4b5c6d7e8f901234567890abcdef1234567890abcdef' },
    { pNum: 4, title: 'Biópsia Renal Percutada - Relatório Anatomopatológico', type: 'LAUDO', size: 2097152, hash: 'b2c3d4e5f60718293a4b5c6d7e8f901234567890abcdef1234567890abcdefa1' },
    { pNum: 14, title: 'Ecocardiograma Transtorácico com Doppler', type: 'IMAGEM', size: 1572864, hash: 'c3d4e5f60718293a4b5c6d7e8f901234567890abcdef1234567890abcdefa1b2' },
    { pNum: 19, title: 'Cintilografia Renal DMSA', type: 'LAUDO', size: 1843200, hash: 'd4e5f60718293a4b5c6d7e8f901234567890abcdef1234567890abcdefa1b2c3' },
    { pNum: 25, title: 'Mapeamento Vascular de Membro Superior para FAV', type: 'IMAGEM', size: 1258291, hash: 'e5f60718293a4b5c6d7e8f901234567890abcdef1234567890abcdefa1b2c3d4' },
    { pNum: 31, title: 'Sumário de Alta Hospitalar - Enfermaria de Nefrologia', type: 'RELATORIO', size: 890120, hash: 'f60718293a4b5c6d7e8f901234567890abcdef1234567890abcdefa1b2c3d4e5' },
  ]

  for (const doc of docsToSeed) {
    const targetPat = manifest.find((m) => m.num === doc.pNum)
    if (targetPat) {
      const { data: exDoc } = await supabase
        .from('documents')
        .select('id')
        .eq('patient_id', targetPat.patientId)
        .eq('title', doc.title)
        .maybeSingle()

      if (!exDoc) {
        const { error: docErr } = await supabase.from('documents').insert({
          patient_id: targetPat.patientId,
          uploaded_by_user_id: docUserId,
          title: doc.title,
          document_type: doc.type,
          mime_type: 'application/pdf',
          file_size_bytes: doc.size,
          sha256_hash: doc.hash,
          storage_path: `clinical-documents/demo/${targetPat.patientId}/${doc.hash}.pdf`,
          validation_status: 'CONFIRMED',
          created_at: '2026-09-15T10:00:00Z',
        })
        if (docErr) console.error('Erro ao anexar doc:', docErr.message)
        else console.log(`[DOCUMENTO] Anexado para ${targetPat.name}: "${doc.title}"`)
      }
    }
  }

  // 5. Salvar manifesto local
  fs.writeFileSync('docs/demo-patients-manifest.json', JSON.stringify({
    doctor: { email: docEmail, userId: docUserId, name: 'Dr. Roberto Guimarães (Nefrologia)' },
    generatedAt: new Date().toISOString(),
    totalPatients: manifest.length,
    patients: manifest,
  }, null, 2))

  console.log('\n[MANIFESTO] Salvo com sucesso em: docs/demo-patients-manifest.json')
  console.log('===================================================================')
  console.log(`  SUCESSO: ${manifest.length} PACIENTES FICTÍCIOS VINCULADOS AO DR. ROBERTO GUIMARÃES!`)
  console.log('===================================================================')
}

main().catch((err) => {
  console.error('[ERRO CRÍTICO NO SEED]:', err)
  process.exit(1)
})
