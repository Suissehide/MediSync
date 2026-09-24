import type { IocContainer } from '../../../types/application/ioc'
import type {
  PatientServiceFileEntityRepo,
  PatientServiceFileRepositoryInterface,
  PatientServiceFileUpsertEntityRepo,
} from '../../../types/infra/orm/repositories/patientServiceFile.repository.interface'
import type { ErrorHandlerInterface } from '../../../types/utils/error-handler'
import type { TenantContextInterface } from '../../../types/utils/tenant-context'
import type { PostgresPrismaClient } from '../postgres-client'

class PatientServiceFileRepository implements PatientServiceFileRepositoryInterface {
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

  findByPatient(patientId: string): Promise<PatientServiceFileEntityRepo | null> {
    return this.prisma.patientServiceFile.findFirst({
      where: { patientId, ...this.scope },
    })
  }

  // Seul endroit qui cree un sous-dossier : aucun chemin de creation de patient ne renseigne
  // ces colonnes, elles sont toujours ecrites apres coup (voir task-4-retombees.md, section 3).
  // Un upsert suffit donc, sans creation dediee a l'inscription dans un parcours.
  async upsert(
    patientId: string,
    params: PatientServiceFileUpsertEntityRepo,
  ): Promise<PatientServiceFileEntityRepo> {
    try {
      return await this.prisma.patientServiceFile.upsert({
        where: { patientId_serviceId: { patientId, serviceId: this.scope.serviceId } },
        create: { ...params, patientId, ...this.scope },
        update: params,
      })
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({
        entityName: 'PatientServiceFile',
        error: err,
      })
    }
  }
}

export { PatientServiceFileRepository }
