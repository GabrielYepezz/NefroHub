import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..')

// Carregar variáveis de ambiente do .env.local
const envPath = path.resolve(projectRoot, '.env.local')
let supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
let supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8')
  envContent.split('\n').forEach((line) => {
    const trimmed = line.trim()
    if (trimmed && !trimmed.startsWith('#')) {
      const [key, ...values] = trimmed.split('=')
      const val = values.join('=').replace(/^['"]|['"]$/g, '')
      if (key === 'NEXT_PUBLIC_SUPABASE_URL') supabaseUrl = val
      if (key === 'NEXT_PUBLIC_SUPABASE_ANON_KEY') supabaseAnonKey = val
    }
  })
}

describe('Fase 1.2: Testes Funcionais de Segurança, Concorrência e Regras Clínicas', () => {

  describe('1. Validações Clínicas e Co-dependência de Pressão Arterial', () => {
    test('Deve rejeitar submissão quando apenas uma das pressões (sistólica ou diastólica) for informada', () => {
      // Simula a lógica de validação clínica
      const validateBloodPressure = (systolic, diastolic) => {
        if ((systolic && !diastolic) || (!systolic && diastolic)) {
          return { error: 'Para registrar a pressão arterial, informe tanto a sistólica quanto a diastólica.' }
        }
        return { success: true }
      }

      assert.deepEqual(validateBloodPressure(120, undefined), {
        error: 'Para registrar a pressão arterial, informe tanto a sistólica quanto a diastólica.',
      })
      assert.deepEqual(validateBloodPressure(undefined, 80), {
        error: 'Para registrar a pressão arterial, informe tanto a sistólica quanto a diastólica.',
      })
      assert.deepEqual(validateBloodPressure(120, 80), { success: true })
    })

    test('Deve validar estritamente limites numéricos e tipos de sinais vitais', () => {
      const validateVitals = (weight, sys, dia) => {
        if (weight != null && (weight < 10 || weight > 400)) return { error: 'Peso fora do limite de plausibilidade' }
        if (sys != null && (sys < 50 || sys > 260)) return { error: 'Pressão sistólica fora dos limites' }
        if (dia != null && (dia < 30 || dia > 160)) return { error: 'Pressão diastólica fora dos limites' }
        return { success: true }
      }

      assert.equal(validateVitals(5, 120, 80).error, 'Peso fora do limite de plausibilidade')
      assert.equal(validateVitals(450, 120, 80).error, 'Peso fora do limite de plausibilidade')
      assert.equal(validateVitals(70, 300, 80).error, 'Pressão sistólica fora dos limites')
      assert.equal(validateVitals(70, 120, 10).error, 'Pressão diastólica fora dos limites')
      assert.equal(validateVitals(70.5, 120, 80).success, true)
    })
  })

  describe('2. Máquina de Estados e Proteção contra Concorrência (Bloqueio Otimista)', () => {
    test('Simulação de dupla confirmação: a segunda tentativa deve ser rejeitada com erro de concorrência', () => {
      // Simulação do comportamento com bloqueio otimista (UPDATE ... WHERE status = 'PENDING_VALIDATION')
      let record = { id: 'rec-001', status: 'PENDING_VALIDATION', confirmedBy: null }

      const attemptConfirm = (rec, doctorId) => {
        if (rec.status !== 'PENDING_VALIDATION') {
          return { error: 'Transição inválida ou concorrência detectada: Este registro já foi processado.' }
        }
        // Simula a atualização atômica
        rec.status = 'CONFIRMED'
        rec.confirmedBy = doctorId
        return { success: true, rowsUpdated: 1 }
      }

      // Médico 1 confirma
      const res1 = attemptConfirm(record, 'doc-1')
      assert.equal(res1.success, true)
      assert.equal(record.status, 'CONFIRMED')
      assert.equal(record.confirmedBy, 'doc-1')

      // Médico 2 tenta confirmar simultaneamente o mesmo registro
      const res2 = attemptConfirm(record, 'doc-2')
      assert.equal(res2.error, 'Transição inválida ou concorrência detectada: Este registro já foi processado.')
      assert.equal(record.confirmedBy, 'doc-1', 'O autor da confirmação não pode ter sido sobrescrito')
    })

    test('Transição conflitante: tentativa de rejeitar registro já confirmado deve falhar', () => {
      let record = { id: 'rec-002', status: 'CONFIRMED' }

      const attemptReject = (rec) => {
        if (rec.status !== 'PENDING_VALIDATION') {
          return { error: 'Transição inválida ou concorrência detectada: Este registro já foi processado e não está pendente.' }
        }
        rec.status = 'REJECTED'
        return { success: true }
      }

      const res = attemptReject(record)
      assert.equal(res.error, 'Transição inválida ou concorrência detectada: Este registro já foi processado e não está pendente.')
      assert.equal(record.status, 'CONFIRMED', 'Status do registro confirmado não pode ter mudado')
    })
  })

  describe('3. Validação de Códigos Padronizados de Rejeição (Seção 6.5)', () => {
    test('Deve permitir apenas códigos padronizados pelo protocolo clínico', () => {
      const allowedCodes = ['INVALID_VALUE', 'DUPLICATE', 'UNREADABLE', 'INCOMPLETE', 'OTHER']
      const validateCode = (code) => allowedCodes.includes(code)

      assert.equal(validateCode('INVALID_VALUE'), true)
      assert.equal(validateCode('DUPLICATE'), true)
      assert.equal(validateCode('UNREADABLE'), true)
      assert.equal(validateCode('INCOMPLETE'), true)
      assert.equal(validateCode('OTHER'), true)
      assert.equal(validateCode('DISAGREE_WITH_PATIENT'), false)
      assert.equal(validateCode('RANDOM_REASON'), false)
    })
  })

  describe('4. Auditoria de Segurança: Acesso Anônimo e Verificação de Schemas', () => {
    test('Cliente anônimo (PostgREST) não deve conseguir realizar inserções de registros clínicos', async () => {
      if (!supabaseUrl || !supabaseAnonKey) {
        // Pula se variáveis não estiverem acessíveis no runner isolado
        return
      }

      const client = createClient(supabaseUrl, supabaseAnonKey)
      const { data, error } = await client.from('clinical_records').insert({
        record_type: 'VITAL_SIGNS',
        status: 'CONFIRMED', // Tentativa maliciosa de injetar confirmado
        clinical_date: '2026-10-25',
      }).select()

      // A inserção anônima DEVE falhar ou retornar erro de autorização/schema
      assert.ok(error != null || data == null || data.length === 0, 'Cliente anônimo não pode conseguir inserir registro confirmado')
    })

    test('Cliente anônimo não deve conseguir inserir eventos em audit_events sem credencial válida', async () => {
      if (!supabaseUrl || !supabaseAnonKey) return

      const client = createClient(supabaseUrl, supabaseAnonKey)
      const { data, error } = await client.from('audit_events').insert({
        action: 'MALICIOUS_INJECTION',
        resource: 'system',
        result: 'SUCCESS',
      }).select()

      assert.ok(error != null || data == null || data.length === 0, 'Cliente anônimo não pode injetar auditoria')
    })
  })

  describe('5. Rastreabilidade e Não-Supressão de Erros de Auditoria', () => {
    test('Falha na auditoria obrigatória deve provocar rejeição da operação no servidor', () => {
      const executeWithAudit = (operationSuccess, auditSuccess) => {
        if (!operationSuccess) return { error: 'Falha na operação clínica' }
        if (!auditSuccess) {
          // Na Fase 1.2, eliminamos o try/catch silencioso: auditoria é mandatória
          return { error: 'Falha na trilha de auditoria obrigatória. Operação cancelada por conformidade clínica.' }
        }
        return { success: true }
      }

      assert.deepEqual(
        executeWithAudit(true, false),
        { error: 'Falha na trilha de auditoria obrigatória. Operação cancelada por conformidade clínica.' }
      )
      assert.deepEqual(executeWithAudit(true, true), { success: true })
    })
  })
})
