import Boom from '@hapi/boom'

import type { IocContainer } from '../../../types/application/ioc'
import type {
  SoignantCreateEntityRepo,
  SoignantEntityRepo,
  SoignantRepositoryInterface,
  SoignantUpdateEntityRepo,
} from '../../../types/infra/orm/repositories/soignant.repository.interface'
import type { ErrorHandlerInterface } from '../../../types/utils/error-handler'
import type { TenantContextInterface } from '../../../types/utils/tenant-context'
import { phraseDesReferences } from '../../../utils/references-referentiel'
import type { PostgresPrismaClient } from '../postgres-client'

class SoignantRepository implements SoignantRepositoryInterface {
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

  findAll(archived = false): Promise<SoignantEntityRepo[]> {
    return this.prisma.soignant.findMany({
      where: { ...this.scope, archivedAt: archived ? { not: null } : null },
    })
  }

  // Ne filtre pas les archivees, volontairement : les domaines s'en servent pour
  // valider la cible d'une reference. Filtrer ici casserait le simple
  // reenregistrement d'une ligne qui en porte deja une archivee.
  async findByID(soignantID: string): Promise<SoignantEntityRepo> {
    try {
      return await this.prisma.soignant.findUniqueOrThrow({
        where: {
          id_serviceId: { id: soignantID, serviceId: this.scope.serviceId },
        },
      })
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({
        entityName: 'Soignant',
        error: err,
      })
    }
  }

  async create(
    soignantCreateParams: SoignantCreateEntityRepo,
  ): Promise<SoignantEntityRepo> {
    try {
      return await this.prisma.soignant.create({
        data: { ...soignantCreateParams, ...this.scope },
      })
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({
        entityName: 'Soignant',
        error: err,
      })
    }
  }

  async update(
    soignantID: string,
    { archived, ...soignantUpdateParams }: SoignantUpdateEntityRepo,
  ): Promise<SoignantEntityRepo> {
    try {
      return await this.prisma.soignant.update({
        where: {
          id_serviceId: { id: soignantID, serviceId: this.scope.serviceId },
        },
        data: {
          ...soignantUpdateParams,
          ...(archived !== undefined && {
            archivedAt: archived ? new Date() : null,
          }),
        },
      })
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({
        entityName: 'Soignant',
        error: err,
      })
    }
  }
  // Suppression DEFINITIVE, reservee aux lignes deja archivees. Le refus de
  // fond vient de la base (`onDelete: Restrict`) ; ce comptage ne sert qu'a
  // dire en francais ce qui bloque, avant d'aller buter dessus.
  async deleteForever(soignantID: string): Promise<void> {
    const comptes = await Promise.all([
      this.prisma.slotTemplateSoignant.count({
        where: { soignantId: soignantID, ...this.scope },
      }),
      this.prisma.todo.count({ where: { soignantID, ...this.scope } }),
      this.prisma.serviceMembership.count({
        where: { soignantId: soignantID, ...this.scope },
      }),
    ])
    const bloquant = phraseDesReferences([
      {
        count: comptes[0] as number,
        singulier: 'créneau modèle',
        pluriel: 'créneaux modèles',
      },
      { count: comptes[1] as number, singulier: 'tâche', pluriel: 'tâches' },
      { count: comptes[2] as number, singulier: 'membre', pluriel: 'membres' },
    ])
    if (bloquant) {
      throw Boom.conflict(
        `Suppression impossible : encore utilisé par ${bloquant}.`,
      )
    }
    // `deleteMany` et non `delete` : c'est le seul moyen d'exiger
    // `archivedAt` non nul dans le meme ordre, sans lecture prealable.
    const { count } = await this.prisma.soignant.deleteMany({
      where: { id: soignantID, ...this.scope, archivedAt: { not: null } },
    })
    if (count === 0) {
      throw Boom.notFound(`Soignant introuvable ou non archivé`)
    }
  }
}

export { SoignantRepository }
