import Boom from '@hapi/boom'

import type { IocContainer } from '../../../types/application/ioc'
import type {
  DiagnosticEducatifTemplateCreateEntity,
  DiagnosticEducatifTemplateEntity,
  DiagnosticEducatifTemplateUpdateEntity,
} from '../../../types/domain/diagnosticEducatifTemplate.domain.interface'
import type { DiagnosticEducatifTemplateRepositoryInterface } from '../../../types/infra/orm/repositories/diagnosticEducatifTemplate.repository.interface'
import type { ErrorHandlerInterface } from '../../../types/utils/error-handler'
import type { TenantContextInterface } from '../../../types/utils/tenant-context'
import { phraseDesReferences } from '../../../utils/references-referentiel'
import type { PostgresPrismaClient } from '../postgres-client'

class DiagnosticEducatifTemplateRepository
  implements DiagnosticEducatifTemplateRepositoryInterface
{
  private readonly prisma: PostgresPrismaClient
  private readonly errorHandler: ErrorHandlerInterface
  private readonly tenantContext: TenantContextInterface

  constructor({ postgresOrm, errorHandler, tenantContext }: IocContainer) {
    this.prisma = postgresOrm.prisma
    this.errorHandler = errorHandler
    this.tenantContext = tenantContext
  }

  private get scope() {
    return this.tenantContext.scope()
  }

  findAll(archived = false): Promise<DiagnosticEducatifTemplateEntity[]> {
    return this.prisma.diagnosticEducatifTemplate.findMany({
      where: { ...this.scope, archivedAt: archived ? { not: null } : null },
      orderBy: { name: 'asc' },
    })
  }

  // Ne filtre pas les archivees, volontairement : les domaines s'en servent pour
  // valider la cible d'une reference. Filtrer ici casserait le simple
  // reenregistrement d'une ligne qui en porte deja une archivee.
  async findByID(id: string): Promise<DiagnosticEducatifTemplateEntity> {
    try {
      return await this.prisma.diagnosticEducatifTemplate.findUniqueOrThrow({
        where: { id_serviceId: { id, serviceId: this.scope.serviceId } },
      })
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({
        entityName: 'DiagnosticEducatifTemplate',
        error: err,
      })
    }
  }

  async create(
    params: DiagnosticEducatifTemplateCreateEntity,
  ): Promise<DiagnosticEducatifTemplateEntity> {
    try {
      return await this.prisma.diagnosticEducatifTemplate.create({
        data: { ...params, ...this.scope },
      })
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({
        entityName: 'DiagnosticEducatifTemplate',
        error: err,
      })
    }
  }

  async update(
    id: string,
    { archived, ...params }: DiagnosticEducatifTemplateUpdateEntity,
  ): Promise<DiagnosticEducatifTemplateEntity> {
    try {
      return await this.prisma.diagnosticEducatifTemplate.update({
        where: { id_serviceId: { id, serviceId: this.scope.serviceId } },
        data: {
          ...params,
          ...(archived !== undefined && {
            archivedAt: archived ? new Date() : null,
          }),
        },
      })
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({
        entityName: 'DiagnosticEducatifTemplate',
        error: err,
      })
    }
  }
  // Suppression DEFINITIVE, reservee aux lignes deja archivees. Le refus de
  // fond vient de la base (`onDelete: Restrict`) ; ce comptage ne sert qu'a
  // dire en francais ce qui bloque, avant d'aller buter dessus.
  async deleteForever(id: string): Promise<void> {
    const comptes = await Promise.all([
      this.prisma.diagnosticEducatif.count({
        where: { templateId: id, ...this.scope },
      }),
    ])
    const bloquant = phraseDesReferences([
      {
        count: comptes[0] as number,
        singulier: 'diagnostic',
        pluriel: 'diagnostics',
      },
    ])
    if (bloquant) {
      throw Boom.conflict(
        `Suppression impossible : encore utilisé par ${bloquant}.`,
      )
    }
    // `deleteMany` et non `delete` : c'est le seul moyen d'exiger
    // `archivedAt` non nul dans le meme ordre, sans lecture prealable.
    const { count } = await this.prisma.diagnosticEducatifTemplate.deleteMany({
      where: { id: id, ...this.scope, archivedAt: { not: null } },
    })
    if (count === 0) {
      throw Boom.notFound(
        `DiagnosticEducatifTemplate introuvable ou non archivé`,
      )
    }
  }
}

export { DiagnosticEducatifTemplateRepository }
