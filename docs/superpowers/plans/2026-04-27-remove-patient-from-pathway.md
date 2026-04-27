# Remove Patient from Pathway — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow users to remove a patient from a pathway (and all associated appointments) from the patient overview page.

**Architecture:** New backend domain method + two routes (preview count + delete), new frontend section in overview tab showing enrolled pathways with remove button and confirmation modal. Follows existing patterns: domain orchestrates, repo executes, Prisma transactions for atomicity.

**Tech Stack:** Fastify, Prisma, Zod, React, TanStack Query, Radix UI Dialog

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `back/src/main/types/domain/patient.domain.interface.ts` | Add new method signatures |
| Modify | `back/src/main/domain/patient.domain.ts` | Add `removeFromPathway` + `countAppointmentsInPathway` methods |
| Modify | `back/src/main/interfaces/http/fastify/schemas/patient.schema.ts` | Add param/response schemas |
| Modify | `back/src/main/interfaces/http/fastify/routes/patient.ts` | Add 2 new routes |
| Modify | `front/src/api/patient.api.ts` | Add 2 API methods |
| Modify | `front/src/constants/process.constant.ts` | Add query key constant |
| Modify | `front/src/queries/usePatient.tsx` | Add mutation hook |
| Modify | `front/src/components/custom/Patient/view/overview.patient.tsx` | Add pathways section with remove button + modal |

---

### Task 1: Backend — Domain interface & types

**Files:**
- Modify: `back/src/main/types/domain/patient.domain.interface.ts`

- [ ] **Step 1: Add types and method signatures to the domain interface**

At the end of the file, before the closing `}` of `PatientDomainInterface`, add:

```typescript
// After the existing types (before PatientDomainInterface)
export type RemoveFromPathwayResult = {
  deletedAppointments: number
  removedFromGroup: number
}

// Inside PatientDomainInterface, add:
  countAppointmentsInPathway: (
    patientID: string,
    pathwayID: string,
  ) => Promise<{ count: number }>
  removeFromPathway: (
    patientID: string,
    pathwayID: string,
    userID: string,
  ) => Promise<RemoveFromPathwayResult>
```

- [ ] **Step 2: Commit**

```bash
git add back/src/main/types/domain/patient.domain.interface.ts
git commit -m "feat: add removeFromPathway types to patient domain interface"
```

---

### Task 2: Backend — Repository & Domain logic

**Files:**
- Modify: `back/src/main/types/infra/orm/repositories/patient.repository.interface.ts`
- Modify: `back/src/main/infra/orm/repositories/patient.repository.ts`
- Modify: `back/src/main/domain/patient.domain.ts`

- [ ] **Step 1: Add repository method signatures**

In `back/src/main/types/infra/orm/repositories/patient.repository.interface.ts`, add to `PatientRepositoryInterface`:

```typescript
  removeFromPathway: (
    patientID: string,
    pathwayID: string,
  ) => Promise<{ deletedAppointments: number; removedFromGroup: number }>
  countAppointmentsInPathway: (
    patientID: string,
    pathwayID: string,
  ) => Promise<number>
```

- [ ] **Step 2: Implement repository methods**

In `back/src/main/infra/orm/repositories/patient.repository.ts`, add:

```typescript
async countAppointmentsInPathway(
  patientID: string,
  pathwayID: string,
): Promise<number> {
  const count = await this.prisma.appointmentPatient.count({
    where: {
      patientId: patientID,
      appointment: {
        slot: {
          pathwayID: pathwayID,
        },
      },
    },
  })
  return count
}

async removeFromPathway(
  patientID: string,
  pathwayID: string,
): Promise<{ deletedAppointments: number; removedFromGroup: number }> {
  return await this.prisma.$transaction(async (tx) => {
    // Find all AppointmentPatient records for this patient in this pathway
    const appointmentPatients = await tx.appointmentPatient.findMany({
      where: {
        patientId: patientID,
        appointment: {
          slot: {
            pathwayID: pathwayID,
          },
        },
      },
      include: {
        appointment: {
          include: {
            appointmentPatients: true,
          },
        },
      },
    })

    if (appointmentPatients.length === 0) {
      return { deletedAppointments: 0, removedFromGroup: 0 }
    }

    let deletedAppointments = 0
    let removedFromGroup = 0

    for (const ap of appointmentPatients) {
      const isOnlyPatient = ap.appointment.appointmentPatients.length <= 1

      // Delete the AppointmentPatient record
      await tx.appointmentPatient.delete({
        where: { id: ap.id },
      })

      if (isOnlyPatient) {
        // Delete the orphaned appointment
        await tx.appointment.delete({
          where: { id: ap.appointment.id },
        })
        deletedAppointments++
      } else {
        removedFromGroup++
      }
    }

    return { deletedAppointments, removedFromGroup }
  })
}
```

- [ ] **Step 3: Add domain methods**

In `back/src/main/domain/patient.domain.ts`, add the import for `RemoveFromPathwayResult` at the top:

```typescript
import type {
  // ... existing imports ...
  RemoveFromPathwayResult,
} from '../types/domain/patient.domain.interface'
```

Then add after the `delete` method:

```typescript
async countAppointmentsInPathway(
  patientID: string,
  pathwayID: string,
): Promise<{ count: number }> {
  const count = await this.patientRepository.countAppointmentsInPathway(
    patientID,
    pathwayID,
  )
  return { count }
}

async removeFromPathway(
  patientID: string,
  pathwayID: string,
  userID: string,
): Promise<RemoveFromPathwayResult> {
  const result = await this.patientRepository.removeFromPathway(
    patientID,
    pathwayID,
  )

  this.appEventBus.emit('patient.removedFromPathway', {
    userID,
    patientId: patientID,
    pathwayId: pathwayID,
  })

  return result
}
```

- [ ] **Step 4: Commit**

```bash
git add back/src/main/types/domain/patient.domain.interface.ts \
  back/src/main/types/infra/orm/repositories/patient.repository.interface.ts \
  back/src/main/infra/orm/repositories/patient.repository.ts \
  back/src/main/domain/patient.domain.ts
git commit -m "feat: add removeFromPathway and countAppointmentsInPathway to patient domain"
```

---

### Task 3: Backend — Schemas & Routes

**Files:**
- Modify: `back/src/main/interfaces/http/fastify/schemas/patient.schema.ts`
- Modify: `back/src/main/interfaces/http/fastify/routes/patient.ts`

- [ ] **Step 1: Add schemas**

In `back/src/main/interfaces/http/fastify/schemas/patient.schema.ts`, add:

```typescript
// Param schema for patient + pathway
const patientPathwayParamsSchema = z.object({
  patientID: z.cuid(),
  pathwayID: z.cuid(),
})
export type PatientPathwayParams = z.infer<typeof patientPathwayParamsSchema>

// Response schema for appointments count
const appointmentsCountResponseSchema = z.object({
  count: z.number(),
})

// Response schema for remove result
const removeFromPathwayResponseSchema = z.object({
  deletedAppointments: z.number(),
  removedFromGroup: z.number(),
})
```

Export the schemas and types that the routes file will import. Add the new names to the existing exports.

- [ ] **Step 2: Add routes**

In `back/src/main/interfaces/http/fastify/routes/patient.ts`, add the two new routes before `return Promise.resolve()` (before line 226).

First, add the new imports at the top:

```typescript
import {
  // ... existing imports ...
  type PatientPathwayParams,
  patientPathwayParamsSchema,
  appointmentsCountResponseSchema,
  removeFromPathwayResponseSchema,
} from '../schemas/patient.schema'
```

Then add the routes:

```typescript
// Count appointments for patient in pathway (for confirmation modal)
fastify.get<{ Params: PatientPathwayParams }>(
  '/:patientID/pathway/:pathwayID/appointments-count',
  {
    schema: {
      params: patientPathwayParamsSchema,
      response: {
        200: appointmentsCountResponseSchema,
      },
    },
    onRequest: [fastify.verifySessionCookie],
  },
  async (request) => {
    const { patientID, pathwayID } = request.params
    return patientDomain.countAppointmentsInPathway(patientID, pathwayID)
  },
)

// Remove patient from pathway
fastify.delete<{ Params: PatientPathwayParams }>(
  '/:patientID/pathway/:pathwayID',
  {
    schema: {
      params: patientPathwayParamsSchema,
      response: {
        200: removeFromPathwayResponseSchema,
      },
    },
    onRequest: [fastify.verifySessionCookie],
  },
  async (request) => {
    const { patientID, pathwayID } = request.params
    return patientDomain.removeFromPathway(
      patientID,
      pathwayID,
      request.user.userID,
    )
  },
)
```

- [ ] **Step 3: Commit**

```bash
git add back/src/main/interfaces/http/fastify/schemas/patient.schema.ts \
  back/src/main/interfaces/http/fastify/routes/patient.ts
git commit -m "feat: add routes for removing patient from pathway"
```

---

### Task 4: Frontend — API layer

**Files:**
- Modify: `front/src/api/patient.api.ts`
- Modify: `front/src/constants/process.constant.ts`

- [ ] **Step 1: Add API methods**

In `front/src/api/patient.api.ts`, add two new methods to the `PatientApi` object:

```typescript
getAppointmentsCountInPathway: async (
  patientID: string,
  pathwayID: string,
): Promise<{ count: number }> => {
  const response = await fetchWithAuth(
    `${apiUrl}/patient/${patientID}/pathway/${pathwayID}/appointments-count`,
    { method: 'GET' },
  )
  if (!response.ok) {
    handleHttpError(
      response,
      {},
      'Impossible de récupérer le nombre de rendez-vous',
    )
  }
  return response.json()
},

removeFromPathway: async (
  patientID: string,
  pathwayID: string,
): Promise<{ deletedAppointments: number; removedFromGroup: number }> => {
  const response = await fetchWithAuth(
    `${apiUrl}/patient/${patientID}/pathway/${pathwayID}`,
    { method: 'DELETE' },
  )
  if (!response.ok) {
    handleHttpError(
      response,
      {},
      'Impossible de retirer le patient du parcours',
    )
  }
  return response.json()
},
```

- [ ] **Step 2: Add query key constant**

In `front/src/constants/process.constant.ts`, add to the `PATIENT` object:

```typescript
REMOVE_FROM_PATHWAY: 'remove_patient_from_pathway',
```

- [ ] **Step 3: Commit**

```bash
git add front/src/api/patient.api.ts front/src/constants/process.constant.ts
git commit -m "feat: add patient API methods for pathway removal"
```

---

### Task 5: Frontend — Query hook

**Files:**
- Modify: `front/src/queries/usePatient.tsx`

- [ ] **Step 1: Add the removeFromPathway mutation**

In `usePatientMutations()`, add a new mutation. Add it after the `dismissEnrollmentIssue` mutation:

```typescript
const removeFromPathway = useMutation({
  mutationKey: [PATIENT.REMOVE_FROM_PATHWAY],
  mutationFn: ({
    patientID,
    pathwayID,
  }: {
    patientID: string
    pathwayID: string
  }) => PatientApi.removeFromPathway(patientID, pathwayID),
  onSuccess: () => {
    showToast({
      severity: TOAST_SEVERITY.SUCCESS,
      summary: 'Patient retiré du parcours',
    })
    queryClient.invalidateQueries({ queryKey: [PATIENT.GET_BY_ID] })
    queryClient.invalidateQueries({ queryKey: [PATIENT.GET_ALL] })
    queryClient.invalidateQueries({ queryKey: [PATIENT.GET_ALL_WITH_TAGS] })
    queryClient.invalidateQueries({ queryKey: [SLOT.GET_ALL] })
    queryClient.invalidateQueries({ queryKey: [APPOINTMENT.GET_ALL] })
    queryClient.invalidateQueries({ queryKey: [PATHWAY.GET_TRACKING] })
  },
  onError: () => {
    showToast({
      severity: TOAST_SEVERITY.ERROR,
      summary: 'Impossible de retirer le patient du parcours',
    })
  },
})
```

Add `removeFromPathway` to the returned object of `usePatientMutations()`.

Also add `PATHWAY` to the imports from `process.constant.ts` if not already imported.

- [ ] **Step 2: Commit**

```bash
git add front/src/queries/usePatient.tsx
git commit -m "feat: add removeFromPathway mutation hook"
```

---

### Task 6: Frontend — Pathways section in Overview tab

**Files:**
- Modify: `front/src/components/custom/Patient/view/overview.patient.tsx`

- [ ] **Step 1: Add imports**

Add to the existing imports:

```typescript
import { useState } from 'react'
import { Route } from 'lucide-react' // icon for pathways section
import { hexToRGBA, getContrastTextColor } from '../../../../libs/color.ts'
import { PatientApi } from '../../../../api/patient.api.ts'
import { ConfirmDeleteForm } from '../../popup/confirmDeleteForm.tsx'
```

Update the `useMemo` import to also import `useState` and `useCallback`:

```typescript
import { useCallback, useMemo, useState } from 'react'
```

- [ ] **Step 2: Add the PathwayCard component**

Add before the `OverviewPatient` component:

```typescript
function PathwayCard({
  pathwayID,
  templateName,
  templateColor,
  startDate,
  onRemove,
}: {
  pathwayID: string
  templateName: string
  templateColor: string | null
  startDate: string
  onRemove: (pathwayID: string) => void
}) {
  const color = templateColor ?? '#6b7280'
  const formattedDate = dayjs(startDate)
    .format('D MMMM YYYY')
    .replace(/^./, (c) => c.toUpperCase())

  return (
    <div className="flex items-center gap-3 rounded-lg px-3 py-2 border border-border">
      <span
        className="inline-block px-2 py-1 rounded text-xs font-medium border"
        style={{
          backgroundColor: hexToRGBA(color, 0.15),
          color: getContrastTextColor(color),
          borderColor: hexToRGBA(color, 0.6),
        }}
      >
        {templateName}
      </span>
      <span className="text-xs text-text-sidebar flex-1">
        Début : {formattedDate}
      </span>
      <button
        type="button"
        onClick={() => onRemove(pathwayID)}
        className="cursor-pointer flex-shrink-0 rounded p-1 text-text-light hover:bg-destructive/10 hover:text-destructive transition-colors"
        aria-label={`Retirer du parcours ${templateName}`}
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
```

- [ ] **Step 3: Add pathway logic to OverviewPatient**

Inside `OverviewPatient`, after the existing `useMemo` for `patientSlots`, add:

```typescript
const { removeFromPathway } = usePatientMutations()

const patientPathways = useMemo(() => {
  if (!slots || !patient) return []

  const pathwayMap = new Map<
    string,
    { id: string; templateName: string; templateColor: string | null; startDate: string }
  >()

  for (const slot of slots) {
    if (!slot.pathway) continue
    const hasPatient = slot.appointments?.some((appointment) =>
      appointment.appointmentPatients?.some(
        (ap) => ap.patient.id === patient.id,
      ),
    )
    if (!hasPatient) continue

    const pathwayID = slot.pathway.id
    if (!pathwayMap.has(pathwayID)) {
      pathwayMap.set(pathwayID, {
        id: pathwayID,
        templateName: slot.pathway.template?.name ?? 'Parcours sans template',
        templateColor: slot.pathway.template?.color ?? null,
        startDate: slot.pathway.startDate,
      })
    }
  }

  return Array.from(pathwayMap.values())
}, [slots, patient])

const [removeTarget, setRemoveTarget] = useState<{
  pathwayID: string
  name: string
  count: number
} | null>(null)

const handleRemoveClick = useCallback(
  async (pathwayID: string) => {
    if (!patient) return
    const { count } = await PatientApi.getAppointmentsCountInPathway(
      patient.id,
      pathwayID,
    )
    const pathway = patientPathways.find((p) => p.id === pathwayID)
    setRemoveTarget({
      pathwayID,
      name: pathway?.templateName ?? 'Parcours',
      count,
    })
  },
  [patient, patientPathways],
)

const handleConfirmRemove = useCallback(() => {
  if (!patient || !removeTarget) return
  removeFromPathway.mutate(
    { patientID: patient.id, pathwayID: removeTarget.pathwayID },
    { onSettled: () => setRemoveTarget(null) },
  )
}, [patient, removeTarget, removeFromPathway])
```

- [ ] **Step 4: Add the pathways section to the JSX**

In the returned JSX, add the pathways section between the enrollment issues section and the appointments section (before the `<div className="flex flex-col gap-3">` that contains "Rendez-vous"):

```tsx
{patientPathways.length > 0 && (
  <>
    <div className="flex items-center gap-2">
      <Route className="h-4 w-4 flex-shrink-0" />
      <h4 className="text-sm font-semibold text-text-dark">
        Parcours ({patientPathways.length})
      </h4>
      <div className="flex-1 border-t border-border" />
    </div>

    <div className="flex flex-col gap-1.5">
      {patientPathways.map((pathway) => (
        <PathwayCard
          key={pathway.id}
          pathwayID={pathway.id}
          templateName={pathway.templateName}
          templateColor={pathway.templateColor}
          startDate={pathway.startDate}
          onRemove={handleRemoveClick}
        />
      ))}
    </div>
  </>
)}

<ConfirmDeleteForm
  open={removeTarget !== null}
  setOpen={(open) => {
    if (!open) setRemoveTarget(null)
  }}
  onConfirm={handleConfirmRemove}
  loading={removeFromPathway.isPending}
  title="Retirer du parcours"
  description={
    removeTarget
      ? `Voulez-vous vraiment retirer ce patient du parcours ${removeTarget.name} ? ${removeTarget.count} rendez-vous seront supprimés. Cette action est irréversible.`
      : ''
  }
/>
```

- [ ] **Step 5: Commit**

```bash
git add front/src/components/custom/Patient/view/overview.patient.tsx
git commit -m "feat: add pathways section with remove button in patient overview"
```

---

### Task 7: Verify the Slot query includes pathway data

**Files:**
- Check: `front/src/api/slot.api.ts` and `back/src/main/interfaces/http/fastify/routes/slot.ts`

The `PathwayCard` component relies on `slot.pathway` being available (with `template` included). We need to verify that the slot API returns this data.

- [ ] **Step 1: Check that the slot GET ALL endpoint includes pathway with template**

Read `back/src/main/infra/orm/repositories/slot.repository.ts` to verify the `findAll` method includes `pathway: { include: { template: true } }`.

If it does NOT include `pathway.template`, modify the slot repository's `findAll` to include it:

```typescript
// In slot.repository.ts findAll(), ensure the include has:
pathway: {
  include: {
    template: true,
  },
},
```

- [ ] **Step 2: If slot types need updating, add pathway template to slot types**

Check `front/src/types/slot.ts` — the `Slot` type has `pathway?: Pathway` and `Pathway` already has `template?: { id, name, color } | null`. So the frontend types should already support this.

- [ ] **Step 3: Commit if changes were needed**

```bash
git add back/src/main/infra/orm/repositories/slot.repository.ts
git commit -m "fix: include pathway template in slot findAll query"
```

---

### Task 8: End-to-end verification

- [ ] **Step 1: Start the backend**

```bash
cd back && npm run dev
```

- [ ] **Step 2: Start the frontend**

```bash
cd front && npm run dev
```

- [ ] **Step 3: Manual test**

1. Navigate to a patient who is enrolled in a pathway
2. Go to the "Aperçu général" tab
3. Verify the "Parcours" section appears with the correct pathway(s)
4. Click the X button on a pathway
5. Verify the confirmation modal shows with the correct appointment count
6. Confirm the removal
7. Verify the pathway disappears from the list
8. Verify the appointments are removed from the "Rendez-vous" section
9. Check the patient list — pathway tag should be removed if no more appointments in that pathway

- [ ] **Step 4: Final commit if any fixes were needed**
