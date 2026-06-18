# Multi-soignant per SlotTemplate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert `SlotTemplate.soignant` (single optional FK) to a many-to-many `SlotTemplate.soignants` relation, and propagate the change through backend types/repo/schemas, frontend types/forms/displays, and the calendar/filter logic. Thematic dropdown shows the union of thematics of all selected soignants.

**Architecture:** Implicit Prisma many-to-many (`soignants Soignant[] @relation("SlotTemplateSoignants")`), no extra join model. Repo uses `connect` on create, `set` on update. Front uses the existing `MultiSelect` component. Dev DB is reset (no data preservation); `seed.ts` is updated.

**Tech Stack:** Fastify 5 + Prisma 7 + Postgres + Zod v4 (backend) ; React 19 + TanStack Form + TanStack Query (frontend). No tests exist in this repo — verification gate is `npm run build` (which runs `prisma generate` + `tsc --noemit` + SWC), `npm run lint`, then manual E2E.

**Reference spec:** `docs/superpowers/specs/2026-06-18-multi-soignant-slot-design.md`

---

## Task 1: Update Prisma schema for many-to-many SlotTemplate ↔ Soignant

**Files:**
- Modify: `back/prisma/schema.prisma` (around lines 92–135)

- [ ] **Step 1: Edit the `SlotTemplate` model**

Find:
```prisma
model SlotTemplate {
  id         String   @id @default(cuid())
  startTime  DateTime @db.Time()
  endTime    DateTime @db.Time()
  offsetDays Int

  isIndividual Boolean
  capacity     Int?
  thematic     String?
  locationID   String?
  description  String?
  color        String

  slot       Slot?
  soignantID String?
  templateID String?

  soignant Soignant?        @relation(fields: [soignantID], references: [id])
  template PathwayTemplate? @relation(fields: [templateID], references: [id])
  location Location?        @relation(fields: [locationID], references: [id], onDelete: SetNull)
}
```

Replace with:
```prisma
model SlotTemplate {
  id         String   @id @default(cuid())
  startTime  DateTime @db.Time()
  endTime    DateTime @db.Time()
  offsetDays Int

  isIndividual Boolean
  capacity     Int?
  thematic     String?
  locationID   String?
  description  String?
  color        String

  slot       Slot?
  templateID String?

  soignants Soignant[]      @relation("SlotTemplateSoignants")
  template PathwayTemplate? @relation(fields: [templateID], references: [id])
  location Location?        @relation(fields: [locationID], references: [id], onDelete: SetNull)
}
```

- [ ] **Step 2: Edit the `Soignant` model**

Find:
```prisma
model Soignant {
  id   String @id @default(cuid())
  name String

  slotTemplates SlotTemplate[]
  todos         Todo[]
  thematics     Thematic[]     @relation("SoignantThematics")
  users         User[]
}
```

Replace with:
```prisma
model Soignant {
  id   String @id @default(cuid())
  name String

  slotTemplates SlotTemplate[] @relation("SlotTemplateSoignants")
  todos         Todo[]
  thematics     Thematic[]     @relation("SoignantThematics")
  users         User[]
}
```

- [ ] **Step 3: Generate the migration**

Run:
```bash
cd back && npm run prisma:migrate:dev -- --name slot_template_multi_soignant
```

Expected: Prisma prompts about a destructive change (dropping `soignantID` column). Confirm `Yes`. The migration file is created under `back/prisma/migrations/<timestamp>_slot_template_multi_soignant/migration.sql` and Prisma regenerates the client into `back/src/generated/`.

If `npm run prisma:migrate:dev` fails because the schema cannot resolve (e.g. seed/runtime imports break), proceed to the next tasks first — Prisma generate is also triggered by `npm run build`.

- [ ] **Step 4: Verify the generated client compiles**

Run:
```bash
cd back && npm run prisma:generate
```

Expected: client regenerated without errors. (If errors come from non-prisma code, that's expected — fix in later tasks.)

- [ ] **Step 5: Commit**

```bash
git add back/prisma/schema.prisma back/prisma/migrations
git commit -m "feat(slot-template): migrate soignant to many-to-many relation"
```

---

## Task 2: Update seed to use the new many-to-many shape

**Files:**
- Modify: `back/prisma/seed/pathwayTemplate.ts` (around lines 70–112)

- [ ] **Step 1: Edit `createSlotTemplate` to emit `soignants.connect`**

Find (around line 100–112):
```ts
  return {
    startTime,
    endTime,
    offsetDays,
    isIndividual: data.isIndividual,
    capacity: data.isIndividual ? null : (data.capacity ?? 1),
    color,
    description: data.description,
    thematic: data.thematic,
    locationID,
    soignantID: soignant.id,
  }
```

Replace with:
```ts
  return {
    startTime,
    endTime,
    offsetDays,
    isIndividual: data.isIndividual,
    capacity: data.isIndividual ? null : (data.capacity ?? 1),
    color,
    description: data.description,
    thematic: data.thematic,
    locationID,
    soignants: { connect: [{ id: soignant.id }] },
  }
```

- [ ] **Step 2: Verify the seed compiles**

Run:
```bash
cd back && npx tsc --noemit -p tsconfig.json 2>&1 | grep -E "seed|pathwayTemplate" || echo "seed type-checks"
```

Expected: no seed-related errors (other unrelated errors from later tasks are fine and will be fixed below).

- [ ] **Step 3: Re-seed the dev DB**

Run:
```bash
cd back && npm run prisma:migrate:reset
```

Expected: DB wiped, migrations re-applied, seed runs successfully. Look for `✅ Seeding completed successfully!`.

If the seed fails because something else still references `soignantID` (e.g. domain/repo not yet updated), skip this verification step and come back after Task 4.

- [ ] **Step 4: Commit**

```bash
git add back/prisma/seed/pathwayTemplate.ts
git commit -m "feat(seed): connect single soignant via many-to-many relation"
```

---

## Task 3: Update backend domain & repo interfaces

**Files:**
- Modify: `back/src/main/types/domain/slotTemplate.domain.interface.ts`
- Modify: `back/src/main/types/infra/orm/repositories/slotTemplate.repository.interface.ts`
- Modify: `back/src/main/types/infra/orm/repositories/slot.repository.interface.ts`

- [ ] **Step 1: Update `slotTemplate.domain.interface.ts`**

Find:
```ts
export type SlotTemplateEntityDomain = SlotTemplateEntityRepo
export type SlotTemplateWithSoignantDomain = SlotTemplateEntityRepo & {
  soignant: SoignantEntityDomain | null
}
export type SlotTemplateDTODomain = SlotTemplateEntityDomain & {
  soignant: SoignantEntityDomain | null
  template: PathwayTemplateEntityDomain | null
}
export type SlotTemplateCreateEntityDomain = Omit<
  Prisma.SlotTemplateUncheckedCreateInput,
  'slot'
> & {
  soignantID?: string
  templateID?: string
}
export type SlotTemplateUpdateEntityDomain = Omit<
  Prisma.SlotTemplateUncheckedUpdateInput,
  'slot'
> & {
  soignantID?: string
  templateID?: string
  slotID?: string
}
```

Replace with:
```ts
export type SlotTemplateEntityDomain = SlotTemplateEntityRepo
export type SlotTemplateWithSoignantsDomain = SlotTemplateEntityRepo & {
  soignants: SoignantEntityDomain[]
}
export type SlotTemplateDTODomain = SlotTemplateEntityDomain & {
  soignants: SoignantEntityDomain[]
  template: PathwayTemplateEntityDomain | null
}
export type SlotTemplateCreateEntityDomain = Omit<
  Prisma.SlotTemplateUncheckedCreateInput,
  'slot'
> & {
  soignantIDs?: string[]
  templateID?: string
}
export type SlotTemplateUpdateEntityDomain = Omit<
  Prisma.SlotTemplateUncheckedUpdateInput,
  'slot'
> & {
  soignantIDs?: string[]
  templateID?: string
  slotID?: string
}
```

- [ ] **Step 2: Update `slotTemplate.repository.interface.ts`**

Find:
```ts
export type SlotTemplateEntityRepo = SlotTemplate
export type SlotTemplateWithSoignantRepo = SlotTemplateEntityRepo & {
  soignant: SoignantEntityRepo | null
}
export type SlotTemplateDTORepo = SlotTemplateEntityRepo & {
  soignant: SoignantEntityRepo | null
  template: PathwayTemplateEntityRepo | null
  location: LocationEntityRepo | null
}
export type SlotTemplateCreateEntityRepo =
  Prisma.SlotTemplateUncheckedCreateInput & {
    soignantID?: string
    templateID?: string
  }
export type SlotTemplateUpdateEntityRepo =
  Prisma.SlotTemplateUncheckedUpdateInput & {
    soignantID?: string
    templateID?: string
    slot?: string
  }
```

Replace with:
```ts
export type SlotTemplateEntityRepo = SlotTemplate
export type SlotTemplateWithSoignantsRepo = SlotTemplateEntityRepo & {
  soignants: SoignantEntityRepo[]
}
export type SlotTemplateDTORepo = SlotTemplateEntityRepo & {
  soignants: SoignantEntityRepo[]
  template: PathwayTemplateEntityRepo | null
  location: LocationEntityRepo | null
}
export type SlotTemplateCreateEntityRepo =
  Prisma.SlotTemplateUncheckedCreateInput & {
    soignantIDs?: string[]
    templateID?: string
  }
export type SlotTemplateUpdateEntityRepo =
  Prisma.SlotTemplateUncheckedUpdateInput & {
    soignantIDs?: string[]
    templateID?: string
    slot?: string
  }
```

- [ ] **Step 3: Update `slot.repository.interface.ts` to use the renamed type**

Find:
```ts
import type {
  SlotTemplateUpdateEntityRepo,
  SlotTemplateWithSoignantRepo,
} from './slotTemplate.repository.interface'

export type SlotEntityRepo = Slot
export type SlotWithTemplateAndAppointmentsRepo = SlotEntityRepo & {
  slotTemplate: SlotTemplateWithSoignantRepo
  appointments: AppointmentWithPatientsRepo[]
}
```

Replace `SlotTemplateWithSoignantRepo` with `SlotTemplateWithSoignantsRepo` in both the import and the usage. Same for `SlotDTORepo` further down:

```ts
import type {
  SlotTemplateUpdateEntityRepo,
  SlotTemplateWithSoignantsRepo,
} from './slotTemplate.repository.interface'

export type SlotEntityRepo = Slot
export type SlotWithTemplateAndAppointmentsRepo = SlotEntityRepo & {
  slotTemplate: SlotTemplateWithSoignantsRepo
  appointments: AppointmentWithPatientsRepo[]
}
// …
export type SlotDTORepo = SlotEntityRepo & {
  pathway: PathwayWithTemplateRepo | null
  slotTemplate: SlotTemplateWithSoignantsRepo
  appointments: AppointmentWithPatientsRepo[]
}
```

- [ ] **Step 4: Commit**

```bash
git add back/src/main/types
git commit -m "feat(slot-template): switch domain & repo types to soignants array"
```

---

## Task 4: Update SlotTemplate repository implementation

**Files:**
- Modify: `back/src/main/infra/orm/repositories/slotTemplate.repository.ts`

- [ ] **Step 1: Replace `include: { soignant: true }` with `soignants: true` everywhere**

Find every occurrence of:
```ts
include: {
  soignant: true,
  template: true,
  location: true,
},
```

Replace with:
```ts
include: {
  soignants: true,
  template: true,
  location: true,
},
```

There are 4 occurrences (in `findAll`, `findByID`, `create`, `update`, `delete` — check each function).

- [ ] **Step 2: Add input-mapping helpers at the top of the file (above the class)**

Add after the imports:
```ts
function applyConnect(params: SlotTemplateCreateEntityRepo) {
  const { soignantIDs, ...rest } = params
  if (soignantIDs === undefined) return rest
  return {
    ...rest,
    soignants: { connect: soignantIDs.map((id) => ({ id })) },
  }
}

function applySet(params: SlotTemplateUpdateEntityRepo) {
  const { soignantIDs, ...rest } = params
  if (soignantIDs === undefined) return rest
  return {
    ...rest,
    soignants: { set: soignantIDs.map((id) => ({ id })) },
  }
}
```

- [ ] **Step 3: Use the helpers in `create` and `update`**

In `create`:
```ts
async create(
  slotTemplateCreateParams: SlotTemplateCreateEntityRepo,
): Promise<SlotTemplateDTORepo> {
  try {
    return await this.prisma.slotTemplate.create({
      data: applyConnect(slotTemplateCreateParams),
      include: {
        soignants: true,
        template: true,
        location: true,
      },
    })
  } catch (err) {
    console.error('Prisma error:', err)
    throw this.errorHandler.boomErrorFromPrismaError({
      entityName: 'SlotTemplate',
      parentEntityName: 'Soignant',
      error: err,
    })
  }
}
```

In `update`:
```ts
async update(
  slotTemplateID: string,
  slotTemplateUpdateParams: SlotTemplateUpdateEntityRepo,
): Promise<SlotTemplateDTORepo> {
  try {
    return await this.prisma.slotTemplate.update({
      where: { id: slotTemplateID },
      data: applySet(slotTemplateUpdateParams),
      include: {
        soignants: true,
        template: true,
        location: true,
      },
    })
  } catch (err) {
    throw this.errorHandler.boomErrorFromPrismaError({
      entityName: 'SlotTemplate',
      error: err,
    })
  }
}
```

In `updateMany` (line ~92): leave the body as-is — `updateMany` doesn't support nested writes, so `soignantIDs` will never be passed here. To make this explicit, change the signature param type so callers know:

Find:
```ts
async updateMany(
  slotTemplateIDs: string[],
  slotTemplateUpdateParams: SlotTemplateUpdateEntityRepo,
): Promise<void> {
```

Replace the body's data with `applySet`-equivalent that throws if `soignantIDs` is provided:
```ts
async updateMany(
  slotTemplateIDs: string[],
  slotTemplateUpdateParams: SlotTemplateUpdateEntityRepo,
): Promise<void> {
  if (slotTemplateUpdateParams.soignantIDs !== undefined) {
    throw new Error(
      'updateMany cannot set soignantIDs — use update() per record',
    )
  }
  try {
    await this.prisma.slotTemplate.updateMany({
      where: { id: { in: slotTemplateIDs } },
      data: slotTemplateUpdateParams,
    })
  } catch (err) {
    throw this.errorHandler.boomErrorFromPrismaError({
      entityName: 'SlotTemplate',
      error: err,
    })
  }
}
```

- [ ] **Step 4: Add the missing imports for the helper types**

At the top of the file, ensure `SlotTemplateCreateEntityRepo` and `SlotTemplateUpdateEntityRepo` are imported (they already are).

- [ ] **Step 5: Build & verify**

Run:
```bash
cd back && npm run build
```

Expected: type check passes for this file and `slotTemplate.repository.ts`-related types. Other files may still error — proceed.

- [ ] **Step 6: Commit**

```bash
git add back/src/main/infra/orm/repositories/slotTemplate.repository.ts
git commit -m "feat(slot-template-repo): connect/set soignants via many-to-many"
```

---

## Task 5: Update Slot repository to include nested soignants

**Files:**
- Modify: `back/src/main/infra/orm/repositories/slot.repository.ts`

- [ ] **Step 1: Replace nested `soignant: true` with `soignants: true` in all `include` blocks**

Find (4 occurrences across `findAll`, `findByID`, `create`, `update`):
```ts
slotTemplate: {
  include: {
    soignant: true,
  },
},
```

Replace with:
```ts
slotTemplate: {
  include: {
    soignants: true,
  },
},
```

- [ ] **Step 2: Handle nested update of `soignantIDs` in the `update` transaction**

Find (around lines 121–155):
```ts
return await this.prisma.$transaction(async (tx) => {
  const { slotTemplate: slotTemplateData, ...slotData } = slotUpdateParams

  if (slotTemplateData?.id) {
    await tx.slotTemplate.update({
      where: { id: slotTemplateData.id },
      data: slotTemplateData,
    })
  }
  // …
})
```

Replace with:
```ts
return await this.prisma.$transaction(async (tx) => {
  const { slotTemplate: slotTemplateData, ...slotData } = slotUpdateParams

  if (slotTemplateData?.id) {
    const { soignantIDs, id: _id, ...templateRest } = slotTemplateData
    const data = soignantIDs === undefined
      ? templateRest
      : {
          ...templateRest,
          soignants: { set: soignantIDs.map((id) => ({ id })) },
        }
    await tx.slotTemplate.update({
      where: { id: slotTemplateData.id },
      data,
    })
  }
  // … (rest of the transaction unchanged)
})
```

- [ ] **Step 3: Build & verify**

Run:
```bash
cd back && npm run build 2>&1 | grep -E "slot\.repository" || echo "slot.repository typecheck OK"
```

Expected: no errors specific to `slot.repository.ts`.

- [ ] **Step 4: Commit**

```bash
git add back/src/main/infra/orm/repositories/slot.repository.ts
git commit -m "feat(slot-repo): include nested soignants and handle set via embedded slotTemplate"
```

---

## Task 6: Update Zod schemas

**Files:**
- Modify: `back/src/main/interfaces/http/fastify/schemas/index.ts`
- Modify: `back/src/main/interfaces/http/fastify/schemas/slotTemplate.schema.ts`
- Modify: `back/src/main/interfaces/http/fastify/schemas/slot.schema.ts`

- [ ] **Step 1: Update the `slotTemplateSchema` shape in the barrel**

In `back/src/main/interfaces/http/fastify/schemas/index.ts` (around line 34):

Find:
```ts
export const slotTemplateSchema = z.object({
  startTime: z.coerce.date(),
  endTime: z.coerce.date(),
  offsetDays: z.number(),

  thematic: z.string().optional().nullable(),
  locationID: z.cuid().optional().nullable(),
  description: z.string().optional().nullable(),
  color: z.string(),
  isIndividual: z.boolean(),
  capacity: z.number().optional().nullable(),

  get soignant() {
    return soignantSchema.optional().nullable()
  },
  // …
})
```

Replace the `get soignant()` getter with:
```ts
  get soignants() {
    return z.array(soignantSchema)
  },
```

- [ ] **Step 2: Update `slotTemplate.schema.ts`**

In `back/src/main/interfaces/http/fastify/schemas/slotTemplate.schema.ts`:

Find:
```ts
export const slotTemplateResponseSchema = slotTemplateSchema.extend({
  id: z.cuid(),
  soignant: soignantResponseSchema.extend({
    id: z.cuid(),
  }).optional().nullable(),
})
```

Replace with:
```ts
export const slotTemplateResponseSchema = slotTemplateSchema.extend({
  id: z.cuid(),
  soignants: z.array(soignantResponseSchema.extend({ id: z.cuid() })),
})
```

Find:
```ts
export const createSlotTemplateSchema = slotTemplateSchema
  .pick({
    startTime: true,
    endTime: true,
    offsetDays: true,

    thematic: true,
    locationID: true,
    description: true,
    color: true,
    isIndividual: true,
    capacity: true,
  })
  .extend({
    soignantID: z.cuid().optional(),
    templateID: z.cuid().optional(),
  })
```

Replace `soignantID: z.cuid().optional()` with `soignantIDs: z.array(z.cuid()).optional()`.

Find:
```ts
export const updateSlotTemplateByIdSchema = {
  params: getSlotTemplateByIdParamsSchema,
  body: slotTemplateSchema.partial().extend({
    soignantID: z.cuid().optional(),
    templateID: z.cuid().optional(),
  }),
}
```

Replace `soignantID: z.cuid().optional()` with `soignantIDs: z.array(z.cuid()).optional()`.

- [ ] **Step 3: Update `slot.schema.ts`**

In `back/src/main/interfaces/http/fastify/schemas/slot.schema.ts`:

Find:
```ts
export const createSlotSchemaBase = slotSchema
  .pick({
    startDate: true,
    endDate: true,
  })
  .extend({
    soignantID: z.cuid().optional(),
  })
```

Replace `soignantID: z.cuid().optional()` with `soignantIDs: z.array(z.cuid()).optional()`. Note: this field is unused at runtime (the Slot table has no soignantID column), but keeping it consistent with the new naming avoids confusion.

Find:
```ts
export const updateSlotByIdSchema = {
  params: getSlotByIdParamsSchema,
  body: slotSchema.partial().extend({
    soignantID: z.cuid().optional(),
    slotTemplate: updateSlotTemplateByIdSchema.body
      .extend({
        id: z.cuid(),
      })
      .optional(),
  }),
}
```

Replace `soignantID: z.cuid().optional()` with `soignantIDs: z.array(z.cuid()).optional()`.

- [ ] **Step 4: Build & verify**

Run:
```bash
cd back && npm run build 2>&1 | tail -40
```

Expected: schema typecheck passes. If the response schema is consumed by routes that strip `soignant`, fix those as compile errors appear.

- [ ] **Step 5: Commit**

```bash
git add back/src/main/interfaces/http/fastify/schemas
git commit -m "feat(api): rename soignant to soignants in slot & slotTemplate schemas"
```

---

## Task 7: Verify full backend build + seed roundtrip

**Files:** none — verification only.

- [ ] **Step 1: Full build**

Run:
```bash
cd back && npm run build
```

Expected: PASS. If anything still references the old `soignant`/`soignantID` shape (e.g. activity-log subscriber, an unrelated route), fix it inline — the build output names the file and line.

- [ ] **Step 2: Lint**

Run:
```bash
cd back && npm run lint
```

Expected: PASS.

- [ ] **Step 3: Reset dev DB + reseed end-to-end**

Run:
```bash
cd back && npm run prisma:migrate:reset
```

Expected: full reset succeeds, seed completes. Manually inspect via Prisma Studio or psql that `_SlotTemplateSoignants` table is populated (one row per slot template ↔ soignant link).

```bash
cd back && npx prisma studio
```

(Or query the DB directly with `\dt` and `SELECT * FROM "_SlotTemplateSoignants";`.)

- [ ] **Step 4: Smoke-test one HTTP route**

Start the dev server:
```bash
cd back && npm run dev
```

In another shell, hit `GET /slot-template` (or use the existing Bruno collection):
```bash
curl -s http://localhost:3000/slot-template -b "session=…" | jq '.[0] | {id, soignants}'
```

Expected: each slotTemplate has a `soignants` array (not `soignant`). Stop the dev server.

- [ ] **Step 5: Commit (if any fixup was needed; otherwise skip)**

```bash
git status
# If clean, no commit. Otherwise:
git add -A
git commit -m "chore(api): fix remaining backend references to old soignant field"
```

---

## Task 8: Update frontend types

**Files:**
- Modify: `front/src/types/slotTemplate.ts`

- [ ] **Step 1: Read the current type**

Run:
```bash
cat /Users/couffinhal/Documents/MediSync/front/src/types/slotTemplate.ts
```

- [ ] **Step 2: Replace `soignant?: Soignant | null` (or equivalent) with `soignants: Soignant[]`**

In `front/src/types/slotTemplate.ts`, find any field of the form:
```ts
soignant?: Soignant | null
```
or
```ts
soignant: Soignant | null
```

Replace with:
```ts
soignants: Soignant[]
```

If `soignantID?: string` is present, remove it (the front no longer needs the raw FK separate from the relation).

- [ ] **Step 3: Verify other type files are consistent**

Run:
```bash
grep -rn "soignant\?:\s*Soignant\|soignantID" /Users/couffinhal/Documents/MediSync/front/src/types
```

Expected: no remaining occurrences in `types/`. If `front/src/types/slot.ts` re-exports or composes the slotTemplate, no change is needed beyond the slotTemplate type update.

- [ ] **Step 4: Commit**

```bash
git add front/src/types/slotTemplate.ts
git commit -m "feat(types): SlotTemplate.soignant becomes soignants array"
```

---

## Task 9: Update shared form values (eventFormOpts)

**Files:**
- Modify: `front/src/components/custom/sheet/form/eventFormOpts.ts`

- [ ] **Step 1: Update `EventFormValues` and defaults**

Find:
```ts
export interface EventFormValues {
  thematic: string
  locationID: string
  description: string
  isIndividual: boolean
  capacity: number
  soignant: string
  color: string
}

export const eventFormOpts: { defaultValues: EventFormValues } = {
  defaultValues: {
    thematic: '',
    locationID: '',
    description: '',
    isIndividual: false,
    capacity: 15,
    soignant: '',
    color: '',
  },
}
```

Replace with:
```ts
export interface EventFormValues {
  thematic: string
  locationID: string
  description: string
  isIndividual: boolean
  capacity: number
  soignantIDs: string[]
  color: string
}

export const eventFormOpts: { defaultValues: EventFormValues } = {
  defaultValues: {
    thematic: '',
    locationID: '',
    description: '',
    isIndividual: false,
    capacity: 15,
    soignantIDs: [],
    color: '',
  },
}
```

- [ ] **Step 2: Commit**

```bash
git add front/src/components/custom/sheet/form/eventFormOpts.ts
git commit -m "feat(form): eventFormOpts switches to soignantIDs array"
```

---

## Task 10: Update `addSlotForm.tsx`

**Files:**
- Modify: `front/src/components/custom/popup/addSlotForm.tsx`

- [ ] **Step 1: Read the file's current state to map line numbers**

Run:
```bash
sed -n '60,170p' /Users/couffinhal/Documents/MediSync/front/src/components/custom/popup/addSlotForm.tsx
```

Note the actual lines for `soignant: ''` (default value), the `selectedSoignant` derivation, the `thematicOptions` filter, and the reset effect.

- [ ] **Step 2: Update the form default**

Find the default value (around line 77):
```ts
soignant: '',
```

Replace with:
```ts
soignantIDs: [] as string[],
```

- [ ] **Step 3: Update the selected-soignant derivation and thematic union**

Find (around lines 132–143):
```ts
const selectedSoignantId = useStore(
  form.store,
  (state) => state.values.soignant,
)
const selectedSoignant = soignants.find((s) => s.id === selectedSoignantId)
const thematicOptions = selectedSoignant
  ? (thematics
      ?.filter((t) => t.soignants.some((s) => s.id === selectedSoignant.id))
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name, 'fr'))
      .map((t) => ({ value: t.name, label: t.name })) ?? [])
  : []
```

Replace with:
```ts
const selectedSoignantIds = useStore(
  form.store,
  (state) => state.values.soignantIDs,
)
const selectedSoignants = soignants.filter((s) =>
  selectedSoignantIds.includes(s.id),
)
const thematicOptions = useMemo(() => {
  const set = new Map<string, { value: string; label: string }>()
  for (const soignant of selectedSoignants) {
    for (const t of
      thematics?.filter((t) =>
        t.soignants.some((ss) => ss.id === soignant.id),
      ) ?? []) {
      set.set(t.id, { value: t.name, label: t.name })
    }
  }
  return [...set.values()].sort((a, b) =>
    a.label.localeCompare(b.label, 'fr'),
  )
}, [selectedSoignants, thematics])
```

If `useMemo` is not already imported from React at the top of the file, add it.

- [ ] **Step 4: Update the reset-thematic effect to clear only when out of options**

Find (around lines 145–149):
```ts
useEffect(() => {
  if (selectedSoignantId) {
    form.setFieldValue('thematic', '')
  }
}, [selectedSoignantId, form])
```

Replace with:
```ts
useEffect(() => {
  const current = form.state.values.thematic
  if (current && !thematicOptions.some((o) => o.value === current)) {
    form.setFieldValue('thematic', '')
  }
}, [thematicOptions, form])
```

- [ ] **Step 5: Remove the "Soignant requis" validation and replace the Select with MultiSelect**

Find (around lines 257–271):
```tsx
<form.AppField
  name="soignant"
  validators={{
    onSubmit: ({ value }) => {
      if (!value) {
        return 'Ce champ est requis'
      }
      return undefined
    },
  }}
>
  {(field) => (
    <field.Select options={soignantOptions} label="Soignant" />
  )}
</form.AppField>
```

Replace with:
```tsx
<form.Field name="soignantIDs">
  {(field) => (
    <FormField>
      <div className="text-sm text-text-light font-medium">Soignants</div>
      <MultiSelect
        options={soignantOptions}
        value={field.state.value}
        onChange={(values) => field.handleChange(values)}
        placeholder="Sélectionnez un ou plusieurs soignants"
      />
      <FieldInfo field={field} />
    </FormField>
  )}
</form.Field>
```

Add the import at the top of the file if not present:
```ts
import { MultiSelect } from '../../ui/select.tsx'
```

(`FormField` and `FieldInfo` are already imported in this file — verify.)

- [ ] **Step 6: Update the thematic field's disabled/placeholder logic**

Find (around lines 273–288):
```tsx
<form.AppField name="thematic">
  {(field) => (
    <field.Select
      options={thematicOptions}
      label="Thématique"
      disabled={!selectedSoignant || thematicOptions.length === 0}
      placeholder={
        selectedSoignant
          ? thematicOptions.length === 0
            ? 'Aucune thématique associée'
            : 'Sélectionnez une thématique'
          : 'Sélectionnez un soignant'
      }
    />
  )}
</form.AppField>
```

Replace with:
```tsx
<form.AppField name="thematic">
  {(field) => (
    <field.Select
      options={thematicOptions}
      label="Thématique"
      disabled={
        selectedSoignants.length === 0 || thematicOptions.length === 0
      }
      placeholder={
        selectedSoignants.length === 0
          ? 'Sélectionnez un soignant'
          : thematicOptions.length === 0
            ? 'Aucune thématique associée'
            : 'Sélectionnez une thématique'
      }
    />
  )}
</form.AppField>
```

- [ ] **Step 7: Update the form submit body**

In the `onSubmit` (or the `handleSubmit` call further down — search for `soignantID:` in the same file):

Find:
```ts
soignantID: value.soignant,
```

Replace with:
```ts
soignantIDs: value.soignantIDs,
```

- [ ] **Step 8: Build & verify**

Run:
```bash
cd front && npm run build 2>&1 | grep -E "addSlotForm|TypeError" | head -20
```

Expected: no errors specific to `addSlotForm.tsx`. Other files may still error — fix them in later tasks.

- [ ] **Step 9: Commit**

```bash
git add front/src/components/custom/popup/addSlotForm.tsx
git commit -m "feat(addSlotForm): multi-soignant select with union thematic dropdown"
```

---

## Task 11: Update `eventTemplateSheet.tsx`

**Files:**
- Modify: `front/src/components/custom/sheet/eventTemplateSheet.tsx`

- [ ] **Step 1: Update default values**

Find both occurrences (lines 55 and 106):
```ts
soignant: slotTemplate?.soignant?.id ?? '',
```

Replace each with:
```ts
soignantIDs: slotTemplate?.soignants?.map((s) => s.id) ?? [],
```

(Line 106 may use `slotTemplate.soignant` without optional chaining — match exactly.)

- [ ] **Step 2: Update the submit body**

Find:
```ts
soignantID: value.soignant,
```

Replace with:
```ts
soignantIDs: value.soignantIDs,
```

- [ ] **Step 3: Replace the soignant Select with MultiSelect**

Locate the `<form.AppField name="soignant">` block and convert to a `<form.Field name="soignantIDs">` rendering `<MultiSelect>` directly.

Find:
```tsx
<form.AppField name="soignant">
  {(field) => (
    <field.Select options={soignantOptions} label="Soignant" />
  )}
</form.AppField>
```

Replace with:
```tsx
<form.Field name="soignantIDs">
  {(field) => (
    <FormField>
      <div className="text-sm text-text-light font-medium">Soignants</div>
      <MultiSelect
        options={soignantOptions}
        value={field.state.value}
        onChange={(values) => field.handleChange(values)}
        placeholder="Sélectionnez un ou plusieurs soignants"
      />
      <FieldInfo field={field} />
    </FormField>
  )}
</form.Field>
```

Add the import at the top of the file if not present:
```ts
import { MultiSelect } from '../../ui/select.tsx'
```

- [ ] **Step 4: Update the union thematic calculation**

Locate where `thematicOptions` is computed in this file. If it follows the single-soignant pattern (filter by one soignant id), replace with the multi-soignant union:
```ts
const selectedSoignants = soignants.filter((s) =>
  (form.state.values.soignantIDs ?? []).includes(s.id),
)
const thematicOptions = useMemo(() => {
  const set = new Map<string, { value: string; label: string }>()
  for (const soignant of selectedSoignants) {
    for (const t of
      thematics?.filter((t) =>
        t.soignants.some((ss) => ss.id === soignant.id),
      ) ?? []) {
      set.set(t.id, { value: t.name, label: t.name })
    }
  }
  return [...set.values()].sort((a, b) =>
    a.label.localeCompare(b.label, 'fr'),
  )
}, [selectedSoignants, thematics])
```

Import `useMemo` from React at the top if not already imported.

- [ ] **Step 5: Update the reset-thematic effect (if present)**

If a `useEffect` resets `thematic` when the soignant changes, replace with the conditional version:
```ts
useEffect(() => {
  const current = form.state.values.thematic
  if (current && !thematicOptions.some((o) => o.value === current)) {
    form.setFieldValue('thematic', '')
  }
}, [thematicOptions, form])
```

- [ ] **Step 6: Compile & visually inspect**

Run:
```bash
cd front && npm run build 2>&1 | grep "eventTemplateSheet" | head -20
```

Expected: no errors for this file.

- [ ] **Step 7: Commit**

```bash
git add front/src/components/custom/sheet/eventTemplateSheet.tsx
git commit -m "feat(eventTemplateSheet): multi-soignant edit support"
```

---

## Task 12: Update `eventSheet.tsx`

**Files:**
- Modify: `front/src/components/custom/sheet/eventSheet.tsx`

- [ ] **Step 1: Update both occurrences of `soignant: slot?.slotTemplate?.soignant?.id ?? ''`**

Find at lines 60 and 133:
```ts
soignant: slot?.slotTemplate?.soignant?.id ?? '',
```
and
```ts
soignant: slot.slotTemplate?.soignant?.id ?? '',
```

Replace each with:
```ts
soignantIDs: slot?.slotTemplate?.soignants?.map((s) => s.id) ?? [],
```
(adjust `?.` chain to match each call site).

- [ ] **Step 2: Update the submit body**

Find (around line 82):
```ts
soignantID: value.soignant,
```

Replace with:
```ts
soignantIDs: value.soignantIDs,
```

- [ ] **Step 3: Replace the soignant Select with MultiSelect**

Locate the `<form.AppField name="soignant">` block (or the equivalent `<form.Field>`) and convert it to:

```tsx
<form.Field name="soignantIDs">
  {(field) => (
    <FormField>
      <div className="text-sm text-text-light font-medium">Soignants</div>
      <MultiSelect
        options={soignantOptions}
        value={field.state.value}
        onChange={(values) => field.handleChange(values)}
        placeholder="Sélectionnez un ou plusieurs soignants"
      />
      <FieldInfo field={field} />
    </FormField>
  )}
</form.Field>
```

Add the imports if missing:
```ts
import { MultiSelect } from '../../ui/select.tsx'
```

- [ ] **Step 4: Update the union thematic calculation (if this file computes one)**

Locate where `thematicOptions` is computed. If it follows the single-soignant pattern, replace with the multi-soignant union:
```ts
const selectedSoignants = soignants.filter((s) =>
  (form.state.values.soignantIDs ?? []).includes(s.id),
)
const thematicOptions = useMemo(() => {
  const set = new Map<string, { value: string; label: string }>()
  for (const soignant of selectedSoignants) {
    for (const t of
      thematics?.filter((t) =>
        t.soignants.some((ss) => ss.id === soignant.id),
      ) ?? []) {
      set.set(t.id, { value: t.name, label: t.name })
    }
  }
  return [...set.values()].sort((a, b) =>
    a.label.localeCompare(b.label, 'fr'),
  )
}, [selectedSoignants, thematics])
```

Import `useMemo` if not present.

- [ ] **Step 5: Update the reset-thematic effect (if present)**

```ts
useEffect(() => {
  const current = form.state.values.thematic
  if (current && !thematicOptions.some((o) => o.value === current)) {
    form.setFieldValue('thematic', '')
  }
}, [thematicOptions, form])
```

- [ ] **Step 6: Build**

Run:
```bash
cd front && npm run build 2>&1 | grep "eventSheet" | head -20
```

Expected: no errors for this file.

- [ ] **Step 7: Commit**

```bash
git add front/src/components/custom/sheet/eventSheet.tsx
git commit -m "feat(eventSheet): multi-soignant edit support"
```

---

## Task 13: Update `addAppointmentForm.tsx`

**Files:**
- Modify: `front/src/components/custom/popup/addAppointmentForm.tsx`

- [ ] **Step 1: Update the component prop type**

Find (around line 36):
```ts
soignant?: Soignant
```

Replace with:
```ts
soignants?: Soignant[]
```

- [ ] **Step 2: Update the destructuring**

Find (around line 49):
```ts
soignant,
```

Replace with:
```ts
soignants = [],
```

- [ ] **Step 3: Update the thematic union calculation**

Find (around lines 102–110):
```ts
const thematicOptions = useMemo(() => {
  return soignant
    ? (thematics
        ?.filter((t) => t.soignants.some((s) => s.id === soignant.id))
        ...)
    : []
}, [soignant, thematics])
```

Replace with:
```ts
const thematicOptions = useMemo(() => {
  const set = new Map<string, { value: string; label: string }>()
  for (const soignant of soignants) {
    for (const t of
      thematics?.filter((t) =>
        t.soignants.some((ss) => ss.id === soignant.id),
      ) ?? []) {
      set.set(t.id, { value: t.name, label: t.name })
    }
  }
  return [...set.values()].sort((a, b) =>
    a.label.localeCompare(b.label, 'fr'),
  )
}, [soignants, thematics])
```

- [ ] **Step 4: Update the soignant display**

Find (around line 190):
```tsx
value={soignant?.name ?? 'Aucun soignant associé'}
```

Replace with:
```tsx
value={soignants.length > 0 ? soignants.map((s) => s.name).join(', ') : 'Aucun soignant associé'}
```

- [ ] **Step 5: Build**

Run:
```bash
cd front && npm run build 2>&1 | grep "addAppointmentForm" | head -20
```

Expected: no errors for this file.

- [ ] **Step 6: Commit**

```bash
git add front/src/components/custom/popup/addAppointmentForm.tsx
git commit -m "feat(addAppointmentForm): consume soignants array and union thematics"
```

---

## Task 14: Update `planning.patient.tsx`

**Files:**
- Modify: `front/src/components/custom/Patient/view/planning.patient.tsx`

- [ ] **Step 1: Rename the state hook**

Find:
```ts
const [selectedSlotSoignant, setSelectedSlotSoignant] = useState<Soignant | undefined>(undefined)
```

(approximate — match the exact `useState<Soignant | undefined>` form in the file)

Replace with:
```ts
const [selectedSlotSoignants, setSelectedSlotSoignants] = useState<Soignant[]>([])
```

- [ ] **Step 2: Update every `setSelectedSlotSoignant(slot.slotTemplate?.soignant ?? undefined)`**

There are 5 call sites at lines 189, 200, 215, 224, 229. For each, replace:
```ts
setSelectedSlotSoignant(slot.slotTemplate?.soignant ?? undefined)
```
or
```ts
setSelectedSlotSoignant(slot.slotTemplate.soignant ?? undefined)
```

with:
```ts
setSelectedSlotSoignants(slot.slotTemplate?.soignants ?? [])
```

- [ ] **Step 3: Update props passed to addAppointmentForm**

Find (lines 318 and 329):
```tsx
soignant={selectedSlotSoignant}
```

Replace with:
```tsx
soignants={selectedSlotSoignants}
```

- [ ] **Step 4: Update the calendar event title**

Find (line 71):
```ts
title: apt?.thematic || slot.slotTemplate?.thematic || 'Rendez-vous',
```

No change needed (thematic is unchanged), leave as is.

- [ ] **Step 5: Build**

Run:
```bash
cd front && npm run build 2>&1 | grep "planning.patient" | head -20
```

Expected: no errors for this file.

- [ ] **Step 6: Commit**

```bash
git add front/src/components/custom/Patient/view/planning.patient.tsx
git commit -m "feat(planning-patient): pass selectedSlotSoignants array down"
```

---

## Task 15: Update `overview.patient.tsx`

**Files:**
- Modify: `front/src/components/custom/Patient/view/overview.patient.tsx`

- [ ] **Step 1: Replace single soignant name with joined list**

Find (around line 37):
```ts
const soignant = slot.slotTemplate?.soignant?.name
```

Replace with:
```ts
const soignant = slot.slotTemplate?.soignants?.length
  ? slot.slotTemplate.soignants.map((s) => s.name).join(', ')
  : undefined
```

- [ ] **Step 2: The display fallback (line 56) stays correct**

```tsx
{soignant ?? thematic}
```

This already correctly displays the joined name list or falls back to the thematic. No change.

- [ ] **Step 3: Build**

Run:
```bash
cd front && npm run build 2>&1 | grep "overview.patient" | head -20
```

Expected: no errors for this file.

- [ ] **Step 4: Commit**

```bash
git add front/src/components/custom/Patient/view/overview.patient.tsx
git commit -m "feat(overview-patient): display joined soignant names"
```

---

## Task 16: Update calendar event builders (`libs/utils.ts`)

**Files:**
- Modify: `front/src/libs/utils.ts`

- [ ] **Step 1: Update `buildCalendarEventsFromSlots`**

Find (line 75):
```ts
title: slot.slotTemplate?.soignant?.name ?? 'Soignant inconnu',
```

Replace with:
```ts
title: slot.slotTemplate?.soignants?.length
  ? slot.slotTemplate.soignants.map((s) => s.name).join(', ')
  : 'Soignant inconnu',
```

- [ ] **Step 2: Update `buildCalendarEventsFromSlotTemplates`**

Find (line 112):
```ts
title: slotTemplate.soignant?.name ?? 'Soignant inconnu',
```

Replace with:
```ts
title: slotTemplate.soignants?.length
  ? slotTemplate.soignants.map((s) => s.name).join(', ')
  : 'Soignant inconnu',
```

- [ ] **Step 3: Build**

Run:
```bash
cd front && npm run build 2>&1 | grep "libs/utils" | head -20
```

Expected: no errors for this file.

- [ ] **Step 4: Commit**

```bash
git add front/src/libs/utils.ts
git commit -m "feat(calendar-utils): event titles join multiple soignant names"
```

---

## Task 17: Update dashboard filter logic

**Files:**
- Modify: `front/src/routes/_authenticated/dashboard.tsx`

- [ ] **Step 1: Rename the state hook**

Find (around line 49):
```ts
const [slotSoignant, setSlotSoignant] = useState<Soignant | undefined>(undefined)
```

Replace with:
```ts
const [slotSoignants, setSlotSoignants] = useState<Soignant[]>([])
```

- [ ] **Step 2: Update the filter predicate**

Find (around line 55):
```ts
? slots.filter((slot) => slot.slotTemplate?.soignant?.id === selectedID)
```

Replace with:
```ts
? slots.filter((slot) =>
    slot.slotTemplate?.soignants?.some((s) => s.id === selectedID),
  )
```

- [ ] **Step 3: Update the setSlotSoignant call**

Find (around line 94):
```ts
setSlotSoignant(slot?.slotTemplate?.soignant ?? undefined)
```

Replace with:
```ts
setSlotSoignants(slot?.slotTemplate?.soignants ?? [])
```

- [ ] **Step 4: Update the prop passed down (search for `soignant=`)**

Run:
```bash
grep -n "soignant=\|slotSoignant" /Users/couffinhal/Documents/MediSync/front/src/routes/_authenticated/dashboard.tsx
```

For each occurrence of `soignant={slotSoignant}`, replace with `soignants={slotSoignants}`.

- [ ] **Step 5: Build**

Run:
```bash
cd front && npm run build 2>&1 | grep "dashboard" | head -20
```

Expected: no errors for this file.

- [ ] **Step 6: Commit**

```bash
git add front/src/routes/_authenticated/dashboard.tsx
git commit -m "feat(dashboard): filter slots by any matching soignant"
```

---

## Task 18: Update `useSlot.ts` optimistic update

**Files:**
- Modify: `front/src/queries/useSlot.ts`

- [ ] **Step 1: Update the rollback shape**

Find (around line 160):
```ts
soignant: oldSlot.slotTemplate.soignant,
```

Replace with:
```ts
soignants: oldSlot.slotTemplate.soignants,
```

- [ ] **Step 2: Build**

Run:
```bash
cd front && npm run build
```

Expected: full frontend build passes.

- [ ] **Step 3: Lint**

Run:
```bash
cd front && npm run lint
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add front/src/queries/useSlot.ts
git commit -m "feat(useSlot): align optimistic update shape with soignants array"
```

---

## Task 19: Manual E2E verification

**Files:** none — verification only.

- [ ] **Step 1: Reset DB + reseed**

Run:
```bash
cd back && npm run prisma:migrate:reset
```

Expected: DB clean, seed completes.

- [ ] **Step 2: Start back + front dev servers**

In one shell:
```bash
cd back && npm run dev
```

In another:
```bash
cd front && npm run dev
```

- [ ] **Step 3: Run through the spec's test plan**

In the browser, exercise the 7 scenarios from `docs/superpowers/specs/2026-06-18-multi-soignant-slot-design.md` (section "Tests à valider manuellement") :

1. Create a slot with 0 soignant.
2. Create a slot with 1 soignant.
3. Create a slot with 3 soignants having overlapping thematics — verify the dropdown shows the deduplicated union.
4. Edit a slot to add/remove soignants — verify persistence with `psql` or Prisma Studio (`SELECT * FROM "_SlotTemplateSoignants" WHERE "A" = '<slotTemplateID>';`).
5. Patient planning view — multi-soignant slot shows joined name, appointment thematic dropdown lists the union.
6. Patient overview view — soignant names are joined by comma.
7. Calendar soignant filter — slot with multi-soignant shows up when filtering on any of its soignants.

- [ ] **Step 4: Fix any regressions discovered, commit per-fix**

For each fix, make a focused commit.

- [ ] **Step 5: Final sanity sweep — search for stale `soignant` references**

Run:
```bash
grep -rn "slotTemplate?\.soignant\b\|slotTemplate\.soignant\b\|slotTemplate\.soignantID\b\|\.soignant\?\.id\b\|soignantID:" \
  /Users/couffinhal/Documents/MediSync/back/src \
  /Users/couffinhal/Documents/MediSync/front/src \
  --include="*.ts" --include="*.tsx" | grep -v "_SoignantTo\|node_modules\|/generated/"
```

Expected: empty (or only matches in `back/src/generated/` which is auto-generated). If real call sites surface, fix them.

- [ ] **Step 6: Final commit (if needed)**

```bash
git status
# If clean, no commit. Otherwise:
git add -A
git commit -m "chore: fix remaining soignant references after multi-soignant migration"
```
