import type { HTTPMethods } from 'fastify'

import { assertRoutePermission } from '../../main/interfaces/http/fastify/plugins/tenant.plugin'
import {
  requireSuperAdmin,
  superAdminRoutes,
} from '../../main/interfaces/http/fastify/routes/super-admin.routes'
import { buildTestApp, type TestApp } from './setup/app'
import { testDb, truncateAll } from './setup/db'
import { createUser, signIn } from './setup/fixtures'

// Un identifiant syntaxiquement valide (25 caractères, format cuid) mais qui n'existe dans
// aucune table : suffisant pour remplir un paramètre d'URL sans dépendre d'une ressource
// réellement créée — même convention que permissions.test.ts.
const FAKE_ID = 'clzzzzzzzzzzzzzzzzzzzzzzz'

// `fastify.printRoutes({ commonPrefix: false })` rend un arbre ASCII (find-my-way), pas une
// liste : chaque ligne porte un connecteur de 4 caractères par niveau d'ancêtre
// (`│   ` s'il reste des frères en dessous, 4 espaces sinon) puis le connecteur propre de la
// ligne (`├── ` ou `└── `), un libellé, et `(METHODES)` quand la ligne porte une route. Le
// chemin complet d'une ligne est la concaténation des libellés de la racine jusqu'à elle —
// exactement ce que Fastify assemble lui-même pour router une requête, donc rejouable tel quel
// dans `app.inject`. C'est ce mécanisme, et non une liste de routes recopiées à la main, qui
// permet de balayer *chaque* route sous `/super-admin` sans en oublier une à la tâche 6, 7 ou 8
// (voir le brief de cette tâche : « à l'étape 3, balayer les soixante routes de lecture »).
const ANCESTOR_CONTINUES = '│   '
const ANCESTOR_DONE = '    '
const OWN_MIDDLE = '├── '
const OWN_LAST = '└── '
const GROUP_RE = new RegExp(
  `^(${[ANCESTOR_CONTINUES, ANCESTOR_DONE, OWN_MIDDLE, OWN_LAST].map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`,
)

type ParsedRoute = { method: string; url: string }

const parsePrintedRoutes = (printed: string): ParsedRoute[] => {
  const routes: ParsedRoute[] = []
  const pathStack: string[] = []
  for (const rawLine of printed.split('\n')) {
    if (!rawLine.trim()) {
      continue
    }
    let rest = rawLine
    let groups = 0
    let match = rest.match(GROUP_RE)
    while (match) {
      rest = rest.slice(match[0].length)
      groups += 1
      match = rest.match(GROUP_RE)
    }
    const level = groups - 1
    if (level < 0) {
      continue
    }
    const labelMatch = rest.match(/^(.*?)(?: \(([^)]*)\))?$/)
    const label = labelMatch?.[1] ?? rest
    const methodsRaw = labelMatch?.[2]
    const parentPath = level === 0 ? '' : (pathStack[level - 1] ?? '')
    const fullPath = parentPath + label
    pathStack[level] = fullPath
    pathStack.length = level + 1
    if (!methodsRaw) {
      continue
    }
    for (const method of methodsRaw.split(',').map((m) => m.trim())) {
      // HEAD est ajouté automatiquement par Fastify pour toute route GET, avec le même
      // gestionnaire : le tester séparément n'exercerait rien de plus.
      if (method === 'HEAD') {
        continue
      }
      routes.push({ method, url: fullPath })
    }
  }
  return routes
}

// Remplace un paramètre (`:id`, ou l'alternance `:patientID|:patientId` que rend Fastify quand
// deux routes partagent une position mais pas le nom du paramètre) par un identifiant syntaxique
// valide : seule la position compte pour le routage, jamais le nom.
const fillParams = (url: string): string =>
  url.replace(/:[A-Za-z0-9_]+(?:\|:[A-Za-z0-9_]+)*/g, FAKE_ID)

describe('acces au prefixe /super-admin', () => {
  let testApp: TestApp

  beforeAll(async () => {
    await truncateAll()
    testApp = await buildTestApp()
  })

  afterAll(async () => {
    await testApp.close()
    await testDb.$disconnect()
  })

  // Ce test est rouge sans son mécanisme : commenter l'un ou l'autre `addHook` dans
  // super-admin.routes.ts le fait échouer immédiatement (vérifié par exécution avant de compter
  // ce test — voir le rapport de tâche).
  it('pose le garde-fou de permission puis requireSuperAdmin, dans cet ordre', async () => {
    const hooks: { event: string; handler: unknown }[] = []
    const fastify = {
      addHook: (event: string, handler: unknown) => {
        hooks.push({ event, handler })
      },
    }
    await (
      superAdminRoutes as unknown as (
        fastify: unknown,
        options: unknown,
      ) => Promise<void>
    )(fastify, {})
    expect(hooks).toEqual([
      { event: 'onRoute', handler: assertRoutePermission },
      { event: 'onRequest', handler: requireSuperAdmin },
    ])
  })

  // Idem, rouge sans son mécanisme : retirer le contrôle du drapeau dans `requireSuperAdmin`
  // fait résoudre au lieu de rejeter, et ce test échoue.
  describe('requireSuperAdmin', () => {
    // `requireSuperAdmin` lève de façon SYNCHRONE (pas une promesse rejetée) : c'est ainsi que
    // Fastify l'invoque lui-même sur ce genre de crochet (même style que `assertRoutePermission`,
    // testé pareillement en synchrone dans tenant-resolution.test.ts), et `throw` avant tout
    // `await` ne construit pas de promesse à attendre.
    it('rejette (404) un compte sans le drapeau isSuperAdmin', () => {
      expect(() =>
        requireSuperAdmin(
          { currentUser: { isSuperAdmin: false } } as never,
          {} as never,
          undefined as never,
        ),
      ).toThrow(
        expect.objectContaining({
          output: expect.objectContaining({ statusCode: 404 }),
        }),
      )
    })

    it('rejette (404) quand currentUser est absent', () => {
      expect(() =>
        requireSuperAdmin({} as never, {} as never, undefined as never),
      ).toThrow(
        expect.objectContaining({
          output: expect.objectContaining({ statusCode: 404 }),
        }),
      )
    })

    it('laisse passer un compte avec le drapeau', async () => {
      await expect(
        requireSuperAdmin(
          { currentUser: { isSuperAdmin: true } } as never,
          {} as never,
          undefined as never,
        ),
      ).resolves.toBeUndefined()
    })
  })

  // La propriété visée par la tâche : balayée par `fastify.printRoutes()`, pas sur un
  // échantillon choisi à la main — c'est ce qui la garde juste sans y penser quand les tâches 6,
  // 7 et 8 enregistreront leurs routeurs sous ce préfixe (aujourd'hui, aucune : le filtre sur
  // `/super-admin` ne trouve donc rien à parcourir, et c'est l'état attendu tant que ces tâches
  // ne sont pas faites).
  //
  // Tour de correction 1 (relecture externe) : rien, sans la ligne qui suit, ne distinguait
  // « zéro route parce qu'il n'y en a légitimement aucune sous /super-admin » de « zéro route
  // parce que l'énumération elle-même est cassée » — ce dernier cas laissait ce test vert sans
  // avoir rien examiné. On n'asserte PAS que le sous-ensemble /super-admin est non vide (ce
  // serait faux aujourd'hui, et rouge pour rien). On asserte que `parsePrintedRoutes` rend
  // quelque chose sur l'application ENTIÈRE avant tout filtre : elle porte plusieurs dizaines de
  // routes déjà (146 à l'écriture de ce test, HEAD exclu), donc un total qui s'effondre trahit
  // une énumération cassée, y compris quand /super-admin ne contient encore rien. Montré rouge
  // par exécution en corrompant volontairement `parsePrintedRoutes` (retour `[]`
  // inconditionnel) avant de compter ce test — voir le rapport de tâche.
  it('chaque route enregistree sous /super-admin rend 404 a un compte sans le drapeau', async () => {
    await createUser({ email: 'membre-ordinaire@test.fr', isSuperAdmin: false })
    const cookies = await signIn(testApp.app, 'membre-ordinaire@test.fr')

    const allRoutes = parsePrintedRoutes(
      testApp.app.printRoutes({ commonPrefix: false }),
    )
    // Garde de l'énumération elle-même, avant tout filtre — voir le commentaire ci-dessus.
    expect(allRoutes.length).toBeGreaterThan(50)

    const routes = allRoutes.filter((route) =>
      route.url.startsWith('/super-admin'),
    )

    for (const route of routes) {
      const res = await testApp.app.inject({
        method: route.method as HTTPMethods,
        url: fillParams(route.url),
        cookies,
      })
      expect({
        method: route.method,
        url: route.url,
        status: res.statusCode,
      }).toEqual({ method: route.method, url: route.url, status: 404 })
    }
  })
})
