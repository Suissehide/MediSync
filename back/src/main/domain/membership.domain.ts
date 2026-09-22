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

class MembershipDomain implements MembershipDomainInterface {
  private readonly membershipRepository: MembershipRepositoryInterface
  private readonly userRepository: UserRepositoryInterface
  private readonly soignantRepository: SoignantRepositoryInterface
  private readonly tenantContext: TenantContextInterface

  constructor({
    membershipRepository,
    userRepository,
    soignantRepository,
    tenantContext,
  }: IocContainer) {
    this.membershipRepository = membershipRepository
    this.userRepository = userRepository
    this.soignantRepository = soignantRepository
    this.tenantContext = tenantContext
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
      throw Boom.notFound('Unknown user')
    })
    if (await this.membershipRepository.findByUserID(user.id)) {
      throw Boom.conflict('User is already a member')
    }
    await this.assertReferences(soignantId, services)
    return await this.membershipRepository.create({
      userId: user.id,
      role,
      soignantId,
      services,
    })
  }

  // Un établissement doit garder au moins un administrateur actif.
  private async assertNotLastAdmin(
    membership: MembershipRowDomain,
  ): Promise<void> {
    if (
      membership.role === 'ADMIN' &&
      (await this.membershipRepository.countAdmins()) <= 1
    ) {
      throw Boom.conflict('Cannot remove the last administrator')
    }
  }

  // Un administrateur ne peut ni se retirer ni se désactiver lui-même.
  private assertNotSelf(membership: MembershipRowDomain): void {
    if (membership.userId === this.tenantContext.current().userId) {
      throw Boom.conflict('Cannot apply this action to your own account')
    }
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
    return await this.membershipRepository.update(id, params)
  }

  async remove(id: string): Promise<void> {
    const membership = await this.membershipRepository.findByID(id)
    this.assertNotSelf(membership)
    await this.assertNotLastAdmin(membership)
    await this.membershipRepository.delete(id)
  }

  async setDeactivated(
    id: string,
    deactivated: boolean,
  ): Promise<MembershipRowDomain> {
    const membership = await this.membershipRepository.findByID(id)
    if (deactivated) {
      this.assertNotSelf(membership)
      await this.assertNotLastAdmin(membership)
    }
    await this.userRepository.setDeactivated(
      membership.userId,
      deactivated ? new Date() : null,
    )
    return await this.membershipRepository.findByID(id)
  }
}

export { MembershipDomain }
