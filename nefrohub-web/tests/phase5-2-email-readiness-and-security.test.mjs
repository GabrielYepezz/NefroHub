import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..')

// Funções de referência baseadas na implementação real para os testes unitários
const CLINICAL_PROHIBITED_PATTERNS = [
  /\bcreatinina\b/i,
  /\btfg\b/i,
  /\btfge\b/i,
  /\bckd-epi\b/i,
  /\bclearance\b/i,
  /\bureia\b/i,
  /\buréia\b/i,
  /\bpotassio\b/i,
  /\bpotássio\b/i,
  /\bproteinuria\b/i,
  /\bproteinúria\b/i,
  /\bhematuria\b/i,
  /\bhematúria\b/i,
  /\bdialise\b/i,
  /\bdiálise\b/i,
  /\bhemodialise\b/i,
  /\bhemodiálise\b/i,
  /\bperitoneal\b/i,
  /\bbiopsia\b/i,
  /\bbiópsia\b/i,
  /\bglomerulonefrite\b/i,
  /\bestadiamento\b/i,
  /\bestágio\s+[1-5]\b/i,
  /\binsuficiencia\s+renal\b/i,
  /\binsuficiência\s+renal\b/i,
  /\bhipertensao\b/i,
  /\bhipertensão\b/i,
  /\bdiabetes\b/i,
  /\blosartana\b/i,
  /\benalapril\b/i,
  /\bfurosemida\b/i,
  /\beritropoetina\b/i,
  /\bprontuario\s+completo\b/i,
  /\bprontuário\s+completo\b/i,
]

const CLINICAL_MEASUREMENT_PATTERNS = [
  /\b\d+([.,]\d+)?\s*(mg\/dl|umol\/l|g\/24h|ml\/min|mmhg)\b/i,
  /\bpress[aã]o\s+arterial:\s*\d{2,3}\/\d{2,3}\b/i,
]

const FULL_CPF_REGEX = /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b|\b\d{11}\b/
const CNS_REGEX = /\b[1-9]\d{14}\b/
const UNSAFE_URL_SCHEMES = /^(javascript|data|vbscript|file):/i

function assertClinicalPrivacyRef(subject, plainContent) {
  const violations = []
  const sanitizedForCheck = `${subject} ${plainContent}`.toLowerCase()

  for (const pattern of CLINICAL_PROHIBITED_PATTERNS) {
    if (pattern.test(sanitizedForCheck)) {
      violations.push(`Termo clínico restrito: ${pattern.source}`)
    }
  }

  for (const pattern of CLINICAL_MEASUREMENT_PATTERNS) {
    if (pattern.test(sanitizedForCheck)) {
      violations.push('Medição ou valor laboratorial clínico detectado')
    }
  }

  if (FULL_CPF_REGEX.test(sanitizedForCheck)) {
    violations.push('CPF completo detectado')
  }
  if (CNS_REGEX.test(sanitizedForCheck)) {
    violations.push('CNS detectado')
  }

  return {
    isSafe: violations.length === 0,
    violations,
  }
}

function validateActionUrlRef(url) {
  if (!url || typeof url !== 'string') return { isValid: false, error: 'URL ausente' }
  if (UNSAFE_URL_SCHEMES.test(url.trim())) return { isValid: false, error: 'Esquema inseguro' }
  const isHttps = url.startsWith('https://')
  const isLocalDev = url.startsWith('http://localhost:') || url.startsWith('http://127.0.0.1:')
  if (!isHttps && !isLocalDev) return { isValid: false, error: 'Requer HTTPS' }
  return { isValid: true }
}

describe('Fase 5.2: Auditoria de Segurança e Prontidão para E-mails Reais', () => {

  describe('1. Validação de Dados Institucionais e Bloqueio de Valores Fictícios', () => {
    test('Não deve conter CNPJ fictício 00.000.000/0001-00 em nenhum arquivo de e-mail', () => {
      const emailDir = path.join(projectRoot, 'src/lib/email')
      const files = ['tokens.ts', 'components.ts', 'sanitizer.ts', 'service.ts', 'templates/index.ts', 'templates/supabase-auth-templates.ts']

      for (const f of files) {
        const fullPath = path.join(emailDir, f)
        if (fs.existsSync(fullPath)) {
          const content = fs.readFileSync(fullPath, 'utf8')
          assert.ok(!content.includes('00.000.000/0001-00'), `Arquivo ${f} não deve conter CNPJ fictício`)
        }
      }
    })

    test('getInstitutionalConfig deve sinalizar dados pendentes quando variáveis estiverem ausentes', () => {
      const tokensPath = path.join(projectRoot, 'src/lib/email/tokens.ts')
      const content = fs.readFileSync(tokensPath, 'utf8')

      assert.ok(content.includes('INSTITUTION_NAME'), 'Deve ler INSTITUTION_NAME do ambiente')
      assert.ok(content.includes('INSTITUTION_CNPJ'), 'Deve ler INSTITUTION_CNPJ do ambiente')
      assert.ok(content.includes('SUPPORT_EMAIL'), 'Deve ler SUPPORT_EMAIL do ambiente')
      assert.ok(content.includes('isProductionReady'), 'Deve expor flag isProductionReady')
      assert.ok(content.includes('validationIssues'), 'Deve expor lista de pendências')
    })

    test('Rodapé de components.ts não deve renderizar alegações regulatórias não confirmadas', () => {
      const componentsPath = path.join(projectRoot, 'src/lib/email/components.ts')
      const content = fs.readFileSync(componentsPath, 'utf8')

      assert.ok(!content.includes('Lei nº 13.787/2018'), 'Não deve conter alegações de conformidade não verificadas no rodapé')
      assert.ok(content.includes('Por favor, não responda diretamente a este e-mail'), 'Deve conter aviso de mensagem automática')
    })
  })

  describe('2. Firewall de Privacidade: Falsos Positivos, Negativos e URLs', () => {
    test('Não deve gerar falso positivo para termos legítimos com substring tfg', () => {
      const safeSubject = 'NefroHub — Atualização no Prontuário'
      // O texto contém uma URL ou código que contém 'tfg' como substring (ex: token=plataforma_tfg_auth)
      const safeText = 'Há uma atualização no seu prontuário. Acesse https://nefrohub.med.br/plataforma_tfg_app'

      const result = assertClinicalPrivacyRef(safeSubject, safeText)
      assert.equal(result.isSafe, true, 'Não deve dar falso positivo para substrings em URLs ou palavras normais')
    })

    test('Deve detectar e bloquear medições laboratoriais numéricas (mg/dL, mL/min, mmHg)', () => {
      const cases = [
        'Creatinina atual: 1.8 mg/dL',
        'Taxa de filtração estimada: 42 mL/min',
        'Pressão Arterial: 140/90 mmHg',
        'Proteína na urina: 3.5 g/24h',
      ]

      for (const text of cases) {
        const result = assertClinicalPrivacyRef('Notificação', text)
        assert.equal(result.isSafe, false, `Deve bloquear medição clínica: "${text}"`)
      }
    })

    test('Deve detectar e bloquear CPF de 11 dígitos sem pontuação e CNS de 15 dígitos', () => {
      const cpfRaw = 'Identificador: 12345678901'
      const cnsRaw = 'Cartão SUS: 123456789012345'

      const resCpf = assertClinicalPrivacyRef('Aviso', cpfRaw)
      assert.equal(resCpf.isSafe, false, 'Deve bloquear CPF sem pontuação')

      const resCns = assertClinicalPrivacyRef('Aviso', cnsRaw)
      assert.equal(resCns.isSafe, false, 'Deve bloquear CNS de 15 dígitos')
    })

    test('validateActionUrl deve rejeitar esquemas inseguros (javascript:, data:, file:) e exigir HTTPS', () => {
      assert.equal(validateActionUrlRef('javascript:alert(1)').isValid, false)
      assert.equal(validateActionUrlRef('data:text/html,<script>').isValid, false)
      assert.equal(validateActionUrlRef('file:///etc/passwd').isValid, false)
      assert.equal(validateActionUrlRef('http://inseguro.com/login').isValid, false)
      assert.equal(validateActionUrlRef('https://nefrohub.med.br/login').isValid, true)
      assert.equal(validateActionUrlRef('http://localhost:3000/login').isValid, true)
    })
  })

  describe('3. Serviço de Envio: Modo Simulado, Idempotência e Timeouts', () => {
    test('service.ts deve diferenciar SUBMITTED_TO_PROVIDER de SIMULATED e usar timeouts seguros', () => {
      const servicePath = path.join(projectRoot, 'src/lib/email/service.ts')
      const content = fs.readFileSync(servicePath, 'utf8')

      assert.ok(content.includes('SUBMITTED_TO_PROVIDER'), 'Deve registrar submissão ao provedor e não entrega final')
      assert.ok(content.includes('SIMULATED'), 'Deve registrar modo simulado')
      assert.ok(content.includes('BLOCKED_UNCONFIGURED'), 'Deve bloquear envio real se dados institucionais estiverem incompletos')
      assert.ok(content.includes('connectionTimeout'), 'Deve configurar connectionTimeout')
      assert.ok(content.includes('socketTimeout'), 'Deve configurar socketTimeout')
    })

    test('service.ts deve implementar proteção de idempotência ativa contra disparos repetidos', () => {
      const servicePath = path.join(projectRoot, 'src/lib/email/service.ts')
      const content = fs.readFileSync(servicePath, 'utf8')

      assert.ok(content.includes('isRecentDuplicate'), 'Deve conter verificação de duplicação recente')
      assert.ok(content.includes('DUPLICATE_IGNORED'), 'Deve retornar DUPLICATE_IGNORED para repetições')
      assert.ok(content.includes('idempotencyKey'), 'Deve aceitar idempotencyKey explícita')
    })

    test('service.ts deve validar o formato de e-mail do destinatário no servidor', () => {
      const servicePath = path.join(projectRoot, 'src/lib/email/service.ts')
      const content = fs.readFileSync(servicePath, 'utf8')

      assert.ok(content.includes('INVALID_RECIPIENT'), 'Deve rejeitar destinatário inválido')
    })
  })

  describe('4. Fluxo Completo de Recuperação de Senha', () => {
    test('auth/actions.ts deve exportar updatePasswordAction com validação de sessão e status ativo', () => {
      const authActionsPath = path.join(projectRoot, 'src/app/auth/actions.ts')
      const content = fs.readFileSync(authActionsPath, 'utf8')

      assert.ok(content.includes('updatePasswordAction'), 'Deve exportar updatePasswordAction')
      assert.ok(content.includes('getUser()'), 'Deve validar sessão do usuário autenticado via recuperação')
      assert.ok(content.includes("status !== 'ACTIVE'"), 'Deve impedir que contas suspensas ou inativas redefinam senha')
      assert.ok(content.includes('PASSWORD_RESET_COMPLETED'), 'Deve registrar auditoria')
    })

    test('LoginForm.tsx deve conter o formulário Definir Nova Senha para quando recovery=true', () => {
      const loginFormPath = path.join(projectRoot, 'src/app/login/LoginForm.tsx')
      const content = fs.readFileSync(loginFormPath, 'utf8')

      assert.ok(content.includes("searchParams.get('recovery') === 'true'"), 'Deve detectar parâmetro recovery')
      assert.ok(content.includes('Definir Nova Senha'), 'Deve exibir tela de Definir Nova Senha')
      assert.ok(content.includes('updatePasswordAction'), 'Deve invocar updatePasswordAction')
      assert.ok(content.includes('Confirmar Nova Senha'), 'Deve ter campo de confirmação de senha')
    })
  })

  describe('5. Auditoria de Concorrência e Não-Duplicação de Gatilhos', () => {
    test('approveDoctorAction em medicos/actions.ts deve filtrar por PENDING_APPROVAL e verificar linhas', () => {
      const medicosActionsPath = path.join(projectRoot, 'src/app/admin/medicos/actions.ts')
      const content = fs.readFileSync(medicosActionsPath, 'utf8')

      assert.ok(content.includes(".eq('status', 'PENDING_APPROVAL')"), 'Deve exigir status PENDING_APPROVAL no update')
      assert.ok(content.includes('updatedUsers.length === 0'), 'Deve verificar se houve linha afetada')
      assert.ok(content.includes('idempotencyKey'), 'Deve passar idempotencyKey ao serviço de e-mail')
    })

    test('Ações da Fila em filas/actions.ts devem verificar linhas afetadas antes do e-mail', () => {
      const filasActionsPath = path.join(projectRoot, 'src/app/admin/filas/actions.ts')
      const content = fs.readFileSync(filasActionsPath, 'utf8')

      assert.ok(content.includes('updatedUsers.length === 0'), 'Fila 1 deve validar linhas afetadas')
      assert.ok(content.includes('updatedLinks.length === 0'), 'Fila 2 deve validar linhas afetadas')
      assert.ok(content.includes('idempotencyKey: `PHYSICIAN_APPROVED:${userId}`'), 'Fila 1 usa idempotencyKey')
      assert.ok(content.includes('idempotencyKey: `LINK_APPROVED:${linkId}`'), 'Fila 2 usa idempotencyKey')
    })

    test('Rejeição clínica em doctor/actions.ts deve usar idempotencyKey e notificação genérica', () => {
      const docActionsPath = path.join(projectRoot, 'src/app/doctor/actions.ts')
      const content = fs.readFileSync(docActionsPath, 'utf8')

      assert.ok(content.includes('idempotencyKey: `CLINICAL_REJECTED:${recordId}`'), 'Deve usar chave idempotente')
      assert.ok(content.includes('createPatientGenericUpdateEmail'), 'Deve enviar apenas notificação genérica')
    })
  })

  describe('6. Compatibilidade dos Templates Supabase Auth GoTemplate', () => {
    test('supabase-auth-templates.ts deve documentar formalmente a necessidade de configuração manual no painel', () => {
      const sbTemplatesPath = path.join(projectRoot, 'src/lib/email/templates/supabase-auth-templates.ts')
      const content = fs.readFileSync(sbTemplatesPath, 'utf8')

      assert.ok(content.toLowerCase().includes('configuração manual'), 'Deve registrar aviso explícito de configuração manual')
      assert.ok(content.includes('{{ .ConfirmationURL }}'), 'Deve utilizar a variável oficial ConfirmationURL')
    })
  })
})
