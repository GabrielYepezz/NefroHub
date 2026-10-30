import nodemailer from 'nodemailer'
import { assertClinicalPrivacy } from './sanitizer'
import { INSTITUTIONAL_INFO, getInstitutionalConfig } from './tokens'
import { createServerClient } from '@supabase/ssr'

export type EmailDeliveryStatus =
  | 'SUBMITTED_TO_PROVIDER'
  | 'SIMULATED'
  | 'BLOCKED_PRIVACY'
  | 'BLOCKED_UNCONFIGURED'
  | 'INVALID_RECIPIENT'
  | 'FAILED_PROVIDER'
  | 'DUPLICATE_IGNORED'

export interface SendEmailPayload {
  to: string
  subject: string
  html: string
  text: string
  eventType: string
  targetUserId?: string
  correlationId?: string
  idempotencyKey?: string
}

export interface SendEmailResult {
  success: boolean
  status: EmailDeliveryStatus
  messageId?: string
  error?: string
  duplicate?: boolean
}

// Cache deslizante em memória para proteção contra duplicidade em retries imediatos (TTL 5 min)
const idempotencyCache = new Map<string, number>()
const IDEMPOTENCY_TTL_MS = 5 * 60 * 1000

function isRecentDuplicate(key: string): boolean {
  const now = Date.now()
  const lastSent = idempotencyCache.get(key)
  if (lastSent && now - lastSent < IDEMPOTENCY_TTL_MS) {
    return true
  }
  idempotencyCache.set(key, now)
  // Limpeza de entradas antigas se o mapa crescer
  if (idempotencyCache.size > 1000) {
    for (const [k, timestamp] of idempotencyCache.entries()) {
      if (now - timestamp > IDEMPOTENCY_TTL_MS) {
        idempotencyCache.delete(k)
      }
    }
  }
  return false
}

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
 * Cria ou recupera o transport do Nodemailer baseado em variáveis de ambiente,
 * com timeouts seguros para prevenir travamento do processo do servidor.
 */
function createTransport() {
  const host = process.env.SMTP_HOST
  const port = Number(process.env.SMTP_PORT) || 587
  const user = process.env.SMTP_USER
  const pass = process.env.SMTP_PASS

  if (!host || !user || !pass) {
    return null
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: {
      user,
      pass,
    },
    // Timeouts explícitos para evitar bloqueio indefinido
    connectionTimeout: 8000,
    greetingTimeout: 8000,
    socketTimeout: 15000,
    tls: {
      rejectUnauthorized: process.env.NODE_ENV === 'production',
    },
  })
}

/**
 * Serviço Unificado de Envio Transacional de E-mails do NefroHub (Fase 5.2 - Seção 3)
 * 
 * Invariantes Fundamentais:
 * 1. NUNCA contém dados clínicos, diagnósticos, medições, exames ou CPFs.
 * 2. Uma falha de envio NUNCA cancela ou desfaz uma transação clínica já confirmada.
 * 3. O modo simulado NUNCA registra mensagens como entregues reais.
 * 4. Idempotência ativa: previne disparos repetidos para o mesmo evento lógico.
 * 5. Logs auditados NUNCA gravam corpos completos, senhas ou tokens confidenciais.
 */
export async function sendTransactionalEmail(payload: SendEmailPayload): Promise<SendEmailResult> {
  const { to, subject, html, text, eventType, targetUserId, correlationId, idempotencyKey } = payload

  // 1. Validação estrita de formato do e-mail do destinatário no servidor
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!to || !emailRegex.test(to.trim())) {
    console.warn(`[EmailService] Destinatário inválido rejeitado no servidor: "${to}"`)
    return {
      success: false,
      status: 'INVALID_RECIPIENT',
      error: 'Endereço de e-mail do destinatário inválido.',
    }
  }

  // 2. Proteção contra duplicação de disparos (Idempotência)
  const dedupKey = idempotencyKey || `${eventType}:${targetUserId || to}:${correlationId || 'default'}`
  if (isRecentDuplicate(dedupKey)) {
    console.warn(`[EmailService] Disparo duplicado suprimido por idempotência para chave: ${dedupKey}`)
    return {
      success: true,
      status: 'DUPLICATE_IGNORED',
      duplicate: true,
    }
  }

  // 3. Barreira Inegociável de Privacidade Clínica
  const privacyCheck = assertClinicalPrivacy(subject, html, text)
  if (!privacyCheck.isSafe) {
    const errorMsg = `Envio de e-mail bloqueado por violação de privacidade clínica: ${privacyCheck.violations.join('; ')}`
    console.error(`[EmailService] SEGURANÇA: ${errorMsg}`)

    try {
      const supabaseAdmin = getAdminClient()
      await supabaseAdmin.from('audit_events').insert({
        user_id: targetUserId || '00000000-0000-0000-0000-000000000000',
        action: 'EMAIL_PRIVACY_BLOCKED',
        resource: 'email_service',
        result: 'FAILURE',
        justification: privacyCheck.violations.join('; '),
        metadata: {
          event_type: eventType,
          to_domain: to.split('@')[1] || 'unknown',
        },
      })
    } catch {
      // Falha defensiva de log não trava a aplicação
    }

    return {
      success: false,
      status: 'BLOCKED_PRIVACY',
      error: errorMsg,
    }
  }

  // 4. Verificação de prontidão institucional para disparos reais
  const instConfig = getInstitutionalConfig()
  const transport = createTransport()

  // Se houver transport configurado mas dados institucionais não forem válidos, bloqueia envio real
  if (transport && !instConfig.isProductionReady && process.env.ALLOW_DEV_REAL_EMAILS !== 'true') {
    const reason = `Envio real bloqueado: Dados institucionais obrigatórios pendentes (${instConfig.validationIssues.join(', ')}). Configure o ambiente antes de habilitar envios reais.`
    console.warn(`[EmailService] ${reason}`)
    return {
      success: false,
      status: 'BLOCKED_UNCONFIGURED',
      error: reason,
    }
  }

  // 5. Tentar submissão real via SMTP se configurado
  const fromAddress = process.env.SMTP_FROM || `${INSTITUTIONAL_INFO.systemName} <${instConfig.supportEmail || 'no-reply@nefrohub.local'}>`

  if (transport) {
    try {
      const info = await transport.sendMail({
        from: fromAddress,
        to,
        subject,
        html,
        text,
      })

      // Registrar auditoria de submissão ao provedor
      try {
        const supabaseAdmin = getAdminClient()
        await supabaseAdmin.from('audit_events').insert({
          user_id: targetUserId || '00000000-0000-0000-0000-000000000000',
          action: 'EMAIL_SUBMITTED_TO_PROVIDER',
          resource: 'email_service',
          result: 'SUCCESS',
          correlation_id: correlationId || null,
          metadata: {
            event_type: eventType,
            message_id: info.messageId,
            to_domain: to.split('@')[1] || 'unknown',
            idempotency_key: dedupKey,
          },
        })
      } catch (logErr: any) {
        console.warn('[EmailService] Falha ao registrar auditoria de e-mail:', logErr.message)
      }

      return {
        success: true,
        status: 'SUBMITTED_TO_PROVIDER',
        messageId: info.messageId,
      }
    } catch (smtpErr: any) {
      console.error('[EmailService] Falha na submissão via SMTP:', smtpErr.message)

      try {
        const supabaseAdmin = getAdminClient()
        await supabaseAdmin.from('audit_events').insert({
          user_id: targetUserId || '00000000-0000-0000-0000-000000000000',
          action: 'EMAIL_SUBMISSION_FAILED', // Registra falha de submissão/entrega (EMAIL_DELIVERY_FAILED)
          resource: 'email_service',
          result: 'FAILURE',
          justification: smtpErr.message,
          metadata: {
            event_type: eventType,
            to_domain: to.split('@')[1] || 'unknown',
            idempotency_key: dedupKey,
          },
        })
      } catch {
        // Preserva estabilidade da transação chamadora
      }

      return {
        success: false,
        status: 'FAILED_PROVIDER',
        error: `Falha na submissão de e-mail ao provedor: ${smtpErr.message}`,
      }
    }
  }

  // 6. Modo Simulado Controlado (quando SMTP não está configurado)
  console.log(`[EmailService - Modo Simulado] Evento: ${eventType} | Destinatário: ${to} | Assunto: "${subject}"`)

  try {
    const supabaseAdmin = getAdminClient()
    await supabaseAdmin.from('audit_events').insert({
      user_id: targetUserId || '00000000-0000-0000-0000-000000000000',
      action: 'EMAIL_SIMULATED',
      resource: 'email_service',
      result: 'SUCCESS',
      correlation_id: correlationId || null,
      metadata: {
        event_type: eventType,
        to_domain: to.split('@')[1] || 'unknown',
        simulated: true,
        idempotency_key: dedupKey,
      },
    })
  } catch {
    // Ignorado defensivamente
  }

  return {
    success: true,
    status: 'SIMULATED',
  }
}
