import Boom from '@hapi/boom'

import type { IocContainer } from '../types/application/ioc'
import type {
  AccountSearchResult,
  PasswordChangeDomain,
  UserDomainInterface,
  UserEntityDomain,
  UserProfileUpdateDomain,
} from '../types/domain/user.domain.interface'
import type { EstablishmentRepositoryInterface } from '../types/infra/orm/repositories/establishment.repository.interface'
import type {
  UserEntityRepo,
  UserRepositoryInterface,
} from '../types/infra/orm/repositories/user.repository.interface'
import { verifyPassword } from '../utils/hash'

class UserDomain implements UserDomainInterface {
  private readonly userRepository: UserRepositoryInterface
  private readonly establishmentRepository: EstablishmentRepositoryInterface

  constructor({ userRepository, establishmentRepository }: IocContainer) {
    this.userRepository = userRepository
    this.establishmentRepository = establishmentRepository
  }

  findByID(userID: string): Promise<UserEntityDomain> {
    return this.userRepository.findByID(userID)
  }

  updateProfile(
    userID: string,
    params: UserProfileUpdateDomain,
  ): Promise<UserEntityRepo> {
    return this.userRepository.updateProfile(userID, params)
  }

  async changePassword(
    userID: string,
    { currentPassword, newPassword }: PasswordChangeDomain,
  ): Promise<void> {
    const user = await this.userRepository.findByID(userID)
    const valid = verifyPassword({
      password: currentPassword,
      salt: user.salt,
      hash: user.password,
    })
    if (!valid) {
      throw Boom.forbidden('Current password is incorrect')
    }
    await this.userRepository.updatePassword(userID, newPassword)
  }

  // Tâche 7 (étape 4a) : recherche d'un compte (spec §3.4). `findByEmail` lève `Boom.notFound`
  // pour une adresse inconnue (findUniqueOrThrow) — laissé remonter tel quel, comme partout
  // ailleurs dans ce fichier. Les rattachements et le nom de chaque établissement viennent de
  // DEUX lectures séparées (`membershipsForUser`, `findManyByIds`) jointes ici EN MÉMOIRE — jamais
  // un `include`, voir le commentaire au-dessus de `SUPERADMIN_OPERATIONS` (tenant-guard.ts).
  async searchByEmail(email: string): Promise<AccountSearchResult> {
    const user = await this.userRepository.findByEmail(email)
    const memberships = await this.establishmentRepository.membershipsForUser(user.id)
    const establishmentIds = [...new Set(memberships.map((m) => m.establishmentId))]
    const establishments = await this.establishmentRepository.findManyByIds(establishmentIds)
    const nameById = new Map(establishments.map((e) => [e.id, e.name]))

    return {
      id: user.id,
      email: user.email,
      deactivatedAt: user.deactivatedAt,
      lastLoginAt: user.lastLoginAt,
      memberships: memberships.map((m) => ({
        establishmentId: m.establishmentId,
        establishmentName: nameById.get(m.establishmentId) ?? '',
        role: m.role,
        createdAt: m.createdAt,
      })),
    }
  }
}

export { UserDomain }
