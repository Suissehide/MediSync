# Forbidden Weeks Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a global "forbidden weeks" system — admins can mark weeks on the planning calendar as forbidden; pathway instantiation automatically shifts the start date until no slot lands on a forbidden week.

**Architecture:** New `ForbiddenWeek` model (Prisma) with full CRUD backend route (admin-only). Shift logic injected into `POST /pathway/instantiate` before slot creation. Frontend: background events in FullCalendar with `dateClick`/`eventClick` for create/delete, wrapped in Popup confirmation dialogs.

**Tech Stack:** Prisma + PostgreSQL, Fastify + Zod, dayjs (already installed), React + TanStack Query, FullCalendar, existing Popup component pattern.

---

### Task 1: Add ForbiddenWeek to Prisma schema

**Files:**
- Modify: `back/prisma/schema.prisma`

**Step 1: Add the model**

Append to `back/prisma/schema.prisma` after the `ActivityLog` model:

```prisma
model ForbiddenWeek {
  id          String   @id @default(cuid())
  startOfWeek DateTime @unique
  createdAt   DateTime @default(now())
}
```

**Step 2: Run migration**

```bash
cd back && npx prisma migrate dev --name add-forbidden-week
```

Expected: Migration created and applied, `ForbiddenWeek` table created in DB.

**Step 3: Verify generated client**

```bash
cd back && npx prisma generate
```

Expected: No errors, `prisma.forbiddenWeek` available in generated client.

**Step 4: Commit**

```bash
git add back/prisma/schema.prisma back/prisma/migrations/
git commit -m "feat(db): add ForbiddenWeek model"
```

---

### Task 2: Repository interface type

**Files:**
- Create: `back/src/main/types/infra/orm/repositories/forbiddenWeek.repository.interface.ts`

**Step 1: Write the interface**

```typescript
export type ForbiddenWeekEntityRepo = {
  id: string
  startOfWeek: Date
  createdAt: Date
}

export type ForbiddenWeekCreateEntityRepo = {
  startOfWeek: Date
}

export interface ForbiddenWeekRepositoryInterface {
  findAll: () => Promise<ForbiddenWeekEntityRepo[]>
  create: (params: ForbiddenWeekCreateEntityRepo) => Promise<ForbiddenWeekEntityRepo>
  delete: (id: string) => Promise<ForbiddenWeekEntityRepo>
}
```

**Step 2: Commit**

```bash
git add back/src/main/types/infra/orm/repositories/forbiddenWeek.repository.interface.ts
git commit -m "feat(types): add ForbiddenWeekRepositoryInterface"
```

---

### Task 3: Domain interface type

**Files:**
- Create: `back/src/main/types/domain/forbiddenWeek.domain.interface.ts`

**Step 1: Write the interface**

```typescript
import type { ForbiddenWeekEntityRepo } from '../infra/orm/repositories/forbiddenWeek.repository.interface'

export type ForbiddenWeekEntityDomain = ForbiddenWeekEntityRepo

export interface ForbiddenWeekDomainInterface {
  findAll: () => Promise<ForbiddenWeekEntityDomain[]>
  create: (date: Date) => Promise<ForbiddenWeekEntityDomain>
  delete: (id: string) => Promise<ForbiddenWeekEntityDomain>
}
```

**Step 2: Commit**

```bash
git add back/src/main/types/domain/forbiddenWeek.domain.interface.ts
git commit -m "feat(types): add ForbiddenWeekDomainInterface"
```

---

### Task 4: Repository implementation

**Files:**
- Create: `back/src/main/infra/orm/repositories/forbiddenWeek.repository.ts`

**Step 1: Write the repository**

```typescript
import type { IocContainer } from '../../../types/application/ioc'
import type {
  ForbiddenWeekCreateEntityRepo,
  ForbiddenWeekEntityRepo,
  ForbiddenWeekRepositoryInterface,
} from '../../../types/infra/orm/repositories/forbiddenWeek.repository.interface'
import type { ErrorHandlerInterface } from '../../../types/utils/error-handler'
import type { PostgresPrismaClient } from '../postgres-client'

class ForbiddenWeekRepository implements ForbiddenWeekRepositoryInterface {
  private readonly prisma: PostgresPrismaClient
  private readonly errorHandler: ErrorHandlerInterface

  constructor({ postgresOrm, errorHandler }: IocContainer) {
    this.prisma = postgresOrm.prisma
    this.errorHandler = errorHandler
  }

  findAll(): Promise<ForbiddenWeekEntityRepo[]> {
    return this.prisma.forbiddenWeek.findMany({
      orderBy: { startOfWeek: 'asc' },
    })
  }

  async create(params: ForbiddenWeekCreateEntityRepo): Promise<ForbiddenWeekEntityRepo> {
    try {
      return await this.prisma.forbiddenWeek.create({ data: params })
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({
        entityName: 'ForbiddenWeek',
        error: err,
      })
    }
  }

  async delete(id: string): Promise<ForbiddenWeekEntityRepo> {
    try {
      return await this.prisma.forbiddenWeek.delete({ where: { id } })
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({
        entityName: 'ForbiddenWeek',
        error: err,
      })
    }
  }
}

export { ForbiddenWeekRepository }
```

**Step 2: Commit**

```bash
git add back/src/main/infra/orm/repositories/forbiddenWeek.repository.ts
git commit -m "feat(repo): add ForbiddenWeekRepository"
```

---

### Task 5: Domain implementation

**Files:**
- Create: `back/src/main/domain/forbiddenWeek.domain.ts`

**Step 1: Write the domain**

The domain normalizes the incoming date to the Monday of its ISO week (using dayjs arithmetic — no new plugin required).

```typescript
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'

import type { IocContainer } from '../types/application/ioc'
import type {
  ForbiddenWeekDomainInterface,
  ForbiddenWeekEntityDomain,
} from '../types/domain/forbiddenWeek.domain.interface'
import type { ForbiddenWeekRepositoryInterface } from '../types/infra/orm/repositories/forbiddenWeek.repository.interface'

dayjs.extend(utc)

/** Returns the Monday (00:00 UTC) of the week containing the given date. */
function toStartOfWeek(date: Date): Date {
  const d = dayjs.utc(date)
  const day = d.day() // 0=Sun, 1=Mon, ..., 6=Sat
  const daysToMonday = day === 0 ? -6 : 1 - day
  return d.add(daysToMonday, 'day').startOf('day').toDate()
}

class ForbiddenWeekDomain implements ForbiddenWeekDomainInterface {
  private readonly forbiddenWeekRepository: ForbiddenWeekRepositoryInterface

  constructor({ forbiddenWeekRepository }: IocContainer) {
    this.forbiddenWeekRepository = forbiddenWeekRepository
  }

  findAll(): Promise<ForbiddenWeekEntityDomain[]> {
    return this.forbiddenWeekRepository.findAll()
  }

  create(date: Date): Promise<ForbiddenWeekEntityDomain> {
    const startOfWeek = toStartOfWeek(date)
    return this.forbiddenWeekRepository.create({ startOfWeek })
  }

  delete(id: string): Promise<ForbiddenWeekEntityDomain> {
    return this.forbiddenWeekRepository.delete(id)
  }
}

export { ForbiddenWeekDomain, toStartOfWeek }
```

**Step 2: Commit**

```bash
git add back/src/main/domain/forbiddenWeek.domain.ts
git commit -m "feat(domain): add ForbiddenWeekDomain with toStartOfWeek normalization"
```

---

### Task 6: IoC registration

**Files:**
- Modify: `back/src/main/types/application/ioc.ts`
- Modify: `back/src/main/application/ioc/awilix/awilix-ioc-container.ts`

**Step 1: Add to IocContainer interface**

In `back/src/main/types/application/ioc.ts`, add the two imports and two interface fields:

Add imports (with the other domain/repo imports):
```typescript
import type { ForbiddenWeekDomainInterface } from '../domain/forbiddenWeek.domain.interface'
import type { ForbiddenWeekRepositoryInterface } from '../infra/orm/repositories/forbiddenWeek.repository.interface'
```

Add to `IocContainer` interface (e.g. after ActivityLog section):
```typescript
  // ForbiddenWeek
  readonly forbiddenWeekDomain: ForbiddenWeekDomainInterface
  readonly forbiddenWeekRepository: ForbiddenWeekRepositoryInterface
```

**Step 2: Register in Awilix container**

In `back/src/main/application/ioc/awilix/awilix-ioc-container.ts`, add imports:
```typescript
import { ForbiddenWeekDomain } from '../../../domain/forbiddenWeek.domain'
import { ForbiddenWeekRepository } from '../../../infra/orm/repositories/forbiddenWeek.repository'
```

In the constructor, add after the ActivityLog block:
```typescript
    // ForbiddenWeek
    this.#registerForbiddenWeekDomain()
    this.#registerForbiddenWeekRepository()
```

Add the private methods before the closing brace of the class:
```typescript
  // ForbiddenWeek
  #registerForbiddenWeekDomain(): void {
    this.register('forbiddenWeekDomain', asClass(ForbiddenWeekDomain).singleton())
  }
  #registerForbiddenWeekRepository(): void {
    this.register('forbiddenWeekRepository', asClass(ForbiddenWeekRepository).singleton())
  }
```

**Step 3: Verify TypeScript**

```bash
cd back && npx tsc --noEmit
```

Expected: No errors.

**Step 4: Commit**

```bash
git add back/src/main/types/application/ioc.ts back/src/main/application/ioc/awilix/awilix-ioc-container.ts
git commit -m "feat(ioc): register ForbiddenWeekDomain and ForbiddenWeekRepository"
```

---

### Task 7: Zod schemas

**Files:**
- Create: `back/src/main/interfaces/http/fastify/schemas/forbiddenWeek.schema.ts`

**Step 1: Write the schemas**

```typescript
import { z } from 'zod/v4'

export const forbiddenWeekResponseSchema = z.object({
  id: z.string(),
  startOfWeek: z.coerce.date(),
  createdAt: z.coerce.date(),
})

export const forbiddenWeeksResponseSchema = z.array(forbiddenWeekResponseSchema)

export const createForbiddenWeekBodySchema = z.object({
  date: z.coerce.date(),
})

export const deleteForbiddenWeekParamsSchema = z.object({
  id: z.string(),
})

export type ForbiddenWeekResponse = z.infer<typeof forbiddenWeekResponseSchema>
export type CreateForbiddenWeekBody = z.infer<typeof createForbiddenWeekBodySchema>
export type DeleteForbiddenWeekParams = z.infer<typeof deleteForbiddenWeekParamsSchema>
```

**Step 2: Commit**

```bash
git add back/src/main/interfaces/http/fastify/schemas/forbiddenWeek.schema.ts
git commit -m "feat(schema): add ForbiddenWeek Zod schemas"
```

---

### Task 8: HTTP route

**Files:**
- Create: `back/src/main/interfaces/http/fastify/routes/forbiddenWeek.ts`
- Modify: `back/src/main/interfaces/http/fastify/routes/index.ts`

**Step 1: Write the route**

```typescript
import Boom from '@hapi/boom'
import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod/v4'

import { Role } from '../../../../../generated/enums'
import {
  type CreateForbiddenWeekBody,
  createForbiddenWeekBodySchema,
  type DeleteForbiddenWeekParams,
  deleteForbiddenWeekParamsSchema,
  forbiddenWeekResponseSchema,
  forbiddenWeeksResponseSchema,
} from '../schemas/forbiddenWeek.schema'

const forbiddenWeekRouter: FastifyPluginAsync = (fastify) => {
  const { forbiddenWeekDomain, userDomain } = fastify.iocContainer

  // Get all
  fastify.get(
    '/',
    {
      schema: { response: { 200: forbiddenWeeksResponseSchema } },
      onRequest: [fastify.verifySessionCookie],
    },
    () => forbiddenWeekDomain.findAll(),
  )

  // Create (admin only)
  fastify.post<{ Body: CreateForbiddenWeekBody }>(
    '/',
    {
      schema: {
        body: createForbiddenWeekBodySchema,
        response: {
          201: forbiddenWeekResponseSchema,
          403: z.object({ message: z.string() }),
        },
      },
      onRequest: [fastify.verifySessionCookie],
    },
    async (request, reply) => {
      const currentUser = await userDomain.findByID(request.user.userID)
      if (currentUser?.role !== Role.ADMIN) throw Boom.forbidden('Forbidden')
      const forbiddenWeek = await forbiddenWeekDomain.create(request.body.date)
      reply.code(201)
      return forbiddenWeek
    },
  )

  // Delete (admin only)
  fastify.delete<{ Params: DeleteForbiddenWeekParams }>(
    '/:id',
    {
      schema: {
        params: deleteForbiddenWeekParamsSchema,
        response: {
          204: z.null(),
          403: z.object({ message: z.string() }),
          404: z.object({ message: z.string() }),
        },
      },
      onRequest: [fastify.verifySessionCookie],
    },
    async (request, reply) => {
      const currentUser = await userDomain.findByID(request.user.userID)
      if (currentUser?.role !== Role.ADMIN) throw Boom.forbidden('Forbidden')
      await forbiddenWeekDomain.delete(request.params.id)
      reply.code(204).send()
    },
  )

  return Promise.resolve()
}

export { forbiddenWeekRouter }
```

**Step 2: Register the route in index.ts**

In `back/src/main/interfaces/http/fastify/routes/index.ts`, add:

Import:
```typescript
import { forbiddenWeekRouter } from './forbiddenWeek'
```

Registration (after activityLogRouter):
```typescript
  await fastify.register(forbiddenWeekRouter, { prefix: '/forbidden-week' })
```

**Step 3: Verify TypeScript**

```bash
cd back && npx tsc --noEmit
```

Expected: No errors.

**Step 4: Test manually**

```bash
# Start backend
cd back && npm run dev

# In another terminal — get all (empty list)
curl -s http://localhost:3000/forbidden-week \
  -H "Cookie: <your-session-cookie>" | jq .
# Expected: []

# Create a forbidden week
curl -s -X POST http://localhost:3000/forbidden-week \
  -H "Content-Type: application/json" \
  -H "Cookie: <your-admin-session-cookie>" \
  -d '{"date":"2026-03-11"}' | jq .
# Expected: { id: "...", startOfWeek: "2026-03-09T00:00:00.000Z", createdAt: "..." }
# Note: 2026-03-11 is Wednesday → normalized to Monday 2026-03-09

# Delete it (use the id from above)
curl -s -X DELETE http://localhost:3000/forbidden-week/<id> \
  -H "Cookie: <your-admin-session-cookie>"
# Expected: 204 No Content
```

**Step 5: Commit**

```bash
git add back/src/main/interfaces/http/fastify/routes/forbiddenWeek.ts back/src/main/interfaces/http/fastify/routes/index.ts
git commit -m "feat(route): add /forbidden-week CRUD endpoints"
```

---

### Task 9: Shift logic in pathway instantiation

**Files:**
- Modify: `back/src/main/interfaces/http/fastify/routes/pathway.ts`

**Step 1: Add the forbidden week check**

The `POST /pathway/instantiate` handler currently starts at line 167 in `pathway.ts`. The IoC container destructuring at line 30 must include `forbiddenWeekDomain`.

**Step 1a: Add `forbiddenWeekDomain` to the destructured container**

Find this block (lines 27-33):
```typescript
  const {
    pathwayDomain,
    pathwayTemplateDomain,
    slotDomain,
    slotTemplateDomain,
    logger,
  } = iocContainer
```

Replace with:
```typescript
  const {
    pathwayDomain,
    pathwayTemplateDomain,
    slotDomain,
    slotTemplateDomain,
    forbiddenWeekDomain,
    logger,
  } = iocContainer
```

**Step 1b: Replace the instantiate handler body**

Find the handler body (the `async (request) => { ... }` block of the `/instantiate` route starting at line 167). Replace the entire async function body with:

```typescript
    async (request) => {
      const { pathwayTemplateID, startDate } = request.body
      const pathwayTemplate =
        await pathwayTemplateDomain.findByID(pathwayTemplateID)
      if (!pathwayTemplate) {
        throw Boom.notFound('PathwayTemplate not found')
      }

      // Shift startDate forward by weeks until no slot lands on a forbidden week
      const forbiddenWeeks = await forbiddenWeekDomain.findAll()
      let adjustedStart = dayjs(startDate)

      if (forbiddenWeeks.length > 0) {
        const isInForbiddenWeek = (date: dayjs.Dayjs): boolean => {
          return forbiddenWeeks.some((fw) => {
            const weekStart = dayjs(fw.startOfWeek)
            const weekEnd = weekStart.add(7, 'day')
            return (
              (date.isSame(weekStart) || date.isAfter(weekStart)) &&
              date.isBefore(weekEnd)
            )
          })
        }

        const candidateDates = pathwayTemplate.slotTemplates.map((st) =>
          adjustedStart.add(st.offsetDays ?? 0, 'day'),
        )

        while (candidateDates.some((d) => isInForbiddenWeek(d))) {
          adjustedStart = adjustedStart.add(7, 'day')
          candidateDates.forEach((_, i) => {
            candidateDates[i] = adjustedStart.add(
              pathwayTemplate.slotTemplates[i].offsetDays ?? 0,
              'day',
            )
          })
        }
      }

      const effectiveStartDate = adjustedStart.toISOString()

      const slotIDs: string[] = []
      for (const slotTemplate of pathwayTemplate.slotTemplates) {
        const { soignant, id: _id, ...rest } = slotTemplate
        const clonedSlotTemplate = await slotTemplateDomain.create({
          ...rest,
          soignantID: soignant?.id ?? undefined,
          templateID: undefined,
        })

        const offset = clonedSlotTemplate.offsetDays ?? 0
        const base = dayjs(effectiveStartDate).add(offset, 'day').toISOString()

        const start = combineDateAndTime(base, clonedSlotTemplate.startTime)
        const end = combineDateAndTime(base, clonedSlotTemplate.endTime)

        const slot = await slotDomain.create({
          startDate: start,
          endDate: end,
          slotTemplateID: clonedSlotTemplate.id,
        })
        slotIDs.push(slot.id)
      }

      return await pathwayDomain.create({
        startDate: effectiveStartDate,
        templateID: pathwayTemplate.id,
        slotIDs,
      })
    },
```

**Step 2: Verify TypeScript**

```bash
cd back && npx tsc --noEmit
```

Expected: No errors.

**Step 3: Test manually**

1. Create a forbidden week for next Monday (e.g. 2026-03-16)
2. Create a pathway template with a slot at offsetDays=0 (which would land on that Monday)
3. Instantiate the template with startDate = 2026-03-16
4. Verify the resulting pathway's startDate is 2026-03-23 (shifted by 1 week)

**Step 4: Commit**

```bash
git add back/src/main/interfaces/http/fastify/routes/pathway.ts
git commit -m "feat(pathway): auto-shift instantiation startDate past forbidden weeks"
```

---

### Task 10: Frontend types, API client, process constants

**Files:**
- Create: `front/src/types/forbiddenWeek.ts`
- Create: `front/src/api/forbiddenWeek.api.ts`
- Modify: `front/src/constants/process.constant.ts`

**Step 1: Create type**

```typescript
// front/src/types/forbiddenWeek.ts
export type ForbiddenWeek = {
  id: string
  startOfWeek: string
  createdAt: string
}
```

**Step 2: Create API client**

```typescript
// front/src/api/forbiddenWeek.api.ts
import { apiUrl } from '../constants/config.constant.ts'
import { handleHttpError } from '../libs/httpErrorHandler.ts'
import type { ForbiddenWeek } from '../types/forbiddenWeek.ts'
import { fetchWithAuth } from './fetchWithAuth.ts'

export const ForbiddenWeekApi = {
  getAll: async (): Promise<ForbiddenWeek[]> => {
    const response = await fetchWithAuth(`${apiUrl}/forbidden-week`, {
      method: 'GET',
    })
    if (!response.ok) {
      handleHttpError(response, {}, 'Impossible de récupérer les semaines interdites')
    }
    return response.json()
  },

  create: async (date: string): Promise<ForbiddenWeek> => {
    const response = await fetchWithAuth(`${apiUrl}/forbidden-week`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date }),
    })
    if (!response.ok) {
      handleHttpError(response, {}, 'Impossible de créer la semaine interdite')
    }
    return response.json()
  },

  delete: async (id: string): Promise<void> => {
    const response = await fetchWithAuth(`${apiUrl}/forbidden-week/${id}`, {
      method: 'DELETE',
    })
    if (!response.ok) {
      handleHttpError(response, {}, 'Impossible de supprimer la semaine interdite')
    }
  },
}
```

**Step 3: Add process constants**

Append to `front/src/constants/process.constant.ts`:
```typescript
export const FORBIDDEN_WEEK = {
  GET_ALL: 'get_all_forbidden_weeks',
  CREATE: 'create_forbidden_week',
  DELETE: 'delete_forbidden_week',
}
```

**Step 4: Commit**

```bash
git add front/src/types/forbiddenWeek.ts front/src/api/forbiddenWeek.api.ts front/src/constants/process.constant.ts
git commit -m "feat(frontend): add ForbiddenWeek type, API client, process constants"
```

---

### Task 11: Query hook

**Files:**
- Create: `front/src/queries/useForbiddenWeek.ts`

**Step 1: Write the hook**

```typescript
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { ForbiddenWeekApi } from '../api/forbiddenWeek.api.ts'
import { FORBIDDEN_WEEK } from '../constants/process.constant.ts'
import { TOAST_SEVERITY } from '../constants/ui.constant.ts'
import { useDataFetching } from '../hooks/useDataFetching.ts'
import { useToast } from '../hooks/useToast.ts'

export const useForbiddenWeekQueries = () => {
  const { data: forbiddenWeeks, isPending, isError, error } = useQuery({
    queryKey: [FORBIDDEN_WEEK.GET_ALL],
    queryFn: ForbiddenWeekApi.getAll,
    retry: 0,
  })

  useDataFetching({ isPending, isError, error })

  return { forbiddenWeeks, isPending }
}

export const useForbiddenWeekMutations = () => {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  const createForbiddenWeek = useMutation({
    mutationKey: [FORBIDDEN_WEEK.CREATE],
    mutationFn: (date: string) => ForbiddenWeekApi.create(date),
    onSuccess: () => {
      toast({ title: 'Semaine interdite ajoutée', severity: TOAST_SEVERITY.SUCCESS })
    },
    onError: (error) => {
      toast({
        title: "Erreur lors de l'ajout de la semaine interdite",
        message: error.message,
        severity: TOAST_SEVERITY.ERROR,
      })
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: [FORBIDDEN_WEEK.GET_ALL] })
    },
  })

  const deleteForbiddenWeek = useMutation({
    mutationKey: [FORBIDDEN_WEEK.DELETE],
    mutationFn: (id: string) => ForbiddenWeekApi.delete(id),
    onSuccess: () => {
      toast({ title: 'Semaine interdite supprimée', severity: TOAST_SEVERITY.SUCCESS })
    },
    onError: (error) => {
      toast({
        title: 'Erreur lors de la suppression de la semaine interdite',
        message: error.message,
        severity: TOAST_SEVERITY.ERROR,
      })
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: [FORBIDDEN_WEEK.GET_ALL] })
    },
  })

  return { createForbiddenWeek, deleteForbiddenWeek }
}
```

**Step 2: Commit**

```bash
git add front/src/queries/useForbiddenWeek.ts
git commit -m "feat(queries): add useForbiddenWeek query and mutation hooks"
```

---

### Task 12: Update Calendar component

Add forbidden week background events and interaction callbacks to the `Calendar` component.

**Files:**
- Modify: `front/src/components/custom/Calendar/calendar.tsx`

**Step 1: Add new props to CalendarProps interface**

Add to the `CalendarProps` interface (after `initialDate?`):
```typescript
  forbiddenWeeks?: { id: string; startOfWeek: string }[]
  onForbiddenWeekCreate?: (date: string) => void
  onForbiddenWeekDelete?: (id: string) => void
```

**Step 2: Add new params to the Calendar function signature**

Add to destructured props (after `initialDate`):
```typescript
  forbiddenWeeks = [],
  onForbiddenWeekCreate,
  onForbiddenWeekDelete,
```

**Step 3: Add `forbiddenWeekEvents` memo**

Add after the `showDayEmptyState` useMemo:
```typescript
  const forbiddenWeekEvents = useMemo(() => {
    return forbiddenWeeks.map((fw) => ({
      id: `forbidden_${fw.id}`,
      start: fw.startOfWeek,
      end: dayjs(fw.startOfWeek).add(7, 'day').toISOString(),
      display: 'background' as const,
      backgroundColor: 'rgba(239, 68, 68, 0.12)',
      borderColor: 'transparent',
    }))
  }, [forbiddenWeeks])
```

**Step 4: Pass `forbiddenWeekEvents` to FullCalendar `events` prop**

Find the line `events={events}` in the FullCalendar component and replace with:
```typescript
        events={[...events, ...forbiddenWeekEvents]}
```

**Step 5: Add `dateClick` and `eventClick` to FullCalendar**

Add these props to the FullCalendar component (after `select={handleSelect}`):

```typescript
        dateClick={(info) => {
          if (!onForbiddenWeekCreate) return
          const clickedDate = dayjs(info.date)
          const alreadyForbidden = forbiddenWeeks.some((fw) => {
            const start = dayjs(fw.startOfWeek)
            return (
              (clickedDate.isSame(start) || clickedDate.isAfter(start)) &&
              clickedDate.isBefore(start.add(7, 'day'))
            )
          })
          if (!alreadyForbidden) {
            onForbiddenWeekCreate(info.dateStr)
          }
        }}
        eventClick={(info) => {
          if (info.event.display === 'background' && onForbiddenWeekDelete) {
            const id = info.event.id.replace('forbidden_', '')
            onForbiddenWeekDelete(id)
          }
        }}
```

**Step 6: Verify TypeScript**

```bash
cd front && npx tsc --noEmit
```

Expected: No errors.

**Step 7: Commit**

```bash
git add front/src/components/custom/Calendar/calendar.tsx
git commit -m "feat(calendar): add forbiddenWeeks background events and interaction callbacks"
```

---

### Task 13: Popup confirmation components

**Files:**
- Create: `front/src/components/custom/popup/createForbiddenWeekForm.tsx`
- Create: `front/src/components/custom/popup/deleteForbiddenWeekForm.tsx`

**Step 1: Create the "create" confirmation popup**

```tsx
// front/src/components/custom/popup/createForbiddenWeekForm.tsx
import { CalendarX, X } from 'lucide-react'
import dayjs from 'dayjs'
import 'dayjs/locale/fr'

import { Button } from '../../ui/button.tsx'
import {
  Popup,
  PopupBody,
  PopupContent,
  PopupFooter,
  PopupHeader,
  PopupTitle,
} from '../../ui/popup.tsx'

interface CreateForbiddenWeekFormProps {
  open: boolean
  setOpen: (open: boolean) => void
  date: string | null
  onConfirm: (date: string) => void
  loading?: boolean
}

export function CreateForbiddenWeekForm({
  open,
  setOpen,
  date,
  onConfirm,
  loading = false,
}: CreateForbiddenWeekFormProps) {
  const weekLabel = date
    ? dayjs(date).locale('fr').startOf('isoWeek').format('DD MMMM YYYY')
    : ''

  return (
    <Popup modal open={open} onOpenChange={setOpen}>
      <PopupContent>
        <PopupHeader>
          <PopupTitle className="font-bold text-xl">Semaine interdite</PopupTitle>
        </PopupHeader>

        <PopupBody>
          <p className="text-sm text-text-light">
            Marquer la semaine du <span className="font-medium text-text">{weekLabel}</span> comme interdite ?
            Aucun slot ne pourra être planifié sur cette semaine.
          </p>
        </PopupBody>

        <PopupFooter>
          <Button
            variant="outline"
            onClick={() => date && onConfirm(date)}
            disabled={loading}
          >
            <CalendarX className="w-4 h-4" />
            {loading ? 'En cours...' : 'Confirmer'}
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

**Step 2: Create the "delete" confirmation popup**

```tsx
// front/src/components/custom/popup/deleteForbiddenWeekForm.tsx
import { Trash, X } from 'lucide-react'
import dayjs from 'dayjs'
import 'dayjs/locale/fr'

import { Button } from '../../ui/button.tsx'
import {
  Popup,
  PopupBody,
  PopupContent,
  PopupFooter,
  PopupHeader,
  PopupTitle,
} from '../../ui/popup.tsx'

interface DeleteForbiddenWeekFormProps {
  open: boolean
  setOpen: (open: boolean) => void
  startOfWeek: string | null
  onConfirm: () => void
  loading?: boolean
}

export function DeleteForbiddenWeekForm({
  open,
  setOpen,
  startOfWeek,
  onConfirm,
  loading = false,
}: DeleteForbiddenWeekFormProps) {
  const weekLabel = startOfWeek
    ? dayjs(startOfWeek).locale('fr').format('DD MMMM YYYY')
    : ''

  return (
    <Popup modal open={open} onOpenChange={setOpen}>
      <PopupContent>
        <PopupHeader>
          <PopupTitle className="font-bold text-xl">Retirer l'interdiction</PopupTitle>
        </PopupHeader>

        <PopupBody>
          <p className="text-sm text-text-light">
            Retirer l'interdiction de la semaine du{' '}
            <span className="font-medium text-text">{weekLabel}</span> ?
          </p>
        </PopupBody>

        <PopupFooter>
          <Button variant="outline" onClick={onConfirm} disabled={loading}>
            <Trash className="w-4 h-4 text-destructive" />
            {loading ? 'En cours...' : 'Retirer'}
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

**Step 3: Commit**

```bash
git add front/src/components/custom/popup/createForbiddenWeekForm.tsx front/src/components/custom/popup/deleteForbiddenWeekForm.tsx
git commit -m "feat(popup): add CreateForbiddenWeekForm and DeleteForbiddenWeekForm"
```

---

### Task 14: Wire everything in the Planning page

**Files:**
- Modify: `front/src/routes/_authenticated/_admin/settings/planning.tsx`

**Step 1: Add imports**

Add these imports to `planning.tsx`:
```typescript
import { CreateForbiddenWeekForm } from '../../../../components/custom/popup/createForbiddenWeekForm.tsx'
import { DeleteForbiddenWeekForm } from '../../../../components/custom/popup/deleteForbiddenWeekForm.tsx'
import {
  useForbiddenWeekMutations,
  useForbiddenWeekQueries,
} from '../../../../queries/useForbiddenWeek.ts'
```

**Step 2: Add state and hooks in the `Planning` function**

After the existing hook calls (e.g. after `useSlotTemplateMutations` line), add:
```typescript
  const { forbiddenWeeks } = useForbiddenWeekQueries()
  const { createForbiddenWeek, deleteForbiddenWeek } = useForbiddenWeekMutations()

  const [createForbiddenWeekDate, setCreateForbiddenWeekDate] = useState<string | null>(null)
  const [deleteForbiddenWeekTarget, setDeleteForbiddenWeekTarget] = useState<{
    id: string
    startOfWeek: string
  } | null>(null)
```

**Step 3: Add handlers**

After the existing handlers (e.g. after `handleDeleteEvent`), add:
```typescript
  const handleForbiddenWeekCreate = (date: string) => {
    setCreateForbiddenWeekDate(date)
  }

  const handleForbiddenWeekDelete = (id: string) => {
    const week = forbiddenWeeks?.find((fw) => fw.id === id)
    if (week) {
      setDeleteForbiddenWeekTarget({ id: week.id, startOfWeek: week.startOfWeek })
    }
  }
```

**Step 4: Pass props to the Calendar component**

Find the `<Calendar` JSX block and add the three new props:
```tsx
                forbiddenWeeks={forbiddenWeeks ?? []}
                onForbiddenWeekCreate={handleForbiddenWeekCreate}
                onForbiddenWeekDelete={handleForbiddenWeekDelete}
```

**Step 5: Add the two popups at the bottom of the JSX return**

Before the closing `</DashboardLayout>` tag, add:
```tsx
        <CreateForbiddenWeekForm
          open={!!createForbiddenWeekDate}
          setOpen={(open) => { if (!open) setCreateForbiddenWeekDate(null) }}
          date={createForbiddenWeekDate}
          onConfirm={(date) => {
            createForbiddenWeek.mutate(date, {
              onSuccess: () => setCreateForbiddenWeekDate(null),
            })
          }}
          loading={createForbiddenWeek.isPending}
        />

        <DeleteForbiddenWeekForm
          open={!!deleteForbiddenWeekTarget}
          setOpen={(open) => { if (!open) setDeleteForbiddenWeekTarget(null) }}
          startOfWeek={deleteForbiddenWeekTarget?.startOfWeek ?? null}
          onConfirm={() => {
            if (deleteForbiddenWeekTarget) {
              deleteForbiddenWeek.mutate(deleteForbiddenWeekTarget.id, {
                onSuccess: () => setDeleteForbiddenWeekTarget(null),
              })
            }
          }}
          loading={deleteForbiddenWeek.isPending}
        />
```

**Step 6: Verify TypeScript**

```bash
cd front && npx tsc --noEmit
```

Expected: No errors.

**Step 7: Test end-to-end**

1. Open the Planning page as an admin
2. Click on any empty day in a week → confirm popup appears with the correct Monday date → confirm → week turns red/shaded
3. Click on the shaded background of a forbidden week → delete confirm popup → confirm → shading disappears
4. Drag a pathway template onto a week adjacent to the forbidden week → verify the instanciated pathway lands on the correct (shifted) week by checking the slot dates
5. Create two consecutive forbidden weeks → verify a pathway starting there gets shifted past both

**Step 8: Final commit**

```bash
git add front/src/routes/_authenticated/_admin/settings/planning.tsx
git commit -m "feat(planning): integrate forbidden weeks UI — create/delete from calendar"
```
