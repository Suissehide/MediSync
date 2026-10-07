import Boom from '@hapi/boom'

import type { IocContainer } from '../../../types/application/ioc'
import type {
  LocationCreateEntityRepo,
  LocationEntityRepo,
  LocationRepositoryInterface,
  LocationUpdateEntityRepo,
} from '../../../types/infra/orm/repositories/location.repository.interface'
import type { ErrorHandlerInterface } from '../../../types/utils/error-handler'
import type { TenantContextInterface } from '../../../types/utils/tenant-context'
import { phraseDesReferences } from '../../../utils/references-referentiel'
import type { PostgresPrismaClient } from '../postgres-client'

class LocationRepository implements LocationRepositoryInterface {
  private readonly prisma: PostgresPrismaClient
  private readonly errorHandler: ErrorHandlerInterface
  private readonly tenantContext: TenantContextInterface

  constructor({ postgresOrm, errorHandler, tenantContext }: IocContainer) {
    this.prisma = postgresOrm.prisma
    this.errorHandler = errorHandler
    this.tenantContext = tenantContext
  }

  // Modele de service depuis le 2026-09-29 (migration `soignants_salles_par_service`) : chaque
  // service tient sa propre liste. `scope()` porte serviceId ET establishmentId ; il leve hors
  // d'un contexte de service.
  private get scope() {
    return this.tenantContext.scope()
  }

  findAll(archived = false): Promise<LocationEntityRepo[]> {
    return this.prisma.location.findMany({
      where: { ...this.scope, archivedAt: archived ? { not: null } : null },
    })
  }

  // Ne filtre pas les archivees, volontairement : les domaines s'en servent pour
  // valider la cible d'une reference. Filtrer ici casserait le simple
  // reenregistrement d'une ligne qui en porte deja une archivee.
  async findByID(locationID: string): Promise<LocationEntityRepo> {
    try {
      return await this.prisma.location.findUniqueOrThrow({
        where: {
          id_serviceId: { id: locationID, serviceId: this.scope.serviceId },
        },
      })
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({
        entityName: 'Location',
        error: err,
      })
    }
  }

  async create(
    locationCreateParams: LocationCreateEntityRepo,
  ): Promise<LocationEntityRepo> {
    try {
      return await this.prisma.location.create({
        data: { name: locationCreateParams.name, ...this.scope },
      })
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({
        entityName: 'Location',
        error: err,
      })
    }
  }

  async update(
    locationID: string,
    locationUpdateParams: LocationUpdateEntityRepo,
  ): Promise<LocationEntityRepo> {
    try {
      return await this.prisma.location.update({
        where: {
          id_serviceId: { id: locationID, serviceId: this.scope.serviceId },
        },
        data: {
          name: locationUpdateParams.name,
          ...(locationUpdateParams.archived !== undefined && {
            archivedAt: locationUpdateParams.archived ? new Date() : null,
          }),
        },
      })
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({
        entityName: 'Location',
        error: err,
      })
    }
  }
  // Suppression DEFINITIVE, reservee aux lignes deja archivees. Le refus de
  // fond vient de la base (`onDelete: Restrict`) ; ce comptage ne sert qu'a
  // dire en francais ce qui bloque, avant d'aller buter dessus.
  async deleteForever(locationID: string): Promise<void> {
    const comptes = await Promise.all([
      this.prisma.slotTemplate.count({ where: { locationID, ...this.scope } }),
    ])
    const bloquant = phraseDesReferences([
      {
        count: comptes[0] as number,
        singulier: 'créneau modèle',
        pluriel: 'créneaux modèles',
      },
    ])
    if (bloquant) {
      throw Boom.conflict(
        `Suppression impossible : encore utilisé par ${bloquant}.`,
      )
    }
    // `deleteMany` et non `delete` : c'est le seul moyen d'exiger
    // `archivedAt` non nul dans le meme ordre, sans lecture prealable.
    const { count } = await this.prisma.location.deleteMany({
      where: { id: locationID, ...this.scope, archivedAt: { not: null } },
    })
    if (count === 0) {
      throw Boom.notFound(`Location introuvable ou non archivé`)
    }
  }
}

export { LocationRepository }
