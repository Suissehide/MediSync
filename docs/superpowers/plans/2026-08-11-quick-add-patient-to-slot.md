# Action rapide « Ajouter un patient à un RDV » — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter une action rapide qui ouvre une popup en deux étapes — patient + thématique, puis choix parmi les dix prochains créneaux disponibles — et crée le rendez-vous correspondant.

**Architecture:** Fonctionnalité 100 % front. Les données proviennent des caches TanStack Query existants (`SLOT.GET_ALL`, `PATIENT.GET_ALL`, `THEMATIC.GET_ALL`) ; la disponibilité des créneaux est calculée par des fonctions pures isolées dans `libs/slotAvailability.ts`. Les champs heure / durée / modalité, aujourd'hui codés en dur dans `addAppointmentForm.tsx`, sont extraits en composants présentationnels partagés. La création passe par `createAppointment`, sauf pour un créneau collectif déjà entamé où l'on rejoint le rendez-vous existant via `updateAppointment`.

**Tech Stack:** React 19, TypeScript, TanStack Query, TanStack Form, Radix UI, Tailwind, dayjs (plugin `utc` déjà chargé globalement), Biome.

**Spec de référence:** `docs/superpowers/specs/2026-08-11-quick-add-patient-to-slot-design.md`

## Global Constraints

- Aucune modification backend. `GET /slot?action=getAllSlots` expose déjà tout ce qui est nécessaire.
- Aucune requête réseau nouvelle : uniquement `useAllSlotsQuery()`, `usePatientQueries()`, `useThematicQueries()`.
- Toutes les dates manipulées en UTC via `dayjs.utc(...)`, comme partout ailleurs dans le front.
- Libellés d'interface en français.
- Le comportement observable de `AddAppointmentForm` ne doit pas changer — y compris l'ordre des champs (heure/durée, puis soignants, puis thématique, puis type, puis patients).
- Tri des patients par nom de famille puis prénom via `localeCompare(..., 'fr')`.
- Style de commit : Conventional Commits, en français, sans accent dans le sujet (voir `git log`).

### Note sur la vérification — absence de tests front

`front/package.json` n'expose que `dev`, `build`, `lint`, `preview` : **le front n'a aucune suite de tests ni framework de test installé**. Le cycle TDD habituel de ce plan est donc remplacé, à chaque tâche, par :

1. `cd front && npm run build` (inclut `tsc -b`, donc la vérification de types) ;
2. `cd front && npm run lint` ;
3. une vérification manuelle explicite, décrite pas à pas dans la tâche.

Installer Vitest pour cette fonctionnalité serait un changement d'outillage non demandé et hors périmètre de la spec validée. Si tu veux inverser cette décision, c'est à faire **avant** de démarrer la tâche 1, et le plan des tâches 1 et 2 est à réécrire en TDD (les fonctions de `slotAvailability.ts` sont pures et se prêteraient très bien à des tests unitaires).

---

## Structure des fichiers

| Fichier | Responsabilité |
|---|---|
| `front/src/libs/slotAvailability.ts` *(créé)* | Fonctions pures : intervalles libres d'un créneau, comptage des patients, disponibilité, construction de la liste des créneaux proposés. Aucune dépendance React. |
| `front/src/components/custom/appointmentDetailsFields.tsx` *(créé)* | Deux composants présentationnels sans logique métier : `AppointmentTimeFields` (date + heure + durée) et `AppointmentTypeField` (modalité). |
| `front/src/components/custom/popup/addAppointmentForm.tsx` *(modifié)* | Consomme les deux composants ci-dessus à la place de son balisage en dur. |
| `front/src/components/custom/popup/addPatientToSlotForm.tsx` *(créé)* | La popup en deux étapes, son `PopupTrigger`, son état, et les deux mutations. |
| `front/src/routes/_authenticated/dashboard.tsx` *(modifié, ligne 140)* | Ajout du bouton aux `quickActions`. |
| `front/src/routes/_authenticated/patient/index.tsx` *(modifié, ligne 97)* | Ajout du bouton aux `quickActions`. |

---

### Task 1: Fonctions de disponibilité des créneaux

**Files:**
- Create: `front/src/libs/slotAvailability.ts`

**Interfaces:**
- Consumes: `Slot` depuis `front/src/types/slot.ts`.
- Produces:
  - `MIN_APPOINTMENT_MINUTES: number` (= 15)
  - `UPCOMING_SLOT_LIMIT: number` (= 10)
  - `type FreeInterval = { start: string; end: string }`
  - `type SlotSuggestion = { slot: Slot; alreadyBooked: boolean; bookedCount: number; capacity: number; isIndividual: boolean; freeInterval?: FreeInterval; joinableAppointmentID?: string }`
  - `getFreeIntervals(slot: Slot): FreeInterval[]`
  - `getBookedPatientCount(slot: Slot): number`
  - `getSlotCapacity(slot: Slot): number`
  - `isPatientBookedOnSlot(slot: Slot, patientID: string): boolean`
  - `hasSlotAvailability(slot: Slot): boolean`
  - `getUpcomingSlotSuggestions(slots: Slot[] | undefined, thematicID: string, patientID: string, limit?: number): SlotSuggestion[]`

- [ ] **Step 1: Créer le fichier avec les fonctions pures**

Créer `front/src/libs/slotAvailability.ts` avec exactement ce contenu :

```ts
import dayjs from 'dayjs'

import type { Slot } from '../types/slot.ts'

/** Durée minimale exploitable d'un intervalle libre, alignée sur le pas des
 * options de durée de `generateDurationOptions`. */
export const MIN_APPOINTMENT_MINUTES = 15

/** Nombre de créneaux proposés dans la popup d'ajout rapide. */
export const UPCOMING_SLOT_LIMIT = 10

export type FreeInterval = { start: string; end: string }

export type SlotSuggestion = {
  slot: Slot
  /** Le patient sélectionné a déjà un rendez-vous sur ce créneau. */
  alreadyBooked: boolean
  bookedCount: number
  capacity: number
  isIndividual: boolean
  /** Premier intervalle libre — créneaux individuels uniquement. */
  freeInterval?: FreeInterval
  /** Rendez-vous collectif existant que le patient peut rejoindre. */
  joinableAppointmentID?: string
}

/**
 * Intervalles libres d'un créneau : ses bornes, moins les rendez-vous déjà
 * posés. Les intervalles plus courts que MIN_APPOINTMENT_MINUTES sont écartés
 * car aucune durée ne pourrait y être choisie.
 */
export const getFreeIntervals = (slot: Slot): FreeInterval[] => {
  const slotEnd = dayjs.utc(slot.endDate)
  const booked = (slot.appointments ?? [])
    .map((appointment) => ({
      start: dayjs.utc(appointment.startDate),
      end: dayjs.utc(appointment.endDate),
    }))
    .sort((a, b) => a.start.diff(b.start))

  const intervals: FreeInterval[] = []
  let cursor = dayjs.utc(slot.startDate)

  for (const appointment of booked) {
    if (appointment.start.isAfter(cursor)) {
      intervals.push({
        start: cursor.toISOString(),
        end: appointment.start.toISOString(),
      })
    }
    if (appointment.end.isAfter(cursor)) {
      cursor = appointment.end
    }
  }

  if (slotEnd.isAfter(cursor)) {
    intervals.push({ start: cursor.toISOString(), end: slotEnd.toISOString() })
  }

  return intervals.filter(
    (interval) =>
      dayjs.utc(interval.end).diff(dayjs.utc(interval.start), 'minute') >=
      MIN_APPOINTMENT_MINUTES,
  )
}

/** Nombre total de patients inscrits sur le créneau, tous rendez-vous confondus. */
export const getBookedPatientCount = (slot: Slot): number =>
  (slot.appointments ?? []).reduce(
    (total, appointment) => total + (appointment.appointmentPatients?.length ?? 0),
    0,
  )

export const getSlotCapacity = (slot: Slot): number =>
  slot.slotTemplate?.capacity ?? 1

export const isPatientBookedOnSlot = (slot: Slot, patientID: string): boolean =>
  (slot.appointments ?? []).some((appointment) =>
    appointment.appointmentPatients?.some((ap) => ap.patient.id === patientID),
  )

/**
 * Un créneau individuel est disponible s'il reste un intervalle libre ;
 * un créneau collectif l'est tant que sa capacité n'est pas atteinte.
 */
export const hasSlotAvailability = (slot: Slot): boolean =>
  slot.slotTemplate?.isIndividual
    ? getFreeIntervals(slot).length > 0
    : getBookedPatientCount(slot) < getSlotCapacity(slot)

/**
 * Les prochains créneaux proposables pour un patient et une thématique.
 * Un créneau où le patient est déjà inscrit reste dans la liste — il sera
 * affiché non cliquable — même s'il est complet.
 */
export const getUpcomingSlotSuggestions = (
  slots: Slot[] | undefined,
  thematicID: string,
  patientID: string,
  limit: number = UPCOMING_SLOT_LIMIT,
): SlotSuggestion[] => {
  if (!slots || !thematicID || !patientID) {
    return []
  }

  const now = dayjs.utc()

  return slots
    .filter(
      (slot) =>
        slot.slotTemplate?.thematicId === thematicID &&
        !slot.locked &&
        dayjs.utc(slot.startDate).isAfter(now) &&
        (isPatientBookedOnSlot(slot, patientID) || hasSlotAvailability(slot)),
    )
    .sort((a, b) => dayjs.utc(a.startDate).diff(dayjs.utc(b.startDate)))
    .slice(0, limit)
    .map((slot) => {
      const isIndividual = !!slot.slotTemplate?.isIndividual
      const existingAppointment = slot.appointments?.[0]

      return {
        slot,
        alreadyBooked: isPatientBookedOnSlot(slot, patientID),
        bookedCount: getBookedPatientCount(slot),
        capacity: getSlotCapacity(slot),
        isIndividual,
        freeInterval: isIndividual ? getFreeIntervals(slot)[0] : undefined,
        joinableAppointmentID:
          !isIndividual && existingAppointment ? existingAppointment.id : undefined,
      }
    })
}
```

- [ ] **Step 2: Vérifier types et lint**

```bash
cd front && npm run build && npm run lint
```

Attendu : build réussi, aucune erreur de lint. Le fichier n'est encore importé nulle part — c'est normal, Biome ne signale pas les modules non utilisés.

- [ ] **Step 3: Commit**

```bash
git add front/src/libs/slotAvailability.ts
git commit -m "feat(slot): ajoute les helpers de disponibilite des creneaux"
```

---

### Task 2: Extraction des champs de rendez-vous partagés

Extraction pure, sans changement de comportement. Deux composants plutôt qu'un seul, pour que `AddAppointmentForm` conserve son ordre de champs actuel (heure/durée en haut, type plus bas, après soignants et thématique).

**Files:**
- Create: `front/src/components/custom/appointmentDetailsFields.tsx`
- Modify: `front/src/components/custom/popup/addAppointmentForm.tsx` (remplace les lignes 137-185 et 221-234)

**Interfaces:**
- Consumes: `SelectOption` de `components/ui/select.tsx`, `APPOINTMENT_TYPE_OPTIONS` de `constants/appointment.constant.ts`.
- Produces:
  - `AppointmentTimeFields(props: { date: string; startTime: Dayjs; onStartTimeChange: (value: Dayjs) => void; duration: string; onDurationChange: (value: string) => void; durationOptions: SelectOption[]; disabled?: boolean; durationFieldId?: string; startTimeInfo?: ReactNode; durationInfo?: ReactNode })`
  - `AppointmentTypeField(props: { id?: string; value: string; onChange: (value: string) => void; disabled?: boolean; info?: ReactNode })`

Les props `startTimeInfo` / `durationInfo` / `info` reçoivent le `<FieldInfo field={...} />` du formulaire parent : les composants restent purement présentationnels et ignorent TanStack Form.

- [ ] **Step 1: Créer le composant partagé**

Créer `front/src/components/custom/appointmentDetailsFields.tsx` :

```tsx
import dayjs, { type Dayjs } from 'dayjs'
import type { ReactNode } from 'react'

import { APPOINTMENT_TYPE_OPTIONS } from '../../constants/appointment.constant.ts'
import { FormField } from '../ui/formField.tsx'
import { Label } from '../ui/label.tsx'
import { Select, type SelectOption } from '../ui/select.tsx'
import { TimePicker } from '../ui/timePicker.tsx'

interface AppointmentTimeFieldsProps {
  /** Date ISO du créneau, affichée en toutes lettres. */
  date: string
  startTime: Dayjs
  onStartTimeChange: (value: Dayjs) => void
  duration: string
  onDurationChange: (value: string) => void
  durationOptions: SelectOption[]
  disabled?: boolean
  durationFieldId?: string
  startTimeInfo?: ReactNode
  durationInfo?: ReactNode
}

export function AppointmentTimeFields({
  date,
  startTime,
  onStartTimeChange,
  duration,
  onDurationChange,
  durationOptions,
  disabled = false,
  durationFieldId,
  startTimeInfo,
  durationInfo,
}: AppointmentTimeFieldsProps) {
  return (
    <div className="flex flex-wrap gap-2 items-center">
      <div className="text-sm font-medium">
        {dayjs
          .utc(date)
          .format('dddd D MMMM')
          .replace(/^./, (c) => c.toUpperCase())}
      </div>

      <FormField className="flex items-center gap-2">
        <div className="text-sm text-text-light font-medium mb-0">à</div>
        <div>
          <TimePicker
            value={startTime}
            onChange={(time) => onStartTimeChange(time ?? dayjs.utc())}
            disabled={disabled}
          />
          {startTimeInfo}
        </div>
      </FormField>

      <FormField className="flex items-center gap-2">
        <div className="text-sm text-text-light font-medium mb-0">pendant</div>
        <div>
          <Select
            id={durationFieldId}
            options={durationOptions}
            value={duration}
            onValueChange={onDurationChange}
            disabled={disabled}
            clearable={false}
          />
          {durationInfo}
        </div>
      </FormField>
    </div>
  )
}

interface AppointmentTypeFieldProps {
  id?: string
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  info?: ReactNode
}

export function AppointmentTypeField({
  id,
  value,
  onChange,
  disabled = false,
  info,
}: AppointmentTypeFieldProps) {
  return (
    <FormField>
      <Label htmlFor={id}>Type</Label>
      <Select
        id={id}
        options={APPOINTMENT_TYPE_OPTIONS}
        value={value}
        onValueChange={onChange}
        disabled={disabled}
      />
      {info}
    </FormField>
  )
}
```

- [ ] **Step 2: Brancher `AddAppointmentForm` sur les champs heure/durée**

Dans `front/src/components/custom/popup/addAppointmentForm.tsx`, remplacer le bloc des lignes 137 à 185 (`<div className="flex flex-wrap gap-2 items-center">` … `</div>` fermant, avec les deux `form.Field` `startTime` et `duration`) par :

```tsx
            <form.Field name="startTime">
              {(startTimeField) => (
                <form.Field name="duration">
                  {(durationField) => (
                    <AppointmentTimeFields
                      date={startDate}
                      startTime={startTimeField.state.value}
                      onStartTimeChange={(time) =>
                        startTimeField.handleChange(time)
                      }
                      duration={durationField.state.value}
                      onDurationChange={(value) =>
                        durationField.handleChange(value)
                      }
                      durationOptions={durationOptions}
                      disabled={type === 'multiple'}
                      durationFieldId={durationField.name}
                      startTimeInfo={<FieldInfo field={startTimeField} />}
                      durationInfo={<FieldInfo field={durationField} />}
                    />
                  )}
                </form.Field>
              )}
            </form.Field>
```

- [ ] **Step 3: Brancher `AddAppointmentForm` sur le champ type**

Dans le même fichier, remplacer le bloc `<form.Field name="type">` (lignes 221-234) par :

```tsx
            <form.Field name="type">
              {(field) => (
                <AppointmentTypeField
                  id={field.name}
                  value={field.state.value}
                  onChange={(value) => field.handleChange(value)}
                  info={<FieldInfo field={field} />}
                />
              )}
            </form.Field>
```

- [ ] **Step 4: Nettoyer les imports**

En haut de `addAppointmentForm.tsx` :

- ajouter `import { AppointmentTimeFields, AppointmentTypeField } from '../appointmentDetailsFields.tsx'` ;
- supprimer l'import de `APPOINTMENT_TYPE_OPTIONS` (ligne 5), désormais inutilisé ;
- supprimer `TimePicker` de la liste des imports (ligne 27) ;
- ligne 26, ne garder que `MultiSelect` : `import { MultiSelect } from '../../ui/select.tsx'` — après les steps 2 et 3, `Select` n'est plus employé directement dans ce fichier ;
- conserver `FormField`, `Label`, `Input`, `FieldInfo`, `generateDurationOptions`, qui restent utilisés par les champs Soignants / Thématique / Patients.

- [ ] **Step 5: Vérifier types et lint**

```bash
cd front && npm run build && npm run lint
```

Attendu : build réussi, aucune erreur. Une erreur `'Select' is declared but its value is never read` signalerait un import oublié au step 4.

- [ ] **Step 6: Vérification manuelle de non-régression**

```bash
cd front && npm run dev
```

Sur `/dashboard`, sélectionner un soignant dans la barre latérale, puis :

1. **Créneau individuel** : sélectionner à la souris une plage dans un créneau individuel → le formulaire « Nouveau rendez-vous » s'ouvre, l'heure et la durée sont **modifiables**, la date s'affiche en toutes lettres. L'ordre des champs est : heure/durée, Soignants, Thématique, Type, Patients.
2. **Créneau collectif** : cliquer sur un créneau collectif vide → même formulaire, heure et durée **désactivées**, la ligne « Capacité maximale de ce créneau » est présente.
3. Créer un rendez-vous depuis l'un des deux → toast de succès, le rendez-vous apparaît dans le calendrier.

- [ ] **Step 7: Commit**

```bash
git add front/src/components/custom/appointmentDetailsFields.tsx front/src/components/custom/popup/addAppointmentForm.tsx
git commit -m "refactor(appointment): extrait les champs heure duree et type partages"
```

---

### Task 3: Popup — étape 1 (sélection) et branchement dans les Actions rapides

À l'issue de cette tâche, la popup s'ouvre, filtre et liste les créneaux ; cliquer sur un créneau mène à un récapitulatif en lecture seule avec un bouton « Retour ». Les champs et la création du rendez-vous arrivent en tâche 4.

**Files:**
- Create: `front/src/components/custom/popup/addPatientToSlotForm.tsx`
- Modify: `front/src/routes/_authenticated/dashboard.tsx:140`
- Modify: `front/src/routes/_authenticated/patient/index.tsx:97`

**Interfaces:**
- Consumes: `getUpcomingSlotSuggestions`, `SlotSuggestion` (tâche 1).
- Produces: `export default AddPatientToSlotForm` — composant sans props obligatoires, acceptant `trigger?: React.ReactNode`.

- [ ] **Step 1: Créer la popup avec l'étape 1**

Créer `front/src/components/custom/popup/addPatientToSlotForm.tsx` :

```tsx
import dayjs from 'dayjs'
import { CalendarPlus, X } from 'lucide-react'
import type React from 'react'
import { useMemo, useState } from 'react'

import {
  getUpcomingSlotSuggestions,
  type SlotSuggestion,
} from '../../../libs/slotAvailability.ts'
import { usePatientQueries } from '../../../queries/usePatient.tsx'
import { useAllSlotsQuery } from '../../../queries/useSlot.ts'
import { useThematicQueries } from '../../../queries/useThematic.ts'
import type { Slot } from '../../../types/slot.ts'
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
  PopupTrigger,
} from '../../ui/popup.tsx'
import { Select } from '../../ui/select.tsx'

interface AddPatientToSlotFormProps {
  trigger?: React.ReactNode
}

const formatSlotDate = (date: string) =>
  dayjs
    .utc(date)
    .format('dddd D MMMM')
    .replace(/^./, (c) => c.toUpperCase())

const formatSlotRange = (start: string, end: string) =>
  `${dayjs.utc(start).format('HH[h]mm')} - ${dayjs.utc(end).format('HH[h]mm')}`

const formatSoignants = (slot: Slot) =>
  slot.slotTemplate?.soignants?.length
    ? slot.slotTemplate.soignants.map((soignant) => soignant.name).join(', ')
    : 'Aucun soignant associé'

const getSuggestionBadge = (suggestion: SlotSuggestion) => {
  if (suggestion.alreadyBooked) {
    return 'déjà inscrit'
  }
  if (suggestion.isIndividual) {
    return ''
  }
  return `${suggestion.bookedCount}/${suggestion.capacity}`
}

function AddPatientToSlotForm({ trigger }: AddPatientToSlotFormProps) {
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState(1)
  const [patientID, setPatientID] = useState('')
  const [thematicID, setThematicID] = useState('')
  const [selected, setSelected] = useState<SlotSuggestion | null>(null)

  const { slots } = useAllSlotsQuery()
  const { patients } = usePatientQueries()
  const { thematics } = useThematicQueries()

  const patientOptions = useMemo(
    () =>
      (patients ?? [])
        .map((patient) => ({
          value: patient.id,
          label: `${patient.firstName} ${patient.lastName}`,
          sortKey: `${patient.lastName} ${patient.firstName}`,
        }))
        .sort((a, b) => a.sortKey.localeCompare(b.sortKey, 'fr'))
        .map(({ value, label }) => ({ value, label })),
    [patients],
  )

  const thematicOptions = useMemo(
    () =>
      (thematics ?? [])
        .map((thematic) => ({ value: thematic.id, label: thematic.name }))
        .sort((a, b) => a.label.localeCompare(b.label, 'fr')),
    [thematics],
  )

  const suggestions = useMemo(
    () => getUpcomingSlotSuggestions(slots, thematicID, patientID),
    [slots, thematicID, patientID],
  )

  const selectedPatient = patients?.find((patient) => patient.id === patientID)
  const selectedThematic = thematics?.find(
    (thematic) => thematic.id === thematicID,
  )

  const handleOpenChange = (next: boolean) => {
    setOpen(next)
    if (!next) {
      setStep(1)
      setPatientID('')
      setThematicID('')
      setSelected(null)
    }
  }

  const handleSelectSuggestion = (suggestion: SlotSuggestion) => {
    if (suggestion.alreadyBooked) {
      return
    }
    setSelected(suggestion)
    setStep(2)
  }

  const handleBack = () => {
    setSelected(null)
    setStep(1)
  }

  return (
    <Popup modal open={open} onOpenChange={handleOpenChange}>
      <PopupTrigger asChild>
        {trigger ?? (
          <Button type="button" variant="outline" className="w-full">
            <CalendarPlus className="w-4 h-4" />
            Ajouter un patient à un RDV
          </Button>
        )}
      </PopupTrigger>

      <PopupContent size="lg">
        <PopupHeader>
          <PopupTitle>Ajouter un patient à un rendez-vous</PopupTitle>
        </PopupHeader>

        <PopupBody>
          {step === 1 && (
            <div className="flex flex-col gap-3">
              <FormField>
                <Label htmlFor="patient-selection">Patient</Label>
                <Select
                  id="patient-selection"
                  options={patientOptions}
                  value={patientID}
                  onValueChange={setPatientID}
                  searchable
                  placeholder="Sélectionnez un patient"
                />
              </FormField>

              <FormField>
                <Label htmlFor="thematic-selection">Thématique</Label>
                <Select
                  id="thematic-selection"
                  options={thematicOptions}
                  value={thematicID}
                  onValueChange={setThematicID}
                  disabled={!patientID}
                  placeholder="Sélectionnez une thématique"
                />
              </FormField>

              <div className="flex flex-col gap-2">
                <Label>Prochains créneaux disponibles</Label>

                {!patientID || !thematicID ? (
                  <p className="text-sm text-text-light">
                    Sélectionnez un patient et une thématique.
                  </p>
                ) : suggestions.length === 0 ? (
                  <p className="text-sm text-text-light">
                    Aucun créneau disponible pour cette thématique.
                  </p>
                ) : (
                  <ul className="flex flex-col max-h-72 overflow-y-auto border border-border rounded-lg divide-y divide-border">
                    {suggestions.map((suggestion) => (
                      <li key={suggestion.slot.id}>
                        <button
                          type="button"
                          onClick={() => handleSelectSuggestion(suggestion)}
                          disabled={suggestion.alreadyBooked}
                          className="flex items-center gap-3 w-full text-left px-3 py-2 hover:bg-card disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                        >
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{
                              backgroundColor:
                                suggestion.slot.slotTemplate?.color ?? '#2563eb',
                            }}
                          />
                          <span className="flex flex-col min-w-0 flex-1">
                            <span className="text-sm font-medium">
                              {`${formatSlotDate(suggestion.slot.startDate)} · ${formatSlotRange(suggestion.slot.startDate, suggestion.slot.endDate)}`}
                            </span>
                            <span className="text-xs text-text-light truncate">
                              {formatSoignants(suggestion.slot)}
                            </span>
                          </span>
                          <span className="text-xs text-text-light shrink-0">
                            {getSuggestionBadge(suggestion)}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}

          {step === 2 && selected && (
            <div className="flex flex-col gap-2">
              <div className="text-sm">
                <span className="text-text-light">Patient : </span>
                {selectedPatient
                  ? `${selectedPatient.firstName} ${selectedPatient.lastName}`
                  : ''}
              </div>
              <div className="text-sm">
                <span className="text-text-light">Thématique : </span>
                {selectedThematic?.name ?? ''}
              </div>
              <div className="text-sm">
                <span className="text-text-light">Créneau : </span>
                {formatSlotDate(selected.slot.startDate)}{' '}
                {formatSlotRange(
                  selected.slot.startDate,
                  selected.slot.endDate,
                )}
              </div>
              <div className="text-sm">
                <span className="text-text-light">Soignants : </span>
                {formatSoignants(selected.slot)}
              </div>
            </div>
          )}
        </PopupBody>

        <PopupFooter>
          {step === 2 && (
            <Button variant="outline" onClick={handleBack}>
              Retour
            </Button>
          )}
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            <X className="w-4 h-4" />
            Annuler
          </Button>
        </PopupFooter>
      </PopupContent>
    </Popup>
  )
}

export default AddPatientToSlotForm
```

- [ ] **Step 2: Ajouter le bouton au dashboard**

Dans `front/src/routes/_authenticated/dashboard.tsx`, ajouter l'import :

```tsx
import AddPatientToSlotForm from '../../components/custom/popup/addPatientToSlotForm.tsx'
```

puis remplacer la ligne 140 :

```tsx
      quickActions={[
        <AddPatientForm key="add-patient" />,
        <AddPatientToSlotForm key="add-patient-to-slot" />,
      ]}
```

- [ ] **Step 3: Ajouter le bouton à la liste des patients**

Dans `front/src/routes/_authenticated/patient/index.tsx`, ajouter l'import (un niveau de plus que dans le dashboard, comme l'import existant ligne 7) :

```tsx
import AddPatientToSlotForm from '../../../components/custom/popup/addPatientToSlotForm.tsx'
```

puis remplacer la ligne 97 :

```tsx
    <DashboardLayout
      quickActions={[
        <AddPatientForm key="add-patient" />,
        <AddPatientToSlotForm key="add-patient-to-slot" />,
      ]}
    >
```

- [ ] **Step 4: Vérifier types et lint**

```bash
cd front && npm run build && npm run lint
```

Attendu : build réussi, aucune erreur.

- [ ] **Step 5: Vérification manuelle**

```bash
cd front && npm run dev
```

1. Sur `/dashboard`, le bouton « Ajouter un patient à un RDV » apparaît sous « Ajouter un patient » dans les Actions rapides ; idem sur `/patient`.
2. Ouvrir la popup : le message « Sélectionnez un patient et une thématique » s'affiche, le champ Thématique est désactivé.
3. Choisir un patient : le champ Thématique s'active. Taper dans le champ Patient filtre bien la liste.
4. Choisir une thématique ayant des créneaux futurs : au plus dix créneaux s'affichent, triés par date croissante, avec pastille de couleur, soignants, et compteur `n/capacité` pour les créneaux collectifs.
5. Choisir une thématique sans créneau futur : « Aucun créneau disponible pour cette thématique ».
6. Vérifier qu'un créneau où le patient a déjà un rendez-vous s'affiche grisé, porte « déjà inscrit » et ne réagit pas au clic.
7. Cliquer un créneau disponible → le récapitulatif s'affiche ; « Retour » ramène à la liste, qui a conservé patient et thématique.
8. Fermer puis rouvrir la popup → tous les champs sont réinitialisés.

- [ ] **Step 6: Commit**

```bash
git add front/src/components/custom/popup/addPatientToSlotForm.tsx front/src/routes/_authenticated/dashboard.tsx front/src/routes/_authenticated/patient/index.tsx
git commit -m "feat(dashboard): ajoute l'action rapide d'ajout d'un patient a un RDV"
```

---

### Task 4: Étape 2 — champs de confirmation et création du rendez-vous

**Files:**
- Modify: `front/src/components/custom/popup/addPatientToSlotForm.tsx`

**Interfaces:**
- Consumes: `AppointmentTimeFields`, `AppointmentTypeField` (tâche 2) ; `SlotSuggestion` (tâche 1) ; `useAppointmentMutations` de `queries/useAppointment.ts` ; `generateDurationOptions` de `libs/utils.ts`.
- Produces: rien de nouveau à l'extérieur du composant.

Rappel des trois cas, tirés de la spec :

| Cas | Champs | Mutation |
|---|---|---|
| Individuel | heure et durée modifiables, bornées par le premier intervalle libre ; type à choisir | `createAppointment` |
| Collectif vide | heure et durée figées aux bornes du créneau, désactivées ; type à choisir | `createAppointment` |
| Collectif entamé (`joinableAppointmentID` défini) | heure, durée et type repris du rendez-vous existant, tous désactivés | `updateAppointment` |

- [ ] **Step 1: Ajouter l'état et les valeurs par défaut de l'étape 2**

Dans `addPatientToSlotForm.tsx`, ajouter les imports :

```tsx
import { generateDurationOptions } from '../../../libs/utils.ts'
import { useAppointmentMutations } from '../../../queries/useAppointment.ts'
import {
  AppointmentTimeFields,
  AppointmentTypeField,
} from '../appointmentDetailsFields.tsx'
```

Ajouter, à côté des autres `useState` :

```tsx
  const [startTime, setStartTime] = useState(dayjs.utc())
  const [duration, setDuration] = useState('')
  const [appointmentType, setAppointmentType] = useState('')

  const { createAppointment, updateAppointment } = useAppointmentMutations()
```

Ajouter au-dessus du composant l'utilitaire d'arrondi (les options de durée avancent par pas de 15 minutes, une durée de thématique de 20 min ne correspondrait à aucune option) :

```tsx
const roundDownToStep = (minutes: number) =>
  Math.max(15, Math.floor(minutes / 15) * 15)
```

Compléter enfin `handleOpenChange` pour remettre ces trois états à zéro à la fermeture, à la suite de `setSelected(null)` :

```tsx
      setStartTime(dayjs.utc())
      setDuration('')
      setAppointmentType('')
```

- [ ] **Step 2: Pré-remplir les champs au choix du créneau**

Remplacer `handleSelectSuggestion` par :

```tsx
  const handleSelectSuggestion = (suggestion: SlotSuggestion) => {
    if (suggestion.alreadyBooked) {
      return
    }

    const { slot, isIndividual, freeInterval, joinableAppointmentID } = suggestion

    if (joinableAppointmentID) {
      // On rejoint un rendez-vous collectif existant : ses valeurs font foi.
      const existing = slot.appointments?.find(
        (appointment) => appointment.id === joinableAppointmentID,
      )
      setStartTime(dayjs.utc(existing?.startDate ?? slot.startDate))
      setDuration(
        roundDownToStep(
          dayjs
            .utc(existing?.endDate ?? slot.endDate)
            .diff(dayjs.utc(existing?.startDate ?? slot.startDate), 'minute'),
        ).toString(),
      )
      setAppointmentType(existing?.type ?? '')
    } else if (isIndividual && freeInterval) {
      const intervalStart = dayjs.utc(freeInterval.start)
      const intervalMinutes = dayjs
        .utc(freeInterval.end)
        .diff(intervalStart, 'minute')
      const thematicDuration = selectedThematic?.duration ?? null
      const defaultDuration =
        thematicDuration && thematicDuration <= intervalMinutes
          ? thematicDuration
          : intervalMinutes

      setStartTime(intervalStart)
      setDuration(roundDownToStep(defaultDuration).toString())
      setAppointmentType('')
    } else {
      // Créneau collectif encore vide : le rendez-vous occupe tout le créneau.
      setStartTime(dayjs.utc(slot.startDate))
      setDuration(
        roundDownToStep(
          dayjs.utc(slot.endDate).diff(dayjs.utc(slot.startDate), 'minute'),
        ).toString(),
      )
      setAppointmentType('')
    }

    setSelected(suggestion)
    setStep(2)
  }
```

- [ ] **Step 3: Calculer les options de durée et les états désactivés**

Ajouter, après les `useMemo` existants :

```tsx
  const joinedAppointment = selected?.joinableAppointmentID
    ? selected.slot.appointments?.find(
        (appointment) => appointment.id === selected.joinableAppointmentID,
      )
    : undefined

  const isJoining = !!joinedAppointment
  const areTimeFieldsDisabled = isJoining || !selected?.isIndividual

  const durationOptions = useMemo(() => {
    if (!selected) {
      return []
    }
    if (selected.isIndividual && selected.freeInterval) {
      return generateDurationOptions(
        selected.freeInterval.start,
        selected.freeInterval.end,
      )
    }
    return generateDurationOptions(
      selected.slot.startDate,
      selected.slot.endDate,
    )
  }, [selected])
```

- [ ] **Step 4: Afficher les champs dans l'étape 2**

Dans le bloc `{step === 2 && selected && (…)}`, sous les quatre lignes de récapitulatif, ajouter :

```tsx
              {isJoining && (
                <p className="text-sm text-text-light">
                  Vous rejoignez un rendez-vous existant ({selected.bookedCount}/
                  {selected.capacity} patients).
                </p>
              )}

              <AppointmentTimeFields
                date={selected.slot.startDate}
                startTime={startTime}
                onStartTimeChange={setStartTime}
                duration={duration}
                onDurationChange={setDuration}
                durationOptions={durationOptions}
                disabled={areTimeFieldsDisabled}
                durationFieldId="appointment-duration"
              />

              <AppointmentTypeField
                id="appointment-type"
                value={appointmentType}
                onChange={setAppointmentType}
                disabled={isJoining}
              />
```

- [ ] **Step 5: Implémenter la confirmation**

Ajouter la fonction de soumission, au-dessus du `return` :

```tsx
  const handleConfirm = () => {
    if (!selected || !patientID) {
      return
    }

    if (joinedAppointment) {
      updateAppointment.mutate(
        {
          id: joinedAppointment.id,
          thematicId: joinedAppointment.thematicId ?? thematicID,
          type: joinedAppointment.type,
          appointmentPatients: [
            ...(joinedAppointment.appointmentPatients ?? []).map(
              (appointmentPatient) => ({
                id: appointmentPatient.id,
                patientID: appointmentPatient.patient.id,
                accompanying: appointmentPatient.accompanying,
                status: appointmentPatient.status,
                rejectionReason: appointmentPatient.rejectionReason,
                transmissionNotes: appointmentPatient.transmissionNotes,
              }),
            ),
            { patientID },
          ],
        },
        { onSuccess: () => handleOpenChange(false) },
      )
      return
    }

    const start = selected.isIndividual
      ? startTime
      : dayjs.utc(selected.slot.startDate)
    const end = selected.isIndividual
      ? start.add(Number.parseInt(duration, 10), 'minute')
      : dayjs.utc(selected.slot.endDate)

    createAppointment.mutate(
      {
        startDate: start.toISOString(),
        endDate: end.toISOString(),
        slotID: selected.slot.id,
        thematicId: thematicID,
        type: appointmentType,
        patientIDs: [patientID],
      },
      { onSuccess: () => handleOpenChange(false) },
    )
  }
```

- [ ] **Step 6: Ajouter le bouton « Ajouter » au pied de la popup**

Dans `PopupFooter`, avant le bouton « Retour » :

```tsx
          {step === 2 && (
            <Button
              variant="default"
              onClick={handleConfirm}
              isLoading={createAppointment.isPending || updateAppointment.isPending}
            >
              <Check className="w-4 h-4" />
              Ajouter
            </Button>
          )}
```

Compléter l'import lucide : `import { CalendarPlus, Check, X } from 'lucide-react'`.

- [ ] **Step 7: Vérifier types et lint**

```bash
cd front && npm run build && npm run lint
```

Attendu : build réussi, aucune erreur.

- [ ] **Step 8: Vérification manuelle des trois cas**

```bash
cd front && npm run dev
```

1. **Créneau individuel** — choisir un patient, une thématique portée par un créneau individuel futur, cliquer le créneau. L'heure est pré-remplie au début du créneau (ou après le dernier rendez-vous existant), la durée vaut celle de la thématique si elle tient, les deux champs sont modifiables, les options de durée s'arrêtent à la fin de l'intervalle libre. Choisir un type, cliquer « Ajouter » → toast de succès, popup fermée, rendez-vous visible dans le calendrier du dashboard sans rechargement.
2. **Créneau collectif vide** — même parcours sur un créneau collectif sans rendez-vous : heure et durée désactivées et égales aux bornes du créneau, type modifiable. « Ajouter » → succès, le compteur passe à `1/capacité` si l'on rouvre la popup.
3. **Créneau collectif entamé** — sur ce même créneau, refaire le parcours avec un **autre** patient : la mention « Vous rejoignez un rendez-vous existant (1/N patients) » s'affiche, les trois champs sont désactivés. « Ajouter » → succès. Ouvrir le rendez-vous depuis le calendrier : les deux patients y figurent, dans **un seul** rendez-vous, et les données du premier patient (statut, accompagnant, notes de transmission) sont intactes.
4. **Déjà inscrit** — rouvrir la popup avec le premier patient et la même thématique : le créneau est grisé et marqué « déjà inscrit ».
5. **Créneau complet** — remplir un créneau collectif jusqu'à sa capacité, puis vérifier qu'il disparaît de la liste pour un nouveau patient.

- [ ] **Step 9: Commit**

```bash
git add front/src/components/custom/popup/addPatientToSlotForm.tsx
git commit -m "feat(dashboard): ajoute l'etape de confirmation et la creation du RDV"
```

---

## Vérification finale

- [ ] `cd front && npm run build` — succès
- [ ] `cd front && npm run lint` — aucune erreur
- [ ] Les cinq vérifications manuelles de la tâche 4, step 8, passent
- [ ] La non-régression de `AddAppointmentForm` (tâche 2, step 6) passe toujours
- [ ] `git log --oneline -4` montre les quatre commits de ce plan

## Hors périmètre

- Filtrer par soignant ou par parcours dans la popup.
- Modifier ou annuler un rendez-vous existant depuis cette popup.
- Toute pagination au-delà des dix premiers créneaux.
- Ajout d'un framework de test au front.
