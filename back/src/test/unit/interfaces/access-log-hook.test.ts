import Fastify, { type FastifyInstance } from 'fastify'

import {
  assertNoDeadPatientAccessEntry,
  assertPatientReadLogged,
  tenantPlugin,
} from '../../../main/interfaces/http/fastify/plugins/tenant.plugin'
import {
  assertPatientRouteUnderTenant,
  TENANT_PREFIX,
  tenantRoutes,
} from '../../../main/interfaces/http/fastify/routes/tenant.routes'
import type { IocContainer } from '../../../main/types/application/ioc'
import type { RecordAccessInput } from '../../../main/types/domain/patientAccessLog.domain.interface'
import type { Tenant } from '../../../main/types/utils/tenant-context'
import {
  EXEMPTED_PATIENT_ROUTES,
  LOGGED_PATIENT_ROUTES,
  patientIdParamOf,
} from '../../../main/utils/access-log-routes'
import { TenantContext } from '../../../main/utils/tenant-context'

const PREFIX = TENANT_PREFIX
const DOSSIER = `${PREFIX}/patient/:patientID`

// ---------------------------------------------------------------------------
// Le garde-fou de demarrage, cote fonction pure.
// ---------------------------------------------------------------------------

describe('assertPatientReadLogged', () => {
  it("refuse une route de service GET portant :patientID qui n est ni journalisee ni exemptee", () => {
    expect(() =>
      assertPatientReadLogged({ method: 'GET', url: `${DOSSIER}/inedite` }),
    ).toThrow(/inedite/)
    // Le message doit NOMMER la route et les DEUX listes : c'est ce qui dit a l'auteur de la
    // route suivante quoi faire, sans qu'il ait a lire ce fichier.
    expect(() =>
      assertPatientReadLogged({ method: 'GET', url: `${DOSSIER}/inedite` }),
    ).toThrow(/LOGGED_PATIENT_ROUTES/)
    expect(() =>
      assertPatientReadLogged({ method: 'GET', url: `${DOSSIER}/inedite` }),
    ).toThrow(/EXEMPTED_PATIENT_ROUTES/)
  })

  // LA CHAUSSE-TRAPE DU DEPOT : `diagnosticEducatifRouter` est enregistre sous
  // `/patient/:patientId/diagnostic` (minuscule), les autres sous `:patientID`. Une detection
  // litterale sur `:patientID` aurait laisse passer les trois routes de diagnostic en silence.
  it('reconnait aussi l orthographe :patientId, celle des routes de diagnostic', () => {
    expect(patientIdParamOf(`${PREFIX}/patient/:patientId/diagnostic`)).toBe(
      'patientId',
    )
    expect(patientIdParamOf(DOSSIER)).toBe('patientID')
    expect(() =>
      assertPatientReadLogged({
        method: 'GET',
        url: `${PREFIX}/patient/:patientId/inedite`,
      }),
    ).toThrow(/inedite/)
  })

  // LA REGLE QUI PORTE LA PROMESSE EST STRUCTURELLE : un segment `/patient/` suivi d'un
  // parametre, quel qu'en soit le nom. C'est la sonde du relecteur (tour de correction 1) :
  // `:patient_id`, `:id`, `:pid` demarraient sans broncher et n'ecrivaient rien.
  it('reconnait un dossier a la STRUCTURE de l URL, quel que soit le nom du parametre', () => {
    for (const nom of ['patient_id', 'id', 'pid', 'x']) {
      expect(patientIdParamOf(`${PREFIX}/patient/:${nom}/sonde`)).toBe(nom)
      expect(() =>
        assertPatientReadLogged({
          method: 'GET',
          url: `${PREFIX}/patient/:${nom}/sonde`,
        }),
      ).toThrow(/sonde/)
    }
  })

  // Et sans faux positif : les routes de collection n'ont pas de parametre en position suivante.
  it('ne prend pas une route de collection pour un dossier identifie', () => {
    for (const url of [
      `${PREFIX}/patient`,
      `${PREFIX}/patient/export`,
      `${PREFIX}/patient/search`,
      `${PREFIX}/patient/with-tags`,
      `${PREFIX}/todo/:todoID`,
    ]) {
      expect(patientIdParamOf(url)).toBeNull()
      expect(() =>
        assertPatientReadLogged({ method: 'GET', url }),
      ).not.toThrow()
    }
  })

  it('garde le filet par nom pour un dossier hors d un segment /patient/', () => {
    // Filet secondaire : il attrape `:patientID` la ou la structure ne dit rien...
    expect(patientIdParamOf(`${PREFIX}/dossier/:patientID`)).toBe('patientID')
    // ...et il s'arrete a la frontiere du nom, sans confondre un parametre qui commence pareil.
    expect(patientIdParamOf(`${PREFIX}/dossier/:patientIDs`)).toBeNull()
    // Mais sous un segment `/patient/`, c'est la structure qui tranche, nom ou pas.
    expect(patientIdParamOf(`${PREFIX}/patient/:patientIDs`)).toBe('patientIDs')
  })

  it('laisse passer une route sans identifiant de patient, et une ecriture', () => {
    expect(() =>
      assertPatientReadLogged({ method: 'GET', url: `${PREFIX}/todo/:todoID` }),
    ).not.toThrow()
    // Les ecritures sont deja tracees par ActivityLog : ce journal-ci ne couvre que la lecture.
    for (const method of ['POST', 'PATCH', 'PUT', 'DELETE']) {
      expect(() =>
        assertPatientReadLogged({ method, url: `${DOSSIER}/inedite` }),
      ).not.toThrow()
    }
  })

  // `route.method` peut etre un tableau (`fastify.route({ method: ['GET', 'POST'] })`). Ne
  // traiter que la chaine aurait ouvert un trou muet.
  it('examine aussi une route declaree avec plusieurs methodes', () => {
    expect(() =>
      assertPatientReadLogged({
        method: ['POST', 'GET'],
        url: `${DOSSIER}/inedite`,
      }),
    ).toThrow(/inedite/)
    expect(() =>
      assertPatientReadLogged({
        method: ['POST', 'DELETE'],
        url: `${DOSSIER}/inedite`,
      }),
    ).not.toThrow()
  })

  it('laisse passer toutes les entrees des deux listes declarees', () => {
    for (const url of [
      ...Object.keys(LOGGED_PATIENT_ROUTES),
      ...Object.keys(EXEMPTED_PATIENT_ROUTES),
    ]) {
      expect(() =>
        assertPatientReadLogged({ method: 'GET', url }),
      ).not.toThrow()
    }
  })
})

describe('assertNoDeadPatientAccessEntry', () => {
  const allDeclared = [
    ...Object.keys(LOGGED_PATIENT_ROUTES),
    ...Object.keys(EXEMPTED_PATIENT_ROUTES),
  ].map((url) => ({ method: 'GET', url }))

  it('ne dit rien quand chaque entree correspond a une route GET reelle', () => {
    expect(() => assertNoDeadPatientAccessEntry(allDeclared)).not.toThrow()
  })

  it('refuse de demarrer quand une entree ne correspond plus a aucune route', () => {
    const [absente, ...reste] = allDeclared
    expect(absente).toBeDefined()
    const message = String(absente?.url)
    expect(() => assertNoDeadPatientAccessEntry(reste)).toThrow(
      new RegExp(message.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
    )
    expect(() => assertNoDeadPatientAccessEntry(reste)).toThrow(
      /LOGGED_PATIENT_ROUTES|EXEMPTED_PATIENT_ROUTES/,
    )
  })

  it('ne compte pas une route homonyme d une autre methode comme vivante', () => {
    const enEcriture = allDeclared.map(({ url }) => ({ method: 'POST', url }))
    expect(() => assertNoDeadPatientAccessEntry(enEcriture)).toThrow(
      /Entrees mortes/,
    )
  })
})

// ---------------------------------------------------------------------------
// Le frere RACINE du garde-fou : le hors-greffon.
// ---------------------------------------------------------------------------

describe('assertPatientRouteUnderTenant', () => {
  it('refuse une route de lecture designant un dossier posee hors du prefixe de tenant', () => {
    for (const url of [
      '/e/:establishmentId/admin/patient/:patient_id',
      '/super-admin/patient/:id',
      '/dossier/:patientID',
    ]) {
      expect(() =>
        assertPatientRouteUnderTenant({ method: 'GET', url }),
      ).toThrow(/hors du greffon de tenant/)
      // Le message doit dire OU la remettre, pas seulement qu'elle est refusee.
      expect(() =>
        assertPatientRouteUnderTenant({ method: 'GET', url }),
      ).toThrow(new RegExp(TENANT_PREFIX.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    }
  })

  it('laisse passer ce qui vit sous le prefixe de tenant, et ce qui ne designe aucun dossier', () => {
    for (const url of [
      ...Object.keys(LOGGED_PATIENT_ROUTES),
      ...Object.keys(EXEMPTED_PATIENT_ROUTES),
      '/e/:establishmentId/admin/members/:membershipId',
      '/super-admin/users',
      '/health',
    ]) {
      expect(() =>
        assertPatientRouteUnderTenant({ method: 'GET', url }),
      ).not.toThrow()
    }
  })

  it('ne regarde que les lectures', () => {
    expect(() =>
      assertPatientRouteUnderTenant({
        method: 'POST',
        url: '/e/:establishmentId/admin/patient/:patient_id',
      }),
    ).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// L attache : le crochet est bien pose par tenantRoutes, pas seulement ecrit.
// ---------------------------------------------------------------------------

describe('attache des crochets du journal dans tenantRoutes', () => {
  it('pose assertPatientReadLogged en onRoute et recordPatientAccess en onResponse', async () => {
    const hooks: { event: string; handler: unknown }[] = []
    const recordPatientAccess = Symbol('recordPatientAccess')
    const fastify = {
      resolveTenant: Symbol('resolveTenant'),
      enforcePermission: Symbol('enforcePermission'),
      stripClinicalInput: Symbol('stripClinicalInput'),
      stripClinicalFields: Symbol('stripClinicalFields'),
      recordPatientAccess,
      addHook: (event: string, handler: unknown) => {
        hooks.push({ event, handler })
      },
      register: () => Promise.resolve(),
    }
    await (
      tenantRoutes as unknown as (
        fastify: unknown,
        options: unknown,
      ) => Promise<void>
    )(fastify, {})

    expect(
      hooks.some(
        (h) => h.event === 'onRoute' && h.handler === assertPatientReadLogged,
      ),
    ).toBe(true)
    expect(
      hooks.find((h) => h.event === 'onResponse')?.handler,
    ).toBe(recordPatientAccess)
    expect(hooks.some((h) => h.event === 'onReady')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Le crochet d ecriture lui-meme.
// ---------------------------------------------------------------------------

const tenantOf = (): Tenant => ({
  userId: 'u1',
  establishmentId: 'e1',
  establishmentRole: 'MEMBER',
  serviceId: 's1',
  serviceRole: 'COORDINATEUR',
  soignantId: null,
  origine: 'reelle',
})

type HookCall = {
  request: Record<string, unknown> & { method?: string; log?: unknown }
  reply: { statusCode: number }
  // Le tenant reellement pose dans le contexte asynchrone pendant l'appel. `undefined` simule
  // une portee perdue. Par defaut, celui que porte `request.tenant` — le cas nominal, ou
  // `resolveTenant` a pose LE MEME objet des deux cotes.
  contexte?: Tenant | 'aucun'
}

const buildHookHarness = async (
  record: (input: RecordAccessInput) => Promise<void>,
) => {
  const tenantContext = new TenantContext()
  const app = Fastify()
  app.decorate('iocContainer', {
    tenantContext,
    accessGrantRepository: { findForUser: () => Promise.resolve([]) },
    patientAccessLogDomain: { record },
  } as unknown as IocContainer)
  await app.register(tenantPlugin)
  await app.ready()
  // Erreurs vues par `request.log` (voir `call` plus bas).
  const erreursRequete: string[] = []
  const hook = (
    app as FastifyInstance & {
      recordPatientAccess: (request: unknown, reply: unknown) => Promise<void>
    }
  ).recordPatientAccess
  const call = ({ request, reply, contexte }: HookCall) => {
    // Une vraie `FastifyRequest` porte toujours `method` et `log` ; le crochet lit les deux
    // (filtre HEAD, et journalisation rattachee au `reqId`). Le `log` pose ici est
    // DELIBEREMENT distinct de `app.log` : c'est ce qui permet d'affirmer que le crochet
    // journalise sur le logger DE LA REQUETE — celui qui porte le `reqId` — et non sur celui de
    // l'instance, ou la perte d'une ligne d'audit serait irrattachable a la requete.
    request.method = request.method ?? 'GET'
    request.log = request.log ?? { error: (m: unknown) => erreursRequete.push(String(m)) }
    const pose =
      contexte === undefined ? (request.tenant as Tenant | undefined) : contexte
    if (pose === undefined || pose === 'aucun') {
      return hook.call(app, request, reply)
    }
    return tenantContext.run(pose, () => hook.call(app, request, reply))
  }
  return { app, call, tenantContext, erreursRequete }
}

describe('recordPatientAccess', () => {
  it('ecrit une ligne quand une route journalisee repond en succes', async () => {
    const vues: RecordAccessInput[] = []
    const { app, call } = await buildHookHarness((input) => {
      vues.push(input)
      return Promise.resolve()
    })
    await call({
      request: {
        tenant: tenantOf(),
        routeOptions: { url: DOSSIER },
        params: { patientID: 'p1' },
        currentUser: { firstName: 'Ada', lastName: 'Lovelace' },
      },
      reply: { statusCode: 200 },
    })
    expect(vues).toEqual([
      {
        patientId: 'p1',
        userID: 'u1',
        userFirstName: 'Ada',
        userLastName: 'Lovelace',
        action: 'dossier.ouvert',
      },
    ])
    await app.close()
  })

  // Une requete HEAD ne rend aucun corps : personne n'a rien lu. Son jumeau porte la MEME
  // `routeOptions.url` que la route GET, donc rien d'autre que la methode ne l'en distingue.
  // L'application n'expose aujourd'hui aucune route HEAD (`exposeHeadRoutes: false`), ce filtre
  // rend donc la propriete independante de ce reglage plutot que tributaire de lui — et c'est
  // pour cela qu'il s'eprouve ici, au crochet, et pas par une requete HTTP qui recevrait un 404.
  it('n ecrit rien pour une requete qui ne rend aucun corps (HEAD)', async () => {
    const vues: RecordAccessInput[] = []
    const { app, call } = await buildHookHarness((input) => {
      vues.push(input)
      return Promise.resolve()
    })
    await call({
      request: {
        method: 'HEAD',
        tenant: tenantOf(),
        routeOptions: { url: DOSSIER },
        params: { patientID: 'p1' },
        currentUser: { firstName: null, lastName: null },
      },
      reply: { statusCode: 200 },
    })
    expect(vues).toEqual([])
    await app.close()
  })

  // Le pire cas possible pour un journal d'audit n'est pas l'absence de ligne, c'est une ligne
  // attribuee au mauvais etablissement. Le crochet exige donc que le contexte asynchrone porte
  // LE MEME OBJET que `request.tenant` — `resolveTenant` pose les deux a partir d'une seule
  // valeur. Un tenant aux memes colonnes mais construit ailleurs (donc : la portee d'une autre
  // requete) ne passe pas.
  it("n ecrit rien quand le contexte ambiant n est pas celui de cette requete", async () => {
    const vues: RecordAccessInput[] = []
    const { app, call, erreursRequete } = await buildHookHarness((input) => {
      vues.push(input)
      return Promise.resolve()
    })
    const surInstance = jest
      .spyOn(app.log, 'error')
      .mockImplementation((() => undefined) as never)

    const requete = {
      tenant: tenantOf(),
      routeOptions: { url: DOSSIER },
      params: { patientID: 'p1' },
      currentUser: { firstName: null, lastName: null },
    }
    // Contexte perdu.
    await call({ request: requete, reply: { statusCode: 200 }, contexte: 'aucun' })
    // Contexte present, mais celui d'une AUTRE requete : memes colonnes, autre objet.
    await call({
      request: requete,
      reply: { statusCode: 200 },
      contexte: tenantOf(),
    })

    expect(vues).toEqual([])
    expect(erreursRequete).toHaveLength(2)
    expect(erreursRequete[0]).toContain('contexte de tenant')
    // Sur le logger DE LA REQUETE, jamais sur celui de l'instance : sans `reqId`, une perte de
    // ligne d'audit n'est rattachable a rien.
    expect(surInstance).not.toHaveBeenCalled()
    await app.close()
  })

  // Et le pendant : sous le contexte de la requete, `record` est bien appele DEDANS — c'est la
  // que le domaine lit l'origine de l'acces et que le depot lit `scope()`.
  it('appelle record A L INTERIEUR du contexte de tenant', async () => {
    let vu: unknown
    const { app, call, tenantContext } = await buildHookHarness(() => {
      vu = tenantContext.peek()
      return Promise.resolve()
    })
    await call({
      request: {
        tenant: tenantOf(),
        routeOptions: { url: DOSSIER },
        params: { patientID: 'p1' },
        currentUser: { firstName: null, lastName: null },
      },
      reply: { statusCode: 200 },
    })
    expect(vu).toEqual({ kind: 'tenant', tenant: tenantOf() })
    await app.close()
  })

  it("n ecrit rien quand la reponse est une erreur", async () => {
    const vues: RecordAccessInput[] = []
    const { app, call } = await buildHookHarness((input) => {
      vues.push(input)
      return Promise.resolve()
    })
    for (const statusCode of [400, 403, 404, 500]) {
      await call({
        request: {
          tenant: tenantOf(),
          routeOptions: { url: DOSSIER },
          params: { patientID: 'p1' },
          currentUser: { firstName: null, lastName: null },
        },
        reply: { statusCode },
      })
    }
    expect(vues).toEqual([])
    await app.close()
  })

  // `request.tenant` est optionnel par construction : sur le chemin d'echec de `resolveTenant`
  // il n'est jamais pose, et les crochets suivants s'executent quand meme. Le crochet doit
  // sortir SANS ECRIRE et SANS LEVER. Eprouve ici avec un code de SUCCES, faute de quoi la garde
  // de statut ci-dessus suffirait a rendre ce test vert et il ne mesurerait rien du tenant (voir
  // le rapport de tache : le sabotage prevu par le cahier des charges ne pouvait pas rougir sur
  // le chemin HTTP reel, pour cette raison exacte).
  it("n ecrit rien, et ne leve pas, quand le tenant n est pas resolu", async () => {
    const vues: RecordAccessInput[] = []
    const { app, call, erreursRequete } = await buildHookHarness((input) => {
      vues.push(input)
      return Promise.resolve()
    })
    await expect(
      call({
        request: {
          tenant: undefined,
          routeOptions: { url: DOSSIER },
          params: { patientID: 'p1' },
          currentUser: { firstName: null, lastName: null },
        },
        reply: { statusCode: 200 },
      }),
    ).resolves.toBeUndefined()
    expect(vues).toEqual([])
    // Rien n'est ecrit, mais rien n'est tu non plus.
    expect(erreursRequete).toHaveLength(1)
    await app.close()
  })

  it('n ecrit rien sur une route exemptee ni sur une route sans identifiant de patient', async () => {
    const vues: RecordAccessInput[] = []
    const { app, call } = await buildHookHarness((input) => {
      vues.push(input)
      return Promise.resolve()
    })
    for (const url of [
      `${DOSSIER}/pathways`,
      `${PREFIX}/todo/:todoID`,
      undefined,
    ]) {
      await call({
        request: {
          tenant: tenantOf(),
          routeOptions: { url },
          params: { patientID: 'p1', todoID: 't1' },
          currentUser: { firstName: null, lastName: null },
        },
        reply: { statusCode: 200 },
      })
    }
    expect(vues).toEqual([])
    await app.close()
  })

  // La ligne de conduite du chantier : une ecriture de journal qui echoue ne doit pas empecher
  // de soigner, mais elle ne doit pas non plus disparaitre en silence — et le journal technique
  // ne doit jamais recopier le message brut, qui porte le `data` de l'ecriture ratee.
  it("n avale pas l echec en silence, et ne recopie jamais le message de l erreur", async () => {
    class PrismaClientKnownRequestError extends Error {}
    const secret = 'patientId: ckpatient0000000000000000'
    const { app, call, erreursRequete } = await buildHookHarness(() =>
      Promise.reject(new PrismaClientKnownRequestError(secret)),
    )
    const surInstance = jest
      .spyOn(app.log, 'error')
      .mockImplementation((() => undefined) as never)

    await expect(
      call({
        request: {
          tenant: tenantOf(),
          routeOptions: { url: DOSSIER },
          params: { patientID: 'ckpatient0000000000000000' },
          currentUser: { firstName: null, lastName: null },
        },
        reply: { statusCode: 200 },
      }),
    ).resolves.toBeUndefined()

    expect(erreursRequete).toHaveLength(1)
    expect(erreursRequete[0]).toContain('PrismaClientKnownRequestError')
    expect(erreursRequete[0]).not.toContain(secret)
    expect(surInstance).not.toHaveBeenCalled()
    await app.close()
  })
})
