# Diagnostic Educatif — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ajouter la gestion des Diagnostics Educatifs par patient, avec templates admin, vue lecture/édition et sidebar de liste.

**Architecture:** Deux modèles Prisma (`DiagnosticEducatifTemplate` + `DiagnosticEducatif`), chacun avec son domain/repository/routes suivant le pattern Awilix existant. Les champs du formulaire sont définis dans un constant TypeScript partagé. Le frontend expose une sidebar de liste et des vues view/edit pour chaque diagnostic.

**Tech Stack:** Fastify + Prisma + Zod v4 + Awilix (back) — React + TanStack Query + Tailwind (front)

---

## Task 1 : Prisma — Nouveaux modèles

**Files:**
- Modify: `back/prisma/schema.prisma`
- Create: `back/prisma/migrations/YYYYMMDD_add_diagnostic_educatif/migration.sql`

**Step 1 : Ajouter les deux modèles à `schema.prisma`**

Après le modèle `Patient`, ajouter :

```prisma
model DiagnosticEducatifTemplate {
  id           String   @id @default(cuid())
  name         String
  activeFields String[]

  diagnostics DiagnosticEducatif[]
}

model DiagnosticEducatif {
  id           String   @id @default(cuid())
  createdAt    DateTime @default(now())
  title        String?
  activeFields String[]

  patientId  String
  templateId String?

  patient  Patient                      @relation(fields: [patientId], references: [id], onDelete: Cascade)
  template DiagnosticEducatifTemplate?  @relation(fields: [templateId], references: [id], onDelete: SetNull)

  // ⚠️ Ajouter ici une colonne nullable par champ fixe (à compléter selon la liste définitive)
  // Exemple :
  // section1ChampA  String?
  // section1ChampB  Boolean?
  // section2ChampA  String?
}
```

Ajouter la relation inverse dans `Patient` :
```prisma
diagnostics DiagnosticEducatif[]
```

**Step 2 : Générer la migration**

```bash
cd back
npx prisma migrate dev --name add_diagnostic_educatif
```

Expected: migration SQL créée + `generated/client` regénéré.

**Step 3 : Vérifier la génération**

```bash
npx prisma studio
```

Les tables `DiagnosticEducatifTemplate` et `DiagnosticEducatif` doivent apparaître.

**Step 4 : Commit**

```bash
git add back/prisma/schema.prisma back/prisma/migrations/
git commit -m "feat(db): add DiagnosticEducatif and DiagnosticEducatifTemplate models"
```

---

## Task 2 : Backend — Types (interfaces)

**Files:**
- Create: `back/src/main/types/domain/diagnosticEducatif.domain.interface.ts`
- Create: `back/src/main/types/domain/diagnosticEducatifTemplate.domain.interface.ts`
- Create: `back/src/main/types/infra/orm/repositories/diagnosticEducatif.repository.interface.ts`
- Create: `back/src/main/types/infra/orm/repositories/diagnosticEducatifTemplate.repository.interface.ts`
- Modify: `back/src/main/types/application/ioc.ts`

**Step 1 : Créer `diagnosticEducatif.domain.interface.ts`**

```typescript
import type { DiagnosticEducatif, Prisma } from '../../../generated/client'

export type DiagnosticEducatifEntity = DiagnosticEducatif

export type DiagnosticEducatifCreateEntity = Omit<
  Prisma.DiagnosticEducatifUncheckedCreateInput,
  'patient' | 'template'
> & {
  templateId?: string
}

export type DiagnosticEducatifUpdateEntity = Partial<
  Omit<Prisma.DiagnosticEducatifUncheckedUpdateInput, 'patient' | 'template'>
>

export interface DiagnosticEducatifDomainInterface {
  findByPatientID: (patientId: string) => Promise<DiagnosticEducatifEntity[]>
  findByID: (id: string) => Promise<DiagnosticEducatifEntity>
  create: (params: DiagnosticEducatifCreateEntity) => Promise<DiagnosticEducatifEntity>
  update: (id: string, params: DiagnosticEducatifUpdateEntity) => Promise<DiagnosticEducatifEntity>
  delete: (id: string) => Promise<DiagnosticEducatifEntity>
}
```

**Step 2 : Créer `diagnosticEducatifTemplate.domain.interface.ts`**

```typescript
import type { DiagnosticEducatifTemplate, Prisma } from '../../../generated/client'

export type DiagnosticEducatifTemplateEntity = DiagnosticEducatifTemplate

export type DiagnosticEducatifTemplateCreateEntity = Pick<
  Prisma.DiagnosticEducatifTemplateUncheckedCreateInput,
  'name' | 'activeFields'
>

export type DiagnosticEducatifTemplateUpdateEntity = Partial<DiagnosticEducatifTemplateCreateEntity>

export interface DiagnosticEducatifTemplateDomainInterface {
  findAll: () => Promise<DiagnosticEducatifTemplateEntity[]>
  findByID: (id: string) => Promise<DiagnosticEducatifTemplateEntity>
  create: (params: DiagnosticEducatifTemplateCreateEntity) => Promise<DiagnosticEducatifTemplateEntity>
  update: (id: string, params: DiagnosticEducatifTemplateUpdateEntity) => Promise<DiagnosticEducatifTemplateEntity>
  delete: (id: string) => Promise<DiagnosticEducatifTemplateEntity>
}
```

**Step 3 : Créer `diagnosticEducatif.repository.interface.ts`**

```typescript
import type {
  DiagnosticEducatifCreateEntity,
  DiagnosticEducatifEntity,
  DiagnosticEducatifUpdateEntity,
} from '../../domain/diagnosticEducatif.domain.interface'

export interface DiagnosticEducatifRepositoryInterface {
  findByPatientID: (patientId: string) => Promise<DiagnosticEducatifEntity[]>
  findByID: (id: string) => Promise<DiagnosticEducatifEntity>
  create: (params: DiagnosticEducatifCreateEntity) => Promise<DiagnosticEducatifEntity>
  update: (id: string, params: DiagnosticEducatifUpdateEntity) => Promise<DiagnosticEducatifEntity>
  delete: (id: string) => Promise<DiagnosticEducatifEntity>
}
```

**Step 4 : Créer `diagnosticEducatifTemplate.repository.interface.ts`**

```typescript
import type {
  DiagnosticEducatifTemplateCreateEntity,
  DiagnosticEducatifTemplateEntity,
  DiagnosticEducatifTemplateUpdateEntity,
} from '../../domain/diagnosticEducatifTemplate.domain.interface'

export interface DiagnosticEducatifTemplateRepositoryInterface {
  findAll: () => Promise<DiagnosticEducatifTemplateEntity[]>
  findByID: (id: string) => Promise<DiagnosticEducatifTemplateEntity>
  create: (params: DiagnosticEducatifTemplateCreateEntity) => Promise<DiagnosticEducatifTemplateEntity>
  update: (id: string, params: DiagnosticEducatifTemplateUpdateEntity) => Promise<DiagnosticEducatifTemplateEntity>
  delete: (id: string) => Promise<DiagnosticEducatifTemplateEntity>
}
```

**Step 5 : Mettre à jour `ioc.ts`**

Ajouter après `// Thematic` :

```typescript
import type { DiagnosticEducatifDomainInterface } from '../domain/diagnosticEducatif.domain.interface'
import type { DiagnosticEducatifTemplateDomainInterface } from '../domain/diagnosticEducatifTemplate.domain.interface'
import type { DiagnosticEducatifRepositoryInterface } from '../infra/orm/repositories/diagnosticEducatif.repository.interface'
import type { DiagnosticEducatifTemplateRepositoryInterface } from '../infra/orm/repositories/diagnosticEducatifTemplate.repository.interface'
```

Dans l'interface `IocContainer` :
```typescript
  // DiagnosticEducatif
  readonly diagnosticEducatifDomain: DiagnosticEducatifDomainInterface
  readonly diagnosticEducatifRepository: DiagnosticEducatifRepositoryInterface
  // DiagnosticEducatifTemplate
  readonly diagnosticEducatifTemplateDomain: DiagnosticEducatifTemplateDomainInterface
  readonly diagnosticEducatifTemplateRepository: DiagnosticEducatifTemplateRepositoryInterface
```

**Step 6 : Commit**

```bash
git add back/src/main/types/
git commit -m "feat(types): add DiagnosticEducatif and Template domain/repository interfaces"
```

---

## Task 3 : Backend — Repository

**Files:**
- Create: `back/src/main/infra/orm/repositories/diagnosticEducatif.repository.ts`
- Create: `back/src/main/infra/orm/repositories/diagnosticEducatifTemplate.repository.ts`

**Step 1 : Créer `diagnosticEducatif.repository.ts`**

```typescript
import type { IocContainer } from '../../../types/application/ioc'
import type {
  DiagnosticEducatifCreateEntity,
  DiagnosticEducatifEntity,
  DiagnosticEducatifUpdateEntity,
} from '../../../types/domain/diagnosticEducatif.domain.interface'
import type { DiagnosticEducatifRepositoryInterface } from '../../../types/infra/orm/repositories/diagnosticEducatif.repository.interface'
import type { ErrorHandlerInterface } from '../../../types/utils/error-handler'
import type { PostgresPrismaClient } from '../postgres-client'

class DiagnosticEducatifRepository implements DiagnosticEducatifRepositoryInterface {
  private readonly prisma: PostgresPrismaClient
  private readonly errorHandler: ErrorHandlerInterface

  constructor({ postgresOrm, errorHandler }: IocContainer) {
    this.prisma = postgresOrm.prisma
    this.errorHandler = errorHandler
  }

  findByPatientID(patientId: string): Promise<DiagnosticEducatifEntity[]> {
    return this.prisma.diagnosticEducatif.findMany({
      where: { patientId },
      orderBy: { createdAt: 'desc' },
    })
  }

  async findByID(id: string): Promise<DiagnosticEducatifEntity> {
    try {
      return await this.prisma.diagnosticEducatif.findUniqueOrThrow({
        where: { id },
      })
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({
        entityName: 'DiagnosticEducatif',
        error: err,
      })
    }
  }

  async create(params: DiagnosticEducatifCreateEntity): Promise<DiagnosticEducatifEntity> {
    try {
      return await this.prisma.diagnosticEducatif.create({ data: params })
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({
        entityName: 'DiagnosticEducatif',
        error: err,
      })
    }
  }

  async update(id: string, params: DiagnosticEducatifUpdateEntity): Promise<DiagnosticEducatifEntity> {
    try {
      return await this.prisma.diagnosticEducatif.update({
        where: { id },
        data: params,
      })
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({
        entityName: 'DiagnosticEducatif',
        error: err,
      })
    }
  }

  async delete(id: string): Promise<DiagnosticEducatifEntity> {
    try {
      return await this.prisma.diagnosticEducatif.delete({ where: { id } })
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({
        entityName: 'DiagnosticEducatif',
        error: err,
      })
    }
  }
}

export { DiagnosticEducatifRepository }
```

**Step 2 : Créer `diagnosticEducatifTemplate.repository.ts`**

Même structure que ci-dessus, remplacer `DiagnosticEducatif` par `DiagnosticEducatifTemplate`, `findByPatientID` par `findAll` :

```typescript
import type { IocContainer } from '../../../types/application/ioc'
import type {
  DiagnosticEducatifTemplateCreateEntity,
  DiagnosticEducatifTemplateEntity,
  DiagnosticEducatifTemplateUpdateEntity,
} from '../../../types/domain/diagnosticEducatifTemplate.domain.interface'
import type { DiagnosticEducatifTemplateRepositoryInterface } from '../../../types/infra/orm/repositories/diagnosticEducatifTemplate.repository.interface'
import type { ErrorHandlerInterface } from '../../../types/utils/error-handler'
import type { PostgresPrismaClient } from '../postgres-client'

class DiagnosticEducatifTemplateRepository implements DiagnosticEducatifTemplateRepositoryInterface {
  private readonly prisma: PostgresPrismaClient
  private readonly errorHandler: ErrorHandlerInterface

  constructor({ postgresOrm, errorHandler }: IocContainer) {
    this.prisma = postgresOrm.prisma
    this.errorHandler = errorHandler
  }

  findAll(): Promise<DiagnosticEducatifTemplateEntity[]> {
    return this.prisma.diagnosticEducatifTemplate.findMany({
      orderBy: { name: 'asc' },
    })
  }

  async findByID(id: string): Promise<DiagnosticEducatifTemplateEntity> {
    try {
      return await this.prisma.diagnosticEducatifTemplate.findUniqueOrThrow({ where: { id } })
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({ entityName: 'DiagnosticEducatifTemplate', error: err })
    }
  }

  async create(params: DiagnosticEducatifTemplateCreateEntity): Promise<DiagnosticEducatifTemplateEntity> {
    try {
      return await this.prisma.diagnosticEducatifTemplate.create({ data: params })
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({ entityName: 'DiagnosticEducatifTemplate', error: err })
    }
  }

  async update(id: string, params: DiagnosticEducatifTemplateUpdateEntity): Promise<DiagnosticEducatifTemplateEntity> {
    try {
      return await this.prisma.diagnosticEducatifTemplate.update({ where: { id }, data: params })
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({ entityName: 'DiagnosticEducatifTemplate', error: err })
    }
  }

  async delete(id: string): Promise<DiagnosticEducatifTemplateEntity> {
    try {
      return await this.prisma.diagnosticEducatifTemplate.delete({ where: { id } })
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({ entityName: 'DiagnosticEducatifTemplate', error: err })
    }
  }
}

export { DiagnosticEducatifTemplateRepository }
```

**Step 3 : Commit**

```bash
git add back/src/main/infra/orm/repositories/
git commit -m "feat(repository): add DiagnosticEducatif and Template repositories"
```

---

## Task 4 : Backend — Domain

**Files:**
- Create: `back/src/main/domain/diagnosticEducatif.domain.ts`
- Create: `back/src/main/domain/diagnosticEducatifTemplate.domain.ts`

**Step 1 : Créer `diagnosticEducatif.domain.ts`**

```typescript
import type { IocContainer } from '../types/application/ioc'
import type {
  DiagnosticEducatifCreateEntity,
  DiagnosticEducatifDomainInterface,
  DiagnosticEducatifEntity,
  DiagnosticEducatifUpdateEntity,
} from '../types/domain/diagnosticEducatif.domain.interface'
import type { DiagnosticEducatifRepositoryInterface } from '../types/infra/orm/repositories/diagnosticEducatif.repository.interface'

class DiagnosticEducatifDomain implements DiagnosticEducatifDomainInterface {
  private readonly diagnosticEducatifRepository: DiagnosticEducatifRepositoryInterface

  constructor({ diagnosticEducatifRepository }: IocContainer) {
    this.diagnosticEducatifRepository = diagnosticEducatifRepository
  }

  findByPatientID(patientId: string): Promise<DiagnosticEducatifEntity[]> {
    return this.diagnosticEducatifRepository.findByPatientID(patientId)
  }

  findByID(id: string): Promise<DiagnosticEducatifEntity> {
    return this.diagnosticEducatifRepository.findByID(id)
  }

  create(params: DiagnosticEducatifCreateEntity): Promise<DiagnosticEducatifEntity> {
    return this.diagnosticEducatifRepository.create(params)
  }

  update(id: string, params: DiagnosticEducatifUpdateEntity): Promise<DiagnosticEducatifEntity> {
    return this.diagnosticEducatifRepository.update(id, params)
  }

  delete(id: string): Promise<DiagnosticEducatifEntity> {
    return this.diagnosticEducatifRepository.delete(id)
  }
}

export { DiagnosticEducatifDomain }
```

**Step 2 : Créer `diagnosticEducatifTemplate.domain.ts`**

Même structure, utiliser `DiagnosticEducatifTemplateDomain`, `DiagnosticEducatifTemplateDomainInterface`, `diagnosticEducatifTemplateRepository`.

**Step 3 : Commit**

```bash
git add back/src/main/domain/
git commit -m "feat(domain): add DiagnosticEducatif and Template domains"
```

---

## Task 5 : Backend — Schemas Zod + Routes

**Files:**
- Create: `back/src/main/interfaces/http/fastify/schemas/diagnosticEducatif.schema.ts`
- Create: `back/src/main/interfaces/http/fastify/routes/diagnosticEducatif.ts`
- Create: `back/src/main/interfaces/http/fastify/routes/diagnosticEducatifTemplate.ts`
- Modify: `back/src/main/interfaces/http/fastify/schemas/index.ts`

**Step 1 : Ajouter le schema de base dans `schemas/index.ts`**

```typescript
export const diagnosticEducatifTemplateSchema = z.object({
  name: z.string().min(1),
  activeFields: z.array(z.string()).default([]),
})

export const diagnosticEducatifSchema = z.object({
  title: z.string().optional().nullable(),
  activeFields: z.array(z.string()).default([]),
  patientId: z.cuid(),
  templateId: z.cuid().optional().nullable(),
  // Ajouter ici les colonnes de champs (toutes optional/nullable)
  // section1ChampA: z.string().optional().nullable(),
  // section1ChampB: z.boolean().optional().nullable(),
})
```

**Step 2 : Créer `diagnosticEducatif.schema.ts`**

```typescript
import { z } from 'zod/v4'
import { diagnosticEducatifSchema, diagnosticEducatifTemplateSchema } from './index'

// Template schemas
export const diagnosticEducatifTemplateResponseSchema = diagnosticEducatifTemplateSchema.extend({ id: z.cuid() })
export const diagnosticEducatifTemplatesResponseSchema = z.array(diagnosticEducatifTemplateResponseSchema)
export const createDiagnosticEducatifTemplateSchema = diagnosticEducatifTemplateSchema
export const updateDiagnosticEducatifTemplateSchema = {
  params: z.object({ templateId: z.cuid() }),
  body: diagnosticEducatifTemplateSchema.partial(),
}
export const diagnosticTemplateParamsSchema = z.object({ templateId: z.cuid() })

export type DiagnosticEducatifTemplateResponse = z.infer<typeof diagnosticEducatifTemplateResponseSchema>
export type CreateDiagnosticEducatifTemplateBody = z.infer<typeof createDiagnosticEducatifTemplateSchema>
export type UpdateDiagnosticEducatifTemplateBody = z.infer<typeof updateDiagnosticEducatifTemplateSchema.body>
export type UpdateDiagnosticEducatifTemplateParams = z.infer<typeof updateDiagnosticEducatifTemplateSchema.params>
export type DiagnosticTemplateParams = z.infer<typeof diagnosticTemplateParamsSchema>

// Diagnostic schemas
export const diagnosticEducatifResponseSchema = diagnosticEducatifSchema.extend({ id: z.cuid(), createdAt: z.coerce.date() })
export const diagnosticEducatifsResponseSchema = z.array(diagnosticEducatifResponseSchema)
export const createDiagnosticEducatifSchema = diagnosticEducatifSchema
export const updateDiagnosticEducatifSchema = {
  params: z.object({ patientId: z.cuid(), diagnosticId: z.cuid() }),
  body: diagnosticEducatifSchema.omit({ patientId: true }).partial(),
}
export const diagnosticParamsSchema = z.object({ patientId: z.cuid(), diagnosticId: z.cuid() })
export const diagnosticPatientParamsSchema = z.object({ patientId: z.cuid() })

export type DiagnosticEducatifResponse = z.infer<typeof diagnosticEducatifResponseSchema>
export type CreateDiagnosticEducatifBody = z.infer<typeof createDiagnosticEducatifSchema>
export type UpdateDiagnosticEducatifBody = z.infer<typeof updateDiagnosticEducatifSchema.body>
export type UpdateDiagnosticEducatifParams = z.infer<typeof updateDiagnosticEducatifSchema.params>
export type DiagnosticParams = z.infer<typeof diagnosticParamsSchema>
export type DiagnosticPatientParams = z.infer<typeof diagnosticPatientParamsSchema>
```

**Step 3 : Créer `routes/diagnosticEducatifTemplate.ts`**

```typescript
import Boom from '@hapi/boom'
import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod/v4'
import {
  type CreateDiagnosticEducatifTemplateBody,
  type DiagnosticTemplateParams,
  type UpdateDiagnosticEducatifTemplateBody,
  type UpdateDiagnosticEducatifTemplateParams,
  createDiagnosticEducatifTemplateSchema,
  diagnosticEducatifTemplateResponseSchema,
  diagnosticEducatifTemplatesResponseSchema,
  diagnosticTemplateParamsSchema,
  updateDiagnosticEducatifTemplateSchema,
} from '../schemas/diagnosticEducatif.schema'

const diagnosticEducatifTemplateRouter: FastifyPluginAsync = (fastify) => {
  const { diagnosticEducatifTemplateDomain } = fastify.iocContainer

  // Get all
  fastify.get('/', {
    schema: { response: { 200: diagnosticEducatifTemplatesResponseSchema } },
    onRequest: [fastify.verifySessionCookie],
  }, () => diagnosticEducatifTemplateDomain.findAll())

  // Get by ID
  fastify.get<{ Params: DiagnosticTemplateParams }>('/:templateId', {
    schema: {
      params: diagnosticTemplateParamsSchema,
      response: { 200: diagnosticEducatifTemplateResponseSchema, 404: z.object({ message: z.string() }) },
    },
    onRequest: [fastify.verifySessionCookie],
  }, async (request) => {
    const template = await diagnosticEducatifTemplateDomain.findByID(request.params.templateId)
    if (!template) throw Boom.notFound('Template not found')
    return template
  })

  // Create
  fastify.post<{ Body: CreateDiagnosticEducatifTemplateBody }>('/', {
    schema: { body: createDiagnosticEducatifTemplateSchema, response: { 201: diagnosticEducatifTemplateResponseSchema } },
    onRequest: [fastify.verifySessionCookie],
  }, async (request, reply) => {
    const template = await diagnosticEducatifTemplateDomain.create(request.body)
    reply.code(201)
    return template
  })

  // Update
  fastify.patch<{ Params: UpdateDiagnosticEducatifTemplateParams; Body: UpdateDiagnosticEducatifTemplateBody }>('/:templateId', {
    schema: { ...updateDiagnosticEducatifTemplateSchema, response: { 200: diagnosticEducatifTemplateResponseSchema } },
    onRequest: [fastify.verifySessionCookie],
  }, async (request) => {
    return diagnosticEducatifTemplateDomain.update(request.params.templateId, request.body)
  })

  // Delete
  fastify.delete<{ Params: DiagnosticTemplateParams }>('/:templateId', {
    schema: { params: diagnosticTemplateParamsSchema, response: { 204: z.null() } },
    onRequest: [fastify.verifySessionCookie],
  }, async (request, reply) => {
    await diagnosticEducatifTemplateDomain.delete(request.params.templateId)
    reply.code(204).send()
  })

  return Promise.resolve()
}

export { diagnosticEducatifTemplateRouter }
```

**Step 4 : Créer `routes/diagnosticEducatif.ts`**

Même structure que le template router mais :
- Préfixe `/patient/:patientId/diagnostic`
- `findByPatientID` pour le GET `/`
- `create` reçoit `patientId` depuis params + `templateId` optionnel dans body → si `templateId` fourni, récupérer le template et copier `activeFields`

```typescript
import Boom from '@hapi/boom'
import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod/v4'
import {
  type CreateDiagnosticEducatifBody,
  type DiagnosticParams,
  type DiagnosticPatientParams,
  type UpdateDiagnosticEducatifBody,
  type UpdateDiagnosticEducatifParams,
  createDiagnosticEducatifSchema,
  diagnosticEducatifResponseSchema,
  diagnosticEducatifsResponseSchema,
  diagnosticParamsSchema,
  diagnosticPatientParamsSchema,
  updateDiagnosticEducatifSchema,
} from '../schemas/diagnosticEducatif.schema'

const diagnosticEducatifRouter: FastifyPluginAsync = (fastify) => {
  const { diagnosticEducatifDomain, diagnosticEducatifTemplateDomain } = fastify.iocContainer

  // Get all by patient
  fastify.get<{ Params: DiagnosticPatientParams }>('/', {
    schema: {
      params: diagnosticPatientParamsSchema,
      response: { 200: diagnosticEducatifsResponseSchema },
    },
    onRequest: [fastify.verifySessionCookie],
  }, (request) => diagnosticEducatifDomain.findByPatientID(request.params.patientId))

  // Get by ID
  fastify.get<{ Params: DiagnosticParams }>('/:diagnosticId', {
    schema: {
      params: diagnosticParamsSchema,
      response: { 200: diagnosticEducatifResponseSchema, 404: z.object({ message: z.string() }) },
    },
    onRequest: [fastify.verifySessionCookie],
  }, async (request) => {
    const diag = await diagnosticEducatifDomain.findByID(request.params.diagnosticId)
    if (!diag) throw Boom.notFound('DiagnosticEducatif not found')
    return diag
  })

  // Create
  fastify.post<{ Params: DiagnosticPatientParams; Body: CreateDiagnosticEducatifBody }>('/', {
    schema: {
      params: diagnosticPatientParamsSchema,
      body: createDiagnosticEducatifSchema,
      response: { 201: diagnosticEducatifResponseSchema },
    },
    onRequest: [fastify.verifySessionCookie],
  }, async (request, reply) => {
    const { templateId, ...rest } = request.body
    let activeFields: string[] = rest.activeFields ?? []

    if (templateId) {
      const template = await diagnosticEducatifTemplateDomain.findByID(templateId)
      activeFields = template.activeFields
    }

    const diag = await diagnosticEducatifDomain.create({
      ...rest,
      patientId: request.params.patientId,
      templateId,
      activeFields,
    })
    reply.code(201)
    return diag
  })

  // Update
  fastify.patch<{ Params: UpdateDiagnosticEducatifParams; Body: UpdateDiagnosticEducatifBody }>('/:diagnosticId', {
    schema: { ...updateDiagnosticEducatifSchema, response: { 200: diagnosticEducatifResponseSchema } },
    onRequest: [fastify.verifySessionCookie],
  }, async (request) => {
    return diagnosticEducatifDomain.update(request.params.diagnosticId, request.body)
  })

  // Delete
  fastify.delete<{ Params: DiagnosticParams }>('/:diagnosticId', {
    schema: { params: diagnosticParamsSchema, response: { 204: z.null() } },
    onRequest: [fastify.verifySessionCookie],
  }, async (request, reply) => {
    await diagnosticEducatifDomain.delete(request.params.diagnosticId)
    reply.code(204).send()
  })

  return Promise.resolve()
}

export { diagnosticEducatifRouter }
```

**Step 5 : Commit**

```bash
git add back/src/main/interfaces/http/fastify/
git commit -m "feat(routes): add DiagnosticEducatif and Template routes and schemas"
```

---

## Task 6 : Backend — Enregistrement IoC + Routes

**Files:**
- Modify: `back/src/main/application/ioc/awilix/awilix-ioc-container.ts`
- Modify: `back/src/main/interfaces/http/fastify/routes/index.ts`

**Step 1 : Mettre à jour `awilix-ioc-container.ts`**

Ajouter les imports en haut :
```typescript
import { DiagnosticEducatifDomain } from '../../../domain/diagnosticEducatif.domain'
import { DiagnosticEducatifTemplateDomain } from '../../../domain/diagnosticEducatifTemplate.domain'
import { DiagnosticEducatifRepository } from '../../../infra/orm/repositories/diagnosticEducatif.repository'
import { DiagnosticEducatifTemplateRepository } from '../../../infra/orm/repositories/diagnosticEducatifTemplate.repository'
```

Dans le constructeur, après `// Todo` :
```typescript
// DiagnosticEducatif
this.#registerDiagnosticEducatifDomain()
this.#registerDiagnosticEducatifRepository()
// DiagnosticEducatifTemplate
this.#registerDiagnosticEducatifTemplateDomain()
this.#registerDiagnosticEducatifTemplateRepository()
```

Ajouter les méthodes privées :
```typescript
#registerDiagnosticEducatifDomain(): void {
  this.register('diagnosticEducatifDomain', asClass(DiagnosticEducatifDomain).singleton())
}
#registerDiagnosticEducatifRepository(): void {
  this.register('diagnosticEducatifRepository', asClass(DiagnosticEducatifRepository).singleton())
}
#registerDiagnosticEducatifTemplateDomain(): void {
  this.register('diagnosticEducatifTemplateDomain', asClass(DiagnosticEducatifTemplateDomain).singleton())
}
#registerDiagnosticEducatifTemplateRepository(): void {
  this.register('diagnosticEducatifTemplateRepository', asClass(DiagnosticEducatifTemplateRepository).singleton())
}
```

**Step 2 : Mettre à jour `routes/index.ts`**

```typescript
import { diagnosticEducatifRouter } from './diagnosticEducatif'
import { diagnosticEducatifTemplateRouter } from './diagnosticEducatifTemplate'
```

Dans la fonction `routes` :
```typescript
await fastify.register(diagnosticEducatifTemplateRouter, { prefix: '/diagnostic-template' })
await fastify.register(diagnosticEducatifRouter, { prefix: '/patient/:patientId/diagnostic' })
```

**Step 3 : Démarrer le backend et vérifier**

```bash
cd back && bun run dev
curl http://localhost:3000/diagnostic-template
# Expected: []
curl http://localhost:3000/patient/test/diagnostic
# Expected: []
```

**Step 4 : Commit**

```bash
git add back/src/main/application/ back/src/main/interfaces/http/fastify/routes/index.ts
git commit -m "feat(ioc): register DiagnosticEducatif domains and repositories"
```

---

## Task 7 : Frontend — Constant + Types + Process constants

**Files:**
- Create: `front/src/constants/diagnosticEducatif.constant.ts`
- Create: `front/src/types/diagnosticEducatif.ts`
- Modify: `front/src/constants/process.constant.ts`

**Step 1 : Créer `diagnosticEducatif.constant.ts`**

Ce fichier définit la structure complète des sections et champs. À compléter avec les vrais champs médicaux.

```typescript
export type FieldType = 'string' | 'boolean' | 'number' | 'date'

export type DiagnosticField = {
  id: string
  label: string
  type: FieldType
}

export type DiagnosticSection = {
  id: string
  label: string
  fields: DiagnosticField[]
}

export const DIAGNOSTIC_SECTIONS: DiagnosticSection[] = [
  {
    id: 'section_exemple',
    label: 'Section exemple',
    fields: [
      { id: 'section_exemple.champ_texte', label: 'Champ texte', type: 'string' },
      { id: 'section_exemple.champ_bool', label: 'Champ booléen', type: 'boolean' },
    ],
  },
  // ⚠️ Compléter avec les vraies sections/champs
]

export const ALL_FIELD_IDS = DIAGNOSTIC_SECTIONS.flatMap((s) =>
  s.fields.map((f) => f.id)
)
```

**Step 2 : Créer `types/diagnosticEducatif.ts`**

```typescript
export type DiagnosticEducatifTemplate = {
  id: string
  name: string
  activeFields: string[]
}

export type DiagnosticEducatif = {
  id: string
  createdAt: string
  title: string | null
  activeFields: string[]
  patientId: string
  templateId: string | null
  // Champs valeurs (à compléter avec les mêmes noms que Prisma)
  [key: string]: unknown
}

export type CreateDiagnosticEducatifParams = {
  title?: string
  activeFields?: string[]
  templateId?: string
  patientId: string
  [key: string]: unknown
}

export type UpdateDiagnosticEducatifParams = {
  id: string
  activeFields?: string[]
  [key: string]: unknown
}

export type CreateDiagnosticEducatifTemplateParams = {
  name: string
  activeFields: string[]
}

export type UpdateDiagnosticEducatifTemplateParams = {
  id: string
  name?: string
  activeFields?: string[]
}
```

**Step 3 : Mettre à jour `process.constant.ts`**

Ajouter à la fin :

```typescript
export const DIAGNOSTIC_EDUCATIF = {
  GET_BY_PATIENT: 'get_diagnostics_by_patient',
  GET_BY_ID: 'get_diagnostic_by_id',
  CREATE: 'create_diagnostic',
  UPDATE: 'update_diagnostic',
  DELETE: 'delete_diagnostic',
}

export const DIAGNOSTIC_EDUCATIF_TEMPLATE = {
  GET_ALL: 'get_all_diagnostic_templates',
  GET_BY_ID: 'get_diagnostic_template_by_id',
  CREATE: 'create_diagnostic_template',
  UPDATE: 'update_diagnostic_template',
  DELETE: 'delete_diagnostic_template',
}
```

**Step 4 : Commit**

```bash
git add front/src/constants/ front/src/types/diagnosticEducatif.ts
git commit -m "feat(front): add DiagnosticEducatif constants and types"
```

---

## Task 8 : Frontend — API + Queries

**Files:**
- Create: `front/src/api/diagnosticEducatif.api.ts`
- Create: `front/src/queries/useDiagnosticEducatif.ts`

**Step 1 : Créer `diagnosticEducatif.api.ts`**

```typescript
import { apiUrl } from '../constants/config.constant.ts'
import { handleHttpError } from '../libs/httpErrorHandler.ts'
import type {
  CreateDiagnosticEducatifParams,
  CreateDiagnosticEducatifTemplateParams,
  DiagnosticEducatif,
  DiagnosticEducatifTemplate,
  UpdateDiagnosticEducatifParams,
  UpdateDiagnosticEducatifTemplateParams,
} from '../types/diagnosticEducatif.ts'
import { fetchWithAuth } from './fetchWithAuth.ts'

export const DiagnosticEducatifApi = {
  getByPatient: async (patientId: string): Promise<DiagnosticEducatif[]> => {
    const res = await fetchWithAuth(`${apiUrl}/patient/${patientId}/diagnostic`, { method: 'GET' })
    if (!res.ok) handleHttpError(res, {}, 'Impossible de récupérer les diagnostics')
    return res.json()
  },

  getByID: async (patientId: string, diagnosticId: string): Promise<DiagnosticEducatif> => {
    const res = await fetchWithAuth(`${apiUrl}/patient/${patientId}/diagnostic/${diagnosticId}`, { method: 'GET' })
    if (!res.ok) handleHttpError(res, {}, 'Impossible de récupérer le diagnostic')
    return res.json()
  },

  create: async (params: CreateDiagnosticEducatifParams): Promise<DiagnosticEducatif> => {
    const { patientId, ...body } = params
    const res = await fetchWithAuth(`${apiUrl}/patient/${patientId}/diagnostic`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) handleHttpError(res, {}, 'Impossible de créer le diagnostic')
    return res.json()
  },

  update: async (params: UpdateDiagnosticEducatifParams): Promise<DiagnosticEducatif> => {
    const { id, patientId, ...body } = params as UpdateDiagnosticEducatifParams & { patientId: string }
    const res = await fetchWithAuth(`${apiUrl}/patient/${patientId}/diagnostic/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) handleHttpError(res, {}, 'Impossible de mettre à jour le diagnostic')
    return res.json()
  },

  delete: async (patientId: string, diagnosticId: string): Promise<void> => {
    const res = await fetchWithAuth(`${apiUrl}/patient/${patientId}/diagnostic/${diagnosticId}`, { method: 'DELETE' })
    if (!res.ok) handleHttpError(res, {}, 'Impossible de supprimer le diagnostic')
  },
}

export const DiagnosticEducatifTemplateApi = {
  getAll: async (): Promise<DiagnosticEducatifTemplate[]> => {
    const res = await fetchWithAuth(`${apiUrl}/diagnostic-template`, { method: 'GET' })
    if (!res.ok) handleHttpError(res, {}, 'Impossible de récupérer les templates')
    return res.json()
  },

  create: async (params: CreateDiagnosticEducatifTemplateParams): Promise<DiagnosticEducatifTemplate> => {
    const res = await fetchWithAuth(`${apiUrl}/diagnostic-template`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    })
    if (!res.ok) handleHttpError(res, {}, 'Impossible de créer le template')
    return res.json()
  },

  update: async (params: UpdateDiagnosticEducatifTemplateParams): Promise<DiagnosticEducatifTemplate> => {
    const { id, ...body } = params
    const res = await fetchWithAuth(`${apiUrl}/diagnostic-template/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) handleHttpError(res, {}, 'Impossible de mettre à jour le template')
    return res.json()
  },

  delete: async (id: string): Promise<void> => {
    const res = await fetchWithAuth(`${apiUrl}/diagnostic-template/${id}`, { method: 'DELETE' })
    if (!res.ok) handleHttpError(res, {}, 'Impossible de supprimer le template')
  },
}
```

**Step 2 : Créer `queries/useDiagnosticEducatif.ts`**

Suivre exactement le pattern de `usePathway.ts` : `useQuery` pour les lectures, `useMutation` + `queryClient.invalidateQueries` pour les mutations. Clés de query : `[DIAGNOSTIC_EDUCATIF.GET_BY_PATIENT, patientId]`.

```typescript
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { DiagnosticEducatifApi, DiagnosticEducatifTemplateApi } from '../api/diagnosticEducatif.api.ts'
import { DIAGNOSTIC_EDUCATIF, DIAGNOSTIC_EDUCATIF_TEMPLATE } from '../constants/process.constant.ts'
import { TOAST_SEVERITY } from '../constants/ui.constant.ts'
import { useDataFetching } from '../hooks/useDataFetching.ts'
import { useToast } from '../hooks/useToast.ts'
import type {
  CreateDiagnosticEducatifParams,
  CreateDiagnosticEducatifTemplateParams,
  DiagnosticEducatif,
  UpdateDiagnosticEducatifParams,
  UpdateDiagnosticEducatifTemplateParams,
} from '../types/diagnosticEducatif.ts'

export const useDiagnosticsByPatientQuery = (patientId: string) => {
  const { data: diagnostics, isPending, isError, error } = useQuery<DiagnosticEducatif[]>({
    queryKey: [DIAGNOSTIC_EDUCATIF.GET_BY_PATIENT, patientId],
    queryFn: () => DiagnosticEducatifApi.getByPatient(patientId),
    enabled: !!patientId,
    retry: 0,
  })
  useDataFetching({ isPending, isError, error })
  return { diagnostics, isPending }
}

export const useDiagnosticTemplatesQuery = () => {
  const { data: templates, isPending, isError, error } = useQuery({
    queryKey: [DIAGNOSTIC_EDUCATIF_TEMPLATE.GET_ALL],
    queryFn: DiagnosticEducatifTemplateApi.getAll,
    retry: 0,
  })
  useDataFetching({ isPending, isError, error })
  return { templates, isPending }
}

export const useDiagnosticMutations = (patientId: string) => {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const queryKey = [DIAGNOSTIC_EDUCATIF.GET_BY_PATIENT, patientId]

  const createDiagnostic = useMutation({
    mutationFn: DiagnosticEducatifApi.create,
    onSuccess: () => {
      toast({ title: 'Diagnostic créé', severity: TOAST_SEVERITY.SUCCESS })
      queryClient.invalidateQueries({ queryKey })
    },
    onError: (error) => {
      toast({ title: 'Erreur lors de la création', message: error.message, severity: TOAST_SEVERITY.ERROR })
    },
  })

  const updateDiagnostic = useMutation({
    mutationFn: DiagnosticEducatifApi.update,
    onSuccess: () => {
      toast({ title: 'Diagnostic mis à jour', severity: TOAST_SEVERITY.SUCCESS })
      queryClient.invalidateQueries({ queryKey })
    },
    onError: (error) => {
      toast({ title: 'Erreur lors de la mise à jour', message: error.message, severity: TOAST_SEVERITY.ERROR })
    },
  })

  const deleteDiagnostic = useMutation({
    mutationFn: ({ diagnosticId }: { diagnosticId: string }) =>
      DiagnosticEducatifApi.delete(patientId, diagnosticId),
    onSuccess: () => {
      toast({ title: 'Diagnostic supprimé', severity: TOAST_SEVERITY.SUCCESS })
      queryClient.invalidateQueries({ queryKey })
    },
    onError: (error) => {
      toast({ title: 'Erreur lors de la suppression', message: error.message, severity: TOAST_SEVERITY.ERROR })
    },
  })

  return { createDiagnostic, updateDiagnostic, deleteDiagnostic }
}

export const useDiagnosticTemplateMutations = () => {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const queryKey = [DIAGNOSTIC_EDUCATIF_TEMPLATE.GET_ALL]

  const createTemplate = useMutation({
    mutationFn: (params: CreateDiagnosticEducatifTemplateParams) => DiagnosticEducatifTemplateApi.create(params),
    onSuccess: () => {
      toast({ title: 'Template créé', severity: TOAST_SEVERITY.SUCCESS })
      queryClient.invalidateQueries({ queryKey })
    },
    onError: (error) => toast({ title: 'Erreur', message: error.message, severity: TOAST_SEVERITY.ERROR }),
  })

  const updateTemplate = useMutation({
    mutationFn: (params: UpdateDiagnosticEducatifTemplateParams) => DiagnosticEducatifTemplateApi.update(params),
    onSuccess: () => {
      toast({ title: 'Template mis à jour', severity: TOAST_SEVERITY.SUCCESS })
      queryClient.invalidateQueries({ queryKey })
    },
    onError: (error) => toast({ title: 'Erreur', message: error.message, severity: TOAST_SEVERITY.ERROR }),
  })

  const deleteTemplate = useMutation({
    mutationFn: (id: string) => DiagnosticEducatifTemplateApi.delete(id),
    onSuccess: () => {
      toast({ title: 'Template supprimé', severity: TOAST_SEVERITY.SUCCESS })
      queryClient.invalidateQueries({ queryKey })
    },
    onError: (error) => toast({ title: 'Erreur', message: error.message, severity: TOAST_SEVERITY.ERROR }),
  })

  return { createTemplate, updateTemplate, deleteTemplate }
}
```

**Step 3 : Commit**

```bash
git add front/src/api/diagnosticEducatif.api.ts front/src/queries/useDiagnosticEducatif.ts
git commit -m "feat(front): add DiagnosticEducatif API and queries"
```

---

## Task 9 : Frontend — Composants DiagnosticSidebar, DiagnosticView, DiagnosticForm

**Files:**
- Create: `front/src/components/custom/DiagnosticEducatif/diagnostic.sidebar.tsx`
- Create: `front/src/components/custom/DiagnosticEducatif/diagnostic.view.tsx`
- Create: `front/src/components/custom/DiagnosticEducatif/diagnostic.form.tsx`

**Step 1 : Créer `diagnostic.sidebar.tsx`**

Liste des diagnostics du patient avec sélection. Affiche date + titre (ou "Sans titre") + template utilisé.

```tsx
import dayjs from 'dayjs'
import { BriefcaseMedical, Plus } from 'lucide-react'
import { Button } from '../../ui/button.tsx'
import type { DiagnosticEducatif } from '../../../types/diagnosticEducatif.ts'

type Props = {
  diagnostics: DiagnosticEducatif[]
  selectedId: string | null
  onSelect: (id: string) => void
  onNew: () => void
}

export function DiagnosticSidebar({ diagnostics, selectedId, onSelect, onNew }: Props) {
  return (
    <div className="flex flex-col gap-2 w-64 h-full">
      <div className="flex justify-between items-center px-2 py-1">
        <span className="text-sm font-medium text-text-dark">Diagnostics</span>
        <Button variant="ghost" size="icon-sm" onClick={onNew}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      <ul className="flex flex-col gap-1 overflow-y-auto flex-1">
        {diagnostics.length === 0 && (
          <li className="text-xs text-text-light text-center py-6">Aucun diagnostic</li>
        )}
        {diagnostics.map((diag) => (
          <li
            key={diag.id}
            onClick={() => onSelect(diag.id)}
            className={`cursor-pointer px-3 py-2 rounded-md flex items-center gap-2 transition-colors ${
              selectedId === diag.id
                ? 'bg-primary/15 text-primary'
                : 'hover:bg-primary/10 text-text-dark'
            }`}
          >
            <BriefcaseMedical className="h-4 w-4 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">{diag.title ?? 'Sans titre'}</div>
              <div className="text-xs text-text-light">{dayjs(diag.createdAt).format('DD/MM/YYYY')}</div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
```

**Step 2 : Créer `diagnostic.view.tsx`**

Affiche uniquement les sections et champs dont les IDs sont dans `activeFields`. Affiche aussi les valeurs saisies.

```tsx
import { DIAGNOSTIC_SECTIONS } from '../../../constants/diagnosticEducatif.constant.ts'
import type { DiagnosticEducatif } from '../../../types/diagnosticEducatif.ts'
import { Button } from '../../ui/button.tsx'
import { Pencil } from 'lucide-react'
import dayjs from 'dayjs'

type Props = {
  diagnostic: DiagnosticEducatif
  onEdit: () => void
}

export function DiagnosticView({ diagnostic, onEdit }: Props) {
  const activeSections = DIAGNOSTIC_SECTIONS
    .map((section) => ({
      ...section,
      fields: section.fields.filter((f) => diagnostic.activeFields.includes(f.id)),
    }))
    .filter((s) => s.fields.length > 0)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-lg font-semibold text-text-dark">{diagnostic.title ?? 'Sans titre'}</h2>
          <p className="text-xs text-text-light">{dayjs(diagnostic.createdAt).format('DD/MM/YYYY')}</p>
        </div>
        <Button variant="outline" size="sm" onClick={onEdit}>
          <Pencil className="h-4 w-4" />
          Modifier
        </Button>
      </div>

      {activeSections.map((section) => (
        <div key={section.id} className="border border-border rounded-lg p-4">
          <h3 className="text-sm font-semibold text-text-dark mb-3">{section.label}</h3>
          <div className="flex flex-col gap-2">
            {section.fields.map((field) => {
              const value = diagnostic[field.id.replace('.', '_')] // adapter selon nommage Prisma
              return (
                <div key={field.id} className="flex justify-between text-sm">
                  <span className="text-text-light">{field.label}</span>
                  <span className="text-text-dark font-medium">
                    {value === null || value === undefined
                      ? '—'
                      : field.type === 'boolean'
                      ? (value ? 'Oui' : 'Non')
                      : String(value)}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
```

**Step 3 : Créer `diagnostic.form.tsx`**

Affiche toutes les sections avec un toggle actif/inactif par champ + l'input approprié selon le type.

```tsx
import { useState } from 'react'
import { DIAGNOSTIC_SECTIONS } from '../../../constants/diagnosticEducatif.constant.ts'
import type { DiagnosticEducatif } from '../../../types/diagnosticEducatif.ts'
import { Button } from '../../ui/button.tsx'
import { Switch } from '../../ui/switch.tsx'

type Props = {
  diagnostic: DiagnosticEducatif
  onSave: (updates: Partial<DiagnosticEducatif>) => void
  onCancel: () => void
}

export function DiagnosticForm({ diagnostic, onSave, onCancel }: Props) {
  const [activeFields, setActiveFields] = useState<string[]>(diagnostic.activeFields)
  const [values, setValues] = useState<Record<string, unknown>>({ ...diagnostic })

  const toggleField = (fieldId: string) => {
    setActiveFields((prev) =>
      prev.includes(fieldId) ? prev.filter((id) => id !== fieldId) : [...prev, fieldId]
    )
  }

  const handleSubmit = () => {
    onSave({ activeFields, ...values })
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold text-text-dark">Modifier le diagnostic</h2>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onCancel}>Annuler</Button>
          <Button size="sm" onClick={handleSubmit}>Enregistrer</Button>
        </div>
      </div>

      {DIAGNOSTIC_SECTIONS.map((section) => (
        <div key={section.id} className="border border-border rounded-lg p-4">
          <h3 className="text-sm font-semibold text-text-dark mb-3">{section.label}</h3>
          <div className="flex flex-col gap-3">
            {section.fields.map((field) => {
              const isActive = activeFields.includes(field.id)
              const prismaKey = field.id.replace('.', '_') // adapter selon nommage

              return (
                <div key={field.id} className="flex items-center gap-3">
                  <Switch checked={isActive} onCheckedChange={() => toggleField(field.id)} />
                  <span className={`text-sm flex-1 ${isActive ? 'text-text-dark' : 'text-text-light'}`}>
                    {field.label}
                  </span>
                  {isActive && (
                    <div className="w-48">
                      {field.type === 'boolean' ? (
                        <Switch
                          checked={Boolean(values[prismaKey])}
                          onCheckedChange={(v) => setValues((prev) => ({ ...prev, [prismaKey]: v }))}
                        />
                      ) : (
                        <input
                          type={field.type === 'number' ? 'number' : 'text'}
                          value={String(values[prismaKey] ?? '')}
                          onChange={(e) => setValues((prev) => ({ ...prev, [prismaKey]: e.target.value }))}
                          className="w-full h-8 rounded-md border border-border bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                        />
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
```

**Step 4 : Commit**

```bash
git add front/src/components/custom/DiagnosticEducatif/
git commit -m "feat(front): add DiagnosticSidebar, DiagnosticView, DiagnosticForm components"
```

---

## Task 10 : Frontend — Container DiagnosticPatient + intégration page patient

**Files:**
- Create: `front/src/components/custom/Patient/view/diagnostic.patient.tsx`
- Modify: `front/src/routes/_authenticated/patient/$patientID.tsx`

**Step 1 : Créer `diagnostic.patient.tsx`**

Container qui orchestre sidebar + view/form + modal de création.

```tsx
import { useState } from 'react'
import type { Patient } from '../../../../types/patient.ts'
import { DiagnosticSidebar } from '../../DiagnosticEducatif/diagnostic.sidebar.tsx'
import { DiagnosticView } from '../../DiagnosticEducatif/diagnostic.view.tsx'
import { DiagnosticForm } from '../../DiagnosticEducatif/diagnostic.form.tsx'
import {
  useDiagnosticsByPatientQuery,
  useDiagnosticMutations,
  useDiagnosticTemplatesQuery,
} from '../../../../queries/useDiagnosticEducatif.ts'
import { Button } from '../../../ui/button.tsx'
import { BriefcaseMedical } from 'lucide-react'

type Props = { patient: Patient }

export default function DiagnosticPatient({ patient }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editMode, setEditMode] = useState(false)

  const { diagnostics } = useDiagnosticsByPatientQuery(patient.id)
  const { templates } = useDiagnosticTemplatesQuery()
  const { createDiagnostic, updateDiagnostic } = useDiagnosticMutations(patient.id)

  const selected = diagnostics?.find((d) => d.id === selectedId) ?? null

  const handleNew = () => {
    // Pour l'instant : créer sans template, sans titre
    createDiagnostic.mutate(
      { patientId: patient.id, activeFields: [] },
      { onSuccess: (created) => { setSelectedId(created.id); setEditMode(true) } }
    )
  }

  const handleSave = (updates: Record<string, unknown>) => {
    if (!selectedId) return
    updateDiagnostic.mutate(
      { id: selectedId, patientId: patient.id, ...updates },
      { onSuccess: () => setEditMode(false) }
    )
  }

  return (
    <div className="flex gap-4 h-full">
      <div className="border-r border-border pr-4">
        <DiagnosticSidebar
          diagnostics={diagnostics ?? []}
          selectedId={selectedId}
          onSelect={(id) => { setSelectedId(id); setEditMode(false) }}
          onNew={handleNew}
        />
      </div>

      <div className="flex-1 overflow-y-auto">
        {!selected && (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-text-light">
            <BriefcaseMedical className="h-10 w-10" />
            <p className="text-sm">Sélectionnez ou créez un diagnostic</p>
          </div>
        )}
        {selected && !editMode && (
          <DiagnosticView diagnostic={selected} onEdit={() => setEditMode(true)} />
        )}
        {selected && editMode && (
          <DiagnosticForm
            diagnostic={selected}
            onSave={handleSave}
            onCancel={() => setEditMode(false)}
          />
        )}
      </div>
    </div>
  )
}
```

**Step 2 : Mettre à jour `$patientID.tsx`**

Ajouter le menu item "Diagnostic éducatif" dans `menuItems` :

```typescript
import DiagnosticPatient from '../../../components/custom/Patient/view/diagnostic.patient.tsx'

// Dans menuItems :
{
  id: 'diagnostic',
  label: 'Diagnostic éducatif',
  icon: BriefcaseMedical,
},
```

Connecter le bouton `BriefcaseMedical` existant à `setSelected('diagnostic')` :
```tsx
<Button
  type="button"
  variant="default"
  size="default"
  className="flex-1"
  onClick={() => setSelected('diagnostic')}
>
  <BriefcaseMedical className="h-4 w-4" />
  <span className="text-sm">Diagnostic éducatif</span>
</Button>
```

Ajouter le rendu conditionnel :
```tsx
{selected === 'diagnostic' && (
  <DiagnosticPatient patient={patient} />
)}
```

**Step 3 : Commit**

```bash
git add front/src/components/custom/Patient/view/diagnostic.patient.tsx
git add front/src/routes/_authenticated/patient/\$patientID.tsx
git commit -m "feat(front): integrate DiagnosticPatient into patient page"
```

---

## Task 11 : Frontend — Page admin templates

**Files:**
- Create: `front/src/routes/_authenticated/_admin/settings/diagnostic-template.tsx`

**Step 1 : Créer la page**

Suivre le pattern de `thematic.tsx` dans les settings. Liste des templates avec création/édition/suppression. L'édition ouvre une sheet ou un formulaire inline avec les sections/champs et des toggles `Switch` pour les `activeFields`.

```tsx
import { createFileRoute } from '@tanstack/react-router'
import { DIAGNOSTIC_SECTIONS } from '../../../../constants/diagnosticEducatif.constant.ts'
import {
  useDiagnosticTemplatesQuery,
  useDiagnosticTemplateMutations,
} from '../../../../queries/useDiagnosticEducatif.ts'
import DashboardLayout from '../../../../components/dashboard.layout.tsx'
import { Button } from '../../../../components/ui/button.tsx'
import { Switch } from '../../../../components/ui/switch.tsx'
import { useState } from 'react'
import type { DiagnosticEducatifTemplate } from '../../../../types/diagnosticEducatif.ts'
import { Plus, Trash2 } from 'lucide-react'

export const Route = createFileRoute(
  '/_authenticated/_admin/settings/diagnostic-template',
)({ component: DiagnosticTemplateSettings })

function DiagnosticTemplateSettings() {
  const { templates } = useDiagnosticTemplatesQuery()
  const { createTemplate, updateTemplate, deleteTemplate } = useDiagnosticTemplateMutations()
  const [editingId, setEditingId] = useState<string | null>(null)

  const editing = templates?.find((t) => t.id === editingId) ?? null

  const handleCreate = () => {
    createTemplate.mutate(
      { name: 'Nouveau template', activeFields: [] },
      { onSuccess: (t) => setEditingId(t.id) },
    )
  }

  const handleToggleField = (template: DiagnosticEducatifTemplate, fieldId: string) => {
    const activeFields = template.activeFields.includes(fieldId)
      ? template.activeFields.filter((id) => id !== fieldId)
      : [...template.activeFields, fieldId]
    updateTemplate.mutate({ id: template.id, activeFields })
  }

  return (
    <DashboardLayout>
      <div className="flex-1 bg-background p-6 rounded flex flex-col gap-4">
        <div className="flex justify-between items-center">
          <h1 className="text-xl font-semibold text-text-dark">Templates de diagnostic éducatif</h1>
          <Button onClick={handleCreate}>
            <Plus className="h-4 w-4" />
            Nouveau template
          </Button>
        </div>

        <div className="flex gap-4 flex-1">
          {/* Liste */}
          <ul className="w-64 flex flex-col gap-2">
            {templates?.map((t) => (
              <li
                key={t.id}
                onClick={() => setEditingId(t.id)}
                className={`cursor-pointer px-3 py-2 rounded-md border transition-colors flex justify-between items-center ${
                  editingId === t.id ? 'border-primary bg-primary/10' : 'border-border hover:bg-card'
                }`}
              >
                <span className="text-sm text-text-dark">{t.name}</span>
                <Button
                  variant="none"
                  size="icon-sm"
                  onClick={(e) => { e.stopPropagation(); deleteTemplate.mutate(t.id) }}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </li>
            ))}
          </ul>

          {/* Éditeur */}
          {editing && (
            <div className="flex-1 border border-border rounded-lg p-4 flex flex-col gap-4">
              <input
                className="h-9 rounded-md border border-border bg-background px-3 text-sm font-medium focus:outline-none focus:ring-1 focus:ring-ring w-64"
                value={editing.name}
                onChange={(e) => updateTemplate.mutate({ id: editing.id, name: e.target.value })}
              />
              {DIAGNOSTIC_SECTIONS.map((section) => (
                <div key={section.id}>
                  <h3 className="text-sm font-semibold text-text-dark mb-2">{section.label}</h3>
                  <div className="flex flex-col gap-2 pl-2">
                    {section.fields.map((field) => (
                      <div key={field.id} className="flex items-center gap-3">
                        <Switch
                          checked={editing.activeFields.includes(field.id)}
                          onCheckedChange={() => handleToggleField(editing, field.id)}
                        />
                        <span className="text-sm text-text-dark">{field.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  )
}
```

**Step 2 : Vérifier que la route est dans `routeTree.gen.ts`**

Si TanStack Router génère automatiquement le routeTree, la route sera disponible après redémarrage du dev server. Sinon, l'ajouter manuellement dans `routeTree.gen.ts` en suivant le pattern des autres routes `_admin/settings/`.

**Step 3 : Commit**

```bash
git add front/src/routes/_authenticated/_admin/settings/diagnostic-template.tsx
git commit -m "feat(front): add DiagnosticEducatifTemplate admin settings page"
```

---

## Vérification finale

1. Démarrer back + front : `bun run dev` dans chaque dossier
2. Naviguer vers un patient → cliquer "Diagnostic éducatif"
3. Créer un diagnostic → vérifier sidebar + vue
4. Modifier les champs actifs et les valeurs → sauvegarder → retour view mode
5. Aller dans Settings admin → créer un template → configurer les champs actifs
6. Créer un nouveau diagnostic depuis ce template → vérifier `activeFields` copiés
