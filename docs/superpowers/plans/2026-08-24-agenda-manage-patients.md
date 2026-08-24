# Agenda : `/agenda`, sélecteur de date, gestion des participants — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Renommer la route `/journee` en `/agenda`, ajouter un sélecteur de date par calendrier à côté du bandeau semaine, et transformer la popup d'ajout de patient en popup de gestion des participants (pré-remplie, permettant le retrait, et déléguant la liste vidée au dialogue de suppression existant).

**Architecture:** Trois changements indépendants sur la même page. Le renommage est mécanique. Le sélecteur de date reprend la composition Popover + `DateCalendar` de `suivi.tsx`, avec une reconstruction explicite en UTC. La popup passe d'une logique d'ajout à une logique d'édition de liste : sélection pré-remplie, plafond total au lieu de restant, payload bidirectionnel, et un second callback pour le cas de la liste vidée.

**Tech Stack:** React 19, TypeScript, TanStack Router / Table / Query, MUI X Date Pickers, Radix (via les composants `Popover*` et `Popup*` maison), dayjs, Tailwind, lucide-react.

**Spec:** `docs/superpowers/specs/2026-08-24-agenda-manage-patients-design.md`

## Global Constraints

- **Aucun changement back.** Ni Prisma, ni routes, ni repositories, ni schémas Zod. Le comportement du back est le contexte de ce travail, pas sa cible.
- **Pas de test runner dans le front.** `front/package.json` ne définit que `dev`, `build`, `lint`, `preview` : ni Vitest, ni Jest, ni Testing Library. **N'installez aucune dépendance de test et ne créez aucun fichier `*.test.*`.** Le cycle rouge/vert du TDD est remplacé, à chaque tâche, par `npx tsc -b` + `npx biome lint <fichiers touchés>` + `npm run build`.
- **Le lint global est rouge sur une dette préexistante** (~39 erreurs, 52 warnings sur 205 fichiers, sans rapport). N'utilisez jamais `npm run lint` comme critère ; lintez uniquement les fichiers que vous touchez.
- **Toutes les commandes `npx` / `npm` se lancent depuis `front/`.**
- **`front/src/routeTree.gen.ts` est généré** par le plugin TanStack Router. Ne l'éditez jamais à la main ; régénérez-le en lançant `npm run dev` quelques secondes.
- **`front/src/components/ui/select.tsx` ne doit pas être touché** : il est partagé par d'autres écrans.
- **Fuseau horaire UTC** de bout en bout. Les plugins dayjs sont initialisés dans `front/src/main.tsx` ; ne les ré-étendez pas.
- **Biome traite `noUnusedVariables` comme une erreur**, pas un warning. Toute variable devenue inutile par vos modifications doit disparaître.
- **Imports :** chemins relatifs avec extension explicite (`.ts` / `.tsx`), groupés et triés comme dans les fichiers voisins.
- **Commits :** un par tâche, message en français, préfixe conventionnel.

## Structure des fichiers

| Fichier | Rôle | Tâche |
| --- | --- | --- |
| `front/src/routes/_authenticated/journee.tsx` → `agenda.tsx` (renommé) | La page. Renommée en tâche 1, puis modifiée en tâches 2 et 3. | 1, 2, 3 |
| `front/src/components/navbar.tsx` (modifié) | Le lien de navigation pointe vers `/agenda`. | 1 |
| `front/src/components/custom/popup/addPatientToAppointmentForm.tsx` (modifié) | Passe d'ajout à gestion des participants. | 3 |
| `front/src/columns/dayAppointment.column.tsx` (modifié) | Condition d'affichage du bouton élargie. | 3 |

Les tâches 2 et 3 modifient toutes deux la page ; elles sont donc séquentielles. La tâche 3 réunit trois fichiers dans un seul commit parce qu'ajouter la prop requise `onRequestDelete` casse la compilation de la page tant que celle-ci ne la fournit pas.

---

### Task 1: Renommer `/journee` en `/agenda`

**Files:**
- Rename: `front/src/routes/_authenticated/journee.tsx` → `front/src/routes/_authenticated/agenda.tsx`
- Modify: le `createFileRoute` de ce fichier (ligne 20)
- Modify: `front/src/components/navbar.tsx` (lignes 123 et 127)
- Regenerate: `front/src/routeTree.gen.ts`

**Interfaces:**
- Consumes: rien.
- Produces: la route `/agenda`. Les tâches 2 et 3 modifient `front/src/routes/_authenticated/agenda.tsx` sous son nouveau nom.

- [ ] **Step 1: Renommer le fichier avec git**

```bash
git mv front/src/routes/_authenticated/journee.tsx front/src/routes/_authenticated/agenda.tsx
```

Utilisez `git mv` et non un couple copier/supprimer : l'historique du fichier reste ainsi rattaché.

- [ ] **Step 2: Corriger la déclaration de route**

Dans `front/src/routes/_authenticated/agenda.tsx`, remplacer :

```tsx
export const Route = createFileRoute('/_authenticated/journee')({
  component: Agenda,
})
```

par :

```tsx
export const Route = createFileRoute('/_authenticated/agenda')({
  component: Agenda,
})
```

Le nom du composant `Agenda` était déjà correct ; ne le renommez pas.

- [ ] **Step 3: Mettre à jour le lien de la navbar**

Dans `front/src/components/navbar.tsx`, le lien concerné est :

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

Remplacer les deux occurrences de `/journee` par `/agenda` :

```tsx
          <Link
            to="/agenda"
            className={`relative cursor-pointer transition-colors duration-300
               after:content-[''] after:absolute after:left-0 after:top-full after:w-full after:h-[3px] after:bg-primary after:scale-x-0 after:origin-right after:transition-transform after:duration-300
               hover:after:scale-x-100 hover:after:origin-left
               ${isActive('/agenda') ? 'text-text after:scale-x-100' : 'text-text-light'}`}
          >
            Agenda
          </Link>
```

Ne touchez ni aux classes ni au libellé, qui étaient déjà `Agenda`.

- [ ] **Step 4: Régénérer l'arbre de routes**

```bash
cd front && npm run dev
```

Laissez tourner quelques secondes le temps que le plugin réécrive `front/src/routeTree.gen.ts`, puis arrêtez le serveur (Ctrl-C). Vérifiez ensuite que l'ancienne route a bien disparu et la nouvelle apparu :

```bash
grep -c "journee" front/src/routeTree.gen.ts
grep -c "agenda" front/src/routeTree.gen.ts
```

Attendu : `0` pour le premier, une valeur non nulle pour le second. Un `journee` résiduel signifie que la régénération n'a pas eu lieu — relancez `npm run dev`, ne corrigez pas le fichier à la main.

- [ ] **Step 5: Vérifier qu'aucune référence ne subsiste**

```bash
cd front && grep -rn "journee" src | grep -v routeTree.gen
```

Attendu : aucune sortie.

- [ ] **Step 6: Vérifier compilation, lint et build**

```bash
cd front && npx tsc -b
cd front && npx biome lint src/routes/_authenticated/agenda.tsx src/components/navbar.tsx
cd front && npm run build
```

Attendu : `tsc` exit 0, zéro diagnostic biome, build réussi.

- [ ] **Step 7: Commit**

```bash
git add front/src/routes/_authenticated/agenda.tsx front/src/routes/_authenticated/journee.tsx front/src/components/navbar.tsx front/src/routeTree.gen.ts
git commit -m "refactor(agenda): renommer la route /journee en /agenda"
```

---

### Task 2: Sélecteur de date

**Files:**
- Modify: `front/src/routes/_authenticated/agenda.tsx` (imports en tête, et le bloc d'en-tête vers la ligne 71)

**Interfaces:**
- Consumes: `WeekDayStrip` (déjà importé), `selectedDay` / `setSelectedDay` (état déjà présent), `Button` (`front/src/components/ui/button.tsx`, export nommé), `PopoverRoot` / `PopoverTrigger` / `PopoverContent` (`front/src/components/ui/popover.tsx`, exports nommés), `DateCalendar` (`@mui/x-date-pickers`).
- Produces: rien de nouveau pour les autres tâches.

- [ ] **Step 1: Ajouter les imports**

Le fichier commence par :

```tsx
import { createFileRoute } from '@tanstack/react-router'
import dayjs from 'dayjs'
import { CalendarDays } from 'lucide-react'
import { useMemo, useState } from 'react'

import { getDayAppointmentColumns } from '../../columns/dayAppointment.column.tsx'
import AddPatientToAppointmentForm from '../../components/custom/popup/addPatientToAppointmentForm.tsx'
import { ConfirmDeleteForm } from '../../components/custom/popup/confirmDeleteForm.tsx'
import AppointmentSheet from '../../components/custom/sheet/appointmentSheet.tsx'
import WeekDayStrip from '../../components/custom/weekDayStrip.tsx'
import DashboardLayout from '../../components/dashboard.layout.tsx'
import ReactTable from '../../components/table/reactTable.tsx'
```

Remplacer ce bloc par (deux imports de composants ajoutés, plus `DateCalendar` en tête du groupe des paquets) :

```tsx
import { DateCalendar } from '@mui/x-date-pickers'
import { createFileRoute } from '@tanstack/react-router'
import dayjs from 'dayjs'
import { CalendarDays } from 'lucide-react'
import { useMemo, useState } from 'react'

import { getDayAppointmentColumns } from '../../columns/dayAppointment.column.tsx'
import AddPatientToAppointmentForm from '../../components/custom/popup/addPatientToAppointmentForm.tsx'
import { ConfirmDeleteForm } from '../../components/custom/popup/confirmDeleteForm.tsx'
import AppointmentSheet from '../../components/custom/sheet/appointmentSheet.tsx'
import WeekDayStrip from '../../components/custom/weekDayStrip.tsx'
import DashboardLayout from '../../components/dashboard.layout.tsx'
import ReactTable from '../../components/table/reactTable.tsx'
import { Button } from '../../components/ui/button.tsx'
import {
  PopoverContent,
  PopoverRoot,
  PopoverTrigger,
} from '../../components/ui/popover.tsx'
```

`CalendarDays` est déjà importé (il sert à la pastille du titre) et sera réutilisé pour le déclencheur : n'ajoutez pas un second import de lucide.

Les lignes qui suivent (`import { buildDayAppointmentRows, … }`, `useAppointmentMutations`, `useAllSlotsQuery`) restent en place, après ce bloc.

- [ ] **Step 2: Ajouter le bouton et son popover**

Dans le rendu, l'en-tête contient aujourd'hui :

```tsx
          <WeekDayStrip value={selectedDay} onChange={setSelectedDay} />
```

Remplacer cette ligne unique par :

```tsx
          <div className="flex items-center gap-2">
            <WeekDayStrip value={selectedDay} onChange={setSelectedDay} />

            <PopoverRoot>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label="Choisir une date"
                >
                  <CalendarDays className="w-4 h-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="p-0 w-auto">
                <DateCalendar
                  value={selectedDay}
                  onChange={(newDate) => {
                    if (newDate) {
                      setSelectedDay(
                        dayjs.utc(newDate.format('YYYY-MM-DD')).startOf('day'),
                      )
                    }
                  }}
                />
              </PopoverContent>
            </PopoverRoot>
          </div>
```

Trois points à ne pas modifier :

- **Aucune prop `views`** sur le `DateCalendar` : la vue jour par défaut est ce qu'on veut. `suivi.tsx` passe `views={['year', 'month']} openTo="month"` parce qu'il raisonne par mois ; ce n'est pas le cas ici.
- **La reconstruction UTC** `dayjs.utc(newDate.format('YYYY-MM-DD')).startOf('day')` est obligatoire. Passer `newDate` directement à `setSelectedDay` ferait dériver la date d'un jour pour tout utilisateur dont le fuseau local est en avance sur UTC.
- `align="end"` plutôt que `align="center"` : le bouton est collé au bord droit de l'en-tête.

- [ ] **Step 3: Vérifier compilation, lint et build**

```bash
cd front && npx tsc -b
cd front && npx biome lint src/routes/_authenticated/agenda.tsx
cd front && npm run build
```

Attendu : `tsc` exit 0, zéro diagnostic biome, build réussi. Si `tsc` proteste sur le type de `value`, vérifiez que vous passez bien `selectedDay` (un `Dayjs`) et non une chaîne.

- [ ] **Step 4: Contrôle manuel (couvre aussi le renommage de la tâche 1)**

Lancer `cd front && npm run dev`, se connecter, puis vérifier :

1. L'onglet `Agenda` mène à `/agenda`, la page s'affiche, l'onglet est souligné.
2. Naviguer manuellement vers `/journee` ne rend plus la page.
3. Le bouton calendrier ouvre le popover ; il affiche bien une grille de jours, pas une grille de mois.
4. Choisir une date change le jour affiché dans le titre, et le bandeau semaine se recale sur la semaine qui contient cette date.
5. **Contrôle de fuseau, celui qui compte :** depuis un poste en heure française (UTC+2 en été), ouvrir le calendrier et cliquer sur le **1er** d'un mois. Le titre doit afficher ce 1er, pas le dernier jour du mois précédent. Un décalage d'un jour signifie que la reconstruction `dayjs.utc(...)` de l'étape 2 a été omise ou altérée.

Corriger tout écart avant de committer.

- [ ] **Step 5: Commit**

```bash
git add front/src/routes/_authenticated/agenda.tsx
git commit -m "feat(agenda): sélecteur de date par calendrier"
```

---

### Task 3: La popup gère les participants

**Files:**
- Modify: `front/src/components/custom/popup/addPatientToAppointmentForm.tsx` (imports, props, état, options, `handleConfirm`, corps et pied)
- Modify: `front/src/columns/dayAppointment.column.tsx` (cellule `patients`, vers la ligne 79)
- Modify: `front/src/routes/_authenticated/agenda.tsx` (rendu de la popup)

**Interfaces:**
- Consumes: `DayAppointmentRow` (`front/src/libs/utils.ts`) avec `patients: AppointmentPatient[]`, `capacity: number`, `isIndividual: boolean`, `thematicId?: string | null`, `type?: string` ; `UpdateAppointmentParams` (`front/src/types/appointment.ts`) ; `MultiSelect` (`front/src/components/ui/select.tsx`, props `options` / `value` / `onChange` / `placeholder` / `maxSelected` / `disabled`) ; `ConfirmDeleteForm` et l'état `deleteTarget` déjà présents dans la page.
- Produces: `AddPatientToAppointmentForm` prend une prop supplémentaire **requise** `onRequestDelete: () => void`.

- [ ] **Step 1: Adapter les props et l'état de la popup**

Dans `front/src/components/custom/popup/addPatientToAppointmentForm.tsx`, remplacer :

```tsx
import { Check, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
```

par (le `useEffect` disparaît, voir plus bas) :

```tsx
import { Check, X } from 'lucide-react'
import { useMemo, useState } from 'react'
```

Puis remplacer le type de props et la signature :

```tsx
type AddPatientToAppointmentFormProps = {
  open: boolean
  setOpen: (open: boolean) => void
  row: DayAppointmentRow
  onConfirm: (params: UpdateAppointmentParams) => void
  isPending?: boolean
}

export default function AddPatientToAppointmentForm({
  open,
  setOpen,
  row,
  onConfirm,
  isPending = false,
}: AddPatientToAppointmentFormProps) {
```

par :

```tsx
type AddPatientToAppointmentFormProps = {
  open: boolean
  setOpen: (open: boolean) => void
  row: DayAppointmentRow
  onConfirm: (params: UpdateAppointmentParams) => void
  onRequestDelete: () => void
  isPending?: boolean
}

export default function AddPatientToAppointmentForm({
  open,
  setOpen,
  row,
  onConfirm,
  onRequestDelete,
  isPending = false,
}: AddPatientToAppointmentFormProps) {
```

- [ ] **Step 2: Pré-remplir la sélection et supprimer les gardes devenues fausses**

Remplacer ce bloc :

```tsx
  const [selectedIDs, setSelectedIDs] = useState<string[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    if (open) {
      setSelectedIDs([])
      setError('')
    }
  }, [open])

  const remaining = row.capacity - row.patients.length
  const isFull = remaining <= 0

  const patientOptions = useMemo(() => {
    const alreadyIn = new Set(row.patients.map((ap) => ap.patient.id))
    return (patients ?? [])
      .filter((patient) => !alreadyIn.has(patient.id))
      .map((patient) => ({
        value: patient.id,
        label: `${patient.firstName} ${patient.lastName}`,
        sortKey: `${patient.lastName} ${patient.firstName}`,
      }))
      .sort((a, b) => a.sortKey.localeCompare(b.sortKey, 'fr'))
      .map(({ value, label }) => ({ value, label }))
  }, [patients, row.patients])
```

par :

```tsx
  const [selectedIDs, setSelectedIDs] = useState<string[]>(() =>
    row.patients.map((appointmentPatient) => appointmentPatient.patient.id),
  )

  const patientOptions = useMemo(() => {
    return (patients ?? [])
      .map((patient) => ({
        value: patient.id,
        label: `${patient.firstName} ${patient.lastName}`,
        sortKey: `${patient.lastName} ${patient.firstName}`,
      }))
      .sort((a, b) => a.sortKey.localeCompare(b.sortKey, 'fr'))
      .map(({ value, label }) => ({ value, label }))
  }, [patients])
```

Ce qui disparaît et pourquoi :

- **`useEffect` de remise à zéro** → remplacé par l'initialiseur paresseux de `useState`. La page ne monte la popup que lorsqu'une cible existe, donc l'amorçage au montage suffit. Surtout, un effet qui réamorcerait sur un changement de `row` écraserait la sélection en cours : la ligne est dérivée des données vivantes et change d'identité à chaque rafraîchissement de `GET /slots`.
- **`error` / `setError`** → il n'y a plus de cas d'erreur. La sélection vide n'est plus refusée mais routée vers la suppression, et le plafond haut est tenu par `maxSelected`. Biome traite `noUnusedVariables` comme une erreur : laisser cet état en place casserait le lint.
- **`remaining` / `isFull`** → `maxSelected` vaut désormais la capacité totale, jamais nulle. Le contournement du `maxSelected={0}` falsy de `MultiSelect` n'a plus d'objet, et le conserver rendrait un rendez-vous complet impossible à modifier.
- **le filtre `alreadyIn`** → les patients inscrits doivent figurer dans les options pour pouvoir y apparaître cochés.

- [ ] **Step 3: Réécrire `handleConfirm`**

Remplacer :

```tsx
  const handleConfirm = () => {
    if (selectedIDs.length === 0) {
      setError('Au moins un patient est requis')
      return
    }
    if (isFull) {
      setError('Le rendez-vous est complet')
      return
    }

    onConfirm({
      id: row.id,
      thematicId: row.thematicId,
      type: row.type,
      appointmentPatients: [
        ...row.patients.map((appointmentPatient) => ({
          id: appointmentPatient.id,
          patientID: appointmentPatient.patient.id,
          accompanying: appointmentPatient.accompanying,
          status: appointmentPatient.status,
          rejectionReason: appointmentPatient.rejectionReason,
          transmissionNotes: appointmentPatient.transmissionNotes,
        })),
        ...selectedIDs.map((patientID) => ({ patientID })),
      ],
    })
  }
```

par :

```tsx
  const handleConfirm = () => {
    if (selectedIDs.length === 0) {
      onRequestDelete()
      return
    }

    onConfirm({
      id: row.id,
      thematicId: row.thematicId,
      type: row.type,
      appointmentPatients: selectedIDs.map((patientID) => {
        const existing = row.patients.find(
          (appointmentPatient) => appointmentPatient.patient.id === patientID,
        )

        return existing
          ? {
              id: existing.id,
              patientID,
              accompanying: existing.accompanying,
              status: existing.status,
              rejectionReason: existing.rejectionReason,
              transmissionNotes: existing.transmissionNotes,
            }
          : { patientID }
      }),
    })
  }
```

Les règles du back n'ont pas changé et restent celles à respecter
(`back/src/main/infra/orm/repositories/appointment.repository.ts:107-177`) :

1. un participant conservé doit être renvoyé **avec son `id`** et ses quatre champs (`accompanying`, `status`, `rejectionReason`, `transmissionNotes`), sinon il est supprimé puis recréé et ses transmissions sont perdues ;
2. un participant absent de la liste est supprimé — c'est désormais l'effet **voulu** du décochage ;
3. `thematicId` et `type` sont toujours envoyés, faute de quoi ils passeraient à `null` ;
4. une liste vide supprimerait le rendez-vous entier côté back — c'est précisément pour ne pas dépendre de cet effet de bord que le cas vide part vers `onRequestDelete()` plutôt que vers `onConfirm()`.

- [ ] **Step 4: Adapter le corps et le pied de la popup**

Remplacer le titre :

```tsx
          <PopupTitle>Ajouter un patient</PopupTitle>
```

par :

```tsx
          <PopupTitle>Patients du rendez-vous</PopupTitle>
```

Puis remplacer tout le `PopupBody` :

```tsx
        <PopupBody>
          <div className="flex flex-col gap-2 max-w-md">
            <p className="text-sm text-text-light">
              {row.patients.length}/{row.capacity} patient
              {row.capacity > 1 ? 's' : ''}
            </p>

            {isFull && (
              <p className="text-xs text-destructive">
                Le rendez-vous est complet
              </p>
            )}

            <FormField>
              <Label>Patients</Label>
              <MultiSelect
                options={patientOptions}
                value={selectedIDs}
                onChange={(value) => {
                  setSelectedIDs(value)
                  setError('')
                }}
                placeholder="Sélectionner un ou plusieurs patients"
                maxSelected={remaining}
                disabled={isFull}
              />
              {error && <p className="text-xs text-destructive">{error}</p>}
            </FormField>
          </div>
        </PopupBody>
```

par :

```tsx
        <PopupBody>
          <div className="flex flex-col gap-2 max-w-md">
            <p className="text-sm text-text-light">
              {selectedIDs.length}/{row.capacity} patient
              {row.capacity > 1 ? 's' : ''}
            </p>

            <FormField>
              <Label>Patients</Label>
              <MultiSelect
                options={patientOptions}
                value={selectedIDs}
                onChange={setSelectedIDs}
                placeholder="Sélectionner un ou plusieurs patients"
                maxSelected={row.capacity}
              />
            </FormField>
          </div>
        </PopupBody>
```

Le numérateur du compteur devient le nombre de patients **sélectionnés**, pour qu'il suive les cases cochées en direct. Le pluriel reste calé sur `row.capacity`, comme dans `appointmentSheet.tsx`.

Enfin, dans le `PopupFooter`, remplacer le libellé du bouton de validation :

```tsx
            <Check className="w-4 h-4" />
            Ajouter
```

par :

```tsx
            <Check className="w-4 h-4" />
            Valider
```

« Ajouter » ne décrit plus l'action, qui peut aussi retirer. Ne touchez ni à l'icône, ni au bouton Annuler, ni au `isLoading={isPending}`.

- [ ] **Step 5: Élargir la condition d'affichage du bouton**

Dans `front/src/columns/dayAppointment.column.tsx`, la cellule `patients` commence par :

```tsx
      cell: ({ row }) => {
        const { patients, isIndividual, capacity } = row.original
        const canAddPatient = !isIndividual && patients.length < capacity

        const addButton = canAddPatient ? (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Ajouter un patient"
            className="shrink-0"
            onClick={() => onAddPatient(row.original)}
          >
            <Plus className="w-3 h-3" />
          </Button>
        ) : null
```

Remplacer ces lignes par :

```tsx
      cell: ({ row }) => {
        const { patients, isIndividual } = row.original
        const canAddPatient = !isIndividual

        const addButton = canAddPatient ? (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Gérer les patients"
            className="shrink-0"
            onClick={() => onAddPatient(row.original)}
          >
            <Plus className="w-3 h-3" />
          </Button>
        ) : null
```

Trois précisions :

- **`capacity` doit disparaître de la déstructuration.** Il n'est plus utilisé dans la cellule, et `noUnusedVariables` est une erreur chez biome : le laisser casserait le lint.
- L'icône reste `Plus` — l'ajout demeure l'action dominante — mais l'`aria-label` devient « Gérer les patients », qui décrit ce que le bouton fait réellement.
- Le reste de la cellule (les pastilles, les liens patients, le `+N`, la branche à zéro patient) ne change pas.

- [ ] **Step 6: Fournir `onRequestDelete` depuis la page**

Dans `front/src/routes/_authenticated/agenda.tsx`, le rendu de la popup est :

```tsx
        {addPatientTarget && (
          <AddPatientToAppointmentForm
            open={!!addPatientTarget}
            setOpen={(open) => {
              if (!open) {
                setAddPatientTargetId(null)
              }
            }}
            row={addPatientTarget}
            isPending={updateAppointment.isPending}
            onConfirm={(params) => {
              updateAppointment.mutate(params)
              setAddPatientTargetId(null)
            }}
          />
        )}
```

Le remplacer par :

```tsx
        {addPatientTarget && (
          <AddPatientToAppointmentForm
            open={!!addPatientTarget}
            setOpen={(open) => {
              if (!open) {
                setAddPatientTargetId(null)
              }
            }}
            row={addPatientTarget}
            isPending={updateAppointment.isPending}
            onConfirm={(params) => {
              updateAppointment.mutate(params)
              setAddPatientTargetId(null)
            }}
            onRequestDelete={() => {
              setDeleteTarget(addPatientTarget)
              setAddPatientTargetId(null)
            }}
          />
        )}
```

`setDeleteTarget` et le `ConfirmDeleteForm` existent déjà dans ce fichier et sont câblés sur `deleteAppointment` : n'ajoutez ni état, ni dialogue, ni mutation. L'ordre des deux appels n'a pas d'importance — React les groupe dans le même rendu — mais renseignez `deleteTarget` avant de vider la cible pour que la valeur capturée soit bien la ligne courante.

- [ ] **Step 7: Vérifier compilation, lint et build**

```bash
cd front && npx tsc -b
cd front && npx biome lint src/components/custom/popup/addPatientToAppointmentForm.tsx src/columns/dayAppointment.column.tsx src/routes/_authenticated/agenda.tsx
cd front && npm run build
```

Attendu : `tsc` exit 0, zéro diagnostic biome sur les trois fichiers, build réussi. Un diagnostic `noUnusedVariables` signale une variable que les étapes 2 ou 5 auraient dû supprimer.

- [ ] **Step 8: Contrôle manuel**

Lancer `cd front && npm run dev`, se connecter, aller sur `/agenda`, puis vérifier :

1. Le `+` apparaît sur **tous** les créneaux collectifs, y compris ceux qui sont complets, et jamais sur un créneau individuel.
2. La popup s'ouvre avec les patients déjà inscrits **cochés**, et le compteur affiche leur nombre sur la capacité.
3. Cocher un patient de plus fait monter le compteur ; la sélection se bloque à la capacité totale.
4. Valider après un ajout : la nouvelle pastille apparaît dans la ligne, toast « Rendez-vous modifié avec succès ».
5. **Contrôle anti-régression, le plus important :** sur un rendez-vous dont un participant porte un statut, un accompagnant et des transmissions, ajouter un autre patient, valider, puis rouvrir le panneau latéral — les trois champs du premier participant doivent être intacts, et la thématique et le type du rendez-vous inchangés.
6. Décocher un participant puis valider : sa pastille disparaît de la ligne.
7. Décocher **tout le monde** puis valider : la popup se ferme et le dialogue « Supprimer le rendez-vous » s'ouvre. Annuler ne supprime rien et la ligne reste intacte ; confirmer supprime le rendez-vous.
8. Rouvrir la popup sur un rendez-vous complet : les cases sont cochées, le select n'est pas grisé, et on peut décocher.

Corriger tout écart avant de committer.

- [ ] **Step 9: Commit**

```bash
git add front/src/components/custom/popup/addPatientToAppointmentForm.tsx front/src/columns/dayAppointment.column.tsx front/src/routes/_authenticated/agenda.tsx
git commit -m "feat(agenda): gérer les participants d'un RDV collectif depuis le tableau"
```

---

## Hors périmètre (rappel de la spec)

- Modifier statut, accompagnant ou transmissions depuis la popup.
- Confirmation au retrait d'un participant parmi d'autres.
- Créer un nouveau rendez-vous sur le créneau.
- Rendre le bouton disponible sur les rendez-vous individuels.
- Toucher `front/src/components/ui/select.tsx`.
- Toute modification back.
