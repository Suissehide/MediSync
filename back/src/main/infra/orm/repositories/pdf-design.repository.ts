import type { Prisma } from '../../../../generated/client'
import type { IocContainer } from '../../../types/application/ioc'
import type {
  PdfDesignCreateEntityRepo,
  PdfDesignEntityRepo,
  PdfDesignPresetEntityRepo,
  PdfDesignRepositoryInterface,
  PdfDesignUpdateEntityRepo,
} from '../../../types/infra/orm/repositories/pdf-design.repository.interface'
import type { ErrorHandlerInterface } from '../../../types/utils/error-handler'
import type { TenantContextInterface } from '../../../types/utils/tenant-context'
import type { PostgresPrismaClient } from '../postgres-client'

class PdfDesignRepository implements PdfDesignRepositoryInterface {
  private readonly prisma: PostgresPrismaClient
  private readonly errorHandler: ErrorHandlerInterface
  private readonly tenantContext: TenantContextInterface

  constructor({ postgresOrm, errorHandler, tenantContext }: IocContainer) {
    this.prisma = postgresOrm.prisma
    this.errorHandler = errorHandler
    this.tenantContext = tenantContext
  }

  // `scope()` par methode, jamais a la construction : il leve hors d'un contexte de service.
  private get scope() {
    return this.tenantContext.scope()
  }

  findAllForService(archived = false): Promise<PdfDesignEntityRepo[]> {
    return this.prisma.pdfDesign.findMany({
      where: { ...this.scope, archivedAt: archived ? { not: null } : null },
      orderBy: { createdAt: 'asc' },
    })
  }

  // `this.scope` ET `archivedAt: null` : un design d'un autre service, ou supprime, ne doit
  // pas rester duplicable par qui connait son id. Une route ne se garde pas sur la foi de son
  // ecran.
  findByID(designID: string): Promise<PdfDesignEntityRepo | null> {
    return this.prisma.pdfDesign.findFirst({
      where: { ...this.scope, id: designID, archivedAt: null },
    })
  }

  // Modele GLOBAL : aucun filtre de tenant a porter. Permis sous contexte de service parce
  // qu'`assertTenantScope` sort par `assertGlobalScope` des que la famille est globale.
  findAllPresets(): Promise<PdfDesignPresetEntityRepo[]> {
    return this.prisma.pdfDesignPreset.findMany({
      where: { archivedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    })
  }

  // `archivedAt: null` : un preset retire n'est plus propose, il ne doit pas rester
  // duplicable par qui connait son id. Une route ne se garde pas sur la foi de son ecran.
  findPresetByID(presetID: string): Promise<PdfDesignPresetEntityRepo | null> {
    return this.prisma.pdfDesignPreset.findFirst({
      where: { id: presetID, archivedAt: null },
    })
  }

  async namesInService(): Promise<string[]> {
    const lignes = await this.prisma.pdfDesign.findMany({
      where: this.scope,
      select: { name: true },
    })
    return lignes.map((ligne) => ligne.name)
  }

  async create(
    params: PdfDesignCreateEntityRepo,
  ): Promise<PdfDesignEntityRepo> {
    try {
      return await this.prisma.pdfDesign.create({
        data: {
          ...this.scope,
          name: params.name,
          content: params.content as Prisma.InputJsonValue,
          sourcePresetId: params.sourcePresetId,
        },
      })
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({
        entityName: 'PdfDesign',
        error: err,
      })
    }
  }

  // Un seul design par defaut par service : le poser decroche les autres, dans la MEME
  // transaction. Deux `isDefault` a vrai feraient choisir la modale au hasard, sans bruit.
  // Le decrochage est borne au service courant — un autre service garde le sien.
  async update(
    designID: string,
    params: PdfDesignUpdateEntityRepo,
  ): Promise<PdfDesignEntityRepo> {
    const scope = this.scope
    try {
      return await this.prisma.$transaction(async (tx) => {
        if (params.isDefault === true) {
          await tx.pdfDesign.updateMany({
            where: { ...scope, isDefault: true },
            data: { isDefault: false },
          })
        }
        return tx.pdfDesign.update({
          where: { id_serviceId: { id: designID, serviceId: scope.serviceId } },
          data: {
            ...(params.name === undefined ? {} : { name: params.name }),
            ...(params.content === undefined
              ? {}
              : { content: params.content as Prisma.InputJsonValue }),
            ...(params.isDefault === undefined
              ? {}
              : { isDefault: params.isDefault }),
            // Supprimer decroche le defaut : un design hors de la liste n'est le defaut de
            // rien, et le laisser marque ferait DEUX defauts des qu'un autre est pose puis
            // celui-la restaure.
            ...(params.archived === undefined
              ? {}
              : params.archived
                ? { archivedAt: new Date(), isDefault: false }
                : { archivedAt: null }),
          },
        })
      })
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({
        entityName: 'PdfDesign',
        error: err,
      })
    }
  }
}

export { PdfDesignRepository }
