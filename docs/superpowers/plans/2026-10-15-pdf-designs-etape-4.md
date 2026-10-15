# PDF patient, étape 4 — les images du service

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un service dépose ses propres images — son logo, un fond de page — et les pose dans un design comme il pose déjà le logo livré.

**Architecture:** Une table `PdfAsset` (modèle de service) qui porte les octets, deux routes d'écriture et deux de lecture, et un front qui ne passe **jamais** par une URL dans `<Image src>` : il lit l'asset par `fetchWithAuth`, construit une data URI et la donne aux deux moteurs de rendu. L'indirection par `assetId` existe depuis l'étape 1 dans le schéma de contenu — cette étape la remplit, sans toucher aux designs.

**Tech Stack:** Prisma (colonne `Bytes`), Zod v4, Fastify, jest côté back ; React 19, TanStack Query, vitest côté front. Aucune dépendance nouvelle — pas de `@fastify/multipart`, l'upload est du base64 en JSON.

**Spec:** `docs/superpowers/specs/2026-10-14-pdf-patient-designs-design.md` (§ « Images et upload », § « Routes », et le modèle `PdfAsset` du § schéma)

## Global Constraints

- **Jamais d'URL dans `<Image src>`.** Ni react-pdf ni `<img>` ne garantissent d'emporter le cookie d'authentification sur une sous-ressource cross-site, et en développement le front et le back sont sur deux ports. Le front récupère `{ mimeType, base64 }` et construit la data URI.
- **Pas de multipart.** `FileReader` côté front, base64 en JSON, borne déclarée par `.max()` dans Zod.
- **2 Mo d'image maximum**, soit ~2,7 Mo de JSON : `bodyLimit` de Fastify vaut **1 Mo par défaut** et doit être relevé sur la route d'upload, sinon le refus vient de Fastify avec un message qui ne dit rien à l'utilisateur. Choix tranché avec le propriétaire du produit.
- **La suppression est refusée (409) tant qu'un design référence l'image**, et la réponse nomme les designs concernés. Motif déjà présent dans le dépôt (`deleteForever` des salles).
- **Une liste des images du service** (`GET /pdf-assets`, sans les octets) nourrit l'inspecteur, à côté des deux images livrées.
- `PdfAsset` est un **modèle de service** : il va dans `SERVICE_MODELS`, dans `MODEL_RELATIONS` avec sa cardinalité, et reçoit un cas dans `isolation.test.ts` — c'est l'étape 8 de « Adding a new entity » (`back/CLAUDE.md`), et le plan de l'étape 3 l'avait oubliée pour `PdfDesign`.
- **Biome, jamais ESLint ni Prettier.** Jamais de `biome-ignore`. Commentaires synthétiques.
- Le libellé d'une suppression dans l'UI est « Supprimer », jamais « Archiver ».

## Review Focus

Cinq classes d'entrée que la spec implique et qu'aucune tâche n'exerce spontanément.

1. **Un fichier plus gros que la borne.** Le refus doit venir de l'application et nommer la limite, pas du plafond de corps de Fastify qui répond un 413 opaque. → Tâches 1 et 2.
2. **Un base64 qui n'est pas une image** (un PDF renommé, du texte, un base64 tronqué). Le `mimeType` est déclaré par le client : il ne prouve rien. → Tâche 2.
3. **Supprimer une image qu'un design utilise.** 409 qui nomme les designs, et l'image reste en base — sinon un design perd son fond sans que personne ne l'ait demandé. → Tâche 3.
4. **Un design qui référence un `assetId` disparu** (supprimé en base à la main, ou importé d'un autre service). Le PDF doit sortir sans cette image, pas échouer ni pendre — c'est la même exigence que le `kind` inconnu de l'étape 1. → Tâche 5.
5. **Une image d'un AUTRE service.** Son `assetId` dans un design ne doit rien rendre, et la route de lecture doit répondre 404 — le cloisonnement vaut pour les octets comme pour les lignes. → Tâches 1 et 6.

---

### Task 1: La table `PdfAsset`, le garde-fou de tenant, l'isolation

**Files:**
- Modify: `back/prisma/schema.prisma`
- Create: `back/prisma/migrations/<timestamp>_pdf_assets/migration.sql` (généré)
- Modify: `back/src/main/infra/orm/tenant-guard.ts`
- Test: `back/src/test/unit/infra/tenant-guard-schema.test.ts` (tourne déjà, doit rester vert)
- Test: `back/src/test/e2e/isolation.test.ts`

**Interfaces:**
- Produces: le modèle Prisma `PdfAsset` et son entrée dans `SERVICE_MODELS` / `MODEL_RELATIONS`. Toutes les tâches back s'appuient dessus.

- [ ] **Step 1: Ajouter le modèle au schéma**

Dans `back/prisma/schema.prisma`, après `model PdfDesign`, exactement la forme de la spec :

```prisma
model PdfAsset {
  id              String   @id @default(cuid())
  establishmentId String
  serviceId       String
  fileName        String
  mimeType        String
  bytes           Bytes
  createdAt       DateTime @default(now())

  service Service @relation(fields: [serviceId, establishmentId], references: [id, establishmentId])

  @@unique([id, serviceId])
  @@index([serviceId])
}
```

Et la relation inverse dans `model Service`, à côté de `pdfDesigns` :

```prisma
  pdfAssets    PdfAsset[]
```

- [ ] **Step 2: Créer et appliquer la migration**

```bash
cd back && npm run prisma:migrate:dev -- --name pdf_assets
cd back && npm run prisma:generate
```

Attendu : une migration créée et appliquée, le client régénéré dans `src/generated/`. Si `prisma:migrate:dev` demande une réinitialisation, **s'arrêter et le signaler** : une base de développement qui dérive est une question pour le propriétaire, pas une décision d'implémentation.

- [ ] **Step 3: Déclarer le modèle au garde-fou de tenant**

Sans cela le garde refuse **toute** requête sur la table — c'est voulu, il échoue fermé. Dans `back/src/main/infra/orm/tenant-guard.ts` :

```ts
// dans SERVICE_MODELS, après 'PdfDesign'
  'PdfAsset',
```

```ts
// dans MODEL_RELATIONS, après l'entrée PdfDesign
  PdfAsset: {
    service: one('Service'),
  },
```

```ts
// dans MODEL_RELATIONS.Service, à côté de pdfDesigns
    pdfAssets: many('PdfAsset'),
```

- [ ] **Step 4: Lancer les tests du garde-fou**

```bash
cd back && NODE_OPTIONS=--experimental-vm-modules npx -y dotenv-cli@7.3.0 -e .env.test.local -e .env.test -- npx jest --runInBand -c src/test/jest.config.ts src/test/unit/infra
```

Attendu : vert. `tenant-guard-schema.test.ts` compare `MODEL_RELATIONS` au schéma Prisma **dans les deux sens** : un modèle ajouté sans entrée, ou une cardinalité fausse, le fait rougir. S'il rougit, c'est la déclaration de l'étape 3 qu'il faut lire, pas le test.

- [ ] **Step 5: Écrire le cas d'isolation**

Dans `back/src/test/e2e/isolation.test.ts`, dans le `describe('isolation entre services (meme etablissement)')`, après le cas des designs de PDF :

```ts
    // PdfAsset (etape 4). Les octets d'un service ne sortent pas plus que ses lignes : la
    // lecture par identifiant est la seule route qui les rend, c'est donc elle qu'on sonde.
    it('une image d un autre service ne se lit ni ne se supprime', async () => {
      const { est, serviceA, serviceB, cookiesA, cookiesB } = scenario
      const etrangere = await testDb.pdfAsset.create({
        data: {
          fileName: 'secret-b.png',
          mimeType: 'image/png',
          bytes: Buffer.from('octets-de-b'),
          establishmentId: est.id,
          serviceId: serviceB.id,
        },
      })

      const chemin = `/pdf-assets/${etrangere.id}`
      const lectureDepuisA = await t.app.inject({
        method: 'GET',
        url: tenantUrl(est.id, serviceA.id, chemin),
        cookies: cookiesA,
      })
      expect(lectureDepuisA.statusCode).toBe(404)

      const suppressionDepuisA = await t.app.inject({
        method: 'DELETE',
        url: tenantUrl(est.id, serviceA.id, chemin),
        cookies: cookiesA,
      })
      expect(suppressionDepuisA.statusCode).toBe(404)

      // La liste de A ne la nomme pas non plus.
      const listeDepuisA = await t.app.inject({
        method: 'GET',
        url: tenantUrl(est.id, serviceA.id, '/pdf-assets'),
        cookies: cookiesA,
      })
      expect(
        (listeDepuisA.json() as { id: string }[]).map((a) => a.id),
      ).not.toContain(etrangere.id)

      // Contrepoint : son proprietaire la lit toujours.
      const lectureDepuisB = await t.app.inject({
        method: 'GET',
        url: tenantUrl(est.id, serviceB.id, chemin),
        cookies: cookiesB,
      })
      expect(lectureDepuisB.statusCode).toBe(200)
      expect(lectureDepuisB.json().mimeType).toBe('image/png')
    })
```

- [ ] **Step 6: Lancer le test pour le voir échouer**

```bash
cd back && NODE_OPTIONS=--experimental-vm-modules npx -y dotenv-cli@7.3.0 -e .env.test.local -e .env.test -- npx jest --runInBand -c src/test/jest.config.ts src/test/e2e/isolation.test.ts
```

Attendu : ÉCHEC — les routes n'existent pas, les trois requêtes répondent 404 par absence de route et non par cloisonnement, et le contrepoint depuis B échoue (404 au lieu de 200). **C'est ce contrepoint qui distingue les deux causes** : il passera au vert en tâche 2, et les trois autres resteront 404 pour la bonne raison.

- [ ] **Step 7: Commit**

```bash
cd back && npx biome check --write src prisma
git add back && git commit -m "feat(pdf): table PdfAsset et son garde-fou de tenant"
```

---

### Task 2: Les routes de dépôt et de lecture

**Files:**
- Create: `back/src/main/interfaces/http/fastify/schemas/pdf-asset.schema.ts`
- Create: `back/src/main/interfaces/http/fastify/routes/pdfAsset.ts`
- Create: `back/src/main/domain/pdf-asset.domain.ts`
- Create: `back/src/main/types/domain/pdf-asset.domain.interface.ts`
- Create: `back/src/main/infra/orm/repositories/pdf-asset.repository.ts`
- Create: `back/src/main/types/infra/orm/repositories/pdf-asset.repository.interface.ts`
- Modify: `back/src/main/application/ioc/awilix/awilix-ioc-container.ts`
- Modify: `back/src/main/types/application/ioc.ts`
- Modify: `back/src/main/interfaces/http/fastify/routes/tenant.routes.ts`
- Create: `back/src/test/e2e/pdf-asset.test.ts`

**Interfaces:**
- Consumes: `PdfAsset` (tâche 1).
- Produces: `POST /pdf-assets` → `{ id, fileName, mimeType }`, `GET /pdf-assets` → `{ id, fileName, mimeType }[]`, `GET /pdf-assets/:assetID` → `{ mimeType, base64 }`. `PdfAssetDomain.create/findAllForService/findByID`.

- [ ] **Step 1: Écrire les tests qui échouent**

`back/src/test/e2e/pdf-asset.test.ts`. Reprendre le harnais de `pdf-design.test.ts` (même `buildTestApp`, même `twoServicesScenario`).

```ts
import type { FastifyInstance } from 'fastify'

import { buildTestApp } from './setup/app'
import { testDb, truncateAll } from './setup/db'
import { tenantUrl, twoServicesScenario } from './setup/fixtures'

// Un PNG 1x1 valide, le plus petit qui existe : les octets comptent, le nom non.
const PNG_1x1 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

describe('routes des images de PDF', () => {
  let app: FastifyInstance
  let close: () => Promise<void>
  let scenario: Awaited<ReturnType<typeof twoServicesScenario>>

  beforeAll(async () => {
    await truncateAll()
    const built = await buildTestApp()
    app = built.app
    close = built.close
    scenario = await twoServicesScenario(app)
  })

  afterAll(async () => {
    await close()
    await testDb.$disconnect()
  })

  const deposer = (corps: Record<string, unknown>) =>
    app.inject({
      method: 'POST',
      url: tenantUrl(scenario.est.id, scenario.serviceA.id, '/pdf-assets'),
      cookies: scenario.cookiesA,
      payload: corps,
    })

  const lire = (id: string) =>
    app.inject({
      method: 'GET',
      url: tenantUrl(
        scenario.est.id,
        scenario.serviceA.id,
        `/pdf-assets/${id}`,
      ),
      cookies: scenario.cookiesA,
    })

  it('depose une image et la rend par son identifiant', async () => {
    const depot = await deposer({
      fileName: 'logo.png',
      mimeType: 'image/png',
      base64: PNG_1x1,
    })

    expect(depot.statusCode).toBe(201)
    expect(depot.json()).toMatchObject({
      fileName: 'logo.png',
      mimeType: 'image/png',
    })
    // Le depot ne renvoie PAS les octets : le front les demande ensuite, et react-query les
    // met en cache par identifiant.
    expect(depot.json().base64).toBeUndefined()

    const relecture = await lire(depot.json().id)
    expect(relecture.statusCode).toBe(200)
    expect(relecture.json()).toEqual({
      mimeType: 'image/png',
      base64: PNG_1x1,
    })
  })

  it('liste les images du service sans leurs octets', async () => {
    const res = await app.inject({
      method: 'GET',
      url: tenantUrl(scenario.est.id, scenario.serviceA.id, '/pdf-assets'),
      cookies: scenario.cookiesA,
    })

    expect(res.statusCode).toBe(200)
    const liste = res.json() as Record<string, unknown>[]
    expect(liste.length).toBeGreaterThan(0)
    expect(liste[0]).toMatchObject({ fileName: 'logo.png' })
    // Une liste qui porterait les octets ferait transiter toute la bibliotheque a chaque
    // ouverture de l'inspecteur.
    expect(liste[0]?.base64).toBeUndefined()
    expect(liste[0]?.bytes).toBeUndefined()
  })

  it('rend 404 sur un identifiant inconnu', async () => {
    const res = await lire('cmv0000000000000000000000')
    expect(res.statusCode).toBe(404)
  })

  // Review Focus 2 : le `mimeType` est DECLARE par le client, il ne prouve rien. Ce qui fait
  // foi, ce sont les octets.
  it('refuse un type qui n est pas une image', async () => {
    const res = await deposer({
      fileName: 'piege.pdf',
      mimeType: 'application/pdf',
      base64: PNG_1x1,
    })
    expect(res.statusCode).toBe(400)
  })

  it('refuse un base64 qui n est pas du base64', async () => {
    const res = await deposer({
      fileName: 'casse.png',
      mimeType: 'image/png',
      base64: 'ceci n est pas du base64 !!',
    })
    expect(res.statusCode).toBe(400)
  })

  it('refuse un base64 vide', async () => {
    const res = await deposer({
      fileName: 'vide.png',
      mimeType: 'image/png',
      base64: '',
    })
    expect(res.statusCode).toBe(400)
  })

  // Review Focus 1 : le refus doit venir de l'application et nommer la limite, pas du plafond
  // de corps de Fastify qui repondrait un 413 sans explication.
  it('refuse une image plus grosse que la borne, avec un message qui la nomme', async () => {
    // 2 Mo d'image font ~2,73 Mo de base64 : on depasse d'un megaoctet pour etre net.
    const trop = 'A'.repeat(4 * 1024 * 1024)
    const res = await deposer({
      fileName: 'enorme.png',
      mimeType: 'image/png',
      base64: trop,
    })

    expect(res.statusCode).toBe(400)
    expect(JSON.stringify(res.json())).toMatch(/2\s?Mo|2097152/)
  })
})
```

- [ ] **Step 2: Lancer les tests pour les voir échouer**

```bash
cd back && NODE_OPTIONS=--experimental-vm-modules npx -y dotenv-cli@7.3.0 -e .env.test.local -e .env.test -- npx jest --runInBand -c src/test/jest.config.ts src/test/e2e/pdf-asset.test.ts
```

Attendu : ÉCHEC des sept cas — les routes n'existent pas (404 partout).

- [ ] **Step 3: Écrire le schéma**

`back/src/main/interfaces/http/fastify/schemas/pdf-asset.schema.ts` :

```ts
import { z } from 'zod/v4'

// 2 Mo d'image. Le base64 gonfle d'un tiers, d'ou la borne en caracteres plus bas : c'est
// elle que Zod verifie, et c'est elle qui doit nommer la limite a l'utilisateur.
export const TAILLE_MAXIMALE_OCTETS = 2 * 1024 * 1024
const TAILLE_MAXIMALE_BASE64 = Math.ceil((TAILLE_MAXIMALE_OCTETS * 4) / 3)

// Les seuls types que les deux moteurs savent rendre. Le `mimeType` est DECLARE par le
// client : cette liste borne ce qu'on accepte de stocker, la signature des octets (domaine)
// verifie que la declaration dit vrai.
export const TYPES_IMAGE = ['image/png', 'image/jpeg', 'image/webp'] as const

export const createPdfAssetSchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  mimeType: z.enum(TYPES_IMAGE),
  base64: z
    .string()
    .min(1)
    .max(TAILLE_MAXIMALE_BASE64, {
      message: 'Cette image dépasse la taille maximale de 2 Mo',
    })
    .regex(/^[A-Za-z0-9+/]+={0,2}$/, {
      message: "Ce fichier n'a pas pu être lu comme une image",
    }),
})

export const pdfAssetSummarySchema = z.object({
  id: z.cuid(),
  fileName: z.string(),
  mimeType: z.string(),
})

export const pdfAssetListResponseSchema = z.array(pdfAssetSummarySchema)

export const pdfAssetBytesResponseSchema = z.object({
  mimeType: z.string(),
  base64: z.string(),
})

export const pdfAssetIdParamsSchema = z.object({ assetID: z.cuid() })

export type CreatePdfAssetBody = z.infer<typeof createPdfAssetSchema>
export type PdfAssetIdParams = z.infer<typeof pdfAssetIdParamsSchema>
```

- [ ] **Step 4: Écrire le repository**

`back/src/main/types/infra/orm/repositories/pdf-asset.repository.interface.ts` :

```ts
import type { PdfAsset } from '../../../../../generated/client'

export type PdfAssetEntityRepo = PdfAsset

export type PdfAssetCreateEntityRepo = {
  fileName: string
  mimeType: string
  bytes: Buffer
}

export interface PdfAssetRepositoryInterface {
  create: (params: PdfAssetCreateEntityRepo) => Promise<PdfAssetEntityRepo>
  // Sans les octets : la liste nourrit un selecteur, pas un rendu.
  findAllForService: () => Promise<
    Pick<PdfAsset, 'id' | 'fileName' | 'mimeType'>[]
  >
  findByID: (assetID: string) => Promise<PdfAssetEntityRepo | null>
}
```

`back/src/main/infra/orm/repositories/pdf-asset.repository.ts` — décalqué de `pdf-design.repository.ts`, `scope()` lu **par méthode** :

```ts
import type { IocContainer } from '../../../types/application/ioc'
import type {
  PdfAssetCreateEntityRepo,
  PdfAssetEntityRepo,
  PdfAssetRepositoryInterface,
} from '../../../types/infra/orm/repositories/pdf-asset.repository.interface'
import type { ErrorHandlerInterface } from '../../../types/utils/error-handler'
import type { TenantContextInterface } from '../../../types/utils/tenant-context'
import type { PostgresPrismaClient } from '../postgres-client'

class PdfAssetRepository implements PdfAssetRepositoryInterface {
  private readonly prisma: PostgresPrismaClient
  private readonly errorHandler: ErrorHandlerInterface
  private readonly tenantContext: TenantContextInterface

  constructor({ postgresOrm, errorHandler, tenantContext }: IocContainer) {
    this.prisma = postgresOrm.prisma
    this.errorHandler = errorHandler
    this.tenantContext = tenantContext
  }

  // `scope()` par methode, jamais a la construction : il leve hors d'un contexte de service.
  private get scope() {
    return this.tenantContext.scope()
  }

  async create(
    params: PdfAssetCreateEntityRepo,
  ): Promise<PdfAssetEntityRepo> {
    try {
      return await this.prisma.pdfAsset.create({
        data: { ...this.scope, ...params },
      })
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({
        entityName: 'PdfAsset',
        error: err,
      })
    }
  }

  // `select` sans `bytes` : une liste qui les porterait ferait transiter toute la
  // bibliotheque a chaque ouverture de l'inspecteur.
  findAllForService() {
    return this.prisma.pdfAsset.findMany({
      where: this.scope,
      select: { id: true, fileName: true, mimeType: true },
      orderBy: { createdAt: 'desc' },
    })
  }

  findByID(assetID: string): Promise<PdfAssetEntityRepo | null> {
    const scope = this.scope
    return this.prisma.pdfAsset.findUnique({
      where: { id_serviceId: { id: assetID, serviceId: scope.serviceId } },
    })
  }
}

export { PdfAssetRepository }
```

- [ ] **Step 5: Écrire le domaine**

`back/src/main/types/domain/pdf-asset.domain.interface.ts` :

```ts
export type PdfAssetSummaryDomain = {
  id: string
  fileName: string
  mimeType: string
}

export type PdfAssetBytesDomain = {
  mimeType: string
  base64: string
}

export type PdfAssetCreateDomain = {
  fileName: string
  mimeType: string
  base64: string
}

export interface PdfAssetDomainInterface {
  create: (params: PdfAssetCreateDomain) => Promise<PdfAssetSummaryDomain>
  findAllForService: () => Promise<PdfAssetSummaryDomain[]>
  findByID: (assetID: string) => Promise<PdfAssetBytesDomain>
}
```

`back/src/main/domain/pdf-asset.domain.ts` :

```ts
import Boom from '@hapi/boom'

import type { IocContainer } from '../types/application/ioc'
import type {
  PdfAssetBytesDomain,
  PdfAssetCreateDomain,
  PdfAssetDomainInterface,
  PdfAssetSummaryDomain,
} from '../types/domain/pdf-asset.domain.interface'
import type { PdfAssetRepositoryInterface } from '../types/infra/orm/repositories/pdf-asset.repository.interface'

// Les premiers octets d'un fichier disent ce qu'il est. Le `mimeType` du corps, lui, est
// DECLARE par le client : accepter sa parole laisserait stocker un PDF ou un script sous un
// `image/png`, que les deux moteurs rendraient en vide sans rien dire.
const SIGNATURES: { mimeType: string; octets: number[] }[] = [
  { mimeType: 'image/png', octets: [0x89, 0x50, 0x4e, 0x47] },
  { mimeType: 'image/jpeg', octets: [0xff, 0xd8, 0xff] },
  // WebP : « RIFF » puis la taille sur 4 octets, puis « WEBP ».
  { mimeType: 'image/webp', octets: [0x52, 0x49, 0x46, 0x46] },
]

const signatureCorrespond = (bytes: Buffer, mimeType: string): boolean => {
  const attendue = SIGNATURES.find((s) => s.mimeType === mimeType)
  if (!attendue) {
    return false
  }
  return attendue.octets.every((octet, rang) => bytes[rang] === octet)
}

class PdfAssetDomain implements PdfAssetDomainInterface {
  private readonly pdfAssetRepository: PdfAssetRepositoryInterface

  constructor({ pdfAssetRepository }: IocContainer) {
    this.pdfAssetRepository = pdfAssetRepository
  }

  async create(params: PdfAssetCreateDomain): Promise<PdfAssetSummaryDomain> {
    const bytes = Buffer.from(params.base64, 'base64')
    if (bytes.length === 0) {
      throw Boom.badRequest("Ce fichier n'a pas pu être lu comme une image")
    }
    if (!signatureCorrespond(bytes, params.mimeType)) {
      throw Boom.badRequest(
        `Ce fichier ne ressemble pas à une image ${params.mimeType}`,
      )
    }
    const cree = await this.pdfAssetRepository.create({
      fileName: params.fileName,
      mimeType: params.mimeType,
      bytes,
    })
    return {
      id: cree.id,
      fileName: cree.fileName,
      mimeType: cree.mimeType,
    }
  }

  findAllForService(): Promise<PdfAssetSummaryDomain[]> {
    return this.pdfAssetRepository.findAllForService()
  }

  async findByID(assetID: string): Promise<PdfAssetBytesDomain> {
    const asset = await this.pdfAssetRepository.findByID(assetID)
    if (!asset) {
      throw Boom.notFound('PdfAsset not found')
    }
    return {
      mimeType: asset.mimeType,
      base64: Buffer.from(asset.bytes).toString('base64'),
    }
  }
}

export { PdfAssetDomain }
```

- [ ] **Step 6: Écrire les routes**

`back/src/main/interfaces/http/fastify/routes/pdfAsset.ts` :

```ts
import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod/v4'

import {
  type CreatePdfAssetBody,
  createPdfAssetSchema,
  pdfAssetBytesResponseSchema,
  type PdfAssetIdParams,
  pdfAssetIdParamsSchema,
  pdfAssetListResponseSchema,
  pdfAssetSummarySchema,
  TAILLE_MAXIMALE_OCTETS,
} from '../schemas/pdf-asset.schema'

// `bodyLimit` releve pour cette route SEULE : Fastify plafonne les corps a 1 Mo, et 2 Mo
// d'image font ~2,7 Mo de base64. Sans ca le refus viendrait de Fastify, en 413, sans dire
// quelle limite a ete depassee — le message que l'utilisateur doit lire est celui du schema.
// La marge couvre l'enveloppe JSON (nom de fichier, type) au-dela du base64 lui-meme.
const LIMITE_DE_CORPS = Math.ceil((TAILLE_MAXIMALE_OCTETS * 4) / 3) + 64 * 1024

const pdfAssetReadRouter: FastifyPluginAsync = (fastify) => {
  const { pdfAssetDomain } = fastify.iocContainer

  fastify.get(
    '/',
    {
      schema: { response: { 200: pdfAssetListResponseSchema } },
      config: { permission: 'referentials:read' },
    },
    () => pdfAssetDomain.findAllForService(),
  )

  fastify.get<{ Params: PdfAssetIdParams }>(
    '/:assetID',
    {
      schema: {
        params: pdfAssetIdParamsSchema,
        response: {
          200: pdfAssetBytesResponseSchema,
          404: z.object({ message: z.string() }),
        },
      },
      config: { permission: 'referentials:read' },
    },
    (request) => pdfAssetDomain.findByID(request.params.assetID),
  )

  return Promise.resolve()
}

const pdfAssetWriteRouter: FastifyPluginAsync = (fastify) => {
  const { pdfAssetDomain } = fastify.iocContainer

  fastify.post<{ Body: CreatePdfAssetBody }>(
    '/',
    {
      bodyLimit: LIMITE_DE_CORPS,
      schema: {
        body: createPdfAssetSchema,
        response: { 201: pdfAssetSummarySchema },
      },
      config: { permission: 'referentials:write' },
    },
    async (request, reply) => {
      const asset = await pdfAssetDomain.create(request.body)
      reply.code(201)
      return asset
    },
  )

  return Promise.resolve()
}

export { pdfAssetReadRouter, pdfAssetWriteRouter }
```

- [ ] **Step 7: Câbler le conteneur et les routes**

Dans `back/src/main/application/ioc/awilix/awilix-ioc-container.ts`, à côté de `pdfDesignDomain` / `pdfDesignRepository` :

```ts
    pdfAssetDomain: asClass(PdfAssetDomain).singleton(),
    pdfAssetRepository: asClass(PdfAssetRepository).singleton(),
```

avec leurs imports. Dans `back/src/main/types/application/ioc.ts`, à côté des champs `pdfDesign*` :

```ts
  pdfAssetDomain: PdfAssetDomainInterface
  pdfAssetRepository: PdfAssetRepositoryInterface
```

Dans `back/src/main/interfaces/http/fastify/routes/tenant.routes.ts`, après les deux routeurs de design :

```ts
  await fastify.register(pdfAssetReadRouter, { prefix: '/pdf-assets' })
  await fastify.register(pdfAssetWriteRouter, { prefix: '/pdf-assets' })
```

- [ ] **Step 8: Lancer les tests pour les voir passer**

```bash
cd back && npx tsc --noEmit -p src/main/tsconfig.json
cd back && NODE_OPTIONS=--experimental-vm-modules npx -y dotenv-cli@7.3.0 -e .env.test.local -e .env.test -- npx jest --runInBand -c src/test/jest.config.ts src/test/e2e/pdf-asset.test.ts src/test/e2e/isolation.test.ts
```

Attendu : les 7 cas de `pdf-asset.test.ts` verts, et le cas d'isolation de la tâche 1 vert **y compris son contrepoint depuis B** (200, `image/png`).

- [ ] **Step 9: Commit**

```bash
cd back && npx biome check --write src
git add back && git commit -m "feat(pdf): depot et lecture des images d'un service"
```

---

### Task 3: Supprimer une image, refusé si un design l'utilise

**Files:**
- Modify: `back/src/main/infra/orm/repositories/pdf-asset.repository.ts`
- Modify: `back/src/main/types/infra/orm/repositories/pdf-asset.repository.interface.ts`
- Modify: `back/src/main/domain/pdf-asset.domain.ts`
- Modify: `back/src/main/types/domain/pdf-asset.domain.interface.ts`
- Modify: `back/src/main/interfaces/http/fastify/routes/pdfAsset.ts`
- Test: `back/src/test/e2e/pdf-asset.test.ts`
- Test: `back/src/test/unit/domain/pdf-asset.domain.test.ts` (créer)

**Interfaces:**
- Consumes: `PdfAssetDomain` (tâche 2).
- Produces: `DELETE /pdf-assets/:assetID` → 204, ou 409 nommant les designs ; `designsUtilisant(assetID)`.

- [ ] **Step 1: Écrire le test unitaire de la recherche d'usage**

La question « quels designs utilisent cette image ? » se répond en lisant le JSON des contenus. C'est une fonction pure, elle se teste sans base.

`back/src/test/unit/domain/pdf-asset.domain.test.ts` :

```ts
import { designsUtilisant } from '../../../main/domain/pdf-asset.domain'

const contenu = (assetId?: string) => ({
  version: 1,
  pages: [
    {
      kind: 'canvas',
      id: 'p1',
      background: '#ffffff',
      elements: assetId
        ? [
            {
              id: 'img',
              kind: 'image',
              x: 0,
              y: 0,
              w: 10,
              h: 10,
              rotation: 0,
              source: { assetId },
              fit: 'contain',
            },
          ]
        : [],
    },
  ],
})

describe('designsUtilisant', () => {
  it('nomme le design qui porte l image', () => {
    const designs = [
      { name: 'Programme cardio', content: contenu('a1') },
      { name: 'Autre', content: contenu() },
    ]
    expect(designsUtilisant(designs, 'a1')).toEqual(['Programme cardio'])
  })

  it('ne nomme personne quand l image ne sert nulle part', () => {
    const designs = [{ name: 'Programme cardio', content: contenu('a2') }]
    expect(designsUtilisant(designs, 'a1')).toEqual([])
  })

  // Un contenu illisible ne doit pas faire echouer la question : il ne prouve rien sur
  // l'usage de l'image, on passe au suivant.
  it('ignore un contenu qui n a pas la forme attendue', () => {
    const designs = [
      { name: 'Casse', content: { pages: 'pas un tableau' } },
      { name: 'Bon', content: contenu('a1') },
    ]
    expect(designsUtilisant(designs, 'a1')).toEqual(['Bon'])
  })

  it('ne nomme un design qu une fois meme s il porte l image deux fois', () => {
    const deuxFois = {
      version: 1,
      pages: [
        contenu('a1').pages[0],
        { ...contenu('a1').pages[0], id: 'p2' },
      ],
    }
    expect(designsUtilisant([{ name: 'Double', content: deuxFois }], 'a1')).toEqual([
      'Double',
    ])
  })
})
```

- [ ] **Step 2: Écrire les e2e de la route**

Dans `back/src/test/e2e/pdf-asset.test.ts` :

```ts
  const supprimer = (id: string) =>
    app.inject({
      method: 'DELETE',
      url: tenantUrl(
        scenario.est.id,
        scenario.serviceA.id,
        `/pdf-assets/${id}`,
      ),
      cookies: scenario.cookiesA,
    })

  it('supprime une image que personne n utilise', async () => {
    const depot = await deposer({
      fileName: 'jetable.png',
      mimeType: 'image/png',
      base64: PNG_1x1,
    })

    const res = await supprimer(depot.json().id)

    expect(res.statusCode).toBe(204)
    expect(await lire(depot.json().id)).toMatchObject({ statusCode: 404 })
  })

  // Review Focus 3 : sinon un design perd son fond sans que personne ne l'ait demande.
  it('refuse de supprimer une image qu un design utilise, et nomme le design', async () => {
    const depot = await deposer({
      fileName: 'utilisee.png',
      mimeType: 'image/png',
      base64: PNG_1x1,
    })
    const assetId = depot.json().id
    await testDb.pdfDesign.create({
      data: {
        name: 'Programme avec fond',
        establishmentId: scenario.est.id,
        serviceId: scenario.serviceA.id,
        content: {
          version: 1,
          pages: [
            {
              kind: 'canvas',
              id: 'p1',
              background: '#ffffff',
              elements: [
                {
                  id: 'fond',
                  kind: 'image',
                  x: 0,
                  y: 0,
                  w: 100,
                  h: 100,
                  rotation: 0,
                  source: { assetId },
                  fit: 'cover',
                },
              ],
            },
          ],
        },
      },
    })

    const res = await supprimer(assetId)

    expect(res.statusCode).toBe(409)
    expect(JSON.stringify(res.json())).toContain('Programme avec fond')
    // Et l'image est toujours la.
    expect(await lire(assetId)).toMatchObject({ statusCode: 200 })
  })

  it('refuse de supprimer une image inconnue', async () => {
    const res = await supprimer('cmv0000000000000000000000')
    expect(res.statusCode).toBe(404)
  })
```

- [ ] **Step 3: Lancer les deux fichiers pour les voir échouer**

```bash
cd back && NODE_OPTIONS=--experimental-vm-modules npx -y dotenv-cli@7.3.0 -e .env.test.local -e .env.test -- npx jest --runInBand -c src/test/jest.config.ts src/test/unit/domain/pdf-asset.domain.test.ts src/test/e2e/pdf-asset.test.ts
```

Attendu : ÉCHEC — `designsUtilisant` n'existe pas, et `DELETE` répond 404 par absence de route.

- [ ] **Step 4: Écrire `designsUtilisant` et la suppression**

Dans `back/src/main/domain/pdf-asset.domain.ts`, au-dessus de la classe :

```ts
type DesignLu = { name: string; content: unknown }

// On lit le JSON des contenus plutot que d'ajouter une table de liaison : un element image
// porte deja son `assetId`, et une table de plus serait une seconde verite a tenir en phase
// a chaque enregistrement de design. Un contenu illisible est ignore — il ne prouve rien sur
// l'usage de l'image.
export const designsUtilisant = (
  designs: DesignLu[],
  assetID: string,
): string[] => {
  const noms: string[] = []
  for (const design of designs) {
    const pages = (design.content as { pages?: unknown })?.pages
    if (!Array.isArray(pages)) {
      continue
    }
    const utilise = pages.some((page) => {
      const elements = (page as { elements?: unknown })?.elements
      return (
        Array.isArray(elements) &&
        elements.some(
          (element) =>
            (element as { source?: { assetId?: string } })?.source?.assetId ===
            assetID,
        )
      )
    })
    if (utilise) {
      noms.push(design.name)
    }
  }
  return noms
}
```

Et la méthode, qui a besoin du repository des designs :

```ts
  // `referentials:write` suffit a supprimer, mais pas a casser un design : la route refuse
  // tant qu'un contenu porte l'identifiant, et NOMME les designs pour que l'utilisateur
  // sache ou aller les corriger.
  async supprimer(assetID: string): Promise<void> {
    const asset = await this.pdfAssetRepository.findByID(assetID)
    if (!asset) {
      throw Boom.notFound('PdfAsset not found')
    }
    const designs = await this.pdfDesignRepository.findAllForService()
    const utilisateurs = designsUtilisant(designs, assetID)
    if (utilisateurs.length > 0) {
      throw Boom.conflict(
        `Cette image est utilisée par : ${utilisateurs.join(', ')}`,
      )
    }
    await this.pdfAssetRepository.supprimer(assetID)
  }
```

avec `pdfDesignRepository` ajouté au constructeur :

```ts
  constructor({ pdfAssetRepository, pdfDesignRepository }: IocContainer) {
    this.pdfAssetRepository = pdfAssetRepository
    this.pdfDesignRepository = pdfDesignRepository
  }
```

**Attention** : `findAllForService()` du repository des designs ne rend que les designs ACTIFS. Un design supprimé qui porte l'image ne bloquera donc pas la suppression — c'est voulu : il est hors de la liste de choix, et le restaurer avec une image manquante est le cas du Review Focus 4, qui ne fait pas échouer le PDF. Écrire ce choix en commentaire à côté de l'appel.

Dans l'interface du domaine, ajouter `supprimer: (assetID: string) => Promise<void>`.

Dans le repository, ajouter la méthode et sa déclaration d'interface :

```ts
  async supprimer(assetID: string): Promise<void> {
    const scope = this.scope
    try {
      await this.prisma.pdfAsset.delete({
        where: { id_serviceId: { id: assetID, serviceId: scope.serviceId } },
      })
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({
        entityName: 'PdfAsset',
        error: err,
      })
    }
  }
```

- [ ] **Step 5: Ajouter la route**

Dans `pdfAssetWriteRouter` :

```ts
  fastify.delete<{ Params: PdfAssetIdParams }>(
    '/:assetID',
    {
      schema: {
        params: pdfAssetIdParamsSchema,
        response: {
          204: z.null(),
          404: z.object({ message: z.string() }),
          409: z.object({ message: z.string() }),
        },
      },
      config: { permission: 'referentials:write' },
    },
    async (request, reply) => {
      await pdfAssetDomain.supprimer(request.params.assetID)
      reply.code(204).send()
    },
  )
```

- [ ] **Step 6: Lancer, typechecker, commiter**

```bash
cd back && npx tsc --noEmit -p src/main/tsconfig.json
cd back && NODE_OPTIONS=--experimental-vm-modules npx -y dotenv-cli@7.3.0 -e .env.test.local -e .env.test -- npx jest --runInBand -c src/test/jest.config.ts src/test/unit/domain/pdf-asset.domain.test.ts src/test/e2e/pdf-asset.test.ts src/test/e2e/isolation.test.ts
cd back && npx biome check --write src
git add back && git commit -m "feat(pdf): suppression d'une image, refusee si un design l'utilise"
```

Attendu : 4 cas unitaires, 10 e2e d'images, isolation verte.

---

### Task 4: L'API et les requêtes côté front

**Files:**
- Create: `front/src/api/pdfAsset.api.ts`
- Create: `front/src/api/pdfAsset.api.test.ts`
- Create: `front/src/queries/usePdfAsset.ts`
- Create: `front/src/types/pdfAsset.ts`
- Modify: `front/src/constants/process.constant.ts`

**Interfaces:**
- Consumes: les routes de la tâche 2 et 3.
- Produces: `PdfAssetApi.getAll/getBytes/create/remove`, `usePdfAssetQueries()`, `usePdfAssetBytes(id)`, `usePdfAssetMutations()`, et `dataUri({ mimeType, base64 })`.

- [ ] **Step 1: Écrire les tests qui échouent**

`front/src/api/pdfAsset.api.test.ts`, sur le modèle de `pdfDesign.api.test.ts` (même `useAuthStore.setState`, même `vi.stubGlobal('fetch', …)`) :

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useAuthStore } from '@/store/useAuthStore.ts'
import { dataUri, PdfAssetApi } from './pdfAsset.api.ts'

const context = {
  establishmentId: 'e1',
  serviceId: 's1',
  establishmentRole: 'ADMIN' as const,
  serviceRole: 'COORDINATEUR' as const,
  soignantId: null,
}

const okResponse = (body: unknown, status = 200) => ({
  ok: true,
  status,
  url: 'http://localhost/e/e1/s/s1/pdf-assets',
  json: async () => body,
})

describe('PdfAssetApi', () => {
  beforeEach(() => {
    useAuthStore.setState({ context })
    vi.unstubAllGlobals()
  })

  it('liste les images du service', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse([]))
    vi.stubGlobal('fetch', fetchMock)

    await PdfAssetApi.getAll()

    const [url] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toMatch(/\/e\/e1\/s\/s1\/pdf-assets$/)
  })

  it('depose une image en base64, sans multipart', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        okResponse({ id: 'a1', fileName: 'logo.png', mimeType: 'image/png' }, 201),
      )
    vi.stubGlobal('fetch', fetchMock)

    await PdfAssetApi.create({
      fileName: 'logo.png',
      mimeType: 'image/png',
      base64: 'AAAA',
    })

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toMatch(/\/pdf-assets$/)
    expect(init.method).toBe('POST')
    expect(init.headers).toMatchObject({ 'Content-Type': 'application/json' })
    expect(JSON.parse(init.body as string)).toEqual({
      fileName: 'logo.png',
      mimeType: 'image/png',
      base64: 'AAAA',
    })
  })

  it('lit les octets par identifiant', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(okResponse({ mimeType: 'image/png', base64: 'AAAA' }))
    vi.stubGlobal('fetch', fetchMock)

    const r = await PdfAssetApi.getBytes('a1')

    expect(r).toEqual({ mimeType: 'image/png', base64: 'AAAA' })
    const [url] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toMatch(/\/pdf-assets\/a1$/)
  })

  it('supprime une image', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, status: 204, url: '', json: async () => null })
    vi.stubGlobal('fetch', fetchMock)

    await PdfAssetApi.remove('a1')

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toMatch(/\/pdf-assets\/a1$/)
    expect(init.method).toBe('DELETE')
  })

  it('remonte le message du serveur quand la suppression est refusee', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 409,
        url: 'http://localhost/e/e1/s/s1/pdf-assets/a1',
        json: async () => ({
          message: 'Cette image est utilisée par : Programme cardio',
        }),
      }),
    )

    await expect(PdfAssetApi.remove('a1')).rejects.toThrow()
  })
})

// La data URI est ce que les DEUX moteurs recoivent : ni react-pdf ni <img> ne garantissent
// d'emporter le cookie sur une sous-ressource cross-site, et en developpement le front et le
// back sont sur deux ports.
describe('dataUri', () => {
  it('assemble le type et les octets', () => {
    expect(dataUri({ mimeType: 'image/png', base64: 'AAAA' })).toBe(
      'data:image/png;base64,AAAA',
    )
  })
})
```

- [ ] **Step 2: Lancer pour voir échouer**

```bash
cd front && npx vitest run src/api/pdfAsset.api.test.ts
```

Attendu : ÉCHEC, module introuvable.

- [ ] **Step 3: Écrire les types et les clés**

`front/src/types/pdfAsset.ts` :

```ts
export type PdfAssetSummary = {
  id: string
  fileName: string
  mimeType: string
}

export type PdfAssetBytes = {
  mimeType: string
  base64: string
}

export type CreatePdfAssetParams = {
  fileName: string
  mimeType: string
  base64: string
}
```

Dans `front/src/constants/process.constant.ts`, à côté de `PDF_DESIGN` :

```ts
export const PDF_ASSET = {
  GET_ALL: 'get_all_pdf_assets',
  GET_BYTES: 'get_pdf_asset_bytes',
  CREATE: 'create_pdf_asset',
  DELETE: 'delete_pdf_asset',
}
```

- [ ] **Step 4: Écrire le module d'API**

`front/src/api/pdfAsset.api.ts`. Le tenant reste implicite : `tenantApiUrl()` le lit dans le store à l'appel.

```ts
import { tenantApiUrl } from '../constants/config.constant.ts'
import { handleHttpError } from '../libs/httpErrorHandler.ts'
import type {
  CreatePdfAssetParams,
  PdfAssetBytes,
  PdfAssetSummary,
} from '../types/pdfAsset.ts'
import { fetchWithAuth } from './fetchWithAuth.ts'

// Ce que recoivent les deux moteurs de rendu : jamais une URL, toujours les octets.
export const dataUri = ({ mimeType, base64 }: PdfAssetBytes): string =>
  `data:${mimeType};base64,${base64}`

export const PdfAssetApi = {
  getAll: async (): Promise<PdfAssetSummary[]> => {
    const response = await fetchWithAuth(`${tenantApiUrl()}/pdf-assets`, {
      method: 'GET',
    })
    if (!response.ok) {
      handleHttpError(response, {}, 'Impossible de récupérer les images')
    }
    return response.json()
  },

  getBytes: async (assetID: string): Promise<PdfAssetBytes> => {
    const response = await fetchWithAuth(
      `${tenantApiUrl()}/pdf-assets/${assetID}`,
      { method: 'GET' },
    )
    if (!response.ok) {
      handleHttpError(response, {}, "Impossible de récupérer l'image")
    }
    return response.json()
  },

  create: async (params: CreatePdfAssetParams): Promise<PdfAssetSummary> => {
    const response = await fetchWithAuth(`${tenantApiUrl()}/pdf-assets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    })
    if (!response.ok) {
      handleHttpError(response, {}, "Impossible de déposer l'image")
    }
    return response.json()
  },

  remove: async (assetID: string): Promise<void> => {
    const response = await fetchWithAuth(
      `${tenantApiUrl()}/pdf-assets/${assetID}`,
      { method: 'DELETE' },
    )
    if (!response.ok) {
      handleHttpError(response, {}, "Impossible de supprimer l'image")
    }
  },
}
```

- [ ] **Step 5: Écrire les requêtes**

`front/src/queries/usePdfAsset.ts` :

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { PdfAssetApi } from '../api/pdfAsset.api.ts'
import { PDF_ASSET } from '../constants/process.constant.ts'
import { TOAST_SEVERITY } from '../constants/ui.constant.ts'
import { useDataFetching } from '../hooks/useDataFetching.ts'
import { useToast } from '../hooks/useToast.ts'

export const usePdfAssetQueries = () => {
  const { data, isPending, isError, error } = useQuery({
    queryKey: [PDF_ASSET.GET_ALL],
    queryFn: () => PdfAssetApi.getAll(),
    retry: 0,
  })

  useDataFetching({ isPending, isError, error })

  return { assets: data ?? [], isPending, error }
}

// Les octets d'une image ne changent jamais : une fois lus, ils restent. `staleTime: Infinity`
// evite de retelecharger la meme image a chaque rendu de la toile.
export const usePdfAssetBytes = (assetID: string | null) =>
  useQuery({
    queryKey: [PDF_ASSET.GET_BYTES, assetID],
    queryFn: () => PdfAssetApi.getBytes(assetID as string),
    enabled: assetID !== null,
    staleTime: Number.POSITIVE_INFINITY,
    retry: 0,
  })

export const usePdfAssetMutations = () => {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  const invalider = async () => {
    await queryClient.invalidateQueries({ queryKey: [PDF_ASSET.GET_ALL] })
  }

  const deposerImage = useMutation({
    mutationKey: [PDF_ASSET.CREATE],
    mutationFn: PdfAssetApi.create,
    onSuccess: () => {
      toast({ title: 'Image déposée', severity: TOAST_SEVERITY.SUCCESS })
    },
    onError: (error: Error) => {
      toast({
        title: "Erreur lors du dépôt de l'image",
        message: error.message,
        severity: TOAST_SEVERITY.ERROR,
      })
    },
    onSettled: invalider,
  })

  // Le serveur refuse en 409 et NOMME les designs concernes : son message vaut mieux que
  // n'importe quelle phrase generique qu'on ecrirait ici.
  const supprimerImage = useMutation({
    mutationKey: [PDF_ASSET.DELETE],
    mutationFn: PdfAssetApi.remove,
    onSuccess: () => {
      toast({ title: 'Image supprimée', severity: TOAST_SEVERITY.SUCCESS })
    },
    onError: (error: Error) => {
      toast({
        title: 'Suppression impossible',
        message: error.message,
        severity: TOAST_SEVERITY.ERROR,
      })
    },
    onSettled: invalider,
  })

  return { deposerImage, supprimerImage }
}
```

- [ ] **Step 6: Lancer, typechecker, vérifier les conventions, commiter**

```bash
cd front && npx vitest run src/api/pdfAsset.api.test.ts src/test/conventions-tenant-api-queries.test.ts
cd front && npx tsc -b
cd front && npx biome check --write src/api/pdfAsset.api.ts src/api/pdfAsset.api.test.ts src/queries/usePdfAsset.ts src/types/pdfAsset.ts src/constants/process.constant.ts
git add front && git commit -m "feat(pdf): api et requetes des images de service"
```

Attendu : 6 cas verts, typecheck muet, et le test de conventions vert **sans exception à ajouter** — aucun de ces fichiers ne nomme `establishmentId` ni `serviceId`.

---

### Task 5: Les deux moteurs rendent une image déposée

**Files:**
- Modify: `front/src/components/custom/pdf-design/render-canvas.tsx`
- Modify: `front/src/components/custom/pdf-design/render-pdf.tsx`
- Create: `front/src/components/custom/pdf-design/assets.ts`
- Create: `front/src/components/custom/pdf-design/assets.test.ts`
- Test: `front/src/components/custom/pdf-design/render-canvas.test.tsx`
- Test: `front/src/components/custom/pdf-design/render-pdf.test.tsx`
- Test: `front/src/components/custom/pdf-design/render-pdf.rendu.test.tsx`

**Interfaces:**
- Consumes: `dataUri` (tâche 4).
- Produces: `type SourcesImages = Record<string, string>` (assetId → data URI) passé aux deux moteurs, et `assetIdsDe(contenu)`.

**Pourquoi un dictionnaire plutôt qu'un hook dans le moteur.** `render-pdf.tsx` tourne aussi hors React (le rendu PDF est appelé par `pdf()`), et un composant react-pdf ne peut pas lire un cache react-query. Les deux moteurs reçoivent donc les octets déjà résolus, en argument — c'est l'appelant qui sait les chercher.

- [ ] **Step 1: Écrire les tests de `assets.ts`**

```ts
import { describe, expect, it } from 'vitest'

import type { PdfDesignContent } from '../../../types/pdfDesign.ts'
import { assetIdsDe } from './assets.ts'

const avecImage = (source: unknown): PdfDesignContent =>
  ({
    version: 1,
    pages: [
      {
        kind: 'canvas',
        id: 'p1',
        background: '#ffffff',
        elements: [
          {
            id: 'img',
            kind: 'image',
            x: 0,
            y: 0,
            w: 10,
            h: 10,
            rotation: 0,
            source,
            fit: 'contain',
          },
        ],
      },
    ],
  }) as PdfDesignContent

describe('assetIdsDe', () => {
  it('rend les identifiants des images deposees', () => {
    expect(assetIdsDe(avecImage({ assetId: 'a1' }))).toEqual(['a1'])
  })

  it('ignore les images livrees', () => {
    expect(assetIdsDe(avecImage({ builtin: 'logo-chu' }))).toEqual([])
  })

  it('ne rend qu une fois un identifiant utilise deux fois', () => {
    const deux = avecImage({ assetId: 'a1' })
    const page = deux.pages[0]
    if (page?.kind !== 'canvas') {
      throw new Error('forme inattendue')
    }
    page.elements.push({ ...page.elements[0], id: 'img2' })
    expect(assetIdsDe(deux)).toEqual(['a1'])
  })

  it('rend un tableau vide sur un design sans image', () => {
    expect(
      assetIdsDe({
        version: 1,
        pages: [
          { kind: 'canvas', id: 'p1', background: '#ffffff', elements: [] },
        ],
      }),
    ).toEqual([])
  })
})
```

- [ ] **Step 2: Écrire les tests des deux moteurs**

Dans `render-canvas.test.tsx` :

```tsx
  const imageDeposee: PdfElement = {
    ...geometrie,
    kind: 'image',
    source: { assetId: 'a1' },
    fit: 'contain',
  }

  it('rend une image deposee a partir des octets fournis', () => {
    render(
      <CanvasPage
        page={page([imageDeposee])}
        echelle={1}
        sources={{ a1: 'data:image/png;base64,AAAA' }}
      />,
    )
    expect(screen.getByRole('presentation')).toHaveAttribute(
      'src',
      'data:image/png;base64,AAAA',
    )
  })

  // Review Focus 4 : l'image a ete supprimee en base, ou le design vient d'un autre service.
  // La page doit sortir sans elle, pas disparaitre.
  it('ne rend rien pour une image dont les octets manquent', () => {
    render(<CanvasPage page={page([imageDeposee])} echelle={1} sources={{}} />)
    expect(screen.queryByRole('presentation')).not.toBeInTheDocument()
    expect(screen.getByTestId('element-e1')).toBeInTheDocument()
  })
```

L'image livrée garde son comportement : ajouter l'assertion qui le dit, pour qu'un futur changement de `sources` ne la casse pas en silence.

```tsx
  it('rend une image livree sans avoir besoin de sources', () => {
    const livree: PdfElement = {
      ...geometrie,
      kind: 'image',
      source: { builtin: 'logo-chu' },
      fit: 'contain',
    }
    render(<CanvasPage page={page([livree])} echelle={1} />)
    expect(screen.getByRole('presentation')).toBeInTheDocument()
  })
```

Dans `render-pdf.test.tsx`, à côté des cas d'élément image existants :

```tsx
  it('rend une image deposee a partir des octets fournis', () => {
    const element: PdfElement = {
      id: 'img',
      kind: 'image',
      x: 0,
      y: 0,
      w: 10,
      h: 10,
      rotation: 0,
      source: { assetId: 'a1' },
      fit: 'contain',
    }
    const rendu = renderElement(element, ctx(), {
      a1: 'data:image/png;base64,AAAA',
    })
    expect(rendu).not.toBeNull()
  })

  // Review Focus 4 : un `assetId` sans octets ne fait pas tomber le document.
  it('rend null pour une image deposee dont les octets manquent', () => {
    const element: PdfElement = {
      id: 'img',
      kind: 'image',
      x: 0,
      y: 0,
      w: 10,
      h: 10,
      rotation: 0,
      source: { assetId: 'absent' },
      fit: 'contain',
    }
    expect(renderElement(element, ctx(), {})).toBeNull()
  })
```

Et dans `render-pdf.rendu.test.tsx`, le vrai moteur — c'est là que les défauts de cette famille se sont toujours vus :

```tsx
  // Review Focus 4, sur le VRAI moteur : un design qui reference une image disparue doit
  // sortir quand meme. Sans les octets, react-pdf recevrait `src=undefined`.
  it('rend un document dont une image deposee a disparu', async () => {
    const rendu = await rendreDocument([
      {
        kind: 'canvas',
        id: 'p1',
        background: '#ffffff',
        elements: [
          {
            id: 'fond',
            kind: 'image',
            x: 0,
            y: 0,
            w: 100,
            h: 100,
            rotation: 0,
            source: { assetId: 'disparue' },
            fit: 'cover',
          },
          texte({}),
        ],
      },
    ])
    expect(rendu.pages).toBe(1)
    expect(rendu.lignes).toContain('Bonjour')
  }, 30000)
```

- [ ] **Step 3: Lancer pour voir échouer**

```bash
cd front && npx vitest run src/components/custom/pdf-design
```

Attendu : ÉCHEC — `assets.ts` introuvable, `sources` inconnu de `CanvasPage`, `renderElement` ne prend pas de troisième argument.

- [ ] **Step 4: Écrire `assets.ts`**

```ts
import type { PdfDesignContent } from '../../../types/pdfDesign.ts'

// Les octets, deja resolus, que les deux moteurs recoivent : assetId -> data URI.
export type SourcesImages = Record<string, string>

// Quelles images deposees ce contenu reclame. L'appelant va chercher les octets ; les
// moteurs, eux, ne savent pas lire un cache react-query — `render-pdf` tourne hors React.
export const assetIdsDe = (contenu: PdfDesignContent): string[] => {
  const ids = new Set<string>()
  for (const page of contenu.pages) {
    if (page.kind !== 'canvas') {
      continue
    }
    for (const element of page.elements) {
      if (element.kind === 'image' && 'assetId' in element.source) {
        ids.add(element.source.assetId)
      }
    }
  }
  return [...ids]
}
```

- [ ] **Step 5: Brancher les deux moteurs**

Dans `render-canvas.tsx`, ajouter `sources` aux props de `CanvasPage` (`sources?: SourcesImages`), le passer à `contenu(element, sources)`, et dans la branche `image` :

```tsx
    case 'image': {
      const src =
        'builtin' in element.source
          ? IMAGES[element.source.builtin]
          : sources?.[element.source.assetId]
      // Une image deposee puis supprimee, ou venue d'un autre service : la page sort sans
      // elle plutot que de rendre un `src` vide, qui afficherait une icone de fichier casse.
      return src ? (
        <img
          src={src}
          alt=""
          role="presentation"
          className="w-full h-full"
          style={{ objectFit: element.fit }}
        />
      ) : null
    }
```

Dans `render-pdf.tsx`, `renderElement(element, ctx, sources?)` et `pagesOf(design, ctx, calendar, sources?)`, avec la même garde :

```tsx
    case 'image': {
      const src =
        'builtin' in element.source
          ? IMAGES[element.source.builtin]
          : sources?.[element.source.assetId]
      if (!src) {
        return null
      }
      return <Image key={element.id} src={src} style={box(element)} />
    }
```

**`sources` est optionnel partout** : les appelants de l'étape 1 à 3 continuent de marcher sans le passer, et un design sans image déposée n'a rien à fournir.

- [ ] **Step 6: Lancer pour voir passer**

```bash
cd front && npx vitest run src/components/custom/pdf-design && npx tsc -b
```

Attendu : PASS. Le test de rendu réel de la page à image disparue sort en quelques dizaines de millisecondes ; s'il PEND, c'est que la garde `if (!src)` manque et que react-pdf tente de charger `undefined`.

- [ ] **Step 7: Commit**

```bash
cd front && npx biome check --write src/components/custom/pdf-design
git add front && git commit -m "feat(pdf): les deux moteurs rendent une image deposee"
```

---

### Task 6: L'inspecteur dépose et choisit une image

**Files:**
- Modify: `front/src/components/custom/pdf-design/editor/inspecteur.tsx`
- Test: `front/src/components/custom/pdf-design/editor/inspecteur.test.tsx`
- Modify: `front/src/routes/_authenticated/e/$establishmentId/s/$serviceId/_settings/pdf-patient/$designId.tsx`
- Test: `front/src/routes/_authenticated/e/$establishmentId/s/$serviceId/_settings/pdf-patient/$designId.test.tsx`
- Modify: `front/src/components/custom/Patient/pdf/programme-pdf-modal.tsx`

**Interfaces:**
- Consumes: `usePdfAssetQueries`, `usePdfAssetMutations`, `usePdfAssetBytes`, `dataUri`, `assetIdsDe`, `SourcesImages`.
- Produces: rien pour les tâches suivantes.

- [ ] **Step 1: Écrire les tests de l'inspecteur**

Dans `inspecteur.test.tsx`, le harnais `monter` existe déjà et tient l'élément dans un état. Les nouvelles props viennent en plus :

```tsx
  const image: PdfElement = {
    id: 'e1',
    kind: 'image',
    x: 10,
    y: 20,
    w: 100,
    h: 80,
    rotation: 0,
    source: { builtin: 'logo-chu' },
    fit: 'contain',
  }

  it('propose les images du service a cote des images livrees', async () => {
    monter(image, {
      assets: [{ id: 'a1', fileName: 'mon-logo.png', mimeType: 'image/png' }],
    })

    await userEvent.click(screen.getByLabelText('Image'))

    expect(
      await screen.findByRole('option', { name: 'mon-logo.png' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Logo' })).toBeInTheDocument()
  })

  it('pose l image choisie comme source de l element', async () => {
    const vus = monter(image, {
      assets: [{ id: 'a1', fileName: 'mon-logo.png', mimeType: 'image/png' }],
    })

    await userEvent.click(screen.getByLabelText('Image'))
    await userEvent.click(
      await screen.findByRole('option', { name: 'mon-logo.png' }),
    )

    expect(vus.at(-1)).toEqual({ source: { assetId: 'a1' } })
  })

  it('depose un fichier et pose l image deposee', async () => {
    const deposer = vi.fn().mockResolvedValue({
      id: 'a2',
      fileName: 'fond.png',
      mimeType: 'image/png',
    })
    const vus = monter(image, { onDeposer: deposer })

    const fichier = new File([new Uint8Array([1, 2, 3])], 'fond.png', {
      type: 'image/png',
    })
    await userEvent.upload(screen.getByLabelText(/Déposer une image/), fichier)

    await waitFor(() => {
      expect(deposer).toHaveBeenCalled()
    })
    await waitFor(() => {
      expect(vus.at(-1)).toEqual({ source: { assetId: 'a2' } })
    })
  })
```

Le harnais `monter` prend un second argument : `monter(depart, { assets = [], onDeposer = vi.fn() })`, et passe ces valeurs à `Inspecteur`. Adapter sa signature (aujourd'hui `monter(depart = texte)`), sans changer les appels existants.

- [ ] **Step 2: Lancer pour voir échouer**

```bash
cd front && npx vitest run src/components/custom/pdf-design/editor/inspecteur.test.tsx
```

Attendu : ÉCHEC des trois nouveaux cas.

- [ ] **Step 3: Étendre l'inspecteur**

`Inspecteur` reçoit deux props de plus :

```tsx
type InspecteurProps = {
  element: PdfElement | null
  onModifier: (champs: Partial<PdfElement>) => void
  onSupprimer: () => void
  onDupliquer: () => void
  onOrdre: (sens: 'avant' | 'arriere') => void
  // Les images deposees par le service, a cote des deux livrees.
  assets?: PdfAssetSummary[]
  // Rend l'image deposee, pour que l'inspecteur la pose aussitot comme source.
  onDeposer?: (fichier: File) => Promise<PdfAssetSummary>
}
```

Le bloc image devient :

```tsx
      {element.kind === 'image' && (
        <>
          <div className="flex flex-col gap-1">
            <Label className="text-xs">Image</Label>
            <Select
              options={[
                ...PDF_BUILTIN_IMAGES.map((nom) => ({
                  value: `builtin:${nom}`,
                  label: nom === 'logo-chu' ? 'Logo' : 'Lignes',
                })),
                ...(assets ?? []).map((asset) => ({
                  value: `asset:${asset.id}`,
                  label: asset.fileName,
                })),
              ]}
              value={
                'builtin' in element.source
                  ? `builtin:${element.source.builtin}`
                  : `asset:${element.source.assetId}`
              }
              onValueChange={(choix) =>
                onModifier({ source: sourceDepuisChoix(choix) })
              }
            />
          </div>

          {onDeposer && (
            <div className="flex flex-col gap-1">
              <Label htmlFor="depot-image" className="text-xs">
                Déposer une image
              </Label>
              <Input
                id="depot-image"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={async (e) => {
                  const fichier = e.target.files?.[0]
                  if (!fichier) {
                    return
                  }
                  const asset = await onDeposer(fichier)
                  onModifier({ source: { assetId: asset.id } })
                }}
              />
            </div>
          )}

          {/* … le cadrage, inchangé … */}
        </>
      )}
```

avec, en haut du fichier :

```tsx
// Une seule liste pour les deux familles : le prefixe dit laquelle, et evite qu'un nom de
// fichier nomme « logo-chu » se fasse passer pour l'image livree.
const sourceDepuisChoix = (choix: string): PdfImageElement['source'] =>
  choix.startsWith('asset:')
    ? { assetId: choix.slice('asset:'.length) }
    : { builtin: choix.slice('builtin:'.length) as PdfBuiltinImage }
```

- [ ] **Step 4: Lire le fichier en base64, dans un seul endroit**

`FileReader` rend une data URI complète (`data:image/png;base64,…`) ; le back attend le base64 nu. La conversion vit à côté de l'API, pas dans un composant.

Ajouter à `front/src/api/pdfAsset.api.ts` :

```ts
// `FileReader` rend une data URI complete ; le back attend le base64 nu, et c'est lui qui
// verifie la signature des octets.
export const lireEnBase64 = (fichier: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const lecteur = new FileReader()
    lecteur.onerror = () => reject(new Error('Fichier illisible'))
    lecteur.onload = () => {
      const resultat = String(lecteur.result)
      const virgule = resultat.indexOf(',')
      resolve(virgule >= 0 ? resultat.slice(virgule + 1) : resultat)
    }
    lecteur.readAsDataURL(fichier)
  })
```

et son test dans `pdfAsset.api.test.ts` :

```ts
describe('lireEnBase64', () => {
  it('retire l en-tete de la data URI', async () => {
    const fichier = new File([new Uint8Array([0x89, 0x50])], 'x.png', {
      type: 'image/png',
    })
    const base64 = await lireEnBase64(fichier)
    expect(base64).not.toContain('data:')
    expect(base64).not.toContain(',')
  })
})
```

- [ ] **Step 5: Brancher l'éditeur**

Dans `$designId.tsx` :

```tsx
  const { assets } = usePdfAssetQueries()
  const { deposerImage } = usePdfAssetMutations()

  // Les octets des images que CE design reclame, resolus une fois et donnes aux deux moteurs.
  const idsDemandes = assetIdsDe(contenu)
  const sources = useSourcesImages(idsDemandes)
```

`useSourcesImages` est un petit hook à côté de `usePdfAsset.ts`, qui lit les octets de plusieurs images :

```ts
// Un `useQueries` plutot que N hooks : le nombre d'images varie d'un design a l'autre, et
// appeler `usePdfAssetBytes` dans une boucle violerait les regles des hooks.
export const useSourcesImages = (assetIDs: string[]): SourcesImages => {
  const resultats = useQueries({
    queries: assetIDs.map((id) => ({
      queryKey: [PDF_ASSET.GET_BYTES, id],
      queryFn: () => PdfAssetApi.getBytes(id),
      staleTime: Number.POSITIVE_INFINITY,
      retry: 0,
    })),
  })
  const sources: SourcesImages = {}
  resultats.forEach((resultat, rang) => {
    const id = assetIDs[rang]
    if (id && resultat.data) {
      sources[id] = dataUri(resultat.data)
    }
  })
  return sources
}
```

Puis passer `sources` à `ToileEditable` (qui le passe à `CanvasPage`), à `Vignette`, et à `pagesOf` dans l'aperçu ; et `assets` / `onDeposer` à l'`Inspecteur` :

```tsx
              <Inspecteur
                element={elementSelectionne}
                assets={assets}
                onDeposer={async (fichier) =>
                  deposerImage.mutateAsync({
                    fileName: fichier.name,
                    mimeType: fichier.type,
                    base64: await lireEnBase64(fichier),
                  })
                }
                onModifier={…}
                …
              />
```

`ToileEditable` et `Vignette` reçoivent une prop `sources?: SourcesImages` qu'ils transmettent, sans autre logique.

- [ ] **Step 6: Brancher la modale du programme patient**

`programme-pdf-modal.tsx` produit le vrai PDF : sans les octets, une image déposée n'y sortirait pas.

```tsx
  const sources = useSourcesImages(
    selectedDesign ? assetIdsDe(selectedDesign.content) : [],
  )
```

et passer `sources` à `ProgrammePDF`, qui le passe à `pagesOf`.

- [ ] **Step 7: Écrire le test de l'écran**

Dans `$designId.test.tsx` :

```tsx
  it('montre une image deposee sur la toile', async () => {
    monterAvecImage()

    await waitFor(() => {
      expect(screen.getAllByRole('presentation').length).toBeGreaterThan(0)
    })
  })
```

`monterAvecImage` est une variante du harnais : le design porte un élément image `{ assetId: 'a1' }`, le mock de `fetch` répond à `GET /pdf-assets/a1` par `{ mimeType: 'image/png', base64: 'AAAA' }` et à `GET /pdf-assets` par la liste à un élément. Écrire ces deux branches dans le `fetchMock` existant, à côté de celle de `/pdf-designs`.

- [ ] **Step 8: Lancer, typechecker, linter, commiter**

```bash
cd front && npx vitest run src/components/custom/pdf-design src/routes src/api src/queries
cd front && npx tsc -b
cd front && npx biome check --write src
git add front && git commit -m "feat(pdf): deposer et choisir une image dans l'inspecteur"
```

---

### Task 7: Vérification à l'écran et cas limites

Aucun test ne remplace cette tâche. Les deux pièges de cette session valent toujours :
- l'éditeur pose un `beforeunload` : **enregistrer ou annuler AVANT toute navigation**, sinon la boîte « Quitter le site ? » fige l'onglet piloté ;
- le back du worktree tourne sur 3007 avec `CORS_ORIGIN` vers 4277 ; ne pas toucher aux serveurs 3000/4270.

- [ ] **Step 1: Le parcours complet**

Dupliquer un modèle, ouvrir l'éditeur, ajouter un élément Image. Vérifier : le sélecteur propose « Logo » et « Lignes » ; déposer un PNG le pose aussitôt comme source et l'image apparaît sur la toile ; elle apparaît aussi dans la vignette de la bande ; « Aperçu PDF » la montre ; enregistrer, recharger, elle est toujours là ; générer le PDF d'un vrai patient, elle y est.

- [ ] **Step 2: Les cas limites**

- **Un fichier de 3 Mo** : le refus doit nommer la limite (« dépasse la taille maximale de 2 Mo »), pas un 413 muet.
- **Un PDF renommé en `.png`** : refusé, avec un message qui parle d'image.
- **Supprimer une image utilisée** : refusé, et le message nomme le design.
- **Supprimer une image non utilisée** : passe, et l'élément qui la portait — s'il en reste un dans un design supprimé — ne fait pas échouer le PDF.
- **Deux éléments sur la même image** : les octets ne sont demandés qu'une fois (onglet Réseau : une seule requête `GET /pdf-assets/<id>`).

- [ ] **Step 3: Toutes les suites, lint, commit**

```bash
cd back && npx tsc --noEmit -p src/main/tsconfig.json && npx biome ci src
cd back && NODE_OPTIONS=--experimental-vm-modules npx -y dotenv-cli@7.3.0 -e .env.test.local -e .env.test -- npx jest --runInBand -c src/test/jest.config.ts
cd front && npx tsc -b && npx vitest run
git add -A && git commit -m "feat(pdf): etape 4 verifiee a l'ecran"
```

---

## Ce que l'étape 4 ne fait pas

- **Une table d'assets globale pour les presets** — ajouter une image à un preset demande toujours un déploiement (une entrée `builtin` de plus). Plafond assumé par la spec.
- **Le stockage objet (MinIO)** — l'indirection par `assetId` le laisse à un adaptateur près, cette étape ne le fait pas.
- **Recadrer, redimensionner ou compresser à l'upload** — l'image est stockée telle quelle ; le service est responsable de ce qu'il dépose.
- **Un écran de gestion de la bibliothèque d'images** — on dépose et on choisit depuis l'inspecteur ; la suppression a sa route mais pas encore d'écran dédié.
- **Remplacer les octets d'une image existante** — on dépose une nouvelle image et on change la source.
- **Un verrou optimiste à l'enregistrement** — toujours pas.
