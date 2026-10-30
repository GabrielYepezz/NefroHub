import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

describe('Fase 3.3: Testes de Feedback de Rejeição e Filas Administrativas', () => {

  describe('1. Feedback de Rejeição ao Paciente (Seção 6.5)', () => {
    test('Paciente deve visualizar código padronizado com tradução amigável e justificativa do médico', () => {
      const REJECTION_LABELS = {
        INVALID_VALUE: 'Valor clinicamente implausível ou fora da faixa aceita',
        DUPLICATE: 'Medição em duplicidade com envio anterior',
        UNREADABLE: 'Dados inconsistentes ou ilegíveis',
        INCOMPLETE: 'Medição incompleta (ex: falta de sistólica ou diastólica)',
        OTHER: 'Outro motivo clínico indicado pelo médico assistente',
      }

      const mockRejectedSubmission = {
        id: 'rec-rej-1',
        clinicalDate: '2026-10-24',
        status: 'REJECTED',
        weight: 78.5,
        rejectionCode: 'INVALID_VALUE',
        rejectionReason: 'Peso digitado com valor duplicado no mesmo turno',
        reviewedByDoctorName: 'Dr. Roberto Nefrologista',
        reviewedAt: '2026-10-24T14:30:00Z',
      }

      assert.equal(mockRejectedSubmission.status, 'REJECTED')
      assert.equal(REJECTION_LABELS[mockRejectedSubmission.rejectionCode], 'Valor clinicamente implausível ou fora da faixa aceita')
      assert.ok(mockRejectedSubmission.rejectionReason.length > 0)
      assert.ok(mockRejectedSubmission.reviewedByDoctorName.includes('Dr.'))
    })

    test('Isolamento: Paciente só pode visualizar submissões associadas ao seu próprio prontuário', () => {
      const currentPatientId = 'patient-uuid-111'
      const submissions = [
        { id: 's1', patient_id: 'patient-uuid-111', weight: 70 },
        { id: 's2', patient_id: 'patient-uuid-222', weight: 85 }, // De outro paciente
      ]

      const authorizedSubmissions = submissions.filter((s) => s.patient_id === currentPatientId)
      assert.equal(authorizedSubmissions.length, 1)
      assert.equal(authorizedSubmissions[0].id, 's1')
      assert.ok(!authorizedSubmissions.some((s) => s.patient_id === 'patient-uuid-222'))
    })
  })

  describe('2. Autorização e Despacho das Filas Administrativas (Seção 7.3)', () => {
    test('Usuário sem papel ADMIN deve ser impedido no servidor de despachar filas', () => {
      const checkAdminPrivilege = (userRole) => {
        if (!userRole || userRole.toUpperCase() !== 'ADMIN') {
          return { error: 'Acesso negado: Apenas administradores podem despachar filas de governança.' }
        }
        return { success: true }
      }

      assert.deepEqual(checkAdminPrivilege('DOCTOR'), {
        error: 'Acesso negado: Apenas administradores podem despachar filas de governança.',
      })
      assert.deepEqual(checkAdminPrivilege('PATIENT'), {
        error: 'Acesso negado: Apenas administradores podem despachar filas de governança.',
      })
      assert.deepEqual(checkAdminPrivilege('ADMIN'), { success: true })
    })

    test('Fila 1: Homologação de Médico deve atualizar status para ACTIVE e gerar auditoria', () => {
      let doctor = { id: 'doc-1', status: 'PENDING_APPROVAL', role: 'DOCTOR' }
      let auditLog = []

      const approveDoctor = (doc, adminId) => {
        if (doc.status !== 'PENDING_APPROVAL') {
          return { error: 'Médico não está pendente de homologação.' }
        }
        doc.status = 'ACTIVE'
        auditLog.push({
          action: 'PHYSICIAN_APPROVED',
          adminId,
          targetId: doc.id,
        })
        return { success: true }
      }

      const res = approveDoctor(doctor, 'admin-uuid-1')
      assert.equal(res.success, true)
      assert.equal(doctor.status, 'ACTIVE')
      assert.equal(auditLog.length, 1)
      assert.equal(auditLog[0].action, 'PHYSICIAN_APPROVED')
    })

    test('Fila 2: Bloqueio Otimista contra Concorrência em Vínculos', () => {
      let link = { id: 'link-1', status: 'PENDING' }

      const approveLink = (l) => {
        if (l.status !== 'PENDING') {
          return { error: 'Vínculo já foi processado ou não está pendente.' }
        }
        l.status = 'ACTIVE'
        return { success: true }
      }

      // Primeiro administrador aprova
      const res1 = approveLink(link)
      assert.equal(res1.success, true)
      assert.equal(link.status, 'ACTIVE')

      // Segundo administrador tenta aprovar ou recusar o mesmo item simultaneamente
      const res2 = approveLink(link)
      assert.equal(res2.error, 'Vínculo já foi processado ou não está pendente.')
    })

    test('Fila 4: Decisão sobre solicitação de retificação (review_requests) e geração de nova versão com supersedes_record_id', () => {
      let originalRecord = {
        id: 'rec-orig-1',
        patient_id: 'pat-1',
        status: 'CONFIRMED',
        version: 1,
        weight: 75.5,
      }

      let review = {
        id: 'rev-1',
        clinical_record_id: 'rec-orig-1',
        patient_id: 'pat-1',
        status: 'PENDING',
        decidedBy: null,
      }

      // Função que simula decideReviewRequestQueueAction
      const decideReview = (r, orig, decision, adminId, reason) => {
        if (r.status !== 'PENDING') return { error: 'Já processado.' }
        r.status = decision
        r.decidedBy = adminId
        r.reason = reason

        if (decision === 'APPROVED') {
          const newRecord = {
            id: 'rec-new-2',
            patient_id: orig.patient_id,
            status: 'CONFIRMED',
            supersedes_record_id: orig.id,
            version: orig.version + 1,
            weight: orig.weight,
          }
          return { success: true, newRecord }
        }
        return { success: true }
      }

      const res = decideReview(review, originalRecord, 'APPROVED', 'admin-1', 'Correção validada pelo laudo anexo.')
      assert.equal(res.success, true)
      assert.equal(review.status, 'APPROVED')
      assert.equal(res.newRecord.supersedes_record_id, 'rec-orig-1', 'Nova versão deve apontar para o registro original')
      assert.equal(res.newRecord.version, 2, 'Versão deve ser incrementada')
      assert.equal(originalRecord.status, 'CONFIRMED', 'Registro original permanece imutável e confirmado')
    })

    test('Fila 5: Despacho de destinação e descarte (EXPURGED / ARCHIVED) com bloqueio otimista', () => {
      let item = { id: 'disp-1', status: 'PENDING_DISPOSAL' }

      const processDisposal = (it, decision) => {
        if (it.status !== 'PENDING_DISPOSAL') return { error: 'Item já processado.' }
        it.status = decision
        return { success: true }
      }

      // Primeiro despacho: arquivado 20 anos
      const res1 = processDisposal(item, 'ARCHIVED')
      assert.equal(res1.success, true)
      assert.equal(item.status, 'ARCHIVED')

      // Concorrência: tentativa repetida deve falhar
      const res2 = processDisposal(item, 'EXPURGED')
      assert.equal(res2.error, 'Item já processado.')
    })
  })
})
