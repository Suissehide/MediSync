import type { IocContainer } from '../types/application/ioc'
import type {
  GrantInput,
  SuperAdminGrantDomainInterface,
} from '../types/domain/superAdminGrant.domain.interface'
import type {
  EstablishmentGrantRow,
  SuperAdminGrantEntityRepo,
} from '../types/infra/orm/repositories/accessGrant.repository.interface'
import type { AccessGrantRepositoryInterface } from '../types/infra/orm/repositories/accessGrant.repository.interface'
import type { EstablishmentRepositoryInterface } from '../types/infra/orm/repositories/establishment.repository.interface'

// Quatre heures par défaut (spec §3.5) : « assez pour comprendre un ennui et agir, trop peu pour
// qu'un octroi oublié devienne un accès permanent ». Le plafond de vingt-quatre heures, lui,
// n'est PAS appliqué ici : il est tenu par le schéma HTTP (`superAdminGrant.schema.ts`,
// `durationHours: z.number().positive().max(24)`), qui REFUSE une demande hors bornes plutôt que
// de la ramener silencieusement à la limite — « un plafond qui tronque sans le dire fait croire à
// ce qu'on a demandé » (task-8-brief.md). Dupliquer la borne ici serait une seconde source de
// vérité pour la même règle, avec le risque qu'elles divergent un jour.
const DEFAULT_GRANT_DURATION_HOURS = 4
const MS_PER_HOUR = 60 * 60 * 1000

class SuperAdminGrantDomain implements SuperAdminGrantDomainInterface {
  private readonly accessGrantRepository: AccessGrantRepositoryInterface
  private readonly establishmentRepository: EstablishmentRepositoryInterface

  constructor({ accessGrantRepository, establishmentRepository }: IocContainer) {
    this.accessGrantRepository = accessGrantRepository
    this.establishmentRepository = establishmentRepository
  }

  // `findByIdOrThrow` lève `Boom.notFound` si `establishmentId` est inconnu — vérifié AVANT
  // d'écrire, plutôt que de laisser la contrainte de clé étrangère de `SuperAdminAccessGrant`
  // échouer et retomber sur un message d'erreur générique pensé pour une suppression
  // (`errorHandler.boomErrorFromPrismaError`, code `FOREIGN_KEY_CONSTRAINT_FAILED` : « cannot be
  // deleted because... », trompeur ici puisqu'il s'agit d'une création).
  async grant({
    userId,
    establishmentId,
    reason,
    durationHours,
  }: GrantInput): Promise<SuperAdminGrantEntityRepo> {
    await this.establishmentRepository.findByIdOrThrow(establishmentId)
    const hours = durationHours ?? DEFAULT_GRANT_DURATION_HOURS
    const expiresAt = new Date(Date.now() + hours * MS_PER_HOUR)
    return this.accessGrantRepository.create({
      userId,
      establishmentId,
      reason,
      expiresAt,
    })
  }

  revoke(id: string): Promise<void> {
    return this.accessGrantRepository.revoke(id, new Date())
  }

  forEstablishment(): Promise<EstablishmentGrantRow[]> {
    return this.accessGrantRepository.findForEstablishment()
  }
}

export { SuperAdminGrantDomain }
