# PDF patient, étape 5 — l'écran super-admin des modèles livrés

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Le super-admin compose les modèles livrés avec le même éditeur que les services, sans déploiement.

**Architecture:** Un second montage de l'éditeur de l'étape 2-3, sur les routes hors tenant. L'éditeur, aujourd'hui soudé à son fichier de route, est extrait en composant ; les deux écrans le montent avec leur propre source de données. Côté back, `PdfDesignPreset` est global : ses routes vivent sous `/super-admin`, ses lectures et écritures passent par `runAsSuperAdmin`, et **la table de capacités doit les déclarer couple par couple**.

**Tech Stack:** Prisma, Zod v4, Fastify, jest côté back ; React 19, TanStack Router + Query, vitest côté front. Aucune dépendance nouvelle, aucune migration — `PdfDesignPreset` existe depuis l'étape 1.

**Spec:** `docs/superpowers/specs/2026-10-14-pdf-patient-designs-design.md` (§ « Routes », § « Écrans » point 3, et le § « Deux comportements du guard » qui décide de cette étape)

## Global Constraints

- **`PdfDesignPreset` doit entrer dans `SUPERADMIN_GLOBAL_OPERATIONS`, couple par couple.** La spec le dit en toutes lettres : « sous contexte super-admin, un modèle global absent de cette table est refusé en entier, lecture comprise. Oublier cette déclaration rend l'écran super-admin inerte, **sans que rien d'autre ne rougisse** ». Vérifié : le modèle en est absent aujourd'hui (`tenant-guard.ts:548`).
- **Hors de `runAsSuperAdmin`, c'est une AUTRE table qui s'applique.** Sous `/super-admin` il n'y a aucun store (`routes/index.ts` appelle `tenantContext.clear()`, et `tenant.plugin.ts` est le seul à appeler `enter()`) : un dépôt qui n'encadre pas ses requêtes tombe sous `NO_CONTEXT_GLOBAL_OPERATIONS`, pas sous `SUPERADMIN_GLOBAL_OPERATIONS`. Les méthodes de cette étape encadrent donc, et c'est ce qui rend la déclaration ci-dessus nécessaire.
- **Le piège de la paresse de Prisma.** Une requête Prisma est paresseuse : le contexte doit être lu **avant le premier point de suspension**. Convention du dépôt : un rappel `async` avec un `await` à l'intérieur (`back/CLAUDE.md`, § multi-tenant).
- **Les lectures de presets déjà écrites ne bougent pas.** `findAllPresets` et `findPresetByID` (`pdf-design.repository.ts`) sont appelées sous contexte de TENANT, où un modèle global passe sans filtre. Les encadrer casserait ce chemin. L'étape ajoute un dépôt distinct plutôt que de modifier celui-là.
- **Un preset n'utilise que les images livrées.** La spec exclut une table d'images globale ; l'inspecteur du preset ne reçoit donc ni `assets` ni `onDeposer` — ses props sont optionnelles depuis l'étape 4.
- **Un preset n'est le défaut de personne.** `isDefault` appartient aux designs de service. Les réponses de preset ne le portent pas.
- **Aucune nouvelle permission.** Les routes sous `/super-admin` déclarent `config: { permission: 'establishments:manage' }` comme leurs sœurs — c'est `requireSuperAdmin` qui garde, mais le serveur refuse de démarrer sans la déclaration (`assertSuperAdminShapedRoute`).
- **Un écran de section est dans `NAVIGATION` ou dans `HORS_ONGLETS`**, jamais nulle part : `navigation.test.ts` échoue sinon.
- **L'UI dit « Supprimer » / « Supprimés » / « Restaurer »**, jamais « Archiver » — le back archive.
- **Biome, jamais ESLint ni Prettier. Jamais de `biome-ignore`.** Commentaires synthétiques.

## Review Focus

Cinq classes d'entrée que la spec implique et qu'aucune tâche n'exerce spontanément.

1. **La table de capacités oubliée ou incomplète.** C'est le défaut que la spec nomme, et il est silencieux : l'écran répond 500 ou vide, et aucune autre suite ne rougit. Un test doit sonder **chaque** couple déclaré, et refuser ceux qui ne le sont pas. → Tâche 1.
2. **Un compte sans le drapeau `isSuperAdmin`** sur chacune des nouvelles routes : 404, jamais 403, et jamais 200. Le piège : une route posée hors du plugin hérite du garde de forme mais pas de `requireSuperAdmin`. → Tâche 2.
3. **Un contenu de preset invalide ou d'une version future**, déposé à la main en base. La liste entière ne doit pas tomber — c'est la règle que l'étape 2 tient déjà côté service (`PdfDesignSummaryDomain` écarte la ligne, pas la réponse). → Tâche 2.
4. **Un réordonnancement partiel ou menteur** : une liste d'identifiants à laquelle il manque un preset, qui en porte un inconnu, ou qui en répète un. Écrire les rangs tels quels laisserait des trous ou des doublons silencieux. → Tâche 3.
5. **Supprimer le preset de référence**, celui dont le seed dépend (`REFERENCE_PRESET_ID`). Le rejeu du seed le recrée-t-il, et un service qui l'avait dupliqué garde-t-il sa copie ? La réponse doit être décidée et tenue, pas découverte en production. → Tâche 3.

---

### Task 1: Déclarer `PdfDesignPreset` au garde-fou du super-admin

**Files:**
- Modify: `back/src/main/infra/orm/tenant-guard.ts`
- Test: `back/src/test/unit/infra/tenant-guard.test.ts`

**Interfaces:**
- Produces: l'autorisation, sous `runAsSuperAdmin`, de `PdfDesignPreset` × (`findMany`, `findUnique`, `findFirst`, `count`, `create`, `update`). Toutes les tâches back en dépendent.

**Pourquoi d'abord, et seule.** C'est le point que la spec signale comme invisible. En le posant en premier, avec son test, on sait que l'inertie éventuelle de l'écran viendra d'ailleurs.

- [ ] **Step 1: Écrire le test qui échoue**

Dans `back/src/test/unit/infra/tenant-guard.test.ts`, à côté des autres cas de `SUPERADMIN_GLOBAL_OPERATIONS` :

```ts
  // La spec de l'etape 5 nomme ce defaut comme invisible : un modele global absent de
  // SUPERADMIN_GLOBAL_OPERATIONS est refuse EN ENTIER, lecture comprise, et l'ecran
  // super-admin est alors inerte sans qu'aucune autre suite ne rougisse.
  describe('PdfDesignPreset sous superadmin', () => {
    const sousSuperAdmin = (operation: string, args: object = {}) =>
      assertTenantScope(
        { model: 'PdfDesignPreset', operation, args },
        { kind: 'superadmin' },
      )

    it.each(['findMany', 'findUnique', 'findFirst', 'count', 'create', 'update'])(
      'laisse passer %s',
      (operation) => {
        expect(() => sousSuperAdmin(operation)).not.toThrow()
      },
    )

    // Contrepoint : la table reste une LISTE, pas un laissez-passer sur le modele. Une
    // suppression dure n'est declaree nulle part — un preset s'archive.
    it.each(['delete', 'deleteMany', 'updateMany', 'upsert'])(
      'refuse %s',
      (operation) => {
        expect(() => sousSuperAdmin(operation)).toThrow(TenantScopeMissingError)
      },
    )
  })
```

- [ ] **Step 2: Lancer pour voir échouer**

```bash
cd back && NODE_OPTIONS=--experimental-vm-modules npx -y dotenv-cli@7.3.0 -e .env.test.local -e .env.test -- npx jest --runInBand -c src/test/jest.config.ts src/test/unit/infra/tenant-guard.test.ts -t "PdfDesignPreset sous superadmin"
```

Attendu : les six premiers cas ÉCHOUENT (`TenantScopeMissingError`), les quatre derniers passent déjà. C'est exactement la forme du défaut : tout est refusé.

- [ ] **Step 3: Déclarer le modèle**

Dans `SUPERADMIN_GLOBAL_OPERATIONS` (`tenant-guard.ts:548`), après `SuperAdminAccessGrant` :

```ts
  // L'ecran super-admin des modeles livres (etape 5). PAS de `delete` ni de `deleteMany` : un
  // preset s'archive (`archivedAt`), comme les quatre referentiels — la suppression dure
  // n'existe pas, et un preset efface casserait le seed qui le recree par `upsert`.
  // PAS d'`upsert` non plus : le seed tourne hors de ce contexte.
  PdfDesignPreset: [...LECTURES_GLOBALES_SANS_MUTATION, 'create', 'update'],
```

Vérifier que `LECTURES_GLOBALES_SANS_MUTATION` couvre bien `findMany`, `findUnique`, `findFirst` et `count` ; si l'une manque, l'ajouter explicitement à l'entrée plutôt que d'élargir la constante partagée.

- [ ] **Step 4: Lancer pour voir passer**

```bash
cd back && NODE_OPTIONS=--experimental-vm-modules npx -y dotenv-cli@7.3.0 -e .env.test.local -e .env.test -- npx jest --runInBand -c src/test/jest.config.ts src/test/unit/infra
```

Attendu : vert, `tenant-guard-monotonie` compris — déclarer un modèle relâche des verdicts, et ce test compare l'arbre de travail au DERNIER COMMIT. Il peut donc rougir tant que la déclaration n'est pas commitée ; c'est le comportement observé à l'étape 4, et son en-tête le documente. Vérifier dans ce cas que **tous** les chemins perdus nomment `PdfDesignPreset`, puis commiter et relancer.

- [ ] **Step 5: Commit**

```bash
cd back && npx biome check --write src
git add back && git commit -m "feat(pdf): PdfDesignPreset declare au garde-fou du super-admin"
```

---

### Task 2: Lire et modifier un preset, hors tenant

**Files:**
- Create: `back/src/main/interfaces/http/fastify/schemas/pdf-design-preset.schema.ts`
- Create: `back/src/main/interfaces/http/fastify/routes/super-admin/pdf-design-presets.ts`
- Create: `back/src/main/domain/pdf-design-preset.domain.ts`
- Create: `back/src/main/types/domain/pdf-design-preset.domain.interface.ts`
- Create: `back/src/main/infra/orm/repositories/pdf-design-preset.repository.ts`
- Create: `back/src/main/types/infra/orm/repositories/pdf-design-preset.repository.interface.ts`
- Modify: `back/src/main/application/ioc/awilix/awilix-ioc-container.ts`
- Modify: `back/src/main/types/application/ioc.ts`
- Modify: `back/src/main/interfaces/http/fastify/routes/super-admin.routes.ts`
- Create: `back/src/test/e2e/super-admin-pdf-design-presets.test.ts`
- Test: `back/src/test/unit/infra/repository-scope.test.ts`

**Interfaces:**
- Consumes: la déclaration de la tâche 1.
- Produces: `GET /super-admin/pdf-design-presets?archived=`, `POST /super-admin/pdf-design-presets`, `PATCH /super-admin/pdf-design-presets/:presetID`. `PdfDesignPresetDomain.findAll/create/update`.

- [ ] **Step 1: Écrire les e2e qui échouent**

`back/src/test/e2e/super-admin-pdf-design-presets.test.ts`. Reprendre le harnais de `super-admin-access-log.test.ts` (compte super-admin, compte ordinaire, `buildTestApp`).

```ts
import type { FastifyInstance } from 'fastify'

import { buildTestApp } from './setup/app'
import { testDb, truncateAll } from './setup/db'
import { createUser, signIn } from './setup/fixtures'

const CONTENU = {
  version: 1,
  pages: [{ kind: 'canvas', id: 'p1', background: '#ffffff', elements: [] }],
}

describe('routes super-admin des modeles livres', () => {
  let app: FastifyInstance
  let close: () => Promise<void>
  let cookiesSuper: { access_token: string }
  let cookiesOrdinaire: { access_token: string }

  beforeAll(async () => {
    await truncateAll()
    const built = await buildTestApp()
    app = built.app
    close = built.close
    // Un super-admin et un compte authentifie SANS le drapeau : le second est le contrepoint
    // de chaque cas, sinon un 404 de route inexistante passerait pour un 404 de garde.
    const sup = await createUser({
      email: 'super@medisync.fr',
      isSuperAdmin: true,
    })
    const ord = await createUser({ email: 'ordinaire@medisync.fr' })
    cookiesSuper = await signIn(app, sup.email)
    cookiesOrdinaire = await signIn(app, ord.email)
  })

  afterAll(async () => {
    await close()
    await testDb.$disconnect()
  })

  const lister = (cookies: { access_token: string }, archived = false) =>
    app.inject({
      method: 'GET',
      url: `/super-admin/pdf-design-presets?archived=${archived}`,
      cookies,
    })

  it('liste les modeles livres', async () => {
    await testDb.pdfDesignPreset.create({
      data: { id: 'p-un', name: 'Programme de reference', content: CONTENU, sortOrder: 0 },
    })

    const res = await lister(cookiesSuper)

    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject([
      { id: 'p-un', name: 'Programme de reference' },
    ])
    // Un preset n'est le defaut de personne : `isDefault` appartient aux designs de service.
    expect(res.json()[0].isDefault).toBeUndefined()
  })

  // Review Focus 2. Le 404, jamais 403 : ne pas reveler une zone qu'on n'a pas le droit de
  // voir. Le contrepoint depuis le super-admin (200 ci-dessus) empeche ce 404 d'etre celui
  // d'une route inexistante.
  it('rend 404 a un compte sans le drapeau, jamais 403', async () => {
    const res = await lister(cookiesOrdinaire)
    expect(res.statusCode).toBe(404)
  })

  it('cree un modele vierge et le nomme tout seul', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/super-admin/pdf-design-presets',
      cookies: cookiesSuper,
      payload: {},
    })

    expect(res.statusCode).toBe(201)
    expect(res.json().name).toMatch(/Nouveau mod/)
    expect(res.json().content.pages.length).toBeGreaterThan(0)
  })

  it('duplique un modele existant en suffixant son nom', async () => {
    await testDb.pdfDesignPreset.create({
      data: { id: 'p-source', name: 'Programme SMCV', content: CONTENU, sortOrder: 0 },
    })

    const res = await app.inject({
      method: 'POST',
      url: '/super-admin/pdf-design-presets',
      cookies: cookiesSuper,
      payload: { sourcePresetId: 'p-source' },
    })

    expect(res.statusCode).toBe(201)
    expect(res.json().name).toBe('Programme SMCV (copie)')
    expect(res.json().id).not.toBe('p-source')
  })

  it('refuse de dupliquer un modele inconnu', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/super-admin/pdf-design-presets',
      cookies: cookiesSuper,
      payload: { sourcePresetId: 'inconnu' },
    })
    expect(res.statusCode).toBe(404)
  })

  it('renomme et enregistre le contenu', async () => {
    const cree = await testDb.pdfDesignPreset.create({
      data: { id: 'p-maj', name: 'Avant', content: CONTENU, sortOrder: 0 },
    })

    const res = await app.inject({
      method: 'PATCH',
      url: `/super-admin/pdf-design-presets/${cree.id}`,
      cookies: cookiesSuper,
      payload: { name: 'Apres' },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().name).toBe('Apres')
  })

  it('rend 404 sur un modele inconnu', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/super-admin/pdf-design-presets/inconnu',
      cookies: cookiesSuper,
      payload: { name: 'Apres' },
    })
    expect(res.statusCode).toBe(404)
  })

  // Review Focus 3. Un contenu d'une version future, ou retouche a la main en base : il est
  // ECARTE avec sa ligne, jamais propage jusqu'au serialiseur — qui en ferait un 500 sur la
  // liste ENTIERE, donc un ecran vide pour tous les autres modeles.
  it('ecarte un modele au contenu illisible sans perdre les autres', async () => {
    await testDb.pdfDesignPreset.create({
      data: { id: 'p-bon', name: 'Bon', content: CONTENU, sortOrder: 0 },
    })
    await testDb.pdfDesignPreset.create({
      data: {
        id: 'p-casse',
        name: 'Casse',
        content: { version: 99, pages: 'pas un tableau' },
        sortOrder: 1,
      },
    })

    const res = await lister(cookiesSuper)

    expect(res.statusCode).toBe(200)
    const noms = (res.json() as { name: string }[]).map((p) => p.name)
    expect(noms).toContain('Bon')
    expect(noms).not.toContain('Casse')
  })
})
```

- [ ] **Step 2: Lancer pour voir échouer**

```bash
cd back && NODE_OPTIONS=--experimental-vm-modules npx -y dotenv-cli@7.3.0 -e .env.test.local -e .env.test -- npx jest --runInBand -c src/test/jest.config.ts src/test/e2e/super-admin-pdf-design-presets.test.ts
```

Attendu : ÉCHEC partout (404 par absence de route). **Le cas « 404 à un compte sans le drapeau » passera déjà** — pour la mauvaise raison. C'est le contrepoint du premier cas qui les distingue : il doit rendre 200 à la fin de la tâche.

- [ ] **Step 3: Écrire le schéma**

`back/src/main/interfaces/http/fastify/schemas/pdf-design-preset.schema.ts` :

```ts
import { z } from 'zod/v4'

import { pdfDesignContentSchema } from './pdf-design-content.schema'

// Pas d'`isDefault` : un modele livre n'est le defaut d'aucun service. Et pas de `z.cuid()` sur
// l'identifiant — le modele de reference porte un id ecrit a la main (`preset-smcv-reference`),
// dont depend le seed.
export const pdfDesignPresetSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  content: pdfDesignContentSchema,
  sortOrder: z.number().int(),
})

export const pdfDesignPresetListResponseSchema = z.array(
  pdfDesignPresetSummarySchema,
)

export const listPdfDesignPresetsQuerySchema = z.object({
  archived: z.stringbool().default(false),
})

export const pdfDesignPresetIdParamsSchema = z.object({
  presetID: z.string().min(1),
})

export const createPdfDesignPresetSchema = z.object({
  sourcePresetId: z.string().min(1).optional(),
  name: z.string().trim().min(1).optional(),
})

export const updatePdfDesignPresetSchema = z.object({
  name: z.string().trim().min(1).optional(),
  content: pdfDesignContentSchema.optional(),
  archived: z.literal(false).optional(),
})

export type ListPdfDesignPresetsQuery = z.infer<
  typeof listPdfDesignPresetsQuerySchema
>
export type PdfDesignPresetIdParams = z.infer<
  typeof pdfDesignPresetIdParamsSchema
>
export type CreatePdfDesignPresetBody = z.infer<
  typeof createPdfDesignPresetSchema
>
export type UpdatePdfDesignPresetBody = z.infer<
  typeof updatePdfDesignPresetSchema
>
```

- [ ] **Step 4: Écrire le repository**

`back/src/main/types/infra/orm/repositories/pdf-design-preset.repository.interface.ts` :

```ts
import type { PdfDesignPreset } from '../../../../../generated/client'

export type PdfDesignPresetEntityRepo = PdfDesignPreset

export type PdfDesignPresetCreateEntityRepo = {
  name: string
  content: unknown
  sortOrder: number
}

export type PdfDesignPresetUpdateEntityRepo = {
  name?: string
  content?: unknown
  // `true` archive, `false` restaure.
  archived?: boolean
}

export interface PdfDesignPresetRepositoryInterface {
  findAll: (archived?: boolean) => Promise<PdfDesignPresetEntityRepo[]>
  findByID: (presetID: string) => Promise<PdfDesignPresetEntityRepo | null>
  create: (
    params: PdfDesignPresetCreateEntityRepo,
  ) => Promise<PdfDesignPresetEntityRepo>
  update: (
    presetID: string,
    params: PdfDesignPresetUpdateEntityRepo,
  ) => Promise<PdfDesignPresetEntityRepo>
}
```

`back/src/main/infra/orm/repositories/pdf-design-preset.repository.ts` :

```ts
import type { Prisma } from '../../../../generated/client'
import type { IocContainer } from '../../../types/application/ioc'
import type {
  PdfDesignPresetCreateEntityRepo,
  PdfDesignPresetEntityRepo,
  PdfDesignPresetRepositoryInterface,
  PdfDesignPresetUpdateEntityRepo,
} from '../../../types/infra/orm/repositories/pdf-design-preset.repository.interface'
import type { ErrorHandlerInterface } from '../../../types/utils/error-handler'
import type { TenantContextInterface } from '../../../types/utils/tenant-context'
import type { PostgresPrismaClient } from '../postgres-client'

// UN DEPOT A PART, et non deux methodes de plus dans `pdf-design.repository.ts` : celui-la
// lit les presets sous contexte de TENANT, ou un modele global passe sans filtre. Encadrer ses
// methodes casserait ce chemin. Ici, au contraire, chaque requete entre dans
// `runAsSuperAdmin` — sans quoi elle tomberait sous `NO_CONTEXT_GLOBAL_OPERATIONS` (les routes
// `/super-admin` s'executent sans store) et serait refusee.
//
// Le rappel est `async` avec un `await` DEDANS : une requete Prisma est paresseuse, et le
// contexte doit etre lu avant le premier point de suspension (back/CLAUDE.md).
class PdfDesignPresetRepository implements PdfDesignPresetRepositoryInterface {
  private readonly prisma: PostgresPrismaClient
  private readonly errorHandler: ErrorHandlerInterface
  private readonly tenantContext: TenantContextInterface

  constructor({ postgresOrm, errorHandler, tenantContext }: IocContainer) {
    this.prisma = postgresOrm.prisma
    this.errorHandler = errorHandler
    this.tenantContext = tenantContext
  }

  findAll(archived = false): Promise<PdfDesignPresetEntityRepo[]> {
    return this.tenantContext.runAsSuperAdmin(async () =>
      await this.prisma.pdfDesignPreset.findMany({
        where: { archivedAt: archived ? { not: null } : null },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      }),
    )
  }

  findByID(presetID: string): Promise<PdfDesignPresetEntityRepo | null> {
    return this.tenantContext.runAsSuperAdmin(async () =>
      await this.prisma.pdfDesignPreset.findUnique({ where: { id: presetID } }),
    )
  }

  // … `create` et `update` sur le meme motif, chacun dans un try/catch qui passe par
  // `errorHandler.boomErrorFromPrismaError({ entityName: 'PdfDesignPreset', error })`.
}

export { PdfDesignPresetRepository }
```

**Lire la signature réelle de `runAsSuperAdmin`** dans `utils/tenant-context.ts` avant d'écrire : le motif exact (rappel `async`, `await` à l'intérieur) est celui de `findAllPlatformWide` dans `activityLog.repository.ts`, à décalquer.

- [ ] **Step 5: Écrire le domaine**

`back/src/main/domain/pdf-design-preset.domain.ts`, décalqué de `pdf-design.domain.ts` :

- `findAll(archived)` — valide chaque `content` par `pdfDesignContentSchema` et **écarte la ligne** dont le contenu ne passe pas, en la journalisant. C'est déjà ce que fait `PdfDesignDomain` côté service ; lire sa méthode et reprendre la même forme plutôt qu'en inventer une autre.
- `create({ sourcePresetId, name })` — sans source : contenu vierge et nom par `premierLibre`, « Nouveau modèle », puis « Nouveau modèle 2 ». Avec source : 404 si elle est inconnue, sinon son `content` et `nomDeCopie(nom, pris)`. **`nomDeCopie` et `premierLibre` existent déjà** dans `pdf-design.domain.ts` ; les exporter et les réutiliser plutôt que les recopier. `sortOrder` du nouveau = max + 1.
- `update(presetID, params)` — 404 si inconnu ; `archived: false` restaure.

Déclarer les types dans `types/domain/pdf-design-preset.domain.interface.ts`, sur la forme de `pdf-design.domain.interface.ts`.

- [ ] **Step 6: Écrire les routes et câbler**

`back/src/main/interfaces/http/fastify/routes/super-admin/pdf-design-presets.ts`, sur la forme de `super-admin/users.ts` : `GET /`, `POST /` (201), `PATCH /:presetID`, chacune avec `config: { permission: 'establishments:manage' }` et son schéma de réponse.

Enregistrer dans `super-admin.routes.ts` :

```ts
  await fastify.register(pdfDesignPresetsRouter, {
    prefix: '/pdf-design-presets',
  })
```

Et les deux enregistrements IoC — `awilix-ioc-container.ts` utilise `this.register('nom', asClass(X).singleton())`, pas un littéral d'objet — plus les deux champs dans `types/application/ioc.ts`.

- [ ] **Step 7: Écrire le test d'encadrement**

Dans `back/src/test/unit/infra/repository-scope.test.ts`, sur la forme des `describe` existants : capturer les arguments envoyés à Prisma, prouver que `runAsSuperAdmin` est bien appelé (un `jest.spyOn` sur le contexte, comme `estRattacheAilleurs`), et que la même requête **sans contexte** serait refusée.

```ts
  it('la lecture des presets est refusee sans contexte, et permise sous superadmin', () => {
    const args = { where: { archivedAt: null } }
    expect(() =>
      assertTenantScope(
        { model: 'PdfDesignPreset', operation: 'findMany', args },
        undefined,
      ),
    ).toThrow(TenantScopeMissingError)
    expect(() =>
      assertTenantScope(
        { model: 'PdfDesignPreset', operation: 'findMany', args },
        { kind: 'superadmin' },
      ),
    ).not.toThrow()
  })
```

Ce test est **la preuve que l'encadrement n'est pas décoratif** : sans lui, retirer `runAsSuperAdmin` laisserait tout vert tant que `NO_CONTEXT_GLOBAL_OPERATIONS` ne refuse pas… ce qu'il fait, mais par une autre table, et le message n'aiderait personne.

- [ ] **Step 8: Lancer, typechecker, commiter**

```bash
cd back && npx tsc --noEmit -p src/main/tsconfig.json
cd back && NODE_OPTIONS=--experimental-vm-modules npx -y dotenv-cli@7.3.0 -e .env.test.local -e .env.test -- npx jest --runInBand -c src/test/jest.config.ts src/test/e2e/super-admin-pdf-design-presets.test.ts src/test/unit/infra
cd back && npx biome check --write src
git add back && git commit -m "feat(pdf): routes super-admin des modeles livres"
```

Attendu : les 8 cas e2e verts, **y compris le 200 du super-admin** qui donne son sens au 404 du compte ordinaire.

---

### Task 3: Supprimer, restaurer, réordonner

**Files:**
- Modify: les six fichiers de la tâche 2 (schéma, routes, domaine, dépôt et leurs interfaces)
- Test: `back/src/test/e2e/super-admin-pdf-design-presets.test.ts`
- Test: `back/src/test/unit/domain/pdf-design-preset.domain.test.ts` (créer)

**Interfaces:**
- Consumes: `PdfDesignPresetDomain` (tâche 2).
- Produces: `DELETE /super-admin/pdf-design-presets/:presetID` → 204, `PUT /super-admin/pdf-design-presets/reorder` → 204.

- [ ] **Step 1: Écrire le test unitaire du réordonnancement**

Le réordonnancement a un invariant qui se teste sans base : la liste reçue doit correspondre **exactement** à l'ensemble existant. Le motif existe déjà (`ServiceFieldCategoryDomain.reorder`, avec son `sameIds`) — le lire et le reprendre.

`back/src/test/unit/domain/pdf-design-preset.domain.test.ts` :

```ts
describe('reorder', () => {
  it('accepte une permutation exacte', async () => { /* … */ })

  // Review Focus 4 : une liste a laquelle il manque un modele laisserait des rangs orphelins,
  // et l'ordre affiche ne serait plus celui de la base.
  it('refuse une liste a laquelle il manque un modele', async () => { /* 400 */ })

  it('refuse une liste qui nomme un modele inconnu', async () => { /* 400 */ })

  it('refuse une liste qui repete un modele', async () => { /* 400 */ })
})
```

- [ ] **Step 2: Écrire les e2e de la suppression et du réordonnancement**

Dans `super-admin-pdf-design-presets.test.ts` :

```ts
  it('supprime un modele, qui sort de la liste et entre dans les supprimes', async () => {
    // DELETE -> 204 ; la liste active ne le porte plus ; `?archived=true` le porte.
  })

  it('restaure un modele supprime', async () => {
    // PATCH { archived: false } -> 200, puis il reparait dans la liste active.
  })

  // Review Focus 5. Le modele de reference est celui dont le seed depend. Le supprimer ne doit
  // ni casser le seed ni toucher les copies deja faites : l'`upsert` du seed le RECREE au
  // prochain deploiement (son `update: {}` ne reecrit rien, mais sa branche `create` repose la
  // ligne si elle a disparu) — or ici elle n'a pas disparu, elle est ARCHIVEE, donc l'upsert la
  // trouve et ne la restaure pas. Le comportement est donc : archive, il le reste.
  it('un modele supprime reste supprime apres un rejeu du seed', async () => {
    // Archiver REFERENCE_PRESET_ID, rejouer seedPdfDesignPresets, verifier archivedAt non nul.
  })

  it('une copie deja faite par un service survit a la suppression de son modele', async () => {
    // Creer un PdfDesign portant sourcePresetId = le preset, archiver le preset,
    // verifier que le design du service est intact — la copie est FIGEE (spec).
  })

  it('reordonne les modeles', async () => {
    // PUT /reorder { ids: [b, a] } -> 204, puis la liste rend b avant a.
  })

  it('refuse un reordonnancement partiel', async () => {
    // -> 400, et l'ordre en base n'a pas bouge.
  })
```

- [ ] **Step 3: Lancer pour voir échouer**

```bash
cd back && NODE_OPTIONS=--experimental-vm-modules npx -y dotenv-cli@7.3.0 -e .env.test.local -e .env.test -- npx jest --runInBand -c src/test/jest.config.ts src/test/unit/domain/pdf-design-preset.domain.test.ts src/test/e2e/super-admin-pdf-design-presets.test.ts
```

Attendu : ÉCHEC des nouveaux cas (routes absentes, `reorder` inexistante).

- [ ] **Step 4: Implémenter**

- Dépôt : `archive(presetID)` pose `archivedAt`, `reorder(ids)` écrit `sortOrder: index` dans un `$transaction`, **le tout sous `runAsSuperAdmin`** (une transaction de `update` : la table déclare `update`, pas `updateMany`).
- Domaine : `archive` (404 si inconnu), `reorder` qui valide l'ensemble exact avant d'écrire.
- Schéma : `reorderPdfDesignPresetsSchema = z.object({ ids: z.array(z.string().min(1)) })`.
- Routes : `DELETE /:presetID` (204) et `PUT /reorder` (204). **Poser `/reorder` AVANT `/:presetID`** si l'ordre d'enregistrement comptait — vérifier que Fastify route bien le littéral avant le paramètre ; sinon renommer en `/-/reorder`.

- [ ] **Step 5: Lancer, typechecker, commiter**

```bash
cd back && npx tsc --noEmit -p src/main/tsconfig.json
cd back && NODE_OPTIONS=--experimental-vm-modules npx -y dotenv-cli@7.3.0 -e .env.test.local -e .env.test -- npx jest --runInBand -c src/test/jest.config.ts src/test/unit src/test/e2e/super-admin-pdf-design-presets.test.ts
cd back && npx biome check --write src
git add back && git commit -m "feat(pdf): supprimer, restaurer et reordonner les modeles livres"
```

---

### Task 4: Extraire l'éditeur de son fichier de route

**Files:**
- Create: `front/src/components/custom/pdf-design/editor/editeur-de-design.tsx`
- Modify: `front/src/routes/_authenticated/e/$establishmentId/s/$serviceId/_settings/pdf-patient/$designId.tsx`
- Test: `front/src/routes/.../pdf-patient/$designId.test.tsx` (doit rester vert SANS modification)

**Interfaces:**
- Produces: `<EditeurDeDesign nom contenu enregistrement onEnregistrer onRetour assets? onDeposer? sources? />`.

**Ce que cette tâche NE fait pas : changer un comportement.** C'est un déplacement. Le juge, c'est que `$designId.test.tsx` (15 cas, dont la bande de pages, l'historique et la garde de chargement) reste vert **sans qu'on y touche**. Si un test de ce fichier doit changer, c'est que l'extraction a changé le comportement : s'arrêter et comprendre.

- [ ] **Step 1: Lancer la suite de l'éditeur AVANT de toucher quoi que ce soit**

```bash
cd front && npx vitest run src/routes/_authenticated/e/\$establishmentId/s/\$serviceId/_settings/pdf-patient src/components/custom/pdf-design
```

Attendu : vert. Noter les nombres — c'est la référence de l'extraction.

- [ ] **Step 2: Extraire**

Déplacer dans `editeur-de-design.tsx` tout le corps de `PdfDesignEditor` **sauf** : `Route.useParams`, `usePdfDesignQueries`, `saveContent`, `usePdfAssetQueries`, `usePdfAssetMutations`, `useSourcesImages` et `navigate`. Le composant reçoit :

```tsx
type EditeurDeDesignProps = {
  // `null` tant que la source n'a pas repondu : c'est la garde qui empeche la bande de pages
  // de se monter sur un contenu VIDE, et un clic d'y condamner la resynchronisation.
  design: { id: string; name: string; content: PdfDesignContent } | null
  chargement: boolean
  enregistrementEnCours: boolean
  onEnregistrer: (contenu: PdfDesignContent) => void
  onRetour: () => void
  // Absents pour un modele livre : il n'utilise que les images de l'application.
  assets?: PdfAssetSummary[]
  onDeposer?: (fichier: File) => Promise<PdfAssetSummary>
  sources?: SourcesImages
  // Phrase affichee quand il n'y a pas de design : elle differe d'un ecran a l'autre.
  messageAbsent: string
}
```

Les trois gardes `design &&` existantes (effet d'historique, bande de pages, et la resynchronisation de `useEdition`) **restent telles quelles** — ce sont elles qui ont coûté une perte de données à l'étape 3.

- [ ] **Step 3: Remonter la route sur le composant**

`$designId.tsx` ne garde que la résolution des données et le rendu :

```tsx
  return (
    <EditeurDeDesign
      design={design ?? null}
      chargement={isPending}
      enregistrementEnCours={saveContent.isPending}
      onEnregistrer={(contenu) =>
        saveContent.mutate({ id: designId, content: contenu }, { onSuccess: … })
      }
      onRetour={retour}
      assets={assets}
      onDeposer={(fichier) => deposerImage.mutateAsync(fichier)}
      sources={sources}
      messageAbsent="Ce design n'existe plus, ou appartient à un autre service."
    />
  )
```

**Attention au `marquerEnregistre`** : il vit dans `useEdition`, donc dans le composant extrait, alors que `onSuccess` vit dans la route. Le composant doit donc appeler `marquerEnregistre` lui-même quand `onEnregistrer` réussit — passer `onEnregistrer` en `Promise` et marquer au `then`, ou laisser la route rendre une promesse. Décider en lisant `use-edition.ts`, et **ne pas** marquer avant la réponse : l'étape 2 a corrigé exactement ce défaut (l'écran revenait à la version du serveur).

- [ ] **Step 4: Relancer la même suite, sans l'avoir modifiée**

```bash
cd front && npx vitest run src/routes/_authenticated/e/\$establishmentId/s/\$serviceId/_settings/pdf-patient src/components/custom/pdf-design && npx tsc -b
```

Attendu : exactement les mêmes nombres qu'à l'étape 1. Un seul test modifié = l'extraction a changé le comportement.

- [ ] **Step 5: Commit**

```bash
cd front && npx biome check --write src/components/custom/pdf-design src/routes
git add front && git commit -m "refactor(pdf): l'editeur devient un composant, deux ecrans le montent"
```

---

### Task 5: L'API et les requêtes des modèles livrés

**Files:**
- Create: `front/src/api/pdfDesignPreset.api.ts`
- Create: `front/src/api/pdfDesignPreset.api.test.ts`
- Create: `front/src/queries/usePdfDesignPreset.ts`
- Create: `front/src/types/pdfDesignPreset.ts`
- Modify: `front/src/constants/process.constant.ts`

**Interfaces:**
- Consumes: les routes des tâches 2 et 3.
- Produces: `PdfDesignPresetApi.getAll/create/update/archive/reorder`, `usePdfDesignPresetQueries`, `usePdfDesignPresetMutations`.

- [ ] **Step 1: Écrire les tests qui échouent**

`front/src/api/pdfDesignPreset.api.test.ts`, sur la forme de `superAdmin.api.ts`/`pdfAsset.api.test.ts` :

```ts
  it('n utilise pas l URL de tenant', async () => {
    // Le super-admin est HORS de tout tenant : `tenantApiUrl()` leve sans contexte pose. Ce
    // test monte SANS contexte et verifie que l'appel part quand meme, sur `/super-admin/…`.
    useAuthStore.setState({ context: null })
    // …
    expect(url).toMatch(/\/super-admin\/pdf-design-presets$/)
  })
```

Plus : la liste des supprimés passe par `?archived=true` ; la création envoie `{}` ou `{ sourcePresetId }` ; le réordonnancement envoie `{ ids }` ; un refus remonte **le message du serveur** (`messageDuServeur`, la leçon de l'étape 4 — sans lui le 400 du réordonnancement partiel s'affiche « le serveur n'a pas pu traiter la requête »).

- [ ] **Step 2: Lancer pour voir échouer, puis écrire les modules**

`pdfDesignPreset.api.ts` sur la forme de `superAdmin.api.ts` : un préfixe fixe `${apiUrl}/super-admin`, **jamais** `tenantApiUrl()`. `usePdfDesignPreset.ts` sur la forme de `usePdfDesign.ts` (invalidation, toasts, pas de mise à jour optimiste).

Ajouter `PDF_DESIGN_PRESET` à `process.constant.ts`.

- [ ] **Step 3: Lancer, vérifier les conventions, commiter**

```bash
cd front && npx vitest run src/api/pdfDesignPreset.api.test.ts src/test/conventions-tenant-api-queries.test.ts src/test/lecture-directe-du-cache.test.ts
cd front && npx tsc -b && npx biome check --write src/api src/queries src/types src/constants
git add front && git commit -m "feat(pdf): api et requetes des modeles livres"
```

Attendu : vert, et `conventions-tenant-api-queries` **sans exception à ajouter** — aucun de ces fichiers ne nomme `establishmentId` ni `serviceId`.

---

### Task 6: Les deux écrans super-admin

**Files:**
- Create: `front/src/routes/_authenticated/super-admin/pdf-presets/index.tsx`
- Create: `front/src/routes/_authenticated/super-admin/pdf-presets/index.test.tsx`
- Create: `front/src/routes/_authenticated/super-admin/pdf-presets/$presetId.tsx`
- Create: `front/src/routes/_authenticated/super-admin/pdf-presets/$presetId.test.tsx`

**Un DOSSIER, pas deux fichiers freres.** Le plan de l'etape 2 avait pose l'editeur en frere de
la liste, ce qui transformait la liste en layout et faisait rougir `navigation.test.ts`. La
forme qui marche est celle de `pdf-patient/` : `index.tsx` + `$presetId.tsx`.
- Modify: `front/src/navigation/navigation.ts`
- Modify: `front/src/components/custom/pdf-design/design-card.tsx`

**Interfaces:**
- Consumes: `EditeurDeDesign` (tâche 4), `usePdfDesignPreset*` (tâche 5).

- [ ] **Step 1: Écrire les tests de la liste**

Sur la forme de `$designId.test.tsx` (routeur jetable, `fetchMock`), en remplaçant le layout de service par celui de `super-admin.tsx` :

```tsx
  it('liste les modeles livres avec leur vignette', async () => { /* … */ })
  it('ouvre l editeur d un modele', async () => { /* … */ })
  it('cree un modele vierge', async () => { /* … */ })
  it('duplique un modele', async () => { /* … */ })
  it('montre les modeles supprimes et les restaure', async () => { /* … */ })

  // Review Focus 4, cote ecran : les fleches envoient la liste ENTIERE, dans le nouvel ordre.
  // Envoyer deux identifiants ou un delta ferait refuser le back, a raison.
  it('reordonne par les fleches, en envoyant la liste entiere', async () => { /* … */ })

  // La fleche du haut est desactivee sur le premier, celle du bas sur le dernier : sans ca,
  // un clic part au reseau pour ne rien changer.
  it('desactive la fleche impossible aux extremites', async () => { /* … */ })
```

**Le piège de ce dépôt** : une table virtualisée rend ZÉRO ligne sous jsdom. Ici on rend des cartes, pas un `ReactTable` — vérifier que c'est bien le cas, sinon mocker `@tanstack/react-virtual` comme `admin/services.test.tsx`.

- [ ] **Step 2: Écrire le test de l'éditeur de modèle**

```tsx
  it('monte l editeur sur un modele livre', async () => { /* la toile s'affiche */ })

  // Un modele livre n'utilise que les images de l'application : promettre un depot afficherait
  // un champ dont le resultat ne pourrait jamais etre pose dans un preset.
  it('ne propose NI la liste des images du service NI le depot', async () => {
    // selectionner un element image, puis :
    expect(screen.queryByLabelText(/Déposer une image/)).not.toBeInTheDocument()
    await userEvent.click(screen.getByLabelText('Image'))
    expect(await screen.findByRole('option', { name: 'Logo' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: /\.png$/ })).not.toBeInTheDocument()
  })
```

- [ ] **Step 3: Lancer pour voir échouer, puis écrire les écrans**

La liste reprend la forme de `pdf-patient/index.tsx` : cartes `DesignCard`, « Partir d'une page blanche », bascule « Supprimés ». `DesignCard` gagne deux props optionnelles `onMonter`/`onDescendre` (via `MoveButtons`, `components/settings/iconButton.tsx`) — **optionnelles**, pour que l'écran de service n'en montre pas.

L'éditeur monte `<EditeurDeDesign … />` **sans** `assets` ni `onDeposer`.

- [ ] **Step 4: Déclarer les deux écrans à la navigation**

Dans `navigation.ts`, `NAVIGATION.platform` gagne :

```ts
    { label: 'Documents patient', to: '/super-admin/pdf-presets', group: '' },
```

et `HORS_ONGLETS` gagne l'éditeur :

```ts
  '/super-admin/pdf-presets/$presetId':
    "editeur d'un modele livre, depuis la liste Documents patient",
```

**Sans ces deux lignes, `navigation.test.ts` échoue** — c'est exactement ce qu'il existe pour empêcher.

- [ ] **Step 5: Lancer, typechecker, commiter**

```bash
cd front && npx vitest run src/routes/_authenticated/super-admin src/navigation && npx tsc -b
cd front && npx biome check --write src
git add front && git commit -m "feat(pdf): ecran super-admin des modeles livres"
```

---

### Task 7: Vérification à l'écran et suites complètes

Rien ne remplace cette tâche : à l'étape 2 elle a trouvé quatre défauts qu'aucun test ne voyait, à l'étape 3 trois, à l'étape 4 trois dont deux sur le message rendu à l'utilisateur.

Deux pièges de ce chantier, qui valent toujours :
- l'éditeur pose un `beforeunload` : **enregistrer ou annuler AVANT toute navigation**, sinon la boîte « Quitter le site ? » fige l'onglet piloté ;
- le worktree tourne sur 3007/4277 (`back/.env.local`, `front/.env.local`) ; ne pas toucher aux serveurs 3000/4270 de l'utilisateur.

Le compte de développement du seed porte-t-il `isSuperAdmin` ? **Le vérifier avant** (`back/prisma/seed/user.ts`) : le drapeau ne se pose que par `npm run bootstrap:super-admin -- <email>`, jamais par le seed ni par une route. Sans lui, l'écran répond 404 et ce n'est pas un défaut.

- [ ] **Step 1: Le parcours complet**

Créer un modèle vierge, le nommer, y poser un texte et le logo livré, enregistrer, recharger — tout est là. Dupliquer le modèle de référence, vérifier le suffixe « (copie) ». Réordonner par les flèches, recharger, l'ordre tient. Supprimer un modèle, le retrouver dans « Supprimés », le restaurer.

**Puis le point qui relie les deux moitiés du sous-système** : depuis un service, ouvrir « Document patient » et vérifier que le modèle créé y apparaît, duplicable — un preset invisible des services n'aurait servi à rien.

- [ ] **Step 2: Les cas limites**

- **Un compte sans le drapeau** : `/super-admin/pdf-presets` rend le « Not Found » par défaut, pas un écran « réservé aux super-administrateurs ».
- **Supprimer le modèle de référence** puis ouvrir la modale d'un patient : elle doit encore proposer un document (le repli de `chooseDesign`).
- **L'inspecteur d'une image** dans l'éditeur de modèle : « Logo » et « Lignes », pas de champ de dépôt.
- **Deux onglets sur le même modèle** : le dernier enregistré écrase l'autre sans bruit. C'est la limite assumée depuis l'étape 2 (pas de verrou optimiste) — la constater, pas la corriger.

- [ ] **Step 3: Toutes les suites, lint, commit**

```bash
cd back && npx tsc --noEmit -p src/main/tsconfig.json && npx biome ci src
cd back && NODE_OPTIONS=--experimental-vm-modules npx -y dotenv-cli@7.3.0 -e .env.test.local -e .env.test -- npx jest --runInBand -c src/test/jest.config.ts
cd front && npx tsc -b && npx vitest run
git add -A && git commit -m "feat(pdf): etape 5 verifiee a l'ecran"
```

---

## Ce que l'étape 5 ne fait pas

- **Des images propres aux presets** — un modèle livré n'utilise que les deux images du dépôt ; en ajouter une demande toujours un déploiement. Plafond assumé par la spec.
- **La synchronisation d'un preset vers les copies déjà faites** — délibérément absente de la spec : une copie est figée, et propager casserait les designs de tous les services.
- **Promouvoir le design d'un service en modèle livré** — hors spec.
- **Un verrou optimiste à l'enregistrement** — toujours pas, ni ici ni côté service.
- **Une suppression dure d'un preset** — l'UI dit « Supprimer », le back archive, et la table de capacités ne déclare aucun `delete`.
- **Un écran de gestion des images de service** — c'était déjà hors de l'étape 4.
