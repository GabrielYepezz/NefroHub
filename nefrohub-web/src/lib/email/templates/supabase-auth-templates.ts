import { renderEmailLayout, renderButton, renderAlertBox } from '../components'
import { INSTITUTIONAL_INFO } from '../tokens'

/**
 * Templates Oficiais para Configuração no Supabase Auth (Fase 5.2 - Seção 6)
 * 
 * ATENÇÃO OPERACIONAL:
 * Estes templates são destinados à configuração MANUAL no painel do Supabase:
 * Painel Supabase -> Authentication -> Email Templates.
 * 
 * Enquanto não forem colados no painel, o Supabase continuará utilizando seus
 * templates padrões em texto simples. A aplicação NÃO altera esses templates remotamente via API.
 * 
 * Variáveis oficiais do GoTrue (GoTemplate) suportadas e validadas:
 * - {{ .ConfirmationURL }} : Link seguro de ação (ativação, confirmação, reset)
 * - {{ .Token }}           : Código OTP numérico (quando aplicável)
 * - {{ .Email }}           : Endereço de e-mail do usuário
 * - {{ .SiteURL }}         : URL raiz configurada no projeto
 */
export function getSupabaseAuthTemplates() {
  // 1. Confirmação de Cadastro (Sign Up)
  const confirmationSignUpHtml = renderEmailLayout({
    preheader: 'Confirme seu endereço de e-mail para ativar sua conta no NefroHub.',
    title: 'Bem-vindo ao NefroHub',
    subtitle: 'Confirmação de e-mail institucional',
    contentHtml: `
      <p style="margin: 0 0 16px 0;">Olá,</p>
      <p style="margin: 0 0 16px 0;">
        Seu cadastro na plataforma <strong>${INSTITUTIONAL_INFO.systemName}</strong> foi iniciado.
      </p>
      <p style="margin: 0 0 16px 0;">
        Para confirmar sua identidade e validar seu endereço de e-mail com segurança, clique no botão abaixo:
      </p>

      ${renderButton('Confirmar Meu E-mail', '{{ .ConfirmationURL }}')}

      ${renderAlertBox(
        'A validação do e-mail é obrigatória para proteção da sua identidade e recebimento de avisos da plataforma.',
        'info'
      )}
    `,
  })

  // 2. Convite de Usuário / Médico (Invite User)
  const inviteUserHtml = renderEmailLayout({
    preheader: 'Você foi convidado a integrar a plataforma NefroHub.',
    title: 'Convite Institucional',
    subtitle: 'Definição de senha e primeiro acesso',
    contentHtml: `
      <p style="margin: 0 0 16px 0;">Olá,</p>
      <p style="margin: 0 0 16px 0;">
        Você foi convidado formalmente a acessar a plataforma <strong>${INSTITUTIONAL_INFO.systemName}</strong> no <strong>${INSTITUTIONAL_INFO.institutionName}</strong>.
      </p>
      <p style="margin: 0 0 16px 0;">
        Para aceitar o convite e cadastrar sua senha pessoal de acesso, utilize o botão abaixo:
      </p>

      ${renderButton('Aceitar Convite e Definir Senha', '{{ .ConfirmationURL }}')}

      ${renderAlertBox(
        'Este convite é intransferível. Por motivos de segurança clínica, o link possui prazo de expiração.',
        'info'
      )}
    `,
  })

  // 3. Recuperação de Senha (Reset Password)
  const resetPasswordHtml = renderEmailLayout({
    preheader: 'Redefinição de senha de acesso à sua conta NefroHub.',
    title: 'Recuperação de Acesso',
    subtitle: 'Redefinição segura de credenciais',
    contentHtml: `
      <p style="margin: 0 0 16px 0;">Olá,</p>
      <p style="margin: 0 0 16px 0;">
        Recebemos uma solicitação para redefinir a senha da sua conta no <strong>${INSTITUTIONAL_INFO.systemName}</strong>.
      </p>
      <p style="margin: 0 0 16px 0;">
        Para cadastrar uma nova senha, clique no botão de ação seguro abaixo:
      </p>

      ${renderButton('Redefinir Minha Senha', '{{ .ConfirmationURL }}')}

      ${renderAlertBox(
        'Se você não fez essa solicitação, desconsidere este e-mail. Sua senha e conta continuam protegidas.',
        'warning'
      )}
    `,
    securityNoticeText:
      'Nunca forneça sua senha ou código a terceiros. A equipe do hospital nunca solicitará sua senha.',
  })

  // 4. Magic Link (Primeiro Acesso ou Login Rápido)
  const magicLinkHtml = renderEmailLayout({
    preheader: 'Seu link seguro de login no NefroHub.',
    title: 'Acesso Rápido à Conta',
    subtitle: 'Autenticação segura via link direto',
    contentHtml: `
      <p style="margin: 0 0 16px 0;">Olá,</p>
      <p style="margin: 0 0 16px 0;">
        Utilize o botão seguro abaixo para entrar na sua conta no <strong>${INSTITUTIONAL_INFO.systemName}</strong>:
      </p>

      ${renderButton('Entrar no NefroHub', '{{ .ConfirmationURL }}')}

      ${renderAlertBox(
        'Este link é de uso único e expira em poucos minutos para garantir a segurança dos seus dados.',
        'info'
      )}
    `,
  })

  return {
    confirmationSignUp: {
      subject: 'NefroHub — Confirmação de Cadastro',
      html: confirmationSignUpHtml,
    },
    inviteUser: {
      subject: 'NefroHub — Convite de Acesso à Plataforma',
      html: inviteUserHtml,
    },
    resetPassword: {
      subject: 'NefroHub — Recuperação de Acesso à Conta',
      html: resetPasswordHtml,
    },
    magicLink: {
      subject: 'NefroHub — Link de Acesso Seguro',
      html: magicLinkHtml,
    },
  }
}
