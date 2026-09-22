import Boom from '@hapi/boom'

import type { IocContainer } from '../types/application/ioc'
import type {
  MembershipAddByEmailDomain,
  MembershipDomainInterface,
  MembershipRowDomain,
  MembershipUpdateDomain,
} from '../types/domain/membership.domain.interface'
import type {
  MembershipRepositoryInterface,
  ServiceAssignment,
} from '../types/infra/orm/repositories/membership.repository.interface'
import type { SoignantRepositoryInterface } from '../types/infra/orm/repositories/soignant.repository.interface'
import type { UserRepositoryInterface } from '../types/infra/orm/repositories/user.repository.interface'
import type { TenantContextInterface } from '../types/utils/tenant-context'
import type { AppEventBus } from '../utils/app-event-bus'

// Une adresse inconnue et une adresse déjà membre échouent de la même façon,
// avec le même code et le même message : sinon un administrateur pourrait
// énumérer les adresses qui ont un compte sur la plateforme. Même parti pris
// que la connexion, qui ne distingue pas non plus l'adresse inconnue du mot
// de passe erroné.
const UNADDABLE_EMAIL = 'This e-mail address cannot be added as a member'

class MembershipDomain implements MembershipDomainInterface {
  private readonly membershipRepository: MembershipRepositoryInterface
  private readonly userRepository: UserRepositoryInterface
  private readonly soignantRepository: SoignantRepositoryInterface
  private readonly tenantContext: TenantContextInterface
  private readonly appEventBus: AppEventBus

  constructor({
    membershipRepository,
    userRepository,
    soignantRepository,
    tenantContext,
    appEventBus,
  }: IocContainer) {
    this.membershipRepository = membershipRepository
    this.userRepository = userRepository
    this.soignantRepository = soignantRepository
    this.tenantContext = tenantContext
    this.appEventBus = appEventBus
  }

  findAll(): Promise<MembershipRowDomain[]> {
    return this.membershipRepository.findAll()
  }

  // Les références venues du client sont vérifiées dans l'établissement
  // courant avant toute écriture : le soignant par un repository filtré par
  // establishmentId, les services par un `count` lui aussi filtré.
  private async assertReferences(
    soignantId: string | null | undefined,
    services: ServiceAssignment[] | undefined,
  ): Promise<void> {
    if (soignantId) {
      await this.soignantRepository.findByID(soignantId)
    }
    for (const service of services ?? []) {
      if (!(await this.membershipRepository.serviceExists(service.serviceId))) {
        throw Boom.notFound(`Service ${service.serviceId} not found`)
      }
    }
  }

  async addByEmail({
    email,
    role,
    soignantId,
    services,
  }: MembershipAddByEmailDomain): Promise<MembershipRowDomain> {
    const user = await this.userRepository.findByEmail(email).catch(() => {
      throw Boom.badRequest(UNADDABLE_EMAIL)
    })
    if (await this.membershipRepository.findByUserID(user.id)) {
      throw Boom.badRequest(UNADDABLE_EMAIL)
    }
    await this.assertReferences(soignantId, services)
    const membership = await this.membershipRepository.create({
      userId: user.id,
      role,
      soignantId,
      services,
    })
    this.emit('member.added', membership.id)
    return membership
  }

  // Un établissement doit garder au moins un administrateur actif. Un compte
  // déjà désactivé ne compte pas parmi eux (`countAdmins` l'exclut) : refuser
  // de le retirer ou de le rétrograder ne protégerait donc rien, et
  // empêcherait de faire le ménage.
  private async assertNotLastAdmin(
    membership: MembershipRowDomain,
  ): Promise<void> {
    if (membership.role !== 'ADMIN' || membership.user.deactivatedAt !== null) {
      return
    }
    if ((await this.membershipRepository.countAdmins()) <= 1) {
      throw Boom.conflict('Cannot remove the last administrator')
    }
  }

  // Un administrateur ne peut ni se retirer ni se désactiver lui-même.
  private assertNotSelf(membership: MembershipRowDomain): void {
    if (membership.userId === this.currentUserId()) {
      throw Boom.conflict('Cannot apply this action to your own account')
    }
  }

  // `User.deactivatedAt` porte sur l'identité globale, partagée par tous les
  // établissements du compte : l'écrire depuis un établissement couperait
  // aussi l'accès aux autres, où l'administrateur n'a aucun droit. Tant que
  // la désactivation n'est pas portée par l'appartenance, on refuse les deux
  // sens (couper comme rétablir) sur un compte multi-établissement.
  private async assertSingleEstablishment(
    membership: MembershipRowDomain,
  ): Promise<void> {
    const user = await this.userRepository.findByID(membership.userId)
    if (user.establishmentMemberships.length > 1) {
      throw Boom.conflict(
        'This account belongs to several establishments; its activation cannot be changed from here',
      )
    }
  }

  private currentUserId(): string {
    return this.tenantContext.current().userId
  }

  private emit(
    event:
      | 'member.added'
      | 'member.updated'
      | 'member.removed'
      | 'member.deactivated'
      | 'member.reactivated',
    membershipId: string,
  ): void {
    this.appEventBus.emit(event, { userID: this.currentUserId(), membershipId })
  }

  async update(
    id: string,
    params: MembershipUpdateDomain,
  ): Promise<MembershipRowDomain> {
    const membership = await this.membershipRepository.findByID(id)
    if (params.role === 'MEMBER') {
      await this.assertNotLastAdmin(membership)
    }
    await this.assertReferences(params.soignantId, params.services)
    const updated = await this.membershipRepository.update(id, params)
    this.emit('member.updated', id)
    return updated
  }

  async remove(id: string): Promise<void> {
    const membership = await this.membershipRepository.findByID(id)
    this.assertNotSelf(membership)
    await this.assertNotLastAdmin(membership)
    await this.membershipRepository.delete(id)
    this.emit('member.removed', id)
  }

  async setDeactivated(
    id: string,
    deactivated: boolean,
  ): Promise<MembershipRowDomain> {
    const membership = await this.membershipRepository.findByID(id)
    await this.assertSingleEstablishment(membership)
    if (deactivated) {
      this.assertNotSelf(membership)
      await this.assertNotLastAdmin(membership)
    }
    await this.userRepository.setDeactivated(
      membership.userId,
      deactivated ? new Date() : null,
    )
    this.emit(deactivated ? 'member.deactivated' : 'member.reactivated', id)
    return await this.membershipRepository.findByID(id)
  }
}

export { MembershipDomain }
