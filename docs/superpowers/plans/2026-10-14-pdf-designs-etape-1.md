# PDF patient, designs composables — étape 1 : le socle de rendu

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** le PDF patient d'aujourd'hui est produit par un moteur qui lit un design en base, et les deux composants de page codés en dur sont supprimés — sans qu'aucun pixel ne change.

**Architecture:** un design est un document JSON (`{ version, pages }`) validé par Zod côté back, rendu côté front par `render-pdf.tsx` qui mappe chaque élément sur react-pdf. Deux tables : `PdfDesignPreset` (global, seedé) et `PdfDesign` (de service, vide à cette étape). Une route de lecture rend les deux listes ; la modale choisit, et à défaut prend le premier preset. Aucun éditeur, aucune écriture.

**Tech Stack:** Prisma + Fastify + Zod v4 + jest (back) ; React + `@react-pdf/renderer` 4.3.2 + TanStack Query + vitest (front) ; Biome pour lint et format.

**Spec:** `docs/superpowers/specs/2026-10-14-pdf-patient-designs-design.md`

## Global Constraints

- **Biome, jamais ESLint ni Prettier.** `cd back && npm run lint`, `cd front && npm run lint`.
- **Aucun `biome-ignore`.** On corrige le code, on ne muselle pas la règle.
- **Commentaires synthétiques.** Une ligne quand elle apprend quelque chose, sinon rien. Pas de pavé explicatif.
- **Zod v4**, importé `from 'zod/v4'` — c'est la forme de tous les schémas du back.
- **Unités : le point.** A4 vaut `595.28 × 841.89`. Aucune coordonnée en pixels nulle part.
- **Suppression dans l'UI, archivage dans le back.** Pas d'« Archiver » visible (sans objet à cette étape : aucune écriture).
- **Les routes déclarent leur permission** (`config: { permission }`) — le serveur refuse de démarrer sinon.
- **Le tenant n'est jamais un argument** d'un module `api/` ou `queries/`, et une `queryKey` ne le porte pas (`front/src/test/conventions-tenant-api-queries.test.ts`).
- **Polices disponibles : `Helvetica` et `Helvetica-Bold` seulement.** Aucun `Font.register` n'existe dans le dépôt.
- **Travailler dans un worktree** (`superpowers:using-git-worktrees`), jamais une branche dans le dossier principal. Base de test e2e dédiée : `medisync_test_<suffixe>` dans `.env.test.local`.
- **Après chaque tâche :** `npm run lint` des deux côtés, puis `graphify update .` à la fin de l'étape.

## Review Focus

Cinq classes d'entrée que la spec implique et qu'aucune tâche n'exerce spontanément. Chacune reçoit son test dans la tâche qui possède le code.

1. **Un patient sans aucun créneau à venir** — `program.dates` doit rendre une chaîne vide, pas « Du Invalid Date au Invalid Date ». Aujourd'hui `computeProgramDuration` rend `null` et le `<Text>` entier disparaît. → Tâche 5.
2. **Un patient sans parcours** — `pathway.name` doit valoir « Programme » et le rond prendre son repli `#e6aff6`, comme `DEFAULT_CIRCLE_COLOR` aujourd'hui. → Tâches 5 et 6.
3. **Un nom de patient très long** — la coupure doit tomber sur l'espace entre prénom et nom, pas au milieu d'un mot ; seul un mot plus large qu'une ligne se coupe. C'est `hyphenationCallback` aujourd'hui, et le moteur générique doit le porter pour tous ses textes. → Tâche 6.
4. **Un `content` en base qui ne passe plus le schéma** — un `kind` inconnu (preset retouché à la main, version future) ne doit pas faire tomber le PDF entier : l'élément est ignoré, le reste s'imprime. → Tâche 6.
5. **Un design sans page `calendar`, ou avec deux** — le moteur doit rendre zéro ou deux fois le calendrier sans broncher. C'est le choix de l'utilisateur, pas une erreur ; ce qui compte est que le comportement soit défini. → Tâche 6.

---

### Task 1: Le contrat de contenu — schéma Zod back et type front

**Files:**
- Create: `back/src/main/interfaces/http/fastify/schemas/pdf-design-content.schema.ts`
- Create: `back/src/test/unit/schemas/pdf-design-content.schema.test.ts`
- Create: `front/src/types/pdfDesign.ts`

**Interfaces:**
- Consumes: rien.
- Produces: `pdfDesignContentSchema`, `PdfDesignContent`, `PDF_FIELD_KEYS`, `PDF_BUILTIN_IMAGES` (back) ; les mêmes types en TypeScript pur (front) : `PdfDesignContent`, `PdfPage`, `PdfElement`, `PdfTextElement`, `PdfTextRun`, `PdfFill`, `PdfFieldKey`, `PdfBuiltinImage`.

- [ ] **Step 1: Écrire le test qui échoue**

`back/src/test/unit/schemas/pdf-design-content.schema.test.ts` :

```ts
import { pdfDesignContentSchema } from '../../../main/interfaces/http/fastify/schemas/pdf-design-content.schema'

const pageAvecUnTexte = (element: unknown) => ({
  version: 1,
  pages: [{ kind: 'canvas', id: 'p1', background: '#ffffff', elements: [element] }],
})

const texte = {
  id: 'e1',
  kind: 'text',
  x: 0,
  y: 0,
  w: 100,
  h: 20,
  runs: [{ text: 'Bonjour' }],
  fontSize: 12,
  color: '#221755',
}

describe('pdfDesignContentSchema', () => {
  it('accepte un design minimal', () => {
    const parsed = pdfDesignContentSchema.parse(pageAvecUnTexte(texte))
    expect(parsed.pages).toHaveLength(1)
  })

  it('applique les valeurs par defaut de style', () => {
    const parsed = pdfDesignContentSchema.parse(pageAvecUnTexte(texte))
    const element = parsed.pages[0]
    if (element.kind !== 'canvas' || element.elements[0].kind !== 'text') {
      throw new Error('forme inattendue')
    }
    expect(element.elements[0].align).toBe('left')
    expect(element.elements[0].vAlign).toBe('top')
    expect(element.elements[0].bold).toBe(false)
  })

  it('refuse un kind inconnu', () => {
    expect(() => pdfDesignContentSchema.parse(pageAvecUnTexte({ ...texte, kind: 'qrcode' }))).toThrow()
  })

  it('refuse une coordonnee manquante', () => {
    const { y: _y, ...sansY } = texte
    expect(() => pdfDesignContentSchema.parse(pageAvecUnTexte(sansY))).toThrow()
  })

  it('refuse une largeur nulle ou negative', () => {
    expect(() => pdfDesignContentSchema.parse(pageAvecUnTexte({ ...texte, w: 0 }))).toThrow()
  })

  it('refuse une couleur qui n est pas un hex a six chiffres', () => {
    expect(() => pdfDesignContentSchema.parse(pageAvecUnTexte({ ...texte, color: 'rouge' }))).toThrow()
  })

  it('refuse un texte sans aucun run', () => {
    expect(() => pdfDesignContentSchema.parse(pageAvecUnTexte({ ...texte, runs: [] }))).toThrow()
  })

  it('refuse un run qui porte a la fois du texte et une donnee', () => {
    expect(() =>
      pdfDesignContentSchema.parse(
        pageAvecUnTexte({ ...texte, runs: [{ text: 'a', field: 'patient.name' }] }),
      ),
    ).toThrow()
  })

  it('accepte un run de donnee', () => {
    const parsed = pdfDesignContentSchema.parse(
      pageAvecUnTexte({ ...texte, runs: [{ field: 'patient.name', bold: true }] }),
    )
    expect(parsed.pages).toHaveLength(1)
  })

  it('refuse une donnee inconnue', () => {
    expect(() =>
      pdfDesignContentSchema.parse(pageAvecUnTexte({ ...texte, runs: [{ field: 'patient.ssn' }] })),
    ).toThrow()
  })

  it('accepte un remplissage par jeton avec son repli', () => {
    const parsed = pdfDesignContentSchema.parse(
      pageAvecUnTexte({
        id: 'e2',
        kind: 'ellipse',
        x: 0,
        y: 0,
        w: 10,
        h: 10,
        fill: { token: 'pathway.color', fallback: '#e6aff6' },
      }),
    )
    expect(parsed.pages).toHaveLength(1)
  })

  it('refuse un jeton de remplissage sans repli', () => {
    expect(() =>
      pdfDesignContentSchema.parse(
        pageAvecUnTexte({
          id: 'e2',
          kind: 'ellipse',
          x: 0,
          y: 0,
          w: 10,
          h: 10,
          fill: { token: 'pathway.color' },
        }),
      ),
    ).toThrow()
  })

  it('accepte une page calendrier, sans elements', () => {
    const parsed = pdfDesignContentSchema.parse({
      version: 1,
      pages: [{ kind: 'calendar', id: 'c1' }],
    })
    expect(parsed.pages[0].kind).toBe('calendar')
  })

  it('refuse un design sans aucune page', () => {
    expect(() => pdfDesignContentSchema.parse({ version: 1, pages: [] })).toThrow()
  })

  it('refuse une version inconnue', () => {
    expect(() => pdfDesignContentSchema.parse({ version: 2, pages: [{ kind: 'calendar', id: 'c1' }] })).toThrow()
  })
})
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

```bash
cd back && NODE_OPTIONS=--experimental-vm-modules npx jest -c src/test/jest.config.ts \
  --selectProjects unit src/test/unit/schemas/pdf-design-content.schema.test.ts
```

Attendu : ÉCHEC, `Cannot find module '.../pdf-design-content.schema'`.

- [ ] **Step 3: Écrire le schéma**

`back/src/main/interfaces/http/fastify/schemas/pdf-design-content.schema.ts` :

```ts
import { z } from 'zod/v4'

export const PDF_FIELD_KEYS = [
  'patient.name',
  'pathway.name',
  'program.dates',
  'service.name',
] as const

export const PDF_BUILTIN_IMAGES = ['logo-chu', 'lines'] as const

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/)

// Une couleur fixe, ou celle du parcours du patient avec son repli quand il n'en a pas.
const fill = z.union([
  hex,
  z.object({ token: z.literal('pathway.color'), fallback: hex }),
])

const runStyle = { bold: z.boolean().default(false), italic: z.boolean().default(false) }

const textRun = z.union([
  z.object({ text: z.string(), ...runStyle }).strict(),
  z.object({ field: z.enum(PDF_FIELD_KEYS), ...runStyle }).strict(),
])

const geometry = {
  id: z.string().min(1),
  x: z.number(),
  y: z.number(),
  w: z.number().positive(),
  h: z.number().positive(),
  rotation: z.number().default(0),
}

const textElement = z.object({
  ...geometry,
  kind: z.literal('text'),
  runs: z.array(textRun).min(1),
  fontSize: z.number().positive(),
  bold: z.boolean().default(false),
  italic: z.boolean().default(false),
  color: hex,
  align: z.enum(['left', 'center', 'right']).default('left'),
  vAlign: z.enum(['top', 'middle', 'bottom']).default('top'),
  lineHeight: z.number().positive().optional(),
})

const rectElement = z.object({
  ...geometry,
  kind: z.literal('rect'),
  fill,
  radius: z.number().min(0).default(0),
})

const ellipseElement = z.object({ ...geometry, kind: z.literal('ellipse'), fill })

const imageElement = z.object({
  ...geometry,
  kind: z.literal('image'),
  source: z.union([
    z.object({ builtin: z.enum(PDF_BUILTIN_IMAGES) }).strict(),
    z.object({ assetId: z.cuid() }).strict(),
  ]),
  fit: z.enum(['contain', 'cover', 'fill']).default('contain'),
})

const element = z.discriminatedUnion('kind', [
  textElement,
  rectElement,
  ellipseElement,
  imageElement,
])

const canvasPage = z.object({
  kind: z.literal('canvas'),
  id: z.string().min(1),
  background: hex.default('#ffffff'),
  elements: z.array(element),
})

// Les creneaux du patient, rendus par CalendarPages : de la donnee, pas de la mise en page.
const calendarPage = z.object({ kind: z.literal('calendar'), id: z.string().min(1) })

export const pdfDesignContentSchema = z.object({
  version: z.literal(1),
  pages: z.array(z.discriminatedUnion('kind', [canvasPage, calendarPage])).min(1),
})

export type PdfDesignContent = z.infer<typeof pdfDesignContentSchema>
export type PdfFieldKey = (typeof PDF_FIELD_KEYS)[number]
export type PdfBuiltinImage = (typeof PDF_BUILTIN_IMAGES)[number]
```

- [ ] **Step 4: Lancer le test pour vérifier qu'il passe**

```bash
cd back && NODE_OPTIONS=--experimental-vm-modules npx jest -c src/test/jest.config.ts \
  --selectProjects unit src/test/unit/schemas/pdf-design-content.schema.test.ts
```

Attendu : PASS, 15 tests.

- [ ] **Step 5: Écrire le type front**

`front/src/types/pdfDesign.ts`. La forme reflète le schéma ci-dessus, **après** application des valeurs par défaut — le front ne reçoit que des contenus déjà passés par Zod, donc les champs à défaut y sont requis.

```ts
// Le schema Zod du back (pdf-design-content.schema.ts) est l'autorite : il valide chaque
// ecriture. Ce fichier en est la lecture cote front, apres application des defauts.
export const PDF_FIELD_KEYS = [
  'patient.name',
  'pathway.name',
  'program.dates',
  'service.name',
] as const
export type PdfFieldKey = (typeof PDF_FIELD_KEYS)[number]

export const PDF_BUILTIN_IMAGES = ['logo-chu', 'lines'] as const
export type PdfBuiltinImage = (typeof PDF_BUILTIN_IMAGES)[number]

export type PdfFill = string | { token: 'pathway.color'; fallback: string }

export type PdfTextRun =
  | { text: string; bold: boolean; italic: boolean }
  | { field: PdfFieldKey; bold: boolean; italic: boolean }

type Geometry = {
  id: string
  x: number
  y: number
  w: number
  h: number
  rotation: number
}

export type PdfTextElement = Geometry & {
  kind: 'text'
  runs: PdfTextRun[]
  fontSize: number
  bold: boolean
  italic: boolean
  color: string
  align: 'left' | 'center' | 'right'
  vAlign: 'top' | 'middle' | 'bottom'
  lineHeight?: number
}

export type PdfRectElement = Geometry & { kind: 'rect'; fill: PdfFill; radius: number }
export type PdfEllipseElement = Geometry & { kind: 'ellipse'; fill: PdfFill }
export type PdfImageElement = Geometry & {
  kind: 'image'
  source: { builtin: PdfBuiltinImage } | { assetId: string }
  fit: 'contain' | 'cover' | 'fill'
}

export type PdfElement =
  | PdfTextElement
  | PdfRectElement
  | PdfEllipseElement
  | PdfImageElement

export type PdfCanvasPage = {
  kind: 'canvas'
  id: string
  background: string
  elements: PdfElement[]
}
export type PdfCalendarPage = { kind: 'calendar'; id: string }
export type PdfPage = PdfCanvasPage | PdfCalendarPage

export type PdfDesignContent = { version: 1; pages: PdfPage[] }

// Dimensions de l'A4 en points, l'unite des coordonnees d'un design.
export const A4_WIDTH = 595.28
export const A4_HEIGHT = 841.89
```

- [ ] **Step 6: Vérifier le lint des deux côtés**

```bash
cd back && npm run lint && cd ../front && npm run lint
```

Attendu : aucune erreur.

- [ ] **Step 7: Commit**

```bash
git add back/src/main/interfaces/http/fastify/schemas/pdf-design-content.schema.ts \
        back/src/test/unit/schemas/pdf-design-content.schema.test.ts \
        front/src/types/pdfDesign.ts
git commit -m "feat(pdf): contrat de contenu d'un design, schema Zod et type front"
```

---

### Task 2: Le preset de référence et son épinglage

Transcrit `cover-page.pdf.tsx` et `tips-page.pdf.tsx` en données. Les coordonnées sont calculées depuis les styles actuels ; celles qui dépendent d'une hauteur de texte automatique sont des estimations, **corrigées à la tâche 9** par comparaison visuelle.

**Files:**
- Create: `back/src/main/utils/pdf-design/reference-preset.ts`
- Create: `back/src/test/unit/utils/pdf-design/reference-preset.test.ts`

**Interfaces:**
- Consumes: `pdfDesignContentSchema`, `PdfDesignContent` (tâche 1).
- Produces: `REFERENCE_PRESET_ID` (`'preset-smcv-reference'`), `REFERENCE_PRESET_NAME` (`'Programme SMCV'`), `REFERENCE_PRESET_CONTENT: PdfDesignContent`.

- [ ] **Step 1: Écrire le test qui échoue**

`back/src/test/unit/utils/pdf-design/reference-preset.test.ts` :

```ts
import { pdfDesignContentSchema } from '../../../../main/interfaces/http/fastify/schemas/pdf-design-content.schema'
import {
  REFERENCE_PRESET_CONTENT,
  REFERENCE_PRESET_ID,
  REFERENCE_PRESET_NAME,
} from '../../../../main/utils/pdf-design/reference-preset'

const canvas = (index: number) => {
  const page = REFERENCE_PRESET_CONTENT.pages[index]
  if (page.kind !== 'canvas') {
    throw new Error(`la page ${index} n'est pas une toile`)
  }
  return page
}

const element = (pageIndex: number, id: string) => {
  const found = canvas(pageIndex).elements.find((e) => e.id === id)
  if (!found) {
    throw new Error(`element ${id} absent de la page ${pageIndex}`)
  }
  return found
}

describe('preset de reference', () => {
  it('passe le schema de contenu', () => {
    expect(() => pdfDesignContentSchema.parse(REFERENCE_PRESET_CONTENT)).not.toThrow()
  })

  it('porte un identifiant et un nom stables, dont depend le seed', () => {
    expect(REFERENCE_PRESET_ID).toBe('preset-smcv-reference')
    expect(REFERENCE_PRESET_NAME).toBe('Programme SMCV')
  })

  it('enchaine couverture, calendrier, conseils', () => {
    expect(REFERENCE_PRESET_CONTENT.pages.map((p) => p.kind)).toEqual([
      'canvas',
      'calendar',
      'canvas',
    ])
  })

  // Epinglage : une retouche ulterieure ne peut pas deplacer le titre en silence.
  it('garde le titre de couverture a sa place et a sa taille', () => {
    const titre = element(0, 'cover-title')
    expect(titre.kind).toBe('text')
    if (titre.kind !== 'text') return
    expect(titre.runs).toEqual([{ text: 'SMCV' }])
    expect(titre.fontSize).toBe(72)
    expect(titre.color).toBe('#e05a5a')
    expect(titre.align).toBe('center')
    expect(titre.y).toBe(327)
  })

  it('garde le rond colore par le parcours, avec le repli mauve', () => {
    const rond = element(0, 'cover-circle')
    expect(rond.kind).toBe('ellipse')
    if (rond.kind !== 'ellipse') return
    expect(rond.fill).toEqual({ token: 'pathway.color', fallback: '#e6aff6' })
    expect(rond.w).toBe(380)
    expect(rond.h).toBe(380)
  })

  it('ancre le nom du patient en bas de sa boite', () => {
    const nom = element(0, 'cover-patient')
    expect(nom.kind).toBe('text')
    if (nom.kind !== 'text') return
    expect(nom.runs).toEqual([{ field: 'patient.name' }])
    expect(nom.vAlign).toBe('bottom')
    expect(nom.fontSize).toBe(32)
    // bottom: 48 aujourd'hui -> le bas de la boite tombe a 841.89 - 48.
    expect(nom.y + nom.h).toBeCloseTo(793.89, 2)
  })

  it('porte le sous-titre du parcours et les dates du programme', () => {
    const sousTitre = element(0, 'cover-program')
    const dates = element(0, 'cover-dates')
    if (sousTitre.kind !== 'text' || dates.kind !== 'text') {
      throw new Error('forme inattendue')
    }
    expect(sousTitre.runs).toEqual([{ field: 'pathway.name' }])
    expect(dates.runs).toEqual([{ field: 'program.dates' }])
  })

  it('porte les quatre conseils, chacun avec son pave, sa puce, son titre et son texte', () => {
    const ids = canvas(2).elements.map((e) => e.id)
    for (const n of [1, 2, 3, 4]) {
      expect(ids).toContain(`tip-${n}-box`)
      expect(ids).toContain(`tip-${n}-dot`)
      expect(ids).toContain(`tip-${n}-title`)
      expect(ids).toContain(`tip-${n}-body`)
    }
  })

  it('garde l encadre de fin en un seul paragraphe, gras puis normal', () => {
    const banniere = element(2, 'closing-text')
    if (banniere.kind !== 'text') throw new Error('forme inattendue')
    expect(banniere.runs).toHaveLength(2)
    expect(banniere.runs[0]).toMatchObject({ bold: true })
    expect(banniere.runs[1]).toMatchObject({ bold: false })
  })

  it('garde le numero du service en gras, dans la phrase de contact', () => {
    const contact = element(2, 'closing-contact')
    if (contact.kind !== 'text') throw new Error('forme inattendue')
    expect(contact.runs.at(-1)).toMatchObject({ text: '05 57 62 32 91', bold: true })
  })

  // Rien ne sort de la page : une coordonnee negative n'est legitime que pour le decor,
  // qui depasse volontairement (le rond et les lignes en diagonale).
  it('ne laisse aucun texte sortir de la page', () => {
    for (const index of [0, 2]) {
      for (const e of canvas(index).elements) {
        if (e.kind !== 'text') continue
        expect(e.x).toBeGreaterThanOrEqual(0)
        expect(e.y).toBeGreaterThanOrEqual(0)
        expect(e.x + e.w).toBeLessThanOrEqual(595.28 + 0.01)
        expect(e.y + e.h).toBeLessThanOrEqual(841.89 + 0.01)
      }
    }
  })
})
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

```bash
cd back && NODE_OPTIONS=--experimental-vm-modules npx jest -c src/test/jest.config.ts \
  --selectProjects unit src/test/unit/utils/pdf-design/reference-preset.test.ts
```

Attendu : ÉCHEC, `Cannot find module '.../reference-preset'`.

- [ ] **Step 3: Écrire le preset**

`back/src/main/utils/pdf-design/reference-preset.ts`.

Géométrie, reprise des styles actuels. Les images gardent leur rapport mesuré : `logo_chx-bdx.png` fait 799 × 410 (1,9488), `lines.png` 1304 × 1600 (0,815). Les positions CSS en `right`/`bottom` sont converties en `x`/`y` depuis le coin haut-gauche.

```ts
import type { PdfDesignContent } from '../../interfaces/http/fastify/schemas/pdf-design-content.schema'

export const REFERENCE_PRESET_ID = 'preset-smcv-reference'
export const REFERENCE_PRESET_NAME = 'Programme SMCV'

const PAGE_W = 595.28
const PAGE_H = 841.89
const MARGIN = 36
const CONTENT_W = PAGE_W - MARGIN * 2

// Les hauteurs des paves de conseils et de l'encadre de fin remplacent des hauteurs
// automatiques : un texte rallonge y debordera, l'apercu le montre.
const TIP_BOXES = [
  { y: 221, h: 79 },
  { y: 312, h: 92 },
  { y: 416, h: 66 },
  { y: 494, h: 66 },
]

const TIPS = [
  {
    title: 'Soyez ponctuel·le',
    text: "La ponctualité est essentielle au bon déroulement des séances. Cela permet de respecter le travail de l'équipe soignante, mais aussi celui des autres patients. Merci d'arriver à l'heure indiquée pour chaque activité.",
  },
  {
    title: "Ce qu'il faut apporter chaque jour",
    text: "Pour pratiquer une activité physique en toute sécurité et dans de bonnes conditions, il est important de porter des vêtements et des chaussures confortables et adaptés à l'effort. Des casiers sont à votre disposition dans les vestiaires. Merci d'apporter un cadenas ! Pensez à prendre une gourde d'eau pour vous hydrater pendant et après l'effort.",
  },
  {
    title: 'Prenez un petit-déjeuner avant de venir',
    text: "Il est essentiel de manger le matin avant votre venue. Un petit-déjeuner équilibré vous donnera l'énergie nécessaire pour participer activement à votre programme.",
  },
  {
    title: 'Soyez reposé·e',
    text: "Un bon repos est indispensable pour votre récupération et pour profiter pleinement de chaque activité. Essayez de venir reposé·e, en forme, et l'écoute de votre corps.",
  },
]

// Le meme decor en haut a droite sur la couverture et sur les conseils.
const linesTopRight = (id: string) => ({
  id,
  kind: 'image' as const,
  source: { builtin: 'lines' as const },
  // right: -160 -> le bord droit depasse de 160 ; width 280, rapport 0,815.
  x: PAGE_W + 160 - 280,
  y: -160,
  w: 280,
  h: 280 / 0.815,
  rotation: 45,
  fit: 'contain' as const,
})

const tipElements = () =>
  TIPS.flatMap((tip, index) => {
    const box = TIP_BOXES[index]
    const n = index + 1
    return [
      {
        id: `tip-${n}-box`,
        kind: 'rect' as const,
        x: MARGIN,
        y: box.y,
        w: CONTENT_W,
        h: box.h,
        rotation: 0,
        fill: '#fce7f3',
        radius: 6,
      },
      {
        id: `tip-${n}-dot`,
        kind: 'ellipse' as const,
        x: MARGIN + 12,
        y: box.y + 14,
        w: 10,
        h: 10,
        rotation: 0,
        fill: '#ec4899',
      },
      {
        id: `tip-${n}-title`,
        kind: 'text' as const,
        x: MARGIN + 32,
        y: box.y + 12,
        w: CONTENT_W - 44,
        h: 14,
        rotation: 0,
        runs: [{ text: tip.title, bold: true }],
        fontSize: 11,
        bold: true,
        italic: false,
        color: '#1f2937',
        align: 'left' as const,
        vAlign: 'top' as const,
      },
      {
        id: `tip-${n}-body`,
        kind: 'text' as const,
        x: MARGIN + 32,
        y: box.y + 29,
        w: CONTENT_W - 44,
        h: box.h - 41,
        rotation: 0,
        runs: [{ text: tip.text }],
        fontSize: 9,
        bold: false,
        italic: false,
        color: '#4b5563',
        align: 'left' as const,
        vAlign: 'top' as const,
        lineHeight: 1.4,
      },
    ]
  })

export const REFERENCE_PRESET_CONTENT: PdfDesignContent = {
  version: 1,
  pages: [
    {
      kind: 'canvas',
      id: 'cover',
      background: '#ffffff',
      elements: [
        // Le decor d'abord : l'ordre du tableau est l'ordre de peinture.
        linesTopRight('cover-lines-tr'),
        {
          id: 'cover-lines-br',
          kind: 'image',
          source: { builtin: 'lines' },
          // right: 120, bottom: -160 ; width 260.
          x: PAGE_W - 120 - 260,
          y: PAGE_H + 160 - 260 / 0.815,
          w: 260,
          h: 260 / 0.815,
          rotation: 220,
          fit: 'contain',
        },
        {
          id: 'cover-circle',
          kind: 'ellipse',
          x: -60,
          y: PAGE_H + 180 - 380,
          w: 380,
          h: 380,
          rotation: 0,
          fill: { token: 'pathway.color', fallback: '#e6aff6' },
        },
        {
          id: 'cover-logo',
          kind: 'image',
          source: { builtin: 'logo-chu' },
          x: MARGIN,
          y: MARGIN,
          w: 140,
          h: 140 / 1.9488,
          rotation: 0,
          fit: 'contain',
        },
        {
          id: 'cover-title',
          kind: 'text',
          x: 0,
          y: 327,
          w: PAGE_W,
          h: 86,
          rotation: 0,
          runs: [{ text: 'SMCV' }],
          fontSize: 72,
          bold: true,
          italic: false,
          color: '#e05a5a',
          align: 'center',
          vAlign: 'top',
        },
        {
          id: 'cover-underline',
          kind: 'rect',
          x: (PAGE_W - 120) / 2,
          y: 417,
          w: 120,
          h: 4,
          rotation: 0,
          fill: '#e05a5a',
          radius: 0,
        },
        {
          id: 'cover-program',
          kind: 'text',
          x: 0,
          y: 437,
          w: PAGE_W,
          h: 34,
          rotation: 0,
          runs: [{ field: 'pathway.name' }],
          fontSize: 28,
          bold: true,
          italic: false,
          color: '#7c3aed',
          align: 'center',
          vAlign: 'top',
        },
        {
          id: 'cover-dates',
          kind: 'text',
          x: 0,
          y: 495,
          w: PAGE_W,
          h: 20,
          rotation: 0,
          runs: [{ field: 'program.dates' }],
          fontSize: 16,
          bold: true,
          italic: false,
          color: '#221755',
          align: 'center',
          vAlign: 'top',
        },
        {
          id: 'cover-patient',
          kind: 'text',
          x: MARGIN,
          // bottom: 48 ; la boite tient deux lignes de 32 pt et le nom s'ancre en bas.
          y: PAGE_H - 48 - 78,
          w: CONTENT_W,
          h: 78,
          rotation: 0,
          runs: [{ field: 'patient.name' }],
          fontSize: 32,
          bold: true,
          italic: false,
          color: '#221755',
          align: 'left',
          vAlign: 'bottom',
        },
      ],
    },
    { kind: 'calendar', id: 'calendar' },
    {
      kind: 'canvas',
      id: 'tips',
      background: '#ffffff',
      elements: [
        linesTopRight('tips-lines-tr'),
        {
          id: 'tips-title',
          kind: 'text',
          x: MARGIN,
          y: 96,
          w: CONTENT_W,
          h: 101,
          rotation: 0,
          runs: [{ text: 'Comment\nréussir\nson programme ?' }],
          fontSize: 28,
          bold: true,
          italic: false,
          color: '#221755',
          align: 'left',
          vAlign: 'top',
          lineHeight: 1.2,
        },
        ...tipElements(),
        {
          id: 'closing-box',
          kind: 'rect',
          x: MARGIN,
          y: PAGE_H - MARGIN - 91,
          w: CONTENT_W,
          h: 91,
          rotation: 0,
          fill: '#fce7f3',
          radius: 6,
        },
        {
          id: 'closing-text',
          kind: 'text',
          x: MARGIN + 12,
          y: PAGE_H - MARGIN - 79,
          w: CONTENT_W - 24,
          h: 38,
          rotation: 0,
          runs: [
            {
              text: "Souvenez-vous que ce programme est fait pour vous, et que chaque effort vous fait vous rapprocher d'un meilleur équilibre de vie. ",
              bold: true,
            },
            { text: "Toute l'équipe SMCV est là pour vous accompagner." },
          ],
          fontSize: 9,
          bold: false,
          italic: false,
          color: '#1f2937',
          align: 'left',
          vAlign: 'top',
          lineHeight: 1.4,
        },
        {
          id: 'closing-contact',
          kind: 'text',
          x: MARGIN + 12,
          y: PAGE_H - MARGIN - 37,
          w: CONTENT_W - 24,
          h: 25,
          rotation: 0,
          runs: [
            { text: "En cas de doute ou d'absence, merci de contacter le service au " },
            { text: '05 57 62 32 91', bold: true },
          ],
          fontSize: 9,
          bold: false,
          italic: false,
          color: '#1f2937',
          align: 'left',
          vAlign: 'top',
          lineHeight: 1.4,
        },
      ],
    },
  ],
}
```

- [ ] **Step 4: Lancer le test pour vérifier qu'il passe**

```bash
cd back && NODE_OPTIONS=--experimental-vm-modules npx jest -c src/test/jest.config.ts \
  --selectProjects unit src/test/unit/utils/pdf-design/reference-preset.test.ts
```

Attendu : PASS. Les valeurs par défaut du schéma (`rotation`, `bold`, `align`…) sont écrites en clair dans le preset pour que le type `PdfDesignContent` soit satisfait sans passer par `parse`.

- [ ] **Step 5: Lint et commit**

```bash
cd back && npm run lint
git add back/src/main/utils/pdf-design/reference-preset.ts \
        back/src/test/unit/utils/pdf-design/reference-preset.test.ts
git commit -m "feat(pdf): preset de reference, transcription des deux pages codees en dur"
```

---

### Task 3: Migration Prisma, tenant-guard et seed

**Files:**
- Modify: `back/prisma/schema.prisma` (ajouter deux modèles, deux relations sur `Service`)
- Create: `back/prisma/migrations/<timestamp>_pdf_designs/migration.sql` (généré)
- Modify: `back/src/main/infra/orm/tenant-guard.ts` (`SERVICE_MODELS`, `MODEL_RELATIONS`)
- Create: `back/prisma/seed/pdfDesignPreset.ts`
- Modify: `back/prisma/seed.ts` (appeler le seed, une fois, hors de la boucle des services)

**Interfaces:**
- Consumes: `REFERENCE_PRESET_ID`, `REFERENCE_PRESET_NAME`, `REFERENCE_PRESET_CONTENT` (tâche 2).
- Produces: les modèles Prisma `PdfDesignPreset` et `PdfDesign` ; `seedPdfDesignPresets(prisma)`.

- [ ] **Step 1: Ajouter les modèles au schéma**

Dans `back/prisma/schema.prisma`, à la suite de `IndicatorAnswer`. `PdfDesign` suit `IndicatorSet` : relation `service` déclarée, `@@unique([id, serviceId])`, `@@index([serviceId])`, et **pas** d'unicité sur le nom.

```prisma
// Design livre en lecture seule, visible par tous les services, gere par le super-admin.
// Modele GLOBAL : ni dans SERVICE_MODELS ni dans ESTABLISHMENT_MODELS.
model PdfDesignPreset {
  id         String    @id @default(cuid())
  name       String
  content    Json
  sortOrder  Int       @default(0)
  archivedAt DateTime?
  createdAt  DateTime  @default(now())
  updatedAt  DateTime  @updatedAt
}

// La copie modifiable d'un service. Le nom n'est pas unique : dupliquer deux fois le meme
// preset produit deux homonymes, et une unicite couplee a archivedAt reserverait le nom
// d'un design supprime.
model PdfDesign {
  id              String    @id @default(cuid())
  establishmentId String
  serviceId       String
  name            String
  content         Json
  // Le preset copie, pour memoire : aucune synchronisation, la copie est figee.
  sourcePresetId  String?
  isDefault       Boolean   @default(false)
  archivedAt      DateTime?
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  service Service @relation(fields: [serviceId, establishmentId], references: [id, establishmentId])

  @@unique([id, serviceId])
  @@index([serviceId])
}
```

Et sur `model Service`, ajouter la relation inverse à la suite de `indicatorSets` :

```prisma
  pdfDesigns          PdfDesign[]
```

- [ ] **Step 2: Lancer le test du guard pour le voir échouer**

```bash
cd back && NODE_OPTIONS=--experimental-vm-modules npx jest -c src/test/jest.config.ts \
  --selectProjects unit src/test/unit/infra/tenant-guard-schema.test.ts
```

Attendu : ÉCHEC — le test relit `schema.prisma` et réclame `PdfDesign` dans `SERVICE_MODELS`, les entrées `MODEL_RELATIONS` des deux nouveaux modèles, et `Service.pdfDesigns`.

- [ ] **Step 3: Déclarer les modèles dans le tenant-guard**

Dans `back/src/main/infra/orm/tenant-guard.ts` :

```ts
// SERVICE_MODELS, a la fin de la liste
  'PdfDesign',
```

```ts
// MODEL_RELATIONS, pres de IndicatorSet
  PdfDesign: {
    service: one('Service'),
  },
  // Global, sans aucune relation.
  PdfDesignPreset: {},
```

```ts
// MODEL_RELATIONS, entree Service : ajouter la relation inverse
    pdfDesigns: many('PdfDesign'),
```

- [ ] **Step 4: Relancer le test du guard**

```bash
cd back && NODE_OPTIONS=--experimental-vm-modules npx jest -c src/test/jest.config.ts \
  --selectProjects unit src/test/unit/infra/tenant-guard-schema.test.ts
```

Attendu : PASS. Si le test réclame une déclaration ailleurs (par exemple une table de relations imbriquées), suivre son message — il nomme ce qui manque.

- [ ] **Step 5: Créer et appliquer la migration**

```bash
cd back && npm run prisma:migrate:dev
```

Nommer la migration `pdf_designs`. Vérifier que le SQL généré est purement additif : deux `CREATE TABLE`, un index, une clé étrangère, aucun `ALTER` destructeur ni `DROP`.

- [ ] **Step 6: Écrire le seed**

`back/prisma/seed/pdfDesignPreset.ts`. L'`update: {}` est délibéré et reprend `seed/location.ts` : un rejeu ne réécrit pas le `content` d'un preset retouché par le super-admin.

```ts
import type { PrismaClient } from '../../src/generated/client'
import {
  REFERENCE_PRESET_CONTENT,
  REFERENCE_PRESET_ID,
  REFERENCE_PRESET_NAME,
} from '../../src/main/utils/pdf-design/reference-preset'

// Presets GLOBAUX : aucun tenant. L'update vide ne touche pas une ligne existante, pour qu'un
// rejeu du seed n'efface pas les retouches du super-admin.
export default async function seedPdfDesignPresets(prisma: PrismaClient) {
  console.log('→ Seeding PDF design presets...')

  await prisma.pdfDesignPreset.upsert({
    where: { id: REFERENCE_PRESET_ID },
    update: {},
    create: {
      id: REFERENCE_PRESET_ID,
      name: REFERENCE_PRESET_NAME,
      content: REFERENCE_PRESET_CONTENT,
      sortOrder: 0,
    },
  })

  console.log('✓ PDF design presets ready')
}
```

Dans `back/prisma/seed.ts`, importer et appeler **une seule fois**, hors de la boucle qui peuple chaque service (un preset n'appartient à aucun service) :

```ts
import seedPdfDesignPresets from './seed/pdfDesignPreset'
// …
await seedPdfDesignPresets(prisma)
```

- [ ] **Step 7: Rejouer le seed deux fois et vérifier l'absence d'écrasement**

```bash
cd back && npm run prisma:seed && npm run prisma:seed
```

Attendu : aucune erreur, et `✓ PDF design presets ready` deux fois. Puis vérifier qu'une retouche survit à un rejeu :

```bash
cd back && npm run prisma:studio
# Dans Studio : renommer le preset en "Zzz test", puis
npm run prisma:seed
# Le nom doit toujours etre "Zzz test". Le remettre a "Programme SMCV".
```

- [ ] **Step 8: Lint et commit**

```bash
cd back && npm run lint
git add back/prisma back/src/main/infra/orm/tenant-guard.ts
git commit -m "feat(pdf): tables PdfDesignPreset et PdfDesign, guard et seed du preset"
```

---

### Task 4: Repository, domaine et route de lecture

Une seule route à cette étape : la lecture des presets et des designs du service, en une réponse.

**Files:**
- Create: `back/src/main/types/infra/orm/repositories/pdf-design.repository.interface.ts`
- Create: `back/src/main/infra/orm/repositories/pdf-design.repository.ts`
- Create: `back/src/main/types/domain/pdf-design.domain.interface.ts`
- Create: `back/src/main/domain/pdf-design.domain.ts`
- Create: `back/src/main/interfaces/http/fastify/schemas/pdf-design.schema.ts`
- Create: `back/src/main/interfaces/http/fastify/routes/pdfDesign.ts`
- Modify: `back/src/main/application/ioc/awilix/awilix-ioc-container.ts`
- Modify: `back/src/main/types/application/ioc.ts`
- Modify: `back/src/main/interfaces/http/fastify/routes/tenant.routes.ts`
- Create: `back/src/test/e2e/pdf-design.e2e.test.ts`

**Interfaces:**
- Consumes: les modèles Prisma (tâche 3), `pdfDesignContentSchema` (tâche 1).
- Produces: `GET /e/:establishmentId/s/:serviceId/pdf-designs` → `{ presets: PdfDesignSummary[], designs: PdfDesignSummary[] }` où `PdfDesignSummary = { id, name, content, isDefault }` (`isDefault` toujours `false` pour un preset). Le domaine `pdfDesignDomain.findAllForService()`.

- [ ] **Step 1: Écrire le test e2e qui échoue**

`back/src/test/e2e/pdf-design.e2e.test.ts`. `twoServicesScenario` monte exactement ce qu'il faut : deux services du même établissement, un coordinateur dans chacun, les deux cookies prêts.

**Note sur la permission :** il n'existe aucun rôle de service sans `referentials:read` — elle est dans `READ_ALL`, donc accordée à `COORDINATEUR`, `INTERVENANT`, `SECRETARIAT` et `LECTURE`. Il n'y a donc pas de cas « appelant sans la permission » à écrire. Le vrai cloisonnement à prouver est qu'un membre du service A n'atteint pas le service B.

```ts
import type { FastifyInstance } from 'fastify'

import { buildTestApp } from './setup/app'
import { testDb, truncateAll } from './setup/db'
import { tenantUrl, twoServicesScenario } from './setup/fixtures'

const CONTENT = {
  version: 1,
  pages: [{ kind: 'canvas', id: 'p1', background: '#ffffff', elements: [] }],
}

describe('GET /pdf-designs', () => {
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

  const lire = (serviceId: string, cookies: { access_token: string }) =>
    app.inject({
      method: 'GET',
      url: tenantUrl(scenario.est.id, serviceId, '/pdf-designs'),
      cookies,
    })

  it('rend les presets globaux a un membre du service', async () => {
    const preset = await testDb.pdfDesignPreset.create({
      data: { name: 'Programme de reference', content: CONTENT, sortOrder: 0 },
    })

    const res = await lire(scenario.serviceA.id, scenario.cookiesA)

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.presets).toHaveLength(1)
    expect(body.presets[0]).toMatchObject({ id: preset.id, name: 'Programme de reference' })
    // Un preset n'est jamais le design par defaut.
    expect(body.presets[0].isDefault).toBe(false)
    expect(body.designs).toHaveLength(0)
  })

  it('rend les designs du service courant, et pas ceux d un autre service', async () => {
    await testDb.pdfDesign.create({
      data: {
        name: 'Design de A',
        content: CONTENT,
        establishmentId: scenario.est.id,
        serviceId: scenario.serviceA.id,
      },
    })
    await testDb.pdfDesign.create({
      data: {
        name: 'Design de B',
        content: CONTENT,
        establishmentId: scenario.est.id,
        serviceId: scenario.serviceB.id,
      },
    })

    const res = await lire(scenario.serviceA.id, scenario.cookiesA)

    expect(res.statusCode).toBe(200)
    expect(res.json().designs.map((d: { name: string }) => d.name)).toEqual(['Design de A'])
  })

  it('ne rend pas les designs supprimes', async () => {
    await testDb.pdfDesign.create({
      data: {
        name: 'Design archive',
        content: CONTENT,
        establishmentId: scenario.est.id,
        serviceId: scenario.serviceB.id,
        archivedAt: new Date(),
      },
    })

    const res = await lire(scenario.serviceB.id, scenario.cookiesB)

    expect(res.statusCode).toBe(200)
    expect(res.json().designs.map((d: { name: string }) => d.name)).toEqual(['Design de B'])
  })

  it('refuse a un membre du service A de lire sous le service B', async () => {
    const res = await lire(scenario.serviceB.id, scenario.cookiesA)
    // La resolution de tenant rend un 404, jamais un 403 : l'existence du service B ne fuit pas.
    expect(res.statusCode).toBe(404)
  })
})
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

```bash
cd back && NODE_OPTIONS=--experimental-vm-modules npm run with:dotenv -- \
  -e .env.test.local -e .env.test -- jest -c src/test/jest.config.ts \
  --selectProjects e2e src/test/e2e/pdf-design.e2e.test.ts
```

Attendu : ÉCHEC, 404 sur la route inexistante.

- [ ] **Step 3: Écrire le repository**

`back/src/main/infra/orm/repositories/pdf-design.repository.ts`. Le constructeur reçoit `tenantContext` et appelle `.scope()` **par méthode**, jamais à la construction — convention de `location.repository.ts`. Les presets sont globaux : aucun scope, et c'est permis sous contexte de tenant (`assertGlobalScope` sort avant la porte de permission).

```ts
import type { IocContainer } from '../../../types/application/ioc'
import type {
  PdfDesignEntityRepo,
  PdfDesignPresetEntityRepo,
  PdfDesignRepositoryInterface,
} from '../../../types/infra/orm/repositories/pdf-design.repository.interface'
import type { TenantContextInterface } from '../../../types/utils/tenant-context'
import type { PostgresPrismaClient } from '../postgres-client'

class PdfDesignRepository implements PdfDesignRepositoryInterface {
  private readonly prisma: PostgresPrismaClient
  private readonly tenantContext: TenantContextInterface

  constructor({ postgresOrm, tenantContext }: IocContainer) {
    this.prisma = postgresOrm.prisma
    this.tenantContext = tenantContext
  }

  private get scope() {
    return this.tenantContext.scope()
  }

  findAllForService(): Promise<PdfDesignEntityRepo[]> {
    return this.prisma.pdfDesign.findMany({
      where: { ...this.scope, archivedAt: null },
      orderBy: { createdAt: 'asc' },
    })
  }

  // Modele global : aucun filtre de tenant a porter, les presets sont les memes pour tous.
  findAllPresets(): Promise<PdfDesignPresetEntityRepo[]> {
    return this.prisma.pdfDesignPreset.findMany({
      where: { archivedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    })
  }
}

export { PdfDesignRepository }
```

`back/src/main/types/infra/orm/repositories/pdf-design.repository.interface.ts` :

```ts
import type { PdfDesign, PdfDesignPreset } from '../../../../generated/client'

export type PdfDesignEntityRepo = PdfDesign
export type PdfDesignPresetEntityRepo = PdfDesignPreset

export interface PdfDesignRepositoryInterface {
  findAllForService: () => Promise<PdfDesignEntityRepo[]>
  findAllPresets: () => Promise<PdfDesignPresetEntityRepo[]>
}
```

- [ ] **Step 4: Écrire le domaine**

`back/src/main/types/domain/pdf-design.domain.interface.ts` :

```ts
export type PdfDesignSummaryDomain = {
  id: string
  name: string
  content: unknown
  isDefault: boolean
}

export type PdfDesignListDomain = {
  presets: PdfDesignSummaryDomain[]
  designs: PdfDesignSummaryDomain[]
}

export interface PdfDesignDomainInterface {
  findAllForService: () => Promise<PdfDesignListDomain>
}
```

`back/src/main/domain/pdf-design.domain.ts` :

```ts
import type { IocContainer } from '../types/application/ioc'
import type {
  PdfDesignDomainInterface,
  PdfDesignListDomain,
} from '../types/domain/pdf-design.domain.interface'
import type { PdfDesignRepositoryInterface } from '../types/infra/orm/repositories/pdf-design.repository.interface'

class PdfDesignDomain implements PdfDesignDomainInterface {
  private readonly pdfDesignRepository: PdfDesignRepositoryInterface

  constructor({ pdfDesignRepository }: IocContainer) {
    this.pdfDesignRepository = pdfDesignRepository
  }

  async findAllForService(): Promise<PdfDesignListDomain> {
    const [presets, designs] = await Promise.all([
      this.pdfDesignRepository.findAllPresets(),
      this.pdfDesignRepository.findAllForService(),
    ])
    return {
      // Un preset n'est jamais le design par defaut : seul un design de service l'est.
      presets: presets.map((p) => ({
        id: p.id,
        name: p.name,
        content: p.content,
        isDefault: false,
      })),
      designs: designs.map((d) => ({
        id: d.id,
        name: d.name,
        content: d.content,
        isDefault: d.isDefault,
      })),
    }
  }
}

export { PdfDesignDomain }
```

- [ ] **Step 5: Écrire le schéma de réponse et la route**

`back/src/main/interfaces/http/fastify/schemas/pdf-design.schema.ts` :

```ts
import { z } from 'zod/v4'

import { pdfDesignContentSchema } from './pdf-design-content.schema'

const pdfDesignSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  content: pdfDesignContentSchema,
  isDefault: z.boolean(),
})

export const pdfDesignListResponseSchema = z.object({
  presets: z.array(pdfDesignSummarySchema),
  designs: z.array(pdfDesignSummarySchema),
})

export type PdfDesignListResponse = z.infer<typeof pdfDesignListResponseSchema>
```

Le `content` est validé **à la sortie** : un preset retouché à la main en base qui ne passe plus le schéma fait échouer la réponse plutôt que d'envoyer du JSON douteux au navigateur.

`back/src/main/interfaces/http/fastify/routes/pdfDesign.ts` :

```ts
import type { FastifyPluginAsync } from 'fastify'

import { pdfDesignListResponseSchema } from '../schemas/pdf-design.schema'

// Lecture seule a cette etape : les presets et les designs du service, en une reponse.
// L'ecran d'administration et la modale de generation ont besoin des deux.
const pdfDesignReadRouter: FastifyPluginAsync = (fastify) => {
  const { pdfDesignDomain } = fastify.iocContainer

  fastify.get(
    '/',
    {
      schema: { response: { 200: pdfDesignListResponseSchema } },
      config: { permission: 'referentials:read' },
    },
    () => pdfDesignDomain.findAllForService(),
  )

  return Promise.resolve()
}

export { pdfDesignReadRouter }
```

- [ ] **Step 6: Enregistrer dans le conteneur et sur le préfixe de tenant**

`back/src/main/types/application/ioc.ts` — ajouter les deux champs à `IocContainer` :

```ts
  readonly pdfDesignDomain: PdfDesignDomainInterface
  readonly pdfDesignRepository: PdfDesignRepositoryInterface
```

`back/src/main/application/ioc/awilix/awilix-ioc-container.ts` :

```ts
    this.register('pdfDesignDomain', asClass(PdfDesignDomain).singleton())
    this.register('pdfDesignRepository', asClass(PdfDesignRepository).singleton())
```

`back/src/main/interfaces/http/fastify/routes/tenant.routes.ts`, près de `indicatorSetRouter` :

```ts
  await fastify.register(pdfDesignReadRouter, { prefix: '/pdf-designs' })
```

- [ ] **Step 7: Relancer le test e2e**

```bash
cd back && NODE_OPTIONS=--experimental-vm-modules npm run with:dotenv -- \
  -e .env.test.local -e .env.test -- jest -c src/test/jest.config.ts \
  --selectProjects e2e src/test/e2e/pdf-design.e2e.test.ts
```

Attendu : PASS, 4 tests.

- [ ] **Step 8: Lancer toute la suite unitaire du back**

```bash
cd back && npm run test:unit
```

Attendu : vert. `repository-scope.test.ts` et `runAsSystem-unicite.test.ts` surveillent les nouveaux accès Prisma ; s'ils rougissent, ils nomment ce qu'il faut déclarer.

- [ ] **Step 9: Lint et commit**

```bash
cd back && npm run lint
git add back/src back/src/test
git commit -m "feat(pdf): route de lecture des designs, presets globaux et designs du service"
```

---

### Task 5: `resolveField`, côté front

**Files:**
- Create: `front/src/components/custom/pdf-design/fields.ts`
- Create: `front/src/components/custom/pdf-design/fields.test.ts`

**Interfaces:**
- Consumes: `PdfFieldKey` (tâche 1) ; `computeProgramDuration` de `../Patient/pdf/programme-pdf.utils.ts` ; les types `Patient`, `PatientPathway`, `Slot`.
- Produces: `type PdfFieldContext = { patient, pathways, upcomingSlots, serviceName }` ; `resolveField(key, ctx): string` ; `SAMPLE_FIELD_VALUES: Record<PdfFieldKey, string>` (pour l'éditeur, étape 2).

- [ ] **Step 1: Écrire le test qui échoue**

`front/src/components/custom/pdf-design/fields.test.ts` :

```ts
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import { describe, expect, it } from 'vitest'

import type { Patient, PatientPathway } from '../../../types/patient.ts'
import type { Slot } from '../../../types/slot.ts'
import { resolveField, type PdfFieldContext } from './fields.ts'

dayjs.extend(utc)

const patient = { id: 'p1', firstName: 'Jean', lastName: 'Dupont' } as Patient

const slot = (startDate: string) => ({ id: startDate, startDate, endDate: startDate }) as unknown as Slot

const ctx = (over: Partial<PdfFieldContext> = {}): PdfFieldContext => ({
  patient,
  pathways: [],
  upcomingSlots: [],
  serviceName: 'Cardiologie',
  ...over,
})

describe('resolveField', () => {
  it('rend le nom du patient en NOM Prenom', () => {
    expect(resolveField('patient.name', ctx())).toBe('Dupont Jean')
  })

  it('rend le nom du service', () => {
    expect(resolveField('service.name', ctx())).toBe('Cardiologie')
  })

  // Chaine de replis du code actuel : templateName, sinon templateMainTag, sinon « Programme ».
  it('rend le nom du modele de parcours quand il existe', () => {
    const pathways = [{ templateName: 'Readaptation', templateMainTag: 'RC' } as PatientPathway]
    expect(resolveField('pathway.name', ctx({ pathways }))).toBe('Readaptation')
  })

  it('se replie sur l etiquette principale quand le modele n a pas de nom', () => {
    const pathways = [{ templateName: null, templateMainTag: 'RC' } as unknown as PatientPathway]
    expect(resolveField('pathway.name', ctx({ pathways }))).toBe('RC')
  })

  it('se replie sur Programme quand le patient n a aucun parcours', () => {
    expect(resolveField('pathway.name', ctx())).toBe('Programme')
  })

  it('rend les dates du programme comme la couverture actuelle', () => {
    const slots = [slot('2026-05-11T09:00:00.000Z'), slot('2026-06-28T09:00:00.000Z')]
    expect(resolveField('program.dates', ctx({ upcomingSlots: slots }))).toBe('Du 11/05 au 28/06/2026')
  })

  // Review Focus 1 : aucun creneau a venir -> rien, jamais « Du Invalid Date ».
  it('rend une chaine vide quand le patient n a aucun creneau a venir', () => {
    expect(resolveField('program.dates', ctx())).toBe('')
  })
})
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

```bash
cd front && npx vitest run src/components/custom/pdf-design/fields.test.ts
```

Attendu : ÉCHEC, module introuvable.

- [ ] **Step 3: Écrire `fields.ts`**

```ts
import type { Patient, PatientPathway } from '../../../types/patient.ts'
import type { PdfFieldKey } from '../../../types/pdfDesign.ts'
import type { Slot } from '../../../types/slot.ts'
import { computeProgramDuration } from '../Patient/pdf/programme-pdf.utils.ts'

export type PdfFieldContext = {
  patient: Patient
  pathways: PatientPathway[]
  upcomingSlots: Slot[]
  serviceName: string
}

// Une donnee nouvelle = une entree ici plus son cas dans fields.test.ts.
const RESOLVERS: Record<PdfFieldKey, (ctx: PdfFieldContext) => string> = {
  'patient.name': ({ patient }) => `${patient.lastName} ${patient.firstName}`,
  'service.name': ({ serviceName }) => serviceName,
  'pathway.name': ({ pathways }) => {
    const first = pathways[0]
    return first?.templateName || first?.templateMainTag || 'Programme'
  },
  // Chaine vide, jamais « Du Invalid Date » : sans creneau a venir le texte disparait,
  // comme le <Text> conditionnel de la couverture actuelle.
  'program.dates': ({ upcomingSlots }) => {
    const duration = computeProgramDuration(upcomingSlots)
    if (!duration) {
      return ''
    }
    return `Du ${duration.startDate.format('DD/MM')} au ${duration.endDate.format('DD/MM/YYYY')}`
  },
}

export const resolveField = (key: PdfFieldKey, ctx: PdfFieldContext): string =>
  RESOLVERS[key](ctx)

// Affiche dans l'editeur a la place d'un vrai patient (etape 2).
export const SAMPLE_FIELD_VALUES: Record<PdfFieldKey, string> = {
  'patient.name': 'DUPONT Jean',
  'pathway.name': 'Réadaptation cardiaque',
  'program.dates': 'Du 12/05 au 28/06/2026',
  'service.name': 'SMCV',
}
```

- [ ] **Step 4: Lancer le test pour vérifier qu'il passe**

```bash
cd front && npx vitest run src/components/custom/pdf-design/fields.test.ts
```

Attendu : PASS, 7 tests. Si `templateName` n'est pas nullable sur `PatientPathway`, ajuster le test à la forme réelle du type plutôt que le resolver.

- [ ] **Step 5: Lint et commit**

```bash
cd front && npm run lint
git add front/src/components/custom/pdf-design/fields.ts \
        front/src/components/custom/pdf-design/fields.test.ts
git commit -m "feat(pdf): resolveField, les quatre donnees d'un design"
```

---

### Task 6: `render-pdf.tsx`, le moteur de rendu

**Files:**
- Create: `front/src/components/custom/pdf-design/render-pdf.tsx`
- Create: `front/src/components/custom/pdf-design/render-pdf.test.tsx`

**Interfaces:**
- Consumes: les types de `types/pdfDesign.ts` (tâche 1) ; `resolveField`, `PdfFieldContext` (tâche 5) ; `CalendarPages` de `../Patient/pdf/pages/calendar-pages.pdf.tsx` ; les deux images de `assets/images/pdf/`.
- Produces: `<DesignPages design={...} ctx={...} calendar={...} />`, qui rend la suite de `<Page>` d'un design. `type CalendarProps` = les props que `CalendarPages` attend, passées telles quelles.

- [ ] **Step 1: Écrire le test qui échoue**

Le test n'ouvre pas de PDF : il inspecte l'arbre React rendu par le moteur, ce qui suffit à prouver le mapping et les cas limites. `@react-pdf/renderer` n'aime pas `react-dom`, donc on lit l'arbre d'éléments produit, sans le monter.

`front/src/components/custom/pdf-design/render-pdf.test.tsx` :

```tsx
import { describe, expect, it } from 'vitest'

import type { PdfDesignContent, PdfElement } from '../../../types/pdfDesign.ts'
import { renderElement, pagesOf } from './render-pdf.tsx'

const geometry = { id: 'e1', x: 10, y: 20, w: 100, h: 30, rotation: 0 }

const texte: PdfElement = {
  ...geometry,
  kind: 'text',
  runs: [{ text: 'Bonjour ', bold: true, italic: false }, { field: 'patient.name', bold: false, italic: false }],
  fontSize: 12,
  bold: false,
  italic: false,
  color: '#221755',
  align: 'center',
  vAlign: 'bottom',
}

const ctx = {
  patient: { id: 'p1', firstName: 'Jean', lastName: 'Dupont' },
  pathways: [],
  upcomingSlots: [],
  serviceName: 'SMCV',
} as never

describe('renderElement', () => {
  it('place un element a ses coordonnees, en points', () => {
    const node = renderElement(texte, ctx)
    expect(node?.props.style).toMatchObject({
      position: 'absolute',
      left: 10,
      top: 20,
      width: 100,
      height: 30,
    })
  })

  it('traduit vAlign en justifyContent', () => {
    expect(renderElement(texte, ctx)?.props.style).toMatchObject({ justifyContent: 'flex-end' })
  })

  it('resout un run de donnee', () => {
    const rendu = JSON.stringify(renderElement(texte, ctx))
    expect(rendu).toContain('Dupont Jean')
    expect(rendu).toContain('Bonjour ')
  })

  it('rend un remplissage par jeton avec la couleur du parcours', () => {
    const rond: PdfElement = {
      ...geometry,
      kind: 'ellipse',
      fill: { token: 'pathway.color', fallback: '#e6aff6' },
    }
    const avecParcours = { ...ctx, pathways: [{ templateColor: '#123456' }] } as never
    expect(JSON.stringify(renderElement(rond, avecParcours))).toContain('#123456')
  })

  // Review Focus 2 : sans parcours, le repli du preset.
  it('se replie sur la couleur par defaut quand le patient n a pas de parcours', () => {
    const rond: PdfElement = {
      ...geometry,
      kind: 'ellipse',
      fill: { token: 'pathway.color', fallback: '#e6aff6' },
    }
    expect(JSON.stringify(renderElement(rond, ctx))).toContain('#e6aff6')
  })

  // Review Focus 4 : un kind inconnu n abat pas le PDF entier.
  it('ignore un element de type inconnu', () => {
    const inconnu = { ...geometry, kind: 'qrcode' } as unknown as PdfElement
    expect(renderElement(inconnu, ctx)).toBeNull()
  })
})

describe('pagesOf', () => {
  const design = (pages: PdfDesignContent['pages']): PdfDesignContent => ({ version: 1, pages })

  // Review Focus 5 : zero ou deux pages calendrier, comportement defini.
  it('rend une page calendrier a chaque occurrence', () => {
    const deux = design([
      { kind: 'calendar', id: 'c1' },
      { kind: 'calendar', id: 'c2' },
    ])
    expect(pagesOf(deux, ctx, {} as never)).toHaveLength(2)
  })

  it('ne rend aucun calendrier quand le design n en contient pas', () => {
    const sans = design([{ kind: 'canvas', id: 'p1', background: '#ffffff', elements: [] }])
    expect(pagesOf(sans, ctx, {} as never)).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

```bash
cd front && npx vitest run src/components/custom/pdf-design/render-pdf.test.tsx
```

Attendu : ÉCHEC, module introuvable.

- [ ] **Step 3: Écrire le moteur**

`front/src/components/custom/pdf-design/render-pdf.tsx`. `renderElement` et `pagesOf` sont exportés pour le test ; le composant `DesignPages` est ce que `ProgrammePDF` consomme.

```tsx
import { Ellipse, Image, Page, Svg, Text, View } from '@react-pdf/renderer'
import type { ReactElement } from 'react'

import lines from '../../../assets/images/pdf/lines.png'
import logoCHU from '../../../assets/images/pdf/logo_chx-bdx.png'
import type {
  PdfBuiltinImage,
  PdfDesignContent,
  PdfElement,
  PdfFill,
  PdfTextElement,
} from '../../../types/pdfDesign.ts'
import CalendarPages from '../Patient/pdf/pages/calendar-pages.pdf.tsx'
import { type PdfFieldContext, resolveField } from './fields.ts'

const BUILTIN_IMAGES: Record<PdfBuiltinImage, string> = {
  'logo-chu': logoCHU,
  lines,
}

const V_ALIGN: Record<PdfTextElement['vAlign'], string> = {
  top: 'flex-start',
  middle: 'center',
  bottom: 'flex-end',
}

// react-pdf cesure les mots par defaut : un nom un peu long se coupait en plein milieu
// (« Vandenboss-che »). Seul un mot trop large pour une ligne a lui seul est coupe.
const MAX_WORD_LENGTH = 18
const keepWordsWhole = (word: string) => {
  if (word.length <= MAX_WORD_LENGTH) {
    return [word]
  }
  const cut = Math.ceil(word.length / 2)
  return [word.slice(0, cut), word.slice(cut)]
}

const resolveFill = (fill: PdfFill, ctx: PdfFieldContext): string => {
  if (typeof fill === 'string') {
    return fill
  }
  return ctx.pathways[0]?.templateColor ?? fill.fallback
}

const fontOf = (bold: boolean) => (bold ? 'Helvetica-Bold' : 'Helvetica')

const box = (element: PdfElement) => ({
  position: 'absolute' as const,
  left: element.x,
  top: element.y,
  width: element.w,
  height: element.h,
  ...(element.rotation ? { transform: `rotate(${element.rotation}deg)` } : {}),
})

export function renderElement(
  element: PdfElement,
  ctx: PdfFieldContext,
): ReactElement | null {
  switch (element.kind) {
    case 'text':
      return (
        <View
          key={element.id}
          style={{
            ...box(element),
            display: 'flex',
            flexDirection: 'column',
            justifyContent: V_ALIGN[element.vAlign],
          }}
        >
          <Text
            hyphenationCallback={keepWordsWhole}
            style={{
              fontSize: element.fontSize,
              fontFamily: fontOf(element.bold),
              color: element.color,
              textAlign: element.align,
              ...(element.lineHeight ? { lineHeight: element.lineHeight } : {}),
            }}
          >
            {element.runs.map((run, index) => (
              <Text
                // Les runs n'ont pas d'identite propre : leur rang est leur cle.
                key={`${element.id}-${index}`}
                style={{
                  fontFamily: fontOf(element.bold || run.bold),
                  ...(run.italic ? { fontStyle: 'italic' } : {}),
                }}
              >
                {'field' in run ? resolveField(run.field, ctx) : run.text}
              </Text>
            ))}
          </Text>
        </View>
      )

    case 'rect':
      return (
        <View
          key={element.id}
          style={{
            ...box(element),
            backgroundColor: resolveFill(element.fill, ctx),
            borderRadius: element.radius,
          }}
        />
      )

    // Svg plutot qu'un borderRadius en pourcentage : une ellipse non circulaire doit rester
    // exacte. react-pdf 4.3.2 exporte Svg et Ellipse.
    case 'ellipse':
      return (
        <View key={element.id} style={box(element)}>
          <Svg width={element.w} height={element.h}>
            <Ellipse
              cx={element.w / 2}
              cy={element.h / 2}
              rx={element.w / 2}
              ry={element.h / 2}
              fill={resolveFill(element.fill, ctx)}
            />
          </Svg>
        </View>
      )

    case 'image': {
      if (!('builtin' in element.source)) {
        // Les images deposees par un service arrivent a l'etape 4.
        return null
      }
      return (
        <Image
          key={element.id}
          src={BUILTIN_IMAGES[element.source.builtin]}
          style={{ ...box(element), objectFit: element.fit }}
        />
      )
    }

    // Un kind inconnu (preset retouche a la main, version future) est ignore : le reste
    // du document s'imprime quand meme.
    default:
      return null
  }
}

type CalendarProps = Parameters<typeof CalendarPages>[0]

export function pagesOf(
  design: PdfDesignContent,
  ctx: PdfFieldContext,
  calendar: CalendarProps,
): ReactElement[] {
  return design.pages.map((page) =>
    page.kind === 'calendar' ? (
      <CalendarPages key={page.id} {...calendar} />
    ) : (
      <Page key={page.id} size="A4" style={{ backgroundColor: page.background, padding: 0 }}>
        {page.elements.map((element) => renderElement(element, ctx))}
      </Page>
    ),
  )
}

export default function DesignPages({
  design,
  ctx,
  calendar,
}: {
  design: PdfDesignContent
  ctx: PdfFieldContext
  calendar: CalendarProps
}) {
  return <>{pagesOf(design, ctx, calendar)}</>
}
```

- [ ] **Step 4: Lancer le test pour vérifier qu'il passe**

```bash
cd front && npx vitest run src/components/custom/pdf-design/render-pdf.test.tsx
```

Attendu : PASS, 9 tests. `pagesOf` rend un `CalendarPages` par page calendrier : le test compte les éléments du tableau, pas les `<Page>` finales (`CalendarPages` en émet plusieurs).

- [ ] **Step 5: Ajouter le test de Review Focus 3 — le nom long**

Ajouter au même fichier :

```tsx
it('garde les mots entiers et ne coupe que ceux trop larges pour une ligne', () => {
  const node = renderElement(texte, ctx)
  const callback = node?.props.children.props.hyphenationCallback
  expect(callback('Vandenbossche')).toEqual(['Vandenbossche'])
  expect(callback('Dupont')).toEqual(['Dupont'])
  // 19 caracteres : au-dela de la limite, coupe en deux.
  expect(callback('Aaaaaaaaaabbbbbbbbb')).toEqual(['Aaaaaaaaaa', 'bbbbbbbbb'])
})
```

- [ ] **Step 6: Relancer, lint, commit**

```bash
cd front && npx vitest run src/components/custom/pdf-design/render-pdf.test.tsx && npm run lint
git add front/src/components/custom/pdf-design/render-pdf.tsx \
        front/src/components/custom/pdf-design/render-pdf.test.tsx
git commit -m "feat(pdf): moteur de rendu d'un design vers react-pdf"
```

---

### Task 7: API et requête côté front

**Files:**
- Create: `front/src/api/pdfDesign.api.ts`
- Create: `front/src/queries/usePdfDesign.ts`
- Modify: `front/src/constants/process.constant.ts`
- Create: `front/src/types/pdfDesignList.ts`

**Interfaces:**
- Consumes: `PdfDesignContent` (tâche 1) ; `tenantApiUrl`, `fetchWithAuth`, `handleHttpError`, `useDataFetching`.
- Produces: `PdfDesignApi.getAll(): Promise<PdfDesignList>` ; `usePdfDesignQueries()` → `{ presets, designs, isPending, error }` ; `type PdfDesignSummary = { id, name, content, isDefault }`.

- [ ] **Step 1: Écrire les types et la clé de requête**

`front/src/types/pdfDesignList.ts` :

```ts
import type { PdfDesignContent } from './pdfDesign.ts'

export type PdfDesignSummary = {
  id: string
  name: string
  content: PdfDesignContent
  isDefault: boolean
}

export type PdfDesignList = {
  presets: PdfDesignSummary[]
  designs: PdfDesignSummary[]
}
```

Dans `front/src/constants/process.constant.ts`, à côté de `LOCATION` :

```ts
export const PDF_DESIGN = {
  GET_ALL: 'get_all_pdf_designs',
}
```

- [ ] **Step 2: Écrire le module d'API**

`front/src/api/pdfDesign.api.ts`. Le tenant n'est **pas** un argument : `tenantApiUrl()` le lit dans le store au moment de l'appel (`conventions-tenant-api-queries.test.ts`).

```ts
import { tenantApiUrl } from '../constants/config.constant.ts'
import { handleHttpError } from '../libs/httpErrorHandler.ts'
import type { PdfDesignList } from '../types/pdfDesignList.ts'
import { fetchWithAuth } from './fetchWithAuth.ts'

export const PdfDesignApi = {
  getAll: async (): Promise<PdfDesignList> => {
    const response = await fetchWithAuth(`${tenantApiUrl()}/pdf-designs`, { method: 'GET' })
    if (!response.ok) {
      handleHttpError(response, {}, 'Impossible de récupérer les designs de PDF')
    }
    return response.json()
  },
}
```

- [ ] **Step 3: Écrire la requête**

`front/src/queries/usePdfDesign.ts`. La `queryKey` ne porte pas le tenant : l'isolation vient d'un `QueryClient` neuf par couple établissement/service.

```ts
import { useQuery } from '@tanstack/react-query'

import { PdfDesignApi } from '../api/pdfDesign.api.ts'
import { PDF_DESIGN } from '../constants/process.constant.ts'
import { useDataFetching } from '../hooks/useDataFetching.ts'

export const usePdfDesignQueries = () => {
  const { data, isPending, isError, error } = useQuery({
    queryKey: [PDF_DESIGN.GET_ALL],
    queryFn: () => PdfDesignApi.getAll(),
    retry: 0,
  })

  useDataFetching({ isPending, isError, error })

  return {
    presets: data?.presets ?? [],
    designs: data?.designs ?? [],
    isPending,
    error,
  }
}
```

- [ ] **Step 4: Vérifier que le test de conventions reste vert**

```bash
cd front && npx vitest run src/test/conventions-tenant-api-queries.test.ts
```

Attendu : PASS. S'il rougit, c'est qu'un identifiant de tenant a été nommé dans l'un des deux nouveaux fichiers — le retirer, ne pas l'ajouter aux exceptions.

- [ ] **Step 5: Lint et commit**

```bash
cd front && npm run lint
git add front/src/api/pdfDesign.api.ts front/src/queries/usePdfDesign.ts \
        front/src/types/pdfDesignList.ts front/src/constants/process.constant.ts
git commit -m "feat(pdf): api et requete de lecture des designs"
```

---

### Task 8: `ProgrammePDF` lit un design, la modale le choisit

**Files:**
- Modify: `front/src/types/auth.ts` (un champ sur `TenantContext`)
- Modify: `front/src/utils/tenant-context.ts` (deux lignes, les deux seuls constructeurs)
- Modify: `front/src/components/custom/Patient/pdf/programme.pdf.tsx`
- Modify: `front/src/components/custom/Patient/pdf/programme-pdf-modal.tsx`

**Interfaces:**
- Consumes: `DesignPages` (tâche 6), `PdfFieldContext` (tâche 5), `usePdfDesignQueries` (tâche 7), `PdfDesignSummary`.
- Produces: `ProgrammePDF` prend désormais `design: PdfDesignContent` et `serviceName: string`, et perd `enabledOptionalPageIds`.

- [ ] **Step 1: Exposer le nom du service dans le contexte de tenant**

Le nom est **déjà** dans le store (`user.establishments[].services[].name`, `types/auth.ts`), mais `resolveTenantContext` ne le renvoie pas. Il le tient pourtant en main : c'est une ligne. Et seuls **deux** endroits construisent un `TenantContext`, tous deux dans `utils/tenant-context.ts`.

`front/src/types/auth.ts`, sur `TenantContext`, à côté de `serviceId` — même nullabilité, pour la même raison (un contexte d'administration n'a pas de service) :

```ts
  serviceName: string | null
```

`front/src/utils/tenant-context.ts`, dans `resolveTenantContext` (le `service` est déjà trouvé juste au-dessus) :

```ts
    serviceName: service.name,
```

Et dans `resolveEstablishmentContext`, à côté de `soignantId: null` :

```ts
    serviceName: null,
```

Puis compiler et corriger ce que le compilateur nomme — une fixture de test qui construit un `TenantContext` à la main, par exemple :

```bash
cd front && npx tsc -b
```

- [ ] **Step 2: Réécrire `ProgrammePDF`**

```tsx
import { Document } from '@react-pdf/renderer'

import type { Patient, PatientPathway } from '../../../../types/patient.ts'
import type { PdfDesignContent } from '../../../../types/pdfDesign.ts'
import type { Slot } from '../../../../types/slot.ts'
import DesignPages from '../../pdf-design/render-pdf.tsx'

interface ProgrammePDFProps {
  patient: Patient
  upcomingSlots: Slot[]
  pathways: PatientPathway[]
  design: PdfDesignContent
  serviceName: string
  forbiddenWeekStarts: string[]
  noticeByThematicId: Map<string, string>
}

export default function ProgrammePDF({
  patient,
  upcomingSlots,
  pathways,
  design,
  serviceName,
  forbiddenWeekStarts,
  noticeByThematicId,
}: ProgrammePDFProps) {
  return (
    <Document>
      <DesignPages
        design={design}
        ctx={{ patient, pathways, upcomingSlots, serviceName }}
        calendar={{
          upcomingSlots,
          patientId: patient.id,
          forbiddenWeekStarts,
          noticeByThematicId,
        }}
      />
    </Document>
  )
}
```

- [ ] **Step 3: Brancher le sélecteur dans la modale**

Dans `programme-pdf-modal.tsx` :

1. Remplacer les imports de `optional-pages.ts` par `usePdfDesignQueries` et le type `PdfDesignSummary`.
2. Supprimer `enabledOptionalPageIds`, `handleOptionalPageChange` et `optionalPageFilters`.
3. Ajouter la sélection, et le nom du service lu dans le contexte de tenant :

```tsx
const { presets, designs } = usePdfDesignQueries()
// Le nom du service vient du contexte, expose a l'etape 1 de cette tache.
const serviceName = useAuthStore((state) => state.context?.serviceName) ?? ''
const [selectedDesignId, setSelectedDesignId] = useState<string | null>(null)

// Tous les designs disponibles : ceux du service d'abord, puis les presets.
const availableDesigns = useMemo<PdfDesignSummary[]>(
  () => [...designs, ...presets],
  [designs, presets],
)

// Le design par defaut du service, sinon le premier disponible.
const selectedDesign = useMemo(
  () =>
    availableDesigns.find((d) => d.id === selectedDesignId) ??
    availableDesigns.find((d) => d.isDefault) ??
    availableDesigns[0],
  [availableDesigns, selectedDesignId],
)
```

4. Remplacer le `DropdownFilter` « Pages additionnelles » du header par un `<select>` natif — un choix unique, pas un filtre multiple :

```tsx
{availableDesigns.length > 1 && (
  <select
    className="border border-border rounded-md px-2 py-1 text-sm bg-background text-foreground"
    value={selectedDesign?.id ?? ''}
    onChange={(event) => setSelectedDesignId(event.target.value)}
    aria-label="Design du document"
  >
    {availableDesigns.map((design) => (
      <option key={design.id} value={design.id}>
        {design.name}
      </option>
    ))}
  </select>
)}
```

5. Le document ne se construit qu'une fois le design chargé :

```tsx
const pdfDocument = useMemo(
  () =>
    selectedDesign ? (
      <ProgrammePDF
        patient={patient}
        upcomingSlots={patientSlots}
        pathways={pathways}
        design={selectedDesign.content}
        serviceName={serviceName}
        forbiddenWeekStarts={forbiddenWeekStarts}
        noticeByThematicId={noticeByThematicId}
      />
    ) : null,
  [
    patient,
    patientSlots,
    pathways,
    selectedDesign,
    serviceName,
    forbiddenWeekStarts,
    noticeByThematicId,
  ],
)
```

Et garder `PDFDownloadLink`/`PDFViewer` derrière `pdfDocument &&` : sans design, ni téléchargement ni aperçu, avec un message « Aucun design disponible ».

- [ ] **Step 4: Vérifier la forme exacte du sélecteur de store**

`useAuthStore((state) => state.context?.serviceName)` suppose que le store expose un `context`. Vérifier le nom réel du champ et l'adapter :

```bash
cd front && grep -n "context\|deriveContext" src/store/useAuthStore.ts | head -20
```

Si le contexte n'est pas dans le store mais dérivé par route, lire le `serviceName` là où les autres écrans lisent leur contexte (`resolveTenantContext` avec les `params` de la route, comme `_settings.tsx`). Dans les deux cas, **ne pas créer de nouveau hook** : le champ existe maintenant sur `TenantContext`.

- [ ] **Step 5: Compiler et vérifier qu'il ne reste aucune référence morte**

```bash
cd front && npx tsc -b
```

Attendu : des erreurs sur les fichiers encore importés et supprimés à la tâche 9. Les erreurs qui pointent `optional-pages.ts` ou `cover-page.pdf.tsx` sont normales **à ce stade** et disparaissent à la tâche 9.

- [ ] **Step 6: Commit**

```bash
git add front/src/types/auth.ts front/src/utils/tenant-context.ts \
        front/src/components/custom/Patient/pdf/programme.pdf.tsx \
        front/src/components/custom/Patient/pdf/programme-pdf-modal.tsx
git commit -m "feat(pdf): le programme patient se rend depuis un design choisi"
```

---

### Task 9: Supprimer l'ancien code et vérifier à l'œil

C'est la tâche qui prouve la non-régression. Aucun test ne la remplace.

**Files:**
- Delete: `front/src/components/custom/Patient/pdf/pages/cover-page.pdf.tsx`
- Delete: `front/src/components/custom/Patient/pdf/pages/tips-page.pdf.tsx`
- Delete: `front/src/components/custom/Patient/pdf/optional-pages.ts`
- Delete: `front/src/components/custom/Patient/pdf/pages/test-page.pdf.tsx`
- Modify: `back/src/main/utils/pdf-design/reference-preset.ts` (ajustements de géométrie, s'il en faut)

- [ ] **Step 1: Capturer la référence AVANT de supprimer**

Lancer le front sur le port 4270 et le back sur 3000, ouvrir une fiche patient qui a des créneaux à venir **et** un parcours, ouvrir l'aperçu du programme, et enregistrer le PDF actuel sous `/tmp/programme-avant.pdf`.

```bash
cd front && npm run dev   # port 4270
# dans un autre terminal
cd back && npm run dev    # port 3000
```

Le compte de développement est dans `back/prisma/seed/user.ts`.

- [ ] **Step 2: Supprimer les quatre fichiers**

```bash
cd front/src/components/custom/Patient/pdf && \
  rm pages/cover-page.pdf.tsx pages/tips-page.pdf.tsx optional-pages.ts pages/test-page.pdf.tsx
```

- [ ] **Step 3: Compiler et traiter ce qui tombe**

```bash
cd front && npx tsc -b
```

Attendu : zéro erreur. Si `DropdownFilter` ou `FilePlus` ne sont plus utilisés dans la modale, retirer leurs imports — Biome le signalera sinon.

- [ ] **Step 4: Lancer toute la suite front**

```bash
cd front && npm run test
```

Attendu : vert. `programme-pdf.utils.test.ts` ne touche à aucun des fichiers supprimés et doit rester vert tel quel.

- [ ] **Step 5: Comparer les deux PDF, page par page**

Recharger l'aperçu, enregistrer sous `/tmp/programme-apres.pdf`, et comparer côte à côte :

- **Couverture** : position et taille du logo, les deux jeux de lignes en diagonale (angle et débordement), le rond et sa couleur, « SMCV » et son filet, le nom du parcours, les dates, le nom du patient en bas à gauche.
- **Calendrier** : identique par construction, c'est le même composant.
- **Conseils** : le titre sur trois lignes, les quatre pavés et leurs puces, et surtout **la hauteur de chaque pavé** — les quatre valeurs de `TIP_BOXES` sont des estimations. Un pavé trop court tronque son texte, trop long laisse un blanc.
- **Encadré de fin** : collé en bas, la phrase en gras enchaînée sans coupure sur la phrase normale, le numéro en gras.

- [ ] **Step 6: Corriger la géométrie du preset si nécessaire**

Ajuster `TIP_BOXES`, la hauteur de `closing-box` et les `y` du bloc centré de la couverture dans `reference-preset.ts`, puis :

```bash
cd back && npm run prisma:studio
# Supprimer la ligne du preset pour que le seed la recree avec le nouveau content :
# l'update vide du seed ne reecrit JAMAIS une ligne existante.
npm run prisma:seed
```

Recharger l'aperçu et recommencer l'étape 5 jusqu'à ce que les deux PDF se superposent. **Mettre à jour les valeurs épinglées** de `reference-preset.test.ts` à chaque ajustement — le test épingle, il ne dicte pas.

- [ ] **Step 7: Vérifier les trois cas limites à l'œil**

- Un patient **sans créneau à venir** : la ligne de dates disparaît, rien d'autre ne bouge.
- Un patient **sans parcours** : le sous-titre affiche « Programme », le rond est mauve `#e6aff6`.
- Un patient au **nom long** (en créer un dans Studio, par exemple `Vandenbossche-Delacroix Jean-Baptiste`) : la coupure tombe entre les mots et le nom reste dans la page.

- [ ] **Step 8: Lint des deux côtés et suite complète du back**

```bash
cd back && npm run lint && npm run test:unit
cd ../front && npm run lint && npm run test
```

Attendu : tout vert.

- [ ] **Step 9: Mettre le graphe à jour et commit**

```bash
cd /Users/couffinhal/Documents/MediSync && graphify update .
git add -A
git commit -m "refactor(pdf): supprime les pages codees en dur, le design les remplace"
```

- [ ] **Step 10: Fusionner dans main**

Reprendre `main` dans le worktree avant de fusionner vers `main` — `main` avance pendant le chantier.

```bash
git fetch origin && git merge main
# resoudre, relancer npm run test des deux cotes, puis fusionner vers main
```
