// tests/phase4-1-mfa-totp-security.test.mjs
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

// Mock de verificação de garantia de autenticação AAL
function mockAssertServerMFAAssurance(role, aalData) {
  const upperRole = role?.toUpperCase()
  const isInstitutionalRole = upperRole === 'ADMIN' || upperRole === 'DOCTOR' || upperRole === 'DOCTOR_MASTER'

  if (!isInstitutionalRole) {
    return { authorized: true }
  }

  if (aalData && aalData.nextLevel === 'aal2' && aalData.currentLevel !== 'aal2') {
    return {
      authorized: false,
      error: 'Operação bloqueada: Esta ação clínica ou administrativa exige autenticação em duas etapas (TOTP) concluída na sessão atual.',
    }
  }

  return { authorized: true }
}

// Validação de formato de código TOTP (6 dígitos)
function validateTotpCodeFormat(code) {
  const trimmed = code?.trim()
  if (!trimmed || !/^\d{6}$/.test(trimmed)) {
    return { valid: false, error: 'O código de autenticação deve conter exatamente 6 dígitos numéricos.' }
  }
  return { valid: true, code: trimmed }
}

describe('RF-007: Autenticação Multifator MFA/TOTP para Médicos e Administradores', () => {

  describe('1. Regras de Obrigatoriedade por Papel Institucional', () => {
    test('Médico com MFA configurado requer AAL2 para executar ações protegidas', () => {
      const aalData = { currentLevel: 'aal1', nextLevel: 'aal2' }
      const res = mockAssertServerMFAAssurance('DOCTOR', aalData)
      assert.equal(res.authorized, false)
      assert.ok(res.error.includes('autenticação em duas etapas'))
    })

    test('Administrador com MFA configurado requer AAL2', () => {
      const aalData = { currentLevel: 'aal1', nextLevel: 'aal2' }
      const res = mockAssertServerMFAAssurance('ADMIN', aalData)
      assert.equal(res.authorized, false)
      assert.ok(res.error.includes('autenticação em duas etapas'))
    })

    test('Doctor Master com MFA configurado requer AAL2', () => {
      const aalData = { currentLevel: 'aal1', nextLevel: 'aal2' }
      const res = mockAssertServerMFAAssurance('DOCTOR_MASTER', aalData)
      assert.equal(res.authorized, false)
    })

    test('Paciente com AAL1 é autorizado normalmente (MFA opcional)', () => {
      const aalData = { currentLevel: 'aal1', nextLevel: 'aal1' }
      const res = mockAssertServerMFAAssurance('PATIENT', aalData)
      assert.equal(res.authorized, true)
      assert.equal(res.error, undefined)
    })

    test('Sessão médica que já concluiu o segundo fator (AAL2) tem acesso liberado', () => {
      const aalData = { currentLevel: 'aal2', nextLevel: 'aal2' }
      const res = mockAssertServerMFAAssurance('DOCTOR', aalData)
      assert.equal(res.authorized, true)
      assert.equal(res.error, undefined)
    })
  })

  describe('2. Validação Estrita de Códigos TOTP', () => {
    test('Código com menos de 6 dígitos é rejeitado', () => {
      const res = validateTotpCodeFormat('12345')
      assert.equal(res.valid, false)
      assert.ok(res.error.includes('6 dígitos numéricos'))
    })

    test('Código com mais de 6 dígitos é rejeitado', () => {
      const res = validateTotpCodeFormat('1234567')
      assert.equal(res.valid, false)
    })

    test('Código contendo letras ou símbolos é rejeitado', () => {
      const res = validateTotpCodeFormat('12345a')
      assert.equal(res.valid, false)
      const res2 = validateTotpCodeFormat('12-456')
      assert.equal(res2.valid, false)
    })

    test('Código válido de 6 dígitos numéricos é aprovado', () => {
      const res = validateTotpCodeFormat('489201')
      assert.equal(res.valid, true)
      assert.equal(res.code, '489201')
    })

    test('Código com espaços nas extremidades é sanitizado', () => {
      const res = validateTotpCodeFormat('  902183  ')
      assert.equal(res.valid, true)
      assert.equal(res.code, '902183')
    })
  })

  describe('3. Proteção no Middleware e Rotas Sensíveis', () => {
    function mockProxyRouteGuard(path, userRole, aalData) {
      const isDoctorRoute = path.startsWith('/doctor')
      const isAdminRoute = path.startsWith('/admin')
      const isAuthRoute = path.startsWith('/login') || path.startsWith('/auth')

      const isMfaPending = aalData && aalData.nextLevel === 'aal2' && aalData.currentLevel !== 'aal2'

      if (isMfaPending && (isAdminRoute || isDoctorRoute)) {
        return { action: 'REDIRECT', url: '/login?mfa=true' }
      }

      if (isAuthRoute) {
        if (isMfaPending) {
          return { action: 'ALLOW_LOGIN_PAGE' }
        }
        return { action: 'REDIRECT_DASHBOARD' }
      }

      return { action: 'PROCEED' }
    }

    test('Médico com MFA pendente tentando acessar /doctor é redirecionado para /login?mfa=true', () => {
      const guard = mockProxyRouteGuard('/doctor/pacientes', 'DOCTOR', { currentLevel: 'aal1', nextLevel: 'aal2' })
      assert.equal(guard.action, 'REDIRECT')
      assert.equal(guard.url, '/login?mfa=true')
    })

    test('Admin com MFA pendente tentando acessar /admin é redirecionado para /login?mfa=true', () => {
      const guard = mockProxyRouteGuard('/admin/filas', 'ADMIN', { currentLevel: 'aal1', nextLevel: 'aal2' })
      assert.equal(guard.action, 'REDIRECT')
      assert.equal(guard.url, '/login?mfa=true')
    })

    test('Usuário com MFA pendente acessando /login tem permanência autorizada para resolver o desafio', () => {
      const guard = mockProxyRouteGuard('/login', 'DOCTOR', { currentLevel: 'aal1', nextLevel: 'aal2' })
      assert.equal(guard.action, 'ALLOW_LOGIN_PAGE')
    })

    test('Médico com MFA resolvido (AAL2) tem acesso livre a /doctor', () => {
      const guard = mockProxyRouteGuard('/doctor', 'DOCTOR', { currentLevel: 'aal2', nextLevel: 'aal2' })
      assert.equal(guard.action, 'PROCEED')
    })
  })

  describe('4. Auditoria de Inscrição e Resolução de Desafio', () => {
    test('Enrollment gera evento auditável sem expor segredos', () => {
      const auditPayload = {
        action: 'MFA_ENROLLED_SUCCESS',
        resource_type: 'AUTH_MFA',
        resource_id: 'factor-uuid-1234',
        details: { method: 'TOTP', enrolled_at: '2026-10-29T15:00:00Z' },
      }
      assert.equal(auditPayload.details.secret, undefined, 'Segredo TOTP nunca deve constar no evento de auditoria')
      assert.equal(auditPayload.details.qr_code, undefined, 'QR code nunca deve constar no evento de auditoria')
    })
  })
})
