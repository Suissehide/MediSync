# Regenerate Instantiated Pathways — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an "Actions" button on the admin planning page that opens a popup to regenerate the empty slots of already-instantiated pathways (of a chosen template, from a chosen date) against the current theoretical template, while preserving slots that already have appointments.

**Architecture:** A dedicated backend endpoint `POST /pathway/regenerate` does the whole operation server-side inside a Prisma transaction (find matching pathways, delete empty slots, keep slots with appointments, regenerate missing steps from the current template while skipping duplicates). The frontend adds an "Actions" dropdown → popup (template `Select` + "from date" `DatePicker`) that calls a TanStack Query mutation and invalidates the slot/pathway caches. The forbidden-week offset logic currently inline in the instantiate route is extracted into a shared util so both instantiate and regenerate use one source of truth.

**Tech Stack:** Backend — Node/Fastify, Prisma (client generated into `back/src/generated/`), Zod v4, `@hapi/boom`, dayjs, Awilix IoC. Frontend — React 19 + TS, TanStack Query, `@radix-ui/react-dropdown-menu`, MUI DatePicker, custom `Popup`/`Select` components.

## Global Constraints

- **No automated tests exist in this repo.** Verification is by `npm run build` (typecheck) + `npm run lint` + manual smoke test. Do NOT scaffold a test framework.
- Backend: import Prisma models from `back/src/generated/client`, NOT `@prisma/client`.
- Backend code style (Biome): 2-space indent, single quotes, **no semicolons**, no unused imports/variables (these are lint errors, not warnings).
- Backend build command: `cd back && npm run build` (runs `prisma generate` → `tsc --noemit` → transpile). Lint: `cd back && npm run lint`.
- Frontend build command: `cd front && npm run build` (`tsc -b && vite build`). Lint: `cd front && npm run lint`.
- Appointments are never modified or deleted by this feature. Only empty slots (0 appointments) are deleted/regenerated.
- Commit after each task with the exact message given.

---

### Task 1: Extract forbidden-week schedule util + refactor instantiate route

**Files:**
- Create: `back/src/main/utils/pathway-schedule.ts`
- Modify: `back/src/main/interfaces/http/fastify/routes/pathway.ts` (imports + instantiate handler, lines ~1-262)

**Interfaces:**
- Produces:
  - `buildWeekMapping(startDate: Date | string, maxOffsetDays: number, forbiddenWeeks: { startOfWeek: Date }[]): Map<number, number>`
  - `computeEffectiveOffset(originalOffset: number, weekMapping: Map<number, number>): number`

- [ ] **Step 1: Create the util file**

Create `back/src/main/utils/pathway-schedule.ts` with exactly:

```ts
import Boom from '@hapi/boom'
import dayjs from 'dayjs'

import { toStartOfWeek } from './date'

export type ForbiddenWeekLike = { startOfWeek: Date }

/**
 * Maps each logical week index of a pathway to an actual week offset that
 * skips forbidden weeks, so the pathway spans over them instead of being
 * shifted entirely.
 */
export function buildWeekMapping(
  startDate: Date | string,
  maxOffsetDays: number,
  forbiddenWeeks: ForbiddenWeekLike[],
): Map<number, number> {
  const adjustedStart = dayjs(startDate)

  const isWeekForbidden = (date: Date): boolean => {
    const weekStart = dayjs(toStartOfWeek(date))
    return forbiddenWeeks.some((fw) => {
      return weekStart.isSame(dayjs(fw.startOfWeek), 'day')
    })
  }

  const maxLogicalWeek = Math.floor(maxOffsetDays / 7)

  const weekMapping = new Map<number, number>()
  let actualWeekOffset = 0
  for (let logicalWeek = 0; logicalWeek <= maxLogicalWeek; logicalWeek++) {
    while (
      isWeekForbidden(adjustedStart.add(actualWeekOffset * 7, 'day').toDate())
    ) {
      actualWeekOffset++
      if (actualWeekOffset > logicalWeek + 52) {
        throw Boom.conflict(
          'Aucune date de début disponible dans les 52 prochaines semaines en raison des semaines interdites',
        )
      }
    }
    weekMapping.set(logicalWeek, actualWeekOffset)
    actualWeekOffset++
  }
  return weekMapping
}

/** Applies the forbidden-week week mapping to a single slot template offset. */
export function computeEffectiveOffset(
  originalOffset: number,
  weekMapping: Map<number, number>,
): number {
  const logicalWeek = Math.floor(originalOffset / 7)
  const dayInWeek = originalOffset % 7
  const actualWeek = weekMapping.get(logicalWeek) ?? logicalWeek
  return actualWeek * 7 + dayInWeek
}
```

- [ ] **Step 2: Update imports in `pathway.ts`**

Replace the existing import on line 6:

```ts
import { combineDateAndTime, toStartOfWeek } from '../../../../utils/date'
```

with:

```ts
import { combineDateAndTime } from '../../../../utils/date'
import {
  buildWeekMapping,
  computeEffectiveOffset,
} from '../../../../utils/pathway-schedule'
```

- [ ] **Step 3: Replace the inline forbidden-week block in the instantiate handler**

In the `/instantiate` handler, replace this block (currently lines ~177-215):

```ts
      // Build a week mapping that skips forbidden weeks so the pathway
      // spans over them instead of being shifted entirely.
      const forbiddenWeeks = await forbiddenWeekDomain.findAll()
      const adjustedStart = dayjs(startDate)

      const isWeekForbidden = (date: Date): boolean => {
        const weekStart = dayjs(toStartOfWeek(date))
        return forbiddenWeeks.some((fw) => {
          return weekStart.isSame(dayjs(fw.startOfWeek), 'day')
        })
      }

      // Determine the number of logical weeks the pathway spans
      const maxOffsetDays = Math.max(
        ...pathwayTemplate.slotTemplates.map((st) => st.offsetDays ?? 0),
      )
      const maxLogicalWeek = Math.floor(maxOffsetDays / 7)

      // Map each logical week index to an actual week offset (skipping forbidden weeks)
      const weekMapping = new Map<number, number>()
      let actualWeekOffset = 0
      for (
        let logicalWeek = 0;
        logicalWeek <= maxLogicalWeek;
        logicalWeek++
      ) {
        while (
          isWeekForbidden(
            adjustedStart.add(actualWeekOffset * 7, 'day').toDate(),
          )
        ) {
          actualWeekOffset++
          if (actualWeekOffset > logicalWeek + 52) {
            throw Boom.conflict(
              'Aucune date de début disponible dans les 52 prochaines semaines en raison des semaines interdites',
            )
          }
        }
        weekMapping.set(logicalWeek, actualWeekOffset)
        actualWeekOffset++
      }

      const effectiveStartDate = adjustedStart.toISOString()
```

with:

```ts
      // Build a week mapping that skips forbidden weeks so the pathway
      // spans over them instead of being shifted entirely.
      const forbiddenWeeks = await forbiddenWeekDomain.findAll()

      const maxOffsetDays =
        pathwayTemplate.slotTemplates.length > 0
          ? Math.max(
              ...pathwayTemplate.slotTemplates.map((st) => st.offsetDays ?? 0),
            )
          : 0
      const weekMapping = buildWeekMapping(
        startDate,
        maxOffsetDays,
        forbiddenWeeks,
      )

      const effectiveStartDate = dayjs(startDate).toISOString()
```

- [ ] **Step 4: Replace the per-slot offset computation in the instantiate loop**

Inside the `for (const slotTemplate of pathwayTemplate.slotTemplates)` loop, replace (currently lines ~221-226):

```ts
        // Compute the effective offset by adding the extra weeks from forbidden week skipping
        const originalOffset = slotTemplate.offsetDays ?? 0
        const logicalWeek = Math.floor(originalOffset / 7)
        const dayInWeek = originalOffset % 7
        const actualWeek = weekMapping.get(logicalWeek) ?? logicalWeek
        const effectiveOffset = actualWeek * 7 + dayInWeek
```

with:

```ts
        const effectiveOffset = computeEffectiveOffset(
          slotTemplate.offsetDays ?? 0,
          weekMapping,
        )
```

- [ ] **Step 5: Typecheck + lint**

Run: `cd back && npm run build && npm run lint`
Expected: PASS, no errors. (`Boom` is still used by `Boom.notFound` in the handler, and `dayjs` is still used — no unused-import errors.)

- [ ] **Step 6: Manual smoke test (instantiation still works)**

Start the stack and drag a pathway template onto the timeline (or POST `/pathway/instantiate` via `back/bruno/`). Expected: a pathway is instantiated with the same slots as before this refactor (behavior unchanged).

- [ ] **Step 7: Commit**

```bash
git add back/src/main/utils/pathway-schedule.ts back/src/main/interfaces/http/fastify/routes/pathway.ts
git commit -m "refactor(pathway): extract forbidden-week schedule helper"
```

---

### Task 2: Backend regenerate — repository + domain

**Files:**
- Modify: `back/src/main/types/infra/orm/repositories/pathway.repository.interface.ts`
- Modify: `back/src/main/infra/orm/repositories/pathway.repository.ts`
- Modify: `back/src/main/types/domain/pathway.domain.interface.ts`
- Modify: `back/src/main/domain/pathway.domain.ts`

**Interfaces:**
- Consumes: `buildWeekMapping`, `computeEffectiveOffset` (Task 1); `combineDateAndTime` from `utils/date`.
- Produces:
  - Repo: `regenerate(pathwayTemplateID: string, fromDate: Date): Promise<RegeneratePathwaysResultRepo>`
  - Domain: `regenerate(pathwayTemplateID: string, fromDate: Date): Promise<RegeneratePathwaysResultDomain>`
  - `RegeneratePathwaysResultRepo = { pathwaysUpdated: number; slotsDeleted: number; slotsKept: number; slotsCreated: number }`

- [ ] **Step 1: Add result type + method to the repository interface**

In `back/src/main/types/infra/orm/repositories/pathway.repository.interface.ts`, add this type after `PathwayUpdateEntityRepo` (line ~21):

```ts
export type RegeneratePathwaysResultRepo = {
  pathwaysUpdated: number
  slotsDeleted: number
  slotsKept: number
  slotsCreated: number
}
```

Then add this line to the `PathwayRepositoryInterface` (e.g. right after the `findByTemplateIDAndDate` signature):

```ts
  regenerate: (
    pathwayTemplateID: string,
    fromDate: Date,
  ) => Promise<RegeneratePathwaysResultRepo>
```

- [ ] **Step 2: Implement `regenerate` in the repository**

In `back/src/main/infra/orm/repositories/pathway.repository.ts`:

Add these imports at the top of the file (after the existing imports, keeping Biome import grouping — `@hapi/boom` and `dayjs` are packages, the util imports are relative):

```ts
import Boom from '@hapi/boom'
import dayjs from 'dayjs'

import { combineDateAndTime } from '../../../utils/date'
import {
  buildWeekMapping,
  computeEffectiveOffset,
} from '../../../utils/pathway-schedule'
```

Add the result type to the type import from `pathway.repository.interface`:

```ts
  RegeneratePathwaysResultRepo,
```

Add this method to the `PathwayRepository` class (e.g. after `findByTemplateIDAndDate`):

```ts
  async regenerate(
    pathwayTemplateID: string,
    fromDate: Date,
  ): Promise<RegeneratePathwaysResultRepo> {
    const template = await this.prisma.pathwayTemplate.findUnique({
      where: { id: pathwayTemplateID },
      include: { slotTemplates: { include: { soignants: true } } },
    })
    if (!template) {
      throw Boom.notFound('PathwayTemplate not found')
    }

    const startOfDay = new Date(fromDate)
    startOfDay.setHours(0, 0, 0, 0)

    const maxOffsetDays =
      template.slotTemplates.length > 0
        ? Math.max(...template.slotTemplates.map((st) => st.offsetDays ?? 0))
        : 0

    try {
      return await this.prisma.$transaction(async (tx) => {
        const forbiddenWeeks = await tx.forbiddenWeek.findMany()

        const pathways = await tx.pathway.findMany({
          where: {
            templateID: pathwayTemplateID,
            startDate: { gte: startOfDay },
          },
          include: {
            slots: {
              include: { appointments: { select: { id: true } } },
            },
          },
        })

        let slotsDeleted = 0
        let slotsKept = 0
        let slotsCreated = 0

        for (const pathway of pathways) {
          const occupiedSlots = pathway.slots.filter(
            (slot) => slot.appointments.length > 0,
          )
          const emptySlots = pathway.slots.filter(
            (slot) => slot.appointments.length === 0,
          )

          // Remove empty slots and their cloned slot templates.
          if (emptySlots.length > 0) {
            const emptySlotIDs = emptySlots.map((slot) => slot.id)
            const emptyTemplateIDs = emptySlots.map(
              (slot) => slot.slotTemplateID,
            )
            await tx.slot.deleteMany({ where: { id: { in: emptySlotIDs } } })
            await tx.slotTemplate.deleteMany({
              where: { id: { in: emptyTemplateIDs } },
            })
            slotsDeleted += emptySlots.length
          }

          slotsKept += occupiedSlots.length

          const weekMapping = buildWeekMapping(
            pathway.startDate,
            maxOffsetDays,
            forbiddenWeeks,
          )

          for (const slotTemplate of template.slotTemplates) {
            const effectiveOffset = computeEffectiveOffset(
              slotTemplate.offsetDays ?? 0,
              weekMapping,
            )
            const base = dayjs(pathway.startDate)
              .add(effectiveOffset, 'day')
              .toISOString()
            const start = combineDateAndTime(base, slotTemplate.startTime)
            const end = combineDateAndTime(base, slotTemplate.endTime)

            // Skip regenerating a step already covered by a kept slot.
            const alreadyCovered = occupiedSlots.some(
              (slot) => slot.startDate.getTime() === start.getTime(),
            )
            if (alreadyCovered) {
              continue
            }

            const clonedSlotTemplate = await tx.slotTemplate.create({
              data: {
                startTime: slotTemplate.startTime,
                endTime: slotTemplate.endTime,
                offsetDays: effectiveOffset,
                isIndividual: slotTemplate.isIndividual,
                capacity: slotTemplate.capacity,
                thematicId: slotTemplate.thematicId,
                locationID: slotTemplate.locationID,
                description: slotTemplate.description,
                color: slotTemplate.color,
                soignants: {
                  connect: slotTemplate.soignants.map((s) => ({ id: s.id })),
                },
              },
            })

            await tx.slot.create({
              data: {
                startDate: start,
                endDate: end,
                slotTemplateID: clonedSlotTemplate.id,
                pathwayID: pathway.id,
              },
            })
            slotsCreated += 1
          }
        }

        return {
          pathwaysUpdated: pathways.length,
          slotsDeleted,
          slotsKept,
          slotsCreated,
        }
      })
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({
        entityName: 'Pathway',
        error: err,
      })
    }
  }
```

- [ ] **Step 3: Add result type + method to the domain interface**

In `back/src/main/types/domain/pathway.domain.interface.ts`:

Add the import of the repo result type to the existing import from `pathway.repository.interface`:

```ts
import type {
  RegeneratePathwaysResultRepo,
  TrackingPathwayRepo,
} from '../infra/orm/repositories/pathway.repository.interface'
```

Add this alias near `TrackingPathwayDomain` (line ~23):

```ts
export type RegeneratePathwaysResultDomain = RegeneratePathwaysResultRepo
```

Add this line to `PathwayDomainInterface`:

```ts
  regenerate: (
    pathwayTemplateID: string,
    fromDate: Date,
  ) => Promise<RegeneratePathwaysResultDomain>
```

- [ ] **Step 4: Implement `regenerate` in the domain**

In `back/src/main/domain/pathway.domain.ts`:

Add `RegeneratePathwaysResultDomain` to the type import from `pathway.domain.interface`.

Add this method to the `PathwayDomain` class (e.g. after `create`):

```ts
  regenerate(
    pathwayTemplateID: string,
    fromDate: Date,
  ): Promise<RegeneratePathwaysResultDomain> {
    return this.pathwayRepository.regenerate(pathwayTemplateID, fromDate)
  }
```

- [ ] **Step 5: Typecheck + lint**

Run: `cd back && npm run build && npm run lint`
Expected: PASS, no errors.

- [ ] **Step 6: Commit**

```bash
git add back/src/main/types/infra/orm/repositories/pathway.repository.interface.ts back/src/main/infra/orm/repositories/pathway.repository.ts back/src/main/types/domain/pathway.domain.interface.ts back/src/main/domain/pathway.domain.ts
git commit -m "feat(pathway): add regenerate domain+repository"
```

---

### Task 3: Backend regenerate — Zod schema + route

**Files:**
- Modify: `back/src/main/interfaces/http/fastify/schemas/pathway.schema.ts`
- Modify: `back/src/main/interfaces/http/fastify/routes/pathway.ts`

**Interfaces:**
- Consumes: `pathwayDomain.regenerate` (Task 2).
- Produces: `POST /pathway/regenerate` accepting `{ pathwayTemplateID: string(cuid), fromDate: date }`, returning `{ pathwaysUpdated, slotsDeleted, slotsKept, slotsCreated }` (all ints).

- [ ] **Step 1: Add request/response schemas**

In `back/src/main/interfaces/http/fastify/schemas/pathway.schema.ts`, add after `instantiatePathwayBody` (line ~40):

```ts
export const regeneratePathwaysBody = z.object({
  pathwayTemplateID: z.cuid(),
  fromDate: z.coerce.date(),
})

export const regeneratePathwaysResponseSchema = z.object({
  pathwaysUpdated: z.number().int(),
  slotsDeleted: z.number().int(),
  slotsKept: z.number().int(),
  slotsCreated: z.number().int(),
})
```

And add these type exports next to the other `export type` lines (after `InstantiatePathwayBody`, line ~50):

```ts
export type RegeneratePathwaysBody = z.infer<typeof regeneratePathwaysBody>
export type RegeneratePathwaysResponse = z.infer<
  typeof regeneratePathwaysResponseSchema
>
```

- [ ] **Step 2: Import the new schema/type in the route file**

In `back/src/main/interfaces/http/fastify/routes/pathway.ts`, add to the existing import block from `../schemas/pathway.schema` (alphabetical-ish, keep it tidy):

```ts
  type RegeneratePathwaysBody,
  regeneratePathwaysBody,
  regeneratePathwaysResponseSchema,
```

- [ ] **Step 3: Register the route**

Add this handler inside `pathwayRouter`, right after the `/instantiate` route (after line ~262, before `return Promise.resolve()`):

```ts
  // Regenerate instantiated pathways from the current template
  fastify.post<{ Body: RegeneratePathwaysBody }>(
    '/regenerate',
    {
      schema: {
        body: regeneratePathwaysBody,
        response: {
          200: regeneratePathwaysResponseSchema,
          404: z.object({ message: z.string() }),
        },
      },
    },
    (request) => {
      const { pathwayTemplateID, fromDate } = request.body
      return pathwayDomain.regenerate(pathwayTemplateID, fromDate)
    },
  )
```

- [ ] **Step 4: Typecheck + lint**

Run: `cd back && npm run build && npm run lint`
Expected: PASS, no errors.

- [ ] **Step 5: Manual smoke test (endpoint)**

With the stack running and a template that has ≥1 instantiated pathway starting on/after a date, POST to `/pathway/regenerate`:

```bash
curl -i -X POST "$API_URL/pathway/regenerate" \
  -H 'Content-Type: application/json' \
  --cookie "<session cookie>" \
  -d '{"pathwayTemplateID":"<cuid>","fromDate":"2026-07-01"}'
```

Expected: `200` with a JSON body like `{"pathwaysUpdated":N,"slotsDeleted":X,"slotsKept":Z,"slotsCreated":Y}`. An unknown `pathwayTemplateID` returns `404`. Confirm in the DB (or planning UI) that slots with appointments are untouched and empty slots were regenerated.

- [ ] **Step 6: Commit**

```bash
git add back/src/main/interfaces/http/fastify/schemas/pathway.schema.ts back/src/main/interfaces/http/fastify/routes/pathway.ts
git commit -m "feat(pathway): add POST /pathway/regenerate route"
```

---

### Task 4: Frontend — constant, types, API client

**Files:**
- Modify: `front/src/constants/process.constant.ts`
- Modify: `front/src/types/pathway.ts`
- Modify: `front/src/api/pathway.api.ts`

**Interfaces:**
- Produces:
  - `PATHWAY.REGENERATE` query/mutation key
  - `RegeneratePathwaysParams = { pathwayTemplateID: string; fromDate: string }`
  - `RegeneratePathwaysResult = { pathwaysUpdated: number; slotsDeleted: number; slotsKept: number; slotsCreated: number }`
  - `PathwayApi.regenerate(params: RegeneratePathwaysParams): Promise<RegeneratePathwaysResult>`

- [ ] **Step 1: Add the mutation key**

In `front/src/constants/process.constant.ts`, in the `PATHWAY` object, add after `INSTANTIATE`:

```ts
  REGENERATE: 'regenerate_pathways',
```

- [ ] **Step 2: Add the params/result types**

In `front/src/types/pathway.ts`, add after `UpdatePathwayParams` (line ~23):

```ts
export type RegeneratePathwaysParams = {
  pathwayTemplateID: string
  fromDate: string
}

export type RegeneratePathwaysResult = {
  pathwaysUpdated: number
  slotsDeleted: number
  slotsKept: number
  slotsCreated: number
}
```

- [ ] **Step 3: Add the API method**

In `front/src/api/pathway.api.ts`, add these two names to the `import type { ... } from '../types/pathway.ts'` block:

```ts
  RegeneratePathwaysParams,
  RegeneratePathwaysResult,
```

Then add this method to the `PathwayApi` object (e.g. after `instantiate`):

```ts
  regenerate: async (
    params: RegeneratePathwaysParams,
  ): Promise<RegeneratePathwaysResult> => {
    const response = await fetchWithAuth(`${apiUrl}/pathway/regenerate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    })
    if (!response.ok) {
      handleHttpError(
        response,
        {},
        'Impossible de mettre à jour les parcours',
      )
    }
    return response.json()
  },
```

- [ ] **Step 4: Typecheck + lint**

Run: `cd front && npx tsc -b && npm run lint`
Expected: PASS, no errors.

- [ ] **Step 5: Commit**

```bash
git add front/src/constants/process.constant.ts front/src/types/pathway.ts front/src/api/pathway.api.ts
git commit -m "feat(pathway): add regenerate API client"
```

---

### Task 5: Frontend — regenerate mutation hook

**Files:**
- Modify: `front/src/queries/usePathway.ts`

**Interfaces:**
- Consumes: `PathwayApi.regenerate` (Task 4); `PATHWAY.REGENERATE` (Task 4); `RegeneratePathwaysResult` (Task 4).
- Produces: `usePathwayMutations()` now returns `regeneratePathways` (a TanStack `useMutation` result). On success it invalidates `[SLOT.GET_ALL]` and `[PATHWAY.GET_ALL]` and shows a success toast with the counts.

- [ ] **Step 1: Add `regeneratePathways` to `usePathwayMutations`**

In `front/src/queries/usePathway.ts`, inside `usePathwayMutations`, add after the `updatePathway` mutation (before the `return`):

```ts
  const regeneratePathways = useMutation({
    mutationKey: [PATHWAY.REGENERATE],
    mutationFn: PathwayApi.regenerate,
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: [SLOT.GET_ALL] })
      await queryClient.invalidateQueries({ queryKey: [PATHWAY.GET_ALL] })

      toast({
        title: 'Parcours mis à jour',
        message: `${result.pathwaysUpdated} parcours traité(s) · ${result.slotsCreated} créneau(x) régénéré(s) · ${result.slotsKept} conservé(s)`,
        severity: TOAST_SEVERITY.SUCCESS,
      })
    },
    onError: (error) => {
      toast({
        title: 'Erreur lors de la mise à jour des parcours',
        message: error.message,
        severity: TOAST_SEVERITY.ERROR,
      })
    },
  })
```

- [ ] **Step 2: Export it from the hook**

Change the return of `usePathwayMutations` to include `regeneratePathways`:

```ts
  return {
    createPathway,
    deletePathway,
    updatePathway,
    instantiatePathway,
    regeneratePathways,
  }
```

(No new imports needed — `useMutation`, `PATHWAY`, `SLOT`, `TOAST_SEVERITY`, and `PathwayApi` are already imported in this file.)

- [ ] **Step 3: Typecheck + lint**

Run: `cd front && npx tsc -b && npm run lint`
Expected: PASS, no errors.

- [ ] **Step 4: Commit**

```bash
git add front/src/queries/usePathway.ts
git commit -m "feat(pathway): add regeneratePathways mutation hook"
```

---

### Task 6: Frontend — RegeneratePathwaysForm popup component

**Files:**
- Create: `front/src/components/custom/popup/regeneratePathwaysForm.tsx`

**Interfaces:**
- Consumes: `Popup*` from `ui/popup.tsx`, `Select` from `ui/select.tsx`, `DatePicker` from `ui/datePicker.tsx`, `Button` from `ui/button.tsx`, `Label` from `ui/label.tsx`, `PathwayTemplate` type.
- Produces: `RegeneratePathwaysForm` component with props:
  `{ open, setOpen, templates: PathwayTemplate[], templateID: string, onTemplateChange: (v: string) => void, fromDate: Dayjs | null, onFromDateChange: (v: Dayjs | null) => void, onConfirm: () => void, isPending: boolean }`.

- [ ] **Step 1: Create the component**

Create `front/src/components/custom/popup/regeneratePathwaysForm.tsx` with exactly:

```tsx
import type { Dayjs } from 'dayjs'
import { RefreshCw, X } from 'lucide-react'

import type { PathwayTemplate } from '../../../types/pathwayTemplate.ts'
import { Button } from '../../ui/button.tsx'
import { DatePicker } from '../../ui/datePicker.tsx'
import { Label } from '../../ui/label.tsx'
import {
  Popup,
  PopupBody,
  PopupContent,
  PopupFooter,
  PopupHeader,
  PopupTitle,
} from '../../ui/popup.tsx'
import { Select } from '../../ui/select.tsx'

interface RegeneratePathwaysFormProps {
  open: boolean
  setOpen: (open: boolean) => void
  templates: PathwayTemplate[]
  templateID: string
  onTemplateChange: (value: string) => void
  fromDate: Dayjs | null
  onFromDateChange: (value: Dayjs | null) => void
  onConfirm: () => void
  isPending: boolean
}

export function RegeneratePathwaysForm({
  open,
  setOpen,
  templates,
  templateID,
  onTemplateChange,
  fromDate,
  onFromDateChange,
  onConfirm,
  isPending,
}: RegeneratePathwaysFormProps) {
  const options = templates.map((template) => ({
    value: template.id,
    label: template.name,
  }))

  return (
    <Popup modal open={open} onOpenChange={setOpen}>
      <PopupContent>
        <PopupHeader>
          <PopupTitle className="font-bold text-xl">
            Mettre à jour les parcours instanciés
          </PopupTitle>
        </PopupHeader>

        <PopupBody>
          <p className="text-sm text-text-light mb-4">
            Les créneaux vides des parcours de ce modèle démarrant à partir de
            la date choisie seront régénérés selon le modèle théorique actuel.
            Les créneaux ayant déjà des rendez-vous sont conservés.
          </p>

          <div className="flex flex-col gap-4 max-w-md">
            <div>
              <Label className="block text-sm font-medium text-text-dark mb-1">
                Modèle de parcours
              </Label>
              <Select
                options={options}
                placeholder="Choisir un modèle..."
                value={templateID}
                onValueChange={onTemplateChange}
                searchable
                clearable={false}
              />
            </div>

            <div>
              <Label className="block text-sm font-medium text-text-dark mb-1">
                À partir du
              </Label>
              <DatePicker
                value={fromDate}
                onChange={(value) => onFromDateChange(value)}
              />
            </div>
          </div>
        </PopupBody>

        <PopupFooter>
          <Button
            variant="default"
            onClick={onConfirm}
            disabled={!templateID || !fromDate || isPending}
          >
            <RefreshCw className="w-4 h-4" />
            Appliquer
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

- [ ] **Step 2: Typecheck + lint**

Run: `cd front && npx tsc -b && npm run lint`
Expected: PASS, no errors. (If `tsc` complains about the `DatePicker` `onChange` value type, change the callback to `onChange={(value) => onFromDateChange(value as Dayjs | null)}`.)

- [ ] **Step 3: Commit**

```bash
git add front/src/components/custom/popup/regeneratePathwaysForm.tsx
git commit -m "feat(planning): add RegeneratePathwaysForm popup"
```

---

### Task 7: Frontend — wire the "Actions" dropdown into the planning toolbar

**Files:**
- Modify: `front/src/routes/_authenticated/_admin/settings/planning.tsx`

**Interfaces:**
- Consumes: `regeneratePathways` from `usePathwayMutations` (Task 5); `RegeneratePathwaysForm` (Task 6); `pathwayTemplates` (already fetched at line 73).

- [ ] **Step 1: Add imports**

In `front/src/routes/_authenticated/_admin/settings/planning.tsx`:

Change the dayjs import (line 10) from:

```ts
import dayjs from 'dayjs'
```

to:

```ts
import dayjs, { type Dayjs } from 'dayjs'
```

Change the lucide-react import (line 11) from:

```ts
import { CalendarDays, CheckSquare, GanttChart, Trash2, X } from 'lucide-react'
```

to:

```ts
import {
  CalendarDays,
  CheckSquare,
  GanttChart,
  RefreshCw,
  Settings2,
  Trash2,
  X,
} from 'lucide-react'
```

Add these two imports alongside the other imports at the top (the radix import near the other package imports; the form import near the other `popup/` imports):

```ts
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
```

```ts
import { RegeneratePathwaysForm } from '../../../../components/custom/popup/regeneratePathwaysForm.tsx'
```

- [ ] **Step 2: Pull the mutation from the hook**

Change (line 75):

```ts
  const { instantiatePathway, deletePathway } = usePathwayMutations()
```

to:

```ts
  const { instantiatePathway, deletePathway, regeneratePathways } =
    usePathwayMutations()
```

- [ ] **Step 3: Add local state + confirm handler**

Add near the other `useState` hooks inside `Planning` (after the mutation destructures, e.g. right after line 82):

```ts
  const [regenerateOpen, setRegenerateOpen] = useState(false)
  const [regenerateTemplateID, setRegenerateTemplateID] = useState('')
  const [regenerateFromDate, setRegenerateFromDate] = useState<Dayjs | null>(
    null,
  )

  const handleRegenerate = () => {
    if (!regenerateTemplateID || !regenerateFromDate) {
      return
    }
    regeneratePathways.mutate(
      {
        pathwayTemplateID: regenerateTemplateID,
        fromDate: regenerateFromDate.toISOString(),
      },
      {
        onSuccess: () => {
          setRegenerateOpen(false)
          setRegenerateTemplateID('')
          setRegenerateFromDate(null)
        },
      },
    )
  }
```

- [ ] **Step 4: Add the "Actions" dropdown to the toolbar**

Replace the toolbar's right-hand block (currently lines ~604-626):

```tsx
  <div className="flex justify-end">
    {!editMode && (
      <ToggleGroup
        value={view}
        onValueChange={(v: string) => {
          if (v) {
            setView(v as 'calendar' | 'timeline')
            if (v !== 'timeline') {
              setIsForbiddenWeekMode(false)
            }
          }
        }}
      >
        <ToggleGroupItem value="calendar">
          <CalendarDays className="h-4 w-4" />
          Calendrier
        </ToggleGroupItem>
        <ToggleGroupItem value="timeline">
          <GanttChart className="h-4 w-4" />
          Timeline
        </ToggleGroupItem>
      </ToggleGroup>
    )}
  </div>
```

with:

```tsx
  <div className="flex justify-end items-center gap-2">
    {!editMode && (
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <Button variant="outline" className="font-normal rounded-lg">
            <Settings2 size={16} />
            Actions
          </Button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            className="min-w-[280px] bg-primary-foreground rounded shadow-md border border-border p-2 z-50"
            align="end"
            sideOffset={5}
            collisionPadding={8}
          >
            <DropdownMenu.Item
              onSelect={() => setRegenerateOpen(true)}
              className="flex items-center gap-2 px-3 py-2 rounded cursor-pointer outline-none hover:bg-primary/20 text-sm select-none"
            >
              <RefreshCw size={16} />
              Mettre à jour les parcours instanciés
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    )}

    {!editMode && (
      <ToggleGroup
        value={view}
        onValueChange={(v: string) => {
          if (v) {
            setView(v as 'calendar' | 'timeline')
            if (v !== 'timeline') {
              setIsForbiddenWeekMode(false)
            }
          }
        }}
      >
        <ToggleGroupItem value="calendar">
          <CalendarDays className="h-4 w-4" />
          Calendrier
        </ToggleGroupItem>
        <ToggleGroupItem value="timeline">
          <GanttChart className="h-4 w-4" />
          Timeline
        </ToggleGroupItem>
      </ToggleGroup>
    )}
  </div>
```

- [ ] **Step 5: Render the popup**

Add the form near the other rendered popups (e.g. just before the closing of the component's returned JSX, alongside `<AddSlotForm .../>` / `<BulkMoveForm .../>`):

```tsx
      <RegeneratePathwaysForm
        open={regenerateOpen}
        setOpen={setRegenerateOpen}
        templates={pathwayTemplates ?? []}
        templateID={regenerateTemplateID}
        onTemplateChange={setRegenerateTemplateID}
        fromDate={regenerateFromDate}
        onFromDateChange={setRegenerateFromDate}
        onConfirm={handleRegenerate}
        isPending={regeneratePathways.isPending}
      />
```

- [ ] **Step 6: Typecheck + lint**

Run: `cd front && npx tsc -b && npm run lint`
Expected: PASS, no errors.

- [ ] **Step 7: Manual smoke test (end to end)**

Start front + back. On the planning page (not in edit mode): click **Actions** → **Mettre à jour les parcours instanciés**. In the popup, choose a template that has instantiated pathways, pick a "from date", click **Appliquer**. Expected: success toast with counts; the calendar/timeline refreshes; empty slots of matching pathways are regenerated from the current template; slots with existing appointments are untouched; no duplicate slot is created for a kept step.

- [ ] **Step 8: Commit**

```bash
git add front/src/routes/_authenticated/_admin/settings/planning.tsx
git commit -m "feat(planning): add Actions button to regenerate instantiated pathways"
```

---

## Notes for the implementer

- **Duplicate avoidance** matches a kept (occupied) slot to a theoretical step by exact slot start instant (`startDate.getTime()`). If the theoretical step's time/offset changed, the kept slot keeps its old time and a new slot is also created — this is intended (we never modify existing appointments).
- **404 vs Prisma errors:** the repo throws `Boom.notFound` for a missing template *before* the transaction, so it is not swallowed by `boomErrorFromPrismaError`.
- **Line numbers** in this plan are approximate anchors; match on the quoted code, not the numbers.
- No IoC changes are needed — `pathwayDomain`/`pathwayRepository` are already registered; we only add methods.
