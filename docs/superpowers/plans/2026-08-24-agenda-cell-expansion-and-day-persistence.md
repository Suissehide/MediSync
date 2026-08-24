# Agenda : dépliage de la cellule Patients et mémorisation du jour — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rendre le `+N` de la colonne Patients cliquable pour déplier toutes les pastilles sur plusieurs lignes, et mémoriser le jour sélectionné de `/agenda` en localStorage.

**Architecture:** Une prop d'option sur le tableau partagé débloque la hauteur de ligne sans toucher au rendu des autres écrans. La cellule Patients devient un composant à état local, et les deux constantes de pastille qu'elle partageait avec la colonne Soignant sont extraites dans un module neutre. La persistance du jour tient dans un initialiseur de `useState` et un handler unique.

**Tech Stack:** React 19, TypeScript, TanStack Table + Virtual, TanStack Router, dayjs, Tailwind, lucide-react.

**Spec:** `docs/superpowers/specs/2026-08-24-agenda-cell-expansion-and-day-persistence-design.md`

## Global Constraints

- **Aucun changement back.** Ni Prisma, ni routes, ni repositories, ni schémas.
- **Pas de test runner dans le front.** `front/package.json` ne définit que `dev`, `build`, `lint`, `preview` : ni Vitest, ni Jest, ni Testing Library. **N'installez aucune dépendance de test et ne créez aucun fichier `*.test.*`.** Le cycle rouge/vert du TDD est remplacé, à chaque tâche, par `npx tsc -b` + `npx biome lint <fichiers touchés>` + `npm run build`.
- **Le lint global est rouge sur une dette préexistante** (~39 erreurs sur 205 fichiers, sans rapport). N'utilisez jamais `npm run lint` comme critère ; lintez uniquement les fichiers que vous touchez.
- **Toutes les commandes `npx` / `npm` se lancent depuis `front/`.**
- **`ReactTable` et `VirtualizedBodyTable` sont partagés par six écrans.** Toute modification doit être strictement additive et sans effet quand la nouvelle prop n'est pas passée. Les autres tables du projet ne doivent pas changer d'un pixel.
- **Biome traite `noUnusedVariables` et `noUnusedImports` comme des erreurs**, pas des warnings. Tout import ou toute variable rendus inutiles par vos modifications doivent disparaître.
- **Imports :** chemins relatifs avec extension explicite (`.ts` / `.tsx`), groupés et triés comme dans les fichiers voisins.
- **Commits :** un par tâche, message en français, préfixe conventionnel.

## Structure des fichiers

| Fichier | Rôle | Tâche |
| --- | --- | --- |
| `front/src/components/table/virtualizedBodyTable.tsx` (modifié) | Nouvelle prop `autoRowHeight`, qui bascule `height` en `minHeight` sur les lignes réelles. | 1 |
| `front/src/components/table/reactTable.tsx` (modifié) | Expose la prop et la transmet. | 1 |
| `front/src/components/custom/agenda/chip.ts` (créé) | Les deux constantes de pastille, partagées par la colonne Soignant et la cellule Patients. | 2 |
| `front/src/components/custom/agenda/patientCell.tsx` (créé) | La cellule Patients et son état de dépliage. | 2 |
| `front/src/columns/dayAppointment.column.tsx` (modifié) | Délègue la cellule Patients, importe les constantes. | 2 |
| `front/src/routes/_authenticated/agenda.tsx` (modifié) | Active `autoRowHeight` (tâche 2), puis mémorise le jour (tâche 3). | 2, 3 |

Les tâches 2 et 3 modifient toutes deux la page ; elles sont séquentielles.

---

### Task 1: Prop `autoRowHeight` sur le tableau partagé

**Files:**
- Modify: `front/src/components/table/virtualizedBodyTable.tsx` (type de props vers la ligne 13, déstructuration vers la ligne 25, le `<tr>` vers la ligne 121, le `<td>` vers la ligne 152)
- Modify: `front/src/components/table/reactTable.tsx` (type de props vers la ligne 53, déstructuration vers la ligne 68, appel de `VirtualizedBodyTable` vers la ligne 209)

**Interfaces:**
- Consumes: rien de nouveau.
- Produces: `ReactTable` accepte `autoRowHeight?: boolean` (défaut : absent, donc comportement actuel). La tâche 2 l'utilise.

- [ ] **Step 1: Ajouter la prop à `VirtualizedBodyTable`**

Le type de props est actuellement :

```tsx
type VirtualizedBodyTableProps<TData> = {
  table: Table<TData>
  getCommonPinningStyles: (column: Column<TData>) => React.CSSProperties
  rowHeight: number
  parentRef: RefObject<HTMLElement | null>
  onRowClick?: (row: TData) => void
  emptyState?: ReactNode
  isRowDisabled?: (row: TData) => boolean
  isLoading?: boolean
}
```

Ajouter `autoRowHeight` juste après `rowHeight` :

```tsx
type VirtualizedBodyTableProps<TData> = {
  table: Table<TData>
  getCommonPinningStyles: (column: Column<TData>) => React.CSSProperties
  rowHeight: number
  autoRowHeight?: boolean
  parentRef: RefObject<HTMLElement | null>
  onRowClick?: (row: TData) => void
  emptyState?: ReactNode
  isRowDisabled?: (row: TData) => boolean
  isLoading?: boolean
}
```

Puis, dans la déstructuration du composant :

```tsx
export function VirtualizedBodyTable<TData>({
  table,
  getCommonPinningStyles,
  rowHeight,
  parentRef,
```

devient :

```tsx
export function VirtualizedBodyTable<TData>({
  table,
  getCommonPinningStyles,
  rowHeight,
  autoRowHeight = false,
  parentRef,
```

- [ ] **Step 2: Basculer la hauteur des lignes réelles**

Deux endroits, et **deux seulement**.

Le `<tr>` des lignes virtualisées porte aujourd'hui :

```tsx
            key={row.id}
            style={{ height: rowHeight }}
```

Le remplacer par :

```tsx
            key={row.id}
            style={
              autoRowHeight ? { minHeight: rowHeight } : { height: rowHeight }
            }
```

Le `<td>` de ces mêmes lignes porte :

```tsx
                  style={{
                    ...getCommonPinningStyles(column),
                    minWidth: column.getSize(),
                    maxWidth: column.columnDef.maxSize || undefined,
                    width: grow ? '100%' : undefined,
                    height: rowHeight,
                  }}
```

Le remplacer par :

```tsx
                  style={{
                    ...getCommonPinningStyles(column),
                    minWidth: column.getSize(),
                    maxWidth: column.columnDef.maxSize || undefined,
                    width: grow ? '100%' : undefined,
                    ...(autoRowHeight
                      ? { minHeight: rowHeight }
                      : { height: rowHeight }),
                  }}
```

**Ne touchez pas aux lignes du squelette de chargement** (le bloc `isLoading` vers les lignes 58-76, qui rend cinq `<tr>` avec `height: rowHeight`). Leur contenu est de hauteur fixe, elles n'ont rien à faire grandir, et les laisser telles quelles réduit la surface du changement.

- [ ] **Step 3: Exposer la prop sur `ReactTable`**

Dans `front/src/components/table/reactTable.tsx`, le type de props se termine par :

```tsx
  onRowClick?: (row: TData) => void
  maxHeight?: string
  emptyState?: ReactNode
  isRowDisabled?: (row: TData) => boolean
  isLoading?: boolean
}
```

Ajouter la prop :

```tsx
  onRowClick?: (row: TData) => void
  maxHeight?: string
  emptyState?: ReactNode
  isRowDisabled?: (row: TData) => boolean
  isLoading?: boolean
  autoRowHeight?: boolean
}
```

La déstructuration du composant :

```tsx
  emptyState,
  isRowDisabled,
  isLoading,
}: ReactTableProps<TData>) {
```

devient :

```tsx
  emptyState,
  isRowDisabled,
  isLoading,
  autoRowHeight,
}: ReactTableProps<TData>) {
```

Enfin, l'appel :

```tsx
            <VirtualizedBodyTable
              table={table}
              getCommonPinningStyles={getCommonPinningStyles}
              parentRef={tableContainerRef}
              rowHeight={40}
              onRowClick={onRowClick}
```

devient :

```tsx
            <VirtualizedBodyTable
              table={table}
              getCommonPinningStyles={getCommonPinningStyles}
              parentRef={tableContainerRef}
              rowHeight={40}
              autoRowHeight={autoRowHeight}
              onRowClick={onRowClick}
```

`rowHeight={40}` reste codé en dur : le rendre configurable n'est pas demandé.

- [ ] **Step 4: Vérifier compilation, lint et build**

```bash
cd front && npx tsc -b
cd front && npx biome lint src/components/table/virtualizedBodyTable.tsx src/components/table/reactTable.tsx
cd front && npm run build
```

Attendu : `tsc` exit 0, zéro diagnostic biome, build réussi. Aucun appelant existant ne passe la nouvelle prop, donc rien d'autre ne doit changer.

- [ ] **Step 5: Commit**

```bash
git add front/src/components/table/virtualizedBodyTable.tsx front/src/components/table/reactTable.tsx
git commit -m "feat(table): prop autoRowHeight pour des lignes de hauteur variable"
```

---

### Task 2: Cellule Patients dépliable

**Files:**
- Create: `front/src/components/custom/agenda/chip.ts`
- Create: `front/src/components/custom/agenda/patientCell.tsx`
- Modify: `front/src/columns/dayAppointment.column.tsx` (imports en tête, constantes lignes 12-15, cellule `soignants` vers la ligne 57, cellule `patients` vers les lignes 79-130)
- Modify: `front/src/routes/_authenticated/agenda.tsx` (appel de `ReactTable` vers la ligne 115)

**Interfaces:**
- Consumes: `autoRowHeight?: boolean` sur `ReactTable` (tâche 1) ; `DayAppointmentRow` (`front/src/libs/utils.ts`) avec `patients: AppointmentPatient[]` et `isIndividual: boolean` ; `Button` (`front/src/components/ui/button.tsx`).
- Produces:
  - `front/src/components/custom/agenda/chip.ts` exporte `CHIP_CLASS: string` et `MAX_VISIBLE_CHIPS: number`.
  - `front/src/components/custom/agenda/patientCell.tsx` exporte par défaut `PatientCell(props: { row: DayAppointmentRow; onAddPatient: (row: DayAppointmentRow) => void })`.

- [ ] **Step 1: Créer le module des constantes**

Contenu complet de `front/src/components/custom/agenda/chip.ts` :

```ts
/**
 * Rendu commun aux pastilles de l'agenda (soignants et patients).
 */
export const CHIP_CLASS =
  'inline-flex items-center shrink-0 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary'

/** Nombre de pastilles affichées avant le bouton de dépliage. */
export const MAX_VISIBLE_CHIPS = 3
```

Les deux valeurs sont reprises **à l'identique** de `dayAppointment.column.tsx` : la colonne Soignant doit continuer à rendre exactement le même HTML.

- [ ] **Step 2: Créer le composant de cellule**

Contenu complet de `front/src/components/custom/agenda/patientCell.tsx` :

```tsx
import { Link } from '@tanstack/react-router'
import { Plus } from 'lucide-react'
import { useState } from 'react'

import type { DayAppointmentRow } from '../../../libs/utils.ts'
import { Button } from '../../ui/button.tsx'
import { CHIP_CLASS, MAX_VISIBLE_CHIPS } from './chip.ts'

type PatientCellProps = {
  row: DayAppointmentRow
  onAddPatient: (row: DayAppointmentRow) => void
}

export default function PatientCell({ row, onAddPatient }: PatientCellProps) {
  const [expanded, setExpanded] = useState(false)

  const { patients, isIndividual } = row

  const addButton = isIndividual ? null : (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label="Gérer les patients"
      className="shrink-0"
      onClick={() => onAddPatient(row)}
    >
      <Plus className="w-3 h-3" />
    </Button>
  )

  if (patients.length === 0) {
    return (
      <div className="flex items-center gap-1">
        <span>—</span>
        {addButton}
      </div>
    )
  }

  const hidden = patients.length - MAX_VISIBLE_CHIPS
  const visible = expanded ? patients : patients.slice(0, MAX_VISIBLE_CHIPS)

  return (
    <div className="flex items-center gap-1">
      <div
        className={
          expanded
            ? 'flex flex-wrap items-center gap-1'
            : 'flex items-center gap-1 overflow-hidden'
        }
      >
        {visible.map((appointmentPatient) => (
          <Link
            key={appointmentPatient.patient.id}
            to="/patient/$patientID"
            params={{ patientID: appointmentPatient.patient.id }}
            className={`${CHIP_CLASS} hover:bg-primary/20`}
          >
            {appointmentPatient.patient.firstName}{' '}
            {appointmentPatient.patient.lastName}
          </Link>
        ))}

        {hidden > 0 && (
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            aria-label={
              expanded
                ? 'Réduire la liste des patients'
                : `Afficher les ${hidden} patients masqués`
            }
            className="shrink-0 text-xs text-muted-foreground font-medium cursor-pointer hover:text-primary transition-colors"
          >
            {expanded ? 'Voir moins' : `+${hidden}`}
          </button>
        )}
      </div>
      {addButton}
    </div>
  )
}
```

Quatre points à ne pas modifier :

- Le bouton de dépliage est un `<button type="button">`, pas un `<span>`. Il est cliquable, il doit donc être atteignable au clavier ; un `<span>` avec un `onClick` déclencherait par ailleurs les règles a11y de biome.
- Il n'est rendu que si `hidden > 0`, c'est-à-dire au-delà de `MAX_VISIBLE_CHIPS` patients. Une cellule de trois patients ou moins n'a rien à déplier.
- Le conteneur des pastilles passe de `overflow-hidden` à `flex-wrap` quand il est déplié — c'est ce qui autorise le passage à la ligne.
- Le bouton `+` de gestion reste **hors** de ce conteneur, avec `shrink-0`, dans les deux états et y compris dans la branche à zéro patient.

- [ ] **Step 3: Rebrancher le fichier de colonnes**

Dans `front/src/columns/dayAppointment.column.tsx`, l'en-tête est actuellement :

```tsx
import { Link } from '@tanstack/react-router'
import { createColumnHelper } from '@tanstack/react-table'
import dayjs from 'dayjs'
import { Eye, Plus, Trash2 } from 'lucide-react'

import { Button } from '../components/ui/button.tsx'
import { APPOINTMENT_TYPE } from '../constants/appointment.constant.ts'
import type { DayAppointmentRow } from '../libs/utils.ts'

const columnHelper = createColumnHelper<DayAppointmentRow>()

const CHIP_CLASS =
  'inline-flex items-center shrink-0 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary'

const MAX_VISIBLE_CHIPS = 3
```

Le remplacer par :

```tsx
import { createColumnHelper } from '@tanstack/react-table'
import dayjs from 'dayjs'
import { Eye, Trash2 } from 'lucide-react'

import {
  CHIP_CLASS,
  MAX_VISIBLE_CHIPS,
} from '../components/custom/agenda/chip.ts'
import PatientCell from '../components/custom/agenda/patientCell.tsx'
import { Button } from '../components/ui/button.tsx'
import { APPOINTMENT_TYPE } from '../constants/appointment.constant.ts'
import type { DayAppointmentRow } from '../libs/utils.ts'

const columnHelper = createColumnHelper<DayAppointmentRow>()
```

`Link` disparaît entièrement et `Plus` sort de l'import lucide : tous deux ne servaient qu'à la cellule Patients, qui vient de déménager. `Button` reste — la colonne Actions l'utilise. Les deux déclarations locales `CHIP_CLASS` et `MAX_VISIBLE_CHIPS` sont supprimées au profit de l'import. Biome traite les imports et variables inutilisés comme des **erreurs** : en laisser un casse le lint.

Puis remplacer l'intégralité du `cell` de la colonne `patients` — depuis `cell: ({ row }) => {` jusqu'à l'accolade fermante qui précède `}),` — par :

```tsx
      cell: ({ row }) => (
        <PatientCell row={row.original} onAddPatient={onAddPatient} />
      ),
```

La colonne `soignants` n'est pas modifiée : elle continue d'utiliser `CHIP_CLASS` et `MAX_VISIBLE_CHIPS`, désormais importés.

- [ ] **Step 4: Activer la hauteur variable sur la table de l'agenda**

Dans `front/src/routes/_authenticated/agenda.tsx` :

```tsx
        <ReactTable<DayAppointmentRow>
          data={rows}
          columns={columns}
          filterId="day-appointment"
          isLoading={isPending}
          emptyState="Aucun rendez-vous ce jour-là"
        />
```

devient :

```tsx
        <ReactTable<DayAppointmentRow>
          data={rows}
          columns={columns}
          filterId="day-appointment"
          isLoading={isPending}
          emptyState="Aucun rendez-vous ce jour-là"
          autoRowHeight
        />
```

C'est le seul appel de `ReactTable` du projet qui reçoit cette prop.

- [ ] **Step 5: Vérifier compilation, lint et build**

```bash
cd front && npx tsc -b
cd front && npx biome lint src/components/custom/agenda/chip.ts src/components/custom/agenda/patientCell.tsx src/columns/dayAppointment.column.tsx src/routes/_authenticated/agenda.tsx
cd front && npm run build
```

Attendu : `tsc` exit 0, zéro diagnostic biome sur les quatre fichiers, build réussi. Un diagnostic `noUnusedImports` sur le fichier de colonnes signale un import que l'étape 3 aurait dû retirer.

- [ ] **Step 6: Commit**

```bash
git add front/src/components/custom/agenda/chip.ts front/src/components/custom/agenda/patientCell.tsx front/src/columns/dayAppointment.column.tsx front/src/routes/_authenticated/agenda.tsx
git commit -m "feat(agenda): déplier la liste des patients depuis le tableau"
```

---

### Task 3: Mémoriser le jour sélectionné

**Files:**
- Modify: `front/src/routes/_authenticated/agenda.tsx` (import dayjs en tête, constante de module, état vers la ligne 34, appels `onChange` du bandeau et du calendrier vers les lignes 79 et 96)

**Interfaces:**
- Consumes: l'état `selectedDay` existant, `WeekDayStrip` (prop `onChange: (day: Dayjs) => void`) et le `DateCalendar` du sélecteur de date.
- Produces: rien pour d'autres tâches.

- [ ] **Step 1: Importer le type `Dayjs`**

La ligne d'import dayjs est :

```tsx
import dayjs from 'dayjs'
```

La remplacer par :

```tsx
import dayjs, { type Dayjs } from 'dayjs'
```

C'est la forme employée par `suivi.tsx` et `weekDayStrip.tsx`.

- [ ] **Step 2: Déclarer la clé de stockage**

Juste après les imports et avant `export const Route = createFileRoute(...)`, ajouter :

```tsx
const SELECTED_DAY_STORAGE_KEY = 'agenda/selected-day'
```

- [ ] **Step 3: Lire la valeur mémorisée à l'initialisation**

L'état est actuellement :

```tsx
  const [selectedDay, setSelectedDay] = useState(() =>
    dayjs.utc().startOf('day'),
  )
```

Le remplacer par :

```tsx
  const [selectedDay, setSelectedDay] = useState(() => {
    const stored = localStorage.getItem(SELECTED_DAY_STORAGE_KEY)
    const parsed = stored ? dayjs.utc(stored) : null

    return parsed?.isValid() ? parsed.startOf('day') : dayjs.utc().startOf('day')
  })
```

La validation passe par `isValid()` et non par un parsing strict : le plugin `customParseFormat` n'est pas chargé dans `main.tsx`, et une clé corrompue doit simplement retomber sur aujourd'hui plutôt que faire échouer le rendu.

- [ ] **Step 4: Écrire la valeur à chaque changement**

Juste après la déclaration des états et avant `const { slots, isPending } = useAllSlotsQuery()`, ajouter :

```tsx
  const handleDayChange = (day: Dayjs) => {
    setSelectedDay(day)
    localStorage.setItem(SELECTED_DAY_STORAGE_KEY, day.format('YYYY-MM-DD'))
  }
```

Un handler et non un `useEffect` sur `selectedDay` : l'effet écrirait aussi au montage, réécrivant la valeur qu'il vient de lire, et persisterait un jour courant que l'utilisateur n'a jamais choisi.

- [ ] **Step 5: Brancher les deux points de changement**

Le bandeau semaine :

```tsx
            <WeekDayStrip value={selectedDay} onChange={setSelectedDay} />
```

devient :

```tsx
            <WeekDayStrip value={selectedDay} onChange={handleDayChange} />
```

Et le calendrier :

```tsx
                  onChange={(newDate) => {
                    if (newDate) {
                      setSelectedDay(
                        dayjs.utc(newDate.format('YYYY-MM-DD')).startOf('day'),
                      )
                    }
                  }}
```

devient :

```tsx
                  onChange={(newDate) => {
                    if (newDate) {
                      handleDayChange(
                        dayjs.utc(newDate.format('YYYY-MM-DD')).startOf('day'),
                      )
                    }
                  }}
```

La reconstruction `dayjs.utc(newDate.format('YYYY-MM-DD')).startOf('day')` est conservée telle quelle : sans elle, un utilisateur à l'est de Greenwich sélectionnant le 1er du mois obtiendrait le dernier jour du mois précédent.

Après ce changement, `setSelectedDay` ne doit plus être appelé directement nulle part ailleurs dans le fichier — sinon un chemin de changement échapperait à la persistance.

- [ ] **Step 6: Vérifier compilation, lint et build**

```bash
cd front && npx tsc -b
cd front && npx biome lint src/routes/_authenticated/agenda.tsx
cd front && npm run build
```

Attendu : `tsc` exit 0, zéro diagnostic biome, build réussi.

- [ ] **Step 7: Contrôle manuel (couvre aussi les tâches 1 et 2)**

Lancer `cd front && npm run dev`, se connecter, puis vérifier :

**Dépliage :**
1. Sur `/agenda`, une ligne de plus de trois patients affiche `+N`. Cliquer déplie toutes les pastilles sur plusieurs lignes et **la ligne du tableau grandit** au lieu de rogner.
2. Le bouton devient `Voir moins` et referme la cellule.
3. Une ligne de trois patients ou moins n'affiche aucun bouton de dépliage.
4. Les pastilles restent cliquables et mènent à la fiche patient, déplié comme replié.
5. Le bouton `+` de gestion reste visible et fonctionnel dans les deux états.
6. Le bouton de dépliage est atteignable au clavier (Tab) et s'active à l'Entrée.
7. Déplier plusieurs lignes, faire défiler loin, revenir : les lignes recyclées par la virtualisation reviennent repliées, sans décalage d'affichage.

**Anti-régression, la partie la plus importante :**
8. La colonne **Soignant** de `/agenda` est visuellement identique à avant — mêmes pastilles, même `+N`.
9. Ouvrir `/patient`, `/settings/thematic` et `/settings/location` : leurs lignes gardent la même hauteur qu'avant et le défilement reste fluide. Ces tables ne passent pas `autoRowHeight` et ne doivent pas avoir bougé.

**Mémorisation du jour :**
10. Choisir une date, recharger la page : la même date s'affiche.
11. Changer de jour via le bandeau semaine, recharger : le jour du bandeau est conservé.
12. Vider la clé `agenda/selected-day` dans les outils du navigateur puis recharger : retour au jour courant.
13. Y écrire `pas-une-date` puis recharger : retour au jour courant, sans erreur en console.

Corriger tout écart avant de committer.

- [ ] **Step 8: Commit**

```bash
git add front/src/routes/_authenticated/agenda.tsx
git commit -m "feat(agenda): mémoriser le jour sélectionné en local"
```

---

## Hors périmètre (rappel de la spec)

- Rendre la hauteur variable pour les autres tables du projet.
- Mémoriser le jour dans l'URL ou dans un store partagé.
- Conserver l'état déplié entre deux jours ou après recyclage par la virtualisation.
- Rendre `MAX_VISIBLE_CHIPS` configurable.
- Toute modification back.
