// src/app/auth/mfa-actions.ts
'use server'

import { createClient } from '@/lib/supabase/server'
import { createServerClient } from '@supabase/ssr'
import { revalidatePath } from 'next/cache'

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
 * Obtém o status de MFA/TOTP do usuário autenticado (RF-007)
 */
export async function getMFAStatusAction() {
  const supabase = await createClient()
  const { data: { user }, error: userError } = await supabase.auth.getUser()

  if (userError || !user) {
    return { error: 'Usuário não autenticado.' }
  }

  const { data: aalData, error: aalError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
  if (aalError) {
    return { error: 'Falha ao consultar nível de garantia de autenticação.' }
  }

  const { data: factorsData, error: factorsError } = await supabase.auth.mfa.listFactors()
  if (factorsError) {
    return { error: 'Falha ao consultar fatores de autenticação.' }
  }

  const { data: dbUser } = await supabase
    .from('users')
    .select('role, mfa_enabled')
    .eq('id', user.id)
    .maybeSingle()

  const role = dbUser?.role?.toUpperCase() || (user.user_metadata?.role as string | undefined)?.toUpperCase() || 'PATIENT'
  const isRequired = role === 'ADMIN' || role === 'DOCTOR' || role === 'DOCTOR_MASTER'
  const verifiedFactors = factorsData?.totp?.filter((f) => f.status === 'verified') || []
  const hasEnrolledMFA = verifiedFactors.length > 0 || Boolean(dbUser?.mfa_enabled)

  return {
    userId: user.id,
    role,
    isRequired,
    isEnrolled: hasEnrolledMFA,
    currentLevel: aalData?.currentLevel || 'aal1',
    nextLevel: aalData?.nextLevel || 'aal1',
    factorCount: verifiedFactors.length,
  }
}

/**
 * Inicia a inscrição no MFA/TOTP gerando QR Code SVG e segredo base32
 */
export async function startMFAEnrollmentAction() {
  const supabase = await createClient()
  const { data: { user }, error: userError } = await supabase.auth.getUser()

  if (userError || !user) {
    return { error: 'Sessão inválida ou expirada. Realize login novamente.' }
  }

  // Gera o novo fator TOTP no Supabase Auth
  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: 'totp',
    issuer: 'NefroHub',
    friendlyName: user.email || 'NefroHub Authenticator',
  })

  if (error || !data) {
    return { error: error?.message || 'Falha ao gerar credenciais de autenticação TOTP.' }
  }

  return {
    factorId: data.id,
    qrCode: data.totp.qr_code, // SVG Data URI seguro gerado pelo Supabase
    secret: data.totp.secret,
    uri: data.totp.uri,
  }
}

/**
 * Valida o código de 6 dígitos durante a configuração do TOTP e ativa o MFA
 */
export async function verifyMFAEnrollmentAction(factorId: string, code: string) {
  const trimmed = code?.trim()
  if (!trimmed || !/^\d{6}$/.test(trimmed)) {
    return { error: 'O código de autenticação deve conter exatamente 6 dígitos numéricos.' }
  }

  if (!factorId) {
    return { error: 'Identificador do fator de autenticação ausente.' }
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Sessão expirada. Realize login novamente.' }
  }

  const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({
    factorId,
    code: trimmed,
  })

  if (verifyError) {
    return { error: 'Código TOTP inválido ou expirado. Verifique o horário do dispositivo e tente novamente.' }
  }

  // Atualiza mfa_enabled = true no banco de dados com service role
  const supabaseAdmin = getAdminClient()
  await supabaseAdmin
    .from('users')
    .update({ mfa_enabled: true, updated_at: new Date().toISOString() })
    .eq('id', user.id)

  // Registra auditoria de segurança
  try {
    await supabaseAdmin
      .from('audit_events')
      .insert({
        user_id: user.id,
        action: 'MFA_ENROLLED_SUCCESS',
        resource_type: 'AUTH_MFA',
        resource_id: factorId,
        details: {
          method: 'TOTP',
          enrolled_at: new Date().toISOString(),
        },
      })
  } catch {
    // Falha silenciosa de telemetria não bloqueia MFA
  }

  revalidatePath('/', 'layout')
  return { success: true }
}

/**
 * Cria desafio de login para usuário que já possui TOTP ativado
 */
export async function createMFAChallengeAction() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Sessão não encontrada.' }
  }

  const { data: factorsData, error: factorsError } = await supabase.auth.mfa.listFactors()
  if (factorsError || !factorsData?.totp?.length) {
    return { error: 'Nenhum fator TOTP ativo encontrado para este usuário.' }
  }

  const verifiedFactor = factorsData.totp.find((f) => f.status === 'verified') || factorsData.totp[0]

  const { data: challengeData, error: challengeError } = await supabase.auth.mfa.challenge({
    factorId: verifiedFactor.id,
  })

  if (challengeError || !challengeData) {
    return { error: challengeError?.message || 'Falha ao emitir desafio de segundo fator.' }
  }

  return {
    factorId: verifiedFactor.id,
    challengeId: challengeData.id,
  }
}

/**
 * Conclui o desafio de segundo fator no login, elevando a sessão para AAL2
 */
export async function verifyMFAChallengeAction(factorId: string, challengeId: string, code: string) {
  const trimmed = code?.trim()
  if (!trimmed || !/^\d{6}$/.test(trimmed)) {
    return { error: 'O código de autenticação deve conter exatamente 6 dígitos numéricos.' }
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Sessão expirada. Inicie o login novamente.' }
  }

  const { error: verifyError } = await supabase.auth.mfa.verify({
    factorId,
    challengeId,
    code: trimmed,
  })

  if (verifyError) {
    return { error: 'Código de autenticação TOTP incorreto ou expirado. Tente novamente.' }
  }

  // Registra auditoria de sucesso de MFA
  try {
    const supabaseAdmin = getAdminClient()
    await supabaseAdmin
      .from('audit_events')
      .insert({
        user_id: user.id,
        action: 'MFA_CHALLENGE_VERIFIED',
        resource_type: 'AUTH_MFA',
        resource_id: factorId,
        details: {
          verified_at: new Date().toISOString(),
          aal: 'aal2',
        },
      })
  } catch {
    // Falha silenciosa de telemetria não bloqueia MFA
  }

  return { success: true }
}
