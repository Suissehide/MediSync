import type { IocContainer } from '../../../types/application/ioc'
import type {
  PdfAssetCreateEntityRepo,
  PdfAssetEntityRepo,
  PdfAssetRepositoryInterface,
  PdfAssetSummaryEntityRepo,
} from '../../../types/infra/orm/repositories/pdf-asset.repository.interface'
import type { ErrorHandlerInterface } from '../../../types/utils/error-handler'
import type { TenantContextInterface } from '../../../types/utils/tenant-context'
import type { PostgresPrismaClient } from '../postgres-client'

class PdfAssetRepository implements PdfAssetRepositoryInterface {
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

  async create(params: PdfAssetCreateEntityRepo): Promise<PdfAssetEntityRepo> {
    try {
      return await this.prisma.pdfAsset.create({
        data: { ...this.scope, ...params },
      })
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({
        entityName: 'PdfAsset',
        error: err,
      })
    }
  }

  // `select` sans `bytes` : une liste qui les porterait ferait transiter toute la
  // bibliotheque a chaque ouverture de l'inspecteur.
  findAllForService(): Promise<PdfAssetSummaryEntityRepo[]> {
    return this.prisma.pdfAsset.findMany({
      where: this.scope,
      select: { id: true, fileName: true, mimeType: true },
      orderBy: { createdAt: 'desc' },
    })
  }

  findByID(assetID: string): Promise<PdfAssetEntityRepo | null> {
    const scope = this.scope
    return this.prisma.pdfAsset.findUnique({
      where: { id_serviceId: { id: assetID, serviceId: scope.serviceId } },
    })
  }

  async remove(assetID: string): Promise<void> {
    const scope = this.scope
    try {
      await this.prisma.pdfAsset.delete({
        where: { id_serviceId: { id: assetID, serviceId: scope.serviceId } },
      })
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({
        entityName: 'PdfAsset',
        error: err,
      })
    }
  }
}

export { PdfAssetRepository }
