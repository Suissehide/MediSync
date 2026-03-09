# Forbidden Weeks — Design Document

**Date:** 2026-03-09
**Status:** Approved

## Overview

Add a global "forbidden weeks" system: certain weeks cannot receive any slots. When instantiating a pathway from a template, if any calculated slot falls on a forbidden week, the pathway's start date is automatically shifted by one week and recalculated, repeating until no slots land on a forbidden week.

---

## Data Model

New Prisma model:

```prisma
model ForbiddenWeek {
  id          String   @id @default(cuid())
  startOfWeek DateTime // Always a Monday at 00:00:00 UTC — unique constraint
  createdAt   DateTime @default(now())

  @@unique([startOfWeek])
}
```

- `startOfWeek` is always normalized to the Monday of the given week (using `startOfISOWeek` from date-fns).
- No relations to other models — this is global configuration data.
- A "forbidden week" covers the interval `[startOfWeek, startOfWeek + 7 days[`.

---

## Backend

### New route: `/forbidden-week`

| Method | Path | Body / Params | Description |
|--------|------|---------------|-------------|
| GET | `/forbidden-week` | — | List all forbidden weeks |
| POST | `/forbidden-week` | `{ date: Date }` | Create a forbidden week (date normalized to Monday) |
| DELETE | `/forbidden-week/:id` | — | Delete a forbidden week |

### Modified: `POST /pathway/instantiate`

Before creating slots, apply the following shift loop:

```
1. Load all ForbiddenWeeks
2. Compute candidate slot dates from (startDate + offsetDays) for each SlotTemplate
3. While any slot date falls within a forbidden week [startOfWeek, startOfWeek + 7 days[:
     startDate += 7 days
     Recompute candidate slot dates
4. Proceed with normal instantiation using the adjusted startDate
```

Complexity: O(n × m) where n = forbidden weeks count, m = number of shifts required. Acceptable for real-world usage.

---

## Frontend

### Data fetching

New hook `useForbiddenWeeks()`:
- Fetches `GET /forbidden-week` on calendar mount
- Returns the list as FullCalendar background events (one per forbidden week, 7-day duration, `display: 'background'`, distinct color e.g. semi-transparent red)

### Calendar display

Each forbidden week is rendered as a FullCalendar background event covering the full 7-day span. This is native FullCalendar functionality and requires no custom rendering.

### Admin interactions (role-guarded)

**Create:**
1. Admin clicks on an empty area of an unmarked week → FullCalendar `dateClick` or `select` callback
2. Confirmation popup: "Marquer la semaine du [lundi date] comme interdite ?"
3. On confirm → `POST /forbidden-week` → refresh forbidden weeks list

**Delete:**
1. Admin clicks on the background event of a forbidden week → FullCalendar `eventClick` callback
2. Confirmation popup: "Retirer l'interdiction de la semaine du [lundi date] ?"
3. On confirm → `DELETE /forbidden-week/:id` → refresh forbidden weeks list

Both interactions are only available to admin users, consistent with existing role guards in the project.

---

## Out of Scope

- No notification to the user when a shift occurs during instantiation (the adjusted date will be visible on the calendar).
- No retroactive effect on existing pathways when a forbidden week is added.
- No support for multi-week or variable-length forbidden periods.
