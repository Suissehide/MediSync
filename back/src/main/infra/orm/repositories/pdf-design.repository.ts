import type { IocContainer } from '../../../types/application/ioc'
import type {
  PdfDesignEntityRepo,
  PdfDesignPresetEntityRepo,
  PdfDesignRepositoryInterface,
} from '../../../types/infra/orm/repositories/pdf-design.repository.interface'
import type { TenantContextInterface } from '../../../types/utils/tenant-context'
import type { PostgresPrismaClient } from '../postgres-client'

class PdfDesignRepository implements PdfDesignRepositoryInterface {
  private readonly prisma: PostgresPrismaClient
  private readonly tenantContext: TenantContextInterface

  constructor({ postgresOrm, tenantContext }: IocContainer) {
    this.prisma = postgresOrm.prisma
    this.tenantContext = tenantContext
  }

  // `scope()` par methode, jamais a la construction : il leve hors d'un contexte de service.
  private get scope() {
    return this.tenantContext.scope()
  }

  findAllForService(): Promise<PdfDesignEntityRepo[]> {
    return this.prisma.pdfDesign.findMany({
      where: { ...this.scope, archivedAt: null },
      orderBy: { createdAt: 'asc' },
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
}

export { PdfDesignRepository }
