import { ActivityLogSubscriber } from '../../../main/services/activity-log.subscriber'
import type { IocContainer } from '../../../main/types/application/ioc'
import { AppEventBus } from '../../../main/utils/app-event-bus'
import { TenantContext } from '../../../main/utils/tenant-context'
import { Prisma } from '../../../generated/client'

// task-5-re-review-3.md (re-revue du tour 5), "Ce qu'il reste" : ActivityLogSubscriber
// journalise `${err}` brut sur un depot (`activityLog.repository.ts`) qui n'a lui-meme aucun
// `catch` — ses trois methodes sont nues. Le `data` de `create` porte `userFirstName`/
// `userLastName`, des noms reels : un echec Prisma sur cette ecriture (colonne inconnue,
// contrainte violee, ...) recopie integralement ce `data` dans son message.
// Un seul mock de logger PARTAGE (modele `buildFakeLogger` de `error-handler.test.ts`) : toutes
// les methodes poussent dans la meme liste `calls`, pas seulement `error` dans un mock a part
// (task-5-re-review-4.md, I1). Sans ca, une fuite ecrite par un canal voisin (`warn`, `info`, ...)
// passe au vert alors que ce test la garde precisement pour l'empecher.
const buildSubscriber = () => {
  const calls: string[] = []
  const record = (message: string) => calls.push(message)
  const logger = {
    error: jest.fn(record),
    info: jest.fn(record),
    warn: jest.fn(record),
    debug: jest.fn(record),
    trace: jest.fn(record),
  }
  const appEventBus = new AppEventBus()
  const activityLogRepository = {
    create: jest.fn(),
    findMany: jest.fn(),
    deleteOlderThan: jest.fn(),
  }
  // TACHE 15 (etape 4a, tour de correction 1) : `findIdentity`, pas `findByID` — le souscripteur
  // n'a jamais eu besoin que de deux colonnes de la ligne `User`, et `findByID` y ajoutait
  // l'arbre des appartenances, refuse sous contexte de tenant depuis le resserrement du
  // garde-fou. CE BOUCHON EST PRECISEMENT CE QUI A AVEUGLE CE FICHIER : il rend ce qu'on lui
  // demande de rendre, donc il ne pouvait pas voir la vraie lecture tomber. La propriete « le
  // nom de l'auteur est bien inscrit » est tenue ailleurs, sur la vraie base :
  // `src/test/e2e/activity-log-auteur.test.ts`.
  //
  // TOUR DE CORRECTION 1 (tache 7, revue) : `findByID` est AUSSI bouchonne ici, desormais — et
  // c'est le point precis que la revue a trouve en defaut. Sans ce bouchon, remplacer
  // `findIdentity` par `findByID` dans `#log` (une regression reelle, sabotee et mesuree —
  // voir le test plus bas) rendait `userRepository.findByID` `undefined` : l'appel aurait leve
  // un `TypeError`, avale par le `catch` de `#log`, et un test qui n'attend que « une ligne
  // existe, avec CE nom » restait vert malgre tout, PARCE QUE la ligne existe et le nom
  // correspond — l'exception tombe APRES la lecture reussie de la bonne methode, donc rien ne la
  // revele. Bouchonner aussi `findByID` (avec un contenu different, `Zoe`/`Sabotage`, jamais
  // celui de `findIdentity`) permet la PREUVE DIRECTE : quelle methode a ete appelee, pas quel
  // contenu en est revenu.
  const userRepository = {
    findIdentity: jest.fn(async () => ({
      id: 'user-1',
      firstName: 'Ada',
      lastName: 'Lovelace',
    })),
    findByID: jest.fn(async () => ({
      id: 'user-1',
      firstName: 'Zoe',
      lastName: 'Sabotage',
    })),
  }
  // Requis depuis la tache 7 (etape 4b) : la souscription a `user.accessLinkReissued` encadre
  // son ecriture dans `tenantContext.runAsSystem` (activity-log.subscriber.ts) — sans un VRAI
  // `TenantContext` ici, cet appel leverait un `TypeError` (`this.tenantContext` vaudrait
  // `undefined`) avant meme d'atteindre `#log`.
  const tenantContext = new TenantContext()
  const container = {
    appEventBus,
    activityLogRepository,
    userRepository,
    logger,
    tenantContext,
  }
  // biome-ignore lint/correctness/noUnusedVariables: instancie pour son effet de bord (#subscribe)
  const subscriber = new ActivityLogSubscriber(container as unknown as IocContainer)
  return { appEventBus, activityLogRepository, userRepository, logger, calls }
}

// Attend que le depot d'activite ait ete appele au moins une fois, sans dependre d'un delai
// arbitraire (meme motif que `waitForLoggedError` plus bas, applique a `create` plutot qu'a
// `logger.error`) : `#log` est asynchrone et `emit` ne l'attend pas.
const waitForActivityLogCreate = (
  activityLogRepository: { create: jest.Mock },
): Promise<void> =>
  new Promise((resolve) => {
    if (activityLogRepository.create.mock.calls.length > 0) {
      resolve()
      return
    }
    activityLogRepository.create.mockImplementation(() => {
      resolve()
      return Promise.resolve()
    })
  })

// Attend que le premier appel a `logger.error` (fait, en dernier, par le `catch` de `#log`) ait
// eu lieu, sans dependre d'un delai arbitraire : `#log` est asynchrone et `emit` ne l'attend pas.
const waitForLoggedError = (logger: { error: jest.Mock }): Promise<void> =>
  new Promise((resolve) => {
    if (logger.error.mock.calls.length > 0) {
      resolve()
      return
    }
    logger.error.mockImplementation(() => resolve())
  })

describe("ActivityLogSubscriber – un echec d'ecriture ne fuit pas le nom de l'utilisateur", () => {
  const USER_FIRST_NAME = 'Marie-CONFIDENTIEL'
  const USER_LAST_NAME = 'Dupont-CONFIDENTIEL'

  const buildUnexpectedPrismaError = () =>
    new Prisma.PrismaClientValidationError(
      [
        'Invalid `this.prisma.activityLog.create()` invocation in',
        '/app/src/main/infra/orm/repositories/activityLog.repository.ts:38:33',
        '',
        `data: { userID: "user-1", userFirstName: "${USER_FIRST_NAME}", userLastName: "${USER_LAST_NAME}", action: "patient.created", entityType: "patient", entityID: "pat-1", SABOTAGE_COLONNE_INCONNUE: 1 }`,
        '',
        'Unknown argument `SABOTAGE_COLONNE_INCONNUE`. Available options are marked with ?.',
      ].join('\n'),
      { clientVersion: '0.0.0-test' },
    )

  it('ne journalise jamais le prenom/nom de l utilisateur quand le depot echoue', async () => {
    const { appEventBus, activityLogRepository, userRepository, logger, calls } =
      buildSubscriber()
    userRepository.findIdentity.mockResolvedValue({
      id: 'user-1',
      firstName: USER_FIRST_NAME,
      lastName: USER_LAST_NAME,
    })
    activityLogRepository.create.mockRejectedValue(
      buildUnexpectedPrismaError(),
    )

    const done = waitForLoggedError(logger)
    appEventBus.emit('patient.created', { userID: 'user-1', patientId: 'pat-1' })
    await done

    expect(logger.error).toHaveBeenCalledTimes(1)
    const [message] = logger.error.mock.calls[0] as [string]
    expect(message).not.toContain(USER_FIRST_NAME)
    expect(message).not.toContain(USER_LAST_NAME)
    expect(message).not.toContain('SABOTAGE_COLONNE_INCONNUE')
    expect(message).toContain('PrismaClientValidationError')

    // Tous les canaux, pas seulement `error` (task-5-re-review-4.md, I1) : un `logger.warn`
    // ajoute dans le `catch`, avant la ligne corrigee, doit faire rougir ce test.
    for (const line of calls) {
      expect(line).not.toContain(USER_FIRST_NAME)
      expect(line).not.toContain(USER_LAST_NAME)
      expect(line).not.toContain('SABOTAGE_COLONNE_INCONNUE')
    }
  })
})

// Tour de correction 1 (tache 7, revue) : le test e2e de la tache 7
// (`super-admin-access-link.test.ts`) affirme la LIGNE en base — auteur, cible, prenom, nom — et
// c'est une PREUVE INDIRECTE : `findIdentity` et `findByID` rendent tous deux, pour un
// super-admin (par nature sans appartenance a charger), EXACTEMENT le meme resultat, et la
// souscription tourne sous `runAsSystem`, un mode que le pont a-plusieurs depuis un modele
// global (`assertNoGlobalToManyBridge`, tenant-guard.ts) ne couvre PAS davantage que l'absence
// de store — remplacer `findIdentity` par `findByID` dans `activity-log.subscriber.ts` (mesure
// par sabotage reel, tour de correction 1) laisse donc le test e2e VERT. Le motif que le
// commentaire de `#log` invoquait pour `findIdentity` — le pont refuse par le garde-fou sous
// contexte de tenant — NE VAUT PAS pour ce site precis : ni le mode systeme, ni le compte
// super-admin qui n'a rien a charger, ne le rendent observable ici. La bonne raison, propre a
// CE site, est ecrite dans le commentaire de la souscription (activity-log.subscriber.ts) :
// minimalite (ne charger que ce dont `#log` a besoin), pas un refus du garde-fou.
//
// Preuve DIRECTE, donc : QUELLE METHODE est appelee, jamais quel contenu en revient — la seule
// forme que la regression ci-dessus ne peut pas traverser sans faire rougir ce test.
describe('ActivityLogSubscriber – user.accessLinkReissued lit l auteur par findIdentity, jamais findByID', () => {
  it('appelle userRepository.findIdentity avec l auteur, et n appelle jamais findByID', async () => {
    const { appEventBus, activityLogRepository, userRepository } = buildSubscriber()

    const done = waitForActivityLogCreate(activityLogRepository)
    appEventBus.emit('user.accessLinkReissued', {
      userID: 'super-1',
      targetUserId: 'cible-1',
    })
    await done

    expect(userRepository.findIdentity).toHaveBeenCalledWith('super-1')
    expect(userRepository.findByID).not.toHaveBeenCalled()
  })
})
