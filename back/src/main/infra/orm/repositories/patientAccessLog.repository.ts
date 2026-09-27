import type { IocContainer } from '../../../types/application/ioc'
import type {
  PatientAccessLogCreateEntityRepo,
  PatientAccessLogEntityRepo,
  PatientAccessLogRepositoryInterface,
} from '../../../types/infra/orm/repositories/patientAccessLog.repository.interface'
import type { ErrorHandlerInterface } from '../../../types/utils/error-handler'
import type { TenantContextInterface } from '../../../types/utils/tenant-context'
import type { PostgresPrismaClient } from '../postgres-client'

// Modele : service.repository.ts (cahier des charges de la tache). Le constructeur ne lit
// jamais le scope — seule `create` le fait, via `this.scope`, au moment de l'ecriture. Un acces
// se journalise toujours a l'interieur d'un service (le journal existe pour la consultation d'un
// dossier patient, qui n'a lieu que sous `/e/:establishmentId/s/:serviceId/...`) : `scope()`
// (et non `establishmentScope()`) est donc la bonne methode, et son echec — hors de tout
// contexte de tenant, ou dans le contexte d'administration d'etablissement, sans service — est
// le comportement voulu (voir patientAccessLog.domain.test.ts, qui le montre par execution
// plutot que de le contourner).
class PatientAccessLogRepository implements PatientAccessLogRepositoryInterface {
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

  // `await` a l'interieur de cette methode, jamais un simple retour de promesse non attendue :
  // c'est ce qui garde la lecture de `this.scope` — donc du contexte `AsyncLocalStorage` —
  // synchrone et anterieure a l'appel Prisma, plutot que de laisser l'ecriture partir hors de la
  // portee du contexte (piege deja rencontre plusieurs fois sur ce chantier).
  async create(params: PatientAccessLogCreateEntityRepo): Promise<PatientAccessLogEntityRepo> {
    try {
      return await this.prisma.patientAccessLog.create({
        data: { ...params, ...this.scope },
      })
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({
        entityName: 'PatientAccessLog',
        error: err,
      })
    }
  }
}

export { PatientAccessLogRepository }
