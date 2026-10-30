import {
  renderEmailLayout,
  renderButton,
  renderAlertBox,
  renderSecurityNotice,
} from '../components'
import { escapeHtml, assertClinicalPrivacy, sanitizeRecipientName, validateActionUrl } from '../sanitizer'
import { INSTITUTIONAL_INFO } from '../tokens'

export interface RenderedEmail {
  subject: string
  html: string
  text: string
}

/**
 * 1. E-mail de Convite e Ativação de Conta do Médico (documentation.md Seção 2.3)
 */
export function createDoctorInviteEmail(data: {
  doctorName: string
  inviteLink: string
}): RenderedEmail {
  const urlValidation = validateActionUrl(data.inviteLink)
  if (!urlValidation.isValid) {
    throw new Error(`URL de convite inválida: ${urlValidation.error}`)
  }

  const cleanName = sanitizeRecipientName(data.doctorName)
  const safeName = escapeHtml(cleanName)
  const subject = 'NefroHub — Convite de Ativação do Corpo Clínico'

  const contentHtml = `
    <p style="margin: 0 0 16px 0;">Olá, <strong>Dr(a). ${safeName}</strong>,</p>
    <p style="margin: 0 0 16px 0;">
      Você foi cadastrado institucionalmente no <strong>${INSTITUTIONAL_INFO.institutionName}</strong> para integrar a plataforma <strong>${INSTITUTIONAL_INFO.systemName}</strong> como profissional do corpo clínico.
    </p>
    <p style="margin: 0 0 16px 0;">
      Para definir sua senha de acesso e ativar seu credenciamento na plataforma de acompanhamento renal, utilize o botão seguro abaixo:
    </p>

    ${renderButton('Definir Senha e Ativar Acesso', data.inviteLink)}

    ${renderAlertBox(
      'Seu credenciamento institucional passará por homologação da administração hospitalar. O acesso aos prontuários clínicos é liberado mediante validação do CRM.',
      'info'
    )}

    <p style="margin: 20px 0 0 0; font-size: 12px; color: #687780;">
      Este convite é individual, pessoal e intransferível. Por motivos de segurança, o link possui prazo de expiração.
    </p>
  `

  const html = renderEmailLayout({
    preheader: `Convite de ativação de conta profissional para Dr(a). ${data.doctorName} no NefroHub.`,
    title: 'Credenciamento no Corpo Clínico',
    subtitle: 'Ativação de conta e primeiro acesso à plataforma',
    contentHtml,
  })

  const text = `
NefroHub — Plataforma Integrada de Cuidados Renais
${INSTITUTIONAL_INFO.institutionName}

Olá, Dr(a). ${data.doctorName},

Você foi cadastrado institucionalmente para integrar a plataforma NefroHub no ${INSTITUTIONAL_INFO.institutionName}.

Para definir sua senha de acesso e ativar seu credenciamento profissional, acesse o link seguro:
${data.inviteLink}

Aviso: Seu credenciamento institucional passará por homologação da administração. O acesso aos prontuários clínicos é liberado mediante validação do CRM.

Dúvidas ou suporte: ${INSTITUTIONAL_INFO.supportEmail}
`.trim()

  const privacyCheck = assertClinicalPrivacy(subject, html, text)
  if (!privacyCheck.isSafe) {
    throw new Error(`Violação de privacidade clínica detectada no template de convite: ${privacyCheck.violations.join(', ')}`)
  }

  return { subject, html, text }
}

/**
 * 2. E-mail de Homologação e Ativação do Médico (documentation.md Seção 2.3)
 */
export function createDoctorApprovedEmail(data: {
  doctorName: string
  loginLink: string
  specialty?: string
}): RenderedEmail {
  const urlValidation = validateActionUrl(data.loginLink)
  if (!urlValidation.isValid) {
    throw new Error(`URL de login inválida: ${urlValidation.error}`)
  }
  const cleanName = sanitizeRecipientName(data.doctorName)
  const safeName = escapeHtml(cleanName)
  const subject = 'NefroHub — Homologação de Credenciamento Concluída'

  const contentHtml = `
    <p style="margin: 0 0 16px 0;">Olá, <strong>Dr(a). ${safeName}</strong>,</p>
    <p style="margin: 0 0 16px 0;">
      Seu credenciamento profissional no <strong>${INSTITUTIONAL_INFO.institutionName}</strong> foi formalmente homologado pela diretoria clínica da instituição.
    </p>

    ${renderAlertBox(
      'Seu perfil clínico está ativo. Você já pode acessar a plataforma, visualizar sua fila de pacientes vinculados e acompanhar registros clínicos.',
      'success'
    )}

    ${renderButton('Acessar Painel Médico', data.loginLink)}

    <p style="margin: 16px 0 0 0; font-size: 12px; color: #687780;">
      Lembramos que todas as ações e consultas realizadas no prontuário eletrônico são registradas em trilha de auditoria contínua e imutável.
    </p>
  `

  const html = renderEmailLayout({
    preheader: `Seu credenciamento no NefroHub foi homologado com sucesso.`,
    title: 'Credenciamento Homologado',
    subtitle: 'Acesso clínico liberado ao prontuário eletrônico',
    contentHtml,
  })

  const text = `
NefroHub — Homologação de Credenciamento Concluída
${INSTITUTIONAL_INFO.institutionName}

Olá, Dr(a). ${data.doctorName},

Seu credenciamento profissional no ${INSTITUTIONAL_INFO.institutionName} foi homologado com sucesso.
Seu perfil está ativo para acesso aos prontuários clínicos dos pacientes autorizados.

Acesse o portal:
${data.loginLink}

Dúvidas ou suporte: ${INSTITUTIONAL_INFO.supportEmail}
`.trim()

  const privacyCheck = assertClinicalPrivacy(subject, html, text)
  if (!privacyCheck.isSafe) {
    throw new Error(`Violação de privacidade clínica: ${privacyCheck.violations.join(', ')}`)
  }

  return { subject, html, text }
}

/**
 * 3. E-mail de Recusa Institucional de Cadastro Médico (documentation.md Seção 2.3)
 */
export function createDoctorRejectedEmail(data: {
  doctorName: string
}): RenderedEmail {
  const cleanName = sanitizeRecipientName(data.doctorName)
  const safeName = escapeHtml(cleanName)
  const subject = 'NefroHub — Comunicado sobre Solicitação de Cadastro'

  const contentHtml = `
    <p style="margin: 0 0 16px 0;">Prezado(a) <strong>Dr(a). ${safeName}</strong>,</p>
    <p style="margin: 0 0 16px 0;">
      Informamos que a solicitação de credenciamento profissional submetida para o <strong>${INSTITUTIONAL_INFO.institutionName}</strong> não foi homologada pela administração institucional.
    </p>

    ${renderAlertBox(
      'Para mais informações sobre o processo de credenciamento ou divergência documental, solicitamos entrar em contato diretamente com a diretoria clínica ou departamento de administração hospitalar.',
      'warning'
    )}

    <p style="margin: 20px 0 0 0; font-size: 12px; color: #687780;">
      Canal de atendimento: <a href="mailto:${INSTITUTIONAL_INFO.supportEmail}" style="color: #367C83;">${INSTITUTIONAL_INFO.supportEmail}</a>
    </p>
  `

  const html = renderEmailLayout({
    preheader: 'Comunicado institucional a respeito da solicitação de credenciamento.',
    title: 'Solicitação de Credenciamento',
    subtitle: 'Parecer da administração institucional',
    contentHtml,
  })

  const text = `
NefroHub — Comunicado Institucional
${INSTITUTIONAL_INFO.institutionName}

Prezado(a) Dr(a). ${data.doctorName},

Informamos que a solicitação de credenciamento no ${INSTITUTIONAL_INFO.institutionName} não foi homologada.
Para esclarecimentos, contate a diretoria clínica ou suporte em: ${INSTITUTIONAL_INFO.supportEmail}
`.trim()

  const privacyCheck = assertClinicalPrivacy(subject, html, text)
  if (!privacyCheck.isSafe) {
    throw new Error(`Violação de privacidade clínica: ${privacyCheck.violations.join(', ')}`)
  }

  return { subject, html, text }
}

/**
 * 4. E-mail de Recuperação de Senha (documentation.md Seção 15.1)
 */
export function createPasswordResetEmail(data: {
  userName: string
  resetLink: string
}): RenderedEmail {
  const urlValidation = validateActionUrl(data.resetLink)
  if (!urlValidation.isValid) {
    throw new Error(`URL de redefinição inválida: ${urlValidation.error}`)
  }
  const cleanName = sanitizeRecipientName(data.userName)
  const safeName = escapeHtml(cleanName)
  const subject = 'NefroHub — Recuperação de Acesso à Conta'

  const contentHtml = `
    <p style="margin: 0 0 16px 0;">Olá, <strong>${safeName}</strong>,</p>
    <p style="margin: 0 0 16px 0;">
      Recebemos uma solicitação de recuperação de senha e redefinição de acesso para sua conta no <strong>${INSTITUTIONAL_INFO.systemName}</strong>.
    </p>
    <p style="margin: 0 0 16px 0;">
      Para criar uma nova senha com segurança, clique no botão abaixo:
    </p>

    ${renderButton('Redefinir Minha Senha', data.resetLink)}

    ${renderAlertBox(
      'Este link é de uso único e possui validade limitada. Se você não solicitou a redefinição de senha, desconsidere esta mensagem. Sua conta permanece protegida.',
      'warning'
    )}
  `

  const html = renderEmailLayout({
    preheader: 'Solicitação de recuperação de senha da sua conta NefroHub.',
    title: 'Recuperação de Acesso',
    subtitle: 'Redefinição segura de credenciais',
    contentHtml,
    securityNoticeText:
      'Nunca compartilhe este link com terceiros. A equipe do NefroHub jamais solicitará senhas ou códigos de segurança por e-mail ou telefone.',
  })

  const text = `
NefroHub — Recuperação de Acesso à Conta
${INSTITUTIONAL_INFO.institutionName}

Olá, ${data.userName},

Recebemos uma solicitação para redefinir a senha da sua conta no NefroHub.
Para criar uma nova senha, utilize o link seguro abaixo:
${data.resetLink}

Se você não solicitou a recuperação, nenhuma ação é necessária. Sua senha atual permanecerá inalterada.

Suporte: ${INSTITUTIONAL_INFO.supportEmail}
`.trim()

  const privacyCheck = assertClinicalPrivacy(subject, html, text)
  if (!privacyCheck.isSafe) {
    throw new Error(`Violação de privacidade clínica: ${privacyCheck.violations.join(', ')}`)
  }

  return { subject, html, text }
}

/**
 * 5. E-mail de Confirmação de Cadastro de Paciente (documentation.md Seção 2.1)
 */
export function createPatientConfirmationEmail(data: {
  patientName: string
  confirmationLink: string
}): RenderedEmail {
  const urlValidation = validateActionUrl(data.confirmationLink)
  if (!urlValidation.isValid) {
    throw new Error(`URL de confirmação inválida: ${urlValidation.error}`)
  }
  const cleanName = sanitizeRecipientName(data.patientName)
  const safeName = escapeHtml(cleanName)
  const subject = 'NefroHub — Confirmação de Cadastro'

  const contentHtml = `
    <p style="margin: 0 0 16px 0;">Olá, <strong>${safeName}</strong>,</p>
    <p style="margin: 0 0 16px 0;">
      Seu pré-cadastro no portal <strong>${INSTITUTIONAL_INFO.systemName}</strong> foi realizado com sucesso.
    </p>
    <p style="margin: 0 0 16px 0;">
      Para confirmar seu endereço de e-mail e ativar sua conta com total segurança, clique no botão abaixo:
    </p>

    ${renderButton('Confirmar Meu Cadastro', data.confirmationLink)}

    ${renderAlertBox(
      'A confirmação do seu e-mail garante que você receba notificações importantes sobre seus agendamentos e atualizações do seu prontuário.',
      'info'
    )}
  `

  const html = renderEmailLayout({
    preheader: 'Confirme seu endereço de e-mail para ativar sua conta no NefroHub.',
    title: 'Bem-vindo ao NefroHub',
    subtitle: 'Confirmação de e-mail institucional do paciente',
    contentHtml,
  })

  const text = `
NefroHub — Confirmação de Cadastro
${INSTITUTIONAL_INFO.institutionName}

Olá, ${data.patientName},

Seu pré-cadastro no NefroHub foi realizado com sucesso.
Para confirmar seu endereço de e-mail e ativar sua conta, utilize o link:
${data.confirmationLink}

Suporte: ${INSTITUTIONAL_INFO.supportEmail}
`.trim()

  const privacyCheck = assertClinicalPrivacy(subject, html, text)
  if (!privacyCheck.isSafe) {
    throw new Error(`Violação de privacidade clínica: ${privacyCheck.violations.join(', ')}`)
  }

  return { subject, html, text }
}

/**
 * 6. Notificação Genérica de Atualização no Prontuário (documentation.md Seção 6.5 e 7.4)
 * REGRA RIGOROSA: NUNCA CONTER RESULTADOS, DIAGNÓSTICOS OU DADOS CLÍNICOS.
 */
export function createPatientGenericUpdateEmail(data: {
  patientName: string
  portalLink: string
  noticeContext?: 'SUBMISSION_REVIEW' | 'DOCUMENT_UPDATE' | 'GENERAL_NOTICE'
}): RenderedEmail {
  const urlValidation = validateActionUrl(data.portalLink)
  if (!urlValidation.isValid) {
    throw new Error(`URL de portal inválida: ${urlValidation.error}`)
  }
  const cleanName = sanitizeRecipientName(data.patientName)
  const safeName = escapeHtml(cleanName)
  const subject = 'NefroHub — Atualização Disponível no seu Prontuário'

  const contentHtml = `
    <p style="margin: 0 0 16px 0;">Olá, <strong>${safeName}</strong>,</p>
    <p style="margin: 0 0 16px 0;">
      Há uma atualização disponível na sua conta <strong>${INSTITUTIONAL_INFO.systemName}</strong> referente ao acompanhamento do seu prontuário.
    </p>

    ${renderAlertBox(
      'Por motivos de sigilo médico e proteção de dados de saúde (LGPD), detalhes clínicos não são enviados por e-mail. Acesse a plataforma segura para consultar as informações completas.',
      'info'
    )}

    ${renderButton('Consultar meu Prontuário', data.portalLink)}

    <p style="margin: 20px 0 0 0; font-size: 12px; color: #687780;">
      Esta é uma mensagem automática de notificação do sistema.
    </p>
  `

  const html = renderEmailLayout({
    preheader: 'Há uma atualização disponível na sua conta NefroHub.',
    title: 'Atualização no Prontuário',
    subtitle: 'Novas informações disponíveis na sua área do paciente',
    contentHtml,
  })

  const text = `
NefroHub — Atualização no Prontuário
${INSTITUTIONAL_INFO.institutionName}

Olá, ${cleanName},

Há uma atualização disponível na sua conta NefroHub referente a uma submissão ou registro no seu prontuário.
Por segurança e privacidade clínica, detalhes não são transmitidos por e-mail.

Acesse a plataforma para consultar os detalhes:
${data.portalLink}

Suporte: ${INSTITUTIONAL_INFO.supportEmail}
`.trim()

  const privacyCheck = assertClinicalPrivacy(subject, html, text)
  if (!privacyCheck.isSafe) {
    throw new Error(`Violação de privacidade clínica: ${privacyCheck.violations.join(', ')}`)
  }

  return { subject, html, text }
}

/**
 * 7. Solicitação de Representação Legal / Cuidador (documentation.md Seção 5)
 */
export function createRepresentationRequestedEmail(data: {
  representativeName: string
  portalLink: string
}): RenderedEmail {
  const urlValidation = validateActionUrl(data.portalLink)
  if (!urlValidation.isValid) {
    throw new Error(`URL de portal inválida: ${urlValidation.error}`)
  }
  const cleanName = sanitizeRecipientName(data.representativeName)
  const safeName = escapeHtml(cleanName)
  const subject = 'NefroHub — Indicação de Representação de Paciente'

  const contentHtml = `
    <p style="margin: 0 0 16px 0;">Olá, <strong>${safeName}</strong>,</p>
    <p style="margin: 0 0 16px 0;">
      Você foi indicado como representante legal ou cuidador autorizado de um paciente no <strong>${INSTITUTIONAL_INFO.systemName}</strong>.
    </p>
    <p style="margin: 0 0 16px 0;">
      Para exercer a representação autorizada e acompanhar as informações pertinentes conforme o escopo delegado, acesse a plataforma:
    </p>

    ${renderButton('Acessar NefroHub', data.portalLink)}

    ${renderAlertBox(
      'A vinculação está sujeita à homologação institucional da equipe hospitalar mediante conferência da documentação de representação legal.',
      'info'
    )}
  `

  const html = renderEmailLayout({
    preheader: 'Você foi indicado como representante de paciente no NefroHub.',
    title: 'Indicação de Representação',
    subtitle: 'Acompanhamento autorizado e cuidados assistenciais',
    contentHtml,
  })

  const text = `
NefroHub — Indicação de Representação
${INSTITUTIONAL_INFO.institutionName}

Olá, ${cleanName},

Você foi indicado como representante legal ou cuidador autorizado de um paciente no NefroHub.
Acesse a plataforma para acompanhar o estado da autorização:
${data.portalLink}

Suporte: ${INSTITUTIONAL_INFO.supportEmail}
`.trim()

  const privacyCheck = assertClinicalPrivacy(subject, html, text)
  if (!privacyCheck.isSafe) {
    throw new Error(`Violação de privacidade clínica: ${privacyCheck.violations.join(', ')}`)
  }

  return { subject, html, text }
}

/**
 * 8. Decisão de Homologação de Representação (documentation.md Seção 5)
 */
export function createRepresentationDecisionEmail(data: {
  representativeName: string
  approved: boolean
  portalLink: string
}): RenderedEmail {
  const urlValidation = validateActionUrl(data.portalLink)
  if (!urlValidation.isValid) {
    throw new Error(`URL de portal inválida: ${urlValidation.error}`)
  }
  const cleanName = sanitizeRecipientName(data.representativeName)
  const safeName = escapeHtml(cleanName)
  const subject = data.approved
    ? 'NefroHub — Representação Homologada com Sucesso'
    : 'NefroHub — Comunicado sobre Solicitação de Representação'

  const contentHtml = data.approved
    ? `
      <p style="margin: 0 0 16px 0;">Olá, <strong>${safeName}</strong>,</p>
      <p style="margin: 0 0 16px 0;">
        Informamos que sua solicitação de representação/cuidado foi formalmente <strong>homologada</strong> pelo hospital.
      </p>

      ${renderAlertBox(
        'Você já possui acesso às funcionalidades autorizadas no prontuário do paciente representado.',
        'success'
      )}

      ${renderButton('Acessar Prontuário Representado', data.portalLink)}
    `
    : `
      <p style="margin: 0 0 16px 0;">Olá, <strong>${safeName}</strong>,</p>
      <p style="margin: 0 0 16px 0;">
        Informamos que a solicitação de representação não foi homologada pelo comitê administrativo.
      </p>

      ${renderAlertBox(
        'Para esclarecimentos sobre a comprovação documental ou novas solicitações, entre em contato com a equipe hospitalar.',
        'warning'
      )}

      ${renderButton('Acessar NefroHub', data.portalLink)}
    `

  const html = renderEmailLayout({
    preheader: data.approved
      ? 'Sua representação foi homologada com sucesso.'
      : 'Comunicado a respeito da solicitação de representação.',
    title: data.approved ? 'Representação Homologada' : 'Parecer de Representação',
    subtitle: 'Decisão da administração institucional',
    contentHtml,
  })

  const text = `
NefroHub — ${data.approved ? 'Representação Homologada' : 'Parecer de Representação'}
${INSTITUTIONAL_INFO.institutionName}

Olá, ${cleanName},

${
  data.approved
    ? 'Sua solicitação de representação foi homologada pelo hospital. Acesse o portal para continuar:'
    : 'Informamos que a solicitação de representação não foi aprovada pelo hospital.'
}

Acesse o portal: ${data.portalLink}
Suporte: ${INSTITUTIONAL_INFO.supportEmail}
`.trim()

  const privacyCheck = assertClinicalPrivacy(subject, html, text)
  if (!privacyCheck.isSafe) {
    throw new Error(`Violação de privacidade clínica: ${privacyCheck.violations.join(', ')}`)
  }

  return { subject, html, text }
}

/**
 * 9. Homologação de Vínculo Médico-Paciente (documentation.md Seção 4)
 */
export function createLinkApprovedEmail(data: {
  recipientName: string
  portalLink: string
}): RenderedEmail {
  const urlValidation = validateActionUrl(data.portalLink)
  if (!urlValidation.isValid) {
    throw new Error(`URL de portal inválida: ${urlValidation.error}`)
  }
  const cleanName = sanitizeRecipientName(data.recipientName)
  const safeName = escapeHtml(cleanName)
  const subject = 'NefroHub — Vínculo de Acompanhamento Homologado'

  const contentHtml = `
    <p style="margin: 0 0 16px 0;">Olá, <strong>${safeName}</strong>,</p>
    <p style="margin: 0 0 16px 0;">
      O vínculo de acompanhamento clínico entre médico e paciente foi homologado com sucesso pelo <strong>${INSTITUTIONAL_INFO.institutionName}</strong>.
    </p>

    ${renderAlertBox(
      'O acompanhamento assistencial formal está ativo na plataforma.',
      'success'
    )}

    ${renderButton('Acessar NefroHub', data.portalLink)}
  `

  const html = renderEmailLayout({
    preheader: 'Vínculo de acompanhamento clínico homologado no NefroHub.',
    title: 'Vínculo Homologado',
    subtitle: 'Acompanhamento clínico institucional ativo',
    contentHtml,
  })

  const text = `
NefroHub — Vínculo Homologado
${INSTITUTIONAL_INFO.institutionName}

Olá, ${data.recipientName},

O vínculo de acompanhamento clínico foi homologado com sucesso no ${INSTITUTIONAL_INFO.institutionName}.
Acesse a plataforma: ${data.portalLink}

Suporte: ${INSTITUTIONAL_INFO.supportEmail}
`.trim()

  const privacyCheck = assertClinicalPrivacy(subject, html, text)
  if (!privacyCheck.isSafe) {
    throw new Error(`Violação de privacidade clínica: ${privacyCheck.violations.join(', ')}`)
  }

  return { subject, html, text }
}
