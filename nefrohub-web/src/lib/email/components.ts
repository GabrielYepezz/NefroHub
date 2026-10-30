import { EMAIL_TOKENS, INSTITUTIONAL_INFO } from './tokens'
import { escapeHtml } from './sanitizer'

export interface EmailLayoutOptions {
  preheader: string
  title: string
  subtitle?: string
  contentHtml: string
  showSecurityNotice?: boolean
  securityNoticeText?: string
}

export type AlertVariant = 'info' | 'success' | 'warning' | 'destructive'

/**
 * Renderiza o botão de ação principal (CTA) em formato bulletproof
 * compatível com Outlook, Apple Mail, Gmail e dispositivos móveis.
 */
export function renderButton(label: string, url: string): string {
  const safeLabel = escapeHtml(label)
  const safeUrl = escapeHtml(url)

  return `
    <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="margin: 28px 0 20px 0; width: 100%;">
      <tr>
        <td align="center">
          <table role="presentation" border="0" cellpadding="0" cellspacing="0">
            <tr>
              <td align="center" bgcolor="${EMAIL_TOKENS.primary}" style="border-radius: ${EMAIL_TOKENS.radius};">
                <a href="${safeUrl}" target="_blank" style="display: inline-block; padding: 14px 28px; font-family: ${EMAIL_TOKENS.fontFamily}; font-size: 14px; font-weight: 600; color: ${EMAIL_TOKENS.primaryForeground}; text-decoration: none; border-radius: ${EMAIL_TOKENS.radius}; letter-spacing: 0.2px;">
                  ${safeLabel} &rarr;
                </a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
      <tr>
        <td align="center" style="padding-top: 14px;">
          <p style="margin: 0; font-family: ${EMAIL_TOKENS.fontFamily}; font-size: 11px; color: ${EMAIL_TOKENS.mutedForeground}; line-height: 1.4;">
            Se o botão acima não funcionar, acesse diretamente pelo link:<br>
            <a href="${safeUrl}" target="_blank" style="color: ${EMAIL_TOKENS.primary}; word-break: break-all; text-decoration: underline;">
              ${safeUrl}
            </a>
          </p>
        </td>
      </tr>
    </table>
  `
}

/**
 * Renderiza bloco de alerta / destaque institucional
 */
export function renderAlertBox(contentHtml: string, variant: AlertVariant = 'info'): string {
  const stylesByVariant: Record<AlertVariant, { bg: string; border: string; text: string; label: string }> = {
    info: {
      bg: EMAIL_TOKENS.infoBg,
      border: EMAIL_TOKENS.info,
      text: EMAIL_TOKENS.infoForeground,
      label: 'INFORMAÇÃO INSTITUCIONAL',
    },
    success: {
      bg: EMAIL_TOKENS.successBg,
      border: EMAIL_TOKENS.success,
      text: EMAIL_TOKENS.successForeground,
      label: 'CONFIRMAÇÃO',
    },
    warning: {
      bg: EMAIL_TOKENS.warningBg,
      border: EMAIL_TOKENS.warning,
      text: EMAIL_TOKENS.warningForeground,
      label: 'ATENÇÃO',
    },
    destructive: {
      bg: EMAIL_TOKENS.destructiveBg,
      border: EMAIL_TOKENS.destructive,
      text: EMAIL_TOKENS.destructiveForeground,
      label: 'COMUNICADO IMPORTANTE',
    },
  }

  const current = stylesByVariant[variant]

  return `
    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin: 20px 0; background-color: ${current.bg}; border-left: 4px solid ${current.border}; border-radius: 0 ${EMAIL_TOKENS.radius} ${EMAIL_TOKENS.radius} 0;">
      <tr>
        <td style="padding: 14px 16px;">
          <p style="margin: 0 0 4px 0; font-family: ${EMAIL_TOKENS.fontFamily}; font-size: 10px; font-weight: 700; color: ${current.text}; letter-spacing: 0.5px; text-transform: uppercase;">
            ${current.label}
          </p>
          <div style="font-family: ${EMAIL_TOKENS.fontFamily}; font-size: 12px; color: ${current.text}; line-height: 1.5;">
            ${contentHtml}
          </div>
        </td>
      </tr>
    </table>
  `
}

/**
 * Renderiza o aviso de segurança clínica obrigatório
 */
export function renderSecurityNotice(customText?: string): string {
  const defaultNotice =
    'O NefroHub jamais solicita senhas, tokens de autenticação ou dados clínicos sigilosos por e-mail. Se você não reconhece esta atividade, ignore esta mensagem e contate a equipe de segurança da instituição imediatamente.'

  const text = escapeHtml(customText || defaultNotice)

  return `
    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin: 24px 0 12px 0; background-color: #FAFBFB; border: 1px dashed ${EMAIL_TOKENS.border}; border-radius: ${EMAIL_TOKENS.radius};">
      <tr>
        <td style="padding: 12px 14px;">
          <p style="margin: 0 0 2px 0; font-family: ${EMAIL_TOKENS.fontFamily}; font-size: 10px; font-weight: 700; color: ${EMAIL_TOKENS.mutedForeground}; text-transform: uppercase; letter-spacing: 0.3px;">
            &#128274; Aviso de Segurança e Privacidade
          </p>
          <p style="margin: 0; font-family: ${EMAIL_TOKENS.fontFamily}; font-size: 11px; color: ${EMAIL_TOKENS.mutedForeground}; line-height: 1.4;">
            ${text}
          </p>
        </td>
      </tr>
    </table>
  `
}

/**
 * Layout mestre de e-mail institucional
 */
export function renderEmailLayout(options: EmailLayoutOptions): string {
  const { preheader, title, subtitle, contentHtml, showSecurityNotice = true, securityNoticeText } = options

  return `<!DOCTYPE html>
<html lang="pt-BR" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="x-apple-disable-message-reformatting">
  <title>${escapeHtml(title)}</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
  <style type="text/css">
    body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    img { -ms-interpolation-mode: bicubic; border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; }
    table { border-collapse: collapse !important; }
    body { height: 100% !important; margin: 0 !important; padding: 0 !important; width: 100% !important; background-color: ${EMAIL_TOKENS.background}; font-family: ${EMAIL_TOKENS.fontFamily}; }
    a[x-apple-data-detectors] { color: inherit !important; text-decoration: none !important; font-size: inherit !important; font-family: inherit !important; font-weight: inherit !important; line-height: inherit !important; }
    @media screen and (max-width: 600px) {
      .email-container { width: 100% !important; margin: auto !important; }
      .content-padding { padding: 24px 18px !important; }
      .header-padding { padding: 20px 18px !important; }
    }
  </style>
</head>
<body style="margin: 0; padding: 0; background-color: ${EMAIL_TOKENS.background};">
  <!-- Preheader oculto para clientes de e-mail -->
  <div style="display: none; font-size: 1px; color: ${EMAIL_TOKENS.background}; line-height: 1px; max-height: 0px; max-width: 0px; opacity: 0; overflow: hidden;">
    ${escapeHtml(preheader)}
  </div>

  <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" bgcolor="${EMAIL_TOKENS.background}">
    <tr>
      <td align="center" style="padding: 32px 12px 48px 12px;">
        <!-- Container Principal (600px) -->
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px;" class="email-container">
          
          <!-- Cabeçalho Institucional -->
          <tr>
            <td align="center" style="padding: 0 0 20px 0;">
              <table role="presentation" border="0" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <span style="display: inline-block; background-color: ${EMAIL_TOKENS.primary}; color: #ffffff; width: 36px; height: 36px; line-height: 36px; text-align: center; border-radius: 8px; font-weight: bold; font-size: 18px; font-family: ${EMAIL_TOKENS.fontFamily};">
                      &#9877;
                    </span>
                  </td>
                  <td style="padding-left: 10px; text-align: left;">
                    <div style="font-family: ${EMAIL_TOKENS.fontFamily}; font-size: 20px; font-weight: 700; color: ${EMAIL_TOKENS.foreground}; letter-spacing: -0.3px;">
                      ${INSTITUTIONAL_INFO.systemName}
                    </div>
                    <div style="font-family: ${EMAIL_TOKENS.fontFamily}; font-size: 11px; color: ${EMAIL_TOKENS.mutedForeground};">
                      ${INSTITUTIONAL_INFO.tagline}
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Card de Conteúdo -->
          <tr>
            <td bgcolor="${EMAIL_TOKENS.card}" style="background-color: ${EMAIL_TOKENS.card}; border: 1px solid ${EMAIL_TOKENS.border}; border-radius: ${EMAIL_TOKENS.radius}; box-shadow: 0 1px 3px rgba(0,0,0,0.04);" class="content-padding">
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="padding: 32px 32px 28px 32px;" class="content-padding">
                
                <!-- Título e Subtítulo -->
                <tr>
                  <td style="padding-bottom: 20px; border-bottom: 1px solid ${EMAIL_TOKENS.border};">
                    <h1 style="margin: 0; font-family: ${EMAIL_TOKENS.fontFamily}; font-size: 20px; font-weight: 700; color: ${EMAIL_TOKENS.foreground}; line-height: 1.3;">
                      ${escapeHtml(title)}
                    </h1>
                    ${
                      subtitle
                        ? `<p style="margin: 6px 0 0 0; font-family: ${EMAIL_TOKENS.fontFamily}; font-size: 13px; color: ${EMAIL_TOKENS.mutedForeground}; line-height: 1.4;">
                            ${escapeHtml(subtitle)}
                          </p>`
                        : ''
                    }
                  </td>
                </tr>

                <!-- Corpo do E-mail -->
                <tr>
                  <td style="padding-top: 24px; font-family: ${EMAIL_TOKENS.fontFamily}; font-size: 13px; color: ${EMAIL_TOKENS.foreground}; line-height: 1.6;">
                    ${contentHtml}
                  </td>
                </tr>

                <!-- Aviso de Segurança -->
                ${
                  showSecurityNotice
                    ? `<tr>
                        <td>
                          ${renderSecurityNotice(securityNoticeText)}
                        </td>
                      </tr>`
                    : ''
                }

              </table>
            </td>
          </tr>

          <!-- Rodapé Institucional -->
          <tr>
            <td align="center" style="padding: 24px 16px 0 16px;">
              <p style="margin: 0 0 4px 0; font-family: ${EMAIL_TOKENS.fontFamily}; font-size: 11px; font-weight: 600; color: ${EMAIL_TOKENS.foreground};">
                ${escapeHtml(INSTITUTIONAL_INFO.institutionName)}
              </p>
              ${
                INSTITUTIONAL_INFO.cnpj
                  ? `<p style="margin: 0 0 6px 0; font-family: ${EMAIL_TOKENS.fontFamily}; font-size: 10px; color: ${EMAIL_TOKENS.mutedForeground}; line-height: 1.4;">
                      CNPJ: ${escapeHtml(INSTITUTIONAL_INFO.cnpj)} &bull; Gestão e Prontuário Renal
                    </p>`
                  : `<p style="margin: 0 0 6px 0; font-family: ${EMAIL_TOKENS.fontFamily}; font-size: 10px; color: ${EMAIL_TOKENS.mutedForeground}; line-height: 1.4;">
                      Gestão de Prontuário e Comunicação Institucional
                    </p>`
              }
              <p style="margin: 0; font-family: ${EMAIL_TOKENS.fontFamily}; font-size: 10px; color: ${EMAIL_TOKENS.mutedForeground};">
                Mensagem gerada automaticamente pelo sistema ${escapeHtml(INSTITUTIONAL_INFO.systemName)}. Por favor, não responda diretamente a este e-mail.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}
