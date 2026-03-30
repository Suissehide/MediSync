# Planning — Duplicate slot, drag fix, snap 15min — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter un bouton de duplication au hover sur les slots du calendrier planning, corriger l'ouverture du sheet après un drag & drop, et passer le snap à 15 minutes.

**Architecture:** Trois modifications indépendantes sur les mêmes fichiers — `eventContent.tsx` (bouton copy), `calendar.tsx` (isDraggingRef + snapDuration), `planning.tsx` (handleDuplicateSlot). Pas de nouveaux fichiers.

**Tech Stack:** React, FullCalendar v6, TanStack Query, Tailwind CSS, Lucide React, TypeScript

**Spec:** `docs/superpowers/specs/2026-03-30-planning-slot-duplicate-design.md`

---

## Fichiers modifiés

| Fichier | Rôle |
|---|---|
| `front/src/components/custom/Calendar/calendar.tsx` | Prop `onDuplicate`, `isDraggingRef`, `snapDuration` |
| `front/src/components/custom/Calendar/eventContent.tsx` | Prop `onDuplicate`, bouton Copy |
| `front/src/routes/_authenticated/_admin/settings/planning.tsx` | `handleDuplicateSlot`, passer `onDuplicate` |

---

## Task 1: Snap à 15 minutes

**Files:**
- Modify: `front/src/components/custom/Calendar/calendar.tsx`

- [ ] **Step 1: Ajouter `snapDuration` dans le FullCalendar**

Dans `calendar.tsx`, trouver le bloc `FullCalendar` et ajouter `snapDuration` juste après `slotLabelInterval` :

```tsx
// avant
slotLabelInterval="01:00"
editable={editable}

// après
slotLabelInterval="01:00"
snapDuration="00:15:00"
editable={editable}
```

- [ ] **Step 2: Vérifier le build**

```bash
cd front && npx tsc -b --noEmit
```

Expected: aucune erreur TypeScript.

- [ ] **Step 3: Test manuel**

Ouvrir `/settings/planning`, drag un slot — vérifier qu'il se déplace par tranches de 15 minutes.

- [ ] **Step 4: Commit**

```bash
git add front/src/components/custom/Calendar/calendar.tsx
git commit -m "feat(planning): snap drag & resize to 15min intervals"
```

---

## Task 2: Fix drag & drop — le sheet s'ouvre après chaque drag

**Files:**
- Modify: `front/src/components/custom/Calendar/calendar.tsx`

**Contexte:** Le handler `mousedown` global pose `clickedEventRef.current = eventID`. Le handler `mouseup` global appelle `handleClickEvent?.(clicked)`. Lors d'un drag, le `mouseup` final déclenche aussi ce handler, ce qui ouvre le sheet. Fix : poser un `isDraggingRef` pendant le drag, et le lire dans `mouseup` pour skip l'appel.

- [ ] **Step 1: Ajouter `isDraggingRef`**

Dans `calendar.tsx`, après les `useRef` existants, ajouter :

```tsx
const isDraggingRef = useRef(false)
```

Les refs existants pour référence :
```tsx
const lastDropTimeRef = useRef<number>(0)
const calendarRef = useRef<FullCalendar | null>(null)
const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null)
// ... ajouter ici :
const isDraggingRef = useRef(false)
```

- [ ] **Step 2: Brancher `isDraggingRef` sur les événements drag/resize de FullCalendar**

Dans le composant `FullCalendar`, ajouter ces 4 props (après `eventResize`) :

```tsx
eventDragStart={() => {
  isDraggingRef.current = true
}}
eventDragStop={() => {
  setTimeout(() => {
    isDraggingRef.current = false
  }, 0)
}}
eventResizeStart={() => {
  isDraggingRef.current = true
}}
eventResizeStop={() => {
  setTimeout(() => {
    isDraggingRef.current = false
  }, 0)
}}
```

Le `setTimeout(..., 0)` est intentionnel : il remet le flag à `false` après que le `mouseup` global ait eu le temps de se déclencher.

- [ ] **Step 3: Lire `isDraggingRef` dans le handler `mouseup`**

Trouver le `useEffect` qui contient `handleMouseDown` et `handleMouseUp` (~ligne 145). Modifier `handleMouseUp` :

```tsx
// avant
const handleMouseUp = () => {
  const clicked = clickedEventRef.current
  if (!clicked) {
    return
  }
  clickedEventRef.current = null
  handleClickEvent?.(clicked)
}

// après
const handleMouseUp = () => {
  const clicked = clickedEventRef.current
  if (!clicked) {
    return
  }
  clickedEventRef.current = null
  if (!isDraggingRef.current) {
    handleClickEvent?.(clicked)
  }
}
```

- [ ] **Step 4: Vérifier le build**

```bash
cd front && npx tsc -b --noEmit
```

Expected: aucune erreur TypeScript.

- [ ] **Step 5: Test manuel**

- Drag un slot vers une autre heure → le sheet ne doit PAS s'ouvrir
- Cliquer sur un slot sans le déplacer → le sheet DOIT s'ouvrir normalement

- [ ] **Step 6: Commit**

```bash
git add front/src/components/custom/Calendar/calendar.tsx
git commit -m "fix(planning): prevent event sheet opening after drag & drop"
```

---

## Task 3: Bouton dupliquer dans EventContent

**Files:**
- Modify: `front/src/components/custom/Calendar/eventContent.tsx`

- [ ] **Step 1: Ajouter `Copy` aux imports Lucide et la prop `onDuplicate`**

En haut du fichier, modifier l'import Lucide :

```tsx
// avant
import { Plus } from 'lucide-react'

// après
import { Copy, Plus } from 'lucide-react'
```

Modifier le type `Props` :

```tsx
// avant
type Props = {
  setOpenEventId?: (eventId: string) => void
  eventContent: EventContentArg
  editMode?: boolean
}

// après
type Props = {
  setOpenEventId?: (eventId: string) => void
  eventContent: EventContentArg
  editMode?: boolean
  onDuplicate?: (eventId: string) => void
}
```

Destructurer `onDuplicate` dans la signature de la fonction :

```tsx
// avant
export const EventContent = ({
  eventContent,
  setOpenEventId,
  editMode,
}: Props) => {

// après
export const EventContent = ({
  eventContent,
  setOpenEventId,
  editMode,
  onDuplicate,
}: Props) => {
```

- [ ] **Step 2: Ajouter le bouton Copy dans le JSX**

À l'intérieur du `div.fc-event-hero`, juste après l'ouverture du div (avant le bloc `(!isFillable || ...)`), ajouter :

```tsx
{onDuplicate &&
  !containsKeyword(states, ['editable', 'individual', 'multiple']) &&
  (type === 'slot' || type === 'template') && (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        onDuplicate(event.id)
      }}
      className="absolute top-0.5 right-0.5 opacity-0 group-hover:opacity-100 transition-opacity z-10 p-0.5 rounded bg-black/20 hover:bg-black/40"
    >
      <Copy className="w-2.5 h-2.5 text-white" />
    </button>
  )}
```

Le résultat dans le JSX doit ressembler à :

```tsx
return (
  <div
    {...(event.id ? { 'data-event-id': `${event.id}` } : {})}
    className={clsx(
      'fc-event-hero relative group cursor-pointer h-full w-full flex flex-col text-left p-0.5 text-text-dark transition duration-200',
      {
        'pointer-events-none': containsKeyword(states, ['editable']),
        'opacity-45 bg-gray-400 rounded-sm': editMode && type === 'slot',
      },
    )}
  >
    {onDuplicate &&
      !containsKeyword(states, ['editable', 'individual', 'multiple']) &&
      (type === 'slot' || type === 'template') && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onDuplicate(event.id)
          }}
          className="absolute top-0.5 right-0.5 opacity-0 group-hover:opacity-100 transition-opacity z-10 p-0.5 rounded bg-black/20 hover:bg-black/40"
        >
          <Copy className="w-2.5 h-2.5 text-white" />
        </button>
      )}

    {(!isFillable || (isFillable && appointments.length === 0)) && (
      // ... reste du JSX inchangé
```

- [ ] **Step 3: Vérifier le build**

```bash
cd front && npx tsc -b --noEmit
```

Expected: aucune erreur TypeScript.

- [ ] **Step 4: Commit**

```bash
git add front/src/components/custom/Calendar/eventContent.tsx
git commit -m "feat(planning): add duplicate button on slot hover"
```

---

## Task 4: Passer `onDuplicate` à travers Calendar

**Files:**
- Modify: `front/src/components/custom/Calendar/calendar.tsx`

- [ ] **Step 1: Ajouter `onDuplicate` à `CalendarProps`**

Trouver l'interface `CalendarProps` et ajouter la prop :

```tsx
// avant
interface CalendarProps {
  events: CalendarEvent[]
  handleSelectEvent?: (arg: DateSelectArg) => void
  handleEditEvent?: (arg: EventDropArg | EventResizeDoneArg) => void
  handleClickEvent?: (eventID: string) => void
  handleDropEvent?: (pathwayTemplateID: string, startDate: string) => void
  handleOpenEvent?: (eventId: string) => void
  selectAllow?: (selectInfo: DateSpanApi) => boolean
  editMode?: boolean
  headerToolbar?: ToolbarInput
  editable?: boolean
  overlap?: boolean
  initialDate?: string
  forbiddenWeeks?: { id: string; startOfWeek: string }[]
  onForbiddenWeekCreate?: (date: string) => void
  onForbiddenWeekDelete?: (id: string) => void
}

// après — ajouter onDuplicate à la fin
interface CalendarProps {
  events: CalendarEvent[]
  handleSelectEvent?: (arg: DateSelectArg) => void
  handleEditEvent?: (arg: EventDropArg | EventResizeDoneArg) => void
  handleClickEvent?: (eventID: string) => void
  handleDropEvent?: (pathwayTemplateID: string, startDate: string) => void
  handleOpenEvent?: (eventId: string) => void
  selectAllow?: (selectInfo: DateSpanApi) => boolean
  editMode?: boolean
  headerToolbar?: ToolbarInput
  editable?: boolean
  overlap?: boolean
  initialDate?: string
  forbiddenWeeks?: { id: string; startOfWeek: string }[]
  onForbiddenWeekCreate?: (date: string) => void
  onForbiddenWeekDelete?: (id: string) => void
  onDuplicate?: (eventId: string) => void
}
```

- [ ] **Step 2: Destructurer `onDuplicate` dans la signature de `Calendar`**

```tsx
// avant
function Calendar({
  events,
  handleSelectEvent,
  handleEditEvent,
  handleDropEvent,
  handleClickEvent,
  handleOpenEvent,
  selectAllow,
  editMode,
  headerToolbar,
  editable = false,
  overlap = true,
  initialDate,
  forbiddenWeeks = [],
  onForbiddenWeekCreate,
  onForbiddenWeekDelete,
}: CalendarProps) {

// après
function Calendar({
  events,
  handleSelectEvent,
  handleEditEvent,
  handleDropEvent,
  handleClickEvent,
  handleOpenEvent,
  selectAllow,
  editMode,
  headerToolbar,
  editable = false,
  overlap = true,
  initialDate,
  forbiddenWeeks = [],
  onForbiddenWeekCreate,
  onForbiddenWeekDelete,
  onDuplicate,
}: CalendarProps) {
```

- [ ] **Step 3: Passer `onDuplicate` à `EventContent`**

Trouver le render prop `eventContent` dans le `FullCalendar` :

```tsx
// avant
eventContent={(eventContent) => (
  <EventContent
    setOpenEventId={handleOpenEvent}
    eventContent={eventContent}
    editMode={editMode}
  />
)}

// après
eventContent={(eventContent) => (
  <EventContent
    setOpenEventId={handleOpenEvent}
    eventContent={eventContent}
    editMode={editMode}
    onDuplicate={onDuplicate}
  />
)}
```

- [ ] **Step 4: Vérifier le build**

```bash
cd front && npx tsc -b --noEmit
```

Expected: aucune erreur TypeScript.

- [ ] **Step 5: Commit**

```bash
git add front/src/components/custom/Calendar/calendar.tsx
git commit -m "feat(planning): wire onDuplicate prop through Calendar"
```

---

## Task 5: Implémenter `handleDuplicateSlot` dans planning.tsx

**Files:**
- Modify: `front/src/routes/_authenticated/_admin/settings/planning.tsx`

**Contexte:**
- En mode normal (`slot_xxx`): `slots` vient de `useAllSlotsQuery()`, chaque slot a un `slotTemplate` avec toutes les données. On appelle `createSlot.mutate` avec `CreateSlotParamsWithTemplateData`.
- En edit mode (`template_xxx`): `currentPathwayTemplate?.slotTemplates` contient les templates. On appelle `createSlotTemplate.mutate` avec `CreateSlotTemplateParams`.
- `createSlot` et `createSlotTemplate` sont déjà disponibles dans le composant.

- [ ] **Step 1: Ajouter l'import `CreateSlotParamsWithTemplateData` si absent**

Vérifier la ligne d'import en haut du fichier. Elle doit contenir `CreateSlotParamsWithTemplateData` :

```tsx
import type { CreateSlotParamsWithTemplateData } from '../../../../types/slot.ts'
```

Cet import existe déjà dans `planning.tsx` — ne rien changer.

- [ ] **Step 2: Ajouter `handleDuplicateSlot` dans le composant `Planning`**

Après la définition de `handleDeleteEvent`, ajouter :

```tsx
const handleDuplicateSlot = (eventId: string) => {
  if (eventId.startsWith('slot_')) {
    const slotId = eventId.replace('slot_', '')
    const slot = slots?.find((s) => s.id === slotId)
    if (!slot) return
    const duplicateParams: CreateSlotParamsWithTemplateData = {
      startDate: slot.startDate,
      endDate: slot.endDate,
      slotTemplate: {
        startTime: slot.startDate,
        endTime: slot.endDate,
        thematic: slot.slotTemplate.thematic,
        location: slot.slotTemplate.location,
        description: slot.slotTemplate.description,
        color: slot.slotTemplate.color,
        isIndividual: slot.slotTemplate.isIndividual,
        soignantID: slot.slotTemplate.soignant?.id ?? '',
      },
    }
    createSlot.mutate(duplicateParams)
  } else if (eventId.startsWith('template_')) {
    const templateId = eventId.replace('template_', '')
    const slotTemplate = currentPathwayTemplate?.slotTemplates?.find(
      (t) => t.id === templateId,
    )
    if (!slotTemplate || !currentPathwayTemplate) return
    createSlotTemplate.mutate({
      startTime: slotTemplate.startTime,
      endTime: slotTemplate.endTime,
      offsetDays: slotTemplate.offsetDays,
      thematic: slotTemplate.thematic,
      location: slotTemplate.location,
      description: slotTemplate.description,
      color: slotTemplate.color,
      isIndividual: slotTemplate.isIndividual,
      soignantID: slotTemplate.soignant?.id ?? '',
      templateID: currentPathwayTemplate.id,
    })
  }
}
```

- [ ] **Step 3: Passer `onDuplicate` au composant `Calendar`**

Trouver le composant `<Calendar` dans le JSX et ajouter la prop :

```tsx
// avant
<Calendar
  events={mergedEvents}
  handleSelectEvent={handleSelectSlot}
  handleEditEvent={handleEditSlot}
  handleDropEvent={handleInstantiatePathway}
  handleClickEvent={setOpenEventId}
  handleOpenEvent={setOpenEventId}
  editMode={editMode}
  editable={true}
  forbiddenWeeks={forbiddenWeeks ?? []}
/>

// après
<Calendar
  events={mergedEvents}
  handleSelectEvent={handleSelectSlot}
  handleEditEvent={handleEditSlot}
  handleDropEvent={handleInstantiatePathway}
  handleClickEvent={setOpenEventId}
  handleOpenEvent={setOpenEventId}
  editMode={editMode}
  editable={true}
  forbiddenWeeks={forbiddenWeeks ?? []}
  onDuplicate={handleDuplicateSlot}
/>
```

- [ ] **Step 4: Vérifier le build**

```bash
cd front && npx tsc -b --noEmit
```

Expected: aucune erreur TypeScript.

- [ ] **Step 5: Test manuel — mode normal**

1. Aller sur `/settings/planning`
2. Survoler un slot → le bouton `Copy` (petite icône) doit apparaître en haut à droite
3. Cliquer sur le bouton Copy → un toast "Créneau créé avec succès" doit apparaître
4. Vérifier que le slot dupliqué apparaît au même créneau horaire dans le calendrier
5. Drag & drop le slot dupliqué → vérifier que le déplacement se sauvegarde (toast "Créneau modifié") et que le sheet ne s'ouvre PAS après le drag

- [ ] **Step 6: Test manuel — edit mode**

1. Activer le edit mode (parcours template)
2. Survoler un slot template → le bouton `Copy` doit apparaître
3. Cliquer → toast "Template de créneau créé avec succès"
4. Vérifier l'apparition du template dupliqué

- [ ] **Step 7: Commit**

```bash
git add front/src/routes/_authenticated/_admin/settings/planning.tsx
git commit -m "feat(planning): implement slot duplication from hover button"
```
