import Boom from '@hapi/boom'

import type { IocContainer } from '../types/application/ioc'
import type { AccessLinkDomainInterface } from '../types/domain/accessLink.domain.interface'
import type { PrimaTransactionClient } from '../types/infra/orm/client'
import type { AccessLinkRepositoryInterface } from '../types/infra/orm/repositories/accessLink.repository.interface'
import type { UserRepositoryInterface } from '../types/infra/orm/repositories/user.repository.interface'
import { randomToken, sha256Hex } from '../utils/hash'

// 32 octets, encodés en base64url par `randomToken` (utils/hash.ts). Sept jours plutôt que deux :
// la transmission est manuelle (aucune infrastructure de courriel), et un appel qui n'aboutit pas
// un vendredi ne doit pas tout faire recommencer le lundi (spec §6.1).
const TOKEN_BYTES = 32
const VALIDITY_DAYS = 7
const MS_PER_DAY = 24 * 60 * 60 * 1000

const addDays = (date: Date, days: number): Date =>
  new Date(date.getTime() + days * MS_PER_DAY)

const INVALID_OR_EXPIRED = 'Invalid or expired access link'

class AccessLinkDomain implements AccessLinkDomainInterface {
  private readonly accessLinkRepository: AccessLinkRepositoryInterface
  private readonly userRepository: UserRepositoryInterface

  constructor({ accessLinkRepository, userRepository }: IocContainer) {
    this.accessLinkRepository = accessLinkRepository
    this.userRepository = userRepository
  }

  async issue(
    userId: string,
    issuedBy: string,
    client?: PrimaTransactionClient,
  ): Promise<{ token: string }> {
    const now = new Date()
    const token = randomToken(TOKEN_BYTES)
    // `client` (tâche 6, tour de correction 1) : voir le commentaire détaillé sur
    // `AccessLinkDomainInterface.issue`. Change seulement le SORT de CET appel (rattaché à une
    // transaction plus large s'il en fournit une) — n'a aucun effet sur la course décrite
    // ci-dessous, qui porte sur DEUX APPELS DISTINCTS à `issue`, chacun avec son propre `client`
    // (ou aucun), jamais sur les deux écritures d'un même appel entre elles.
    // Réémettre invalide tout lien encore utilisable du même compte (spec §6.1), AVANT de créer
    // le nouveau : une réémission qui suit une réémission précédente (l'usage attendu — un seul
    // administrateur, un clic, puis un autre plus tard) invalide bien la précédente ; éprouvé en
    // e2e (« reemettre un lien invalide le precedent »).
    //
    // CE QUE CECI NE FERME PAS (étape 4a, tâche 4, tour de correction 1, Important n°3, PRÉCISÉ
    // au tour 2 — « de 4 à 6, non déterministe » restait imprécis — PUIS AU TOUR 3 : mon chiffre
    // « 29 fois sur 30 » ne s'est pas reproduit à la relecture (neuf exécutions sur neuf y ont
    // donné quatre ou cinq survivants). Je n'affirme donc plus de fréquence : le nombre de
    // survivants est VARIABLE, sans chiffre stable observé d'une machine ou d'un tour à l'autre —
    // `invalidateActiveForUser` et `create` ne sont pas une seule opération atomique, et rien
    // n'empêche N appels de ce domaine de s'exécuter en parallèle sur le même `userId`, chacun
    // invalidant ce qui existait AVANT que les autres n'aient écrit leur propre ligne. Ce qui
    // reste vrai dans TOUS les cas mesurés, à ce jour, quelle que soit la machine : il en reste
    // PLUS D'UN — jamais réduit à 1 seul — la course n'est pas fermée. Contrairement à
    // `consumeIfActive`
    // (Review Focus n°1), qui protège une PROPRIÉTÉ que le brief nomme explicitement (un jeton ne
    // se consomme qu'une fois, y compris sous course), le brief ne demande nulle part qu'ÉMETTRE
    // soit mutuellement exclusif — seulement que RÉÉMETTRE invalide ce qui précède, ce qui reste
    // vrai en séquence. Fermer aussi le cas concurrent demanderait une contrainte portée par la
    // base (ex. un index unique partiel sur `(userId) WHERE usedAt IS NULL`) ou un verrou
    // consultatif par compte — une migration de schéma ou un mécanisme de verrouillage qu'aucune
    // tâche de ce plan ne réclame, pour un scénario rare (le MÊME compte administrateur émettant
    // pour le MÊME utilisateur au même instant) et auto-limité par l'expiration à sept jours de
    // tout lien qui en résulterait. Choix assumé : documenter la limite plutôt que la fermer sans
    // qu'elle soit demandée — voir « emissions simultanees » dans access-link.test.ts, qui
    // constate ce comportement (plus d'un lien utilisable) plutôt que
    // d'affirmer le contraire.
    await this.accessLinkRepository.invalidateActiveForUser(userId, now, client)
    await this.accessLinkRepository.create(
      {
        userId,
        tokenHash: sha256Hex(token),
        createdBy: issuedBy,
        expiresAt: addDays(now, VALIDITY_DAYS),
      },
      client,
    )
    // Le jeton en clair n'est rendu QU'ICI : la base ne voit jamais que son empreinte
    // (`AccessLink.tokenHash`), jamais le jeton — voir prisma/schema.prisma.
    return { token }
  }

  async consume(token: string, password: string): Promise<void> {
    const tokenHash = sha256Hex(token)
    const link = await this.accessLinkRepository.findByTokenHashWithUser(tokenHash)
    if (!link) {
      throw Boom.resourceGone(INVALID_OR_EXPIRED)
    }
    // Vérifié AVANT toute consommation : un compte désactivé refuse un lien par ailleurs valide,
    // et ce refus ne doit jamais brûler le jeton (Review Focus n°5). Un lien qui n'est PAS
    // consommé ici reste utilisable si le compte est un jour réactivé.
    if (link.user.deactivatedAt !== null) {
      throw Boom.unauthorized('Account deactivated')
    }
    const now = new Date()
    // Usage unique tenu PAR LA BASE (Review Focus n°1) : voir le commentaire de
    // `AccessLinkRepositoryInterface.consumeIfActive`. Sous deux consommations simultanées du
    // même jeton, une seule de ces deux invocations reçoit `true`.
    const consumed = await this.accessLinkRepository.consumeIfActive(tokenHash, now)
    if (!consumed) {
      throw Boom.resourceGone(INVALID_OR_EXPIRED)
    }
    await this.userRepository.updatePassword(link.userId, password)
  }
}

export { AccessLinkDomain }
