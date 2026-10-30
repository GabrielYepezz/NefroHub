import { calculateCKDEPI2021, CKDStage, BiologicalSex } from '@/lib/calculators/ckd-epi'

export type { CKDStage }

export interface RenalMetricsResult {
  calculated_egfr: number
  ckd_stage: CKDStage
}

/**
 * Delegador de retrocompatibilidade para a Calculadora Oficial CKD-EPI 2021
 */
export function calculateRenalMetrics(
  creatinine: number,
  birthDate: string | Date,
  gender: 'male' | 'female' | 'M' | 'F',
  referenceDate: string | Date = new Date()
): RenalMetricsResult {
  const bioSex: BiologicalSex = gender === 'female' || gender === 'F' ? 'F' : 'M'

  try {
    const res = calculateCKDEPI2021({
      creatinine,
      birthDate,
      referenceDate,
      biologicalSex: bioSex,
    })

    return {
      calculated_egfr: res.rounded_eGFR,
      ckd_stage: res.ckdStage,
    }
  } catch {
    return {
      calculated_egfr: 0,
      ckd_stage: 'G5',
    }
  }
}
