'use server'

import { createClient } from '@/lib/supabase/server'
import { createServerClient } from '@supabase/ssr'
import { revalidatePath } from 'next/cache'
import * as z from 'zod'
import { sendTransactionalEmail } from '@/lib/email/service'
import { createRepresentationRequestedEmail } from '@/lib/email/templates'

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

const requestRepresentationSchema = z.object({
  representativeEmail: z.string().trim().email('E-mail do representante inválido'),
  relationshipType: z.enum(['LEGAL_GUARDIAN', 'CAREGIVER', 'PROCURATOR', 'FAMILY'], {
    message: 'Selecione um tipo de relação válido',
  }),
  authorityType: z.enum(['FULL', 'CONSULT_ONLY', 'SUBMIT_VITALS'], {
    message: 'Selecione o nível de autoridade',
  }),
  proofRef: z.string().trim().optional(),
  validUntil: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Data de validade no formato AAAA-MM-DD')
    .optional()
    .or(z.literal('')),
})

export type RequestRepresentationDTO = z.infer<typeof requestRepresentationSchema>

/**
 * Solicitação de Representação Legal / Cuidador pelo Paciente Titular (Seção 5)
 * 
 * Regras Obrigatórias de Segurança (Fase 4.1):
 * 1. O paciente só pode solicitar para o seu próprio prontuário.
 * 2. Nasce ESTRITAMENTE em status PENDING (não concede acesso clínico delegado).
 * 3. Proíbe que o paciente represente a si mesmo.
 * 4. Grava auditoria obrigatória.
 */
export async function requestRepresentationAction(payload: RequestRepresentationDTO) {
  const validation = requestRepresentationSchema.safeParse(payload)
  if (!validation.success) {
    const errorMsg = validation.error.issues.map((i) => i.message).join('. ')
    return { error: errorMsg }
  }

  const { representativeEmail, relationshipType, authorityType, proofRef, validUntil } = validation.data
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Não autorizado: Sessão não encontrada.' }
  }

  // 1. Executar via RPC PostgreSQL transacional atômica (Migration 004)
  const { data: rpcData, error: rpcError } = await supabase.rpc('rpc_request_representation', {
    p_representative_email: representativeEmail,
    p_relationship_type: relationshipType,
    p_authority_type: authorityType,
    p_proof_ref: proofRef || null,
    p_valid_until: validUntil || null,
  })

  if (rpcError) {
    if (rpcError.code === 'PGRST202') {
      return {
        error: 'Erro de integridade transacional: A rotina atômica rpc_request_representation não está instalada no banco de dados (Migration 004 pendente no Supabase remoto). Operações de delegação de acesso exigem transação atômica única.',
      }
    }
    return {
      error: `Falha na solicitação de representação [rpc_request_representation]: ${rpcError.message}`,
    }
  }

  interface RpcRepResponse {
    success?: boolean
    message?: string
  }

  const res = rpcData as RpcRepResponse | null

  // Notificar o representante indicado de forma segura e não-bloqueante
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const emailContent = createRepresentationRequestedEmail({
    representativeName: representativeEmail.split('@')[0],
    portalLink: `${appUrl}/login`,
  })
  sendTransactionalEmail({
    to: representativeEmail,
    subject: emailContent.subject,
    html: emailContent.html,
    text: emailContent.text,
    eventType: 'REPRESENTATION_REQUESTED',
    idempotencyKey: `REPRESENTATION_REQUESTED:${representativeEmail}:${user.id}`,
  }).catch((err) => console.warn('[requestRepresentationAction] Falha no envio de e-mail ao representante:', err))

  revalidatePath('/patient/dashboard')
  return {
    success: true,
    message: res?.message || 'Solicitação enviada com sucesso.',
  }
}

/**
 * Revogação de Representação pelo Paciente Titular (ou Administrador)
 */
export async function revokeRepresentationAction(representationId: string, reason?: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Não autorizado: Sessão não encontrada.' }
  }

  // Executar via RPC transacional atômica (Migration 004)
  const { data: rpcData, error: rpcError } = await supabase.rpc('rpc_revoke_representation', {
    p_representation_id: representationId,
    p_reason: reason || null,
  })

  if (rpcError) {
    if (rpcError.code === 'PGRST202') {
      return {
        error: 'Erro de integridade transacional: A rotina atômica rpc_revoke_representation não está instalada no banco de dados (Migration 004 pendente no Supabase remoto). Operações de revogação exigem transação atômica única.',
      }
    }
    return {
      error: `Falha na revogação da representação [rpc_revoke_representation]: ${rpcError.message}`,
    }
  }

  interface RpcRevokeResponse {
    success?: boolean
    message?: string
  }

  const res = rpcData as RpcRevokeResponse | null

  revalidatePath('/patient/dashboard')
  revalidatePath('/admin/vinculos')
  return { success: true, message: res?.message || 'Representação revogada com sucesso.' }
}
