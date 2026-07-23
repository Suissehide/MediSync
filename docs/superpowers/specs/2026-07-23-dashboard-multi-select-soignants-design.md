# Dashboard: multi-select caregivers

**Date:** 2026-07-23
**Area:** `front/` (React dashboard)

## Goal

Replace the dashboard's single-caregiver selector and its "Tous les soignants"
option with a multi-select list, add a clear button, and show nothing when the
selection is empty.

## Current behavior

- `useSoignantStore` holds `selectedSoignantID: string | null`, with the special
  marker `'all'` meaning "show every caregiver's slots".
- The sidebar (`soignant.sidebar.tsx`) is a single-select button list with a
  dedicated "Tous les soignants" row at the top.
- `dashboard.tsx` filters slots: `'all'`/empty → all slots; a specific id →
  slots whose `slotTemplate.soignants` include that id.
- The header shows `'Tous les soignants'` or the single caregiver's name.

## Target behavior

### Store (`useSoignantStore.ts`)
- `selectedSoignantID: string | null` → `selectedSoignantIDs: string[]`,
  initialised to `[]`.
- `selectSoignant(id)` → `toggleSoignant(id)`: add id if absent, remove if present.
- Add `clearSoignants()` → sets `selectedSoignantIDs: []`.
- Remove the `'all'` marker entirely.

### Sidebar (`soignant.sidebar.tsx`)
- Remove the "Tous les soignants" row.
- Each caregiver row toggles membership in `selectedSoignantIDs` on click; the
  highlighted background (`bg-[#ffffff10]`) applies when the row's id is selected,
  plus a small check indicator on selected rows.
- Add an "Effacer" clear button at the top of the list, shown/enabled only when
  `selectedSoignantIDs.length > 0`, calling `clearSoignants()`.

### Dashboard (`dashboard.tsx`)
- Read `selectedSoignantIDs`.
- Filter: keep a slot if **any** selected caregiver is in
  `slot.slotTemplate.soignants`. Empty selection → no events (show nothing).
- Header title: join selected caregivers' names with `, `. When the selection is
  empty, show the placeholder `Sélectionnez un soignant`.

## Out of scope

- Slot fetching stays "fetch all, filter client-side".
- `addAppointmentForm` / `appointmentSheet` still receive a slot's own
  `soignants`; unaffected.
