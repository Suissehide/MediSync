import type { PrimaTransactionClient } from '../infra/orm/client'

// Le lien de première connexion / réinitialisation d'accès (spec §6.1) : émis par
// `establishments:manage`, `members:manage`, le super-admin, et le « mot de passe oublié ».
// `resendableAt` : null si le renvoi est déjà possible, sinon la fin du délai de 5 minutes.
export type InvitationLinkState = { active: boolean; resendableAt: Date | null }

export interface AccessLinkDomainInterface {
  // Le jeton en clair n'est rendu QU'ICI, à l'émission — jamais relu ensuite (la table ne stocke
  // qu'une empreinte, voir accessLink.repository.ts). `issuedBy` est l'identifiant du compte qui
  // émet le lien (super-admin ou administrateur d'établissement selon l'appelant). `client`
  // optionnel : le client de transaction quand
  // l'émission doit faire partie d'une transaction plus large (`EstablishmentDomain`, qui doit
  // annuler le compte et l'établissement fraîchement créés si l'émission échoue elle-même).
  issue: (
    userId: string,
    issuedBy: string,
    client?: PrimaTransactionClient,
    validityMs?: number,
  ) => Promise<{ token: string }>
  // À appeler APRÈS la transaction qui a émis le jeton : un e-mail ne se rattrape pas.
  sendInvitation: (params: {
    email: string
    token: string
    establishmentName?: string
    soignantName?: string
  }) => void
  invitationLinks: (
    userIds: string[],
  ) => Promise<Map<string, InvitationLinkState>>
  // 429 si un lien a été émis pour ce compte il y a moins de 5 minutes.
  assertResendAllowed: (userId: string) => Promise<void>
  // Mot de passe oublié : ne lève rien et ne révèle pas si l'adresse existe.
  requestPasswordReset: (email: string) => Promise<void>
  // Consomme un lien et pose le mot de passe. Lève :
  //   - `Boom.resourceGone` (410) si le jeton est inconnu, déjà consommé ou expiré ;
  //   - `Boom.unauthorized` (401) si le compte cible est désactivé — SANS consommer le lien
  //     (refuser ne doit jamais brûler le jeton).
  consume: (token: string, password: string) => Promise<{ email: string }>
}
