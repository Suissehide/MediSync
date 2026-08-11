# Page Agenda (tableau des RDV du jour) — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter une page `/journee` (onglet « Agenda ») affichant, pour un jour choisi via un bandeau semaine, un tableau de tous les rendez-vous avec horaire, thématique, lieu, soignant, patients, type et actions.

**Architecture:** Front uniquement. Un helper aplatit les `Slot` déjà chargés par `useAllSlotsQuery()` en lignes « un rendez-vous = une ligne » filtrées sur le jour ; un composant de présentation `WeekDayStrip` pilote le jour sélectionné ; un fichier de colonnes alimente le `ReactTable` existant ; la route assemble le tout et branche `AppointmentSheet` et `ConfirmDeleteForm`.

**Tech Stack:** React 19, TypeScript, TanStack Router (routes par fichier), TanStack Table v8, TanStack Query, dayjs (plugins `utc` + `isoWeek`, locale `fr`), Tailwind, lucide-react.

**Spec:** `docs/superpowers/specs/2026-08-11-agenda-day-table-design.md`

## Global Constraints

- **Aucun changement back.** Ni schéma, ni route, ni repository, ni migration. Toutes les données viennent de `GET /slots` tel quel.
- **Pas de test runner dans le front.** `front/package.json` ne définit que `dev`, `build`, `lint`, `preview` : il n'existe ni Vitest, ni Jest, ni Testing Library. **N'installez aucune dépendance de test et ne créez aucun fichier `*.test.*`.** La boucle de vérification de chaque tâche est : `npx tsc -b` (doit passer sans erreur), puis `npm run lint` (doit passer sans erreur), puis un contrôle manuel dans le navigateur. Ces trois étapes remplacent le cycle test rouge/vert.
- **Toutes les commandes `npx` / `npm` se lancent depuis `front/`.**
- **Fuseau horaire UTC partout.** Toute lecture ou comparaison de date passe par `dayjs.utc(...)`. Les plugins `utc` et `isoWeek` et `dayjs.locale('fr')` sont déjà initialisés dans `front/src/main.tsx` : ne pas les ré-étendre.
- **Langue de l'interface : français.** Libellé de l'onglet exactement `Agenda`, chemin de la route exactement `/journee` (les routes du projet sont en français sans accent).
- **Ne pas éditer `front/src/routeTree.gen.ts`** : il est régénéré par le plugin TanStack Router au lancement de `npm run dev` ou `npm run build`.
- **Imports :** chemins relatifs avec extension explicite (`.ts` / `.tsx`), comme partout dans le projet.
- **Commits :** un commit par tâche, message en français, préfixe conventionnel (`feat(agenda): …`).

## Structure des fichiers

| Fichier | Rôle | Tâche |
| --- | --- | --- |
| `front/src/libs/utils.ts` (modifié) | Type `DayAppointmentRow` + helper `buildDayAppointmentRows` — aplatissement et filtrage des données. Aucune logique de rendu. | 1 |
| `front/src/components/custom/weekDayStrip.tsx` (créé) | Sélecteur de jour, composant contrôlé sans état ni query. | 2 |
| `front/src/columns/dayAppointment.column.tsx` (créé) | Définition des colonnes du tableau, rendu des cellules. Ne connaît ni les queries ni les mutations. | 3 |
| `front/src/routes/_authenticated/journee.tsx` (créé) | Page : état du jour sélectionné, appel des queries/mutations, assemblage, panneaux. | 4 |
| `front/src/components/navbar.tsx` (modifié) | Lien de navigation `Agenda`. | 4 |

---

### Task 1: Helper `buildDayAppointmentRows`

**Files:**
- Modify: `front/src/libs/utils.ts` (ajout d'imports en tête + ajout de code à la suite de `buildCalendarEventsFromSlots`)

**Interfaces:**
- Consumes: types existants `Slot` (`front/src/types/slot.ts`), `Soignant` (`front/src/types/soignant.ts`), `AppointmentPatient` (`front/src/types/appointmentPatient.ts`).
- Produces:
  - `export type DayAppointmentRow = { id: string; slotId: string; startDate: string; endDate: string; thematic: string; location: string; soignants: Soignant[]; patients: AppointmentPatient[]; type?: string }`
  - `export const buildDayAppointmentRows: (slots: Slot[] | undefined, day: Dayjs) => DayAppointmentRow[]`

- [ ] **Step 1: Compléter les imports en tête de `front/src/libs/utils.ts`**

Le fichier commence aujourd'hui par :

```ts
import { type ClassValue, clsx } from 'clsx'
import dayjs from 'dayjs'
import { twMerge } from 'tailwind-merge'

import type { CalendarEvent } from '../components/custom/Calendar/calendar.tsx'
import { getContrastTextColor } from './color.ts'
import type { Pathway } from '../types/pathway.ts'
import type { Slot } from '../types/slot.ts'
import type { SlotTemplate } from '../types/slotTemplate.ts'
```

Remplacer par (deux lignes d'import de types ajoutées, `Dayjs` ajouté à l'import dayjs) :

```ts
import { type ClassValue, clsx } from 'clsx'
import dayjs, { type Dayjs } from 'dayjs'
import { twMerge } from 'tailwind-merge'

import type { CalendarEvent } from '../components/custom/Calendar/calendar.tsx'
import { getContrastTextColor } from './color.ts'
import type { AppointmentPatient } from '../types/appointmentPatient.ts'
import type { Pathway } from '../types/pathway.ts'
import type { Slot } from '../types/slot.ts'
import type { SlotTemplate } from '../types/slotTemplate.ts'
import type { Soignant } from '../types/soignant.ts'
```

- [ ] **Step 2: Ajouter le type et le helper**

Coller ce bloc **juste après** la fonction `buildCalendarEventsFromSlots` (qui commence ligne 51 et se termine par son `}` de fermeture), avant le code suivant du fichier :

```ts
/**
 * Une ligne du tableau Agenda : un rendez-vous, enrichi des informations
 * portées par son créneau (lieu, soignants).
 */
export type DayAppointmentRow = {
  id: string
  slotId: string
  startDate: string
  endDate: string
  thematic: string
  location: string
  soignants: Soignant[]
  patients: AppointmentPatient[]
  type?: string
}

/**
 * Aplatit les créneaux en rendez-vous, ne garde que ceux du jour demandé
 * (comparaison en UTC), et trie par heure de début croissante.
 */
export const buildDayAppointmentRows = (
  slots: Slot[] | undefined,
  day: Dayjs,
): DayAppointmentRow[] => {
  if (!slots) {
    return []
  }

  return slots
    .flatMap((slot) =>
      (slot.appointments ?? [])
        .filter((appointment) =>
          dayjs.utc(appointment.startDate).isSame(day, 'day'),
        )
        .map((appointment) => ({
          id: appointment.id,
          slotId: slot.id,
          startDate: appointment.startDate,
          endDate: appointment.endDate,
          thematic: appointment.thematic ?? slot.slotTemplate?.thematic ?? '',
          location: slot.slotTemplate?.location?.name ?? '',
          soignants: slot.slotTemplate?.soignants ?? [],
          patients: appointment.appointmentPatients ?? [],
          type: appointment.type,
        })),
    )
    .sort((a, b) => dayjs(a.startDate).valueOf() - dayjs(b.startDate).valueOf())
}
```

Points à ne pas modifier :
- `thematic` retombe sur celle du créneau quand le rendez-vous n'en porte pas.
- Les valeurs manquantes restent des chaînes vides ici ; c'est la colonne qui affichera `—` (tâche 3).
- Ne pas remplacer `dayjs.utc(...)` par `dayjs(...)` dans le filtre : la comparaison de jour doit être en UTC.

- [ ] **Step 3: Vérifier la compilation**

```bash
cd front && npx tsc -b
```

Attendu : aucune sortie, code de retour 0. Si TypeScript se plaint que `slot.appointments` est possiblement `undefined`, c'est que le `?? []` a été omis.

- [ ] **Step 4: Vérifier le lint**

```bash
cd front && npm run lint
```

Attendu : aucune erreur.

- [ ] **Step 5: Commit**

```bash
git add front/src/libs/utils.ts
git commit -m "feat(agenda): helper d'aplatissement des RDV d'un jour"
```

---

### Task 2: Composant `WeekDayStrip`

**Files:**
- Create: `front/src/components/custom/weekDayStrip.tsx`

**Interfaces:**
- Consumes: `Button` (`front/src/components/ui/button.tsx`, export nommé), `cn` (`front/src/libs/utils.ts`).
- Produces: `export default function WeekDayStrip(props: { value: Dayjs; onChange: (day: Dayjs) => void })`

- [ ] **Step 1: Créer le fichier**

Contenu complet de `front/src/components/custom/weekDayStrip.tsx` :

```tsx
import dayjs, { type Dayjs } from 'dayjs'
import { ChevronLeft, ChevronRight } from 'lucide-react'

import { cn } from '../../libs/utils.ts'
import { Button } from '../ui/button.tsx'

type WeekDayStripProps = {
  value: Dayjs
  onChange: (day: Dayjs) => void
}

export default function WeekDayStrip({ value, onChange }: WeekDayStripProps) {
  const weekStart = value.isoWeekday(1).startOf('day')
  const days = Array.from({ length: 7 }, (_, index) =>
    weekStart.add(index, 'day'),
  )
  const today = dayjs.utc().startOf('day')
  const isOnToday = value.isSame(today, 'day')

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        size="icon"
        aria-label="Semaine précédente"
        onClick={() => onChange(value.subtract(7, 'day'))}
      >
        <ChevronLeft className="w-4 h-4" />
      </Button>

      <div className="flex items-center gap-1">
        {days.map((day) => {
          const isSelected = day.isSame(value, 'day')
          const isCurrentDay = day.isSame(today, 'day')

          return (
            <button
              key={day.toISOString()}
              type="button"
              onClick={() => onChange(day)}
              aria-current={isSelected ? 'date' : undefined}
              className={cn(
                'flex flex-col items-center min-w-[56px] rounded-lg px-3 py-1 cursor-pointer transition-colors',
                isSelected
                  ? 'bg-primary text-primary-foreground'
                  : 'text-text-light hover:bg-card',
              )}
            >
              <span className="text-xs capitalize">{day.format('ddd')}</span>
              <span className="text-sm font-medium">{day.format('D')}</span>
              <span
                className={cn(
                  'mt-0.5 h-1 w-1 rounded-full',
                  !isCurrentDay && 'bg-transparent',
                  isCurrentDay && !isSelected && 'bg-primary',
                  isCurrentDay && isSelected && 'bg-primary-foreground',
                )}
              />
            </button>
          )
        })}
      </div>

      <Button
        variant="outline"
        size="icon"
        aria-label="Semaine suivante"
        onClick={() => onChange(value.add(7, 'day'))}
      >
        <ChevronRight className="w-4 h-4" />
      </Button>

      {!isOnToday && (
        <Button variant="outline" onClick={() => onChange(today)}>
          Aujourd&apos;hui
        </Button>
      )}
    </div>
  )
}
```

Notes pour l'implémenteur :
- `isoWeekday(1)` = lundi. Le plugin `isoWeek` est déjà étendu dans `main.tsx` ; **ne pas** ajouter `dayjs.extend(isoWeek)` ici.
- Les flèches déplacent `value` de ±7 jours : la semaine affichée découle toujours de `value`, il n'y a pas de second état à gérer.
- La pastille sous le chiffre marque le jour courant réel, y compris quand un autre jour est sélectionné.

- [ ] **Step 2: Vérifier la compilation**

```bash
cd front && npx tsc -b
```

Attendu : aucune erreur. Si `isoWeekday` est signalé comme inexistant sur `Dayjs`, vérifier que `import isoWeek from 'dayjs/plugin/isoWeek'` est bien présent dans `front/src/main.tsx` (il l'est ligne 21) — ne pas contourner par un `as any`.

- [ ] **Step 3: Vérifier le lint**

```bash
cd front && npm run lint
```

Attendu : aucune erreur.

- [ ] **Step 4: Commit**

```bash
git add front/src/components/custom/weekDayStrip.tsx
git commit -m "feat(agenda): bandeau de sélection du jour"
```

---

### Task 3: Colonnes du tableau

**Files:**
- Create: `front/src/columns/dayAppointment.column.tsx`

**Interfaces:**
- Consumes: `DayAppointmentRow` (tâche 1), `APPOINTMENT_TYPE` (`front/src/constants/appointment.constant.ts`), `Button`, `Link` de `@tanstack/react-router`.
- Produces: `export const getDayAppointmentColumns: (actions: { onOpen: (row: DayAppointmentRow) => void; onDelete: (row: DayAppointmentRow) => void }) => ColumnDef<DayAppointmentRow, any>[]`

- [ ] **Step 1: Créer le fichier**

Contenu complet de `front/src/columns/dayAppointment.column.tsx` :

```tsx
import { Link } from '@tanstack/react-router'
import { createColumnHelper } from '@tanstack/react-table'
import dayjs from 'dayjs'
import { Eye, Trash2 } from 'lucide-react'

import { Button } from '../components/ui/button.tsx'
import { APPOINTMENT_TYPE } from '../constants/appointment.constant.ts'
import type { DayAppointmentRow } from '../libs/utils.ts'

const columnHelper = createColumnHelper<DayAppointmentRow>()

const CHIP_CLASS =
  'inline-flex items-center shrink-0 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary'

const MAX_VISIBLE_CHIPS = 3

type DayAppointmentActions = {
  onOpen: (row: DayAppointmentRow) => void
  onDelete: (row: DayAppointmentRow) => void
}

export const getDayAppointmentColumns = ({
  onOpen,
  onDelete,
}: DayAppointmentActions) => {
  return [
    columnHelper.accessor('startDate', {
      id: 'schedule',
      header: 'Horaire',
      size: 140,
      cell: ({ row }) =>
        `${dayjs.utc(row.original.startDate).format('HH:mm')} – ${dayjs
          .utc(row.original.endDate)
          .format('HH:mm')}`,
    }),
    columnHelper.accessor('thematic', {
      header: 'Thématique',
      size: 180,
      cell: ({ getValue }) => getValue() || '—',
    }),
    columnHelper.accessor('location', {
      header: 'Lieu',
      size: 160,
      cell: ({ getValue }) => getValue() || '—',
    }),
    columnHelper.display({
      id: 'soignants',
      header: 'Soignant',
      size: 240,
      cell: ({ row }) => {
        const soignants = row.original.soignants
        if (soignants.length === 0) {
          return '—'
        }
        const visible = soignants.slice(0, MAX_VISIBLE_CHIPS)
        const rest = soignants.length - visible.length
        return (
          <div className="flex items-center gap-1 overflow-hidden">
            {visible.map((soignant) => (
              <span key={soignant.id} className={CHIP_CLASS}>
                {soignant.name}
              </span>
            ))}
            {rest > 0 && (
              <span className="shrink-0 text-xs text-muted-foreground font-medium">
                +{rest}
              </span>
            )}
          </div>
        )
      },
    }),
    columnHelper.display({
      id: 'patients',
      header: 'Patients',
      size: 280,
      cell: ({ row }) => {
        const patients = row.original.patients
        if (patients.length === 0) {
          return '—'
        }
        const visible = patients.slice(0, MAX_VISIBLE_CHIPS)
        const rest = patients.length - visible.length
        return (
          <div className="flex items-center gap-1 overflow-hidden">
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
            {rest > 0 && (
              <span className="shrink-0 text-xs text-muted-foreground font-medium">
                +{rest}
              </span>
            )}
          </div>
        )
      },
    }),
    columnHelper.accessor('type', {
      header: 'Type',
      size: 140,
      cell: ({ getValue }) => {
        const type = getValue()
        if (!type) {
          return '—'
        }
        return (APPOINTMENT_TYPE as Record<string, string>)[type] ?? type
      },
    }),
    columnHelper.display({
      id: 'actions',
      header: '',
      size: 100,
      meta: { align: 'right' },
      cell: ({ row }) => (
        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            size="icon"
            aria-label="Ouvrir le rendez-vous"
            onClick={() => onOpen(row.original)}
          >
            <Eye className="w-3 h-3" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            aria-label="Supprimer le rendez-vous"
            onClick={() => onDelete(row.original)}
          >
            <Trash2 className="w-3 h-3 text-destructive" />
          </Button>
        </div>
      ),
    }),
  ]
}
```

Notes pour l'implémenteur :
- Le cast `APPOINTMENT_TYPE as Record<string, string>` est nécessaire : la constante est un littéral non annoté, l'indexer par une `string` est une erreur TypeScript sans ce cast.
- `meta: { align: 'right' }` est le contrat de `CustomMeta` défini dans `front/src/components/table/reactTable.tsx` ; c'est ce que fait déjà `thematic.column.tsx`.
- Les classes de pastille sont copiées telles quelles de `thematic.column.tsx` pour rester homogène avec le reste de l'application.
- Ne pas ajouter de `meta.filter` : aucune table du projet n'en câble, c'est hors périmètre.

- [ ] **Step 2: Vérifier la compilation**

```bash
cd front && npx tsc -b
```

Attendu : aucune erreur. Une erreur sur `to="/patient/$patientID"` signifie que `routeTree.gen.ts` est périmé — lancer `npm run dev` une fois pour le régénérer, puis relancer `tsc`.

- [ ] **Step 3: Vérifier le lint**

```bash
cd front && npm run lint
```

Attendu : aucune erreur.

- [ ] **Step 4: Commit**

```bash
git add front/src/columns/dayAppointment.column.tsx
git commit -m "feat(agenda): colonnes du tableau des RDV du jour"
```

---

### Task 4: Route `/journee` et lien de navigation

**Files:**
- Create: `front/src/routes/_authenticated/journee.tsx`
- Modify: `front/src/components/navbar.tsx` (bloc de liens, autour des lignes 111-141)

**Interfaces:**
- Consumes: `buildDayAppointmentRows` et `DayAppointmentRow` (tâche 1), `WeekDayStrip` (tâche 2), `getDayAppointmentColumns` (tâche 3), `useAllSlotsQuery` (`front/src/queries/useSlot.ts`), `useAppointmentMutations` (`front/src/queries/useAppointment.ts`), `ReactTable` (export par défaut de `front/src/components/table/reactTable.tsx`), `AppointmentSheet` (export par défaut), `ConfirmDeleteForm` (export nommé), `DashboardLayout` (export par défaut).
- Produces: la route `/journee`.

- [ ] **Step 1: Créer la page**

Contenu complet de `front/src/routes/_authenticated/journee.tsx` :

```tsx
import { createFileRoute } from '@tanstack/react-router'
import dayjs from 'dayjs'
import { CalendarDays } from 'lucide-react'
import { useMemo, useState } from 'react'

import { getDayAppointmentColumns } from '../../columns/dayAppointment.column.tsx'
import { ConfirmDeleteForm } from '../../components/custom/popup/confirmDeleteForm.tsx'
import AppointmentSheet from '../../components/custom/sheet/appointmentSheet.tsx'
import WeekDayStrip from '../../components/custom/weekDayStrip.tsx'
import DashboardLayout from '../../components/dashboard.layout.tsx'
import ReactTable from '../../components/table/reactTable.tsx'
import {
  buildDayAppointmentRows,
  type DayAppointmentRow,
} from '../../libs/utils.ts'
import { useAppointmentMutations } from '../../queries/useAppointment.ts'
import { useAllSlotsQuery } from '../../queries/useSlot.ts'

export const Route = createFileRoute('/_authenticated/journee')({
  component: Agenda,
})

function Agenda() {
  const [selectedDay, setSelectedDay] = useState(() =>
    dayjs.utc().startOf('day'),
  )
  const [openedRow, setOpenedRow] = useState<DayAppointmentRow | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<DayAppointmentRow | null>(
    null,
  )

  const { slots, isPending } = useAllSlotsQuery()
  const { deleteAppointment } = useAppointmentMutations()

  const rows = useMemo(
    () => buildDayAppointmentRows(slots, selectedDay),
    [slots, selectedDay],
  )

  const columns = useMemo(
    () =>
      getDayAppointmentColumns({
        onOpen: (row) => setOpenedRow(row),
        onDelete: (row) => setDeleteTarget(row),
      }),
    [],
  )

  return (
    <DashboardLayout>
      <div className="flex-1 bg-background p-6 rounded-lg flex flex-col w-full gap-4">
        <div className="flex justify-between items-center gap-3 flex-wrap">
          <div className="flex gap-2 items-center">
            <div className="flex items-center justify-center bg-foreground p-2 rounded-full">
              <CalendarDays className="h-4 w-4 text-white" />
            </div>
            <h1 className="h-9 flex items-center text-text-dark text-xl font-semibold">
              {selectedDay.format('dddd D MMMM YYYY')}
            </h1>
          </div>

          <WeekDayStrip value={selectedDay} onChange={setSelectedDay} />
        </div>

        <ReactTable<DayAppointmentRow>
          data={rows}
          columns={columns}
          filterId="day-appointment"
          isLoading={isPending}
          emptyState="Aucun rendez-vous ce jour-là"
        />

        {openedRow && (
          <AppointmentSheet
            open={!!openedRow}
            setOpen={() => setOpenedRow(null)}
            eventID={openedRow.id}
            soignants={openedRow.soignants}
          />
        )}

        <ConfirmDeleteForm
          open={!!deleteTarget}
          setOpen={(open) => {
            if (!open) {
              setDeleteTarget(null)
            }
          }}
          onConfirm={() => {
            if (deleteTarget) {
              deleteAppointment.mutate(deleteTarget.id)
            }
            setDeleteTarget(null)
          }}
          loading={deleteAppointment.isPending}
          title="Supprimer le rendez-vous"
          description="Voulez-vous vraiment supprimer ce rendez-vous ? Cette action est irréversible."
        />
      </div>
    </DashboardLayout>
  )
}
```

Notes pour l'implémenteur :
- Le titre affiche le jour sélectionné en toutes lettres (locale `fr` déjà active) ; le bandeau de sélection est à droite, comme les boutons d'action des autres pages `settings`.
- **Pas de `onRowClick`** sur `ReactTable` : l'ouverture passe uniquement par le bouton œil, pour ne pas entrer en conflit avec les liens patients.
- `AppointmentSheet` attend `setOpen: (openEventId: string) => void` ; `() => setOpenedRow(null)` est compatible et suffit.
- Aucune invalidation de cache à écrire ici : le `onSettled` de `deleteAppointment` invalide déjà `[APPOINTMENT.GET_ALL]` et `[SLOT.GET_ALL]`, et affiche le toast.
- `columns` a un tableau de dépendances vide volontairement : `setOpenedRow` et `setDeleteTarget` sont stables.

- [ ] **Step 2: Ajouter le lien dans la navbar**

Dans `front/src/components/navbar.tsx`, le bloc `<div className="flex gap-4">` contient trois `<Link>` (Dashboard, Patients, Suivi). Insérer un quatrième lien **après** celui de Dashboard (qui se termine par `</Link>` juste avant le `<Link to="/patient">`) :

```tsx
          <Link
            to="/journee"
            className={`relative cursor-pointer transition-colors duration-300
               after:content-[''] after:absolute after:left-0 after:top-full after:w-full after:h-[3px] after:bg-primary after:scale-x-0 after:origin-right after:transition-transform after:duration-300
               hover:after:scale-x-100 hover:after:origin-left
               ${isActive('/journee') ? 'text-text after:scale-x-100' : 'text-text-light'}`}
          >
            Agenda
          </Link>
```

Les classes sont identiques à celles des liens voisins : ne rien y changer.

- [ ] **Step 3: Régénérer l'arbre de routes**

```bash
cd front && npm run dev
```

Laisser tourner quelques secondes le temps que le plugin TanStack Router écrive `front/src/routeTree.gen.ts`, vérifier que `/_authenticated/journee` y apparaît, puis arrêter le serveur (Ctrl-C).

```bash
grep -n "journee" front/src/routeTree.gen.ts
```

Attendu : au moins une correspondance. Sans cela, `tsc` échouera sur `createFileRoute('/_authenticated/journee')` et sur `to="/journee"`.

- [ ] **Step 4: Vérifier la compilation**

```bash
cd front && npx tsc -b
```

Attendu : aucune erreur.

- [ ] **Step 5: Vérifier le lint**

```bash
cd front && npm run lint
```

Attendu : aucune erreur.

- [ ] **Step 6: Contrôle manuel dans le navigateur**

Lancer `cd front && npm run dev`, se connecter, puis vérifier point par point :

1. L'onglet `Agenda` apparaît dans la navbar entre `Dashboard` et `Patients`, et se souligne quand on est sur la page.
2. À l'ouverture, le jour courant est sélectionné (fond `primary`) et le bouton `Aujourd'hui` est absent.
3. Les flèches ‹ › changent de semaine ; le bouton `Aujourd'hui` apparaît alors et ramène au jour courant.
4. Un jour avec rendez-vous affiche une ligne par rendez-vous, triées par horaire, cohérentes avec ce que montre le calendrier du dashboard pour ce même jour (mêmes heures, mêmes thématiques).
5. Un rendez-vous de groupe affiche plusieurs pastilles patients, et `+N` au-delà de trois.
6. Une colonne sans donnée affiche `—`.
7. La colonne Type affiche `Ambulatoire`, `Hôpital` ou `Téléphonique`.
8. Le bouton œil ouvre le panneau du rendez-vous avec les bons soignants ; le fermer ne laisse pas la page bloquée.
9. Une pastille patient mène à la fiche du patient.
10. La corbeille ouvre la confirmation ; après confirmation, la ligne disparaît et le toast de suppression s'affiche.
11. Un jour sans rendez-vous affiche « Aucun rendez-vous ce jour-là ».

Corriger tout écart avant de committer.

- [ ] **Step 7: Commit**

```bash
git add front/src/routes/_authenticated/journee.tsx front/src/components/navbar.tsx front/src/routeTree.gen.ts
git commit -m "feat(agenda): page tableau des RDV du jour et lien de navigation"
```

---

## Hors périmètre (rappel de la spec)

- Affichage des créneaux libres, sans rendez-vous.
- Création d'un rendez-vous depuis cette page.
- Filtres de colonne et filtre soignant global.
- Persistance du jour sélectionné (store ou URL).
- Export ou impression du tableau.
- Toute modification back.
