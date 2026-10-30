// src/app/auth/actions.ts
'use server'

import { createClient } from '@/lib/supabase/server'
import {
  publicRegisterSchema,
  loginSchema,
  passwordPolicySchema,
  PublicRegisterFormValues,
  LoginFormValues,
} from '@/lib/validators/auth'
import { redirect } from 'next/navigation'

export async function loginAction(data: LoginFormValues) {
  const result = loginSchema.safeParse(data)

  if (!result.success) {
    return { error: 'E-mail ou senha em formato inválido.' }
  }

  const supabase = await createClient()
  const { error, data: authData } = await supabase.auth.signInWithPassword({
    email: result.data.email,
    password: result.data.password,
  })

  if (error || !authData.user) {
    return { error: 'Credenciais inválidas. Verifique seu e-mail e senha institucional.' }
  }

  // 1. Verificação de Status da Conta (Fase 3.1 - Regra Institucional A3)
  // Bloqueio rigoroso no servidor para contas suspensas, desativadas ou pendentes
  const { data: userProfile } = await supabase
    .from('users')
    .select('status, role, mfa_enabled')
    .eq('id', authData.user.id)
    .maybeSingle()

  const accountStatus = userProfile?.status?.toUpperCase()

  if (accountStatus === 'SUSPENDED' || accountStatus === 'DEACTIVATED') {
    await supabase.auth.signOut()
    return {
      error: 'Acesso bloqueado: Sua conta foi suspensa ou desativada pela governança institucional do hospital.',
    }
  }

  if (accountStatus === 'PENDING_APPROVAL') {
    await supabase.auth.signOut()
    return {
      error: 'Credenciamento em análise: Sua conta profissional está aguardando homologação pelo administrador.',
    }
  }

  // 2. Verificação de MFA / TOTP (documentation.md Seção 15.1 e 15.2 - RF-007)
  const rawRole = (userProfile?.role || authData.user.user_metadata?.role as string | undefined)?.toUpperCase() || 'PATIENT'
  const isInstitutionalRole = rawRole === 'ADMIN' || rawRole === 'DOCTOR' || rawRole === 'DOCTOR_MASTER'

  const { data: aalData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()

  if ((aalData?.nextLevel === 'aal2' || userProfile?.mfa_enabled === true) && aalData?.currentLevel !== 'aal2') {
    // Fator já cadastrado ou ativado: exige resolução do desafio TOTP no login
    return {
      requiresMFA: true,
      mode: 'CHALLENGE',
      role: rawRole,
      userId: authData.user.id,
      message: 'Segundo fator de autenticação (TOTP) obrigatório para este perfil.',
    }
  }

  // 3. Redirecionamento por papel institucional oficial
  if (rawRole === 'ADMIN') {
    redirect('/admin')
  } else if (rawRole === 'DOCTOR' || rawRole === 'DOCTOR_MASTER') {
    redirect('/doctor')
  } else {
    redirect('/patient/dashboard')
  }
}

/**
 * Cadastro Público (Fase 3.1 - Regras A1 e A2):
 * - Cria exclusivamente pré-cadastros de pacientes (role = 'PATIENT').
 * - Negação de autoatribuição: qualquer tentativa de enviar 'admin' ou 'doctor' é ignorada e rejeitada.
 * - Médicos e administradores só entram por credenciamento administrativo no backoffice.
 */
export async function registerAction(data: PublicRegisterFormValues) {
  const result = publicRegisterSchema.safeParse(data)

  if (!result.success) {
    const errorMsg = result.error.issues.map((i) => i.message).join('. ')
    return { error: errorMsg || 'Dados cadastrais inválidos fornecidos no formulário.' }
  }

  const supabase = await createClient()

  // Força no servidor o papel PATIENT. Dados enviados pelo cliente não definem privilégios.
  const { error, data: authData } = await supabase.auth.signUp({
    email: result.data.email,
    password: result.data.password,
    options: {
      data: {
        name: result.data.name,
        role: 'PATIENT', // Inegociável no servidor
        phone: result.data.phone || null,
      },
    },
  })

  if (error) {
    return { error: error.message }
  }

  // Redireciona o novo paciente para o portal
  redirect('/patient/dashboard')
}

export async function logoutAction() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}

/**
 * Solicitação de Recuperação de Senha (MVP Feature Matrix & documentation.md Seção 15.1)
 * Envia e-mail de redefinição com token seguro expirável e de uso único.
 * Responde com mensagem genérica para evitar enumeração de contas registradas.
 */
export async function resetPasswordAction(email: string) {
  const trimmed = email?.trim()
  if (!trimmed || !trimmed.includes('@')) {
    return { error: 'Informe um endereço de e-mail válido.' }
  }

  try {
    const supabase = await createClient()
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    const redirectTo = `${appUrl}/login?recovery=true`

    const { error } = await supabase.auth.resetPasswordForEmail(trimmed, {
      redirectTo,
    })

    if (error) {
      if ((error as any).status === 429 || (error as any).code === 'over_email_send_rate_limit') {
        return {
          error: 'Limite de envio atingido temporariamente. Aguarde alguns minutos ou contate a administração hospitalar.',
        }
      }
      // Retorno seguro não revela detalhes técnicos
      return { error: 'Não foi possível processar a solicitação no momento. Tente novamente mais tarde.' }
    }

    return {
      success: true,
      message: 'Se o e-mail informado estiver cadastrado, você receberá um link seguro para redefinição de acesso.',
    }
  } catch (err: any) {
    return { error: 'Falha temporária ao solicitar redefinição de senha.' }
  }
}

/**
 * Conclusão da Redefinição de Senha (Fase 5.2 - Seção 4)
 * Permite definir a nova senha exclusivamente após validação da sessão de recuperação.
 * Garante que contas suspensas ou inativas não contornem bloqueios institucionais.
 */
export async function updatePasswordAction(newPassword: string) {
  const parseResult = passwordPolicySchema.safeParse(newPassword)
  if (!parseResult.success) {
    return { error: 'A nova senha deve ter no mínimo 12 caracteres, conforme a política institucional (frases-senha são aceitas e recomendadas).' }
  }

  try {
    const supabase = await createClient()
    const { data: { user }, error: userError } = await supabase.auth.getUser()

    if (userError || !user) {
      return { error: 'Sessão de recuperação expirada ou inválida. Solicite um novo link de redefinição.' }
    }

    // Invariante de Segurança: Contas suspensas, inativas ou pendentes não podem contornar bloqueio
    const { data: dbUser } = await supabase
      .from('users')
      .select('status')
      .eq('id', user.id)
      .maybeSingle()

    if (dbUser && dbUser.status !== 'ACTIVE') {
      return {
        error: 'Sua conta encontra-se com restrição de acesso institucional (pendente ou inativa). Contate o administrador.',
      }
    }

    const { error: updateError } = await supabase.auth.updateUser({
      password: newPassword,
    })

    if (updateError) {
      return { error: `Não foi possível atualizar a senha: ${updateError.message}` }
    }

    // Registrar auditoria sem gravar senhas ou tokens
    try {
      await supabase.from('audit_events').insert({
        user_id: user.id,
        action: 'PASSWORD_RESET_COMPLETED',
        resource: 'auth',
        result: 'SUCCESS',
        metadata: { user_id: user.id },
      })
    } catch {
      // Log defensivo não bloqueia o fluxo principal
    }

    return {
      success: true,
      message: 'Senha atualizada com sucesso! Você já pode efetuar o login com suas novas credenciais.',
    }
  } catch (err: any) {
    return { error: 'Falha ao processar atualização de senha.' }
  }
}


