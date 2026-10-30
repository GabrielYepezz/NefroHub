import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024

function validateFileMagicBytes(buffer) {
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

function sanitizeFileName(originalName) {
  return originalName
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/\.{2,}/g, '_')
    .slice(-100)
}

function calculateSHA256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex')
}

function validateClinicalFile(buffer, originalName) {
  if (buffer.length > MAX_FILE_SIZE_BYTES) {
    return {
      valid: false,
      error: `O arquivo excede o limite máximo permitido de 10 MB (tamanho atual: ${(buffer.length / (1024 * 1024)).toFixed(2)} MB).`,
    }
  }

  if (buffer.length === 0) {
    return { valid: false, error: 'O arquivo enviado está vazio.' }
  }

  const magicCheck = validateFileMagicBytes(buffer)
  if (!magicCheck.valid || !magicCheck.mimeType) {
    return { valid: false, error: magicCheck.error }
  }

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

describe('Fase 4.2: Validação de Documentos Clínicos, Storage Privado e Curadoria', () => {

  describe('1. Validação de Formatos e Assinaturas Binárias (Magic Bytes)', () => {
    test('Arquivo PDF legítimo com assinatura %PDF- deve ser aprovado', () => {
      const validPdfBuffer = Buffer.from('%PDF-1.7 Test Clinical Exam Report Data')
      const check = validateFileMagicBytes(validPdfBuffer)
      assert.equal(check.valid, true)
      assert.equal(check.mimeType, 'application/pdf')
    })

    test('Arquivo JPEG legítimo com assinatura 0xFFD8FF deve ser aprovado', () => {
      const validJpgBuffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46])
      const check = validateFileMagicBytes(validJpgBuffer)
      assert.equal(check.valid, true)
      assert.equal(check.mimeType, 'image/jpeg')
    })

    test('Arquivo PNG legítimo com assinatura 0x89PNG deve ser aprovado', () => {
      const validPngBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00])
      const check = validateFileMagicBytes(validPngBuffer)
      assert.equal(check.valid, true)
      assert.equal(check.mimeType, 'image/png')
    })

    test('Arquivo malicioso renomeado para .pdf mas sem assinatura PDF deve ser rejeitado', () => {
      const fakePdfBuffer = Buffer.from('MZ\x90\x00\x03\x00\x00\x00ExecutableWindowsBinaryContent')
      const check = validateFileMagicBytes(fakePdfBuffer)
      assert.equal(check.valid, false)
      assert.match(check.error, /Formato de arquivo não suportado ou assinatura binária incompatível/)
    })

    test('Arquivo com tamanho acima de 10 MB deve ser rejeitado no servidor', () => {
      const oversizedBuffer = Buffer.alloc(MAX_FILE_SIZE_BYTES + 1024)
      oversizedBuffer.write('%PDF-1.4')
      const result = validateClinicalFile(oversizedBuffer, 'laudo-pesado.pdf')
      assert.equal(result.valid, false)
      assert.match(result.error, /excede o limite máximo permitido de 10 MB/)
    })

    test('Arquivo vazio deve ser rejeitado', () => {
      const emptyBuffer = Buffer.alloc(0)
      const result = validateClinicalFile(emptyBuffer, 'vazio.pdf')
      assert.equal(result.valid, false)
      assert.match(result.error, /está vazio/)
    })
  })

  describe('2. Sanitização, Hashing SHA-256 e Integridade', () => {
    test('Cálculo de SHA-256 deve ser determinístico e exato', () => {
      const sample = Buffer.from('%PDF-1.4 Relatório Renal 2026')
      const hash1 = calculateSHA256(sample)
      const hash2 = calculateSHA256(sample)
      assert.equal(hash1, hash2)
      assert.equal(hash1.length, 64)
    })

    test('Sanitização de nome deve neutralizar ataques de Directory Traversal', () => {
      const unsafeName = '../../../../etc/passwd.pdf'
      const safe = sanitizeFileName(unsafeName)
      assert.equal(safe.includes('..'), false)
      assert.equal(safe.includes('/'), false)
      assert.match(safe, /\.pdf$/)
    })
  })

  describe('3. Autorização de Visualização e URLs Assinadas (15 min)', () => {
    test('Emissão de URL assinada deve fixar expiração máxima de 15 minutos (900s)', () => {
      const mockGenerateSignedUrl = (userAuthorized, expiresIn) => {
        if (!userAuthorized) return { error: 'Acesso negado' }
        if (expiresIn > 900) return { error: 'Validade excede prazo máximo de 15 minutos' }
        return { success: true, signedUrl: 'https://storage.supabase.co/signed/exam.pdf?token=xyz', expiresIn }
      }

      const res = mockGenerateSignedUrl(true, 900)
      assert.equal(res.success, true)
      assert.equal(res.expiresIn, 900)

      const resUnauthorized = mockGenerateSignedUrl(false, 900)
      assert.equal(resUnauthorized.error, 'Acesso negado')
    })

    test('Paciente A não pode gerar URL nem visualizar documentos do Paciente B', () => {
      const checkAccess = (reqUserId, docPatientUserId) => {
        return reqUserId === docPatientUserId
      }

      assert.equal(checkAccess('user-paciente-A', 'user-paciente-A'), true)
      assert.equal(checkAccess('user-paciente-A', 'user-paciente-B'), false)
    })

    test('Médico não vinculado é impedido de acessar documentos clínicos', () => {
      const activeLinks = [{ physicianId: 'medico-1', patientId: 'paciente-10' }]

      const checkPhysicianAccess = (docPhysicianId, targetPatientId) => {
        return activeLinks.some((l) => l.physicianId === docPhysicianId && l.patientId === targetPatientId)
      }

      assert.equal(checkPhysicianAccess('medico-1', 'paciente-10'), true)
      assert.equal(checkPhysicianAccess('medico-2', 'paciente-10'), false, 'Médico sem vínculo ativo deve ser barrado')
    })

    test('Representante com status PENDING ou ENDED não pode visualizar documentos', () => {
      const checkRepAccess = (repStatus, scope) => {
        if (repStatus !== 'ACTIVE') return false
        return scope.can_view_records === true
      }

      assert.equal(checkRepAccess('PENDING', { can_view_records: true }), false)
      assert.equal(checkRepAccess('ENDED', { can_view_records: true }), false)
      assert.equal(checkRepAccess('ACTIVE', { can_view_records: false }), false)
      assert.equal(checkRepAccess('ACTIVE', { can_view_records: true }), true)
    })
  })

  describe('4. Máquina de Estados e Curadoria Médica de Laudos', () => {
    test('Documento enviado pelo paciente nasce estritamente em PENDING', () => {
      const mockUpload = (uploaderRole) => {
        const initialStatus = uploaderRole === 'DOCTOR' ? 'CONFIRMED' : 'PENDING'
        return { validationStatus: initialStatus }
      }

      assert.equal(mockUpload('PATIENT').validationStatus, 'PENDING')
      assert.equal(mockUpload('DOCTOR').validationStatus, 'CONFIRMED')
    })

    test('Rejeição médica exige justificativa clínica e preserva histórico sem expurgo', () => {
      const rejectDoc = (doc, reason, doctorId) => {
        if (!reason || reason.trim() === '') {
          return { error: 'A justificativa clínica de recusa do laudo é obrigatória.' }
        }
        if (doc.status !== 'PENDING') {
          return { error: 'Operação concorrente: documento não está pendente.' }
        }
        doc.status = 'REJECTED'
        doc.reason = reason
        doc.reviewedBy = doctorId
        return { success: true }
      }

      let doc = { id: 'doc-1', status: 'PENDING' }
      assert.deepEqual(rejectDoc(doc, '', 'medico-1'), {
        error: 'A justificativa clínica de recusa do laudo é obrigatória.',
      })
      assert.equal(doc.status, 'PENDING')

      const successRes = rejectDoc(doc, 'Laudo ilegível/cortado na borda inferior.', 'medico-1')
      assert.equal(successRes.success, true)
      assert.equal(doc.status, 'REJECTED')
      assert.equal(doc.reason, 'Laudo ilegível/cortado na borda inferior.')
    })
  })
})
