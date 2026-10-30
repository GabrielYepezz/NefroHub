'use server'

import { createClient } from '@/lib/supabase/server'
import { createServerClient } from '@supabase/ssr'
import { revalidatePath } from 'next/cache'
import crypto from 'crypto'
import { registerDoctorSchema, RegisterDoctorFormValues } from '@/lib/validators/physician'
import { sendTransactionalEmail } from '@/lib/email/service'
import { createDoctorApprovedEmail } from '@/lib/email/templates'

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
 * Validação de privilégio administrativo no servidor (PRD Seção 2.2)
 */
async function verifyAdminAuthorization() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    throw new Error('Não autorizado: Sessão não encontrada.')
  }

  const role = (user.user_metadata?.role as string | undefined)?.toUpperCase()
  if (role !== 'ADMIN') {
    throw new Error('Acesso negado: Apenas administradores do hospital podem cadastrar ou gerenciar médicos.')
  }

  return user.id
}

/**
 * Cadastro Institucional de Médico pelo Administrador (PRD Seção 2.3)
 * - Valida campos obrigatórios (Nome, E-mail, CRM, CRM/UF, Especialidade)
 * - Garante unicidade de e-mail e par (crm, crm_uf)
 * - Cria conta no auth e insere em users com status PENDING_APPROVAL
 * - Insere em physician_profiles com validation_status PENDING
 * - Registra evento em audit_events
 */
export async function registerDoctorAction(data: RegisterDoctorFormValues) {
  try {
    const adminId = await verifyAdminAuthorization()
    const parsed = registerDoctorSchema.safeParse(data)

    if (!parsed.success) {
      const msg = parsed.error.issues.map((i) => i.message).join('. ')
      return { error: msg || 'Dados cadastrais do médico inválidos.' }
    }

    const { name, email, phone, crm, crmUf, specialty, isMaster } = parsed.data
    const supabaseAdmin = getAdminClient()

    // 1. Checar unicidade do CRM/UF em physician_profiles
    const { data: existingCrm } = await supabaseAdmin
      .from('physician_profiles')
      .select('id, crm, crm_uf')
      .eq('crm', crm)
      .eq('crm_uf', crmUf)
      .maybeSingle()

    if (existingCrm) {
      return { error: `Já existe um profissional cadastrado com o CRM ${crm}/${crmUf}.` }
    }

    // 2. Checar unicidade de e-mail em users
    const { data: existingUser } = await supabaseAdmin
      .from('users')
      .select('id, email')
      .eq('email', email)
      .maybeSingle()

    if (existingUser) {
      return { error: `Já existe um usuário no sistema com o e-mail ${email}.` }
    }

    // 3. Buscar instituição padrão
    const { data: inst } = await supabaseAdmin
      .from('institutions')
      .select('id')
      .limit(1)
      .maybeSingle()

    const institutionId = inst?.id || '00000000-0000-0000-0000-000000000001'

    // 4. Convidar usuário em auth.users (dispara e-mail de ativação/convite oficial)
    const roleString = isMaster ? 'DOCTOR_MASTER' : 'DOCTOR'
    let doctorUserId: string
    let emailSent = false
    let inviteLink: string | null = null

    const { data: inviteData, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(
      email,
      {
        data: {
          name,
          role: roleString,
          crm,
          crm_uf: crmUf,
          phone: phone || null,
        },
      }
    )

    if (!inviteError && inviteData.user) {
      doctorUserId = inviteData.user.id
      emailSent = true
    } else {
      console.warn('[registerDoctorAction] Aviso no envio de e-mail de convite pelo Supabase:', inviteError?.message || inviteError)
      // Fallback gracioso caso haja limite de envio de e-mails no Supabase (429 over_email_send_rate_limit)
      const tempPassword = crypto.randomBytes(16).toString('hex') + '!Nefro1'
      const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password: tempPassword,
        email_confirm: false,
        user_metadata: {
          name,
          role: roleString,
          crm,
          crm_uf: crmUf,
          phone: phone || null,
        },
      })

      if (authError || !authUser?.user) {
        // Se já existe no auth, tenta recuperar ID
        const { data: userList } = await supabaseAdmin.auth.admin.listUsers()
        const existing = userList?.users?.find((u) => u.email?.toLowerCase() === email.toLowerCase())
        if (existing) {
          doctorUserId = existing.id
        } else {
          return { error: `Erro ao provisionar usuário de autenticação: ${authError?.message || inviteError?.message || 'Falha no Auth'}` }
        }
      } else {
        doctorUserId = authUser.user.id
      }
    }

    // Gerar link de ativação direto (para contingência, desenvolvimento ou cópia imediata pelo admin)
    try {
      const { data: linkData } = await supabaseAdmin.auth.admin.generateLink({
        type: 'invite',
        email,
      })
      if (linkData?.properties?.action_link) {
        inviteLink = linkData.properties.action_link
      }
    } catch {
      // Contingência não-bloqueante
    }

    // 5. Inserir ou atualizar em public.users com status PENDING_APPROVAL
    // O trigger do banco (on_auth_user_created) cria o registro automaticamente em public.users.
    // O uso de upsert garante que os dados sejam sincronizados com status PENDING_APPROVAL sem erro de duplicate key (users_pkey).
    const { error: userInsertError } = await supabaseAdmin.from('users').upsert({
      id: doctorUserId,
      name,
      email,
      phone: phone || null,
      role: roleString,
      status: 'PENDING_APPROVAL', // Não concede acesso clínico antes de homologado
      mfa_enabled: false,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id' })

    if (userInsertError) {
      // Compensação reversa
      await supabaseAdmin.auth.admin.deleteUser(doctorUserId)
      return { error: `Erro ao registrar dados de usuário: ${userInsertError.message}` }
    }

    // 6. Inserir em public.physician_profiles
    const { error: profileError } = await supabaseAdmin.from('physician_profiles').insert({
      user_id: doctorUserId,
      institution_id: institutionId,
      crm,
      crm_uf: crmUf,
      specialty: specialty || 'Nefrologia',
      validation_status: 'PENDING',
      is_master: isMaster,
      is_active: false,
    })

    if (profileError) {
      // Compensação reversa
      await supabaseAdmin.from('users').delete().eq('id', doctorUserId)
      await supabaseAdmin.auth.admin.deleteUser(doctorUserId)
      return { error: `Erro ao registrar perfil médico: ${profileError.message}` }
    }

    // 7. Auditoria obrigatória append-only
    await supabaseAdmin.from('audit_events').insert({
      user_id: adminId,
      action: 'PHYSICIAN_REGISTERED',
      resource: 'physician_profiles',
      result: 'SUCCESS',
      metadata: {
        doctor_user_id: doctorUserId,
        crm,
        crm_uf: crmUf,
        specialty,
        is_master: isMaster,
        email_sent: emailSent,
      },
    })

    revalidatePath('/admin/medicos')
    revalidatePath('/admin/filas')
    return {
      success: true,
      emailSent,
      message: emailSent
        ? `Dr(a). ${name} (CRM ${crm}/${crmUf}) cadastrado! E-mail de ativação disparado para ${email}.`
        : `Dr(a). ${name} (CRM ${crm}/${crmUf}) cadastrado! (Aviso: limite de envio de e-mails do Supabase atingido. Utilize o link direto de ativação gerado).`,
      inviteLink: inviteLink || undefined,
    }
  } catch (err: any) {
    return { error: err.message || 'Falha ao processar cadastro institucional de médico.' }
  }
}

/**
 * Homologar Médico diretamente pelo Administrador
 */
export async function approveDoctorAction(userId: string) {
  try {
    const adminId = await verifyAdminAuthorization()
    const supabaseAdmin = getAdminClient()

    const { data: updatedUsers, error: userError } = await supabaseAdmin
      .from('users')
      .update({ status: 'ACTIVE' })
      .eq('id', userId)
      .eq('status', 'PENDING_APPROVAL')
      .select('id, name, email')

    if (userError) {
      return { error: `Erro ao ativar médico: ${userError.message}` }
    }

    if (!updatedUsers || updatedUsers.length === 0) {
      return { error: 'Médico já homologado ou não se encontra pendente de aprovação.' }
    }

    const doctorUser = updatedUsers[0]

    await supabaseAdmin
      .from('physician_profiles')
      .update({
        validation_status: 'VALIDATED',
        is_active: true,
        validated_by_user_id: adminId,
        validated_at: new Date().toISOString(),
      })
      .eq('user_id', userId)

    await supabaseAdmin.from('audit_events').insert({
      user_id: adminId,
      action: 'PHYSICIAN_APPROVED',
      resource: 'users',
      result: 'SUCCESS',
      metadata: { target_user_id: userId },
    })

    // Disparo de notificação transacional segura (documentation.md Seção 2.3 & 7.4)
    if (doctorUser?.email) {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
      const emailContent = createDoctorApprovedEmail({
        doctorName: doctorUser.name,
        loginLink: `${appUrl}/login`,
      })
      // Disparo não-bloqueante com chave de idempotência
      sendTransactionalEmail({
        to: doctorUser.email,
        subject: emailContent.subject,
        html: emailContent.html,
        text: emailContent.text,
        eventType: 'PHYSICIAN_APPROVED',
        targetUserId: userId,
        idempotencyKey: `PHYSICIAN_APPROVED:${userId}`,
      }).catch((err) => console.warn('[approveDoctorAction] Aviso no envio de e-mail de homologação:', err))
    }

    revalidatePath('/admin/medicos')
    revalidatePath('/admin/filas')
    return { success: true, message: 'Médico homologado e ativado no corpo clínico.' }
  } catch (err: any) {
    return { error: err.message || 'Falha ao homologar médico.' }
  }
}

/**
 * Desativar Médico com Bloqueio de Invariante de Vínculo (PRD Seção 4.5)
 */
export async function deactivateDoctorAction(userId: string, reason: string) {
  try {
    const adminId = await verifyAdminAuthorization()
    const supabaseAdmin = getAdminClient()

    // Regra Seção 4.5: Bloquear desativação se for médico responsável principal por pacientes ativos
    const { count: activeLinksCount } = await supabaseAdmin
      .from('physician_patient_links')
      .select('*', { count: 'exact', head: true })
      .eq('physician_user_id', userId)
      .eq('is_primary', true)
      .eq('status', 'ACTIVE')

    if (activeLinksCount && activeLinksCount > 0) {
      return {
        error: `Desativação bloqueada (PRD Seção 4.5): Este médico possui ${activeLinksCount} paciente(s) ativo(s) sob sua responsabilidade principal. Reatribua os vínculos antes de desativá-lo.`,
      }
    }

    // Desativar em users
    const { error: userError } = await supabaseAdmin
      .from('users')
      .update({ status: 'DEACTIVATED' })
      .eq('id', userId)

    if (userError) {
      return { error: `Erro ao desativar médico: ${userError.message}` }
    }

    // Desativar em physician_profiles
    await supabaseAdmin
      .from('physician_profiles')
      .update({ is_active: false })
      .eq('user_id', userId)

    // Auditoria
    await supabaseAdmin.from('audit_events').insert({
      user_id: adminId,
      action: 'PHYSICIAN_DEACTIVATED',
      resource: 'users',
      result: 'SUCCESS',
      justification: reason,
      metadata: { target_user_id: userId, reason },
    })

    revalidatePath('/admin/medicos')
    revalidatePath('/admin/filas')
    return { success: true, message: 'Médico desativado do corpo clínico conforme protocolo institucional.' }
  } catch (err: any) {
    return { error: err.message || 'Falha ao desativar médico.' }
  }
}

/**
 * Obter Link de Ativação Direto para o Médico (PRD Seção 2.3)
 */
export async function getDoctorActivationLinkAction(userId: string) {
  try {
    await verifyAdminAuthorization()
    const supabaseAdmin = getAdminClient()

    const { data: user, error: userError } = await supabaseAdmin
      .from('users')
      .select('email, name')
      .eq('id', userId)
      .single()

    if (userError || !user) {
      return { error: 'Médico não encontrado no sistema.' }
    }

    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'invite',
      email: user.email,
    })

    if (linkError || !linkData?.properties?.action_link) {
      // Se já aceitou convite anteriormente, gera recovery link
      const { data: recoveryData, error: recoveryError } = await supabaseAdmin.auth.admin.generateLink({
        type: 'recovery',
        email: user.email,
      })
      if (recoveryError || !recoveryData?.properties?.action_link) {
        return { error: `Erro ao gerar link de acesso: ${linkError?.message || recoveryError?.message}` }
      }
      return {
        success: true,
        actionLink: recoveryData.properties.action_link,
        email: user.email,
        name: user.name,
      }
    }

    return {
      success: true,
      actionLink: linkData.properties.action_link,
      email: user.email,
      name: user.name,
    }
  } catch (err: any) {
    return { error: err.message || 'Falha ao gerar link de ativação.' }
  }
}

/**
 * Reenviar Convite de Acesso por E-mail
 */
export async function resendDoctorInviteAction(userId: string) {
  try {
    await verifyAdminAuthorization()
    const supabaseAdmin = getAdminClient()

    const { data: user, error: userError } = await supabaseAdmin
      .from('users')
      .select('email, name')
      .eq('id', userId)
      .single()

    if (userError || !user) {
      return { error: 'Médico não encontrado.' }
    }

    // Tentar convidar por e-mail
    let { error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(user.email)

    // Se o usuário já tiver sido confirmado previamente, inviteUserByEmail pode falhar.
    // Nesses casos, disparamos a recuperação de senha/acesso oficial por e-mail.
    if (inviteError && (inviteError.message?.toLowerCase().includes('already') || (inviteError as any).status === 422)) {
      const { error: resetError } = await supabaseAdmin.auth.resetPasswordForEmail(user.email)
      inviteError = resetError
    }

    if (inviteError) {
      if ((inviteError as any).status === 429 || (inviteError as any).code === 'over_email_send_rate_limit') {
        return {
          error: 'Limite de envio de e-mails atingido no Supabase. Utilize a opção "Copiar Link de Ativação" para enviar o link diretamente ao profissional.',
        }
      }
      return { error: `Falha ao reenviar e-mail: ${inviteError.message}` }
    }

    return {
      success: true,
      message: `Convite de acesso enviado com sucesso para ${user.email}.`,
    }
  } catch (err: any) {
    return { error: err.message || 'Falha ao reenviar convite por e-mail.' }
  }
}

