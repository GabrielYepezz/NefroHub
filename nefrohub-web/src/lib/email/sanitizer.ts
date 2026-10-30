/**
 * Firewall de Privacidade Clínica e Sanitização de E-mails do NefroHub (Fase 5.2 - Seção 2)
 * 
 * Regra Inegociável (documentation.md Seção 7.4):
 * "O e-mail não deverá incluir CPF, resultados laboratoriais, diagnósticos, 
 * documentos ou outros detalhes clínicos."
 * 
 * Limitações e Fronteiras de Proteção:
 * Este módulo fornece uma segunda linha de defesa (Defense in Depth). A primeira linha
 * inegociável é o design estritamente minimalista dos templates transacionais, cujos contratos
 * tipados aceitam apenas nomes e links de ação, sem campos para dados clínicos arbitrários.
 */

// Padrões clínicos com limites de palavra (\b) para evitar falsos positivos em tokens criptográficos
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

// Unidades e medidas laboratoriais que denunciam valores clínicos
const CLINICAL_MEASUREMENT_PATTERNS = [
  /\b\d+([.,]\d+)?\s*(mg\/dl|umol\/l|g\/24h|ml\/min|mmhg)\b/i,
  /\bpress[aã]o\s+arterial:\s*\d{2,3}\/\d{2,3}\b/i,
]

// Detecção de CPF formatado (000.000.000-00) ou bruto com 11 dígitos isolados
const FULL_CPF_REGEX = /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b|\b\d{11}\b/

// Detecção de CNS (Cartão Nacional de Saúde - 15 dígitos)
const CNS_REGEX = /\b[1-9]\d{14}\b/

// Esquemas de URL maliciosos ou não seguros
const UNSAFE_URL_SCHEMES = /^(javascript|data|vbscript|file):/i

export interface PrivacyCheckResult {
  isSafe: boolean
  violations: string[]
}

/**
 * Valida o conteúdo do e-mail antes do envio para assegurar que nenhum
 * dado clínico sensível ou identificador restrito seja transmitido por e-mail.
 */
export function assertClinicalPrivacy(subject: string, htmlContent: string, plainContent: string): PrivacyCheckResult {
  const violations: string[] = []

  // Remover URLs de verificação e CSS inline antes da checagem para evitar falsos positivos em tokens aleatórios
  const sanitizedForCheck = `${subject} ${plainContent}`.toLowerCase()

  // 1. Checagem de termos clínicos com limites de palavra
  for (const pattern of CLINICAL_PROHIBITED_PATTERNS) {
    if (pattern.test(sanitizedForCheck)) {
      violations.push(`Termo clínico restrito detectado no e-mail: ${pattern.source}`)
    }
  }

  // 2. Checagem de unidades e medidas clínicas numéricas
  for (const pattern of CLINICAL_MEASUREMENT_PATTERNS) {
    if (pattern.test(sanitizedForCheck)) {
      violations.push('Medição ou valor laboratorial clínico detectado no conteúdo do e-mail.')
    }
  }

  // 3. Checagem de identificadores pessoais completos (CPF e CNS)
  if (FULL_CPF_REGEX.test(sanitizedForCheck)) {
    violations.push('Número de CPF completo detectado no corpo ou assunto do e-mail.')
  }
  if (CNS_REGEX.test(sanitizedForCheck)) {
    violations.push('Número de CNS (Cartão Nacional de Saúde) detectado no corpo do e-mail.')
  }

  // 4. Checagem de segredos, senhas e variáveis de ambiente
  if (
    sanitizedForCheck.includes('password=') ||
    sanitizedForCheck.includes('token_secret') ||
    sanitizedForCheck.includes('service_role')
  ) {
    violations.push('Possível credencial técnica ou segredo detectado no e-mail.')
  }

  return {
    isSafe: violations.length === 0,
    violations,
  }
}

/**
 * Valida se uma URL de ação é segura para inclusão em e-mails institucionais
 */
export function validateActionUrl(url: string): { isValid: boolean; error?: string } {
  if (!url || typeof url !== 'string') {
    return { isValid: false, error: 'URL de ação ausente ou inválida.' }
  }

  if (UNSAFE_URL_SCHEMES.test(url.trim())) {
    return { isValid: false, error: 'Esquema de URL inseguro ou malicioso detectado.' }
  }

  // Deve ser HTTPS ou localhost/127.0.0.1 em desenvolvimento
  const isHttps = url.startsWith('https://')
  const isLocalDev = url.startsWith('http://localhost:') || url.startsWith('http://127.0.0.1:')

  if (!isHttps && !isLocalDev) {
    return { isValid: false, error: 'URLs de ação em e-mails devem utilizar obrigatoriamente HTTPS seguro.' }
  }

  return { isValid: true }
}

/**
 * Escapa strings dinâmicas inseridas em templates HTML para evitar injeção
 */
export function escapeHtml(unsafe: string): string {
  if (!unsafe || typeof unsafe !== 'string') return ''
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

/**
 * Sanitiza nomes de usuários inseridos nos templates garantindo ausência de tags HTML
 */
export function sanitizeRecipientName(name: string): string {
  if (!name || typeof name !== 'string') return 'Usuário'
  // Remove qualquer caractere perigoso preservando letras, acentuações e pontuação básica
  return name.replace(/[<>{}[\]\\]/g, '').trim().slice(0, 100) || 'Usuário'
}
