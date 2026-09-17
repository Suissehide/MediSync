# Cycle de numérotation des semaines du planning — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permettre à un ADMIN de définir, depuis le menu « Actions » de la page planning, une semaine de départ et une longueur de cycle, puis afficher partout la position dans ce cycle (S1…SN, répétée) au lieu du numéro de semaine ISO.

**Architecture :** Le réglage est une ligne unique en base (`PlanningCycle`, id `"default"`), exposée par `GET`/`PUT`/`DELETE /planning-cycle` — lecture ouverte à tout utilisateur connecté, écriture réservée aux ADMIN. Le front lit ce réglage via un hook React Query et le passe à un util pur `cycleWeekNumber()` que les quatre points d'affichage appellent. Tant qu'aucun cycle n'existe, l'API renvoie `null` et tous les affichages conservent leur numérotation ISO actuelle.

**Tech Stack :** Back — Node/Fastify, Prisma (client généré dans `src/generated/`), Zod (`zod/v4`), Awilix, Jest (`@swc/jest`). Front — React, TanStack Router + React Query, dayjs (plugins `utc` et `isoWeek`), FullCalendar 6, `@react-pdf/renderer`, Tailwind.

**Spec :** `docs/superpowers/specs/2026-09-17-planning-cycle-semaines-design.md`

## Global Constraints

- **Worktree :** tout le travail se fait dans `.claude/worktrees/planning-cycle-semaines`, branche `worktree-planning-cycle-semaines`, rebasée sur `main` local. Ne jamais `cd` vers le dépôt principal.
- **Style back (Biome) :** indentation 2 espaces, guillemets simples, **pas de point-virgule**, groupes d'imports `:NODE: / :PACKAGE: / :ALIAS: / :PATH:`. `noUnusedImports` et `noUnusedVariables` sont des **erreurs**, pas des avertissements. Pas de nouveau fichier `index.ts` de ré-export (`noBarrelFile`).
- **Imports Prisma :** toujours depuis `src/generated/client` (ou `src/generated/enums` pour `Role`), **jamais** depuis `@prisma/client`.
- **Toute modification de `schema.prisma`** impose `npm run prisma:generate`.
- **Nommage du cycle :** `startOfWeek` (date, toujours un lundi) et `weekCount` (entier, `1..52`) — ces deux noms exacts sont utilisés du modèle Prisma jusqu'au composant React, sans renommage intermédiaire.
- **Id de la ligne unique :** la chaîne `"default"`, en dur.
- **Numérotation :** cyclique, modulo **positif**, valable aussi **avant** la semaine de départ. Avec départ au 05/01/2026 et `weekCount = 6` : 05/01 → S1, 09/02 → S6, 16/02 → S1, 29/12/2025 → S6, 22/12/2025 → S5.
- **Aucun cycle configuré (`null`) :** tous les affichages retombent sur le numéro ISO. C'est le chemin par défaut, il ne doit jamais régresser.
- **Hors périmètre, à ne jamais toucher :** la numérotation relative aux parcours — la branche `anchorMonday` de `titleFormat` dans `calendar.tsx`, et `EditModeContent` dans `bulkDuplicateForm.tsx` / `bulkMoveForm.tsx`.
- **Tests :** le back a Jest (projet `unit`), le front n'a **aucun runner de test** et on n'en introduit pas ici. Les tâches front se vérifient manuellement, avec les dates exactes données dans chaque tâche.

---

## Ordre des tâches

1. Modèle Prisma + migration
2. Repository + interface
3. Domaine + interface + test unitaire (TDD)
4. Enregistrement IoC
5. Schéma Zod + routes HTTP
6. Couche d'accès front (type, api, constantes, hook)
7. Util `cycleWeekNumber`
8. Popup de configuration + entrée du menu « Actions »
9. Branchement de la vue Calendrier
10. Branchement de la vue Timeline
11. Branchement de l'export PDF
12. Branchement des popups dupliquer / déplacer

Les tâches 1 à 5 livrent une API fonctionnelle et testable seule. La tâche 7 est un util pur sans dépendance. Les tâches 9 à 12 sont indépendantes entre elles et consomment toutes la même interface (`cycleWeekNumber` + le hook de la tâche 6).

---

### Task 1: Modèle Prisma `PlanningCycle` et migration

**Files:**
- Modify: `back/prisma/schema.prisma` (ajout en fin de fichier, après `model ForbiddenWeek`)

**Interfaces:**
- Consomme : rien.
- Produit : le modèle Prisma `PlanningCycle` et le type généré `PlanningCycle` importable depuis `src/generated/client`, avec les champs `id: string`, `startOfWeek: Date`, `weekCount: number`, `updatedAt: Date`.

- [ ] **Step 1: Ajouter le modèle au schéma**

À la fin de `back/prisma/schema.prisma`, après `model ForbiddenWeek` :

```prisma
model PlanningCycle {
  id          String   @id @default("default")
  startOfWeek DateTime @db.Date
  weekCount   Int
  updatedAt   DateTime @updatedAt
}
```

- [ ] **Step 2: Créer la migration**

```bash
cd back && npm run prisma:migrate:create -- --name add_planning_cycle
```

Attendu : un dossier `back/prisma/migrations/<timestamp>_add_planning_cycle/` contenant un `migration.sql` avec un `CREATE TABLE "PlanningCycle"`.

- [ ] **Step 3: Appliquer la migration et régénérer le client**

```bash
cd back && npm run prisma:migrate:dev && npm run prisma:generate
```

Attendu : la migration s'applique sans erreur et le client est régénéré dans `back/src/generated/`.

Si Postgres n'est pas démarré, le lancer d'abord :

```bash
docker network create proxy   # une seule fois, ignorer l'erreur si déjà créé
cd deploy && docker compose --profile db up -d
```

- [ ] **Step 4: Vérifier que le type généré existe**

```bash
cd back && grep -rn "PlanningCycle" src/generated | head
```

Attendu : au moins une occurrence du type `PlanningCycle`. Si la commande ne renvoie rien, le client n'a pas été régénéré — relancer `npm run prisma:generate`.

- [ ] **Step 5: Commit**

```bash
git add back/prisma/schema.prisma back/prisma/migrations
git commit -m "feat(planning-cycle): ajouter le modele PlanningCycle"
```

---

### Task 2: Repository `PlanningCycleRepository`

**Files:**
- Create: `back/src/main/types/infra/orm/repositories/planningCycle.repository.interface.ts`
- Create: `back/src/main/infra/orm/repositories/planningCycle.repository.ts`

**Interfaces:**
- Consomme : le type `PlanningCycle` généré (Task 1).
- Produit :
  - `PlanningCycleEntityRepo = PlanningCycle`
  - `PlanningCycleUpsertEntityRepo = { startOfWeek: Date; weekCount: number }`
  - `PlanningCycleRepositoryInterface` avec
    `find: () => Promise<PlanningCycleEntityRepo | null>`,
    `upsert: (params: PlanningCycleUpsertEntityRepo) => Promise<PlanningCycleEntityRepo>`,
    `delete: () => Promise<void>`

- [ ] **Step 1: Écrire l'interface du repository**

`back/src/main/types/infra/orm/repositories/planningCycle.repository.interface.ts` :

```ts
import type { PlanningCycle } from '../../../../../generated/client'

export type PlanningCycleEntityRepo = PlanningCycle

export type PlanningCycleUpsertEntityRepo = {
  startOfWeek: Date
  weekCount: number
}

export interface PlanningCycleRepositoryInterface {
  find: () => Promise<PlanningCycleEntityRepo | null>
  upsert: (
    params: PlanningCycleUpsertEntityRepo,
  ) => Promise<PlanningCycleEntityRepo>
  delete: () => Promise<void>
}
```

- [ ] **Step 2: Écrire le repository**

`back/src/main/infra/orm/repositories/planningCycle.repository.ts` :

```ts
import type { IocContainer } from '../../../types/application/ioc'
import type {
  PlanningCycleEntityRepo,
  PlanningCycleRepositoryInterface,
  PlanningCycleUpsertEntityRepo,
} from '../../../types/infra/orm/repositories/planningCycle.repository.interface'
import type { ErrorHandlerInterface } from '../../../types/utils/error-handler'
import type { PostgresPrismaClient } from '../postgres-client'

/** Identifiant de la ligne unique : la configuration est globale au service. */
const PLANNING_CYCLE_ID = 'default'

class PlanningCycleRepository implements PlanningCycleRepositoryInterface {
  private readonly prisma: PostgresPrismaClient
  private readonly errorHandler: ErrorHandlerInterface

  constructor({ postgresOrm, errorHandler }: IocContainer) {
    this.prisma = postgresOrm.prisma
    this.errorHandler = errorHandler
  }

  find(): Promise<PlanningCycleEntityRepo | null> {
    return this.prisma.planningCycle.findUnique({
      where: { id: PLANNING_CYCLE_ID },
    })
  }

  async upsert(
    params: PlanningCycleUpsertEntityRepo,
  ): Promise<PlanningCycleEntityRepo> {
    try {
      return await this.prisma.planningCycle.upsert({
        where: { id: PLANNING_CYCLE_ID },
        create: { id: PLANNING_CYCLE_ID, ...params },
        update: params,
      })
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({
        entityName: 'PlanningCycle',
        error: err,
      })
    }
  }

  // Supprimer un cycle inexistant n'est pas une erreur : le résultat visé
  // (aucun cycle configuré) est déjà atteint, d'où `deleteMany`.
  async delete(): Promise<void> {
    try {
      await this.prisma.planningCycle.deleteMany({
        where: { id: PLANNING_CYCLE_ID },
      })
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({
        entityName: 'PlanningCycle',
        error: err,
      })
    }
  }
}

export { PlanningCycleRepository }
```

- [ ] **Step 3: Vérifier le typage**

```bash
cd back && npx tsc --noEmit -p tsconfig.json
```

Attendu : aucune erreur mentionnant `planningCycle`.

> Note : à ce stade `tsc` peut signaler que `planningCycleRepository` manque dans `IocContainer` — c'est attendu, la Task 4 l'ajoute. Toute autre erreur sur ces deux fichiers doit être corrigée maintenant.

- [ ] **Step 4: Commit**

```bash
git add back/src/main/infra/orm/repositories/planningCycle.repository.ts back/src/main/types/infra/orm/repositories/planningCycle.repository.interface.ts
git commit -m "feat(planning-cycle): ajouter le repository"
```

---

### Task 3: Domaine `PlanningCycleDomain` (TDD)

**Files:**
- Create: `back/src/main/types/domain/planningCycle.domain.interface.ts`
- Create: `back/src/main/domain/planningCycle.domain.ts`
- Test: `back/src/test/unit/domain/planningCycle.domain.test.ts`

**Interfaces:**
- Consomme : `PlanningCycleRepositoryInterface` (Task 2), `toStartOfWeek` de `back/src/main/utils/date.ts`.
- Produit :
  - `PlanningCycleEntityDomain = PlanningCycle`
  - `PlanningCycleDomainInterface` avec
    `find: () => Promise<PlanningCycleEntityDomain | null>`,
    `save: (params: { startOfWeek: Date; weekCount: number }) => Promise<PlanningCycleEntityDomain>`,
    `delete: () => Promise<void>`

Le domaine porte deux règles : `startOfWeek` est ramené au lundi de sa semaine (via `toStartOfWeek`, déjà utilisé par `ForbiddenWeekDomain`), et `weekCount` hors de `1..52` est rejeté par un `Boom.badRequest`.

- [ ] **Step 1: Écrire l'interface du domaine**

`back/src/main/types/domain/planningCycle.domain.interface.ts` :

```ts
import type { PlanningCycle } from '../../../generated/client'

export type PlanningCycleEntityDomain = PlanningCycle

export type SavePlanningCycleParams = {
  startOfWeek: Date
  weekCount: number
}

export interface PlanningCycleDomainInterface {
  find: () => Promise<PlanningCycleEntityDomain | null>
  save: (
    params: SavePlanningCycleParams,
  ) => Promise<PlanningCycleEntityDomain>
  delete: () => Promise<void>
}
```

- [ ] **Step 2: Écrire les tests qui échouent**

`back/src/test/unit/domain/planningCycle.domain.test.ts` :

```ts
import { PlanningCycleDomain } from '../../../main/domain/planningCycle.domain'
import type { IocContainer } from '../../../main/types/application/ioc'
import type {
  PlanningCycleEntityRepo,
  PlanningCycleUpsertEntityRepo,
} from '../../../main/types/infra/orm/repositories/planningCycle.repository.interface'

// Repository factice : on ne teste ici que les règles du domaine, pas Prisma.
const buildDomain = () => {
  const upserts: PlanningCycleUpsertEntityRepo[] = []
  let deleteCalls = 0

  const planningCycleRepository = {
    find: () => Promise.resolve(null),
    upsert: (params: PlanningCycleUpsertEntityRepo) => {
      upserts.push(params)
      return Promise.resolve({
        id: 'default',
        startOfWeek: params.startOfWeek,
        weekCount: params.weekCount,
        updatedAt: new Date('2026-09-17T00:00:00.000Z'),
      } as PlanningCycleEntityRepo)
    },
    delete: () => {
      deleteCalls += 1
      return Promise.resolve()
    },
  }

  const domain = new PlanningCycleDomain({
    planningCycleRepository,
  } as unknown as IocContainer)

  return { domain, upserts, getDeleteCalls: () => deleteCalls }
}

describe('PlanningCycleDomain', () => {
  it('ramene une date de milieu de semaine au lundi de cette semaine', async () => {
    const { domain, upserts } = buildDomain()

    // Jeudi 8 janvier 2026 -> lundi 5 janvier 2026.
    await domain.save({
      startOfWeek: new Date('2026-01-08T15:30:00.000Z'),
      weekCount: 6,
    })

    expect(upserts).toHaveLength(1)
    expect(upserts[0].startOfWeek.toISOString()).toBe(
      '2026-01-05T00:00:00.000Z',
    )
  })

  it('laisse un lundi inchange', async () => {
    const { domain, upserts } = buildDomain()

    await domain.save({
      startOfWeek: new Date('2026-01-05T00:00:00.000Z'),
      weekCount: 4,
    })

    expect(upserts[0].startOfWeek.toISOString()).toBe(
      '2026-01-05T00:00:00.000Z',
    )
  })

  it('ramene un dimanche au lundi qui precede', async () => {
    const { domain, upserts } = buildDomain()

    // Dimanche 11 janvier 2026 -> lundi 5 janvier 2026.
    await domain.save({
      startOfWeek: new Date('2026-01-11T12:00:00.000Z'),
      weekCount: 6,
    })

    expect(upserts[0].startOfWeek.toISOString()).toBe(
      '2026-01-05T00:00:00.000Z',
    )
  })

  it('rejette un weekCount inferieur a 1', async () => {
    const { domain, upserts } = buildDomain()

    await expect(
      domain.save({
        startOfWeek: new Date('2026-01-05T00:00:00.000Z'),
        weekCount: 0,
      }),
    ).rejects.toThrow()
    expect(upserts).toHaveLength(0)
  })

  it('rejette un weekCount superieur a 52', async () => {
    const { domain, upserts } = buildDomain()

    await expect(
      domain.save({
        startOfWeek: new Date('2026-01-05T00:00:00.000Z'),
        weekCount: 53,
      }),
    ).rejects.toThrow()
    expect(upserts).toHaveLength(0)
  })

  it('rejette un weekCount non entier', async () => {
    const { domain, upserts } = buildDomain()

    await expect(
      domain.save({
        startOfWeek: new Date('2026-01-05T00:00:00.000Z'),
        weekCount: 2.5,
      }),
    ).rejects.toThrow()
    expect(upserts).toHaveLength(0)
  })

  it('accepte les bornes 1 et 52', async () => {
    const { domain, upserts } = buildDomain()

    await domain.save({
      startOfWeek: new Date('2026-01-05T00:00:00.000Z'),
      weekCount: 1,
    })
    await domain.save({
      startOfWeek: new Date('2026-01-05T00:00:00.000Z'),
      weekCount: 52,
    })

    expect(upserts.map((u) => u.weekCount)).toEqual([1, 52])
  })

  it('delegue la suppression au repository', async () => {
    const { domain, getDeleteCalls } = buildDomain()

    await domain.delete()

    expect(getDeleteCalls()).toBe(1)
  })
})
```

- [ ] **Step 3: Lancer les tests pour vérifier qu'ils échouent**

```bash
cd back && npx jest -c src/test/jest.config.ts --selectProjects unit planningCycle.domain
```

Attendu : ÉCHEC, avec une erreur de résolution du module `../../../main/domain/planningCycle.domain` (le fichier n'existe pas encore).

- [ ] **Step 4: Écrire le domaine**

`back/src/main/domain/planningCycle.domain.ts` :

```ts
import Boom from '@hapi/boom'

import type { IocContainer } from '../types/application/ioc'
import type {
  PlanningCycleDomainInterface,
  PlanningCycleEntityDomain,
  SavePlanningCycleParams,
} from '../types/domain/planningCycle.domain.interface'
import type { PlanningCycleRepositoryInterface } from '../types/infra/orm/repositories/planningCycle.repository.interface'
import { toStartOfWeek } from '../utils/date'

const MIN_WEEK_COUNT = 1
const MAX_WEEK_COUNT = 52

class PlanningCycleDomain implements PlanningCycleDomainInterface {
  private readonly planningCycleRepository: PlanningCycleRepositoryInterface

  constructor({ planningCycleRepository }: IocContainer) {
    this.planningCycleRepository = planningCycleRepository
  }

  find(): Promise<PlanningCycleEntityDomain | null> {
    return this.planningCycleRepository.find()
  }

  // `async` est volontaire : le garde-fou doit produire une promesse rejetee,
  // pas une exception synchrone, sinon les appelants (et les tests, qui
  // utilisent `rejects.toThrow`) ne la voient pas passer par le chemin
  // asynchrone. Le `return await` satisfait aussi la regle Biome `useAwait`.
  async save({
    startOfWeek,
    weekCount,
  }: SavePlanningCycleParams): Promise<PlanningCycleEntityDomain> {
    if (
      !Number.isInteger(weekCount) ||
      weekCount < MIN_WEEK_COUNT ||
      weekCount > MAX_WEEK_COUNT
    ) {
      throw Boom.badRequest(
        `weekCount must be an integer between ${MIN_WEEK_COUNT} and ${MAX_WEEK_COUNT}`,
      )
    }

    // La semaine de depart est toujours stockee sur son lundi : le front
    // n'a alors aucune normalisation a refaire avant de calculer le modulo.
    return await this.planningCycleRepository.upsert({
      startOfWeek: toStartOfWeek(startOfWeek),
      weekCount,
    })
  }

  delete(): Promise<void> {
    return this.planningCycleRepository.delete()
  }
}

export { PlanningCycleDomain }
```

- [ ] **Step 5: Lancer les tests pour vérifier qu'ils passent**

```bash
cd back && npx jest -c src/test/jest.config.ts --selectProjects unit planningCycle.domain
```

Attendu : 8 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add back/src/main/domain/planningCycle.domain.ts back/src/main/types/domain/planningCycle.domain.interface.ts back/src/test/unit/domain/planningCycle.domain.test.ts
git commit -m "feat(planning-cycle): ajouter le domaine et ses tests"
```

---

### Task 4: Enregistrement dans le conteneur IoC

**Files:**
- Modify: `back/src/main/types/application/ioc.ts` (imports en tête, puis le bloc après `// ForbiddenWeek` vers la ligne 100)
- Modify: `back/src/main/application/ioc/awilix/awilix-ioc-container.ts` (imports, appels de `build`, méthodes privées)

**Interfaces:**
- Consomme : `PlanningCycleDomain` (Task 3), `PlanningCycleRepository` (Task 2).
- Produit : les clés `planningCycleDomain` et `planningCycleRepository` sur `IocContainer`, résolvables depuis n'importe quel constructeur et depuis `fastify.iocContainer`.

- [ ] **Step 1: Déclarer les types dans `IocContainer`**

Dans `back/src/main/types/application/ioc.ts`, ajouter les deux imports auprès de leurs voisins `ForbiddenWeek…` :

```ts
import type { PlanningCycleDomainInterface } from '../domain/planningCycle.domain.interface'
```

```ts
import type { PlanningCycleRepositoryInterface } from '../infra/orm/repositories/planningCycle.repository.interface'
```

Puis, juste après le bloc `// ForbiddenWeek` (les lignes `forbiddenWeekDomain` / `forbiddenWeekRepository`) :

```ts
  // PlanningCycle
  readonly planningCycleDomain: PlanningCycleDomainInterface
  readonly planningCycleRepository: PlanningCycleRepositoryInterface
```

- [ ] **Step 2: Enregistrer les classes dans le conteneur Awilix**

Dans `back/src/main/application/ioc/awilix/awilix-ioc-container.ts`, ajouter les imports auprès de leurs voisins `ForbiddenWeek…` :

```ts
import { PlanningCycleDomain } from '../../../domain/planningCycle.domain'
import { PlanningCycleRepository } from '../../../infra/orm/repositories/planningCycle.repository'
```

Juste après le bloc d'appels `// ForbiddenWeek` (vers la ligne 121) :

```ts
    // PlanningCycle
    this.#registerPlanningCycleDomain()
    this.#registerPlanningCycleRepository()
```

Et après les méthodes `#registerForbiddenWeek…` (vers la ligne 305) :

```ts
  // PlanningCycle
  #registerPlanningCycleDomain(): void {
    this.register('planningCycleDomain', asClass(PlanningCycleDomain).singleton())
  }

  #registerPlanningCycleRepository(): void {
    this.register(
      'planningCycleRepository',
      asClass(PlanningCycleRepository).singleton(),
    )
  }
```

- [ ] **Step 3: Vérifier le typage et le lint**

```bash
cd back && npx tsc --noEmit -p tsconfig.json && npm run lint
```

Attendu : aucune erreur.

- [ ] **Step 4: Commit**

```bash
git add back/src/main/types/application/ioc.ts back/src/main/application/ioc/awilix/awilix-ioc-container.ts
git commit -m "feat(planning-cycle): enregistrer domaine et repository dans l'IoC"
```

---

### Task 5: Schéma Zod et routes HTTP

**Files:**
- Create: `back/src/main/interfaces/http/fastify/schemas/planningCycle.schema.ts`
- Create: `back/src/main/interfaces/http/fastify/routes/planningCycle.ts`
- Modify: `back/src/main/interfaces/http/fastify/routes/index.ts`

**Interfaces:**
- Consomme : `planningCycleDomain` et `userDomain` depuis `fastify.iocContainer` (Task 4).
- Produit : les endpoints
  - `GET /planning-cycle` → `{ startOfWeek: Date, weekCount: number } | null`
  - `PUT /planning-cycle` (ADMIN) ← `{ startOfWeek: Date, weekCount: number }` → même forme
  - `DELETE /planning-cycle` (ADMIN) → `204`

- [ ] **Step 1: Écrire le schéma Zod**

`back/src/main/interfaces/http/fastify/schemas/planningCycle.schema.ts` :

```ts
import { z } from 'zod/v4'

export const planningCycleResponseSchema = z.object({
  startOfWeek: z.coerce.date(),
  weekCount: z.number().int(),
})

// `null` quand aucun cycle n'est configure : le planning reste alors en
// numerotation ISO.
export const planningCycleNullableResponseSchema =
  planningCycleResponseSchema.nullable()

export const savePlanningCycleBodySchema = z.object({
  startOfWeek: z.coerce.date(),
  weekCount: z.number().int().min(1).max(52),
})

export type PlanningCycleResponse = z.infer<typeof planningCycleResponseSchema>
export type SavePlanningCycleBody = z.infer<typeof savePlanningCycleBodySchema>
```

- [ ] **Step 2: Écrire le routeur**

`back/src/main/interfaces/http/fastify/routes/planningCycle.ts` :

```ts
import Boom from '@hapi/boom'
import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod/v4'

import { Role } from '../../../../../generated/enums'
import {
  planningCycleNullableResponseSchema,
  planningCycleResponseSchema,
  type SavePlanningCycleBody,
  savePlanningCycleBodySchema,
} from '../schemas/planningCycle.schema'

const planningCycleRouter: FastifyPluginAsync = (fastify) => {
  const { planningCycleDomain, userDomain } = fastify.iocContainer

  const assertAdmin = async (userID: string) => {
    const currentUser = await userDomain.findByID(userID)
    if (currentUser?.role !== Role.ADMIN) {
      throw Boom.forbidden('Forbidden')
    }
  }

  // Lisible par tout utilisateur authentifie : la numerotation des semaines
  // s'affiche pour tout le monde, seule sa configuration est reservee.
  fastify.get(
    '/',
    {
      schema: { response: { 200: planningCycleNullableResponseSchema } },
      onRequest: [fastify.verifySessionCookie],
    },
    () => planningCycleDomain.find(),
  )

  // Enregistrer / mettre a jour (admin uniquement)
  fastify.put<{ Body: SavePlanningCycleBody }>(
    '/',
    {
      schema: {
        body: savePlanningCycleBodySchema,
        response: {
          200: planningCycleResponseSchema,
          403: z.object({ message: z.string() }),
        },
      },
      onRequest: [fastify.verifySessionCookie],
    },
    async (request) => {
      await assertAdmin(request.user.userID)
      return planningCycleDomain.save({
        startOfWeek: request.body.startOfWeek,
        weekCount: request.body.weekCount,
      })
    },
  )

  // Reinitialiser : le planning repasse en numerotation ISO (admin uniquement)
  fastify.delete(
    '/',
    {
      schema: {
        response: {
          204: z.null(),
          403: z.object({ message: z.string() }),
        },
      },
      onRequest: [fastify.verifySessionCookie],
    },
    async (request, reply) => {
      await assertAdmin(request.user.userID)
      await planningCycleDomain.delete()
      reply.code(204).send()
    },
  )

  return Promise.resolve()
}

export { planningCycleRouter }
```

- [ ] **Step 3: Enregistrer le routeur**

Dans `back/src/main/interfaces/http/fastify/routes/index.ts`, ajouter l'import à la suite de celui de `forbiddenWeekRouter` :

```ts
import { planningCycleRouter } from './planningCycle'
```

Puis, après la ligne d'enregistrement de `forbiddenWeekRouter` :

```ts
  await fastify.register(planningCycleRouter, { prefix: '/planning-cycle' })
```

- [ ] **Step 4: Vérifier typage, lint et tests**

```bash
cd back && npx tsc --noEmit -p tsconfig.json && npm run lint && npm run test:unit
```

Attendu : aucune erreur, tests unitaires au vert.

- [ ] **Step 5: Vérification manuelle de l'API**

Démarrer le back (`cd back && npm run dev`), se connecter avec un compte ADMIN pour obtenir le cookie de session, puis :

1. `GET /planning-cycle` → `200` avec le corps `null`.
2. `PUT /planning-cycle` avec `{"startOfWeek":"2026-01-08","weekCount":6}` → `200` avec `startOfWeek` ramené au **2026-01-05** (le jeudi est normalisé sur son lundi) et `weekCount: 6`.
3. `GET /planning-cycle` → `200` avec la valeur enregistrée.
4. `PUT /planning-cycle` avec `{"startOfWeek":"2026-01-05","weekCount":0}` → `400` (rejeté par Zod).
5. Avec un compte non-ADMIN, `PUT` → `403`.
6. `DELETE /planning-cycle` en ADMIN → `204`, puis `GET` → `null`.

- [ ] **Step 6: Commit**

```bash
git add back/src/main/interfaces/http/fastify/schemas/planningCycle.schema.ts back/src/main/interfaces/http/fastify/routes/planningCycle.ts back/src/main/interfaces/http/fastify/routes/index.ts
git commit -m "feat(planning-cycle): exposer les routes GET/PUT/DELETE"
```

---

### Task 6: Couche d'accès front (type, API, constantes, hook)

**Files:**
- Create: `front/src/types/planningCycle.ts`
- Create: `front/src/api/planningCycle.api.ts`
- Create: `front/src/queries/usePlanningCycle.ts`
- Modify: `front/src/constants/process.constant.ts` (après le bloc `FORBIDDEN_WEEK`, vers la ligne 133)

**Interfaces:**
- Consomme : les endpoints de la Task 5.
- Produit :
  - `type PlanningCycle = { startOfWeek: string; weekCount: number }`
  - `usePlanningCycleQueries(): { planningCycle: PlanningCycle | null | undefined; isPending: boolean }`
  - `usePlanningCycleMutations(): { savePlanningCycle, resetPlanningCycle }` (deux mutations React Query ; `savePlanningCycle.mutate({ startOfWeek, weekCount })`, `resetPlanningCycle.mutate()`)

- [ ] **Step 1: Écrire le type partagé**

`front/src/types/planningCycle.ts` :

```ts
export type PlanningCycle = {
  /** Lundi de la semaine de départ, au format ISO renvoyé par l'API. */
  startOfWeek: string
  /** Longueur du cycle, en semaines (1 à 52). */
  weekCount: number
}
```

- [ ] **Step 2: Ajouter les clés de process**

Dans `front/src/constants/process.constant.ts`, après le bloc `FORBIDDEN_WEEK` :

```ts
export const PLANNING_CYCLE = {
  GET: 'get_planning_cycle',
  SAVE: 'save_planning_cycle',
  RESET: 'reset_planning_cycle',
}
```

- [ ] **Step 3: Écrire le client d'API**

`front/src/api/planningCycle.api.ts` :

```ts
import { apiUrl } from '../constants/config.constant.ts'
import { handleHttpError } from '../libs/httpErrorHandler.ts'
import type { PlanningCycle } from '../types/planningCycle.ts'
import { fetchWithAuth } from './fetchWithAuth.ts'

export const PlanningCycleApi = {
  get: async (): Promise<PlanningCycle | null> => {
    const response = await fetchWithAuth(`${apiUrl}/planning-cycle`, {
      method: 'GET',
    })
    if (!response.ok) {
      handleHttpError(
        response,
        {},
        'Impossible de récupérer le cycle de semaines',
      )
    }
    return response.json()
  },

  save: async (cycle: PlanningCycle): Promise<PlanningCycle> => {
    const response = await fetchWithAuth(`${apiUrl}/planning-cycle`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cycle),
    })
    if (!response.ok) {
      handleHttpError(
        response,
        {},
        'Impossible d’enregistrer le cycle de semaines',
      )
    }
    return response.json()
  },

  reset: async (): Promise<void> => {
    const response = await fetchWithAuth(`${apiUrl}/planning-cycle`, {
      method: 'DELETE',
    })
    if (!response.ok) {
      handleHttpError(
        response,
        {},
        'Impossible de réinitialiser le cycle de semaines',
      )
    }
  },
}
```

- [ ] **Step 4: Écrire le hook React Query**

`front/src/queries/usePlanningCycle.ts` :

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { PlanningCycleApi } from '../api/planningCycle.api.ts'
import { PLANNING_CYCLE } from '../constants/process.constant.ts'
import { TOAST_SEVERITY } from '../constants/ui.constant.ts'
import { useDataFetching } from '../hooks/useDataFetching.ts'
import { useToast } from '../hooks/useToast.ts'
import type { PlanningCycle } from '../types/planningCycle.ts'

export const usePlanningCycleQueries = () => {
  const {
    data: planningCycle,
    isPending,
    isError,
    error,
  } = useQuery({
    queryKey: [PLANNING_CYCLE.GET],
    queryFn: PlanningCycleApi.get,
    retry: 0,
  })

  useDataFetching({ isPending, isError, error })

  return { planningCycle, isPending }
}

export const usePlanningCycleMutations = () => {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  const savePlanningCycle = useMutation({
    mutationKey: [PLANNING_CYCLE.SAVE],
    mutationFn: (cycle: PlanningCycle) => PlanningCycleApi.save(cycle),
    onSuccess: () => {
      toast({
        title: 'Cycle de semaines enregistré',
        severity: TOAST_SEVERITY.SUCCESS,
      })
    },
    onError: (error) => {
      toast({
        title: "Erreur lors de l'enregistrement du cycle",
        message: error.message,
        severity: TOAST_SEVERITY.ERROR,
      })
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: [PLANNING_CYCLE.GET] })
    },
  })

  const resetPlanningCycle = useMutation({
    mutationKey: [PLANNING_CYCLE.RESET],
    mutationFn: () => PlanningCycleApi.reset(),
    onSuccess: () => {
      toast({
        title: 'Numérotation ISO rétablie',
        severity: TOAST_SEVERITY.SUCCESS,
      })
    },
    onError: (error) => {
      toast({
        title: 'Erreur lors de la réinitialisation du cycle',
        message: error.message,
        severity: TOAST_SEVERITY.ERROR,
      })
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: [PLANNING_CYCLE.GET] })
    },
  })

  return { savePlanningCycle, resetPlanningCycle }
}
```

- [ ] **Step 5: Vérifier le typage et le lint**

```bash
cd front && npx tsc -b && npm run lint
```

Attendu : aucune erreur.

- [ ] **Step 6: Commit**

```bash
git add front/src/types/planningCycle.ts front/src/api/planningCycle.api.ts front/src/queries/usePlanningCycle.ts front/src/constants/process.constant.ts
git commit -m "feat(planning-cycle): ajouter l'acces API et le hook front"
```

---

### Task 7: Util `cycleWeekNumber`

**Files:**
- Create: `front/src/utils/weekCycle.ts` (le dossier `front/src/utils/` n'existe pas encore, le créer)

**Interfaces:**
- Consomme : `PlanningCycle` (Task 6), dayjs avec les plugins `utc` et `isoWeek`.
- Produit : `cycleWeekNumber(date: Dayjs, cycle: PlanningCycle): number`

C'est la seule logique non triviale du lot. Le piège est le modulo : en JavaScript, `-1 % 6` vaut `-1`, pas `5`. Sans le modulo positif, toute semaine antérieure à la semaine de départ afficherait un numéro négatif ou nul. La fonction vit dans ce fichier et nulle part ailleurs : les quatre points d'affichage l'appellent, aucun ne refait le calcul.

Les plugins `utc` et `isoWeek` sont déjà enregistrés globalement dans `front/src/main.tsx`, mais on les ré-étend ici — `dayjs.extend` est idempotent, et `weekPicker.tsx` fait déjà de même. Un util pur ne doit pas dépendre de l'ordre des imports de l'application.

- [ ] **Step 1: Écrire l'util**

`front/src/utils/weekCycle.ts` :

```ts
import dayjs, { type Dayjs } from 'dayjs'
import isoWeek from 'dayjs/plugin/isoWeek'
import utc from 'dayjs/plugin/utc'

import type { PlanningCycle } from '../types/planningCycle.ts'

dayjs.extend(isoWeek)
dayjs.extend(utc)

/**
 * Position de `date` dans le cycle, entre 1 et `cycle.weekCount`.
 *
 * Le modulo est volontairement « positif » : `((n % m) + m) % m`. En JavaScript
 * `-1 % 6` vaut `-1`, ce qui donnerait un numéro nul ou négatif pour les
 * semaines antérieures à la semaine de départ. Or le cycle se prolonge vers
 * l'arrière : avec un départ au 05/01 et un cycle de 6, la semaine du 29/12
 * doit afficher S6.
 */
export function cycleWeekNumber(date: Dayjs, cycle: PlanningCycle): number {
  const start = dayjs.utc(cycle.startOfWeek).startOf('isoWeek')
  const current = dayjs.utc(date.format('YYYY-MM-DD')).startOf('isoWeek')

  const weeksFromStart = current.diff(start, 'week')
  const position =
    ((weeksFromStart % cycle.weekCount) + cycle.weekCount) % cycle.weekCount

  return position + 1
}
```

- [ ] **Step 2: Vérifier le typage et le lint**

```bash
cd front && npx tsc -b && npm run lint
```

Attendu : aucune erreur.

- [ ] **Step 3: Vérification manuelle du calcul**

Le front n'a pas de runner de test ; on contrôle donc le calcul une fois, directement, avant de le brancher partout. Depuis `front/`, créer un fichier temporaire hors du dépôt :

```bash
cd front && cat > /tmp/check-week-cycle.mjs <<'EOF'
// Réplique exacte de cycleWeekNumber, pour contrôler la table de la spec.
const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000

const mondayOf = (iso) => {
  const d = new Date(`${iso}T00:00:00.000Z`)
  const day = d.getUTCDay() // 0 = dimanche
  const delta = day === 0 ? -6 : 1 - day
  d.setUTCDate(d.getUTCDate() + delta)
  return d
}

const cycleWeekNumber = (iso, startIso, weekCount) => {
  const weeks = Math.round(
    (mondayOf(iso).getTime() - mondayOf(startIso).getTime()) / MS_PER_WEEK,
  )
  return (((weeks % weekCount) + weekCount) % weekCount) + 1
}

const start = '2026-01-05'
const expected = [
  ['2025-12-22', 5],
  ['2025-12-29', 6],
  ['2026-01-05', 1],
  ['2026-01-12', 2],
  ['2026-02-09', 6],
  ['2026-02-16', 1],
  ['2026-02-23', 2],
  ['2026-01-08', 1], // jeudi de la semaine du 05/01
]

let ok = true
for (const [iso, want] of expected) {
  const got = cycleWeekNumber(iso, start, 6)
  if (got !== want) {
    ok = false
    console.log(`KO ${iso}: attendu S${want}, obtenu S${got}`)
  }
}
if (cycleWeekNumber('2026-06-15', start, 1) !== 1) {
  ok = false
  console.log('KO weekCount=1 : toute semaine doit valoir S1')
}

console.log(ok ? 'OK toutes les dates' : 'ECHEC')
EOF
node /tmp/check-week-cycle.mjs```

Attendu : `OK toutes les dates`. Si une ligne `KO` apparaît, le modulo positif est cassé — corriger `weekCycle.ts` avant d'aller plus loin. Supprimer ensuite le fichier temporaire : `rm /tmp/check-week-cycle.mjs`.

- [ ] **Step 4: Commit**

```bash
git add front/src/utils/weekCycle.ts
git commit -m "feat(planning-cycle): ajouter le calcul du numero de semaine cyclique"
```

---

### Task 8: Popup de configuration et entrée du menu « Actions »

**Files:**
- Create: `front/src/components/custom/popup/planningCycleForm.tsx`
- Modify: `front/src/routes/_authenticated/_admin/settings/planning.tsx` (imports en tête ; état à côté de `const [exportOpen, setExportOpen] = useState(false)` ligne 111 ; item du menu après celui de l'export PDF ; rendu de la popup à côté de `<RegeneratePathwaysForm …>` en fin de composant)

**Interfaces:**
- Consomme : `usePlanningCycleQueries`, `usePlanningCycleMutations` (Task 6), `cycleWeekNumber` (Task 7), `WeekPicker` (`front/src/components/ui/weekPicker.tsx`), les primitives de `front/src/components/ui/popup.tsx`.
- Produit : le composant `PlanningCycleForm`, dont les props sont
  `{ open: boolean; setOpen: (open: boolean) => void; cycle: PlanningCycle | null | undefined; onSave: (cycle: PlanningCycle) => void; onReset: () => void; isPending?: boolean }`.

- [ ] **Step 1: Écrire la popup**

`front/src/components/custom/popup/planningCycleForm.tsx` :

```tsx
import dayjs, { type Dayjs } from 'dayjs'
import { Minus, Plus, RotateCcw, Save, X } from 'lucide-react'
import { useEffect, useState } from 'react'

import type { PlanningCycle } from '../../../types/planningCycle.ts'
import { cycleWeekNumber } from '../../../utils/weekCycle.ts'
import { Button } from '../../ui/button.tsx'
import { Label } from '../../ui/label.tsx'
import {
  Popup,
  PopupBody,
  PopupContent,
  PopupFooter,
  PopupHeader,
  PopupTitle,
} from '../../ui/popup.tsx'
import { WeekPicker } from '../../ui/weekPicker.tsx'

const MIN_WEEK_COUNT = 1
const MAX_WEEK_COUNT = 52
const DEFAULT_WEEK_COUNT = 6

interface PlanningCycleFormProps {
  open: boolean
  setOpen: (open: boolean) => void
  cycle: PlanningCycle | null | undefined
  onSave: (cycle: PlanningCycle) => void
  onReset: () => void
  isPending?: boolean
}

export function PlanningCycleForm({
  open,
  setOpen,
  cycle,
  onSave,
  onReset,
  isPending = false,
}: PlanningCycleFormProps) {
  const [weekStart, setWeekStart] = useState<Dayjs>(() =>
    dayjs.utc().isoWeekday(1).startOf('day'),
  )
  const [weekCount, setWeekCount] = useState(DEFAULT_WEEK_COUNT)

  // À chaque ouverture, on repart du cycle enregistré : la popup ne doit pas
  // conserver une saisie abandonnée lors d'une ouverture précédente.
  useEffect(() => {
    if (!open) {
      return
    }
    setWeekStart(
      cycle
        ? dayjs.utc(cycle.startOfWeek).isoWeekday(1).startOf('day')
        : dayjs.utc().isoWeekday(1).startOf('day'),
    )
    setWeekCount(cycle?.weekCount ?? DEFAULT_WEEK_COUNT)
  }, [open, cycle])

  const handleWeekChange = (date: Dayjs | null) => {
    if (!date) {
      return
    }
    setWeekStart(dayjs.utc(date.format('YYYY-MM-DD')).isoWeekday(1))
  }

  const preview: PlanningCycle = {
    startOfWeek: weekStart.format('YYYY-MM-DD'),
    weekCount,
  }
  const restartWeek = weekStart.add(weekCount * 7, 'day')

  return (
    <Popup modal open={open} onOpenChange={setOpen}>
      <PopupContent>
        <PopupHeader>
          <PopupTitle className="font-bold text-xl">
            Cycle de semaines
          </PopupTitle>
        </PopupHeader>

        <PopupBody>
          <p className="text-sm text-text-light mb-4">
            Le planning numérote les semaines selon ce cycle au lieu du numéro
            de semaine de l’année.
          </p>

          <Label className="block text-sm font-medium text-text-dark mb-1">
            Semaine de départ
          </Label>
          <WeekPicker value={weekStart} onChange={handleWeekChange} />

          <Label className="block text-sm font-medium text-text-dark mt-4 mb-2">
            Longueur du cycle
          </Label>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() =>
                setWeekCount((count) => Math.max(MIN_WEEK_COUNT, count - 1))
              }
              disabled={weekCount <= MIN_WEEK_COUNT}
              className="flex items-center justify-center h-9 w-9 rounded-md border border-border bg-background hover:bg-muted transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Minus className="h-4 w-4 text-text-dark" />
            </button>

            <span className="w-24 text-center text-sm font-medium text-text-dark">
              {weekCount} semaine{weekCount > 1 ? 's' : ''}
            </span>

            <button
              type="button"
              onClick={() =>
                setWeekCount((count) => Math.min(MAX_WEEK_COUNT, count + 1))
              }
              disabled={weekCount >= MAX_WEEK_COUNT}
              className="flex items-center justify-center h-9 w-9 rounded-md border border-border bg-background hover:bg-muted transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Plus className="h-4 w-4 text-text-dark" />
            </button>
          </div>

          <p className="mt-4 text-sm text-text-light">
            S1 = semaine du{' '}
            <span className="font-medium text-text-dark">
              {weekStart.format('DD/MM/YYYY')}
            </span>
            , retour à S1 le{' '}
            <span className="font-medium text-text-dark">
              {restartWeek.format('DD/MM/YYYY')}
            </span>
            . Cette semaine est actuellement{' '}
            <span className="font-medium text-text-dark">
              S{cycleWeekNumber(dayjs.utc(), preview)}
            </span>
            .
          </p>
        </PopupBody>

        <PopupFooter>
          {cycle && (
            <Button
              variant="ghost"
              className="mr-auto text-text-light hover:text-text-dark"
              onClick={onReset}
              disabled={isPending}
            >
              <RotateCcw className="w-4 h-4" />
              Réinitialiser
            </Button>
          )}
          <Button variant="outline" onClick={() => setOpen(false)}>
            <X className="w-4 h-4" />
            Annuler
          </Button>
          <Button
            variant="default"
            onClick={() =>
              onSave({
                startOfWeek: weekStart.format('YYYY-MM-DD'),
                weekCount,
              })
            }
            disabled={isPending}
          >
            <Save className="w-4 h-4" />
            {isPending ? 'Enregistrement...' : 'Enregistrer'}
          </Button>
        </PopupFooter>
      </PopupContent>
    </Popup>
  )
}
```

- [ ] **Step 2: Brancher la popup dans la page planning**

Dans `front/src/routes/_authenticated/_admin/settings/planning.tsx` :

Ajouter `CalendarRange` à l'import existant de `lucide-react` (lignes 11-20), qui importe déjà `CalendarDays`, `Printer`, etc. :

```tsx
import {
  CalendarDays,
  CalendarRange,
  CheckSquare,
  GanttChart,
  Printer,
  RefreshCw,
  Settings2,
  Trash2,
  X,
} from 'lucide-react'
```

Ajouter les imports du composant et des hooks auprès de leurs voisins :

```tsx
import { PlanningCycleForm } from '../../../../components/custom/popup/planningCycleForm.tsx'
import {
  usePlanningCycleMutations,
  usePlanningCycleQueries,
} from '../../../../queries/usePlanningCycle.ts'
```

Après `const [exportOpen, setExportOpen] = useState(false)` (ligne 111) :

```tsx
  const [cycleOpen, setCycleOpen] = useState(false)
  const { planningCycle } = usePlanningCycleQueries()
  const { savePlanningCycle, resetPlanningCycle } = usePlanningCycleMutations()
```

Dans le `<DropdownMenu.Content>` du bouton « Actions », après l'item « Exporter le planning (PDF) » :

```tsx
                    <DropdownMenu.Item
                      onSelect={() => setCycleOpen(true)}
                      className="flex items-center gap-2 px-3 py-2 rounded cursor-pointer outline-none hover:bg-primary/20 text-sm select-none"
                    >
                      <CalendarRange size={16} />
                      Configurer le cycle de semaines
                    </DropdownMenu.Item>
```

Enfin, juste après `<RegeneratePathwaysForm … />` en fin de composant :

```tsx
        <PlanningCycleForm
          open={cycleOpen}
          setOpen={setCycleOpen}
          cycle={planningCycle}
          onSave={(cycle) =>
            savePlanningCycle.mutate(cycle, {
              onSuccess: () => setCycleOpen(false),
            })
          }
          onReset={() =>
            resetPlanningCycle.mutate(undefined, {
              onSuccess: () => setCycleOpen(false),
            })
          }
          isPending={savePlanningCycle.isPending || resetPlanningCycle.isPending}
        />
```

- [ ] **Step 3: Vérifier le typage et le lint**

```bash
cd front && npx tsc -b && npm run lint
```

Attendu : aucune erreur.

- [ ] **Step 4: Vérification manuelle**

Lancer le front (`cd front && npm run dev`) avec le back démarré, se connecter en ADMIN, aller sur la page Planning.

1. Le menu « Actions » contient « Configurer le cycle de semaines ».
2. Le clic ouvre la popup ; « Réinitialiser » est **absent** tant qu'aucun cycle n'existe.
3. Choisir la semaine du 05/01/2026 et un cycle de 6 : l'aperçu annonce « retour à S1 le 16/02/2026 ».
4. « Enregistrer » ferme la popup et affiche le toast de succès.
5. Rouvrir la popup : elle réaffiche 05/01/2026 et 6 semaines, et « Réinitialiser » est maintenant présent.
6. Recharger la page : les valeurs sont toujours là (elles viennent du serveur, pas du navigateur).

- [ ] **Step 5: Commit**

```bash
git add front/src/components/custom/popup/planningCycleForm.tsx front/src/routes/_authenticated/_admin/settings/planning.tsx
git commit -m "feat(planning-cycle): ajouter la popup de configuration au menu Actions"
```

---

### Task 9: Brancher la vue Calendrier

**Files:**
- Modify: `front/src/components/custom/Calendar/calendar.tsx` (type `CalendarProps` vers la ligne 146 ; destructuration des props vers la ligne 173 ; `titleFormat` lignes 356-376)
- Modify: `front/src/routes/_authenticated/_admin/settings/planning.tsx` (l'élément `<Calendar … />` de la branche `view === 'calendar'`)

**Interfaces:**
- Consomme : `PlanningCycle` (Task 6), `cycleWeekNumber` (Task 7), l'état `planningCycle` déjà présent dans la page (Task 8).
- Produit : la prop optionnelle `planningCycle?: PlanningCycle | null` sur `Calendar`.

**Attention :** `titleFormat` contient deux branches. Celle qui teste `anchorMonday` sert au **mode édition de parcours** et affiche déjà « Semaine N » relative au parcours — elle ne doit pas bouger. Seule la branche par défaut, celle qui construit `s${week} / …`, est modifiée.

- [ ] **Step 1: Ajouter la prop au composant**

Dans `front/src/components/custom/Calendar/calendar.tsx`, ajouter l'import :

```tsx
import type { PlanningCycle } from '../../../types/planningCycle.ts'
import { cycleWeekNumber } from '../../../utils/weekCycle.ts'
```

Dans l'interface `CalendarProps`, après `weekAnchorDate?: string` :

```tsx
  /** Cycle de numérotation du service ; absent = numéros de semaine ISO. */
  planningCycle?: PlanningCycle | null
```

Dans la destructuration des props de `function Calendar({ … })`, après `weekAnchorDate,` :

```tsx
  planningCycle,
```

- [ ] **Step 2: Modifier `titleFormat`**

Remplacer le corps actuel de `titleFormat` par :

```tsx
        titleFormat={(arg) => {
          const start = dayjs.utc(arg.start.marker)
          if (anchorMonday) {
            const weekNum =
              start.startOf('isoWeek').diff(anchorMonday, 'week') + 1
            return `Semaine ${weekNum}`
          }
          // Cycle du service s'il est configuré, numéro ISO sinon.
          const weekLabel = planningCycle
            ? `S${cycleWeekNumber(start, planningCycle)}`
            : `s${start.isoWeek()}`
          const startStr = start.format('DD MMMM')
          if (!arg.end) {
            return `${weekLabel} / ${startStr}`
          }
          // arg.end.marker est la fin INCLUSIVE de la plage (23:59:59.999 du
          // dernier jour visible), donc on n'enlève pas de jour.
          const end = dayjs.utc(arg.end.marker)
          // Vue "Jour" (plage d'un seul jour) : afficher le jour seul.
          if (end.isSame(start, 'day')) {
            return `${weekLabel} / ${startStr}`
          }
          return `${weekLabel} / ${startStr} - ${end.format('DD MMMM')}`
        }}
```

- [ ] **Step 3: Passer le cycle depuis la page planning**

Dans `front/src/routes/_authenticated/_admin/settings/planning.tsx`, sur l'élément `<Calendar … />`, ajouter après `weekAnchorDate={editMode ? startDate : undefined}` :

```tsx
                planningCycle={editMode ? undefined : planningCycle}
```

(En mode édition de parcours, le titre suit déjà la numérotation du parcours : le cycle du service n'a pas à s'y appliquer.)

- [ ] **Step 4: Vérifier le typage et le lint**

```bash
cd front && npx tsc -b && npm run lint
```

Attendu : aucune erreur.

- [ ] **Step 5: Vérification manuelle**

Avec un cycle « départ 05/01/2026, 6 semaines » configuré, page Planning en vue **Calendrier** :

1. Naviguer sur la semaine du 05/01/2026 → le titre affiche `S1 / 05 janvier - 09 janvier`.
2. Semaine du 09/02/2026 → `S6 / …`.
3. Semaine du 16/02/2026 → `S1 / …` (le cycle a rebouclé).
4. Semaine du 29/12/2025 → `S6 / …` (le cycle se prolonge vers l'arrière).
5. Réinitialiser le cycle depuis la popup → le titre repasse à `s2 / 05 janvier - 09 janvier`.

- [ ] **Step 6: Commit**

```bash
git add front/src/components/custom/Calendar/calendar.tsx front/src/routes/_authenticated/_admin/settings/planning.tsx
git commit -m "feat(planning-cycle): appliquer le cycle au titre de la vue calendrier"
```

---

### Task 10: Brancher la vue Timeline

**Files:**
- Modify: `front/src/routes/_authenticated/_admin/settings/planning.tsx` (l'instance `<FullCalendar … />` de la branche `view === 'timeline'`, autour de `weekNumbers={true}` / `weekNumberFormat={{ week: 'numeric' }}`)

**Interfaces:**
- Consomme : `cycleWeekNumber` (Task 7), `planningCycle` (Task 8).
- Produit : rien pour les tâches suivantes.

FullCalendar 6 accepte une fonction pour `weekNumberCalculation` : `(date: Date) => number`. Quand elle est fournie, `weekNumberFormat` continue de gouverner le rendu — on garde donc `{ week: 'numeric' }`, qui affiche le nombre renvoyé.

- [ ] **Step 1: Ajouter l'import de l'util**

Dans `front/src/routes/_authenticated/_admin/settings/planning.tsx` :

```tsx
import { cycleWeekNumber } from '../../../../utils/weekCycle.ts'
```

- [ ] **Step 2: Remplacer le calcul des numéros de semaine**

Sur l'instance `<FullCalendar … />` de la vue timeline, à côté de `weekNumbers={true}` et `weekNumberFormat={{ week: 'numeric' }}`, ajouter :

```tsx
                  weekNumberCalculation={
                    planningCycle
                      ? (date: Date) =>
                          cycleWeekNumber(dayjs.utc(date), planningCycle)
                      : 'ISO'
                  }
```

(`'ISO'` est la valeur qui reproduit le comportement actuel quand aucun cycle n'est configuré.)

- [ ] **Step 3: Vérifier le typage et le lint**

```bash
cd front && npx tsc -b && npm run lint
```

Attendu : aucune erreur. Si TypeScript refuse l'union `fonction | 'ISO'` en position de prop, extraire la valeur dans une variable typée juste avant le `return` du composant :

```tsx
  const weekNumberCalculation: 'ISO' | ((date: Date) => number) = planningCycle
    ? (date: Date) => cycleWeekNumber(dayjs.utc(date), planningCycle)
    : 'ISO'
```

et passer `weekNumberCalculation={weekNumberCalculation}`.

- [ ] **Step 4: Vérification manuelle**

Avec le cycle « 05/01/2026, 6 semaines », page Planning en vue **Timeline**, année 2026 :

1. La ligne de la semaine du 05/01 porte le numéro `1`.
2. Celle du 09/02 porte `6`, celle du 16/02 porte `1`.
3. Les numéros ne dépassent jamais 6 sur toute l'année.
4. Après réinitialisation du cycle, les numéros ISO 1→53 reviennent.

- [ ] **Step 5: Commit**

```bash
git add front/src/routes/_authenticated/_admin/settings/planning.tsx
git commit -m "feat(planning-cycle): appliquer le cycle aux numeros de la vue timeline"
```

---

### Task 11: Brancher l'export PDF

**Files:**
- Modify: `front/src/components/custom/planning/pdf/planning-pdf.utils.ts` (type `PlanningWeek` et signature de `buildPlanningWeeks`)
- Modify: `front/src/components/custom/planning/pdf/planning-weeks.pdf.tsx` (ligne 241, `<Text style={styles.title}>Semaine {week.isoWeek}</Text>`)
- Modify: `front/src/components/custom/planning/pdf/planning-export-modal.tsx` (appel de `buildPlanningWeeks`)

**Interfaces:**
- Consomme : `cycleWeekNumber` (Task 7), `usePlanningCycleQueries` (Task 6).
- Produit : le champ `weekLabel: string` sur `PlanningWeek`, et le cinquième paramètre optionnel `cycle` de `buildPlanningWeeks`.

`isoWeek` est **conservé** sur `PlanningWeek` : c'est une donnée brute de la semaine, et la retirer toucherait du code qui n'a rien à voir avec cette feature. On ajoute `weekLabel`, qui porte le libellé effectivement affiché.

- [ ] **Step 1: Ajouter `weekLabel` à `buildPlanningWeeks`**

Dans `front/src/components/custom/planning/pdf/planning-pdf.utils.ts`, ajouter les imports :

```ts
import type { PlanningCycle } from '../../../../types/planningCycle.ts'
import { cycleWeekNumber } from '../../../../utils/weekCycle.ts'
```

Dans le type `PlanningWeek`, après `isoWeek: number` :

```ts
  /** Libellé affiché en titre de page : numéro de cycle ou numéro ISO. */
  weekLabel: string
```

Changer la signature de `buildPlanningWeeks` pour accepter le cycle :

```ts
export function buildPlanningWeeks(
  slots: Slot[],
  firstWeekStart: Dayjs,
  weekCount: number,
  forbiddenWeekStarts: string[] = [],
  cycle?: PlanningCycle | null,
): PlanningWeek[] {
```

Et dans l'objet retourné, après `isoWeek: weekStart.isoWeek(),` :

```ts
      weekLabel: cycle
        ? `${cycleWeekNumber(weekStart, cycle)}`
        : `${weekStart.isoWeek()}`,
```

- [ ] **Step 2: Afficher `weekLabel` dans le PDF**

Dans `front/src/components/custom/planning/pdf/planning-weeks.pdf.tsx`, remplacer :

```tsx
        <Text style={styles.title}>Semaine {week.isoWeek}</Text>
```

par :

```tsx
        <Text style={styles.title}>Semaine {week.weekLabel}</Text>
```

- [ ] **Step 3: Passer le cycle depuis le modal d'export**

Dans `front/src/components/custom/planning/pdf/planning-export-modal.tsx`, ajouter l'import :

```tsx
import { usePlanningCycleQueries } from '../../../../queries/usePlanningCycle.ts'
```

À côté des autres hooks (`const { pathwayTemplates } = usePathwayTemplateQueries()`) :

```tsx
  const { planningCycle } = usePlanningCycleQueries()
```

Et dans le `useMemo` qui appelle `buildPlanningWeeks`, ajouter le cinquième argument et la dépendance :

```tsx
  const weeks = useMemo(
    () =>
      buildPlanningWeeks(
        selectedSlots,
        weekStart,
        weekCount,
        forbiddenWeekStarts,
        planningCycle,
      ),
    [selectedSlots, weekStart, weekCount, forbiddenWeekStarts, planningCycle],
  )
```

- [ ] **Step 4: Vérifier le typage et le lint**

```bash
cd front && npx tsc -b && npm run lint
```

Attendu : aucune erreur.

- [ ] **Step 5: Vérification manuelle**

Avec le cycle « 05/01/2026, 6 semaines » : menu « Actions » → « Exporter le planning (PDF) », semaine de départ 05/01/2026, 8 semaines.

1. L'aperçu enchaîne les titres « Semaine 1 », « Semaine 2 », … « Semaine 6 », puis « Semaine 1 » et « Semaine 2 ».
2. Les sous-titres de dates restent corrects et inchangés.
3. Après réinitialisation du cycle, les titres repassent aux numéros ISO (« Semaine 2 », « Semaine 3 », …).

- [ ] **Step 6: Commit**

```bash
git add front/src/components/custom/planning/pdf/planning-pdf.utils.ts front/src/components/custom/planning/pdf/planning-weeks.pdf.tsx front/src/components/custom/planning/pdf/planning-export-modal.tsx
git commit -m "feat(planning-cycle): appliquer le cycle aux titres de l'export PDF"
```

---

### Task 12: Brancher les popups dupliquer / déplacer

**Files:**
- Modify: `front/src/components/custom/popup/bulkDuplicateForm.tsx` (interface `NormalModeProps`, passage de la prop, `NormalModeContent` lignes 92-121)
- Modify: `front/src/components/custom/popup/bulkMoveForm.tsx` (mêmes endroits, `NormalModeContent` lignes 92-121)
- Modify: `front/src/routes/_authenticated/_admin/settings/planning.tsx` (les deux instances **hors** `editMode` de `<BulkDuplicateForm>` et `<BulkMoveForm>`)

**Interfaces:**
- Consomme : `PlanningCycle` (Task 6), `cycleWeekNumber` (Task 7), `planningCycle` (Task 8).
- Produit : la prop optionnelle `planningCycle?: PlanningCycle | null` sur `NormalModeProps` des deux formulaires.

**Attention :** `EditModeContent` affiche « Semaine cible du parcours » — une numérotation relative au parcours théorique, sans rapport avec le cycle du service. Il ne doit pas être modifié, et la prop n'est ajoutée qu'à `NormalModeProps`.

- [ ] **Step 1: Modifier `bulkDuplicateForm.tsx`**

Ajouter les imports :

```tsx
import type { PlanningCycle } from '../../../types/planningCycle.ts'
import { cycleWeekNumber } from '../../../utils/weekCycle.ts'
```

Dans `interface NormalModeProps`, après `onWeekChange: (value: Dayjs | null) => void` :

```tsx
  planningCycle?: PlanningCycle | null
```

Dans le rendu, passer la prop à `NormalModeContent` :

```tsx
            <NormalModeContent
              weekDate={props.weekDate}
              onWeekChange={props.onWeekChange}
              planningCycle={props.planningCycle}
            />
```

Remplacer `NormalModeContent` par :

```tsx
function NormalModeContent({
  weekDate,
  onWeekChange,
  planningCycle,
}: {
  weekDate: Dayjs | null
  onWeekChange: (value: Dayjs | null) => void
  planningCycle?: PlanningCycle | null
}) {
  const weekStart = weekDate?.isoWeekday(1) ?? null
  const weekStartLabel = weekStart ? weekStart.format('DD MMMM YYYY') : ''
  const weekEndLabel = weekStart
    ? weekStart.add(4, 'day').format('DD MMMM YYYY')
    : ''
  const cycleLabel =
    weekStart && planningCycle
      ? `S${cycleWeekNumber(weekStart, planningCycle)} — `
      : ''

  return (
    <>
      <Label className="block text-sm font-medium text-text-dark mb-1">
        Semaine cible
      </Label>
      <WeekPicker value={weekDate} onChange={onWeekChange} />

      {weekStart && (
        <p className="mt-2 text-sm text-text-light">
          <span className="font-medium text-text-dark">{cycleLabel}</span>
          Semaine du{' '}
          <span className="font-medium text-text-dark">{weekStartLabel}</span>{' '}
          au <span className="font-medium text-text-dark">{weekEndLabel}</span>
        </p>
      )}
    </>
  )
}
```

- [ ] **Step 2: Modifier `bulkMoveForm.tsx`**

`bulkMoveForm.tsx` a la même structure que `bulkDuplicateForm.tsx`. Ajouter les imports :

```tsx
import type { PlanningCycle } from '../../../types/planningCycle.ts'
import { cycleWeekNumber } from '../../../utils/weekCycle.ts'
```

Dans `interface NormalModeProps`, après `onWeekChange: (value: Dayjs | null) => void` :

```tsx
  planningCycle?: PlanningCycle | null
```

Dans le rendu, passer la prop à `NormalModeContent` :

```tsx
            <NormalModeContent
              weekDate={props.weekDate}
              onWeekChange={props.onWeekChange}
              planningCycle={props.planningCycle}
            />
```

Remplacer `NormalModeContent` (lignes 92-121) par :

```tsx
function NormalModeContent({
  weekDate,
  onWeekChange,
  planningCycle,
}: {
  weekDate: Dayjs | null
  onWeekChange: (value: Dayjs | null) => void
  planningCycle?: PlanningCycle | null
}) {
  const weekStart = weekDate?.isoWeekday(1) ?? null
  const weekStartLabel = weekStart ? weekStart.format('DD MMMM YYYY') : ''
  const weekEndLabel = weekStart
    ? weekStart.add(4, 'day').format('DD MMMM YYYY')
    : ''
  const cycleLabel =
    weekStart && planningCycle
      ? `S${cycleWeekNumber(weekStart, planningCycle)} — `
      : ''

  return (
    <>
      <Label className="block text-sm font-medium text-text-dark mb-1">
        Semaine cible
      </Label>
      <WeekPicker value={weekDate} onChange={onWeekChange} />

      {weekStart && (
        <p className="mt-2 text-sm text-text-light">
          <span className="font-medium text-text-dark">{cycleLabel}</span>
          Semaine du{' '}
          <span className="font-medium text-text-dark">{weekStartLabel}</span>{' '}
          au <span className="font-medium text-text-dark">{weekEndLabel}</span>
        </p>
      )}
    </>
  )
}
```

- [ ] **Step 3: Passer le cycle depuis la page planning**

Dans `front/src/routes/_authenticated/_admin/settings/planning.tsx`, sur l'instance `<BulkDuplicateForm>` de la branche sans `editMode` (celle du `else` de la ternaire), ajouter après `onWeekChange={setDuplicateWeekDate}` :

```tsx
            planningCycle={planningCycle}
```

Et de même sur l'instance `<BulkMoveForm>` de sa branche sans `editMode`, après `onWeekChange={setMoveWeekDate}` :

```tsx
            planningCycle={planningCycle}
```

Ne rien changer sur les deux instances `editMode`.

- [ ] **Step 4: Vérifier le typage et le lint**

```bash
cd front && npx tsc -b && npm run lint
```

Attendu : aucune erreur.

- [ ] **Step 5: Vérification manuelle**

Avec le cycle « 05/01/2026, 6 semaines », page Planning en vue Calendrier (hors mode édition) :

1. Sélectionner un créneau, choisir « Dupliquer sur une semaine », prendre la semaine du 16/02/2026 → la popup affiche « S1 — Semaine du 16 février 2026 au 20 février 2026 ».
2. Même contrôle avec « Déplacer sur une semaine ».
3. Entrer en mode édition d'un parcours et rouvrir la popup : elle affiche toujours « Semaine cible du parcours » avec son compteur, **inchangée**.
4. Après réinitialisation du cycle, le préfixe disparaît et la phrase revient à sa forme actuelle.

- [ ] **Step 6: Commit**

```bash
git add front/src/components/custom/popup/bulkDuplicateForm.tsx front/src/components/custom/popup/bulkMoveForm.tsx front/src/routes/_authenticated/_admin/settings/planning.tsx
git commit -m "feat(planning-cycle): rappeler le numero de cycle dans les popups dupliquer et deplacer"
```

---

## Vérification finale

- [ ] **Back : typage, lint, tests**

```bash
cd back && npx tsc --noEmit -p tsconfig.json && npm run lint && npm run test:unit
```

Attendu : aucune erreur, tests au vert.

- [ ] **Front : build complet**

```bash
cd front && npm run build && npm run lint
```

Attendu : build réussi, aucune erreur de lint.

- [ ] **Parcours de bout en bout**

Cycle « départ 05/01/2026, 6 semaines » configuré :

| Contrôle | Attendu |
|---|---|
| Vue Calendrier, semaine du 16/02/2026 | titre `S1 / …` |
| Vue Calendrier, semaine du 29/12/2025 | titre `S6 / …` |
| Vue Timeline, année 2026 | aucun numéro au-dessus de 6 |
| Export PDF, 8 semaines depuis le 05/01 | titres 1,2,3,4,5,6,1,2 |
| Popup « Dupliquer », semaine du 16/02 | préfixe `S1 — ` |
| Mode édition de parcours | titre « Semaine N » du parcours, inchangé |

Puis « Réinitialiser » dans la popup de configuration :

| Contrôle | Attendu |
|---|---|
| Vue Calendrier | retour à `s<numéro ISO> / …` |
| Vue Timeline | numéros ISO 1→53 |
| Export PDF | titres en numéros ISO |
| Popups dupliquer / déplacer | plus de préfixe de cycle |

- [ ] **Merge sur `main`**

Une fois toutes les vérifications passées, fusionner la branche `worktree-planning-cycle-semaines` dans `main`.
