import type { IocContainer } from '../types/application/ioc'
import type { ActivityLogRepositoryInterface } from '../types/infra/orm/repositories/activityLog.repository.interface'
import type { UserRepositoryInterface } from '../types/infra/orm/repositories/user.repository.interface'
import type { Logger } from '../types/utils/logger'
import type { TenantContextInterface } from '../types/utils/tenant-context'
import type { AppEventBus } from '../utils/app-event-bus'

// Les operations de gestion des membres partagent la meme forme de charge
// utile : une seule boucle suffit a les journaliser toutes.
const MEMBER_ACTIONS = [
  'member.added',
  'member.updated',
  'member.removed',
  'member.deactivated',
  'member.reactivated',
  'member.accountCreated',
  'member.accessLinkReissued',
] as const

class ActivityLogSubscriber {
  private readonly appEventBus: AppEventBus
  private readonly activityLogRepository: ActivityLogRepositoryInterface
  private readonly userRepository: UserRepositoryInterface
  private readonly logger: Logger
  private readonly tenantContext: TenantContextInterface

  constructor({
    appEventBus,
    activityLogRepository,
    userRepository,
    logger,
    tenantContext,
  }: IocContainer) {
    this.appEventBus = appEventBus
    this.activityLogRepository = activityLogRepository
    this.userRepository = userRepository
    this.logger = logger
    this.tenantContext = tenantContext
    this.#subscribe()
  }

  #subscribe(): void {
    this.appEventBus.on('patient.created', (p) =>
      this.#log('patient.created', 'patient', p.userID, p.patientId),
    )
    this.appEventBus.on('patient.updated', (p) =>
      this.#log('patient.updated', 'patient', p.userID, p.patientId),
    )
    this.appEventBus.on('patient.deleted', (p) =>
      this.#log('patient.deleted', 'patient', p.userID, p.patientId),
    )
    this.appEventBus.on('patient.enrolled', (p) =>
      this.#log('patient.enrolled', 'patient', p.userID, p.patientId),
    )
    this.appEventBus.on('patient.removedFromPathway', (p) =>
      this.#log('patient.removedFromPathway', 'patient', p.userID, p.patientId),
    )
    this.appEventBus.on('diagnostic.created', (p) =>
      this.#log('diagnostic.created', 'diagnostic', p.userID, p.diagnosticId),
    )
    this.appEventBus.on('diagnostic.updated', (p) =>
      this.#log('diagnostic.updated', 'diagnostic', p.userID, p.diagnosticId),
    )
    this.appEventBus.on('appointment.created', (p) =>
      this.#log(
        'appointment.created',
        'appointment',
        p.userID,
        p.appointmentId,
      ),
    )
    this.appEventBus.on('appointment.updated', (p) =>
      this.#log(
        'appointment.updated',
        'appointment',
        p.userID,
        p.appointmentId,
      ),
    )
    for (const action of MEMBER_ACTIONS) {
      this.appEventBus.on(action, (p) =>
        this.#log(action, 'member', p.userID, p.membershipId),
      )
    }
    // La reemission par le super-admin. `entityType: 'user'`, pas
    // `'member'` — cette route vise un COMPTE, hors de toute appartenance.
    //
    // La route `/super-admin` s'execute SANS AUCUN CONTEXTE (back/CLAUDE.md : tout le prefixe tourne sans
    // store, ses depots n'entrant en `runAsSuperAdmin` qu'au cas par cas) — pas seulement sans
    // contexte de TENANT.
    // `ActivityLog` est un modele d'ETABLISSEMENT (tenant-guard.ts, ESTABLISHMENT_MODELS), et le
    // garde-fou refuse categoriquement toute operation sur un tel modele en l'ABSENCE de store
    // (`assertTenantScope` : `if (!store) throw new TenantScopeMissingError(...)`) — avant meme
    // de regarder le contenu de l'ecriture. Une ligne « `establishmentId: null` » n'est donc
    // PAS ce qui se produirait par defaut : l'ecriture est refusee, l'exception remonte au
    // `catch` de `#log` plus bas, qui la journalise (au niveau `error`, invisible en test — voir
    // `LOG_LEVEL=silent`, .env.test) et l'AVALE — la ligne n'est jamais posee.
    //
    // Meme motif, meme remede que `UserDomain.bootstrapSuperAdmin` (hors de toute requete HTTP,
    // via `scripts/bootstrap-super-admin.ts`) et `starter.ts#scheduleActivityLogCleanup` (purge
    // planifiee) : le mode systeme du contexte de tenant (methode `runAsSystem`, appelee juste
    // en-dessous), qui retire l'exigence de filtre du garde-fou plutot que de la deplacer
    // (`if (store.kind === 'system') return`, tenant-guard.ts). La
    // ligne obtenue porte alors reellement `establishmentId: null, serviceId: null` — c'est ce
    // qui la rend lisible par `GET /super-admin/access-log`, qui lit `ActivityLog` sans borne
    // d'etablissement, exactement comme les lignes du script d'amorcage.
    //
    // `runAsSystem` n'entoure QUE cette souscription (pas `#log` tout entier, generique aux
    // douze actions ci-dessus) : les elargir toutes masquerait silencieusement une VRAIE perte de
    // contexte sur une route de tenant (elle continuerait a s'ecrire avec un etablissement nul
    // plutot que de faire echouer, puis journaliser, l'ecriture comme aujourd'hui) — un risque
    // qu'il ne faut pas rouvrir ici. Rappel ASYNC AVEC UN `await` INTERNE, jamais un rappel
    // synchrone nu (tenant-context.ts#runAsSuperAdmin : mesure sur
    // un appelant reel, un rappel synchrone nu perd la portee — 5 tests sur 244 tombent en 500).
    // Site declare dans `runAsSystem-unicite.test.ts` (AUTORISES).
    //
    // POURQUOI `#log` UTILISE `findIdentity` ICI N'EST *PAS* LE
    // MOTIF ECRIT PLUS BAS SUR `#log` (le pont a-plusieurs refuse par le garde-fou), et le dire
    // aurait laisse une regression invisible. Ce site tourne sous `runAsSystem`, or le refus du
    // pont (`assertNoGlobalToManyBridge`, tenant-guard.ts) NE S'APPLIQUE NI au mode systeme NI a
    // l'absence de store — seuls `tenant` et `superadmin` sont couverts. `findByID` n'y serait
    // donc PAS refuse : mesure par sabotage reel (remplacer `findIdentity` par `findByID` ici),
    // le test e2e (`super-admin-access-link.test.ts`) restait VERT, parce que le
    // super-admin n'a par nature aucune appartenance a charger — les deux methodes y rendent
    // EXACTEMENT le meme resultat. La bonne raison, propre a CE site, est donc plus modeste :
    // NE CHARGER QUE CE DONT `#log` A BESOIN (deux colonnes), jamais un refus du garde-fou. La
    // regression est tenue par une preuve DIRECTE — quelle methode est appelee, pas quel contenu
    // en revient — dans `src/test/unit/services/activity-log.subscriber.test.ts`.
    this.appEventBus.on('user.accessLinkReissued', (p) =>
      this.tenantContext.runAsSystem(async () => {
        await this.#log(
          'user.accessLinkReissued',
          'user',
          p.userID,
          p.targetUserId,
        )
      }),
    )
  }

  async #log(
    action: string,
    entityType: string,
    userID: string,
    entityID: string,
  ): Promise<void> {
    try {
      // `findIdentity`, PAS `findByID`.
      //
      // Ce souscripteur n'a besoin que de `firstName`/`lastName`, deux colonnes de la ligne
      // `User`. `findByID` y ajoutait l'arbre COMPLET des appartenances (`membershipsInclude`),
      // c'est-a-dire une relation A-PLUSIEURS repartant d'un modele GLOBAL — le pont que ferme
      // `assertNoGlobalToManyBridge` sous contexte de tenant
      // (infra/orm/tenant-guard.ts).
      //
      // ET CE SOUSCRIPTEUR S'EXECUTE BIEN SOUS CONTEXTE DE TENANT : `appEventBus.emit` est
      // SYNCHRONE, donc ce rappel demarre dans la portee `AsyncLocalStorage` de la requete. La
      // preuve est deux lignes plus bas — `activityLogRepository.create` remplit
      // `establishmentId`/`serviceId` depuis `tenantContext.peek()`, et ces colonnes sont
      // renseignees.
      //
      // POURQUOI CE `.catch(() => null)` REND LA CHOSE GRAVE, et pourquoi il reste : il existe
      // pour qu'une ligne de journal soit ecrite meme si le nom de l'auteur ne peut pas etre
      // resolu — mieux vaut une trace amputee que pas de trace. Mais il AVALE aussi un refus du
      // garde-fou : avec `findByID`, TOUTES les actions journalisees depuis une route de tenant
      // (patients, diagnostics, rendez-vous, membres) se sont mises a s'ecrire avec
      // `userFirstName: null, userLastName: null`, sans le moindre signal. Dans une application
      // de sante, c'est la tracabilite de QUI A FAIT QUOI qui se degrade en silence.
      //
      // Ce qui empeche le retour du defaut : `src/test/e2e/activity-log-auteur.test.ts`, qui
      // affirme LE NOM DE L'AUTEUR dans la ligne ecrite — pas le nombre de lignes, ni son
      // existence : la ligne existait deja, c'est son auteur qui manquait.
      const user = await this.userRepository
        .findIdentity(userID)
        .catch(() => null)
      await this.activityLogRepository.create({
        userID,
        userFirstName: user?.firstName ?? null,
        userLastName: user?.lastName ?? null,
        action,
        entityType,
        entityID,
      })
    } catch (err) {
      // Jamais `${err}` : ce depot (`activityLog.repository.ts`) n'a lui-meme aucun `catch`, donc
      // une erreur Prisma brute peut remonter ici telle quelle, et son message recopie
      // integralement le `data` de l'ecriture qui a echoue — userFirstName/userLastName compris.
      // Seule la classe de l'erreur, qui ne peut jamais porter
      // une valeur soumise, va au journal.
      const errorClass =
        err instanceof Error ? err.constructor.name : typeof err
      this.logger.error(`ActivityLog: failed to log ${action} [${errorClass}]`)
    }
  }
}

export { ActivityLogSubscriber }
