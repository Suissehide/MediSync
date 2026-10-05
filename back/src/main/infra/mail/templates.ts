import type { Mail } from '../../types/infra/mail/mailer.interface'

// Contenu NEUTRE (MDS-35) : produit et établissement seulement, jamais de service, de
// pathologie ni de donnée patient — un e-mail se lit par-dessus l'épaule et se transfère.

const escapeHtml = (value: string): string =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')

const layout = (paragraphs: string[], link: string, cta: string): string => `
<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;color:#1f2937">
  <h1 style="font-size:22px"><span style="color:#2563eb">Medi</span>Sync</h1>
  ${paragraphs.map((p) => `<p>${p}</p>`).join('\n  ')}
  <p><a href="${escapeHtml(link)}" style="display:inline-block;padding:10px 18px;background:#2563eb;color:#fff;border-radius:6px;text-decoration:none">${cta}</a></p>
  <p style="font-size:12px;color:#6b7280">Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :<br>${escapeHtml(link)}</p>
</div>`

export const invitationMail = ({
  to,
  link,
  establishmentName,
}: {
  to: string
  link: string
  establishmentName?: string
}): Mail => {
  const where = establishmentName ? ` pour ${establishmentName}` : ''
  const intro = `Un accès à MediSync a été ouvert à votre nom${where}.`
  const validity =
    "Ce lien est personnel, à usage unique et valable 7 jours. Si vous n'attendiez pas cet e-mail, ignorez-le."
  return {
    to,
    subject: 'Votre accès à MediSync',
    text: `${intro}\n\nChoisissez votre mot de passe en ouvrant ce lien :\n${link}\n\n${validity}`,
    html: layout(
      [
        escapeHtml(intro),
        'Choisissez votre mot de passe pour vous connecter.',
        escapeHtml(validity),
      ],
      link,
      'Choisir mon mot de passe',
    ),
  }
}

export const passwordResetMail = ({
  to,
  link,
}: {
  to: string
  link: string
}): Mail => {
  const intro =
    'Une réinitialisation du mot de passe de votre compte MediSync a été demandée.'
  const validity =
    "Ce lien est à usage unique et valable 1 heure. Si vous n'êtes pas à l'origine de cette demande, ignorez cet e-mail : votre mot de passe reste inchangé."
  return {
    to,
    subject: 'Réinitialisation de votre mot de passe MediSync',
    text: `${intro}\n\nChoisissez un nouveau mot de passe en ouvrant ce lien :\n${link}\n\n${validity}`,
    html: layout(
      [escapeHtml(intro), escapeHtml(validity)],
      link,
      'Choisir un nouveau mot de passe',
    ),
  }
}

export const memberAddedMail = ({
  to,
  link,
  establishmentName,
}: {
  to: string
  link: string
  establishmentName: string
}): Mail => {
  const intro = `Vous avez désormais accès à ${establishmentName} sur MediSync.`
  const how =
    'Connectez-vous avec votre adresse et votre mot de passe habituels.'
  return {
    to,
    subject: 'Nouvel accès sur MediSync',
    text: `${intro}\n\n${how}\n${link}`,
    html: layout([escapeHtml(intro), escapeHtml(how)], link, 'Se connecter'),
  }
}
