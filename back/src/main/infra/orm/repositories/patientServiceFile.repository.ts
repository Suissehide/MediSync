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

  // Cree le sous-dossier a la premiere ecriture, le met a jour ensuite (upsert) — voir
  // patientServiceFile.ts pour la route qui l'appelle. Ce n'est plus le seul point de creation :
  // voir ensureExists ci-dessous pour l'autre (spec §5.1, seconde moitie).
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

  // Deuxieme point de creation exige par la spec (§5.1) : a l'inscription d'un patient dans un
  // parcours du service, en plus de la premiere ecriture couverte par upsert ci-dessus. Un
  // update vide laisse les colonnes deja renseignees intactes ; il ne fait rien d'autre que
  // garantir que la ligne existe, pour que les enfants de service (EnrollmentIssue,
  // DiagnosticEducatif) puissent poser leur cle etrangere (patientId, serviceId).
  async ensureExists(patientId: string): Promise<void> {
    try {
      await this.prisma.patientServiceFile.upsert({
        where: { patientId_serviceId: { patientId, serviceId: this.scope.serviceId } },
        create: { patientId, ...this.scope },
        update: {},
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
