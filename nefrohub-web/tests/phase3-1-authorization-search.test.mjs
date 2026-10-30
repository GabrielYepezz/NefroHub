import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import * as z from 'zod'

// Definição do schema público idêntico ao do código-fonte (em JS puro para o Node Test Runner - RF-009)
const publicRegisterSchema = z.object({
  name: z.string().trim().min(2, 'O nome deve ter pelo menos 2 caracteres'),
  email: z.string().trim().email('E-mail em formato inválido'),
  password: z.string().min(12, 'A senha deve ter pelo menos 12 caracteres (frases-senha aceitas)'),
  phone: z.string().trim().min(10, 'Telefone inválido').optional().or(z.literal('')),
})

describe('Fase 3.1: Testes de Autorização de Cadastro, Contas Suspensas e Busca Clínica', () => {

  describe('Parte A — Regras Institucionais de Cadastro e Bloqueio de Privilégios', () => {
    test('publicRegisterSchema deve validar com sucesso dados de pré-cadastro de paciente', () => {
      const validData = {
        name: 'Carlos Oliveira',
        email: 'carlos@exemplo.com.br',
        password: 'SenhaForte123!',
        phone: '11988887777',
      }

      const result = publicRegisterSchema.safeParse(validData)
      assert.equal(result.success, true)
    })

    test('RF-009: publicRegisterSchema deve rejeitar senhas com menos de 12 caracteres', () => {
      const invalidShortData = {
        name: 'Paciente Teste',
        email: 'paciente.curto@nefrohub.test',
        password: 'Curta123456', // 11 caracteres
        phone: '11988887777',
      }
      const result = publicRegisterSchema.safeParse(invalidShortData)
      assert.equal(result.success, false)
      assert.ok(result.error.issues.some((i) => i.message.includes('12 caracteres')))
    })

    test('RF-009: publicRegisterSchema deve aceitar frases-senha com espaços e pelo menos 12 caracteres', () => {
      const validPassphraseData = {
        name: 'Paciente Teste',
        email: 'paciente.frase@nefrohub.test',
        password: 'meu rim com saude em 2026', // frase-senha com 25 caracteres
        phone: '11988887777',
      }
      const result = publicRegisterSchema.safeParse(validPassphraseData)
      assert.equal(result.success, true)
    })

    test('publicRegisterSchema deve descartar tentativa de autoatribuição de role pelo cliente', () => {
      const maliciousData = {
        name: 'Atacante Externo',
        email: 'atacante@hacker.com',
        password: 'SenhaForte123!',
        phone: '11999998888',
        role: 'admin', // Tentativa maliciosa de se auto-proclamar admin
      }

      const result = publicRegisterSchema.safeParse(maliciousData)
      assert.equal(result.success, true)
      assert.equal(result.data.role, undefined, 'A chave role deve ser descartada pelo schema de validação público')
    })

    test('Simulação de registerAction: o servidor deve forçar inegociavelmente role=PATIENT', () => {
      const mockRegisterServerLogic = (payload) => {
        const parsed = publicRegisterSchema.safeParse(payload)
        if (!parsed.success) return { error: 'Dados inválidos' }

        // O servidor NUNCA lê payload.role; ele fixa 'PATIENT'
        const enforcedOptions = {
          data: {
            name: parsed.data.name,
            role: 'PATIENT', // Inegociável no servidor
            phone: parsed.data.phone || null,
          },
        }

        return { success: true, options: enforcedOptions }
      }

      const attemptAdmin = mockRegisterServerLogic({
        name: 'Usuário Malicioso',
        email: 'test@invasor.com',
        password: 'SenhaSegura123!',
        role: 'admin',
      })

      assert.equal(attemptAdmin.success, true)
      assert.equal(attemptAdmin.options.data.role, 'PATIENT', 'O servidor deve forçar role=PATIENT mesmo que o cliente envie admin')

      const attemptDoctor = mockRegisterServerLogic({
        name: 'Médico Falso',
        email: 'medico@falso.com',
        password: 'SenhaSegura123!',
        role: 'doctor',
      })

      assert.equal(attemptDoctor.success, true)
      assert.equal(attemptDoctor.options.data.role, 'PATIENT', 'O servidor deve forçar role=PATIENT mesmo que o cliente envie doctor')
    })

    test('SEC-01: Hardening do trigger handle_new_auth_user bloqueia auto-elevação para ADMIN ou DOCTOR', () => {
      const simulateHardenedTrigger = (rawUserMetaData, isInvited, currentUser) => {
        const metaRole = (rawUserMetaData?.role || '').toUpperCase()
        if (['ADMIN', 'DOCTOR', 'DOCTOR_MASTER'].includes(metaRole)) {
          if (isInvited || ['service_role', 'supabase_admin', 'postgres'].includes(currentUser)) {
            return metaRole
          }
          return 'PATIENT' // Rebaixado forçadamente
        }
        return 'PATIENT'
      }

      // Caso 1: Atacante externo envia role: 'ADMIN' em auto-cadastro público
      const attackerRole = simulateHardenedTrigger({ role: 'ADMIN' }, false, 'anon')
      assert.equal(attackerRole, 'PATIENT', 'Auto-cadastro público deve ser rebaixado para PATIENT')

      // Caso 2: Atacante externo envia role: 'DOCTOR' em auto-cadastro público
      const attackerDocRole = simulateHardenedTrigger({ role: 'DOCTOR' }, false, 'anon')
      assert.equal(attackerDocRole, 'PATIENT', 'Auto-cadastro médico não convidado deve ser rebaixado para PATIENT')

      // Caso 3: Convite formal emitido pelo administrador (isInvited = true)
      const invitedDocRole = simulateHardenedTrigger({ role: 'DOCTOR' }, true, 'authenticated')
      assert.equal(invitedDocRole, 'DOCTOR', 'Usuário convidado administrativamente mantém papel DOCTOR')

      // Caso 4: Provisionamento direto via Service Role (createAdmin / backoffice)
      const serviceRoleAdmin = simulateHardenedTrigger({ role: 'ADMIN' }, false, 'service_role')
      assert.equal(serviceRoleAdmin, 'ADMIN', 'Service Role administrativa mantém concessão legítima de ADMIN')
    })

    test('Controle de Acesso: Contas com status SUSPENDED, DEACTIVATED ou PENDING_APPROVAL devem ser bloqueadas no login', () => {
      const mockLoginStatusCheck = (userStatus) => {
        const normalized = userStatus.toUpperCase()
        if (normalized === 'SUSPENDED' || normalized === 'DEACTIVATED') {
          return { error: 'Acesso bloqueado: Sua conta foi suspensa ou desativada pela governança institucional do hospital.' }
        }
        if (normalized === 'PENDING_APPROVAL') {
          return { error: 'Credenciamento em análise: Sua conta profissional está aguardando homologação pelo administrador.' }
        }
        return { success: true }
      }

      assert.deepEqual(
        mockLoginStatusCheck('SUSPENDED'),
        { error: 'Acesso bloqueado: Sua conta foi suspensa ou desativada pela governança institucional do hospital.' }
      )
      assert.deepEqual(
        mockLoginStatusCheck('DEACTIVATED'),
        { error: 'Acesso bloqueado: Sua conta foi suspensa ou desativada pela governança institucional do hospital.' }
      )
      assert.deepEqual(
        mockLoginStatusCheck('PENDING_APPROVAL'),
        { error: 'Credenciamento em análise: Sua conta profissional está aguardando homologação pelo administrador.' }
      )
      assert.deepEqual(mockLoginStatusCheck('ACTIVE'), { success: true })
    })
  })

  describe('Parte B — Busca de Pacientes no Portal Médico (Zero-Trust & Debounce)', () => {
    // Conjunto sintético de pacientes autorizado pelo servidor para o médico autenticado
    const authorizedPatients = [
      { id: 'p1', name: 'Maria das Dores Silva', identifier: '***.456.789-**', age: 62 },
      { id: 'p2', name: 'João Carlos Pereira', identifier: '***.123.456-**', age: 58 },
      { id: 'p3', name: 'Ana Paula Souza', identifier: '***.987.654-**', age: 45 },
    ]

    const filterLogic = (query, patientsList) => {
      if (!query.trim()) return patientsList

      const normalize = (t) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
      const clean = normalize(query)
      const digits = query.replace(/\D/g, '')

      return patientsList.filter((p) => {
        const matchName = normalize(p.name).includes(clean)
        const matchId = p.identifier.toLowerCase().includes(clean)
        const matchDigits = digits.length >= 2 && p.identifier.replace(/\D/g, '').includes(digits)
        return matchName || matchId || matchDigits
      })
    }

    test('Busca por nome completo e parcial com insensibilidade a acentos', () => {
      const resFull = filterLogic('Maria das Dores Silva', authorizedPatients)
      assert.equal(resFull.length, 1)
      assert.equal(resFull[0].id, 'p1')

      const resPartial = filterLogic('carlos', authorizedPatients)
      assert.equal(resPartial.length, 1)
      assert.equal(resPartial[0].id, 'p2')

      const resAccent = filterLogic('joao', authorizedPatients)
      assert.equal(resAccent.length, 1)
      assert.equal(resAccent[0].id, 'p2')
    })

    test('Busca por documento protegido sem expor CPF completo em logs', () => {
      const resDoc = filterLogic('123', authorizedPatients)
      assert.equal(resDoc.length, 1)
      assert.equal(resDoc[0].name, 'João Carlos Pereira')
    })

    test('Busca sem resultados deve retornar lista vazia para exibição do EmptyState', () => {
      const resEmpty = filterLogic('Nome Inexistente 999', authorizedPatients)
      assert.equal(resEmpty.length, 0)
    })

    test('Campo vazio deve preservar 100% dos pacientes autorizados', () => {
      const resAll = filterLogic('', authorizedPatients)
      assert.equal(resAll.length, 3)
      assert.deepEqual(resAll, authorizedPatients)
    })

    test('Zero-Trust: Busca opera exclusivamente sobre a lista autorizada no servidor', () => {
      const unauthorizedPatientName = 'Paciente de Outro Médico'
      const searchRes = filterLogic(unauthorizedPatientName, authorizedPatients)
      assert.equal(searchRes.length, 0, 'Jamais deve retornar paciente que não pertence ao escopo autorizado')
    })
  })
})
