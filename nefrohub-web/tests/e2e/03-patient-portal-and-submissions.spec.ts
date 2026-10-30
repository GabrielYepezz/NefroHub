import { test, expect } from '@playwright/test'
import { createE2EDoctor, createE2EPatient, cleanupE2ETestData, supabaseAdmin } from './helpers/supabase-admin'
import { loginViaUI, logoutViaUI } from './helpers/auth-helpers'

test.describe('Módulo E2E 03: Portal do Paciente, Aferições Domiciliares e Representação (PRD Seções 3, 5, 6, 8.3)', () => {
  const testTag = `e2e-pat-${Date.now()}`
  let testDoctor: any
  let testPatient: any

  test.beforeAll(async () => {
    // 1. Criar médico ativo
    testDoctor = await createE2EDoctor({
      email: `${testTag}-doc@nefrohub.test`,
      status: 'ACTIVE',
      name: 'Dr. Nefrologista E2E',
    })

    // 2. Criar paciente vinculado
    testPatient = await createE2EPatient({
      email: `${testTag}-paciente@nefrohub.test`,
      doctorUserId: testDoctor.userId,
      fullName: `Paciente Renal E2E ${testTag.slice(-4)}`,
    })
  })

  test.afterAll(async () => {
    await cleanupE2ETestData(testTag)
  })

  test.beforeEach(async ({ page }) => {
    await loginViaUI(page, testPatient.email, testPatient.password, '/patient/dashboard')
  })

  test.afterEach(async ({ page }) => {
    await logoutViaUI(page)
  })

  test('RF-026: Dashboard do Paciente exibe métricas e identificação do titular', async ({ page }) => {
    await expect(page).toHaveURL(/\/patient\/dashboard/)

    // Verificar cabeçalho do portal
    await expect(page.locator('body')).toContainText(/Portal do Paciente|Painel de Acompanhamento/i)
    await expect(page.locator('body')).toContainText(new RegExp(testPatient.fullName, 'i'))

    // Verificar métricas clínicas
    await expect(page.locator('body')).toContainText(/Pressão Arterial|Peso Corporal|Filtração Glomerular/i)
  })

  test('RF-032 e RF-033: Submissão domiciliar de sinais vitais e bloqueio de edição direta', async ({ page }) => {
    // Preencher formulário de sinais vitais
    const weightInput = page.locator('input[name="weight"]')
    const systolicInput = page.locator('input[name="bpSystolic"]')
    const diastolicInput = page.locator('input[name="bpDiastolic"]')

    await weightInput.fill('78.5')
    await systolicInput.fill('125')
    await diastolicInput.fill('82')

    // Submeter
    await page.getByRole('button', { name: /Registrar Medições|Enviar Medições/i }).click()

    // Aguardar feedback de sucesso
    await expect(page.locator('body')).toContainText(/Medições enviadas com sucesso|validação/i, { timeout: 15000 })

    // Aferição deve aparecer na aba "Aguardando Validação"
    await expect(page.getByText(/Aguardando Validação/i)).toBeVisible()
    await expect(page.locator('body')).toContainText(/78\.5 kg/)
    await expect(page.locator('body')).toContainText(/125x82 mmHg/)

    // Regra de Integridade RF-033: Não deve haver botão de excluir ou editar medições enviadas
    await expect(page.getByRole('button', { name: /Excluir|Remover|Deletar/i })).not.toBeVisible()
  })

  test('RF-039: Solicitação de retificação (Pedir Correção) na aba de medições confirmadas', async ({ page }) => {
    // Inserir diretamente uma medição CONFIRMED no prontuário do paciente
    const { data: rec } = await supabaseAdmin
      .from('clinical_records')
      .insert({
        patient_id: testPatient.patientId,
        clinical_date: new Date().toISOString().split('T')[0],
        record_type: 'VITAL_SIGNS',
        status: 'CONFIRMED',
        created_by_user_id: testPatient.userId,
        confirmed_by_user_id: testDoctor.userId,
        confirmed_at: new Date().toISOString(),
      })
      .select('id')
      .single()

    if (rec) {
      await supabaseAdmin.from('vital_signs').insert({
        clinical_record_id: rec.id,
        sign_code: 'WEIGHT',
        numeric_value: 80.0,
        unit: 'kg',
      })
    }

    // Atualizar a página do portal
    await page.goto('/patient/dashboard')
    await page.waitForLoadState('networkidle')

    // Navegar para a aba "Confirmadas"
    await page.getByRole('button', { name: /Confirmadas/i }).click()

    // O botão "Pedir Correção" deve estar visível
    const reviewBtn = page.getByRole('button', { name: /Pedir Correção/i }).first()
    await expect(reviewBtn).toBeVisible({ timeout: 10000 })

    // Mockar o prompt nativo do navegador para fornecer a justificativa
    page.on('dialog', async (dialog) => {
      await dialog.accept('Divergência na balança calibrada de casa.')
    })

    // Clicar no botão
    await reviewBtn.click()

    // Feedback de encaminhamento para Fila 4
    await expect(page.locator('body')).toContainText(/retificação enviada|Fila 4/i, { timeout: 15000 })
  })

  test('RF-024: Solicitação de representação legal / cuidador via modal', async ({ page }) => {
    // 1. Criar previamente a conta do cuidador conforme exigido pelo PRD Seção 5
    const repEmail = `${testTag}-cuidador@nefrohub.test`
    const { data: repAuth } = await supabaseAdmin.auth.admin.createUser({
      email: repEmail,
      password: 'RepSenhaForte@2026',
      email_confirm: true,
    })
    if (repAuth?.user) {
      await supabaseAdmin.from('users').upsert({
        id: repAuth.user.id,
        email: repEmail,
        name: 'Cuidador Familiar Teste',
        role: 'LEGAL_REPRESENTANT',
        status: 'ACTIVE',
      })
    }

    // 2. Clicar no botão para indicar novo representante
    const addRepBtn = page.getByRole('button', { name: /Delegar Acesso a Cuidador/i })
    await expect(addRepBtn).toBeVisible()
    await addRepBtn.click()

    // Preencher modal de representação
    await expect(page.getByRole('heading', { name: /Solicitar Representação \/ Cuidador/i })).toBeVisible()

    await page.locator('input#repEmail').fill(repEmail)
    await page.locator('select#relationship').selectOption('CAREGIVER')
    await page.locator('select#authority').selectOption('CONSULT_ONLY')

    // Submeter
    await page.getByRole('button', { name: /Enviar para Homologação/i }).click()

    // Aguardar fechamento automático do modal (evidência de sucesso)
    await expect(page.getByRole('heading', { name: /Solicitar Representação \/ Cuidador/i })).not.toBeVisible({ timeout: 15000 })
  })
})
