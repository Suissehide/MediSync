# Bouton « + » d'ajout de patient (Agenda) — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter, dans la colonne Patients du tableau `/journee`, un bouton `+` visible uniquement sur les rendez-vous collectifs non complets, qui ouvre une popup légère pour inscrire un ou plusieurs patients au rendez-vous.

**Architecture:** Trois champs supplémentaires sur la ligne (`isIndividual`, `capacity`, `thematicId`) alimentés par des données déjà présentes dans `GET /slots` ; un bouton rendu par la colonne, qui délègue à un troisième callback ; une popup présentationnelle qui construit le payload de mise à jour ; la page porte l'état et la mutation.

**Tech Stack:** React 19, TypeScript, TanStack Router / Table / Query, dayjs, Tailwind, lucide-react, Radix (via les composants `Popup*` maison).

**Spec:** `docs/superpowers/specs/2026-08-17-agenda-add-patient-design.md`

## Global Constraints

- **Aucun changement back.** Tout ce qui est nécessaire est déjà renvoyé par `GET /slots` (vérifié dans les schémas de réponse : `appointmentPatients[].id`, `appointment.thematicId`, `slotTemplate.isIndividual`, `slotTemplate.capacity`). Ne touchez ni Prisma, ni les routes, ni les repositories, ni les schémas Zod.
- **Pas de test runner dans le front.** `front/package.json` ne définit que `dev`, `build`, `lint`, `preview` : ni Vitest, ni Jest, ni Testing Library. **N'installez aucune dépendance de test et ne créez aucun fichier `*.test.*`.** Le cycle rouge/vert du TDD est remplacé, à chaque tâche, par `npx tsc -b` + `npx biome lint <fichiers touchés>` + un contrôle manuel.
- **Le lint global est rouge sur une dette préexistante** (39 erreurs, 52 warnings sur 205 fichiers, sans rapport avec ce travail). N'utilisez jamais `npm run lint` comme critère ; lintez uniquement les fichiers que vous touchez. Les quatre fichiers concernés ici sont propres aujourd'hui, donc toute diagnostic sur eux est une régression de votre fait.
- **Toutes les commandes `npx` / `npm` se lancent depuis `front/`.**
- **Condition d'affichage du bouton, exacte :** `!row.isIndividual && row.patients.length < row.capacity`. C'est la règle qu'applique déjà `AppointmentSheet` ; ne l'inventez pas autrement.
- **Le payload de mise à jour est destructif par défaut** — voir la tâche 2, étape 2. Le back supprime toute participation absente de la liste envoyée et supprime le rendez-vous entier si la liste est vide.
- **Imports :** chemins relatifs avec extension explicite (`.ts` / `.tsx`).
- **Commits :** un par tâche, message en français, préfixe conventionnel (`feat(agenda): …`).

## Structure des fichiers

| Fichier | Rôle | Tâche |
| --- | --- | --- |
| `front/src/libs/utils.ts` (modifié) | Trois champs de plus sur `DayAppointmentRow` et dans `buildDayAppointmentRows`. Aucune logique de rendu. | 1 |
| `front/src/components/custom/popup/addPatientToAppointmentForm.tsx` (créé) | Popup présentationnelle : sélection des patients et construction du payload. Ne connaît aucune mutation. | 2 |
| `front/src/columns/dayAppointment.column.tsx` (modifié) | Bouton `+` dans la cellule patients, délégué via `onAddPatient`. | 3 |
| `front/src/routes/_authenticated/journee.tsx` (modifié) | État `addPatientTarget`, mutation `updateAppointment`, rendu de la popup. | 3 |

Les tâches 3 et 4 de la spec sont réunies en une seule tâche ici : ajouter `onAddPatient` au type de la factory casse la compilation de la page tant que celle-ci ne le fournit pas. Les deux fichiers doivent donc atterrir dans le même commit pour que chaque commit reste vert.

---

### Task 1: Trois champs de plus sur la ligne

**Files:**
- Modify: `front/src/libs/utils.ts` (le type `DayAppointmentRow` vers la ligne 104, et l'objet construit dans `buildDayAppointmentRows` vers les lignes 134-144)

**Interfaces:**
- Consumes: rien de nouveau. Les types `Slot`, `Soignant`, `AppointmentPatient` sont déjà importés dans ce fichier.
- Produces: `DayAppointmentRow` étendu de `isIndividual: boolean`, `capacity: number`, `thematicId?: string | null`. Les tâches 2 et 3 en dépendent.

- [ ] **Step 1: Étendre le type**

Remplacer le type existant :

```ts
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
```

par :

```ts
export type DayAppointmentRow = {
  id: string
  slotId: string
  startDate: string
  endDate: string
  thematic: string
  thematicId?: string | null
  location: string
  soignants: Soignant[]
  patients: AppointmentPatient[]
  type?: string
  isIndividual: boolean
  capacity: number
}
```

- [ ] **Step 2: Renseigner les trois champs**

Dans `buildDayAppointmentRows`, l'objet retourné par le `.map(...)` est actuellement :

```ts
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
```

Le remplacer par :

```ts
        .map((appointment) => ({
          id: appointment.id,
          slotId: slot.id,
          startDate: appointment.startDate,
          endDate: appointment.endDate,
          thematic: appointment.thematic ?? slot.slotTemplate?.thematic ?? '',
          thematicId: appointment.thematicId,
          location: slot.slotTemplate?.location?.name ?? '',
          soignants: slot.slotTemplate?.soignants ?? [],
          patients: appointment.appointmentPatients ?? [],
          type: appointment.type,
          isIndividual: slot.slotTemplate?.isIndividual ?? false,
          capacity: slot.slotTemplate?.capacity ?? 1,
        })),
```

`capacity` retombe sur `1` et non `0` : une capacité absente ne doit jamais faire apparaître le bouton sur un rendez-vous déjà peuplé. Ne changez pas cette valeur de repli.

- [ ] **Step 3: Vérifier la compilation**

```bash
cd front && npx tsc -b
```

Attendu : exit 0, aucune sortie.

- [ ] **Step 4: Vérifier le lint du fichier touché**

```bash
cd front && npx biome lint src/libs/utils.ts
```

Attendu : zéro diagnostic.

- [ ] **Step 5: Commit**

```bash
git add front/src/libs/utils.ts
git commit -m "feat(agenda): exposer capacité, type de créneau et thématique sur la ligne"
```

---

### Task 2: Popup d'ajout de patient

**Files:**
- Create: `front/src/components/custom/popup/addPatientToAppointmentForm.tsx`

**Interfaces:**
- Consumes: `DayAppointmentRow` (tâche 1) depuis `front/src/libs/utils.ts` ; `UpdateAppointmentParams` depuis `front/src/types/appointment.ts` ; `usePatientQueries` depuis `front/src/queries/usePatient.tsx` ; `MultiSelect` depuis `front/src/components/ui/select.tsx` (props `options: {value,label}[]`, `value: string[]`, `onChange: (v: string[]) => void`, `placeholder?`, `maxSelected?`, `disabled?`) ; les composants `Popup*` de `front/src/components/ui/popup.tsx`.
- Produces: `export default function AddPatientToAppointmentForm(props: { open: boolean; setOpen: (open: boolean) => void; row: DayAppointmentRow; onConfirm: (params: UpdateAppointmentParams) => void; isPending?: boolean })`

- [ ] **Step 1: Créer le fichier**

Contenu complet :

```tsx
import { Check, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import type { DayAppointmentRow } from '../../../libs/utils.ts'
import { usePatientQueries } from '../../../queries/usePatient.tsx'
import type { UpdateAppointmentParams } from '../../../types/appointment.ts'
import { Button } from '../../ui/button.tsx'
import { FormField } from '../../ui/formField.tsx'
import { Label } from '../../ui/label.tsx'
import {
  Popup,
  PopupBody,
  PopupContent,
  PopupFooter,
  PopupHeader,
  PopupTitle,
} from '../../ui/popup.tsx'
import { MultiSelect } from '../../ui/select.tsx'

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
  const { patients } = usePatientQueries()
  const [selectedIDs, setSelectedIDs] = useState<string[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    if (open) {
      setSelectedIDs([])
      setError('')
    }
  }, [open])

  const remaining = row.capacity - row.patients.length

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

  const handleConfirm = () => {
    if (selectedIDs.length === 0) {
      setError('Au moins un patient est requis')
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

  return (
    <Popup modal open={open} onOpenChange={setOpen}>
      <PopupContent>
        <PopupHeader>
          <PopupTitle>Ajouter un patient</PopupTitle>
        </PopupHeader>

        <PopupBody>
          <div className="flex flex-col gap-2 max-w-md">
            <p className="text-sm text-text-light">
              {row.patients.length}/{row.capacity} patient
              {row.capacity > 1 ? 's' : ''}
            </p>

            <FormField>
              <Label htmlFor="add-patient-select">Patients</Label>
              <MultiSelect
                options={patientOptions}
                value={selectedIDs}
                onChange={(value) => {
                  setSelectedIDs(value)
                  setError('')
                }}
                placeholder="Sélectionner un ou plusieurs patients"
                maxSelected={remaining}
              />
              {error && <p className="text-xs text-destructive">{error}</p>}
            </FormField>
          </div>
        </PopupBody>

        <PopupFooter>
          <Button
            variant="default"
            onClick={handleConfirm}
            isLoading={isPending}
          >
            <Check className="w-4 h-4" />
            Ajouter
          </Button>
          <Button variant="outline" onClick={() => setOpen(false)}>
            <X className="w-4 h-4" />
            Annuler
          </Button>
        </PopupFooter>
      </PopupContent>
    </Popup>
  )
}
```

- [ ] **Step 2: Relire le payload avant de continuer**

Ce bloc est la seule partie du plan qui peut détruire des données. Vérifiez-le ligne à ligne contre ces trois règles du back (`back/src/main/infra/orm/repositories/appointment.repository.ts:107-177`, à lire si un doute subsiste) :

1. **Liste vide = suppression du rendez-vous** (ligne 112). C'est pourquoi `handleConfirm` refuse une sélection vide avant même d'appeler `onConfirm` — mais surtout pourquoi la liste envoyée contient toujours les participants existants.
2. **Toute participation dont l'`id` n'est pas dans la liste est supprimée** (ligne 149). C'est pourquoi les participations existantes sont remappées **avec leur `id`**. Les envoyer sans `id` les supprimerait puis les recréerait, avec de nouveaux identifiants.
3. **`accompanying`, `status`, `rejectionReason`, `transmissionNotes` sont écrits tels quels par l'`upsert`** (ligne 162-167). Les omettre effacerait les statuts et les transmissions déjà saisis.

Et une quatrième, sur le rendez-vous lui-même : `appointmentData` (tout sauf `appointmentPatients`) part directement dans `tx.appointment.update`. Omettre `thematicId` ou `type` les passerait à `null`. C'est pourquoi ils sont repris tels quels de la ligne.

Ne « simplifiez » pas ce payload.

- [ ] **Step 3: Vérifier la compilation**

```bash
cd front && npx tsc -b
```

Attendu : exit 0. Si TypeScript se plaint sur `appointmentPatients`, comparez avec `UpdateAppointmentParams` dans `front/src/types/appointment.ts` : chaque entrée doit satisfaire `Pick<AppointmentPatient, 'id' | 'accompanying' | 'status' | 'rejectionReason' | 'transmissionNotes'> & { patientID: string }`.

- [ ] **Step 4: Vérifier le lint du fichier créé**

```bash
cd front && npx biome lint src/components/custom/popup/addPatientToAppointmentForm.tsx
```

Attendu : zéro diagnostic. Si `lint/correctness/useExhaustiveDependencies` proteste sur le `useEffect` (qui ne dépend que de `open` et n'appelle que des setters stables), **ne le faites pas taire par un commentaire** : signalez-le dans votre rapport. Si une règle a11y proteste sur `<Label htmlFor="add-patient-select">` parce qu'aucun contrôle ne porte cet `id`, retirez l'attribut `htmlFor` et gardez `<Label>Patients</Label>`.

- [ ] **Step 5: Commit**

```bash
git add front/src/components/custom/popup/addPatientToAppointmentForm.tsx
git commit -m "feat(agenda): popup d'ajout de patient à un rendez-vous"
```

---

### Task 3: Bouton dans la colonne et branchement de la page

**Files:**
- Modify: `front/src/columns/dayAppointment.column.tsx` (imports en tête, type `DayAppointmentActions`, signature de `getDayAppointmentColumns`, cellule `patients` vers les lignes 74-105)
- Modify: `front/src/routes/_authenticated/journee.tsx` (imports, état, mutations, appel de la factory, rendu)

**Interfaces:**
- Consumes: `DayAppointmentRow` étendu (tâche 1) ; `AddPatientToAppointmentForm` (tâche 2, export par défaut, props `open` / `setOpen` / `row` / `onConfirm` / `isPending`) ; `useAppointmentMutations()` qui expose `{ createAppointment, deleteAppointment, updateAppointment }`.
- Produces: `getDayAppointmentColumns` prend désormais un troisième callback `onAddPatient: (row: DayAppointmentRow) => void`.

- [ ] **Step 1: Ajouter l'icône aux imports de la colonne**

Dans `front/src/columns/dayAppointment.column.tsx`, la ligne d'import lucide est :

```tsx
import { Eye, Trash2 } from 'lucide-react'
```

La remplacer par :

```tsx
import { Eye, Plus, Trash2 } from 'lucide-react'
```

- [ ] **Step 2: Ajouter le callback à la factory**

Remplacer :

```tsx
type DayAppointmentActions = {
  onOpen: (row: DayAppointmentRow) => void
  onDelete: (row: DayAppointmentRow) => void
}

export const getDayAppointmentColumns = ({
  onOpen,
  onDelete,
}: DayAppointmentActions) => {
```

par :

```tsx
type DayAppointmentActions = {
  onOpen: (row: DayAppointmentRow) => void
  onDelete: (row: DayAppointmentRow) => void
  onAddPatient: (row: DayAppointmentRow) => void
}

export const getDayAppointmentColumns = ({
  onOpen,
  onDelete,
  onAddPatient,
}: DayAppointmentActions) => {
```

- [ ] **Step 3: Réécrire la cellule patients**

La cellule actuelle sort par anticipation sur la chaîne `'—'`, ce qui rendrait le bouton impossible à afficher sur une ligne sans patient. Remplacer l'intégralité du `cell` de la colonne `patients` par :

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

        if (patients.length === 0) {
          return (
            <div className="flex items-center gap-1">
              <span>—</span>
              {addButton}
            </div>
          )
        }

        const visible = patients.slice(0, MAX_VISIBLE_CHIPS)
        const rest = patients.length - visible.length

        return (
          <div className="flex items-center gap-1">
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
            {addButton}
          </div>
        )
      },
```

Le bouton est volontairement **hors** du conteneur `overflow-hidden` et porte `shrink-0` : il reste ainsi visible quel que soit le nombre de pastilles. Ne le déplacez pas à l'intérieur.

- [ ] **Step 4: Brancher la page**

Dans `front/src/routes/_authenticated/journee.tsx` :

Ajouter l'import, en respectant l'ordre alphabétique des imports existants (juste après celui de `ConfirmDeleteForm`) :

```tsx
import AddPatientToAppointmentForm from '../../components/custom/popup/addPatientToAppointmentForm.tsx'
```

Remplacer :

```tsx
  const [deleteTarget, setDeleteTarget] = useState<DayAppointmentRow | null>(
    null,
  )

  const { slots, isPending } = useAllSlotsQuery()
  const { deleteAppointment } = useAppointmentMutations()
```

par :

```tsx
  const [deleteTarget, setDeleteTarget] = useState<DayAppointmentRow | null>(
    null,
  )
  const [addPatientTarget, setAddPatientTarget] =
    useState<DayAppointmentRow | null>(null)

  const { slots, isPending } = useAllSlotsQuery()
  const { deleteAppointment, updateAppointment } = useAppointmentMutations()
```

Remplacer :

```tsx
      getDayAppointmentColumns({
        onOpen: (row) => setOpenedRow(row),
        onDelete: (row) => setDeleteTarget(row),
      }),
```

par :

```tsx
      getDayAppointmentColumns({
        onOpen: (row) => setOpenedRow(row),
        onDelete: (row) => setDeleteTarget(row),
        onAddPatient: (row) => setAddPatientTarget(row),
      }),
```

Le tableau de dépendances vide du `useMemo` reste vide : les trois setters sont stables.

Enfin, insérer la popup juste avant le `<ConfirmDeleteForm ... />` :

```tsx
        {addPatientTarget && (
          <AddPatientToAppointmentForm
            open={!!addPatientTarget}
            setOpen={(open) => {
              if (!open) {
                setAddPatientTarget(null)
              }
            }}
            row={addPatientTarget}
            isPending={updateAppointment.isPending}
            onConfirm={(params) => {
              updateAppointment.mutate(params)
              setAddPatientTarget(null)
            }}
          />
        )}
```

N'ajoutez aucune invalidation de cache : le `onSettled` de `updateAppointment` invalide déjà `[APPOINTMENT.GET_ALL]` et `[SLOT.GET_ALL]` et affiche son propre toast.

- [ ] **Step 5: Vérifier la compilation**

```bash
cd front && npx tsc -b
```

Attendu : exit 0.

- [ ] **Step 6: Vérifier le lint des fichiers touchés**

```bash
cd front && npx biome lint src/columns/dayAppointment.column.tsx src/routes/_authenticated/journee.tsx
```

Attendu : zéro diagnostic.

- [ ] **Step 7: Build de production**

```bash
cd front && npm run build
```

Attendu : build réussi.

- [ ] **Step 8: Contrôle manuel**

Lancer `cd front && npm run dev`, se connecter, aller sur `/journee`, puis vérifier :

1. Un RDV collectif non complet affiche le `+` à droite des pastilles patients.
2. Un RDV collectif complet ne l'affiche pas.
3. Un RDV individuel ne l'affiche jamais.
4. Une ligne avec 4 patients ou plus affiche `+N` **et** le `+`, sans que le bouton soit rogné.
5. Le `+` ouvre la popup, qui affiche le bon compteur (`2/6 patients`).
6. La liste déroulante ne propose pas les patients déjà inscrits au rendez-vous.
7. La sélection se bloque une fois la place restante atteinte.
8. Valider sans rien sélectionner affiche « Au moins un patient est requis » et n'envoie rien.
9. Après validation : le toast « Rendez-vous modifié avec succès », la nouvelle pastille dans la ligne, et le `+` qui disparaît si la capacité est atteinte.
10. **Contrôle anti-régression, le plus important :** rouvrir le panneau latéral du rendez-vous qui vient d'être modifié et vérifier que les patients déjà présents ont conservé leur statut, leur accompagnant et leurs transmissions, et que la thématique et le type du rendez-vous n'ont pas été vidés. Si quoi que ce soit a été perdu, le payload de la tâche 2 est en cause — ne corrigez pas en surface, relisez-le contre les quatre règles de la tâche 2 étape 2.

Corriger tout écart avant de committer.

- [ ] **Step 9: Commit**

```bash
git add front/src/columns/dayAppointment.column.tsx front/src/routes/_authenticated/journee.tsx
git commit -m "feat(agenda): bouton d'ajout de patient sur les RDV collectifs non complets"
```

---

## Hors périmètre (rappel de la spec)

- Retirer un patient depuis le tableau.
- Modifier statut, accompagnant ou transmissions depuis la popup.
- Créer un nouveau rendez-vous sur le créneau.
- Toute modification back.
