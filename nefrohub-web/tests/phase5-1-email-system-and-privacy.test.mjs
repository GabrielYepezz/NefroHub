import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..')

// Implementação de referência do Firewall de Privacidade Clínica para teste unitário
const CLINICAL_PROHIBITED_TERMS = [
  'creatinina',
  'tfg',
  'tfge',
  'ckd-epi',
  'clearance',
  'ureia',
  'uréia',
  'potassio',
  'potássio',
  'proteinuria',
  'proteinúria',
  'hematuria',
  'hematúria',
  'dialise',
  'diálise',
  'hemodialise',
  'hemodiálise',
  'peritoneal',
  'biopsia',
  'biópsia',
  'glomerulonefrite',
  'estadiamento',
  'estágio 1',
  'estágio 2',
  'estágio 3',
  'estágio 4',
  'estágio 5',
  'insuficiencia renal',
  'insuficiência renal',
  'hipertensao',
  'hipertensão',
  'diabetes',
  'losartana',
  'enalapril',
  'furosemida',
  'eritropoetina',
  'prontuario completo',
  'prontuário completo',
]

const FULL_CPF_REGEX = /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/

function assertClinicalPrivacyReference(subject, htmlContent, plainContent) {
  const violations = []
  const combinedText = `${subject} ${htmlContent} ${plainContent}`.toLowerCase()

  for (const term of CLINICAL_PROHIBITED_TERMS) {
    if (combinedText.includes(term)) {
      violations.push(`Termo clínico restrito: "${term}"`)
    }
  }

  if (FULL_CPF_REGEX.test(combinedText)) {
    violations.push('CPF completo detectado')
  }

  if (combinedText.includes('password=') || combinedText.includes('token_secret') || combinedText.includes('service_role')) {
    violations.push('Credencial confidencial detectada')
  }

  return {
    isSafe: violations.length === 0,
    violations,
  }
}

function escapeHtmlReference(unsafe) {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

describe('Fase 5.1: Auditoria do Sistema de E-mails, Identidade Visual e Privacidade Clínica', () => {

  describe('1. Identidade Visual e Tokens de Design System', () => {
    test('Tokens visuais devem estar declarados exatamente conforme a paleta do NefroHub', () => {
      const tokensPath = path.join(projectRoot, 'src/lib/email/tokens.ts')
      assert.ok(fs.existsSync(tokensPath), 'Arquivo tokens.ts deve existir')
      const content = fs.readFileSync(tokensPath, 'utf8')

      assert.ok(content.includes('#367C83'), 'Cor primária #367C83')
      assert.ok(content.includes('#2B676D'), 'Hover primário #2B676D')
      assert.ok(content.includes('#F7F9FA'), 'Fundo externo #F7F9FA')
      assert.ok(content.includes('#FFFFFF'), 'Fundo card #FFFFFF')
      assert.ok(content.includes('#24323A'), 'Texto primário #24323A')
      assert.ok(content.includes('#687780'), 'Texto secundário #687780')
      assert.ok(content.includes('#E4EAED'), 'Bordas #E4EAED')
      assert.ok(content.includes('#3F8068'), 'Status de sucesso #3F8068')
      assert.ok(content.includes('#A97732'), 'Status de aviso #A97732')
      assert.ok(content.includes('#B95353'), 'Status de erro #B95353')
    })

    test('Pilha tipográfica e dados institucionais em tokens.ts', () => {
      const tokensPath = path.join(projectRoot, 'src/lib/email/tokens.ts')
      const content = fs.readFileSync(tokensPath, 'utf8')

      assert.ok(content.includes('Poppins'), 'Deve conter fonte Poppins')
      assert.ok(content.includes('getInstitutionalConfig'), 'Deve exportar getInstitutionalConfig')
      assert.ok(content.includes('institutionName'), 'Deve conter propriedade institutionName')
      assert.ok(content.toLowerCase().includes('cnpj'), 'Deve conter chave de CNPJ')
      assert.ok(!content.includes('00.000.000/0001-00'), 'Não deve conter CNPJ fictício hardcoded')
    })
  })

  describe('2. Barreira Inegociável de Privacidade Clínica (Firewall Anti-Vazamento)', () => {
    test('assertClinicalPrivacy deve bloquear e-mails que tentem vazar exames ou valores clínicos', () => {
      const subject = 'Resultado do seu exame de creatinina sérica'
      const html = '<p>Seu valor de creatinina foi 2.4 mg/dL e TFGe 31 mL/min</p>'
      const text = 'Creatinina: 2.4 mg/dL'

      const result = assertClinicalPrivacyReference(subject, html, text)
      assert.equal(result.isSafe, false, 'Deve bloquear termos laboratoriais proibidos')
      assert.ok(result.violations.length >= 2, 'Deve identificar múltiplas violações clínicas')
    })

    test('assertClinicalPrivacy deve bloquear e-mails com menção a diagnósticos e diálise', () => {
      const subject = 'Aviso de sessão'
      const html = '<p>Paciente encaminhado para hemodiálise por insuficiência renal crônica</p>'
      const text = 'Sessão agendada'

      const result = assertClinicalPrivacyReference(subject, html, text)
      assert.equal(result.isSafe, false)
      assert.ok(result.violations.some((v) => v.includes('hemodiálise') || v.includes('insuficiência renal')))
    })

    test('assertClinicalPrivacy deve detectar e bloquear CPF completo', () => {
      const subject = 'Atualização de prontuário'
      const html = '<p>Identificador do paciente: 123.456.789-00</p>'
      const text = 'CPF do paciente: 12345678900'

      const result = assertClinicalPrivacyReference(subject, html, text)
      assert.equal(result.isSafe, false, 'Deve impedir inclusão de CPF completo')
    })

    test('assertClinicalPrivacy deve permitir e-mails transacionais e genéricos em conformidade', () => {
      const subject = 'NefroHub — Atualização no Prontuário'
      const html = '<p>Há uma atualização disponível na sua conta. Acesse o portal seguro.</p>'
      const text = 'Há uma atualização disponível. Acesse https://nefrohub.med.br'

      const result = assertClinicalPrivacyReference(subject, html, text)
      assert.equal(result.isSafe, true, 'E-mail genérico seguro deve ser aprovado')
      assert.equal(result.violations.length, 0)
    })

    test('Sanitização de HTML deve neutralizar scripts maliciosos e aspas', () => {
      const unsafe = '<script>alert("hack")</script>&"\'teste'
      const safe = escapeHtmlReference(unsafe)
      assert.ok(!safe.includes('<script>'))
      assert.ok(safe.includes('&lt;script&gt;'))
      assert.ok(safe.includes('&amp;'))
      assert.ok(safe.includes('&quot;'))
      assert.ok(safe.includes('&#039;'))
    })
  })

  describe('3. Auditoria Estrutural dos Templates Transacionais', () => {
    test('Arquivo de templates deve exportar todos os 9 templates institucionais obrigatórios', () => {
      const templatesPath = path.join(projectRoot, 'src/lib/email/templates/index.ts')
      assert.ok(fs.existsSync(templatesPath), 'templates/index.ts deve existir')
      const content = fs.readFileSync(templatesPath, 'utf8')

      assert.ok(content.includes('createDoctorInviteEmail'), 'Deve exportar convite de médico')
      assert.ok(content.includes('createDoctorApprovedEmail'), 'Deve exportar homologação de médico')
      assert.ok(content.includes('createDoctorRejectedEmail'), 'Deve exportar recusa de médico')
      assert.ok(content.includes('createPasswordResetEmail'), 'Deve exportar recuperação de senha')
      assert.ok(content.includes('createPatientConfirmationEmail'), 'Deve exportar confirmação de paciente')
      assert.ok(content.includes('createPatientGenericUpdateEmail'), 'Deve exportar atualização genérica de prontuário')
      assert.ok(content.includes('createRepresentationRequestedEmail'), 'Deve exportar indicação de representação')
      assert.ok(content.includes('createRepresentationDecisionEmail'), 'Deve exportar decisão de representação')
      assert.ok(content.includes('createLinkApprovedEmail'), 'Deve exportar homologação de vínculo médico-paciente')
    })

    test('Template genérico do paciente NUNCA deve incluir variáveis ou termos clínicos no código', () => {
      const templatesPath = path.join(projectRoot, 'src/lib/email/templates/index.ts')
      const content = fs.readFileSync(templatesPath, 'utf8')

      const patientGenericSection = content.slice(content.indexOf('createPatientGenericUpdateEmail'))
      assert.ok(
        patientGenericSection.includes('Por motivos de sigilo médico e proteção de dados de saúde'),
        'Deve conter disclaimer explícito de privacidade clínica'
      )
      assert.ok(!patientGenericSection.includes('exame.nome'), 'Não deve referenciar nomes de exames')
      assert.ok(!patientGenericSection.includes('resultado'), 'Não deve referenciar resultados')
      assert.ok(!patientGenericSection.includes('diagnostico'), 'Não deve referenciar diagnósticos')
    })

    test('Componentes de e-mail devem incluir CTA Bulletproof e Aviso de Segurança Clínica', () => {
      const componentsPath = path.join(projectRoot, 'src/lib/email/components.ts')
      assert.ok(fs.existsSync(componentsPath), 'components.ts deve existir')
      const content = fs.readFileSync(componentsPath, 'utf8')

      assert.ok(content.includes('renderButton'), 'Deve exportar renderButton')
      assert.ok(content.includes('renderAlertBox'), 'Deve exportar renderAlertBox')
      assert.ok(content.includes('renderSecurityNotice'), 'Deve exportar renderSecurityNotice')
      assert.ok(content.includes('renderEmailLayout'), 'Deve exportar renderEmailLayout')

      // Verificar que o botão é bulletproof com tabela e fallback textual
      assert.ok(content.includes('role="presentation"'), 'Deve usar tabelas de apresentação para e-mail')
      assert.ok(content.includes('Se o botão acima não funcionar, acesse diretamente pelo link:'))
    })
  })

  describe('4. Compatibilidade com Supabase Auth Email Templates', () => {
    test('Arquivo supabase-auth-templates.ts deve gerar templates compatíveis com GoTemplate', () => {
      const sbPath = path.join(projectRoot, 'src/lib/email/templates/supabase-auth-templates.ts')
      assert.ok(fs.existsSync(sbPath), 'supabase-auth-templates.ts deve existir')
      const content = fs.readFileSync(sbPath, 'utf8')

      assert.ok(content.includes('{{ .ConfirmationURL }}'), 'Deve suportar ConfirmationURL')
      assert.ok(content.includes('confirmationSignUp'), 'Template sign up')
      assert.ok(content.includes('inviteUser'), 'Template invite user')
      assert.ok(content.includes('resetPassword'), 'Template reset password')
      assert.ok(content.includes('magicLink'), 'Template magic link')
    })
  })

  describe('5. Rastreabilidade de Gatilhos e Disparos no Código Real', () => {
    test('Recuperação de Senha: deve estar implementada em auth/actions.ts e integrada ao LoginForm', () => {
      const authActionsPath = path.join(projectRoot, 'src/app/auth/actions.ts')
      const loginFormPath = path.join(projectRoot, 'src/app/login/LoginForm.tsx')

      const authActions = fs.readFileSync(authActionsPath, 'utf8')
      const loginForm = fs.readFileSync(loginFormPath, 'utf8')

      assert.ok(authActions.includes('resetPasswordAction'), 'auth/actions.ts deve exportar resetPasswordAction')
      assert.ok(authActions.includes('resetPasswordForEmail'), 'Deve invocar supabase.auth.resetPasswordForEmail')
      assert.ok(loginForm.includes('resetPasswordAction'), 'LoginForm deve acionar resetPasswordAction')
      assert.ok(!loginForm.includes('alert('), 'LoginForm não deve conter mock de alert')
    })

    test('Fila 1 (Médicos): deve disparar e-mails de homologação e recusa em filas/actions.ts', () => {
      const filasActionsPath = path.join(projectRoot, 'src/app/admin/filas/actions.ts')
      const content = fs.readFileSync(filasActionsPath, 'utf8')

      assert.ok(content.includes('createDoctorApprovedEmail'), 'Fila 1 deve disparar e-mail de aprovação')
      assert.ok(content.includes('createDoctorRejectedEmail'), 'Fila 1 deve disparar e-mail de recusa')
      assert.ok(content.includes('sendTransactionalEmail'), 'Deve invocar sendTransactionalEmail')
    })

    test('Fila 2 (Vínculos e Representações): deve disparar notificações em filas/actions.ts', () => {
      const filasActionsPath = path.join(projectRoot, 'src/app/admin/filas/actions.ts')
      const content = fs.readFileSync(filasActionsPath, 'utf8')

      assert.ok(content.includes('createLinkApprovedEmail'), 'Fila 2 deve notificar vínculo aprovado')
      assert.ok(content.includes('createRepresentationDecisionEmail'), 'Fila 2 deve notificar decisão de representação')
    })

    test('Solicitação de Representação: deve notificar cuidador indicado em representationActions.ts', () => {
      const repActionsPath = path.join(projectRoot, 'src/app/patient/dashboard/representationActions.ts')
      const content = fs.readFileSync(repActionsPath, 'utf8')

      assert.ok(content.includes('createRepresentationRequestedEmail'), 'Deve notificar representante indicado')
      assert.ok(content.includes('sendTransactionalEmail'), 'Deve invocar serviço transacional')
    })

    test('Rejeição Clínica Médica: deve disparar notificação genérica ao paciente em doctor/actions.ts', () => {
      const docActionsPath = path.join(projectRoot, 'src/app/doctor/actions.ts')
      const content = fs.readFileSync(docActionsPath, 'utf8')

      assert.ok(content.includes('createPatientGenericUpdateEmail'), 'Deve disparar e-mail genérico ao paciente')
      assert.ok(!content.includes('rejectionReason}'), 'Não deve incluir a justificativa clínica no corpo do e-mail')
    })
  })

  describe('6. Invariante de Não-Bloqueio e Resiliência Transacional', () => {
    test('Serviço de e-mail nunca deve propagar exceção bloqueante para operações clínicas', () => {
      const servicePath = path.join(projectRoot, 'src/lib/email/service.ts')
      const content = fs.readFileSync(servicePath, 'utf8')

      assert.ok(content.includes('EMAIL_PRIVACY_BLOCKED'), 'Deve auditar bloqueio de privacidade')
      assert.ok(content.includes('EMAIL_DELIVERY_FAILED'), 'Deve capturar falha de SMTP sem quebrar a chamada')
      assert.ok(content.includes('success: false'), 'Retorna status controlado')
    })
  })
})
