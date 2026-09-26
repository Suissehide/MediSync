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

// Repli défensif, nommé plutôt que laissé en `?? ''` silencieux (tour de correction 1, mineur) :
// `establishmentIds` vient d'être extrait des rattachements eux-mêmes, `findManyByIds` DEVRAIT
// donc toujours résoudre un nom pour chacun — sauf incohérence (aucune route ne supprime un
// établissement aujourd'hui). Une chaîne vide plutôt qu'une exception, pour la même raison que
// `UNRESOLVED_ACCOUNT_EMAIL` (establishment.repository.ts) : un diagnostic de super-admin doit
// rester utilisable face à une incohérence, pas s'arrêter dessus.
const UNRESOLVED_ESTABLISHMENT_NAME = ''

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
  // pour une adresse inconnue (findUniqueOrThrow), mais avec le message générique de
  // `errorHandler.boomErrorFromPrismaError` (« User with this ID doesn't exist ») — juste pour
  // une recherche par IDENTIFIANT technique, trompeur ici où l'appelant a cherché par ADRESSE
  // (tour de correction 1, mineur). Recomposé avec un message propre à cette route ; c'est le
  // SEUL endroit du fichier où `findByEmail` peut atteindre un appelant HTTP sans avoir d'abord
  // été absorbé (`AuthDomain.signIn` retombe sur un 401 générique, `EstablishmentDomain.
  // createWithFirstAdmin` sur `null`) — les autres n'ont donc pas ce problème.
  //
  // Les rattachements et le nom de chaque établissement viennent de DEUX lectures séparées
  // (`membershipsForUser`, `findManyByIds`) jointes ici EN MÉMOIRE — jamais un `include`, voir le
  // commentaire au-dessus de `SUPERADMIN_OPERATIONS` (tenant-guard.ts).
  async searchByEmail(email: string): Promise<AccountSearchResult> {
    const user = await this.userRepository.findByEmail(email).catch((err: unknown) => {
      if (Boom.isBoom(err) && err.output.statusCode === 404) {
        throw Boom.notFound('No account with this email')
      }
      throw err
    })
    const memberships = await this.establishmentRepository.membershipsForUser(user.id)
    const establishmentIds = [...new Set(memberships.map((m) => m.establishmentId))]
    const establishments = await this.establishmentRepository.findManyByIds(establishmentIds)
    const nameById = new Map(establishments.map((e) => [e.id, e.name]))

    return {
      id: user.id,
      email: user.email,
      // Tour de correction 2 (arbitrage de Léo) : le nom est visible, comme partout où le
      // super-admin regarde — voir le commentaire sur `FirstAdmin`
      // (establishment.repository.interface.ts).
      firstName: user.firstName,
      lastName: user.lastName,
      deactivatedAt: user.deactivatedAt,
      lastLoginAt: user.lastLoginAt,
      memberships: memberships.map((m) => ({
        establishmentId: m.establishmentId,
        establishmentName: nameById.get(m.establishmentId) ?? UNRESOLVED_ESTABLISHMENT_NAME,
        role: m.role,
        createdAt: m.createdAt,
      })),
    }
  }
}

export { UserDomain }
