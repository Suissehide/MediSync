# Multi-tenant étape 1 (socle) — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Poser la mécanique multi-tenant du back (établissements, services, appartenances, rôles, routes préfixées, repositories filtrés, garde-fou Prisma), migrer les données vers un établissement et un service uniques, et adapter le front au minimum pour que l'application reste indiscernable d'aujourd'hui.

**Architecture:** Le tenant courant (établissement, service, rôles) est résolu par un préhandler Fastify à partir des paramètres d'URL et de l'appartenance de l'utilisateur, puis stocké dans un `AsyncLocalStorage`. Les repositories, restés singletons Awilix, lisent ce contexte à chaque requête et filtrent sur `serviceId` / `establishmentId`. Une extension Prisma refuse toute requête sur un modèle de tenant sans ce filtre. Les autorisations passent par une matrice statique rôle → permissions, déclarée par route dans `config.permission`.

**Tech Stack:** Node 24, Fastify 5.9, Awilix 12 (`@fastify/awilix`), Prisma 7.8 (`prisma-client` generator, sortie `src/generated`, adaptateur `@prisma/adapter-pg`), Zod v4 (`fastify-type-provider-zod`), Jest 30 + `@swc/jest`, Biome. Front : React 19, TanStack Router/Query, Zustand.

**Spec:** `docs/superpowers/specs/2026-09-22-multi-tenant-etape-1-socle-design.md` (parent : `docs/superpowers/specs/2026-09-22-multi-tenant-architecture-design.md`, rôles : `docs/multi-tenant/habilitations.md`).

## Global Constraints

- Tout le code back est sous `back/`, tout le front sous `front/`. Les commandes npm se lancent depuis ces dossiers.
- Style Biome : 2 espaces, guillemets simples, pas de point-virgule, imports groupés `:NODE: / :PACKAGE: / :ALIAS: / :PATH:`. `npm run lint` doit passer à la fin de chaque tâche back.
- Pas de nouveau `index.ts` de ré-export (règle `noBarrelFile`), sauf `schemas/index.ts` déjà existant.
- Les fonctions `async` doivent `await` quelque chose (`useAwait`).
- Import des modèles Prisma depuis `src/generated/client` et des enums depuis `src/generated/enums`, jamais depuis `@prisma/client`.
- Colonnes de tenant : `establishmentId` et `serviceId` (camelCase, suffixe `Id`), partout.
- Toute route sous `/e/:establishmentId/s/:serviceId` ou `/e/:establishmentId/admin` déclare `config: { permission: '<permission>' }`.
- Messages de commit : `type(scope): sujet` en français sans accents dans le sujet (convention de l'historique, commitlint à la racine), terminés par la ligne `Claude-Session: https://claude.ai/code/session_01G1JrhGqWHmVH6XB2XTTwJe`.
- Base de développement : Postgres de `deploy/compose.yaml` (`docker compose --profile db up -d` dans `deploy/`). Base de test : `medisync_test` sur le même Postgres.
- **Rupture temporaire de compilation** : entre la tâche 5 (schéma) et la tâche 15 (routes), `npm run build` échoue, c'est attendu. Les tests unitaires (`npm run test:unit`, transpilation SWC sans typecheck) doivent passer à chaque tâche. La tâche 15 rétablit `npm run build` et les e2e.

---

## Carte des fichiers

**Back, créés**

| Fichier | Responsabilité |
| --- | --- |
| `back/.env.test.example`, `back/.env.test` | URL de la base de test |
| `back/src/test/e2e/setup/app.ts` | Construit le container et le serveur Fastify pour `inject` |
| `back/src/test/e2e/setup/db.ts` | Client Prisma sans garde-fou, `truncateAll()` |
| `back/src/test/e2e/setup/fixtures.ts` | Fabriques : établissement, service, utilisateur avec appartenances, cookie de session |
| `back/src/main/utils/permissions.ts` | Types de permissions et matrice rôle → permissions (copie identique côté front) |
| `back/src/main/utils/tenant-context.ts` | `TenantContext` (AsyncLocalStorage), `runAsSystem` |
| `back/src/main/utils/tenant-errors.ts` | `TenantContextMissingError`, `TenantScopeMissingError` |
| `back/src/main/types/utils/tenant-context.ts` | Types `Tenant`, `ServiceTenant`, `TenantStore`, interface |
| `back/src/main/infra/orm/tenant-guard.ts` | Listes de modèles, `assertTenantScope`, `buildTenantGuardExtension` |
| `back/src/main/interfaces/http/fastify/plugins/tenant.plugin.ts` | `resolveTenant`, `resolveEstablishmentAdmin`, préhandler de permission, fail-safe `onRoute` |
| `back/src/main/interfaces/http/fastify/routes/me.ts` | `GET /me`, `PATCH /me` |
| `back/src/main/interfaces/http/fastify/routes/members.ts` | Routes membres de l'établissement |
| `back/src/main/interfaces/http/fastify/routes/tenant.routes.ts` | Plugin porteur du préfixe de service |
| `back/src/main/interfaces/http/fastify/routes/establishment-admin.routes.ts` | Plugin porteur du préfixe d'admin d'établissement |
| `back/src/main/interfaces/http/fastify/schemas/me.schema.ts`, `members.schema.ts` | Zod |
| `back/src/main/domain/membership.domain.ts` + `types/domain/membership.domain.interface.ts` | Règles membres (dernier admin, soi-même) |
| `back/src/main/infra/orm/repositories/membership.repository.ts` + interface | Appartenances (famille établissement) |
| `back/prisma/migrations/<timestamp>_multi_tenant_socle/migration.sql` | Migration |
| `back/prisma/checks/multi-tenant-socle.sql` | Invariants post-migration |
| `back/src/main/utils/me-mapper.ts` | `toMeResponse(user)` |

**Back, modifiés** : `prisma/schema.prisma`, `prisma/seed.ts` et `prisma/seed/*.ts`, `postgres-client.ts`, tous les repositories et leurs interfaces, `cookie.plugin.ts`, `plugins/index.ts`, `routes/index.ts`, chaque routeur (permission), `auth.domain.ts`, `user.domain.ts`, `user.repository.ts`, `auth.schema.ts`, `sign-in.router.ts`, `refresh.router.ts`, `register.router.ts`, `awilix-ioc-container.ts`, `types/application/ioc.ts`, `application/starter.ts`, `fastify-http-server.ts`, `types/interfaces/http/server.ts`, `package.json` (wireit), `.husky/pre-commit`, `CLAUDE.md`.

**Front, créés** : `src/utils/permissions.ts`, `src/hooks/useCan.ts`, `src/api/members.api.ts`, `src/queries/useMembers.ts`, `src/types/member.ts`, `src/columns/member.column.tsx`, `src/components/custom/popup/editMemberForm.tsx`, `src/components/custom/popup/addMemberForm.tsx`.

**Front, modifiés** : `types/auth.ts`, `store/useAuthStore.ts`, `constants/config.constant.ts`, tous `api/*.api.ts` sauf `auth.api.ts`, `routes/_authenticated.tsx`, `routes/_authenticated/_admin.tsx`, `routes/pending.tsx`, `components/navbar.tsx`, `components/custom/sidebar/soignant.sidebar.tsx`, `components/custom/sidebar/dashboardFilter.sidebar.tsx`, `routes/_authenticated/_admin/settings/user.tsx`, `routes/_authenticated/user/settings.tsx`, `routes/auth/index.tsx`, `queries/useUser.ts`, `api/user.api.ts`.

**Supprimés** : `back/src/main/interfaces/http/fastify/routes/user.ts`, `schemas/user.schema.ts`, `front/src/components/custom/popup/deleteUserForm.tsx`, `front/src/columns/user.column.tsx`, `front/src/constants/user.constant.ts`.

---

### Task 1: Harnais e2e et smoke test

**Files:**
- Create: `back/.env.test.example`, `back/.env.test`
- Create: `back/src/test/e2e/setup/app.ts`, `back/src/test/e2e/setup/db.ts`
- Create: `back/src/test/e2e/health.test.ts`
- Modify: `back/src/main/interfaces/http/fastify/fastify-http-server.ts:30-55`
- Modify: `back/src/main/types/interfaces/http/server.ts`
- Modify: `back/package.json` (bloc `wireit.test:e2e`, `wireit.cover:e2e`)
- Modify: `back/.husky/pre-commit`

**Interfaces:**
- Produces: `buildTestApp(): Promise<{ app: FastifyInstance; instances: IocContainer; close: () => Promise<void> }>` ; `testDb: PrismaClient` (sans garde-fou) ; `truncateAll(): Promise<void>`.

- [ ] **Step 1: Fichiers d'environnement de test**

`back/.env.test.example` (versionné) :

```dotenv
DATABASE_URL="postgres://postgres:postgres@localhost:5432/medisync_test?schema=public"
HOST=127.0.0.1
LOG_LEVEL=silent
PORT=0
FRONT_URL="http://localhost:4270"
CORS_ORIGIN="http://localhost:4270"
JWT_SECRET=medisync-jwt-test
JWT_REFRESH_SECRET=medisync-refresh-test
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d
COOKIE_SECRET=medisync-cookie-test
JEST_RUNNING=true
```

Copier en `back/.env.test` (déjà autorisé par `back/.gitignore` via `!**/.env.test`, donc versionné aussi : ce fichier ne contient aucun secret réel). Créer la base une fois :

```bash
cd deploy && docker compose --profile db exec postgres psql -U postgres -c 'CREATE DATABASE medisync_test'
```

(si la base existe déjà la commande échoue sans conséquence).

- [ ] **Step 2: Exposer l'instance Fastify**

Dans `back/src/main/types/interfaces/http/server.ts`, ajouter à l'interface `HttpServer` :

```ts
import type { FastifyInstance } from 'fastify'
// ...
  readonly instance: FastifyInstance
```

Dans `fastify-http-server.ts`, ajouter après `get baseUrl()` :

```ts
  get instance(): FastifyInstance {
    return this.fastify
  }
```

- [ ] **Step 3: Constructeur d'application de test**

`back/src/test/e2e/setup/app.ts` :

```ts
import type { FastifyInstance } from 'fastify'

import { loadConfig } from '../../../main/application/config'
import { startIocContainer } from '../../../main/application/starter'
import type { IocContainer } from '../../../main/types/application/ioc'
import '../../../main/utils/date'

export type TestApp = {
  app: FastifyInstance
  instances: IocContainer
  close: () => Promise<void>
}

// Construit le container et configure Fastify sans `listen` : les tests
// passent par `app.inject`. La config lit `.env.test` via `with:dotenv`.
export const buildTestApp = async (): Promise<TestApp> => {
  const config = loadConfig()
  const container = startIocContainer(config)
  const { httpServer } = container.instances
  await httpServer.configure()
  return {
    app: httpServer.instance,
    instances: container.instances,
    close: () => httpServer.stop(),
  }
}
```

- [ ] **Step 4: Client de base de test et purge**

`back/src/test/e2e/setup/db.ts` :

```ts
import { PrismaPg } from '@prisma/adapter-pg'

import { PrismaClient } from '../../../generated/client'

// Client brut, sans extension : réservé à la préparation et au nettoyage.
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
export const testDb = new PrismaClient({ adapter })

// Vide toutes les tables du schéma public sauf l'historique des migrations.
export const truncateAll = async (): Promise<void> => {
  const tables = await testDb.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
  `
  if (tables.length === 0) {
    return
  }
  const list = tables.map((t) => `"public"."${t.tablename}"`).join(', ')
  await testDb.$executeRawUnsafe(`TRUNCATE TABLE ${list} CASCADE`)
}
```

- [ ] **Step 5: Smoke test**

`back/src/test/e2e/health.test.ts` :

```ts
import { buildTestApp, type TestApp } from './setup/app'
import { testDb, truncateAll } from './setup/db'

describe('GET /health', () => {
  let testApp: TestApp

  beforeAll(async () => {
    await truncateAll()
    testApp = await buildTestApp()
  })

  afterAll(async () => {
    await testApp.close()
    await testDb.$disconnect()
  })

  it('repond 200 sans session', async () => {
    const res = await testApp.app.inject({ method: 'GET', url: '/health' })
    expect(res.statusCode).toBe(200)
  })
})
```

- [ ] **Step 6: Câblage npm et hook**

Dans `back/package.json`, bloc `wireit` :

```json
"test:e2e": {
  "command": "npm run with:dotenv -- -e .env.test jest --runInBand -c src/test/jest.config.ts --selectProjects e2e",
  "files": ["src/main/**", "src/test/e2e/**", "src/test/*", ".env.test"],
  "output": ["dist/test/e2e-tests-report.html"],
  "dependencies": ["prisma:generate", "prisma:migrate:deploy:test"],
  "env": { "CI": { "external": true }, "NODE_OPTIONS": "--experimental-vm-modules" }
},
"test": {
  "command": "npm run with:dotenv -- -e .env.test jest --runInBand -c src/test/jest.config.ts",
  "files": ["src/main/**", "src/test/**", ".env.test"],
  "output": ["dist/test/**"],
  "dependencies": ["prisma:generate", "prisma:migrate:deploy:test"],
  "env": { "CI": { "external": true }, "NODE_OPTIONS": "--experimental-vm-modules" }
}
```

`prisma:migrate:deploy:test` existe déjà dans `scripts` ; l'ajouter au bloc `wireit` s'il n'y est pas :

```json
"prisma:migrate:deploy:test": {
  "command": "npm run with:dotenv -- -e .env.test prisma migrate deploy",
  "files": ["prisma/migrations/**", ".env.test"],
  "output": []
}
```

et remplacer la valeur de `scripts["prisma:migrate:deploy:test"]` par `"wireit"`.

`back/.husky/pre-commit` : remplacer `npm test` par `npm run test:unit` (les e2e exigent Postgres ; ils restent dans `npm test`, `validate` et la CI).

- [ ] **Step 7: Lancer**

Run: `cd back && npm run test:e2e`
Expected: `health.test.ts` PASS (la base de test reçoit toutes les migrations existantes au passage).

Run: `cd back && npm run test:unit`
Expected: PASS (2 suites existantes).

- [ ] **Step 8: Commit**

```bash
git add back/.env.test back/.env.test.example back/src/test back/src/main/interfaces/http/fastify/fastify-http-server.ts back/src/main/types/interfaces/http/server.ts back/package.json back/.husky/pre-commit
git commit -m "test(back): harnais e2e sur base de test dediee

Claude-Session: https://claude.ai/code/session_01G1JrhGqWHmVH6XB2XTTwJe"
```

---

### Task 2: Matrice des permissions (back et front)

**Files:**
- Create: `back/src/main/utils/permissions.ts`
- Create: `front/src/utils/permissions.ts` (copie identique)
- Test: `back/src/test/unit/utils/permissions.test.ts`

**Interfaces:**
- Produces: types `ServiceRole`, `EstablishmentRole`, `ServicePermission`, `EstablishmentPermission`, `Permission` ; `SERVICE_PERMISSIONS: Record<ServiceRole, readonly ServicePermission[]>` ; `ESTABLISHMENT_PERMISSIONS: Record<EstablishmentRole, readonly EstablishmentPermission[]>` ; `isServicePermission(p): p is ServicePermission` ; `hasPermission(roles: { serviceRole: ServiceRole | null; establishmentRole: EstablishmentRole | null }, permission: Permission): boolean`.

- [ ] **Step 1: Test unitaire**

`back/src/test/unit/utils/permissions.test.ts` :

```ts
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import {
  ESTABLISHMENT_PERMISSIONS,
  hasPermission,
  SERVICE_PERMISSIONS,
} from '../../../main/utils/permissions'

describe('permissions', () => {
  it('donne toutes les permissions de service au coordinateur', () => {
    expect(SERVICE_PERMISSIONS.COORDINATEUR).toEqual(
      expect.arrayContaining([
        'planning:read', 'planning:write', 'referentials:read', 'referentials:write',
        'patient:read', 'patient:write', 'clinical:read', 'clinical:write',
        'appointment:write', 'pdf:export', 'todo:own', 'members:read',
      ]),
    )
  })

  it('refuse le contenu clinique au secretariat et a la lecture', () => {
    expect(SERVICE_PERMISSIONS.SECRETARIAT).not.toContain('clinical:read')
    expect(SERVICE_PERMISSIONS.LECTURE).not.toContain('clinical:read')
    expect(SERVICE_PERMISSIONS.LECTURE).not.toContain('patient:write')
  })

  it('accorde les lectures a tous les roles', () => {
    for (const role of ['COORDINATEUR', 'INTERVENANT', 'SECRETARIAT', 'LECTURE'] as const) {
      expect(SERVICE_PERMISSIONS[role]).toContain('planning:read')
      expect(SERVICE_PERMISSIONS[role]).toContain('referentials:read')
      expect(SERVICE_PERMISSIONS[role]).toContain('patient:read')
      expect(SERVICE_PERMISSIONS[role]).toContain('todo:own')
      expect(SERVICE_PERMISSIONS[role]).toContain('members:read')
    }
  })

  it('reserve la gestion des membres a l administrateur d etablissement', () => {
    expect(ESTABLISHMENT_PERMISSIONS.ADMIN).toContain('members:manage')
    expect(ESTABLISHMENT_PERMISSIONS.MEMBER).toHaveLength(0)
  })

  it('hasPermission route vers le bon niveau', () => {
    const roles = { serviceRole: 'SECRETARIAT', establishmentRole: 'ADMIN' } as const
    expect(hasPermission(roles, 'appointment:write')).toBe(true)
    expect(hasPermission(roles, 'clinical:write')).toBe(false)
    expect(hasPermission(roles, 'members:manage')).toBe(true)
    expect(hasPermission({ serviceRole: null, establishmentRole: 'MEMBER' }, 'patient:read')).toBe(false)
  })

  it('est identique a la copie du front', () => {
    const back = readFileSync(join(__dirname, '../../../main/utils/permissions.ts'), 'utf8')
    const front = readFileSync(join(__dirname, '../../../../../front/src/utils/permissions.ts'), 'utf8')
    expect(front).toBe(back)
  })
})
```

- [ ] **Step 2: Vérifier l'échec**

Run: `cd back && npx jest -c src/test/jest.config.ts src/test/unit/utils/permissions.test.ts`
Expected: FAIL, module introuvable.

- [ ] **Step 3: Implémentation**

`back/src/main/utils/permissions.ts` (fichier sans import, pour rester copiable tel quel côté front) :

```ts
// Matrice des habilitations. Référence : docs/multi-tenant/habilitations.md.
// Ce fichier est dupliqué à l'identique dans front/src/utils/permissions.ts ;
// un test unitaire back vérifie l'égalité des deux copies.

export type ServiceRole = 'COORDINATEUR' | 'INTERVENANT' | 'SECRETARIAT' | 'LECTURE'
export type EstablishmentRole = 'ADMIN' | 'MEMBER'

export type ServicePermission =
  | 'planning:read'
  | 'planning:write'
  | 'referentials:read'
  | 'referentials:write'
  | 'patient:read'
  | 'patient:write'
  | 'clinical:read'
  | 'clinical:write'
  | 'appointment:write'
  | 'pdf:export'
  | 'todo:own'
  | 'members:read'

export type EstablishmentPermission =
  | 'services:manage'
  | 'locations:manage'
  | 'soignants:manage'
  | 'members:manage'
  | 'activity-log:read'
  | 'access-log:read'

export type Permission = ServicePermission | EstablishmentPermission

const READ_ALL: readonly ServicePermission[] = [
  'planning:read',
  'referentials:read',
  'patient:read',
  'todo:own',
  'members:read',
]

export const SERVICE_PERMISSIONS: Record<ServiceRole, readonly ServicePermission[]> = {
  COORDINATEUR: [
    ...READ_ALL,
    'planning:write',
    'referentials:write',
    'patient:write',
    'clinical:read',
    'clinical:write',
    'appointment:write',
    'pdf:export',
  ],
  INTERVENANT: [
    ...READ_ALL,
    'patient:write',
    'clinical:read',
    'clinical:write',
    'appointment:write',
    'pdf:export',
  ],
  SECRETARIAT: [...READ_ALL, 'patient:write', 'appointment:write', 'pdf:export'],
  LECTURE: [...READ_ALL],
}

export const ESTABLISHMENT_PERMISSIONS: Record<EstablishmentRole, readonly EstablishmentPermission[]> = {
  ADMIN: [
    'services:manage',
    'locations:manage',
    'soignants:manage',
    'members:manage',
    'activity-log:read',
    'access-log:read',
  ],
  MEMBER: [],
}

const SERVICE_PERMISSION_SET: ReadonlySet<string> = new Set(
  Object.values(SERVICE_PERMISSIONS).flat(),
)

export const isServicePermission = (permission: Permission): permission is ServicePermission =>
  SERVICE_PERMISSION_SET.has(permission)

export type RoleSet = {
  serviceRole: ServiceRole | null
  establishmentRole: EstablishmentRole | null
}

export const hasPermission = (roles: RoleSet, permission: Permission): boolean => {
  if (isServicePermission(permission)) {
    return roles.serviceRole !== null && SERVICE_PERMISSIONS[roles.serviceRole].includes(permission)
  }
  return (
    roles.establishmentRole !== null &&
    ESTABLISHMENT_PERMISSIONS[roles.establishmentRole].includes(permission)
  )
}
```

Copier : `cp back/src/main/utils/permissions.ts front/src/utils/permissions.ts`.

- [ ] **Step 4: Vérifier**

Run: `cd back && npx jest -c src/test/jest.config.ts src/test/unit/utils/permissions.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add back/src/main/utils/permissions.ts front/src/utils/permissions.ts back/src/test/unit/utils/permissions.test.ts
git commit -m "feat(auth): matrice statique des permissions par role

Claude-Session: https://claude.ai/code/session_01G1JrhGqWHmVH6XB2XTTwJe"
```

---

### Task 3: TenantContext (AsyncLocalStorage)

**Files:**
- Create: `back/src/main/types/utils/tenant-context.ts`
- Create: `back/src/main/utils/tenant-errors.ts`
- Create: `back/src/main/utils/tenant-context.ts`
- Modify: `back/src/main/types/application/ioc.ts` (ajout `tenantContext`)
- Modify: `back/src/main/application/ioc/awilix/awilix-ioc-container.ts` (enregistrement, juste après le logger)
- Test: `back/src/test/unit/utils/tenant-context.test.ts`

**Interfaces:**
- Produces:

```ts
type Tenant = {
  userId: string
  establishmentId: string
  establishmentRole: EstablishmentRole
  serviceId: string | null
  serviceRole: ServiceRole | null
  soignantId: string | null
}
type ServiceTenant = Tenant & { serviceId: string; serviceRole: ServiceRole }
type TenantStore = { kind: 'tenant'; tenant: Tenant } | { kind: 'system' }
interface TenantContextInterface {
  enter(tenant: Tenant): void            // à appeler dans un hook onRequest
  peek(): TenantStore | undefined
  current(): Tenant                      // lève TenantContextMissingError
  currentService(): ServiceTenant        // lève si serviceId nul
  scope(): { serviceId: string; establishmentId: string }
  establishmentScope(): { establishmentId: string }
  runAsSystem<T>(fn: () => Promise<T>): Promise<T>
}
```

- [ ] **Step 1: Test**

`back/src/test/unit/utils/tenant-context.test.ts` :

```ts
import { TenantContext } from '../../../main/utils/tenant-context'
import {
  TenantContextMissingError,
} from '../../../main/utils/tenant-errors'
import type { Tenant } from '../../../main/types/utils/tenant-context'

const tenant: Tenant = {
  userId: 'u1',
  establishmentId: 'e1',
  establishmentRole: 'MEMBER',
  serviceId: 's1',
  serviceRole: 'INTERVENANT',
  soignantId: null,
}

describe('TenantContext', () => {
  it('leve sans contexte', () => {
    const ctx = new TenantContext()
    expect(() => ctx.current()).toThrow(TenantContextMissingError)
    expect(ctx.peek()).toBeUndefined()
  })

  it('restitue le tenant pose dans le meme flux asynchrone', async () => {
    const ctx = new TenantContext()
    await ctx.run(tenant, async () => {
      await Promise.resolve()
      expect(ctx.current().serviceId).toBe('s1')
      expect(ctx.scope()).toEqual({ serviceId: 's1', establishmentId: 'e1' })
    })
  })

  it('currentService leve quand le service est nul', async () => {
    const ctx = new TenantContext()
    await ctx.run({ ...tenant, serviceId: null, serviceRole: null }, async () => {
      await Promise.resolve()
      expect(() => ctx.currentService()).toThrow(TenantContextMissingError)
      expect(ctx.establishmentScope()).toEqual({ establishmentId: 'e1' })
    })
  })

  it('runAsSystem pose le marqueur systeme', async () => {
    const ctx = new TenantContext()
    await ctx.runAsSystem(async () => {
      await Promise.resolve()
      expect(ctx.peek()).toEqual({ kind: 'system' })
      expect(() => ctx.current()).toThrow(TenantContextMissingError)
    })
    expect(ctx.peek()).toBeUndefined()
  })

  it('isole deux flux concurrents', async () => {
    const ctx = new TenantContext()
    const a = ctx.run({ ...tenant, serviceId: 'a' }, async () => {
      await new Promise((r) => setTimeout(r, 5))
      return ctx.current().serviceId
    })
    const b = ctx.run({ ...tenant, serviceId: 'b' }, async () => {
      await Promise.resolve()
      return ctx.current().serviceId
    })
    expect(await Promise.all([a, b])).toEqual(['a', 'b'])
  })
})
```

- [ ] **Step 2: Vérifier l'échec**

Run: `cd back && npx jest -c src/test/jest.config.ts src/test/unit/utils/tenant-context.test.ts`
Expected: FAIL, modules introuvables.

- [ ] **Step 3: Types et erreurs**

`back/src/main/types/utils/tenant-context.ts` :

```ts
import type { EstablishmentRole, ServiceRole } from '../../../generated/enums'

export type Tenant = {
  userId: string
  establishmentId: string
  establishmentRole: EstablishmentRole
  serviceId: string | null
  serviceRole: ServiceRole | null
  soignantId: string | null
}

export type ServiceTenant = Tenant & { serviceId: string; serviceRole: ServiceRole }

export type TenantStore = { kind: 'tenant'; tenant: Tenant } | { kind: 'system' }

export interface TenantContextInterface {
  enter(tenant: Tenant): void
  run<T>(tenant: Tenant, fn: () => Promise<T>): Promise<T>
  peek(): TenantStore | undefined
  current(): Tenant
  currentService(): ServiceTenant
  scope(): { serviceId: string; establishmentId: string }
  establishmentScope(): { establishmentId: string }
  runAsSystem<T>(fn: () => Promise<T>): Promise<T>
}
```

`back/src/main/utils/tenant-errors.ts` :

```ts
// Aucun tenant posé alors qu'une opération en exige un.
class TenantContextMissingError extends Error {
  constructor(detail: string) {
    super(`Tenant context missing: ${detail}`)
    this.name = 'TenantContextMissingError'
  }
}

// Une requête Prisma sur un modèle de tenant ne porte pas le filtre attendu.
class TenantScopeMissingError extends Error {
  readonly model: string
  readonly operation: string
  readonly field: string

  constructor(model: string, operation: string, field: string) {
    super(`Tenant scope missing: ${model}.${operation} without ${field}`)
    this.name = 'TenantScopeMissingError'
    this.model = model
    this.operation = operation
    this.field = field
  }
}

export { TenantContextMissingError, TenantScopeMissingError }
```

- [ ] **Step 4: Implémentation**

`back/src/main/utils/tenant-context.ts` :

```ts
import { AsyncLocalStorage } from 'node:async_hooks'

import type {
  ServiceTenant,
  Tenant,
  TenantContextInterface,
  TenantStore,
} from '../types/utils/tenant-context'
import { TenantContextMissingError } from './tenant-errors'

// Porte le tenant de la requête courante. `enter` est appelé par le hook
// onRequest du plugin tenant (même mécanisme que @fastify/request-context) ;
// `run` sert aux tests et aux traitements encadrés ; `runAsSystem` aux
// tâches hors requête (purge planifiée).
class TenantContext implements TenantContextInterface {
  private readonly storage = new AsyncLocalStorage<TenantStore>()

  enter(tenant: Tenant): void {
    this.storage.enterWith({ kind: 'tenant', tenant })
  }

  run<T>(tenant: Tenant, fn: () => Promise<T>): Promise<T> {
    return this.storage.run({ kind: 'tenant', tenant }, fn)
  }

  peek(): TenantStore | undefined {
    return this.storage.getStore()
  }

  current(): Tenant {
    const store = this.storage.getStore()
    if (!store || store.kind !== 'tenant') {
      throw new TenantContextMissingError('no tenant in the current request')
    }
    return store.tenant
  }

  currentService(): ServiceTenant {
    const tenant = this.current()
    if (tenant.serviceId === null || tenant.serviceRole === null) {
      throw new TenantContextMissingError('no service in the current tenant')
    }
    return { ...tenant, serviceId: tenant.serviceId, serviceRole: tenant.serviceRole }
  }

  scope(): { serviceId: string; establishmentId: string } {
    const { serviceId, establishmentId } = this.currentService()
    return { serviceId, establishmentId }
  }

  establishmentScope(): { establishmentId: string } {
    return { establishmentId: this.current().establishmentId }
  }

  runAsSystem<T>(fn: () => Promise<T>): Promise<T> {
    return this.storage.run({ kind: 'system' }, fn)
  }
}

export { TenantContext }
```

- [ ] **Step 5: Enregistrement Awilix**

`types/application/ioc.ts` : ajouter `import type { TenantContextInterface } from '../utils/tenant-context'` et, sous `errorHandler`, `readonly tenantContext: TenantContextInterface`.

`awilix-ioc-container.ts` : importer `TenantContext`, ajouter dans le constructeur juste après `this.#registerLogger()` :

```ts
    // Tenant context (avant l'ORM : le garde-fou Prisma en dépend)
    this.register('tenantContext', asClass(TenantContext).singleton())
```

- [ ] **Step 6: Vérifier**

Run: `cd back && npx jest -c src/test/jest.config.ts src/test/unit/utils/tenant-context.test.ts && npm run lint`
Expected: PASS (5 tests), lint OK.

- [ ] **Step 7: Commit**

```bash
git add back/src/main/utils/tenant-context.ts back/src/main/utils/tenant-errors.ts back/src/main/types/utils/tenant-context.ts back/src/main/types/application/ioc.ts back/src/main/application/ioc/awilix/awilix-ioc-container.ts back/src/test/unit/utils/tenant-context.test.ts
git commit -m "feat(tenant): contexte de tenant par AsyncLocalStorage

Claude-Session: https://claude.ai/code/session_01G1JrhGqWHmVH6XB2XTTwJe"
```

---

### Task 4: Garde-fou Prisma

**Files:**
- Create: `back/src/main/infra/orm/tenant-guard.ts`
- Modify: `back/src/main/infra/orm/postgres-client.ts:1-50`
- Test: `back/src/test/unit/infra/tenant-guard.test.ts`

**Interfaces:**
- Consumes: `TenantContextInterface.peek()`, `TenantScopeMissingError`.
- Produces: `SERVICE_MODELS`, `ESTABLISHMENT_MODELS` (`readonly string[]`), `assertTenantScope(input: { model: string; operation: string; args: Record<string, unknown> }, store: TenantStore | undefined): void`, `buildTenantGuardExtension(tenantContext: TenantContextInterface)`.
- `PostgresOrm` reçoit désormais `{ logger, tenantContext }` du container.

- [ ] **Step 1: Test**

`back/src/test/unit/infra/tenant-guard.test.ts` :

```ts
import { assertTenantScope } from '../../../main/infra/orm/tenant-guard'
import type { TenantStore } from '../../../main/types/utils/tenant-context'
import { TenantScopeMissingError } from '../../../main/utils/tenant-errors'

const store: TenantStore = {
  kind: 'tenant',
  tenant: {
    userId: 'u1',
    establishmentId: 'e1',
    establishmentRole: 'MEMBER',
    serviceId: 's1',
    serviceRole: 'INTERVENANT',
    soignantId: null,
  },
}
const adminStore: TenantStore = {
  kind: 'tenant',
  tenant: { ...store.tenant, serviceId: null, serviceRole: null, establishmentRole: 'ADMIN' },
}

describe('assertTenantScope', () => {
  it('laisse passer un modele global sans filtre', () => {
    expect(() =>
      assertTenantScope({ model: 'User', operation: 'findMany', args: {} }, store),
    ).not.toThrow()
  })

  it('exige serviceId en lecture sur un modele de service', () => {
    expect(() =>
      assertTenantScope({ model: 'Slot', operation: 'findMany', args: { where: {} } }, store),
    ).toThrow(TenantScopeMissingError)
    expect(() =>
      assertTenantScope(
        { model: 'Slot', operation: 'findMany', args: { where: { serviceId: 's1' } } },
        store,
      ),
    ).not.toThrow()
  })

  it('accepte la cle composite id_serviceId', () => {
    expect(() =>
      assertTenantScope(
        {
          model: 'Slot',
          operation: 'findUnique',
          args: { where: { id_serviceId: { id: 'x', serviceId: 's1' } } },
        },
        store,
      ),
    ).not.toThrow()
  })

  it('refuse un serviceId different du tenant', () => {
    expect(() =>
      assertTenantScope(
        { model: 'Slot', operation: 'findMany', args: { where: { serviceId: 'autre' } } },
        store,
      ),
    ).toThrow(TenantScopeMissingError)
  })

  it('exige les deux colonnes a la creation, y compris imbriquee', () => {
    const okData = {
      startDate: new Date(),
      serviceId: 's1',
      establishmentId: 'e1',
      appointmentPatients: { create: [{ patientId: 'p', serviceId: 's1', establishmentId: 'e1' }] },
    }
    expect(() =>
      assertTenantScope({ model: 'Appointment', operation: 'create', args: { data: okData } }, store),
    ).not.toThrow()
    const badNested = {
      ...okData,
      appointmentPatients: { create: [{ patientId: 'p' }] },
    }
    expect(() =>
      assertTenantScope({ model: 'Appointment', operation: 'create', args: { data: badNested } }, store),
    ).toThrow(TenantScopeMissingError)
    expect(() =>
      assertTenantScope(
        { model: 'Todo', operation: 'createMany', args: { data: [{ title: 't', serviceId: 's1' }] } },
        store,
      ),
    ).toThrow(TenantScopeMissingError)
  })

  it('exige establishmentId sur un modele d etablissement', () => {
    expect(() =>
      assertTenantScope({ model: 'Patient', operation: 'findMany', args: { where: {} } }, store),
    ).toThrow(TenantScopeMissingError)
    expect(() =>
      assertTenantScope(
        { model: 'Patient', operation: 'findMany', args: { where: { establishmentId: 'e1' } } },
        store,
      ),
    ).not.toThrow()
  })

  it('refuse un modele de service sous un tenant sans service', () => {
    expect(() =>
      assertTenantScope(
        { model: 'Slot', operation: 'findMany', args: { where: { serviceId: 's1' } } },
        adminStore,
      ),
    ).toThrow(TenantScopeMissingError)
  })

  it('refuse toute operation sans contexte, sauf sur un modele global', () => {
    expect(() =>
      assertTenantScope({ model: 'Slot', operation: 'findMany', args: { where: { serviceId: 's1' } } }, undefined),
    ).toThrow(TenantScopeMissingError)
    expect(() =>
      assertTenantScope({ model: 'User', operation: 'findUnique', args: { where: { id: 'u' } } }, undefined),
    ).not.toThrow()
  })

  it('laisse tout passer sous le marqueur systeme', () => {
    expect(() =>
      assertTenantScope({ model: 'ActivityLog', operation: 'deleteMany', args: { where: {} } }, { kind: 'system' }),
    ).not.toThrow()
  })
})
```

- [ ] **Step 2: Vérifier l'échec**

Run: `cd back && npx jest -c src/test/jest.config.ts src/test/unit/infra/tenant-guard.test.ts`
Expected: FAIL, module introuvable.

- [ ] **Step 3: Implémentation**

`back/src/main/infra/orm/tenant-guard.ts` :

```ts
import { Prisma } from '../../../generated/client'
import type {
  TenantContextInterface,
  TenantStore,
} from '../../types/utils/tenant-context'
import { TenantScopeMissingError } from '../../utils/tenant-errors'

// Modèles rattachés à un service : portent serviceId ET establishmentId.
export const SERVICE_MODELS: readonly string[] = [
  'PathwayTemplate',
  'SlotTemplate',
  'Pathway',
  'Slot',
  'Appointment',
  'AppointmentPatient',
  'Thematic',
  'DiagnosticEducatifTemplate',
  'DiagnosticEducatif',
  'EnrollmentIssue',
  'PatientPathwayPriority',
  'ForbiddenWeek',
  'PlanningCycle',
  'Todo',
  'SlotTemplateSoignant',
  'SoignantThematic',
]

// Modèles rattachés à un établissement : portent establishmentId.
export const ESTABLISHMENT_MODELS: readonly string[] = [
  'Patient',
  'Soignant',
  'Location',
  'Service',
  'EstablishmentMembership',
  'ServiceMembership',
  'ActivityLog',
]

// Relations dont les créations imbriquées sont vérifiées (parent → champ → enfant).
const NESTED_RELATIONS: Record<string, Record<string, string>> = {
  Appointment: { appointmentPatients: 'AppointmentPatient' },
  Slot: { appointments: 'Appointment' },
  Pathway: { slots: 'Slot' },
  PathwayTemplate: { slotTemplates: 'SlotTemplate' },
  SlotTemplate: { soignantLinks: 'SlotTemplateSoignant', slot: 'Slot' },
  Thematic: { soignantLinks: 'SoignantThematic' },
  Soignant: { slotTemplateLinks: 'SlotTemplateSoignant', thematicLinks: 'SoignantThematic' },
  EstablishmentMembership: { serviceMemberships: 'ServiceMembership' },
  Patient: { appointmentPatients: 'AppointmentPatient', diagnostics: 'DiagnosticEducatif' },
}

const READ_OPERATIONS = new Set([
  'findMany', 'findFirst', 'findFirstOrThrow', 'findUnique', 'findUniqueOrThrow',
  'update', 'updateMany', 'delete', 'deleteMany', 'upsert', 'count', 'aggregate', 'groupBy',
])
const WRITE_OPERATIONS = new Set(['create', 'createMany', 'upsert'])

type Family = 'service' | 'establishment' | 'global'

const familyOf = (model: string): Family => {
  if (SERVICE_MODELS.includes(model)) {
    return 'service'
  }
  if (ESTABLISHMENT_MODELS.includes(model)) {
    return 'establishment'
  }
  return 'global'
}

type Dict = Record<string, unknown>
const isDict = (value: unknown): value is Dict =>
  typeof value === 'object' && value !== null && !Array.isArray(value) && !(value instanceof Date)

// Lit `field` au premier niveau du where, ou dans une clé composite `id_<field>`.
const whereValue = (where: unknown, field: string): unknown => {
  if (!isDict(where)) {
    return undefined
  }
  if (field in where) {
    return where[field]
  }
  const composite = where[`id_${field}`]
  return isDict(composite) ? composite[field] : undefined
}

const expectedValue = (store: TenantStore, field: string, model: string, operation: string): string => {
  if (store.kind !== 'tenant') {
    throw new TenantScopeMissingError(model, operation, field)
  }
  const value = field === 'serviceId' ? store.tenant.serviceId : store.tenant.establishmentId
  if (value === null) {
    throw new TenantScopeMissingError(model, operation, field)
  }
  return value
}

const assertWhere = (model: string, operation: string, args: Dict, field: string, store: TenantStore): void => {
  const expected = expectedValue(store, field, model, operation)
  if (whereValue(args.where, field) !== expected) {
    throw new TenantScopeMissingError(model, operation, field)
  }
}

const assertData = (model: string, operation: string, data: unknown, store: TenantStore): void => {
  const rows = Array.isArray(data) ? data : [data]
  for (const row of rows) {
    if (!isDict(row)) {
      throw new TenantScopeMissingError(model, operation, 'data')
    }
    const family = familyOf(model)
    if (family === 'service' && row.serviceId !== expectedValue(store, 'serviceId', model, operation)) {
      throw new TenantScopeMissingError(model, operation, 'serviceId')
    }
    if (family !== 'global' && row.establishmentId !== expectedValue(store, 'establishmentId', model, operation)) {
      throw new TenantScopeMissingError(model, operation, 'establishmentId')
    }
    const relations = NESTED_RELATIONS[model] ?? {}
    for (const [relationField, childModel] of Object.entries(relations)) {
      const relation = row[relationField]
      if (!isDict(relation)) {
        continue
      }
      if ('create' in relation) {
        assertData(childModel, `${operation}>${relationField}.create`, relation.create, store)
      }
      if (isDict(relation.createMany) && 'data' in relation.createMany) {
        assertData(childModel, `${operation}>${relationField}.createMany`, relation.createMany.data, store)
      }
    }
  }
}

// Vérifie qu'une opération Prisma porte le filtre de tenant attendu.
// Pure : testable sans client Prisma.
export const assertTenantScope = (
  input: { model: string; operation: string; args: Dict },
  store: TenantStore | undefined,
): void => {
  const { model, operation, args } = input
  const family = familyOf(model)
  if (family === 'global') {
    return
  }
  if (!store) {
    throw new TenantScopeMissingError(model, operation, 'context')
  }
  if (store.kind === 'system') {
    return
  }
  const field = family === 'service' ? 'serviceId' : 'establishmentId'
  if (READ_OPERATIONS.has(operation)) {
    assertWhere(model, operation, args, field, store)
  }
  if (WRITE_OPERATIONS.has(operation)) {
    const data = operation === 'upsert' ? args.create : args.data
    assertData(model, operation, data, store)
  }
}

export const buildTenantGuardExtension = (tenantContext: TenantContextInterface) =>
  Prisma.defineExtension({
    name: 'tenantGuard',
    query: {
      $allModels: {
        $allOperations({ model, operation, args, query }) {
          assertTenantScope(
            { model, operation, args: args as Dict },
            tenantContext.peek(),
          )
          return query(args)
        },
      },
    },
  })
```

- [ ] **Step 4: Brancher dans le client Prisma**

`postgres-client.ts` : remplacer `getExtendedClient` et le constructeur.

```ts
import { buildTenantGuardExtension } from './tenant-guard'
import type { TenantContextInterface } from '../../types/utils/tenant-context'

function getExtendedClient(tenantContext: TenantContextInterface) {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
  return new PrismaClient({ adapter })
    .$extends(normalizerExtension)
    .$extends(buildTenantGuardExtension(tenantContext))
}

export type PostgresPrismaClient = ReturnType<typeof getExtendedClient>

class PostgresOrm implements PostgresORMInterface {
  private readonly logger: Logger
  readonly prisma: PostgresPrismaClient

  constructor({ logger, tenantContext }: IocContainer) {
    this.logger = logger
    this.prisma = getExtendedClient(tenantContext)
  }
  // ... reste inchangé
}
```

Vérifier que `PrimaTransactionClient` (`types/infra/orm/client`) reste dérivé de `PostgresPrismaClient` ; sinon l'aligner sur `Parameters<Parameters<PostgresPrismaClient['$transaction']>[0]>[0]`.

- [ ] **Step 5: Vérifier**

Run: `cd back && npx jest -c src/test/jest.config.ts src/test/unit/infra/tenant-guard.test.ts && npm run lint`
Expected: PASS (9 tests), lint OK. `npm run build` passe encore (le schéma n'a pas changé ; les modèles listés n'existent pas encore mais ce ne sont que des chaînes).

- [ ] **Step 6: Commit**

```bash
git add back/src/main/infra/orm/tenant-guard.ts back/src/main/infra/orm/postgres-client.ts back/src/test/unit/infra/tenant-guard.test.ts
git commit -m "feat(orm): garde-fou Prisma exigeant le filtre de tenant

Claude-Session: https://claude.ai/code/session_01G1JrhGqWHmVH6XB2XTTwJe"
```

---

### Task 5: Schéma Prisma et migration `multi_tenant_socle`

**Files:**
- Modify: `back/prisma/schema.prisma`
- Create: `back/prisma/migrations/<timestamp>_multi_tenant_socle/migration.sql`
- Create: `back/prisma/checks/multi-tenant-socle.sql`

**Interfaces:**
- Produces : les modèles et enums Prisma de la spec §2 ; les compound uniques Prisma nommés `id_serviceId` et `id_establishmentId` (utilisés par tous les repositories) ; les tables `SlotTemplateSoignant` et `SoignantThematic` avec relations `soignantLinks` / `slotTemplateLinks` / `thematicLinks`.

> À partir de cette tâche et jusqu'à la tâche 15, `npm run build` échoue (le code référence `Role`, `soignants`, etc.). Ne pas tenter de le corriger ici.

- [ ] **Step 1: Enums et nouveaux modèles**

Dans `schema.prisma`, remplacer `enum Role { NONE USER ADMIN }` par :

```prisma
enum EstablishmentRole {
  ADMIN
  MEMBER
}

enum ServiceRole {
  COORDINATEUR
  INTERVENANT
  SECRETARIAT
  LECTURE
}
```

Ajouter les modèles :

```prisma
model Establishment {
  id            String    @id @default(cuid())
  name          String
  createdAt     DateTime  @default(now())
  deactivatedAt DateTime?

  services              Service[]
  memberships           EstablishmentMembership[]
  patients              Patient[]
  soignants             Soignant[]
  locations             Location[]
}

model Service {
  id              String    @id @default(cuid())
  establishmentId String
  name            String
  createdAt       DateTime  @default(now())
  deactivatedAt   DateTime?

  establishment Establishment       @relation(fields: [establishmentId], references: [id])
  memberships   ServiceMembership[]

  @@unique([establishmentId, name])
  @@unique([id, establishmentId])
}

model EstablishmentMembership {
  id              String            @id @default(cuid())
  userId          String
  establishmentId String
  role            EstablishmentRole @default(MEMBER)
  soignantId      String?
  createdAt       DateTime          @default(now())

  user               User                @relation(fields: [userId], references: [id], onDelete: Cascade)
  establishment      Establishment       @relation(fields: [establishmentId], references: [id])
  // Référence simple (composite impossible : soignantId nullable, establishmentId requis).
  // La cohérence d'établissement est vérifiée par MembershipDomain.
  soignant           Soignant?           @relation(fields: [soignantId], references: [id], onDelete: SetNull)
  serviceMemberships ServiceMembership[]

  @@unique([userId, establishmentId])
  @@unique([id, establishmentId])
  @@index([establishmentId])
  @@index([soignantId])
}

model ServiceMembership {
  id                        String      @id @default(cuid())
  establishmentMembershipId String
  serviceId                 String
  establishmentId           String
  role                      ServiceRole
  createdAt                 DateTime    @default(now())

  establishmentMembership EstablishmentMembership @relation(fields: [establishmentMembershipId], references: [id], onDelete: Cascade)
  service                 Service                 @relation(fields: [serviceId, establishmentId], references: [id, establishmentId])

  @@unique([establishmentMembershipId, serviceId])
  @@index([serviceId])
}

model SlotTemplateSoignant {
  slotTemplateId  String
  soignantId      String
  serviceId       String
  establishmentId String

  slotTemplate SlotTemplate @relation(fields: [slotTemplateId, serviceId], references: [id, serviceId], onDelete: Cascade)
  soignant     Soignant     @relation(fields: [soignantId, establishmentId], references: [id, establishmentId], onDelete: Cascade)

  @@id([slotTemplateId, soignantId])
  @@index([soignantId])
  @@index([serviceId])
}

model SoignantThematic {
  soignantId      String
  thematicId      String
  serviceId       String
  establishmentId String

  soignant Soignant @relation(fields: [soignantId, establishmentId], references: [id, establishmentId], onDelete: Cascade)
  thematic Thematic @relation(fields: [thematicId, serviceId], references: [id, serviceId], onDelete: Cascade)

  @@id([soignantId, thematicId])
  @@index([thematicId])
  @@index([serviceId])
}
```

- [ ] **Step 2: Modèles modifiés**

Appliquer exactement :

```prisma
model User {
  id            String    @id @default(cuid())
  email         String    @unique
  password      String
  salt          String
  firstName     String?
  lastName      String?
  isSuperAdmin  Boolean   @default(false)
  deactivatedAt DateTime?

  establishmentMemberships EstablishmentMembership[]
}

model PathwayTemplate {
  id                   String   @id @default(cuid())
  establishmentId      String
  serviceId            String
  name                 String
  color                String
  mainTag              String
  secondaryTags        String[]
  displayOrder         Int      @default(0)
  motifRequired        Boolean  @default(false)
  firstAppointmentOnly Boolean  @default(false)

  pathways      Pathway[]
  slotTemplates SlotTemplate[]

  @@unique([id, serviceId])
  @@index([serviceId])
}

model Pathway {
  id              String   @id @default(cuid())
  establishmentId String
  serviceId       String
  startDate       DateTime @db.Date
  templateID      String?

  // Référence simple (templateID nullable) : cohérence vérifiée par PathwayDomain.
  template          PathwayTemplate?         @relation(fields: [templateID], references: [id])
  slots             Slot[]
  patientPriorities PatientPathwayPriority[]

  @@unique([id, serviceId])
  @@index([startDate])
  @@index([templateID])
  @@index([serviceId])
}

model PatientPathwayPriority {
  patientID       String
  pathwayID       String
  establishmentId String
  serviceId       String
  priority        Int

  patient Patient @relation(fields: [patientID, establishmentId], references: [id, establishmentId], onDelete: Cascade)
  pathway Pathway @relation(fields: [pathwayID, serviceId], references: [id, serviceId], onDelete: Cascade)

  @@id([patientID, pathwayID])
  @@index([patientID, priority])
  @@index([serviceId])
}

model Appointment {
  id                  String               @id @default(cuid())
  establishmentId     String
  serviceId           String
  startDate           DateTime
  endDate             DateTime
  thematicId          String?
  type                AppointmentType?
  motif               String?
  slotID              String
  appointmentPatients AppointmentPatient[]

  slot     Slot      @relation(fields: [slotID, serviceId], references: [id, serviceId], onDelete: Cascade)
  thematic Thematic? @relation(fields: [thematicId], references: [id], onDelete: SetNull)

  @@unique([id, serviceId])
  @@index([slotID])
  @@index([thematicId])
  @@index([serviceId])
}

model AppointmentPatient {
  id              String @id @default(cuid())
  establishmentId String
  serviceId       String
  appointmentId   String
  patientId       String

  accompanying      String?
  status            AppointmentStatus?
  rejectionReason   String?
  transmissionNotes String?

  appointment Appointment @relation(fields: [appointmentId, serviceId], references: [id, serviceId], onDelete: Cascade)
  patient     Patient     @relation(fields: [patientId, establishmentId], references: [id, establishmentId], onDelete: Cascade)

  @@unique([appointmentId, patientId])
  @@unique([id, serviceId])
  @@index([patientId])
  @@index([serviceId])
}

model SlotTemplate {
  id              String   @id @default(cuid())
  establishmentId String
  serviceId       String
  startTime       DateTime @db.Time()
  endTime         DateTime @db.Time()
  offsetDays      Int

  isIndividual Boolean
  capacity     Int?
  thematicId   String?
  locationID   String?
  description  String?
  color        String

  slot       Slot?
  templateID String?

  soignantLinks SlotTemplateSoignant[]
  template      PathwayTemplate?       @relation(fields: [templateID], references: [id])
  location      Location?              @relation(fields: [locationID], references: [id], onDelete: SetNull)
  thematic      Thematic?              @relation(fields: [thematicId], references: [id], onDelete: SetNull)

  @@unique([id, serviceId])
  @@index([templateID])
  @@index([locationID])
  @@index([thematicId])
  @@index([serviceId])
}

model Slot {
  id              String        @id @default(cuid())
  establishmentId String
  serviceId       String
  startDate       DateTime
  endDate         DateTime
  locked          Boolean       @default(false)
  appointments    Appointment[]
  pathwayID       String?
  slotTemplateID  String        @unique

  pathway      Pathway?     @relation(fields: [pathwayID], references: [id])
  slotTemplate SlotTemplate @relation(fields: [slotTemplateID, serviceId], references: [id, serviceId])

  @@unique([id, serviceId])
  @@index([startDate])
  @@index([pathwayID])
  @@index([serviceId])
}

model Soignant {
  id              String @id @default(cuid())
  establishmentId String
  name            String

  establishment     Establishment             @relation(fields: [establishmentId], references: [id])
  slotTemplateLinks SlotTemplateSoignant[]
  thematicLinks     SoignantThematic[]
  todos             Todo[]
  memberships       EstablishmentMembership[]

  @@unique([id, establishmentId])
  @@index([establishmentId])
}

model Thematic {
  id              String  @id @default(cuid())
  establishmentId String
  serviceId       String
  name            String
  duration        Int?
  pdfNotice       String?

  soignantLinks SoignantThematic[]
  appointments  Appointment[]
  slotTemplates SlotTemplate[]

  @@unique([serviceId, name])
  @@unique([id, serviceId])
  @@index([serviceId])
}

model Location {
  id              String @id @default(cuid())
  establishmentId String
  name            String

  establishment Establishment  @relation(fields: [establishmentId], references: [id])
  slotTemplates SlotTemplate[]

  @@unique([establishmentId, name])
  @@unique([id, establishmentId])
}
```

`Patient` : ajouter `establishmentId String` après `id`, la relation `establishment Establishment @relation(fields: [establishmentId], references: [id])`, et `@@unique([id, establishmentId])` + `@@index([establishmentId])`. Tous les autres champs restent.

`EnrollmentIssue`, `DiagnosticEducatif` : ajouter `establishmentId String`, `serviceId String`, `@@unique([id, serviceId])`, `@@index([serviceId])`. `DiagnosticEducatif.patient` devient `@relation(fields: [patientId, establishmentId], references: [id, establishmentId], onDelete: Cascade)` ; `EnrollmentIssue.patient` idem. `DiagnosticEducatif.template` reste simple (templateId nullable).

`DiagnosticEducatifTemplate`, `Todo`, `ForbiddenWeek` : ajouter `establishmentId String`, `serviceId String`, `@@unique([id, serviceId])`, `@@index([serviceId])`. `ForbiddenWeek.startOfWeek` perd `@unique` au profit de `@@unique([serviceId, startOfWeek])`.

`PlanningCycle` :

```prisma
model PlanningCycle {
  id              String   @id @default(cuid())
  establishmentId String
  serviceId       String   @unique
  startOfWeek     DateTime @db.Date
  weekCount       Int
  updatedAt       DateTime @updatedAt
}
```

`ActivityLog` : ajouter `establishmentId String?`, `serviceId String?`, `@@index([establishmentId])`, `@@index([serviceId])`.

Ajouter en tête de fichier le commentaire :

```prisma
// Multi-tenant : toute table de service porte establishmentId + serviceId,
// toute table d'établissement porte establishmentId. Les références vers un
// autre modèle de tenant sont composites (xId, serviceId|establishmentId)
// sauf quand le champ référent est nullable (Prisma l'interdit) : la
// cohérence est alors vérifiée par le domaine. Voir docs/multi-tenant/.
```

- [ ] **Step 3: Générer le squelette de migration**

Run: `cd back && npm run prisma:migrate:create -- --name multi_tenant_socle`
Expected: dossier `prisma/migrations/<timestamp>_multi_tenant_socle/` avec un `migration.sql` non appliqué. Le SQL généré ajoute les colonnes en `NOT NULL` directement (échouerait sur une base non vide) et supprime les anciennes colonnes : il faut le réordonner.

- [ ] **Step 4: Réécrire `migration.sql`**

Garder le SQL généré pour : `CREATE TYPE`, `CREATE TABLE` des nouvelles tables, `CREATE INDEX`, `CREATE UNIQUE INDEX`, `ADD CONSTRAINT ... FOREIGN KEY` (noms conventionnels Prisma, à ne pas renommer). Réorganiser en trois blocs :

**Bloc 1 — ajouter sans contraindre.** Pour chaque `ALTER TABLE "X" ADD COLUMN "establishmentId" TEXT NOT NULL` généré, retirer `NOT NULL` (idem `serviceId`). Garder les `CREATE TYPE`, `CREATE TABLE`, `ADD COLUMN "isSuperAdmin"`, `ADD COLUMN "deactivatedAt"`. Ne pas encore exécuter les `DROP` ni les `ADD CONSTRAINT`.

**Bloc 2 — remplir.** Insérer ce bloc tel quel :

```sql
-- Remplissage : un établissement et un service uniques pour les données existantes.
DO $$
DECLARE
  est_id TEXT;
  svc_id TEXT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "User")
     AND NOT EXISTS (SELECT 1 FROM "Patient")
     AND NOT EXISTS (SELECT 1 FROM "PathwayTemplate") THEN
    RETURN;
  END IF;

  est_id := 'est_' || substr(md5(random()::text), 1, 20);
  svc_id := 'svc_' || substr(md5(random()::text), 1, 20);

  INSERT INTO "Establishment" ("id", "name", "createdAt") VALUES (est_id, 'Établissement', now());
  INSERT INTO "Service" ("id", "establishmentId", "name", "createdAt") VALUES (svc_id, est_id, 'Service', now());

  UPDATE "Patient"  SET "establishmentId" = est_id;
  UPDATE "Soignant" SET "establishmentId" = est_id;
  UPDATE "Location" SET "establishmentId" = est_id;
  UPDATE "ActivityLog" SET "establishmentId" = est_id, "serviceId" = svc_id;

  UPDATE "PathwayTemplate"            SET "establishmentId" = est_id, "serviceId" = svc_id;
  UPDATE "Pathway"                    SET "establishmentId" = est_id, "serviceId" = svc_id;
  UPDATE "SlotTemplate"               SET "establishmentId" = est_id, "serviceId" = svc_id;
  UPDATE "Slot"                       SET "establishmentId" = est_id, "serviceId" = svc_id;
  UPDATE "Appointment"                SET "establishmentId" = est_id, "serviceId" = svc_id;
  UPDATE "AppointmentPatient"         SET "establishmentId" = est_id, "serviceId" = svc_id;
  UPDATE "Thematic"                   SET "establishmentId" = est_id, "serviceId" = svc_id;
  UPDATE "DiagnosticEducatifTemplate" SET "establishmentId" = est_id, "serviceId" = svc_id;
  UPDATE "DiagnosticEducatif"         SET "establishmentId" = est_id, "serviceId" = svc_id;
  UPDATE "EnrollmentIssue"            SET "establishmentId" = est_id, "serviceId" = svc_id;
  UPDATE "PatientPathwayPriority"     SET "establishmentId" = est_id, "serviceId" = svc_id;
  UPDATE "ForbiddenWeek"              SET "establishmentId" = est_id, "serviceId" = svc_id;
  UPDATE "PlanningCycle"              SET "establishmentId" = est_id, "serviceId" = svc_id;
  UPDATE "Todo"                       SET "establishmentId" = est_id, "serviceId" = svc_id;

  -- Utilisateurs : ADMIN -> ADMIN + COORDINATEUR, USER -> MEMBER + INTERVENANT, NONE -> rien.
  INSERT INTO "EstablishmentMembership" ("id", "userId", "establishmentId", "role", "soignantId", "createdAt")
  SELECT 'em_' || substr(md5(u."id"), 1, 20), u."id", est_id,
         CASE WHEN u."role" = 'ADMIN' THEN 'ADMIN'::"EstablishmentRole" ELSE 'MEMBER'::"EstablishmentRole" END,
         u."soignantId", now()
  FROM "User" u WHERE u."role" IN ('ADMIN', 'USER');

  INSERT INTO "ServiceMembership" ("id", "establishmentMembershipId", "serviceId", "establishmentId", "role", "createdAt")
  SELECT 'sm_' || substr(md5(u."id"), 1, 20), em."id", svc_id, est_id,
         CASE WHEN u."role" = 'ADMIN' THEN 'COORDINATEUR'::"ServiceRole" ELSE 'INTERVENANT'::"ServiceRole" END,
         now()
  FROM "User" u JOIN "EstablishmentMembership" em ON em."userId" = u."id"
  WHERE u."role" IN ('ADMIN', 'USER');

  -- Relations plusieurs-à-plusieurs : tables implicites -> tables explicites.
  INSERT INTO "SlotTemplateSoignant" ("slotTemplateId", "soignantId", "serviceId", "establishmentId")
  SELECT l."A", l."B", svc_id, est_id FROM "_SlotTemplateSoignants" l;

  INSERT INTO "SoignantThematic" ("soignantId", "thematicId", "serviceId", "establishmentId")
  SELECT l."A", l."B", svc_id, est_id FROM "_SoignantThematics" l;
END $$;
```

Vérifier l'ordre des colonnes `"A"`/`"B"` des tables implicites dans une migration précédente (Prisma nomme `A` le modèle alphabétiquement premier : pour `_SlotTemplateSoignants`, `A` = `Soignant`, `B` = `SlotTemplate` ; pour `_SoignantThematics`, `A` = `Soignant`, `B` = `Thematic`). Corriger le `SELECT` en conséquence : `SlotTemplateSoignant` reçoit `(l."B", l."A", …)`.

**Bloc 3 — contraindre et nettoyer.** Pour chaque colonne de tenant hors `ActivityLog` : `ALTER TABLE "X" ALTER COLUMN "establishmentId" SET NOT NULL;` (idem `serviceId`). Puis coller les `CREATE UNIQUE INDEX`, `CREATE INDEX`, `DROP CONSTRAINT`/`ADD CONSTRAINT` de clés étrangères générés (les anciens FK simples remplacés par les composites), les `DROP INDEX` des anciennes unicités (`Thematic_name_key`, `Location_name_key`, `ForbiddenWeek_startOfWeek_key`), puis :

```sql
DROP TABLE "_SlotTemplateSoignants";
DROP TABLE "_SoignantThematics";
ALTER TABLE "User" DROP COLUMN "role", DROP COLUMN "soignantId";
DROP TYPE "Role";
ALTER TABLE "PlanningCycle" ALTER COLUMN "id" DROP DEFAULT;
```

(le `@default(cuid())` est côté client, le SQL n'a plus de défaut).

- [ ] **Step 5: Appliquer sur la base de test vide puis sur une base de dev peuplée**

Run: `cd back && npm run prisma:migrate:deploy:test`
Expected: migration appliquée sans erreur sur `medisync_test` (bloc 2 retourne immédiatement).

Run: `cd back && npm run prisma:migrate:dev`
Expected: sur la base de dev, migration appliquée. Si Prisma signale une dérive ou propose une migration supplémentaire, c'est que le SQL réécrit ne correspond pas au schéma : corriger le SQL (pas le schéma) jusqu'à ce que `prisma migrate dev` n'ait rien à générer. Le seed échouera (code obsolète) : c'est attendu, tâche 6.

Run: `cd back && npm run prisma:generate`
Expected: client régénéré dans `src/generated`.

- [ ] **Step 6: Fichier d'invariants**

`back/prisma/checks/multi-tenant-socle.sql` :

```sql
-- Invariants après la migration multi_tenant_socle. Tout doit valoir 0 sauf indication.
SELECT 'Patient sans etablissement' AS check, count(*) FROM "Patient" WHERE "establishmentId" IS NULL
UNION ALL SELECT 'Soignant sans etablissement', count(*) FROM "Soignant" WHERE "establishmentId" IS NULL
UNION ALL SELECT 'Location sans etablissement', count(*) FROM "Location" WHERE "establishmentId" IS NULL
UNION ALL SELECT 'Slot sans service', count(*) FROM "Slot" WHERE "serviceId" IS NULL
UNION ALL SELECT 'Appointment sans service', count(*) FROM "Appointment" WHERE "serviceId" IS NULL
UNION ALL SELECT 'Thematic sans service', count(*) FROM "Thematic" WHERE "serviceId" IS NULL
UNION ALL SELECT 'Etablissements (attendu 1)', count(*) FROM "Establishment"
UNION ALL SELECT 'Services (attendu 1)', count(*) FROM "Service"
UNION ALL SELECT 'PlanningCycle (attendu 0 ou 1)', count(*) FROM "PlanningCycle"
UNION ALL SELECT 'Appartenances etab (attendu = anciens ADMIN+USER)', count(*) FROM "EstablishmentMembership"
UNION ALL SELECT 'Appartenances service (attendu = anciens ADMIN+USER)', count(*) FROM "ServiceMembership"
UNION ALL SELECT 'Coordinateurs (attendu = anciens ADMIN)', count(*) FROM "ServiceMembership" WHERE "role" = 'COORDINATEUR'
UNION ALL SELECT 'Liens slotTemplate-soignant', count(*) FROM "SlotTemplateSoignant"
UNION ALL SELECT 'Liens soignant-thematic', count(*) FROM "SoignantThematic";
```

Avant la migration, relever sur la copie de production : `SELECT role, count(*) FROM "User" GROUP BY role;`, `SELECT count(*) FROM "_SlotTemplateSoignants";`, `SELECT count(*) FROM "_SoignantThematics";` pour comparer.

- [ ] **Step 7: Commit**

```bash
git add back/prisma
git commit -m "feat(db): schema multi-tenant et migration des donnees existantes

Claude-Session: https://claude.ai/code/session_01G1JrhGqWHmVH6XB2XTTwJe"
```

---

### Task 6: Seed multi-tenant

**Files:**
- Modify: `back/prisma/seed.ts`, `back/prisma/seed/user.ts`, `soignant.ts`, `thematic.ts`, `location.ts`, `patient.ts`, `pathwayTemplate.ts`, `todo.ts`

**Interfaces:**
- Produces : `seedTenant(prisma): Promise<{ establishment: Establishment; service: Service }>` ; chaque fonction de seed prend `tenant: { establishmentId: string; serviceId: string }` en dernier argument.

- [ ] **Step 1: `seed.ts`**

```ts
import 'dotenv/config'
import { PrismaPg } from '@prisma/adapter-pg'

import { PrismaClient } from '../src/generated/client'
import seedLocations from './seed/location'
import seedPathwayTemplates from './seed/pathwayTemplate'
import seedPatients from './seed/patient'
import seedSoignants from './seed/soignant'
import seedTenant from './seed/tenant'
import seedThematics from './seed/thematic'
import seedTodos from './seed/todo'
import seedUsers from './seed/user'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
const prisma = new PrismaClient({ adapter })

async function main() {
  console.log('🌱 Starting database seeding...')

  const { establishment, service } = await seedTenant(prisma)
  const tenant = { establishmentId: establishment.id, serviceId: service.id }

  const soignants = await seedSoignants(prisma, tenant)
  await seedUsers(prisma, tenant, soignants)
  await seedThematics(prisma, soignants, tenant)
  await seedPatients(prisma, tenant)
  const locations = await seedLocations(prisma, tenant)
  await seedPathwayTemplates(prisma, soignants, locations, tenant)
  await seedTodos(prisma, tenant)

  console.log('✅ Seeding completed successfully!')
}
// main().catch… inchangé
```

- [ ] **Step 2: `seed/tenant.ts`**

```ts
import type { PrismaClient } from '../../src/generated/client'

export type SeedTenant = { establishmentId: string; serviceId: string }

export default async function seedTenant(prisma: PrismaClient) {
  console.log('→ Seeding establishment and service...')
  const establishment = await prisma.establishment.create({
    data: { name: 'CHU de démonstration' },
  })
  const service = await prisma.service.create({
    data: { establishmentId: establishment.id, name: 'Réadaptation' },
  })
  return { establishment, service }
}
```

- [ ] **Step 3: Les autres seeds**

`user.ts` : signature `seedUsers(prisma, tenant: SeedTenant, soignants: Soignant[])`. Remplacer le `createMany` par une boucle qui crée chaque identité puis son appartenance :

```ts
  const users = [
    { email: 'admin@qwetle.fr', firstName: 'Léo', lastName: 'Couffinhal', pass: adminPass },
    { email: 'sabrina.bernadet@cepta.fr', firstName: 'Sabrina', lastName: 'Bernadet', pass: userPass },
  ]
  for (const [index, u] of users.entries()) {
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: {},
      create: { email: u.email, password: u.pass.hash, salt: u.pass.salt, firstName: u.firstName, lastName: u.lastName },
    })
    await prisma.establishmentMembership.create({
      data: {
        userId: user.id,
        establishmentId: tenant.establishmentId,
        role: 'ADMIN',
        soignantId: soignants[index]?.id ?? null,
        serviceMemberships: {
          create: [{ serviceId: tenant.serviceId, establishmentId: tenant.establishmentId, role: 'COORDINATEUR' }],
        },
      },
    })
  }
```

Supprimer l'import `Role`.

`soignant.ts` : `prisma.soignant.create({ data: { ...s, establishmentId: tenant.establishmentId } })`.

`location.ts` : `upsert({ where: { establishmentId_name: { establishmentId: tenant.establishmentId, name } }, update: {}, create: { name, establishmentId: tenant.establishmentId } })`.

`thematic.ts` : `upsert({ where: { serviceId_name: { serviceId: tenant.serviceId, name: t.name } }, update: { duration }, create: { name: t.name, duration, establishmentId: tenant.establishmentId, serviceId: tenant.serviceId, soignantLinks: { create: soignantIDs.map((soignantId) => ({ soignantId, serviceId: tenant.serviceId, establishmentId: tenant.establishmentId })) } } })`. Dans `update`, remplacer `soignants.set` par `soignantLinks: { deleteMany: {}, create: … }` (même tableau).

`patient.ts` : `data: { ...p, createDate: new Date(), establishmentId: tenant.establishmentId }`.

`pathwayTemplate.ts` : `deleteMany` inchangés ; dans `prisma.pathwayTemplate.create` ajouter `establishmentId: tenant.establishmentId, serviceId: tenant.serviceId` ; `createSlotTemplate` reçoit `tenant` et renvoie `establishmentId`, `serviceId` et `soignantLinks: { create: [{ soignantId: soignant.id, serviceId: tenant.serviceId, establishmentId: tenant.establishmentId }] }` à la place de `soignants: { connect… }`. Le champ `thematic: data.thematic` (chaîne) existant est-il un champ Prisma ? Non : vérifier que `SlotData.thematic` est bien transformé en `thematicId` plus loin ou retiré ; s'il est passé tel quel à Prisma aujourd'hui c'est qu'il est ignoré par un mapping, garder le comportement actuel.

`todo.ts` : chaque ligne reçoit `establishmentId: tenant.establishmentId, serviceId: tenant.serviceId`.

- [ ] **Step 4: Vérifier**

Run: `cd back && npm run prisma:migrate:reset -- --force`
Expected: base recréée, migrations appliquées, seed terminé (`✅ Seeding completed successfully!`).

Run: `cd deploy && docker compose --profile db exec postgres psql -U postgres -d medisync -f /dev/stdin < ../back/prisma/checks/multi-tenant-socle.sql`
Expected: 0 partout sur les « sans », 1 établissement, 1 service, 2 appartenances.

- [ ] **Step 5: Commit**

```bash
git add back/prisma/seed.ts back/prisma/seed
git commit -m "feat(db): seed avec un etablissement et un service

Claude-Session: https://claude.ai/code/session_01G1JrhGqWHmVH6XB2XTTwJe"
```

---

### Task 7: Identité, authentification et `/me`

**Files:**
- Modify: `back/src/main/types/infra/orm/repositories/user.repository.interface.ts`
- Modify: `back/src/main/infra/orm/repositories/user.repository.ts`
- Modify: `back/src/main/types/domain/user.domain.interface.ts`, `back/src/main/domain/user.domain.ts`
- Modify: `back/src/main/types/domain/auth.domain.interface.ts`, `back/src/main/domain/auth.domain.ts`
- Create: `back/src/main/utils/me-mapper.ts`
- Modify: `back/src/main/interfaces/http/fastify/schemas/auth.schema.ts`
- Create: `back/src/main/interfaces/http/fastify/schemas/me.schema.ts`
- Create: `back/src/main/interfaces/http/fastify/routes/me.ts`
- Modify: `back/src/main/interfaces/http/fastify/routes/auth/sign-in.router.ts`, `refresh.router.ts`, `register.router.ts`
- Modify: `back/src/main/interfaces/http/fastify/plugins/cookie.plugin.ts`
- Test: `back/src/test/unit/utils/me-mapper.test.ts`

**Interfaces:**
- Produces:

```ts
// user.repository.interface.ts
type UserWithMemberships = User & {
  establishmentMemberships: (EstablishmentMembership & {
    establishment: Establishment
    serviceMemberships: (ServiceMembership & { service: Service })[]
  })[]
}
interface UserRepositoryInterface {
  findByID(userId: string): Promise<UserWithMemberships>       // include appartenances
  findByEmail(email: string): Promise<UserEntityRepo>
  create(user: UserCreateEntityRepo): Promise<UserEntityRepo>  // identité seule
  updateProfile(userID: string, params: { firstName?: string; lastName?: string }): Promise<UserEntityRepo>
  updatePassword(userID: string, password: string): Promise<void>
  setDeactivated(userID: string, at: Date | null): Promise<UserEntityRepo>
}
// me-mapper.ts
type MeResponse = {
  id: string; email: string; firstName: string | null; lastName: string | null; isSuperAdmin: boolean
  establishments: { id: string; name: string; role: EstablishmentRole; soignantId: string | null
    services: { id: string; name: string; role: ServiceRole }[] }[]
}
toMeResponse(user: UserWithMemberships): MeResponse   // exclut services et établissements désactivés
```

- `request.currentUser` devient `UserWithMemberships` ; `request.user` (JWT) inchangé.

- [ ] **Step 1: Test du mapper**

`back/src/test/unit/utils/me-mapper.test.ts` :

```ts
import { toMeResponse } from '../../../main/utils/me-mapper'
import type { UserWithMemberships } from '../../../main/types/infra/orm/repositories/user.repository.interface'

const base = {
  id: 'u1', email: 'a@b.fr', password: 'x', salt: 'y', firstName: 'A', lastName: 'B',
  isSuperAdmin: false, deactivatedAt: null,
}
const est = (id: string, deactivatedAt: Date | null = null) => ({
  id, name: `Etab ${id}`, createdAt: new Date(), deactivatedAt,
})
const svc = (id: string, establishmentId: string, deactivatedAt: Date | null = null) => ({
  id, establishmentId, name: `Svc ${id}`, createdAt: new Date(), deactivatedAt,
})

describe('toMeResponse', () => {
  it('construit l arbre des appartenances sans les elements desactives', () => {
    const user: UserWithMemberships = {
      ...base,
      establishmentMemberships: [
        {
          id: 'em1', userId: 'u1', establishmentId: 'e1', role: 'ADMIN', soignantId: 'so1', createdAt: new Date(),
          establishment: est('e1'),
          serviceMemberships: [
            { id: 'sm1', establishmentMembershipId: 'em1', serviceId: 's1', establishmentId: 'e1', role: 'COORDINATEUR', createdAt: new Date(), service: svc('s1', 'e1') },
            { id: 'sm2', establishmentMembershipId: 'em1', serviceId: 's2', establishmentId: 'e1', role: 'LECTURE', createdAt: new Date(), service: svc('s2', 'e1', new Date()) },
          ],
        },
        {
          id: 'em2', userId: 'u1', establishmentId: 'e2', role: 'MEMBER', soignantId: null, createdAt: new Date(),
          establishment: est('e2', new Date()),
          serviceMemberships: [],
        },
      ],
    }
    expect(toMeResponse(user)).toEqual({
      id: 'u1', email: 'a@b.fr', firstName: 'A', lastName: 'B', isSuperAdmin: false,
      establishments: [
        { id: 'e1', name: 'Etab e1', role: 'ADMIN', soignantId: 'so1',
          services: [{ id: 's1', name: 'Svc s1', role: 'COORDINATEUR' }] },
      ],
    })
  })
})
```

- [ ] **Step 2: Vérifier l'échec**

Run: `cd back && npx jest -c src/test/jest.config.ts src/test/unit/utils/me-mapper.test.ts`
Expected: FAIL.

- [ ] **Step 3: Interface et repository utilisateur**

`user.repository.interface.ts` :

```ts
import type {
  Establishment,
  EstablishmentMembership,
  Service,
  ServiceMembership,
  User,
} from '../../../../../generated/client'

export type UserEntityRepo = User
export type UserWithMemberships = User & {
  establishmentMemberships: (EstablishmentMembership & {
    establishment: Establishment
    serviceMemberships: (ServiceMembership & { service: Service })[]
  })[]
}
export type UserCreateEntityRepo = { email: string; password: string; firstName?: string; lastName?: string }
export type UserProfileUpdateRepo = { firstName?: string; lastName?: string }

export interface UserRepositoryInterface {
  findByID: (userId: string) => Promise<UserWithMemberships>
  findByEmail: (email: string) => Promise<UserEntityRepo>
  create: (user: UserCreateEntityRepo) => Promise<UserEntityRepo>
  updateProfile: (userID: string, params: UserProfileUpdateRepo) => Promise<UserEntityRepo>
  updatePassword: (userID: string, password: string) => Promise<void>
  setDeactivated: (userID: string, at: Date | null) => Promise<UserEntityRepo>
}
```

`user.repository.ts` : supprimer l'import `Role` et `findAll`/`update`/`delete`. `findByID` :

```ts
const membershipsInclude = {
  establishmentMemberships: {
    include: {
      establishment: true,
      serviceMemberships: { include: { service: true } },
    },
  },
} as const

  async findByID(userID: string): Promise<UserWithMemberships> {
    try {
      return await this.prisma.user.findUniqueOrThrow({
        where: { id: userID },
        include: membershipsInclude,
      })
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({ entityName: 'User', error: err })
    }
  }
```

`create` : `data: { ...user, salt, password: hash }` (plus de `role`). Ajouter :

```ts
  async updateProfile(userID: string, params: UserProfileUpdateRepo): Promise<UserEntityRepo> {
    try {
      return await this.prisma.user.update({ where: { id: userID }, data: params })
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({ entityName: 'User', error: err })
    }
  }

  async updatePassword(userID: string, password: string): Promise<void> {
    const { hash, salt } = hashPassword(password)
    try {
      await this.prisma.user.update({ where: { id: userID }, data: { password: hash, salt } })
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({ entityName: 'User', error: err })
    }
  }

  async setDeactivated(userID: string, at: Date | null): Promise<UserEntityRepo> {
    try {
      return await this.prisma.user.update({ where: { id: userID }, data: { deactivatedAt: at } })
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({ entityName: 'User', error: err })
    }
  }
```

- [ ] **Step 4: Mapper `/me`**

`back/src/main/utils/me-mapper.ts` :

```ts
import type { EstablishmentRole, ServiceRole } from '../../generated/enums'
import type { UserWithMemberships } from '../types/infra/orm/repositories/user.repository.interface'

export type MeResponse = {
  id: string
  email: string
  firstName: string | null
  lastName: string | null
  isSuperAdmin: boolean
  establishments: {
    id: string
    name: string
    role: EstablishmentRole
    soignantId: string | null
    services: { id: string; name: string; role: ServiceRole }[]
  }[]
}

// Arbre des appartenances actives. Un établissement ou un service désactivé
// disparaît de la réponse : le front ne peut donc jamais le sélectionner.
export const toMeResponse = (user: UserWithMemberships): MeResponse => ({
  id: user.id,
  email: user.email,
  firstName: user.firstName,
  lastName: user.lastName,
  isSuperAdmin: user.isSuperAdmin,
  establishments: user.establishmentMemberships
    .filter((m) => m.establishment.deactivatedAt === null)
    .map((m) => ({
      id: m.establishmentId,
      name: m.establishment.name,
      role: m.role,
      soignantId: m.soignantId,
      services: m.serviceMemberships
        .filter((sm) => sm.service.deactivatedAt === null)
        .map((sm) => ({ id: sm.serviceId, name: sm.service.name, role: sm.role })),
    })),
})
```

- [ ] **Step 5: Domaines**

`user.domain.interface.ts` :

```ts
import type { UserEntityRepo, UserWithMemberships } from '../infra/orm/repositories/user.repository.interface'

export type UserEntityDomain = UserWithMemberships
export type UserProfileUpdateDomain = { firstName?: string; lastName?: string }
export type PasswordChangeDomain = { currentPassword: string; newPassword: string }

export interface UserDomainInterface {
  findByID: (userID: string) => Promise<UserEntityDomain>
  updateProfile: (userID: string, params: UserProfileUpdateDomain) => Promise<UserEntityRepo>
  changePassword: (userID: string, params: PasswordChangeDomain) => Promise<void>
}
```

`user.domain.ts` : supprimer `prisma`, `findAll`, `update`, `delete`. Ajouter :

```ts
  updateProfile(userID: string, params: UserProfileUpdateDomain): Promise<UserEntityRepo> {
    return this.userRepository.updateProfile(userID, params)
  }

  async changePassword(userID: string, { currentPassword, newPassword }: PasswordChangeDomain): Promise<void> {
    const user = await this.userRepository.findByID(userID)
    const valid = verifyPassword({ password: currentPassword, salt: user.salt, hash: user.password })
    if (!valid) {
      throw Boom.forbidden('Current password is incorrect')
    }
    await this.userRepository.updatePassword(userID, newPassword)
  }
```

(imports : `Boom` de `@hapi/boom`, `verifyPassword` de `../utils/hash`).

`auth.domain.interface.ts` : `CreateUserInput` perd `soignantId` ; `SignInResponse = { accessToken: string; refreshToken: string; me: MeResponse }`.

`auth.domain.ts` : `signIn` charge l'utilisateur par e-mail puis, après vérification du mot de passe, recharge `findByID(user.id)` pour les appartenances ; refuse un compte désactivé :

```ts
    if (user.deactivatedAt) {
      throw Boom.unauthorized('Account deactivated')
    }
    const full = await this.userRepository.findByID(user.id)
    const { accessToken, refreshToken } = this.generateTokens(user.id)
    return { accessToken, refreshToken, me: toMeResponse(full) }
```

`refresh` : même retour (`me: toMeResponse(user)`), même refus si `deactivatedAt`.

- [ ] **Step 6: Schémas et routes**

`auth.schema.ts` : supprimer `role` et `soignantId` de `userSchema` ; `registerSchema` pick `email, firstName, lastName` ; `signInResponseSchema` devient l'import de `meResponseSchema`.

`me.schema.ts` :

```ts
import { z } from 'zod/v4'

export const meResponseSchema = z.object({
  id: z.string(),
  email: z.string(),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  isSuperAdmin: z.boolean(),
  establishments: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      role: z.enum(['ADMIN', 'MEMBER']),
      soignantId: z.string().nullable(),
      services: z.array(
        z.object({
          id: z.string(),
          name: z.string(),
          role: z.enum(['COORDINATEUR', 'INTERVENANT', 'SECRETARIAT', 'LECTURE']),
        }),
      ),
    }),
  ),
})

export const updateMeSchema = z.object({
  firstName: z.string().trim().optional(),
  lastName: z.string().trim().optional(),
  currentPassword: z.string().optional(),
  newPassword: z.string().min(12, 'Password must be at least 12 characters long').optional(),
}).refine((v) => (v.newPassword === undefined) === (v.currentPassword === undefined), {
  message: 'currentPassword and newPassword go together',
})

export type UpdateMeBody = z.infer<typeof updateMeSchema>
```

`routes/me.ts` :

```ts
import type { FastifyPluginAsync } from 'fastify'

import { meResponseSchema, type UpdateMeBody, updateMeSchema } from '../schemas/me.schema'
import { toMeResponse } from '../../../../utils/me-mapper'

const meRouter: FastifyPluginAsync = (fastify) => {
  const { userDomain } = fastify.iocContainer

  fastify.get('/', { schema: { response: { 200: meResponseSchema } } }, (request) =>
    toMeResponse(request.currentUser),
  )

  fastify.patch<{ Body: UpdateMeBody }>(
    '/',
    { schema: { body: updateMeSchema, response: { 200: meResponseSchema } } },
    async (request) => {
      const { userID } = request.user
      const { firstName, lastName, currentPassword, newPassword } = request.body
      if (firstName !== undefined || lastName !== undefined) {
        await userDomain.updateProfile(userID, { firstName, lastName })
      }
      if (currentPassword !== undefined && newPassword !== undefined) {
        await userDomain.changePassword(userID, { currentPassword, newPassword })
      }
      return toMeResponse(await userDomain.findByID(userID))
    },
  )
  return Promise.resolve()
}

export { meRouter }
```

`sign-in.router.ts` et `refresh.router.ts` : destructurer `{ accessToken, refreshToken, me }`, poser les cookies comme avant, `return me`. Réponse `201`/`200: meResponseSchema`.

`register.router.ts` : inchangé hormis le schéma (plus de `soignantId`).

- [ ] **Step 7: Préhandler d'authentification**

`cookie.plugin.ts` : `currentUser: UserEntityDomain` reste (le type a changé de forme). Supprimer `roleRank`, `requireMinRole` et sa déclaration. Après le chargement de `request.currentUser`, ajouter :

```ts
  if (request.currentUser.deactivatedAt) {
    throw Boom.unauthorized('Account deactivated')
  }
```

- [ ] **Step 8: Vérifier**

Run: `cd back && npx jest -c src/test/jest.config.ts src/test/unit/utils/me-mapper.test.ts && npm run lint`
Expected: PASS ; lint OK sur les fichiers touchés (le lint global peut encore signaler `Role` ailleurs : ces fichiers sont traités aux tâches suivantes).

- [ ] **Step 9: Commit**

```bash
git add back/src/main back/src/test
git commit -m "feat(auth): identite globale, appartenances et route /me

Claude-Session: https://claude.ai/code/session_01G1JrhGqWHmVH6XB2XTTwJe"
```

---

### Task 8: Plugin tenant et arborescence des routes

**Files:**
- Create: `back/src/main/interfaces/http/fastify/plugins/tenant.plugin.ts`
- Modify: `back/src/main/interfaces/http/fastify/plugins/index.ts`
- Create: `back/src/main/interfaces/http/fastify/routes/tenant.routes.ts`
- Create: `back/src/main/interfaces/http/fastify/routes/establishment-admin.routes.ts`
- Modify: `back/src/main/interfaces/http/fastify/routes/index.ts`
- Delete: `back/src/main/interfaces/http/fastify/routes/user.ts`, `schemas/user.schema.ts`
- Test: `back/src/test/unit/interfaces/tenant-resolution.test.ts`

**Interfaces:**
- Produces: `resolveTenantFromUser(user: UserWithMemberships, params: { establishmentId: string; serviceId?: string }, options: { requireEstablishmentAdmin: boolean }): Tenant` (pure, lève `Boom.notFound()`), décorateurs `fastify.resolveTenant`, `fastify.resolveEstablishmentAdmin`, `fastify.enforcePermission` (preHandler générique), déclaration `FastifyContextConfig.permission?: Permission`, `FastifyRequest.tenant: Tenant`.
- Consumes: `tenantContext.enter`, `hasPermission`.

- [ ] **Step 1: Test de la résolution (pure)**

`back/src/test/unit/interfaces/tenant-resolution.test.ts` :

```ts
import Boom from '@hapi/boom'

import { assertRoutePermission, resolveTenantFromUser } from '../../../main/interfaces/http/fastify/plugins/tenant.plugin'
import type { UserWithMemberships } from '../../../main/types/infra/orm/repositories/user.repository.interface'

const now = new Date()
const user: UserWithMemberships = {
  id: 'u1', email: 'a@b.fr', password: '', salt: '', firstName: null, lastName: null,
  isSuperAdmin: false, deactivatedAt: null,
  establishmentMemberships: [{
    id: 'em1', userId: 'u1', establishmentId: 'e1', role: 'MEMBER', soignantId: 'so1', createdAt: now,
    establishment: { id: 'e1', name: 'E', createdAt: now, deactivatedAt: null },
    serviceMemberships: [
      { id: 'sm1', establishmentMembershipId: 'em1', serviceId: 's1', establishmentId: 'e1', role: 'INTERVENANT', createdAt: now,
        service: { id: 's1', establishmentId: 'e1', name: 'S1', createdAt: now, deactivatedAt: null } },
      { id: 'sm2', establishmentMembershipId: 'em1', serviceId: 's2', establishmentId: 'e1', role: 'LECTURE', createdAt: now,
        service: { id: 's2', establishmentId: 'e1', name: 'S2', createdAt: now, deactivatedAt: now } },
    ],
  }],
}

describe('resolveTenantFromUser', () => {
  it('resout un couple etablissement/service dont l utilisateur est membre', () => {
    expect(resolveTenantFromUser(user, { establishmentId: 'e1', serviceId: 's1' }, { requireEstablishmentAdmin: false }))
      .toEqual({ userId: 'u1', establishmentId: 'e1', establishmentRole: 'MEMBER', serviceId: 's1', serviceRole: 'INTERVENANT', soignantId: 'so1' })
  })

  it('renvoie 404 pour un service inconnu, desactive, ou un etablissement etranger', () => {
    for (const params of [
      { establishmentId: 'e1', serviceId: 'nope' },
      { establishmentId: 'e1', serviceId: 's2' },
      { establishmentId: 'e9', serviceId: 's1' },
    ]) {
      expect(() => resolveTenantFromUser(user, params, { requireEstablishmentAdmin: false }))
        .toThrow(expect.objectContaining({ output: expect.objectContaining({ statusCode: 404 }) }))
    }
  })

  it('assertRoutePermission refuse une route sans permission', () => {
    expect(() => assertRoutePermission({ method: 'GET', url: '/x', config: {} })).toThrow(/without permission/)
    expect(() => assertRoutePermission({ method: 'GET', url: '/x', config: { permission: 'planning:read' } })).not.toThrow()
  })

  it('exige le role ADMIN pour le contexte d administration', () => {
    expect(() => resolveTenantFromUser(user, { establishmentId: 'e1' }, { requireEstablishmentAdmin: true }))
      .toThrow(Boom.Boom)
    const admin = { ...user, establishmentMemberships: [{ ...user.establishmentMemberships[0], role: 'ADMIN' as const }] }
    expect(resolveTenantFromUser(admin, { establishmentId: 'e1' }, { requireEstablishmentAdmin: true }))
      .toEqual({ userId: 'u1', establishmentId: 'e1', establishmentRole: 'ADMIN', serviceId: null, serviceRole: null, soignantId: 'so1' })
  })
})
```

- [ ] **Step 2: Vérifier l'échec**

Run: `cd back && npx jest -c src/test/jest.config.ts src/test/unit/interfaces/tenant-resolution.test.ts`
Expected: FAIL.

- [ ] **Step 3: Plugin**

`plugins/tenant.plugin.ts` :

```ts
import Boom from '@hapi/boom'
import type { FastifyInstance, FastifyRequest, onRequestAsyncHookHandler, preHandlerAsyncHookHandler } from 'fastify'
import fastifyPlugin from 'fastify-plugin'
import type { FastifyPluginAsync } from 'fastify/types/plugin'

import type { UserWithMemberships } from '../../../../types/infra/orm/repositories/user.repository.interface'
import type { Tenant } from '../../../../types/utils/tenant-context'
import { hasPermission, type Permission } from '../../../../utils/permissions'

declare module 'fastify' {
  export interface FastifyRequest {
    tenant: Tenant
  }
  export interface FastifyContextConfig {
    permission?: Permission
  }
  export interface FastifyInstance {
    resolveTenant: onRequestAsyncHookHandler
    resolveEstablishmentAdmin: onRequestAsyncHookHandler
    enforcePermission: preHandlerAsyncHookHandler
  }
}

type TenantParams = { establishmentId: string; serviceId?: string }

// Pure : de l'arbre des appartenances et des paramètres d'URL vers le tenant.
// 404 dans tous les cas d'échec pour ne pas révéler l'existence d'un service.
export const resolveTenantFromUser = (
  user: UserWithMemberships,
  params: TenantParams,
  options: { requireEstablishmentAdmin: boolean },
): Tenant => {
  const membership = user.establishmentMemberships.find(
    (m) => m.establishmentId === params.establishmentId && m.establishment.deactivatedAt === null,
  )
  if (!membership) {
    throw Boom.notFound()
  }
  if (options.requireEstablishmentAdmin) {
    if (membership.role !== 'ADMIN') {
      throw Boom.notFound()
    }
    return {
      userId: user.id,
      establishmentId: membership.establishmentId,
      establishmentRole: membership.role,
      serviceId: null,
      serviceRole: null,
      soignantId: membership.soignantId,
    }
  }
  const serviceMembership = membership.serviceMemberships.find(
    (sm) => sm.serviceId === params.serviceId && sm.service.deactivatedAt === null,
  )
  if (!serviceMembership) {
    throw Boom.notFound()
  }
  return {
    userId: user.id,
    establishmentId: membership.establishmentId,
    establishmentRole: membership.role,
    serviceId: serviceMembership.serviceId,
    serviceRole: serviceMembership.role,
    soignantId: membership.soignantId,
  }
}

const paramsOf = (request: FastifyRequest): TenantParams => request.params as TenantParams

// Fail-safe : une route tenant ou admin sans `config.permission` fait échouer
// le démarrage. Utilisé par les hooks onRoute des plugins de routes.
export const assertRoutePermission = (route: { method: unknown; url: string; config?: { permission?: Permission } }): void => {
  if (!route.config?.permission) {
    throw new Error(`Route without permission: ${String(route.method)} ${route.url}`)
  }
}

const tenantPlugin: FastifyPluginAsync = fastifyPlugin((fastify: FastifyInstance) => {
  const { tenantContext } = fastify.iocContainer

  fastify.decorate('resolveTenant', async function (this: FastifyInstance, request: FastifyRequest) {
    await Promise.resolve()
    const tenant = resolveTenantFromUser(request.currentUser, paramsOf(request), { requireEstablishmentAdmin: false })
    request.tenant = tenant
    tenantContext.enter(tenant)
  })

  fastify.decorate('resolveEstablishmentAdmin', async function (this: FastifyInstance, request: FastifyRequest) {
    await Promise.resolve()
    const tenant = resolveTenantFromUser(request.currentUser, paramsOf(request), { requireEstablishmentAdmin: true })
    request.tenant = tenant
    tenantContext.enter(tenant)
  })

  // Lit la permission déclarée dans `config` de la route ; le fail-safe
  // onRoute des plugins de routes garantit qu'elle existe.
  fastify.decorate('enforcePermission', async function (this: FastifyInstance, request: FastifyRequest) {
    await Promise.resolve()
    const permission = request.routeOptions.config.permission
    if (!permission) {
      throw Boom.internal('Route without permission')
    }
    const { serviceRole, establishmentRole } = request.tenant
    if (!hasPermission({ serviceRole, establishmentRole }, permission)) {
      throw Boom.forbidden('Insufficient permission')
    }
  })
  return Promise.resolve()
})

export { tenantPlugin }
```

Dans `plugins/index.ts`, après `awilix` : `await registerPlugin(fastify, 'tenant', tenantPlugin)`.

- [ ] **Step 4: Plugins de routes préfixées**

`routes/tenant.routes.ts` :

```ts
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'

import { assertRoutePermission } from '../plugins/tenant.plugin'
import { activityLogRouter } from './activityLog'
import { appointmentRouter } from './appointment'
import { diagnosticEducatifRouter } from './diagnosticEducatif'
import { diagnosticEducatifTemplateRouter } from './diagnosticEducatifTemplate'
import { enrollmentIssueRouter } from './enrollmentIssue'
import { forbiddenWeekRouter } from './forbiddenWeek'
import { locationReadRouter } from './location'
import { pathwayRouter } from './pathway'
import { pathwayTemplateRouter } from './pathwayTemplate'
import { patientRouter } from './patient'
import { planningCycleRouter } from './planningCycle'
import { slotRouter } from './slot'
import { slotTemplateRouter } from './slotTemplate'
import { soignantReadRouter } from './soignant'
import { thematicRouter } from './thematic'
import { todoRouter } from './todo'

// Toute route enregistrée ici vit sous /e/:establishmentId/s/:serviceId et
// doit déclarer `config.permission`. Le hook onRoute fait échouer le
// démarrage sinon (fail-safe).
const tenantRoutes: FastifyPluginAsyncZod = async (fastify) => {
  fastify.addHook('onRoute', assertRoutePermission)
  fastify.addHook('onRequest', fastify.resolveTenant)
  fastify.addHook('preHandler', fastify.enforcePermission)

  await fastify.register(todoRouter, { prefix: '/todo' })
  await fastify.register(appointmentRouter, { prefix: '/appointment' })
  await fastify.register(slotRouter, { prefix: '/slot' })
  await fastify.register(slotTemplateRouter, { prefix: '/slot-template' })
  await fastify.register(pathwayRouter, { prefix: '/pathway' })
  await fastify.register(pathwayTemplateRouter, { prefix: '/pathway-template' })
  await fastify.register(soignantReadRouter, { prefix: '/soignant' })
  await fastify.register(thematicRouter, { prefix: '/thematic' })
  await fastify.register(locationReadRouter, { prefix: '/location' })
  await fastify.register(patientRouter, { prefix: '/patient' })
  await fastify.register(diagnosticEducatifTemplateRouter, { prefix: '/diagnostic-template' })
  await fastify.register(diagnosticEducatifRouter, { prefix: '/patient/:patientId/diagnostic' })
  await fastify.register(enrollmentIssueRouter, { prefix: '/patient/:patientID/enrollment-issue' })
  await fastify.register(activityLogRouter, { prefix: '/activity-log' })
  await fastify.register(forbiddenWeekRouter, { prefix: '/forbidden-week' })
  await fastify.register(planningCycleRouter, { prefix: '/planning-cycle' })
}

export { tenantRoutes }
```

`routes/establishment-admin.routes.ts` :

```ts
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'

import { assertRoutePermission } from '../plugins/tenant.plugin'
import { locationAdminRouter } from './location'
import { membersRouter } from './members'
import { soignantAdminRouter } from './soignant'

const establishmentAdminRoutes: FastifyPluginAsyncZod = async (fastify) => {
  fastify.addHook('onRoute', assertRoutePermission)
  fastify.addHook('onRequest', fastify.resolveEstablishmentAdmin)
  fastify.addHook('preHandler', fastify.enforcePermission)

  await fastify.register(membersRouter, { prefix: '/members' })
  await fastify.register(soignantAdminRouter, { prefix: '/soignant' })
  await fastify.register(locationAdminRouter, { prefix: '/location' })
}

export { establishmentAdminRoutes }
```

(`membersRouter`, `soignantAdminRouter`, `locationAdminRouter`, `soignantReadRouter`, `locationReadRouter` sont créés aux tâches 9 et 15 ; d'ici là ces imports cassent la compilation, ce qui est attendu.)

`routes/index.ts` : remplacer toutes les `register` d'entités par :

```ts
  await fastify.register(healthcheckRouter)
  await fastify.register(authRouter, { prefix: '/auth' })
  await fastify.register(meRouter, { prefix: '/me' })
  await fastify.register(tenantRoutes, { prefix: '/e/:establishmentId/s/:serviceId' })
  await fastify.register(establishmentAdminRoutes, { prefix: '/e/:establishmentId/admin' })
```

La garde d'authentification globale (`onRequest` avec `PUBLIC_ROUTES`) reste telle quelle : elle tourne avant `resolveTenant` car enregistrée au niveau parent.

Supprimer `routes/user.ts` et `schemas/user.schema.ts` (`git rm`).

- [ ] **Step 5: Vérifier**

Run: `cd back && npx jest -c src/test/jest.config.ts src/test/unit/interfaces/tenant-resolution.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add -A back/src/main/interfaces back/src/test
git commit -m "feat(http): resolution du tenant et routes prefixees par etablissement et service

Claude-Session: https://claude.ai/code/session_01G1JrhGqWHmVH6XB2XTTwJe"
```

---

### Task 9: Repositories d'établissement (patient, soignant, location, activityLog) et scission soignant/location

**Files:**
- Modify: `back/src/main/infra/orm/repositories/patient.repository.ts`, `soignant.repository.ts`, `location.repository.ts`, `activityLog.repository.ts`
- Modify: `back/src/main/types/infra/orm/repositories/activityLog.repository.interface.ts`
- Modify: `back/src/main/interfaces/http/fastify/routes/soignant.ts`, `location.ts`
- Modify: `back/src/main/application/starter.ts`
- Test: `back/src/test/unit/infra/repository-scope.test.ts` (nouveau, réutilisé par les tâches 10 à 13)

**Interfaces:**
- Consumes: `tenantContext.establishmentScope()`, `tenantContext.scope()`, `tenantContext.peek()`.
- Produces: `soignantReadRouter`, `soignantAdminRouter`, `locationReadRouter`, `locationAdminRouter` (exports nommés des fichiers `soignant.ts` et `location.ts`) ; `ActivityLogEntityRepo` gagne `establishmentId: string | null`, `serviceId: string | null`.
- Convention commune à tous les repositories de tenant : le constructeur destructure `tenantContext` ; helpers privés `get establishmentScope()` et `get scope()` qui délèguent au contexte. Le tenant est lu **dans chaque méthode**, jamais mémorisé.

- [ ] **Step 1: Test unitaire de scoping (harnais réutilisable)**

`back/src/test/unit/infra/repository-scope.test.ts`. Il instancie un repository avec un faux client Prisma qui enregistre les appels, et vérifie que chaque méthode porte le filtre. Écrire d'abord la partie patient/soignant/location :

```ts
import { LocationRepository } from '../../../main/infra/orm/repositories/location.repository'
import { PatientRepository } from '../../../main/infra/orm/repositories/patient.repository'
import { SoignantRepository } from '../../../main/infra/orm/repositories/soignant.repository'
import type { IocContainer } from '../../../main/types/application/ioc'
import { TenantContext } from '../../../main/utils/tenant-context'
import type { Tenant } from '../../../main/types/utils/tenant-context'

type Call = { model: string; op: string; args: Record<string, unknown> }

// Faux client : chaque `prisma.<model>.<op>(args)` est enregistré et renvoie
// une valeur neutre. `$transaction(fn)` rappelle fn avec le même faux client.
export const buildFakePrisma = () => {
  const calls: Call[] = []
  const handler = (model: string) =>
    new Proxy({}, {
      get: (_t, op: string) => (args: Record<string, unknown>) => {
        calls.push({ model, op, args })
        return Promise.resolve(op === 'findMany' ? [] : op === 'count' ? 0 : { id: 'x', ...(args.data as object) })
      },
    })
  const prisma: Record<string, unknown> = new Proxy({}, {
    get: (_t, model: string) => {
      if (model === '$transaction') {
        return (arg: unknown) => (typeof arg === 'function' ? arg(prisma) : Promise.all(arg as Promise<unknown>[]))
      }
      return handler(model)
    },
  })
  return { prisma, calls }
}

export const tenant: Tenant = {
  userId: 'u1', establishmentId: 'e1', establishmentRole: 'MEMBER',
  serviceId: 's1', serviceRole: 'INTERVENANT', soignantId: 'so1',
}

export const buildContainer = (prisma: unknown, tenantContext: TenantContext) =>
  ({
    postgresOrm: { prisma },
    tenantContext,
    errorHandler: { boomErrorFromPrismaError: ({ error }: { error: unknown }) => error },
  }) as unknown as IocContainer

describe('scoping des repositories d etablissement', () => {
  it('PatientRepository filtre et cree avec establishmentId', async () => {
    const { prisma, calls } = buildFakePrisma()
    const ctx = new TenantContext()
    const repo = new PatientRepository(buildContainer(prisma, ctx))
    await ctx.run(tenant, async () => {
      await repo.findAll()
      await repo.findByID('p1')
      await repo.create({ firstName: 'A', lastName: 'B', createDate: new Date() } as never)
    })
    expect(calls[0]).toMatchObject({ model: 'patient', op: 'findMany', args: { where: { establishmentId: 'e1' } } })
    expect(calls[1]).toMatchObject({
      model: 'patient', op: 'findUniqueOrThrow',
      args: { where: { id_establishmentId: { id: 'p1', establishmentId: 'e1' } } },
    })
    expect(calls[2]).toMatchObject({ model: 'patient', op: 'create', args: { data: { establishmentId: 'e1' } } })
  })

  it('SoignantRepository et LocationRepository filtrent sur establishmentId', async () => {
    const { prisma, calls } = buildFakePrisma()
    const ctx = new TenantContext()
    const soignants = new SoignantRepository(buildContainer(prisma, ctx))
    const locations = new LocationRepository(buildContainer(prisma, ctx))
    await ctx.run(tenant, async () => {
      await soignants.findAll()
      await soignants.update('so1', { name: 'N' })
      await locations.delete('l1')
    })
    expect(calls[0].args).toMatchObject({ where: { establishmentId: 'e1' } })
    expect(calls[1].args).toMatchObject({ where: { id_establishmentId: { id: 'so1', establishmentId: 'e1' } } })
    expect(calls[2].args).toMatchObject({ where: { id_establishmentId: { id: 'l1', establishmentId: 'e1' } } })
  })
})
```

- [ ] **Step 2: Vérifier l'échec**

Run: `cd back && npx jest -c src/test/jest.config.ts src/test/unit/infra/repository-scope.test.ts`
Expected: FAIL (constructeurs sans `tenantContext`, `where` sans filtre).

- [ ] **Step 3: `soignant.repository.ts` et `location.repository.ts`**

Même transformation pour les deux (exemple soignant) :

```ts
import type { TenantContextInterface } from '../../../types/utils/tenant-context'

class SoignantRepository implements SoignantRepositoryInterface {
  private readonly prisma: PostgresPrismaClient
  private readonly errorHandler: ErrorHandlerInterface
  private readonly tenantContext: TenantContextInterface

  constructor({ postgresOrm, errorHandler, tenantContext }: IocContainer) {
    this.prisma = postgresOrm.prisma
    this.errorHandler = errorHandler
    this.tenantContext = tenantContext
  }

  private get establishmentScope() {
    return this.tenantContext.establishmentScope()
  }

  findAll(): Promise<SoignantEntityRepo[]> {
    return this.prisma.soignant.findMany({ where: this.establishmentScope })
  }

  async findByID(soignantID: string): Promise<SoignantEntityRepo> {
    try {
      return await this.prisma.soignant.findUniqueOrThrow({
        where: { id_establishmentId: { id: soignantID, ...this.establishmentScope } },
      })
    } catch (err) { /* inchangé */ }
  }

  async create(params: SoignantCreateEntityRepo): Promise<SoignantEntityRepo> {
    try {
      return await this.prisma.soignant.create({ data: { ...params, ...this.establishmentScope } })
    } catch (err) { /* inchangé */ }
  }
  // update et delete : where: { id_establishmentId: { id: soignantID, ...this.establishmentScope } }
}
```

`location.repository.ts` : identique avec `location` et `locationID`.

- [ ] **Step 4: `patient.repository.ts`**

Constructeur et helpers comme ci-dessus, plus `private get scope() { return this.tenantContext.scope() }` (pour les requêtes sur `pathway`, `appointmentPatient`, `patientPathwayPriority`, modèles de service). Méthode par méthode :

- `findAll` : `findMany({ where: this.establishmentScope })`.
- `findAllWithTags` : ajouter `where: this.establishmentScope`. Dans l'`include.appointmentPatients`, ajouter `where: { serviceId: this.scope.serviceId }` pour ne compter que les parcours du service courant (les inclusions d'un modèle de service depuis un patient d'établissement doivent être restreintes au service).
- `findForExport` : `where: { ...this.establishmentScope, ...(search ? … : {}), ...(tags ? { appointmentPatients: { some: { serviceId: this.scope.serviceId, appointment: … } } } : {}) }` ; même `where` sur l'`include.appointmentPatients`.
- `findByID` : `where: { id_establishmentId: { id: patientID, ...this.establishmentScope } }`, `include.appointmentPatients: { where: { serviceId: this.scope.serviceId }, include: { appointment: true } }`, `enrollmentIssues: { where: { serviceId: this.scope.serviceId } }`.
- `create` : `data: { ...patientCreateParams, ...this.establishmentScope }`.
- `update`, `delete` : `where: { id_establishmentId: { id: patientID, ...this.establishmentScope } }`.
- `getPathwaysForPatient` : `pathway.findMany({ where: { ...this.scope, slots: { some: { appointments: { some: { appointmentPatients: { some: { patientId: patientID } } } } } } }, include: { template: …, patientPriorities: { where: { patientID, serviceId: this.scope.serviceId }, … } } })`.
- `setPathwayPriorities` : `deleteMany({ where: { patientID, ...this.scope } })` ; `createMany({ data: ids.map((pathwayID, index) => ({ patientID, pathwayID, priority: index, ...this.scope })) })`.
- `countAppointmentsInPathway` : `count({ where: { ...this.scope, patientId: patientID, appointment: { slot: { pathwayID } } } })`.
- `removeFromPathway` : `appointmentPatient.findMany({ where: { ...this.scope, patientId, appointment: { slot: { pathwayID } } }, … })` ; `tx.appointmentPatient.delete({ where: { id_serviceId: { id: ap.id, serviceId: this.scope.serviceId } } })` ; `tx.appointment.delete({ where: { id_serviceId: { id: ap.appointment.id, serviceId: this.scope.serviceId } } })`.

- [ ] **Step 5: `activityLog.repository.ts`**

Interface : `ActivityLogEntityRepo` gagne `establishmentId: string | null` et `serviceId: string | null` ; `ActivityLogCreateEntityRepo = Omit<ActivityLogEntityRepo, 'id' | 'createdAt' | 'establishmentId' | 'serviceId'>` (le repository les pose). Implémentation :

```ts
  constructor({ postgresOrm, tenantContext }: IocContainer) { … }

  // Contexte lu au moment de l'écriture : null hors requête (runAsSystem).
  private get contextColumns(): { establishmentId: string | null; serviceId: string | null } {
    const store = this.tenantContext.peek()
    if (!store || store.kind !== 'tenant') {
      return { establishmentId: null, serviceId: null }
    }
    return { establishmentId: store.tenant.establishmentId, serviceId: store.tenant.serviceId }
  }

  async create(params: ActivityLogCreateEntityRepo): Promise<void> {
    await this.prisma.activityLog.create({ data: { ...params, ...this.contextColumns } })
  }

  async findMany({ page, action, userID, from }: ActivityLogFindManyParams) {
    const where = {
      ...this.tenantContext.establishmentScope(),
      serviceId: this.tenantContext.current().serviceId ?? undefined,
      ...(action ? { action } : {}), ...(userID ? { userID } : {}), ...(from ? { createdAt: { gte: from } } : {}),
    }
    // reste inchangé
  }

  // Sous runAsSystem (purge planifiée) : toute la table. Sous un tenant : le contexte courant.
  async deleteOlderThan(date: Date): Promise<number> {
    const store = this.tenantContext.peek()
    const where = store?.kind === 'tenant'
      ? { establishmentId: store.tenant.establishmentId, serviceId: store.tenant.serviceId ?? undefined, createdAt: { lt: date } }
      : { createdAt: { lt: date } }
    const result = await this.prisma.activityLog.deleteMany({ where })
    return result.count
  }
```

Attention au garde-fou : `ActivityLog` est un modèle d'établissement, `create` sous `runAsSystem` passe ; sous tenant, `establishmentId` est posé. En `findMany`, `where.establishmentId` est présent.

`application/starter.ts`, dans `scheduleActivityLogCleanup` :

```ts
  const { activityLogDomain, logger, tenantContext } = instances
  const run = (): void => {
    tenantContext
      .runAsSystem(() => activityLogDomain.cleanup())
      .then(…)
```

- [ ] **Step 6: Scinder `soignant.ts` et `location.ts`**

`soignant.ts` exporte désormais deux plugins. `soignantReadRouter` contient `GET /` et `GET /:soignantID`, chacun avec `config: { permission: 'referentials:read' }`. `soignantAdminRouter` contient `POST /`, `PATCH /:soignantID`, `DELETE /:soignantID` avec `config: { permission: 'soignants:manage' }`. Retirer les `onRequest: [fastify.verifySessionCookie]` (la garde globale suffit) et l'import `Boom` s'il devient inutile. Exemple :

```ts
const soignantReadRouter: FastifyPluginAsync = (fastify) => {
  const { soignantDomain } = fastify.iocContainer

  fastify.get('/', {
    schema: { response: { 200: soignantsResponseSchema } },
    config: { permission: 'referentials:read' },
  }, () => soignantDomain.findAll())

  fastify.get<{ Params: GetSoignantByIdParams }>('/:soignantID', {
    schema: { params: getSoignantByIdParamsSchema, response: { 200: soignantResponseSchema, 404: z.object({ message: z.string() }) } },
    config: { permission: 'referentials:read' },
  }, (request) => soignantDomain.findByID(request.params.soignantID))

  return Promise.resolve()
}

const soignantAdminRouter: FastifyPluginAsync = (fastify) => { /* POST, PATCH, DELETE avec config: { permission: 'soignants:manage' } */ }

export { soignantReadRouter, soignantAdminRouter }
```

Le repository soignant est de famille établissement : il fonctionne sous les deux préfixes (`establishmentScope()` ne requiert pas de service).

`location.ts` : idem avec `locationReadRouter` (`referentials:read`) et `locationAdminRouter` (`locations:manage`).

- [ ] **Step 7: Vérifier**

Run: `cd back && npx jest -c src/test/jest.config.ts src/test/unit/infra/repository-scope.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 8: Commit**

```bash
git add back/src
git commit -m "feat(orm): repositories d'etablissement filtres par establishmentId

Claude-Session: https://claude.ai/code/session_01G1JrhGqWHmVH6XB2XTTwJe"
```

---

### Task 10: Repositories de service simples

**Files:**
- Modify: `thematic.repository.ts`, `diagnosticEducatifTemplate.repository.ts`, `diagnosticEducatif.repository.ts`, `enrollmentIssue.repository.ts`, `forbiddenWeek.repository.ts`, `planningCycle.repository.ts`, `todo.repository.ts` (tous sous `back/src/main/infra/orm/repositories/`)
- Modify: `back/src/main/types/infra/orm/repositories/thematic.repository.interface.ts`, `todo.repository.interface.ts`
- Test: `back/src/test/unit/infra/repository-scope.test.ts` (ajout d'un `describe`)

**Interfaces:**
- Produces: `ThematicRepository` renvoie toujours `soignants: Soignant[]` (aplati depuis `soignantLinks`) ; `TodoRepository.findAll()` filtre sur `soignantID = tenant.soignantId` ; `PlanningCycleRepository` sans constante `PLANNING_CYCLE_ID`.
- Convention d'écriture des liens : `soignantLinks: { create: ids.map((soignantId) => ({ soignantId, ...scope })) }` à la création, `soignantLinks: { deleteMany: {}, create: … }` à la mise à jour.

- [ ] **Step 1: Test**

Ajouter au fichier de test :

```ts
import { ThematicRepository } from '../../../main/infra/orm/repositories/thematic.repository'
import { TodoRepository } from '../../../main/infra/orm/repositories/todo.repository'
import { PlanningCycleRepository } from '../../../main/infra/orm/repositories/planningCycle.repository'

describe('scoping des repositories de service simples', () => {
  it('ThematicRepository filtre, cree les liens soignants et aplatit la reponse', async () => {
    const { prisma, calls } = buildFakePrisma()
    const ctx = new TenantContext()
    const repo = new ThematicRepository(buildContainer(prisma, ctx))
    await ctx.run(tenant, async () => {
      await repo.findAll()
      await repo.create({ name: 'T', soignantIDs: ['so1', 'so2'] })
      await repo.update('t1', { soignantIDs: ['so3'] })
    })
    expect(calls[0].args).toMatchObject({ where: { serviceId: 's1' } })
    expect(calls[1].args).toMatchObject({
      data: {
        name: 'T', serviceId: 's1', establishmentId: 'e1',
        soignantLinks: { create: [
          { soignantId: 'so1', serviceId: 's1', establishmentId: 'e1' },
          { soignantId: 'so2', serviceId: 's1', establishmentId: 'e1' },
        ] },
      },
    })
    expect(calls[2].args).toMatchObject({
      where: { id_serviceId: { id: 't1', serviceId: 's1' } },
      data: { soignantLinks: { deleteMany: {}, create: [{ soignantId: 'so3' }] } },
    })
  })

  it('TodoRepository ne voit que les taches du soignant courant', async () => {
    const { prisma, calls } = buildFakePrisma()
    const ctx = new TenantContext()
    const repo = new TodoRepository(buildContainer(prisma, ctx))
    await ctx.run(tenant, async () => {
      await repo.findAll()
      await repo.create({ title: 't', createDate: new Date().toISOString(), completed: false } as never)
    })
    expect(calls[0].args).toMatchObject({ where: { serviceId: 's1', soignantID: 'so1' } })
    expect(calls[1].args).toMatchObject({ data: { serviceId: 's1', establishmentId: 'e1', soignantID: 'so1' } })
  })

  it('PlanningCycleRepository travaille par serviceId', async () => {
    const { prisma, calls } = buildFakePrisma()
    const ctx = new TenantContext()
    const repo = new PlanningCycleRepository(buildContainer(prisma, ctx))
    await ctx.run(tenant, async () => {
      await repo.find()
      await repo.upsert({ startOfWeek: new Date(), weekCount: 6 })
      await repo.delete()
    })
    expect(calls[0].args).toMatchObject({ where: { serviceId: 's1' } })
    expect(calls[1].args).toMatchObject({ where: { serviceId: 's1' }, create: { serviceId: 's1', establishmentId: 'e1', weekCount: 6 } })
    expect(calls[2].args).toMatchObject({ where: { serviceId: 's1' } })
  })
})
```

- [ ] **Step 2: Vérifier l'échec**

Run: `cd back && npx jest -c src/test/jest.config.ts src/test/unit/infra/repository-scope.test.ts`
Expected: FAIL sur les trois nouveaux tests.

- [ ] **Step 3: `thematic.repository.ts`**

```ts
const withSoignants = { include: { soignantLinks: { include: { soignant: true } } } } as const

type ThematicRow = Thematic & { soignantLinks: { soignant: Soignant }[] }
const flatten = ({ soignantLinks, ...thematic }: ThematicRow): ThematicWithSoignantsEntityRepo => ({
  ...thematic,
  soignants: soignantLinks.map((l) => l.soignant),
})

class ThematicRepository implements ThematicRepositoryInterface {
  // constructeur avec tenantContext, `private get scope()`

  async findAll() {
    const rows = await this.prisma.thematic.findMany({ where: this.scope, ...withSoignants })
    return rows.map(flatten)
  }

  async findByID(thematicID: string) {
    try {
      const row = await this.prisma.thematic.findUniqueOrThrow({
        where: { id_serviceId: { id: thematicID, serviceId: this.scope.serviceId } },
        ...withSoignants,
      })
      return flatten(row)
    } catch (err) { /* inchangé */ }
  }

  private links(soignantIDs: string[]) {
    return soignantIDs.map((soignantId) => ({ soignantId, ...this.scope }))
  }

  async create(params: ThematicCreateEntityRepo) {
    try {
      const row = await this.prisma.thematic.create({
        data: {
          name: params.name, duration: params.duration, pdfNotice: params.pdfNotice,
          ...this.scope,
          soignantLinks: { create: this.links(params.soignantIDs) },
        },
        ...withSoignants,
      })
      return flatten(row)
    } catch (err) { /* inchangé */ }
  }

  async update(thematicID: string, params: ThematicUpdateEntityRepo) {
    try {
      const row = await this.prisma.thematic.update({
        where: { id_serviceId: { id: thematicID, serviceId: this.scope.serviceId } },
        data: {
          name: params.name, duration: params.duration, pdfNotice: params.pdfNotice,
          ...(params.soignantIDs && { soignantLinks: { deleteMany: {}, create: this.links(params.soignantIDs) } }),
        },
        ...withSoignants,
      })
      return flatten(row)
    } catch (err) { /* inchangé */ }
  }

  async delete(thematicID: string) {
    // where: { id_serviceId: { id: thematicID, serviceId: this.scope.serviceId } }
  }
}
```

Importer `Soignant`, `Thematic` depuis `../../../../generated/client`. L'interface `ThematicRepositoryInterface` ne change pas de forme.

- [ ] **Step 4: Repositories sans relation**

`diagnosticEducatifTemplate.repository.ts` : `findAll` → `where: this.scope` ; `findByID`/`update`/`delete` → `where: { id_serviceId: { id, serviceId: this.scope.serviceId } }` ; `create` → `data: { ...params, ...this.scope }`.

`diagnosticEducatif.repository.ts` : `findByPatientID` → `where: { patientId, ...this.scope }` ; `findByID`/`update`/`delete` → clé composite ; `create` → `data: { ...params, ...this.scope }`.

`enrollmentIssue.repository.ts` : `findByPatientID` → `where: { patientId: patientID, ...this.scope }` ; `create` → `data: issues.map((issue) => ({ ...issue, patientId: patientID, ...this.scope }))` ; `delete` → clé composite.

`forbiddenWeek.repository.ts` : `findAll` → `where: this.scope` ; `create` → `data: { ...params, ...this.scope }` ; `delete` → clé composite.

`planningCycle.repository.ts` : supprimer `PLANNING_CYCLE_ID`.

```ts
  find() {
    return this.prisma.planningCycle.findUnique({ where: { serviceId: this.scope.serviceId } })
  }
  async upsert(params) {
    return await this.prisma.planningCycle.upsert({
      where: { serviceId: this.scope.serviceId },
      create: { ...this.scope, ...params },
      update: params,
    })
  }
  async delete() {
    await this.prisma.planningCycle.deleteMany({ where: { serviceId: this.scope.serviceId } })
  }
```

`todo.repository.ts` : les tâches sont personnelles. `findAll` → `where: { ...this.scope, soignantID: this.tenantContext.currentService().soignantId }` ; `create` → `data: { ...params, ...this.scope, soignantID: this.tenantContext.currentService().soignantId }` ; `findByID`/`update`/`delete` → clé composite. Un utilisateur sans profil soignant (`soignantId` nul) voit les tâches à `soignantID: null` du service, comme aujourd'hui les tâches sans soignant. Retirer `soignantID` de `TodoCreateEntityRepo` s'il y figure côté client (le repository le pose).

- [ ] **Step 5: Vérifier**

Run: `cd back && npx jest -c src/test/jest.config.ts src/test/unit/infra/repository-scope.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add back/src
git commit -m "feat(orm): repositories de service simples filtres par serviceId

Claude-Session: https://claude.ai/code/session_01G1JrhGqWHmVH6XB2XTTwJe"
```

---

### Task 11: Repositories slotTemplate et slot

**Files:**
- Modify: `back/src/main/infra/orm/repositories/slotTemplate.repository.ts`, `slot.repository.ts`
- Modify: `back/src/main/types/infra/orm/repositories/slotTemplate.repository.interface.ts`
- Create: `back/src/main/infra/orm/includes/slot-template.include.ts` (include partagé + aplatissement)
- Test: `back/src/test/unit/infra/repository-scope.test.ts` (ajout)

**Interfaces:**
- Produces: `slotTemplateInclude` (`{ soignantLinks: { include: { soignant: true } }, template: true, location: true, thematic: true }`), `flattenSlotTemplate(row)` → `SlotTemplateDTORepo` avec `soignants: Soignant[]`, `flattenSlot(row)` qui aplatit `slotTemplate.soignantLinks` en `slotTemplate.soignants`. Utilisés aussi par pathway et appointment (tâches 12, 13).

- [ ] **Step 1: Test**

```ts
import { SlotTemplateRepository } from '../../../main/infra/orm/repositories/slotTemplate.repository'
import { SlotRepository } from '../../../main/infra/orm/repositories/slot.repository'

describe('scoping slotTemplate et slot', () => {
  it('SlotTemplateRepository cree avec liens et scope, filtre updateMany', async () => {
    const { prisma, calls } = buildFakePrisma()
    const ctx = new TenantContext()
    const repo = new SlotTemplateRepository(buildContainer(prisma, ctx))
    await ctx.run(tenant, async () => {
      await repo.create({ startTime: new Date(), endTime: new Date(), offsetDays: 0, isIndividual: true, color: '#fff', soignantIDs: ['so1'] } as never)
      await repo.updateMany(['a', 'b'], { color: '#000' })
    })
    expect(calls[0].args).toMatchObject({
      data: { serviceId: 's1', establishmentId: 'e1', soignantLinks: { create: [{ soignantId: 'so1', serviceId: 's1', establishmentId: 'e1' }] } },
    })
    expect(calls[1].args).toMatchObject({ where: { id: { in: ['a', 'b'] }, serviceId: 's1' } })
  })

  it('SlotRepository filtre la fenetre de dates par service', async () => {
    const { prisma, calls } = buildFakePrisma()
    const ctx = new TenantContext()
    const repo = new SlotRepository(buildContainer(prisma, ctx))
    await ctx.run(tenant, async () => {
      await repo.findAll({ from: new Date('2026-01-01'), to: new Date('2026-02-01') })
      await repo.delete('sl1')
    })
    expect(calls[0].args).toMatchObject({ where: { serviceId: 's1', endDate: { gt: expect.any(Date) } } })
    expect(calls[1].args).toMatchObject({ where: { id_serviceId: { id: 'sl1', serviceId: 's1' } } })
  })
})
```

- [ ] **Step 2: Vérifier l'échec**

Run: `cd back && npx jest -c src/test/jest.config.ts src/test/unit/infra/repository-scope.test.ts`
Expected: FAIL sur les deux nouveaux.

- [ ] **Step 3: Include partagé**

`back/src/main/infra/orm/includes/slot-template.include.ts` :

```ts
import type { Location, PathwayTemplate, Slot, SlotTemplate, Soignant, Thematic } from '../../../generated/client'

export const soignantLinksInclude = { soignantLinks: { include: { soignant: true } } } as const

export const slotTemplateInclude = {
  ...soignantLinksInclude,
  template: true,
  location: true,
  thematic: true,
} as const

type SlotTemplateRow = SlotTemplate & {
  soignantLinks: { soignant: Soignant }[]
  template?: PathwayTemplate | null
  location?: Location | null
  thematic?: Thematic | null
}

// Prisma renvoie les liens explicites ; l'API expose `soignants: Soignant[]`.
export const flattenSlotTemplate = <T extends SlotTemplateRow>({ soignantLinks, ...rest }: T) => ({
  ...rest,
  soignants: soignantLinks.map((l) => l.soignant),
})

type SlotRow = Slot & { slotTemplate: SlotTemplateRow }
export const flattenSlot = <T extends SlotRow>({ slotTemplate, ...rest }: T) => ({
  ...rest,
  slotTemplate: flattenSlotTemplate(slotTemplate),
})
```

- [ ] **Step 4: `slotTemplate.repository.ts`**

Remplacer `applyConnect`/`applySet` :

```ts
  private links(soignantIDs: string[]) {
    return soignantIDs.map((soignantId) => ({ soignantId, ...this.scope }))
  }
  private createData(params: SlotTemplateCreateEntityRepo) {
    const { soignantIDs, ...rest } = params
    return {
      ...rest,
      ...this.scope,
      ...(soignantIDs !== undefined && { soignantLinks: { create: this.links(soignantIDs) } }),
    }
  }
  private updateData(params: SlotTemplateUpdateEntityRepo) {
    const { soignantIDs, ...rest } = params
    return {
      ...rest,
      ...(soignantIDs !== undefined && { soignantLinks: { deleteMany: {}, create: this.links(soignantIDs) } }),
    }
  }
```

Puis : `findAll` → `findMany({ where: this.scope, include: slotTemplateInclude })` et `.map(flattenSlotTemplate)` ; `findByID`/`update`/`delete` → `where: { id_serviceId: { id, serviceId: this.scope.serviceId } }`, `include: slotTemplateInclude`, résultat passé à `flattenSlotTemplate` ; `create` → `data: this.createData(params)` ; `updateMany` → `where: { id: { in: slotTemplateIDs }, serviceId: this.scope.serviceId }`. Supprimer le `console.error`.

Interface : `SlotTemplateCreateEntityRepo = Omit<Prisma.SlotTemplateUncheckedCreateInput, 'establishmentId' | 'serviceId'> & { soignantIDs?: string[]; templateID?: string }` (le repository pose les colonnes de tenant).

- [ ] **Step 5: `slot.repository.ts`**

Include partagé :

```ts
const slotInclude = {
  slotTemplate: { include: slotTemplateInclude },
  pathway: { include: { template: true } },
  appointments: { include: { thematic: true, appointmentPatients: { include: { patient: true } } } },
} as const
```

- `findAll` : `where: { ...this.scope, ...(from…), ...(to…) }`, `include: slotInclude`, `.map(flattenSlot)`.
- `findByID` : `where: { id_serviceId: { id: slotID, serviceId: this.scope.serviceId } }`, `flattenSlot`.
- `create` : `data: { ...slotCreateParams, ...this.scope }`, `flattenSlot`.
- `update` : dans la transaction, `tx.slotTemplate.update({ where: { id_serviceId: { id: slotTemplateData.id, serviceId: this.scope.serviceId } }, data })` où `data` remplace `soignants: { set }` par `soignantLinks: { deleteMany: {}, create: soignantIDs.map((soignantId) => ({ soignantId, ...this.scope })) }` ; puis `tx.slot.update({ where: { id_serviceId: { id: slotID, serviceId: this.scope.serviceId } }, data: slotData, include: slotInclude })`, résultat `flattenSlot`.
- `delete` : clé composite.

- [ ] **Step 6: Vérifier**

Run: `cd back && npx jest -c src/test/jest.config.ts src/test/unit/infra/repository-scope.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 7: Commit**

```bash
git add back/src
git commit -m "feat(orm): slotTemplate et slot filtres par service, liens soignants explicites

Claude-Session: https://claude.ai/code/session_01G1JrhGqWHmVH6XB2XTTwJe"
```

---

### Task 12: Repositories pathwayTemplate et pathway

**Files:**
- Modify: `back/src/main/infra/orm/repositories/pathwayTemplate.repository.ts`, `pathway.repository.ts`
- Modify: `back/src/main/types/infra/orm/repositories/pathwayTemplate.repository.interface.ts`, `pathway.repository.interface.ts` (types dérivés si nécessaire)
- Test: `back/src/test/unit/infra/repository-scope.test.ts` (ajout)

**Interfaces:**
- Consumes: `slotTemplateInclude`, `flattenSlotTemplate`, `soignantLinksInclude` (tâche 11).
- Produces: les DTO conservent `slotTemplates[].soignants: Soignant[]` et `slots[].slotTemplate.soignants`.

- [ ] **Step 1: Test**

```ts
import { PathwayRepository } from '../../../main/infra/orm/repositories/pathway.repository'
import { PathwayTemplateRepository } from '../../../main/infra/orm/repositories/pathwayTemplate.repository'

describe('scoping pathwayTemplate et pathway', () => {
  it('PathwayTemplateRepository filtre et reordonne dans le service', async () => {
    const { prisma, calls } = buildFakePrisma()
    const ctx = new TenantContext()
    const repo = new PathwayTemplateRepository(buildContainer(prisma, ctx))
    await ctx.run(tenant, async () => {
      await repo.findAll()
      await repo.reorder(['a', 'b'])
      await repo.create({ name: 'N', color: '#fff', mainTag: 't' } as never)
    })
    expect(calls[0].args).toMatchObject({ where: { serviceId: 's1' }, orderBy: { displayOrder: 'asc' } })
    expect(calls[1].args).toMatchObject({ where: { id_serviceId: { id: 'a', serviceId: 's1' } }, data: { displayOrder: 0 } })
    expect(calls[3].args).toMatchObject({ data: { name: 'N', serviceId: 's1', establishmentId: 'e1' } })
  })

  it('PathwayRepository filtre les recherches par tag et le suivi mensuel', async () => {
    const { prisma, calls } = buildFakePrisma()
    const ctx = new TenantContext()
    const repo = new PathwayRepository(buildContainer(prisma, ctx))
    await ctx.run(tenant, async () => {
      await repo.findByTemplateTagAndDate('tag', new Date())
      await repo.findTracking(2026, 3)
      await repo.create({ startDate: '2026-03-02', templateID: 'pt', slotIDs: ['sl'] })
    })
    expect(calls[0].args).toMatchObject({ where: { serviceId: 's1', template: { mainTag: 'tag' } } })
    expect(calls[1].args).toMatchObject({ where: { serviceId: 's1' } })
    expect(calls[2].args).toMatchObject({ where: { pathwayID: { in: [] }, serviceId: 's1' } })
    expect(calls[3].args).toMatchObject({ data: { serviceId: 's1', establishmentId: 'e1', templateID: 'pt', slots: { connect: [{ id_serviceId: { id: 'sl', serviceId: 's1' } }] } } })
  })
})
```

- [ ] **Step 2: Vérifier l'échec**

Run: `cd back && npx jest -c src/test/jest.config.ts src/test/unit/infra/repository-scope.test.ts`
Expected: FAIL sur les deux nouveaux.

- [ ] **Step 3: `pathwayTemplate.repository.ts`**

```ts
const withSlotTemplates = { slotTemplates: { include: { ...soignantLinksInclude, location: true, thematic: true } } } as const

type Row = PathwayTemplate & { slotTemplates: Parameters<typeof flattenSlotTemplate>[0][] }
const flatten = <T extends Row>({ slotTemplates, ...rest }: T) => ({
  ...rest,
  slotTemplates: slotTemplates.map(flattenSlotTemplate),
})
```

- `findAll` : `findMany({ where: this.scope, include: withSlotTemplates, orderBy: { displayOrder: 'asc' } })` puis `.map(flatten)`.
- `reorder` : `this.prisma.pathwayTemplate.update({ where: { id_serviceId: { id, serviceId: this.scope.serviceId } }, data: { displayOrder: index } })`.
- `findByID` : clé composite + `include: withSlotTemplates`, `flatten`.
- `create` : `data: { ...pathwayTemplateData, ...this.scope, slotTemplates: { connect: slotTemplateIDs?.map((id) => ({ id_serviceId: { id, serviceId: this.scope.serviceId } })) } }`, `flatten`.
- `update` : clé composite ; `connect` en composite comme ci-dessus ; `flatten`.
- `delete` : clé composite ; `flatten`.

Les `connect` par clé composite garantissent qu'on ne rattache pas un modèle de créneau d'un autre service.

- [ ] **Step 4: `pathway.repository.ts`**

Ajouter `tenantContext`, `private get scope()`. Include des créneaux partagé :

```ts
const slotsWithTemplateInclude = {
  slots: {
    include: {
      slotTemplate: { include: soignantLinksInclude },
      appointments: { include: { appointmentPatients: { include: { patient: true } } } },
    },
  },
} as const
const flattenSlots = <T extends { slots: Parameters<typeof flattenSlot>[0][] }>({ slots, ...rest }: T) => ({
  ...rest,
  slots: slots.map(flattenSlot),
})
```

Méthode par méthode :

- `findAll` : `where: this.scope`.
- `findByID` : clé composite.
- `findByTemplateIDAndDate` : `where: { ...this.scope, startDate: { gte }, template: { id } }`, `include: slotsWithTemplateInclude`, `.map(flattenSlots)`.
- `regenerate` : `this.prisma.pathwayTemplate.findUnique({ where: { id_serviceId: { id: pathwayTemplateID, serviceId: this.scope.serviceId } }, include: { slotTemplates: { include: soignantLinksInclude } } })`. Dans la transaction : `tx.forbiddenWeek.findMany({ where: this.scope })` ; `tx.pathway.findMany({ where: { ...this.scope, templateID, startDate: { gte } }, … })` ; `tx.slot.deleteMany({ where: { id: { in: emptySlotIDs }, serviceId: this.scope.serviceId } })` ; `tx.slotTemplate.deleteMany({ where: { id: { in: emptyTemplateIDs }, templateID: null, serviceId: this.scope.serviceId } })` ; création du clone :

```ts
            const clonedSlotTemplate = await tx.slotTemplate.create({
              data: {
                ...this.scope,
                startTime: slotTemplate.startTime, endTime: slotTemplate.endTime, offsetDays: effectiveOffset,
                isIndividual: slotTemplate.isIndividual, capacity: slotTemplate.capacity,
                thematicId: slotTemplate.thematicId, locationID: slotTemplate.locationID,
                description: slotTemplate.description, color: slotTemplate.color,
                soignantLinks: {
                  create: slotTemplate.soignantLinks.map((l) => ({ soignantId: l.soignantId, ...this.scope })),
                },
              },
            })
            await tx.slot.create({
              data: { ...this.scope, startDate: start, endDate: end, slotTemplateID: clonedSlotTemplate.id, pathwayID: pathway.id },
            })
```

- `findByTemplateTagAndDate`, `findByTemplateTagWithFutureSlots` : `where: { ...this.scope, … }`, include partagé, `flattenSlots`.
- `findTracking` : `where: { ...this.scope, slots: { some: … } }` ; `slot.groupBy({ by: ['pathwayID'], where: { pathwayID: { in: pathwayIds }, serviceId: this.scope.serviceId }, _max: … })`.
- `create` :

```ts
      return await this.prisma.pathway.create({
        data: {
          ...this.scope,
          startDate: pathwayCreateParams.startDate,
          templateID: pathwayCreateParams.templateID ?? null,
          slots: {
            connect: pathwayCreateParams.slotIDs.map((id) => ({ id_serviceId: { id, serviceId: this.scope.serviceId } })),
          },
        },
      })
```

(le `connect` sur `template` devient un simple `templateID` : la cohérence de service du modèle est vérifiée par le domaine, tâche 14).

- `update` : clé composite.
- `delete` : dans la transaction, `tx.pathway.findUniqueOrThrow({ where: { id_serviceId: … } })`, `tx.slot.deleteMany({ where: { id: { in: slotIDs }, serviceId } })`, `tx.slotTemplate.deleteMany({ where: { id: { in: slotTemplateIDs }, serviceId } })`, `tx.pathway.delete({ where: { id_serviceId: … } })`.

- [ ] **Step 5: Vérifier**

Run: `cd back && npx jest -c src/test/jest.config.ts src/test/unit/infra/repository-scope.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 6: Commit**

```bash
git add back/src
git commit -m "feat(orm): pathway et pathwayTemplate filtres par service

Claude-Session: https://claude.ai/code/session_01G1JrhGqWHmVH6XB2XTTwJe"
```

---

### Task 13: Repository appointment

**Files:**
- Modify: `back/src/main/infra/orm/repositories/appointment.repository.ts`
- Test: `back/src/test/unit/infra/repository-scope.test.ts` (ajout)

**Interfaces:**
- Produces: `appointmentPatients` créés avec `serviceId`/`establishmentId` ; réponses aplaties (`slot.slotTemplate.soignants`).

- [ ] **Step 1: Test**

```ts
import { AppointmentRepository } from '../../../main/infra/orm/repositories/appointment.repository'

describe('scoping appointment', () => {
  it('cree le rendez-vous et ses patients avec les colonnes de tenant', async () => {
    const { prisma, calls } = buildFakePrisma()
    const ctx = new TenantContext()
    const repo = new AppointmentRepository(buildContainer(prisma, ctx))
    await ctx.run(tenant, async () => {
      await repo.create({ startDate: new Date(), endDate: new Date(), slotID: 'sl', patientIDs: ['p1'] } as never)
      await repo.addPatientToAppointment({ appointmentID: 'a1', patientID: 'p2' } as never)
      await repo.deleteOrphanedByIds(['a1'])
    })
    expect(calls[0].args).toMatchObject({
      data: {
        serviceId: 's1', establishmentId: 'e1', slotID: 'sl',
        appointmentPatients: { create: [{ patientId: 'p1', serviceId: 's1', establishmentId: 'e1' }] },
      },
    })
    expect(calls[1].args).toMatchObject({ data: { appointmentId: 'a1', patientId: 'p2', serviceId: 's1', establishmentId: 'e1' } })
    expect(calls[2].args).toMatchObject({ where: { id: { in: ['a1'] }, serviceId: 's1', appointmentPatients: { none: {} } } })
  })
})
```

- [ ] **Step 2: Vérifier l'échec**

Run: `cd back && npx jest -c src/test/jest.config.ts src/test/unit/infra/repository-scope.test.ts`
Expected: FAIL sur le nouveau test.

- [ ] **Step 3: Implémentation**

Include partagé en tête de fichier :

```ts
const appointmentInclude = {
  thematic: true,
  appointmentPatients: { include: { patient: true } },
} as const
const appointmentWithSlotInclude = {
  ...appointmentInclude,
  slot: { include: { slotTemplate: { include: { ...soignantLinksInclude, location: true, thematic: true } } } },
} as const
type WithSlot = { slot?: Parameters<typeof flattenSlot>[0] | null }
const flattenAppointment = <T extends WithSlot>(row: T) =>
  row.slot ? { ...row, slot: flattenSlot(row.slot) } : row
```

- `findAll` : `where: this.scope`, `include: appointmentInclude`.
- `findByID` : clé composite, `include: appointmentWithSlotInclude`, `flattenAppointment`.
- `create` :

```ts
      const { patientIDs, transmissionNotes, ...rest } = appointmentCreateParams
      return await this.prisma.appointment.create({
        data: {
          ...rest,
          ...this.scope,
          appointmentPatients: {
            create: (patientIDs ?? []).map((patientId) => ({
              patientId,
              ...this.scope,
              transmissionNotes: transmissionNotes ?? undefined,
            })),
          },
        },
        include: appointmentInclude,
      })
```

(passage de `patient: { connect }` à `patientId` direct : le `UncheckedCreateInput` imbriqué accepte les clés étrangères ; la clé composite `(patientId, establishmentId)` refuse un patient d'un autre établissement).

- `update` : toutes les `where: { id: appointmentID }` → `where: { id_serviceId: { id: appointmentID, serviceId: this.scope.serviceId } }` ; `deleteMany({ where: { appointmentId: appointmentID, serviceId: this.scope.serviceId, id: { notIn } } })` ; l'`upsert` par `id` :

```ts
          await tx.appointmentPatient.upsert({
            where: { id_serviceId: { id: ap.id ?? '', serviceId: this.scope.serviceId } },
            update: { accompanying: ap.accompanying, status: ap.status, rejectionReason: ap.rejectionReason, transmissionNotes: ap.transmissionNotes },
            create: {
              ...this.scope,
              accompanying: ap.accompanying, status: ap.status, rejectionReason: ap.rejectionReason, transmissionNotes: ap.transmissionNotes,
              appointmentId: appointmentID,
              patientId: ap.patientID,
            },
          })
```

- `addPatientToAppointment` : `data: { ...this.scope, appointmentId: appointmentID, patientId: patientID, accompanying, status, rejectionReason, transmissionNotes }`.
- `deleteOrphanedByIds` : `where: { id: { in }, serviceId: this.scope.serviceId, appointmentPatients: { none: {} } }`.
- `delete` : clé composite.

- [ ] **Step 4: Vérifier**

Run: `cd back && npx jest -c src/test/jest.config.ts src/test/unit/infra/repository-scope.test.ts`
Expected: PASS (10 tests).

- [ ] **Step 5: Commit**

```bash
git add back/src
git commit -m "feat(orm): appointment et appointmentPatient filtres par service

Claude-Session: https://claude.ai/code/session_01G1JrhGqWHmVH6XB2XTTwJe"
```

---

### Task 14: Cohérence des références nullables dans les domaines

**Files:**
- Modify: `back/src/main/domain/slotTemplate.domain.ts`, `appointment.domain.ts`, `pathway.domain.ts`, `diagnosticEducatif.domain.ts`
- Test: `back/src/test/unit/domain/slotTemplate.domain.test.ts` (nouveau)

**Interfaces:**
- Consumes: `locationRepository.findByID`, `thematicRepository.findByID`, `pathwayTemplateRepository.findByID`, `diagnosticEducatifTemplateRepository.findByID` (tous filtrés par tenant, 404 si étranger).
- Règle : avant d'écrire une référence nullable (`locationID`, `thematicId`, `templateID`, `pathwayID`, `templateId`), le domaine charge l'entité cible par son repository. Le 404 remonte tel quel : « la salle référencée n'existe pas » est la bonne réponse pour une salle d'un autre établissement.

- [ ] **Step 1: Test**

`back/src/test/unit/domain/slotTemplate.domain.test.ts` :

```ts
import Boom from '@hapi/boom'

import { SlotTemplateDomain } from '../../../main/domain/slotTemplate.domain'
import type { IocContainer } from '../../../main/types/application/ioc'

const buildDomain = (known: { locations: string[]; thematics: string[] }) => {
  const created: unknown[] = []
  const notFound = (name: string) => Promise.reject(Boom.notFound(`${name} not found`))
  const container = {
    slotTemplateRepository: {
      create: (params: unknown) => { created.push(params); return Promise.resolve({ id: 'st', ...(params as object) }) },
      update: (_id: string, params: unknown) => Promise.resolve({ id: 'st', ...(params as object) }),
    },
    locationRepository: { findByID: (id: string) => (known.locations.includes(id) ? Promise.resolve({ id }) : notFound('Location')) },
    thematicRepository: { findByID: (id: string) => (known.thematics.includes(id) ? Promise.resolve({ id }) : notFound('Thematic')) },
  } as unknown as IocContainer
  return { domain: new SlotTemplateDomain(container), created }
}

const base = { startTime: new Date(), endTime: new Date(), offsetDays: 0, isIndividual: true, color: '#fff' }

describe('SlotTemplateDomain references', () => {
  it('cree quand la salle et la thematique sont connues du tenant', async () => {
    const { domain, created } = buildDomain({ locations: ['l1'], thematics: ['t1'] })
    await domain.create({ ...base, locationID: 'l1', thematicId: 't1' } as never)
    expect(created).toHaveLength(1)
  })

  it('refuse une salle inconnue du tenant en 404', async () => {
    const { domain } = buildDomain({ locations: [], thematics: ['t1'] })
    await expect(domain.create({ ...base, locationID: 'autre', thematicId: 't1' } as never))
      .rejects.toMatchObject({ output: { statusCode: 404 } })
  })

  it('ignore les references nulles ou absentes', async () => {
    const { domain, created } = buildDomain({ locations: [], thematics: [] })
    await domain.create({ ...base, locationID: null, thematicId: undefined } as never)
    await domain.update('st', { color: '#000' } as never)
    expect(created).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Vérifier l'échec**

Run: `cd back && npx jest -c src/test/jest.config.ts src/test/unit/domain/slotTemplate.domain.test.ts`
Expected: FAIL (le domaine ne vérifie rien et le constructeur ne prend pas ces repositories).

- [ ] **Step 3: `slotTemplate.domain.ts`**

```ts
class SlotTemplateDomain implements SlotTemplateDomainInterface {
  private readonly slotTemplateRepository: SlotTemplateRepositoryInterface
  private readonly locationRepository: LocationRepositoryInterface
  private readonly thematicRepository: ThematicRepositoryInterface

  constructor({ slotTemplateRepository, locationRepository, thematicRepository }: IocContainer) { … }

  // Les références nullables n'ont pas de clé composite en base : on vérifie
  // que la cible appartient au tenant en la chargeant par son repository filtré.
  private async assertReferences(params: { locationID?: string | null; thematicId?: string | null }): Promise<void> {
    if (params.locationID) {
      await this.locationRepository.findByID(params.locationID)
    }
    if (params.thematicId) {
      await this.thematicRepository.findByID(params.thematicId)
    }
  }

  async create(params: SlotTemplateCreateEntityDomain): Promise<SlotTemplateDTODomain> {
    await this.assertReferences(params)
    return await this.slotTemplateRepository.create({ ...params })
  }

  async update(id: string, params: SlotTemplateUpdateEntityDomain): Promise<SlotTemplateDTODomain> {
    await this.assertReferences(params)
    return await this.slotTemplateRepository.update(id, params)
  }
}
```

Attention à l'ordre d'enregistrement Awilix : `locationRepository` et `thematicRepository` doivent être enregistrés avant que `slotTemplateDomain` soit résolu. Les résolutions sont paresseuses (à la première utilisation), donc l'ordre des `register` n'importe pas.

- [ ] **Step 4: Les autres domaines**

`appointment.domain.ts` : ajouter `thematicRepository` au constructeur ; dans `create` et `update`, avant l'écriture : `if (params.thematicId) { await this.thematicRepository.findByID(params.thematicId) }`.

`pathway.domain.ts` : ajouter `pathwayTemplateRepository` ; dans `create`, `if (params.templateID) { await this.pathwayTemplateRepository.findByID(params.templateID) }`.

`slot.domain.ts` : `pathwayID` n'est jamais posé depuis le client (le parcours connecte ses créneaux par clé composite) : rien à faire, vérifier avec `grep -n pathwayID src/main/domain/slot.domain.ts`.

`diagnosticEducatif.domain.ts` : dans `create`/`update`, `if (params.templateId) { await this.diagnosticEducatifTemplateRepository.findByID(params.templateId) }` (ajouter le repository au constructeur si absent).

`todo.domain.ts` : `soignantID` est désormais posé par le repository depuis le tenant, plus jamais depuis le client : retirer `soignantID` du schéma de création `todo.schema.ts` s'il y figure.

- [ ] **Step 5: Vérifier**

Run: `cd back && npx jest -c src/test/jest.config.ts src/test/unit/domain`
Expected: PASS (les tests existants `patient.domain.test.ts` et `planningCycle.domain.test.ts` peuvent nécessiter d'ajouter les nouveaux repositories factices au container ; les adapter).

- [ ] **Step 6: Commit**

```bash
git add back/src
git commit -m "feat(domain): verifier l'appartenance au tenant des references nullables

Claude-Session: https://claude.ai/code/session_01G1JrhGqWHmVH6XB2XTTwJe"
```

---

### Task 15: Permissions par route, membres, et retour au vert (checkpoint)

**Files:**
- Modify: chaque routeur de `back/src/main/interfaces/http/fastify/routes/` (`activityLog.ts`, `appointment.ts`, `diagnosticEducatif.ts`, `diagnosticEducatifTemplate.ts`, `enrollmentIssue.ts`, `forbiddenWeek.ts`, `pathway.ts`, `pathwayTemplate.ts`, `patient.ts`, `planningCycle.ts`, `slot.ts`, `slotTemplate.ts`, `thematic.ts`, `todo.ts`)
- Create: `back/src/main/types/infra/orm/repositories/membership.repository.interface.ts`, `back/src/main/infra/orm/repositories/membership.repository.ts`
- Create: `back/src/main/types/domain/membership.domain.interface.ts`, `back/src/main/domain/membership.domain.ts`
- Create: `back/src/main/interfaces/http/fastify/schemas/members.schema.ts`, `back/src/main/interfaces/http/fastify/routes/members.ts`
- Modify: `back/src/main/application/ioc/awilix/awilix-ioc-container.ts`, `back/src/main/types/application/ioc.ts`
- Modify: `back/src/main/services/activity-log.subscriber.ts` (si le type `userRepository.findByID` a changé de forme, rien à faire ; vérifier)
- Test: `back/src/test/unit/domain/membership.domain.test.ts`

**Interfaces:**
- Produces:

```ts
// membership.repository.interface.ts
type MembershipRow = EstablishmentMembership & {
  user: Pick<User, 'id' | 'email' | 'firstName' | 'lastName' | 'deactivatedAt'>
  serviceMemberships: Pick<ServiceMembership, 'serviceId' | 'role'>[]
}
type ServiceAssignment = { serviceId: string; role: ServiceRole }
type MembershipCreateRepo = { userId: string; role: EstablishmentRole; soignantId: string | null; services: ServiceAssignment[] }
type MembershipUpdateRepo = { role?: EstablishmentRole; soignantId?: string | null; services?: ServiceAssignment[] }
interface MembershipRepositoryInterface {
  findAll(): Promise<MembershipRow[]>
  findByID(id: string): Promise<MembershipRow>
  findByUserID(userId: string): Promise<MembershipRow | null>
  countAdmins(): Promise<number>
  create(params: MembershipCreateRepo): Promise<MembershipRow>
  update(id: string, params: MembershipUpdateRepo): Promise<MembershipRow>
  delete(id: string): Promise<void>
  serviceExists(serviceId: string): Promise<boolean>
}
// membership.domain.interface.ts
interface MembershipDomainInterface {
  findAll(): Promise<MembershipRow[]>
  addByEmail(params: { email: string; role: EstablishmentRole; soignantId: string | null; services: ServiceAssignment[] }): Promise<MembershipRow>
  update(id: string, params: MembershipUpdateRepo): Promise<MembershipRow>
  remove(id: string): Promise<void>
  setDeactivated(id: string, deactivated: boolean): Promise<MembershipRow>
}
```

- Le domaine reçoit `tenantContext` pour connaître l'utilisateur courant (`current().userId`).

- [ ] **Step 1: Test du domaine membres**

`back/src/test/unit/domain/membership.domain.test.ts` :

```ts
import Boom from '@hapi/boom'

import { MembershipDomain } from '../../../main/domain/membership.domain'
import type { IocContainer } from '../../../main/types/application/ioc'
import { TenantContext } from '../../../main/utils/tenant-context'
import type { MembershipRow } from '../../../main/types/infra/orm/repositories/membership.repository.interface'

const row = (over: Partial<MembershipRow>): MembershipRow => ({
  id: 'em1', userId: 'u1', establishmentId: 'e1', role: 'ADMIN', soignantId: null, createdAt: new Date(),
  user: { id: 'u1', email: 'a@b.fr', firstName: null, lastName: null, deactivatedAt: null },
  serviceMemberships: [],
  ...over,
})

const build = (rows: MembershipRow[], admins = 1) => {
  const ctx = new TenantContext()
  const calls: string[] = []
  const container = {
    tenantContext: ctx,
    membershipRepository: {
      findAll: () => Promise.resolve(rows),
      findByID: (id: string) => {
        const found = rows.find((r) => r.id === id)
        return found ? Promise.resolve(found) : Promise.reject(Boom.notFound())
      },
      findByUserID: (userId: string) => Promise.resolve(rows.find((r) => r.userId === userId) ?? null),
      countAdmins: () => Promise.resolve(admins),
      create: (p: unknown) => { calls.push('create'); return Promise.resolve(row({ id: 'new', ...(p as object) })) },
      update: (id: string, p: unknown) => { calls.push('update'); return Promise.resolve(row({ id, ...(p as object) })) },
      delete: () => { calls.push('delete'); return Promise.resolve() },
      serviceExists: (id: string) => Promise.resolve(id === 's1'),
    },
    userRepository: {
      findByEmail: (email: string) => (email === 'new@b.fr' ? Promise.resolve({ id: 'u2' }) : Promise.reject(Boom.notFound())),
      setDeactivated: () => { calls.push('deactivate'); return Promise.resolve({}) },
    },
    soignantRepository: { findByID: (id: string) => (id === 'so1' ? Promise.resolve({ id }) : Promise.reject(Boom.notFound())) },
  } as unknown as IocContainer
  return { domain: new MembershipDomain(container), ctx, calls }
}
const asAdmin = (ctx: TenantContext, fn: () => Promise<unknown>) =>
  ctx.run({ userId: 'u1', establishmentId: 'e1', establishmentRole: 'ADMIN', serviceId: null, serviceRole: null, soignantId: null }, fn)

describe('MembershipDomain', () => {
  it('rattache une identite existante par e-mail', async () => {
    const { domain, ctx, calls } = build([row({})])
    await asAdmin(ctx, () => domain.addByEmail({ email: 'new@b.fr', role: 'MEMBER', soignantId: 'so1', services: [{ serviceId: 's1', role: 'INTERVENANT' }] }))
    expect(calls).toEqual(['create'])
  })

  it('refuse un e-mail inconnu, un service etranger, un soignant etranger', async () => {
    const { domain, ctx } = build([row({})])
    await expect(asAdmin(ctx, () => domain.addByEmail({ email: 'x@b.fr', role: 'MEMBER', soignantId: null, services: [] }))).rejects.toMatchObject({ output: { statusCode: 404 } })
    await expect(asAdmin(ctx, () => domain.addByEmail({ email: 'new@b.fr', role: 'MEMBER', soignantId: null, services: [{ serviceId: 'zz', role: 'LECTURE' }] }))).rejects.toMatchObject({ output: { statusCode: 404 } })
    await expect(asAdmin(ctx, () => domain.addByEmail({ email: 'new@b.fr', role: 'MEMBER', soignantId: 'zz', services: [] }))).rejects.toMatchObject({ output: { statusCode: 404 } })
  })

  it('refuse de retrograder ou retirer le dernier administrateur, et de se desactiver soi-meme', async () => {
    const { domain, ctx } = build([row({})], 1)
    await expect(asAdmin(ctx, () => domain.update('em1', { role: 'MEMBER' }))).rejects.toMatchObject({ output: { statusCode: 409 } })
    await expect(asAdmin(ctx, () => domain.remove('em1'))).rejects.toMatchObject({ output: { statusCode: 409 } })
    await expect(asAdmin(ctx, () => domain.setDeactivated('em1', true))).rejects.toMatchObject({ output: { statusCode: 409 } })
  })

  it('autorise ces operations sur un autre membre quand il reste un administrateur', async () => {
    const { domain, ctx, calls } = build([row({}), row({ id: 'em2', userId: 'u2', role: 'ADMIN' })], 2)
    await asAdmin(ctx, () => domain.update('em2', { role: 'MEMBER' }))
    await asAdmin(ctx, () => domain.setDeactivated('em2', true))
    await asAdmin(ctx, () => domain.remove('em2'))
    expect(calls).toEqual(['update', 'deactivate', 'delete'])
  })
})
```

- [ ] **Step 2: Vérifier l'échec**

Run: `cd back && npx jest -c src/test/jest.config.ts src/test/unit/domain/membership.domain.test.ts`
Expected: FAIL.

- [ ] **Step 3: Repository membres**

`membership.repository.ts` (famille établissement) :

```ts
const rowInclude = {
  user: { select: { id: true, email: true, firstName: true, lastName: true, deactivatedAt: true } },
  serviceMemberships: { select: { serviceId: true, role: true } },
} as const

class MembershipRepository implements MembershipRepositoryInterface {
  // constructeur { postgresOrm, errorHandler, tenantContext } ; private get establishmentScope()

  findAll() {
    return this.prisma.establishmentMembership.findMany({ where: this.establishmentScope, include: rowInclude, orderBy: { createdAt: 'asc' } })
  }

  async findByID(id: string) {
    try {
      return await this.prisma.establishmentMembership.findFirstOrThrow({ where: { id, ...this.establishmentScope }, include: rowInclude })
    } catch (err) { throw this.errorHandler.boomErrorFromPrismaError({ entityName: 'Membership', error: err }) }
  }

  findByUserID(userId: string) {
    return this.prisma.establishmentMembership.findFirst({ where: { userId, ...this.establishmentScope }, include: rowInclude })
  }

  countAdmins() {
    return this.prisma.establishmentMembership.count({ where: { ...this.establishmentScope, role: 'ADMIN', user: { deactivatedAt: null } } })
  }

  async serviceExists(serviceId: string) {
    const count = await this.prisma.service.count({ where: { id: serviceId, ...this.establishmentScope, deactivatedAt: null } })
    return count > 0
  }

  async create({ services, ...params }: MembershipCreateRepo) {
    const { establishmentId } = this.establishmentScope
    try {
      return await this.prisma.establishmentMembership.create({
        data: {
          ...params,
          establishmentId,
          serviceMemberships: { create: services.map((s) => ({ serviceId: s.serviceId, role: s.role, establishmentId })) },
        },
        include: rowInclude,
      })
    } catch (err) { throw this.errorHandler.boomErrorFromPrismaError({ entityName: 'Membership', error: err }) }
  }

  async update(id: string, { services, ...params }: MembershipUpdateRepo) {
    const { establishmentId } = this.establishmentScope
    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.establishmentMembership.findFirstOrThrow({ where: { id, establishmentId } })
        if (services) {
          await tx.serviceMembership.deleteMany({ where: { establishmentMembershipId: id, establishmentId } })
          await tx.serviceMembership.createMany({
            data: services.map((s) => ({ establishmentMembershipId: id, serviceId: s.serviceId, role: s.role, establishmentId })),
          })
        }
        return await tx.establishmentMembership.update({ where: { id }, data: params, include: rowInclude })
      })
    } catch (err) { throw this.errorHandler.boomErrorFromPrismaError({ entityName: 'Membership', error: err }) }
  }

  async delete(id: string) {
    const { establishmentId } = this.establishmentScope
    await this.prisma.establishmentMembership.deleteMany({ where: { id, establishmentId } })
  }
}
```

Note garde-fou : `EstablishmentMembership.update({ where: { id } })` n'aurait pas `establishmentId` dans son `where`. Utiliser la clé composite déclarée à la tâche 5 : `where: { id_establishmentId: { id, establishmentId } }` pour `update`, et `findUniqueOrThrow` avec la même clé pour `findByID`.

- [ ] **Step 4: Domaine membres**

```ts
class MembershipDomain implements MembershipDomainInterface {
  constructor({ membershipRepository, userRepository, soignantRepository, tenantContext }: IocContainer) { … }

  findAll() { return this.membershipRepository.findAll() }

  private async assertReferences(soignantId: string | null | undefined, services: ServiceAssignment[] | undefined) {
    if (soignantId) {
      await this.soignantRepository.findByID(soignantId)
    }
    for (const s of services ?? []) {
      if (!(await this.membershipRepository.serviceExists(s.serviceId))) {
        throw Boom.notFound(`Service ${s.serviceId} not found`)
      }
    }
  }

  async addByEmail({ email, role, soignantId, services }) {
    const user = await this.userRepository.findByEmail(email).catch(() => { throw Boom.notFound('Unknown user') })
    if (await this.membershipRepository.findByUserID(user.id)) {
      throw Boom.conflict('User is already a member')
    }
    await this.assertReferences(soignantId, services)
    return await this.membershipRepository.create({ userId: user.id, role, soignantId, services })
  }

  // Un établissement doit garder au moins un administrateur actif.
  private async assertNotLastAdmin(membership: MembershipRow) {
    if (membership.role === 'ADMIN' && (await this.membershipRepository.countAdmins()) <= 1) {
      throw Boom.conflict('Cannot remove the last administrator')
    }
  }
  private assertNotSelf(membership: MembershipRow) {
    if (membership.userId === this.tenantContext.current().userId) {
      throw Boom.conflict('Cannot apply this action to your own account')
    }
  }

  async update(id, params) {
    const membership = await this.membershipRepository.findByID(id)
    if (params.role === 'MEMBER') {
      await this.assertNotLastAdmin(membership)
    }
    await this.assertReferences(params.soignantId, params.services)
    return await this.membershipRepository.update(id, params)
  }

  async remove(id) {
    const membership = await this.membershipRepository.findByID(id)
    this.assertNotSelf(membership)
    await this.assertNotLastAdmin(membership)
    await this.membershipRepository.delete(id)
  }

  async setDeactivated(id, deactivated) {
    const membership = await this.membershipRepository.findByID(id)
    if (deactivated) {
      this.assertNotSelf(membership)
      await this.assertNotLastAdmin(membership)
    }
    await this.userRepository.setDeactivated(membership.userId, deactivated ? new Date() : null)
    return await this.membershipRepository.findByID(id)
  }
}
```

Enregistrer `membershipRepository` et `membershipDomain` dans le container et `IocContainer`.

- [ ] **Step 5: Schémas et routes membres**

`members.schema.ts` :

```ts
const serviceRoleSchema = z.enum(['COORDINATEUR', 'INTERVENANT', 'SECRETARIAT', 'LECTURE'])
const establishmentRoleSchema = z.enum(['ADMIN', 'MEMBER'])
const assignmentSchema = z.object({ serviceId: z.cuid(), role: serviceRoleSchema })

export const memberResponseSchema = z.object({
  id: z.string(),
  role: establishmentRoleSchema,
  soignantId: z.string().nullable(),
  user: z.object({ id: z.string(), email: z.string(), firstName: z.string().nullable(), lastName: z.string().nullable(), deactivatedAt: z.coerce.date().nullable() }),
  serviceMemberships: z.array(z.object({ serviceId: z.string(), role: serviceRoleSchema })),
})
export const membersResponseSchema = z.array(memberResponseSchema)
export const addMemberSchema = z.object({ email: z.email(), role: establishmentRoleSchema, soignantId: z.cuid().nullable().default(null), services: z.array(assignmentSchema).default([]) })
export const updateMemberSchema = z.object({ role: establishmentRoleSchema.optional(), soignantId: z.cuid().nullable().optional(), services: z.array(assignmentSchema).optional() })
export const memberParamsSchema = z.object({ membershipId: z.cuid() })
```

`routes/members.ts` : `GET /` (`members:manage`) → `membershipDomain.findAll()` ; `POST /` (201) → `addByEmail` ; `PATCH /:membershipId` → `update` ; `DELETE /:membershipId` (204) → `remove` ; `POST /:membershipId/deactivate` et `/:membershipId/reactivate` → `setDeactivated(id, true|false)`. Toutes avec `config: { permission: 'members:manage' }`.

- [ ] **Step 6: Permission sur chaque route existante**

Dans chaque routeur, retirer les `onRequest: [fastify.verifySessionCookie]` locaux (garde globale), les `addHook('preHandler', fastify.requireMinRole(...))` (`patient.ts`, `diagnosticEducatif.ts`), les imports `Role`, les vérifications manuelles d'admin (`activityLog.ts`, `forbiddenWeek.ts`, `planningCycle.ts` : supprimer `assertAdmin`, `userDomain`, `Boom` si inutilisé), et ajouter `config: { permission }` selon ce tableau :

| Fichier | Route | Permission |
| --- | --- | --- |
| `slot.ts` | `GET /`, `GET /:slotID` | `planning:read` |
| `slot.ts` | `POST /`, `PATCH /:slotID`, `DELETE /:slotID` | `planning:write` |
| `slotTemplate.ts` | `GET *` | `planning:read` ; écritures `planning:write` |
| `pathway.ts` | `GET /`, `GET /tracking`, `GET /:pathwayID` | `planning:read` |
| `pathway.ts` | `POST /`, `PATCH /:pathwayID`, `DELETE /:pathwayID`, `POST /instantiate`, `POST /regenerate` | `planning:write` |
| `pathwayTemplate.ts` | `GET /`, `GET /:pathwayTemplateID` | `planning:read` ; `POST /`, `PATCH /:pathwayTemplateID`, `PATCH /reorder`, `DELETE /:pathwayTemplateID` : `planning:write` |
| `forbiddenWeek.ts` | `GET /` : `planning:read` ; `POST /`, `DELETE /:id` : `planning:write` |
| `planningCycle.ts` | `GET /` : `planning:read` ; `PUT /`, `DELETE /` : `planning:write` |
| `thematic.ts` | `GET *` : `referentials:read` ; écritures : `referentials:write` |
| `diagnosticEducatifTemplate.ts` | `GET *` : `referentials:read` ; écritures : `referentials:write` |
| `patient.ts` | `GET /`, `GET /export`, `GET /with-tags`, `GET /:patientID`, `GET /:patientID/pathways`, `GET /:patientID/pathway/:pathwayID/appointments-count` | `patient:read` |
| `patient.ts` | `POST /`, `PATCH /:patientID`, `DELETE /:patientID`, `PUT /:patientID/pathway-priorities` | `patient:write` |
| `patient.ts` | `POST /enroll`, `POST /:patientID/enroll`, `DELETE /:patientID/pathway/:pathwayID` | `appointment:write` |
| `diagnosticEducatif.ts` | `GET /`, `GET /:diagnosticId` : `clinical:read` ; `POST /`, `PATCH /:diagnosticId`, `DELETE /:diagnosticId` : `clinical:write` |
| `enrollmentIssue.ts` | `GET /` : `patient:read` ; `DELETE /:issueID` : `appointment:write` |
| `appointment.ts` | `GET /`, `GET /:appointmentID` : `patient:read` ; `POST /`, `PATCH /:appointmentID`, `DELETE /:appointmentID` : `appointment:write` |
| `todo.ts` | toutes : `todo:own` |
| `activityLog.ts` | `GET /`, `POST /cleanup` : `planning:write` |

Exemple de forme finale (slot, lecture) :

```ts
  fastify.get<{ Querystring: GetSlotsQuery }>(
    '/',
    {
      schema: { querystring: getSlotsQuerySchema, response: { 200: slotsResponseSchema } },
      config: { permission: 'planning:read' },
    },
    (request) => slotDomain.findAll({ from: request.query.from, to: request.query.to }),
  )
```

Les handlers qui lisent `request.user.userID` (patient, appointment, diagnostic) ne changent pas.

- [ ] **Step 7: Retour au vert**

Run: `cd back && npm run build`
Expected: `prisma generate` + `tsc --noemit` passent. Corriger toute erreur de type restante dans les fichiers touchés par les tâches 5 à 15 (typiquement : un `include` qui utilise encore `soignants: true`, un type d'interface qui référence `Role`, un DTO qui attend `soignants` sur une ligne non aplatie). Ne pas contourner par `as never`.

Run: `cd back && npm run lint`
Expected: OK.

Run: `cd back && npm run test:unit`
Expected: PASS, toutes suites.

Run: `cd back && npm run test:e2e`
Expected: `health.test.ts` PASS : le serveur démarre, donc toutes les routes tenant déclarent leur permission (sinon le fail-safe `onRoute` fait échouer `configure()`).

Run: `cd back && npm run dev` puis `curl -i http://127.0.0.1:3000/health`
Expected: 200, et le log de démarrage liste des routes préfixées `/e/:establishmentId/s/:serviceId/...`.

- [ ] **Step 8: Commit**

```bash
git add -A back
git commit -m "feat(http): permission par route, routes membres et retour au vert

Claude-Session: https://claude.ai/code/session_01G1JrhGqWHmVH6XB2XTTwJe"
```

---

### Task 16: Tests e2e d'isolation, de permissions et de membres

**Files:**
- Create: `back/src/test/e2e/setup/fixtures.ts`
- Create: `back/src/test/e2e/tenant-resolution.test.ts`, `isolation.test.ts`, `permissions.test.ts`, `members.test.ts`

**Interfaces:**
- Produces (fixtures) :

```ts
createEstablishment(name?): Promise<Establishment>
createService(establishmentId, name?): Promise<Service>
createUser(params: { email; password?; memberships?: { establishmentId; role?: EstablishmentRole; soignantId?; services?: { serviceId; role: ServiceRole }[] }[] }): Promise<User>
signIn(app, email, password?): Promise<{ access_token: string }>   // cookies à passer à inject
tenantUrl(establishmentId, serviceId, path): string                 // `/e/${e}/s/${s}${path}`
adminUrl(establishmentId, path): string
```

- [ ] **Step 1: Fixtures**

```ts
import type { FastifyInstance } from 'fastify'

import type { EstablishmentRole, ServiceRole } from '../../../generated/enums'
import { hashPassword } from '../../../main/utils/hash'
import { testDb } from './db'

export const DEFAULT_PASSWORD = 'Password123!!'

export const createEstablishment = (name = 'Etab') => testDb.establishment.create({ data: { name } })

export const createService = (establishmentId: string, name = `Service ${Math.random()}`) =>
  testDb.service.create({ data: { establishmentId, name } })

type MembershipFixture = {
  establishmentId: string
  role?: EstablishmentRole
  soignantId?: string | null
  services?: { serviceId: string; role: ServiceRole }[]
}

export const createUser = async (params: { email: string; password?: string; memberships?: MembershipFixture[] }) => {
  const { hash, salt } = hashPassword(params.password ?? DEFAULT_PASSWORD)
  const user = await testDb.user.create({ data: { email: params.email, password: hash, salt } })
  for (const m of params.memberships ?? []) {
    await testDb.establishmentMembership.create({
      data: {
        userId: user.id,
        establishmentId: m.establishmentId,
        role: m.role ?? 'MEMBER',
        soignantId: m.soignantId ?? null,
        serviceMemberships: {
          create: (m.services ?? []).map((s) => ({ serviceId: s.serviceId, role: s.role, establishmentId: m.establishmentId })),
        },
      },
    })
  }
  return user
}

export const signIn = async (app: FastifyInstance, email: string, password = DEFAULT_PASSWORD) => {
  const res = await app.inject({ method: 'POST', url: '/auth/sign-in', payload: { email, password } })
  if (res.statusCode >= 300) {
    throw new Error(`sign-in failed: ${res.statusCode} ${res.body}`)
  }
  const token = res.cookies.find((c) => c.name === 'access_token')?.value
  if (!token) {
    throw new Error('no access_token cookie')
  }
  return { access_token: token }
}

export const tenantUrl = (establishmentId: string, serviceId: string, path: string) =>
  `/e/${establishmentId}/s/${serviceId}${path}`
export const adminUrl = (establishmentId: string, path: string) => `/e/${establishmentId}/admin${path}`

// Deux services dans le même établissement, un utilisateur membre de chacun.
export const twoServicesScenario = async (app: FastifyInstance) => {
  const est = await createEstablishment()
  const serviceA = await createService(est.id, 'A')
  const serviceB = await createService(est.id, 'B')
  await createUser({ email: 'a@test.fr', memberships: [{ establishmentId: est.id, services: [{ serviceId: serviceA.id, role: 'COORDINATEUR' }] }] })
  await createUser({ email: 'b@test.fr', memberships: [{ establishmentId: est.id, services: [{ serviceId: serviceB.id, role: 'COORDINATEUR' }] }] })
  const cookiesA = await signIn(app, 'a@test.fr')
  const cookiesB = await signIn(app, 'b@test.fr')
  return { est, serviceA, serviceB, cookiesA, cookiesB }
}
```

- [ ] **Step 2: Résolution du tenant**

`tenant-resolution.test.ts` :

```ts
describe('resolution du tenant', () => {
  let t: TestApp
  beforeAll(async () => { await truncateAll(); t = await buildTestApp() })
  afterAll(async () => { await t.close(); await testDb.$disconnect() })

  it('membre -> 200 ; autre service -> 404 ; autre etablissement -> 404 ; service desactive -> 404 ; compte desactive -> 401', async () => {
    const { est, serviceA, serviceB, cookiesA } = await twoServicesScenario(t.app)
    const other = await createEstablishment('Autre')
    const get = (url: string, cookies = cookiesA) => t.app.inject({ method: 'GET', url, cookies })

    expect((await get(tenantUrl(est.id, serviceA.id, '/thematic'))).statusCode).toBe(200)
    expect((await get(tenantUrl(est.id, serviceB.id, '/thematic'))).statusCode).toBe(404)
    expect((await get(tenantUrl(other.id, serviceA.id, '/thematic'))).statusCode).toBe(404)

    await testDb.service.update({ where: { id: serviceA.id }, data: { deactivatedAt: new Date() } })
    expect((await get(tenantUrl(est.id, serviceA.id, '/thematic'))).statusCode).toBe(404)
    await testDb.service.update({ where: { id: serviceA.id }, data: { deactivatedAt: null } })

    await testDb.user.update({ where: { email: 'a@test.fr' }, data: { deactivatedAt: new Date() } })
    expect((await get(tenantUrl(est.id, serviceA.id, '/thematic'))).statusCode).toBe(401)
  })

  it('/me renvoie l arbre des appartenances', async () => {
    const { est, serviceA, cookiesA } = await twoServicesScenario(t.app)
    const res = await t.app.inject({ method: 'GET', url: '/me', cookies: cookiesA })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ establishments: [{ id: est.id, services: [{ id: serviceA.id, role: 'COORDINATEUR' }] }] })
  })
})
```

(chaque `it` appelle `truncateAll()` en `beforeEach` si nécessaire pour éviter les collisions d'e-mail : ajouter `beforeEach(truncateAll)`).

- [ ] **Step 3: Isolation générique**

`isolation.test.ts` : une table de cas `{ name, create(serviceId, establishmentId) => Promise<id>, path(id) => string }` alimentée par `testDb` directement :

```ts
const cases = [
  { name: 'thematic', create: (s, e) => testDb.thematic.create({ data: { name: 'T', serviceId: s, establishmentId: e } }).then((r) => r.id), path: (id) => `/thematic/${id}` },
  { name: 'pathway-template', create: (s, e) => testDb.pathwayTemplate.create({ data: { name: 'P', color: '#fff', mainTag: 'x', serviceId: s, establishmentId: e } }).then((r) => r.id), path: (id) => `/pathway-template/${id}` },
  { name: 'diagnostic-template', create: (s, e) => testDb.diagnosticEducatifTemplate.create({ data: { name: 'D', activeFields: [], serviceId: s, establishmentId: e } }).then((r) => r.id), path: (id) => `/diagnostic-template/${id}` },
  { name: 'slot-template', create: (s, e) => testDb.slotTemplate.create({ data: { startTime: new Date(), endTime: new Date(), offsetDays: 0, isIndividual: true, color: '#fff', serviceId: s, establishmentId: e } }).then((r) => r.id), path: (id) => `/slot-template/${id}` },
  { name: 'todo', create: (s, e) => testDb.todo.create({ data: { title: 't', createDate: new Date(), completed: false, serviceId: s, establishmentId: e } }).then((r) => r.id), path: (id) => `/todo/${id}` },
  { name: 'forbidden-week', create: (s, e) => testDb.forbiddenWeek.create({ data: { startOfWeek: new Date('2026-01-05'), serviceId: s, establishmentId: e } }).then((r) => r.id), path: (id) => `/forbidden-week/${id}`, methods: ['DELETE'] },
]

describe.each(cases)('isolation $name', ({ create, path, methods = ['GET', 'DELETE'] }) => {
  it('404 depuis le service A sur une ressource du service B, 200/204 depuis B', async () => {
    const { est, serviceA, serviceB, cookiesA, cookiesB } = await twoServicesScenario(t.app)
    const id = await create(serviceB.id, est.id)
    for (const method of methods) {
      const fromA = await t.app.inject({ method, url: tenantUrl(est.id, serviceA.id, path(id)), cookies: cookiesA })
      expect(fromA.statusCode).toBe(404)
    }
    const fromB = await t.app.inject({ method: methods[0], url: tenantUrl(est.id, serviceB.id, path(id)), cookies: cookiesB })
    expect([200, 204]).toContain(fromB.statusCode)
  })
})
```

Ajouter un cas d'établissement : un patient créé dans un autre établissement, demandé via `GET /patient/:id` → 404. Les créneaux et rendez-vous, dont la création directe demande des parents, sont couverts par transitivité (créneau → modèle de créneau) ; ajouter un cas `slot` si le temps le permet en créant modèle puis créneau.

- [ ] **Step 4: Permissions par rôle**

`permissions.test.ts` : un utilisateur par rôle dans le même service, et pour chaque permission une route représentative :

```ts
const probes: { permission: ServicePermission; method: string; path: string; payload?: unknown }[] = [
  { permission: 'planning:read', method: 'GET', path: '/slot' },
  { permission: 'planning:write', method: 'POST', path: '/forbidden-week', payload: { date: '2026-01-05' } },
  { permission: 'referentials:read', method: 'GET', path: '/thematic' },
  { permission: 'referentials:write', method: 'POST', path: '/thematic', payload: { name: 'X', soignantIDs: [] } },
  { permission: 'patient:read', method: 'GET', path: '/patient' },
  { permission: 'patient:write', method: 'POST', path: '/patient', payload: { firstName: 'A', lastName: 'B' } },
  { permission: 'clinical:read', method: 'GET', path: '/patient/clzzzzzzzzzzzzzzzzzzzzzzz/diagnostic' },
  { permission: 'appointment:write', method: 'DELETE', path: '/patient/clzzzzzzzzzzzzzzzzzzzzzzz/enrollment-issue/clzzzzzzzzzzzzzzzzzzzzzzz' },
  { permission: 'todo:own', method: 'GET', path: '/todo' },
]
const roles: ServiceRole[] = ['COORDINATEUR', 'INTERVENANT', 'SECRETARIAT', 'LECTURE']

describe.each(roles)('permissions du role %s', (role) => {
  it.each(probes)('$permission -> 403 ssi non detenu', async ({ permission, method, path, payload }) => {
    // arrange : établissement, service, utilisateur avec `role`, cookies
    const res = await t.app.inject({ method, url: tenantUrl(est.id, service.id, path), cookies, payload })
    if (SERVICE_PERMISSIONS[role].includes(permission)) {
      expect(res.statusCode).not.toBe(403)
    } else {
      expect(res.statusCode).toBe(403)
    }
  })
})
```

(un identifiant inexistant produit 404 ou 400 côté « détenu », ce qui suffit : on ne teste que la barrière 403).

- [ ] **Step 5: Membres**

`members.test.ts` : un admin d'établissement ; `POST /members` avec l'e-mail d'une identité existante → 201 puis `GET /members` la liste ; un e-mail inconnu → 404 ; `DELETE` de sa propre appartenance → 409 ; `POST /:id/deactivate` sur un autre membre → 200, puis la connexion de ce membre → 401 ; un `INTERVENANT` sans rôle d'établissement ADMIN sur `/admin/members` → 404.

- [ ] **Step 6: Lancer**

Run: `cd back && npm run test:e2e`
Expected: PASS. Corriger le back si un test d'isolation révèle un filtre manquant ; ne pas assouplir le test.

- [ ] **Step 7: Commit**

```bash
git add back/src/test
git commit -m "test(back): isolation entre services, permissions par role, membres

Claude-Session: https://claude.ai/code/session_01G1JrhGqWHmVH6XB2XTTwJe"
```

---

### Task 17: Front minimal — contexte unique, préfixe d'API, permissions

**Files:**
- Modify: `front/src/types/auth.ts`, `front/src/store/useAuthStore.ts`, `front/src/constants/config.constant.ts`
- Create: `front/src/hooks/useCan.ts`
- Modify: tous `front/src/api/*.api.ts` sauf `auth.api.ts` et `user.api.ts` (supprimé en tâche 18)
- Modify: `front/src/routes/_authenticated.tsx`, `front/src/routes/_authenticated/_admin.tsx`, `front/src/routes/pending.tsx`, `front/src/components/navbar.tsx`, `front/src/components/custom/sidebar/soignant.sidebar.tsx`, `front/src/components/custom/sidebar/dashboardFilter.sidebar.tsx`, `front/src/routes/auth/index.tsx`, `front/src/routes/_authenticated/user/settings.tsx`, `front/src/queries/useAuth.ts`, `front/src/api/auth.api.ts`

**Interfaces:**
- Produces:

```ts
// types/auth.ts
type ServiceRole = 'COORDINATEUR' | 'INTERVENANT' | 'SECRETARIAT' | 'LECTURE'
type EstablishmentRole = 'ADMIN' | 'MEMBER'
type User = { id; email; firstName: string | null; lastName: string | null; isSuperAdmin: boolean
  establishments: { id; name; role: EstablishmentRole; soignantId: string | null; services: { id; name; role: ServiceRole }[] }[] }
type TenantContext = { establishmentId; serviceId; establishmentRole; serviceRole; soignantId: string | null }
// store
useAuthStore: { user; context: TenantContext | null; isAuthenticated; … }  // context dérivé à chaque authenticate/update
deriveContext(user: User | null): TenantContext | null
// config.constant.ts
tenantApiUrl(): string          // `${apiUrl}/e/${establishmentId}/s/${serviceId}` ; lève si aucun contexte
establishmentApiUrl(): string   // `${apiUrl}/e/${establishmentId}/admin`
// hooks/useCan.ts
useCan(permission: Permission): boolean
can(context: TenantContext | null, permission: Permission): boolean
```

- [ ] **Step 1: Types et store**

`types/auth.ts` : remplacer `Role`, `User`, `UpdateUserParams` par les types ci-dessus. `RegisterInput = { email: string; firstName?: string; lastName?: string; password: string }`. `AuthState` inchangé.

`store/useAuthStore.ts` : ajouter `context: TenantContext | null` à l'état, et :

```ts
// Étape 1 : un seul contexte par session, le premier couple établissement/service
// trouvé. L'étape 2 apporte le sélecteur et la mémorisation du dernier contexte.
export const deriveContext = (user: User | null): TenantContext | null => {
  if (!user) {
    return null
  }
  for (const est of user.establishments) {
    const service = est.services[0]
    if (service) {
      return {
        establishmentId: est.id,
        serviceId: service.id,
        establishmentRole: est.role,
        serviceRole: service.role,
        soignantId: est.soignantId,
      }
    }
  }
  return null
}
```

`update` et `authenticate` posent `context: deriveContext(user)` ; `logout` le remet à `null`. Ajouter `partialize` si nécessaire pour que `context` soit persisté avec `user` (il est dérivé, le persister évite un flash au rechargement).

- [ ] **Step 2: Préfixes d'API**

`constants/config.constant.ts` :

```ts
import { useAuthStore } from '../store/useAuthStore.ts'

export const environment = import.meta.env.VITE_ENVIRONMENT || 'development'
export const apiUrl = import.meta.env.VITE_API_BASE_URL

const requireContext = () => {
  const context = useAuthStore.getState().context
  if (!context) {
    throw new Error('Aucun contexte établissement/service')
  }
  return context
}

// Préfixes calculés à l'appel, jamais au chargement du module.
export const tenantApiUrl = () => {
  const { establishmentId, serviceId } = requireContext()
  return `${apiUrl}/e/${establishmentId}/s/${serviceId}`
}

export const establishmentApiUrl = () => `${apiUrl}/e/${requireContext().establishmentId}/admin`
```

Si l'import du store depuis `constants/` crée un cycle (le store importe `types/auth` seulement, donc non), garder ; sinon déplacer ces deux fonctions dans `front/src/libs/tenantUrl.ts`.

Dans chaque module `api/*.api.ts` sauf `auth.api.ts` : remplacer chaque occurrence de `${apiUrl}/` par `${tenantApiUrl()}/` et l'import de `apiUrl` par `tenantApiUrl`. Commande de départ (puis relecture fichier par fichier) :

```bash
cd front/src/api && for f in $(ls *.api.ts | grep -v -e auth.api.ts -e user.api.ts); do
  sed -i '' -e 's/\${apiUrl}\//${tenantApiUrl()}\//g' -e 's/import { apiUrl } from/import { tenantApiUrl } from/' "$f"
done
```

`soignant.api.ts` et `location.api.ts` : les lectures gardent `tenantApiUrl()` ; `create`/`update`/`delete` passent à `${establishmentApiUrl()}/soignant` et `${establishmentApiUrl()}/location`.

`activityLog.api.ts` : lecture et `cleanup` sous `tenantApiUrl()`.

- [ ] **Step 3: `useCan`**

`front/src/hooks/useCan.ts` :

```ts
import { useAuthStore } from '../store/useAuthStore.ts'
import type { TenantContext } from '../types/auth.ts'
import { hasPermission, type Permission } from '../utils/permissions.ts'

export const can = (context: TenantContext | null, permission: Permission): boolean =>
  context !== null &&
  hasPermission({ serviceRole: context.serviceRole, establishmentRole: context.establishmentRole }, permission)

export const useCan = (permission: Permission): boolean => {
  const context = useAuthStore((state) => state.context)
  return can(context, permission)
}
```

- [ ] **Step 4: Routes et composants**

`routes/_authenticated.tsx` : le `beforeLoad` redirige vers `/pending` si `deriveContext(context.authState.user) === null` (au lieu du test sur `role`). `shouldReload` idem. `main.tsx` : `authState` ne change pas de forme (`{ user, isAuthenticated }`).

`routes/_authenticated/_admin.tsx` : `if (!can(deriveContext(context.authState.user), 'planning:write')) throw redirect({ to: '/' })`.

`routes/pending.tsx` : `shouldReload` → `deriveContext(context.authState.user) !== null`.

`components/navbar.tsx` : remplacer `const isAdmin = user?.role === 'ADMIN'` par `const isAdmin = useCan('planning:write')` et l'entrée « Utilisateurs » → « Membres » (route `/settings/user` conservée, écran réécrit en tâche 18), visible seulement avec `useCan('members:manage')` : passer un booléen `canManageMembers` à `SettingsMenu`.

`soignant.sidebar.tsx` : `const isAdmin = useCan('soignants:manage')`. `dashboardFilter.sidebar.tsx` : `isAdmin={useCan('soignants:manage')}` (appeler le hook en haut du composant). Retirer la prop `user` devenue inutile là où elle ne servait qu'au rôle.

`routes/auth/index.tsx` : le formulaire d'inscription ne mentionne plus de soignant (vérifier qu'aucun champ `soignantId` n'est envoyé ; d'après le code actuel, il n'y en a pas : rien à faire sinon retirer `soignantId` du type).

`api/auth.api.ts` : `login` renvoie `User` (nouvelle forme, la réponse de `/auth/sign-in` est désormais `/me`). Ajouter `me: async (): Promise<User>` → `GET ${apiUrl}/me` avec `fetchWithAuth`, et `updateMe: async (params: { firstName?; lastName?; currentPassword?; newPassword? }): Promise<User>` → `PATCH ${apiUrl}/me`.

`queries/useAuth.ts` : ajouter `useUpdateMe()` (mutation `AuthApi.updateMe`, `onSuccess: update(user)`).

`routes/_authenticated/user/settings.tsx` : retirer le champ « Fonction » (soignant) ; le formulaire de profil appelle `useUpdateMe().mutateAsync({ firstName, lastName })` ; le formulaire de mot de passe appelle `mutateAsync({ currentPassword, newPassword })` (retirer le `TODO` et le `console.log`). Validation front : nouveau mot de passe 12 caractères minimum (aligné sur le back).

Chercher les derniers usages : `grep -rn "\.role\b\|soignantId\|'NONE'\|'ADMIN'" front/src --include=*.ts --include=*.tsx` ; il ne doit rester que `utils/permissions.ts`, `types/auth.ts`, `store/useAuthStore.ts`, `hooks/useCan.ts` et les écrans membres de la tâche 18.

- [ ] **Step 5: Vérifier**

Run: `cd front && npm run build` (ou `npx tsc --noEmit` et `npm run lint` selon les scripts du `package.json` front)
Expected: typecheck OK (les fichiers de la tâche 18 encore absents provoquent des erreurs sur `settings/user.tsx`, `editUserForm.tsx`, `user.column.tsx`, `useUser.ts`, `user.api.ts` : les laisser pour la tâche 18, ou les supprimer dès maintenant si la tâche 18 est exécutée dans la foulée).

Vérification manuelle depuis le checkout principal après merge (voir mémoire projet : un seul serveur front sur 4270) : connexion, dashboard, agenda, patients, réglages planning. Tous les appels réseau portent `/e/<id>/s/<id>/`.

- [ ] **Step 6: Commit**

```bash
git add front/src
git commit -m "feat(front): contexte unique et appels API prefixes par etablissement et service

Claude-Session: https://claude.ai/code/session_01G1JrhGqWHmVH6XB2XTTwJe"
```

---

### Task 18: Front — écran Membres

**Files:**
- Create: `front/src/types/member.ts`, `front/src/api/members.api.ts`, `front/src/queries/useMembers.ts`, `front/src/columns/member.column.tsx`, `front/src/components/custom/popup/editMemberForm.tsx`, `front/src/components/custom/popup/addMemberForm.tsx`
- Modify: `front/src/routes/_authenticated/_admin/settings/user.tsx` (réécrit), `front/src/constants/process.constant.ts` (clés `MEMBER`)
- Delete: `front/src/api/user.api.ts`, `front/src/queries/useUser.ts`, `front/src/columns/user.column.tsx`, `front/src/components/custom/popup/editUserForm.tsx`, `front/src/components/custom/popup/deleteUserForm.tsx`, `front/src/constants/user.constant.ts`

**Interfaces:**
- Produces:

```ts
// types/member.ts
type Member = { id: string; role: EstablishmentRole; soignantId: string | null
  user: { id: string; email: string; firstName: string | null; lastName: string | null; deactivatedAt: string | null }
  serviceMemberships: { serviceId: string; role: ServiceRole }[] }
type AddMemberInput = { email: string; role: EstablishmentRole; soignantId: string | null; services: { serviceId: string; role: ServiceRole }[] }
type UpdateMemberInput = { id: string; role?: EstablishmentRole; soignantId?: string | null; services?: { serviceId: string; role: ServiceRole }[] }
// api/members.api.ts
MembersApi.getAll(): Promise<Member[]>; add(input): Promise<Member>; update(input): Promise<Member>; remove(id): Promise<void>; deactivate(id): Promise<Member>; reactivate(id): Promise<Member>
// queries/useMembers.ts
useMembersQuery(); useMemberMutations(): { addMember, updateMember, removeMember, deactivateMember, reactivateMember }
```

- [ ] **Step 1: Types, API, requêtes**

`api/members.api.ts` sur `${establishmentApiUrl()}/members` avec `fetchWithAuth` et `handleHttpError` (messages : « Impossible de récupérer les membres », « Impossible d'ajouter le membre » avec `404: { title: 'Compte introuvable', message: 'Aucun compte avec cet e-mail. La personne doit d’abord créer son compte.' }`, `409: { title: 'Déjà membre' }`, etc.).

`constants/process.constant.ts` : `export const MEMBER = { GET_ALL: 'get_all_members', ADD: 'add_member', UPDATE: 'update_member', REMOVE: 'remove_member', DEACTIVATE: 'deactivate_member' }`.

`queries/useMembers.ts` : `useMembersQuery` (`queryKey: [MEMBER.GET_ALL]`, `useDataFetching`), mutations avec invalidation de `[MEMBER.GET_ALL]` et toasts (« Membre ajouté », « Membre modifié », « Membre retiré », « Compte désactivé », « Compte réactivé »), sur le modèle de l'actuel `useUser.ts`.

- [ ] **Step 2: Colonnes**

`columns/member.column.tsx` : colonnes Prénom, Nom, Email, « Rôle établissement » (badge `Administrateur` / `Membre`), « Rôle service » (badge du rôle dans l'unique service du contexte : `Coordinateur`, `Intervenant`, `Secrétariat`, `Lecture`, ou `—`), Fonction (nom du soignant via `soignants`), Statut (`Actif` / `Désactivé` selon `user.deactivatedAt`), Actions (éditer, désactiver ou réactiver, retirer). Reprendre le style `RoleLabel` existant avec ces libellés :

```ts
const SERVICE_ROLE_LABEL: Record<ServiceRole, string> = {
  COORDINATEUR: 'Coordinateur', INTERVENANT: 'Intervenant', SECRETARIAT: 'Secrétariat', LECTURE: 'Lecture',
}
const ESTABLISHMENT_ROLE_LABEL: Record<EstablishmentRole, string> = { ADMIN: 'Administrateur', MEMBER: 'Membre' }
```

- [ ] **Step 3: Formulaires**

`addMemberForm.tsx` : champs `email`, `role` (établissement), `soignantId` (select, options depuis `useSoignantQueries`), `serviceRole` (select ; envoyé comme `services: [{ serviceId: context.serviceId, role }]`, ou `[]` si « Aucun »). Soumission → `addMember.mutate`.

`editMemberForm.tsx` : mêmes champs sans `email`, préremplis depuis `member` (`serviceRole` = rôle dans `context.serviceId`). Soumission → `updateMember.mutate({ id, role, soignantId, services })`.

Le contexte (`useAuthStore((s) => s.context)`) fournit `serviceId`. L'écran ne gère qu'un service : c'est l'état de l'étape 1, le multi-service arrive avec l'étape 2.

- [ ] **Step 4: Écran**

`settings/user.tsx` : titre « Membres de l'établissement », bouton « Ajouter un membre » qui ouvre `AddMemberForm`, tableau `ReactTable<Member>` avec `getMemberColumns({ onEdit, onToggleActive, onRemove, soignants })`, `EditMemberForm`, et un `Popup` de confirmation pour le retrait (réutiliser la structure de l'ancien `deleteUserForm.tsx` puis supprimer ce fichier). La route reste `/_authenticated/_admin/settings/user` (le layout `_admin` exige `planning:write` ; ajouter en tête de composant `if (!useCan('members:manage')) return <Navigate to="/" />`).

Supprimer les fichiers listés (`git rm`).

- [ ] **Step 5: Vérifier**

Run: `cd front && npm run build && npm run lint`
Expected: OK, plus aucune référence à `UserApi`, `useUserMutations`, `ROLE_OPTIONS`.

Vérification manuelle : ajouter un membre par e-mail (compte créé via l'inscription), lui donner Secrétariat, se connecter avec ce compte : le menu réglages n'apparaît pas, l'agenda s'affiche. Désactiver ce compte : sa prochaine requête renvoie 401 et il est renvoyé à la connexion.

- [ ] **Step 6: Commit**

```bash
git add -A front/src
git commit -m "feat(front): ecran des membres de l'etablissement

Claude-Session: https://claude.ai/code/session_01G1JrhGqWHmVH6XB2XTTwJe"
```

---

### Task 19: Documentation et procédure de déploiement

**Files:**
- Modify: `back/CLAUDE.md`, `README.md`, `docs/multi-tenant/habilitations.md`
- Create: `docs/multi-tenant/deploiement-etape-1.md`

- [ ] **Step 1: `back/CLAUDE.md`**

Ajouter une section « Multi-tenant » après « Key cross-cutting concerns » :

```markdown
- **Tenant context (`utils/tenant-context.ts`)**: `resolveTenant` (plugin `tenant.plugin.ts`) reads
  `:establishmentId`/`:serviceId` from the URL, checks the user's memberships and stores the tenant in an
  `AsyncLocalStorage`. Repositories read it per call (`tenantContext.scope()` → `{ serviceId, establishmentId }`,
  `establishmentScope()`), never in constructors. Background jobs run under `tenantContext.runAsSystem()`.
- **Tenant guard (`infra/orm/tenant-guard.ts`)**: a Prisma extension that throws `TenantScopeMissingError` when a
  query on a service model lacks `serviceId` (or `establishmentId` for establishment models) in `where`/`data`.
  Model families are listed there. Add every new tenant model to `SERVICE_MODELS` or `ESTABLISHMENT_MODELS`.
- **Permissions**: routes under `/e/:establishmentId/s/:serviceId` and `/e/:establishmentId/admin` MUST declare
  `config: { permission }` (matrix in `utils/permissions.ts`, mirrored in `front/src/utils/permissions.ts`; a unit
  test checks both copies are identical). Server startup fails otherwise.
- **Composite keys**: lookups by id use `where: { id_serviceId: { id, serviceId } }`. Nullable references
  (`locationID`, `thematicId`, `templateID`…) have no composite FK: domains verify the target via its repository.
- **E2E tests** (`src/test/e2e/`) run against `medisync_test` (`.env.test`), via `npm run test:e2e`; the pre-commit
  hook runs unit tests only.
```

Compléter « Adding a new entity » : ajouter `establishmentId`/`serviceId` + `@@unique([id, serviceId])` au modèle ; le repository reçoit `tenantContext` ; le modèle est ajouté au garde-fou ; chaque route déclare sa permission ; un cas est ajouté à `isolation.test.ts`.

- [ ] **Step 2: `README.md`**

Tableau du domaine : ajouter `Établissement`, `Service`, `Appartenance` (avec les rôles). Section « Comptes » : décrire inscription → compte sans appartenance → page d'attente → rattachement par l'administrateur d'établissement, les quatre rôles de service et le rôle d'administrateur d'établissement, la désactivation. Section « Usage » : mentionner `back/.env.test` et `npm run test:e2e`.

- [ ] **Step 3: Habilitations et déploiement**

`docs/multi-tenant/habilitations.md` : vérifier que `planning:read` et `referentials:read` figurent (ajoutés lors de la spec), et ajouter une ligne « Implémenté à l'étape 1 » sous le titre.

`docs/multi-tenant/deploiement-etape-1.md` :

```markdown
# Déploiement de l'étape 1 (socle multi-tenant)

1. Sauvegarde manuelle : télécharger le dernier `pg_dump` depuis Dokploy, puis en déclencher un nouveau.
2. Répétition sur une copie : `deploy/scripts/restore-db-dump.sh <dump>` sur la base locale, relever
   `SELECT role, count(*) FROM "User" GROUP BY role;`, `SELECT count(*) FROM "_SlotTemplateSoignants";`,
   `SELECT count(*) FROM "_SoignantThematics";`, puis `cd back && npm run prisma:migrate:deploy`, puis jouer
   `back/prisma/checks/multi-tenant-socle.sql` et comparer. Lancer le back sur cette base et se connecter avec
   un ancien compte ADMIN et un ancien compte USER.
3. Déployer l'image : la migration s'applique au démarrage (`start:migrate:production`).
4. Vérifier en production : connexion, agenda, planning, fiche patient, écran Membres.
5. Renommer l'établissement et le service (pas encore d'écran, étape 4) :
   `UPDATE "Establishment" SET name = '…'; UPDATE "Service" SET name = '…';`
6. Retour arrière : redéployer l'image précédente puis restaurer la sauvegarde de l'étape 1.
```

- [ ] **Step 4: Commit**

```bash
git add back/CLAUDE.md README.md docs/multi-tenant
git commit -m "docs: multi-tenant etape 1, conventions back et procedure de deploiement

Claude-Session: https://claude.ai/code/session_01G1JrhGqWHmVH6XB2XTTwJe"
```

---

## Fin d'étape

- `cd back && npm run validate` doit passer (build, lint, couverture unitaire et e2e).
- `cd front && npm run build` doit passer.
- Merge sur `main` selon la convention du projet (`git merge --no-ff worktree-multi-tenant` depuis le checkout principal), puis vérification visuelle depuis le serveur front du checkout principal (port 4270).
- Déploiement selon `docs/multi-tenant/deploiement-etape-1.md`.
