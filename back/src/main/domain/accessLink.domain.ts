import Boom from '@hapi/boom'

import { invitationMail, passwordResetMail } from '../infra/mail/templates'
import type { IocContainer } from '../types/application/ioc'
import type {
  AccessLinkDomainInterface,
  InvitationLinkState,
} from '../types/domain/accessLink.domain.interface'
import type { MailerInterface } from '../types/infra/mail/mailer.interface'
import type { PrimaTransactionClient } from '../types/infra/orm/client'
import type { AccessLinkRepositoryInterface } from '../types/infra/orm/repositories/accessLink.repository.interface'
import type { UserRepositoryInterface } from '../types/infra/orm/repositories/user.repository.interface'
import { randomToken, sha256Hex } from '../utils/hash'

// 32 octets, encodés en base64url par `randomToken` (utils/hash.ts). Invitation : trente jours,
// au-delà l'invitation s'affiche « expirée » et l'admin la renvoie. Mot de passe
// oublié : une heure, la personne vient de le demander (MDS-35).
const TOKEN_BYTES = 32
const INVITATION_VALIDITY_MS = 30 * 24 * 60 * 60 * 1000
const RESET_VALIDITY_MS = 60 * 60 * 1000
// Délai minimal entre deux renvois d'invitation : évite d'inonder la boîte de la personne.
const RESEND_COOLDOWN_MS = 5 * 60 * 1000

const INVALID_OR_EXPIRED = 'Invalid or expired access link'

class AccessLinkDomain implements AccessLinkDomainInterface {
  private readonly accessLinkRepository: AccessLinkRepositoryInterface
  private readonly userRepository: UserRepositoryInterface
  private readonly mailer: MailerInterface
  private readonly frontUrl: string

  constructor({
    accessLinkRepository,
    userRepository,
    mailer,
    config,
  }: IocContainer) {
    this.accessLinkRepository = accessLinkRepository
    this.userRepository = userRepository
    this.mailer = mailer
    this.frontUrl = config.frontUrl
  }

  // Le jeton part en FRAGMENT (`#`) : jamais envoyé au serveur par le navigateur, donc absent
  // des journaux d'accès et des en-têtes Referer.
  private linkFor(token: string): string {
    return `${this.frontUrl}/auth/access-link#${token}`
  }

  sendInvitation(params: {
    email: string
    token: string
    establishmentName?: string
  }): void {
    this.mailer.send(
      'invitation',
      invitationMail({
        to: params.email,
        link: this.linkFor(params.token),
        establishmentName: params.establishmentName,
      }),
    )
  }

  // Ne lève jamais et ne dit rien : la route répond pareil que l'adresse existe ou non.
  // Un compte désactivé ne reçoit rien (`consume` le refuserait de toute façon).
  async requestPasswordReset(email: string): Promise<void> {
    const user = await this.userRepository.findByEmail(email).catch(() => null)
    if (!user || user.deactivatedAt !== null) {
      return
    }
    const { token } = await this.issue(
      user.id,
      user.id,
      undefined,
      RESET_VALIDITY_MS,
    )
    this.mailer.send(
      'password-reset',
      passwordResetMail({ to: user.email, link: this.linkFor(token) }),
    )
  }

  async assertResendAllowed(userId: string): Promise<void> {
    const last = await this.accessLinkRepository.findLatestCreatedAt(userId)
    if (last && Date.now() - last.getTime() < RESEND_COOLDOWN_MS) {
      throw Boom.tooManyRequests(
        'An invitation was sent less than 5 minutes ago',
      )
    }
  }

  // Pour chaque compte : son lien est-il encore utilisable, et à partir de quand le renvoyer.
  async invitationLinks(
    userIds: string[],
  ): Promise<Map<string, InvitationLinkState>> {
    if (userIds.length === 0) {
      return new Map()
    }
    const now = Date.now()
    const links = await this.accessLinkRepository.findLatestLinks(userIds)
    return new Map(
      links.map((link) => {
        const resendableAt = link.createdAt.getTime() + RESEND_COOLDOWN_MS
        return [
          link.userId,
          {
            active: link.usedAt === null && link.expiresAt.getTime() > now,
            resendableAt: resendableAt > now ? new Date(resendableAt) : null,
          },
        ]
      }),
    )
  }

  async issue(
    userId: string,
    issuedBy: string,
    client?: PrimaTransactionClient,
    validityMs: number = INVITATION_VALIDITY_MS,
  ): Promise<{ token: string }> {
    const now = new Date()
    const token = randomToken(TOKEN_BYTES)
    // `client` : voir le commentaire détaillé sur
    // `AccessLinkDomainInterface.issue`. Change seulement le SORT de CET appel (rattaché à une
    // transaction plus large s'il en fournit une) — n'a aucun effet sur la course décrite
    // ci-dessous, qui porte sur DEUX APPELS DISTINCTS à `issue`, chacun avec son propre `client`
    // (ou aucun), jamais sur les deux écritures d'un même appel entre elles.
    // Réémettre invalide tout lien encore utilisable du même compte (spec §6.1), AVANT de créer
    // le nouveau : une réémission qui suit une réémission précédente (l'usage attendu — un seul
    // administrateur, un clic, puis un autre plus tard) invalide bien la précédente ; éprouvé en
    // e2e (« reemettre un lien invalide le precedent »).
    //
    // CE QUE CECI NE FERME PAS : le nombre de survivants est VARIABLE, sans chiffre stable
    // observé d'une machine à l'autre — `invalidateActiveForUser` et `create` ne sont pas une
    // seule opération atomique, et rien n'empêche N appels de ce domaine de s'exécuter en
    // parallèle sur le même `userId`, chacun invalidant ce qui existait AVANT que les autres
    // n'aient écrit leur propre ligne. Ce qui reste vrai dans TOUS les cas mesurés, à ce jour,
    // quelle que soit la machine : il en reste PLUS D'UN — jamais réduit à 1 seul — la course
    // n'est pas fermée. Contrairement à `consumeIfActive`, qui protège une PROPRIÉTÉ garantie
    // explicitement par ailleurs (un jeton ne se consomme qu'une fois, y compris sous course),
    // rien ne demande qu'ÉMETTRE soit mutuellement exclusif — seulement que RÉÉMETTRE invalide ce
    // qui précède, ce qui reste vrai en séquence. Fermer aussi le cas concurrent demanderait une
    // contrainte portée par la base (ex. un index unique partiel sur `(userId) WHERE usedAt IS
    // NULL`) ou un verrou consultatif par compte — une migration de schéma ou un mécanisme de
    // verrouillage qu'aucune exigence actuelle ne réclame, pour un scénario rare (le MÊME compte
    // administrateur émettant pour le MÊME utilisateur au même instant) et auto-limité par
    // l'expiration (trente jours au plus) de tout lien qui en résulterait. Choix assumé : documenter la
    // limite plutôt que la fermer sans qu'elle soit demandée — voir « emissions simultanees »
    // dans access-link.test.ts, qui constate ce comportement (plus d'un lien utilisable) plutôt
    // que d'affirmer le contraire.
    await this.accessLinkRepository.invalidateActiveForUser(userId, now, client)
    await this.accessLinkRepository.create(
      {
        userId,
        tokenHash: sha256Hex(token),
        createdBy: issuedBy,
        expiresAt: new Date(now.getTime() + validityMs),
      },
      client,
    )
    // Le jeton en clair n'est rendu QU'ICI : la base ne voit jamais que son empreinte
    // (`AccessLink.tokenHash`), jamais le jeton — voir prisma/schema.prisma.
    return { token }
  }

  async consume(token: string, password: string): Promise<{ email: string }> {
    const tokenHash = sha256Hex(token)
    const link =
      await this.accessLinkRepository.findByTokenHashWithUser(tokenHash)
    if (!link) {
      throw Boom.resourceGone(INVALID_OR_EXPIRED)
    }
    // Vérifié AVANT toute consommation : un compte désactivé refuse un lien par ailleurs valide,
    // et ce refus ne doit jamais brûler le jeton. Un lien qui n'est PAS
    // consommé ici reste utilisable si le compte est un jour réactivé.
    if (link.user.deactivatedAt !== null) {
      throw Boom.unauthorized('Account deactivated')
    }
    const now = new Date()
    // Usage unique tenu PAR LA BASE : voir le commentaire de
    // `AccessLinkRepositoryInterface.consumeIfActive`. Sous deux consommations simultanées du
    // même jeton, une seule de ces deux invocations reçoit `true`.
    const consumed = await this.accessLinkRepository.consumeIfActive(
      tokenHash,
      now,
    )
    if (!consumed) {
      throw Boom.resourceGone(INVALID_OR_EXPIRED)
    }
    await this.userRepository.updatePassword(link.userId, password)
    // L'adresse du compte que le lien désigne : la page s'y connecte, sans la redemander.
    return { email: link.user.email }
  }
}

export { AccessLinkDomain }
