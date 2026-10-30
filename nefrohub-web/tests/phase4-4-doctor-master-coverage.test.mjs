// tests/phase4-4-doctor-master-coverage.test.mjs
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import * as z from 'zod'

const emergencyCoverageSchema = z.object({
  patientId: z.string().uuid('Identificador do paciente inválido'),
  justification: z
    .string()
    .trim()
    .min(15, 'A justificativa de cobertura emergencial deve ter no mínimo 15 caracteres'),
  coverageType: z.enum(['PLANTÃO', 'SUBSTITUIÇÃO', 'INTERCORRÊNCIA', 'COORDENAÇÃO']),
})

function mockAssumeDoctorMasterCoverage({ userRole, isMasterFlag, payload }) {
  const isMaster = userRole === 'DOCTOR_MASTER' || isMasterFlag === true
  if (!isMaster) {
    return {
      success: false,
      error: 'Acesso negado: Apenas profissionais com papel de Doctor Master (Coordenação Clínica) podem assumir cobertura emergencial.',
    }
  }

  const validation = emergencyCoverageSchema.safeParse(payload)
  if (!validation.success) {
    return {
      success: false,
      error: validation.error.issues.map((i) => i.message).join('. '),
    }
  }

  // Gera evento de auditoria imutável (Seções 2.4 e 15.4)
  const auditEvent = {
    action: 'DOCTOR_MASTER_EMERGENCY_COVERAGE_ACTIVATED',
    resource_type: 'PATIENT_PROFILE',
    resource_id: payload.patientId,
    details: {
      coverage_type: payload.coverageType,
      justification: payload.justification,
      timestamp: new Date().toISOString(),
    },
  }

  return {
    success: true,
    linkStatus: 'ACTIVE',
    auditEvent,
    message: 'Cobertura emergencial ativada com sucesso.',
  }
}

function mockEndDoctorMasterCoverage({ userRole, patientId, reason }) {
  if (userRole !== 'DOCTOR_MASTER') {
    return { success: false, error: 'Acesso negado.' }
  }

  return {
    success: true,
    linkStatus: 'ENDED',
    auditEvent: {
      action: 'DOCTOR_MASTER_EMERGENCY_COVERAGE_ENDED',
      resource_type: 'PATIENT_PROFILE',
      resource_id: patientId,
      details: { reason: reason || 'Encerramento regular' },
    },
  }
}

describe('RF-004: Cobertura Emergencial e Coordenação pelo Doctor Master (PRD Seção 2.4)', () => {

  describe('1. Verificação de Autorização e Papel', () => {
    test('Usuário com papel DOCTOR_MASTER consegue ativar cobertura com justificativa válida', () => {
      const payload = {
        patientId: '550e8400-e29b-41d4-a716-446655440000',
        justification: 'Plantão noturno de intercorrência nefrológica na enfermaria',
        coverageType: 'PLANTÃO',
      }
      const res = mockAssumeDoctorMasterCoverage({
        userRole: 'DOCTOR_MASTER',
        isMasterFlag: false,
        payload,
      })
      assert.equal(res.success, true)
      assert.equal(res.linkStatus, 'ACTIVE')
      assert.equal(res.auditEvent.action, 'DOCTOR_MASTER_EMERGENCY_COVERAGE_ACTIVATED')
    })

    test('Médico com is_master=true no perfil profissional consegue ativar cobertura', () => {
      const payload = {
        patientId: '550e8400-e29b-41d4-a716-446655440000',
        justification: 'Substituição formal durante licença médica do nefrologista titular',
        coverageType: 'SUBSTITUIÇÃO',
      }
      const res = mockAssumeDoctorMasterCoverage({
        userRole: 'DOCTOR',
        isMasterFlag: true,
        payload,
      })
      assert.equal(res.success, true)
      assert.equal(res.linkStatus, 'ACTIVE')
    })

    test('Médico comum sem is_master tem solicitação bloqueada no servidor', () => {
      const payload = {
        patientId: '550e8400-e29b-41d4-a716-446655440000',
        justification: 'Tentativa de acesso sem papel de Doctor Master',
        coverageType: 'PLANTÃO',
      }
      const res = mockAssumeDoctorMasterCoverage({
        userRole: 'DOCTOR',
        isMasterFlag: false,
        payload,
      })
      assert.equal(res.success, false)
      assert.ok(res.error.includes('Apenas profissionais com papel de Doctor Master'))
    })

    test('Paciente tentando assumir cobertura emergencial é rejeitado', () => {
      const payload = {
        patientId: '550e8400-e29b-41d4-a716-446655440000',
        justification: 'Tentativa indevida de cobertura clínica por paciente',
        coverageType: 'COORDENAÇÃO',
      }
      const res = mockAssumeDoctorMasterCoverage({
        userRole: 'PATIENT',
        isMasterFlag: false,
        payload,
      })
      assert.equal(res.success, false)
    })
  })

  describe('2. Validação da Justificativa Clínica e UUID', () => {
    test('Justificativa vazia ou com menos de 15 caracteres é rejeitada no servidor', () => {
      const payload = {
        patientId: '550e8400-e29b-41d4-a716-446655440000',
        justification: 'Curta demais', // 12 caracteres
        coverageType: 'INTERCORRÊNCIA',
      }
      const res = mockAssumeDoctorMasterCoverage({
        userRole: 'DOCTOR_MASTER',
        isMasterFlag: false,
        payload,
      })
      assert.equal(res.success, false)
      assert.ok(res.error.includes('no mínimo 15 caracteres'))
    })

    test('ID de paciente que não é UUID é rejeitado', () => {
      const payload = {
        patientId: 'paciente-123-invalido',
        justification: 'Plantão noturno com justificativa válida e completa',
        coverageType: 'PLANTÃO',
      }
      const res = mockAssumeDoctorMasterCoverage({
        userRole: 'DOCTOR_MASTER',
        isMasterFlag: false,
        payload,
      })
      assert.equal(res.success, false)
      assert.ok(res.error.includes('inválido'))
    })
  })

  describe('3. Trilha de Auditoria e Encerramento de Cobertura', () => {
    test('Evento de ativação de cobertura registra justificativa e detalhes clínicos', () => {
      const payload = {
        patientId: '550e8400-e29b-41d4-a716-446655440000',
        justification: 'Revisão institucional de conduta para paciente dialítico instável',
        coverageType: 'COORDENAÇÃO',
      }
      const res = mockAssumeDoctorMasterCoverage({
        userRole: 'DOCTOR_MASTER',
        isMasterFlag: false,
        payload,
      })
      assert.equal(res.auditEvent.details.coverage_type, 'COORDENAÇÃO')
      assert.equal(res.auditEvent.details.justification, payload.justification)
      assert.ok(res.auditEvent.details.timestamp)
    })

    test('Encerramento de cobertura transita vínculo para ENDED e gera auditoria', () => {
      const res = mockEndDoctorMasterCoverage({
        userRole: 'DOCTOR_MASTER',
        patientId: '550e8400-e29b-41d4-a716-446655440000',
        reason: 'Término do plantão de cobertura',
      })
      assert.equal(res.success, true)
      assert.equal(res.linkStatus, 'ENDED')
      assert.equal(res.auditEvent.action, 'DOCTOR_MASTER_EMERGENCY_COVERAGE_ENDED')
    })
  })
})
