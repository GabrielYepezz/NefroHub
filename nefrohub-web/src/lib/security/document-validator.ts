import crypto from 'crypto'

export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024 // Estritamente 10 MB (10.485.760 bytes)

export type AllowedMimeType = 'application/pdf' | 'image/jpeg' | 'image/png'

export interface ValidatedFileResult {
  valid: boolean
  error?: string
  mimeType?: AllowedMimeType
  sha256Hash?: string
  sanitizedFileName?: string
  sizeBytes?: number
}

/**
 * Validação de Assinatura Binária (Magic Bytes) e Inspeção de Conteúdo Real
 * Não confia exclusivamente na extensão ou no MIME informado pelo navegador.
 */
export function validateFileMagicBytes(buffer: Buffer): { valid: boolean; mimeType?: AllowedMimeType; error?: string } {
  if (buffer.length < 8) {
    return { valid: false, error: 'Arquivo inválido ou corrompido (tamanho insuficiente).' }
  }

  // 1. Assinatura PDF: %PDF- (0x25, 0x50, 0x44, 0x46)
  if (buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46) {
    return { valid: true, mimeType: 'application/pdf' }
  }

  // 2. Assinatura JPEG: 0xFF, 0xD8, 0xFF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { valid: true, mimeType: 'image/jpeg' }
  }

  // 3. Assinatura PNG: 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return { valid: true, mimeType: 'image/png' }
  }

  return {
    valid: false,
    error: 'Formato de arquivo não suportado ou assinatura binária incompatível. São aceitos exclusivamente arquivos PDF, JPEG ou PNG genuínos.',
  }
}

/**
 * Sanitiza o nome do arquivo para prevenir ataques de Path Traversal
 */
export function sanitizeFileName(originalName: string): string {
  return originalName
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/\.{2,}/g, '_')
    .slice(-100)
}

/**
 * Calcula o hash criptográfico SHA-256 do arquivo para auditoria e integridade
 */
export function calculateSHA256(buffer: Buffer): string {
  return crypto.createHash('sha256').update(buffer).digest('hex')
}

/**
 * Pipeline completo de validação de arquivo clínico no servidor
 */
export function validateClinicalFile(buffer: Buffer, originalName: string): ValidatedFileResult {
  // 1. Limite de Tamanho Rigoroso (10 MB)
  if (buffer.length > MAX_FILE_SIZE_BYTES) {
    return {
      valid: false,
      error: `O arquivo excede o limite máximo permitido de 10 MB (tamanho atual: ${(buffer.length / (1024 * 1024)).toFixed(2)} MB).`,
    }
  }

  if (buffer.length === 0) {
    return { valid: false, error: 'O arquivo enviado está vazio.' }
  }

  // 2. Validação da Assinatura Binária
  const magicCheck = validateFileMagicBytes(buffer)
  if (!magicCheck.valid || !magicCheck.mimeType) {
    return { valid: false, error: magicCheck.error }
  }

  // 3. Cálculo de Hash SHA-256
  const sha256Hash = calculateSHA256(buffer)
  const sanitizedFileName = sanitizeFileName(originalName)

  return {
    valid: true,
    mimeType: magicCheck.mimeType,
    sha256Hash,
    sanitizedFileName,
    sizeBytes: buffer.length,
  }
}
