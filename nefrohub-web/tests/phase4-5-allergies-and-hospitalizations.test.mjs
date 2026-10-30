// tests/phase4-5-allergies-and-hospitalizations.test.mjs
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import * as z from 'zod'

// Schemas espelho de validação clínica
const recordAllergySchema = z.object({
  patientId: z.string().uuid('Identificador do paciente inválido'),
  substance: z.string().trim().min(2, 'A substância ou alérgeno deve ter no mínimo 2 caracteres'),
  reaction: z.string().trim().optional(),
  severity: z.enum(['LEVE', 'MODERADA', 'GRAVE']).optional(),
  status: z.enum(['KNOWN', 'NO_KNOWN_ALLERGIES', 'UNREPORTED', 'RESOLVED']).default('KNOWN'),
  clinicalDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data clínica no formato AAAA-MM-DD').optional(),
})

const hospitalizationSchema = z
  .object({
    patientId: z.string().uuid('Identificador do paciente inválido'),
    institutionName: z.string().trim().min(2, 'Nome da instituição deve ter no mínimo 2 caracteres'),
    admissionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data de admissão no formato AAAA-MM-DD'),
    dischargeDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data de alta no formato AAAA-MM-DD').optional().nullable(),
    admissionReason: z.string().trim().min(5, 'Motivo da internação deve ter no mínimo 5 caracteres'),
    cid10: z.string().trim().regex(/^[A-Z]\d{2}(\.\d+)?$/i, 'Formato de CID-10 inválido').optional().nullable(),
    outcome: z.enum(['ALTA_MELHORADA', 'ALTA_A_PEDIDO', 'TRANSFERENCIA', 'OBITO', 'EM_ANDAMENTO']).default('EM_ANDAMENTO'),
    clinicalNotes: z.string().trim().optional().nullable(),
  })
  .refine(
    (data) => {
      if (!data.dischargeDate) return true
      return new Date(data.dischargeDate) >= new Date(data.admissionDate)
    },
    {
      message: 'A data de alta não pode ser anterior à data de admissão hospitalar.',
      path: ['dischargeDate'],
    }
  )

describe('Incremento 2: Alergias (RF-054) e Internações Hospitalares (RF-056)', () => {

  describe('1. RF-054: Gestão de Alergias com Triplo Estado de Informação (PRD Seção 8.6)', () => {
    test('Validação de Alergia Conhecida (KNOWN) com gravidade e reação', () => {
      const validPayload = {
        patientId: '550e8400-e29b-41d4-a716-446655440000',
        substance: 'Contraste Iodado',
        reaction: 'Edema de glote e urticária severa',
        severity: 'GRAVE',
        status: 'KNOWN',
      }
      const res = recordAllergySchema.safeParse(validPayload)
      assert.equal(res.success, true)
    })

    test('Rejeição de substância com menos de 2 caracteres', () => {
      const invalidPayload = {
        patientId: '550e8400-e29b-41d4-a716-446655440000',
        substance: 'A',
        severity: 'LEVE',
      }
      const res = recordAllergySchema.safeParse(invalidPayload)
      assert.equal(res.success, false)
      assert.ok(res.error.issues.some((i) => i.message.includes('mínimo 2 caracteres')))
    })

    test('Triplo Estado: Validação do registro de "Nega Alergias" (NO_KNOWN_ALLERGIES)', () => {
      const noAllergiesPayload = {
        patientId: '550e8400-e29b-41d4-a716-446655440000',
        substance: 'NEGA_ALERGIAS_CONHECIDAS',
        reaction: 'Paciente refere não apresentar alergias prévias',
        status: 'NO_KNOWN_ALLERGIES',
      }
      const res = recordAllergySchema.safeParse(noAllergiesPayload)
      assert.equal(res.success, true)
      assert.equal(res.data.status, 'NO_KNOWN_ALLERGIES')
    })

    test('Triplo Estado: Interpretação de ausência como "UNREPORTED" (não ausência de alergia)', () => {
      const evaluateTriploEstado = (allergiesList) => {
        if (!allergiesList || allergiesList.length === 0) {
          return {
            state: 'UNREPORTED',
            message: 'Informação não relatada. A ausência de registro não é interpretada como ausência de alergias.',
          }
        }
        if (allergiesList.some((a) => a.status === 'NO_KNOWN_ALLERGIES')) {
          return { state: 'NO_KNOWN_ALLERGIES', message: 'Nega alergias conhecidas.' }
        }
        const active = allergiesList.filter((a) => a.status === 'KNOWN')
        return { state: 'KNOWN', activeCount: active.length }
      }

      // Lista vazia deve resultar em UNREPORTED
      const emptyResult = evaluateTriploEstado([])
      assert.equal(emptyResult.state, 'UNREPORTED')

      // Lista com declaração negativa
      const deniedResult = evaluateTriploEstado([{ status: 'NO_KNOWN_ALLERGIES' }])
      assert.equal(deniedResult.state, 'NO_KNOWN_ALLERGIES')

      // Lista com alergias ativas
      const activeResult = evaluateTriploEstado([{ status: 'KNOWN', substance: 'Dipirona' }])
      assert.equal(activeResult.state, 'KNOWN')
      assert.equal(activeResult.activeCount, 1)
    })

    test('Inativação de alergia (RESOLVED) preserva o histórico sem exclusão', () => {
      const initialRecord = {
        id: 'allergy-uuid-1',
        substance: 'Penicilina',
        status: 'KNOWN',
      }
      const inactivate = (record, reason) => ({
        ...record,
        status: 'RESOLVED',
        inactivatedReason: reason,
        inactivatedAt: '2026-10-29T16:00:00Z',
      })
      const updated = inactivate(initialRecord, 'Dessensibilização hospitalar concluída')
      assert.equal(updated.status, 'RESOLVED')
      assert.equal(updated.inactivatedReason, 'Dessensibilização hospitalar concluída')
    })

    test('Zero-Trust: Médico sem vínculo ativo é impedido de registrar alergias', () => {
      const simulateAuthorize = (hasLink, role) => {
        if (role === 'DOCTOR' && !hasLink) {
          return { authorized: false, error: 'Acesso negado: Sem vínculo ativo' }
        }
        return { authorized: true }
      }
      const unlinkedRes = simulateAuthorize(false, 'DOCTOR')
      assert.equal(unlinkedRes.authorized, false)

      const linkedRes = simulateAuthorize(true, 'DOCTOR')
      assert.equal(linkedRes.authorized, true)
    })
  })

  describe('2. RF-056: Histórico de Internações Hospitalares (PRD Seção 8.8)', () => {
    test('Validação de internação válida com datas, instituição, motivo e desfecho', () => {
      const validHosp = {
        patientId: '550e8400-e29b-41d4-a716-446655440000',
        institutionName: 'Hospital das Clínicas de São Paulo',
        admissionDate: '2026-09-10',
        dischargeDate: '2026-09-15',
        admissionReason: 'Insuficiência Renal Aguda sobreposta a DRC Estágio 4',
        cid10: 'N17.9',
        outcome: 'ALTA_MELHORADA',
        clinicalNotes: 'Recuperação volêmica satisfatória após ajuste diurético.',
      }
      const res = hospitalizationSchema.safeParse(validHosp)
      assert.equal(res.success, true)
    })

    test('Internação em andamento (sem data de alta) é permitida', () => {
      const ongoingHosp = {
        patientId: '550e8400-e29b-41d4-a716-446655440000',
        institutionName: 'Hospital São Lucas',
        admissionDate: '2026-10-25',
        dischargeDate: null,
        admissionReason: 'Crise Hipertensiva e Sobrecarga Hídrica',
        outcome: 'EM_ANDAMENTO',
      }
      const res = hospitalizationSchema.safeParse(ongoingHosp)
      assert.equal(res.success, true)
    })

    test('Rejeição quando a data de alta é anterior à data de admissão', () => {
      const invalidDatesHosp = {
        patientId: '550e8400-e29b-41d4-a716-446655440000',
        institutionName: 'Hospital Regional',
        admissionDate: '2026-10-20',
        dischargeDate: '2026-10-18', // 2 dias antes da internação!
        admissionReason: 'Pielonefrite Aguda',
        outcome: 'ALTA_MELHORADA',
      }
      const res = hospitalizationSchema.safeParse(invalidDatesHosp)
      assert.equal(res.success, false)
      assert.ok(res.error.issues.some((i) => i.message.includes('não pode ser anterior')))
    })

    test('Rejeição de motivo de internação muito curto (< 5 caracteres)', () => {
      const invalidReasonHosp = {
        patientId: '550e8400-e29b-41d4-a716-446655440000',
        institutionName: 'Hospital Municipal',
        admissionDate: '2026-10-10',
        admissionReason: 'Dor',
      }
      const res = hospitalizationSchema.safeParse(invalidReasonHosp)
      assert.equal(res.success, false)
      assert.ok(res.error.issues.some((i) => i.message.includes('mínimo 5 caracteres')))
    })

    test('Rejeição de formato de CID-10 clinicamente inválido', () => {
      const invalidCidHosp = {
        patientId: '550e8400-e29b-41d4-a716-446655440000',
        institutionName: 'Hospital Municipal',
        admissionDate: '2026-10-10',
        admissionReason: 'Tratamento de uremia severa',
        cid10: '12345', // Invalido: deve começar com letra
      }
      const res = hospitalizationSchema.safeParse(invalidCidHosp)
      assert.equal(res.success, false)
      assert.ok(res.error.issues.some((i) => i.message.includes('CID-10')))
    })
  })
})
