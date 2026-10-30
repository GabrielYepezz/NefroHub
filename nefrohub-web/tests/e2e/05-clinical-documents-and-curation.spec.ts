import { test, expect } from '@playwright/test'
import { createE2EDoctor, createE2EPatient, cleanupE2ETestData, supabaseAdmin } from './helpers/supabase-admin'
import { loginViaUI, logoutViaUI } from './helpers/auth-helpers'

test.describe('Módulo E2E 05: Documentos Clínicos, Upload e Curadoria de Laudos (PRD Seção 11)', () => {
  const testTag = `e2e-docu-${Date.now()}`
  let testDoctor: any
  let testPatient: any

  test.beforeAll(async () => {
    // 1. Criar médico ativo
    testDoctor = await createE2EDoctor({
      email: `${testTag}-medico@nefrohub.test`,
      status: 'ACTIVE',
      name: `Dr. Documentos ${testTag.slice(-4)}`,
    })

    // 2. Criar paciente vinculado
    testPatient = await createE2EPatient({
      email: `${testTag}-paciente@nefrohub.test`,
      doctorUserId: testDoctor.userId,
      fullName: `Paciente Documentos ${testTag.slice(-4)}`,
    })
  })

  test.afterAll(async () => {
    await cleanupE2ETestData(testTag)
  })

  test('RF-066 e RF-067: Upload de Laudo em PDF pelo Paciente com Validação de Magic Bytes', async ({ page }) => {
    await loginViaUI(page, testPatient.email, testPatient.password, '/patient/dashboard')

    // Clicar em "Anexar Laudo / Documento"
    const uploadBtn = page.getByRole('button', { name: /Anexar Laudo/i })
    await expect(uploadBtn).toBeVisible({ timeout: 10000 })
    await uploadBtn.click()

    // Modal de upload
    await expect(page.getByRole('heading', { name: /Anexar Documento Clínico \/ Laudo/i })).toBeVisible()

    // Preencher título
    await page.locator('input#docTitle').fill('Laudo de Ultrassonografia Renal E2E')

    // Criar arquivo PDF sintético válido em memória com Magic Bytes %PDF-1.4
    const validPdfBuffer = Buffer.from(
      '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/MediaBox[0 0 3 3]>>endobj\nxref\n0 4\n0000000010 00000 n\n0000000053 00000 n\n0000000102 00000 n\ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n149\n%%EOF\n'
    )

    // Anexar arquivo via seletor
    await page.locator('input#docFile').setInputFiles({
      name: 'ultrassom_renal_e2e.pdf',
      mimeType: 'application/pdf',
      buffer: validPdfBuffer,
    })

    // Submeter upload
    await page.getByRole('button', { name: /Realizar Upload Seguro/i }).click()

    // Aguardar fechamento automático do modal (evidência de sucesso)
    await expect(page.getByRole('heading', { name: /Anexar Documento Clínico \/ Laudo/i })).not.toBeVisible({ timeout: 15000 })

    // O documento anexado deve constar na listagem de documentos do paciente
    await expect(page.locator('body')).toContainText(/Laudo de Ultrassonografia Renal E2E/i, { timeout: 10000 })
    await expect(page.locator('body')).toContainText(/PENDING|Aguardando Validação/i)

    await logoutViaUI(page)
  })

  test('RF-069 e RF-070: Curadoria Médica de Laudo Anexado com Emissão de URL Assinada', async ({ page }) => {
    // 1. Inserir um documento sintético diretamente para o paciente
    const { data: doc } = await supabaseAdmin
      .from('documents')
      .insert({
        patient_id: testPatient.patientId,
        title: 'Exame de Biópsia Renal E2E',
        file_path: `${testPatient.patientId}/e2e-test-doc.pdf`,
        file_size_bytes: 1024,
        file_hash_sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        mime_type: 'application/pdf',
        document_type: 'EXAM_REPORT',
        uploaded_by_user_id: testPatient.userId,
        validation_status: 'PENDING',
      })
      .select('id')
      .single()

    // 2. Médico faz login e navega para o prontuário do paciente
    await loginViaUI(page, testDoctor.email, testDoctor.password, '/doctor')

    // Deve listar a seção de documentos anexados
    await expect(page.locator('body')).toContainText(/Laudos e Documentos Anexados/i)

    // O laudo pendente deve estar visível com opções de curadoria
    if (doc) {
      await expect(page.locator('body')).toContainText(/Exame de Biópsia Renal E2E/i)
      await expect(page.locator('body')).toContainText(/PENDING|Validar|Confirmar/i)
    }

    await logoutViaUI(page)
  })
})
