import Fastify, { type FastifyInstance } from 'fastify'

import {
  assertNoDeadPatientAccessEntry,
  assertPatientReadLogged,
  tenantPlugin,
} from '../../../main/interfaces/http/fastify/plugins/tenant.plugin'
import { tenantRoutes } from '../../../main/interfaces/http/fastify/routes/tenant.routes'
import type { IocContainer } from '../../../main/types/application/ioc'
import type { RecordAccessInput } from '../../../main/types/domain/patientAccessLog.domain.interface'
import type { Tenant } from '../../../main/types/utils/tenant-context'
import {
  EXEMPTED_PATIENT_ROUTES,
  LOGGED_PATIENT_ROUTES,
  patientIdParamOf,
} from '../../../main/utils/access-log-routes'
import { TenantContext } from '../../../main/utils/tenant-context'

const PREFIX = '/e/:establishmentId/s/:serviceId'
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

  it('ne confond pas un parametre qui commence pareil avec un identifiant de patient', () => {
    expect(patientIdParamOf(`${PREFIX}/patient/:patientIDs`)).toBeNull()
    expect(() =>
      assertPatientReadLogged({ method: 'GET', url: `${PREFIX}/x/:patientIDs` }),
    ).not.toThrow()
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
  request: Record<string, unknown>
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
  const hook = (
    app as FastifyInstance & {
      recordPatientAccess: (request: unknown, reply: unknown) => Promise<void>
    }
  ).recordPatientAccess
  const call = ({ request, reply, contexte }: HookCall) => {
    const pose =
      contexte === undefined ? (request.tenant as Tenant | undefined) : contexte
    if (pose === undefined || pose === 'aucun') {
      return hook.call(app, request, reply)
    }
    return tenantContext.run(pose, () => hook.call(app, request, reply))
  }
  return { app, call, tenantContext }
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

  // Le pire cas possible pour un journal d'audit n'est pas l'absence de ligne, c'est une ligne
  // attribuee au mauvais etablissement. Le crochet exige donc que le contexte asynchrone porte
  // LE MEME OBJET que `request.tenant` — `resolveTenant` pose les deux a partir d'une seule
  // valeur. Un tenant aux memes colonnes mais construit ailleurs (donc : la portee d'une autre
  // requete) ne passe pas.
  it("n ecrit rien quand le contexte ambiant n est pas celui de cette requete", async () => {
    const vues: RecordAccessInput[] = []
    const { app, call } = await buildHookHarness((input) => {
      vues.push(input)
      return Promise.resolve()
    })
    const errors: string[] = []
    jest.spyOn(app.log, 'error').mockImplementation(((message: unknown) => {
      errors.push(String(message))
    }) as never)

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
    expect(errors).toHaveLength(2)
    expect(errors[0]).toContain('contexte de tenant')
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
    const { app, call } = await buildHookHarness((input) => {
      vues.push(input)
      return Promise.resolve()
    })
    const errors: string[] = []
    jest.spyOn(app.log, 'error').mockImplementation(((message: unknown) => {
      errors.push(String(message))
    }) as never)
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
    expect(errors).toHaveLength(1)
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
    const { app, call } = await buildHookHarness(() =>
      Promise.reject(new PrismaClientKnownRequestError(secret)),
    )
    const errors: string[] = []
    jest.spyOn(app.log, 'error').mockImplementation(((message: unknown) => {
      errors.push(String(message))
    }) as never)

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

    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('PrismaClientKnownRequestError')
    expect(errors[0]).not.toContain(secret)
    await app.close()
  })
})
