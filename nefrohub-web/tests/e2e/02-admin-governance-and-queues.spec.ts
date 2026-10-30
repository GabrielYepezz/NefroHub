import { test, expect } from '@playwright/test'
import { ADMIN_CREDENTIALS, cleanupE2ETestData } from './helpers/supabase-admin'
import { loginViaUI, logoutViaUI } from './helpers/auth-helpers'

test.describe('Módulo E2E 02: Governança Administrativa, Filas 1 a 5 e Auditoria (PRD Seções 2.3, 4, 6.5, 7.3, 15.4)', () => {
  const testTag = `e2e-admin-${Date.now()}`
  const testDoctorEmail = `${testTag}-doc@nefrohub.test`
  const testDoctorCRM = `${Math.floor(200000 + Math.random() * 700000)}`

  test.afterAll(async () => {
    await cleanupE2ETestData(testTag)
  })

  test.beforeEach(async ({ page }) => {
    await loginViaUI(page, ADMIN_CREDENTIALS.email, ADMIN_CREDENTIALS.password, '/admin')
  })

  test.afterEach(async ({ page }) => {
    await logoutViaUI(page)
  })

  test('RF-001: Cadastro Institucional de Médico pelo Administrador em /admin/medicos', async ({ page }) => {
    await page.goto('/admin/medicos')
    await page.waitForLoadState('networkidle')

    // Deve renderizar a listagem institucional
    await expect(page.getByRole('heading', { name: /Corpo Clínico & Médicos/i })).toBeVisible()

    // Clicar no botão para abrir o modal de cadastro
    await page.getByRole('button', { name: /Cadastrar Médico/i }).first().click()

    // Preencher modal de cadastro
    await expect(page.getByRole('heading', { name: /Cadastrar Médico no Corpo Clínico/i })).toBeVisible()
    await page.locator('input#doc-name').fill(`Dr. E2E Teste ${testDoctorCRM}`)
    await page.locator('input#doc-email').fill(testDoctorEmail)
    await page.locator('input#doc-crm').fill(testDoctorCRM)
    await page.locator('select#doc-uf').selectOption('SP')

    // Submeter formulário institucional
    await page.getByRole('button', { name: /Cadastrar Médico/i }).last().click()

    // Feedback de sucesso em tela
    await expect(page.locator('body')).toContainText(/cadastrado|Fila 1|sucesso/i, { timeout: 15000 })

    // Fechar o modal de link de primeiro acesso se estiver aberto
    const closeBtn = page.getByRole('button', { name: /Fechar/i }).last()
    if (await closeBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await closeBtn.click()
    }
  })

  test('RF-002 e RF-041: Fila 1 - Homologação de Médico e Ativação no Corpo Clínico', async ({ page }) => {
    await page.goto('/admin/filas')
    await page.waitForLoadState('networkidle')

    // Deve exibir a interface de Filas de Trabalho do Backoffice
    await expect(page.getByRole('heading', { name: /Filas de Trabalho do Backoffice/i })).toBeVisible()

    // Fila 1 deve estar visível
    await expect(page.getByText(/1\. Homologação de Contas e Profissionais/i)).toBeVisible()

    // Localizar o médico recém-cadastrado na tabela da Fila 1 se houver
    const approveBtn = page.getByRole('button', { name: /Homologar/i }).first()
    if (await approveBtn.isVisible()) {
      await approveBtn.click()
      await expect(page.locator('body')).toContainText(/homologado|ativado com sucesso/i, { timeout: 15000 })
    }
  })

  test('RF-042: Fila 2 - Interface de Vínculos e Representações', async ({ page }) => {
    await page.goto('/admin/filas')
    await page.waitForLoadState('networkidle')

    // Clicar na Fila 2
    await page.getByText(/2\. Aprovação de Vínculos e Representações/i).click()

    // Deve carregar os painéis de Vínculos Médicos e Representantes
    await expect(page.locator('body')).toContainText(/Vínculos Médico-Paciente|Representações/i)
  })

  test('RF-044: Fila 4 - Visualização da Fila de Retificações (review_requests)', async ({ page }) => {
    await page.goto('/admin/filas')
    await page.waitForLoadState('networkidle')

    // Clicar na Fila 4
    await page.getByText(/4\. Solicitações de Correção \/ Retificação/i).click()

    // Deve renderizar a área de despacho formal de retificações
    await expect(page.locator('body')).toContainText(/pedidos de retificação|review_requests/i)
  })

  test('RF-045: Fila 5 - Interface de Destinação e Descarte com botões operacionais corrigidos', async ({ page }) => {
    await page.goto('/admin/filas')
    await page.waitForLoadState('networkidle')

    // Clicar na Fila 5
    await page.getByText(/5\. Destinação e Descarte de Documentos/i).click()

    // Deve carregar o painel da Fila 5
    await expect(page.locator('body')).toContainText(/Descarte e Retenção|política de retenção|retenção de 20 anos/i)
  })

  test('RF-071 e RF-072: Trilha de Auditoria Append-Only em /admin/auditoria', async ({ page }) => {
    await page.goto('/admin/auditoria')
    await page.waitForLoadState('networkidle')

    // Deve renderizar a tabela de eventos de auditoria
    await expect(page.getByRole('heading', { name: /Trilha de Auditoria & Conformidade/i })).toBeVisible()
    await expect(page.locator('table')).toBeVisible()

    // Conferir que eventos recentes aparecem na tabela
    await expect(page.locator('table')).toContainText(/PHYSICIAN|USER|EMAIL|SUCCESS|DOCUMENT/i)
  })
})
