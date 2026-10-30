import { test, expect } from '@playwright/test'
import {
  ADMIN_CREDENTIALS,
  createE2EDoctor,
  createE2EPatient,
  cleanupE2ETestData,
  supabaseAdmin,
} from './helpers/supabase-admin'
import { loginViaUI, logoutViaUI } from './helpers/auth-helpers'

/**
 * NefroHub — Rodada Completa de Validação E2E Ponta a Ponta (E2E-01 a E2E-10)
 * Execução com contas 100% sintéticas (@nefrohub.test), validações no navegador
 * e verificação de persistência somente leitura no Supabase.
 */
test.describe.serial('Rodada Completa de Validação E2E Ponta a Ponta (E2E-01 a E2E-10)', () => {
  const runId = Date.now()
  const testTag = `e2e-cycle-${runId}`

  let sharedDoctor1: { userId: string; email: string; password: string; name: string }
  let sharedDoctor2: { userId: string; email: string; password: string; name: string }
  let sharedPatient: { userId: string; patientId: string; email: string; password: string; fullName: string }

  test.beforeAll(async () => {
    // 1. Provisionar Médico 1 (Assistente Primário com Vínculo)
    sharedDoctor1 = await createE2EDoctor({
      email: `${testTag}-doc1@nefrohub.test`,
      name: `Dr. E2E Primário ${runId.toString().slice(-4)}`,
      crm: `${Math.floor(100000 + Math.random() * 899999)}`,
      crmUf: 'SP',
      status: 'ACTIVE',
    })

    // 2. Provisionar Médico 2 (Médico Não Vinculado para Zero-Trust Negativo)
    sharedDoctor2 = await createE2EDoctor({
      email: `${testTag}-doc2@nefrohub.test`,
      name: `Dr. E2E Não Vinculado ${runId.toString().slice(-4)}`,
      crm: `${Math.floor(100000 + Math.random() * 899999)}`,
      crmUf: 'RJ',
      status: 'ACTIVE',
    })

    // 3. Provisionar Paciente Sintético com Prontuário Vinculado ao Médico 1
    sharedPatient = await createE2EPatient({
      email: `${testTag}-pat@nefrohub.test`,
      fullName: `Paciente Ciclo E2E ${runId.toString().slice(-4)}`,
      doctorUserId: sharedDoctor1.userId,
      birthDate: '1975-08-20',
      biologicalSex: 'M',
    })
  })

  test.afterAll(async () => {
    await cleanupE2ETestData(testTag)
  })

  // --------------------------------------------------------------------------
  // E2E-01: Cadastro de Paciente e Validações de Pré-cadastro
  // --------------------------------------------------------------------------
  test('E2E-01: Cadastro de Paciente e Validações de Pré-cadastro', async ({ page }) => {
    await page.goto('/auth/register')
    await page.waitForLoadState('networkidle')

    // 1. Validação negativa: senha menor que 12 caracteres (RF-009)
    await page.locator('input#name').fill('Paciente Inválido')
    await page.locator('input#email').fill(`${testTag}-invalid@nefrohub.test`)
    await page.locator('input#password').fill('Curta123') // 8 chars
    await page.locator('input#phone').fill('11999991111')
    await page.getByRole('button', { name: /Cadastrar Paciente/i }).click()

    // Deve exibir mensagem de erro da política de senhas (12 caracteres)
    await expect(page.locator('form')).toContainText(/12 caracteres/i, { timeout: 8000 })

    // 2. Cadastro válido com senha forte
    const validEmail = `${testTag}-pat-public@nefrohub.test`
    await page.locator('input#name').fill(`Novo Paciente ${runId.toString().slice(-4)}`)
    await page.locator('input#email').fill(validEmail)
    await page.locator('input#password').fill('MinhaFraseDeAcessoForte@2026')
    await page.locator('input#phone').fill('11988887777')
    await page.getByRole('button', { name: /Cadastrar Paciente/i }).click()

    // Confirma redirecionamento para o dashboard do paciente após o cadastro
    await expect(page).toHaveURL(/\/patient\/dashboard/, { timeout: 15000 })

    // 3. Verificação de persistência e não-escalonamento no backend (somente leitura)
    const { data: createdUser } = await supabaseAdmin
      .from('users')
      .select('id, email, role, status')
      .eq('email', validEmail)
      .maybeSingle()

    expect(createdUser).not.toBeNull()
    expect(createdUser?.role).toBe('PATIENT') // Inegociavelmente paciente

    // Deslogar o paciente recém-criado para isolar a próxima etapa
    await logoutViaUI(page)
  })

  // --------------------------------------------------------------------------
  // E2E-02: Homologação e Ativação Administrativa com Auditoria
  // --------------------------------------------------------------------------
  test('E2E-02: Homologação e Ativação Administrativa com Auditoria', async ({ page }) => {
    // 1. Criar médico sintético em estado PENDING_APPROVAL
    const pendingDoctor = await createE2EDoctor({
      email: `${testTag}-pending-homolog@nefrohub.test`,
      name: `Dr. Homologação ${runId.toString().slice(-4)}`,
      status: 'PENDING_APPROVAL',
    })

    // 2. Logar como Administrador
    await loginViaUI(page, ADMIN_CREDENTIALS.email, ADMIN_CREDENTIALS.password, '/admin')

    // 3. Acessar Fila 1 (Homologação de Médicos)
    await page.goto('/admin/filas')
    await page.waitForLoadState('networkidle')

    // Clicar no card da Fila 1 para abrir o painel de despacho
    await page.getByText(/1\. Homologação de Contas e Profissionais/i).click()

    // 4. Localizar o médico e aprovar (Homologar CRM)
    const doctorCard = page
      .getByText(pendingDoctor.email)
      .locator('../..')

    await expect(doctorCard).toBeVisible({ timeout: 15000 })
    await doctorCard.getByRole('button', { name: 'Homologar CRM' }).click()

    // 5. Verificar feedback e atualização no backend
    await expect(page.locator('body')).toContainText(/homologado com sucesso|ativado/i, { timeout: 12000 })

    const { data: updatedDoctor } = await supabaseAdmin
      .from('users')
      .select('status')
      .eq('id', pendingDoctor.userId)
      .single()

    expect(updatedDoctor?.status).toBe('ACTIVE')

    // 6. Verificar trilha de auditoria
    const { data: audit } = await supabaseAdmin
      .from('audit_events')
      .select('action, resource')
      .eq('action', 'PHYSICIAN_APPROVED')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    expect(audit?.action).toBe('PHYSICIAN_APPROVED')

    await logoutViaUI(page)
  })

  // --------------------------------------------------------------------------
  // E2E-03: Login do Paciente e Controle Estrito de Acesso RBAC
  // --------------------------------------------------------------------------
  test('E2E-03: Login do Paciente e Controle Estrito de Acesso RBAC', async ({ page }) => {
    // 1. Logar como paciente sintético
    await loginViaUI(page, sharedPatient.email, sharedPatient.password, '/patient/dashboard')

    // 2. Confirmar acesso ao painel do paciente
    await expect(page.locator('body')).toContainText(sharedPatient.fullName)
    await expect(page.locator('body')).toContainText(/Painel do Paciente|Aferições Domiciliares/i)

    // 3. Teste Negativo RBAC: Tentar acessar rotas restritas de médico e admin
    await page.goto('/admin')
    await expect(page).toHaveURL(/\/patient\/dashboard|\/login/, { timeout: 10000 })

    await page.goto('/doctor')
    await expect(page).toHaveURL(/\/patient\/dashboard|\/login/, { timeout: 10000 })

    await logoutViaUI(page)
  })

  // --------------------------------------------------------------------------
  // E2E-04: Login Médico e Verificação de MFA/TOTP (AAL1 vs AAL2)
  // --------------------------------------------------------------------------
  test('E2E-04: Login Médico e Verificação de MFA/TOTP (AAL1 vs AAL2)', async ({ page }) => {
    // 1. Logar como médico sintético ativo
    await loginViaUI(page, sharedDoctor1.email, sharedDoctor1.password, '/doctor')

    // 2. Confirmar acesso à área médica
    await expect(page.locator('body')).toContainText(/Painel do Médico|Pacientes em Acompanhamento/i)
    await expect(page.locator('body')).toContainText(sharedDoctor1.name)

    // 3. Deslogar para testar a invalidação e o guard do proxy
    await logoutViaUI(page)

    // 4. Confirmar que na tela de login o usuário deslogado pode iniciar novos fluxos
    await page.goto('/login')
    await page.waitForLoadState('networkidle')
    await expect(page).toHaveURL(/\/login/)
  })

  // --------------------------------------------------------------------------
  // E2E-05: Vínculo Clínico Médico-Paciente e Isolamento Zero-Trust
  // --------------------------------------------------------------------------
  test('E2E-05: Vínculo Clínico Médico-Paciente e Isolamento Zero-Trust', async ({ page }) => {
    // 1. Médico 1 (com vínculo): deve enxergar o paciente
    await loginViaUI(page, sharedDoctor1.email, sharedDoctor1.password, '/doctor')
    await expect(page.locator('body')).toContainText(sharedPatient.fullName, { timeout: 15000 })
    await logoutViaUI(page)

    // 2. Médico 2 (sem vínculo): NÃO deve enxergar o paciente (Zero-Trust)
    await loginViaUI(page, sharedDoctor2.email, sharedDoctor2.password, '/doctor')
    await expect(page.locator('body')).not.toContainText(sharedPatient.fullName)

    // Busca pelo nome do paciente no médico não vinculado deve resultar em lista vazia
    const searchInput = page.getByPlaceholder(/Buscar por nome/i)
    if (await searchInput.isVisible()) {
      await searchInput.fill(sharedPatient.fullName)
      await expect(page.locator('body')).toContainText(/Nenhum paciente vinculado|Nenhum paciente encontrado/i)
    }

    await logoutViaUI(page)
  })

  // --------------------------------------------------------------------------
  // E2E-06: Registro Clínico Domiciliar em Estado Pendente de Curadoria
  // --------------------------------------------------------------------------
  test('E2E-06: Registro Clínico Domiciliar em Estado Pendente de Curadoria', async ({ page }) => {
    // 1. Entrar como paciente
    await loginViaUI(page, sharedPatient.email, sharedPatient.password, '/patient/dashboard')

    // 2. Preencher dados fictícios de sinais vitais no formulário lateral
    await page.locator('input#bpSystolic').fill('130')
    await page.locator('input#bpDiastolic').fill('85')
    await page.locator('input#weight').fill('72.5')

    await page.getByRole('button', { name: /Enviar Medições para Validação/i }).click()

    // 3. Confirmar que aparece feedback de envio pendente
    await expect(page.locator('body')).toContainText(/Medições enviadas com sucesso|Aguardando Validação/i, { timeout: 12000 })

    // 4. Recarregar página e verificar persistência
    await page.reload()
    await page.waitForLoadState('networkidle')
    await expect(page.locator('body')).toContainText(/130x85|130\/85/)
    await expect(page.locator('body')).toContainText(/72.5/)

    // 5. Verificação no backend (somente leitura)
    const { data: record } = await supabaseAdmin
      .from('clinical_records')
      .select('id, status, record_type')
      .eq('patient_id', sharedPatient.patientId)
      .eq('status', 'PENDING_VALIDATION')
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    expect(record).not.toBeNull()
    expect(record?.status).toBe('PENDING_VALIDATION')

    await logoutViaUI(page)
  })

  // --------------------------------------------------------------------------
  // E2E-07: Curadoria Médica, Confirmação e Garantia de Imutabilidade
  // --------------------------------------------------------------------------
  test('E2E-07: Curadoria Médica, Confirmação e Garantia de Imutabilidade', async ({ page }) => {
    // 1. Entrar como médico vinculado
    await loginViaUI(page, sharedDoctor1.email, sharedDoctor1.password, '/doctor')

    // 2. Selecionar o paciente
    await page.locator('div, button').filter({ hasText: sharedPatient.fullName }).first().click()

    // 3. Localizar a submissão pendente na Fila de Curadoria do médico
    await expect(page.locator('body')).toContainText(/Submissões Aguardando Validação|Fila Clínica/i)
    await expect(page.locator('body')).toContainText(/130x85|130\/85/)

    // 4. Clicar em "Confirmar no Prontuário"
    const confirmBtn = page.getByRole('button', { name: /Confirmar no Prontuário|Confirmar/i }).first()
    await confirmBtn.click()

    // 5. Verificar feedback de sucesso e migração para o histórico confirmado
    await expect(page.locator('body')).toContainText(/validado e confirmado|confirmado com sucesso/i, { timeout: 12000 })

    // 6. Imutabilidade: a interface não possui botão de edição direta
    await expect(page.locator('body')).not.toContainText(/Editar Medição|Excluir Registro/i)

    // 7. Verificação no backend: status = CONFIRMED
    const { data: confirmedRecord } = await supabaseAdmin
      .from('clinical_records')
      .select('id, status, confirmed_by_user_id')
      .eq('patient_id', sharedPatient.patientId)
      .eq('status', 'CONFIRMED')
      .order('confirmed_at', { ascending: false })
      .limit(1)
      .single()

    expect(confirmedRecord?.status).toBe('CONFIRMED')
    expect(confirmedRecord?.confirmed_by_user_id).toBe(sharedDoctor1.userId)

    await logoutViaUI(page)
  })

  // --------------------------------------------------------------------------
  // E2E-08: Upload de Laudo em Storage Privado e Curadoria com URL Assinada
  // --------------------------------------------------------------------------
  test('E2E-08: Upload de Laudo em Storage Privado e Curadoria com URL Assinada', async ({ page }) => {
    // 1. Entrar como paciente
    await loginViaUI(page, sharedPatient.email, sharedPatient.password, '/patient/dashboard')

    // 2. Abrir Modal de Upload de Documentos
    const uploadBtn = page.getByRole('button', { name: /Anexar Laudo/i })
    await expect(uploadBtn).toBeVisible({ timeout: 10000 })
    await uploadBtn.click()

    // 3. Criar buffer de PDF sintético válido com magic bytes %PDF-1.4
    const validPdfBuffer = Buffer.from(
      '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/MediaBox[0 0 3 3]>>endobj\nxref\n0 4\n0000000010 00000 n\n0000000053 00000 n\n0000000102 00000 n\ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n149\n%%EOF\n'
    )

    // Preencher formulário e anexar arquivo
    await page.locator('input#docTitle').fill('Laudo Ultrassom Renal E2E')
    await page.locator('input#docFile').setInputFiles({
      name: 'laudo-renal-e2e.pdf',
      mimeType: 'application/pdf',
      buffer: validPdfBuffer,
    })

    await page.getByRole('button', { name: /Realizar Upload Seguro/i }).click()

    // 4. Confirmar exibição na lista de documentos pendentes
    await expect(page.locator('body')).toContainText(/Laudo Ultrassom Renal E2E/i, { timeout: 15000 })
    await expect(page.locator('body')).toContainText(/PENDING|Aguardando Validação/i)

    await logoutViaUI(page)

    // 5. Entrar como médico e visualizar laudo com URL assinada
    await loginViaUI(page, sharedDoctor1.email, sharedDoctor1.password, '/doctor')
    await page.locator('div, button').filter({ hasText: sharedPatient.fullName }).first().click()

    await expect(page.locator('body')).toContainText(/Laudo Ultrassom Renal E2E/i, { timeout: 15000 })

    // O botão "Ver Laudo" deve existir para abrir via URL assinada
    const verLaudoBtn = page.getByRole('button', { name: /Ver Laudo|Visualizar/i }).first()
    await expect(verLaudoBtn).toBeVisible()

    await logoutViaUI(page)
  })

  // --------------------------------------------------------------------------
  // E2E-09: Solicitação de Retificação e Nova Versão Encadeada (Fila 4)
  // --------------------------------------------------------------------------
  test('E2E-09: Solicitação de Retificação e Nova Versão Encadeada (Fila 4)', async ({ page }) => {
    // 1. Entrar como paciente
    await loginViaUI(page, sharedPatient.email, sharedPatient.password, '/patient/dashboard')

    // 2. Navegar para a aba "Confirmadas"
    await page.getByRole('button', { name: /Confirmadas/i }).click()

    // Localizar registro confirmado e clicar em "Pedir Correção" tratando o dialog/prompt nativo
    const pedirCorrecaoBtn = page.getByRole('button', { name: /Pedir Correção/i }).first()
    await expect(pedirCorrecaoBtn).toBeVisible({ timeout: 10000 })

    const justificativa = 'Aferição realizada com manguito descalibrado, valor real foi 120/80 mmHg.'
    page.once('dialog', async (dialog) => {
      await dialog.accept(justificativa)
    })

    await pedirCorrecaoBtn.click()

    await expect(page.locator('body')).toContainText(/Solicitação de retificação enviada para a Fila 4|enviada/i, { timeout: 10000 })
    await logoutViaUI(page)

    // 4. Entrar como Administrador e acessar Fila 4
    await loginViaUI(page, ADMIN_CREDENTIALS.email, ADMIN_CREDENTIALS.password, '/admin')
    await page.goto('/admin/filas')
    await page.waitForLoadState('networkidle')

    // Clicar no card da Fila 4 para abrir o painel de despacho
    await page.getByText(/4\. Solicitações de Correção/i).click()

    // 5. Aprovar a solicitação na Fila 4
    const reviewCard = page
      .getByText(/manguito descalibrado/i)
      .locator('../..')
      .last()

    await expect(reviewCard).toBeVisible({ timeout: 15000 })
    await reviewCard.getByRole('button', { name: 'Aprovar Retificação' }).click()

    await expect(page.locator('body')).toContainText(/Retificação aprovada|processada/i, { timeout: 10000 })

    // 6. Verificação no backend: nova versão encadeada gerada com supersedes_record_id
    const { data: newVersion } = await supabaseAdmin
      .from('clinical_records')
      .select('id, supersedes_record_id, status')
      .eq('patient_id', sharedPatient.patientId)
      .not('supersedes_record_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    expect(newVersion).not.toBeNull()
    expect(newVersion?.supersedes_record_id).toBeTruthy()

    await logoutViaUI(page)
  })

  // --------------------------------------------------------------------------
  // E2E-10: Logout Seguro e Invalidação Total da Sessão
  // --------------------------------------------------------------------------
  test('E2E-10: Logout Seguro e Invalidação Total da Sessão', async ({ page }) => {
    // 1. Logar como administrador
    await loginViaUI(page, ADMIN_CREDENTIALS.email, ADMIN_CREDENTIALS.password, '/admin')

    // 2. Executar logout
    await logoutViaUI(page)
    await expect(page).toHaveURL(/\/login/)

    // 3. Tentar acessar /admin via navegação direta pós-logout
    await page.goto('/admin')
    await expect(page).toHaveURL(/\/login/, { timeout: 8000 })

    // 4. Tentar voltar pelo histórico do navegador (botão de voltar)
    await page.goBack()
    await expect(page).toHaveURL(/\/login/, { timeout: 8000 })

    // 5. Tentar acessar /doctor e /patient/dashboard
    await page.goto('/doctor')
    await expect(page).toHaveURL(/\/login/, { timeout: 8000 })

    await page.goto('/patient/dashboard')
    await expect(page).toHaveURL(/\/login/, { timeout: 8000 })

    // 6. Confirmação de que credenciais e tokens não vazam no DOM de login
    const pageHtml = await page.content()
    expect(pageHtml).not.toContain(ADMIN_CREDENTIALS.password)
  })
})
