# Notifications, étape 2 : plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal :** les huit types de notification dans l'app (dont quatre planifiés), filtrés par les préférences de chaque compte, et la section « Notifications » de Mon compte (colonne « Dans l'app »).

**Architecture :** un service `NotificationDispatcher` appelé directement par les domaines (rendez-vous, créneaux, inscriptions) calcule les destinataires (soignants de la séance), applique les préférences (`User.notificationPrefs`) et écrit les `Notification`. Un planificateur (`setInterval` 15 min, `runAsSystem`) produit rappels, J+7, fins de parcours, échéances et purge, rendu idempotent par une clé d'unicité. Le front affiche chaque type et édite les préférences sous `/me`.

**Tech Stack :** Fastify + Prisma + Zod v4 (Jest), React 19 + TanStack Query/Router + Tailwind + Radix + lucide-react (Vitest). Biome.

**Spec :** `docs/superpowers/specs/2026-10-20-notifications-etape-2-design.md`. Handoff : `docs/superpowers/specs/handoffs/notifications-15/` (README, et `Notifications.dc.html` : tables `TYPES`, `EVENTS`, `EVENTS2`, `PRESETS2`).

## Global Constraints

- Biome seulement, jamais `biome-ignore` ; commentaires d'une ligne ou rien, en français.
- Une notification ratée n'échoue **jamais** l'action métier : toute méthode publique du dispatcher attrape et journalise (classe de l'erreur seulement, jamais le message, qui peut contenir des données patient).
- Destinataires « soignants de la séance » : comptes avec `ServiceMembership.soignantId` ∈ soignants du `SlotTemplate` (`SlotTemplateSoignant`), `role !== 'LECTURE'`, `user.deactivatedAt === null`, auteur exclu, dédupliqués.
- Clés de préférence : `reminder`, `added`, `moved` (couvre `APPOINTMENT_MOVED` et `APPOINTMENT_CANCELLED`), `absent`, `diag`, `end`, `full`, `mention`, `due`.
- Défaut des préférences : `{ level: 'essential', services: null, app: tout à true, reminderDelay: 'eve' }`.
- Heures planifiées en Europe/Paris : « la veille à 18 h », « 2 h avant », « 1 h avant », échéance à partir de 7 h.
- Fenêtres : rattrapage diagnostic et fin de parcours sur 30 jours ; purge des notifications de plus de 30 jours.
- Libellés 15b (textes exacts) :
  - Mes rendez-vous : « Rappel avant mes rendez-vous » / « Un rappel pour chaque séance où vous intervenez. » ; « Patient ajouté à un de mes rendez-vous » / « Quand un collègue inscrit un patient à votre séance. » ; « Rendez-vous modifié ou annulé » / « Changement d'horaire, de salle, ou annulation. »
  - Patients : « Absence non justifiée » / « Un patient de votre séance n'est pas venu. » ; « Diagnostic éducatif à réaliser » / « Patient inclus sans diagnostic après 7 jours. » ; « Fin de parcours : bilan à faire » / « Dernière séance du parcours passée. »
  - Créneaux : « Créneau presque complet » / « Il reste une place sur un créneau que vous animez. »
  - Tâches : « Mention dans une tâche » / « Un collègue vous mentionne dans une tâche. » ; « Tâche qui arrive à échéance » / « Le matin du jour d'échéance, pour vos tâches non terminées. »
  - Niveaux : Tout (`BellRing`) « Toutes les notifications, dans l'app et par e-mail. » ; Essentiel (`Bell`) ; Personnalisé (`SlidersHorizontal`). Note : « Modifier une ligne passe en « Personnalisé ». » Délais : « La veille à 18 h », « 2 h avant », « 1 h avant ».
- Couleurs et icônes des types (handoff `TYPES`) : ajouté `UserPlus` #2563eb/#eff6ff ; rappel `AlarmClock` #7c3aed/#f5f3ff ; modifié `CalendarClock` #b45309/#fffbeb ; annulé `CalendarX` #b91c1c/#fef2f2 ; absence `UserX` #be185d/#fdf2f8 ; créneau `Users` #0891b2/#ecfeff ; fin `Flag` #15803d/#f0fdf4 ; diagnostic `ClipboardList` #334155/#f1f5f9 ; échéance `CalendarClock` #b91c1c/#fef2f2 ; mention `ListTodo` #0f766e/#f0fdfa.

### Exécution des tests (rappels pour tous les implémenteurs)

- **Toujours au premier plan**, timeout explicite (600000 max), jamais `run_in_background` ; macOS n'a pas `timeout`.
- Back unitaires : `cd back && NODE_OPTIONS=--experimental-vm-modules npx jest -c src/test/jest.config.ts --selectProjects unit > /private/tmp/claude-501/u.log 2>&1; grep -E "Tests:|Suites:|FAIL" /private/tmp/claude-501/u.log`
- Back e2e (lance TOUTES les suites, ~5 min, aucun filtre ne réduit) : `cd back && npm run prisma:migrate:deploy:test && NODE_OPTIONS=--experimental-vm-modules npx dotenv-cli@7.3.0 -e .env.test.local -e .env.test -- npx jest --runInBand --forceExit -c src/test/jest.config.ts --selectProjects e2e > /private/tmp/claude-501/e.log 2>&1; grep -E "^(PASS|FAIL)|Tests:|●" /private/tmp/claude-501/e.log | grep -v "● Console" | head -60`. Au plus deux passages par tâche (RED, GREEN).
- Front : `cd front && npx vitest run <chemins>` ; `npx tsc --noEmit`.
- Bases : `back/.env` → `medisync_notifs`, `back/.env.test.local` → `medisync_test_notifs` ; jamais `medisync` ni `medisync_test`.

## Review Focus

1. **Action métier dont la notification plante** (destinataire supprimé entre-temps, payload inattendu) : la requête rend 200 et l'action est faite. Test : Task 3, « une erreur du dispatcher n'échoue pas la mise à jour ».
2. **Suppression d'un rendez-vous ou d'un créneau** : les données de la séance ont disparu après la suppression ; la notification d'annulation doit quand même porter thème, date et patients. Test : Task 3 et Task 4 (instantané pris avant).
3. **Planificateur rejoué** (redémarrage du serveur, deux passages rapprochés) : aucun doublon. Test : Task 5, `runOnce` appelé deux fois.
4. **Préférences jamais enregistrées** (tous les comptes existants) : tout est actif, rappel la veille. Test : Task 1 (`normalizePrefs({})`) et Task 2 (`GET` sur un compte neuf).
5. **Inscription d'un patient à un parcours de 10 séances** : une seule notification par soignant, pas dix. Test : Task 4.

---

### Task 1 : Schéma, types de notification, préférences (module pur)

**Files :**
- Modify : `back/prisma/schema.prisma` (enum `NotificationType`, modèle `Notification`, modèle `User`)
- Create : migration `back/prisma/migrations/20261021100000_notifications_etape_2/migration.sql`
- Create : `back/src/main/utils/notification-prefs.ts`
- Create : `back/src/test/unit/utils/notification-prefs.test.ts`
- Modify : `back/src/main/interfaces/http/fastify/schemas/notification.schema.ts` (réponse : `type` devient l'enum, `payload` un objet libre)

**Interfaces :**
- Produces :
  ```ts
  // utils/notification-prefs.ts
  export const NOTIFICATION_PREF_KEYS = ['reminder','added','moved','absent','diag','end','full','mention','due'] as const
  export type NotificationPrefKey = (typeof NOTIFICATION_PREF_KEYS)[number]
  export type ReminderDelay = 'eve' | '2h' | '1h'
  export type NotificationPrefs = { level: 'all'|'essential'|'custom'; services: string[] | null; app: Record<NotificationPrefKey, boolean>; reminderDelay: ReminderDelay }
  export const DEFAULT_PREFS: NotificationPrefs
  export const normalizePrefs: (raw: unknown) => NotificationPrefs
  export const PREF_KEY_OF_TYPE: Record<NotificationType, NotificationPrefKey>
  export const allows: (prefs: NotificationPrefs, type: NotificationType, serviceId: string) => boolean
  ```
  Enum Prisma `NotificationType { MENTION REMINDER PATIENT_ADDED APPOINTMENT_MOVED APPOINTMENT_CANCELLED ABSENT DIAGNOSTIC_DUE PATHWAY_END SLOT_ALMOST_FULL TASK_DUE }` ; `Notification.dedupeKey String?` + `@@unique([userId, dedupeKey])` ; `User.notificationPrefs Json @default("{}")`.

- [ ] **Step 1 : Test du module pur (échoue)**

```ts
import { allows, DEFAULT_PREFS, normalizePrefs } from '../../../main/utils/notification-prefs'

describe('notification-prefs', () => {
  it('complete des preferences absentes par le defaut', () => {
    expect(normalizePrefs({})).toEqual(DEFAULT_PREFS)
    expect(normalizePrefs(null)).toEqual(DEFAULT_PREFS)
    expect(DEFAULT_PREFS).toMatchObject({ level: 'essential', services: null, reminderDelay: 'eve' })
    expect(Object.values(DEFAULT_PREFS.app).every(Boolean)).toBe(true)
  })

  it('garde les cles connues et ignore le reste', () => {
    const p = normalizePrefs({ level: 'custom', app: { absent: false, inconnu: true }, reminderDelay: '1h', services: ['s1'] })
    expect(p.level).toBe('custom')
    expect(p.app.absent).toBe(false)
    expect(p.app.added).toBe(true)
    expect(p.reminderDelay).toBe('1h')
    expect(p.services).toEqual(['s1'])
    expect('inconnu' in p.app).toBe(false)
  })

  it('rejette les valeurs invalides au profit du defaut', () => {
    const p = normalizePrefs({ level: 'tout', reminderDelay: '3h', services: 'x', app: { added: 'oui' } })
    expect(p.level).toBe('essential')
    expect(p.reminderDelay).toBe('eve')
    expect(p.services).toBeNull()
    expect(p.app.added).toBe(true)
  })

  it('filtre par type et par service', () => {
    const p = normalizePrefs({ app: { moved: false }, services: ['s1'] })
    expect(allows(p, 'APPOINTMENT_MOVED', 's1')).toBe(false)
    expect(allows(p, 'APPOINTMENT_CANCELLED', 's1')).toBe(false)
    expect(allows(p, 'PATIENT_ADDED', 's1')).toBe(true)
    expect(allows(p, 'PATIENT_ADDED', 's2')).toBe(false)
    expect(allows(DEFAULT_PREFS, 'MENTION', 'nimporte')).toBe(true)
  })
})
```

Run unit `notification-prefs` → FAIL.

- [ ] **Step 2 : Module**

```ts
import type { NotificationType } from '../../generated/enums'

export const NOTIFICATION_PREF_KEYS = ['reminder', 'added', 'moved', 'absent', 'diag', 'end', 'full', 'mention', 'due'] as const
export type NotificationPrefKey = (typeof NOTIFICATION_PREF_KEYS)[number]
export type ReminderDelay = 'eve' | '2h' | '1h'
export type NotificationLevel = 'all' | 'essential' | 'custom'
export type NotificationPrefs = {
  level: NotificationLevel
  services: string[] | null
  app: Record<NotificationPrefKey, boolean>
  reminderDelay: ReminderDelay
}

const LEVELS: readonly NotificationLevel[] = ['all', 'essential', 'custom']
const DELAYS: readonly ReminderDelay[] = ['eve', '2h', '1h']
const allOn = () => Object.fromEntries(NOTIFICATION_PREF_KEYS.map((k) => [k, true])) as Record<NotificationPrefKey, boolean>

export const DEFAULT_PREFS: NotificationPrefs = { level: 'essential', services: null, app: allOn(), reminderDelay: 'eve' }

const pick = <T>(value: unknown, allowed: readonly T[], fallback: T): T =>
  allowed.includes(value as T) ? (value as T) : fallback

export const normalizePrefs = (raw: unknown): NotificationPrefs => {
  const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const rawApp = r.app && typeof r.app === 'object' ? (r.app as Record<string, unknown>) : {}
  const app = allOn()
  for (const key of NOTIFICATION_PREF_KEYS) {
    if (typeof rawApp[key] === 'boolean') {
      app[key] = rawApp[key] as boolean
    }
  }
  const services = Array.isArray(r.services) && r.services.every((s) => typeof s === 'string') ? (r.services as string[]) : null
  return {
    level: pick(r.level, LEVELS, 'essential'),
    services,
    app,
    reminderDelay: pick(r.reminderDelay, DELAYS, 'eve'),
  }
}

export const PREF_KEY_OF_TYPE: Record<NotificationType, NotificationPrefKey> = {
  MENTION: 'mention',
  REMINDER: 'reminder',
  PATIENT_ADDED: 'added',
  APPOINTMENT_MOVED: 'moved',
  APPOINTMENT_CANCELLED: 'moved',
  ABSENT: 'absent',
  DIAGNOSTIC_DUE: 'diag',
  PATHWAY_END: 'end',
  SLOT_ALMOST_FULL: 'full',
  TASK_DUE: 'due',
}

export const allows = (prefs: NotificationPrefs, type: NotificationType, serviceId: string): boolean =>
  prefs.app[PREF_KEY_OF_TYPE[type]] && (prefs.services === null || prefs.services.includes(serviceId))
```

(Vérifier le chemin d'import de l'enum généré : `grep -rn "generated/enums" back/src/main | head -2`.)

- [ ] **Step 3 : Schéma et migration**

Dans `schema.prisma` : compléter l'enum `NotificationType` avec les neuf valeurs ci-dessus ; dans `Notification` ajouter `dedupeKey String?` et `@@unique([userId, dedupeKey])` ; dans `User` ajouter `notificationPrefs Json @default("{}")`. `cd back && npx prisma migrate dev --create-only --name notifications_etape_2`, renommer le dossier en `20261021100000_notifications_etape_2`, `npm run prisma:generate`, `npm run prisma:migrate:deploy` et `npm run prisma:migrate:deploy:test`.

- [ ] **Step 4 : Schéma de réponse**

Dans `schemas/notification.schema.ts`, `type: z.literal('MENTION')` devient `z.enum([...les dix valeurs...])` et `payload` devient `z.record(z.string(), z.unknown())` (le rendu dépend du type, côté front). `dedupeKey` n'est pas exposé.

- [ ] **Step 5 : Vérifier, commit**

Unit complet (dont `notification-prefs`, `tenant-guard-schema`, `schema-migrations-drift`) vert ; `npx tsc --noEmit -p src/main/tsconfig.json` propre.

```bash
git add -A back && git commit -m "feat(notifications): types de l'etape 2, cle d'unicite et preferences"
```

---

### Task 2 : API des préférences sous `/me`

**Files :**
- Create : `back/src/main/interfaces/http/fastify/schemas/notification-prefs.schema.ts`
- Modify : `back/src/main/interfaces/http/fastify/routes/me.ts`
- Modify : `back/src/main/infra/orm/repositories/user.repository.ts` (+ interface) : `findNotificationPrefs(userId)`, `setNotificationPrefs(userId, prefs)`, `findNotificationPrefsMany(userIds)`
- Create : `back/src/test/e2e/notification-prefs.test.ts`

**Interfaces :**
- Consumes : Task 1 (`normalizePrefs`, `NotificationPrefs`).
- Produces : `GET /me/notification-preferences → NotificationPrefs` ; `PUT /me/notification-preferences` (corps `NotificationPrefs`) → `NotificationPrefs` ; `userRepository.findNotificationPrefsMany(userIds: string[]): Promise<Map<string, NotificationPrefs>>` (utilisé en Task 3).

- [ ] **Step 1 : Test e2e (échoue)**

```ts
import { buildTestApp, type TestApp } from './setup/app'
import { truncateAll } from './setup/db'
import { createEstablishment, createService, createUser, signIn } from './setup/fixtures'

describe('preferences de notification', () => {
  let t: TestApp
  let A: string
  let B: string
  let cookies: { access_token: string }

  beforeAll(async () => {
    t = await buildTestApp()
    await truncateAll()
    const e = await createEstablishment()
    A = (await createService(e.id, 'Cardio')).id
    B = (await createService(e.id, 'Diabeto')).id
    const autre = await createEstablishment('Autre')
    const C = (await createService(autre.id, 'Ailleurs')).id
    void C
    await createUser({
      email: 'leo@t.fr',
      memberships: [{ establishmentId: e.id, services: [{ serviceId: A, role: 'INTERVENANT' }, { serviceId: B, role: 'INTERVENANT' }] }],
    })
    cookies = await signIn(t.app, 'leo@t.fr')
  })

  afterAll(async () => {
    await t.close()
  })

  const get = () => t.app.inject({ method: 'GET', url: '/me/notification-preferences', cookies })
  const put = (payload: object) => t.app.inject({ method: 'PUT', url: '/me/notification-preferences', cookies, payload })

  it('rend le defaut pour un compte qui n a rien choisi', async () => {
    const res = await get()
    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ level: 'essential', services: null, reminderDelay: 'eve' })
  })

  it('enregistre et relit', async () => {
    const prefs = { level: 'custom', services: [A], reminderDelay: '2h', app: { reminder: true, added: false, moved: true, absent: true, diag: true, end: true, full: false, mention: true, due: true } }
    expect((await put(prefs)).statusCode).toBe(200)
    expect((await get()).json()).toEqual(prefs)
  })

  it('refuse aucun service et un service qui n est pas au compte', async () => {
    const base = { level: 'essential', reminderDelay: 'eve', app: { reminder: true, added: true, moved: true, absent: true, diag: true, end: true, full: true, mention: true, due: true } }
    expect((await put({ ...base, services: [] })).statusCode).toBe(400)
    expect((await put({ ...base, services: ['cl_service_etranger_0000000'] })).statusCode).toBe(400)
  })

  it('exige une session', async () => {
    expect((await t.app.inject({ method: 'GET', url: '/me/notification-preferences' })).statusCode).toBe(401)
  })
})
```

- [ ] **Step 2 : Schéma Zod**

```ts
import { z } from 'zod/v4'

import { NOTIFICATION_PREF_KEYS } from '../../../../utils/notification-prefs'

export const notificationPrefsSchema = z.object({
  level: z.enum(['all', 'essential', 'custom']),
  services: z.array(z.string()).min(1).nullable(),
  reminderDelay: z.enum(['eve', '2h', '1h']),
  app: z.object(Object.fromEntries(NOTIFICATION_PREF_KEYS.map((k) => [k, z.boolean()])) as Record<(typeof NOTIFICATION_PREF_KEYS)[number], z.ZodBoolean>),
})
export type NotificationPrefsBody = z.infer<typeof notificationPrefsSchema>
```

- [ ] **Step 3 : Dépôt et routes**

`UserRepository` : `findNotificationPrefs(id)` = `user.findUnique({ where: { id }, select: { notificationPrefs: true } })` puis `normalizePrefs` ; `setNotificationPrefs(id, prefs)` = `user.update({ where: { id }, data: { notificationPrefs: prefs } })` ; `findNotificationPrefsMany(ids)` = `user.findMany({ where: { id: { in: ids } }, select: { id: true, notificationPrefs: true } })` → `Map` normalisée. Ces opérations sont déjà permises sans contexte (`NO_CONTEXT_GLOBAL_OPERATIONS` : `User.findUnique`, `update`) ; `findMany` sur `User` sous contexte de tenant est une lecture plate d'un modèle global (pas de relation à-plusieurs) — si la garde la refuse, l'erreur nomme l'entrée ; le signaler plutôt que contourner.

Dans `me.ts` :

```ts
fastify.get('/notification-preferences', { schema: { response: { 200: notificationPrefsSchema } } }, (request) =>
  userRepository.findNotificationPrefs(request.currentUser.id),
)

fastify.put<{ Body: NotificationPrefsBody }>(
  '/notification-preferences',
  { schema: { body: notificationPrefsSchema, response: { 200: notificationPrefsSchema } } },
  async (request) => {
    const mine = new Set(request.currentUser.establishmentMemberships.flatMap((e) => e.serviceMemberships.map((s) => s.serviceId)))
    if (request.body.services && request.body.services.some((s) => !mine.has(s))) {
      throw Boom.badRequest('Service is not one of the account services')
    }
    await userRepository.setNotificationPrefs(request.currentUser.id, request.body)
    return request.body
  },
)
```

Lire la forme réelle de `request.currentUser` (type `UserWithMemberships`) pour le chemin des services ; récupérer `userRepository` depuis `fastify.iocContainer`.

- [ ] **Step 4 : Vérifier, commit**

e2e (toute la suite) vert, unit vert.

```bash
git add -A back && git commit -m "feat(notifications): preferences sous /me"
```

---

### Task 3 : `NotificationDispatcher` et rendez-vous (ajout, absence, modification, annulation)

**Files :**
- Create : `back/src/main/services/notification.dispatcher.ts`
- Create : `back/src/main/types/services/notification.dispatcher.interface.ts` (ou à côté des autres interfaces de services s'il existe un dossier ; sinon dans `types/domain/`)
- Modify : `back/src/main/infra/orm/repositories/notification.repository.ts` (+ interface) : `createMany(rows)` avec `skipDuplicates`
- Create : `back/src/main/infra/orm/repositories/notification-context.repository.ts` (+ interface) : lectures dont le dispatcher a besoin
- Modify : `back/src/main/domain/appointment.domain.ts`, IoC (`awilix-ioc-container.ts`, `types/application/ioc.ts`)
- Create : `back/src/test/e2e/notifications-rendez-vous.test.ts`

**Interfaces :**
- Consumes : Task 1 (`allows`, types), Task 2 (`findNotificationPrefsMany`), `membershipRepository.findServiceMembers()`.
- Produces :
  ```ts
  type SessionSnapshot = {
    appointmentId: string; slotId: string; startDate: Date
    thematicName: string | null; locationName: string | null
    soignantIds: string[]
    patients: { id: string; name: string }[]
  }
  interface NotificationDispatcherInterface {
    snapshot(appointmentIds: string[]): Promise<SessionSnapshot[]>
    patientsAdded(actorId: string, appointmentId: string, patientIds: string[]): void
    absent(actorId: string, appointmentId: string, patientIds: string[]): void
    moved(actorId: string, appointmentId: string, before: { startDate: Date; locationName: string | null }): void
    cancelled(actorId: string, snapshots: SessionSnapshot[]): void
    enrolled(actorId: string, patientId: string, appointmentIds: string[]): void
    slotFilled(actorId: string, slotId: string): void
  }
  ```
  `NotificationContextRepository` : `sessions(appointmentIds): Promise<SessionSnapshot[]>` (rendez-vous → créneau → modèle → soignants, salle, thème ; patients « NOM Prénom ») ; `slotOccupancy(slotId): Promise<{ capacity: number; booked: number; soignantIds: string[]; firstAppointmentId: string | null; startDate: Date; thematicName: string | null }>`.

- [ ] **Step 1 : Test e2e (échoue)**

Scénario commun (`beforeAll`) : un service A ; deux soignants `S` (« IDE ») et `T` (« Diététicienne ») ; comptes `ide1`, `ide2` (INTERVENANT, soignant S), `ideLecture` (LECTURE, soignant S), `ideOff` (INTERVENANT, S, désactivé), `diet` (INTERVENANT, T), `coord` (COORDINATEUR, sans soignant, l'auteur des actions) ; un modèle de créneau lié à `S` seulement, capacité 3, salle « Bureau 2 », thématique « Alimentation » ; un `Slot` ; un `Appointment` avec un patient `P1`. Lire `appointment.test.ts` et `creneau-archivage.test.ts` pour la création réelle de créneaux et rendez-vous (route ou `testDb`), et la forme exacte du corps de `PATCH /appointment/:id`.

Assistant d'attente (les notifications s'écrivent en tâche de fond) :

```ts
const notifs = async (email: string, type?: string, attendu = 1) => {
  for (let i = 0; i < 40; i += 1) {
    const rows = await testDb.notification.findMany({ where: { user: undefined, userId: ids[email], ...(type ? { type } : {}) } })
    if (rows.length >= attendu) return rows
    await new Promise((r) => setTimeout(r, 50))
  }
  return testDb.notification.findMany({ where: { userId: ids[email], ...(type ? { type } : {}) } })
}
const aucune = async (email: string, type: string) => {
  await new Promise((r) => setTimeout(r, 400))
  expect(await testDb.notification.count({ where: { userId: ids[email], type } })).toBe(0)
}
```

(retirer `user: undefined` si Prisma refuse ; `ids` = map email → userId remplie au `beforeAll`.)

Cas :

```ts
it('ajout d un patient : les soignants de la seance, pas l auteur, ni LECTURE, ni desactive, ni un autre metier', async () => {
  await patchAppointment(coordC, appointmentId, { appointmentPatients: [{ id: ap1, patientId: P1 }, { patientId: P2 }] })
  const [n] = await notifs('ide1@t.fr', 'PATIENT_ADDED')
  expect(n?.payload).toMatchObject({ appointmentId, patientId: P2, patientName: 'DUBOIS Marie', thematicName: 'Alimentation', actorId: ids['coord@t.fr'] })
  expect(await notifs('ide2@t.fr', 'PATIENT_ADDED')).toHaveLength(1)
  for (const email of ['coord@t.fr', 'idelecture@t.fr', 'ideoff@t.fr', 'diet@t.fr']) {
    await aucune(email, 'PATIENT_ADDED')
  }
})

it('absence sans raison : notifiee ; avec raison : rien', async () => {
  await patchAppointment(coordC, appointmentId, { appointmentPatients: [{ id: ap1, patientId: P1, status: 'no' }, { id: ap2, patientId: P2, status: 'no', rejectionReason: 'malade' }] })
  const rows = await notifs('ide1@t.fr', 'ABSENT')
  expect(rows).toHaveLength(1)
  expect(rows[0]?.payload).toMatchObject({ patientId: P1 })
})

it('changement d horaire du rendez-vous : modifie, avec avant et apres', async () => {
  await patchAppointment(coordC, appointmentId, { startDate: '2026-11-03T10:00:00.000Z', endDate: '2026-11-03T11:00:00.000Z' })
  const [n] = await notifs('ide1@t.fr', 'APPOINTMENT_MOVED')
  expect(n?.payload).toMatchObject({ before: { startDate: expect.any(String) }, after: { startDate: '2026-11-03T10:00:00.000Z' } })
})

it('suppression : annulation qui porte encore le theme et les patients', async () => {
  await t.app.inject({ method: 'DELETE', url: tenantUrl(E, A, `/appointment/${autreRdv}`), cookies: coordC })
  const [n] = await notifs('ide1@t.fr', 'APPOINTMENT_CANCELLED')
  expect(n?.payload).toMatchObject({ appointmentId: autreRdv, thematicName: 'Alimentation', patients: [{ name: 'DUBOIS Marie' }] })
})

it('preferences : evenement decoche ou service decoche, rien', async () => {
  await testDb.user.update({ where: { id: ids['ide2@t.fr'] }, data: { notificationPrefs: { app: { added: false } } } })
  await patchAppointment(coordC, troisiemeRdv, { appointmentPatients: [{ patientId: P3 }] })
  await notifs('ide1@t.fr', 'PATIENT_ADDED', 2)
  await aucune('ide2@t.fr', 'PATIENT_ADDED') // compter seulement celles du troisieme rendez-vous si l autre cas en a deja cree
})

it('une erreur du dispatcher n echoue pas la mise a jour', async () => {
  // rendre le dispatcher defaillant pour ce test : remplacer temporairement une methode du depot de contexte
  const ctx = t.instances.notificationContextRepository
  const original = ctx.sessions.bind(ctx)
  ctx.sessions = () => Promise.reject(new Error('panne'))
  const res = await patchAppointment(coordC, appointmentId, { appointmentPatients: [{ id: ap1, patientId: P1 }, { patientId: P4 }] })
  ctx.sessions = original
  expect(res.statusCode).toBe(200)
})
```

Adapter le cas « préférences » pour qu'il compte proprement (créer un rendez-vous dédié et compter par `payload.appointmentId`). Run e2e → FAIL.

- [ ] **Step 2 : Dépôt de contexte**

`notification-context.repository.ts` : sous le contexte de tenant (`tenantContext.scope()`), lecture `appointment.findMany({ where: { id: { in }, ...scope }, include: { thematic: true, appointmentPatients: { include: { patient: true } }, slot: { include: { slotTemplate: { include: { soignantLinks: true, location: true, thematic: true } } } } } })` → `SessionSnapshot` (thème : celui du rendez-vous, sinon du modèle ; nom patient `${lastName.toUpperCase()} ${firstName}`). `slotOccupancy` : `slot.findFirst({ where: { id, ...scope }, include: { slotTemplate: { include: { soignantLinks: true, thematic: true } }, appointments: { include: { appointmentPatients: true } } } })` → capacité `slotTemplate.capacity ?? 1`, `booked` = somme des patients. Réutiliser `soignantLinksInclude` si l'inclusion directe est refusée par la garde (lire `slot-template.include.ts`).

- [ ] **Step 3 : Dispatcher**

```ts
import type { NotificationType } from '../../generated/enums'
import type { IocContainer } from '../types/application/ioc'
import { allows } from '../utils/notification-prefs'

type Row = { userId: string; type: NotificationType; payload: Record<string, unknown>; dedupeKey?: string }

class NotificationDispatcher implements NotificationDispatcherInterface {
  // ponytail: une passe par appel, sans file ; une file si le volume l'exige un jour
  constructor(private readonly c: IocContainer) {}

  snapshot(appointmentIds: string[]) {
    return this.c.notificationContextRepository.sessions(appointmentIds)
  }

  patientsAdded(actorId: string, appointmentId: string, patientIds: string[]): void {
    this.#safe(async () => {
      const [s] = await this.snapshot([appointmentId])
      if (!s) return
      const rows = s.patients.filter((p) => patientIds.includes(p.id)).map((p) => ({ type: 'PATIENT_ADDED' as const, payload: { ...this.#session(s), actorId, patientId: p.id, patientName: p.name, count: 1, firstStartDate: s.startDate } }))
      await this.#toSession(actorId, s.soignantIds, rows)
    })
  }

  absent(actorId: string, appointmentId: string, patientIds: string[]): void {
    this.#safe(async () => {
      const [s] = await this.snapshot([appointmentId])
      if (!s) return
      const rows = s.patients.filter((p) => patientIds.includes(p.id)).map((p) => ({ type: 'ABSENT' as const, payload: { ...this.#session(s), actorId, patientId: p.id, patientName: p.name } }))
      await this.#toSession(actorId, s.soignantIds, rows)
    })
  }

  moved(actorId: string, appointmentId: string, before: { startDate: Date; locationName: string | null }): void {
    this.#safe(async () => {
      const [s] = await this.snapshot([appointmentId])
      if (!s) return
      const after = { startDate: s.startDate, locationName: s.locationName }
      await this.#toSession(actorId, s.soignantIds, [{ type: 'APPOINTMENT_MOVED', payload: { ...this.#session(s), actorId, before, after } }])
    })
  }

  cancelled(actorId: string, snapshots: SessionSnapshot[]): void {
    this.#safe(async () => {
      for (const s of snapshots.filter((x) => x.patients.length > 0)) {
        await this.#toSession(actorId, s.soignantIds, [{ type: 'APPOINTMENT_CANCELLED', payload: { ...this.#session(s), actorId, patients: s.patients } }])
      }
    })
  }

  enrolled(actorId: string, patientId: string, appointmentIds: string[]): void {
    this.#safe(async () => {
      const sessions = (await this.snapshot(appointmentIds)).sort((a, b) => a.startDate.getTime() - b.startDate.getTime())
      const members = await this.#members()
      const bySoignantUser = new Map<string, typeof sessions>()
      for (const s of sessions) {
        for (const userId of this.#usersOf(members, s.soignantIds, actorId)) {
          bySoignantUser.set(userId, [...(bySoignantUser.get(userId) ?? []), s])
        }
      }
      const rows: Row[] = []
      for (const [userId, mine] of bySoignantUser) {
        const first = mine[0] as SessionSnapshot
        const patient = first.patients.find((p) => p.id === patientId)
        rows.push({ userId, type: 'PATIENT_ADDED', payload: { ...this.#session(first), actorId, patientId, patientName: patient?.name ?? '', count: mine.length, firstStartDate: first.startDate } })
      }
      await this.#write(rows)
      for (const slotId of new Set(sessions.map((s) => s.slotId))) {
        await this.#slotFilled(actorId, slotId)
      }
    })
  }

  slotFilled(actorId: string, slotId: string): void {
    this.#safe(() => this.#slotFilled(actorId, slotId))
  }

  async #slotFilled(actorId: string, slotId: string) {
    const o = await this.c.notificationContextRepository.slotOccupancy(slotId)
    if (o.capacity < 2 || o.capacity - o.booked !== 1) return
    const members = await this.#members()
    const rows = this.#usersOf(members, o.soignantIds, actorId).map((userId) => ({
      userId,
      type: 'SLOT_ALMOST_FULL' as const,
      payload: { slotId, appointmentId: o.firstAppointmentId, startDate: o.startDate, thematicName: o.thematicName },
      dedupeKey: `full:${slotId}`,
    }))
    await this.#write(rows)
  }

  #session(s: SessionSnapshot) {
    return { appointmentId: s.appointmentId, slotId: s.slotId, startDate: s.startDate, thematicName: s.thematicName, locationName: s.locationName }
  }

  #members() {
    return this.c.membershipRepository.findServiceMembers()
  }

  #usersOf(members: Awaited<ReturnType<NotificationDispatcher['#members']>>, soignantIds: string[], actorId: string): string[] {
    return [...new Set(members.filter((m) => m.soignantId && soignantIds.includes(m.soignantId) && m.role !== 'LECTURE' && m.establishmentMembership.user.deactivatedAt === null).map((m) => m.establishmentMembership.user.id))].filter((id) => id !== actorId)
  }

  async #toSession(actorId: string, soignantIds: string[], rows: Omit<Row, 'userId'>[]) {
    const users = this.#usersOf(await this.#members(), soignantIds, actorId)
    await this.#write(users.flatMap((userId) => rows.map((r) => ({ ...r, userId }))))
  }

  async #write(rows: Row[]) {
    if (rows.length === 0) return
    const { serviceId } = this.c.tenantContext.scope()
    const prefs = await this.c.userRepository.findNotificationPrefsMany([...new Set(rows.map((r) => r.userId))])
    const kept = rows.filter((r) => { const p = prefs.get(r.userId); return p ? allows(p, r.type, serviceId) : true })
    await this.c.notificationRepository.createMany(kept)
  }

  #safe(work: () => Promise<void>): void {
    work().catch((err) => {
      const errorClass = err instanceof Error ? err.constructor.name : typeof err
      this.c.logger.error(`Notification failed [${errorClass}]`)
    })
  }
}

export { NotificationDispatcher }
```

Le type de `#usersOf` est à écrire avec le type réel des lignes de `findServiceMembers` (`ServiceMemberRow`, voir `membership.repository.interface.ts`). Le constructeur suit la convention du dépôt (déstructurer les dépendances nommées plutôt que garder le conteneur si Biome ou l'usage l'imposent). `NotificationRepository.createMany(rows)` pose `...tenantContext.scope()` sur chaque ligne et appelle `notification.createMany({ data, skipDuplicates: true })`. Enregistrer `notificationContextRepository` et `notificationDispatcher` dans l'IoC.

- [ ] **Step 4 : Branchement dans `AppointmentDomain`**

```ts
async update(appointmentID, params, userID) {
  // …vérifications existantes…
  const before = await this.appointmentRepository.findByID(appointmentID)
  const wasDeleted = params.appointmentPatients?.length === 0
  const snapshots = wasDeleted ? await this.notificationDispatcher.snapshot([appointmentID]) : []
  const appointment = await this.appointmentRepository.update(appointmentID, params)
  if (wasDeleted) {
    this.notificationDispatcher.cancelled(userID, snapshots)
  } else {
    this.appEventBus.emit('appointment.updated', { userID, appointmentId: appointment.id })
    this.#notifyChanges(userID, before, appointment, params)
  }
  return appointment
}

#notifyChanges(userID, before, after, params) {
  const known = new Set(before.appointmentPatients.map((p) => p.patientId))
  const added = after.appointmentPatients.filter((p) => !known.has(p.patientId)).map((p) => p.patientId)
  if (added.length > 0) {
    this.notificationDispatcher.patientsAdded(userID, after.id, added)
    this.notificationDispatcher.slotFilled(userID, after.slotID)
  }
  const wasNo = new Set(before.appointmentPatients.filter((p) => p.status === 'no').map((p) => p.patientId))
  const absent = after.appointmentPatients.filter((p) => p.status === 'no' && !p.rejectionReason && !wasNo.has(p.patientId)).map((p) => p.patientId)
  if (absent.length > 0) this.notificationDispatcher.absent(userID, after.id, absent)
  if (before.startDate.getTime() !== after.startDate.getTime() || (params.slotID && params.slotID !== before.slotID)) {
    this.notificationDispatcher.moved(userID, after.id, { startDate: before.startDate, locationName: null })
  }
}

async delete(appointmentID: string, userID: string) {
  const snapshots = await this.notificationDispatcher.snapshot([appointmentID])
  const deleted = await this.appointmentRepository.delete(appointmentID)
  this.notificationDispatcher.cancelled(userID, snapshots)
  return deleted
}
```

`delete` reçoit maintenant `userID` : mettre à jour l'interface du domaine et `routes/appointment.ts` (`request.user.userID`, comme `update`). Pour `moved` : la salle « avant » d'un rendez-vous n'existe pas (elle est sur le créneau) — passer celle de l'instantané si disponible ; la Task 4 couvre la salle via le créneau. Réduire la complexité cognitive si Biome se plaint (la méthode `#notifyChanges` est là pour ça).

- [ ] **Step 5 : Vérifier, commit**

e2e complète verte (la nouvelle suite et les existantes, dont `appointment.test.ts`), unit verte.

```bash
git add -A back && git commit -m "feat(notifications): dispatcher et notifications des rendez-vous"
```

---

### Task 4 : Créneaux et inscriptions

**Files :**
- Modify : `back/src/main/domain/slot.domain.ts` (+ route `slot.ts` pour passer `userID` à `update`/`delete`)
- Modify : `back/src/main/domain/patient.domain.ts` (`processEnrollments` / `enrollInSlot`)
- Create : `back/src/test/e2e/notifications-creneaux.test.ts`

**Interfaces :**
- Consumes : Task 3 (`NotificationDispatcher` : `snapshot`, `moved`, `cancelled`, `enrolled`, `slotFilled`).

- [ ] **Step 1 : Test e2e (échoue)**

Même scénario de soignants que Task 3 (copier le `beforeAll`). Cas :

- **déplacer le créneau** (`PATCH /slot/:id` avec un nouvel horaire, forme lue dans `front/src/queries/useSlot.ts` ou `creneau-archivage.test.ts`) → une `APPOINTMENT_MOVED` par rendez-vous **ayant des patients**, chez `ide1`, pas chez l'auteur ;
- **changer la salle** (`slotTemplate.locationID`) → `APPOINTMENT_MOVED` avec `before.locationName` « Bureau 2 », `after.locationName` la nouvelle ;
- **archiver** un créneau avec patients → `APPOINTMENT_CANCELLED` ; archiver un créneau vide → rien ;
- **supprimer** un créneau (vide de patients mais avec un rendez-vous vide) → rien ;
- **inscription à un parcours** de plusieurs séances dont deux animées par `S` : `ide1` reçoit **une** `PATIENT_ADDED` avec `count: 2` ; `diet` (dont le soignant anime une troisième séance) en reçoit une avec `count: 1`. Lire `parcours-prerequis.test.ts` / `patient.test.ts` pour la route d'inscription réelle ;
- **presque complet** : capacité 3, deux inscrits, ajout d'un troisième → rien ; capacité 3, un inscrit, ajout d'un deuxième → une `SLOT_ALMOST_FULL` ; retirer puis rajouter → toujours une seule (clé `full:{slotId}`) ; capacité 1 → jamais.

- [ ] **Step 2 : `SlotDomain`**

```ts
async update(slotID: string, params: SlotUpdateEntityDomain, userID: string) {
  const before = await this.slotRepository.findByID(slotID)
  const archiving = Boolean(params.archivedAt) && !before.archivedAt
  const snapshots = archiving ? await this.notificationDispatcher.snapshot(before.appointments.map((a) => a.id)) : []
  const after = await this.slotRepository.update(slotID, params)
  if (archiving) {
    this.notificationDispatcher.cancelled(userID, snapshots)
    return after
  }
  const timeChanged = before.startDate.getTime() !== after.startDate.getTime()
  const roomChanged = (before.slotTemplate?.location?.name ?? null) !== (after.slotTemplate?.location?.name ?? null)
  if (timeChanged || roomChanged) {
    for (const a of after.appointments.filter((x) => x.appointmentPatients.length > 0)) {
      this.notificationDispatcher.moved(userID, a.id, { startDate: before.startDate, locationName: before.slotTemplate?.location?.name ?? null })
    }
  }
  return after
}

async delete(slotID: string, userID: string) {
  const before = await this.slotRepository.findByID(slotID)
  const snapshots = await this.notificationDispatcher.snapshot(before.appointments.map((a) => a.id))
  const deleted = await this.slotRepository.delete(slotID)
  this.notificationDispatcher.cancelled(userID, snapshots)
  return deleted
}
```

Lire la forme réelle de `SlotDTODomain` (nom des champs de salle et de date, `flattenSlot`) et l'adapter. `startDate` du rendez-vous et du créneau ne bougent pas ensemble aujourd'hui : pour un créneau déplacé, l'instantané rapporte la date du **rendez-vous** ; utiliser la date du créneau (`after.startDate`) dans `after` si le rendez-vous n'a pas été mis à jour — écrire le cas pour qu'il affirme la nouvelle date du créneau. Passer `userID` depuis `routes/slot.ts` et mettre à jour l'interface. Les autres appelants de `slotDomain.update/delete` (planning, parcours) : `grep -rn "slotDomain\.\(update\|delete\)" back/src/main` et passer l'utilisateur courant (`tenantContext.current().userId`) là où il n'y a pas de requête directe.

- [ ] **Step 3 : Inscriptions**

Dans `PatientDomain.enrollInSlot`, faire rendre l'identifiant du rendez-vous rejoint ou créé ; dans `processEnrollments`, collecter `appointmentIds` par patient, puis après la boucle (et après l'émission existante de `patient.enrolled`) : `this.notificationDispatcher.enrolled(userID, patientId, appointmentIds)` pour chaque patient. `enrolled` déclenche aussi `slotFilled` pour chaque créneau touché (déjà dans le dispatcher).

- [ ] **Step 4 : Vérifier, commit**

e2e complète verte, unit verte.

```bash
git add -A back && git commit -m "feat(notifications): creneaux deplaces, archives, inscriptions et creneau presque complet"
```

---

### Task 5 : Planificateur

**Files :**
- Create : `back/src/main/services/notification.scheduler.ts`
- Create : `back/src/main/infra/orm/repositories/notification-schedule.repository.ts` (+ interface) : lectures **hors tenant**, bornes explicites
- Modify : `back/src/main/application/starter.ts` (`scheduleNotifications`), IoC
- Modify : `back/src/test/unit/infra/runAsSystem-unicite.test.ts` (déclarer le site, avec sa raison)
- Create : `back/src/test/e2e/notifications-planifiees.test.ts`

**Interfaces :**
- Consumes : Task 1 (`normalizePrefs`, `allows`), `NotificationRepository`.
- Produces : `NotificationScheduler.runOnce(now: Date): Promise<{ created: number; purged: number }>` (appelé par le `setInterval` et par les tests avec une date fixe).

- [ ] **Step 1 : Test e2e (échoue)**

Le test appelle directement `t.instances.notificationScheduler.runOnce(now)` sous `t.instances.tenantContext.runAsSystem(async () => …)`, avec des dates fixes, puis lit `testDb.notification`. Cas (scénario : service A, soignant S lié à un modèle de créneau, comptes `ide1` (délai `eve` par défaut), `ide2` (délai `1h`), soignant `SD` lié à une thématique `DIAGNOSTIC_EDUCATIF`, soignant `SB` lié à une thématique `BILAN_DE_FIN`, comptes qui les incarnent) :

- **rappel la veille** : rendez-vous le 2026-11-05 10:00 (Paris) ; `runOnce(2026-11-04 17:59 Paris)` → rien pour `ide1` ; `runOnce(2026-11-04 18:00)` → un `REMINDER` pour `ide1`, rien pour `ide2` ; `runOnce(2026-11-05 09:00)` → un `REMINDER` pour `ide2` ; un second `runOnce(09:05)` → toujours un seul par compte ;
- **rendez-vous déjà commencé** : aucun rappel ;
- **diagnostic** : dossier `entryDate = 2026-10-01`, aucun `DiagnosticEducatif` ; `runOnce(2026-10-08 08:00)` → `DIAGNOSTIC_DUE` chez le compte de `SD` ; avec un `DiagnosticEducatif` → rien ; `entryDate` vieille de 40 jours → rien (fenêtre de 30 jours) ;
- **fin de parcours** : patient dont la dernière séance du parcours était le 2026-10-10 ; `runOnce(2026-10-11 08:00)` → `PATHWAY_END` chez le compte de `SB` ; avec une séance de thématique `BILAN_DE_FIN` dans ce parcours → rien ;
- **échéance** : tâche ouverte `dueDate = 2026-10-21` taguée sur `ide1` ; `runOnce(2026-10-21 06:59 Paris)` → rien ; `runOnce(2026-10-21 07:00)` → `TASK_DUE` ; tâche terminée → rien ; tâche taguée sur un métier → les comptes de ce métier ;
- **préférences** : `ide1` avec `app.reminder = false` → aucun rappel ;
- **purge** : une notification de 31 jours est supprimée, une de 29 jours reste ;
- **idempotence** : `runOnce` deux fois de suite à la même heure ne crée rien de plus.

- [ ] **Step 2 : Dépôt de planification (hors tenant)**

Lectures sous `runAsSystem`, chaque requête bornée par ses propres filtres (dates, statut) ; renvoyer des lignes déjà « à plat » avec `establishmentId`, `serviceId`, et les identifiants de soignants :

- `upcomingAppointments(from, to)` : rendez-vous dont `startDate` ∈ [from, to], avec `slot.slotTemplate.soignantLinks`, thème, salle ;
- `entryDatesWithoutDiagnostic(from, to)` : `PatientServiceFile` dont `entryDate` ∈ [from, to], sans `DiagnosticEducatif` (même `patientId`, `serviceId`) ;
- `pathwaysEnded(from, to)` : par (parcours, patient), dernière séance passée dans [from, to] et aucune séance de thématique `BILAN_DE_FIN` dans ce parcours (lire le modèle `Pathway` / `Slot.pathwayID` et `findLastEndDateForPatient` dans `appointment.repository.ts`) ;
- `tasksDue(day)` : tâches ouvertes avec `dueDate = day`, tagués et métiers ;
- `membersBySoignant(serviceIds)` : membres actifs non LECTURE, avec `soignantId`, par service ;
- `soignantsOfThematicRole(serviceIds, role)` : soignants liés (`SoignantThematic`) aux thématiques de ce rôle ;
- `purgeOlderThan(date)` : `notification.deleteMany`.

- [ ] **Step 3 : Planificateur**

`runOnce(now)` :

1. **Rappels** : `upcomingAppointments(now, now + 25 h)` ; pour chaque destinataire (membres des soignants du créneau), heure de rappel selon `prefs.reminderDelay` : `eve` = veille à 18:00 Europe/Paris, `2h`/`1h` = `startDate − 2 h / 1 h` ; créer si `heureDeRappel <= now < startDate`, clé `reminder:{appointmentId}:{startDate ISO}` ;
2. **Diagnostic** : `entryDatesWithoutDiagnostic(now − 37 j, now − 7 j)` ; clé `diag:{patientServiceFileId}` ;
3. **Fin de parcours** : `pathwaysEnded(now − 30 j, now − 1 j fin de journée)` ; clé `end:{pathwayId}:{patientId}` ;
4. **Échéances** : si l'heure de Paris ≥ 7:00, `tasksDue(aujourd'hui Paris)` ; clé `due:{taskId}:{dueDate}` ;
5. **Purge** : `purgeOlderThan(now − 30 j)`.

Chaque ligne porte `establishmentId`/`serviceId` explicitement ; filtrage par `allows(prefs, type, serviceId)` ; écriture `createMany({ skipDuplicates: true })` (une méthode du dépôt de planification, puisque `NotificationRepository.createMany` lit le tenant courant). Fuseau : utiliser `dayjs` + plugins `utc`/`timezone` (vérifier qu'ils sont installés : `grep timezone back/package.json` ; sinon calculer le décalage Paris avec `Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', … })` dans un petit utilitaire testé).

Payloads : `REMINDER` = séance + `startDate` ; `DIAGNOSTIC_DUE` = `{ patientId, patientName, entryDate }` ; `PATHWAY_END` = `{ patientId, patientName, pathwayId, lastDate }` ; `TASK_DUE` = `{ taskId, text, dueDate }`.

- [ ] **Step 4 : Démarrage**

```ts
const FIFTEEN_MIN_MS = 15 * 60 * 1000

const scheduleNotifications = (instances: IocContainer): void => {
  const { notificationScheduler, logger, tenantContext } = instances
  const run = (): void => {
    tenantContext
      .runAsSystem(async () => {
        return await notificationScheduler.runOnce(new Date())
      })
      .then(({ created, purged }) => logger.info(`Notifications: ${created} créées, ${purged} purgées`))
      .catch((err) => {
        const errorClass = err instanceof Error ? err.constructor.name : typeof err
        logger.error(`Notifications schedule failed [${errorClass}]`)
      })
  }
  const timer = setInterval(run, FIFTEEN_MIN_MS)
  timer.unref?.()
  run()
}
```

Appeler `scheduleNotifications(iocContainer.instances)` dans `startApp`. Déclarer ce site dans `AUTORISES` de `runAsSystem-unicite.test.ts` (même entrée de fichier `application/starter.ts`, mettre à jour le compte d'appels et la prose : « troisième appel, la planification des notifications : aucune requête HTTP, et les rappels doivent parcourir tous les services »).

- [ ] **Step 5 : Vérifier, commit**

Unit (dont `runAsSystem-unicite`) et e2e complètes vertes.

```bash
git add -A back && git commit -m "feat(notifications): planificateur des rappels, diagnostics, fins de parcours et echeances"
```

---

### Task 6 : Front, rendu des types dans le panneau

**Files :**
- Modify : `front/src/types/task.ts` (union `Notification`)
- Create : `front/src/components/custom/inbox/notificationTypes.tsx` (table `TYPES` + rendu du texte par type)
- Modify : `front/src/components/custom/inbox/notificationsPanel.tsx` (ligne générique), `inbox.tsx` (clic par type)
- Modify : `front/src/routes/_authenticated/e/$establishmentId/s/$serviceId/agenda.tsx` (paramètre de recherche `date`)
- Create : `front/src/components/custom/inbox/notificationTypes.test.tsx`

**Interfaces :**
- Consumes : réponses de Task 3/4/5 (payloads de la spec).
- Produces : `NOTIFICATION_TYPES: Record<NotificationType, { icon: LucideIcon; color: string; tint: string; kind: string; cta: string }>` ; `notificationText(n, members): ReactNode` ; `notificationTarget(n): { kind: 'task'; taskId } | { kind: 'agenda'; date: string } | { kind: 'patient'; patientId: string }`.

- [ ] **Step 1 : Tests (échouent)**

`notificationTypes.test.tsx` : pour chaque type, rendu du texte attendu avec noms en gras (exemples du handoff `NOTIFS`), par exemple :

```tsx
it('patient ajoute, regroupe', () => {
  render(<>{notificationText(n('PATIENT_ADDED', { patientName: 'BERNARD Jean', thematicName: 'Alimentation', count: 6, firstStartDate: '2026-10-22T07:00:00.000Z', actorId: 'u2' }), [claire])}</>)
  expect(screen.getByText('BERNARD Jean').tagName).toBe('B')
  expect(document.body.textContent).toContain('à 6 de vos séances')
})
it('cible : rendez-vous -> agenda a la date, absence -> fiche, mention -> tache', () => {
  expect(notificationTarget(n('APPOINTMENT_MOVED', { after: { startDate: '2026-10-22T07:00:00.000Z' } }))).toEqual({ kind: 'agenda', date: '2026-10-22' })
  expect(notificationTarget(n('ABSENT', { patientId: 'p1' }))).toEqual({ kind: 'patient', patientId: 'p1' })
  expect(notificationTarget(n('MENTION', { taskId: 't1' }))).toEqual({ kind: 'task', taskId: 't1' })
})
```

Textes (dates « jeu. 22/10 à 09:00 » en Europe/Paris) :
- `PATIENT_ADDED` (count 1) : « **{patient}** a été ajouté à votre séance **{thème}** du {date} » ; (count > 1) : « **{patient}** a été ajouté à {count} de vos séances, la première le {date} » ;
- `REMINDER` : « {date} : **{thème}**{, salle} » ;
- `APPOINTMENT_MOVED` : « **{thème}** du {date avant} est déplacée au **{date après}** » (ou « change de salle : **{salle}** » si seule la salle change) ;
- `APPOINTMENT_CANCELLED` : « **{thème}** du {date} est annulée » ;
- `ABSENT` : « **{patient}** était absent à **{thème}** du {date}, sans justification » ;
- `SLOT_ALMOST_FULL` : « Plus qu'une place à **{thème}** du {date} » ;
- `DIAGNOSTIC_DUE` : « Diagnostic éducatif à réaliser pour **{patient}**, inclus le {entryDate} » ;
- `PATHWAY_END` : « **{patient}** a terminé son parcours. Bilan de fin à réaliser » ;
- `TASK_DUE` : « Échéance aujourd'hui : **{text}** » ;
- `MENTION` : inchangé.

- [ ] **Step 2 : Implémentation**

`types/task.ts` : `type NotificationType = 'MENTION' | 'REMINDER' | …` ; `Notification = { id; type: NotificationType; payload: Record<string, unknown>; readAt; createdAt }` ; garder un type `MentionPayload` pour le code existant (accès typés via petites fonctions de lecture dans `notificationTypes.tsx`). `notificationsPanel.tsx` : `MentionRow` devient `NotificationRow` qui lit `NOTIFICATION_TYPES[n.type]` pour pastille, couleur, méta « {kind} · {quand} » et lien ; `inbox.tsx` `openTasksFor` devient `openNotification(n)` : marque lue, puis selon `notificationTarget` : `task` → comportement actuel (y compris la règle `canTasks`) ; `agenda` → `navigate({ to: '/e/$establishmentId/s/$serviceId/agenda', params, search: { date } })` et ferme le panneau ; `patient` → route du dossier patient (lire `routes/.../patient/$patientID.tsx`). `agenda.tsx` : `validateSearch` acceptant `date?: string` (YYYY-MM-DD) et date initiale de l'agenda depuis ce paramètre (lire comment la date courante y est tenue).

- [ ] **Step 3 : Vérifier, commit**

`npx vitest run src/components/custom/inbox src/routes` vert, `npx tsc --noEmit`, Biome sur les fichiers touchés.

```bash
git add -A front && git commit -m "feat(front): rendu et liens des neuf types de notification"
```

---

### Task 7 : Front, préférences dans Mon compte

**Files :**
- Create : `front/src/api/notificationPrefs.api.ts`, `front/src/queries/useNotificationPrefs.ts`, `front/src/types/notificationPrefs.ts`
- Create : `front/src/components/settings/notificationPrefs.tsx`, `front/src/components/settings/notificationPrefs.test.tsx`
- Modify : `front/src/routes/_authenticated/user/settings.tsx` (section sous « Informations personnelles », ancre `id="notifications"`)
- Modify : `front/src/components/custom/inbox/notificationsPanel.tsx` (lien « Préférences » vers `/user/settings#notifications`)

**Interfaces :**
- Consumes : Task 2 (`GET/PUT /me/notification-preferences`), `useAuthStore` (services du compte : `user.establishments[].services[]`, vraies affectations `affecte !== false`).

- [ ] **Step 1 : Tests (échouent)**

```tsx
it('choisir Tout coche tout ; modifier une ligne passe en Personnalise', async () => {
  // GET mocke : essential, tout coche sauf absent
  render(<NotificationPrefs />, { wrapper })
  await u.click(await screen.findByRole('radio', { name: /Tout/ }))
  expect(put).toHaveBeenLastCalledWith(expect.objectContaining({ level: 'all', app: expect.objectContaining({ absent: true }) }))
  await u.click(screen.getByRole('switch', { name: /Absence non justifiée/ }))
  expect(put).toHaveBeenLastCalledWith(expect.objectContaining({ level: 'custom', app: expect.objectContaining({ absent: false }) }))
})
it('le dernier service coche ne se decoche pas', async () => { /* deux services ; decocher l un : PUT avec un service ; l autre est desactive */ })
it('delai du rappel', async () => { /* clic « 1 h avant » -> PUT reminderDelay: '1h' */ })
it('services null = tous coches', async () => { /* GET services: null -> les deux cases cochees */ })
```

- [ ] **Step 2 : Implémentation**

API sur `${apiUrl}/me/notification-preferences` (pas de tenant). Requête `['notification-prefs']`, mutation optimiste (`setQueryData` est permis ; pas de `getQueryData` : garder la valeur précédente dans le composant pour le retour arrière). Composant conforme à 15b (Global Constraints) : trois cartes radio (`role="radio"`, `aria-checked`), cases-boutons de services « {Établissement} › **{Service}** » (au moins une), grille par groupes avec un `Switch` (`components/ui/switch.tsx`, `aria-label` = libellé) par événement, pastilles de délai sous « Rappel ». `services: null` s'affiche « tous cochés » et s'enregistre explicitement au premier décochage. Choisir « Tout » ou « Essentiel » met tout `app` à `true`. Section ajoutée dans `settings.tsx` sur le modèle des sections voisines (icône `Bell`, titre « Notifications »).

- [ ] **Step 3 : Vérifier, commit**

`npx vitest run` (tout le front), `npx tsc --noEmit`, Biome.

```bash
git add -A front && git commit -m "feat(front): preferences de notification dans Mon compte"
```

---

### Task 8 : Vérification et merge

- [ ] Suites complètes back (unit + e2e) et front ; `tsc` des deux côtés.
- [ ] Merger `main` dans la branche s'il a avancé ; merge `--no-ff` sur `main` ; `npm run prisma:generate` et `npx prisma migrate deploy` dans le checkout principal ; le back de dev doit être relancé (pas de rechargement à chaud).
- [ ] Navigateur (4270) : préférences (niveau, ligne, service, délai) ; déplacer un créneau, ajouter un patient à une séance, marquer une absence, puis vérifier en base ou avec un compte soignant concerné que les notifications sont créées et s'affichent avec le bon lien.
- [ ] `graphify update .`.
