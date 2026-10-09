# Colonnes optionnelles de ReactTable — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permettre d'ajouter/retirer des colonnes d'une `ReactTable` en cochant dans une liste, de trier dessus et de filtrer les colonnes « à choix » par cases à cocher ; première adoption sur la liste des patients (champs Inclusion et Bilan du dossier de service).

**Architecture:** Les colonnes déclarent `meta.optional` (masquée par défaut, listée dans « Colonnes ») et `meta.choices` (étiquettes colorées + filtre). `ReactTable` s'appuie sur l'état TanStack existant (visibilité, filtres, tri, valeurs facettées, tout persisté en localStorage sous `filterId`) et rend une barre d'outils : contrôles de la page, un `DropdownFilter` par colonne à choix visible, le bouton « Colonnes ». Le back ajoute huit champs du sous-dossier de service à `GET /patient/with-tags`.

**Tech Stack:** React 19.0, TanStack Table 8.21, Radix DropdownMenu, Vitest + Testing Library (front) ; Fastify + Prisma + Zod v4, Jest (back). Lint/format : Biome.

**Spec:** `docs/superpowers/specs/2026-10-09-colonnes-optionnelles-design.md`

## Global Constraints

- Lint et format avec **Biome** uniquement, jamais ESLint/Prettier. Lancer Biome **sur les fichiers touchés seulement** (`npx biome check --write <fichiers>`), jamais sur `src` entier : cela reformate des fichiers hors sujet.
- **Jamais de `biome-ignore`** : corriger le code.
- Commentaires : une ligne ou rien, en français, pas de pavés.
- Valeurs stockées en base = **clés** des constantes de `front/src/constants/patient.constant.ts` (ex. `AVC`, `HDS`), jamais les libellés.
- Libellé du choix vide : exactement `Non renseigné` ; valeur interne : `__empty__`.
- Mémorisation : localStorage uniquement, clé `filterId`. La page Patients utilise `patient/${serviceId}/${userId}`.
- Les usages existants de `ReactTable` (sans `toolbar`, `toolbarEnd` ni colonne `optional`) doivent rendre exactement comme avant.
- Travail dans le worktree `.claude/worktrees/colonnes-optionnelles` (branche `worktree-colonnes-optionnelles`). Avant les tests back : `.env`, `.env.test`, `.env.test.local` copiés depuis le checkout principal, `npm ci`, `npm run prisma:generate` dans `back/` ; `npm ci` dans `front/`.

## Review Focus

1. **Filtre mémorisé sur une colonne masquée** (ou disparue) : au rechargement, il ne doit pas filtrer en silence des lignes sans filtre visible → effacé au montage (test Task 3).
2. **Pagination après filtrage** : `autoResetPageIndex: false` ; filtrer depuis la page 5 laisserait une page vide → chaque changement de filtre de colonne remet `pageIndex` à 0 (test Task 3).
3. **Masquer une colonne triée ou filtrée** : tri et filtre invisibles continueraient d'agir → masquer efface filtre et tri de la colonne (test Task 3).
4. **Changement de service sans démontage** : TanStack Router garde le composant monté quand `serviceId` change ; l'état lu à l'init resterait celui de l'ancien service et serait écrit sous la nouvelle clé → la page passe `key={filterId}` à `ReactTable` (Task 4).
5. **Compteur « Non renseigné »** : les vides sont `undefined` dans les valeurs facettées ; un compteur à 0 alors que des vides existent tromperait → test Task 3 avec une ligne vide.

---

### Task 1: Back — champs du dossier dans `GET /patient/with-tags`

**Files:**
- Modify: `back/src/main/infra/orm/repositories/patient.repository.ts` (méthode `findAllWithTags`, `select` de `serviceFiles` et `map`)
- Modify: `back/src/main/types/infra/orm/repositories/patient.repository.interface.ts` (`PatientWithTagsEntityRepo`)
- Modify: `back/src/main/interfaces/http/fastify/schemas/patient.schema.ts` (`patientWithTagsResponseSchema`)
- Modify: `front/src/types/patient.ts` (`PatientWithTags`)
- Test: `back/src/test/e2e/patient.test.ts` (describe « cloisonnement de la liste des patients par service »)

**Interfaces:**
- Produces: chaque ligne de `GET /patient/with-tags` porte `medicalDiagnosis`, `careMode`, `orientation`, `etpDecision`, `programType`, `nonInclusionDetails`, `stopReason`, `etpFinalOutcome`, de type `string | null` (null si vide ou sans sous-dossier). Côté front, `PatientWithTags` porte ces huit champs en `?: string | null`.

- [ ] **Step 1: Écrire le test e2e qui échoue**

Dans `back/src/test/e2e/patient.test.ts`, describe « cloisonnement… », juste après le test « un patient suivi dans les deux services apparait dans les deux listes… », ajouter :

```ts
  it('la liste porte les champs a choix du sous-dossier du service courant, pas ceux de l autre', async () => {
    const patientId = await createPatientInService(serviceAId, {
      firstName: 'Choix',
      lastName: 'Service',
    })
    await writeServiceFile(serviceAId, patientId, {
      medicalDiagnosis: 'AVC',
      careMode: 'HDJ',
      stopReason: 'REFUS',
    })
    await writeServiceFile(serviceBId, patientId, {
      medicalDiagnosis: 'AOMI',
    })

    type Ligne = {
      id: string
      medicalDiagnosis: string | null
      careMode: string | null
      stopReason: string | null
      etpFinalOutcome: string | null
    }
    const inA = ((await listWithTags(serviceAId)) as unknown as Ligne[]).find(
      (p) => p.id === patientId,
    )
    const inB = ((await listWithTags(serviceBId)) as unknown as Ligne[]).find(
      (p) => p.id === patientId,
    )
    expect(inA).toMatchObject({
      medicalDiagnosis: 'AVC',
      careMode: 'HDJ',
      stopReason: 'REFUS',
      etpFinalOutcome: null,
    })
    expect(inB).toMatchObject({
      medicalDiagnosis: 'AOMI',
      careMode: null,
      stopReason: null,
    })

    await testDb.patient.delete({ where: { id: patientId } })
  })
```

- [ ] **Step 2: Lancer le test et constater l'échec**

```bash
cd back && npm run prisma:migrate:deploy:test && NODE_OPTIONS=--experimental-vm-modules npx dotenv-cli@7.3.0 -e .env.test.local -e .env.test -- npx jest --runInBand --forceExit -c src/test/jest.config.ts --selectProjects e2e src/test/e2e/patient.test.ts -t "champs a choix"
```
Attendu : FAIL (`medicalDiagnosis` absent de la réponse : `toMatchObject` échoue sur `undefined`).

- [ ] **Step 3: Implémenter**

`patient.repository.interface.ts`, dans `PatientWithTagsEntityRepo`, après `exitDate?: Date | null` :

```ts
  // Champs a choix du sous-dossier du service courant ; seule `findAllWithTags` les pose.
  medicalDiagnosis?: string | null
  careMode?: string | null
  orientation?: string | null
  etpDecision?: string | null
  programType?: string | null
  nonInclusionDetails?: string | null
  stopReason?: string | null
  etpFinalOutcome?: string | null
```

`patient.repository.ts`, `findAllWithTags` : remplacer le `select` de `serviceFiles`

```ts
          select: { enrollmentIssues: true, entryDate: true, exitDate: true },
```
par
```ts
          select: {
            enrollmentIssues: true,
            entryDate: true,
            exitDate: true,
            medicalDiagnosis: true,
            careMode: true,
            orientation: true,
            etpDecision: true,
            programType: true,
            nonInclusionDetails: true,
            stopReason: true,
            etpFinalOutcome: true,
          },
```
et dans le `map`, remplacer
```ts
          entryDate: serviceFiles[0]?.entryDate ?? null,
          exitDate: serviceFiles[0]?.exitDate ?? null,
```
par
```ts
          entryDate: serviceFiles[0]?.entryDate ?? null,
          exitDate: serviceFiles[0]?.exitDate ?? null,
          medicalDiagnosis: serviceFiles[0]?.medicalDiagnosis ?? null,
          careMode: serviceFiles[0]?.careMode ?? null,
          orientation: serviceFiles[0]?.orientation ?? null,
          etpDecision: serviceFiles[0]?.etpDecision ?? null,
          programType: serviceFiles[0]?.programType ?? null,
          nonInclusionDetails: serviceFiles[0]?.nonInclusionDetails ?? null,
          stopReason: serviceFiles[0]?.stopReason ?? null,
          etpFinalOutcome: serviceFiles[0]?.etpFinalOutcome ?? null,
```

`patient.schema.ts`, dans `patientWithTagsResponseSchema`, après `exitDate: …` :

```ts
  medicalDiagnosis: z.string().nullable().optional(),
  careMode: z.string().nullable().optional(),
  orientation: z.string().nullable().optional(),
  etpDecision: z.string().nullable().optional(),
  programType: z.string().nullable().optional(),
  nonInclusionDetails: z.string().nullable().optional(),
  stopReason: z.string().nullable().optional(),
  etpFinalOutcome: z.string().nullable().optional(),
```

`front/src/types/patient.ts`, dans `PatientWithTags`, après `pathwayTagColors?: …` :

```ts
  // Champs a choix du sous-dossier du service courant (clés des constantes de patient.constant.ts).
  medicalDiagnosis?: string | null
  careMode?: string | null
  orientation?: string | null
  etpDecision?: string | null
  programType?: string | null
  nonInclusionDetails?: string | null
  stopReason?: string | null
  etpFinalOutcome?: string | null
```

- [ ] **Step 4: Relancer le test e2e, puis toute la suite patient**

Même commande qu'au Step 2 → PASS. Puis sans `-t` → toutes les suites PASS.
Typecheck : `cd back && npx tsc --noEmit -p . 2>&1 | grep -v "^src/test\|^  "` → aucune sortie (les erreurs préexistantes sous `src/test` sont hors sujet).

- [ ] **Step 5: Lint et commit**

```bash
cd back && npx biome check --write src/main/infra/orm/repositories/patient.repository.ts src/main/types/infra/orm/repositories/patient.repository.interface.ts src/main/interfaces/http/fastify/schemas/patient.schema.ts src/test/e2e/patient.test.ts
cd ../front && npx biome check --write src/types/patient.ts
cd .. && git add back/src front/src/types/patient.ts && git commit -m "feat(patients): champs a choix du dossier dans la liste des patients"
```

---

### Task 2: Palette et fabrique `choiceColumn`

**Files:**
- Create: `front/src/libs/choicePalette.ts`
- Create: `front/src/components/table/choiceColumn.tsx`
- Test: `front/src/components/table/choiceColumn.test.tsx`

**Interfaces:**
- Produces:
  - `choiceColor(index: number): string` (hex `#RRGGBB`, stable, modulo la palette)
  - `type Choice = { value: string; label: string }`
  - `EMPTY_CHOICE = '__empty__'`
  - `choiceLabel(choices: Choice[], value: string): string` (libellé, ou la valeur brute si inconnue)
  - `matchesChoice(value: string | undefined, selected: string[]): boolean`
  - `choiceColumn<TData>(id: string, accessor: (row: TData) => string | null | undefined, options: { label: string; group?: string; choices: Choice[] }): ColumnDef<TData, string | undefined>` — `meta` = `{ optional: { label, group }, choices }`, `sortUndefined: 'last'`.

- [ ] **Step 1: Écrire les tests qui échouent**

`front/src/components/table/choiceColumn.test.tsx` :

```tsx
import {
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { render, renderHook, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { choiceColor } from '../../libs/choicePalette.ts'
import {
  type Choice,
  choiceColumn,
  choiceLabel,
  EMPTY_CHOICE,
  matchesChoice,
} from './choiceColumn.tsx'

type Ligne = { id: string; diag: string | null }

const CHOIX: Choice[] = [
  { value: 'CORONAROPATHIE', label: 'Coronaropathie' },
  { value: 'AVC', label: 'AVC' },
  { value: 'AOMI', label: 'Aomi' },
]

const lignes: Ligne[] = [
  { id: '1', diag: 'CORONAROPATHIE' },
  { id: '2', diag: null },
  { id: '3', diag: 'AOMI' },
  { id: '4', diag: 'AVC' },
]

const colonne = choiceColumn<Ligne>('diag', (l) => l.diag, {
  label: 'Diagnostic',
  group: 'Inclusion',
  choices: CHOIX,
})

const table = (sorting = [{ id: 'diag', desc: false }], filtre?: string[]) =>
  renderHook(() =>
    useReactTable({
      data: lignes,
      columns: [colonne],
      state: {
        sorting,
        columnFilters: filtre ? [{ id: 'diag', value: filtre }] : [],
      },
      getRowId: (l) => l.id,
      getCoreRowModel: getCoreRowModel(),
      getSortedRowModel: getSortedRowModel(),
      getFilteredRowModel: getFilteredRowModel(),
    }),
  ).result.current

describe('choiceColumn', () => {
  it('trie sur le libelle, vides en dernier, dans les deux sens', () => {
    expect(table().getRowModel().rows.map((r) => r.id)).toEqual([
      '3',
      '4',
      '1',
      '2',
    ])
    expect(
      table([{ id: 'diag', desc: true }])
        .getRowModel()
        .rows.map((r) => r.id),
    ).toEqual(['1', '4', '3', '2'])
  })

  it('filtre en OU, et Non renseigne retient les vides', () => {
    expect(
      table([], ['AVC', EMPTY_CHOICE])
        .getRowModel()
        .rows.map((r) => r.id),
    ).toEqual(['2', '4'])
  })

  it('matchesChoice traite undefined comme vide', () => {
    expect(matchesChoice(undefined, [EMPTY_CHOICE])).toBe(true)
    expect(matchesChoice('AVC', [EMPTY_CHOICE])).toBe(false)
  })

  it('libelle connu ou valeur brute', () => {
    expect(choiceLabel(CHOIX, 'AOMI')).toBe('Aomi')
    expect(choiceLabel(CHOIX, 'INCONNU')).toBe('INCONNU')
  })

  it('declare la colonne optionnelle et ses choix', () => {
    expect(colonne.meta).toEqual({
      optional: { label: 'Diagnostic', group: 'Inclusion' },
      choices: CHOIX,
    })
  })

  it('couleur stable par position, palette bouclee', () => {
    expect(choiceColor(1)).toBe(choiceColor(1))
    expect(choiceColor(0)).not.toBe(choiceColor(1))
    expect(choiceColor(0)).toBe(choiceColor(10))
  })

  it('cellule : etiquette avec libelle, rien si vide, valeur brute si inconnue', () => {
    const Cellule = colonne.cell as (ctx: {
      getValue: () => string | undefined
    }) => React.ReactNode
    const { container, rerender } = render(
      <>{Cellule({ getValue: () => 'AOMI' })}</>,
    )
    expect(screen.getByText('Aomi')).toBeTruthy()
    rerender(<>{Cellule({ getValue: () => undefined })}</>)
    expect(container.textContent).toBe('')
    rerender(<>{Cellule({ getValue: () => 'INCONNU' })}</>)
    expect(screen.getByText('INCONNU')).toBeTruthy()
  })
})
```

- [ ] **Step 2: Lancer et constater l'échec**

`cd front && npx vitest run src/components/table/choiceColumn.test.tsx` → FAIL (modules introuvables).

- [ ] **Step 3: Implémenter**

`front/src/libs/choicePalette.ts` :

```ts
// Couleurs des colonnes à choix, attribuées selon la position de la valeur dans sa liste.
const CHOICE_PALETTE = [
  '#3B82F6',
  '#10B981',
  '#F59E0B',
  '#EF4444',
  '#8B5CF6',
  '#EC4899',
  '#14B8A6',
  '#F97316',
  '#6366F1',
  '#84CC16',
] as const

export const choiceColor = (index: number): string =>
  CHOICE_PALETTE[index % CHOICE_PALETTE.length] ?? CHOICE_PALETTE[0]
```

`front/src/components/table/choiceColumn.tsx` :

```tsx
import type { ColumnDef, FilterFn } from '@tanstack/react-table'

import { choiceColor } from '../../libs/choicePalette.ts'
import { Etiquette } from './etiquette.tsx'

export type Choice = { value: string; label: string }

// Valeur de filtre qui retient les lignes sans valeur (« Non renseigné »).
export const EMPTY_CHOICE = '__empty__'

export const choiceLabel = (choices: Choice[], value: string) =>
  choices.find((c) => c.value === value)?.label ?? value

export const matchesChoice = (value: string | undefined, selected: string[]) =>
  selected.includes(value ?? EMPTY_CHOICE)

export function choiceColumn<TData>(
  id: string,
  accessor: (row: TData) => string | null | undefined,
  options: { label: string; group?: string; choices: Choice[] },
): ColumnDef<TData, string | undefined> {
  const { label, group, choices } = options
  const indexOf = new Map(choices.map((c, i) => [c.value, i]))

  const filterFn: FilterFn<TData> = (row, columnId, selected: string[]) =>
    matchesChoice(row.getValue<string | undefined>(columnId), selected)
  filterFn.autoRemove = (v) => !Array.isArray(v) || v.length === 0

  return {
    id,
    accessorFn: (row) => accessor(row) ?? undefined,
    header: label,
    sortUndefined: 'last',
    sortingFn: (a, b, columnId) =>
      choiceLabel(choices, a.getValue<string>(columnId)).localeCompare(
        choiceLabel(choices, b.getValue<string>(columnId)),
        'fr',
      ),
    filterFn,
    cell: ({ getValue }) => {
      const value = getValue()
      if (!value) {
        return null
      }
      const index = indexOf.get(value)
      return (
        <Etiquette
          ton="neutre"
          couleur={index === undefined ? undefined : choiceColor(index)}
        >
          {choiceLabel(choices, value)}
        </Etiquette>
      )
    },
    meta: { optional: { label, group }, choices },
  }
}
```

- [ ] **Step 4: Relancer les tests**

`cd front && npx vitest run src/components/table/choiceColumn.test.tsx` → PASS (7 tests).
Si le cast de `colonne.cell` gêne le typecheck, garder le test tel quel : `npx tsc --noEmit -p tsconfig.app.json` doit rester sans erreur.

- [ ] **Step 5: Lint et commit**

```bash
cd front && npx biome check --write src/libs/choicePalette.ts src/components/table/choiceColumn.tsx src/components/table/choiceColumn.test.tsx
cd .. && git add front/src && git commit -m "feat(table): fabrique de colonnes a choix et palette"
```

---

### Task 3: `ReactTable` — colonnes optionnelles, filtres, sélecteur de colonnes

**Files:**
- Modify: `front/src/components/table/reactTable.tsx`
- Create: `front/src/components/table/choiceFilters.tsx`
- Create: `front/src/components/table/columnPicker.tsx`
- Delete: `front/src/components/table/columnVisibilityMenu.tsx` (entièrement commenté, aucun import : vérifier par `grep -rn columnVisibilityMenu front/src` avant suppression)
- Test: `front/src/components/table/reactTable.test.tsx`

**Interfaces:**
- Consumes (Task 2) : `Choice`, `EMPTY_CHOICE`, `choiceColor`, `choiceColumn`.
- Produces :
  - `CustomMeta` gagne `optional?: { label: string; group?: string }` et `choices?: Choice[]`.
  - Props de `ReactTable` : `toolbar?: ReactNode` (à gauche), `toolbarEnd?: ReactNode` (à droite, après un filet), `resetSignal?: number` (chaque changement vide les filtres de colonnes), `onColumnFiltersActiveChange?: (active: boolean) => void`.
  - La barre d'outils (`role="toolbar"`, `aria-label="Filtres du tableau"`) n'est rendue que si `toolbar`, `toolbarEnd` ou au moins une colonne `optional` existe. `toolbarEnd` précise la spec : l'export de la page reste à droite, après les filtres de colonnes.

- [ ] **Step 1: Écrire les tests qui échouent**

`front/src/components/table/reactTable.test.tsx` :

```tsx
import { createColumnHelper } from '@tanstack/react-table'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { choiceColumn } from './choiceColumn.tsx'
import { ReactTable } from './reactTable.tsx'

// jsdom mesure un conteneur nul : le virtualiseur réel ne rendrait aucune ligne.
vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: (options: { count: number; estimateSize: () => number }) => ({
    getVirtualItems: () =>
      Array.from({ length: options.count }, (_, index) => ({
        index,
        start: index * options.estimateSize(),
        end: (index + 1) * options.estimateSize(),
        size: options.estimateSize(),
      })),
    getTotalSize: () => options.count * options.estimateSize(),
    scrollToIndex: () => undefined,
    measure: () => undefined,
    measureElement: () => undefined,
  }),
}))

type Ligne = { id: string; nom: string; diag: string | null }

const helper = createColumnHelper<Ligne>()
const colonnes = [
  helper.accessor('nom', { header: 'Nom' }),
  choiceColumn<Ligne>('diag', (l) => l.diag, {
    label: 'Diagnostic médical',
    group: 'Inclusion',
    choices: [
      { value: 'AOMI', label: 'AOMI' },
      { value: 'AVC', label: 'AVC' },
    ],
  }),
]
const lignes: Ligne[] = [
  { id: '1', nom: 'Alpha', diag: 'AVC' },
  { id: '2', nom: 'Bravo', diag: 'AOMI' },
  { id: '3', nom: 'Charlie', diag: null },
]

const noms = () =>
  ['Alpha', 'Bravo', 'Charlie'].filter((n) => screen.queryByText(n))

const afficherColonne = async (label: string) => {
  await userEvent.click(screen.getByRole('button', { name: /Colonnes/ }))
  await userEvent.click(
    await screen.findByRole('menuitemcheckbox', { name: label }),
  )
  await userEvent.keyboard('{Escape}')
}

const barre = () => within(screen.getByRole('toolbar'))

const cocherFiltre = async (colonne: string, choix: RegExp) => {
  await userEvent.click(barre().getByRole('button', { name: colonne }))
  await userEvent.click(
    await screen.findByRole('menuitemcheckbox', { name: choix }),
  )
  await userEvent.keyboard('{Escape}')
}

describe('ReactTable : colonnes optionnelles', () => {
  it('masque une colonne optionnelle par defaut, sans filtre', () => {
    render(<ReactTable data={lignes} columns={colonnes} filterId="t" />)
    expect(screen.queryByText('Diagnostic médical')).toBeNull()
    expect(screen.getByRole('button', { name: /Colonnes/ })).toBeTruthy()
  })

  it('cocher la colonne l affiche avec son filtre, et le filtre ne garde que les lignes cochees', async () => {
    render(<ReactTable data={lignes} columns={colonnes} filterId="t" />)
    await afficherColonne('Diagnostic médical')

    expect(screen.getByRole('columnheader', { name: /Diagnostic médical/ }))
      .toBeTruthy()
    await cocherFiltre('Diagnostic médical', /^AVC/)
    expect(noms()).toEqual(['Alpha'])
    expect(
      barre().getByRole('button', { name: 'Diagnostic médical · 1' }),
    ).toBeTruthy()
  })

  it('compte et filtre les vides sous Non renseigne', async () => {
    render(<ReactTable data={lignes} columns={colonnes} filterId="t" />)
    await afficherColonne('Diagnostic médical')
    await userEvent.click(
      barre().getByRole('button', { name: 'Diagnostic médical' }),
    )
    const item = await screen.findByRole('menuitemcheckbox', {
      name: /Non renseigné/,
    })
    expect(within(item).getByText('1')).toBeTruthy()
    await userEvent.click(item)
    await userEvent.keyboard('{Escape}')
    expect(noms()).toEqual(['Charlie'])
  })

  it('masquer la colonne efface son filtre et son tri', async () => {
    render(<ReactTable data={lignes} columns={colonnes} filterId="t" />)
    await afficherColonne('Diagnostic médical')
    await userEvent.click(
      screen.getByRole('columnheader', { name: /Diagnostic médical/ })
        .querySelector('button') as HTMLElement,
    )
    await cocherFiltre('Diagnostic médical', /^AVC/)
    await afficherColonne('Diagnostic médical')

    expect(noms()).toEqual(['Alpha', 'Bravo', 'Charlie'])
    expect(JSON.parse(localStorage.getItem('filters/t') ?? '[]')).toEqual([])
    expect(JSON.parse(localStorage.getItem('sorting/t') ?? '[]')).toEqual([])
  })

  it('memorise visibilite et filtre, et ignore au chargement un filtre sur une colonne masquee', () => {
    localStorage.setItem('column-visibility/t', JSON.stringify({ diag: false }))
    localStorage.setItem(
      'filters/t',
      JSON.stringify([{ id: 'diag', value: ['AVC'] }]),
    )
    render(<ReactTable data={lignes} columns={colonnes} filterId="t" />)
    expect(noms()).toEqual(['Alpha', 'Bravo', 'Charlie'])
  })

  it('restaure une colonne visible et son filtre', () => {
    localStorage.setItem('column-visibility/t', JSON.stringify({ diag: true }))
    localStorage.setItem(
      'filters/t',
      JSON.stringify([{ id: 'diag', value: ['AOMI'] }]),
    )
    render(<ReactTable data={lignes} columns={colonnes} filterId="t" />)
    expect(noms()).toEqual(['Bravo'])
  })

  it('resetSignal vide les filtres et previent la page', async () => {
    const onActive = vi.fn()
    const { rerender } = render(
      <ReactTable
        data={lignes}
        columns={colonnes}
        filterId="t"
        resetSignal={0}
        onColumnFiltersActiveChange={onActive}
      />,
    )
    await afficherColonne('Diagnostic médical')
    await cocherFiltre('Diagnostic médical', /^AVC/)
    expect(onActive).toHaveBeenLastCalledWith(true)

    rerender(
      <ReactTable
        data={lignes}
        columns={colonnes}
        filterId="t"
        resetSignal={1}
        onColumnFiltersActiveChange={onActive}
      />,
    )
    expect(noms()).toEqual(['Alpha', 'Bravo', 'Charlie'])
    expect(onActive).toHaveBeenLastCalledWith(false)
  })

  it('filtrer revient a la premiere page', async () => {
    const beaucoup: Ligne[] = Array.from({ length: 30 }, (_, i) => ({
      id: String(i),
      nom: `P${String(i).padStart(2, '0')}`,
      diag: i === 0 ? 'AVC' : 'AOMI',
    }))
    render(
      <ReactTable data={beaucoup} columns={colonnes} filterId="t" pagination />,
    )
    await userEvent.click(screen.getByRole('button', { name: '2' }))
    expect(screen.queryByText('P00')).toBeNull()
    await afficherColonne('Diagnostic médical')
    await cocherFiltre('Diagnostic médical', /^AVC/)
    expect(screen.getByText('P00')).toBeTruthy()
  })

  it('sans toolbar ni colonne optionnelle, aucune barre d outils', () => {
    render(
      <ReactTable data={lignes} columns={[colonnes[0]]} filterId="t" />,
    )
    expect(screen.queryByRole('button', { name: /Colonnes/ })).toBeNull()
  })
})
```

Note pour l'implémenteur : vérifier dans `paginationTable.tsx` comment est nommé le bouton de la page 2 ; si ce n'est pas `'2'`, adapter le sélecteur du test « filtrer revient a la premiere page » (le comportement testé ne change pas).

- [ ] **Step 2: Lancer et constater l'échec**

`cd front && npx vitest run src/components/table/reactTable.test.tsx` → FAIL (pas de bouton « Colonnes », colonne optionnelle visible).

- [ ] **Step 3: `choiceFilters.tsx`**

```tsx
import type { Table } from '@tanstack/react-table'
import { RotateCcw } from 'lucide-react'

import { choiceColor } from '../../libs/choicePalette.ts'
import DropdownFilter from '../ui/dropdownFilter.tsx'
import { EMPTY_CHOICE } from './choiceColumn.tsx'
import type { CustomMeta } from './reactTable.tsx'

// Un filtre à cocher par colonne à choix visible.
export function ChoiceFilters<TData>({ table }: { table: Table<TData> }) {
  return table.getVisibleLeafColumns().map((column) => {
    const meta = column.columnDef.meta as CustomMeta<TData, unknown> | undefined
    if (!meta?.choices) {
      return null
    }
    const label = meta.optional?.label ?? column.id
    const selected = (column.getFilterValue() as string[] | undefined) ?? []
    const counts = column.getFacetedUniqueValues()
    const setSelected = (next: string[]) => {
      column.setFilterValue(next.length ? next : undefined)
      table.setPageIndex(0)
    }
    const items = [
      ...meta.choices.map((choice, index) => ({
        id: choice.value,
        label: choice.label,
        color: choiceColor(index),
        checked: selected.includes(choice.value),
        count: counts.get(choice.value) ?? 0,
      })),
      {
        id: EMPTY_CHOICE,
        label: 'Non renseigné',
        checked: selected.includes(EMPTY_CHOICE),
        count: counts.get(undefined) ?? 0,
      },
    ]
    return (
      <DropdownFilter
        key={column.id}
        filters={items}
        triggerLabel={selected.length ? `${label} · ${selected.length}` : label}
        onFilterChange={(id, checked) =>
          setSelected(
            checked ? [...selected, id] : selected.filter((v) => v !== id),
          )
        }
        headerAction={
          selected.length
            ? { label: 'Tout effacer', icon: RotateCcw, onSelect: () => setSelected([]) }
            : undefined
        }
      />
    )
  })
}
```

- [ ] **Step 4: `columnPicker.tsx`**

```tsx
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import type { Column, Table } from '@tanstack/react-table'
import { Check, Columns3 } from 'lucide-react'
import { Fragment } from 'react'

import { Button } from '../ui/button.tsx'
import type { CustomMeta } from './reactTable.tsx'

const optionalOf = <TData,>(column: Column<TData, unknown>) =>
  (column.columnDef.meta as CustomMeta<TData, unknown> | undefined)?.optional

// Liste à cocher des colonnes optionnelles ; masquer efface filtre et tri.
export function ColumnPicker<TData>({ table }: { table: Table<TData> }) {
  const columns = table.getAllLeafColumns().filter((c) => optionalOf(c))
  if (columns.length === 0) {
    return null
  }

  const toggle = (column: Column<TData, unknown>, visible: boolean) => {
    if (!visible) {
      column.setFilterValue(undefined)
      table.setSorting((s) => s.filter((x) => x.id !== column.id))
    }
    column.toggleVisibility(visible)
  }

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <Button variant="outline" className="font-normal rounded-lg">
          <Columns3 size={16} />
          Colonnes
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className="min-w-[220px] max-h-80 overflow-y-auto bg-primary-foreground rounded shadow-md border border-border p-2 z-50"
          align="end"
          sideOffset={5}
          collisionPadding={8}
        >
          {columns.map((column, index) => {
            const { label, group } = optionalOf(column) ?? { label: column.id }
            const previous = columns[index - 1]
            const startsGroup =
              Boolean(group) &&
              group !== (previous ? optionalOf(previous)?.group : undefined)
            const visible = column.getIsVisible()
            return (
              <Fragment key={column.id}>
                {startsGroup && (
                  <>
                    {index > 0 && (
                      <DropdownMenu.Separator className="my-2 h-px bg-border" />
                    )}
                    <DropdownMenu.Label className="px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-text-light select-none">
                      {group}
                    </DropdownMenu.Label>
                  </>
                )}
                <DropdownMenu.CheckboxItem
                  checked={visible}
                  onCheckedChange={(checked) => toggle(column, checked)}
                  onSelect={(e) => e.preventDefault()}
                  className="flex items-center gap-2 px-3 py-2 rounded cursor-pointer outline-none hover:bg-primary/20"
                >
                  <div className="w-4 h-4 border border-primary rounded flex items-center justify-center">
                    {visible && (
                      <Check size={12} strokeWidth={3} className="text-primary" />
                    )}
                  </div>
                  <span className="flex-1 text-sm select-none">{label}</span>
                </DropdownMenu.CheckboxItem>
              </Fragment>
            )
          })}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}
```

- [ ] **Step 5: Modifier `reactTable.tsx`**

5a. Imports : ajouter `import { type Choice } from './choiceColumn.tsx'` (type seul), `import { ChoiceFilters } from './choiceFilters.tsx'`, `import { ColumnPicker } from './columnPicker.tsx'`.

5b. `CustomMeta`, après `colSpan` :

```ts
  // Colonne masquée par défaut, que l'utilisateur ajoute depuis « Colonnes ».
  optional?: { label: string; group?: string }
  // Colonne à choix : étiquettes colorées et filtre à cocher dans la barre d'outils.
  choices?: Choice[]
```

5c. `ReactTableProps`, ajouter :

```ts
  // Contrôles de la page, à gauche et à droite de la barre d'outils.
  toolbar?: ReactNode
  toolbarEnd?: ReactNode
  // Chaque changement de valeur vide les filtres de colonnes.
  resetSignal?: number
  onColumnFiltersActiveChange?: (active: boolean) => void
```
et les déstructurer dans la signature de `ReactTable`.

5d. Remplacer l'initialisation de `initialColumnVisibility` par :

```ts
  const optionalDefaults: VisibilityState = Object.fromEntries(
    columns
      .filter((c) => c.meta?.optional && c.id)
      .map((c) => [c.id as string, false]),
  )
  const initialColumnVisibility: VisibilityState = {
    ...optionalDefaults,
    ...safeParse(localStorage.getItem(`column-visibility/${filterId}`), {}),
  }
```
(`choiceColumn` pose toujours `id` ; une colonne optionnelle déclarée à la main doit aussi avoir un `id` explicite.)

5e. Remplacer l'initialisation de `initialColumnFilters` par un filtre sur la visibilité :

```ts
  const initialColumnFilters = safeParse<ColumnFiltersState>(
    localStorage.getItem(`filters/${filterId}`),
    [],
  ).filter((f) => initialColumnVisibility[f.id] !== false)
```
(Déplacer ce bloc après 5d.) Puis, juste après la création de `table`, retirer les filtres dont la colonne n'existe plus :

```ts
  useEffect(() => {
    const ids = new Set(table.getAllLeafColumns().map((c) => c.id))
    setColumnFilters((fs) => fs.filter((f) => ids.has(f.id)))
  }, [table])
```

5f. Remise à zéro et notification, après les effets localStorage existants :

```ts
  const lastResetSignal = useRef(resetSignal)
  useEffect(() => {
    if (resetSignal !== lastResetSignal.current) {
      lastResetSignal.current = resetSignal
      setColumnFilters([])
    }
  }, [resetSignal])

  const onFiltersActiveRef = useRef(onColumnFiltersActiveChange)
  onFiltersActiveRef.current = onColumnFiltersActiveChange
  useEffect(() => {
    onFiltersActiveRef.current?.(columnFilters.length > 0)
  }, [columnFilters])
```

5g. Barre d'outils : avant `const totalRows`, calculer

```ts
  const hasToolbar =
    toolbar !== undefined ||
    toolbarEnd !== undefined ||
    columns.some((c) => c.meta?.optional)
```
et dans le JSX, juste après la ligne `{title && …}` :

```tsx
      {hasToolbar && (
        <div
          role="toolbar"
          aria-label="Filtres du tableau"
          className="mb-4 flex flex-wrap items-center gap-3"
        >
          {toolbar}
          <ChoiceFilters table={table} />
          <ColumnPicker table={table} />
          {toolbarEnd && (
            <>
              <div className="flex-1 border-t border-border" />
              {toolbarEnd}
            </>
          )}
        </div>
      )}
```

5h. Supprimer `front/src/components/table/columnVisibilityMenu.tsx` après avoir vérifié qu'aucun fichier ne l'importe.

- [ ] **Step 6: Relancer les tests**

```bash
cd front && npx vitest run src/components/table
```
→ PASS. Puis toute la suite front `npx vitest run` → PASS (les usages existants de `ReactTable` ne changent pas) et `npx tsc --noEmit -p tsconfig.app.json` sans erreur.

- [ ] **Step 7: Lint et commit**

```bash
cd front && npx biome check --write src/components/table/reactTable.tsx src/components/table/choiceFilters.tsx src/components/table/columnPicker.tsx src/components/table/reactTable.test.tsx
cd .. && git add -A front/src/components/table && git commit -m "feat(table): colonnes optionnelles, filtres a choix et selecteur de colonnes"
```

---

### Task 4: Page Patients

**Files:**
- Modify: `front/src/columns/patient.column.tsx`
- Modify: `front/src/routes/_authenticated/e/$establishmentId/s/$serviceId/patient/index.tsx`
- Test: `front/src/columns/patient.column.test.tsx`

**Interfaces:**
- Consumes : `choiceColumn` (Task 2), props `toolbar`, `toolbarEnd`, `resetSignal`, `onColumnFiltersActiveChange` (Task 3), champs de `PatientWithTags` (Task 1), `useAuthStore` (`state.user?.id`).

- [ ] **Step 1: Écrire le test qui échoue**

Ajouter à `front/src/columns/patient.column.test.tsx` :

```tsx
import { getPatientColumns } from './patient.column.tsx'

describe('colonnes optionnelles des patients', () => {
  it('propose les champs Inclusion et Bilan, masques par defaut', () => {
    const optionnelles = getPatientColumns({ onView: () => undefined })
      .filter((c) => (c.meta as { optional?: unknown } | undefined)?.optional)
      .map((c) => [
        c.id,
        (c.meta as { optional: { group: string } }).optional.group,
      ])
    expect(optionnelles).toEqual([
      ['medicalDiagnosis', 'Inclusion'],
      ['careMode', 'Inclusion'],
      ['orientation', 'Inclusion'],
      ['etpDecision', 'Inclusion'],
      ['programType', 'Inclusion'],
      ['nonInclusionDetails', 'Inclusion'],
      ['stopReason', 'Bilan'],
      ['etpFinalOutcome', 'Bilan'],
      ['exitDate', 'Bilan'],
    ])
  })
})
```
(Fusionner l'import avec celui de `CelluleParcours` existant.)

- [ ] **Step 2: Lancer et constater l'échec**

`cd front && npx vitest run src/columns/patient.column.test.tsx` → FAIL (liste vide).

- [ ] **Step 3: Colonnes**

Dans `patient.column.tsx`, importer :

```ts
import { choiceColumn } from '../components/table/choiceColumn.tsx'
import {
  CARE_MODE_OPTIONS,
  ETP_DECISION_OPTIONS,
  ETP_FINAL_OUTCOME_OPTIONS,
  MEDICAL_DIAGNOSIS_OPTIONS,
  NON_INCLUSION_DETAILS_OPTIONS,
  ORIENTATION_OPTIONS,
  PROGRAM_TYPE_OPTIONS,
  STOP_REASON_OPTIONS,
} from '../constants/patient.constant.ts'
```

et insérer entre la colonne `pathwayTemplateTags` et la colonne `actions` :

```tsx
    choiceColumn<PatientWithTags>('medicalDiagnosis', (p) => p.medicalDiagnosis, {
      label: 'Diagnostic médical',
      group: 'Inclusion',
      choices: MEDICAL_DIAGNOSIS_OPTIONS,
    }),
    choiceColumn<PatientWithTags>('careMode', (p) => p.careMode, {
      label: 'Mode de prise en charge',
      group: 'Inclusion',
      choices: CARE_MODE_OPTIONS,
    }),
    choiceColumn<PatientWithTags>('orientation', (p) => p.orientation, {
      label: 'Orientation',
      group: 'Inclusion',
      choices: ORIENTATION_OPTIONS,
    }),
    choiceColumn<PatientWithTags>('etpDecision', (p) => p.etpDecision, {
      label: 'ETP décision',
      group: 'Inclusion',
      choices: ETP_DECISION_OPTIONS,
    }),
    choiceColumn<PatientWithTags>('programType', (p) => p.programType, {
      label: 'Type de programme',
      group: 'Inclusion',
      choices: PROGRAM_TYPE_OPTIONS,
    }),
    choiceColumn<PatientWithTags>(
      'nonInclusionDetails',
      (p) => p.nonInclusionDetails,
      {
        label: 'Précision non inclusion',
        group: 'Inclusion',
        choices: NON_INCLUSION_DETAILS_OPTIONS,
      },
    ),
    choiceColumn<PatientWithTags>('stopReason', (p) => p.stopReason, {
      label: "Motif d'arrêt de programme",
      group: 'Bilan',
      choices: STOP_REASON_OPTIONS,
    }),
    choiceColumn<PatientWithTags>('etpFinalOutcome', (p) => p.etpFinalOutcome, {
      label: 'Point final parcours ETP',
      group: 'Bilan',
      choices: ETP_FINAL_OUTCOME_OPTIONS,
    }),
    columnHelper.accessor((row) => row.exitDate ?? undefined, {
      id: 'exitDate',
      header: 'Date de sortie',
      sortUndefined: 'last',
      cell: ({ getValue }) => {
        const value = getValue()
        return value ? dayjs.utc(value).format('DD/MM/YYYY') : null
      },
      meta: { optional: { label: 'Date de sortie', group: 'Bilan' } },
    }),
```

Vérifier que les `*_OPTIONS` sont bien des `{ value, label }[]` (c'est le cas : `toSelectOptions`). Si `exitDate` est typé `Date` côté front plutôt que `string`, le tri `auto` reste correct ; ne rien changer.

- [ ] **Step 4: Relancer le test**

`cd front && npx vitest run src/columns/patient.column.test.tsx` → PASS.

- [ ] **Step 5: Page**

Dans `patient/index.tsx` :

5a. Importer `useAuthStore` depuis `@/store/useAuthStore.ts` ; dans `PatientList` :

```ts
  const userId = useAuthStore((state) => state.user?.id) ?? 'anonyme'
  const tableId = `patient/${serviceId}/${userId}`
  const [resetSignal, setResetSignal] = useState(0)
  const [columnFiltersActive, setColumnFiltersActive] = useState(false)
```

5b. `resetFilters` incrémente aussi le signal :

```ts
  const resetFilters = () => {
    setStatus(DEFAULT_STATUS)
    setSelectedTags([])
    setResetSignal((n) => n + 1)
  }
```

5c. Supprimer le bloc `<div className="flex flex-wrap items-center gap-3">…</div>` de la barre d'outils et le déplacer dans les props de `ReactTable` :
- `toolbar` = un fragment contenant, dans cet ordre et inchangés : l'`Input` de recherche, le `ToggleGroup`, le `DropdownFilter` Parcours, et le bouton « Réinitialiser » dont la condition devient `(status !== DEFAULT_STATUS || selectedTags.length > 0 || columnFiltersActive)`.
- `toolbarEnd` = le bouton d'export (le filet `flex-1 border-t` est désormais rendu par `ReactTable`, le retirer de la page).

5d. L'appel devient :

```tsx
          <ReactTable<PatientWithTags>
            key={tableId}
            data={filteredPatients}
            columns={columns}
            filterId={tableId}
            pagination
            isLoading={isPending}
            isRowMuted={(patient) => Boolean(patient.exitDate)}
            onRowClick={(patient) => handleRedirectPatient(patient.id)}
            toolbar={<>{/* recherche, statut, Parcours, Réinitialiser */}</>}
            toolbarEnd={/* bouton d'export */}
            resetSignal={resetSignal}
            onColumnFiltersActiveChange={setColumnFiltersActive}
          />
```
(Les commentaires ci-dessus désignent le JSX déplacé à l'étape 5c, à recopier tel quel ; ne pas laisser de commentaire dans le code.)

5e. Le `gap-4` du conteneur de page sépare encore le titre de la table ; la barre d'outils a son propre `mb-4`. Pas d'autre changement de mise en page.

- [ ] **Step 6: Vérifier**

```bash
cd front && npx vitest run && npx tsc --noEmit -p tsconfig.app.json
```
→ PASS, aucune erreur.

Vérification navigateur (serveur front sur 4270, back sur 3000, lancés depuis le checkout principal — donc après merge, voir Task 5) : décrite en Task 5.

- [ ] **Step 7: Lint et commit**

```bash
cd front && npx biome check --write src/columns/patient.column.tsx src/columns/patient.column.test.tsx "src/routes/_authenticated/e/\$establishmentId/s/\$serviceId/patient/index.tsx"
cd .. && git add front/src && git commit -m "feat(patients): colonnes optionnelles triables et filtrables dans la liste"
```

---

### Task 5: Intégration et vérification

- [ ] **Step 1:** Dans le worktree : `git merge main` ; résoudre d'éventuels conflits ; relancer `cd front && npx vitest run` et la suite e2e back `patient.test.ts` (commande de la Task 1, sans `-t`).
- [ ] **Step 2:** Fusionner vers `main` depuis le checkout principal : `git merge --no-ff worktree-colonnes-optionnelles -m "merge: colonnes optionnelles de la liste des patients"`, puis `graphify update .`.
- [ ] **Step 3:** Vérifier que le back de dev (port 3000) a redémarré après le merge (`ps -o lstart -p $(lsof -ti :3000 -sTCP:LISTEN)`) et que le front tourne sur 4270.
- [ ] **Step 4:** Dans le navigateur, sur `/e/<establishmentId>/s/<serviceId>/patient` : ouvrir « Colonnes », cocher « Diagnostic médical » → la colonne s'affiche en étiquettes colorées et un bouton « Diagnostic médical » apparaît ; trier sur la colonne ; cocher « AVC » → seuls les patients AVC restent, compteur cohérent ; recharger → colonne, tri et filtre conservés ; « Réinitialiser » → filtre vidé, colonne toujours là ; décocher la colonne → filtre et bouton disparaissent.
