# Activity Log Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement a full activity log system that records business events (patient/diagnostic/appointment mutations) per user, queryable and filterable by admins.

**Architecture:** Internal EventEmitter bus (`AppEventBus`) emitted by domain methods after mutations. `ActivityLogSubscriber` wires up at startup, handles all events, and persists denormalized logs (including user first/last name fetched at write time). Admin-only REST endpoints expose filtered/paginated results.

**Tech Stack:** Node.js `EventEmitter`, Prisma/PostgreSQL, Fastify/Zod, Awilix IoC, TanStack Query, React

---

## Task 1: Prisma schema — add ActivityLog model

**Files:**
- Modify: `back/prisma/schema.prisma`

**Step 1: Add model**

In `schema.prisma`, append after the last model:

```prisma
model ActivityLog {
  id            String   @id @default(cuid())
  userID        String
  userFirstName String?
  userLastName  String?
  action        String
  entityType    String
  entityId      String
  createdAt     DateTime @default(now())

  @@index([userID])
  @@index([action])
  @@index([createdAt])
}
```

**Step 2: Run migration**

```bash
cd back && bunx prisma migrate dev --name add_activity_log
```

Expected: migration files created under `prisma/migrations/`, Prisma client regenerated.

**Step 3: Verify TS**

```bash
cd back && bun run typecheck
```

Expected: no new errors.

**Step 4: Commit**

```bash
git add back/prisma/ back/src/generated/
git commit -m "feat(db): add ActivityLog model"
```

---

## Task 2: AppEventBus utility

**Files:**
- Create: `back/src/main/utils/app-event-bus.ts`

**Step 1: Write file**

```ts
import { EventEmitter } from 'node:events'

type AppEvents = {
  'patient.created':    { userID: string; patientId: string }
  'patient.updated':    { userID: string; patientId: string }
  'patient.deleted':    { userID: string; patientId: string }
  'patient.enrolled':   { userID: string; patientId: string }
  'diagnostic.created': { userID: string; diagnosticId: string }
  'diagnostic.updated': { userID: string; diagnosticId: string }
  'appointment.created': { userID: string; appointmentId: string }
  'appointment.updated': { userID: string; appointmentId: string }
}

class AppEventBus {
  private emitter = new EventEmitter()

  emit<K extends keyof AppEvents>(event: K, payload: AppEvents[K]): void {
    this.emitter.emit(event, payload)
  }

  on<K extends keyof AppEvents>(
    event: K,
    handler: (payload: AppEvents[K]) => void,
  ): void {
    this.emitter.on(event, handler)
  }
}

export { AppEventBus }
export type { AppEvents }
```

**Step 2: Verify TS**

```bash
cd back && bun run typecheck
```

**Step 3: Commit**

```bash
git add back/src/main/utils/app-event-bus.ts
git commit -m "feat(event-bus): add AppEventBus utility"
```

---

## Task 3: ActivityLog repository interface + implementation

**Files:**
- Create: `back/src/main/types/infra/orm/repositories/activityLog.repository.interface.ts`
- Create: `back/src/main/infra/orm/repositories/activityLog.repository.ts`

**Step 1: Write interface**

`back/src/main/types/infra/orm/repositories/activityLog.repository.interface.ts`:

```ts
export type ActivityLogEntityRepo = {
  id: string
  userID: string
  userFirstName: string | null
  userLastName: string | null
  action: string
  entityType: string
  entityId: string
  createdAt: Date
}

export type ActivityLogCreateEntityRepo = Omit<ActivityLogEntityRepo, 'id' | 'createdAt'>

export type ActivityLogFindManyParams = {
  page: number
  action?: string
  userID?: string
  from?: Date
}

export type ActivityLogFindManyResult = {
  data: ActivityLogEntityRepo[]
  total: number
  page: number
}

export interface ActivityLogRepositoryInterface {
  create: (params: ActivityLogCreateEntityRepo) => Promise<void>
  findMany: (params: ActivityLogFindManyParams) => Promise<ActivityLogFindManyResult>
  deleteOlderThan: (date: Date) => Promise<number>
}
```

**Step 2: Write implementation**

`back/src/main/infra/orm/repositories/activityLog.repository.ts`:

```ts
import type { IocContainer } from '../../../types/application/ioc'
import type {
  ActivityLogCreateEntityRepo,
  ActivityLogFindManyParams,
  ActivityLogFindManyResult,
  ActivityLogRepositoryInterface,
} from '../../../types/infra/orm/repositories/activityLog.repository.interface'
import type { PostgresPrismaClient } from '../postgres-client'

const PAGE_SIZE = 50

class ActivityLogRepository implements ActivityLogRepositoryInterface {
  private readonly prisma: PostgresPrismaClient

  constructor({ postgresOrm }: IocContainer) {
    this.prisma = postgresOrm.prisma
  }

  async create(params: ActivityLogCreateEntityRepo): Promise<void> {
    await this.prisma.activityLog.create({ data: params })
  }

  async findMany({
    page,
    action,
    userID,
    from,
  }: ActivityLogFindManyParams): Promise<ActivityLogFindManyResult> {
    const where = {
      ...(action ? { action } : {}),
      ...(userID ? { userID } : {}),
      ...(from ? { createdAt: { gte: from } } : {}),
    }
    const [data, total] = await Promise.all([
      this.prisma.activityLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
      }),
      this.prisma.activityLog.count({ where }),
    ])
    return { data, total, page }
  }

  async deleteOlderThan(date: Date): Promise<number> {
    const result = await this.prisma.activityLog.deleteMany({
      where: { createdAt: { lt: date } },
    })
    return result.count
  }
}

export { ActivityLogRepository }
```

**Step 3: Verify TS**

```bash
cd back && bun run typecheck
```

**Step 4: Commit**

```bash
git add back/src/main/types/infra/orm/repositories/activityLog.repository.interface.ts \
        back/src/main/infra/orm/repositories/activityLog.repository.ts
git commit -m "feat(activity-log): add repository interface and implementation"
```

---

## Task 4: ActivityLog domain interface + implementation

**Files:**
- Create: `back/src/main/types/domain/activityLog.domain.interface.ts`
- Create: `back/src/main/domain/activityLog.domain.ts`

**Step 1: Write domain interface**

`back/src/main/types/domain/activityLog.domain.interface.ts`:

```ts
import type {
  ActivityLogEntityRepo,
  ActivityLogFindManyParams,
  ActivityLogFindManyResult,
} from '../infra/orm/repositories/activityLog.repository.interface'

export type ActivityLogEntity = ActivityLogEntityRepo

export interface ActivityLogDomainInterface {
  findMany: (params: ActivityLogFindManyParams) => Promise<ActivityLogFindManyResult>
  cleanup: () => Promise<{ deleted: number }>
}
```

**Step 2: Write domain implementation**

`back/src/main/domain/activityLog.domain.ts`:

```ts
import type { IocContainer } from '../types/application/ioc'
import type { ActivityLogDomainInterface } from '../types/domain/activityLog.domain.interface'
import type {
  ActivityLogFindManyParams,
  ActivityLogFindManyResult,
  ActivityLogRepositoryInterface,
} from '../types/infra/orm/repositories/activityLog.repository.interface'

class ActivityLogDomain implements ActivityLogDomainInterface {
  private readonly activityLogRepository: ActivityLogRepositoryInterface

  constructor({ activityLogRepository }: IocContainer) {
    this.activityLogRepository = activityLogRepository
  }

  findMany(params: ActivityLogFindManyParams): Promise<ActivityLogFindManyResult> {
    return this.activityLogRepository.findMany(params)
  }

  async cleanup(): Promise<{ deleted: number }> {
    const twelveMonthsAgo = new Date()
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12)
    const deleted = await this.activityLogRepository.deleteOlderThan(twelveMonthsAgo)
    return { deleted }
  }
}

export { ActivityLogDomain }
```

**Step 3: Verify TS**

```bash
cd back && bun run typecheck
```

**Step 4: Commit**

```bash
git add back/src/main/types/domain/activityLog.domain.interface.ts \
        back/src/main/domain/activityLog.domain.ts
git commit -m "feat(activity-log): add domain interface and implementation"
```

---

## Task 5: ActivityLogSubscriber

**Files:**
- Create: `back/src/main/services/activity-log.subscriber.ts`

**Step 1: Write subscriber**

```ts
import type { IocContainer } from '../types/application/ioc'
import type { ActivityLogRepositoryInterface } from '../types/infra/orm/repositories/activityLog.repository.interface'
import type { UserRepositoryInterface } from '../types/infra/orm/repositories/user.repository.interface'
import type { AppEventBus } from '../utils/app-event-bus'
import type { Logger } from '../types/utils/logger'

class ActivityLogSubscriber {
  private readonly appEventBus: AppEventBus
  private readonly activityLogRepository: ActivityLogRepositoryInterface
  private readonly userRepository: UserRepositoryInterface
  private readonly logger: Logger

  constructor({
    appEventBus,
    activityLogRepository,
    userRepository,
    logger,
  }: IocContainer) {
    this.appEventBus = appEventBus
    this.activityLogRepository = activityLogRepository
    this.userRepository = userRepository
    this.logger = logger
    this.#subscribe()
  }

  #subscribe(): void {
    this.appEventBus.on('patient.created', (p) =>
      this.#log('patient.created', 'patient', p.userID, p.patientId))
    this.appEventBus.on('patient.updated', (p) =>
      this.#log('patient.updated', 'patient', p.userID, p.patientId))
    this.appEventBus.on('patient.deleted', (p) =>
      this.#log('patient.deleted', 'patient', p.userID, p.patientId))
    this.appEventBus.on('patient.enrolled', (p) =>
      this.#log('patient.enrolled', 'patient', p.userID, p.patientId))
    this.appEventBus.on('diagnostic.created', (p) =>
      this.#log('diagnostic.created', 'diagnostic', p.userID, p.diagnosticId))
    this.appEventBus.on('diagnostic.updated', (p) =>
      this.#log('diagnostic.updated', 'diagnostic', p.userID, p.diagnosticId))
    this.appEventBus.on('appointment.created', (p) =>
      this.#log('appointment.created', 'appointment', p.userID, p.appointmentId))
    this.appEventBus.on('appointment.updated', (p) =>
      this.#log('appointment.updated', 'appointment', p.userID, p.appointmentId))
  }

  async #log(
    action: string,
    entityType: string,
    userID: string,
    entityId: string,
  ): Promise<void> {
    try {
      const user = await this.userRepository.findByID(userID).catch(() => null)
      await this.activityLogRepository.create({
        userID,
        userFirstName: user?.firstName ?? null,
        userLastName: user?.lastName ?? null,
        action,
        entityType,
        entityId,
      })
    } catch (err) {
      this.logger.error(`ActivityLog: failed to log ${action}: ${err}`)
    }
  }
}

export { ActivityLogSubscriber }
```

**Step 2: Verify TS**

```bash
cd back && bun run typecheck
```

**Step 3: Commit**

```bash
git add back/src/main/services/activity-log.subscriber.ts
git commit -m "feat(activity-log): add ActivityLogSubscriber"
```

---

## Task 6: IoC wiring

**Files:**
- Modify: `back/src/main/types/application/ioc.ts`
- Modify: `back/src/main/application/ioc/awilix/awilix-ioc-container.ts`

**Step 1: Update ioc.ts**

Add these imports at the top of `ioc.ts` (after the last existing import):

```ts
import type { AppEventBus } from '../utils/app-event-bus'
import type { ActivityLogDomainInterface } from '../domain/activityLog.domain.interface'
import type { ActivityLogRepositoryInterface } from '../infra/orm/repositories/activityLog.repository.interface'
import type { ActivityLogSubscriber } from '../services/activity-log.subscriber'
```

Add these fields to the `IocContainer` interface (after `// EnrollmentIssue` block):

```ts
  // ActivityLog
  readonly appEventBus: AppEventBus
  readonly activityLogDomain: ActivityLogDomainInterface
  readonly activityLogRepository: ActivityLogRepositoryInterface
  readonly activityLogSubscriber: ActivityLogSubscriber
```

**Step 2: Update awilix-ioc-container.ts**

Add imports:

```ts
import { AppEventBus } from '../../../utils/app-event-bus'
import { ActivityLogDomain } from '../../../domain/activityLog.domain'
import { ActivityLogRepository } from '../../../infra/orm/repositories/activityLog.repository'
import { ActivityLogSubscriber } from '../../../services/activity-log.subscriber'
```

In the `constructor`, after `this.#registerEnrollmentIssueRepository()` and before `// Server`:

```ts
    // ActivityLog
    this.#registerAppEventBus()
    this.#registerActivityLogDomain()
    this.#registerActivityLogRepository()
    this.#registerActivityLogSubscriber()
    // Force-instantiate subscriber so it subscribes to events at startup
    diContainer.resolve('activityLogSubscriber')
```

Add private methods (before closing `}`):

```ts
  // ActivityLog
  #registerAppEventBus(): void {
    this.register('appEventBus', asClass(AppEventBus).singleton())
  }
  #registerActivityLogDomain(): void {
    this.register('activityLogDomain', asClass(ActivityLogDomain).singleton())
  }
  #registerActivityLogRepository(): void {
    this.register('activityLogRepository', asClass(ActivityLogRepository).singleton())
  }
  #registerActivityLogSubscriber(): void {
    this.register('activityLogSubscriber', asClass(ActivityLogSubscriber).singleton())
  }
```

**Step 3: Verify TS**

```bash
cd back && bun run typecheck
```

**Step 4: Verify server starts**

```bash
cd back && bun dev
```

Expected: server starts, no errors, logs "IoC container initialized."

**Step 5: Commit**

```bash
git add back/src/main/types/application/ioc.ts \
        back/src/main/application/ioc/awilix/awilix-ioc-container.ts
git commit -m "feat(ioc): register AppEventBus, ActivityLog domain/repo/subscriber"
```

---

## Task 7: ActivityLog Zod schema + route + index registration

**Files:**
- Create: `back/src/main/interfaces/http/fastify/schemas/activityLog.schema.ts`
- Create: `back/src/main/interfaces/http/fastify/routes/activityLog.ts`
- Modify: `back/src/main/interfaces/http/fastify/routes/index.ts`

**Step 1: Write schema**

`back/src/main/interfaces/http/fastify/schemas/activityLog.schema.ts`:

```ts
import { z } from 'zod/v4'

export const activityLogResponseSchema = z.object({
  id: z.string(),
  userID: z.string(),
  userFirstName: z.string().nullable(),
  userLastName: z.string().nullable(),
  action: z.string(),
  entityType: z.string(),
  entityId: z.string(),
  createdAt: z.coerce.date(),
})

export const activityLogsResponseSchema = z.object({
  data: z.array(activityLogResponseSchema),
  total: z.number(),
  page: z.number(),
})

export const getActivityLogsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  action: z.string().optional(),
  userID: z.string().optional(),
  from: z.coerce.date().optional(),
})

export const cleanupResponseSchema = z.object({
  deleted: z.number(),
})

export type GetActivityLogsQuery = z.infer<typeof getActivityLogsQuerySchema>
```

**Step 2: Write route**

`back/src/main/interfaces/http/fastify/routes/activityLog.ts`:

```ts
import Boom from '@hapi/boom'
import type { FastifyPluginAsync } from 'fastify'

import {
  activityLogsResponseSchema,
  cleanupResponseSchema,
  getActivityLogsQuerySchema,
  type GetActivityLogsQuery,
} from '../schemas/activityLog.schema'

const activityLogRouter: FastifyPluginAsync = (fastify) => {
  const { activityLogDomain } = fastify.iocContainer

  fastify.get<{ Querystring: GetActivityLogsQuery }>(
    '/',
    {
      schema: {
        querystring: getActivityLogsQuerySchema,
        response: { 200: activityLogsResponseSchema },
      },
      onRequest: [fastify.verifySessionCookie],
    },
    async (request) => {
      if (request.user.role !== 'ADMIN') throw Boom.forbidden('Forbidden')
      const { page, action, userID, from } = request.query
      return activityLogDomain.findMany({ page, action, userID, from })
    },
  )

  fastify.post(
    '/cleanup',
    {
      schema: { response: { 200: cleanupResponseSchema } },
      onRequest: [fastify.verifySessionCookie],
    },
    async (request) => {
      if (request.user.role !== 'ADMIN') throw Boom.forbidden('Forbidden')
      return activityLogDomain.cleanup()
    },
  )

  return Promise.resolve()
}

export { activityLogRouter }
```

**Step 3: Register route in index.ts**

In `back/src/main/interfaces/http/fastify/routes/index.ts`, add import:

```ts
import { activityLogRouter } from './activityLog'
```

And add registration (after the last `await fastify.register`):

```ts
  await fastify.register(activityLogRouter, { prefix: '/activity-log' })
```

**Step 4: Verify TS**

```bash
cd back && bun run typecheck
```

**Step 5: Verify server starts and route is accessible**

```bash
cd back && bun dev
# In another terminal:
curl -s http://localhost:3000/activity-log  # Expect 401 Unauthorized (no cookie)
```

**Step 6: Commit**

```bash
git add back/src/main/interfaces/http/fastify/schemas/activityLog.schema.ts \
        back/src/main/interfaces/http/fastify/routes/activityLog.ts \
        back/src/main/interfaces/http/fastify/routes/index.ts
git commit -m "feat(activity-log): add Zod schema, route, and index registration"
```

---

## Task 8: PatientDomain — emit events + userID param

**Files:**
- Modify: `back/src/main/types/domain/patient.domain.interface.ts`
- Modify: `back/src/main/domain/patient.domain.ts`
- Modify: `back/src/main/interfaces/http/fastify/routes/patient.ts`

### 8a — Update domain interface

In `patient.domain.interface.ts`, update `PatientDomainInterface` method signatures:

```ts
export interface PatientDomainInterface {
  findAll: () => Promise<PatientEntityDomain[]>
  findAllWithTags: () => Promise<PatientWithTagsDomain[]>
  findByID: (patientID: string) => Promise<PatientEntityDomain>
  create: (
    patientCreateParams: PatientCreateEntityDomain,
    userID: string,
  ) => Promise<PatientEntityDomain>
  update: (
    patientID: string,
    patientUpdateParams: PatientUpdateEntityDomain,
    userID: string,
  ) => Promise<PatientEntityDomain>
  delete: (patientID: string, userID: string) => Promise<PatientEntityDomain>
  enrollPatientInPathways: (
    enrollmentData: EnrollPatientInPathwaysInput,
    userID: string,
  ) => Promise<EnrollmentResult>
  enrollExistingPatientInPathways: (
    enrollmentData: EnrollExistingPatientInPathwaysInput,
    userID: string,
  ) => Promise<EnrollmentResult>
}
```

### 8b — Update domain implementation

In `patient.domain.ts`:

Add import:

```ts
import type { AppEventBus } from '../utils/app-event-bus'
```

Add field:

```ts
  private readonly appEventBus: AppEventBus
```

In `constructor`, add:

```ts
    appEventBus,
```

and:

```ts
    this.appEventBus = appEventBus
```

Update method signatures and emit events:

```ts
  async create(
    patientCreateParams: PatientCreateEntityDomain,
    userID: string,
  ): Promise<PatientEntityDomain> {
    const patientInputParams = {
      ...patientCreateParams,
      createDate: new Date().toISOString(),
    }
    const patient = await this.patientRepository.create(patientInputParams)
    this.appEventBus.emit('patient.created', { userID, patientId: patient.id })
    return patient
  }

  async update(
    patientID: string,
    patientUpdateParams: PatientUpdateEntityDomain,
    userID: string,
  ): Promise<PatientEntityDomain> {
    const patient = await this.patientRepository.update(patientID, patientUpdateParams)
    this.appEventBus.emit('patient.updated', { userID, patientId: patient.id })
    return patient
  }

  async delete(patientID: string, userID: string): Promise<PatientEntityDomain> {
    const patient = await this.patientRepository.findByID(patientID)
    const appointmentIDs = patient.appointmentPatients.map(
      (ap) => ap.appointment.id,
    )

    const deleted = await this.patientRepository.delete(patientID)

    if (appointmentIDs.length > 0) {
      await this.appointmentRepository.deleteOrphanedByIds(appointmentIDs)
    }

    this.appEventBus.emit('patient.deleted', { userID, patientId: deleted.id })
    return deleted
  }

  async enrollPatientInPathways(
    enrollmentData: EnrollPatientInPathwaysInput,
    userID: string,
  ): Promise<EnrollmentResult> {
    const patient = await this.create(enrollmentData.patientData, userID)
    return this.processEnrollments(
      { ...patient, appointmentPatients: [], enrollmentIssues: [] },
      enrollmentData.pathways,
      enrollmentData.startDate,
      userID,
    )
  }

  async enrollExistingPatientInPathways(
    enrollmentData: EnrollExistingPatientInPathwaysInput,
    userID: string,
  ): Promise<EnrollmentResult> {
    const patient = await this.patientRepository.findByID(enrollmentData.patientID)
    return this.processEnrollments(
      patient,
      enrollmentData.pathways,
      enrollmentData.startDate,
      userID,
    )
  }
```

Update `processEnrollments` signature to accept `userID` and emit `patient.enrolled` at the end:

```ts
  private async processEnrollments(
    patient: PatientWithAppointmentsDomain,
    pathwayTemplates: EnrollPatientInPathwaysInput['pathways'],
    startDate: Date,
    userID: string,
  ): Promise<EnrollmentResult> {
    // ... (keep existing logic unchanged) ...

    // After the failedEnrollments block, before the return:
    this.appEventBus.emit('patient.enrolled', { userID, patientId: patient.id })

    return {
      patient: await this.patientRepository.findByID(patient.id),
      enrollments,
      failedEnrollments,
    }
  }
```

### 8c — Update patient routes

In `patient.ts`, add `verifySessionCookie` to all routes that are missing it, and pass `request.user.userID` to mutation methods:

Routes `GET /:patientID`, `POST /`, `PATCH /:patientID`, `DELETE /:patientID`, `POST /enroll`, `POST /:patientID/enroll` all need `onRequest: [fastify.verifySessionCookie]`.

The mutation routes need to pass `request.user.userID`:

```ts
  // Create — add hook + userID
  fastify.post<{ Body: CreatePatientBody }>(
    '/',
    {
      schema: { body: createPatientSchema, response: { 201: patientResponseSchema } },
      onRequest: [fastify.verifySessionCookie],
    },
    async (request, reply) => {
      const patient = await patientDomain.create(request.body, request.user.userID)
      reply.code(201)
      return patient
    },
  )

  // Update — add hook + userID
  fastify.patch<{ Params: UpdatePatientParams; Body: UpdatePatientBody }>(
    '/:patientID',
    {
      schema: { ...updatePatientByIdSchema, response: { 200: patientResponseSchema, 404: z.object({ message: z.string() }) } },
      onRequest: [fastify.verifySessionCookie],
    },
    async (request) => {
      const { patientID } = request.params
      const updated = await patientDomain.update(patientID, request.body, request.user.userID)
      if (!updated) throw Boom.notFound('Patient not found')
      return updated
    },
  )

  // Delete — add hook + userID
  fastify.delete<{ Params: DeletePatientByIdParams }>(
    '/:patientID',
    {
      schema: { params: deletePatientByIdParamsSchema, response: { 204: z.null(), 404: z.object({ message: z.string() }) } },
      onRequest: [fastify.verifySessionCookie],
    },
    async (request, reply) => {
      const { patientID } = request.params
      const deleted = await patientDomain.delete(patientID, request.user.userID)
      if (!deleted) {
        logger.info('Patient not found')
        throw Boom.notFound('Patient not found')
      }
      reply.code(204).send()
    },
  )

  // Enroll new patient — add hook + userID
  fastify.post<{ Body: EnrollPatientInPathwaysBody }>(
    '/enroll',
    {
      schema: { body: enrollPatientInPathwaysSchema, response: { 201: enrollmentResultSchema, 400: z.object({ message: z.string() }) } },
      onRequest: [fastify.verifySessionCookie],
    },
    async (request, reply) => {
      const result = await patientDomain.enrollPatientInPathways(
        { patientData: request.body.patientData, startDate: request.body.startDate, pathways: request.body.pathways },
        request.user.userID,
      )
      reply.code(201)
      return result
    },
  )

  // Enroll existing patient — add hook + userID
  fastify.post<{ Body: EnrollExistingPatientInPathwaysBody }>(
    '/:patientID/enroll',
    {
      schema: { body: enrollExistingPatientInPathwaysSchema, response: { 200: enrollmentResultSchema, 400: z.object({ message: z.string() }), 404: z.object({ message: z.string() }) } },
      onRequest: [fastify.verifySessionCookie],
    },
    async (request) => {
      return patientDomain.enrollExistingPatientInPathways(
        { patientID: request.body.patientID, startDate: request.body.startDate, pathways: request.body.pathways },
        request.user.userID,
      )
    },
  )

  // GET /:patientID — add hook (no userID needed, read only)
  fastify.get<{ Params: GetPatientByIdParams }>(
    '/:patientID',
    {
      schema: { params: getPatientByIdParamsSchema, response: { 200: patientResponseSchema, 404: z.object({ message: z.string() }) } },
      onRequest: [fastify.verifySessionCookie],
    },
    async (request) => {
      const { patientID } = request.params
      const patient = await patientDomain.findByID(patientID)
      if (!patient) throw Boom.notFound('Patient not found')
      return patient
    },
  )
```

**Step 1: Verify TS**

```bash
cd back && bun run typecheck
```

Expected: no errors.

**Step 2: Commit**

```bash
git add back/src/main/types/domain/patient.domain.interface.ts \
        back/src/main/domain/patient.domain.ts \
        back/src/main/interfaces/http/fastify/routes/patient.ts
git commit -m "feat(patient): emit activity events, add userID param, secure routes"
```

---

## Task 9: DiagnosticEducatifDomain — emit events + userID param

**Files:**
- Modify: `back/src/main/types/domain/diagnosticEducatif.domain.interface.ts`
- Modify: `back/src/main/domain/diagnosticEducatif.domain.ts`
- Modify: `back/src/main/interfaces/http/fastify/routes/diagnosticEducatif.ts`

### 9a — Update interface

In `diagnosticEducatif.domain.interface.ts`, update method signatures:

```ts
export interface DiagnosticEducatifDomainInterface {
  findByPatientID: (patientId: string) => Promise<DiagnosticEducatifEntity[]>
  findByID: (id: string) => Promise<DiagnosticEducatifEntity>
  create: (params: DiagnosticEducatifCreateEntity, userID: string) => Promise<DiagnosticEducatifEntity>
  update: (id: string, params: DiagnosticEducatifUpdateEntity, userID: string) => Promise<DiagnosticEducatifEntity>
  delete: (id: string) => Promise<DiagnosticEducatifEntity>
}
```

### 9b — Update domain implementation

In `diagnosticEducatif.domain.ts`, add import and field:

```ts
import type { AppEventBus } from '../utils/app-event-bus'
```

Add `private readonly appEventBus: AppEventBus` field.

Update constructor to inject `appEventBus`.

Update `create` and `update` methods:

```ts
  async create(params: DiagnosticEducatifCreateEntity, userID: string): Promise<DiagnosticEducatifEntity> {
    const diag = await this.diagnosticEducatifRepository.create(params)
    this.appEventBus.emit('diagnostic.created', { userID, diagnosticId: diag.id })
    return diag
  }

  async update(id: string, params: DiagnosticEducatifUpdateEntity, userID: string): Promise<DiagnosticEducatifEntity> {
    const diag = await this.diagnosticEducatifRepository.update(id, params)
    this.appEventBus.emit('diagnostic.updated', { userID, diagnosticId: diag.id })
    return diag
  }
```

### 9c — Update route

In `diagnosticEducatif.ts`, update `create` and `update` handlers to pass `request.user.userID`:

```ts
  // Create
  fastify.post<{ Params: DiagnosticPatientParams; Body: CreateDiagnosticEducatifBody }>('/', {
    // ... schema unchanged ...
    onRequest: [fastify.verifySessionCookie],
  }, async (request, reply) => {
    const { templateId, ...rest } = request.body
    let activeFields: string[] = rest.activeFields ?? []
    if (templateId) {
      const template = await diagnosticEducatifTemplateDomain.findByID(templateId)
      activeFields = template.activeFields
    }
    const diag = await diagnosticEducatifDomain.create(
      { ...rest, patientId: request.params.patientId, templateId: templateId ?? undefined, activeFields },
      request.user.userID,
    )
    reply.code(201)
    return diag
  })

  // Update
  fastify.patch<{ Params: UpdateDiagnosticEducatifParams; Body: UpdateDiagnosticEducatifBody }>('/:diagnosticId', {
    // ... schema unchanged ...
    onRequest: [fastify.verifySessionCookie],
  }, async (request) => {
    return diagnosticEducatifDomain.update(
      request.params.diagnosticId,
      request.body,
      request.user.userID,
    )
  })
```

**Step 1: Verify TS**

```bash
cd back && bun run typecheck
```

**Step 2: Commit**

```bash
git add back/src/main/types/domain/diagnosticEducatif.domain.interface.ts \
        back/src/main/domain/diagnosticEducatif.domain.ts \
        back/src/main/interfaces/http/fastify/routes/diagnosticEducatif.ts
git commit -m "feat(diagnostic): emit activity events, add userID param"
```

---

## Task 10: AppointmentDomain — emit events + userID param

**Files:**
- Modify: `back/src/main/types/domain/appointment.domain.interface.ts`
- Modify: `back/src/main/domain/appointment.domain.ts`
- Modify: `back/src/main/interfaces/http/fastify/routes/appointment.ts`

### 10a — Update interface

In `appointment.domain.interface.ts`, update signatures:

```ts
export interface AppointmentDomainInterface {
  findAll: () => Promise<AppointmentEntityDomain[]>
  findByID: (appointmentID: string) => Promise<AppointmentEntityDomain>
  create: (
    appointmentCreateParams: AppointmentCreateEntityDomain,
    userID: string,
  ) => Promise<AppointmentEntityDomain>
  update: (
    appointmentID: string,
    appointmentUpdateParams: AppointmentUpdateEntityDomain,
    userID: string,
  ) => Promise<AppointmentEntityDomain>
  delete: (appointmentID: string) => Promise<AppointmentEntityDomain>
}
```

### 10b — Update domain implementation

In `appointment.domain.ts`, add import and field:

```ts
import type { AppEventBus } from '../utils/app-event-bus'
```

Add `private readonly appEventBus: AppEventBus` field.

Update constructor to inject `appEventBus`.

Update `create` and `update` methods:

```ts
  async create(
    appointmentCreateParams: AppointmentCreateEntityDomain,
    userID: string,
  ): Promise<AppointmentEntityDomain> {
    const appointment = await this.appointmentRepository.create(appointmentCreateParams)
    this.appEventBus.emit('appointment.created', { userID, appointmentId: appointment.id })
    return appointment
  }

  async update(
    appointmentID: string,
    appointmentUpdateParams: AppointmentUpdateEntityDomain,
    userID: string,
  ): Promise<AppointmentEntityDomain> {
    const appointment = await this.appointmentRepository.update(appointmentID, appointmentUpdateParams)
    this.appEventBus.emit('appointment.updated', { userID, appointmentId: appointment.id })
    return appointment
  }
```

### 10c — Update route

In `appointment.ts`, add `verifySessionCookie` and `request.user.userID` to `create` and `update` handlers:

```ts
  // Create — add hook + userID
  fastify.post<{ Body: CreateAppointmentBody }>(
    '/',
    {
      schema: { body: createAppointmentSchema, response: { 201: appointmentResponseSchema } },
      onRequest: [fastify.verifySessionCookie],
    },
    async (request, reply) => {
      const appointment = await appointmentDomain.create(request.body, request.user.userID)
      reply.code(201)
      return appointment
    },
  )

  // Update — add hook + userID
  fastify.patch<{ Params: UpdateAppointmentParams; Body: UpdateAppointmentBody }>(
    '/:appointmentID',
    {
      schema: { ...updateAppointmentByIdSchema, response: { 200: appointmentResponseSchema, 404: z.object({ message: z.string() }) } },
      onRequest: [fastify.verifySessionCookie],
    },
    async (request) => {
      const { appointmentID } = request.params
      const updated = await appointmentDomain.update(appointmentID, request.body, request.user.userID)
      if (!updated) throw Boom.notFound('Appointment not found')
      return updated
    },
  )
```

**Step 1: Verify TS**

```bash
cd back && bun run typecheck
```

**Step 2: Commit**

```bash
git add back/src/main/types/domain/appointment.domain.interface.ts \
        back/src/main/domain/appointment.domain.ts \
        back/src/main/interfaces/http/fastify/routes/appointment.ts
git commit -m "feat(appointment): emit activity events, add userID param, secure routes"
```

---

## Task 11: Front-end — types + constants

**Files:**
- Create: `front/src/types/activityLog.ts`
- Modify: `front/src/constants/process.constant.ts`

**Step 1: Create types**

`front/src/types/activityLog.ts`:

```ts
export type ActivityLog = {
  id: string
  userID: string
  userFirstName: string | null
  userLastName: string | null
  action: string
  entityType: string
  entityId: string
  createdAt: string
}

export type ActivityLogsResponse = {
  data: ActivityLog[]
  total: number
  page: number
}
```

**Step 2: Add ACTIVITY_LOG constant**

In `front/src/constants/process.constant.ts`, append:

```ts
export const ACTIVITY_LOG = {
  GET_ALL: 'get_all_activity_logs',
  CLEANUP: 'cleanup_activity_logs',
}
```

**Step 3: Commit**

```bash
git add front/src/types/activityLog.ts front/src/constants/process.constant.ts
git commit -m "feat(activity-log): add frontend types and constants"
```

---

## Task 12: Front-end — API + React Query hook

**Files:**
- Create: `front/src/api/activityLog.api.ts`
- Create: `front/src/queries/useActivityLog.ts`

**Step 1: Create API**

`front/src/api/activityLog.api.ts`:

```ts
import { apiUrl } from '../constants/config.constant.ts'
import { handleHttpError } from '../libs/httpErrorHandler.ts'
import type { ActivityLogsResponse } from '../types/activityLog.ts'
import { fetchWithAuth } from './fetchWithAuth.ts'

export type GetActivityLogsParams = {
  page?: number
  action?: string
  userID?: string
  from?: string
}

export const ActivityLogApi = {
  getAll: async (params: GetActivityLogsParams = {}): Promise<ActivityLogsResponse> => {
    const query = new URLSearchParams()
    if (params.page) query.set('page', String(params.page))
    if (params.action) query.set('action', params.action)
    if (params.userID) query.set('userID', params.userID)
    if (params.from) query.set('from', params.from)
    const response = await fetchWithAuth(`${apiUrl}/activity-log?${query}`, { method: 'GET' })
    if (!response.ok) handleHttpError(response, {}, "Impossible de récupérer les logs d'activité")
    return response.json()
  },

  cleanup: async (): Promise<{ deleted: number }> => {
    const response = await fetchWithAuth(`${apiUrl}/activity-log/cleanup`, { method: 'POST' })
    if (!response.ok) handleHttpError(response, {}, 'Impossible de nettoyer les logs')
    return response.json()
  },
}
```

**Step 2: Create React Query hook**

`front/src/queries/useActivityLog.ts`:

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { ActivityLogApi, type GetActivityLogsParams } from '../api/activityLog.api.ts'
import { ACTIVITY_LOG } from '../constants/process.constant.ts'
import { useDataFetching } from '../hooks/useDataFetching.ts'
import { useToast } from '../hooks/useToast.ts'
import { TOAST_SEVERITY } from '../constants/ui.constant.ts'

export const useActivityLogsQuery = (params: GetActivityLogsParams = {}) => {
  const {
    data,
    isPending,
    isError,
    error,
  } = useQuery({
    queryKey: [ACTIVITY_LOG.GET_ALL, params],
    queryFn: () => ActivityLogApi.getAll(params),
    retry: 0,
  })

  useDataFetching({ isPending, isError, error })

  return { data, isPending }
}

export const useActivityLogMutations = () => {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  const cleanup = useMutation({
    mutationKey: [ACTIVITY_LOG.CLEANUP],
    mutationFn: ActivityLogApi.cleanup,
    onSuccess: ({ deleted }) => {
      queryClient.invalidateQueries({ queryKey: [ACTIVITY_LOG.GET_ALL] })
      toast({
        title: `${deleted} log(s) supprimé(s)`,
        severity: TOAST_SEVERITY.SUCCESS,
      })
    },
    onError: (error) => {
      toast({
        title: 'Erreur lors du nettoyage',
        message: error.message,
        severity: TOAST_SEVERITY.ERROR,
      })
    },
  })

  return { cleanup }
}
```

**Step 3: Commit**

```bash
git add front/src/api/activityLog.api.ts front/src/queries/useActivityLog.ts
git commit -m "feat(activity-log): add API client and React Query hook"
```

---

## Task 13: Front-end — admin page

**Files:**
- Create: `front/src/routes/_authenticated/_admin/settings/activity-log.tsx`

**Step 1: Create page**

```tsx
import { createFileRoute } from '@tanstack/react-router'
import dayjs from 'dayjs'
import { useState } from 'react'

import DashboardLayout from '../../../../components/dashboard.layout.tsx'
import { Button } from '../../../../components/ui/button.tsx'
import { useActivityLogMutations, useActivityLogsQuery } from '../../../../queries/useActivityLog.ts'

const ACTION_LABELS: Record<string, string> = {
  'patient.created': 'Patient créé',
  'patient.updated': 'Patient modifié',
  'patient.deleted': 'Patient supprimé',
  'patient.enrolled': 'Patient inscrit à un parcours',
  'diagnostic.created': 'Diagnostic créé',
  'diagnostic.updated': 'Diagnostic modifié',
  'appointment.created': 'Rendez-vous créé',
  'appointment.updated': 'Rendez-vous modifié',
}

const ALL_ACTIONS = Object.keys(ACTION_LABELS)

const PERIOD_OPTIONS = [
  { label: '7 derniers jours', days: 7 },
  { label: '30 derniers jours', days: 30 },
  { label: '3 derniers mois', days: 90 },
  { label: '12 derniers mois', days: 365 },
]

export const Route = createFileRoute('/_authenticated/_admin/settings/activity-log')({
  component: ActivityLogPage,
})

function ActivityLogPage() {
  const [page, setPage] = useState(1)
  const [action, setAction] = useState('')
  const [periodDays, setPeriodDays] = useState<number | undefined>(undefined)
  const [userSearch, setUserSearch] = useState('')

  const from = periodDays
    ? dayjs().subtract(periodDays, 'day').toISOString()
    : undefined

  const { data } = useActivityLogsQuery({
    page,
    action: action || undefined,
    from,
  })

  const { cleanup } = useActivityLogMutations()

  const logs = (data?.data ?? []).filter((log) => {
    if (!userSearch) return true
    const fullName = `${log.userFirstName ?? ''} ${log.userLastName ?? ''}`.toLowerCase()
    return fullName.includes(userSearch.toLowerCase())
  })

  const totalPages = data ? Math.ceil(data.total / 50) : 1

  return (
    <DashboardLayout>
      <div className="flex-1 bg-background p-6 rounded-lg flex flex-col w-full gap-4">
        <div className="flex items-center justify-between">
          <h1 className="h-9 flex items-center text-text-dark text-xl font-semibold">
            Journal d'activité
          </h1>
          <Button
            variant="outline"
            size="sm"
            onClick={() => cleanup.mutate()}
            disabled={cleanup.isPending}
          >
            Nettoyer (&gt;12 mois)
          </Button>
        </div>

        {/* Filters */}
        <div className="flex gap-3 flex-wrap">
          <input
            type="text"
            placeholder="Rechercher un utilisateur..."
            value={userSearch}
            onChange={(e) => { setUserSearch(e.target.value); setPage(1) }}
            className="border border-border rounded px-3 py-1.5 text-sm w-56"
          />
          <select
            value={action}
            onChange={(e) => { setAction(e.target.value); setPage(1) }}
            className="border border-border rounded px-3 py-1.5 text-sm"
          >
            <option value="">Toutes les actions</option>
            {ALL_ACTIONS.map((a) => (
              <option key={a} value={a}>{ACTION_LABELS[a]}</option>
            ))}
          </select>
          <select
            value={periodDays ?? ''}
            onChange={(e) => { setPeriodDays(e.target.value ? Number(e.target.value) : undefined); setPage(1) }}
            className="border border-border rounded px-3 py-1.5 text-sm"
          >
            <option value="">Toutes les périodes</option>
            {PERIOD_OPTIONS.map((p) => (
              <option key={p.days} value={p.days}>{p.label}</option>
            ))}
          </select>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-text-light">
                <th className="py-2 pr-4">Date</th>
                <th className="py-2 pr-4">Heure</th>
                <th className="py-2 pr-4">Utilisateur</th>
                <th className="py-2 pr-4">Action</th>
                <th className="py-2">Entité</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id} className="border-b border-border hover:bg-muted/30">
                  <td className="py-2 pr-4">{dayjs(log.createdAt).format('DD/MM/YYYY')}</td>
                  <td className="py-2 pr-4">{dayjs(log.createdAt).format('HH:mm')}</td>
                  <td className="py-2 pr-4">
                    {log.userFirstName || log.userLastName
                      ? `${log.userFirstName ?? ''} ${log.userLastName ?? ''}`.trim()
                      : log.userID.slice(0, 8)}
                  </td>
                  <td className="py-2 pr-4">{ACTION_LABELS[log.action] ?? log.action}</td>
                  <td className="py-2 text-text-light">
                    {log.entityType} · {log.entityId.slice(0, 8)}…
                  </td>
                </tr>
              ))}
              {logs.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-text-light">
                    Aucune activité trouvée
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center gap-2 justify-end text-sm">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
            >
              Précédent
            </Button>
            <span className="text-text-light">
              Page {page} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
            >
              Suivant
            </Button>
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}

export default ActivityLogPage
```

**Step 2: Commit**

```bash
git add front/src/routes/_authenticated/_admin/settings/activity-log.tsx
git commit -m "feat(activity-log): add admin page with filters and pagination"
```

---

## Task 14: Front-end — navbar entry

**Files:**
- Modify: `front/src/components/navbar.tsx`

**Step 1: Add import**

Add `Activity` to the lucide-react import in `navbar.tsx`:

```ts
import { Activity, BriefcaseMedical, CalendarDays, Cog, PanelLeft, Tag, UserCog, Users } from 'lucide-react'
```

**Step 2: Add menu item**

In `SettingsMenu`, after the `Utilisateurs` `PopoverMenuItem`:

```tsx
        <PopoverMenuItem
          icon={<Activity className="w-4 h-4" />}
          onClick={() => router.navigate({ to: '/settings/activity-log' })}
        >
          Activité
        </PopoverMenuItem>
```

**Step 3: Verify TS**

```bash
cd front && bun run typecheck
```

**Step 4: Commit**

```bash
git add front/src/components/navbar.tsx
git commit -m "feat(navbar): add Activité entry in settings menu"
```

---

## Final verification

Start both servers and do a manual end-to-end check:

1. Log in as admin
2. Create a patient → check `GET /activity-log` returns a `patient.created` entry
3. Update the patient → check `patient.updated` entry
4. Navigate to Settings → Activité → verify table shows logs with correct user name, action label, date
5. Test filters: action dropdown, period dropdown, user name search
6. Test pagination if more than 50 logs exist
7. Test "Nettoyer" button (creates alert with count of deleted)
