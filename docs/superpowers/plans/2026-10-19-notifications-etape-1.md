# Notifications et tâches, étape 1 : plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal :** remplacer le Todo personnel par des tâches partagées par service avec @mentions, poser le modèle `Notification` (type `MENTION`) et les deux icônes de la topbar (Tâches, Notifications) avec leurs panneaux.

**Architecture :** trois modèles de service (`Task`, `TaskAssignee`, `Notification`) sous la garde de tenant, des routes ordinaires sous `/e/:e/s/:s`. Le front lit « Tous » en lançant une requête par service de l'utilisateur (`useQueries`, URL explicites) et fusionne. Pas de store Zustand.

**Tech Stack :** Fastify + Prisma + Zod v4 (back, Jest), React 19 + TanStack Query/Router + Tailwind + Radix Popover + lucide-react (front, Vitest + Testing Library). Lint : Biome.

**Spec :** `docs/superpowers/specs/2026-10-19-notifications-etape-1-design.md`. Handoff : `docs/superpowers/specs/handoffs/notifications-15/` (README + `Notifications.dc.html`, tour 15 seulement).

## Global Constraints

- Lint et format : Biome (`npx biome check --write <fichiers>`), jamais ESLint ni Prettier, jamais de `biome-ignore`.
- Commentaires : une ligne ou rien, pas de pavés.
- Libellés UI en français, exactement ceux du handoff : « Tâches », « Notifications », « Tout lu », « Tous », « Non lues », « Toutes », « Pour moi », « Nouvelle tâche… tapez @ pour mentionner », « Ajouter », « Terminées · N », « Aucune tâche en cours », « Rien de neuf », « Conservées 30 jours », « Les soignants mentionnés reçoivent une notification. », « vous », « Ouvrir la tâche ».
- Couleurs : topbar #04182b, primary #2563eb, pastille notif #dc2626, mention #0f766e sur #f0fdfa, retard #b91c1c, non lue #f8fbff, survol #f8fafc. Le #04182b des handoffs s'écrit `text-foreground`/`bg-foreground` (le token `text` est un gris clair).
- `back/src/main/utils/permissions.ts` et `front/src/utils/permissions.ts` restent identiques à l'octet (un test le vérifie).
- Texte de tâche : `trim`, 1 à 500 caractères.
- Fenêtre : 30 jours pour les notifications et pour les tâches terminées.
- Rafraîchissement : `refetchInterval: 60_000`, `refetchOnWindowFocus: true`.
- Tests back dans le worktree : voir `back/` ci-dessous ; une base e2e par worktree (`medisync_test_<suffixe>`).

### Lancer les tests dans ce worktree

```bash
# une fois
cp /Users/couffinhal/Documents/MediSync/back/.env back/.env
cp /Users/couffinhal/Documents/MediSync/back/.env.test.local back/.env.test.local
cp /Users/couffinhal/Documents/MediSync/front/.env front/.env
(cd back && npm ci && npm run prisma:generate) && (cd front && npm ci)
# dans back/.env.test.local, DATABASE_URL doit viser medisync_test_notifs (créer la base si besoin)

# back, unitaires
cd back && NODE_OPTIONS=--experimental-vm-modules npx jest -c src/test/jest.config.ts --selectProjects unit
# back, e2e (après chaque migration)
cd back && npm run prisma:migrate:deploy:test && NODE_OPTIONS=--experimental-vm-modules npx dotenv-cli@7.3.0 -e .env.test.local -e .env.test -- npx jest --runInBand -c src/test/jest.config.ts --selectProjects e2e <fichier>
# front
cd front && npx vitest run <fichier>
```

## Review Focus

1. **Changement de service pendant que le panneau est ouvert** : le client React Query est remplacé (`useTenantSwitch`). Attendu : le bloc se remonte (`key={tenantKey(context)}`) et n'affiche ni tâches périmées ni erreur. Test : Task 6, « remonte au changement de contexte ».
2. **Utilisateur sur `/user/settings` (hors tenant)** : les icônes doivent marcher sans `tenantApiUrl()`. Test : Task 6, rendu sans contexte.
3. **Utilisateur LECTURE partout** : pas d'icône Tâches, aucune requête `/taches` (sinon 403 en boucle toutes les 60 s). Test : Task 6.
4. **Mention d'un collègue désactivé ou LECTURE forgée à la main** : 400, aucune tâche créée, aucune notification. Test : Task 3.
5. **Tâche dont le patient a été supprimé** : `GET /taches` ne plante pas, `patient` vaut `null`. Test : Task 3.

---

### Task 1 : Schéma, migration des Todos, garde de tenant, retrait du Todo back

**Files :**
- Modify : `back/prisma/schema.prisma` (retirer `model Todo` l.747-763 et `todos Todo[]` de `Soignant` l.343 ; ajouter `Task`, `TaskAssignee`, `NotificationType`, `Notification`)
- Create : `back/prisma/migrations/20261019100000_taches_notifications/migration.sql`
- Create : `back/src/test/unit/migrations/taches-notifications.migration.test.ts`
- Modify : `back/src/main/infra/orm/tenant-guard.ts` (`SERVICE_MODELS` l.9-30, `MODEL_RELATIONS` l.388-396, `NESTED_RELATIONS` l.127)
- Modify : `back/src/main/infra/orm/repositories/soignant.repository.ts:97-114` (retirer le comptage des todos)
- Delete : `back/src/main/domain/todo.domain.ts`, `back/src/main/infra/orm/repositories/todo.repository.ts`, `back/src/main/interfaces/http/fastify/routes/todo.ts`, `back/src/main/interfaces/http/fastify/schemas/todo.schema.ts`, `back/src/main/types/domain/todo.domain.interface.ts`, `back/src/main/types/infra/orm/repositories/todo.repository.interface.ts`, `back/bruno/MediSync/Todo/`, `back/prisma/seed/todo.ts`
- Modify : `back/src/main/application/ioc/awilix/awilix-ioc-container.ts` (l.36, 71, 149-151, 452-458), `back/src/main/types/application/ioc.ts` (l.34, 70, 141-143), `back/src/main/interfaces/http/fastify/routes/tenant.routes.ts` (l.38, 172), `back/prisma/seed.ts` (todos retirés ici, remis en Task 4)
- Modify (tests qui citent `Todo`) : `src/test/unit/infra/tenant-guard.test.ts`, `src/test/unit/infra/repository-scope.test.ts`, `src/test/unit/interfaces/global-auth-hook.test.ts`, `src/test/unit/interfaces/access-log-hook.test.ts`, `src/test/e2e/referentiels-archivage.test.ts`, `src/test/e2e/isolation.test.ts`, `src/test/e2e/permissions.test.ts` (la ligne `todo:own` part en Task 2)

**Interfaces :**
- Produces : modèles Prisma `task`, `taskAssignee`, `notification` ; enum `NotificationType { MENTION }` ; clé composite `id_serviceId` sur `Task` et `Notification`.

- [ ] **Step 1 : Écrire le test de migration (échoue : migration absente)**

Copier la structure de `src/test/unit/migrations/soignants-salles-par-service.migration.test.ts` (l.1-127 : `resolveConnection`, `clientFor`, `migrationDirs`, `priorMigrationFiles`, `applyTarget`, `nouvelleBase`, `beforeAll`/`afterAll`) avec `TARGET_MIGRATION = '20261019100000_taches_notifications'` et `PREFIX = 'medisync_migr_taches'`, puis ce cas :

```ts
it('migre chaque Todo en tache, tague les membres qui incarnent le soignant, puis supprime Todo', async () => {
  const c = await nouvelleBase('ok')
  try {
    await c.query(`
      INSERT INTO "Establishment" (id, name) VALUES ('E', 'CHU');
      INSERT INTO "Service" (id, "establishmentId", name, "createdAt") VALUES ('A', 'E', 'Cardio', '2026-01-01');
      INSERT INTO "Soignant" (id, "establishmentId", "serviceId", name) VALUES ('S', 'E', 'A', 'IDE');
      INSERT INTO "User" (id, email, password, salt) VALUES
        ('U1', 'u1@t.fr', 'x', 'x'), ('U2', 'u2@t.fr', 'x', 'x'), ('U3', 'u3@t.fr', 'x', 'x');
      INSERT INTO "EstablishmentMembership" (id, "userId", "establishmentId", role) VALUES
        ('M1', 'U1', 'E', 'MEMBER'), ('M2', 'U2', 'E', 'MEMBER'), ('M3', 'U3', 'E', 'MEMBER');
      INSERT INTO "ServiceMembership" (id, "establishmentMembershipId", "serviceId", "establishmentId", role, "soignantId") VALUES
        ('SM1', 'M1', 'A', 'E', 'INTERVENANT', 'S'),
        ('SM2', 'M2', 'A', 'E', 'COORDINATEUR', 'S'),
        ('SM3', 'M3', 'A', 'E', 'LECTURE', 'S');
      INSERT INTO "Todo" (id, "establishmentId", "serviceId", "createDate", title, description, completed, "soignantID") VALUES
        ('T1', 'E', 'A', '2026-05-01', 'Appeler', 'le labo', true, 'S'),
        ('T2', 'E', 'A', '2026-05-02', 'Seul', NULL, false, NULL);
    `)
    await applyTarget(c)

    const t1 = (await c.query(`SELECT * FROM "Task" WHERE id = 'T1'`)).rows[0]
    expect(t1.text).toBe('Appeler\nle labo')
    expect(t1.authorId).toBe('U1')
    expect(t1.doneAt).toEqual(new Date('2026-05-01'))
    const tagues = (
      await c.query(`SELECT "userId" FROM "TaskAssignee" WHERE "taskId" = 'T1' ORDER BY "userId"`)
    ).rows.map((r) => r.userId)
    expect(tagues).toEqual(['U1', 'U2'])

    const t2 = (await c.query(`SELECT * FROM "Task" WHERE id = 'T2'`)).rows[0]
    expect(t2.text).toBe('Seul')
    expect(t2.authorId).toBeNull()
    expect(t2.doneAt).toBeNull()
    expect((await c.query(`SELECT 1 FROM "TaskAssignee" WHERE "taskId" = 'T2'`)).rowCount).toBe(0)

    expect((await c.query(`SELECT to_regclass('"Todo"') AS t`)).rows[0].t).toBeNull()
  } finally {
    await c.end()
  }
})
```

Si une colonne `NOT NULL` des tables `User`/`EstablishmentMembership`/`ServiceMembership`/`Soignant` manque dans les `INSERT`, lire leur `CREATE TABLE` dans les migrations et compléter : c'est la seule adaptation permise.

- [ ] **Step 2 : Lancer, vérifier l'échec**

Run : `cd back && NODE_OPTIONS=--experimental-vm-modules npx jest -c src/test/jest.config.ts --selectProjects unit taches-notifications`
Expected : FAIL, « Migration cible "20261019100000_taches_notifications" introuvable ».

- [ ] **Step 3 : Modifier le schéma**

Dans `schema.prisma`, supprimer `model Todo` et la ligne `todos Todo[]` de `Soignant`. Ajouter à la fin :

```prisma
// Tâches partagées d'un service. authorId et les userId des tagués visent User sans relation (pont global).
model Task {
  id              String         @id @default(cuid())
  establishmentId String
  serviceId       String
  text            String
  authorId        String?
  // Patient.id sans relation : une clé composite ne pourrait pas passer à nul.
  patientId       String?
  dueDate         DateTime?      @db.Date
  doneAt          DateTime?
  createdAt       DateTime       @default(now())
  assignees       TaskAssignee[]

  @@unique([id, serviceId])
  @@index([serviceId])
}

model TaskAssignee {
  establishmentId String
  serviceId       String
  taskId          String
  userId          String
  task            Task   @relation(fields: [taskId, serviceId], references: [id, serviceId], onDelete: Cascade)

  @@id([taskId, userId])
  @@unique([taskId, userId, serviceId])
  @@index([serviceId])
  @@index([userId])
}

enum NotificationType {
  MENTION
}

model Notification {
  id              String           @id @default(cuid())
  establishmentId String
  serviceId       String
  userId          String
  type            NotificationType
  payload         Json
  readAt          DateTime?
  createdAt       DateTime         @default(now())

  @@unique([id, serviceId])
  @@index([serviceId])
  @@index([userId, createdAt])
}
```

Si `tenant-guard-schema.test.ts` exige `@@unique([id, serviceId])` sur chaque modèle de service et que `TaskAssignee` (sans `id`) le fait échouer, regarder comment `SlotTemplateSoignant` (même forme, sans `id`) est traité et faire pareil ; retirer alors le `@@unique([taskId, userId, serviceId])` s'il ne sert pas.

- [ ] **Step 4 : Générer la migration puis y insérer la copie des données**

Run : `cd back && npx prisma migrate dev --create-only --name taches_notifications`, puis renommer le dossier créé en `20261019100000_taches_notifications`.

Dans `migration.sql`, déplacer le `DROP TABLE "Todo";` (et le `DropForeignKey` de `Todo_soignantID_fkey` qui le précède) **à la fin**, et insérer juste avant :

```sql
-- Chaque Todo devient une tâche : tagués = membres hors LECTURE qui incarnent le soignant, auteur = le premier.
INSERT INTO "Task" ("id", "establishmentId", "serviceId", "text", "authorId", "createdAt", "doneAt")
SELECT t."id", t."establishmentId", t."serviceId",
  CASE WHEN t."description" IS NULL OR t."description" = '' THEN t."title" ELSE t."title" || E'\n' || t."description" END,
  (SELECT em."userId" FROM "ServiceMembership" sm
     JOIN "EstablishmentMembership" em ON em."id" = sm."establishmentMembershipId"
    WHERE sm."serviceId" = t."serviceId" AND sm."soignantId" = t."soignantID" AND sm."role" <> 'LECTURE'
    ORDER BY em."userId" LIMIT 1),
  t."createDate",
  CASE WHEN t."completed" THEN t."createDate" END
FROM "Todo" t;

INSERT INTO "TaskAssignee" ("establishmentId", "serviceId", "taskId", "userId")
SELECT DISTINCT t."establishmentId", t."serviceId", t."id", em."userId"
FROM "Todo" t
JOIN "ServiceMembership" sm ON sm."serviceId" = t."serviceId" AND sm."soignantId" = t."soignantID" AND sm."role" <> 'LECTURE'
JOIN "EstablishmentMembership" em ON em."id" = sm."establishmentMembershipId";
```

- [ ] **Step 5 : Relancer le test de migration**

Run : même commande qu'au Step 2. Expected : PASS. Lancer aussi `schema-migrations-drift` : `... --selectProjects unit schema-migrations-drift` → PASS.

- [ ] **Step 6 : Garde de tenant**

Dans `tenant-guard.ts` :
- `SERVICE_MODELS` : remplacer `'Todo'` par `'Task'`, `'TaskAssignee'`, `'Notification'`.
- `MODEL_RELATIONS` : remplacer l'entrée `Todo: { soignant: one('Soignant') }` par
  ```ts
  Task: { assignees: many('TaskAssignee') },
  TaskAssignee: { task: one('Task') },
  // `Notification` ne déclare aucune relation dans le schéma.
  Notification: {},
  ```
  et retirer `todos: many('Todo')` de `Soignant`.
- `NESTED_RELATIONS` : ajouter `Task: { assignees: 'TaskAssignee' },`.
- Le commentaire l.1184 cite « todo > soignant » : le retirer de l'énumération.

- [ ] **Step 7 : Retirer le Todo back**

- Supprimer les fichiers listés en « Delete ».
- `awilix-ioc-container.ts` : retirer les imports `TodoDomain`/`TodoRepository`, les appels `#registerTodoDomain()`/`#registerTodoRepository()` et leurs méthodes.
- `types/application/ioc.ts` : retirer les imports et les champs `todoDomain`/`todoRepository`.
- `tenant.routes.ts` : retirer l'import de `todoRouter` et son `register`.
- `soignant.repository.ts` `deleteForever` : retirer `this.prisma.todo.count(...)` de `Promise.all` et l'entrée `tâche`/`tâches` de `phraseDesReferences` ; l'index du comptage des membres devient `comptes[1]`.
- `prisma/seed.ts` : retirer l'import de `seedTodos`/`TodoData`, le champ `todos` de `ServiceContent` et des deux contenus, et l'appel `seedTodos`.

- [ ] **Step 8 : Mettre à jour les tests qui citent Todo**

- `tenant-guard.test.ts` l.262-385 : remplacer `model: 'Todo'` par `model: 'Task'` et `title: 't'` par `text: 't'`. Supprimer les deux cas « laisse passer soignant > todos … » (l.1432-1478) : la relation n'existe plus.
- `repository-scope.test.ts` : supprimer l'import de `TodoRepository` et les deux cas `TodoRepository …` (l.924-990).
- `global-auth-hook.test.ts:65` : `'/e/:establishmentId/s/:serviceId/todo'` → `'/e/:establishmentId/s/:serviceId/taches'`.
- `access-log-hook.test.ts` l.89, 109, 778, 785 : remplacer `${PREFIX}/todo/:todoID` par `${PREFIX}/location/:locationID` et `todoID: 't1'` par `locationID: 't1'` (c'est l'exemple d'une route sans patient).
- `referentiels-archivage.test.ts` l.128-153 : supprimer la création de `tache` et l'`expect` sur `todo.findUnique`.
- `isolation.test.ts` l.127-143 : supprimer le cas `todo` (le cas tâche arrive en Task 3).
- `soignants-salles-par-service.migration.test.ts` insère dans `"Todo"` **avant** sa migration cible : ne rien changer.

- [ ] **Step 9 : Vérifier**

Run : `cd back && npx tsc --noEmit -p . && npx biome check --write prisma src` puis la suite unit complète, puis `npm run prisma:migrate:deploy:test` et les e2e `isolation referentiels-archivage suppression-definitive`.
Expected : tout PASS. `permissions.test.ts` (e2e) échoue encore sur `todo:own` : c'est Task 2.

- [ ] **Step 10 : Commit**

```bash
git add -A back
git commit -m "feat(taches): modeles Task, TaskAssignee, Notification ; migration des Todos"
```

---

### Task 2 : Permissions

**Files :**
- Modify : `back/src/main/utils/permissions.ts`, puis copier à l'identique dans `front/src/utils/permissions.ts`
- Modify : `back/src/test/unit/utils/permissions.test.ts`, `back/src/test/e2e/permissions.test.ts:34,126`
- Modify : `docs/multi-tenant/habilitations.md:67`

**Interfaces :**
- Produces : permissions `tasks:read`, `tasks:write`, `notifications:own` ; `todo:own` n'existe plus.

- [ ] **Step 1 : Tests d'abord**

Dans `permissions.test.ts` (unit) : remplacer `'todo:own'` par `'notifications:own'` dans la liste attendue (l.25) et dans « accorde les lectures a tous les roles » (l.54). Ajouter :

```ts
it('donne les taches a tous les roles sauf la lecture', () => {
  for (const role of ['COORDINATEUR', 'INTERVENANT', 'SECRETARIAT'] as const) {
    expect(SERVICE_PERMISSIONS[role]).toContain('tasks:read')
    expect(SERVICE_PERMISSIONS[role]).toContain('tasks:write')
  }
  expect(SERVICE_PERMISSIONS.LECTURE).not.toContain('tasks:read')
  expect(SERVICE_PERMISSIONS.LECTURE).not.toContain('tasks:write')
})
```

Run : `... --selectProjects unit permissions` → FAIL.

- [ ] **Step 2 : Implémenter**

Dans `ServicePermission`, remplacer `| 'todo:own'` par :

```ts
  | 'tasks:read'
  | 'tasks:write'
  | 'notifications:own'
```

`READ_ALL` : remplacer `'todo:own'` par `'notifications:own'`. Ajouter `'tasks:read', 'tasks:write'` aux listes de `COORDINATEUR`, `INTERVENANT` et `SECRETARIAT`. Copier le fichier tel quel vers `front/src/utils/permissions.ts`.

- [ ] **Step 3 : Habilitations**

Dans `docs/multi-tenant/habilitations.md`, remplacer la ligne `todo:own` par :

```markdown
| `tasks:read` | Lire les tâches du service | ✔ | ✔ | ✔ | — |
| `tasks:write` | Créer, cocher les tâches du service | ✔ | ✔ | ✔ | — |
| `notifications:own` | Ses propres notifications | ✔ | ✔ | ✔ | ✔ |
```

(colonnes dans l'ordre du tableau existant ; vérifier l'en-tête.)

- [ ] **Step 4 : Vérifier, commit**

Run : unit `permissions` → PASS ; `cd front && npx tsc --noEmit` doit seulement se plaindre de `todo:own` dans le code Todo front (retiré en Task 7) ; si `can(context, 'todo:own')` existe dans le front, le laisser pour Task 7.
La ligne `todo:own` de `e2e/permissions.test.ts` est remplacée en Task 3, une fois les routes en place.

```bash
git add -A back/src/main/utils back/src/test/unit/utils front/src/utils/permissions.ts docs/multi-tenant/habilitations.md
git commit -m "feat(permissions): tasks:read, tasks:write, notifications:own remplacent todo:own"
```

---

### Task 3 : API des tâches et des notifications

**Files :**
- Create : `back/src/main/types/infra/orm/repositories/task.repository.interface.ts`, `back/src/main/infra/orm/repositories/task.repository.ts`
- Create : `back/src/main/types/domain/task.domain.interface.ts`, `back/src/main/domain/task.domain.ts`
- Create : `back/src/main/types/infra/orm/repositories/notification.repository.interface.ts`, `back/src/main/infra/orm/repositories/notification.repository.ts`
- Create : `back/src/main/types/domain/notification.domain.interface.ts`, `back/src/main/domain/notification.domain.ts`
- Create : `back/src/main/interfaces/http/fastify/schemas/task.schema.ts`, `.../schemas/notification.schema.ts`, `.../routes/task.ts`, `.../routes/notification.ts`
- Modify : `awilix-ioc-container.ts`, `types/application/ioc.ts`, `routes/tenant.routes.ts`
- Create : `back/src/test/e2e/taches.test.ts`
- Modify : `back/src/test/e2e/isolation.test.ts` (type `methods` + cas), `back/src/test/e2e/permissions.test.ts`

**Interfaces :**
- Consumes : modèles Prisma de Task 1, permissions de Task 2, `membershipRepository.findServiceMembers()` (rend `{ role, establishmentMembership: { user: { id, deactivatedAt } } }[]`), `postgresOrm.executeWithTransactionClient(fn)`, `tenantContext.current().userId`, `tenantContext.scope()`.
- Produces (JSON, consommé par le front en Task 5) :
  - `TaskDTO = { id: string, text: string, authorId: string | null, assigneeIds: string[], patient: { id, firstName, lastName } | null, dueDate: 'YYYY-MM-DD' | null, doneAt: string | null, createdAt: string }`
  - `NotificationDTO = { id: string, type: 'MENTION', payload: { taskId: string, authorId: string | null, text: string }, readAt: string | null, createdAt: string }`
  - `GET /taches → TaskDTO[]`, `POST /taches → 201 TaskDTO`, `PATCH /taches/:taskId → TaskDTO`, `GET /notifications → NotificationDTO[]`, `POST /notifications/:notificationId/lu → 204`, `POST /notifications/tout-lu → 204`.

- [ ] **Step 1 : Écrire le test e2e (échoue : routes absentes)**

`back/src/test/e2e/taches.test.ts` :

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

describe('taches partagees et mentions', () => {
  let t: TestApp
  let E: string
  let A: string
  let B: string
  let claire: string
  let leo: string
  let lecteur: string
  let ancien: string
  let leoC: Cookies
  let claireC: Cookies
  let lecteurC: Cookies

  const call = (c: Cookies, method: 'GET' | 'POST' | 'PATCH', url: string, payload?: object) =>
    t.app.inject({ method, url, cookies: c, ...(payload ? { payload } : {}) })

  beforeAll(async () => {
    t = await buildTestApp()
    await truncateAll()
    const est = await createEstablishment()
    E = est.id
    A = (await createService(E, 'Cardio')).id
    B = (await createService(E, 'Diabeto')).id
    const membre = (serviceId: string, role: 'INTERVENANT' | 'LECTURE') => [
      { establishmentId: E, services: [{ serviceId, role }] },
    ]
    leo = (await createUser({ email: 'leo@t.fr', memberships: membre(A, 'INTERVENANT') })).id
    claire = (await createUser({ email: 'claire@t.fr', memberships: membre(A, 'INTERVENANT') })).id
    lecteur = (await createUser({ email: 'lecteur@t.fr', memberships: membre(A, 'LECTURE') })).id
    ancien = (await createUser({ email: 'ancien@t.fr', memberships: membre(A, 'INTERVENANT') })).id
    await testDb.user.update({ where: { id: ancien }, data: { deactivatedAt: new Date() } })
    await createUser({ email: 'b@t.fr', memberships: membre(B, 'INTERVENANT') })
    leoC = await signIn(t.app, 'leo@t.fr')
    claireC = await signIn(t.app, 'claire@t.fr')
    lecteurC = await signIn(t.app, 'lecteur@t.fr')
  })

  afterAll(async () => {
    await t.close()
  })

  it('cree une tache avec mention : la notification part chez la taguee, pas chez l auteur', async () => {
    const res = await call(leoC, 'POST', tenantUrl(E, A, '/taches'), {
      text: '  Rappeler le labo  ',
      assigneeIds: [claire, leo],
      dueDate: '2026-10-22',
    })
    expect(res.statusCode).toBe(201)
    const tache = res.json()
    expect(tache).toMatchObject({
      text: 'Rappeler le labo',
      authorId: leo,
      dueDate: '2026-10-22',
      doneAt: null,
      patient: null,
    })
    expect(tache.assigneeIds.sort()).toEqual([claire, leo].sort())

    const deClaire = (await call(claireC, 'GET', tenantUrl(E, A, '/notifications'))).json()
    expect(deClaire).toHaveLength(1)
    expect(deClaire[0]).toMatchObject({
      type: 'MENTION',
      readAt: null,
      payload: { taskId: tache.id, authorId: leo, text: 'Rappeler le labo' },
    })
    expect((await call(leoC, 'GET', tenantUrl(E, A, '/notifications'))).json()).toEqual([])
  })

  it('sans tague, l auteur est tague et personne n est notifie', async () => {
    const avant = await testDb.notification.count()
    const res = await call(leoC, 'POST', tenantUrl(E, A, '/taches'), { text: 'Pour moi', assigneeIds: [] })
    expect(res.json().assigneeIds).toEqual([leo])
    expect(await testDb.notification.count()).toBe(avant)
  })

  it.each([
    ['un compte LECTURE', () => lecteur],
    ['un compte desactive', () => ancien],
    ['un inconnu du service', () => 'cl_inconnu_du_service_00000'],
  ])('refuse de taguer %s, sans rien creer', async (_, id) => {
    const taches = await testDb.task.count()
    const notifs = await testDb.notification.count()
    const res = await call(leoC, 'POST', tenantUrl(E, A, '/taches'), { text: 'x', assigneeIds: [id()] })
    expect(res.statusCode).toBe(400)
    expect(await testDb.task.count()).toBe(taches)
    expect(await testDb.notification.count()).toBe(notifs)
  })

  it('refuse un texte vide et un patient qui n est pas suivi dans le service', async () => {
    expect((await call(leoC, 'POST', tenantUrl(E, A, '/taches'), { text: '   ', assigneeIds: [] })).statusCode).toBe(400)
    const patient = await testDb.patient.create({
      data: { firstName: 'Ana', lastName: 'GARCIA', createDate: new Date(), establishmentId: E },
    })
    const res = await call(leoC, 'POST', tenantUrl(E, A, '/taches'), {
      text: 'x',
      assigneeIds: [],
      patientId: patient.id,
    })
    expect(res.statusCode).toBe(400)
  })

  it('rend le patient lie, puis null une fois le patient supprime', async () => {
    const patient = await testDb.patient.create({
      data: { firstName: 'Paul', lastName: 'ROBERT', createDate: new Date(), establishmentId: E },
    })
    await testDb.patientServiceFile.create({
      data: { patientId: patient.id, establishmentId: E, serviceId: A },
    })
    const res = await call(leoC, 'POST', tenantUrl(E, A, '/taches'), {
      text: 'Bilan',
      assigneeIds: [],
      patientId: patient.id,
    })
    expect(res.json().patient).toEqual({ id: patient.id, firstName: 'Paul', lastName: 'ROBERT' })
    await testDb.patientServiceFile.deleteMany({ where: { patientId: patient.id } })
    await testDb.patient.delete({ where: { id: patient.id } })
    const liste = (await call(leoC, 'GET', tenantUrl(E, A, '/taches'))).json()
    expect(liste.find((x: { id: string }) => x.id === res.json().id).patient).toBeNull()
  })

  it('coche et decoche ; masque les terminees de plus de 30 jours', async () => {
    const id = (await call(leoC, 'POST', tenantUrl(E, A, '/taches'), { text: 'Cocher', assigneeIds: [] })).json().id
    const coche = await call(claireC, 'PATCH', tenantUrl(E, A, `/taches/${id}`), { done: true })
    expect(coche.json().doneAt).not.toBeNull()
    const decoche = await call(claireC, 'PATCH', tenantUrl(E, A, `/taches/${id}`), { done: false })
    expect(decoche.json().doneAt).toBeNull()

    const vieille = await testDb.task.create({
      data: { text: 'Vieille', establishmentId: E, serviceId: A, doneAt: new Date(Date.now() - 31 * 86_400_000) },
    })
    const ids = (await call(leoC, 'GET', tenantUrl(E, A, '/taches'))).json().map((x: { id: string }) => x.id)
    expect(ids).toContain(id)
    expect(ids).not.toContain(vieille.id)
  })

  it('LECTURE : 403 sur les taches, 200 sur ses notifications', async () => {
    expect((await call(lecteurC, 'GET', tenantUrl(E, A, '/taches'))).statusCode).toBe(403)
    expect((await call(lecteurC, 'GET', tenantUrl(E, A, '/notifications'))).statusCode).toBe(200)
  })

  it('lu : 404 sur la notification d un autre ; tout-lu ne touche que les miennes', async () => {
    await call(claireC, 'POST', tenantUrl(E, A, '/taches'), { text: 'Pour Leo', assigneeIds: [leo] })
    await call(leoC, 'POST', tenantUrl(E, A, '/taches'), { text: 'Pour Claire', assigneeIds: [claire] })
    const deLeo = (await call(leoC, 'GET', tenantUrl(E, A, '/notifications'))).json()
    expect((await call(claireC, 'POST', tenantUrl(E, A, `/notifications/${deLeo[0].id}/lu`))).statusCode).toBe(404)
    expect((await call(leoC, 'POST', tenantUrl(E, A, `/notifications/${deLeo[0].id}/lu`))).statusCode).toBe(204)

    expect((await call(claireC, 'POST', tenantUrl(E, A, '/notifications/tout-lu'))).statusCode).toBe(204)
    const deClaire = (await call(claireC, 'GET', tenantUrl(E, A, '/notifications'))).json()
    expect(deClaire.every((n: { readAt: string | null }) => n.readAt !== null)).toBe(true)
    expect(await testDb.notification.count({ where: { userId: leo, readAt: null } })).toBe(0)
    await testDb.notification.updateMany({ where: { userId: leo }, data: { readAt: null } })
    await call(claireC, 'POST', tenantUrl(E, A, '/notifications/tout-lu'))
    expect(await testDb.notification.count({ where: { userId: leo, readAt: null } })).toBeGreaterThan(0)
  })

  it('masque les notifications de plus de 30 jours', async () => {
    const vieille = await testDb.notification.create({
      data: {
        establishmentId: E,
        serviceId: A,
        userId: claire,
        type: 'MENTION',
        payload: { taskId: 'x', authorId: leo, text: 'vieux' },
        createdAt: new Date(Date.now() - 31 * 86_400_000),
      },
    })
    const ids = (await call(claireC, 'GET', tenantUrl(E, A, '/notifications'))).json().map((n: { id: string }) => n.id)
    expect(ids).not.toContain(vieille.id)
  })
})
```

Si `patientServiceFile.create` exige d'autres colonnes, les lire dans `schema.prisma` (`model PatientServiceFile`) et compléter.

Run : `... --selectProjects e2e taches` → FAIL (404 sur les routes).

- [ ] **Step 2 : Dépôt des tâches**

`task.repository.interface.ts` :

```ts
import type { Task } from '../../../../../generated/client'

export type TaskEntityRepo = Task & { assignees: { userId: string }[] }
export type TaskCreateEntityRepo = {
  text: string
  authorId: string
  assigneeIds: string[]
  patientId: string | null
  dueDate: Date | null
}
export type PatientName = { id: string; firstName: string; lastName: string }

export interface TaskRepositoryInterface {
  findAll: (doneSince: Date) => Promise<TaskEntityRepo[]>
  createWithMentions: (input: TaskCreateEntityRepo) => Promise<TaskEntityRepo>
  setDone: (taskId: string, doneAt: Date | null) => Promise<TaskEntityRepo>
  isPatientInService: (patientId: string) => Promise<boolean>
  findPatientNames: (patientIds: string[]) => Promise<PatientName[]>
}
```

`task.repository.ts` :

```ts
import type { IocContainer } from '../../../types/application/ioc'
import type {
  PatientName,
  TaskCreateEntityRepo,
  TaskEntityRepo,
  TaskRepositoryInterface,
} from '../../../types/infra/orm/repositories/task.repository.interface'
import type { ErrorHandlerInterface } from '../../../types/utils/error-handler'
import type { TenantContextInterface } from '../../../types/utils/tenant-context'
import type { PostgresOrm, PostgresPrismaClient } from '../postgres-client'

const include = { assignees: { select: { userId: true } } } as const

class TaskRepository implements TaskRepositoryInterface {
  private readonly prisma: PostgresPrismaClient
  private readonly postgresOrm: PostgresOrm
  private readonly errorHandler: ErrorHandlerInterface
  private readonly tenantContext: TenantContextInterface

  constructor({ postgresOrm, errorHandler, tenantContext }: IocContainer) {
    this.prisma = postgresOrm.prisma
    this.postgresOrm = postgresOrm
    this.errorHandler = errorHandler
    this.tenantContext = tenantContext
  }

  private get scope() {
    return this.tenantContext.scope()
  }

  findAll(doneSince: Date): Promise<TaskEntityRepo[]> {
    return this.prisma.task.findMany({
      where: { ...this.scope, OR: [{ doneAt: null }, { doneAt: { gte: doneSince } }] },
      include,
      orderBy: { createdAt: 'desc' },
    })
  }

  // La tâche et les notifications de mention partent ensemble ou pas du tout.
  createWithMentions(input: TaskCreateEntityRepo): Promise<TaskEntityRepo> {
    const scope = this.scope
    return this.postgresOrm.executeWithTransactionClient(async (tx) => {
      const task = await tx.task.create({
        data: {
          ...scope,
          text: input.text,
          authorId: input.authorId,
          patientId: input.patientId,
          dueDate: input.dueDate,
          assignees: { create: input.assigneeIds.map((userId) => ({ ...scope, userId })) },
        },
        include,
      })
      const mentionned = input.assigneeIds.filter((id) => id !== input.authorId)
      if (mentionned.length > 0) {
        await tx.notification.createMany({
          data: mentionned.map((userId) => ({
            ...scope,
            userId,
            type: 'MENTION' as const,
            payload: { taskId: task.id, authorId: input.authorId, text: input.text },
          })),
        })
      }
      return task
    })
  }

  async setDone(taskId: string, doneAt: Date | null): Promise<TaskEntityRepo> {
    try {
      return await this.prisma.task.update({
        where: { id_serviceId: { id: taskId, serviceId: this.scope.serviceId } },
        data: { doneAt },
        include,
      })
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({ entityName: 'Task', error: err })
    }
  }

  async isPatientInService(patientId: string): Promise<boolean> {
    return (await this.prisma.patientServiceFile.count({ where: { ...this.scope, patientId } })) > 0
  }

  findPatientNames(patientIds: string[]): Promise<PatientName[]> {
    return this.prisma.patient.findMany({
      where: { id: { in: patientIds }, establishmentId: this.scope.establishmentId },
      select: { id: true, firstName: true, lastName: true },
    })
  }
}

export { TaskRepository }
```

Le nom exact du type de `postgresOrm` est celui de `src/main/types/infra/orm/client.ts` (qui déclare `executeWithTransactionClient`) : l'importer depuis là si `PostgresOrm` n'est pas exporté par `postgres-client.ts`. `executeWithTransactionClient` passe-t-il le `tx` par la garde de tenant ? Le test e2e le dira (une 500 « TenantScopeMissing » = non) ; dans ce cas, utiliser `this.prisma.$transaction(async (tx) => …)` comme le fait `postgres-client.ts:85`.

- [ ] **Step 3 : Domaine des tâches**

`task.domain.interface.ts` :

```ts
export type TaskDTO = {
  id: string
  text: string
  authorId: string | null
  assigneeIds: string[]
  patient: { id: string; firstName: string; lastName: string } | null
  dueDate: string | null
  doneAt: Date | null
  createdAt: Date
}
export type TaskCreateDomain = {
  text: string
  assigneeIds: string[]
  patientId?: string
  dueDate?: string
}

export type TaskDomainInterface = {
  findAll: () => Promise<TaskDTO[]>
  create: (input: TaskCreateDomain) => Promise<TaskDTO>
  setDone: (taskId: string, done: boolean) => Promise<TaskDTO>
}
```

`task.domain.ts` :

```ts
import Boom from '@hapi/boom'

import type { IocContainer } from '../types/application/ioc'
import type { TaskCreateDomain, TaskDomainInterface, TaskDTO } from '../types/domain/task.domain.interface'
import type { MembershipRepositoryInterface } from '../types/infra/orm/repositories/membership.repository.interface'
import type { TaskEntityRepo, TaskRepositoryInterface } from '../types/infra/orm/repositories/task.repository.interface'
import type { TenantContextInterface } from '../types/utils/tenant-context'

const DONE_WINDOW_MS = 30 * 86_400_000

class TaskDomain implements TaskDomainInterface {
  private readonly taskRepository: TaskRepositoryInterface
  private readonly membershipRepository: MembershipRepositoryInterface
  private readonly tenantContext: TenantContextInterface

  constructor({ taskRepository, membershipRepository, tenantContext }: IocContainer) {
    this.taskRepository = taskRepository
    this.membershipRepository = membershipRepository
    this.tenantContext = tenantContext
  }

  async findAll(): Promise<TaskDTO[]> {
    return this.toDTOs(await this.taskRepository.findAll(new Date(Date.now() - DONE_WINDOW_MS)))
  }

  async create(input: TaskCreateDomain): Promise<TaskDTO> {
    const { userId } = this.tenantContext.current()
    const requested = [...new Set(input.assigneeIds)]
    if (requested.length > 0) {
      const members = await this.membershipRepository.findServiceMembers()
      const eligible = new Set(
        members
          .filter((m) => m.role !== 'LECTURE' && m.establishmentMembership.user.deactivatedAt === null)
          .map((m) => m.establishmentMembership.user.id),
      )
      if (requested.some((id) => !eligible.has(id))) {
        throw Boom.badRequest('Assignee is not an active member of this service')
      }
    }
    if (input.patientId && !(await this.taskRepository.isPatientInService(input.patientId))) {
      throw Boom.badRequest('Patient is not followed in this service')
    }
    const task = await this.taskRepository.createWithMentions({
      text: input.text,
      authorId: userId,
      assigneeIds: requested.length > 0 ? requested : [userId],
      patientId: input.patientId ?? null,
      dueDate: input.dueDate ? new Date(`${input.dueDate}T00:00:00Z`) : null,
    })
    return (await this.toDTOs([task]))[0] as TaskDTO
  }

  async setDone(taskId: string, done: boolean): Promise<TaskDTO> {
    const task = await this.taskRepository.setDone(taskId, done ? new Date() : null)
    return (await this.toDTOs([task]))[0] as TaskDTO
  }

  private async toDTOs(tasks: TaskEntityRepo[]): Promise<TaskDTO[]> {
    const ids = [...new Set(tasks.flatMap((t) => (t.patientId ? [t.patientId] : [])))]
    const patients = new Map(
      (ids.length > 0 ? await this.taskRepository.findPatientNames(ids) : []).map((p) => [p.id, p]),
    )
    return tasks.map((t) => ({
      id: t.id,
      text: t.text,
      authorId: t.authorId,
      assigneeIds: t.assignees.map((a) => a.userId),
      patient: (t.patientId && patients.get(t.patientId)) || null,
      dueDate: t.dueDate ? t.dueDate.toISOString().slice(0, 10) : null,
      doneAt: t.doneAt,
      createdAt: t.createdAt,
    }))
  }
}

export { TaskDomain }
```

Le chemin exact de l'interface du dépôt des membres est `types/infra/orm/repositories/membership.repository.interface.ts` ; vérifier que `findServiceMembers` y est déclaré et que le champ du conteneur s'appelle bien `membershipRepository` (`grep membershipRepository src/main/types/application/ioc.ts`).

- [ ] **Step 4 : Dépôt et domaine des notifications**

`notification.repository.interface.ts` :

```ts
import type { Notification } from '../../../../../generated/client'

export type NotificationEntityRepo = Notification

export interface NotificationRepositoryInterface {
  findMine: (userId: string, since: Date) => Promise<NotificationEntityRepo[]>
  markRead: (userId: string, notificationId: string) => Promise<number>
  markAllRead: (userId: string) => Promise<void>
}
```

`notification.repository.ts` :

```ts
import type { IocContainer } from '../../../types/application/ioc'
import type {
  NotificationEntityRepo,
  NotificationRepositoryInterface,
} from '../../../types/infra/orm/repositories/notification.repository.interface'
import type { TenantContextInterface } from '../../../types/utils/tenant-context'
import type { PostgresPrismaClient } from '../postgres-client'

class NotificationRepository implements NotificationRepositoryInterface {
  private readonly prisma: PostgresPrismaClient
  private readonly tenantContext: TenantContextInterface

  constructor({ postgresOrm, tenantContext }: IocContainer) {
    this.prisma = postgresOrm.prisma
    this.tenantContext = tenantContext
  }

  findMine(userId: string, since: Date): Promise<NotificationEntityRepo[]> {
    return this.prisma.notification.findMany({
      where: { ...this.tenantContext.scope(), userId, createdAt: { gte: since } },
      orderBy: { createdAt: 'desc' },
    })
  }

  async markRead(userId: string, notificationId: string): Promise<number> {
    const { count } = await this.prisma.notification.updateMany({
      where: { ...this.tenantContext.scope(), id: notificationId, userId, readAt: null },
      data: { readAt: new Date() },
    })
    if (count > 0) {
      return count
    }
    return this.prisma.notification.count({
      where: { ...this.tenantContext.scope(), id: notificationId, userId },
    })
  }

  async markAllRead(userId: string): Promise<void> {
    await this.prisma.notification.updateMany({
      where: { ...this.tenantContext.scope(), userId, readAt: null },
      data: { readAt: new Date() },
    })
  }
}

export { NotificationRepository }
```

`notification.domain.interface.ts` :

```ts
import type { NotificationEntityRepo } from '../infra/orm/repositories/notification.repository.interface'

export type NotificationDomainInterface = {
  findMine: () => Promise<NotificationEntityRepo[]>
  markRead: (notificationId: string) => Promise<void>
  markAllRead: () => Promise<void>
}
```

`notification.domain.ts` :

```ts
import Boom from '@hapi/boom'

import type { IocContainer } from '../types/application/ioc'
import type { NotificationDomainInterface } from '../types/domain/notification.domain.interface'
import type {
  NotificationEntityRepo,
  NotificationRepositoryInterface,
} from '../types/infra/orm/repositories/notification.repository.interface'
import type { TenantContextInterface } from '../types/utils/tenant-context'

const RETENTION_MS = 30 * 86_400_000

class NotificationDomain implements NotificationDomainInterface {
  private readonly notificationRepository: NotificationRepositoryInterface
  private readonly tenantContext: TenantContextInterface

  constructor({ notificationRepository, tenantContext }: IocContainer) {
    this.notificationRepository = notificationRepository
    this.tenantContext = tenantContext
  }

  private get userId() {
    return this.tenantContext.current().userId
  }

  findMine(): Promise<NotificationEntityRepo[]> {
    return this.notificationRepository.findMine(this.userId, new Date(Date.now() - RETENTION_MS))
  }

  async markRead(notificationId: string): Promise<void> {
    if ((await this.notificationRepository.markRead(this.userId, notificationId)) === 0) {
      throw Boom.notFound('Notification not found')
    }
  }

  markAllRead(): Promise<void> {
    return this.notificationRepository.markAllRead(this.userId)
  }
}

export { NotificationDomain }
```

- [ ] **Step 5 : Schémas Zod et routes**

`schemas/task.schema.ts` :

```ts
import { z } from 'zod/v4'

export const taskResponseSchema = z.object({
  id: z.string(),
  text: z.string(),
  authorId: z.string().nullable(),
  assigneeIds: z.array(z.string()),
  patient: z.object({ id: z.string(), firstName: z.string(), lastName: z.string() }).nullable(),
  dueDate: z.string().nullable(),
  doneAt: z.coerce.date().nullable(),
  createdAt: z.coerce.date(),
})
export const tasksResponseSchema = z.array(taskResponseSchema)

export const createTaskSchema = z.object({
  text: z.string().trim().min(1).max(500),
  assigneeIds: z.array(z.string()).max(20).default([]),
  patientId: z.string().optional(),
  dueDate: z.iso.date().optional(),
})

export const taskParamsSchema = z.object({ taskId: z.string() })
export const setTaskDoneSchema = z.object({ done: z.boolean() })

export type CreateTaskBody = z.infer<typeof createTaskSchema>
export type TaskParams = z.infer<typeof taskParamsSchema>
export type SetTaskDoneBody = z.infer<typeof setTaskDoneSchema>
```

`routes/task.ts` :

```ts
import type { FastifyPluginAsync } from 'fastify'

import {
  type CreateTaskBody,
  createTaskSchema,
  type SetTaskDoneBody,
  setTaskDoneSchema,
  type TaskParams,
  taskParamsSchema,
  taskResponseSchema,
  tasksResponseSchema,
} from '../schemas/task.schema'

const taskRouter: FastifyPluginAsync = (fastify) => {
  const { taskDomain } = fastify.iocContainer

  fastify.get(
    '/',
    { schema: { response: { 200: tasksResponseSchema } }, config: { permission: 'tasks:read' } },
    () => taskDomain.findAll(),
  )

  fastify.post<{ Body: CreateTaskBody }>(
    '/',
    {
      schema: { body: createTaskSchema, response: { 201: taskResponseSchema } },
      config: { permission: 'tasks:write' },
    },
    async (request, reply) => {
      const task = await taskDomain.create(request.body)
      reply.code(201)
      return task
    },
  )

  fastify.patch<{ Params: TaskParams; Body: SetTaskDoneBody }>(
    '/:taskId',
    {
      schema: { params: taskParamsSchema, body: setTaskDoneSchema, response: { 200: taskResponseSchema } },
      config: { permission: 'tasks:write' },
    },
    (request) => taskDomain.setDone(request.params.taskId, request.body.done),
  )

  return Promise.resolve()
}

export { taskRouter }
```

`schemas/notification.schema.ts` :

```ts
import { z } from 'zod/v4'

export const notificationResponseSchema = z.object({
  id: z.string(),
  type: z.literal('MENTION'),
  payload: z.object({ taskId: z.string(), authorId: z.string().nullable(), text: z.string() }),
  readAt: z.coerce.date().nullable(),
  createdAt: z.coerce.date(),
})
export const notificationsResponseSchema = z.array(notificationResponseSchema)
export const notificationParamsSchema = z.object({ notificationId: z.string() })
export type NotificationParams = z.infer<typeof notificationParamsSchema>
```

`routes/notification.ts` :

```ts
import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod/v4'

import {
  type NotificationParams,
  notificationParamsSchema,
  notificationsResponseSchema,
} from '../schemas/notification.schema'

const notificationRouter: FastifyPluginAsync = (fastify) => {
  const { notificationDomain } = fastify.iocContainer

  fastify.get(
    '/',
    {
      schema: { response: { 200: notificationsResponseSchema } },
      config: { permission: 'notifications:own' },
    },
    () => notificationDomain.findMine(),
  )

  fastify.post(
    '/tout-lu',
    { schema: { response: { 204: z.null() } }, config: { permission: 'notifications:own' } },
    async (_request, reply) => {
      await notificationDomain.markAllRead()
      reply.code(204).send()
    },
  )

  fastify.post<{ Params: NotificationParams }>(
    '/:notificationId/lu',
    {
      schema: { params: notificationParamsSchema, response: { 204: z.null() } },
      config: { permission: 'notifications:own' },
    },
    async (request, reply) => {
      await notificationDomain.markRead(request.params.notificationId)
      reply.code(204).send()
    },
  )

  return Promise.resolve()
}

export { notificationRouter }
```

- [ ] **Step 6 : Câblage**

- `awilix-ioc-container.ts` : importer `TaskDomain`, `TaskRepository`, `NotificationDomain`, `NotificationRepository` ; à l'endroit où étaient les todos, appeler `#registerTask()` et `#registerNotification()` :
  ```ts
  #registerTask(): void {
    this.register('taskDomain', asClass(TaskDomain).singleton())
    this.register('taskRepository', asClass(TaskRepository).singleton())
  }
  #registerNotification(): void {
    this.register('notificationDomain', asClass(NotificationDomain).singleton())
    this.register('notificationRepository', asClass(NotificationRepository).singleton())
  }
  ```
- `types/application/ioc.ts` : ajouter `taskDomain: TaskDomainInterface`, `taskRepository: TaskRepositoryInterface`, `notificationDomain: NotificationDomainInterface`, `notificationRepository: NotificationRepositoryInterface` (readonly, comme les voisins).
- `tenant.routes.ts` : `await fastify.register(taskRouter, { prefix: '/taches' })` et `await fastify.register(notificationRouter, { prefix: '/notifications' })` là où était `todoRouter`.

- [ ] **Step 7 : Isolation et permissions**

`isolation.test.ts` : le type `IsolationCase.methods` accepte aussi `'PATCH'` avec un `payload` ; ajouter :

```ts
  {
    name: 'tache',
    create: (s, e) => testDb.task.create({ data: { text: 't', serviceId: s, establishmentId: e } }).then((r) => r.id),
    path: (id) => `/taches/${id}`,
    methods: ['PATCH'],
    payload: { done: true },
    ownerStatus: 200,
  },
```

et faire passer `payload` à `app.inject` dans la boucle qui exécute les cas (lire la boucle en bas du fichier ; ajouter `payload?: object` au type et `...(c.payload ? { payload: c.payload } : {})` à l'appel).

`permissions.test.ts` (e2e) : remplacer la ligne `todo:own` par

```ts
  { permission: 'tasks:read', method: 'GET', path: '/taches', heldStatus: 200 },
  { permission: 'tasks:write', method: 'PATCH', path: `/taches/${FAKE_ID}`, payload: { done: true } },
  { permission: 'notifications:own', method: 'GET', path: '/notifications', heldStatus: 200 },
```

et le commentaire l.34 (`todo:own`) par `notifications:own`. Vérifier que le type des lignes accepte `payload` et que l'absence de `heldStatus` signifie « 404 pour le détenteur » (sinon mettre `heldStatus: 404`).

- [ ] **Step 8 : Vérifier**

Run : `npx tsc --noEmit -p . && npx biome check --write src`, unit complet, e2e `taches isolation permissions` → PASS.

- [ ] **Step 9 : Commit**

```bash
git add -A back
git commit -m "feat(taches): API des taches et des notifications de mention"
```

---

### Task 4 : Seed et Bruno

**Files :**
- Create : `back/prisma/seed/task.ts`
- Modify : `back/prisma/seed.ts`
- Create : `back/bruno/MediSync/Taches/Get all Taches.bru`, `Add Tache.bru`, `Set Tache Done.bru` ; `back/bruno/MediSync/Notifications/Get Notifications.bru`, `Mark All Read.bru`

**Interfaces :**
- Consumes : `seedUsers` (rend les comptes créés : lire `prisma/seed/user.ts` pour le type exact), `seedService` de `seed.ts`.

- [ ] **Step 1 : Seed**

`prisma/seed/task.ts` :

```ts
import type { PrismaClient } from '../../src/generated/client'
import type { SeedTenant } from './tenant'

export type TaskData = { text: string; done: boolean }

// Auteur : le 2e compte ; tagué : le compte de dev, pour qu'il ait une mention non lue au premier lancement.
export default async function seedTasks(
  prisma: PrismaClient,
  tenant: SeedTenant,
  tasks: TaskData[],
  authorId: string,
  devUserId: string,
) {
  console.log('→ Seeding tasks...')
  for (const t of tasks) {
    const task = await prisma.task.create({
      data: {
        ...tenant,
        text: t.text,
        authorId,
        doneAt: t.done ? new Date() : null,
        assignees: { create: [{ ...tenant, userId: devUserId }] },
      },
    })
    if (!t.done) {
      await prisma.notification.create({
        data: { ...tenant, userId: devUserId, type: 'MENTION', payload: { taskId: task.id, authorId, text: t.text } },
      })
    }
  }
}
```

Dans `seed.ts` : remettre un champ `tasks: TaskData[]` dans `ServiceContent` avec les quatre libellés d'origine (« Vérifier le dossier médical de Claire » ouverte, « Préparer atelier nutrition » terminée ; idem Pneumologie avec Nadia / atelier souffle). Appeler `seedTasks` **après** `seedUsers` (déplacer l'appel hors de `seedService` si les comptes sont créés après les services), avec `devUserId` = le compte `admin@qwetle.fr` (membre des deux services) et `authorId` = `sabrina.bernadet@cepta.fr` (membre de Cardiologie seulement ; pour Pneumologie, prendre aussi le compte de dev comme auteur et ne pas créer de notification, puisqu'on ne se notifie pas soi-même : passer `authorId === devUserId` et garder la condition `if (!t.done && authorId !== devUserId)`).

Run : `cd back && npm run prisma:seed` sur la base de dev du worktree **seulement si** elle est jetable ; sinon `npx tsc --noEmit -p .` suffit.

- [ ] **Step 2 : Bruno**

Copier le format de `bruno/MediSync/Location/*.bru` (lire un fichier pour l'en-tête `meta`, l'URL `{{baseUrl}}/e/{{establishmentId}}/s/{{serviceId}}/…` et l'auth). Requêtes : `GET /taches`, `POST /taches` avec `{"text": "Rappeler le labo", "assigneeIds": []}`, `PATCH /taches/{{taskId}}` avec `{"done": true}`, `GET /notifications`, `POST /notifications/tout-lu`.

- [ ] **Step 3 : Commit**

```bash
git add -A back/prisma back/bruno
git commit -m "chore(taches): seed avec mention vers le compte de dev, requetes Bruno"
```

---

### Task 5 : Front, types, API et requêtes par service

**Files :**
- Create : `front/src/types/task.ts`, `front/src/api/inbox.api.ts`, `front/src/queries/useInbox.ts`, `front/src/queries/useInbox.test.tsx`
- Modify : `front/src/test/conventions-tenant-api-queries.test.ts` (deux exceptions)

**Interfaces :**
- Consumes : DTO de Task 3 ; `apiUrl` (`@/constants/config.constant.ts`), `fetchWithAuth` (`@/api/fetchWithAuth.ts`), `handleHttpError` (`@/libs/httpErrorHandler.ts`), `useAuthStore`, `SERVICE_PERMISSIONS` (`@/utils/permissions.ts`), types `ServiceMember`, `Patient`.
- Produces :
  ```ts
  type InboxService = { establishmentId: string; serviceId: string; name: string; canTasks: boolean }
  useInboxServices(): InboxService[]
  useTasks(services: InboxService[]): { tasks: InboxTask[]; isLoading: boolean }   // InboxTask = Task & { service: InboxService }
  useNotifications(services: InboxService[]): { notifications: InboxNotification[] } // InboxNotification = Notification & { service: InboxService }
  useServiceMembers(service: InboxService | undefined): ServiceMember[]
  useServicePatients(service: InboxService | undefined, enabled: boolean): Patient[]
  useInboxMutations(): { createTask, setTaskDone, markRead, markAllRead }
  ```

- [ ] **Step 1 : Types**

`front/src/types/task.ts` :

```ts
export type Task = {
  id: string
  text: string
  authorId: string | null
  assigneeIds: string[]
  patient: { id: string; firstName: string; lastName: string } | null
  dueDate: string | null
  doneAt: string | null
  createdAt: string
}

export type Notification = {
  id: string
  type: 'MENTION'
  payload: { taskId: string; authorId: string | null; text: string }
  readAt: string | null
  createdAt: string
}

export type CreateTaskInput = {
  text: string
  assigneeIds: string[]
  patientId?: string
  dueDate?: string
}
```

- [ ] **Step 2 : API sur URL explicite**

`front/src/api/inbox.api.ts` :

```ts
import { apiUrl } from '@/constants/config.constant.ts'
import { handleHttpError } from '@/libs/httpErrorHandler.ts'
import type { Patient } from '@/types/patient.ts'
import type { ServiceMember } from '@/types/serviceMember.ts'
import type { CreateTaskInput, Notification, Task } from '@/types/task.ts'
import { fetchWithAuth } from './fetchWithAuth.ts'

// Les panneaux de la topbar lisent TOUS les services du compte : le service est une donnée de la requête.
export type ServiceRef = { establishmentId: string; serviceId: string }

const url = (s: ServiceRef, path: string) => `${apiUrl}/e/${s.establishmentId}/s/${s.serviceId}${path}`

const send = async (s: ServiceRef, path: string, init: RequestInit, error: string) => {
  const response = await fetchWithAuth(url(s, path), init)
  if (!response.ok) {
    handleHttpError(response, {}, error)
    throw new Error(error)
  }
  return response
}

const json = { 'Content-Type': 'application/json' }

export const InboxApi = {
  tasks: async (s: ServiceRef): Promise<Task[]> =>
    (await send(s, '/taches', { method: 'GET' }, 'Impossible de charger les tâches')).json(),
  createTask: async (s: ServiceRef, input: CreateTaskInput): Promise<Task> =>
    (await send(s, '/taches', { method: 'POST', headers: json, body: JSON.stringify(input) }, 'Impossible de créer la tâche')).json(),
  setTaskDone: async (s: ServiceRef, taskId: string, done: boolean): Promise<Task> =>
    (await send(s, `/taches/${taskId}`, { method: 'PATCH', headers: json, body: JSON.stringify({ done }) }, 'Impossible de modifier la tâche')).json(),
  notifications: async (s: ServiceRef): Promise<Notification[]> =>
    (await send(s, '/notifications', { method: 'GET' }, 'Impossible de charger les notifications')).json(),
  markRead: async (s: ServiceRef, id: string): Promise<void> => {
    await send(s, `/notifications/${id}/lu`, { method: 'POST' }, 'Impossible de marquer la notification comme lue')
  },
  markAllRead: async (s: ServiceRef): Promise<void> => {
    await send(s, '/notifications/tout-lu', { method: 'POST' }, 'Impossible de tout marquer comme lu')
  },
  members: async (s: ServiceRef): Promise<ServiceMember[]> =>
    (await send(s, '/membres', { method: 'GET' }, 'Impossible de charger les membres du service')).json(),
  patients: async (s: ServiceRef): Promise<Patient[]> =>
    (await send(s, '/patient', { method: 'GET' }, 'Impossible de charger les patients')).json(),
}
```

Vérifier que `handleHttpError` ne lève pas déjà (s'il lève, le `throw` suivant est inatteignable mais inoffensif ; s'il lève toujours, retirer le `throw`). Vérifier que `fetchWithAuth` n'envoie pas de `Content-Type` sur un POST sans corps (Fastify refuse un corps JSON vide) ; c'est le cas ici, aucun `headers` n'est passé à `markRead`/`markAllRead`.

- [ ] **Step 3 : Test des requêtes (échoue)**

`front/src/queries/useInbox.test.tsx` :

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { InboxApi } from '@/api/inbox.api.ts'
import { useAuthStore } from '@/store/useAuthStore.ts'
import type { User } from '@/types/auth.ts'
import { useInboxServices, useNotifications, useTasks } from './useInbox.ts'

vi.mock('@/api/inbox.api.ts', () => ({
  InboxApi: { tasks: vi.fn(), notifications: vi.fn() },
}))

const user: User = {
  id: 'u1',
  email: 'a@b.fr',
  firstName: 'Léo',
  lastName: 'C',
  isSuperAdmin: false,
  establishments: [
    {
      id: 'e1',
      name: 'CHU',
      role: 'MEMBER',
      services: [
        { id: 's1', name: 'Cardio', role: 'INTERVENANT', affecte: true },
        { id: 's2', name: 'Diabeto', role: 'LECTURE', affecte: true },
        { id: 's3', name: 'Implicite', role: 'COORDINATEUR', affecte: false },
      ],
    },
  ],
}

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    {children}
  </QueryClientProvider>
)

describe('useInbox', () => {
  beforeEach(() => {
    useAuthStore.setState({ user })
    vi.mocked(InboxApi.tasks).mockReset()
    vi.mocked(InboxApi.notifications).mockReset()
  })

  it('ne retient que les vraies affectations, et marque celles qui ont les taches', () => {
    const { result } = renderHook(() => useInboxServices(), { wrapper })
    expect(result.current).toEqual([
      { establishmentId: 'e1', serviceId: 's1', name: 'Cardio', canTasks: true },
      { establishmentId: 'e1', serviceId: 's2', name: 'Diabeto', canTasks: false },
    ])
  })

  it('interroge chaque service et fusionne ; jamais /taches sur un service LECTURE', async () => {
    vi.mocked(InboxApi.notifications).mockImplementation(async (s) => [
      { id: `n-${s.serviceId}`, type: 'MENTION', payload: { taskId: 't', authorId: null, text: 'x' }, readAt: null, createdAt: '2026-10-19T08:00:00Z' },
    ])
    vi.mocked(InboxApi.tasks).mockResolvedValue([])
    const { result } = renderHook(
      () => {
        const services = useInboxServices()
        return { n: useNotifications(services), t: useTasks(services) }
      },
      { wrapper },
    )
    await waitFor(() => expect(result.current.n.notifications).toHaveLength(2))
    expect(result.current.n.notifications.map((n) => n.service.serviceId)).toEqual(['s1', 's2'])
    expect(vi.mocked(InboxApi.tasks).mock.calls.map(([s]) => s.serviceId)).toEqual(['s1'])
  })
})
```

Run : `cd front && npx vitest run src/queries/useInbox.test.tsx` → FAIL (module absent).

- [ ] **Step 4 : Implémenter les requêtes**

`front/src/queries/useInbox.ts` :

```ts
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'

import { InboxApi, type ServiceRef } from '@/api/inbox.api.ts'
import { useAuthStore } from '@/store/useAuthStore.ts'
import type { CreateTaskInput, Notification, Task } from '@/types/task.ts'
import { SERVICE_PERMISSIONS } from '@/utils/permissions.ts'

export type InboxService = ServiceRef & { name: string; canTasks: boolean }
export type InboxTask = Task & { service: InboxService }
export type InboxNotification = Notification & { service: InboxService }

const live = { refetchInterval: 60_000, refetchOnWindowFocus: true } as const
const keys = {
  tasks: (s: ServiceRef) => ['inbox', 'taches', s.serviceId],
  notifications: (s: ServiceRef) => ['inbox', 'notifications', s.serviceId],
}

// Vraies affectations seulement : ni coordinateur implicite, ni octroi temporaire.
export const useInboxServices = (): InboxService[] => {
  const user = useAuthStore((state) => state.user)
  return useMemo(
    () =>
      (user?.establishments ?? []).flatMap((e) =>
        e.services
          .filter((s) => s.affecte !== false)
          .map((s) => ({
            establishmentId: e.id,
            serviceId: s.id,
            name: s.name,
            canTasks: SERVICE_PERMISSIONS[s.role].includes('tasks:read'),
          })),
      ),
    [user],
  )
}

export const useTasks = (services: InboxService[]) => {
  const withTasks = services.filter((s) => s.canTasks)
  return useQueries({
    queries: withTasks.map((s) => ({ queryKey: keys.tasks(s), queryFn: () => InboxApi.tasks(s), ...live })),
    combine: (results) => ({
      tasks: results.flatMap((r, i) => (r.data ?? []).map((t) => ({ ...t, service: withTasks[i] as InboxService }))),
      isLoading: results.some((r) => r.isLoading),
    }),
  })
}

export const useNotifications = (services: InboxService[]) =>
  useQueries({
    queries: services.map((s) => ({ queryKey: keys.notifications(s), queryFn: () => InboxApi.notifications(s), ...live })),
    combine: (results) => ({
      notifications: results.flatMap((r, i) =>
        (r.data ?? []).map((n) => ({ ...n, service: services[i] as InboxService })),
      ),
    }),
  })

export const useServiceMembers = (service: InboxService | undefined) =>
  useQuery({
    queryKey: ['inbox', 'membres', service?.serviceId],
    queryFn: () => InboxApi.members(service as InboxService),
    enabled: service !== undefined,
    staleTime: 5 * 60_000,
  }).data ?? []

export const useServicePatients = (service: InboxService | undefined, enabled: boolean) =>
  useQuery({
    queryKey: ['inbox', 'patients', service?.serviceId],
    queryFn: () => InboxApi.patients(service as InboxService),
    enabled: enabled && service !== undefined,
    staleTime: 5 * 60_000,
  }).data ?? []

export const useInboxMutations = () => {
  const client = useQueryClient()
  const refreshTasks = (s: ServiceRef) => client.invalidateQueries({ queryKey: keys.tasks(s) })
  const refreshNotifications = (s: ServiceRef) => client.invalidateQueries({ queryKey: keys.notifications(s) })
  return {
    createTask: useMutation({
      mutationFn: ({ service, input }: { service: InboxService; input: CreateTaskInput }) =>
        InboxApi.createTask(service, input),
      onSuccess: (_task, { service }) => refreshTasks(service),
    }),
    setTaskDone: useMutation({
      mutationFn: ({ task, done }: { task: InboxTask; done: boolean }) =>
        InboxApi.setTaskDone(task.service, task.id, done),
      onSettled: (_r, _e, { task }) => refreshTasks(task.service),
    }),
    markRead: useMutation({
      mutationFn: (n: InboxNotification) => InboxApi.markRead(n.service, n.id),
      onSettled: (_r, _e, n) => refreshNotifications(n.service),
    }),
    markAllRead: useMutation({
      mutationFn: (services: InboxService[]) => Promise.all(services.map((s) => InboxApi.markAllRead(s))),
      onSettled: (_r, _e, services) => Promise.all(services.map(refreshNotifications)),
    }),
  }
}
```

La coche « optimiste » de la spec est rendue côté composant (état local `pending`, Task 7) : pas de `setQueryData` ici, ce qui évite d'ajouter une exception à `lecture-directe-du-cache.test.ts`.

- [ ] **Step 5 : Exceptions de convention**

Dans `front/src/test/conventions-tenant-api-queries.test.ts`, ajouter à `EXCEPTIONS` :

```ts
  {
    fichier: 'api/inbox.api.ts',
    raison:
      'panneaux Taches et Notifications de la topbar (2026-10-19) : ils lisent TOUS les services du compte, ' +
      "y compris hors des layouts de tenant ; le service est une DONNEE de la requete, comme pour setOwnSoignant",
    occurrences: 0,
  },
  {
    fichier: 'queries/useInbox.ts',
    raison: 'meme raison que api/inbox.api.ts : une requete par service du compte, cle portant le service',
    occurrences: 0,
  },
```

Lancer le test, lire le nombre réel d'occurrences dans le message d'échec et remplacer les deux `0`.

- [ ] **Step 6 : Vérifier, commit**

Run : `cd front && npx vitest run src/queries/useInbox.test.tsx src/test && npx tsc --noEmit && npx biome check --write src` → PASS (hors erreurs `todo:own` du code Todo restant, retiré en Task 7).

```bash
git add -A front/src
git commit -m "feat(front): requetes taches et notifications par service du compte"
```

---

### Task 6 : Topbar, icônes et panneau Notifications

**Files :**
- Create : `front/src/components/custom/inbox/inbox.utils.ts`, `inbox.utils.test.ts`, `inbox.tsx`, `notificationsPanel.tsx`, `panelChrome.tsx`, `inbox.test.tsx`
- Modify : `front/src/components/navbar.tsx` (l.17, 222-238, 375-386), `front/src/components/navbar.test.tsx`

**Interfaces :**
- Consumes : Task 5 (`useInboxServices`, `useTasks`, `useNotifications`, `useServiceMembers`, `useInboxMutations`, `InboxNotification`, `InboxTask`), `tenantKey` (`@/hooks/useTenantSwitch.ts`), `PopoverRoot/Trigger/Content`.
- Produces :
  ```ts
  // inbox.utils.ts
  memberName(members: ServiceMember[], userId: string | null): string    // « Claire Leroy », ou « Un ancien membre »
  whenLabel(iso: string, now?: Date): string                               // « à l'instant », « il y a 5 min », « il y a 3 h », « Hier 17:10 », « lun. 12/10 »
  dayGroup(iso: string, now?: Date): "Aujourd'hui" | 'Hier' | 'Cette semaine' | 'Plus ancien'
  // inbox.tsx
  type InboxPanel = 'tasks' | 'notifs' | null
  type Focus = { serviceId: string; taskId: string } | null   // tâche à surligner, posée par un clic de mention
  export function Inbox(): JSX.Element
  // panelChrome.tsx (partagé avec Task 7)
  PanelHeader({ icon, title, count, action? }), ServiceChips({ services, counts, value, onChange }), Segmented({ options, value, onChange })
  ```

- [ ] **Step 1 : Utilitaires (test d'abord)**

`inbox.utils.test.ts` :

```ts
import { describe, expect, it } from 'vitest'

import type { ServiceMember } from '@/types/serviceMember.ts'
import { dayGroup, memberName, whenLabel } from './inbox.utils.ts'

const now = new Date('2026-10-19T12:00:00')

describe('inbox.utils', () => {
  it('dit quand', () => {
    expect(whenLabel('2026-10-19T11:59:40', now)).toBe("à l'instant")
    expect(whenLabel('2026-10-19T11:55:00', now)).toBe('il y a 5 min')
    expect(whenLabel('2026-10-19T09:00:00', now)).toBe('il y a 3 h')
    expect(whenLabel('2026-10-18T17:10:00', now)).toBe('Hier 17:10')
    expect(whenLabel('2026-10-12T09:00:00', now)).toBe('lun. 12/10')
  })

  it('range par jour', () => {
    expect(dayGroup('2026-10-19T08:00:00', now)).toBe("Aujourd'hui")
    expect(dayGroup('2026-10-18T08:00:00', now)).toBe('Hier')
    expect(dayGroup('2026-10-14T08:00:00', now)).toBe('Cette semaine')
    expect(dayGroup('2026-10-01T08:00:00', now)).toBe('Plus ancien')
  })

  it('nomme un membre', () => {
    const m = { user: { id: 'u2', firstName: 'Claire', lastName: 'Leroy', email: 'c@t.fr' } } as ServiceMember
    expect(memberName([m], 'u2')).toBe('Claire Leroy')
    expect(memberName([m], 'u9')).toBe('Un ancien membre')
    expect(memberName([m], null)).toBe('Un ancien membre')
  })
})
```

Run : `npx vitest run src/components/custom/inbox/inbox.utils.test.ts` → FAIL.

`inbox.utils.ts` :

```ts
import type { ServiceMember } from '@/types/serviceMember.ts'

const DAY = 86_400_000
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
const hhmm = (d: Date) => d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })

export const memberName = (members: ServiceMember[], userId: string | null): string => {
  const user = members.find((m) => m.user.id === userId)?.user
  if (!user) {
    return 'Un ancien membre'
  }
  return [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email
}

export const dayGroup = (iso: string, now = new Date()) => {
  const days = Math.round((startOfDay(now) - startOfDay(new Date(iso))) / DAY)
  if (days <= 0) return "Aujourd'hui"
  if (days === 1) return 'Hier'
  if (days < 7) return 'Cette semaine'
  return 'Plus ancien'
}

export const whenLabel = (iso: string, now = new Date()): string => {
  const date = new Date(iso)
  const minutes = Math.floor((now.getTime() - date.getTime()) / 60_000)
  const group = dayGroup(iso, now)
  if (group === "Aujourd'hui") {
    if (minutes < 1) return "à l'instant"
    if (minutes < 60) return `il y a ${minutes} min`
    return `il y a ${Math.floor(minutes / 60)} h`
  }
  if (group === 'Hier') return `Hier ${hhmm(date)}`
  const weekday = date.toLocaleDateString('fr-FR', { weekday: 'short' })
  const dm = date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })
  return `${weekday} ${dm}`
}
```

(Biome exige des accolades sur les `if` : laisser `biome check --write` les ajouter.)

Run → PASS.

- [ ] **Step 2 : Test du bloc topbar (échoue)**

`inbox.test.tsx` — monter `<Inbox />` dans un `QueryClientProvider`, avec `vi.mock('@/api/inbox.api.ts')` comme en Task 5, le store posé avec l'utilisateur de Task 5 (s1 INTERVENANT, s2 LECTURE) et `InboxApi.members` rendant Claire (`u2`) et Léo (`u1`).

```tsx
it('pastilles : non lues en rouge, taches ouvertes ou je suis tague en bleu, rien a 0', async () => {
  vi.mocked(InboxApi.notifications).mockImplementation(async (s) =>
    s.serviceId === 's1'
      ? [notif('n1', null), notif('n2', '2026-10-19T09:00:00Z')]
      : [],
  )
  vi.mocked(InboxApi.tasks).mockResolvedValue([task('t1', ['u1']), task('t2', ['u2']), { ...task('t3', ['u1']), doneAt: '2026-10-19T09:00:00Z' }])
  render(<Inbox />, { wrapper })
  expect(await screen.findByTestId('badge-notifs')).toHaveTextContent('1')
  expect(await screen.findByTestId('badge-tasks')).toHaveTextContent('1')
})

it('aucune pastille a 0', async () => {
  vi.mocked(InboxApi.notifications).mockResolvedValue([])
  vi.mocked(InboxApi.tasks).mockResolvedValue([])
  render(<Inbox />, { wrapper })
  await screen.findByRole('button', { name: 'Notifications' })
  expect(screen.queryByTestId('badge-notifs')).toBeNull()
  expect(screen.queryByTestId('badge-tasks')).toBeNull()
})

it('un seul panneau ouvert a la fois', async () => {
  const u = userEvent.setup()
  render(<Inbox />, { wrapper })
  await u.click(await screen.findByRole('button', { name: 'Notifications' }))
  expect(await screen.findByRole('heading', { name: /Notifications/ })).toBeInTheDocument()
  await u.click(screen.getByRole('button', { name: 'Tâches' }))
  expect(await screen.findByRole('heading', { name: /Tâches/ })).toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: /Notifications/ })).toBeNull()
})

it('pas d icone Taches pour un compte qui n a que LECTURE', async () => {
  useAuthStore.setState({ user: { ...user, establishments: [{ ...user.establishments[0], services: [{ id: 's2', name: 'Diabeto', role: 'LECTURE', affecte: true }] }] } })
  render(<Inbox />, { wrapper })
  await screen.findByRole('button', { name: 'Notifications' })
  expect(screen.queryByRole('button', { name: 'Tâches' })).toBeNull()
  expect(InboxApi.tasks).not.toHaveBeenCalled()
})

it('Tout lu appelle tout-lu sur chaque service qui a des non lues', async () => {
  const u = userEvent.setup()
  vi.mocked(InboxApi.notifications).mockImplementation(async (s) => (s.serviceId === 's1' ? [notif('n1', null)] : []))
  render(<Inbox />, { wrapper })
  await u.click(await screen.findByRole('button', { name: 'Notifications' }))
  await u.click(await screen.findByRole('button', { name: /Tout lu/ }))
  expect(vi.mocked(InboxApi.markAllRead).mock.calls.map(([s]) => s.serviceId)).toEqual(['s1'])
})

it('filtre Non lues / Toutes et par service', async () => {
  const u = userEvent.setup()
  vi.mocked(InboxApi.notifications).mockImplementation(async (s) =>
    s.serviceId === 's1' ? [notif('n1', null, 'Appeler'), notif('n2', '2026-10-19T09:00:00Z', 'Deja lu')] : [],
  )
  render(<Inbox />, { wrapper })
  await u.click(await screen.findByRole('button', { name: 'Notifications' }))
  expect(await screen.findByText(/Appeler/)).toBeInTheDocument()
  expect(screen.queryByText(/Deja lu/)).toBeNull()
  await u.click(screen.getByRole('button', { name: 'Toutes' }))
  expect(await screen.findByText(/Deja lu/)).toBeInTheDocument()
})
```

avec en tête de fichier les fabriques :

```ts
const notif = (id: string, readAt: string | null, text = 'Appeler le labo'): Notification => ({
  id, type: 'MENTION', payload: { taskId: 't1', authorId: 'u2', text }, readAt, createdAt: new Date().toISOString(),
})
const task = (id: string, assigneeIds: string[]): Task => ({
  id, text: `Tache ${id}`, authorId: 'u2', assigneeIds, patient: null, dueDate: null, doneAt: null, createdAt: new Date().toISOString(),
})
```

et `vi.mock('@/api/inbox.api.ts', () => ({ InboxApi: { tasks: vi.fn(), notifications: vi.fn(), members: vi.fn(), patients: vi.fn(), markRead: vi.fn(), markAllRead: vi.fn(), createTask: vi.fn(), setTaskDone: vi.fn() } }))`, valeurs par défaut posées dans `beforeEach` (`mockResolvedValue([])`, `members` → Léo `u1` et Claire `u2` en INTERVENANT).

Le test « un seul panneau » a besoin du panneau Tâches : en Task 6, `TasksPanel` est un simple en-tête `PanelHeader` « Tâches » (le contenu arrive en Task 7).

Run → FAIL.

- [ ] **Step 3 : Chrome partagé des panneaux**

`panelChrome.tsx` :

```tsx
import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

import type { InboxService } from '@/queries/useInbox.ts'

export const PANEL_CLASS =
  'w-[490px] max-w-[calc(100vw-16px)] max-h-[min(740px,calc(100vh-80px))] p-0 flex flex-col rounded-xl border border-border bg-white shadow-[0_16px_40px_rgba(4,24,43,.22)]'

export function PanelHeader({ icon: Icon, title, count, action }: { icon: LucideIcon; title: string; count: number; action?: ReactNode }) {
  return (
    <div className="flex items-center gap-2 px-[18px] pt-3.5 pb-3 border-b border-border">
      <Icon className="w-[17px] h-[17px]" />
      <h2 className="text-[17px] font-bold text-foreground">{title}</h2>
      {count > 0 && <span className="px-2 rounded-full bg-blue-50 text-primary text-xs font-semibold">{count}</span>}
      <div className="ml-auto">{action}</div>
    </div>
  )
}

export function ServiceChips({ services, counts, value, onChange }: {
  services: InboxService[]
  counts: Record<string, number>
  value: string
  onChange: (serviceId: string) => void
}) {
  const chip = (id: string, label: string, n?: number) => (
    <button
      key={id}
      type="button"
      aria-pressed={value === id}
      onClick={() => onChange(id)}
      className={`h-[30px] px-3 shrink-0 whitespace-nowrap rounded-full text-[13px] font-medium flex items-center gap-1.5 ${value === id ? 'bg-foreground text-white' : 'border border-border bg-white text-text-dark'}`}
    >
      {label}
      {n ? <span className={`px-1.5 rounded-full text-xs ${value === id ? 'bg-white/15' : 'bg-muted'}`}>{n}</span> : null}
    </button>
  )
  return (
    <div className="flex gap-[5px] overflow-x-auto min-w-0">
      {chip('all', 'Tous')}
      {services.map((s) => chip(s.serviceId, s.name, counts[s.serviceId]))}
    </div>
  )
}

export function Segmented<T extends string>({ options, value, onChange }: {
  options: [T, string][]
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div className="ml-auto shrink-0 flex rounded-lg border border-border p-0.5">
      {options.map(([k, label]) => (
        <button
          key={k}
          type="button"
          aria-pressed={value === k}
          onClick={() => onChange(k)}
          className={`h-[26px] px-2.5 rounded-md text-[13px] ${value === k ? 'bg-muted font-semibold' : 'font-medium'}`}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

export const FilterBar = ({ children }: { children: ReactNode }) => (
  <div className="flex items-center gap-[5px] px-[18px] py-2.5 border-b border-muted">{children}</div>
)
```

Vérifier les tokens `bg-muted`, `text-text-dark`, `border-border` dans `front/src/styles/_colors.css` ; sinon prendre les valeurs brutes du handoff (`bg-[#f1f5f9]`, `text-[#334155]`, `border-[#e2e8f0]`).

- [ ] **Step 4 : Panneau Notifications**

`notificationsPanel.tsx` :

```tsx
import { Bell, CheckCheck, ListTodo } from 'lucide-react'
import { useState } from 'react'

import { type InboxNotification, type InboxService, useInboxMutations, useServiceMembers } from '@/queries/useInbox.ts'
import { dayGroup, memberName, whenLabel } from './inbox.utils.ts'
import { FilterBar, PanelHeader, Segmented, ServiceChips } from './panelChrome.tsx'

const GROUPS = ["Aujourd'hui", 'Hier', 'Cette semaine', 'Plus ancien'] as const

function MentionRow({ n, onOpen }: { n: InboxNotification; onOpen: (n: InboxNotification) => void }) {
  const members = useServiceMembers(n.service)
  const unread = n.readAt === null
  return (
    <button
      type="button"
      onClick={() => onOpen(n)}
      className={`w-full text-left flex gap-3 px-[18px] py-3 hover:bg-[#f8fafc] ${unread ? 'bg-[#f8fbff]' : 'bg-white'}`}
    >
      <span className="w-[34px] h-[34px] shrink-0 rounded-full bg-[#f0fdfa] text-[#0f766e] flex items-center justify-center">
        <ListTodo className="w-4 h-4" />
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-sm text-foreground">
          <b className="font-semibold">{memberName(members, n.payload.authorId)}</b> vous a mentionné dans une tâche : {n.payload.text}
        </span>
        <span className="block text-xs text-text-light mt-0.5">Mention · {whenLabel(n.createdAt)}</span>
        <span className="block text-[13px] text-primary font-medium mt-1">Ouvrir la tâche</span>
      </span>
      {unread && <span aria-label="Non lue" className="w-2 h-2 mt-1.5 shrink-0 rounded-full bg-primary" />}
    </button>
  )
}

export function NotificationsPanel({ services, notifications, onOpenTask }: {
  services: InboxService[]
  notifications: InboxNotification[]
  onOpenTask: (n: InboxNotification) => void
}) {
  const [serviceId, setServiceId] = useState('all')
  const [scope, setScope] = useState<'unread' | 'all'>('unread')
  const { markRead, markAllRead } = useInboxMutations()
  const unread = notifications.filter((n) => n.readAt === null)
  const counts = Object.fromEntries(services.map((s) => [s.serviceId, unread.filter((n) => n.service.serviceId === s.serviceId).length]))
  const visible = notifications.filter(
    (n) => (serviceId === 'all' || n.service.serviceId === serviceId) && (scope === 'all' || n.readAt === null),
  )
  const byDay = (list: InboxNotification[]) =>
    GROUPS.map((g) => ({ title: g, items: list.filter((n) => dayGroup(n.createdAt) === g) })).filter((g) => g.items.length)
  const groups =
    serviceId === 'all'
      ? services.map((s) => ({ service: s, days: byDay(visible.filter((n) => n.service.serviceId === s.serviceId)) })).filter((g) => g.days.length)
      : [{ service: undefined, days: byDay(visible) }]
  const open = (n: InboxNotification) => {
    if (n.readAt === null) {
      markRead.mutate(n)
    }
    onOpenTask(n)
  }

  return (
    <>
      <PanelHeader
        icon={Bell}
        title="Notifications"
        count={unread.length}
        action={
          <button
            type="button"
            disabled={unread.length === 0}
            onClick={() => markAllRead.mutate(services.filter((s) => counts[s.serviceId]))}
            className={`flex items-center gap-1 text-[13px] font-semibold ${unread.length ? 'text-primary' : 'text-[#94a3b8]'}`}
          >
            <CheckCheck className="w-4 h-4" /> Tout lu
          </button>
        }
      />
      <FilterBar>
        <ServiceChips services={services} counts={counts} value={serviceId} onChange={setServiceId} />
        <Segmented options={[['unread', 'Non lues'], ['all', 'Toutes']]} value={scope} onChange={setScope} />
      </FilterBar>
      <div className="flex-1 overflow-y-auto">
        {groups.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-12 text-text-light">
            <Bell className="w-6 h-6" />
            <span className="text-sm">Rien de neuf</span>
          </div>
        ) : (
          groups.map((g) => (
            <section key={g.service?.serviceId ?? 'one'}>
              {g.service && <h3 className="px-[18px] pt-3 text-xs font-semibold text-text-light">{g.service.name}</h3>}
              {g.days.map((d) => (
                <div key={d.title}>
                  <h4 className="px-[18px] pt-2 pb-1 text-xs font-semibold text-text-light">{d.title}</h4>
                  {d.items.map((n) => <MentionRow key={n.id} n={n} onOpen={open} />)}
                </div>
              ))}
            </section>
          ))
        )}
      </div>
      <div className="px-[18px] py-2.5 border-t border-border text-xs text-text-light">Conservées 30 jours</div>
    </>
  )
}
```

- [ ] **Step 5 : Le bloc `Inbox`**

`inbox.tsx` :

```tsx
import { Bell, ListTodo } from 'lucide-react'
import { useState } from 'react'

import { PopoverContent, PopoverRoot, PopoverTrigger } from '@/components/ui/popover.tsx'
import { type InboxNotification, useInboxServices, useNotifications, useTasks } from '@/queries/useInbox.ts'
import { useAuthStore } from '@/store/useAuthStore.ts'
import { NotificationsPanel } from './notificationsPanel.tsx'
import { PANEL_CLASS } from './panelChrome.tsx'
import { TasksPanel } from './tasksPanel.tsx'

export type InboxPanel = 'tasks' | 'notifs' | null
export type Focus = { serviceId: string; taskId: string } | null

function IconButton({ label, icon: Icon, count, color, open }: { label: string; icon: typeof Bell; count: number; color: string; open: boolean }) {
  return (
    <PopoverTrigger asChild>
      <button
        type="button"
        aria-label={label}
        title={label}
        className={`relative w-10 h-10 rounded-[10px] flex items-center justify-center text-white ${open ? 'bg-white/15' : 'hover:bg-white/10'}`}
      >
        <Icon className="w-5 h-5" />
        {count > 0 && (
          <span
            data-testid={label === 'Tâches' ? 'badge-tasks' : 'badge-notifs'}
            style={{ backgroundColor: color }}
            className="absolute top-1 right-[3px] min-w-[18px] h-[18px] px-1 rounded-full border-2 border-foreground text-[11px] font-bold leading-[14px] text-white text-center"
          >
            {count}
          </span>
        )}
      </button>
    </PopoverTrigger>
  )
}

export function Inbox() {
  const me = useAuthStore((state) => state.user?.id)
  const services = useInboxServices()
  const { tasks } = useTasks(services)
  const { notifications } = useNotifications(services)
  const [open, setOpen] = useState<InboxPanel>(null)
  const [focus, setFocus] = useState<Focus>(null)
  const toggle = (panel: Exclude<InboxPanel, null>) => (next: boolean) => setOpen(next ? panel : null)
  const openTasksFor = (n: InboxNotification) => {
    setFocus({ serviceId: n.service.serviceId, taskId: n.payload.taskId })
    setOpen('tasks')
  }
  const myOpenTasks = tasks.filter((t) => !t.doneAt && me && t.assigneeIds.includes(me)).length
  const unread = notifications.filter((n) => n.readAt === null).length

  return (
    <div className="flex gap-2">
      {services.some((s) => s.canTasks) && (
        <PopoverRoot open={open === 'tasks'} onOpenChange={toggle('tasks')}>
          <IconButton label="Tâches" icon={ListTodo} count={myOpenTasks} color="#2563eb" open={open === 'tasks'} />
          <PopoverContent align="end" sideOffset={9} className={PANEL_CLASS}>
            <TasksPanel services={services.filter((s) => s.canTasks)} tasks={tasks} focus={focus} onFocusDone={() => setFocus(null)} />
          </PopoverContent>
        </PopoverRoot>
      )}
      <PopoverRoot open={open === 'notifs'} onOpenChange={toggle('notifs')}>
        <IconButton label="Notifications" icon={Bell} count={unread} color="#dc2626" open={open === 'notifs'} />
        <PopoverContent align="end" sideOffset={9} className={PANEL_CLASS}>
          <NotificationsPanel services={services} notifications={notifications} onOpenTask={openTasksFor} />
        </PopoverContent>
      </PopoverRoot>
    </div>
  )
}
```

Créer pour l'instant `tasksPanel.tsx` minimal (remplacé en Task 7) :

```tsx
import { ListTodo } from 'lucide-react'

import type { InboxService, InboxTask } from '@/queries/useInbox.ts'
import type { Focus } from './inbox.tsx'
import { PanelHeader } from './panelChrome.tsx'

export function TasksPanel(_: { services: InboxService[]; tasks: InboxTask[]; focus: Focus; onFocusDone: () => void }) {
  return <PanelHeader icon={ListTodo} title="Tâches" count={0} />
}
```

`sideOffset={9}` : la topbar fait 64px et le bouton 40px centré (haut à 12px, bas à 52px) ; 52 + 6 ≈ 58px du haut. Ajuster à l'œil en Task 8 si la topbar n'a pas cette hauteur.

Run : `npx vitest run src/components/custom/inbox` → PASS.

- [ ] **Step 6 : Navbar**

Dans `navbar.tsx` :
- remplacer l'import de `TodoSheet` par `import { Inbox } from './custom/inbox/inbox.tsx'` et `import { tenantKey } from '../hooks/useTenantSwitch.ts'` ;
- dans `useOnglets`, exposer `context` dans l'objet retourné s'il ne l'est pas déjà (lire la fin de `useOnglets`) ;
- remplacer le bloc `{sousLayoutDeService && (… <TodoSheet /> …)}` par :
  ```tsx
  {user && (
    <div className="flex items-center md:pl-4 md:ml-1.5 md:border-l border-border-sidebar">
      {/* Remonté à chaque changement de contexte : le client de requêtes est remplacé (useTenantSwitch). */}
      <Inbox key={tenantKey(context)} />
    </div>
  )}
  ```
- raccourcir le commentaire de `sousLayoutDeService` (l.222-232) : il ne concerne plus les tâches. Garder une ligne : « Condition portée par la ROUTE, jamais par le store : la barre est aussi rendue sur /user/settings. » Si `sousLayoutDeService` n'est plus utilisé nulle part, le supprimer.
- `useIndicatorSetsQuery` (l.169) cite « Meme garde de ROUTE que le panneau des taches » : remplacer par « Garde de ROUTE : hors service, aucune requête. »

Dans `navbar.test.tsx` : le bloc « INVARIANT MULTI-TENANT » verrouillait l'absence du panneau Todo hors tenant. Le remplacer par deux tests :

```tsx
it('affiche les icones Taches et Notifications hors des layouts de tenant, sans passer par tenantApiUrl', async () => {
  // monter la barre comme le test existant le fait pour /user/settings (meme harnais, meme utilisateur)
  // et mocker '@/api/inbox.api.ts' (InboxApi.* -> [])
  expect(await screen.findByRole('button', { name: 'Notifications' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Tâches' })).toBeInTheDocument()
})

it('remonte le bloc au changement de contexte', async () => {
  // monter sous le layout de service s1, puis poser un contexte s2 dans le store (act) ;
  // l'appel InboxApi.notifications doit repartir (nouvelle instance) : compter les appels avant/après.
})
```

Écrire ces deux tests en réutilisant le harnais du fichier (routes, `dernierContexteVisite`, `utilisateur`) ; ce sont les assertions qui comptent : icônes présentes hors tenant, et nouveaux appels après changement de `context`.

- [ ] **Step 7 : Vérifier, commit**

Run : `npx vitest run src/components src/queries src/test && npx tsc --noEmit && npx biome check --write src`.

```bash
git add -A front/src
git commit -m "feat(front): icones Taches et Notifications dans la topbar, panneau des notifications"
```

---

### Task 7 : Panneau Tâches, mention, échéance, patient ; retrait du Todo front

**Files :**
- Create : `front/src/components/custom/inbox/mention.ts`, `mention.test.ts`, `taskComposer.tsx`, `taskRow.tsx`, `tasksPanel.test.tsx`
- Modify : `front/src/components/custom/inbox/tasksPanel.tsx` (remplace la version minimale)
- Delete : `front/src/components/custom/todo/`, `front/src/store/useTodoStore.ts`, `front/src/api/todo.api.ts`, `front/src/queries/useTodo.ts`, `front/src/types/todo.ts`
- Modify : `front/src/hooks/useTenantSwitch.ts:13,125,149` (retirer `useTodoStore`), la constante `TODO` des clés de requêtes (`grep -rn "TODO\b" front/src/constants`), `front/CLAUDE.md:104` (retirer `useTodoStore` de l'exemple)

**Interfaces :**
- Consumes : Task 5 (`useServiceMembers`, `useServicePatients`, `useInboxMutations`, `InboxTask`, `InboxService`), Task 6 (`PanelHeader`, `FilterBar`, `ServiceChips`, `Segmented`, `Focus`, `memberName`, `whenLabel`), `useCurrentScale` (`@/navigation/navigation.ts`).
- Produces :
  ```ts
  // mention.ts
  mentionQuery(draft: string): string | null           // texte après le dernier @ en fin de saisie, sinon null
  stripMention(draft: string): string                  // retire le @… final et les espaces de fin, ajoute un espace
  mentionCandidates(members: ServiceMember[], query: string, exclude: string[]): ServiceMember[]   // actifs, hors LECTURE, filtre prénom+nom, 5 max
  ```

- [ ] **Step 1 : Mention (test d'abord)**

`mention.test.ts` :

```ts
import { describe, expect, it } from 'vitest'

import type { ServiceMember } from '@/types/serviceMember.ts'
import { mentionCandidates, mentionQuery, stripMention } from './mention.ts'

const m = (id: string, firstName: string, lastName: string, role: ServiceMember['role'] = 'INTERVENANT', deactivatedAt: string | null = null) =>
  ({ id, role, user: { id, firstName, lastName, email: `${id}@t.fr`, deactivatedAt } }) as ServiceMember

describe('mention', () => {
  it('lit la mention en cours', () => {
    expect(mentionQuery('Vérifier les ordonnances @cl')).toBe('cl')
    expect(mentionQuery('Vérifier @')).toBe('')
    expect(mentionQuery('Vérifier @claire ')).toBeNull()
    expect(mentionQuery('mail a@b')).toBe('b')
    expect(mentionQuery('rien')).toBeNull()
  })

  it('retire la mention du texte', () => {
    expect(stripMention('Vérifier les ordonnances @cl')).toBe('Vérifier les ordonnances ')
  })

  it('propose les membres actifs hors LECTURE, filtres sur le nom', () => {
    const members = [m('u1', 'Léo', 'Couffinhal'), m('u2', 'Claire', 'Leroy'), m('u3', 'Clément', 'Roux', 'LECTURE'), m('u4', 'Clara', 'Petit', 'INTERVENANT', '2026-01-01')]
    expect(mentionCandidates(members, 'cl', []).map((x) => x.user.id)).toEqual(['u2'])
    expect(mentionCandidates(members, 'leroy', ['u2'])).toEqual([])
    expect(mentionCandidates(members, '', []).map((x) => x.user.id)).toEqual(['u1', 'u2'])
  })
})
```

Run → FAIL. Puis `mention.ts` :

```ts
import type { ServiceMember } from '@/types/serviceMember.ts'

const MENTION = /@([^\s@]*)$/

export const mentionQuery = (draft: string): string | null => draft.match(MENTION)?.[1] ?? null

export const stripMention = (draft: string): string => `${draft.replace(MENTION, '').replace(/\s+$/, '')} `

const fold = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()

export const mentionCandidates = (members: ServiceMember[], query: string, exclude: string[]): ServiceMember[] =>
  members
    .filter((x) => x.role !== 'LECTURE' && x.user.deactivatedAt === null && !exclude.includes(x.user.id))
    .filter((x) => fold(`${x.user.firstName ?? ''} ${x.user.lastName ?? ''}`).includes(fold(query)))
    .slice(0, 5)
```

Run → PASS.

- [ ] **Step 2 : Test du panneau (échoue)**

`tasksPanel.test.tsx` — mêmes mocks et utilisateur que `inbox.test.tsx` (Léo `u1` moi, Claire `u2`), service unique s1 :

```tsx
it('@cl propose Claire Leroy ; la choisir cree une etiquette et cree la tache avec elle', async () => {
  const u = userEvent.setup()
  vi.mocked(InboxApi.createTask).mockResolvedValue(task('new', ['u2']))
  render(<TasksPanel services={[s1]} tasks={[]} focus={null} onFocusDone={() => {}} />, { wrapper })
  const input = screen.getByPlaceholderText('Nouvelle tâche… tapez @ pour mentionner')
  await u.type(input, 'Vérifier les ordonnances @cl')
  await u.click(await screen.findByRole('option', { name: /Claire Leroy/ }))
  expect(screen.getByText('@Claire Leroy')).toBeInTheDocument()
  expect(input).toHaveValue('Vérifier les ordonnances ')
  await u.keyboard('{Enter}')
  expect(InboxApi.createTask).toHaveBeenCalledWith(s1, { text: 'Vérifier les ordonnances', assigneeIds: ['u2'] })
})

it('mention au clavier : fleches puis Entree', async () => {
  const u = userEvent.setup()
  render(<TasksPanel services={[s1]} tasks={[]} focus={null} onFocusDone={() => {}} />, { wrapper })
  const input = screen.getByPlaceholderText('Nouvelle tâche… tapez @ pour mentionner')
  await u.type(input, 'x @')
  await screen.findByRole('option', { name: /Léo/ })
  await u.keyboard('{ArrowDown}{Enter}')
  expect(screen.getByText('@Claire Leroy')).toBeInTheDocument()
  expect(InboxApi.createTask).not.toHaveBeenCalled()
})

it('Ajouter est grise quand le texte est vide', () => {
  render(<TasksPanel services={[s1]} tasks={[]} focus={null} onFocusDone={() => {}} />, { wrapper })
  expect(screen.getByRole('button', { name: 'Ajouter' })).toBeDisabled()
})

it('cocher envoie done, et la tache passe dans Terminees', async () => {
  const u = userEvent.setup()
  const t = { ...task('t1', ['u1']), service: s1 }
  const done = { ...t, doneAt: '2026-10-19T10:00:00Z' }
  vi.mocked(InboxApi.setTaskDone).mockResolvedValue(done)
  const { rerender } = render(<TasksPanel services={[s1]} tasks={[t]} focus={null} onFocusDone={() => {}} />, { wrapper })
  await u.click(screen.getByRole('checkbox', { name: /Tache t1/ }))
  expect(InboxApi.setTaskDone).toHaveBeenCalledWith(s1, 't1', true)
  rerender(<TasksPanel services={[s1]} tasks={[done]} focus={null} onFocusDone={() => {}} />)
  expect(screen.getByRole('button', { name: /Terminées · 1/ })).toBeInTheDocument()
  expect(screen.queryByText('Tache t1')).toBeNull()
  await u.click(screen.getByRole('button', { name: /Terminées · 1/ }))
  expect(screen.getByText('Tache t1')).toHaveClass('line-through')
})

it('Pour moi masque les taches ou je ne suis ni tague ni auteur', async () => {
  const u = userEvent.setup()
  const autre = { ...task('t2', ['u2']), authorId: 'u2', service: s1 }
  render(<TasksPanel services={[s1]} tasks={[autre]} focus={null} onFocusDone={() => {}} />, { wrapper })
  expect(screen.getByText('Aucune tâche en cours')).toBeInTheDocument()
  await u.click(screen.getByRole('button', { name: 'Toutes' }))
  expect(screen.getByText('Tache t2')).toBeInTheDocument()
})

it('une mention cliquee filtre sur le service et surligne la tache, meme terminee', () => {
  const t = { ...task('t1', ['u1']), doneAt: '2026-10-19T10:00:00Z', service: s1 }
  render(<TasksPanel services={[s1]} tasks={[t]} focus={{ serviceId: 's1', taskId: 't1' }} onFocusDone={() => {}} />, { wrapper })
  expect(screen.getByText('Tache t1').closest('[data-task]')).toHaveAttribute('data-highlighted', 'true')
})
```

avec `const s1 = { establishmentId: 'e1', serviceId: 's1', name: 'Cardio', canTasks: true }`. jsdom n'a pas `scrollIntoView` : `Element.prototype.scrollIntoView = vi.fn()` dans `beforeEach`.

Run → FAIL.

- [ ] **Step 3 : Ligne de tâche**

`taskRow.tsx` :

```tsx
import { Calendar, Check, User } from 'lucide-react'

import type { InboxTask } from '@/queries/useInbox.ts'
import { useServiceMembers } from '@/queries/useInbox.ts'
import { useAuthStore } from '@/store/useAuthStore.ts'
import { memberName, whenLabel } from './inbox.utils.ts'

const today = () => new Date().toISOString().slice(0, 10)
const dueLabel = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: '2-digit' })

export function TaskRow({ task, highlighted, showService, done, onToggle }: {
  task: InboxTask
  highlighted: boolean
  showService: boolean
  done: boolean
  onToggle: () => void
}) {
  const me = useAuthStore((state) => state.user?.id)
  const members = useServiceMembers(task.service)
  const late = !done && task.dueDate !== null && task.dueDate < today()
  const author = task.authorId === me ? 'Par vous' : `Par ${memberName(members, task.authorId)}`
  return (
    <div
      data-task={task.id}
      data-highlighted={highlighted}
      className={`flex gap-3 px-[18px] py-3 border-b border-muted transition-colors duration-700 ${highlighted ? 'bg-[#f0fdfa]' : 'bg-white'}`}
    >
      <button
        type="button"
        role="checkbox"
        aria-checked={done}
        aria-label={task.text}
        onClick={onToggle}
        className={`w-5 h-5 mt-0.5 shrink-0 rounded-md border-[1.5px] flex items-center justify-center ${done ? 'bg-[#16a34a] border-[#16a34a] text-white' : 'border-[#cbd5e1] bg-white'}`}
      >
        {done && <Check className="w-3.5 h-3.5" />}
      </button>
      <div className="flex-1 min-w-0">
        <p className={`text-sm whitespace-pre-line ${done ? 'line-through text-[#94a3b8]' : 'text-foreground'}`}>{task.text}</p>
        {!done && (
          <div className="flex flex-wrap gap-1.5 mt-1.5">
            {task.assigneeIds.map((id) => (
              <span key={id} className={`px-2 rounded-full text-xs font-medium ${id === me ? 'bg-blue-50 text-primary' : 'bg-muted text-text-dark'}`}>
                @{id === me ? 'vous' : memberName(members, id)}
              </span>
            ))}
            {task.patient && (
              <span className="px-2 rounded-full border border-border text-xs flex items-center gap-1">
                <User className="w-3 h-3" /> {task.patient.lastName.toUpperCase()} {task.patient.firstName}
              </span>
            )}
            {task.dueDate && (
              <span className={`text-xs font-semibold flex items-center gap-1 ${late ? 'text-[#b91c1c]' : 'text-text-light'}`}>
                <Calendar className="w-3 h-3" /> {dueLabel(task.dueDate)}
              </span>
            )}
          </div>
        )}
        <p className="text-xs text-text-light mt-1">
          {author} · {whenLabel(task.createdAt)}
          {showService ? ` · ${task.service.name}` : ''}
        </p>
      </div>
    </div>
  )
}
```

`done` est un prop (et non `task.doneAt`) pour que le panneau puisse afficher la coche avant la réponse du serveur.

- [ ] **Step 4 : Saisie**

`taskComposer.tsx` :

```tsx
import { Calendar, User, X } from 'lucide-react'
import { useRef, useState } from 'react'

import { type InboxService, useInboxMutations, useServiceMembers, useServicePatients } from '@/queries/useInbox.ts'
import { memberName } from './inbox.utils.ts'
import { mentionCandidates, mentionQuery, stripMention } from './mention.ts'

const fold = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()

export function TaskComposer({ service, onCreated }: { service: InboxService; onCreated: (taskId: string) => void }) {
  const members = useServiceMembers(service)
  const { createTask } = useInboxMutations()
  const [draft, setDraft] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [dueDate, setDueDate] = useState('')
  const [patient, setPatient] = useState<{ id: string; label: string } | null>(null)
  const [patientSearch, setPatientSearch] = useState<string | null>(null)
  const [active, setActive] = useState(0)
  const dateRef = useRef<HTMLInputElement>(null)
  const patients = useServicePatients(service, patientSearch !== null)

  const query = mentionQuery(draft)
  const candidates = query === null ? [] : mentionCandidates(members, query, tags)
  const pick = (userId: string) => {
    setTags([...tags, userId])
    setDraft(stripMention(draft))
    setActive(0)
  }
  const text = draft.replace(/@[^\s@]*$/, '').trim()
  const submit = () => {
    if (!text) return
    createTask.mutate(
      {
        service,
        input: {
          text,
          assigneeIds: tags,
          ...(patient ? { patientId: patient.id } : {}),
          ...(dueDate ? { dueDate } : {}),
        },
      },
      {
        onSuccess: (task) => {
          setDraft('')
          setTags([])
          setDueDate('')
          setPatient(null)
          onCreated(task.id)
        },
      },
    )
  }
  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (candidates.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setActive((active + 1) % candidates.length); return }
      if (e.key === 'ArrowUp') { e.preventDefault(); setActive((active - 1 + candidates.length) % candidates.length); return }
      if (e.key === 'Enter') { e.preventDefault(); pick((candidates[active] ?? candidates[0])!.user.id); return }
      if (e.key === 'Escape') { e.preventDefault(); setDraft(stripMention(draft)); return }
    }
    if (e.key === 'Enter') { e.preventDefault(); submit() }
  }
  const chip = (key: string, label: string, onRemove: () => void) => (
    <span key={key} className="flex items-center gap-1 pl-2 pr-1 rounded-full bg-blue-50 text-primary text-xs font-medium">
      {label}
      <button type="button" aria-label={`Retirer ${label}`} onClick={onRemove}><X className="w-3 h-3" /></button>
    </span>
  )
  const matchingPatients = patients
    .filter((p) => fold(`${p.lastName} ${p.firstName}`).includes(fold(patientSearch ?? '')))
    .slice(0, 6)

  return (
    <div className="px-[18px] py-3 border-b border-border relative">
      {(tags.length > 0 || patient || dueDate) && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {tags.map((id) => chip(id, `@${memberName(members, id)}`, () => setTags(tags.filter((x) => x !== id))))}
          {patient && chip('patient', patient.label, () => setPatient(null))}
          {dueDate && chip('due', new Date(`${dueDate}T00:00:00`).toLocaleDateString('fr-FR'), () => setDueDate(''))}
        </div>
      )}
      <div className="flex items-center gap-1.5 border-[1.5px] border-border rounded-[10px] pl-3 pr-1.5 py-1 focus-within:border-primary">
        <input
          value={draft}
          onChange={(e) => { setDraft(e.target.value); setActive(0) }}
          onKeyDown={onKeyDown}
          placeholder="Nouvelle tâche… tapez @ pour mentionner"
          aria-label="Nouvelle tâche"
          className="flex-1 min-w-0 h-8 text-sm outline-none"
        />
        <button type="button" aria-label="Échéance" title="Échéance" onClick={() => dateRef.current?.showPicker()} className="w-8 h-8 rounded-md flex items-center justify-center text-text-light hover:bg-muted">
          <Calendar className="w-4 h-4" />
        </button>
        <input ref={dateRef} type="date" tabIndex={-1} aria-hidden value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="sr-only" />
        <button type="button" aria-label="Patient" title="Patient" onClick={() => setPatientSearch(patientSearch === null ? '' : null)} className="w-8 h-8 rounded-md flex items-center justify-center text-text-light hover:bg-muted">
          <User className="w-4 h-4" />
        </button>
        <button type="button" disabled={!text} onClick={submit} className="h-8 px-3 rounded-lg bg-primary text-white text-[13px] font-semibold disabled:opacity-40">
          Ajouter
        </button>
      </div>
      {candidates.length > 0 && (
        <div role="listbox" aria-label={`Mentionner un soignant · ${service.name}`} className="absolute left-[18px] right-[18px] mt-1 z-10 rounded-lg border border-border bg-white shadow-md py-1">
          {candidates.map((c, i) => (
            <button
              key={c.user.id}
              type="button"
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(c.user.id)}
              className={`w-full text-left px-3 py-1.5 text-sm ${i === active ? 'bg-muted' : ''}`}
            >
              {memberName(members, c.user.id)}
            </button>
          ))}
        </div>
      )}
      {patientSearch !== null && (
        <div className="mt-2 rounded-lg border border-border">
          <input autoFocus value={patientSearch} onChange={(e) => setPatientSearch(e.target.value)} placeholder="Rechercher un patient" aria-label="Rechercher un patient" className="w-full h-8 px-3 text-sm outline-none border-b border-muted" />
          {matchingPatients.map((p) => (
            <button key={p.id} type="button" onClick={() => { setPatient({ id: p.id, label: `${p.lastName.toUpperCase()} ${p.firstName}` }); setPatientSearch(null) }} className="w-full text-left px-3 py-1.5 text-sm hover:bg-muted">
              {p.lastName.toUpperCase()} {p.firstName}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
```

Le design affiche le nom et le métier dans la liste de mention ; le métier est un `Soignant` (`soignantId` du membre) que ce panneau ne charge pas : seul le nom est affiché. Le noter dans le rapport de la tâche. Biome remettra les `if` sur plusieurs lignes ; remplacer le `!` non nul s'il est refusé (`noNonNullAssertion`) par une garde `const c = candidates[active]; if (c) pick(c.user.id)`.

- [ ] **Step 5 : Panneau Tâches**

`tasksPanel.tsx` :

```tsx
import { ChevronDown, ChevronRight, ListTodo } from 'lucide-react'
import { useEffect, useState } from 'react'

import { useCurrentScale } from '@/navigation/navigation.ts'
import { type InboxService, type InboxTask, useInboxMutations } from '@/queries/useInbox.ts'
import { useAuthStore } from '@/store/useAuthStore.ts'
import type { Focus } from './inbox.tsx'
import { FilterBar, PanelHeader, Segmented, ServiceChips } from './panelChrome.tsx'
import { TaskComposer } from './taskComposer.tsx'
import { TaskRow } from './taskRow.tsx'

export function TasksPanel({ services, tasks, focus, onFocusDone }: {
  services: InboxService[]
  tasks: InboxTask[]
  focus: Focus
  onFocusDone: () => void
}) {
  const me = useAuthStore((state) => state.user?.id)
  const courant = useCurrentScale()
  const { setTaskDone } = useInboxMutations()
  const [serviceId, setServiceId] = useState('all')
  const [scope, setScope] = useState<'mine' | 'all'>('mine')
  const [showDone, setShowDone] = useState(false)
  const [highlight, setHighlight] = useState<string | null>(null)
  const [pending, setPending] = useState<Record<string, boolean>>({})

  useEffect(() => {
    if (!focus) return
    setServiceId(focus.serviceId)
    setScope('all')
    setShowDone(true)
    setHighlight(focus.taskId)
    onFocusDone()
  }, [focus, onFocusDone])

  useEffect(() => {
    if (!highlight) return
    document.querySelector(`[data-task="${highlight}"]`)?.scrollIntoView({ block: 'nearest' })
    const timer = setTimeout(() => setHighlight(null), 2500)
    return () => clearTimeout(timer)
  }, [highlight])

  const isDone = (t: InboxTask) => pending[t.id] ?? t.doneAt !== null
  const mine = (t: InboxTask) => (me ? t.assigneeIds.includes(me) || t.authorId === me : false)
  const visible = tasks.filter((t) => (serviceId === 'all' || t.service.serviceId === serviceId) && (scope === 'all' || mine(t)))
  const open = visible.filter((t) => !isDone(t))
  const done = visible.filter(isDone)
  const counts = Object.fromEntries(
    services.map((s) => [s.serviceId, tasks.filter((t) => t.service.serviceId === s.serviceId && !isDone(t)).length]),
  )
  const myOpen = tasks.filter((t) => !isDone(t) && me && t.assigneeIds.includes(me)).length
  const target =
    services.find((s) => s.serviceId === serviceId) ??
    services.find((s) => courant?.scale === 'service' && s.serviceId === courant.serviceId) ??
    services[0]
  const toggle = (t: InboxTask) => {
    const next = !isDone(t)
    setPending({ ...pending, [t.id]: next })
    setTaskDone.mutate(
      { task: t, done: next },
      { onSettled: () => setPending(({ [t.id]: _, ...rest }) => rest) },
    )
  }
  const row = (t: InboxTask) => (
    <TaskRow key={t.id} task={t} done={isDone(t)} highlighted={highlight === t.id} showService={serviceId === 'all'} onToggle={() => toggle(t)} />
  )

  return (
    <>
      <PanelHeader icon={ListTodo} title="Tâches" count={myOpen} />
      <FilterBar>
        <ServiceChips services={services} counts={counts} value={serviceId} onChange={setServiceId} />
        <Segmented options={[['mine', 'Pour moi'], ['all', 'Toutes']]} value={scope} onChange={setScope} />
      </FilterBar>
      {target && <TaskComposer service={target} onCreated={setHighlight} />}
      <div className="flex-1 overflow-y-auto">
        {open.length === 0 ? <p className="px-[18px] py-8 text-center text-sm text-text-light">Aucune tâche en cours</p> : open.map(row)}
        {done.length > 0 && (
          <>
            <button type="button" onClick={() => setShowDone(!showDone)} className="w-full flex items-center gap-1 px-[18px] py-2.5 text-[13px] font-semibold text-text-light">
              {showDone ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              Terminées · {done.length}
            </button>
            {showDone && done.map(row)}
          </>
        )}
      </div>
      <div className="px-[18px] py-2.5 border-t border-border text-[13px] text-text-light">Les soignants mentionnés reçoivent une notification.</div>
    </>
  )
}
```

Dans `inbox.tsx`, `onFocusDone={() => setFocus(null)}` doit être stable pour l'effet : l'envelopper dans `useCallback`. Le compteur de l'en-tête et la pastille comptent la même chose (« ouvertes où je suis tagué »).

Run : `npx vitest run src/components/custom/inbox` → PASS.

- [ ] **Step 6 : Retirer le Todo front**

Supprimer les fichiers listés en « Delete ». Dans `useTenantSwitch.ts`, retirer l'import et les deux usages de `useTodoStore` (l.13, 125, 149). Retirer la clé `TODO` des constantes de requêtes si plus rien ne l'utilise. Dans `front/CLAUDE.md:104`, remplacer « (like `useSoignantStore`/`useTodoStore`) » par « (like `useSoignantStore`) ». `grep -rn -i "todo" front/src` ne doit plus rien rendre hors `followUpToDo` et commentaires sans rapport.

- [ ] **Step 7 : Vérifier, commit**

Run : `cd front && npx tsc --noEmit && npx biome check --write src && npx vitest run` → tout PASS.

```bash
git add -A front
git commit -m "feat(front): panneau Taches avec mention, echeance et patient ; retrait du Todo"
```

---

### Task 8 : Vérification navigateur, graphe, merge

**Files :** aucun nouveau.

- [ ] **Step 1 : Suites complètes**

Run : back unit + e2e complets, front `npx vitest run`, `npx tsc --noEmit` des deux côtés, `npx biome check` des deux côtés. Tout doit passer ; noter tout échec avec sa sortie.

- [ ] **Step 2 : Navigateur**

Merger `main` dans la branche du worktree s'il a avancé. Appliquer la migration sur la base de dev (`cd back && npm run prisma:migrate:deploy`), relancer le back de dev (port 3000) et le front de dev (port 4270) depuis le checkout principal **après le merge**, ou les lancer depuis le worktree sur ces ports si l'utilisateur le préfère. Avec le compte de dev du seed (`back/prisma/seed/user.ts`) puis un second compte :

- pastille rouge sur la cloche avec la mention du seed ; clic → panneau Tâches ouvert, tâche surlignée, pastille rouge décrémentée ;
- créer une tâche « @Sab… » depuis Cardiologie ; se connecter avec le compte mentionné : notification présente ;
- cocher, décocher, repli « Terminées » ;
- échéance passée en rouge, étiquette patient ;
- `/user/settings` : icônes présentes et fonctionnelles ;
- changer de service par le fil d'Ariane : panneaux cohérents, aucune erreur console ;
- un compte SECRETARIAT voit Tâches ; un compte LECTURE ne la voit pas.

Comparer visuellement avec `docs/superpowers/specs/handoffs/notifications-15/Notifications.dc.html` (15a) ; ajuster `sideOffset` et les espacements.

- [ ] **Step 3 : Graphe et merge**

```bash
graphify update .
git add -A && git commit -m "chore: graphe a jour" || true
```

Merger sur `main` (voir les notes mémoire : `receive.denyCurrentBranch=updateInstead` le temps du push depuis le worktree, puis le remettre), puis vérifier le front de dev sur 4270.
