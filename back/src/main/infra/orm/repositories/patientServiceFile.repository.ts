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
  // CE QUE CET APPEL COUVRE REELLEMENT, ET CE QU'IL NE COUVRE PAS (task-5-re-review.md, point 1 ;
  // mis a jour tache 12, tour de correction 1) : trois chemins appellent `ensureExists`
  // aujourd'hui. Deux le font parce qu'un enfant de service pose sa cle etrangere composite
  // (patientId, serviceId) vers `PatientServiceFile` et en a besoin pour ecrire sans violer
  // cette contrainte — `processEnrollments` (patient.domain.ts, point de passage unique de
  // `enrollPatientInPathways` ET `enrollExistingPatientInPathways`, pour `EnrollmentIssue`) et
  // `DiagnosticEducatifDomain.create` (pour `DiagnosticEducatif`) ; ce sont les deux seuls
  // modeles qui portent cette cle etrangere. Le troisieme, `PatientDomain.create`, n'a aucune
  // telle contrainte a satisfaire : il appelle `ensureExists` par decision de metier (creer un
  // patient depuis un service, c'est le suivre dans ce service), pour qu'un patient cree sans
  // inscription ni diagnostic (bouton « Creer sans parcours ») ait quand meme un sous-dossier
  // dans le service ou il vient d'etre cree — sans quoi la liste, filtree par sous-dossier, ne
  // le montrerait plus jamais nulle part (voir le commentaire dans PatientDomain.create).
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

  // EXCEPTION ASSUMEE au cloisonnement inter-service (design §5.3) : LA SEULE lecture de tout le
  // back qui traverse volontairement la frontiere entre services. Son unicite est verifiee par
  // back/src/test/unit/infra/runAsSystem-unicite.test.ts, qui relit les sources et echoue si un
  // second appel a `runAsSystem` apparait ailleurs — ou si celui-ci disparait sans que la liste
  // autorisee n'en soit averti.
  //
  // `runAsSystem` (tenant-context.ts) RETIRE l'exigence du garde-fou d'ORM, il ne la deplace
  // pas : sous ce mode, le garde-fou n'exige plus AUCUN filtre de service ni d'etablissement, et
  // la requete qui suit pourrait donc lire TOUS les etablissements si on la laissait faire — pas
  // seulement les autres services de celui-ci. C'est pourquoi les deux bornes sont capturees
  // AVANT d'entrer dans le mode encadre (`this.scope`, qui lit le contexte de tenant normal, non
  // disponible une fois `runAsSystem` entame) et portees EXPLICITEMENT par la requete
  // elle-meme : meme etablissement (`establishmentId`), service different du courant
  // (`serviceId: { not }`). Le garde-fou ne les impose plus ici ; rien ne rattrape un oubli.
  //
  // Le filtre `establishmentId` ci-dessous n'est PAS une ligne morte, verifie par execution
  // (revue tache 7, tour 1, I3) : aujourd'hui, la cle etrangere composite
  // `PatientServiceFile.patient` (-> `Patient(id, establishmentId)`) empeche bien qu'un
  // `patientId` porte deux `establishmentId` differents, donc ce filtre ne change rien au
  // resultat pour une ligne que le chemin normal peut produire. Mais en retirant les deux cles
  // etrangeres composites de `PatientServiceFile` sur une base de test et en inserant la ligne
  // qu'elles interdisent (un `patientId` de l'etablissement E1 associe a un
  // `establishmentId` = E2), le signal mesure reste FAUX avec ce filtre en place, et devient VRAI
  // des qu'on le retire. C'est donc la SEULE piece qui tienne la borne d'etablissement des que la
  // contrainte de cle etrangere cede — et l'etape 4 de ce chantier (creation de services depuis
  // l'interface) est exactement le terrain ou ce genre de cle composite est amene a bouger. Il
  // reste ecrit explicitement plutot que de s'appuyer sur la contrainte de schema : c'est la
  // consigne (la requete porte SES bornes), et une garantie en dur qui ne depend pas d'une
  // contrainte de base de donnees ailleurs dans le schema.
  //
  // Ne renvoie jamais qu'un booleen : seule la presence ou l'absence d'une ligne sort d'ici,
  // jamais son identifiant, le nom du service, un compte, une date ou un contenu. `select:
  // { patientId: true }` (et non `{ id: true }`, revue tache 7 tour 1, m1) : `patientId` est une
  // valeur que l'appelant connait deja (c'est son parametre d'entree), donc la selectionner ne
  // fait entrer AUCUNE information nouvelle en memoire sur le sous-dossier de l'autre service —
  // contrairement a `id`, qui aurait fait transiter le cuid du sous-dossier d'un autre service.
  //
  // Le callback DOIT faire son `await` a l'INTERIEUR de lui-meme (et non se contenter de
  // renvoyer la promesse Prisma sans l'attendre). `PrismaClient` execute paresseusement : appeler
  // `.findFirst(...)` ne declenche pas encore la requete (donc pas encore le garde-fou), qui ne
  // part que lorsque quelque chose attend cette promesse. `storage.run()` (AsyncLocalStorage)
  // referme sa portee des que le callback synchrone REND LA MAIN — pas quand la promesse qu'il a
  // renvoyee se resout. Un callback qui se contente de `() => this.prisma....findFirst(...)`
  // rend la main immediatement (aucun `await` a l'interieur), donc `runAsSystem` a deja restaure
  // le contexte de tenant normal — le `store` que le garde-fou lit au moment ou Prisma declenche
  // reellement la requete n'est alors plus `system`, mais celui de la requete HTTP en cours :
  // exactement le contraire de ce que cette fonction doit garantir. Eprouve par une suite e2e
  // (`patientServiceFile.ts`, GET .../service-file) qui rougissait en 500
  // (`TenantScopeMissingError`) tant que l'`await` n'etait pas descendu ici.
  async estSuiviAilleurs(patientId: string): Promise<boolean> {
    const { serviceId, establishmentId } = this.scope
    const autreSousDossier = await this.tenantContext.runAsSystem(async () => {
      return await this.prisma.patientServiceFile.findFirst({
        where: {
          patientId,
          establishmentId,
          serviceId: { not: serviceId },
        },
        select: { patientId: true },
      })
    })
    return autreSousDossier !== null
  }
}

export { PatientServiceFileRepository }
