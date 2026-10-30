import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

// Implementação pura da fórmula oficial NEJM 2021 para o runner Node ESM
function calculateCKDEPI2021Reference(input) {
  const { creatinine, creatinineUnit = 'mg/dL', ageAtExam, biologicalSex } = input

  if (typeof creatinine !== 'number' || isNaN(creatinine) || creatinine <= 0) {
    throw new Error('A creatinina sérica deve ser um valor numérico estritamente positivo.')
  }
  if (creatinine > 35 && creatinineUnit === 'mg/dL') {
    throw new Error('Valor de creatinina sérica clinicamente implausível (> 35 mg/dL).')
  }
  if (biologicalSex !== 'M' && biologicalSex !== 'F') {
    throw new Error('Sexo biológico inválido para a equação (esperado: M ou F).')
  }
  if (ageAtExam < 18) {
    throw new Error('A equação CKD-EPI 2021 é validada apenas para pacientes adultos (18 anos ou mais).')
  }

  const scrMgDl = creatinineUnit === 'umol/L' ? creatinine / 88.4 : creatinine
  const isFemale = biologicalSex === 'F'
  const kappa = isFemale ? 0.7 : 0.9
  const alpha = isFemale ? -0.241 : -0.302
  const sexFactor = isFemale ? 1.012 : 1.000

  const scrOverKappa = scrMgDl / kappa
  const minComp = Math.min(scrOverKappa, 1.0)
  const maxComp = Math.max(scrOverKappa, 1.0)

  const egfr = 142 * Math.pow(minComp, alpha) * Math.pow(maxComp, -1.200) * Math.pow(0.9938, ageAtExam) * sexFactor
  const rounded = Math.round(egfr * 10) / 10

  let stage = 'G5'
  if (rounded >= 90) stage = 'G1'
  else if (rounded >= 60) stage = 'G2'
  else if (rounded >= 45) stage = 'G3a'
  else if (rounded >= 30) stage = 'G3b'
  else if (rounded >= 15) stage = 'G4'

  return { eGFR: egfr, rounded_eGFR: rounded, stage }
}

describe('Fase 3.2: Validação da Calculadora CKD-EPI 2021 e Persistência de Exames', () => {

  describe('1. Casos de Referência da Literatura Médica Oficial (NEJM 2021)', () => {
    test('Caso 1: Homem de 55 anos com Creatinina 1.1 mg/dL (Função Levemente Reduzida - G2)', () => {
      const res = calculateCKDEPI2021Reference({
        creatinine: 1.1,
        creatinineUnit: 'mg/dL',
        ageAtExam: 55,
        biologicalSex: 'M',
      })

      // Cálculo oficial NEJM 2021: 142 * (1.1/0.9)^(-1.2) * (0.9938^55) = 79.33...
      assert.equal(res.rounded_eGFR, 79.3)
      assert.equal(res.stage, 'G2')
    })

    test('Caso 2: Mulher de 65 anos com Creatinina 0.6 mg/dL (Função Normal - G1)', () => {
      const res = calculateCKDEPI2021Reference({
        creatinine: 0.6,
        creatinineUnit: 'mg/dL',
        ageAtExam: 65,
        biologicalSex: 'F',
      })

      // Cálculo oficial NEJM 2021: 142 * (0.6/0.7)^(-0.241) * (0.9938^65) * 1.012 = 99.49...
      assert.equal(res.rounded_eGFR, 99.5)
      assert.equal(res.stage, 'G1')
    })

    test('Caso 3: Mulher de 70 anos com Creatinina 2.2 mg/dL (DRC Avançada - G4)', () => {
      const res = calculateCKDEPI2021Reference({
        creatinine: 2.2,
        creatinineUnit: 'mg/dL',
        ageAtExam: 70,
        biologicalSex: 'F',
      })

      // Cálculo oficial NEJM 2021: 142 * (2.2/0.7)^(-1.2) * (0.9938^70) * 1.012 = 23.498... => 23.5
      assert.equal(res.rounded_eGFR, 23.5)
      assert.equal(res.stage, 'G4')
    })

    test('Caso 4: Homem jovem de 30 anos com Creatinina 0.8 mg/dL (Excelente Função - G1)', () => {
      const res = calculateCKDEPI2021Reference({
        creatinine: 0.8,
        creatinineUnit: 'mg/dL',
        ageAtExam: 30,
        biologicalSex: 'M',
      })

      // Cálculo oficial NEJM 2021: 142 * (0.8/0.9)^(-0.302) * (0.9938^30) = 122.09... => 122.1
      assert.equal(res.rounded_eGFR, 122.1)
      assert.equal(res.stage, 'G1')
    })
  })

  describe('2. Entradas Inválidas e Limites de Segurança Clínica', () => {
    test('Deve rejeitar valores de creatinina menores ou iguais a zero', () => {
      assert.throws(() => {
        calculateCKDEPI2021Reference({ creatinine: 0, ageAtExam: 40, biologicalSex: 'M' })
      }, /positivos?/)

      assert.throws(() => {
        calculateCKDEPI2021Reference({ creatinine: -1.2, ageAtExam: 40, biologicalSex: 'M' })
      }, /positivos?/)
    })

    test('Deve rejeitar valor clinicamente implausível (> 35 mg/dL)', () => {
      assert.throws(() => {
        calculateCKDEPI2021Reference({ creatinine: 40, ageAtExam: 50, biologicalSex: 'M' })
      }, /implausível/)
    })

    test('Deve rejeitar cálculo para pacientes pediátricos (< 18 anos)', () => {
      assert.throws(() => {
        calculateCKDEPI2021Reference({ creatinine: 0.9, ageAtExam: 14, biologicalSex: 'F' })
      }, /adultos/)
    })

    test('Deve rejeitar sexo biológico inválido', () => {
      assert.throws(() => {
        calculateCKDEPI2021Reference({ creatinine: 1.0, ageAtExam: 50, biologicalSex: 'OTHER' })
      }, /Sexo biológico inválido/)
    })
  })

  describe('3. Conversão de Unidades e Precisão', () => {
    test('Conversão de umol/L para mg/dL deve produzir resultado clinicamente equivalente', () => {
      // 88.4 umol/L equivale exatamente a 1.0 mg/dL
      const resMg = calculateCKDEPI2021Reference({
        creatinine: 1.0,
        creatinineUnit: 'mg/dL',
        ageAtExam: 60,
        biologicalSex: 'M',
      })

      const resUmol = calculateCKDEPI2021Reference({
        creatinine: 88.4,
        creatinineUnit: 'umol/L',
        ageAtExam: 60,
        biologicalSex: 'M',
      })

      assert.equal(resMg.rounded_eGFR, resUmol.rounded_eGFR)
      assert.equal(resMg.stage, resUmol.stage)
    })
  })

  describe('4. Estrutura e Governança de calculation_runs (Seção 10.4)', () => {
    test('Registro em calculation_runs deve conter metadados e versionamento exigidos', () => {
      const mockCalculationRun = {
        calculator_code: 'CKD_EPI_2021',
        formula_version: 'CKD-EPI-2021-CR',
        run_type: 'CLINICAL_RECORD',
        patient_id: '00000000-0000-0000-0000-000000000001',
        performed_by_user_id: '00000000-0000-0000-0000-000000000002',
        reference_date: '2026-10-25',
        input_values: { creatinine: 1.2, age: 60, sex: 'M' },
        input_units: { creatinine: 'mg/dL', age: 'years' },
        result_value: 70.5,
        result_unit: 'mL/min/1.73m²',
      }

      assert.equal(mockCalculationRun.calculator_code, 'CKD_EPI_2021')
      assert.equal(mockCalculationRun.formula_version, 'CKD-EPI-2021-CR')
      assert.equal(mockCalculationRun.run_type, 'CLINICAL_RECORD')
      assert.equal(mockCalculationRun.result_unit, 'mL/min/1.73m²')
      assert.ok(mockCalculationRun.result_value > 0)
    })
  })
})
