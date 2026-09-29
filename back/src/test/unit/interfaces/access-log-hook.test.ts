import Fastify, { type FastifyInstance } from 'fastify'

import {
  assertNoDeadPatientAccessEntry,
  assertPatientReadLogged,
  tenantPlugin,
} from '../../../main/interfaces/http/fastify/plugins/tenant.plugin'
import { routes } from '../../../main/interfaces/http/fastify/routes/index'
import {
  assertNoDeadAdminPatientExemption,
  assertPatientRouteUnderTenant,
  TENANT_PREFIX,
  tenantRoutes,
} from '../../../main/interfaces/http/fastify/routes/tenant.routes'
import type { IocContainer } from '../../../main/types/application/ioc'
import type { RecordAccessInput } from '../../../main/types/domain/patientAccessLog.domain.interface'
import type { Tenant } from '../../../main/types/utils/tenant-context'
import {
  buildPatientExportFilters,
  EXEMPTED_ADMIN_PATIENT_ROUTES,
  EXEMPTED_PATIENT_ROUTES,
  LOGGED_PATIENT_ROUTES,
  PATIENT_EXPORT_ROUTE_URL,
  patientIdParamOf,
  plannedPatientExportAccess,
} from '../../../main/utils/access-log-routes'
import { TenantContext } from '../../../main/utils/tenant-context'

const PREFIX = TENANT_PREFIX
const DOSSIER = `${PREFIX}/patient/:patientID`

// ---------------------------------------------------------------------------
// Le garde-fou de demarrage, cote fonction pure.
// ---------------------------------------------------------------------------

describe('assertPatientReadLogged', () => {
  it('refuse une route de service GET portant :patientID qui n est ni journalisee ni exemptee', () => {
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
// L'export (tache 4) : structurellement hors du filet ci-dessus, cote fonctions pures.
// ---------------------------------------------------------------------------

describe('plannedPatientExportAccess', () => {
  it("n est jamais exigee par assertPatientReadLogged : c'est une route de collection", () => {
    // Meme URL que celle que patientRouter enregistre reellement (routes/patient.ts) — une
    // divergence entre les deux ferait passer ce dispositif a cote de la vraie route.
    expect(PATIENT_EXPORT_ROUTE_URL).toBe(`${PREFIX}/patient/export`)
    expect(patientIdParamOf(PATIENT_EXPORT_ROUTE_URL)).toBeNull()
  })

  it('rend null pour une autre route, meme avec un compte connu', () => {
    expect(plannedPatientExportAccess(DOSSIER, { search: 'dup' }, 2)).toBeNull()
  })

  // Le compte ne peut venir que du handler (`routes/patient.ts`) : absent, ce dispositif ne
  // peut pas construire de ligne. `recordPatientAccess` distingue ce cas (bug d'assemblage) du
  // simple "cette route n'est pas journalisee" — voir le test du crochet plus bas.
  it('rend null sur la route d export elle-meme quand le compte est inconnu', () => {
    expect(
      plannedPatientExportAccess(
        PATIENT_EXPORT_ROUTE_URL,
        { search: 'dup' },
        undefined,
      ),
    ).toBeNull()
  })

  it('construit une ligne avec le compte et les criteres, filtre absent omis', () => {
    expect(
      plannedPatientExportAccess(
        PATIENT_EXPORT_ROUTE_URL,
        { search: 'dup' },
        2,
      ),
    ).toEqual({
      action: 'export',
      exportCount: 2,
      exportFilters: JSON.stringify({ search: 'dup' }),
    })
  })

  it('porte pathwayTemplateTags quand il est fourni, et les deux ensemble', () => {
    expect(buildPatientExportFilters({ pathwayTemplateTags: ['asthme'] })).toBe(
      JSON.stringify({ pathwayTemplateTags: ['asthme'] }),
    )
    expect(
      buildPatientExportFilters({
        search: 'dup',
        pathwayTemplateTags: ['asthme', 'diabete'],
      }),
    ).toBe(
      JSON.stringify({
        search: 'dup',
        pathwayTemplateTags: ['asthme', 'diabete'],
      }),
    )
  })

  // Revue de la tache 4, mineur n°2 : une etiquette unique arrive en CHAINE dans la chaine de
  // requete, alors que le gestionnaire (`routes/patient.ts`) la normalise en tableau avant de
  // filtrer. Sans normalisation ici, le journal dirait `"asthme"` la ou le filtre applique etait
  // `["asthme"]` — une forme de critere qui n'a jamais ete celle du filtrage reel.
  it('normalise une etiquette unique en tableau, comme le fait le filtrage reel', () => {
    expect(buildPatientExportFilters({ pathwayTemplateTags: 'asthme' })).toBe(
      JSON.stringify({ pathwayTemplateTags: ['asthme'] }),
    )
    expect(
      buildPatientExportFilters({
        search: 'dup',
        pathwayTemplateTags: 'asthme',
      }),
    ).toBe(JSON.stringify({ search: 'dup', pathwayTemplateTags: ['asthme'] }))
  })

  it('ne porte ni search ni pathwayTemplateTags quand aucun des deux n est fourni', () => {
    expect(buildPatientExportFilters({})).toBe('{}')
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
      ).toThrow(
        new RegExp(TENANT_PREFIX.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
      )
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

  // TOUR DE CORRECTION 1 (tache 5) — LA TROISIEME VOIE. Le relecteur a demontre, par une sonde
  // reelle (`GET /e/:establishmentId/admin/patients/:patientRef/sonde`, servie par un vrai
  // `findUniqueOrThrow` sur `Patient`), que renommer le parametre pour sortir des deux filets de
  // `patientIdParamOf` etait un contournement : le meme code, le meme fichier, seul le nom du
  // parametre change, separe un dossier complet rendu sans aucune ligne de journal d'un refus de
  // demarrage. `EXEMPTED_ADMIN_PATIENT_ROUTES` est la reponse retenue : une route qui vit
  // deliberement hors du prefixe de tenant peut y etre declaree, avec sa raison, plutot que de
  // changer de nom pour echapper au filet. Elle ne promet PAS une couverture par le crochet
  // d'ecriture (absent hors de `tenantRoutes`) — elle declare qu'aucune couverture n'est due,
  // parce que la route ne lit jamais le dossier lui-meme.
  it('laisse passer une route d administration explicitement exemptee, avec :patientID', () => {
    for (const url of Object.keys(EXEMPTED_ADMIN_PATIENT_ROUTES)) {
      expect(patientIdParamOf(url)).not.toBeNull()
      expect(() =>
        assertPatientRouteUnderTenant({ method: 'GET', url }),
      ).not.toThrow()
    }
  })

  // La sonde du relecteur elle-meme, REDEVENUE REFUSEE : meme forme exacte
  // (`/admin/patients/:xxx/...`, hors du prefixe de tenant), mais UNE route non declaree.
  // L'exemption ne s'accorde jamais par ressemblance de forme, seulement par URL exacte.
  it('refuse toujours une route non declaree de la meme forme (patients/:xxx, plurielle)', () => {
    // Une seule URL a de quoi surprendre : `:patientID` matche le filet secondaire de
    // `patientIdParamOf` (nom reconnu, quel que soit le segment) — c'est CETTE forme que la
    // sonde du relecteur employait, et qu'une exemption non exacte aurait laissee passer par
    // ressemblance. `:patientRef` ne matche NI le filet primaire (segment `patients/`, pluriel)
    // NI le secondaire (nom non reconnu) : `patientIdParamOf` y rend `null` par construction,
    // donc `assertPatientRouteUnderTenant` ne la voit meme pas comme designant un dossier — ce
    // n'est pas ce que ce test-ci eprouve (voir le residu documente dans
    // `patientIdParamOf`, utils/access-log-routes.ts).
    const url = '/e/:establishmentId/admin/patients/:patientID/sonde'
    expect(patientIdParamOf(url)).not.toBeNull()
    expect(() => assertPatientRouteUnderTenant({ method: 'GET', url })).toThrow(
      /hors du greffon de tenant/,
    )
  })
})

describe('assertNoDeadAdminPatientExemption', () => {
  const declarees = Object.keys(EXEMPTED_ADMIN_PATIENT_ROUTES).map((url) => ({
    method: 'GET',
    url,
  }))

  it('ne dit rien quand chaque entree correspond a une route GET reelle', () => {
    expect(() => assertNoDeadAdminPatientExemption(declarees)).not.toThrow()
  })

  it('refuse de demarrer quand une entree ne correspond plus a aucune route', () => {
    expect(() => assertNoDeadAdminPatientExemption([])).toThrow(
      /EXEMPTED_ADMIN_PATIENT_ROUTES/,
    )
  })

  it('ne compte pas une route homonyme d une autre methode comme vivante', () => {
    const enEcriture = declarees.map(({ url }) => ({ method: 'POST', url }))
    expect(() => assertNoDeadAdminPatientExemption(enEcriture)).toThrow(
      /EXEMPTED_ADMIN_PATIENT_ROUTES/,
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
    expect(hooks.find((h) => h.event === 'onResponse')?.handler).toBe(
      recordPatientAccess,
    )
    expect(hooks.some((h) => h.event === 'onReady')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// LE SENS INVERSE, ATTACHE POUR DE BON (revue finale de branche, Important n°3).
// ---------------------------------------------------------------------------
//
// CE QUI MANQUAIT. Les deux controles d'entree morte — `assertNoDeadPatientAccessEntry` (sous
// `tenantRoutes`) et `assertNoDeadAdminPatientExemption` (a la racine) — sont eprouves plus haut
// COMME FONCTIONS, sur des tableaux fabriques. Rien ne verifiait qu'ils soient reellement
// APPELES au demarrage : la seule assertion de cablage ci-dessus se contente de « un crochet
// `onReady` existe », jamais de ce qu'il fait. Mesure avant ce correctif : commenter L'UN OU
// L'AUTRE des deux appels dans son `onReady` laissait **557 unitaires et 268 e2e verts**. Le
// sens ALLER, lui, rougit bien (`assertPatientReadLogged` fait echouer le demarrage), et la
// documentation ecrivait pourtant « les entrees mortes des deux listes font echouer le demarrage
// a leur tour » : vrai dans le code, tenu par rien.
//
// COMMENT CES DEUX TESTS S'Y PRENNENT, et pourquoi ils ne peuvent pas etre satisfaits par
// l'existence d'un crochet. Le greffon est applique sur un faux Fastify qui n'enregistre AUCUNE
// route reelle (`register` est un bouchon) : la collecte `onRoute` reste donc vide, et le
// crochet `onReady` — S'IL APPELLE VRAIMENT LE CONTROLE — doit lever en nommant les entrees
// declarees, qui sont toutes mortes de son point de vue. Puis on rejoue en ayant pousse les
// memes URL par le crochet `onRoute` reellement pose : le controle doit alors se taire. Retirer
// l'appel du `onReady` fait rougir le premier cas ; retirer le collecteur `onRoute` fait rougir
// le second.
type CrochetPose = { event: string; handler: unknown }

const appliquerGreffon = async (
  greffon: unknown,
  fastify: Record<string, unknown>,
): Promise<void> => {
  await (greffon as (f: unknown, o: unknown) => Promise<void>)(fastify, {})
}

// Rejoue le `onReady` du greffon avec les routes GET que l'on veut lui avoir fait voir.
const declencherOnReady = async (
  crochets: CrochetPose[],
  urlsVues: readonly string[],
): Promise<Error | null> => {
  for (const url of urlsVues) {
    for (const crochet of crochets.filter((c) => c.event === 'onRoute')) {
      // La route est passee a TOUS les crochets `onRoute` poses, pas au seul collecteur : c'est
      // ce qui garantit qu'on ne teste pas un collecteur que le greffon n'attacherait plus. Elle
      // porte donc une `permission`, exigee d'une route de forme tenant par
      // `assertRoutePermission`/`assertTenantShapedRoute` — sans quoi ceux-la leveraient d'abord
      // et le `onReady` ne serait jamais atteint.
      ;(
        crochet.handler as (r: {
          method: string
          url: string
          config: { permission: string }
        }) => void
      )({ method: 'GET', url, config: { permission: 'consultations:read' } })
    }
  }
  const onReady = crochets.find((c) => c.event === 'onReady')
  if (onReady === undefined) {
    return new Error('aucun crochet onReady pose par ce greffon')
  }
  try {
    await (onReady.handler as () => Promise<void>)()
    return null
  } catch (err) {
    return err as Error
  }
}

describe('tenantRoutes appelle reellement assertNoDeadPatientAccessEntry en onReady', () => {
  const fauxFastify = (crochets: CrochetPose[]): Record<string, unknown> => ({
    resolveTenant: Symbol('resolveTenant'),
    enforcePermission: Symbol('enforcePermission'),
    stripClinicalInput: Symbol('stripClinicalInput'),
    stripClinicalFields: Symbol('stripClinicalFields'),
    recordPatientAccess: Symbol('recordPatientAccess'),
    addHook: (event: string, handler: unknown) => {
      crochets.push({ event, handler })
    },
    register: () => Promise.resolve(),
  })

  const declarees = [
    ...Object.keys(LOGGED_PATIENT_ROUTES),
    ...Object.keys(EXEMPTED_PATIENT_ROUTES),
  ]

  it('fait echouer le demarrage quand aucune route declaree n existe plus', async () => {
    const crochets: CrochetPose[] = []
    await appliquerGreffon(tenantRoutes, fauxFastify(crochets))
    const erreur = await declencherOnReady(crochets, [])
    expect(erreur).not.toBeNull()
    expect(erreur?.message).toMatch(
      /Entrees mortes dans le journal des consultations/,
    )
    // Les DEUX listes sont bien confrontees, pas seulement la premiere.
    expect(erreur?.message).toMatch(/LOGGED_PATIENT_ROUTES/)
    expect(erreur?.message).toMatch(/EXEMPTED_PATIENT_ROUTES/)
  })

  it('se tait quand chaque entree correspond a une route GET reellement vue', async () => {
    const crochets: CrochetPose[] = []
    await appliquerGreffon(tenantRoutes, fauxFastify(crochets))
    expect(await declencherOnReady(crochets, declarees)).toBeNull()
  })
})

describe('le greffon racine appelle reellement assertNoDeadAdminPatientExemption en onReady', () => {
  const fauxFastify = (crochets: CrochetPose[]): Record<string, unknown> => ({
    iocContainer: { tenantContext: new TenantContext() },
    verifySessionCookie: () => Promise.resolve(),
    addHook: (event: string, handler: unknown) => {
      crochets.push({ event, handler })
    },
    get: () => undefined,
    register: () => Promise.resolve(),
  })

  const declarees = Object.keys(EXEMPTED_ADMIN_PATIENT_ROUTES)

  it('fait echouer le demarrage quand une exemption ne protege plus aucune route', async () => {
    const crochets: CrochetPose[] = []
    await appliquerGreffon(routes, fauxFastify(crochets))
    const erreur = await declencherOnReady(crochets, [])
    expect(erreur).not.toBeNull()
    expect(erreur?.message).toMatch(
      /Entrees mortes dans EXEMPTED_ADMIN_PATIENT_ROUTES/,
    )
    for (const url of declarees) {
      expect(erreur?.message).toContain(url)
    }
  })

  it('se tait quand chaque exemption correspond a une route GET reellement vue', async () => {
    const crochets: CrochetPose[] = []
    await appliquerGreffon(routes, fauxFastify(crochets))
    expect(await declencherOnReady(crochets, declarees)).toBeNull()
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
    request.log = request.log ?? {
      error: (m: unknown) => erreursRequete.push(String(m)),
    }
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
  it('n ecrit rien quand le contexte ambiant n est pas celui de cette requete', async () => {
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
    await call({
      request: requete,
      reply: { statusCode: 200 },
      contexte: 'aucun',
    })
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

  it('n ecrit rien quand la reponse est une erreur', async () => {
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
  it('n ecrit rien, et ne leve pas, quand le tenant n est pas resolu', async () => {
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
  it('n avale pas l echec en silence, et ne recopie jamais le message de l erreur', async () => {
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

  // ---------------------------------------------------------------------
  // L'export (tache 4) : meme crochet, dispositif dedie (voir access-log-routes.ts).
  // ---------------------------------------------------------------------

  it('ecrit une ligne pour l export, sans identifiant de patient, avec le compte et les criteres', async () => {
    const vues: RecordAccessInput[] = []
    const { app, call } = await buildHookHarness((input) => {
      vues.push(input)
      return Promise.resolve()
    })
    await call({
      request: {
        tenant: tenantOf(),
        routeOptions: { url: PATIENT_EXPORT_ROUTE_URL },
        params: {},
        query: { search: 'dup' },
        patientExportCount: 2,
        currentUser: { firstName: 'Ada', lastName: 'Lovelace' },
      },
      reply: { statusCode: 200 },
    })
    expect(vues).toEqual([
      {
        patientId: undefined,
        userID: 'u1',
        userFirstName: 'Ada',
        userLastName: 'Lovelace',
        action: 'export',
        exportCount: 2,
        exportFilters: JSON.stringify({ search: 'dup' }),
      },
    ])
    await app.close()
  })

  // Bug d'assemblage plutot que cas normal (voir le commentaire de `recordPatientAccess`) : le
  // handler n'a pas pose `patientExportCount` avant de repondre. Rien n'est ecrit, mais rien
  // n'est tu non plus — meme parti pris que le contexte de tenant absent ou etranger.
  it('n ecrit rien, et le signale, quand l export n a pas de compte connu', async () => {
    const vues: RecordAccessInput[] = []
    const { app, call, erreursRequete } = await buildHookHarness((input) => {
      vues.push(input)
      return Promise.resolve()
    })
    await call({
      request: {
        tenant: tenantOf(),
        routeOptions: { url: PATIENT_EXPORT_ROUTE_URL },
        params: {},
        query: { search: 'dup' },
        currentUser: { firstName: null, lastName: null },
      },
      reply: { statusCode: 200 },
    })
    expect(vues).toEqual([])
    expect(erreursRequete).toHaveLength(1)
    expect(erreursRequete[0]).toContain('export')
    await app.close()
  })
})
