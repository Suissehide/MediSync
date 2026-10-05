import type {
  ServicePermission,
  ServiceRole,
} from '../../main/utils/permissions'
import { SERVICE_PERMISSIONS } from '../../main/utils/permissions'
import { buildTestApp, type TestApp } from './setup/app'
import { testDb, truncateAll } from './setup/db'
import {
  createEstablishment,
  createService,
  createUser,
  signIn,
  tenantUrl,
} from './setup/fixtures'

// Un identifiant syntaxiquement valide (25 caractères, format cuid) mais qui
// n'existe dans aucune table : suffisant pour passer la validation de forme
// et atteindre le contrôle de permission, sans dépendre d'une ressource
// réellement créée. Un rôle qui détient la permission peut alors recevoir un
// 404/400/201 selon la route — tout sauf 403, la seule chose que ce fichier
// vérifie.
const FAKE_ID = 'clzzzzzzzzzzzzzzzzzzzzzzz'

// Une route représentative par permission de service. Le choix des routes
// suit `back/src/main/interfaces/http/fastify/routes/*.ts` : `permission:` y
// est déclaré par le garde-fou `assertRoutePermission`, donc chaque route
// listée ici porte bien la permission qu'elle prétend représenter.
//
// `pdf:export` et `members:read` sont absentes : la matrice les déclare mais
// aucune route ne les consomme aujourd'hui (voir le rapport de tâche) — il
// n'existe donc rien à sonder pour elles.
//
// `heldStatus` : quatre permissions (`planning:read`, `referentials:read`,
// `patient:read`, `todo:own`) figurent dans `READ_ALL` et sont donc détenues
// par les quatre rôles — la branche « détenue » de la boucle ci-dessous s'y
// exécute toujours, jamais la branche « refusée ». Un simple `not.toBe(403)`
// y passerait sur un 200, un 404, un 500 ou une route mal orthographiée :
// rien n'y serait falsifiable. Pour ces quatre-là, on affirme donc le code
// exact (200, une simple liste). Les autres probes n'ont pas ce défaut :
// au moins un rôle les refuse, ce qui exerce déjà la branche 403 pour de
// vrai ; leur branche « détenue » reste `not.toBe(403)` faute d'un code
// unique fiable (l'identifiant factice produit 201, 400 ou 404 selon la
// route et le domaine).
const probes: {
  permission: ServicePermission
  method: 'GET' | 'POST' | 'DELETE'
  path: string
  payload?: unknown
  heldStatus?: number
}[] = [
  {
    permission: 'planning:read',
    method: 'GET',
    path: '/slot',
    heldStatus: 200,
  },
  {
    permission: 'planning:write',
    method: 'POST',
    path: '/forbidden-week',
    payload: { date: '2026-01-05' },
  },
  {
    permission: 'referentials:read',
    method: 'GET',
    path: '/thematic',
    heldStatus: 200,
  },
  {
    permission: 'referentials:write',
    method: 'POST',
    path: '/thematic',
    payload: { name: 'X', soignantIDs: [] },
  },
  {
    permission: 'patient:read',
    method: 'GET',
    path: '/patient',
    heldStatus: 200,
  },
  {
    permission: 'patient:write',
    method: 'POST',
    path: '/patient',
    payload: { firstName: 'A', lastName: 'B' },
  },
  {
    permission: 'patient:delete',
    method: 'DELETE',
    path: `/patient/${FAKE_ID}`,
  },
  {
    permission: 'clinical:read',
    method: 'GET',
    path: `/patient/${FAKE_ID}/diagnostic`,
  },
  {
    permission: 'clinical:write',
    method: 'POST',
    path: `/patient/${FAKE_ID}/diagnostic`,
    payload: {},
  },
  {
    permission: 'appointment:write',
    method: 'DELETE',
    path: `/patient/${FAKE_ID}/enrollment-issue/${FAKE_ID}`,
  },
  { permission: 'todo:own', method: 'GET', path: '/todo', heldStatus: 200 },
  {
    permission: 'stats:read',
    method: 'GET',
    path: '/indicateurs-ars?from=2026-01-01&to=2026-12-31',
    heldStatus: 200,
  },
]

const roles: ServiceRole[] = [
  'COORDINATEUR',
  'INTERVENANT',
  'SECRETARIAT',
  'LECTURE',
]

describe('permissions par role de service', () => {
  let t: TestApp
  let establishmentId: string
  let serviceId: string
  // Une connexion par rôle, partagée par toutes les sondes de ce rôle :
  // `POST /auth/sign-in` est limité en débit (10/minute), et une connexion
  // par sonde (11 x 4 rôles) le dépasserait largement.
  const cookiesByRole = new Map<ServiceRole, { access_token: string }>()

  beforeAll(async () => {
    t = await buildTestApp()
    await truncateAll()
    const est = await createEstablishment()
    const service = await createService(est.id)
    establishmentId = est.id
    serviceId = service.id

    for (const role of roles) {
      const email = `${role.toLowerCase()}@test.fr`
      await createUser({
        email,
        memberships: [{ establishmentId, services: [{ serviceId, role }] }],
      })
      cookiesByRole.set(role, await signIn(t.app, email))
    }
  })

  afterAll(async () => {
    await t.close()
    await testDb.$disconnect()
  })

  describe.each(roles)('role %s', (role) => {
    // Dérivé de la matrice plutôt que recopié : si `SERVICE_PERMISSIONS`
    // change, l'attente suit automatiquement.
    it.each(probes)(
      '$permission -> 403 ssi non detenu',
      async ({ permission, method, path, payload, heldStatus }) => {
        const cookies = cookiesByRole.get(role)
        if (!cookies) {
          throw new Error(`no cookies for role ${role}`)
        }
        const res = await t.app.inject({
          method,
          url: tenantUrl(establishmentId, serviceId, path),
          cookies,
          payload: payload as never,
        })
        if (SERVICE_PERMISSIONS[role].includes(permission)) {
          if (heldStatus !== undefined) {
            expect(res.statusCode).toBe(heldStatus)
          } else {
            expect(res.statusCode).not.toBe(403)
          }
        } else {
          expect(res.statusCode).toBe(403)
        }
      },
    )
  })
})
