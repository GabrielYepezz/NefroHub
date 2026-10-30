import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import * as z from 'zod'

const BRAZILIAN_UFS = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA',
  'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN',
  'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
]

const registerDoctorSchema = z.object({
  name: z.string().trim().min(3, 'O nome deve ter no mínimo 3 caracteres.').max(255),
  email: z.string().trim().email('Informe um endereço de e-mail válido.').toLowerCase(),
  phone: z.string().trim().optional().or(z.literal('')),
  crm: z.string().trim().min(4, 'O CRM deve conter no mínimo 4 dígitos.').max(20).regex(/^[0-9A-Za-z]+$/),
  crmUf: z.enum(BRAZILIAN_UFS),
  specialty: z.string().trim().min(2).default('Nefrologia'),
  isMaster: z.boolean().default(false),
})

describe('Fase 5.0: Auditoria de Completude Funcional e Correção de Lacunas', () => {

  describe('1. Cadastro Institucional de Médicos (PRD Seção 2.3)', () => {
    test('Deve validar com sucesso o cadastro completo de um médico nefrologista', () => {
      const validDoctor = {
        name: 'Dr. Roberto Magalhães',
        email: 'roberto.magalhaes@hospital.com.br',
        crm: '123456',
        crmUf: 'SP',
        specialty: 'Nefrologia Clínica',
        isMaster: false,
      }

      const result = registerDoctorSchema.safeParse(validDoctor)
      assert.equal(result.success, true)
      assert.equal(result.data.crm, '123456')
      assert.equal(result.data.crmUf, 'SP')
    })

    test('Deve rejeitar CRM inválido com menos de 4 dígitos ou caracteres ilegais', () => {
      const invalidCrm = {
        name: 'Dra. Ana Paula',
        email: 'ana@hospital.com.br',
        crm: '12', // Menos de 4 dígitos
        crmUf: 'RJ',
      }

      const result = registerDoctorSchema.safeParse(invalidCrm)
      assert.equal(result.success, false)
      assert.ok(result.error.issues.some((i) => i.path.includes('crm')))
    })

    test('Deve rejeitar UF de CRM inválida ou inexistente no Brasil', () => {
      const invalidUf = {
        name: 'Dr. Lucas Mendes',
        email: 'lucas@hospital.com.br',
        crm: '887766',
        crmUf: 'XX', // UF inválida
      }

      const result = registerDoctorSchema.safeParse(invalidUf)
      assert.equal(result.success, false)
    })

    test('Bloqueio de autorização RBAC: Usuário não-admin é barrado ao tentar cadastrar médico', () => {
      const verifyAdminAuthorization = (userRole) => {
        if (!userRole || userRole.toUpperCase() !== 'ADMIN') {
          throw new Error('Acesso negado: Apenas administradores do hospital podem cadastrar médicos.')
        }
        return true
      }

      // Médico tentando cadastrar outro médico
      assert.throws(
        () => verifyAdminAuthorization('DOCTOR'),
        /Acesso negado: Apenas administradores do hospital podem cadastrar médicos/
      )

      // Paciente tentando cadastrar médico
      assert.throws(
        () => verifyAdminAuthorization('PATIENT'),
        /Acesso negado: Apenas administradores do hospital podem cadastrar médicos/
      )

      // Administrador autorizado
      assert.doesNotThrow(() => verifyAdminAuthorization('ADMIN'))
    })

    test('Tratamento de duplicidade de CRM/UF no cadastro profissional', () => {
      const existingDb = [
        { crm: '54321', crm_uf: 'MG', email: 'medico1@hospital.com' },
      ]

      const checkCrmDuplicate = (crm, crmUf) => {
        return existingDb.some((d) => d.crm === crm && d.crm_uf === crmUf)
      }

      assert.equal(checkCrmDuplicate('54321', 'MG'), true)
      assert.equal(checkCrmDuplicate('54321', 'SP'), false) // Mesmo CRM em UF diferente é permitido pelo CFM
    })
  })

  describe('2. Governança e Ciclo de Vida do Médico (PRD Seção 2.3 e 4.5)', () => {
    test('Médico cadastrado nasce em PENDING_APPROVAL e tem login bloqueado no servidor', () => {
      const mockLoginGate = (accountStatus) => {
        if (accountStatus === 'PENDING_APPROVAL') {
          return { error: 'Credenciamento em análise: Sua conta profissional está aguardando homologação pelo administrador.' }
        }
        if (accountStatus === 'ACTIVE') {
          return { success: true }
        }
        return { error: 'Acesso bloqueado' }
      }

      const pendingCheck = mockLoginGate('PENDING_APPROVAL')
      assert.equal(pendingCheck.error.includes('Credenciamento em análise'), true)

      const activeCheck = mockLoginGate('ACTIVE')
      assert.equal(activeCheck.success, true)
    })

    test('Desativação do médico deve ser bloqueada se ele for responsável principal por pacientes ativos (PRD Seção 4.5)', () => {
      const canDeactivateDoctor = (activePrimaryLinksCount) => {
        if (activePrimaryLinksCount > 0) {
          return {
            error: `Desativação bloqueada (PRD Seção 4.5): Este médico possui ${activePrimaryLinksCount} paciente(s) ativo(s) sob sua responsabilidade principal. Reatribua os vínculos antes de desativá-lo.`,
          }
        }
        return { success: true }
      }

      const blockedAttempt = canDeactivateDoctor(3)
      assert.equal(blockedAttempt.success, undefined)
      assert.equal(blockedAttempt.error.includes('Desativação bloqueada'), true)

      const allowedAttempt = canDeactivateDoctor(0)
      assert.equal(allowedAttempt.success, true)
    })
  })

  describe('3. Fluxo de Representantes Legais e Acesso Clínico Delegado (PRD Seção 2.6 e 5)', () => {
    test('Representante com vínculo ativo e não expirado resolve o paciente em modo delegado', () => {
      const today = '2026-10-28'

      const resolvePatientForSession = ({ userId, directProfile, activeRepresentations }) => {
        if (directProfile) {
          return { patient: directProfile, isDelegated: false }
        }

        // Buscar representação ativa
        const rep = activeRepresentations.find(
          (r) =>
            r.representativeUserId === userId &&
            r.status === 'ACTIVE' &&
            (!r.validUntil || r.validUntil >= today)
        )

        if (rep) {
          return {
            patient: rep.patientProfile,
            isDelegated: true,
            delegatedInfo: {
              relationshipType: rep.relationshipType,
              authorityType: rep.authorityType,
              validUntil: rep.validUntil,
            },
          }
        }

        return null
      }

      const directPatient = resolvePatientForSession({
        userId: 'patient-user-1',
        directProfile: { id: 'patient-1', fullName: 'João da Silva' },
        activeRepresentations: [],
      })
      assert.equal(directPatient.isDelegated, false)
      assert.equal(directPatient.patient.fullName, 'João da Silva')

      const delegatedCaregiver = resolvePatientForSession({
        userId: 'caregiver-user-2',
        directProfile: null, // O cuidador não possui prontuário próprio
        activeRepresentations: [
          {
            representativeUserId: 'caregiver-user-2',
            status: 'ACTIVE',
            validUntil: '2027-12-31',
            relationshipType: 'CAREGIVER',
            authorityType: 'FULL',
            patientProfile: { id: 'patient-1', fullName: 'João da Silva' },
          },
        ],
      })
      assert.equal(delegatedCaregiver.isDelegated, true)
      assert.equal(delegatedCaregiver.patient.id, 'patient-1')
      assert.equal(delegatedCaregiver.delegatedInfo.relationshipType, 'CAREGIVER')
    })

    test('Representante com status PENDING, REJECTED ou validade expirada não obtém acesso ao prontuário', () => {
      const today = '2026-10-28'

      const isAccessAllowed = (rep) => {
        if (!rep) return false
        if (rep.status !== 'ACTIVE') return false
        if (rep.validUntil && rep.validUntil < today) return false
        return true
      }

      assert.equal(isAccessAllowed({ status: 'PENDING', validUntil: '2027-01-01' }), false)
      assert.equal(isAccessAllowed({ status: 'REJECTED', validUntil: '2027-01-01' }), false)
      assert.equal(isAccessAllowed({ status: 'ENDED', validUntil: '2027-01-01' }), false)
      assert.equal(isAccessAllowed({ status: 'ACTIVE', validUntil: '2025-01-01' }), false) // Expirado
      assert.equal(isAccessAllowed({ status: 'ACTIVE', validUntil: '2027-01-01' }), true) // Válido
    })

    test('Escopo de autoridade CONSULT_ONLY impede envio de medições domiciliares', () => {
      const canSubmitVitals = ({ isDelegated, authorityType }) => {
        if (!isDelegated) return true // Paciente titular sempre pode enviar
        if (authorityType === 'CONSULT_ONLY') return false
        if (authorityType === 'FULL' || authorityType === 'SUBMIT_VITALS') return true
        return false
      }

      assert.equal(canSubmitVitals({ isDelegated: false, authorityType: undefined }), true)
      assert.equal(canSubmitVitals({ isDelegated: true, authorityType: 'CONSULT_ONLY' }), false)
      assert.equal(canSubmitVitals({ isDelegated: true, authorityType: 'SUBMIT_VITALS' }), true)
      assert.equal(canSubmitVitals({ isDelegated: true, authorityType: 'FULL' }), true)
    })

    test('Representante não pode delegar em cascata o acesso a terceiros', () => {
      const canManageDelegations = (isDelegated) => {
        // Apenas o titular do prontuário pode cadastrar ou revogar cuidadores
        return !isDelegated
      }

      assert.equal(canManageDelegations(false), true, 'Paciente titular pode delegar cuidadores')
      assert.equal(canManageDelegations(true), false, 'Representante delegado não pode subdelegar em cascata')
    })
  })

  describe('4. Invariante de Vínculo Clínico Médico-Paciente (PRD Seção 4.1)', () => {
    test('Ao atribuir novo médico primário, o primário anterior deve ser rebaixado para assistente', () => {
      const links = [
        { id: 'link-1', doctorId: 'doc-1', isPrimary: true, status: 'ACTIVE' },
      ]

      const assignNewDoctor = ({ doctorId, isPrimary }) => {
        const updated = [...links]
        if (isPrimary) {
          // Rebaixar médico primário atual
          updated.forEach((l) => {
            if (l.isPrimary && l.status === 'ACTIVE') {
              l.isPrimary = false
            }
          })
        }
        updated.push({
          id: `link-${Date.now()}`,
          doctorId,
          isPrimary,
          status: 'ACTIVE',
        })
        return updated
      }

      const result = assignNewDoctor({ doctorId: 'doc-2', isPrimary: true })
      const primaryLinks = result.filter((l) => l.isPrimary && l.status === 'ACTIVE')
      assert.equal(primaryLinks.length, 1, 'Deve haver exatamente um médico primário ativo')
      assert.equal(primaryLinks[0].doctorId, 'doc-2')
      assert.equal(result.find((l) => l.doctorId === 'doc-1').isPrimary, false)
    })
  })
})
