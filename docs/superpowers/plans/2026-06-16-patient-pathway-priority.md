# Patient pathway priority Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sur la page `Patient/$id`, afficher les **tags** du `PathwayTemplate` au lieu du nom du parcours, permettre de **réordonner par priorité** via drag&drop HTML5 (priorité persistée en base par patient), et n'utiliser que les tags du parcours #1 sur la couverture du PDF.

**Architecture:** Backend Node/Fastify avec Prisma. Nouvelle table de jonction `PatientPathwayPriority` (patient, pathway, priority). Deux endpoints HTTP : `GET /patient/:patientID/pathways` (liste triée) et `PUT /patient/:patientID/pathway-priorities` (réécrit les priorités). Côté React : nouvelle query + mutation avec optimistic update, refonte de `PathwayCard` avec DnD natif (pattern existant de `pathwaySelector.tsx`), et propagation de la liste triée vers le PDF.

**Tech Stack:** Fastify 5, Prisma, Zod v4, React + TanStack Query v5, `@react-pdf/renderer`, HTML5 Drag & Drop natif.

**Spec source:** `docs/superpowers/specs/2026-06-16-patient-pathway-priority-design.md`

**Note on tests:** Le repo n'a pas encore de framework de test installé (CLAUDE.md mentionne que `src/test/` n'existe pas encore). Le hook `pre-commit` exécute `npm test` mais sans tests il passe. Le plan utilise donc **typecheck + lint + run manuel** comme barrières de qualité (`npm run build` côté back, `tsc` côté front), pas TDD. Validation fonctionnelle manuelle à chaque tâche front via `npm run dev`.

---

## File structure

### Backend (`back/`)
- **Modify** `prisma/schema.prisma` — nouveau model `PatientPathwayPriority` + relations inverses sur `Patient` et `Pathway`.
- **Create** `prisma/migrations/<timestamp>_add_patient_pathway_priority/migration.sql` (généré par Prisma).
- **Modify** `src/main/types/infra/orm/repositories/patient.repository.interface.ts` — types des nouvelles méthodes + entité `PatientPathwayEntityRepo`.
- **Modify** `src/main/infra/orm/repositories/patient.repository.ts` — `getPathwaysForPatient`, `setPathwayPriorities`.
- **Modify** `src/main/types/domain/patient.domain.interface.ts` — signatures correspondantes.
- **Modify** `src/main/domain/patient.domain.ts` — `getPathways`, `setPathwayPriorities`.
- **Modify** `src/main/interfaces/http/fastify/schemas/patient.schema.ts` — nouveaux schemas Zod.
- **Modify** `src/main/interfaces/http/fastify/routes/patient.ts` — 2 nouveaux endpoints.

### Frontend (`front/`)
- **Modify** `src/types/patient.ts` — type `PatientPathway`.
- **Modify** `src/constants/process.constant.ts` — clés `GET_PATHWAYS`, `REORDER_PATHWAYS`.
- **Modify** `src/api/patient.api.ts` — `getPathways`, `reorderPathways`.
- **Modify** `src/queries/usePatient.tsx` — `usePatientPathwaysQuery`, mutation `reorderPathways`.
- **Modify** `src/components/custom/Patient/view/overview.patient.tsx` — refonte de `PathwayCard` + DnD + remplace la dérivation depuis slots.
- **Modify** `src/components/custom/Patient/pdf/programme-pdf-modal.tsx` — passe les parcours triés au PDF.
- **Modify** `src/components/custom/Patient/pdf/programme.pdf.tsx` — accepte un prop `pathways`.
- **Modify** `src/components/custom/Patient/pdf/pages/cover-page.pdf.tsx` — lit `pathways[0].templateTags`.

---

## Task 1 : Migration Prisma

**Files:**
- Modify: `back/prisma/schema.prisma`
- Create: `back/prisma/migrations/<timestamp>_add_patient_pathway_priority/migration.sql`

- [ ] **Step 1: Ajouter le model et les relations**

Dans `back/prisma/schema.prisma`, repérer le model `Patient` et y ajouter la relation inverse. Repérer aussi `Pathway`. Puis ajouter le nouveau model à la fin du fichier.

Sur `model Patient`, ajouter dans le bloc des relations :

```prisma
  pathwayPriorities PatientPathwayPriority[]
```

Sur `model Pathway`, ajouter dans le bloc des relations :

```prisma
  patientPriorities PatientPathwayPriority[]
```

Ajouter le nouveau model (n'importe où, mais préférablement après `Pathway` pour la lisibilité) :

```prisma
model PatientPathwayPriority {
  patientID String
  pathwayID String
  priority  Int

  patient Patient @relation(fields: [patientID], references: [id], onDelete: Cascade)
  pathway Pathway @relation(fields: [pathwayID], references: [id], onDelete: Cascade)

  @@id([patientID, pathwayID])
  @@index([patientID, priority])
}
```

- [ ] **Step 2: Générer et appliquer la migration**

```bash
cd back
npm run prisma:migrate:dev -- --name add_patient_pathway_priority
```

Attendu : un nouveau dossier `prisma/migrations/<timestamp>_add_patient_pathway_priority/` est créé avec un `migration.sql` qui contient un `CREATE TABLE "PatientPathwayPriority"`. La commande applique aussi la migration localement et régénère le client Prisma.

- [ ] **Step 3: Vérifier que le client Prisma compile**

```bash
cd back
npm run prisma:generate
npx tsc --noemit
```

Attendu : `prisma generate` se termine sans erreur ; `tsc --noemit` finit sans erreur. Si erreur sur un type inexistant `PatientPathwayPriority`, c'est que le `output` Prisma n'a pas été régénéré : refaire `npm run prisma:generate`.

- [ ] **Step 4: Commit**

```bash
git add back/prisma/schema.prisma back/prisma/migrations
git commit -m "feat(prisma): add PatientPathwayPriority join table"
```

---

## Task 2 : Repository — types

**Files:**
- Modify: `back/src/main/types/infra/orm/repositories/patient.repository.interface.ts`

- [ ] **Step 1: Ajouter le type entité et les signatures de méthodes**

Dans `back/src/main/types/infra/orm/repositories/patient.repository.interface.ts`, juste avant `export interface PatientRepositoryInterface` (vers la ligne 21), ajouter :

```typescript
export type PatientPathwayEntityRepo = {
  pathwayID: string
  templateID: string | null
  templateName: string | null
  templateColor: string | null
  templateTags: string[]
  startDate: Date
  priority: number | null
}
```

Puis, dans l'interface `PatientRepositoryInterface` (entre les méthodes existantes `removeFromPathway` et `countAppointmentsInPathway`, ou à la fin), ajouter :

```typescript
  getPathwaysForPatient: (patientID: string) => Promise<PatientPathwayEntityRepo[]>
  setPathwayPriorities: (
    patientID: string,
    orderedPathwayIDs: string[],
  ) => Promise<void>
```

- [ ] **Step 2: Vérifier que le typecheck passe**

```bash
cd back
npx tsc --noemit
```

Attendu : 2 erreurs sur `patient.repository.ts` parce que la classe `PatientRepository` n'implémente pas encore ces méthodes. C'est OK, on les ajoute dans la tâche suivante.

- [ ] **Step 3: Commit**

```bash
git add back/src/main/types/infra/orm/repositories/patient.repository.interface.ts
git commit -m "feat(types): add patient pathway priority repo interface"
```

---

## Task 3 : Repository — implémentation

**Files:**
- Modify: `back/src/main/infra/orm/repositories/patient.repository.ts`

- [ ] **Step 1: Ajouter l'import du type**

Dans `back/src/main/infra/orm/repositories/patient.repository.ts`, ajouter `PatientPathwayEntityRepo` dans l'import existant depuis l'interface (vers la ligne 3-10) :

```typescript
import type {
  PatientCreateEntityRepo,
  PatientEntityRepo,
  PatientExportFilters,
  PatientPathwayEntityRepo,
  PatientRepositoryInterface,
  PatientUpdateEntityRepo,
  PatientWithTagsEntityRepo,
} from '../../../types/infra/orm/repositories/patient.repository.interface'
```

- [ ] **Step 2: Ajouter `getPathwaysForPatient`**

À ajouter comme nouvelle méthode dans la classe `PatientRepository` (par exemple juste avant `async countAppointmentsInPathway` autour de la ligne 193) :

```typescript
  async getPathwaysForPatient(
    patientID: string,
  ): Promise<PatientPathwayEntityRepo[]> {
    try {
      const pathways = await this.prisma.pathway.findMany({
        where: {
          slots: {
            some: {
              appointments: {
                some: {
                  appointmentPatients: { some: { patientId: patientID } },
                },
              },
            },
          },
        },
        include: {
          template: {
            select: { id: true, name: true, color: true, tags: true },
          },
          patientPriorities: {
            where: { patientID },
            select: { priority: true },
          },
        },
      })

      const result: PatientPathwayEntityRepo[] = pathways.map((p) => ({
        pathwayID: p.id,
        templateID: p.template?.id ?? null,
        templateName: p.template?.name ?? null,
        templateColor: p.template?.color ?? null,
        templateTags: p.template?.tags ?? [],
        startDate: p.startDate,
        priority: p.patientPriorities[0]?.priority ?? null,
      }))

      result.sort((a, b) => {
        const ap = a.priority ?? Number.POSITIVE_INFINITY
        const bp = b.priority ?? Number.POSITIVE_INFINITY
        if (ap !== bp) return ap - bp
        return a.startDate.getTime() - b.startDate.getTime()
      })

      return result
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({
        entityName: 'Pathway',
        error: err,
      })
    }
  }
```

- [ ] **Step 3: Ajouter `setPathwayPriorities`**

À ajouter juste après la méthode précédente :

```typescript
  async setPathwayPriorities(
    patientID: string,
    orderedPathwayIDs: string[],
  ): Promise<void> {
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.patientPathwayPriority.deleteMany({ where: { patientID } })
        if (orderedPathwayIDs.length === 0) return
        await tx.patientPathwayPriority.createMany({
          data: orderedPathwayIDs.map((pathwayID, index) => ({
            patientID,
            pathwayID,
            priority: index,
          })),
        })
      })
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({
        entityName: 'PatientPathwayPriority',
        error: err,
      })
    }
  }
```

- [ ] **Step 4: Typecheck + lint**

```bash
cd back
npx tsc --noemit
npm run lint
```

Attendu : aucune erreur.

- [ ] **Step 5: Commit**

```bash
git add back/src/main/infra/orm/repositories/patient.repository.ts
git commit -m "feat(repo): implement patient pathway priority queries"
```

---

## Task 4 : Domain

**Files:**
- Modify: `back/src/main/types/domain/patient.domain.interface.ts`
- Modify: `back/src/main/domain/patient.domain.ts`

- [ ] **Step 1: Étendre l'interface du domaine**

Dans `back/src/main/types/domain/patient.domain.interface.ts`, juste avant `export interface PatientDomainInterface` (vers la ligne 83), ajouter (réexpose le type repo en type domaine pour ne pas faire fuiter `Date` brut au-delà de la couche) :

```typescript
export type PatientPathwayDomain = {
  pathwayID: string
  templateID: string | null
  templateName: string | null
  templateColor: string | null
  templateTags: string[]
  startDate: Date
  priority: number | null
}
```

Puis, dans l'interface `PatientDomainInterface`, ajouter :

```typescript
  getPathways: (patientID: string) => Promise<PatientPathwayDomain[]>
  setPathwayPriorities: (
    patientID: string,
    orderedPathwayIDs: string[],
  ) => Promise<void>
```

- [ ] **Step 2: Implémenter dans le domaine**

Dans `back/src/main/domain/patient.domain.ts`, ajouter l'import du nouveau type s'il est déjà importé depuis l'interface — sinon, ajouter dans l'import existant :

```typescript
import type {
  PatientDomainInterface,
  PatientPathwayDomain,
  // ...autres imports déjà présents
} from '../types/domain/patient.domain.interface'
```

Puis ajouter les méthodes (par exemple juste après `removeFromPathway` autour de la ligne 200) :

```typescript
  async getPathways(patientID: string): Promise<PatientPathwayDomain[]> {
    return this.patientRepository.getPathwaysForPatient(patientID)
  }

  async setPathwayPriorities(
    patientID: string,
    orderedPathwayIDs: string[],
  ): Promise<void> {
    await this.patientRepository.setPathwayPriorities(
      patientID,
      orderedPathwayIDs,
    )
  }
```

- [ ] **Step 3: Typecheck + lint**

```bash
cd back
npx tsc --noemit
npm run lint
```

Attendu : aucune erreur.

- [ ] **Step 4: Commit**

```bash
git add back/src/main/domain/patient.domain.ts back/src/main/types/domain/patient.domain.interface.ts
git commit -m "feat(domain): expose patient pathway priority operations"
```

---

## Task 5 : Schemas HTTP (Zod)

**Files:**
- Modify: `back/src/main/interfaces/http/fastify/schemas/patient.schema.ts`

- [ ] **Step 1: Ajouter les schemas**

À la fin de `back/src/main/interfaces/http/fastify/schemas/patient.schema.ts`, ajouter :

```typescript
export const patientPathwayItemSchema = z.object({
  pathwayID: z.cuid(),
  templateID: z.string().nullable(),
  templateName: z.string().nullable(),
  templateColor: z.string().nullable(),
  templateTags: z.array(z.string()),
  startDate: z.coerce.date(),
  priority: z.number().int().nullable(),
})

export const patientPathwaysResponseSchema = z.array(patientPathwayItemSchema)

export const reorderPatientPathwaysBodySchema = z.object({
  pathwayIDs: z.array(z.cuid()),
})

export type PatientPathwayItem = z.infer<typeof patientPathwayItemSchema>
export type ReorderPatientPathwaysBody = z.infer<
  typeof reorderPatientPathwaysBodySchema
>
```

Note : `patientPathwayParamsSchema` (qui exige `pathwayID` ET `patientID`) existe déjà — on n'en a pas besoin ici. On réutilise `getPatientByIdParamsSchema` pour les routes qui n'ont besoin que de `patientID`.

- [ ] **Step 2: Typecheck**

```bash
cd back
npx tsc --noemit
```

Attendu : aucune erreur.

- [ ] **Step 3: Commit**

```bash
git add back/src/main/interfaces/http/fastify/schemas/patient.schema.ts
git commit -m "feat(http): add patient pathway priority schemas"
```

---

## Task 6 : Routes HTTP

**Files:**
- Modify: `back/src/main/interfaces/http/fastify/routes/patient.ts`

- [ ] **Step 1: Mettre à jour les imports**

Dans `back/src/main/interfaces/http/fastify/routes/patient.ts`, ajouter aux imports depuis `../schemas/patient.schema` :

```typescript
  patientPathwaysResponseSchema,
  reorderPatientPathwaysBodySchema,
  type ReorderPatientPathwaysBody,
```

- [ ] **Step 2: Ajouter la route GET**

Avant le `return Promise.resolve()` final (autour de la ligne 270), ajouter :

```typescript
  // Get all pathways for a patient (with priority order)
  fastify.get<{ Params: GetPatientByIdParams }>(
    '/:patientID/pathways',
    {
      schema: {
        params: getPatientByIdParamsSchema,
        response: {
          200: patientPathwaysResponseSchema,
        },
      },
      onRequest: [fastify.verifySessionCookie],
    },
    async (request) => {
      return patientDomain.getPathways(request.params.patientID)
    },
  )
```

- [ ] **Step 3: Ajouter la route PUT**

Juste après la GET ajoutée à l'étape précédente :

```typescript
  // Reorder patient pathways by priority
  fastify.put<{
    Params: GetPatientByIdParams
    Body: ReorderPatientPathwaysBody
  }>(
    '/:patientID/pathway-priorities',
    {
      schema: {
        params: getPatientByIdParamsSchema,
        body: reorderPatientPathwaysBodySchema,
        response: {
          204: z.null(),
        },
      },
      onRequest: [fastify.verifySessionCookie],
    },
    async (request, reply) => {
      await patientDomain.setPathwayPriorities(
        request.params.patientID,
        request.body.pathwayIDs,
      )
      return reply.code(204).send()
    },
  )
```

- [ ] **Step 4: Typecheck + lint**

```bash
cd back
npx tsc --noemit
npm run lint
```

Attendu : aucune erreur.

- [ ] **Step 5: Smoke test du serveur**

```bash
cd back
npm run dev
```

Dans un autre terminal :

```bash
curl -i http://localhost:3000/patient/cl_some_known_patient_cuid/pathways \
  -H 'Cookie: session=<your-dev-session-cookie>'
```

Récupérer le cookie depuis le navigateur (DevTools → Application → Cookies) ou se connecter via `bruno/`.

Attendu : code 200 avec un JSON `[]` (ou des entries si le patient a des parcours, toutes avec `priority: null` au début).

Tester aussi le PUT :

```bash
curl -i -X PUT http://localhost:3000/patient/<patientID>/pathway-priorities \
  -H 'Content-Type: application/json' \
  -H 'Cookie: session=<your-dev-session-cookie>' \
  -d '{"pathwayIDs": ["<pathwayID1>", "<pathwayID2>"]}'
```

Attendu : code 204. Refaire le GET → les entries devraient avoir `priority: 0` et `priority: 1` dans l'ordre des IDs.

- [ ] **Step 6: Commit**

```bash
git add back/src/main/interfaces/http/fastify/routes/patient.ts
git commit -m "feat(http): add patient pathway priority routes"
```

---

## Task 7 : Frontend — type + constantes

**Files:**
- Modify: `front/src/types/patient.ts`
- Modify: `front/src/constants/process.constant.ts`

- [ ] **Step 1: Ajouter le type côté front**

Dans `front/src/types/patient.ts`, ajouter (à la fin du fichier) :

```typescript
export type PatientPathway = {
  pathwayID: string
  templateID: string | null
  templateName: string | null
  templateColor: string | null
  templateTags: string[]
  startDate: string
  priority: number | null
}
```

- [ ] **Step 2: Ajouter les clés de process**

Dans `front/src/constants/process.constant.ts`, sur l'objet `PATIENT` (vers la ligne 30), ajouter ces deux clés à la suite :

```typescript
  GET_PATHWAYS: 'get_patient_pathways',
  REORDER_PATHWAYS: 'reorder_patient_pathways',
```

- [ ] **Step 3: Typecheck front**

```bash
cd front
npx tsc --noemit
```

Attendu : aucune erreur (ces ajouts sont autonomes).

- [ ] **Step 4: Commit**

```bash
git add front/src/types/patient.ts front/src/constants/process.constant.ts
git commit -m "feat(front-types): add PatientPathway type and process keys"
```

---

## Task 8 : Frontend — API

**Files:**
- Modify: `front/src/api/patient.api.ts`

- [ ] **Step 1: Ajouter l'import du nouveau type**

Dans `front/src/api/patient.api.ts`, dans l'import existant depuis `../types/patient.ts`, ajouter `PatientPathway`.

- [ ] **Step 2: Ajouter les deux helpers**

À la fin du `PatientApi` object (juste avant la fermeture `}`), ajouter :

```typescript
  getPathways: async (patientID: string): Promise<PatientPathway[]> => {
    const response = await fetchWithAuth(
      `${apiUrl}/patient/${patientID}/pathways`,
      { method: 'GET' },
    )
    if (!response.ok) {
      handleHttpError(
        response,
        {},
        'Impossible de récupérer les parcours du patient',
      )
    }
    return response.json()
  },

  reorderPathways: async (
    patientID: string,
    pathwayIDs: string[],
  ): Promise<void> => {
    const response = await fetchWithAuth(
      `${apiUrl}/patient/${patientID}/pathway-priorities`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pathwayIDs }),
      },
    )
    if (!response.ok) {
      handleHttpError(
        response,
        {},
        'Impossible de réordonner les parcours du patient',
      )
    }
  },
```

- [ ] **Step 3: Typecheck**

```bash
cd front
npx tsc --noemit
```

Attendu : aucune erreur.

- [ ] **Step 4: Commit**

```bash
git add front/src/api/patient.api.ts
git commit -m "feat(api): add patient pathway priority endpoints"
```

---

## Task 9 : Frontend — query + mutation

**Files:**
- Modify: `front/src/queries/usePatient.tsx`

- [ ] **Step 1: Ajouter l'import du nouveau type**

Dans `front/src/queries/usePatient.tsx`, dans l'import existant depuis `../types/patient.ts`, ajouter `PatientPathway`.

- [ ] **Step 2: Ajouter le hook query**

Repérer les hooks existants comme `usePatientByIDQuery` (vers la ligne 46). Ajouter ce nouveau hook export juste après :

```typescript
export const usePatientPathwaysQuery = (patientID: string) => {
  const {
    data: pathways,
    isPending,
    isError,
    error,
  } = useQuery({
    queryKey: [PATIENT.GET_PATHWAYS, patientID],
    queryFn: () => PatientApi.getPathways(patientID),
    enabled: !!patientID,
    retry: 0,
  })

  useDataFetching({ isPending, isError, error })

  return { pathways, isPending, isError, error }
}
```

- [ ] **Step 3: Ajouter la mutation `reorderPathways` dans `usePatientMutations`**

Dans la fonction `usePatientMutations` (qui contient déjà `removeFromPathway`), ajouter avant le `return` final :

```typescript
  const reorderPathways = useMutation({
    mutationKey: [PATIENT.REORDER_PATHWAYS],
    mutationFn: ({
      patientID,
      pathwayIDs,
    }: {
      patientID: string
      pathwayIDs: string[]
    }) => PatientApi.reorderPathways(patientID, pathwayIDs),
    onMutate: async ({ patientID, pathwayIDs }) => {
      await queryClient.cancelQueries({
        queryKey: [PATIENT.GET_PATHWAYS, patientID],
      })

      const previousPathways = queryClient.getQueryData<PatientPathway[]>([
        PATIENT.GET_PATHWAYS,
        patientID,
      ])

      queryClient.setQueryData<PatientPathway[]>(
        [PATIENT.GET_PATHWAYS, patientID],
        (old) => {
          if (!old) return old
          const byID = new Map(old.map((p) => [p.pathwayID, p]))
          const reordered: PatientPathway[] = []
          pathwayIDs.forEach((id, index) => {
            const p = byID.get(id)
            if (p) {
              reordered.push({ ...p, priority: index })
              byID.delete(id)
            }
          })
          // Append remaining (defensive: should be empty)
          byID.forEach((p) => reordered.push(p))
          return reordered
        },
      )

      return { previousPathways, patientID }
    },
    onError: (_, __, context) => {
      if (context?.previousPathways) {
        queryClient.setQueryData(
          [PATIENT.GET_PATHWAYS, context.patientID],
          context.previousPathways,
        )
      }
      toast({
        title: 'Erreur lors de la réorganisation des parcours',
        severity: TOAST_SEVERITY.ERROR,
      })
    },
    onSettled: async (_, __, variables) => {
      await queryClient.invalidateQueries({
        queryKey: [PATIENT.GET_PATHWAYS, variables.patientID],
      })
    },
  })
```

Ajouter `reorderPathways` à l'objet retourné par `usePatientMutations`.

- [ ] **Step 4: Typecheck**

```bash
cd front
npx tsc --noemit
```

Attendu : aucune erreur.

- [ ] **Step 5: Commit**

```bash
git add front/src/queries/usePatient.tsx
git commit -m "feat(queries): add patient pathways query + reorder mutation"
```

---

## Task 10 : Frontend — refonte de `PathwayCard` avec drag & drop

**Files:**
- Modify: `front/src/components/custom/Patient/view/overview.patient.tsx`

- [ ] **Step 1: Ajouter les imports**

Dans `front/src/components/custom/Patient/view/overview.patient.tsx`, dans la liste des imports :

- Sur la ligne d'import lucide (`AlertTriangle, CalendarClock, Route, Siren, X`), ajouter `GripVertical`.
- Ajouter en bas du bloc d'imports :

```typescript
import { usePatientPathwaysQuery } from '../../../../queries/usePatient.tsx'
import type { PatientPathway } from '../../../../types/patient.ts'
```

(Note : `usePatientMutations` est déjà importé.)

- [ ] **Step 2: Récupérer la mutation `reorderPathways`**

Dans le composant `OverviewPatient`, modifier la déstructuration ligne 136 pour inclure la nouvelle mutation et la nouvelle query :

```typescript
  const { dismissEnrollmentIssue, removeFromPathway, reorderPathways } =
    usePatientMutations()
  const { pathways: patientPathways = [] } = usePatientPathwaysQuery(
    patient?.id ?? '',
  )
```

- [ ] **Step 3: Supprimer le `useMemo patientPathways` qui dérive depuis les slots**

Supprimer entièrement le bloc `const patientPathways = useMemo(() => { ... }, [slots, patient])` (lignes 163-192 du fichier original). Le nouveau `patientPathways` vient de la query.

- [ ] **Step 4: Adapter `handleRemoveClick`**

La forme des objets de la liste a changé. Adapter la fonction `handleRemoveClick` (vers la ligne 200) :

```typescript
  const handleRemoveClick = useCallback(
    async (pathwayID: string) => {
      if (!patient) return
      const { count } = await PatientApi.getAppointmentsCountInPathway(
        patient.id,
        pathwayID,
      )
      const pathway = patientPathways.find((p) => p.pathwayID === pathwayID)
      setRemoveTarget({
        pathwayID,
        name:
          pathway?.templateTags && pathway.templateTags.length > 0
            ? pathway.templateTags.join(' / ')
            : pathway?.templateName ?? 'Parcours',
        count,
      })
    },
    [patient, patientPathways],
  )
```

- [ ] **Step 5: Refondre `PathwayCard`**

Remplacer entièrement la définition du composant `PathwayCard` (lignes 88-132 du fichier original) par :

```typescript
function PathwayCard({
  pathway,
  index,
  isDragged,
  onDragStart,
  onDragOver,
  onDragEnd,
  onRemove,
}: {
  pathway: PatientPathway
  index: number
  isDragged: boolean
  onDragStart: (index: number) => void
  onDragOver: (e: React.DragEvent, index: number) => void
  onDragEnd: () => void
  onRemove: (pathwayID: string) => void
}) {
  const color = pathway.templateColor ?? '#6b7280'
  const formattedDate = dayjs
    .utc(pathway.startDate)
    .format('D MMMM YYYY')
    .replace(/^./, (c) => c.toUpperCase())

  const hasTags = pathway.templateTags.length > 0

  return (
    <li
      draggable
      onDragStart={() => onDragStart(index)}
      onDragOver={(e) => onDragOver(e, index)}
      onDragEnd={onDragEnd}
      className={`flex items-center gap-2 rounded-lg px-3 py-2 border border-border bg-white transition-all ${
        isDragged ? 'opacity-50' : 'opacity-100'
      }`}
    >
      <GripVertical className="h-4 w-4 text-text-light flex-shrink-0 cursor-move" />
      <div className="flex flex-wrap gap-1 flex-1 min-w-0">
        {hasTags ? (
          pathway.templateTags.map((tag) => (
            <span
              key={tag}
              className="inline-block px-2 py-1 rounded text-xs font-medium border"
              style={{
                backgroundColor: hexToRGBA(color, 0.15),
                color: getContrastTextColor(color),
                borderColor: hexToRGBA(color, 0.6),
              }}
            >
              {tag}
            </span>
          ))
        ) : (
          <span
            className="inline-block px-2 py-1 rounded text-xs font-medium border"
            style={{
              backgroundColor: hexToRGBA(color, 0.15),
              color: getContrastTextColor(color),
              borderColor: hexToRGBA(color, 0.6),
            }}
          >
            {pathway.templateName ?? 'Parcours'}
          </span>
        )}
      </div>
      <span className="text-xs text-text-sidebar flex-shrink-0">
        Début : {formattedDate}
      </span>
      <button
        type="button"
        onClick={() => onRemove(pathway.pathwayID)}
        className="cursor-pointer flex-shrink-0 rounded p-1 text-text-light hover:bg-destructive/10 hover:text-destructive transition-colors"
        aria-label="Retirer du parcours"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </li>
  )
}
```

Ajouter `import type React from 'react'` en haut du fichier si l'import n'est pas déjà là.

- [ ] **Step 6: Ajouter le state DnD et les handlers dans `OverviewPatient`**

Dans le composant `OverviewPatient`, ajouter (par exemple juste après les `useState` existants comme `removeTarget`) :

```typescript
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null)

  const handleDragStart = useCallback(
    (index: number) => setDraggedIndex(index),
    [],
  )

  const handleDragOver = useCallback(
    (e: React.DragEvent, index: number) => {
      e.preventDefault()
      if (!patient || draggedIndex === null || draggedIndex === index) return

      const next = [...patientPathways]
      const [moved] = next.splice(draggedIndex, 1)
      next.splice(index, 0, moved)
      setDraggedIndex(index)

      reorderPathways.mutate({
        patientID: patient.id,
        pathwayIDs: next.map((p) => p.pathwayID),
      })
    },
    [draggedIndex, patientPathways, patient, reorderPathways],
  )

  const handleDragEnd = useCallback(() => setDraggedIndex(null), [])
```

Note : on déclenche la mutation à chaque `onDragOver` qui réordonne, car la mutation a un `mutationKey` et React Query déduplique les calls. L'optimistic update gère la sync visuelle. Alternative plus économe en requêtes : ne déclencher qu'à `onDragEnd`, en gardant un buffer local. On commence simple, on optimisera si nécessaire.

- [ ] **Step 7: Mettre à jour le rendu de la liste**

Repérer le `{patientPathways.map((pathway) => (...))}` (vers la ligne 271). Remplacer par :

```tsx
            <ul className="flex flex-col gap-1.5">
              {patientPathways.map((pathway, index) => (
                <PathwayCard
                  key={pathway.pathwayID}
                  pathway={pathway}
                  index={index}
                  isDragged={draggedIndex === index}
                  onDragStart={handleDragStart}
                  onDragOver={handleDragOver}
                  onDragEnd={handleDragEnd}
                  onRemove={handleRemoveClick}
                />
              ))}
            </ul>
```

(Le conteneur passe de `div` à `ul` pour rester accessible.)

- [ ] **Step 8: Typecheck + lint**

```bash
cd front
npx tsc --noemit
cd ../back
npm run lint
```

(Le projet n'a pas de lint front configuré ici à ma connaissance — si `npm run lint` existe côté front, l'exécuter aussi.)

Attendu : aucune erreur de type. Les imports inutiles (par ex. `Route` si plus utilisé) doivent être supprimés.

- [ ] **Step 9: Validation manuelle**

```bash
cd front
npm run dev
```

Dans un autre terminal :

```bash
cd back
npm run dev
```

Aller sur `/patient/<id>` d'un patient avec ≥ 2 parcours. Vérifier :

1. La section "Parcours" affiche **toutes les pastilles de tags** (et pas le nom) pour chaque carte.
2. Drag d'une carte vers le haut → l'ordre change visuellement instantanément.
3. Rafraîchir la page → le nouvel ordre est conservé.
4. Supprimer un parcours via le X → le parcours disparaît et la modale de confirm affiche les tags joints (pas le nom seul) en titre.

- [ ] **Step 10: Commit**

```bash
git add front/src/components/custom/Patient/view/overview.patient.tsx
git commit -m "feat(patient-overview): show pathway tags and reorder by priority"
```

---

## Task 11 : Frontend — PDF cover

**Files:**
- Modify: `front/src/components/custom/Patient/pdf/pages/cover-page.pdf.tsx`
- Modify: `front/src/components/custom/Patient/pdf/programme.pdf.tsx`
- Modify: `front/src/components/custom/Patient/pdf/programme-pdf-modal.tsx`

- [ ] **Step 1: Étendre la signature de `CoverPage`**

Dans `front/src/components/custom/Patient/pdf/pages/cover-page.pdf.tsx`, mettre à jour l'import de types :

```typescript
import type { Patient, PatientPathway } from '../../../../../types/patient.ts'
```

Modifier la signature et le calcul de `programLabel` (lignes 103-118 du fichier original) :

```typescript
export default function CoverPage({
  patient,
  upcomingSlots,
  pathways,
}: {
  patient: Patient
  upcomingSlots: Slot[]
  pathways: PatientPathway[]
}) {
  const duration = computeProgramDuration(upcomingSlots)
  const patientLabel = `${patient.firstName} ${patient.lastName}`

  const firstPathway = pathways[0]
  let programLabel = 'Programme'
  if (firstPathway) {
    if (firstPathway.templateTags.length > 0) {
      programLabel = firstPathway.templateTags.join(' / ')
    } else if (firstPathway.templateName) {
      programLabel = firstPathway.templateName
    }
  }
```

Laisser le reste du JSX inchangé.

- [ ] **Step 2: Propager `pathways` dans `ProgrammePDF`**

Dans `front/src/components/custom/Patient/pdf/programme.pdf.tsx`, ajouter l'import et le prop :

```typescript
import type { Patient, PatientPathway } from '../../../../types/patient.ts'
import type { Slot } from '../../../../types/slot.ts'
// ...autres imports

interface ProgrammePDFProps {
  patient: Patient
  upcomingSlots: Slot[]
  pathways: PatientPathway[]
}

export default function ProgrammePDF({
  patient,
  upcomingSlots,
  pathways,
}: ProgrammePDFProps) {
  return (
    <Document>
      <CoverPage patient={patient} upcomingSlots={upcomingSlots} pathways={pathways} />
      <CalendarPages upcomingSlots={upcomingSlots} />
      <TipsPage />
    </Document>
  )
}
```

- [ ] **Step 3: Charger et transmettre les parcours triés depuis la modale**

Dans `front/src/components/custom/Patient/pdf/programme-pdf-modal.tsx`, importer la query :

```typescript
import { usePatientPathwaysQuery } from '../../../../queries/usePatient.tsx'
```

Récupérer les parcours triés dans le composant (sous le `useAllSlotsQuery`) :

```typescript
  const { pathways = [] } = usePatientPathwaysQuery(patient.id)
```

Puis passer `pathways` au composant `ProgrammePDF` :

```tsx
  const pdfDocument = (
    <ProgrammePDF
      patient={patient}
      upcomingSlots={patientSlots}
      pathways={pathways}
    />
  )
```

- [ ] **Step 4: Typecheck**

```bash
cd front
npx tsc --noemit
```

Attendu : aucune erreur.

- [ ] **Step 5: Validation manuelle**

Avec back et front toujours lancés :

1. Sur la page Patient, réordonner les parcours via DnD.
2. Ouvrir la modale "Générer le programme PDF".
3. Vérifier que la couverture du PDF affiche **les tags joints par `' / '`** du parcours en première position (et non les noms de tous les parcours).
4. Réordonner différemment et regénérer le PDF → la couverture reflète le nouveau parcours #1.
5. Cas limite : patient sans parcours → couverture affiche "Programme".

- [ ] **Step 6: Commit**

```bash
git add front/src/components/custom/Patient/pdf
git commit -m "feat(patient-pdf): show priority-1 pathway tags on cover"
```

---

## Task 12 : Régressions et nettoyage final

**Files:** (validation seulement, pas de modification supposée)

- [ ] **Step 1: Lancer le build complet côté back**

```bash
cd back
npm run build
```

Attendu : `prisma generate` + `tsc --noemit` + SWC, tout passe.

- [ ] **Step 2: Vérifier que les autres consommateurs de `useAllSlotsQuery` continuent de fonctionner**

Avec back et front lancés, naviguer sur :

- `/dashboard` — la liste des rendez-vous s'affiche correctement.
- `/_admin/settings/planning` — le planning admin fonctionne.
- `/patient/<id>` onglet "Planning" — l'agenda du patient s'affiche.

Aucune régression attendue puisqu'on n'a pas touché à `useAllSlotsQuery` ni aux fichiers qui le consomment, mais bon réflexe à avoir.

- [ ] **Step 3: Vérifier la cascade de suppression**

Sur un patient avec une priorité réordonnée :

1. Cliquer X sur le parcours réordonné → confirmer.
2. Vérifier en base (via `npm run prisma:studio` côté back) que les lignes `PatientPathwayPriority` correspondantes ont été supprimées (cascade via `onDelete: Cascade`).

Si le patient est complètement détaché du Pathway (plus aucun appointment) le Pathway lui-même est inchangé en théorie, mais la ligne `PatientPathwayPriority` doit disparaître quand le Pathway est supprimé.

- [ ] **Step 4: Pas de commit si rien à modifier**

Si une régression apparaît, créer une tâche de correction. Sinon, la feature est complète.

---

## Spec coverage check (auto-check par l'engineer avant de clôturer)

| Spec | Tâche |
|---|---|
| Affichage des tags à la place des noms | Task 10 step 5 |
| Drag & drop natif HTML5 (pattern pathwaySelector) | Task 10 steps 5-7 |
| Priorité persistée en base, par patient | Tasks 1-6 |
| Top-priority pathway tags sur PDF cover | Task 11 |
| `useAllSlotsQuery` reste utilisé pour les RDV à venir/passés | Task 10 step 3 (on enlève juste la dérivation pathways) |
| Cascade sur suppression Pathway/Patient | Task 1 (`onDelete: Cascade`), Task 12 step 3 (vérif manuelle) |
| Lazy creation des priorités | Task 3 step 3 (deleteMany + createMany, donc seul un réordonnancement crée les lignes) |
