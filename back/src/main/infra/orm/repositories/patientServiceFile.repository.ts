import { Prisma } from '../../../../generated/client'
import type { IocContainer } from '../../../types/application/ioc'
import type {
  PatientServiceFileDeactivationImpactRepo,
  PatientServiceFileEntityRepo,
  PatientServiceFileRepositoryInterface,
  PatientServiceFileUpsertEntityRepo,
} from '../../../types/infra/orm/repositories/patientServiceFile.repository.interface'
import type { ErrorHandlerInterface } from '../../../types/utils/error-handler'
import type { TenantContextInterface } from '../../../types/utils/tenant-context'
import PrismaErrorCodes from '../error-codes-prisma'
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
      // Idempotence de bout en bout (revue tache 13, tour 1, point 3) : sous concurrence (deux
      // rattachements simultanes sur le meme patient, via `PatientServiceFileDomain.
      // attachToCurrentService`), l'upsert lui-meme peut heurter la contrainte d'unicite
      // `(patientId, serviceId)` — verifie par execution, six appels HTTP en parallele, dans
      // patient-search-identite.test.ts. Ce n'est jamais un vrai conflit : le nom de la methode
      // le dit, `ensureExists` ne promet que "le sous-dossier existe", et un P2002 ici veut dire
      // exactement ca — deja cree par un appel concurrent. Le remonter en 409 ferait echouer a
      // l'ecran une operation qui a reussi (le sous-dossier existe bel et bien), pour un cas que
      // `if (existing)` en amont (attachToCurrentService) ne peut pas toujours intercepter :
      // deux appels peuvent tous les deux lire "n'existe pas encore" avant que l'un des deux
      // n'ecrive.
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === PrismaErrorCodes.OPERATION_FAILED_ON_UNIQUE_CONSTRAINT
      ) {
        return
      }
      throw this.errorHandler.boomErrorFromPrismaError({
        entityName: 'PatientServiceFile',
        error: err,
      })
    }
  }

  // EXCEPTION ASSUMEE au cloisonnement inter-service (design §5.3) : la PREMIERE des deux
  // lectures de tout le back qui traversent volontairement la frontiere entre services — la
  // seconde est `impactDesactivation`, plus bas dans ce meme fichier (design §3.6, tache 9),
  // qui rend un compte plutot qu'un booleen mais ne franchit jamais la frontiere autrement.
  // Leur unicite (au nombre de deux, toutes deux dans ce fichier) est verifiee par
  // back/src/test/unit/infra/runAsSystem-unicite.test.ts, qui relit les sources et echoue si un
  // troisieme appel a `runAsSystem` apparait ailleurs — ou si l'un des deux disparait sans que
  // la liste autorisee n'en soit avertie.
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

  // Seconde et derniere lecture qui traverse volontairement la frontiere entre services (design
  // §3.6, tache 9) — voir le commentaire au-dessus d'`estSuiviAilleurs`. Appelee depuis le
  // contexte d'ADMINISTRATION D'ETABLISSEMENT (`/e/:establishmentId/admin/services/:id/impact-
  // desactivation`), pas depuis un service : `this.scope` (qui exige un service courant) n'y est
  // donc pas disponible, et `serviceId`/`establishmentId` sont recus explicitement de
  // l'appelant (`ServiceDomain.impactDesactivation`), qui les tient de l'admin resolu et d'un
  // service deja verifie appartenir a cet etablissement (`ServiceRepository.findByID`, qui leve
  // 404 sinon). La requete porte donc SES bornes, comme `estSuiviAilleurs` — meme principe,
  // deux parametres explicites plutot qu'un contexte de service qui n'existe pas ici.
  //
  // Ne rend que DEUX NOMBRES, jamais un identifiant de patient, un nom de service ou un
  // contenu — la meme discipline de divulgation qu'`estSuiviAilleurs` (`select: { patientId:
  // true }`, jamais `id`), pretee ici a un compte plutot qu'a un booleen. `suivisIci` est le
  // nombre de sous-dossiers de ce service ; `suivisNullePartAilleurs` est le sous-ensemble de
  // leurs patients qui n'ont AUCUN autre sous-dossier dans le meme etablissement — calcule en
  // deux lectures plutot qu'une jointure, pour rester lisible : la premiere ramene les
  // identifiants de patients suivis ICI, la seconde ceux qui le sont AILLEURS PARMI EUX (meme
  // etablissement, service different), et la difference des deux ensembles donne le compte qui
  // importe. Meme piege que ci-dessus : les DEUX `await` sont a l'INTERIEUR du seul rappel
  // `runAsSystem`, jamais une promesse rendue sans etre attendue.
  async impactDesactivation(
    serviceId: string,
    establishmentId: string,
  ): Promise<PatientServiceFileDeactivationImpactRepo> {
    return await this.tenantContext.runAsSystem(async () => {
      const suivisIci = await this.prisma.patientServiceFile.findMany({
        where: { serviceId, establishmentId },
        select: { patientId: true },
      })
      if (suivisIci.length === 0) {
        return { suivisIci: 0, suivisNullePartAilleurs: 0 }
      }
      const patientIds = suivisIci.map((row) => row.patientId)
      const suivisAilleursParmiEux = await this.prisma.patientServiceFile.findMany({
        where: {
          establishmentId,
          patientId: { in: patientIds },
          serviceId: { not: serviceId },
        },
        select: { patientId: true },
      })
      const suiviAilleursIds = new Set(
        suivisAilleursParmiEux.map((row) => row.patientId),
      )
      const suivisNullePartAilleurs = patientIds.filter(
        (patientId) => !suiviAilleursIds.has(patientId),
      ).length
      return { suivisIci: patientIds.length, suivisNullePartAilleurs }
    })
  }
}

export { PatientServiceFileRepository }
