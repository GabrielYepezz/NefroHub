import crypto from 'crypto'

/**
 * Normaliza um nome para comparação e busca de homônimos prováveis:
 * - Converte para minúsculas
 * - Remove acentuações e caracteres diacríticos
 * - Remove espaços extras
 */
export function normalizeName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
}

/**
 * Remove formatação e caracteres não numéricos de um CPF.
 */
export function cleanCpf(cpf: string): string {
  return cpf.replace(/\D/g, '')
}

/**
 * Validação dos dígitos verificadores do CPF brasileiro.
 */
export function isValidCpf(cpf: string): boolean {
  const clean = cleanCpf(cpf)
  if (clean.length !== 11) return false
  if (/^(\d)\1{10}$/.test(clean)) return false // Elimina números com todos dígitos iguais (ex: 11111111111)

  let sum = 0
  let remainder: number

  for (let i = 1; i <= 9; i++) {
    sum += parseInt(clean.substring(i - 1, i), 10) * (11 - i)
  }
  remainder = (sum * 10) % 11
  if (remainder === 10 || remainder === 11) remainder = 0
  if (remainder !== parseInt(clean.substring(9, 10), 10)) return false

  sum = 0
  for (let i = 1; i <= 10; i++) {
    sum += parseInt(clean.substring(i - 1, i), 10) * (12 - i)
  }
  remainder = (sum * 10) % 11
  if (remainder === 10 || remainder === 11) remainder = 0
  if (remainder !== parseInt(clean.substring(10, 11), 10)) return false

  return true
}

/**
 * Gera máscara segura para exibição pública em interface (Seção 3.2):
 * Exemplo: 123.456.789-01 -> ***.456.789-**
 */
export function maskCpf(cpf: string): string {
  const clean = cleanCpf(cpf)
  if (clean.length !== 11) return '***.***.***-**'
  return `***.${clean.substring(3, 6)}.${clean.substring(6, 9)}-**`
}

/**
 * Gera blind index HMAC-SHA-256 para permitir busca por unicidade sem expor o CPF em texto plano (Seção 3.2).
 */
export function generateCpfHash(cpf: string): string {
  const clean = cleanCpf(cpf)
  const secret = process.env.HMAC_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || 'nefrohub-default-hmac-secret'
  return crypto.createHmac('sha256', secret).update(clean).digest('hex')
}
