export type Mail = {
  to: string
  subject: string
  text: string
  html: string
}

// Le transport réellement branché (nodemailer en prod, faux transport en test).
export type MailTransport = {
  sendMail: (mail: Mail & { from: string }) => Promise<unknown>
}

export interface MailerInterface {
  // Met en file et rend la main : l'envoi et ses reprises se font en arrière-plan.
  // `kind` est ce qui part au journal, jamais le contenu (qui porte le jeton).
  send: (kind: string, mail: Mail) => void
}
