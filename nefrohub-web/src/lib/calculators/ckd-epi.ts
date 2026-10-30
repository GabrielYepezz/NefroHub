/**
 * Calculadora Oficial CKD-EPI Creatinina 2021 (Race-Free)
 * 
 * Referência Técnica:
 * Inker LA, Eneanya ND, Coresh J, et al.
 * "New Creatinine- and Cystatin C–Based Equations to Estimate GFR without Race."
 * The New England Journal of Medicine (NEJM) 2021; 385:1737-1749.
 * DOI: 10.1056/NEJMoa2102953
 * 
 * Fórmula:
 * eGFR = 142 * min(Scr / kappa, 1)^alpha * max(Scr / kappa, 1)^-1.200 * 0.9938^Age * (1.012 se Feminino)
 * 
 * Parâmetros:
 * - Mulheres (F): kappa = 0.7, alpha = -0.241, fator sexo = 1.012
 * - Homens (M): kappa = 0.9, alpha = -0.302, fator sexo = 1.000
 * - Scr: Creatinina Sérica em mg/dL
 * - Age: Idade na data de referência da coleta do exame
 */

export type BiologicalSex = 'M' | 'F'
export type CreatinineUnit = 'mg/dL' | 'umol/L'
export type CKDStage = 'G1' | 'G2' | 'G3a' | 'G3b' | 'G4' | 'G5'

export interface CKDEPI2021Input {
  creatinine: number
  creatinineUnit?: CreatinineUnit
  birthDate: string | Date
  referenceDate?: string | Date
  biologicalSex: BiologicalSex
}

export interface CKDEPI2021Result {
  eGFR: number
  rounded_eGFR: number
  unit: 'mL/min/1.73m²'
  ckdStage: CKDStage
  stageDescription: string
  formulaVersion: 'CKD-EPI-2021-CR'
  inputsUsed: {
    serumCreatinineMgDl: number
    originalCreatinine: number
    originalUnit: CreatinineUnit
    ageAtExam: number
    biologicalSex: BiologicalSex
    referenceDate: string
  }
}

/**
 * Calcula a idade em anos completos na data de referência (ex: data da coleta do exame)
 */
export function calculateAgeAtDate(birthDate: string | Date, referenceDate: string | Date = new Date()): number {
  const birth = new Date(birthDate)
  const ref = new Date(referenceDate)

  if (isNaN(birth.getTime()) || isNaN(ref.getTime())) {
    throw new Error('Data de nascimento ou data de referência inválida.')
  }

  if (birth > ref) {
    throw new Error('Inconsistência cronológica: A data de nascimento não pode ser posterior à data de referência do exame.')
  }

  let age = ref.getFullYear() - birth.getFullYear()
  const m = ref.getMonth() - birth.getMonth()
  if (m < 0 || (m === 0 && ref.getDate() < birth.getDate())) {
    age--
  }

  return age < 0 ? 0 : age
}

/**
 * Classificação de Estágios de Doença Renal Crônica (KDIGO)
 */
export function getKDIGOStage(eGFR: number): { stage: CKDStage; description: string } {
  if (eGFR >= 90) return { stage: 'G1', description: 'Função renal normal ou elevada' }
  if (eGFR >= 60) return { stage: 'G2', description: 'Perda leve da função renal' }
  if (eGFR >= 45) return { stage: 'G3a', description: 'Perda leve a moderada da função renal' }
  if (eGFR >= 30) return { stage: 'G3b', description: 'Perda moderada a grave da função renal' }
  if (eGFR >= 15) return { stage: 'G4', description: 'Perda grave da função renal' }
  return { stage: 'G5', description: 'Falência renal / Pré-diálise' }
}

/**
 * Executa o cálculo da Equação CKD-EPI 2021
 */
export function calculateCKDEPI2021(input: CKDEPI2021Input): CKDEPI2021Result {
  const {
    creatinine,
    creatinineUnit = 'mg/dL',
    birthDate,
    referenceDate = new Date(),
    biologicalSex,
  } = input

  // 1. Validação estrita de entradas numéricas
  if (typeof creatinine !== 'number' || isNaN(creatinine) || creatinine <= 0) {
    throw new Error('A creatinina sérica deve ser um valor numérico estritamente positivo.')
  }

  if (creatinine > 35 && creatinineUnit === 'mg/dL') {
    throw new Error('Valor de creatinina sérica clinicamente implausível (> 35 mg/dL).')
  }

  if (biologicalSex !== 'M' && biologicalSex !== 'F') {
    throw new Error('Sexo biológico inválido para a equação (esperado: M ou F).')
  }

  // 2. Normalização de unidade (se umol/L, divide por 88.4)
  const scrMgDl = creatinineUnit === 'umol/L' ? creatinine / 88.4 : creatinine

  // 3. Determinação da Idade na Data do Exame
  const ageAtExam = calculateAgeAtDate(birthDate, referenceDate)

  // Validação etária: CKD-EPI é desenvolvida e validada para adultos (>= 18 anos)
  if (ageAtExam < 18) {
    throw new Error('A equação CKD-EPI 2021 é validada apenas para pacientes adultos (18 anos ou mais). Para pacientes pediátricos, utilize a fórmula de Schwartz.')
  }

  // 4. Constantes da Fórmula Oficial NEJM 2021
  const isFemale = biologicalSex === 'F'
  const kappa = isFemale ? 0.7 : 0.9
  const alpha = isFemale ? -0.241 : -0.302
  const sexFactor = isFemale ? 1.012 : 1.000

  // 5. Cálculo Matemático da Equação
  const scrOverKappa = scrMgDl / kappa
  const minComponent = Math.min(scrOverKappa, 1.0)
  const maxComponent = Math.max(scrOverKappa, 1.0)

  const egfrRaw =
    142 *
    Math.pow(minComponent, alpha) *
    Math.pow(maxComponent, -1.200) *
    Math.pow(0.9938, ageAtExam) *
    sexFactor

  // 6. Arredondamento padronizado: 1 casa decimal para eGFR
  const rounded_eGFR = Math.round(egfrRaw * 10) / 10
  const kdigo = getKDIGOStage(rounded_eGFR)

  const refDateStr = typeof referenceDate === 'string'
    ? referenceDate.split('T')[0]
    : referenceDate.toISOString().split('T')[0]

  return {
    eGFR: egfrRaw,
    rounded_eGFR,
    unit: 'mL/min/1.73m²',
    ckdStage: kdigo.stage,
    stageDescription: kdigo.description,
    formulaVersion: 'CKD-EPI-2021-CR',
    inputsUsed: {
      serumCreatinineMgDl: scrMgDl,
      originalCreatinine: creatinine,
      originalUnit: creatinineUnit,
      ageAtExam,
      biologicalSex,
      referenceDate: refDateStr,
    },
  }
}
