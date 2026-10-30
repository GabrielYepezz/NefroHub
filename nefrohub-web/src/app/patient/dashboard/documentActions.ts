'use server'

import { createClient } from '@/lib/supabase/server'
import { createServerClient } from '@supabase/ssr'
import { revalidatePath } from 'next/cache'
import { validateClinicalFile, MAX_FILE_SIZE_BYTES } from '@/lib/security/document-validator'
import crypto from 'crypto'

function getAdminClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: {
        getAll: () => [],
        setAll: () => {},
      },
    }
  )
}

/**
 * Validação de autorização para acesso a documentos clínicos
 */
async function verifyDocumentAccess(userId: string, patientId: string) {
  const supabaseAdmin = getAdminClient()

  // 1. O próprio paciente
  const { data: patientProfile } = await supabaseAdmin
    .from('patient_profiles')
    .select('id, user_id')
    .eq('id', patientId)
    .single()

  if (patientProfile && patientProfile.user_id === userId) {
    return { authorized: true, role: 'PATIENT' }
  }

  // 2. Médico com vínculo ativo
  const { data: physicianLink } = await supabaseAdmin
    .from('physician_patient_links')
    .select('id, status')
    .eq('patient_id', patientId)
    .eq('physician_user_id', userId)
    .eq('status', 'ACTIVE')
    .maybeSingle()

  if (physicianLink) {
    return { authorized: true, role: 'DOCTOR' }
  }

  // 3. Representante legal ativo com escopo de leitura
  const { data: representation } = await supabaseAdmin
    .from('patient_representations')
    .select('id, status, scope, valid_until')
    .eq('patient_id', patientId)
    .eq('representative_user_id', userId)
    .eq('status', 'ACTIVE')
    .maybeSingle()

  if (representation) {
    const isNotExpired = !representation.valid_until || new Date(representation.valid_until) >= new Date()
    const canView = (representation.scope as any)?.can_view_records === true
    if (isNotExpired && canView) {
      return { authorized: true, role: 'REPRESENTATIVE' }
    }
  }

  // 4. Administrador da instituição
  const { data: adminUser } = await supabaseAdmin
    .from('users')
    .select('role')
    .eq('id', userId)
    .single()

  if (adminUser?.role === 'ADMIN') {
    return { authorized: true, role: 'ADMIN' }
  }

  return { authorized: false }
}

/**
 * Upload Seguro de Documentos Clínicos (Seção 11)
 * Limite: 10 MB | Tipos: PDF, JPEG, PNG | Bucket Privado
 */
export async function uploadClinicalDocumentAction(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Não autorizado: Sessão não encontrada.' }
  }

  const file = formData.get('file') as File | null
  const title = (formData.get('title') as string) || 'Documento Clínico'
  const documentType = (formData.get('documentType') as string) || 'EXAM_REPORT'
  let targetPatientId = formData.get('patientId') as string | null

  if (!file) {
    return { error: 'Nenhum arquivo anexado para upload.' }
  }

  // Se o paciente não informou patientId, resolve pelo seu próprio user_id
  const supabaseAdmin = getAdminClient()
  if (!targetPatientId) {
    const { data: myProfile } = await supabaseAdmin
      .from('patient_profiles')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle()

    if (myProfile) {
      targetPatientId = myProfile.id
    }
  }

  if (!targetPatientId) {
    return { error: 'Prontuário de paciente de destino não especificado ou não localizado.' }
  }

  // Validar autorização de upload
  const authCheck = await verifyDocumentAccess(user.id, targetPatientId)
  if (!authCheck.authorized) {
    return { error: 'Acesso negado: Você não possui permissão para anexar documentos a este paciente.' }
  }

  // 1. Converter para Buffer e validar tamanho + Magic Bytes + SHA-256 no servidor
  const arrayBuffer = await file.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)

  const validation = validateClinicalFile(buffer, file.name)
  if (!validation.valid || !validation.mimeType || !validation.sha256Hash) {
    return { error: validation.error || 'Falha na validação de segurança do arquivo.' }
  }

  // 2. Definir caminho seguro no bucket privado (prevenindo colisões e directory traversal)
  const documentId = crypto.randomUUID()
  const storagePath = `${targetPatientId}/${documentId}-${validation.sanitizedFileName}`

  const isPhysician = authCheck.role === 'DOCTOR'
  const initialStatus = isPhysician ? 'CONFIRMED' : 'PENDING'

  // 3. Realizar Upload no Storage do Supabase (Bucket Privado)
  const { error: storageError } = await supabaseAdmin.storage
    .from('clinical-documents')
    .upload(storagePath, buffer, {
      contentType: validation.mimeType,
      upsert: false,
    })

  // Se o bucket privado ainda não existir remotamente, trata com mensagem explicativa
  if (storageError) {
    return {
      error: `Falha no armazenamento do arquivo: ${storageError.message}. Verifique se o bucket 'clinical-documents' está provisionado.`,
    }
  }

  // 4. Inserir metadados em public.documents
  const { data: docRecord, error: dbError } = await supabaseAdmin
    .from('documents')
    .insert({
      id: documentId,
      patient_id: targetPatientId,
      uploaded_by_user_id: user.id,
      document_type: documentType,
      title: title.trim(),
      storage_path: storagePath,
      file_size_bytes: validation.sizeBytes,
      mime_type: validation.mimeType,
      sha256_hash: validation.sha256Hash,
      validation_status: initialStatus,
      reviewed_by_user_id: isPhysician ? user.id : null,
      reviewed_at: isPhysician ? new Date().toISOString() : null,
    })
    .select('id')
    .single()

  // Tratamento de Falha Parcial: se o insert no banco falhar, desfaz o upload no Storage
  if (dbError || !docRecord) {
    await supabaseAdmin.storage.from('clinical-documents').remove([storagePath])
    return {
      error: `Erro ao registrar metadados do documento no prontuário. O upload foi revertido para evitar arquivos órfãos: ${dbError?.message}`,
    }
  }

  // 5. Auditoria Obrigatória
  await supabaseAdmin.from('audit_events').insert({
    user_id: user.id,
    patient_id: targetPatientId,
    action: 'CLINICAL_DOCUMENT_UPLOADED',
    resource: 'documents',
    result: 'SUCCESS',
    metadata: {
      document_id: documentId,
      storage_path: storagePath,
      sha256: validation.sha256Hash,
      size_bytes: validation.sizeBytes,
      mime_type: validation.mimeType,
      validation_status: initialStatus,
    },
  })

  revalidatePath('/patient/dashboard')
  revalidatePath('/doctor')
  return {
    success: true,
    documentId,
    message: isPhysician
      ? 'Documento clínico anexado e confirmado no prontuário.'
      : 'Documento enviado com sucesso! Ele foi encaminhado para a fila de conferência do seu médico.',
  }
}

/**
 * Emissão de URL Assinada Temporária de Curta Duração (Máximo 15 minutos = 900s)
 */
export async function getSignedDocumentUrlAction(documentId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Não autorizado: Sessão não encontrada.' }
  }

  const supabaseAdmin = getAdminClient()

  // 1. Buscar metadados do documento
  const { data: doc, error: fetchError } = await supabaseAdmin
    .from('documents')
    .select('id, patient_id, storage_path, title')
    .eq('id', documentId)
    .single()

  if (fetchError || !doc) {
    return { error: 'Documento clínico não localizado.' }
  }

  // 2. Validar autorização estrita de acesso
  const authCheck = await verifyDocumentAccess(user.id, doc.patient_id)
  if (!authCheck.authorized) {
    return { error: 'Acesso negado: Você não possui autorização para visualizar este documento.' }
  }

  // 3. Emitir URL Assinada com expiração de exatamente 15 minutos (900 segundos)
  const { data: signedData, error: signError } = await supabaseAdmin.storage
    .from('clinical-documents')
    .createSignedUrl(doc.storage_path, 900)

  if (signError || !signedData?.signedUrl) {
    return { error: `Erro ao emitir URL segura de visualização: ${signError?.message || 'Falha no storage'}` }
  }

  // 4. Auditoria de Leitura/Acesso Documental (Seção 15.4)
  await supabaseAdmin.from('audit_events').insert({
    user_id: user.id,
    patient_id: doc.patient_id,
    action: 'CLINICAL_DOCUMENT_ACCESSED',
    resource: 'documents',
    result: 'SUCCESS',
    metadata: { document_id: documentId, expires_in_seconds: 900 },
  })

  return {
    success: true,
    signedUrl: signedData.signedUrl,
    expiresInSeconds: 900,
  }
}

/**
 * Curadoria Médica: Confirmação de Documento Clínico (Seção 11.3)
 */
export async function confirmDocumentAction(documentId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Não autorizado: Sessão não encontrada.' }
  }

  // 1. Executar via RPC transacional atômica (Migration 005)
  const { data: rpcData, error: rpcError } = await supabase.rpc('rpc_confirm_document', {
    p_document_id: documentId,
  })

  if (rpcError) {
    if (rpcError.code === 'PGRST202') {
      return {
        error: 'Erro de integridade transacional: A rotina atômica rpc_confirm_document não está instalada no banco de dados (Migration 005 pendente no Supabase remoto). Operações de curadoria documental exigem transação atômica única.',
      }
    }
    return {
      error: `Falha na confirmação do laudo clínico [rpc_confirm_document]: ${rpcError.message}`,
    }
  }

  interface RpcDocResponse {
    success?: boolean
    message?: string
  }

  const res = rpcData as RpcDocResponse | null

  revalidatePath('/doctor')
  revalidatePath('/patient/dashboard')
  return { success: true, message: res?.message || 'Documento validado e confirmado no prontuário.' }
}

/**
 * Curadoria Médica: Rejeição de Documento Clínico com Justificativa (Seção 11.3)
 */
export async function rejectDocumentAction(documentId: string, reason: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Não autorizado: Sessão não encontrada.' }
  }

  if (!reason || reason.trim() === '') {
    return { error: 'A justificativa clínica de recusa do laudo é obrigatória.' }
  }

  // 1. Executar via RPC transacional atômica (Migration 005)
  const { data: rpcData, error: rpcError } = await supabase.rpc('rpc_reject_document', {
    p_document_id: documentId,
    p_reason: reason,
  })

  if (rpcError) {
    if (rpcError.code === 'PGRST202') {
      return {
        error: 'Erro de integridade transacional: A rotina atômica rpc_reject_document não está instalada no banco de dados (Migration 005 pendente no Supabase remoto). Operações de curadoria documental exigem transação atômica única.',
      }
    }
    return {
      error: `Falha na rejeição do laudo clínico [rpc_reject_document]: ${rpcError.message}`,
    }
  }

  interface RpcDocRejectResponse {
    success?: boolean
    message?: string
  }

  const res = rpcData as RpcDocRejectResponse | null

  revalidatePath('/doctor')
  revalidatePath('/patient/dashboard')
  return { success: true, message: res?.message || 'Documento rejeitado e arquivado na governança clínica.' }
}
