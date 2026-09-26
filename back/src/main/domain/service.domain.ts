import type { IocContainer } from '../types/application/ioc'
import type {
  ServiceCreateEntityDomain,
  ServiceDeactivationImpactDomain,
  ServiceDomainInterface,
  ServiceEntityDomain,
  ServiceUpdateEntityDomain,
} from '../types/domain/service.domain.interface'
import type { PatientServiceFileRepositoryInterface } from '../types/infra/orm/repositories/patientServiceFile.repository.interface'
import type { ServiceRepositoryInterface } from '../types/infra/orm/repositories/service.repository.interface'
import type { TenantContextInterface } from '../types/utils/tenant-context'

class ServiceDomain implements ServiceDomainInterface {
  private readonly serviceRepository: ServiceRepositoryInterface
  private readonly patientServiceFileRepository: PatientServiceFileRepositoryInterface
  private readonly tenantContext: TenantContextInterface

  constructor({
    serviceRepository,
    patientServiceFileRepository,
    tenantContext,
  }: IocContainer) {
    this.serviceRepository = serviceRepository
    this.patientServiceFileRepository = patientServiceFileRepository
    this.tenantContext = tenantContext
  }

  findAll(): Promise<ServiceEntityDomain[]> {
    return this.serviceRepository.findAll()
  }

  // Décision 3.2 (spec §3.2) : créer un service y rattache son créateur, comme COORDINATEUR.
  // Motif écrit à sa place (design, la seule source de vérité pour ce genre de règle) : la
  // personne qui crée un service est déjà administratrice de son établissement, donc elle
  // pouvait de toute façon s'y affecter en un clic — le rattachement ne lui accorde rien
  // qu'elle ne pouvait s'accorder, il lui épargne un détour et évite qu'un établissement neuf
  // commence par un cul-de-sac (aucun service, donc aucun écran de service accessible à
  // personne). `creatorUserId` vient du tenant courant, jamais du corps de la requête.
  create(
    serviceCreateParams: ServiceCreateEntityDomain,
  ): Promise<ServiceEntityDomain> {
    const { userId } = this.tenantContext.current()
    return this.serviceRepository.create(serviceCreateParams, userId)
  }

  update(
    serviceID: string,
    { deactivated, ...rest }: ServiceUpdateEntityDomain,
  ): Promise<ServiceEntityDomain> {
    return this.serviceRepository.update(serviceID, {
      ...rest,
      deactivatedAt:
        deactivated === undefined ? undefined : deactivated ? new Date() : null,
    })
  }

  // Décision 3.6 (spec §3.6) : avertir plutôt qu'exiger un transfert. Vérifie d'abord que le
  // service appartient bien à l'établissement courant (`findByID` lève 404 sinon) avant de
  // livrer les deux comptes à l'écran.
  async impactDesactivation(
    serviceID: string,
  ): Promise<ServiceDeactivationImpactDomain> {
    const service = await this.serviceRepository.findByID(serviceID)
    return this.patientServiceFileRepository.impactDesactivation(
      service.id,
      service.establishmentId,
    )
  }
}

export { ServiceDomain }
