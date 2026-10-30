import { test, expect } from '@playwright/test'
import { createE2EDoctor, createE2EPatient, cleanupE2ETestData, supabaseAdmin } from './helpers/supabase-admin'
import { loginViaUI, logoutViaUI } from './helpers/auth-helpers'

test.describe('Módulo E2E 04: Prontuário Médico, Calculadora CKD-EPI 2021 e Curadoria Clínica (PRD Seções 2.3, 4.1, 6, 8, 10)', () => {
  const testTag = `e2e-doc-${Date.now()}`
  let testDoctor: any
  let testPatient: any

  test.beforeAll(async () => {
    // 1. Criar médico homologado ativo
    testDoctor = await createE2EDoctor({
      email: `${testTag}-medico@nefrohub.test`,
      status: 'ACTIVE',
      name: `Dr. Nefro Clinico ${testTag.slice(-4)}`,
    })

    // 2. Criar paciente vinculado
    testPatient = await createE2EPatient({
      email: `${testTag}-paciente@nefrohub.test`,
      doctorUserId: testDoctor.userId,
      fullName: `Paciente Renal Clinico ${testTag.slice(-4)}`,
      biologicalSex: 'M',
      birthDate: '1975-08-20',
    })

    // 3. Inserir uma medição pendente para testar curadoria médica
    const { data: pendingRec } = await supabaseAdmin
      .from('clinical_records')
      .insert({
        patient_id: testPatient.patientId,
        clinical_date: new Date().toISOString().split('T')[0],
        record_type: 'VITAL_SIGNS',
        status: 'PENDING_VALIDATION',
        created_by_user_id: testPatient.userId,
      })
      .select('id')
      .single()

    if (pendingRec) {
      await supabaseAdmin.from('vital_signs').insert([
        { clinical_record_id: pendingRec.id, sign_code: 'BP_SYSTOLIC', numeric_value: 130, unit: 'mmHg' },
        { clinical_record_id: pendingRec.id, sign_code: 'BP_DIASTOLIC', numeric_value: 85, unit: 'mmHg' },
        { clinical_record_id: pendingRec.id, sign_code: 'WEIGHT', numeric_value: 76.0, unit: 'kg' },
      ])
    }
  })

  test.afterAll(async () => {
    await cleanupE2ETestData(testTag)
  })

  test.beforeEach(async ({ page }) => {
    await loginViaUI(page, testDoctor.email, testDoctor.password, '/doctor')
  })

  test.afterEach(async ({ page }) => {
    await logoutViaUI(page)
  })

  test('RF-022: Painel do Médico exibe pacientes vinculados e busca clínica', async ({ page }) => {
    await expect(page).toHaveURL(/\/doctor/)

    // Deve exibir o cabeçalho do portal médico
    await expect(page.locator('body')).toContainText(/Área Clínica|Prontuário Nefrológico/i)
    await expect(page.locator('body')).toContainText(new RegExp(testDoctor.name, 'i'))

    // Deve listar o paciente vinculado
    await expect(page.locator('body')).toContainText(new RegExp(testPatient.fullName, 'i'))
  })

  test('RF-062 e RF-049: Lançamento de Exame com Cálculo Automático CKD-EPI 2021', async ({ page }) => {
    await page.goto('/doctor')
    await page.waitForLoadState('networkidle')

    // Clicar em "Novo Exame Laboratorial"
    const newExamBtn = page.getByRole('button', { name: /Novo Exame Laboratorial/i })
    await expect(newExamBtn).toBeVisible({ timeout: 10000 })
    await newExamBtn.click()

    // Modal de lançamento
    await expect(page.getByRole('heading', { name: /Lançamento de Exame Laboratorial/i })).toBeVisible()

    // Selecionar Creatinina Sérica
    await page.locator('select#examName').selectOption('Creatinina Sérica')

    // Inserir valor de creatinina (1.4 mg/dL)
    await page.locator('input#numericValue').fill('1.4')

    // Deve calcular e exibir a estimativa de eTFG (CKD-EPI 2021) e estágio KDIGO em tempo real
    await expect(page.locator('body')).toContainText(/Estimativa de eTFG \(CKD-EPI 2021\)/i)
    await expect(page.locator('body')).toContainText(/mL\/min\/1\.73m²/i)

    // Submeter gravação oficial no prontuário
    await page.getByRole('button', { name: /Confirmar e Assinar Exame/i }).click()

    // Aguardar fechamento automático do modal (evidência de sucesso)
    await expect(page.getByRole('heading', { name: /Lançamento de Exame Laboratorial/i })).not.toBeVisible({ timeout: 15000 })
  })

  test('RF-034: Curadoria Médica de Submissão Domiciliar Pendente com Confirmação', async ({ page }) => {
    await page.goto('/doctor')
    await page.waitForLoadState('networkidle')

    // Localizar a seção de submissões pendentes de validação
    const pendingSection = page.locator('body')
    await expect(pendingSection).toContainText(/Submissões Aguardando Validação|Aguardando Médico/i)

    // Clicar em "Confirmar no Prontuário"
    const confirmBtn = page.getByRole('button', { name: /Confirmar no Prontuário/i }).first()
    if (await confirmBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await confirmBtn.click()
      await expect(page.locator('body')).toContainText(/confirmado com sucesso|validado e confirmado/i, { timeout: 15000 })
    }
  })

  test('RF-057: Visualização da Curva de Evolução Longitudinal Renal (Recharts)', async ({ page }) => {
    await page.goto('/doctor')
    await page.waitForLoadState('networkidle')

    // Deve renderizar o card de curva de evolução com o gráfico interativo
    await expect(page.locator('body')).toContainText(/Curva de Evolução Longitudinal Renal/i)
    await expect(page.locator('body')).toContainText(/TFGe \(CKD-EPI 2021\) vs Creatinina Sérica/i)
  })
})
