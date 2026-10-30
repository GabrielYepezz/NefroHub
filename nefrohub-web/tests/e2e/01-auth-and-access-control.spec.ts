import { test, expect } from '@playwright/test'
import { ADMIN_CREDENTIALS, createE2EDoctor, cleanupE2ETestData } from './helpers/supabase-admin'
import { loginViaUI, logoutViaUI } from './helpers/auth-helpers'

test.describe('Módulo E2E 01: Autenticação, Sessões e Controle de Acesso (PRD Seções 2, 4.5 e 15)', () => {
  const testTag = `e2e-auth-${Date.now()}`

  test.afterAll(async () => {
    await cleanupE2ETestData(testTag)
  })

  test('RF-010: Tentativa de login com credenciais incorretas exibe mensagem e mantém na tela', async ({ page }) => {
    await page.goto('/login')
    await page.waitForLoadState('networkidle')
    await page.waitForSelector('[data-hydrated="true"]', { timeout: 10000 })

    await page.locator('input#email').fill('usuario-inexistente@nefrohub.test')
    await page.locator('input#password').fill('SenhaInvalida123!')
    await page.getByRole('button', { name: /Entrar na Plataforma/i }).click()

    // Deve exibir feedback de erro e não redirecionar
    await expect(page.locator('form')).toContainText(/Credenciais inválidas|incorretos|Erro/i, { timeout: 8000 })
    await expect(page).toHaveURL(/\/login/)
  })

  test('RF-010: Médico com status PENDING_APPROVAL tem login bloqueado com aviso', async ({ page }) => {
    const pendingDoc = await createE2EDoctor({
      email: `${testTag}-pending@nefrohub.test`,
      status: 'PENDING_APPROVAL',
      name: 'Dr. Teste Pendente',
    })

    await page.goto('/login')
    await page.waitForLoadState('networkidle')
    await page.waitForSelector('[data-hydrated="true"]', { timeout: 10000 })

    await page.locator('input#email').fill(pendingDoc.email)
    await page.locator('input#password').fill(pendingDoc.password)
    await page.getByRole('button', { name: /Entrar na Plataforma/i }).click()

    // Servidor deve recusar acesso para conta não aprovada
    await expect(page.locator('form')).toContainText(/pendente de aprovação|homologação/i, { timeout: 15000 })
    await expect(page).toHaveURL(/\/login/)
  })

  test('RF-010: Bloqueio de rotas protegidas sem sessão autenticada', async ({ page }) => {
    // Tentativa de acesso direto a rotas de perfis distintos
    const protectedRoutes = ['/admin', '/admin/filas', '/doctor', '/patient/dashboard']

    for (const route of protectedRoutes) {
      await page.goto(route)
      // Middleware deve redirecionar obrigatoriamente para /login
      await expect(page).toHaveURL(/\/login/, { timeout: 8000 })
    }
  })

  test('RF-002: Login do Administrador redireciona com sucesso para /admin', async ({ page }) => {
    await loginViaUI(page, ADMIN_CREDENTIALS.email, ADMIN_CREDENTIALS.password, '/admin')

    // Deve renderizar a barra lateral e o painel do administrador
    await expect(page.locator('body')).toContainText(/Painel do Administrador|NefroHub Admin|Visão Geral/i)
    await expect(page.getByRole('link', { name: /Corpo Clínico/i })).toBeVisible()
    await expect(page.getByRole('link', { name: /Filas de Trabalho/i })).toBeVisible()

    await logoutViaUI(page)
  })

  test('RF-008: Interface de Recuperação de Senha com proteção contra enumeração de contas', async ({ page }) => {
    await page.goto('/login')
    await page.waitForLoadState('networkidle')
    await page.waitForSelector('[data-hydrated="true"]', { timeout: 10000 })

    // Clicar em "Esqueceu a senha?"
    await page.getByRole('button', { name: /Esqueceu a senha\?/i }).click()

    // Deve exibir o formulário inline de recuperação
    await expect(page.getByRole('heading', { name: /Recuperação de Acesso/i })).toBeVisible()
    await expect(page.locator('input#recovery-email')).toBeVisible()

    // Submeter e-mail
    await page.locator('input#recovery-email').fill('qualquer.conta@hospital.test')
    await page.getByRole('button', { name: /Enviar Link de Recuperação/i }).click()

    // Mensagem genérica deve ser exibida sem confirmar se a conta existe
    await expect(page.locator('body')).toContainText(
      /Se o e-mail informado estiver cadastrado, você receberá um link seguro/i,
      { timeout: 8000 }
    )
  })

  test('RF-008: Modo de Redefinição de Nova Senha (?recovery=true) exibe campos de senha', async ({ page }) => {
    await page.goto('/login?recovery=true')
    await page.waitForLoadState('networkidle')
    await page.waitForSelector('[data-hydrated="true"]', { timeout: 10000 })

    // Deve detectar o parâmetro de recuperação e exibir a tela de Definir Nova Senha
    await expect(page.getByRole('heading', { name: /Definir Nova Senha/i })).toBeVisible()
    await expect(page.locator('input#new-password')).toBeVisible()
    await expect(page.locator('input#confirm-new-password')).toBeVisible()
    await expect(page.getByRole('button', { name: /Salvar Nova Senha/i })).toBeVisible()
  })
})
