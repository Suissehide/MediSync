# Planning — Duplicate slot, fix drag & drop save, snap 15min

**Date:** 2026-03-30
**Scope:** `/settings/planning` page — `calendar.tsx`, `eventContent.tsx`, `planning.tsx`

---

## 1. Bouton dupliquer un slot au hover

### Comportement
- Au survol d'un slot (normal ou edit mode), un bouton avec icône `Copy` apparaît en haut à droite de l'event.
- Cliquer dessus crée une copie exacte du slot (même jour, même heure) sans ouvrir de formulaire.
- Le slot dupliqué peut ensuite être déplacé par drag & drop.
- Le bouton est visible sur les slots de type `slot` (mode normal) et `template` (edit mode).
- Il n'apparaît pas sur les background events (individual/multiple).

### Architecture

**`EventContent` (`eventContent.tsx`)**
- Nouvelle prop : `onDuplicate?: (eventId: string) => void`
- Bouton `Copy` (lucide) positionné `absolute top-1 right-1`
- Classes : `opacity-0 group-hover:opacity-100 transition-opacity`
- `e.stopPropagation()` dans le onClick pour ne pas déclencher l'ouverture du sheet
- Visible uniquement si `type === 'slot'` ou `type === 'template'` (pas si `states` contient `individual` ou `multiple`)

**`Calendar` (`calendar.tsx`)**
- Nouvelle prop : `onDuplicate?: (eventId: string) => void`
- Passée à `EventContent` via `eventContent` render prop

**`planning.tsx`**
- Nouvelle prop transmise à `Calendar` : `onDuplicate={handleDuplicateSlot}`
- `handleDuplicateSlot(eventId: string)` :
  - Si `eventId` commence par `slot_` → cherche dans `slots` → appelle `createSlot` avec `CreateSlotParamsWithTemplateData` : `startDate`, `endDate` du slot, et `slotTemplate` construit depuis `slot.slotTemplate` (thematic, location, description, color, isIndividual, soignantID)
  - Si `eventId` commence par `template_` → cherche dans `currentPathwayTemplate.slotTemplates` → appelle `createSlotTemplate` avec toutes les données du template (startTime, endTime, offsetDays, thematic, location, description, color, isIndividual, soignantID, templateID)

---

## 2. Fix drag & drop — le sheet s'ouvre après chaque drag

### Cause
Dans `calendar.tsx`, un `mousedown` global pose `clickedEventRef.current = eventID`, et un `mouseup` global appelle `handleClickEvent?.(clicked)`. Lors d'un drag & drop, le `mouseup` final déclenche aussi ce handler, ce qui ouvre le sheet comme si l'event avait été cliqué.

### Fix
Ajouter un `isDraggingRef = useRef(false)` :
- `eventDragStart` → `isDraggingRef.current = true`
- `eventDragStop` → reset `isDraggingRef.current = false` après un `setTimeout(0)` (pour laisser le mouseup se déclencher avant le reset)
- Dans le handler `mouseup` : si `isDraggingRef.current` est `true`, skip l'appel à `handleClickEvent`

Même logique pour `eventResizeStart` / `eventResizeStop`.

---

## 3. Snap à 15 minutes

### Fix
Ajouter `snapDuration="00:15:00"` dans le composant `FullCalendar` de `calendar.tsx`.

La grille visuelle reste à 30 minutes (`slotDuration="00:30:00"`), seul le snapping du drag & resize passe à 15 minutes.

---

## Fichiers modifiés

| Fichier | Changement |
|---|---|
| `front/src/components/custom/Calendar/eventContent.tsx` | Prop `onDuplicate`, bouton Copy au hover |
| `front/src/components/custom/Calendar/calendar.tsx` | Prop `onDuplicate`, fix isDraggingRef, snapDuration |
| `front/src/routes/_authenticated/_admin/settings/planning.tsx` | `handleDuplicateSlot`, passer `onDuplicate` à Calendar |
