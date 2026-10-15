# PDF patient, designs composables — étape 2 : la bibliothèque et l'éditeur

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** un service voit les designs livrés, en duplique un, et le modifie sur une toile — ce qui fait du PDF patient quelque chose de réellement customisable.

**Architecture:** les routes d'écriture complètent le `GET` de l'étape 1. Un écran de liste montre deux groupes (les presets, en lecture seule ; les designs du service, modifiables). L'éditeur est une route à part : une toile HTML rendue à l'échelle depuis le même JSON que le moteur react-pdf, avec un hook d'arithmétique pure pour le déplacement et le redimensionnement.

**Tech Stack:** Prisma + Fastify + Zod v4 + jest (back) ; React + TanStack Router/Query + Tailwind + vitest (front) ; Biome.

**Spec:** `docs/superpowers/specs/2026-10-14-pdf-patient-designs-design.md`

**État au départ :** l'étape 1 est en production (`main`). Le moteur `render-pdf.tsx`, le schéma de contenu, `resolveField`, les tables et `GET /pdf-designs` existent et sont testés.

## Trois décisions de périmètre, prises ici

**L'éditeur gagne un sélecteur de page.** La spec dit « l'éditeur, sur une page ». Sans aucun moyen de changer de page, seule la couverture serait atteignable et la page conseils resterait inéditable — l'étape ne livrerait pas ce qu'elle promet. Les tâches 6 et suivantes incluent donc un sélecteur des pages **existantes** du design. Ajouter, supprimer et réordonner des pages restent à l'étape 3.

**La rotation se règle au champ, pas à la poignée.** La spec liste « la faire tourner » parmi les
gestes de l'éditeur. L'inspecteur porte un champ `rotation` en degrés, qui suffit à obtenir le
décor en diagonale du preset ; une poignée de rotation à la souris demande un repère polaire et
son propre aimantage angulaire, pour un geste que personne n'a encore réclamé. À rouvrir si
l'usage le demande.

**Les tâches 1 à 3 forment une tranche livrable sans éditeur.** À la fin de la tâche 3, un service voit les designs disponibles, en duplique un, le renomme, le définit par défaut, le supprime et le restaure — et la modale de génération en tient compte. C'est déjà utile et ça peut partir seul. Les tâches 4 à 9 ajoutent l'éditeur. Arrêtez-vous après la 3 si vous voulez voir tourner la première moitié avant d'engager la seconde.

## Une déviation assumée du format de plan

Les tâches de **logique** — routes, géométrie, état d'édition, historique — portent leur code en
entier : c'est là que se jouent les défauts, et c'est là qu'une imprécision coûte cher. Les
**coquilles d'interface** (la route de l'éditeur, la palette, l'inspecteur) sont décrites par leur
structure, leurs props et leurs gestionnaires, sans leur JSX complet. Écrire six cents lignes de
balisage dans un plan que l'implémenteur réécrira en voyant l'écran n'achète rien ; ce qu'il lui
faut, ce sont les noms, les types et les décisions, qui y sont.

## Global Constraints

- **Biome, jamais ESLint ni Prettier.** Vérifier avec `npx biome check --write <fichiers>` (il couvre le format et le tri d'imports, que `biome lint` ne voit pas).
- **Aucun `biome-ignore`.** On corrige le code.
- **Commentaires synthétiques.** Une ligne quand elle apprend quelque chose, sinon rien.
- **Zod v4**, importé `from 'zod/v4'`.
- **Unités : le point.** A4 = `595.28 × 841.89` (`A4_WIDTH`/`A4_HEIGHT` dans `types/pdfDesign.ts`).
- **« Supprimer » dans l'UI, `archivedAt` dans le back.** Jamais le mot « Archiver » à l'écran ; l'onglet des supprimés s'appelle « Supprimés », l'action de retour « Restaurer ».
- **Chaque route déclare sa permission** (`config: { permission }`) — le serveur refuse de démarrer sinon. Écriture : `referentials:write`. Lecture : `referentials:read`.
- **Le tenant n'est jamais un argument** d'un module `api/` ou `queries/`, et une `queryKey` ne le porte pas (`conventions-tenant-api-queries.test.ts`).
- **Un écran de section doit entrer dans `NAVIGATION`** (`src/navigation/navigation.ts`) ou dans `HORS_ONGLETS` avec sa raison — `navigation.test.ts` échoue sinon.
- **Polices : `Helvetica` et `Helvetica-Bold` seulement.** Aucun `Font.register` dans le dépôt ; l'éditeur ne propose pas d'autre police.
- **Le typecheck fait partie de la boucle**, pas de la fin : `npx tsc -b` (front) et `npx tsc --noEmit -p src/main/tsconfig.json` (back). Les tests ne le remplacent pas — jest transpile sans vérifier les types, et deux défauts réels sont passés par là à l'étape 1.
- **Travailler dans un worktree** (`superpowers:using-git-worktrees`), avec sa propre base e2e `medisync_test_<suffixe>` dans `.env.test.local`.

## Review Focus

Cinq classes d'entrée que la spec implique et qu'aucune tâche n'exerce spontanément. Chacune reçoit son test dans la tâche qui possède le code.

1. **Dupliquer deux fois le même preset.** Le nom d'un design n'est volontairement pas unique, mais deux entrées identiques dans une liste sont illisibles : la seconde copie doit être suffixée (« (copie 2) »), jamais échouer ni produire deux « (copie) ». → Tâche 1.
2. **Définir un design par défaut quand un autre l'est déjà.** Le précédent doit être décroché dans la même transaction. Deux `isDefault` à `true` feraient choisir la modale au hasard, sans que rien ne le signale. → Tâche 1.
3. **Supprimer le design qui était par défaut.** La modale de génération doit retomber sur un preset et continuer de produire un PDF, pas afficher « aucun design ». → Tâches 1 et 3.
4. **Enregistrer un design qu'un autre onglet vient de modifier.** Rien ne verrouille : le dernier écrit gagne, en silence. Nommer la limite plutôt que la découvrir. → Tâche 6.
5. **Déplacer un élément hors de la page.** L'éditeur doit le permettre — le décor déborde volontairement — mais le rendu PDF ne doit pas se remettre à boucler : c'est `anchor()` qui s'en charge, et un design de service peut désormais produire cette forme à la main, ce qui n'était pas vrai à l'étape 1. → Tâche 7.

---

### Task 1: Les routes d'écriture

**Files:**
- Modify: `back/src/main/types/infra/orm/repositories/pdf-design.repository.interface.ts`
- Modify: `back/src/main/infra/orm/repositories/pdf-design.repository.ts`
- Modify: `back/src/main/types/domain/pdf-design.domain.interface.ts`
- Modify: `back/src/main/domain/pdf-design.domain.ts`
- Modify: `back/src/main/interfaces/http/fastify/schemas/pdf-design.schema.ts`
- Modify: `back/src/main/interfaces/http/fastify/routes/pdfDesign.ts`
- Modify: `back/src/main/interfaces/http/fastify/routes/tenant.routes.ts`
- Test: `back/src/test/e2e/pdf-design.test.ts` (compléter)

**Interfaces:**
- Consumes: `pdfDesignContentSchema`, `PdfDesignContent`, `PdfDesignContentInput` (étape 1) ; `PdfDesignSummaryDomain` ; `PrimaTransactionClient` (`types/infra/orm/client.ts`).
- Produces :
  - `POST /pdf-designs` body `{ sourcePresetId?: string, name?: string }` → 201 `PdfDesignSummary`
  - `PATCH /pdf-designs/:designID` body `{ name?, content?, isDefault?, archived? }` → 200 `PdfDesignSummary`
  - `DELETE /pdf-designs/:designID` → 204 (archive)
  - Domaine : `create`, `update`, `archive` sur `PdfDesignDomainInterface`.

- [ ] **Step 1: Écrire les tests e2e qui échouent**

Ajouter à `back/src/test/e2e/pdf-design.test.ts`, dans le `describe` existant. Le scénario `twoServicesScenario` et le helper `lire` sont déjà en place.

```ts
  const creer = (
    serviceId: string,
    cookies: { access_token: string },
    body: Record<string, unknown>,
  ) =>
    app.inject({
      method: 'POST',
      url: tenantUrl(scenario.est.id, serviceId, '/pdf-designs'),
      cookies,
      payload: body,
    })

  const modifier = (
    serviceId: string,
    cookies: { access_token: string },
    id: string,
    body: Record<string, unknown>,
  ) =>
    app.inject({
      method: 'PATCH',
      url: tenantUrl(scenario.est.id, serviceId, `/pdf-designs/${id}`),
      cookies,
      payload: body,
    })

  it('duplique un preset dans le service, contenu copie et source retenue', async () => {
    const preset = await testDb.pdfDesignPreset.findFirstOrThrow({
      where: { name: 'Programme de reference' },
    })

    const res = await creer(scenario.serviceA.id, scenario.cookiesA, {
      sourcePresetId: preset.id,
    })

    expect(res.statusCode).toBe(201)
    expect(res.json()).toMatchObject({
      name: 'Programme de reference (copie)',
      isDefault: false,
    })
    const enBase = await testDb.pdfDesign.findFirstOrThrow({
      where: { serviceId: scenario.serviceA.id, name: 'Programme de reference (copie)' },
    })
    expect(enBase.sourcePresetId).toBe(preset.id)
    expect(enBase.content).toEqual(preset.content)
  })

  // Review Focus 1 : deux copies du meme preset, pas deux homonymes et pas d'echec.
  it('suffixe la seconde copie du meme preset', async () => {
    const preset = await testDb.pdfDesignPreset.findFirstOrThrow({
      where: { name: 'Programme de reference' },
    })

    const res = await creer(scenario.serviceA.id, scenario.cookiesA, {
      sourcePresetId: preset.id,
    })

    expect(res.statusCode).toBe(201)
    expect(res.json().name).toBe('Programme de reference (copie 2)')
  })

  it('refuse de dupliquer un preset inconnu', async () => {
    const res = await creer(scenario.serviceA.id, scenario.cookiesA, {
      sourcePresetId: 'preset-qui-n-existe-pas',
    })
    expect(res.statusCode).toBe(404)
  })

  it('renomme un design du service', async () => {
    const design = await testDb.pdfDesign.findFirstOrThrow({
      where: { serviceId: scenario.serviceA.id, archivedAt: null },
    })

    const res = await modifier(scenario.serviceA.id, scenario.cookiesA, design.id, {
      name: 'Mon programme',
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().name).toBe('Mon programme')
  })

  // Review Focus 2 : un seul design par defaut a la fois, sinon la modale choisit au hasard.
  it('decroche le design par defaut precedent quand un autre le devient', async () => {
    const [premier, second] = await testDb.pdfDesign.findMany({
      where: { serviceId: scenario.serviceA.id, archivedAt: null },
      orderBy: { createdAt: 'asc' },
      take: 2,
    })

    await modifier(scenario.serviceA.id, scenario.cookiesA, premier.id, {
      isDefault: true,
    })
    await modifier(scenario.serviceA.id, scenario.cookiesA, second.id, {
      isDefault: true,
    })

    const parDefaut = await testDb.pdfDesign.findMany({
      where: { serviceId: scenario.serviceA.id, isDefault: true },
    })
    expect(parDefaut.map((d) => d.id)).toEqual([second.id])
  })

  it('ne decroche PAS le design par defaut d un autre service', async () => {
    const designB = await testDb.pdfDesign.findFirstOrThrow({
      where: { serviceId: scenario.serviceB.id, archivedAt: null },
    })
    await modifier(scenario.serviceB.id, scenario.cookiesB, designB.id, {
      isDefault: true,
    })
    const designA = await testDb.pdfDesign.findFirstOrThrow({
      where: { serviceId: scenario.serviceA.id, archivedAt: null },
    })
    await modifier(scenario.serviceA.id, scenario.cookiesA, designA.id, {
      isDefault: true,
    })

    const apres = await testDb.pdfDesign.findUniqueOrThrow({
      where: { id: designB.id },
    })
    expect(apres.isDefault).toBe(true)
  })

  it('supprime puis restaure un design', async () => {
    const design = await testDb.pdfDesign.findFirstOrThrow({
      where: { serviceId: scenario.serviceA.id, archivedAt: null },
    })

    const suppression = await app.inject({
      method: 'DELETE',
      url: tenantUrl(scenario.est.id, scenario.serviceA.id, `/pdf-designs/${design.id}`),
      cookies: scenario.cookiesA,
    })
    expect(suppression.statusCode).toBe(204)

    const apresSuppression = await lire(scenario.serviceA.id, scenario.cookiesA)
    expect(
      apresSuppression.json().designs.map((d: { id: string }) => d.id),
    ).not.toContain(design.id)

    const restauration = await modifier(
      scenario.serviceA.id,
      scenario.cookiesA,
      design.id,
      { archived: false },
    )
    expect(restauration.statusCode).toBe(200)

    const apresRestauration = await lire(scenario.serviceA.id, scenario.cookiesA)
    expect(
      apresRestauration.json().designs.map((d: { id: string }) => d.id),
    ).toContain(design.id)
  })

  // Review Focus 3 : supprimer le design par defaut ne doit pas laisser le service sans rien.
  it('laisse les presets disponibles apres suppression du design par defaut', async () => {
    const design = await testDb.pdfDesign.findFirstOrThrow({
      where: { serviceId: scenario.serviceA.id, archivedAt: null },
    })
    await modifier(scenario.serviceA.id, scenario.cookiesA, design.id, {
      isDefault: true,
    })
    await app.inject({
      method: 'DELETE',
      url: tenantUrl(scenario.est.id, scenario.serviceA.id, `/pdf-designs/${design.id}`),
      cookies: scenario.cookiesA,
    })

    const res = await lire(scenario.serviceA.id, scenario.cookiesA)
    expect(res.json().presets.length).toBeGreaterThan(0)
  })

  it('refuse a un membre du service A de modifier un design du service B', async () => {
    const designB = await testDb.pdfDesign.findFirstOrThrow({
      where: { serviceId: scenario.serviceB.id },
    })
    const res = await modifier(scenario.serviceA.id, scenario.cookiesA, designB.id, {
      name: 'vole',
    })
    expect(res.statusCode).toBe(404)
  })

  it('refuse un contenu qui ne passe pas le schema', async () => {
    const design = await testDb.pdfDesign.findFirstOrThrow({
      where: { serviceId: scenario.serviceA.id },
    })
    const res = await modifier(scenario.serviceA.id, scenario.cookiesA, design.id, {
      content: { version: 1, pages: [{ kind: 'canvas', id: 'p', elements: [{ kind: 'qrcode' }] }] },
    })
    expect(res.statusCode).toBe(400)
  })
```

- [ ] **Step 2: Lancer les tests pour les voir échouer**

```bash
cd back && NODE_OPTIONS=--experimental-vm-modules npm run with:dotenv -- \
  -e .env.test.local -e .env.test -- jest --runInBand -c src/test/jest.config.ts \
  --selectProjects e2e --testPathPatterns "e2e/pdf-design.test"
```

Attendu : ÉCHEC, 404 sur `POST` et `PATCH` (routes absentes).

- [ ] **Step 3: Étendre le repository**

`back/src/main/types/infra/orm/repositories/pdf-design.repository.interface.ts`, ajouter :

```ts
export type PdfDesignCreateEntityRepo = {
  name: string
  content: unknown
  sourcePresetId: string | null
}

export type PdfDesignUpdateEntityRepo = {
  name?: string
  content?: unknown
  isDefault?: boolean
  // `true` supprime (archive), `false` restaure.
  archived?: boolean
}
```

et sur l'interface :

```ts
  findByID: (designID: string) => Promise<PdfDesignEntityRepo>
  findPresetByID: (presetID: string) => Promise<PdfDesignPresetEntityRepo | null>
  // Les noms deja pris dans ce service, archives compris : la numerotation d'une copie ne
  // doit pas se remettre a 2 parce qu'une copie a ete supprimee.
  namesInService: () => Promise<string[]>
  create: (params: PdfDesignCreateEntityRepo) => Promise<PdfDesignEntityRepo>
  update: (
    designID: string,
    params: PdfDesignUpdateEntityRepo,
  ) => Promise<PdfDesignEntityRepo>
```

`back/src/main/infra/orm/repositories/pdf-design.repository.ts`, ajouter les méthodes. Le `update` qui pose `isDefault: true` décroche les autres **dans une transaction**, bornée au service courant.

```ts
  async findByID(designID: string): Promise<PdfDesignEntityRepo> {
    try {
      return await this.prisma.pdfDesign.findUniqueOrThrow({
        where: { id_serviceId: { id: designID, serviceId: this.scope.serviceId } },
      })
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({
        entityName: 'PdfDesign',
        error: err,
      })
    }
  }

  // Modele global : aucun filtre de tenant.
  findPresetByID(presetID: string): Promise<PdfDesignPresetEntityRepo | null> {
    return this.prisma.pdfDesignPreset.findUnique({ where: { id: presetID } })
  }

  async namesInService(): Promise<string[]> {
    const lignes = await this.prisma.pdfDesign.findMany({
      where: this.scope,
      select: { name: true },
    })
    return lignes.map((l) => l.name)
  }

  async create(params: PdfDesignCreateEntityRepo): Promise<PdfDesignEntityRepo> {
    try {
      return await this.prisma.pdfDesign.create({
        data: {
          ...this.scope,
          name: params.name,
          content: params.content as Prisma.InputJsonValue,
          sourcePresetId: params.sourcePresetId,
        },
      })
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({
        entityName: 'PdfDesign',
        error: err,
      })
    }
  }

  // Un seul design par defaut par service : le poser decroche les autres, dans la MEME
  // transaction. Deux `isDefault` a vrai feraient choisir la modale au hasard, sans bruit.
  async update(
    designID: string,
    params: PdfDesignUpdateEntityRepo,
  ): Promise<PdfDesignEntityRepo> {
    const scope = this.scope
    try {
      return await this.prisma.$transaction(async (tx) => {
        if (params.isDefault === true) {
          await tx.pdfDesign.updateMany({
            where: { ...scope, isDefault: true },
            data: { isDefault: false },
          })
        }
        return tx.pdfDesign.update({
          where: { id_serviceId: { id: designID, serviceId: scope.serviceId } },
          data: {
            ...(params.name === undefined ? {} : { name: params.name }),
            ...(params.content === undefined
              ? {}
              : { content: params.content as Prisma.InputJsonValue }),
            ...(params.isDefault === undefined
              ? {}
              : { isDefault: params.isDefault }),
            ...(params.archived === undefined
              ? {}
              : { archivedAt: params.archived ? new Date() : null }),
          },
        })
      })
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({
        entityName: 'PdfDesign',
        error: err,
      })
    }
  }
```

Ajouter `import { Prisma } from '../../../../generated/client'` et `errorHandler` au constructeur (le repository de l'étape 1 ne l'avait pas) :

```ts
  constructor({ postgresOrm, errorHandler, tenantContext }: IocContainer) {
    this.prisma = postgresOrm.prisma
    this.errorHandler = errorHandler
    this.tenantContext = tenantContext
  }
```

- [ ] **Step 4: Étendre le domaine**

`back/src/main/types/domain/pdf-design.domain.interface.ts` :

```ts
export type PdfDesignCreateDomain = {
  sourcePresetId?: string
  name?: string
}

export type PdfDesignUpdateDomain = {
  name?: string
  content?: PdfDesignContent
  isDefault?: boolean
  archived?: boolean
}

export interface PdfDesignDomainInterface {
  findAllForService: () => Promise<PdfDesignListDomain>
  create: (params: PdfDesignCreateDomain) => Promise<PdfDesignSummaryDomain>
  update: (
    designID: string,
    params: PdfDesignUpdateDomain,
  ) => Promise<PdfDesignSummaryDomain>
  archive: (designID: string) => Promise<void>
}
```

`back/src/main/domain/pdf-design.domain.ts`, ajouter la numérotation des copies et les trois méthodes :

```ts
// Une toile vide et la page calendrier : le point de depart d'un design parti de rien.
const CONTENU_VIERGE = {
  version: 1 as const,
  pages: [
    { kind: 'canvas' as const, id: 'page-1', elements: [] },
    { kind: 'calendar' as const, id: 'calendrier' },
  ],
}

// « X (copie) », puis « X (copie 2) », « X (copie 3) »... Le nom d'un design n'est pas unique
// en base (choix de la spec), mais deux entrees identiques dans une liste sont illisibles.
// Les noms pris incluent les designs SUPPRIMES : la numerotation ne doit pas se remettre a 2
// parce qu'une copie a ete supprimee, sinon deux lignes porteraient le meme nom au retour.
export const nomDeCopie = (base: string, pris: string[]): string => {
  const premier = `${base} (copie)`
  if (!pris.includes(premier)) {
    return premier
  }
  for (let n = 2; ; n += 1) {
    const candidat = `${base} (copie ${n})`
    if (!pris.includes(candidat)) {
      return candidat
    }
  }
}
```

```ts
  async create(params: PdfDesignCreateDomain): Promise<PdfDesignSummaryDomain> {
    const pris = await this.pdfDesignRepository.namesInService()

    if (!params.sourcePresetId) {
      const ligne = await this.pdfDesignRepository.create({
        name: params.name ?? nomDeCopie('Nouveau design', pris),
        content: CONTENU_VIERGE,
        sourcePresetId: null,
      })
      return this.#resume(ligne)
    }

    const preset = await this.pdfDesignRepository.findPresetByID(
      params.sourcePresetId,
    )
    if (!preset) {
      throw Boom.notFound('PdfDesignPreset not found')
    }
    // Copie FIGEE : modifier le preset ensuite ne touche aucune copie deja faite.
    const ligne = await this.pdfDesignRepository.create({
      name: params.name ?? nomDeCopie(preset.name, pris),
      content: preset.content,
      sourcePresetId: preset.id,
    })
    return this.#resume(ligne)
  }

  async update(
    designID: string,
    params: PdfDesignUpdateDomain,
  ): Promise<PdfDesignSummaryDomain> {
    return this.#resume(
      await this.pdfDesignRepository.update(designID, params),
    )
  }

  async archive(designID: string): Promise<void> {
    await this.pdfDesignRepository.update(designID, { archived: true })
  }

  // Un contenu deja en base peut ne plus passer le schema : on le signale ici plutot que de
  // laisser le serialiseur de reponse en faire un 500.
  #resume(ligne: { id: string; name: string; content: unknown; isDefault: boolean }) {
    const analyse = pdfDesignContentSchema.safeParse(ligne.content)
    if (!analyse.success) {
      throw Boom.internal('Le contenu de ce design ne passe pas le schema')
    }
    return {
      id: ligne.id,
      name: ligne.name,
      content: analyse.data,
      isDefault: ligne.isDefault,
    }
  }
```

Ajouter `import Boom from '@hapi/boom'` en tête.

- [ ] **Step 5: Écrire le test unitaire de la numérotation**

`back/src/test/unit/domain/pdf-design.domain.test.ts` :

```ts
import { nomDeCopie } from '../../../main/domain/pdf-design.domain'

describe('nomDeCopie', () => {
  it('rend « (copie) » quand rien n est pris', () => {
    expect(nomDeCopie('Programme SMCV', [])).toBe('Programme SMCV (copie)')
  })

  it('passe a « (copie 2) » quand la premiere copie existe', () => {
    expect(nomDeCopie('Programme SMCV', ['Programme SMCV (copie)'])).toBe(
      'Programme SMCV (copie 2)',
    )
  })

  it('saute les numeros deja pris', () => {
    expect(
      nomDeCopie('P', ['P (copie)', 'P (copie 2)', 'P (copie 3)']),
    ).toBe('P (copie 4)')
  })

  // Les noms pris incluent les supprimes : sinon deux lignes porteraient le meme nom
  // des qu'une copie supprimee est restauree.
  it('ne reutilise pas un numero libere entre deux', () => {
    expect(nomDeCopie('P', ['P (copie)', 'P (copie 3)'])).toBe('P (copie 2)')
  })
})
```

- [ ] **Step 6: Écrire les schémas et le routeur d'écriture**

`back/src/main/interfaces/http/fastify/schemas/pdf-design.schema.ts`, ajouter :

```ts
export const pdfDesignIdParamsSchema = z.object({ designID: z.cuid() })

export const createPdfDesignSchema = z.object({
  sourcePresetId: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
})

export const updatePdfDesignSchema = z.object({
  name: z.string().min(1).optional(),
  content: pdfDesignContentSchema.optional(),
  isDefault: z.boolean().optional(),
  archived: z.boolean().optional(),
})

export type PdfDesignIdParams = z.infer<typeof pdfDesignIdParamsSchema>
export type CreatePdfDesignBody = z.infer<typeof createPdfDesignSchema>
export type UpdatePdfDesignBody = z.infer<typeof updatePdfDesignSchema>
```

`back/src/main/interfaces/http/fastify/routes/pdfDesign.ts`, ajouter sous le routeur de lecture :

```ts
// Ecriture : reservee au coordinateur, comme les autres referentiels du service.
const pdfDesignWriteRouter: FastifyPluginAsync = (fastify) => {
  const { pdfDesignDomain } = fastify.iocContainer

  fastify.post<{ Body: CreatePdfDesignBody }>(
    '/',
    {
      schema: {
        body: createPdfDesignSchema,
        response: { 201: pdfDesignSummarySchema },
      },
      config: { permission: 'referentials:write' },
    },
    async (request, reply) => {
      const design = await pdfDesignDomain.create(request.body)
      reply.code(201)
      return design
    },
  )

  fastify.patch<{ Params: PdfDesignIdParams; Body: UpdatePdfDesignBody }>(
    '/:designID',
    {
      schema: {
        params: pdfDesignIdParamsSchema,
        body: updatePdfDesignSchema,
        response: {
          200: pdfDesignSummarySchema,
          404: z.object({ message: z.string() }),
        },
      },
      config: { permission: 'referentials:write' },
    },
    (request) =>
      pdfDesignDomain.update(request.params.designID, request.body),
  )

  // Supprime = archive. La restauration passe par PATCH { archived: false }, comme les
  // salles et les thematiques.
  fastify.delete<{ Params: PdfDesignIdParams }>(
    '/:designID',
    {
      schema: {
        params: pdfDesignIdParamsSchema,
        response: {
          204: z.null(),
          404: z.object({ message: z.string() }),
        },
      },
      config: { permission: 'referentials:write' },
    },
    async (request, reply) => {
      await pdfDesignDomain.archive(request.params.designID)
      reply.code(204).send()
    },
  )

  return Promise.resolve()
}

export { pdfDesignReadRouter, pdfDesignWriteRouter }
```

`pdfDesignSummarySchema` doit être exporté depuis le schéma (il est privé à l'étape 1) — ajouter `export` devant sa déclaration.

`back/src/main/interfaces/http/fastify/routes/tenant.routes.ts` :

```ts
  await fastify.register(pdfDesignWriteRouter, { prefix: '/pdf-designs' })
```

- [ ] **Step 7: Relancer les tests**

```bash
cd back && npx tsc --noEmit -p src/main/tsconfig.json
cd back && NODE_OPTIONS=--experimental-vm-modules npx jest -c src/test/jest.config.ts \
  --selectProjects unit --testPathPatterns "pdf-design.domain"
cd back && NODE_OPTIONS=--experimental-vm-modules npm run with:dotenv -- \
  -e .env.test.local -e .env.test -- jest --runInBand -c src/test/jest.config.ts \
  --selectProjects e2e --testPathPatterns "e2e/pdf-design"
```

Attendu : typecheck sans sortie, 4 tests unitaires PASS, e2e PASS.

Note sur l'ordre des tests e2e : ils partagent un `beforeAll` et s'exécutent en séquence sur la même base. Les tests de renommage et de défaut s'appuient sur les designs créés par les tests précédents — si vous en réordonnez un, relisez ses `findFirstOrThrow`.

- [ ] **Step 8: Suites complètes, lint, commit**

```bash
cd back && NODE_OPTIONS=--experimental-vm-modules npx jest -c src/test/jest.config.ts --selectProjects unit
cd back && npm run test:e2e
cd back && npx biome check --write src/main prisma src/test && npm run lint
git add back && git commit -m "feat(pdf): routes d'ecriture des designs, duplication et defaut unique"
```

---

### Task 2: API et mutations côté front

**Files:**
- Modify: `front/src/types/pdfDesignList.ts`
- Modify: `front/src/api/pdfDesign.api.ts`
- Modify: `front/src/queries/usePdfDesign.ts`
- Modify: `front/src/constants/process.constant.ts`

**Interfaces:**
- Consumes: les routes de la tâche 1 ; `PdfDesignSummary`, `PdfDesignList` (étape 1).
- Produces: `PdfDesignApi.create/update/archive`, et `usePdfDesignMutations()` → `{ duplicateDesign, renameDesign, saveContent, setDefaultDesign, archiveDesign, restoreDesign }`.

- [ ] **Step 1: Ajouter les types de paramètres**

`front/src/types/pdfDesignList.ts` :

```ts
export type CreatePdfDesignParams = {
  sourcePresetId?: string
  name?: string
}

export type UpdatePdfDesignParams = {
  id: string
  name?: string
  content?: PdfDesignContent
  isDefault?: boolean
  archived?: boolean
}
```

- [ ] **Step 2: Ajouter les clés de requête**

`front/src/constants/process.constant.ts`, compléter `PDF_DESIGN` :

```ts
export const PDF_DESIGN = {
  GET_ALL: 'get_all_pdf_designs',
  CREATE: 'create_pdf_design',
  UPDATE: 'update_pdf_design',
  ARCHIVE: 'archive_pdf_design',
  RESTORE: 'restore_pdf_design',
}
```

- [ ] **Step 3: Étendre le module d'API**

`front/src/api/pdfDesign.api.ts`. Le tenant reste implicite : `tenantApiUrl()` le lit dans le store à l'appel.

```ts
  create: async (params: CreatePdfDesignParams): Promise<PdfDesignSummary> => {
    const response = await fetchWithAuth(`${tenantApiUrl()}/pdf-designs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    })
    if (!response.ok) {
      handleHttpError(response, {}, 'Impossible de créer le design')
    }
    return response.json()
  },

  update: async ({
    id,
    ...champs
  }: UpdatePdfDesignParams): Promise<PdfDesignSummary> => {
    const response = await fetchWithAuth(`${tenantApiUrl()}/pdf-designs/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(champs),
    })
    if (!response.ok) {
      handleHttpError(response, {}, 'Impossible de modifier le design')
    }
    return response.json()
  },

  archive: async (designID: string): Promise<void> => {
    const response = await fetchWithAuth(
      `${tenantApiUrl()}/pdf-designs/${designID}`,
      { method: 'DELETE' },
    )
    if (!response.ok) {
      handleHttpError(response, {}, 'Impossible de supprimer le design')
    }
  },
```

- [ ] **Step 4: Écrire les mutations**

`front/src/queries/usePdfDesign.ts`, ajouter. Pas de mise à jour optimiste : la liste est courte et les écritures rares, une invalidation suffit — c'est aussi ce qui évite le motif photographie/restauration que `lecture-directe-du-cache.test.ts` surveille.

```ts
export const usePdfDesignMutations = () => {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  const invalider = () =>
    queryClient.invalidateQueries({ queryKey: [PDF_DESIGN.GET_ALL] })

  const avecToast = (titreSucces: string, titreErreur: string) => ({
    onSuccess: () => {
      toast({ title: titreSucces, severity: TOAST_SEVERITY.SUCCESS })
    },
    onError: (error: Error) => {
      toast({
        title: titreErreur,
        message: error.message,
        severity: TOAST_SEVERITY.ERROR,
      })
    },
    onSettled: invalider,
  })

  const duplicateDesign = useMutation({
    mutationKey: [PDF_DESIGN.CREATE],
    mutationFn: (sourcePresetId: string) =>
      PdfDesignApi.create({ sourcePresetId }),
    ...avecToast('Design dupliqué', 'Erreur lors de la duplication'),
  })

  const renameDesign = useMutation({
    mutationKey: [PDF_DESIGN.UPDATE],
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      PdfDesignApi.update({ id, name }),
    ...avecToast('Design renommé', 'Erreur lors du renommage'),
  })

  // Enregistrement de l'editeur : pas de toast de succes, il partirait a chaque sauvegarde.
  const saveContent = useMutation({
    mutationKey: [PDF_DESIGN.UPDATE],
    mutationFn: ({ id, content }: { id: string; content: PdfDesignContent }) =>
      PdfDesignApi.update({ id, content }),
    onError: (error: Error) => {
      toast({
        title: "Erreur lors de l'enregistrement du design",
        message: error.message,
        severity: TOAST_SEVERITY.ERROR,
      })
    },
    onSettled: invalider,
  })

  const setDefaultDesign = useMutation({
    mutationKey: [PDF_DESIGN.UPDATE],
    mutationFn: (id: string) => PdfDesignApi.update({ id, isDefault: true }),
    ...avecToast('Design par défaut', 'Erreur lors du changement de défaut'),
  })

  const archiveDesign = useMutation({
    mutationKey: [PDF_DESIGN.ARCHIVE],
    mutationFn: PdfDesignApi.archive,
    ...avecToast('Design supprimé', 'Erreur lors de la suppression'),
  })

  const restoreDesign = useMutation({
    mutationKey: [PDF_DESIGN.RESTORE],
    mutationFn: (id: string) => PdfDesignApi.update({ id, archived: false }),
    ...avecToast('Design restauré', 'Erreur lors de la restauration'),
  })

  return {
    duplicateDesign,
    renameDesign,
    saveContent,
    setDefaultDesign,
    archiveDesign,
    restoreDesign,
  }
}
```

- [ ] **Step 5: La lecture doit pouvoir demander les supprimés**

La route de l'étape 1 ne rend que les designs actifs. Pour l'onglet « Supprimés », ajouter un paramètre de requête `archived`, comme `GET /location`.

Back, `routes/pdfDesign.ts`, sur le `GET` :

```ts
      schema: {
        querystring: z.object({ archived: z.stringbool().default(false) }),
        response: { 200: pdfDesignListResponseSchema },
      },
```

et passer `request.query.archived` au domaine, puis au repository :

```ts
  findAllForService(archived = false): Promise<PdfDesignEntityRepo[]> {
    return this.prisma.pdfDesign.findMany({
      where: { ...this.scope, archivedAt: archived ? { not: null } : null },
      orderBy: { createdAt: 'asc' },
    })
  }
```

Les presets ne sont pas concernés : un preset archivé n'est jamais proposé, et c'est le super-admin qui les gère (étape 5). Le domaine rend donc `presets: []` quand `archived` est vrai.

Front, `usePdfDesignQueries(archived = false)` avec `queryKey: [PDF_DESIGN.GET_ALL, archived]`, et `PdfDesignApi.getAll(archived)` qui pose `?archived=${archived}`.

Ajouter l'e2e correspondant dans `back/src/test/e2e/pdf-design.test.ts` :

```ts
  it('rend les designs supprimes quand on les demande, et aucun preset', async () => {
    const res = await app.inject({
      method: 'GET',
      url: tenantUrl(scenario.est.id, scenario.serviceA.id, '/pdf-designs?archived=true'),
      cookies: scenario.cookiesA,
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().presets).toEqual([])
  })
```

- [ ] **Step 6: Typecheck, conventions, lint, commit**

```bash
cd front && npx tsc -b
cd front && npx vitest run src/test/conventions-tenant-api-queries.test.ts
cd back && npx tsc --noEmit -p src/main/tsconfig.json && npm run test:e2e
cd front && npx biome check --write src/api/pdfDesign.api.ts src/queries/usePdfDesign.ts src/types/pdfDesignList.ts src/constants/process.constant.ts
git add front back && git commit -m "feat(pdf): api et mutations des designs, lecture des supprimes"
```

Attendu : typecheck muet, test de conventions vert sans exception à ajouter.

---

### Task 3: L'écran de liste — fin de la tranche livrable sans éditeur

**Files:**
- Create: `front/src/routes/_authenticated/e/$establishmentId/s/$serviceId/_settings/pdf-patient.tsx`
- Create: `front/src/routes/_authenticated/e/$establishmentId/s/$serviceId/_settings/pdf-patient.test.tsx`
- Create: `front/src/components/custom/pdf-design/design-card.tsx`
- Create: `front/src/components/custom/popup/renamePdfDesignForm.tsx`
- Modify: `front/src/navigation/navigation.ts`

**Interfaces:**
- Consumes: `usePdfDesignQueries(archived)`, `usePdfDesignMutations()` (tâche 2) ; `PdfDesignSummary`.
- Produces: la route `/e/$establishmentId/s/$serviceId/pdf-patient`, et `DesignCard` (props ci-dessous), réutilisée par l'éditeur en tâche 6 pour son fil d'Ariane.

**Pourquoi des cartes et pas `ReactTable`.** Les autres référentiels utilisent `ReactTable`, mais ici deux groupes aux actions différentes cohabitent (presets en lecture seule, designs du service modifiables), et `front/CLAUDE.md` documente que **une table virtualisée rend ZÉRO ligne sous jsdom** : tout test de son contenu est vrai par vacuité sans un mock du virtualiseur. Des cartes rendent l'écran honnêtement testable et disent mieux les deux groupes. Déviation assumée du motif maison.

- [ ] **Step 1: Écrire le test qui échoue**

`front/src/routes/.../_settings/pdf-patient.test.tsx`. Suivre le harnais des autres tests d'écran de ce dossier (`indicateurs.test.tsx` est le plus proche) : routeur minimal jetable, `QueryClientProvider`, `fetch` moqué.

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const CONTENU = {
  version: 1,
  pages: [{ kind: 'canvas', id: 'p1', background: '#ffffff', elements: [] }],
}

const reponse = (corps: unknown) =>
  Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(corps) })

describe('ecran des designs de PDF patient', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  const monter = (liste: {
    presets: unknown[]
    designs: unknown[]
  }) => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      reponse(liste) as unknown as Promise<Response>,
    )
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    return render(
      <QueryClientProvider client={client}>
        <PdfPatientSettings />
      </QueryClientProvider>,
    )
  }

  it('montre les presets livres et les designs du service dans deux groupes', async () => {
    monter({
      presets: [
        { id: 'p1', name: 'Programme SMCV', content: CONTENU, isDefault: false },
      ],
      designs: [
        { id: 'd1', name: 'Mon programme', content: CONTENU, isDefault: false },
      ],
    })

    expect(await screen.findByText('Programme SMCV')).toBeInTheDocument()
    expect(screen.getByText('Mon programme')).toBeInTheDocument()
    expect(screen.getByText('Modèles livrés')).toBeInTheDocument()
    expect(screen.getByText('Les designs du service')).toBeInTheDocument()
  })

  it('un preset se duplique mais ne se modifie ni ne se supprime', async () => {
    monter({
      presets: [
        { id: 'p1', name: 'Programme SMCV', content: CONTENU, isDefault: false },
      ],
      designs: [],
    })
    const carte = (await screen.findByText('Programme SMCV')).closest('article')
    if (!carte) {
      throw new Error('carte du preset introuvable')
    }

    expect(
      within(carte).getByRole('button', { name: /Dupliquer/ }),
    ).toBeInTheDocument()
    expect(
      within(carte).queryByRole('button', { name: /Modifier/ }),
    ).not.toBeInTheDocument()
    expect(
      within(carte).queryByRole('button', { name: /Supprimer/ }),
    ).not.toBeInTheDocument()
  })

  it('invite a dupliquer un modele quand le service n a encore aucun design', async () => {
    monter({
      presets: [
        { id: 'p1', name: 'Programme SMCV', content: CONTENU, isDefault: false },
      ],
      designs: [],
    })
    expect(
      await screen.findByText(/Dupliquez un modèle pour le personnaliser/),
    ).toBeInTheDocument()
  })

  it('marque le design par defaut, et lui seul', async () => {
    monter({
      presets: [],
      designs: [
        { id: 'd1', name: 'Celui-ci', content: CONTENU, isDefault: true },
        { id: 'd2', name: 'Pas celui-la', content: CONTENU, isDefault: false },
      ],
    })
    expect(await screen.findByText('Par défaut')).toBeInTheDocument()
    expect(screen.getAllByText('Par défaut')).toHaveLength(1)
  })

  it('envoie la duplication du bon preset', async () => {
    const appels: { url: string; init?: RequestInit }[] = []
    const liste = {
      presets: [
        { id: 'p1', name: 'Programme SMCV', content: CONTENU, isDefault: false },
      ],
      designs: [],
    }
    vi.spyOn(globalThis, 'fetch').mockImplementation(((
      url: string,
      init?: RequestInit,
    ) => {
      appels.push({ url, init })
      return reponse(init?.method === 'POST' ? { id: 'd1' } : liste)
    }) as unknown as typeof fetch)

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    render(
      <QueryClientProvider client={client}>
        <PdfPatientSettings />
      </QueryClientProvider>,
    )

    await userEvent.click(
      await screen.findByRole('button', { name: /Dupliquer/ }),
    )

    await waitFor(() => {
      const post = appels.find((a) => a.init?.method === 'POST')
      expect(post).toBeDefined()
      expect(JSON.parse(String(post?.init?.body))).toEqual({
        sourcePresetId: 'p1',
      })
    })
  })
})
```

Importer `within` depuis `@testing-library/react` (le second cas s'en sert) et lire `indicateurs.test.tsx` pour la forme exacte du harnais de routeur utilisee dans ce dossier : l'ecran lit `Route.useParams()`, donc il a besoin d'un routeur minimal, pas seulement d'un `QueryClientProvider`.

- [ ] **Step 2: Lancer le test pour le voir échouer**

```bash
cd front && npx vitest run "src/routes/_authenticated/e/\$establishmentId/s/\$serviceId/_settings/pdf-patient.test.tsx"
```

Attendu : ÉCHEC, `PdfPatientSettings` introuvable.

- [ ] **Step 3: Écrire la carte**

`front/src/components/custom/pdf-design/design-card.tsx`. Une vignette dessinée par le futur `render-canvas` serait plus parlante, mais elle arrive en tâche 5 : ici la carte porte le nom, le badge et les actions.

```tsx
import { Copy, Pencil, RotateCcw, Star, Trash2 } from 'lucide-react'

import type { PdfDesignSummary } from '../../../types/pdfDesignList.ts'
import { Button } from '../../ui/button.tsx'

type DesignCardProps = {
  design: PdfDesignSummary
  // Un preset est en lecture seule : il se duplique, il ne se modifie pas.
  lectureSeule: boolean
  supprime?: boolean
  onDupliquer?: () => void
  onModifier?: () => void
  onRenommer?: () => void
  onParDefaut?: () => void
  onSupprimer?: () => void
  onRestaurer?: () => void
}

export default function DesignCard({
  design,
  lectureSeule,
  supprime = false,
  onDupliquer,
  onModifier,
  onRenommer,
  onParDefaut,
  onSupprimer,
  onRestaurer,
}: DesignCardProps) {
  const pages = design.content.pages.length
  return (
    <article className="border border-border rounded-lg p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-semibold text-foreground truncate">
            {design.name}
          </h3>
          <p className="text-sm text-text-light">
            {pages} page{pages > 1 ? 's' : ''}
          </p>
        </div>
        {design.isDefault && (
          <span className="text-xs font-medium px-2 py-1 rounded bg-primary/10 text-primary whitespace-nowrap">
            Par défaut
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {supprime ? (
          <Button variant="outline" size="sm" onClick={onRestaurer}>
            <RotateCcw className="w-4 h-4" />
            Restaurer
          </Button>
        ) : (
          <>
            <Button variant="outline" size="sm" onClick={onDupliquer}>
              <Copy className="w-4 h-4" />
              Dupliquer
            </Button>
            {!lectureSeule && (
              <>
                <Button variant="outline" size="sm" onClick={onModifier}>
                  <Pencil className="w-4 h-4" />
                  Modifier
                </Button>
                <Button variant="outline" size="sm" onClick={onRenommer}>
                  Renommer
                </Button>
                {!design.isDefault && (
                  <Button variant="outline" size="sm" onClick={onParDefaut}>
                    <Star className="w-4 h-4" />
                    Par défaut
                  </Button>
                )}
                <Button variant="outline" size="sm" onClick={onSupprimer}>
                  <Trash2 className="w-4 h-4" />
                  Supprimer
                </Button>
              </>
            )}
          </>
        )}
      </div>
    </article>
  )
}
```

Attention : le badge « Par défaut » et le bouton « Par défaut » portent le même mot. Le test `getAllByText('Par défaut')` ne doit en trouver qu'un — d'où le `{!design.isDefault && …}` sur le bouton, qui disparaît précisément sur la carte qui porte le badge. Si vous changez l'un, relisez le test.

- [ ] **Step 4: Écrire la popup de renommage**

`front/src/components/custom/popup/renamePdfDesignForm.tsx`, décalquée de `renameServiceForm.tsx` (même `useAppForm`, même `Popup`), avec `design: PdfDesignSummary | null` et `onClose`, appelant `renameDesign.mutate({ id, name })`.

- [ ] **Step 5: Écrire l'écran**

`front/src/routes/.../_settings/pdf-patient.tsx`. Garde de route identique à `location.tsx` (`referentials:write`, sinon redirection vers le dashboard).

```tsx
function PdfPatientSettings() {
  const navigate = useNavigate()
  const { establishmentId, serviceId } = Route.useParams()
  const [montrerSupprimes, setMontrerSupprimes] = useState(false)
  const { presets, designs, isPending } = usePdfDesignQueries(montrerSupprimes)
  const {
    duplicateDesign,
    setDefaultDesign,
    archiveDesign,
    restoreDesign,
  } = usePdfDesignMutations()
  const [aRenommer, setARenommer] = useState<PdfDesignSummary | null>(null)
  const [aSupprimer, setASupprimer] = useState<string | null>(null)

  return (
    <DashboardLayout>
      <div className="flex-1 min-h-0 bg-background p-6 rounded-lg flex flex-col w-full gap-6 overflow-auto">
        <div className="flex flex-wrap justify-between items-center gap-3">
          <h1 className="h-9 flex items-center text-text-dark text-xl font-semibold">
            Document patient
          </h1>
          <div className="flex items-center gap-2">
            <Switch
              id="designs-supprimes"
              checked={montrerSupprimes}
              onCheckedChange={setMontrerSupprimes}
            />
            <Label htmlFor="designs-supprimes">Supprimés</Label>
          </div>
        </div>

        {!montrerSupprimes && (
          <section className="flex flex-col gap-3">
            <div>
              <h2 className="font-semibold text-foreground">Modèles livrés</h2>
              <p className="text-sm text-text-light">
                Ils ne se modifient pas. Dupliquez-en un pour en faire le vôtre.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {presets.map((preset) => (
                <DesignCard
                  key={preset.id}
                  design={preset}
                  lectureSeule
                  onDupliquer={() => duplicateDesign.mutate(preset.id)}
                />
              ))}
            </div>
          </section>
        )}

        <section className="flex flex-col gap-3">
          <h2 className="font-semibold text-foreground">
            {montrerSupprimes ? 'Designs supprimés' : 'Les designs du service'}
          </h2>
          {!isPending && designs.length === 0 && (
            <p className="text-sm text-text-light">
              {montrerSupprimes
                ? 'Aucun design supprimé.'
                : 'Aucun design propre à ce service. Dupliquez un modèle pour le personnaliser.'}
            </p>
          )}
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {designs.map((design) => (
              <DesignCard
                key={design.id}
                design={design}
                lectureSeule={false}
                supprime={montrerSupprimes}
                onDupliquer={() => duplicateDesign.mutate(design.id)}
                onModifier={() =>
                  navigate({
                    to: '/e/$establishmentId/s/$serviceId/pdf-patient/$designId',
                    params: { establishmentId, serviceId, designId: design.id },
                  })
                }
                onRenommer={() => setARenommer(design)}
                onParDefaut={() => setDefaultDesign.mutate(design.id)}
                onSupprimer={() => setASupprimer(design.id)}
                onRestaurer={() => restoreDesign.mutate(design.id)}
              />
            ))}
          </div>
        </section>

        <RenamePdfDesignForm design={aRenommer} onClose={() => setARenommer(null)} />

        <ConfirmDeleteForm
          open={!!aSupprimer}
          setOpen={(open) => !open && setASupprimer(null)}
          onConfirm={() => {
            if (aSupprimer) {
              archiveDesign.mutate(aSupprimer)
            }
            setASupprimer(null)
          }}
          loading={archiveDesign.isPending}
          title="Supprimer le design"
          description="Il sort de la liste de choix du document patient. Les PDF déjà générés ne changent pas, et il se restaure depuis le filtre « Supprimés »."
        />
      </div>
    </DashboardLayout>
  )
}
```

Note : `duplicateDesign.mutate(design.id)` sur un design du service enverrait `sourcePresetId` pointant sur un design et non un preset — la route répondrait 404. Dupliquer un design du service **n'est pas** au périmètre de l'étape 2 : retirer `onDupliquer` de la carte quand `lectureSeule` est faux, ou étendre la route en étape 3. Le plus court est de ne pas le proposer : dans `DesignCard`, n'afficher « Dupliquer » que si `lectureSeule`.

- [ ] **Step 6: Déclarer l'écran dans la navigation**

`front/src/navigation/navigation.ts`, dans le groupe `Administration` du service, après « Diagnostics éducatifs » :

```ts
    {
      label: 'Document patient',
      to: '/e/$establishmentId/s/$serviceId/pdf-patient',
      permission: 'referentials:write',
      group: 'Administration',
      description: 'Mise en page du programme remis au patient',
    },
```

Et l'éditeur, qui se rejoint depuis la liste, va dans `HORS_ONGLETS` :

```ts
  '/e/$establishmentId/s/$serviceId/pdf-patient/$designId':
    "editeur d'un design, depuis la liste Document patient",
```

- [ ] **Step 7: Lancer les tests**

```bash
cd front && npx vitest run src/navigation/navigation.test.ts
cd front && npx vitest run "src/routes/_authenticated/e/\$establishmentId/s/\$serviceId/_settings/pdf-patient.test.tsx"
cd front && npx tsc -b
```

Attendu : navigation verte (l'écran est déclaré), les 5 cas de l'écran verts, typecheck muet. `routeTree.gen.ts` est régénéré par le plugin de routage — ne pas l'éditer à la main.

- [ ] **Step 8: Vérifier à l'écran**

Démarrer le back et le front, aller dans Administration → Document patient. Vérifier : le preset « Programme SMCV » apparaît sous « Modèles livrés » avec le seul bouton « Dupliquer » ; dupliquer le crée sous « Les designs du service » nommé « Programme SMCV (copie) » ; le renommer, le définir par défaut, le supprimer, basculer « Supprimés », le restaurer. Puis ouvrir la modale du programme d'un patient : le sélecteur de design apparaît dès qu'il y a deux entrées, et le design par défaut est présélectionné.

- [ ] **Step 9: Suite complète, lint, commit**

```bash
cd front && npx vitest run && npx biome check --write src/routes src/components/custom/pdf-design src/components/custom/popup src/navigation
git add front && git commit -m "feat(pdf): ecran des designs, duplication d'un modele livre"
```

**Fin de la tranche livrable sans éditeur.** Ce qui suit construit l'éditeur.

---

### Task 4: `use-drag-resize` — l'arithmétique, sans DOM

C'est ici que seront les bugs de l'éditeur, et c'est la seule partie qui se teste exactement. Trois fonctions pures ; le hook qui les branche aux pointer events vient en tâche 6.

**Files:**
- Create: `front/src/components/custom/pdf-design/editor/geometrie.ts`
- Create: `front/src/components/custom/pdf-design/editor/geometrie.test.ts`

**Interfaces:**
- Consumes: `A4_WIDTH`, `A4_HEIGHT` (`types/pdfDesign.ts`).
- Produces: `type Poignee`, `type Boite`, `deplacer`, `redimensionner`, `aimanter`, `TAILLE_MINIMALE`, `TOLERANCE_AIMANT`.

- [ ] **Step 1: Écrire les tests qui échouent**

```ts
import { describe, expect, it } from 'vitest'

import { A4_HEIGHT, A4_WIDTH } from '../../../../types/pdfDesign.ts'
import {
  aimanter,
  type Boite,
  deplacer,
  redimensionner,
  TAILLE_MINIMALE,
} from './geometrie.ts'

const boite = (over: Partial<Boite> = {}): Boite => ({
  x: 100,
  y: 200,
  w: 80,
  h: 40,
  ...over,
})

describe('deplacer', () => {
  // Le delta est en pixels d'ecran ; la toile est rendue a l'echelle, donc il se divise.
  it('divise le delta par l echelle', () => {
    expect(deplacer(boite(), 50, 20, 0.5)).toMatchObject({ x: 200, y: 240 })
  })

  it('ne change ni la largeur ni la hauteur', () => {
    const r = deplacer(boite(), 13, 7, 1)
    expect(r.w).toBe(80)
    expect(r.h).toBe(40)
  })

  it('arrondit au point : un design ne porte pas de coordonnees a dix decimales', () => {
    expect(deplacer(boite(), 1, 1, 0.3)).toMatchObject({ x: 103, y: 203 })
  })
})

describe('redimensionner', () => {
  it('depuis le coin bas-droite, ne bouge que la taille', () => {
    expect(redimensionner(boite(), 'se', 20, 10, 1)).toEqual({
      x: 100,
      y: 200,
      w: 100,
      h: 50,
    })
  })

  // Le coin oppose reste fixe : tirer le coin haut-gauche deplace l'origine ET la taille.
  it('depuis le coin haut-gauche, bouge l origine et la taille en sens inverse', () => {
    expect(redimensionner(boite(), 'nw', 20, 10, 1)).toEqual({
      x: 120,
      y: 210,
      w: 60,
      h: 30,
    })
  })

  it('depuis un bord, ne touche qu un axe', () => {
    expect(redimensionner(boite(), 'e', 20, 999, 1)).toEqual({
      x: 100,
      y: 200,
      w: 100,
      h: 40,
    })
    expect(redimensionner(boite(), 'n', 999, 10, 1)).toEqual({
      x: 100,
      y: 210,
      w: 80,
      h: 30,
    })
  })

  it('tient compte de l echelle', () => {
    expect(redimensionner(boite(), 'se', 40, 20, 0.5)).toMatchObject({
      w: 160,
      h: 80,
    })
  })

  // Sans plancher, tirer trop loin retourne la boite : largeur negative, element invisible
  // et coordonnees absurdes enregistrees en base.
  it('ne retourne jamais la boite, meme en tirant tres loin', () => {
    const r = redimensionner(boite(), 'se', -500, -500, 1)
    expect(r.w).toBe(TAILLE_MINIMALE)
    expect(r.h).toBe(TAILLE_MINIMALE)
  })

  it('garde le bord oppose fixe quand le plancher est atteint depuis le haut-gauche', () => {
    const r = redimensionner(boite(), 'nw', 500, 500, 1)
    expect(r.w).toBe(TAILLE_MINIMALE)
    // bord droit d'origine : 100 + 80 = 180
    expect(r.x + r.w).toBe(180)
  })
})

describe('aimanter', () => {
  it('colle au bord gauche de la page', () => {
    expect(aimanter(boite({ x: 2 }), []).x).toBe(0)
  })

  it('colle au bord droit de la page', () => {
    const b = boite({ x: A4_WIDTH - 80 - 3, w: 80 })
    expect(aimanter(b, []).x + 80).toBeCloseTo(A4_WIDTH, 5)
  })

  it('colle a l axe median horizontal', () => {
    const centre = (A4_WIDTH - 80) / 2
    expect(aimanter(boite({ x: centre + 2, w: 80 }), []).x).toBeCloseTo(centre, 5)
  })

  it('colle au bord d un voisin', () => {
    const voisin = boite({ x: 300, y: 0, w: 50, h: 10 })
    expect(aimanter(boite({ x: 302 }), [voisin]).x).toBe(300)
  })

  it('ne colle pas au-dela de la tolerance', () => {
    expect(aimanter(boite({ x: 40 }), []).x).toBe(40)
  })

  it('ne touche ni la largeur ni la hauteur', () => {
    const r = aimanter(boite({ x: 2 }), [])
    expect(r.w).toBe(80)
    expect(r.h).toBe(40)
  })
})
```

- [ ] **Step 2: Lancer les tests pour les voir échouer**

```bash
cd front && npx vitest run src/components/custom/pdf-design/editor/geometrie.test.ts
```

Attendu : ÉCHEC, module introuvable.

- [ ] **Step 3: Écrire les trois fonctions**

```ts
import { A4_HEIGHT, A4_WIDTH } from '../../../../types/pdfDesign.ts'

export type Poignee = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'
export type Boite = { x: number; y: number; w: number; h: number }

// Plancher d'une boite. Sans lui, tirer une poignee au-dela du bord oppose retourne la
// boite : largeur negative, element invisible, coordonnees absurdes enregistrees en base.
export const TAILLE_MINIMALE = 4
export const TOLERANCE_AIMANT = 4

// Les coordonnees d'un design sont en points entiers : la toile est rendue a l'echelle, donc
// un delta d'un pixel vaut une fraction de point, et sans arrondi un simple glissement
// enregistrerait des coordonnees a dix decimales.
const auPoint = (v: number) => Math.round(v)

export const deplacer = (
  depart: Boite,
  dxEcran: number,
  dyEcran: number,
  echelle: number,
): Boite => ({
  ...depart,
  x: auPoint(depart.x + dxEcran / echelle),
  y: auPoint(depart.y + dyEcran / echelle),
})

export const redimensionner = (
  depart: Boite,
  poignee: Poignee,
  dxEcran: number,
  dyEcran: number,
  echelle: number,
): Boite => {
  const dx = dxEcran / echelle
  const dy = dyEcran / echelle
  const gauche = poignee.includes('w')
  const droite = poignee.includes('e')
  const haut = poignee.startsWith('n')
  const bas = poignee.startsWith('s')

  // On raisonne en BORDS plutot qu'en origine + taille : le bord oppose a la poignee ne
  // bouge pas, par definition, et le plancher s'applique alors sans cas particulier.
  const bordDroit = depart.x + depart.w
  const bordBas = depart.y + depart.h

  let x = gauche ? Math.min(depart.x + dx, bordDroit - TAILLE_MINIMALE) : depart.x
  let y = haut ? Math.min(depart.y + dy, bordBas - TAILLE_MINIMALE) : depart.y
  const w = droite
    ? Math.max(depart.w + dx, TAILLE_MINIMALE)
    : bordDroit - x
  const h = bas ? Math.max(depart.h + dy, TAILLE_MINIMALE) : bordBas - y

  if (!gauche) {
    x = depart.x
  }
  if (!haut) {
    y = depart.y
  }

  return { x: auPoint(x), y: auPoint(y), w: auPoint(w), h: auPoint(h) }
}

// Lignes auxquelles une boite se colle : les deux bords de la page, les deux axes medians,
// et les bords des voisins. L'aimantation ne touche QUE l'origine : redimensionner et
// aimanter en meme temps rendrait un geste illisible.
const lignes = (voisins: Boite[]) => ({
  verticales: [
    0,
    A4_WIDTH,
    A4_WIDTH / 2,
    ...voisins.flatMap((v) => [v.x, v.x + v.w, v.x + v.w / 2]),
  ],
  horizontales: [
    0,
    A4_HEIGHT,
    A4_HEIGHT / 2,
    ...voisins.flatMap((v) => [v.y, v.y + v.h, v.y + v.h / 2]),
  ],
})

const colle = (
  debut: number,
  taille: number,
  candidats: number[],
  tolerance: number,
): number => {
  // Trois reperes de la boite peuvent accrocher : son bord debut, son centre, son bord fin.
  const reperes = [debut, debut + taille / 2, debut + taille]
  let meilleur: { ecart: number; debut: number } | null = null
  for (const [rang, repere] of reperes.entries()) {
    for (const cible of candidats) {
      const ecart = Math.abs(repere - cible)
      if (ecart > tolerance) {
        continue
      }
      const nouveauDebut = cible - (rang === 0 ? 0 : rang === 1 ? taille / 2 : taille)
      if (!meilleur || ecart < meilleur.ecart) {
        meilleur = { ecart, debut: nouveauDebut }
      }
    }
  }
  return meilleur ? meilleur.debut : debut
}

export const aimanter = (
  boite: Boite,
  voisins: Boite[],
  tolerance = TOLERANCE_AIMANT,
): Boite => {
  const { verticales, horizontales } = lignes(voisins)
  return {
    ...boite,
    x: colle(boite.x, boite.w, verticales, tolerance),
    y: colle(boite.y, boite.h, horizontales, tolerance),
  }
}
```

- [ ] **Step 4: Lancer les tests pour les voir passer**

```bash
cd front && npx vitest run src/components/custom/pdf-design/editor/geometrie.test.ts && npx tsc -b
```

Attendu : PASS, 15 tests. Typecheck muet.

Si `aimanter` ne rend pas exactement `0` sur le bord gauche, c'est que `colle` compare le centre avant le bord : le test « colle au bord gauche » est l'oracle, pas l'implémentation.

- [ ] **Step 5: Lint et commit**

```bash
cd front && npx biome check --write src/components/custom/pdf-design/editor
git add front && git commit -m "feat(pdf): geometrie de l'editeur, deplacement redimensionnement aimantation"
```

---

### Task 5: `render-canvas.tsx` — le même JSON, en HTML

**Files:**
- Create: `front/src/components/custom/pdf-design/render-canvas.tsx`
- Create: `front/src/components/custom/pdf-design/render-canvas.test.tsx`

**Interfaces:**
- Consumes: les types de `types/pdfDesign.ts` ; `SAMPLE_FIELD_VALUES` (`fields.ts`) ; les deux images livrées.
- Produces: `<CanvasPage page={...} echelle={...} selectionId={...} onSelect={...} />`, et `elementStyle(element, echelle)` exporté pour le test.

**Le point qui compte.** Ce moteur est une APPROXIMATION du rendu PDF, et c'est assumé : les métriques d'Helvetica diffèrent entre react-pdf et le navigateur, donc une ligne peut se couper ailleurs. Positions et tailles, elles, sont exactes — un seul facteur d'échelle, dans un seul sens. La bascule « Aperçu PDF » de la tâche 6 est la réponse à l'écart résiduel.

- [ ] **Step 1: Écrire les tests qui échouent**

```tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type { PdfCanvasPage, PdfElement } from '../../../types/pdfDesign.ts'
import CanvasPage, { elementStyle } from './render-canvas.tsx'

const geometrie = { id: 'e1', x: 10, y: 20, w: 100, h: 30, rotation: 0 }

const texte: PdfElement = {
  ...geometrie,
  kind: 'text',
  runs: [
    { text: 'Bonjour ', bold: false, italic: false },
    { field: 'patient.name', bold: false, italic: false },
  ],
  fontSize: 12,
  bold: false,
  italic: false,
  color: '#221755',
  align: 'center',
  vAlign: 'bottom',
}

const page = (elements: PdfElement[]): PdfCanvasPage => ({
  kind: 'canvas',
  id: 'p1',
  background: '#ffffff',
  elements,
})

describe('elementStyle', () => {
  it('convertit les points en pixels par l echelle', () => {
    expect(elementStyle(texte, 0.5)).toMatchObject({
      position: 'absolute',
      left: 5,
      top: 10,
      width: 50,
      height: 15,
    })
  })

  it('met la taille de police a l echelle, sinon le texte ne suit pas la boite', () => {
    expect(elementStyle(texte, 0.5)).toMatchObject({ fontSize: 6 })
  })

  it('traduit vAlign en justifyContent', () => {
    expect(elementStyle(texte, 1)).toMatchObject({ justifyContent: 'flex-end' })
  })

  it('n emet pas de borderRadius nul', () => {
    const filet: PdfElement = {
      ...geometrie,
      kind: 'rect',
      fill: '#e05a5a',
      radius: 0,
    }
    expect(elementStyle(filet, 1)).not.toHaveProperty('borderRadius')
  })

  it('rend une ellipse par un borderRadius de 50 pour cent', () => {
    const rond: PdfElement = {
      ...geometrie,
      kind: 'ellipse',
      fill: { token: 'pathway.color', fallback: '#e6aff6' },
    }
    expect(elementStyle(rond, 1)).toMatchObject({ borderRadius: '50%' })
  })
})

describe('CanvasPage', () => {
  // L'editeur ne montre jamais un vrai patient : un echantillon, et c'est tout.
  it('affiche un echantillon a la place d une donnee', () => {
    render(<CanvasPage page={page([texte])} echelle={1} />)
    expect(screen.getByText(/DUPONT Jean/)).toBeInTheDocument()
  })

  it('garde le texte fixe autour de la donnee', () => {
    render(<CanvasPage page={page([texte])} echelle={1} />)
    expect(screen.getByText(/Bonjour/)).toBeInTheDocument()
  })

  it('signale l element selectionne', () => {
    render(<CanvasPage page={page([texte])} echelle={1} selectionId="e1" />)
    expect(screen.getByTestId('element-e1')).toHaveAttribute(
      'data-selectionne',
      'true',
    )
  })

  it('previent du clic avec l identifiant de l element', async () => {
    const vus: string[] = []
    render(
      <CanvasPage page={page([texte])} echelle={1} onSelect={(id) => vus.push(id)} />,
    )
    screen.getByTestId('element-e1').click()
    expect(vus).toEqual(['e1'])
  })

  it('ignore un element de type inconnu au lieu de planter', () => {
    const inconnu = { ...geometrie, kind: 'qrcode' } as unknown as PdfElement
    render(<CanvasPage page={page([inconnu, texte])} echelle={1} />)
    expect(screen.getByTestId('element-e1')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Lancer les tests pour les voir échouer**

```bash
cd front && npx vitest run src/components/custom/pdf-design/render-canvas.test.tsx
```

Attendu : ÉCHEC, module introuvable.

- [ ] **Step 3: Écrire le moteur HTML**

`front/src/components/custom/pdf-design/render-canvas.tsx`. Mêmes décisions que `render-pdf.tsx`, transposées : `justifyContent` pour `vAlign`, pas de `borderRadius` nul, un `kind` inconnu rendu `null`. Deux différences assumées : tout est multiplié par l'échelle (y compris `fontSize`), et l'ellipse passe par `border-radius: 50%` au lieu d'un `<Svg>`.

```tsx
import type { CSSProperties } from 'react'

import lines from '../../../assets/images/pdf/lines.png'
import logoCHU from '../../../assets/images/pdf/logo_chx-bdx.png'
import {
  type PdfBuiltinImage,
  type PdfCanvasPage,
  type PdfElement,
  type PdfFill,
  type PdfTextElement,
} from '../../../types/pdfDesign.ts'
import { SAMPLE_FIELD_VALUES } from './fields.ts'

const IMAGES: Record<PdfBuiltinImage, string> = { 'logo-chu': logoCHU, lines }

const V_ALIGN: Record<PdfTextElement['vAlign'], CSSProperties['justifyContent']> =
  { top: 'flex-start', middle: 'center', bottom: 'flex-end' }

// Dans l'editeur, la couleur du parcours n'a pas de patient : on montre le repli, qui est
// ce que verra un patient sans parcours.
const remplissage = (fill: PdfFill): string =>
  typeof fill === 'string' ? fill : fill.fallback

export function elementStyle(
  element: PdfElement,
  echelle: number,
): CSSProperties {
  const base: CSSProperties = {
    position: 'absolute',
    left: element.x * echelle,
    top: element.y * echelle,
    width: element.w * echelle,
    height: element.h * echelle,
    ...(element.rotation ? { transform: `rotate(${element.rotation}deg)` } : {}),
  }
  switch (element.kind) {
    case 'text':
      return {
        ...base,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: V_ALIGN[element.vAlign],
        // La police suit l'echelle, sinon le texte deborde d'une boite reduite.
        fontSize: element.fontSize * echelle,
        fontFamily: 'Helvetica, Arial, sans-serif',
        fontWeight: element.bold ? 700 : 400,
        fontStyle: element.italic ? 'italic' : 'normal',
        color: element.color,
        textAlign: element.align,
        lineHeight: element.lineHeight ?? 'normal',
        overflow: 'hidden',
      }
    case 'rect':
      return {
        ...base,
        backgroundColor: remplissage(element.fill),
        ...(element.radius ? { borderRadius: element.radius * echelle } : {}),
      }
    case 'ellipse':
      return { ...base, backgroundColor: remplissage(element.fill), borderRadius: '50%' }
    case 'image':
      return { ...base, objectFit: element.fit }
    default:
      return base
  }
}

const contenu = (element: PdfElement) => {
  switch (element.kind) {
    case 'text':
      return element.runs.map((run, rang) => (
        <span
          // Un run n'a pas d'identite propre : son rang est sa cle.
          key={`${element.id}-${rang}`}
          style={{
            fontWeight: run.bold ? 700 : undefined,
            fontStyle: run.italic ? 'italic' : undefined,
          }}
        >
          {'field' in run ? SAMPLE_FIELD_VALUES[run.field] : run.text}
        </span>
      ))
    case 'image':
      return 'builtin' in element.source ? (
        <img
          src={IMAGES[element.source.builtin]}
          alt=""
          className="w-full h-full"
          style={{ objectFit: element.fit }}
        />
      ) : null
    default:
      return null
  }
}

type CanvasPageProps = {
  page: PdfCanvasPage
  echelle: number
  selectionId?: string | null
  onSelect?: (id: string) => void
}

export default function CanvasPage({
  page,
  echelle,
  selectionId,
  onSelect,
}: CanvasPageProps) {
  return (
    <div
      className="relative shadow-sm"
      style={{
        width: A4_WIDTH * echelle,
        height: A4_HEIGHT * echelle,
        backgroundColor: page.background,
        // Le decor deborde volontairement : on le coupe au bord de la page, comme le PDF.
        overflow: 'hidden',
      }}
    >
      {page.elements.map((element) => {
        if (!['text', 'rect', 'ellipse', 'image'].includes(element.kind)) {
          return null
        }
        return (
          <button
            type="button"
            key={element.id}
            data-testid={`element-${element.id}`}
            data-selectionne={selectionId === element.id ? 'true' : 'false'}
            onClick={() => onSelect?.(element.id)}
            style={{
              ...elementStyle(element, echelle),
              outline:
                selectionId === element.id ? '1px solid var(--color-primary)' : 'none',
              cursor: 'move',
              padding: 0,
              border: 'none',
              background:
                element.kind === 'text' || element.kind === 'image'
                  ? 'transparent'
                  : undefined,
            }}
          >
            {contenu(element)}
          </button>
        )
      })}
    </div>
  )
}
```

Importer `A4_WIDTH`/`A4_HEIGHT` depuis `types/pdfDesign.ts`.

Note sur le `<button>` : chaque élément est un bouton pour être atteignable au clavier et cliquable sans gestionnaire sur un `<div>` — ce que Biome refuse (`useKeyWithClickEvents`). Le `background` est remis à `undefined` pour les formes, sinon le bouton écraserait leur couleur de remplissage.

- [ ] **Step 4: Lancer les tests pour les voir passer**

```bash
cd front && npx vitest run src/components/custom/pdf-design/render-canvas.test.tsx && npx tsc -b
```

Attendu : PASS, 10 tests.

- [ ] **Step 5: Lint et commit**

```bash
cd front && npx biome check --write src/components/custom/pdf-design
git add front && git commit -m "feat(pdf): moteur de rendu HTML de la toile, a l'echelle"
```

---

### Task 6: L'éditeur — route, sélection de page, glisser-déposer, enregistrement

**Files:**
- Create: `front/src/routes/_authenticated/e/$establishmentId/s/$serviceId/_settings/pdf-patient.$designId.tsx`
- Create: `front/src/components/custom/pdf-design/editor/use-edition.ts`
- Create: `front/src/components/custom/pdf-design/editor/use-edition.test.ts`
- Create: `front/src/components/custom/pdf-design/editor/toile-editable.tsx`

**Interfaces:**
- Consumes: `geometrie.ts` (tâche 4), `CanvasPage`/`elementStyle` (tâche 5), `usePdfDesignQueries`/`usePdfDesignMutations` (tâche 2), `pagesOf` + `PDFViewer` pour l'aperçu.
- Produces: `useEdition(contenuInitial)` → `{ contenu, pagesEditables, pageCourante, choisirPage, selection, choisirElement, modifierElement, remplacerContenu, marquerEnregistre, modifie }` ; `<ToileEditable>` qui branche les pointer events sur `deplacer`/`redimensionner`/`aimanter`.

- [ ] **Step 1: Écrire les tests de l'état d'édition**

`use-edition.test.ts`. L'état est du JSON pur : il se teste sans DOM, avec `renderHook`.

```ts
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type { PdfDesignContent } from '../../../../types/pdfDesign.ts'
import { useEdition } from './use-edition.ts'

const CONTENU: PdfDesignContent = {
  version: 1,
  pages: [
    {
      kind: 'canvas',
      id: 'cover',
      background: '#ffffff',
      elements: [
        {
          id: 'titre',
          kind: 'rect',
          x: 10,
          y: 20,
          w: 100,
          h: 30,
          rotation: 0,
          fill: '#e05a5a',
          radius: 0,
        },
      ],
    },
    { kind: 'calendar', id: 'calendrier' },
    { kind: 'canvas', id: 'tips', background: '#ffffff', elements: [] },
  ],
}

describe('useEdition', () => {
  it('ouvre sur la premiere page composable, pas sur le calendrier', () => {
    const { result } = renderHook(() => useEdition(CONTENU))
    expect(result.current.pageCourante?.id).toBe('cover')
  })

  it('ne propose a l edition que les pages composables', () => {
    const { result } = renderHook(() => useEdition(CONTENU))
    expect(result.current.pagesEditables.map((p) => p.id)).toEqual([
      'cover',
      'tips',
    ])
  })

  it('change de page', () => {
    const { result } = renderHook(() => useEdition(CONTENU))
    act(() => result.current.choisirPage('tips'))
    expect(result.current.pageCourante?.id).toBe('tips')
  })

  it('deselectionne en changeant de page, sinon l inspecteur montre un element absent', () => {
    const { result } = renderHook(() => useEdition(CONTENU))
    act(() => result.current.choisirElement('titre'))
    act(() => result.current.choisirPage('tips'))
    expect(result.current.selection).toBeNull()
  })

  it('modifie un element de la page courante', () => {
    const { result } = renderHook(() => useEdition(CONTENU))
    act(() => result.current.modifierElement('titre', { x: 42 }))
    const page = result.current.contenu.pages[0]
    if (page.kind !== 'canvas') {
      throw new Error('forme inattendue')
    }
    expect(page.elements[0]).toMatchObject({ x: 42, y: 20 })
  })

  it('ne touche pas au contenu d origine', () => {
    const { result } = renderHook(() => useEdition(CONTENU))
    act(() => result.current.modifierElement('titre', { x: 42 }))
    const origine = CONTENU.pages[0]
    if (origine.kind !== 'canvas') {
      throw new Error('forme inattendue')
    }
    expect(origine.elements[0]?.x).toBe(10)
  })

  it('signale qu il y a des modifications non enregistrees', () => {
    const { result } = renderHook(() => useEdition(CONTENU))
    expect(result.current.modifie).toBe(false)
    act(() => result.current.modifierElement('titre', { x: 42 }))
    expect(result.current.modifie).toBe(true)
  })

  it('retombe a non modifie apres un enregistrement', () => {
    const { result } = renderHook(() => useEdition(CONTENU))
    act(() => result.current.modifierElement('titre', { x: 42 }))
    act(() => result.current.marquerEnregistre())
    expect(result.current.modifie).toBe(false)
  })
})
```

- [ ] **Step 2: Lancer les tests pour les voir échouer**

```bash
cd front && npx vitest run src/components/custom/pdf-design/editor/use-edition.test.ts
```

Attendu : ÉCHEC, module introuvable.

- [ ] **Step 3: Écrire l'état d'édition**

```ts
import { useCallback, useMemo, useState } from 'react'

import type {
  PdfCanvasPage,
  PdfDesignContent,
  PdfElement,
} from '../../../../types/pdfDesign.ts'

export function useEdition(contenuInitial: PdfDesignContent) {
  const [contenu, setContenu] = useState(contenuInitial)
  const [enregistre, setEnregistre] = useState(contenuInitial)
  const [pageId, setPageId] = useState<string | null>(null)
  const [selection, setSelection] = useState<string | null>(null)

  const pagesEditables = useMemo(
    () =>
      contenu.pages.filter((p): p is PdfCanvasPage => p.kind === 'canvas'),
    [contenu],
  )

  // Le calendrier n'est pas composable : l'editeur ouvre sur la premiere TOILE.
  const pageCourante =
    pagesEditables.find((p) => p.id === pageId) ?? pagesEditables[0] ?? null

  const choisirPage = useCallback((id: string) => {
    setPageId(id)
    // Une selection qui survit au changement de page ferait pointer l'inspecteur sur un
    // element absent de la toile affichee.
    setSelection(null)
  }, [])

  const modifierElement = useCallback(
    (elementId: string, champs: Partial<PdfElement>) => {
      setContenu((avant) => ({
        ...avant,
        pages: avant.pages.map((page) => {
          if (page.kind !== 'canvas' || page.id !== (pageCourante?.id ?? '')) {
            return page
          }
          return {
            ...page,
            elements: page.elements.map((e) =>
              e.id === elementId ? ({ ...e, ...champs } as PdfElement) : e,
            ),
          }
        }),
      }))
    },
    [pageCourante],
  )

  const remplacerContenu = useCallback((suivant: PdfDesignContent) => {
    setContenu(suivant)
  }, [])

  const marquerEnregistre = useCallback(() => {
    setEnregistre(contenu)
  }, [contenu])

  return {
    contenu,
    pagesEditables,
    pageCourante,
    choisirPage,
    selection,
    choisirElement: setSelection,
    modifierElement,
    remplacerContenu,
    marquerEnregistre,
    modifie: contenu !== enregistre,
  }
}
```

- [ ] **Step 4: Lancer les tests pour les voir passer**

```bash
cd front && npx vitest run src/components/custom/pdf-design/editor/use-edition.test.ts
```

Attendu : PASS, 8 tests.

- [ ] **Step 5: Écrire la toile éditable**

`toile-editable.tsx` branche les pointer events sur les trois fonctions de la tâche 4. `setPointerCapture` est ce qui fait qu'un glissement rapide ne « lâche » pas l'élément quand le curseur sort de sa boîte.

```tsx
// Pointer events natifs plutot qu'une bibliotheque : @dnd-kit vise les listes triables, et
// react-rnd se bat avec le facteur d'echelle — qui doit de toute facon diviser chaque delta.
const [geste, setGeste] = useState<{
  elementId: string
  poignee: Poignee | null
  depart: Boite
  xEcran: number
  yEcran: number
} | null>(null)

const onPointerDown = (
  evenement: React.PointerEvent,
  element: PdfElement,
  poignee: Poignee | null,
) => {
  evenement.preventDefault()
  evenement.stopPropagation()
  ;(evenement.target as Element).setPointerCapture(evenement.pointerId)
  setGeste({
    elementId: element.id,
    poignee,
    depart: { x: element.x, y: element.y, w: element.w, h: element.h },
    xEcran: evenement.clientX,
    yEcran: evenement.clientY,
  })
}

const onPointerMove = (evenement: React.PointerEvent) => {
  if (!geste) {
    return
  }
  const dx = evenement.clientX - geste.xEcran
  const dy = evenement.clientY - geste.yEcran
  const brut = geste.poignee
    ? redimensionner(geste.depart, geste.poignee, dx, dy, echelle)
    : deplacer(geste.depart, dx, dy, echelle)
  // On n'aimante que le deplacement : aimanter pendant un redimensionnement rendrait le
  // geste illisible (la boite sauterait pendant qu'on tire une poignee).
  const boite = geste.poignee ? brut : aimanter(brut, voisins)
  modifierElement(geste.elementId, boite)
}

const onPointerUp = () => setGeste(null)
```

Les huit poignées sont des carrés de 8 px posés en absolu sur l'élément sélectionné, chacun avec son `cursor` (`nwse-resize`, `ns-resize`…), rendus **par-dessus** `CanvasPage` plutôt que dedans : la toile reste un composant de rendu pur, réutilisable pour une vignette.

`voisins` = les boîtes des autres éléments de la page courante (`page.elements.filter(e => e.id !== geste.elementId)`).

- [ ] **Step 6: Écrire la route de l'éditeur**

`pdf-patient.$designId.tsx`. Garde de route `referentials:write`, comme la liste.

Structure : une barre haute (retour, nom du design, « Aperçu PDF », « Enregistrer »), une colonne gauche pour la palette (tâche 7), la toile au centre, l'inspecteur à droite (tâche 7), et une bande de pages en bas si le design en a plus d'une.

L'échelle se calcule de la largeur disponible : `echelle = largeurDuCadre / A4_WIDTH`, mesurée par un `ResizeObserver` sur le conteneur, plafonnée à 1 (on n'agrandit pas au-delà de la taille réelle).

La bascule « Aperçu PDF » remplace la toile par le vrai `PDFViewer` monté sur `pagesOf(contenu, ctxEchantillon, calendrierVide)` — c'est la réponse à l'écart de métriques entre les deux moteurs. `ctxEchantillon` reprend `SAMPLE_FIELD_VALUES` : l'éditeur ne montre jamais un vrai patient.

L'enregistrement appelle `saveContent.mutate({ id, content })` puis `marquerEnregistre()`.

**Review Focus 4 — l'écrasement silencieux.** Rien ne verrouille : si un second onglet a enregistré entre-temps, le `PATCH` écrase sans le dire. Poser le constat visiblement dans le fichier :

```tsx
// LIMITE ASSUMEE : aucun verrou optimiste. Deux onglets ouverts sur le meme design, et le
// dernier a enregistrer ecrase l'autre sans que rien ne le signale. Un `updatedAt` renvoye
// par le GET et compare au PATCH fermerait le cas ; ce n'est pas au perimetre de l'etape 2.
// Ce qui limite les degats en attendant : un design appartient a un service, et son edition
// est rare.
```

Et un garde-fou de sortie, lui, est au périmètre : prévenir avant de quitter avec des modifications non enregistrées.

```tsx
useEffect(() => {
  if (!modifie) {
    return
  }
  const prevenir = (e: BeforeUnloadEvent) => e.preventDefault()
  addEventListener('beforeunload', prevenir)
  return () => removeEventListener('beforeunload', prevenir)
}, [modifie])
```

- [ ] **Step 7: Vérifier à l'écran**

Dupliquer un preset, cliquer « Modifier ». Vérifier : la couverture s'affiche à l'échelle, un clic sélectionne un élément, un glissement le déplace, les huit poignées redimensionnent, l'aimantation accroche aux bords et au centre, la bande de pages bascule entre la couverture et les conseils (le calendrier n'y figure pas), « Aperçu PDF » rend le vrai document, « Enregistrer » persiste et un rechargement montre le résultat.

- [ ] **Step 8: Typecheck, suite, lint, commit**

```bash
cd front && npx tsc -b && npx vitest run && npx biome check --write src
git add front && git commit -m "feat(pdf): editeur de design, toile a l'echelle et enregistrement"
```

---

### Task 7: La palette et l'inspecteur

**Files:**
- Create: `front/src/components/custom/pdf-design/editor/palette.tsx`
- Create: `front/src/components/custom/pdf-design/editor/inspecteur.tsx`
- Create: `front/src/components/custom/pdf-design/editor/elements.ts`
- Create: `front/src/components/custom/pdf-design/editor/elements.test.ts`
- Modify: la route de l'éditeur

**Interfaces:**
- Produces: `nouvelElement(kind)` → `PdfElement` posé au centre de la page ; `<Palette onAjouter>` ; `<Inspecteur element onModifier onSupprimer onDupliquer onOrdre>`.

- [ ] **Step 1: Écrire les tests de `elements.ts`**

```ts
import { describe, expect, it } from 'vitest'

import { A4_WIDTH } from '../../../../types/pdfDesign.ts'
import { dupliquerElement, nouvelElement } from './elements.ts'

describe('nouvelElement', () => {
  it('pose un texte au centre horizontal de la page', () => {
    const e = nouvelElement('text')
    expect(e.x + e.w / 2).toBeCloseTo(A4_WIDTH / 2, 5)
  })

  it('donne un identifiant unique a chaque appel', () => {
    expect(nouvelElement('text').id).not.toBe(nouvelElement('text').id)
  })

  it('cree un texte avec un run lisible, jamais vide', () => {
    const e = nouvelElement('text')
    if (e.kind !== 'text') {
      throw new Error('forme inattendue')
    }
    // Le schema refuse `runs: []`, et un texte vide serait invisible sur la toile.
    expect(e.runs.length).toBeGreaterThan(0)
  })

  it('cree un rect avec un rayon nul, que le moteur sait ne pas emettre', () => {
    const e = nouvelElement('rect')
    if (e.kind !== 'rect') {
      throw new Error('forme inattendue')
    }
    expect(e.radius).toBe(0)
  })
})

describe('dupliquerElement', () => {
  it('decale la copie pour qu elle ne se cache pas sous l original', () => {
    const original = nouvelElement('rect')
    const copie = dupliquerElement(original)
    expect(copie.x).toBe(original.x + 10)
    expect(copie.y).toBe(original.y + 10)
  })

  it('donne un identifiant neuf a la copie', () => {
    const original = nouvelElement('rect')
    expect(dupliquerElement(original).id).not.toBe(original.id)
  })
})
```

- [ ] **Step 2: Les voir échouer, puis écrire `elements.ts`**

```bash
cd front && npx vitest run src/components/custom/pdf-design/editor/elements.test.ts
```

Chaque fabrique rend un élément **complet**, dans la forme d'après défauts que le front manipule (`rotation`, `bold`, `italic`, `align`, `vAlign`, `radius`, `fit` renseignés) — le back validera à l'enregistrement.

Identifiant : `crypto.randomUUID()`, disponible en jsdom comme dans le navigateur.

- [ ] **Step 3: Écrire la palette**

Quatre boutons — Texte, Rectangle, Ellipse, Image — qui appellent `onAjouter(kind)`. L'élément apparaît au centre de la page et devient la sélection courante.

Pour l'image, la seule source disponible à l'étape 2 est `builtin` : un petit choix entre « Logo » et « Lignes ». Les images déposées par le service arrivent à l'étape 4.

- [ ] **Step 4: Écrire l'inspecteur**

Un panneau qui montre les propriétés de l'élément sélectionné, et rien quand il n'y en a pas (« Sélectionnez un élément »).

Communes : `x`, `y`, `w`, `h`, `rotation` en champs numériques.

Par type :
- **text** — les runs (texte libre, et un bouton « Insérer une donnée » qui ajoute un run de donnée parmi `PDF_FIELD_KEYS`), `fontSize`, `bold`, `italic`, `color`, `align`, `vAlign`, `lineHeight`.
- **rect** — `fill`, `radius`. **ellipse** — `fill`. Le remplissage propose une couleur fixe **ou** « couleur du parcours » avec son repli, qui est le seul moyen d'obtenir le rond coloré de la couverture.
- **image** — la source parmi les images livrées, et `fit`.

Le sélecteur de police ne propose **que** Helvetica : aucun `Font.register` n'existe dans le dépôt, en proposer d'autres mentirait.

Plus trois actions : Dupliquer, Supprimer, et l'ordre de peinture (Premier plan / Arrière-plan) — l'ordre dans le tableau **est** l'ordre de peinture, donc ces deux boutons déplacent l'élément dans `page.elements`.

**Review Focus 5 — un élément hors de la page.** L'inspecteur accepte des coordonnées négatives et au-delà d'A4 : c'est ainsi qu'on obtient le décor qui déborde. Ajouter le test qui prouve que le rendu PDF le supporte, dans `render-pdf.rendu.test.tsx` (le fichier existe depuis l'étape 1) :

```tsx
  // Un service peut desormais poser a la main un element qui deborde sous la page. C'est
  // exactement la forme qui faisait boucler react-pdf sans fin avant `anchor()`.
  it('rend un element pose a la main sous le bas de la page', async () => {
    const debordant: PdfElement = {
      id: 'deborde',
      kind: 'rect',
      x: 300,
      y: A4_HEIGHT - 20,
      w: 200,
      h: 400,
      rotation: 0,
      fill: '#e05a5a',
      radius: 0,
    }
    await expect(rendre([debordant, texte({})])).resolves.toContain('Bonjour')
  }, 30000)
```

- [ ] **Step 5: Tests, typecheck, lint, commit**

```bash
cd front && npx vitest run src/components/custom/pdf-design && npx tsc -b && npx biome check --write src/components/custom/pdf-design
git add front && git commit -m "feat(pdf): palette et inspecteur de l'editeur"
```

---

### Task 8: Annuler, rétablir, et les raccourcis

**Files:**
- Create: `front/src/components/custom/pdf-design/editor/use-historique.ts`
- Create: `front/src/components/custom/pdf-design/editor/use-historique.test.ts`
- Modify: `use-edition.ts` et la route de l'éditeur

**Interfaces:**
- Produces: `useHistorique(contenu, remplacerContenu)` → `{ pousser, annuler, retablir, peutAnnuler, peutRetablir }`.

- [ ] **Step 1: Écrire les tests**

```ts
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { PdfDesignContent } from '../../../../types/pdfDesign.ts'
import { LIMITE, useHistorique } from './use-historique.ts'

const etat = (marque: number): PdfDesignContent => ({
  version: 1,
  pages: [
    { kind: 'canvas', id: `p${marque}`, background: '#ffffff', elements: [] },
  ],
})

// `remplacerContenu` est la seule sortie de l'historique : on l'espionne plutot que de
// remonter tout l'editeur.
const monter = () => {
  const remplacer = vi.fn()
  const rendu = renderHook(() => useHistorique(remplacer))
  return { ...rendu, remplacer }
}

describe('useHistorique', () => {
  it('ne peut rien annuler au depart', () => {
    const { result } = monter()
    expect(result.current.peutAnnuler).toBe(false)
    expect(result.current.peutRetablir).toBe(false)
  })

  it('annule le dernier changement pousse', () => {
    const { result, remplacer } = monter()
    act(() => result.current.pousser(etat(1)))
    act(() => result.current.pousser(etat(2)))
    act(() => result.current.annuler())
    expect(remplacer).toHaveBeenLastCalledWith(etat(1))
  })

  it('retablit ce qui vient d etre annule', () => {
    const { result, remplacer } = monter()
    act(() => result.current.pousser(etat(1)))
    act(() => result.current.pousser(etat(2)))
    act(() => result.current.annuler())
    act(() => result.current.retablir())
    expect(remplacer).toHaveBeenLastCalledWith(etat(2))
  })

  // Sans cet oubli, « Retablir » ramenerait un etat qui n'a jamais suivi celui qu'on voit.
  it('oublie le futur des qu un nouveau changement est pousse', () => {
    const { result } = monter()
    act(() => result.current.pousser(etat(1)))
    act(() => result.current.pousser(etat(2)))
    act(() => result.current.annuler())
    act(() => result.current.pousser(etat(3)))
    expect(result.current.peutRetablir).toBe(false)
  })

  it('plafonne la pile et laisse tomber le plus ancien', () => {
    const { result, remplacer } = monter()
    for (let i = 0; i <= LIMITE + 5; i += 1) {
      act(() => result.current.pousser(etat(i)))
    }
    // On remonte toute la pile : le plus ancien atteignable n'est pas etat(0).
    for (let i = 0; i <= LIMITE + 5; i += 1) {
      act(() => result.current.annuler())
    }
    expect(remplacer).not.toHaveBeenCalledWith(etat(0))
    expect(result.current.peutAnnuler).toBe(false)
  })
})
```

- [ ] **Step 2: Écrire l'historique**

Une pile d'**instantanés** du JSON, pas de patches inversibles : le document est petit (quelques dizaines d'éléments), et un instantané ne peut pas diverger de l'état réel, là où un patch mal écrit le peut en silence. Plafond à 50 entrées.

```ts
// `ponytail:` plafond assume — pile d'instantanes bornee a 50. Si un design grossit au point
// que la memoire gene, passer aux patches inversibles ; pas avant.
const LIMITE = 50
```

- [ ] **Step 3: Brancher les raccourcis**

Sur le conteneur de l'éditeur, en `onKeyDown` :

- **Flèches** : déplacent la sélection d'1 pt, **Maj + flèches** de 10 pt.
- **Suppr / Retour arrière** : supprime la sélection.
- **Cmd/Ctrl + Z** : annuler. **Cmd/Ctrl + Maj + Z** : rétablir.
- **Échap** : désélectionne.

Garde-fou : ne rien faire si la cible de l'événement est un champ de saisie (`input`, `textarea`), sinon taper « z » dans l'inspecteur annulerait le geste précédent.

```ts
const dansUnChamp = (cible: EventTarget | null) =>
  cible instanceof HTMLElement &&
  ['INPUT', 'TEXTAREA', 'SELECT'].includes(cible.tagName)
```

- [ ] **Step 4: Tests, typecheck, lint, commit**

```bash
cd front && npx vitest run src/components/custom/pdf-design && npx tsc -b && npx biome check --write src/components/custom/pdf-design
git add front && git commit -m "feat(pdf): annuler, retablir et raccourcis de l'editeur"
```

---

### Task 9: Vérification à l'écran et cas limites

Aucun test ne remplace cette tâche : l'éditeur est une affaire de gestes.

- [ ] **Step 1: Le parcours complet**

Dupliquer « Programme SMCV », l'ouvrir, et à la souris : sélectionner le titre, le déplacer, le redimensionner par chacune des huit poignées, vérifier que l'aimantation accroche aux bords et aux axes, changer sa couleur et sa taille dans l'inspecteur, ajouter un texte, y insérer la donnée « nom du patient », dupliquer un élément, le passer en arrière-plan, en supprimer un, annuler trois fois, rétablir deux fois, basculer sur la page conseils, revenir, enregistrer.

- [ ] **Step 2: Comparer l'aperçu au vrai PDF**

Basculer « Aperçu PDF » et comparer à la toile. Les positions doivent coïncider ; seules les coupures de ligne peuvent différer, c'est l'écart de métriques assumé par la spec. Si une **position** diverge, c'est un défaut : les deux moteurs lisent le même JSON et appliquent un seul facteur d'échelle.

- [ ] **Step 3: Les cas limites**

- Un élément traîné **hors de la page**, par le bas : enregistrer, puis générer le PDF d'un patient. Il doit sortir, pas pendre. (C'est `anchor()` qui tient ; sans lui react-pdf boucle sans fin.)
- Un texte **rallongé** jusqu'à déborder de sa boîte : il doit pousser, pas être tronqué.
- Un design **sans aucun élément** sur une page : la page doit rester blanche, pas disparaître.
- **Deux onglets** sur le même design : enregistrer dans l'un puis dans l'autre. Le second écrase — c'est la limite nommée en tâche 6 ; vérifier au moins qu'aucune erreur ne s'affiche et que le contenu enregistré est cohérent.
- Le design **par défaut supprimé** : la modale du programme doit retomber sur un preset et produire un PDF.

- [ ] **Step 4: Toutes les suites, graphe, commit**

```bash
cd back && npx tsc --noEmit -p src/main/tsconfig.json && npm run lint && npx jest -c src/test/jest.config.ts --selectProjects unit && npm run test:e2e
cd front && npx tsc -b && npx vitest run && npm run lint
cd .. && graphify update .
git add -A && git commit -m "feat(pdf): etape 2 verifiee a l'ecran"
```

---

## Ce que l'étape 2 ne fait pas

Nommé ici pour qu'aucun de ces manques ne passe pour un oubli :

- **Ajouter, supprimer ou réordonner des pages** — étape 3. L'éditeur ne montre que les pages existantes du design.
- **Déposer ses propres images** — étape 4. Seules les deux images livrées sont disponibles.
- **L'écran super-admin des presets** — étape 5. Un preset ne se crée et ne se modifie qu'en base d'ici là.
- **Dupliquer un design du service** (et non un preset) — la route n'accepte qu'un `sourcePresetId`.
- **Un verrou optimiste à l'enregistrement** — deux onglets, le dernier gagne.
- **Une vignette du design sur les cartes** — la liste montre le nom et le nombre de pages ; `render-canvas` rendrait une vraie vignette, à brancher quand l'envie viendra.
