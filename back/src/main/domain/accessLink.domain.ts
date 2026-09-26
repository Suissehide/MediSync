import Boom from '@hapi/boom'

import type { IocContainer } from '../types/application/ioc'
import type { AccessLinkDomainInterface } from '../types/domain/accessLink.domain.interface'
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

  async issue(userId: string, issuedBy: string): Promise<{ token: string }> {
    const now = new Date()
    const token = randomToken(TOKEN_BYTES)
    // Réémettre invalide tout lien encore utilisable du même compte (spec §6.1), AVANT de créer
    // le nouveau : un compte n'a donc jamais plus d'un lien utilisable à la fois.
    await this.accessLinkRepository.invalidateActiveForUser(userId, now)
    await this.accessLinkRepository.create({
      userId,
      tokenHash: sha256Hex(token),
      createdBy: issuedBy,
      expiresAt: addDays(now, VALIDITY_DAYS),
    })
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
