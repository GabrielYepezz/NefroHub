/**
 * Tokens Visuais Oficiais do NefroHub para E-mails Transacionais
 * Alinhados estritamente com globals.css e as diretrizes de design do sistema.
 */
export const EMAIL_TOKENS = {
  // Cores Principais
  primary: '#367C83',
  primaryDark: '#2B676D',
  primaryLight: '#E8F3F2',
  primaryForeground: '#FFFFFF',

  // Superfícies e Neutros
  background: '#F7F9FA',
  card: '#FFFFFF',
  foreground: '#24323A',
  mutedForeground: '#687780',
  border: '#E4EAED',

  // Estados Clínicos / Status
  success: '#3F8068',
  successBg: '#EAF5EF',
  successForeground: '#275A47',

  warning: '#A97732',
  warningBg: '#FBF3E5',
  warningForeground: '#674719',

  destructive: '#B95353',
  destructiveBg: '#FAECEC',
  destructiveForeground: '#6B2727',

  info: '#4779A8',
  infoBg: '#EDF4FA',
  infoForeground: '#254B6E',

  // Tipografia e Dimensões
  fontFamily: "'Poppins', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  fontFamilyMono: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Courier New', monospace",
  radius: '8px',
  radiusSm: '4px',
} as const

export interface InstitutionalConfig {
  systemName: string
  tagline: string
  institutionName: string | null
  cnpj: string | null
  supportEmail: string | null
  portalUrl: string
  isProductionReady: boolean
  validationIssues: string[]
}

/**
 * Obtém a configuração institucional a partir de variáveis de ambiente reais,
 * eliminando valores fictícios, CNPJs inventados ou domínios não validados (Fase 5.2 - Seção 1).
 */
export function getInstitutionalConfig(): InstitutionalConfig {
  const systemName = process.env.NEXT_PUBLIC_APP_NAME || 'NefroHub'
  const tagline = 'Plataforma Integrada de Cuidados Renais'
  const institutionName = process.env.INSTITUTION_NAME || null
  const cnpj = process.env.INSTITUTION_CNPJ || null
  const supportEmail = process.env.SUPPORT_EMAIL || process.env.SMTP_USER || null
  const portalUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

  const validationIssues: string[] = []

  if (!institutionName) {
    validationIssues.push('INSTITUTION_NAME não configurado no ambiente.')
  }
  if (!supportEmail || !supportEmail.includes('@')) {
    validationIssues.push('SUPPORT_EMAIL não configurado ou inválido no ambiente.')
  }
  if (!cnpj) {
    validationIssues.push('INSTITUTION_CNPJ não configurado no ambiente.')
  }

  const isProductionReady = validationIssues.length === 0

  return {
    systemName,
    tagline,
    institutionName,
    cnpj,
    supportEmail,
    portalUrl,
    isProductionReady,
    validationIssues,
  }
}

/**
 * Mantido como atalho de leitura segura para componentes que precisam de valores imediatos.
 * Não utiliza dados inventados ou alegações regulatórias não confirmadas.
 */
export const INSTITUTIONAL_INFO = {
  systemName: 'NefroHub',
  tagline: 'Plataforma Integrada de Cuidados Renais',
  get institutionName() {
    return getInstitutionalConfig().institutionName || 'NefroHub'
  },
  get cnpj() {
    return getInstitutionalConfig().cnpj
  },
  get supportEmail() {
    return getInstitutionalConfig().supportEmail || 'contato@nefrohub.local'
  },
  get portalUrl() {
    return getInstitutionalConfig().portalUrl
  },
} as const
