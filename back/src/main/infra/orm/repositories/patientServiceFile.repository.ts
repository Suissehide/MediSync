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
  //
  // CE QUE CET APPEL COUVRE REELLEMENT, ET CE QU'IL NE COUVRE PAS (task-5-re-review.md, point 1) :
  // seuls deux chemins appellent `ensureExists` aujourd'hui — `processEnrollments`
  // (patient.domain.ts, point de passage unique de `enrollPatientInPathways` ET
  // `enrollExistingPatientInPathways`) et `DiagnosticEducatifDomain.create`. Ce sont exactement
  // les deux seuls modeles qui portent une cle etrangere composite (patientId, serviceId) vers
  // `PatientServiceFile` : `EnrollmentIssue` et `DiagnosticEducatif`.
  //
  // Deux AUTRES modeles portent, eux aussi, un `serviceId` lie au patient et n'appellent PAS
  // `ensureExists` : `AppointmentPatient` (cree par `appointment.repository.ts` — `create`,
  // `update`, `addPatientToAppointment`) et `PatientPathwayPriority` (cree par
  // `patient.repository.ts`, `setPathwayPriorities`). Ce n'est PAS un oubli a combler : aucun des
  // deux ne porte de cle etrangere vers `PatientServiceFile` dans `prisma/schema.prisma` — leur
  // `serviceId` est la colonne de tenant ordinaire, sans lien de composite key vers le
  // sous-dossier. Rien ne les casse aujourd'hui a l'ecrire sans sous-dossier prealable, et leur
  // faire creer un sous-dossier en effet de bord (ajouter un patient a un rendez-vous, reordonner
  // ses parcours) serait un comportement que personne n'a demande.
  //
  // Cette phrase engage l'avenir, pas seulement le present : si l'un des deux gagne un jour une
  // telle cle etrangere (la tache 6 travaille exactement sur ce terrain — elle remplace la
  // relation `patient` par `serviceFile` sur d'autres modeles), l'appel a `ensureExists` doit
  // etre ajoute AU MEME MOMENT, avant que la migration ne soit deployee. Le test
  // `src/test/unit/infra/patientServiceFile-coverage.test.ts` relit prisma/schema.prisma et
  // rougit des qu'une cle etrangere vers `PatientServiceFile` apparait sur l'un des deux modeles
  // nommes ci-dessus — il ne peut pas prouver que l'appel a ete ajoute (un test ne peut pas lire
  // dans les intentions du futur auteur), seulement qu'il faut regarder ce commentaire avant de
  // merger.
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
