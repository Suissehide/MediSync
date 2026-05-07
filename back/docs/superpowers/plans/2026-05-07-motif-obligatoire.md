# Motif Obligatoire Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Motif obligatoire" checkbox to PathwayTemplate and a mandatory "Motif" input when enrolling patients, stored as transmissionNotes on created appointments.

**Architecture:** Add `motifRequired` boolean to PathwayTemplate model. Thread `motif` string through enrollment flow (frontend → API → domain → repository). Modify appointment creation to pass transmissionNotes.

**Tech Stack:** Prisma, Fastify/Zod, React (TanStack Form), TypeScript

---

### Task 1: Add `motifRequired` to Prisma schema and migrate

**Files:**
- Modify: `back/prisma/schema.prisma:26-35`

- [ ] **Step 1: Add field to schema**

In `prisma/schema.prisma`, add `motifRequired` to the `PathwayTemplate` model:

```prisma
model PathwayTemplate {
  id            String   @id @default(cuid())
  name          String
  color         String
  tags          String[]
  displayOrder  Int      @default(0)
  motifRequired Boolean  @default(false)

  pathways      Pathway[]
  slotTemplates SlotTemplate[]
}
```

- [ ] **Step 2: Generate migration**

Run: `cd /Users/couffinhal/Documents/MediSync/back && npx prisma migrate dev --name add-motif-required-to-pathway-template`

Expected: Migration created successfully, new migration file in `prisma/migrations/`.

- [ ] **Step 3: Verify generated client**

Run: `npx prisma generate`

Expected: Prisma Client generated successfully.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat: add motifRequired field to PathwayTemplate model"
```

---

### Task 2: Update backend schemas and types for PathwayTemplate

**Files:**
- Modify: `back/src/main/interfaces/http/fastify/schemas/index.ts:73-84`
- Modify: `back/src/main/interfaces/http/fastify/schemas/pathwayTemplate.schema.ts:25-33`

- [ ] **Step 1: Add `motifRequired` to base pathwayTemplateSchema**

In `back/src/main/interfaces/http/fastify/schemas/index.ts`, add `motifRequired` to the `pathwayTemplateSchema`:

```typescript
export const pathwayTemplateSchema = z.object({
  name: z.string().min(1),
  color: z.string(),
  tags: z.array(z.string()).default([]),
  motifRequired: z.boolean().default(false),

  get slotTemplates() {
    return z.array(slotTemplateSchema).optional().nullable()
  },
})
```

- [ ] **Step 2: Add `motifRequired` to create schema**

In `back/src/main/interfaces/http/fastify/schemas/pathwayTemplate.schema.ts`, update `createPathwayTemplateSchema` to pick `motifRequired`:

```typescript
export const createPathwayTemplateSchema = pathwayTemplateSchema
  .pick({
    name: true,
    color: true,
    motifRequired: true,
  })
  .extend({
    slotTemplateIDs: z.array(z.cuid()),
    tags: z.array(z.string()).default([]),
  })
```

- [ ] **Step 3: Commit**

```bash
git add src/main/interfaces/http/fastify/schemas/index.ts src/main/interfaces/http/fastify/schemas/pathwayTemplate.schema.ts
git commit -m "feat: add motifRequired to pathway template schemas"
```

---

### Task 3: Add `motif` to enrollment schemas and types

**Files:**
- Modify: `back/src/main/interfaces/http/fastify/schemas/patient.schema.ts:98-103`
- Modify: `back/src/main/types/domain/patient.domain.interface.ts:26-31`

- [ ] **Step 1: Add `motif` to `pathwayEnrollmentSchema`**

In `back/src/main/interfaces/http/fastify/schemas/patient.schema.ts`:

```typescript
export const pathwayEnrollmentSchema = z.object({
  tag: z.string().min(1),
  timeOfDay: timeOfDaySchema,
  thematicID: z.cuid().optional(),
  type: z.string().optional(),
  motif: z.string().optional(),
})
```

- [ ] **Step 2: Add `motif` to `PathwayEnrollmentInput` domain type**

In `back/src/main/types/domain/patient.domain.interface.ts`:

```typescript
export type PathwayEnrollmentInput = {
  tag: string
  timeOfDay: TimeOfDay
  thematicID?: string
  type?: string
  motif?: string
}
```

- [ ] **Step 3: Commit**

```bash
git add src/main/interfaces/http/fastify/schemas/patient.schema.ts src/main/types/domain/patient.domain.interface.ts
git commit -m "feat: add motif field to enrollment schemas and types"
```

---

### Task 4: Update appointment creation to support `transmissionNotes`

**Files:**
- Modify: `back/src/main/types/infra/orm/repositories/appointment.repository.interface.ts:14-18`
- Modify: `back/src/main/infra/orm/repositories/appointment.repository.ts:61-91`

- [ ] **Step 1: Add `transmissionNotes` to `AppointmentCreateEntityRepo`**

In `back/src/main/types/infra/orm/repositories/appointment.repository.interface.ts`:

```typescript
export type AppointmentCreateEntityRepo =
  Prisma.AppointmentUncheckedCreateInput & {
    slotID: string
    patientIDs: string[]
    transmissionNotes?: string
  }
```

- [ ] **Step 2: Update `create` method to pass `transmissionNotes`**

In `back/src/main/infra/orm/repositories/appointment.repository.ts`, update the `create` method:

```typescript
async create(
  appointmentCreateParams: AppointmentCreateEntityRepo,
): Promise<AppointmentEntityRepo> {
  try {
    const { patientIDs, transmissionNotes, ...rest } = appointmentCreateParams

    return await this.prisma.appointment.create({
      data: {
        ...rest,
        appointmentPatients: {
          create:
            patientIDs?.map((id) => ({
              patient: { connect: { id } },
              transmissionNotes: transmissionNotes ?? undefined,
            })) || [],
        },
      },
      include: {
        appointmentPatients: {
          include: {
            patient: true,
          },
        },
      },
    })
  } catch (err) {
    throw this.errorHandler.boomErrorFromPrismaError({
      entityName: 'Appointment',
      error: err,
    })
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add src/main/types/infra/orm/repositories/appointment.repository.interface.ts src/main/infra/orm/repositories/appointment.repository.ts
git commit -m "feat: support transmissionNotes in appointment creation"
```

---

### Task 5: Thread `motif` through domain enrollment logic

**Files:**
- Modify: `back/src/main/domain/patient.domain.ts:229-332` (processEnrollments)
- Modify: `back/src/main/domain/patient.domain.ts:400-493` (enrollOnPathway)

- [ ] **Step 1: Pass `motif` from enrollment to `enrollOnPathway`**

In `back/src/main/domain/patient.domain.ts`, update `processEnrollments` to pass `motif`. In the section where `enrollOnPathway` is called (around line 274):

```typescript
const appointments = await this.enrollOnPathway(
  patient,
  validPathway,
  enrollment,
  thematicName,
  thematicDuration,
)
```

No change needed here — `enrollment` already contains `motif` since `PathwayEnrollmentInput` now has it.

- [ ] **Step 2: Update `enrollOnPathway` to pass `transmissionNotes`**

In the `enrollOnPathway` method, extract `motif` from `pathwayTemplate` and pass it to appointment creation. Update the method signature destructuring and both `appointmentRepository.create` calls:

```typescript
private async enrollOnPathway(
  patient: PatientEntityDomain,
  pathway: PathwayWithSlotsRepo,
  pathwayTemplate: PathwayEnrollmentInput,
  thematicName?: string,
  appointmentDuration = 30,
): Promise<EnrollmentAppointment[]> {
  const { type, motif } = pathwayTemplate
  const slots = pathway.slots
  const enrollmentAppointments: EnrollmentAppointment[] = []

  for (const slot of slots) {
    try {
      if (slot.slotTemplate.isIndividual) {
        const nextSlot = this.getNextAvailableAppointment(
          slot.startDate,
          slot.endDate,
          slot.appointments,
          appointmentDuration,
        )
        if (nextSlot) {
          const appointment = await this.appointmentRepository.create({
            startDate: nextSlot.startDate,
            endDate: nextSlot.endDate,
            thematic: thematicName ?? undefined,
            type: type ?? undefined,
            slotID: slot.id,
            patientIDs: [patient.id],
            transmissionNotes: motif ?? undefined,
          })

          enrollmentAppointments.push({
            id: appointment.id,
            startDate: appointment.startDate,
            endDate: appointment.endDate,
            success: true,
          })
        } else {
          enrollmentAppointments.push({
            success: false,
            error: `Erreur lors de l'inscription au créneau du ${slot.startDate}`,
          })
        }
      } else {
        const existingAppointment = slot.appointments.find((apt) => {
          const currentCapacity = apt.appointmentPatients?.length || 0
          const maxCapacity =
            slot.slotTemplate.capacity || Number.POSITIVE_INFINITY
          return currentCapacity < maxCapacity
        })

        if (existingAppointment) {
          await this.appointmentRepository.addPatientToAppointment({
            appointmentID: existingAppointment.id,
            patientID: patient.id,
            transmissionNotes: motif ?? undefined,
          })

          enrollmentAppointments.push({
            id: existingAppointment.id,
            startDate: existingAppointment.startDate,
            endDate: existingAppointment.endDate,
            success: true,
          })
        } else {
          const appointment = await this.appointmentRepository.create({
            startDate: slot.startDate,
            endDate: slot.endDate,
            slotID: slot.id,
            patientIDs: [patient.id],
            transmissionNotes: motif ?? undefined,
          })

          enrollmentAppointments.push({
            id: appointment.id,
            startDate: appointment.startDate,
            endDate: appointment.endDate,
            success: true,
          })
        }
      }
    } catch {
      enrollmentAppointments.push({
        success: false,
        error: `Erreur lors de l'inscription au créneau du ${slot.startDate}`,
      })
    }
  }

  return enrollmentAppointments
}
```

- [ ] **Step 3: Commit**

```bash
git add src/main/domain/patient.domain.ts
git commit -m "feat: pass motif as transmissionNotes during enrollment"
```

---

### Task 6: Update frontend PathwayTemplate type

**Files:**
- Modify: `front/src/types/pathwayTemplate.ts`

- [ ] **Step 1: Add `motifRequired` to PathwayTemplate type**

```typescript
export type PathwayTemplate = {
  id: string
  name: string
  color: string
  tags: string[]
  displayOrder: number
  motifRequired: boolean
  slotTemplates?: SlotTemplate[]
}

export type CreatePathwayTemplateParams = Pick<
  PathwayTemplate,
  'name' | 'color'
> & { slotTemplateIDs?: string[]; tags?: string[]; motifRequired?: boolean }
export type UpdatePathwayTemplateParams = Pick<
  PathwayTemplate,
  'id' | 'name' | 'color'
> & {
  slotTemplateIDs?: string[]
  tags?: string[]
  motifRequired?: boolean
}
```

- [ ] **Step 2: Add `motif` to patient enrollment types**

In `front/src/types/patient.ts`, add `motif` to `PathwayEnrollment`:

```typescript
export type PathwayEnrollment = {
  tag: string
  timeOfDay: TimeOfDay
  thematicID?: string
  type?: string
  motif?: string
}
```

- [ ] **Step 3: Commit**

```bash
git add front/src/types/pathwayTemplate.ts front/src/types/patient.ts
git commit -m "feat: add motifRequired and motif to frontend types"
```

---

### Task 7: Add checkbox to AddPathwayForm

**Files:**
- Modify: `front/src/components/custom/popup/addPathwayForm.tsx`

- [ ] **Step 1: Add `motifRequired` to form defaultValues and submit**

Update the form setup and submission:

```typescript
const form = useAppForm({
  defaultValues: {
    name: '',
    color: '#2563eb',
    motifRequired: false,
  },
  onSubmit: ({ value }) => {
    createPathwayTemplate.mutate({
      name: value.name,
      color: value.color,
      slotTemplateIDs: [],
      tags,
      motifRequired: value.motifRequired,
    })
    setOpen(false)
  },
})
```

- [ ] **Step 2: Add checkbox field to form JSX**

After the Tags field (after line 114's closing `</div>`), add:

```tsx
<form.AppField name="motifRequired">
  {(field) => (
    <field.CheckboxField label="Motif obligatoire" />
  )}
</form.AppField>
```

- [ ] **Step 3: Commit**

```bash
git add front/src/components/custom/popup/addPathwayForm.tsx
git commit -m "feat: add motifRequired checkbox to AddPathwayForm"
```

---

### Task 8: Add checkbox to PathwayTemplateSheet

**Files:**
- Modify: `front/src/components/custom/sheet/pathwayTemplateSheet.tsx`

- [ ] **Step 1: Add `motifRequired` to form defaultValues**

```typescript
const form = useAppForm({
  defaultValues: {
    name: '',
    color: '',
    motifRequired: false,
  },
  onSubmit: ({ value }) => {
    if (!pathwayTemplate?.id) {
      return
    }

    const updatedPathwayTemplateData: UpdatePathwayTemplateParams = {
      id: pathwayTemplate.id,
      name: value.name,
      color: value.color,
      tags,
      motifRequired: value.motifRequired,
    }

    updatePathwayTemplate.mutate(updatedPathwayTemplateData)
    setOpen('')
  },
})
```

- [ ] **Step 2: Update reset to include motifRequired**

In the `useEffect` that resets the form (around line 84):

```typescript
reset(
  {
    name: pathwayTemplate.name ?? '',
    color: pathwayTemplate.color ?? '',
    motifRequired: pathwayTemplate.motifRequired ?? false,
  },
  { keepDefaultValues: true },
)
```

- [ ] **Step 3: Add checkbox field to form JSX**

After the Tags field (after the closing `</div>` of tags section around line 163), add:

```tsx
<form.AppField name="motifRequired">
  {(field) => (
    <field.CheckboxField label="Motif obligatoire" />
  )}
</form.AppField>
```

- [ ] **Step 4: Commit**

```bash
git add front/src/components/custom/sheet/pathwayTemplateSheet.tsx
git commit -m "feat: add motifRequired checkbox to PathwayTemplateSheet"
```

---

### Task 9: Add motif input to PathwaySelector

**Files:**
- Modify: `front/src/components/custom/pathwaySelector.tsx`

- [ ] **Step 1: Add `motif` and `motifRequired` to `AddedPathway` interface**

```typescript
export interface AddedPathway {
  id: string
  tag: string
  period: PathwayPeriod
  thematicID: string
  thematicName: string
  thematicDuration: number | null
  type: string
  motif: string
  motifRequired: boolean
}
```

- [ ] **Step 2: Update `handleAddTags` to set motif defaults and lookup motifRequired**

In `usePathwaySelector`, update `handleAddTags` to determine `motifRequired` from the template:

```typescript
const handleAddTags = () => {
  const newPathways = selectedTags.map((tag) => {
    const template = (pathwayTemplates ?? []).find((t) =>
      t.tags?.includes(tag),
    )
    return {
      id: `${tag}-${Date.now()}-${Math.random()}`,
      tag,
      period: 'fullday' as PathwayPeriod,
      thematicID: '',
      thematicName: '',
      thematicDuration: null,
      type: '',
      motif: '',
      motifRequired: template?.motifRequired ?? false,
    }
  })
  setAddedPathways((prev) => [...prev, ...newPathways])
  setSelectedTags([])
}
```

- [ ] **Step 3: Add motif input to PathwayItem expanded section**

In the `PathwayItem` component, after the thematic/duration `<div className="flex gap-4">` block (after line 289's closing `</div>`), add the motif input conditionally:

```tsx
{pathway.motifRequired && (
  <FormField className="flex-1">
    <Label htmlFor={`motif-${pathway.id}`}>Motif *</Label>
    <input
      id={`motif-${pathway.id}`}
      type="text"
      value={pathway.motif}
      onChange={(e) => onUpdate({ motif: e.target.value })}
      placeholder="Saisir le motif..."
      className="flex h-9 w-full rounded-md border border-border bg-background px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      required
    />
  </FormField>
)}
```

- [ ] **Step 4: Add motif display in summary line**

In the `PathwayItem` summary section (around line 179-198), add motif display after thematic:

```tsx
{pathway.motif && (
  <>
    <span>•</span>
    <span>Motif: {pathway.motif}</span>
  </>
)}
```

- [ ] **Step 5: Auto-expand pathway if motifRequired**

In `handleAddTags`, after adding the new pathways, auto-expand the first one that requires a motif:

```typescript
const handleAddTags = () => {
  const newPathways = selectedTags.map((tag) => {
    const template = (pathwayTemplates ?? []).find((t) =>
      t.tags?.includes(tag),
    )
    return {
      id: `${tag}-${Date.now()}-${Math.random()}`,
      tag,
      period: 'fullday' as PathwayPeriod,
      thematicID: '',
      thematicName: '',
      thematicDuration: null,
      type: '',
      motif: '',
      motifRequired: template?.motifRequired ?? false,
    }
  })
  setAddedPathways((prev) => [...prev, ...newPathways])
  setSelectedTags([])

  const firstMotifRequired = newPathways.find((p) => p.motifRequired)
  if (firstMotifRequired) {
    setExpandedPathwayId(firstMotifRequired.id)
  }
}
```

- [ ] **Step 6: Commit**

```bash
git add front/src/components/custom/pathwaySelector.tsx
git commit -m "feat: add motif input to PathwaySelector when motifRequired"
```

---

### Task 10: Pass motif through enrollment and add validation

**Files:**
- Modify: `front/src/components/custom/popup/addPatientToPathwayForm.tsx`

- [ ] **Step 1: Add motif to enrollment payload and validation**

Update `handleConfirm` in `addPatientToPathwayForm.tsx`:

```typescript
const handleConfirm = () => {
  if (!pathwayState.addedPathways.length) {
    return
  }

  const missingMotif = pathwayState.addedPathways.find(
    (p) => p.motifRequired && !p.motif.trim(),
  )
  if (missingMotif) {
    return
  }

  enrollExistingPatient.mutate(
    {
      patientID: patient.id,
      startDate: startDate.toISOString(),
      pathways: pathwayState.addedPathways.map((p) => ({
        tag: p.tag,
        timeOfDay: periodToTimeOfDay[p.period],
        thematicID: p.thematicID || undefined,
        type: p.type,
        motif: p.motif || undefined,
      })),
    },
    { onSuccess: () => setOpen(false) },
  )
}
```

- [ ] **Step 2: Disable submit button if motif is missing**

Update the disabled condition on the confirm button:

```tsx
<Button
  variant="default"
  onClick={handleConfirm}
  disabled={
    !pathwayState.addedPathways.length ||
    enrollExistingPatient.isPending ||
    pathwayState.addedPathways.some(
      (p) => p.motifRequired && !p.motif.trim(),
    )
  }
>
```

- [ ] **Step 3: Commit**

```bash
git add front/src/components/custom/popup/addPatientToPathwayForm.tsx
git commit -m "feat: pass motif in enrollment and validate required motif"
```

---

### Task 11: Verify full flow

- [ ] **Step 1: Start the backend**

Run: `cd /Users/couffinhal/Documents/MediSync/back && npm run dev`

Verify: No startup errors.

- [ ] **Step 2: Start the frontend**

Run: `cd /Users/couffinhal/Documents/MediSync/front && npm run dev`

Verify: No compilation errors.

- [ ] **Step 3: Test the full flow**

1. Go to Settings > Planning
2. Create or edit a PathwayTemplate, check "Motif obligatoire"
3. Go to a patient, click "Ajouter à un parcours"
4. Select the pathway with motifRequired — verify the "Motif" input appears
5. Try submitting without filling motif — verify button is disabled
6. Fill the motif, submit
7. Open the created appointments — verify transmissionNotes contains the motif text

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat: motif obligatoire feature complete"
```
