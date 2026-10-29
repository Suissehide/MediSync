# Détection des conflits de planification — plan d'implémentation (MDS-39)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Signaler, sans jamais bloquer, les créneaux qui partagent une salle sur des horaires qui se chevauchent, les patients pris deux fois au même moment et les rendez-vous qui dépassent la capacité.

**Architecture:** Une fonction pure `detectConflicts` côté back, alimentée par `slotRepository.findAll` (qui charge déjà salle, capacité, rendez-vous et patients). `GET /slot/conflicts` sert les badges ; les `POST`/`PATCH` de créneau et de rendez-vous renvoient en plus `conflicts` pour le toast. Côté front, une requête de conflits rafraîchie avec les créneaux, une fonction de libellés, un badge partagé (calendrier et agenda du jour).

**Tech Stack:** Fastify + Zod v4 + Prisma (back), Jest (unit/e2e) ; React + TanStack Query + FullCalendar + Vitest (front) ; Biome.

**Spec:** `docs/superpowers/specs/2026-10-20-conflits-planification-design.md`

## Global Constraints

- Trois règles seulement : `salle`, `patient`, `capacite`. Pas de règle soignant.
- Chevauchement : `a.start < b.end && a.end > b.start` ; bout à bout = pas de conflit.
- Créneaux archivés (`archivedAt` renseigné) ignorés.
- Capacité vide (`null`) = pas de limite, rien n'est signalé. La capacité se compte par rendez-vous (patients distincts d'un rendez-vous).
- Rien n'est bloqué, aucun forçage, aucune entrée dans le journal d'activité.
- Génération de parcours et inscription en masse non modifiées.
- Lint/format : Biome, jamais ESLint/Prettier ; jamais de `biome-ignore`.
- Commentaires d'une ligne au plus, en français, comme le code environnant.
- Dates : le front formate les heures avec `dayjs.utc(...)`, comme `formatRange`.

## Review Focus

- Deux créneaux bout à bout dans la même salle (9h–10h puis 10h–11h) : aucun conflit → test unitaire, Task 1.
- Créneau sans salle à côté d'un autre créneau sans salle : pas de conflit `salle` (deux `null` ne sont pas « la même salle ») → test unitaire, Task 1.
- Même patient sur deux rendez-vous du **même** créneau individuel qui se chevauchent : conflit `patient` avec un seul `slotID` → test unitaire, Task 1 ; libellé dédié → test Vitest, Task 3.
- `GET /slot/conflicts` ne doit pas être capturé par `GET /slot/:slotID` (réponse 200 avec `{ conflicts }`, pas une 400 de validation cuid) → test e2e, Task 2.
- La requête des conflits ne doit pas être touchée par les mises à jour optimistes de `updateSlotCaches` (qui écrit dans toutes les clés `[SLOT.GET_ALL, …]`) : clé distincte `SLOT.CONFLICTS`, sinon création de créneau → `TypeError` → contrôle navigateur, Task 4.

---

## Préparation du worktree (une fois, avant la Task 1)

Le worktree est `/Users/couffinhal/Documents/MediSync/.claude/worktrees/conflits-planification`. Il n'a ni dépendances ni `.env` :

```bash
cd /Users/couffinhal/Documents/MediSync/.claude/worktrees/conflits-planification
cp ../../../back/.env back/.env
cp ../../../back/.env.test.local back/.env.test.local
cp ../../../front/.env front/.env
(cd back && npm ci && npm run prisma:generate)
(cd front && npm ci)
```

Commandes de test (depuis `back/`) :

- Unitaires : `NODE_OPTIONS=--experimental-vm-modules npx jest -c src/test/jest.config.ts --selectProjects unit <chemin>`
- E2E : `npm run prisma:migrate:deploy:test` une fois, puis `NODE_OPTIONS=--experimental-vm-modules npx dotenv-cli@7.3.0 -e .env.test.local -e .env.test -- npx jest --runInBand -c src/test/jest.config.ts --selectProjects e2e <chemin>`

Front (depuis `front/`) : `npx vitest run <chemin>`. Lint : `npx biome check <fichiers>` dans `back/` ou `front/`.

Les tests et serveurs se lancent au premier plan (jamais en arrière-plan). Un serveur de test se tue par son PID ou son port, jamais avec un `pkill` large.

---

### Task 1: Détection pure côté back

**Files:**
- Create: `back/src/main/utils/planning-conflicts.ts`
- Test: `back/src/test/unit/utils/planning-conflicts.test.ts`

**Interfaces:**
- Produces :
  - `type ConflictSlot` (structure minimale ; `SlotDTODomain` la satisfait)
  - `type PlanningConflict`
  - `detectConflicts(slots: ConflictSlot[]): PlanningConflict[]`

- [ ] **Step 1: Write the failing test**

`back/src/test/unit/utils/planning-conflicts.test.ts` :

```ts
import {
  type ConflictSlot,
  detectConflicts,
} from '../../../main/utils/planning-conflicts'

const at = (hour: string) => new Date(`2026-04-01T${hour}:00.000Z`)

const slot = (
  id: string,
  start: string,
  end: string,
  overrides: Partial<ConflictSlot> = {},
): ConflictSlot => ({
  id,
  startDate: at(start),
  endDate: at(end),
  archivedAt: null,
  slotTemplate: { locationID: null, capacity: null },
  appointments: [],
  ...overrides,
})

const appointment = (
  id: string,
  start: string,
  end: string,
  patientIds: string[],
) => ({
  id,
  startDate: at(start),
  endDate: at(end),
  appointmentPatients: patientIds.map((patientId) => ({ patientId })),
})

describe('detectConflicts', () => {
  describe('salle', () => {
    it('signale deux creneaux qui se chevauchent dans la meme salle', () => {
      const salle = { locationID: 'loc-1', capacity: null }
      expect(
        detectConflicts([
          slot('a', '09:00', '10:00', { slotTemplate: salle }),
          slot('b', '09:30', '10:30', { slotTemplate: salle }),
        ]),
      ).toEqual([{ type: 'salle', slotIDs: ['a', 'b'], locationID: 'loc-1' }])
    })

    it('ne signale pas deux creneaux bout a bout', () => {
      const salle = { locationID: 'loc-1', capacity: null }
      expect(
        detectConflicts([
          slot('a', '09:00', '10:00', { slotTemplate: salle }),
          slot('b', '10:00', '11:00', { slotTemplate: salle }),
        ]),
      ).toEqual([])
    })

    it('ne signale pas deux salles differentes ni deux creneaux sans salle', () => {
      expect(
        detectConflicts([
          slot('a', '09:00', '10:00', {
            slotTemplate: { locationID: 'loc-1', capacity: null },
          }),
          slot('b', '09:00', '10:00', {
            slotTemplate: { locationID: 'loc-2', capacity: null },
          }),
          slot('c', '09:00', '10:00'),
          slot('d', '09:00', '10:00'),
        ]),
      ).toEqual([])
    })

    it('ignore un creneau archive', () => {
      const salle = { locationID: 'loc-1', capacity: null }
      expect(
        detectConflicts([
          slot('a', '09:00', '10:00', { slotTemplate: salle }),
          slot('b', '09:00', '10:00', {
            slotTemplate: salle,
            archivedAt: at('08:00'),
          }),
        ]),
      ).toEqual([])
    })
  })

  describe('patient', () => {
    it('signale un patient sur deux rendez-vous de creneaux differents qui se chevauchent', () => {
      expect(
        detectConflicts([
          slot('a', '09:00', '10:00', {
            appointments: [appointment('r1', '09:00', '10:00', ['p1'])],
          }),
          slot('b', '09:30', '11:00', {
            appointments: [appointment('r2', '09:30', '10:00', ['p1', 'p2'])],
          }),
        ]),
      ).toEqual([
        {
          type: 'patient',
          slotIDs: ['a', 'b'],
          appointmentIDs: ['r1', 'r2'],
          patientID: 'p1',
        },
      ])
    })

    it('signale deux rendez-vous du meme creneau qui se chevauchent avec un seul slotID', () => {
      expect(
        detectConflicts([
          slot('a', '09:00', '11:00', {
            appointments: [
              appointment('r1', '09:00', '10:00', ['p1']),
              appointment('r2', '09:30', '10:30', ['p1']),
            ],
          }),
        ]),
      ).toEqual([
        {
          type: 'patient',
          slotIDs: ['a'],
          appointmentIDs: ['r1', 'r2'],
          patientID: 'p1',
        },
      ])
    })

    it('ne signale pas des rendez-vous bout a bout ni des patients differents', () => {
      expect(
        detectConflicts([
          slot('a', '09:00', '11:00', {
            appointments: [
              appointment('r1', '09:00', '09:30', ['p1']),
              appointment('r2', '09:30', '10:00', ['p1']),
              appointment('r3', '09:00', '10:00', ['p2']),
            ],
          }),
        ]),
      ).toEqual([])
    })
  })

  describe('capacite', () => {
    it('signale un rendez-vous qui depasse la capacite', () => {
      expect(
        detectConflicts([
          slot('a', '09:00', '10:00', {
            slotTemplate: { locationID: null, capacity: 2 },
            appointments: [appointment('r1', '09:00', '10:00', ['p1', 'p2', 'p3'])],
          }),
        ]),
      ).toEqual([
        {
          type: 'capacite',
          slotIDs: ['a'],
          appointmentID: 'r1',
          capacity: 2,
          count: 3,
        },
      ])
    })

    it('ne signale rien a capacite atteinte ni quand la capacite est vide', () => {
      expect(
        detectConflicts([
          slot('a', '09:00', '10:00', {
            slotTemplate: { locationID: null, capacity: 2 },
            appointments: [appointment('r1', '09:00', '10:00', ['p1', 'p2'])],
          }),
          slot('b', '11:00', '12:00', {
            appointments: [appointment('r2', '11:00', '12:00', ['p3', 'p4', 'p5'])],
          }),
        ]),
      ).toEqual([])
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run (depuis `back/`) : `NODE_OPTIONS=--experimental-vm-modules npx jest -c src/test/jest.config.ts --selectProjects unit src/test/unit/utils/planning-conflicts.test.ts`
Expected: FAIL, module `planning-conflicts` introuvable.

- [ ] **Step 3: Write minimal implementation**

`back/src/main/utils/planning-conflicts.ts` :

```ts
type Interval = { startDate: Date; endDate: Date }

type ConflictAppointment = Interval & {
  id: string
  appointmentPatients: { patientId: string }[]
}

export type ConflictSlot = Interval & {
  id: string
  archivedAt?: Date | null
  slotTemplate: { locationID?: string | null; capacity?: number | null }
  appointments: ConflictAppointment[]
}

export type PlanningConflict =
  | { type: 'salle'; slotIDs: string[]; locationID: string }
  | {
      type: 'patient'
      slotIDs: string[]
      appointmentIDs: string[]
      patientID: string
    }
  | {
      type: 'capacite'
      slotIDs: string[]
      appointmentID: string
      capacity: number
      count: number
    }

const overlaps = (a: Interval, b: Interval) =>
  a.startDate < b.endDate && a.endDate > b.startDate

// ponytail: comparaison par paires en O(n²), suffit pour une semaine de service ; balayage trié si les plages s'allongent.
export const detectConflicts = (slots: ConflictSlot[]): PlanningConflict[] => {
  const live = slots.filter((slot) => !slot.archivedAt)
  const conflicts: PlanningConflict[] = []

  live.forEach((a, index) => {
    const locationID = a.slotTemplate.locationID
    for (const b of live.slice(index + 1)) {
      if (
        locationID &&
        locationID === b.slotTemplate.locationID &&
        overlaps(a, b)
      ) {
        conflicts.push({ type: 'salle', slotIDs: [a.id, b.id], locationID })
      }
    }
  })

  const appointments = live.flatMap((slot) =>
    slot.appointments.map((appointment) => ({
      ...appointment,
      slotID: slot.id,
    })),
  )
  appointments.forEach((a, index) => {
    for (const b of appointments.slice(index + 1)) {
      if (!overlaps(a, b)) {
        continue
      }
      const bPatients = new Set(b.appointmentPatients.map((p) => p.patientId))
      for (const { patientId } of a.appointmentPatients) {
        if (bPatients.has(patientId)) {
          conflicts.push({
            type: 'patient',
            slotIDs: [...new Set([a.slotID, b.slotID])],
            appointmentIDs: [a.id, b.id],
            patientID: patientId,
          })
        }
      }
    }
  })

  for (const slot of live) {
    const { capacity } = slot.slotTemplate
    if (capacity === null || capacity === undefined) {
      continue
    }
    for (const appointment of slot.appointments) {
      const count = new Set(
        appointment.appointmentPatients.map((p) => p.patientId),
      ).size
      if (count > capacity) {
        conflicts.push({
          type: 'capacite',
          slotIDs: [slot.id],
          appointmentID: appointment.id,
          capacity,
          count,
        })
      }
    }
  }

  return conflicts
}
```

- [ ] **Step 4: Run test to verify it passes**

Même commande qu'au Step 2. Expected: 9 tests PASS. Puis `npx biome check src/main/utils/planning-conflicts.ts src/test/unit/utils/planning-conflicts.test.ts` : aucun diagnostic (appliquer `npx biome check --write` pour le format seulement).

- [ ] **Step 5: Commit**

```bash
git add back/src/main/utils/planning-conflicts.ts back/src/test/unit/utils/planning-conflicts.test.ts
git commit -m "feat(planning): detection pure des conflits salle, patient et capacite (MDS-39)"
```

---

### Task 2: Endpoint et champ `conflicts` sur les écritures

**Files:**
- Create: `back/src/main/interfaces/http/fastify/schemas/planningConflict.schema.ts`
- Modify: `back/src/main/types/domain/slot.domain.interface.ts` (interface `SlotDomainInterface`)
- Modify: `back/src/main/domain/slot.domain.ts`
- Modify: `back/src/main/interfaces/http/fastify/schemas/slot.schema.ts`
- Modify: `back/src/main/interfaces/http/fastify/schemas/appointment.schema.ts`
- Modify: `back/src/main/interfaces/http/fastify/routes/slot.ts` (routes `GET /`, `POST /`, `PATCH /:slotID`)
- Modify: `back/src/main/interfaces/http/fastify/routes/appointment.ts` (routes `POST /` l.71, `PATCH /:appointmentID` l.93)
- Test: `back/src/test/e2e/conflits-planification.test.ts`

**Interfaces:**
- Consumes : `detectConflicts`, `PlanningConflict` (Task 1).
- Produces (contrat HTTP utilisé par les Tasks 3 à 5) :
  - `GET /slot/conflicts?from=YYYY-MM-DD&to=YYYY-MM-DD` (`to` exclusive, comme `GET /slot`), permission `planning:read`, renvoie `{ conflicts: PlanningConflict[] }`.
  - `POST /slot`, `PATCH /slot/:slotID`, `POST /appointment` et `PATCH /appointment/:appointmentID` renvoient leur corps habituel plus `conflicts: PlanningConflict[]` (les conflits qui touchent le créneau concerné).
  - `SlotDomain.findConflicts({ from, to }: { from: Date; to: Date }): Promise<PlanningConflict[]>`
  - `SlotDomain.conflictsOf(slotID: string): Promise<PlanningConflict[]>`

- [ ] **Step 1: Write the failing e2e test**

`back/src/test/e2e/conflits-planification.test.ts` :

```ts
import { buildTestApp, type TestApp } from './setup/app'
import { testDb, truncateAll } from './setup/db'
import {
  createEstablishment,
  createService,
  createUser,
  signIn,
  tenantUrl,
} from './setup/fixtures'

type Cookies = { access_token: string }

// Les conflits sont signales sans bloquer : l'ecriture passe et la reponse les porte.
describe('conflits de planification', () => {
  let testApp: TestApp
  let establishmentId: string
  let serviceId: string
  let cookies: Cookies
  let locationID: string

  const url = (path: string) => tenantUrl(establishmentId, serviceId, path)

  const creneau = async (start: string, end: string, salle?: string) => {
    const slotTemplate = await testDb.slotTemplate.create({
      data: {
        startTime: new Date(start),
        endTime: new Date(end),
        offsetDays: 0,
        isIndividual: true,
        color: '#fff',
        locationID: salle,
        serviceId,
        establishmentId,
      },
    })
    return testDb.slot.create({
      data: {
        startDate: new Date(start),
        endDate: new Date(end),
        slotTemplateID: slotTemplate.id,
        serviceId,
        establishmentId,
      },
    })
  }

  beforeAll(async () => {
    await truncateAll()
    const establishment = await createEstablishment('E-CONFLITS')
    establishmentId = establishment.id
    const service = await createService(establishmentId, 'S-CONFLITS')
    serviceId = service.id
    await createUser({
      email: 'coordinateur@conflits.fr',
      memberships: [
        {
          establishmentId,
          role: 'MEMBER',
          services: [{ serviceId, role: 'COORDINATEUR' }],
        },
      ],
    })
    const location = await testDb.location.create({
      data: { name: 'Salle Bleue', serviceId, establishmentId },
    })
    locationID = location.id

    testApp = await buildTestApp()
    cookies = await signIn(testApp.app, 'coordinateur@conflits.fr')
  })

  afterAll(async () => {
    await testApp.close()
    await testDb.$disconnect()
  })

  it('GET /slot/conflicts renvoie deux creneaux qui partagent la salle', async () => {
    const a = await creneau('2026-04-01T09:00:00Z', '2026-04-01T10:00:00Z', locationID)
    const b = await creneau('2026-04-01T09:30:00Z', '2026-04-01T10:30:00Z', locationID)

    const response = await testApp.app.inject({
      method: 'GET',
      url: url('/slot/conflicts?from=2026-04-01&to=2026-04-02'),
      cookies,
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({
      conflicts: [{ type: 'salle', slotIDs: [a.id, b.id], locationID }],
    })
  })

  it('PATCH /slot enregistre et renvoie le conflit cree, puis plus rien une fois deplace', async () => {
    const c = await creneau('2026-04-02T14:00:00Z', '2026-04-02T15:00:00Z', locationID)
    await creneau('2026-04-02T09:00:00Z', '2026-04-02T10:00:00Z', locationID)

    const deplace = await testApp.app.inject({
      method: 'PATCH',
      url: url(`/slot/${c.id}`),
      cookies,
      payload: {
        startDate: '2026-04-02T09:30:00.000Z',
        endDate: '2026-04-02T10:30:00.000Z',
      },
    })
    expect(deplace.statusCode).toBe(200)
    expect(deplace.json().startDate).toBe('2026-04-02T09:30:00.000Z')
    expect(deplace.json().conflicts).toEqual([
      expect.objectContaining({ type: 'salle', locationID }),
    ])

    const libere = await testApp.app.inject({
      method: 'PATCH',
      url: url(`/slot/${c.id}`),
      cookies,
      payload: {
        startDate: '2026-04-02T10:00:00.000Z',
        endDate: '2026-04-02T11:00:00.000Z',
      },
    })
    expect(libere.json().conflicts).toEqual([])
  })

  it('PATCH /appointment renvoie le conflit patient quand deux rendez-vous se chevauchent', async () => {
    const patient = await testDb.patient.create({
      data: {
        establishmentId,
        firstName: 'Jeanne',
        lastName: 'Martin',
        createDate: new Date(),
      },
    })
    const s1 = await creneau('2026-04-03T09:00:00Z', '2026-04-03T10:00:00Z')
    const s2 = await creneau('2026-04-03T11:00:00Z', '2026-04-03T12:00:00Z')
    const rendezVous = async (slotID: string, start: string, end: string) =>
      testDb.appointment.create({
        data: {
          startDate: new Date(start),
          endDate: new Date(end),
          slotID,
          serviceId,
          establishmentId,
          appointmentPatients: {
            create: { patientId: patient.id, serviceId, establishmentId },
          },
        },
      })
    await rendezVous(s1.id, '2026-04-03T09:00:00Z', '2026-04-03T09:30:00Z')
    const r2 = await rendezVous(s2.id, '2026-04-03T11:00:00Z', '2026-04-03T11:30:00Z')

    const deplace = await testApp.app.inject({
      method: 'PATCH',
      url: url(`/appointment/${r2.id}`),
      cookies,
      payload: {
        slotID: s1.id,
        startDate: '2026-04-03T09:15:00.000Z',
        endDate: '2026-04-03T09:45:00.000Z',
      },
    })

    expect(deplace.statusCode).toBe(200)
    expect(deplace.json().conflicts).toEqual([
      expect.objectContaining({
        type: 'patient',
        slotIDs: [s1.id],
        patientID: patient.id,
      }),
    ])
  })
})
```

Si la création imbriquée de `appointmentPatients` est refusée par le schéma Prisma (champs obligatoires différents), créer la ligne avec `testDb.appointmentPatient.create({ data: { appointmentId, patientId, serviceId, establishmentId } })` après le rendez-vous : vérifier le modèle `AppointmentPatient` dans `back/prisma/schema.prisma:248`.

- [ ] **Step 2: Run test to verify it fails**

Run (depuis `back/`) : `npm run prisma:migrate:deploy:test`, puis `NODE_OPTIONS=--experimental-vm-modules npx dotenv-cli@7.3.0 -e .env.test.local -e .env.test -- npx jest --runInBand -c src/test/jest.config.ts --selectProjects e2e src/test/e2e/conflits-planification.test.ts`
Expected: FAIL. Le premier test reçoit une 400 (`conflicts` n'est pas un cuid pour `/:slotID`), les deux autres n'ont pas de champ `conflicts`.

- [ ] **Step 3: Schéma Zod des conflits**

`back/src/main/interfaces/http/fastify/schemas/planningConflict.schema.ts` :

```ts
import { z } from 'zod/v4'

export const planningConflictSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('salle'),
    slotIDs: z.array(z.cuid()),
    locationID: z.cuid(),
  }),
  z.object({
    type: z.literal('patient'),
    slotIDs: z.array(z.cuid()),
    appointmentIDs: z.array(z.cuid()),
    patientID: z.cuid(),
  }),
  z.object({
    type: z.literal('capacite'),
    slotIDs: z.array(z.cuid()),
    appointmentID: z.cuid(),
    capacity: z.number(),
    count: z.number(),
  }),
])

export const planningConflictsSchema = z.array(planningConflictSchema)

// Memes bornes que GET /slot : `from` inclusive, `to` exclusive.
export const getPlanningConflictsQuerySchema = z.object({
  from: z.coerce.date(),
  to: z.coerce.date(),
})

export type GetPlanningConflictsQuery = z.infer<
  typeof getPlanningConflictsQuerySchema
>
```

Dans `slot.schema.ts`, après `slotsResponseSchema` :

```ts
export const slotWithConflictsResponseSchema = slotResponseSchema.extend({
  conflicts: planningConflictsSchema,
})
```

avec `import { planningConflictsSchema } from './planningConflict.schema'`.

Dans `appointment.schema.ts`, après `appointmentsResponseSchema` :

```ts
export const appointmentWithConflictsResponseSchema =
  appointmentResponseSchema.extend({
    conflicts: planningConflictsSchema,
  })
```

avec le même import.

- [ ] **Step 4: Domaine**

Dans `back/src/main/types/domain/slot.domain.interface.ts`, ajouter l'import `import type { PlanningConflict } from '../../utils/planning-conflicts'` et deux méthodes à `SlotDomainInterface` :

```ts
  findConflicts: (dateRange: { from: Date; to: Date }) => Promise<PlanningConflict[]>
  conflictsOf: (slotID: string) => Promise<PlanningConflict[]>
```

Dans `back/src/main/domain/slot.domain.ts`, ajouter `import { detectConflicts, type PlanningConflict } from '../utils/planning-conflicts'` et, après `findByID` :

```ts
  async findConflicts(dateRange: {
    from: Date
    to: Date
  }): Promise<PlanningConflict[]> {
    return detectConflicts(await this.slotRepository.findAll(dateRange))
  }

  // Les créneaux qui chevauchent celui-ci suffisent : un conflit exige un recouvrement horaire.
  async conflictsOf(slotID: string): Promise<PlanningConflict[]> {
    const slot = await this.slotRepository.findByID(slotID)
    const conflicts = await this.findConflicts({
      from: slot.startDate,
      to: slot.endDate,
    })
    return conflicts.filter((conflict) => conflict.slotIDs.includes(slotID))
  }
```

Si `npx tsc --noEmit -p .` signale que `SlotDTORepo` n'est pas assignable à `ConflictSlot`, lire le message : `ConflictSlot` doit rester un sous-ensemble structurel du DTO, on corrige `ConflictSlot` (Task 1), pas le DTO.

Le faux `slotDomain` de `back/src/test/unit/domain/appointment.domain.test.ts:22` est un objet partiel : vérifier qu'il compile toujours (`npx tsc --noEmit -p .`), sinon lui ajouter `findConflicts: jest.fn()` et `conflictsOf: jest.fn()`.

- [ ] **Step 5: Routes des créneaux**

Dans `routes/slot.ts`, importer `getPlanningConflictsQuerySchema`, `type GetPlanningConflictsQuery` et `planningConflictsSchema` depuis `../schemas/planningConflict.schema`, et `slotWithConflictsResponseSchema` depuis `../schemas/slot.schema`. Ajouter juste après la route `GET /` :

```ts
  // Conflits de la fenêtre : alimente les badges du planning.
  fastify.get<{ Querystring: GetPlanningConflictsQuery }>(
    '/conflicts',
    {
      schema: {
        querystring: getPlanningConflictsQuerySchema,
        response: {
          200: z.object({ conflicts: planningConflictsSchema }),
        },
      },
      config: { permission: 'planning:read' },
    },
    async (request) => ({
      conflicts: await slotDomain.findConflicts(request.query),
    }),
  )
```

Dans `POST /`, remplacer `201: slotResponseSchema` par `201: slotWithConflictsResponseSchema`, et la fin du handler par :

```ts
      const slot = await slotDomain.create(createSlotInput)
      reply.code(201)
      return { ...slot, conflicts: await slotDomain.conflictsOf(slot.id) }
```

Dans `PATCH /:slotID`, remplacer `200: slotResponseSchema` par `200: slotWithConflictsResponseSchema`, et `return updated` par :

```ts
      return { ...updated, conflicts: await slotDomain.conflictsOf(slotID) }
```

- [ ] **Step 6: Routes des rendez-vous**

Dans `routes/appointment.ts`, ajouter `slotDomain` à la déstructuration de `iocContainer` en tête du routeur et importer `appointmentWithConflictsResponseSchema` depuis `../schemas/appointment.schema`.

`POST /` : `201: appointmentWithConflictsResponseSchema`, puis :

```ts
      reply.code(201)
      return {
        ...appointment,
        conflicts: await slotDomain.conflictsOf(appointment.slotID),
      }
```

`PATCH /:appointmentID` : `200: appointmentWithConflictsResponseSchema`, puis remplacer `return updated` par :

```ts
      // Une liste de patients vide a supprimé le rendez-vous : plus rien à signaler.
      const deleted = request.body.appointmentPatients?.length === 0
      return {
        ...updated,
        conflicts: deleted ? [] : await slotDomain.conflictsOf(updated.slotID),
      }
```

- [ ] **Step 7: Run tests to verify they pass**

Commande e2e du Step 2 : 3 tests PASS. Puis les suites voisines, qui vérifient que le contrat existant tient : même commande avec `src/test/e2e/appointment.test.ts src/test/e2e/creneau-archivage.test.ts`. Puis la suite unitaire complète (`--selectProjects unit` sans chemin), `npx tsc --noEmit -p .` et `npx biome check src`.

- [ ] **Step 8: Commit**

```bash
git add back/src
git commit -m "feat(planning): GET /slot/conflicts et conflits renvoyes par les ecritures (MDS-39)"
```

---

### Task 3: Types, API, requête et libellés côté front

**Files:**
- Modify: `front/src/types/slot.ts`
- Modify: `front/src/types/appointment.ts`
- Modify: `front/src/constants/process.constant.ts:82-89`
- Modify: `front/src/api/slot.api.ts`
- Modify: `front/src/queries/useSlot.ts` (`useSlotsInRangeQuery`, nouveau `useSlotConflictsQuery`)
- Create: `front/src/libs/planningConflicts.ts`
- Test: `front/src/libs/planningConflicts.test.ts`

**Interfaces:**
- Consumes : contrat HTTP de la Task 2.
- Produces :
  - `type PlanningConflict` (dans `types/slot.ts`) ; `conflicts?: PlanningConflict[]` sur `Slot` et `Appointment`
  - `SLOT.CONFLICTS`
  - `SlotApi.getConflicts(range: SlotDateRange): Promise<PlanningConflict[]>`
  - `useSlotsInRangeQuery` renvoie en plus `dataUpdatedAt: number`
  - `useSlotConflictsQuery(range: SlotDateRange | null, slotsUpdatedAt: number): PlanningConflict[]`
  - `describeConflict(conflict, slotID, slots): string`
  - `labelConflicts(conflicts, slots): Map<string, string[]>` (libellés par `slotID`)
  - `conflictWarning(conflicts): { title: string; message: string; severity: ToastSeverity }`

- [ ] **Step 1: Types**

Dans `front/src/types/slot.ts`, ajouter :

```ts
export type PlanningConflict =
  | { type: 'salle'; slotIDs: string[]; locationID: string }
  | {
      type: 'patient'
      slotIDs: string[]
      appointmentIDs: string[]
      patientID: string
    }
  | {
      type: 'capacite'
      slotIDs: string[]
      appointmentID: string
      capacity: number
      count: number
    }
```

et `conflicts?: PlanningConflict[]` dans `Slot` (après `slotTemplate`). Dans `front/src/types/appointment.ts`, ajouter `conflicts?: PlanningConflict[]` à `Appointment`, avec `PlanningConflict` importé de `./slot.ts`.

- [ ] **Step 2: Write the failing test**

`front/src/libs/planningConflicts.test.ts` :

```ts
import { describe, expect, it } from 'vitest'

import type { Slot } from '../types/slot.ts'
import {
  conflictWarning,
  describeConflict,
  labelConflicts,
} from './planningConflicts.ts'

const slot = (
  id: string,
  start: string,
  end: string,
  extra: Record<string, unknown> = {},
) =>
  ({
    id,
    startDate: `2026-04-01T${start}:00.000Z`,
    endDate: `2026-04-01T${end}:00.000Z`,
    locked: false,
    appointments: [],
    slotTemplate: {
      id: `tpl-${id}`,
      soignants: [],
      location: { id: 'loc-1', name: 'Salle Bleue' },
      thematic: 'Atelier diététique',
    },
    ...extra,
  }) as unknown as Slot

const patient = { id: 'p1', firstName: 'Jeanne', lastName: 'Martin' }
const rendezVous = (id: string, start: string) => ({
  id,
  startDate: `2026-04-01T${start}:00.000Z`,
  endDate: `2026-04-01T${start}:00.000Z`,
  appointmentPatients: [{ id: `ap-${id}`, patient }],
})

describe('describeConflict', () => {
  it('nomme l autre creneau pour une salle', () => {
    const slots = [slot('a', '09:00', '10:00'), slot('b', '09:30', '10:30')]
    const conflict = {
      type: 'salle' as const,
      slotIDs: ['a', 'b'],
      locationID: 'loc-1',
    }
    expect(describeConflict(conflict, 'a', slots)).toBe(
      'Salle Bleue déjà occupée 09:30–10:30 (Atelier diététique)',
    )
    expect(describeConflict(conflict, 'b', slots)).toBe(
      'Salle Bleue déjà occupée 09:00–10:00 (Atelier diététique)',
    )
  })

  it('donne l heure de l autre rendez-vous du patient', () => {
    const slots = [
      slot('a', '09:00', '10:00', { appointments: [rendezVous('r1', '09:00')] }),
      slot('b', '09:30', '11:00', { appointments: [rendezVous('r2', '09:30')] }),
    ]
    const conflict = {
      type: 'patient' as const,
      slotIDs: ['a', 'b'],
      appointmentIDs: ['r1', 'r2'],
      patientID: 'p1',
    }
    expect(describeConflict(conflict, 'a', slots)).toBe(
      'Martin Jeanne a déjà un rendez-vous à 09:30',
    )
  })

  it('signale deux rendez-vous du meme creneau', () => {
    const slots = [
      slot('a', '09:00', '11:00', {
        appointments: [rendezVous('r1', '09:00'), rendezVous('r2', '09:30')],
      }),
    ]
    const conflict = {
      type: 'patient' as const,
      slotIDs: ['a'],
      appointmentIDs: ['r1', 'r2'],
      patientID: 'p1',
    }
    expect(describeConflict(conflict, 'a', slots)).toBe(
      'Martin Jeanne a deux rendez-vous qui se chevauchent',
    )
  })

  it('compte les patients pour la capacite', () => {
    const conflict = {
      type: 'capacite' as const,
      slotIDs: ['a'],
      appointmentID: 'r1',
      capacity: 8,
      count: 9,
    }
    expect(describeConflict(conflict, 'a', [])).toBe('9 patients pour 8 places')
  })

  it('reste lisible quand l autre creneau n est pas charge', () => {
    const conflict = {
      type: 'salle' as const,
      slotIDs: ['a', 'x'],
      locationID: 'loc-1',
    }
    expect(describeConflict(conflict, 'a', [slot('a', '09:00', '10:00')])).toBe(
      'Salle Bleue déjà occupée',
    )
  })
})

describe('labelConflicts', () => {
  it('range un libelle par creneau concerne', () => {
    const slots = [slot('a', '09:00', '10:00'), slot('b', '09:30', '10:30')]
    const labels = labelConflicts(
      [{ type: 'salle', slotIDs: ['a', 'b'], locationID: 'loc-1' }],
      slots,
    )
    expect(labels.get('a')).toEqual([
      'Salle Bleue déjà occupée 09:30–10:30 (Atelier diététique)',
    ])
    expect(labels.get('b')).toHaveLength(1)
  })
})

describe('conflictWarning', () => {
  it('resume les conflits pour le toast', () => {
    expect(
      conflictWarning([
        { type: 'salle', slotIDs: ['a', 'b'], locationID: 'loc-1' },
        {
          type: 'capacite',
          slotIDs: ['a'],
          appointmentID: 'r1',
          capacity: 1,
          count: 2,
        },
      ]),
    ).toEqual({
      title: 'Enregistré, mais 2 conflits',
      message: 'Salle déjà occupée, capacité dépassée',
      severity: 'warning',
    })
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run (depuis `front/`) : `npx vitest run src/libs/planningConflicts.test.ts`
Expected: FAIL, module `planningConflicts` introuvable.

- [ ] **Step 4: Write minimal implementation**

`front/src/libs/planningConflicts.ts` :

```ts
import dayjs from 'dayjs'

import { TOAST_SEVERITY } from '../constants/ui.constant.ts'
import type { PlanningConflict, Slot } from '../types/slot.ts'

const hour = (date: string) => dayjs.utc(date).format('HH:mm')

const SUMMARY: Record<PlanningConflict['type'], string> = {
  salle: 'salle déjà occupée',
  patient: 'patient déjà en rendez-vous à cette heure',
  capacite: 'capacité dépassée',
}

// Libellé vu depuis `slotID` : pour une salle, on nomme l'autre créneau.
export const describeConflict = (
  conflict: PlanningConflict,
  slotID: string,
  slots: Slot[],
): string => {
  if (conflict.type === 'capacite') {
    return `${conflict.count} patients pour ${conflict.capacity} places`
  }
  if (conflict.type === 'salle') {
    const name =
      slots.find((slot) => conflict.slotIDs.includes(slot.id))?.slotTemplate
        ?.location?.name ?? 'La salle'
    const other = slots.find(
      (slot) => slot.id !== slotID && conflict.slotIDs.includes(slot.id),
    )
    if (!other) {
      return `${name} déjà occupée`
    }
    const thematic = other.slotTemplate?.thematic
    return `${name} déjà occupée ${hour(other.startDate)}–${hour(other.endDate)}${thematic ? ` (${thematic})` : ''}`
  }
  const appointments = slots.flatMap((slot) =>
    (slot.appointments ?? []).map((appointment) => ({
      ...appointment,
      slotID: slot.id,
    })),
  )
  const patient = appointments
    .flatMap((appointment) => appointment.appointmentPatients ?? [])
    .find((ap) => ap.patient?.id === conflict.patientID)?.patient
  const name = patient ? `${patient.lastName} ${patient.firstName}` : 'Un patient'
  if (conflict.slotIDs.length === 1) {
    return `${name} a deux rendez-vous qui se chevauchent`
  }
  const other = appointments.find(
    (appointment) =>
      appointment.slotID !== slotID &&
      conflict.appointmentIDs.includes(appointment.id),
  )
  return other
    ? `${name} a déjà un rendez-vous à ${hour(other.startDate)}`
    : `${name} a déjà un rendez-vous à cette heure`
}

export const labelConflicts = (conflicts: PlanningConflict[], slots: Slot[]) => {
  const labels = new Map<string, string[]>()
  for (const conflict of conflicts) {
    for (const slotID of conflict.slotIDs) {
      labels.set(slotID, [
        ...(labels.get(slotID) ?? []),
        describeConflict(conflict, slotID, slots),
      ])
    }
  }
  return labels
}

export const conflictWarning = (conflicts: PlanningConflict[]) => {
  const summary = [...new Set(conflicts.map((c) => SUMMARY[c.type]))].join(', ')
  return {
    title: `Enregistré, mais ${conflicts.length} conflit${conflicts.length > 1 ? 's' : ''}`,
    message: summary.charAt(0).toUpperCase() + summary.slice(1),
    severity: TOAST_SEVERITY.WARNING,
  }
}
```

Si `dayjs.utc` n'est pas typé dans ce fichier, regarder comment `components/custom/agenda/slotRange.tsx` l'obtient (plugin `utc` étendu globalement) et reprendre le même import.

- [ ] **Step 5: Run test to verify it passes**

Même commande qu'au Step 3 : 7 tests PASS.

- [ ] **Step 6: API, constante et requête**

Dans `process.constant.ts`, ajouter `CONFLICTS: 'get_slot_conflicts',` à `SLOT`.

Dans `api/slot.api.ts`, importer `PlanningConflict` et `SlotDateRange` depuis `../types/slot.ts` et ajouter à `SlotApi`, après `getAll` :

```ts
  getConflicts: async ({
    from,
    to,
  }: SlotDateRange): Promise<PlanningConflict[]> => {
    const params = new URLSearchParams({
      action: 'getSlotConflicts',
      from,
      to,
    })
    const response = await fetchWithAuth(
      `${tenantApiUrl()}/slot/conflicts?${params}`,
      { method: 'GET' },
    )
    if (!response.ok) {
      handleHttpError(
        response,
        {},
        'Impossible de vérifier les conflits du planning',
      )
    }
    const { conflicts } = await response.json()
    return conflicts
  },
```

Dans `queries/useSlot.ts`, faire renvoyer `dataUpdatedAt` par `useSlotsInRangeQuery` (le déstructurer de `useQuery` et l'ajouter à l'objet retourné), importer `PlanningConflict` et `SlotDateRange`, puis ajouter après `useSlotsInRangeQuery` :

```ts
// Clé hors de SLOT.GET_ALL, que les mises à jour optimistes réécrivent ; `slotsUpdatedAt` la rafraîchit avec les créneaux.
export const useSlotConflictsQuery = (
  range: SlotDateRange | null,
  slotsUpdatedAt: number,
): PlanningConflict[] => {
  const { data, isPending, isError, error } = useQuery({
    queryKey: [SLOT.CONFLICTS, range?.from, range?.to, slotsUpdatedAt],
    queryFn: () => SlotApi.getConflicts(range as SlotDateRange),
    enabled: !!range,
    placeholderData: keepPreviousData,
    retry: 0,
  })

  useDataFetching({ isPending, isError, error })

  return data ?? []
}
```

Si `useSlotsInRangeQuery` prend un `SlotQuery` et que les pages lui passent un `SlotDateRange`, garder `SlotDateRange` pour la nouvelle requête (elle exige les deux bornes).

- [ ] **Step 7: Lint, types et commit**

Run (depuis `front/`) : `npx tsc --noEmit -p .`, `npx biome check src`, `npx vitest run`.

```bash
git add front/src
git commit -m "feat(planning): requete et libelles des conflits cote front (MDS-39)"
```

---

### Task 4: Badge de conflit dans le calendrier et l'agenda du jour

**Files:**
- Create: `front/src/components/custom/conflictBadge.tsx`
- Modify: `front/src/libs/utils.ts:54-103` (`buildCalendarEventsFromSlots`)
- Modify: `front/src/components/custom/Calendar/eventContent.tsx`
- Modify: `front/src/routes/_authenticated/e/$establishmentId/s/$serviceId/dashboard.tsx:141-175`
- Modify: `front/src/routes/_authenticated/e/$establishmentId/s/$serviceId/_settings/planning.tsx:110,238-245`
- Modify: `front/src/routes/_authenticated/e/$establishmentId/s/$serviceId/agenda.tsx:101,148-157`
- Modify: `front/src/columns/dayAppointment.column.tsx` (colonne `schedule`)
- Test: `front/src/libs/calendarEvents.test.ts`

**Interfaces:**
- Consumes : `useSlotConflictsQuery`, `dataUpdatedAt`, `labelConflicts` (Task 3).
- Produces :
  - `buildCalendarEventsFromSlots(slots, states, conflictLabels?: Map<string, string[]>)` ; l'événement porte `extendedProps.conflicts: string[]`
  - `<ConflictBadge labels={string[]} className?={string} />`
  - `getDayAppointmentColumns({ …, conflictLabels: Map<string, string[]> })`

- [ ] **Step 1: Write the failing test**

Ajouter dans `front/src/libs/calendarEvents.test.ts`, dans le `describe` existant :

```ts
  it('porte les libelles de conflit du creneau', () => {
    const [event] = buildCalendarEventsFromSlots(
      [slot()],
      ['default'],
      new Map([['slot-1', ['Salle Bleue déjà occupée']]]),
    )
    expect(event.extendedProps?.conflicts).toEqual(['Salle Bleue déjà occupée'])
  })

  it('laisse la liste de conflits vide sans libelles', () => {
    const [event] = buildCalendarEventsFromSlots([slot()], ['default'])
    expect(event.extendedProps?.conflicts).toEqual([])
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run : `npx vitest run src/libs/calendarEvents.test.ts`
Expected: FAIL, `conflicts` vaut `undefined`.

- [ ] **Step 3: Implémentation du builder**

Dans `libs/utils.ts`, signature :

```ts
export const buildCalendarEventsFromSlots = (
  slots: Slot[],
  states: string[],
  conflictLabels?: Map<string, string[]>,
): CalendarEvent[] => {
```

et dans `extendedProps`, après `locked: slot.locked,` :

```ts
        conflicts: conflictLabels?.get(slot.id) ?? [],
```

Run : `npx vitest run src/libs/calendarEvents.test.ts`. Expected: PASS.

- [ ] **Step 4: Badge partagé**

`front/src/components/custom/conflictBadge.tsx` :

```tsx
import { TriangleAlert } from 'lucide-react'

import { cn } from '../../libs/utils.ts'

type Props = { labels: string[]; className?: string }

export function ConflictBadge({ labels, className }: Props) {
  if (labels.length === 0) {
    return null
  }
  return (
    <span
      role="img"
      aria-label={`Conflit : ${labels.join(' ; ')}`}
      title={labels.join('\n')}
      className={cn(
        'inline-flex items-center rounded bg-destructive p-0.5 text-white',
        className,
      )}
    >
      <TriangleAlert className="h-2.5 w-2.5" />
    </span>
  )
}
```

Si `TriangleAlert` n'existe pas dans la version de `lucide-react` installée, prendre `AlertTriangle`.

- [ ] **Step 5: Badge dans le calendrier**

Dans `eventContent.tsx`, ajouter `conflicts = [],` à la déstructuration de `event.extendedProps` (l.52-62), importer `ConflictBadge` depuis `../conflictBadge.tsx`, et rendre juste avant le bloc `{locked && type === 'slot' && (` :

```tsx
      {type === 'slot' && (
        <ConflictBadge
          labels={conflicts}
          className="absolute bottom-0.5 right-0.5 z-20"
        />
      )}
```

Le coin bas-droit est libre : le cadenas est en haut à gauche, la case de sélection en bas à gauche, le compteur et les actions de survol en haut à droite.

- [ ] **Step 6: Câblage du tableau de bord et du Planning**

`dashboard.tsx`, après `const { slots } = useSlotsInRangeQuery(visibleRange)` :

```tsx
  const { slots, dataUpdatedAt } = useSlotsInRangeQuery(visibleRange)
  const conflicts = useSlotConflictsQuery(visibleRange, dataUpdatedAt)
  const conflictLabels = useMemo(
    () => labelConflicts(conflicts, slots ?? []),
    [conflicts, slots],
  )
```

(remplacer la ligne existante, importer `useSlotConflictsQuery`, `labelConflicts` et `useMemo` si absent), puis `buildCalendarEventsFromSlots(filtered, ['fillable'], conflictLabels)` et ajouter `conflictLabels` aux dépendances du `useEffect`.

`_settings/planning.tsx` : même remplacement l.110, puis :

```tsx
      buildCalendarEventsFromSlots(
        visibleSlots,
        editMode ? ['editable'] : ['default'],
        conflictLabels,
      ),
```

avec `conflictLabels` ajouté aux dépendances `[visibleSlots, editMode, conflictLabels]`. Le mode modèles passe par `buildCalendarEventsFromSlotTemplates` : on n'y touche pas.

- [ ] **Step 7: Badge dans l'agenda du jour**

`agenda.tsx` : remplacer `const { slots, isPending } = useSlotsInRangeQuery(dayRange)` par :

```tsx
  const { slots, isPending, dataUpdatedAt } = useSlotsInRangeQuery(dayRange)
  const conflicts = useSlotConflictsQuery(dayRange, dataUpdatedAt)
  const conflictLabels = useMemo(
    () => labelConflicts(conflicts, slots ?? []),
    [conflicts, slots],
  )
```

et passer `conflictLabels` à `getDayAppointmentColumns({ …, conflictLabels })` en l'ajoutant aux dépendances du `useMemo` des colonnes.

`dayAppointment.column.tsx` : ajouter `conflictLabels: Map<string, string[]>` au type `DayAppointmentActions` et à la déstructuration, importer `ConflictBadge`, et remplacer la cellule de la colonne `schedule` par :

```tsx
      cell: ({ row }) => {
        if (row.depth > 0) {
          return <SlotTimeline row={row} />
        }
        // Une plage regroupe plusieurs créneaux : on cumule leurs conflits.
        const slotIds = new Set([
          row.original.slotId,
          ...(row.original.subRows ?? []).map((sub) => sub.slotId),
        ])
        const labels = [...slotIds].flatMap(
          (slotId) => conflictLabels.get(slotId) ?? [],
        )
        return (
          <span className="inline-flex items-center gap-1.5">
            {formatRange(row.original)}
            <ConflictBadge labels={labels} />
          </span>
        )
      },
```

- [ ] **Step 8: Types, lint, tests**

Run (depuis `front/`) : `npx tsc --noEmit -p .`, `npx biome check src`, `npx vitest run`. Expected: aucun échec. Si un test existant de `getDayAppointmentColumns` appelle la fonction sans `conflictLabels`, lui passer `conflictLabels: new Map()`.

- [ ] **Step 9: Commit**

```bash
git add front/src
git commit -m "feat(planning): badge de conflit dans le calendrier et l agenda du jour (MDS-39)"
```

---

### Task 5: Toast d'avertissement après enregistrement, et vérification navigateur

**Files:**
- Modify: `front/src/queries/useSlot.ts` (`createSlot.onSuccess` l.142, `updateSlot.onSuccess` l.243)
- Modify: `front/src/queries/useAppointment.ts` (`createAppointment.onSuccess` l.94, `updateAppointment.onSuccess` l.176)

**Interfaces:**
- Consumes : `conflictWarning` (Task 3), champ `conflicts` des réponses (Task 2), `conflicts?` sur `Slot` et `Appointment` (Task 3).

- [ ] **Step 1: Toasts des créneaux**

Dans `useSlot.ts`, importer `conflictWarning` depuis `../libs/planningConflicts.ts`. Remplacer `createSlot.onSuccess` par :

```ts
    onSuccess: (slot) => {
      toast(
        slot.conflicts?.length
          ? conflictWarning(slot.conflicts)
          : {
              title: 'Créneau créé avec succès',
              severity: TOAST_SEVERITY.SUCCESS,
            },
      )
    },
```

et `updateSlot.onSuccess` par la même forme avec le titre `'Créneau modifié avec succès'`.

- [ ] **Step 2: Toasts des rendez-vous**

Dans `useAppointment.ts`, même import, puis `createAppointment.onSuccess` :

```ts
    onSuccess: (appointment) => {
      toast(
        appointment.conflicts?.length
          ? conflictWarning(appointment.conflicts)
          : {
              title: 'Rendez-vous créé avec succès',
              severity: TOAST_SEVERITY.SUCCESS,
            },
      )
    },
```

et `updateAppointment.onSuccess` avec le titre `'Rendez-vous modifié avec succès'`.

Si le type du paramètre de `toast` n'accepte pas `severity: string`, reprendre le type `ToastSeverity` exporté par `constants/ui.constant.ts` dans le retour de `conflictWarning` (Task 3).

- [ ] **Step 3: Types, lint, tests**

Run (depuis `front/`) : `npx tsc --noEmit -p .`, `npx biome check src`, `npx vitest run`.

- [ ] **Step 4: Vérification dans le navigateur**

Le serveur front tourne sur 4270 et le back sur 3000, un seul jeu de serveurs lancé depuis le checkout principal. Pour tester cette branche, arrêter celui du checkout principal par son PID et relancer depuis le worktree (`back/` : `npm run dev` ; `front/` : `npm run dev -- --port 4270`). Compte : voir `back/prisma/seed/user.ts`.

1. Écran Planning, mode créneaux réels : créer deux créneaux à des horaires qui se chevauchent dans la même salle. La pastille rouge apparaît en bas à droite des deux créneaux. Son infobulle nomme l'autre créneau. Le second enregistrement affiche « Enregistré, mais 1 conflit » au lieu du toast de succès.
2. Créer un créneau dans une salle libre : toast de succès habituel, sans pastille et sans erreur dans la console. C'est le contrôle du point 5 de la Review Focus.
3. Agenda du jour sur cette date : la pastille figure à côté de l'horaire des deux créneaux.
4. Déplacer l'un des deux créneaux hors du chevauchement : les deux pastilles disparaissent après le rafraîchissement.
5. Supprimer les créneaux de test.

Enregistrer avant de quitter un écran éditable : le `beforeunload` bloque Chrome MCP. Le glisser-déposer HTML5 ne fonctionne pas depuis un clic synthétique ; pour déplacer, passer par le formulaire de modification.

- [ ] **Step 5: Commit**

```bash
git add front/src
git commit -m "feat(planning): toast d avertissement quand un enregistrement cree un conflit (MDS-39)"
```

---

## Clôture

- `graphify update .` à la racine du worktree.
- Merger `main` dans le worktree, relancer les suites, puis fusionner vers `main`. `receive.denyCurrentBranch=updateInstead` le temps du merge, puis le remettre.
- Ticket Notion MDS-39 : cocher les cases faites et passer en « En revue ». Créer en Backlog le ticket « Conflits soignant : modéliser les personnes et leurs indisponibilités ».
