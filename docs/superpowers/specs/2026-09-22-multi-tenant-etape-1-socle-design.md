# Multi-tenant, étape 1 : socle

Date : 2026-09-22
Parent : `docs/superpowers/specs/2026-09-22-multi-tenant-architecture-design.md` (architecture cible).
Référence des rôles : `docs/multi-tenant/habilitations.md`.

## 1. Objectif et périmètre

Poser toute la mécanique multi-tenant côté back, migrer les données existantes vers un établissement et un service
uniques, et adapter le front au strict minimum pour que l'application reste **indiscernable d'aujourd'hui** pour
ses utilisateurs actuels.

Critères de sortie :

- Un utilisateur existant se connecte, retrouve ses écrans et ses données, sans sélecteur ni nouvelle URL.
- Toute route métier est préfixée par `/e/:establishmentId/s/:serviceId` ; l'ancienne API non préfixée n'existe plus.
- Un membre du service A reçoit 404 sur toute ressource du service B (test e2e générique).
- Une requête Prisma sans filtre de tenant sur un modèle de tenant est rejetée (test unitaire du garde-fou).
- Chaque route de service exige une permission, et la matrice est vérifiée par un test e2e par rôle.

Dans le périmètre : schéma et migration 1, contexte de tenant, `/me`, permissions, routes préfixées, routes
d'administration d'établissement pour les membres, repositories filtrés, garde-fou, seed, harnais e2e, front minimal
(contexte unique, préfixe d'API, permissions à la place des rôles, écran des membres).

Hors périmètre (étapes suivantes) : routes front préfixées et sélecteur (étape 2), `PatientServiceFile` et filtrage
des champs cliniques (étape 3), écrans d'administration complets, `PatientAccessLog`, désactivation depuis
l'interface, super-admin (étape 4).

## 2. Schéma et migration

### 2.1 Enums

```prisma
enum EstablishmentRole { ADMIN MEMBER }
enum ServiceRole { COORDINATEUR INTERVENANT SECRETARIAT LECTURE }
```

L'enum `Role` est supprimé.

### 2.2 Nouveaux modèles

```prisma
model Establishment {
  id            String    @id @default(cuid())
  name          String
  createdAt     DateTime  @default(now())
  deactivatedAt DateTime?

  services    Service[]
  memberships EstablishmentMembership[]
  // + relations inverses vers Patient, Soignant, Location, ActivityLog…
}

model Service {
  id              String    @id @default(cuid())
  establishmentId String
  name            String
  createdAt       DateTime  @default(now())
  deactivatedAt   DateTime?

  establishment Establishment @relation(fields: [establishmentId], references: [id])
  memberships   ServiceMembership[]
  // + relations inverses vers les modèles de service

  @@unique([establishmentId, name])
  @@unique([id, establishmentId])
}

model EstablishmentMembership {
  id              String            @id @default(cuid())
  userId          String
  establishmentId String
  role            EstablishmentRole @default(MEMBER)
  soignantId      String?
  createdAt       DateTime          @default(now())

  user          User          @relation(fields: [userId], references: [id], onDelete: Cascade)
  establishment Establishment @relation(fields: [establishmentId], references: [id])
  soignant      Soignant?     @relation(fields: [soignantId, establishmentId], references: [id, establishmentId], onDelete: SetNull)
  serviceMemberships ServiceMembership[]

  @@unique([userId, establishmentId])
  @@index([establishmentId])
}

model ServiceMembership {
  id                        String      @id @default(cuid())
  establishmentMembershipId String
  serviceId                 String
  establishmentId           String
  role                      ServiceRole
  createdAt                 DateTime    @default(now())

  establishmentMembership EstablishmentMembership @relation(fields: [establishmentMembershipId], references: [id], onDelete: Cascade)
  service                 Service                 @relation(fields: [serviceId, establishmentId], references: [id, establishmentId])

  @@unique([establishmentMembershipId, serviceId])
  @@index([serviceId])
}

model SlotTemplateSoignant {
  slotTemplateId  String
  soignantId      String
  serviceId       String
  establishmentId String

  slotTemplate SlotTemplate @relation(fields: [slotTemplateId, serviceId], references: [id, serviceId], onDelete: Cascade)
  soignant     Soignant     @relation(fields: [soignantId, establishmentId], references: [id, establishmentId], onDelete: Cascade)

  @@id([slotTemplateId, soignantId])
  @@index([soignantId])
}

model SoignantThematic {
  soignantId      String
  thematicId      String
  serviceId       String
  establishmentId String

  soignant Soignant @relation(fields: [soignantId, establishmentId], references: [id, establishmentId], onDelete: Cascade)
  thematic Thematic @relation(fields: [thematicId, serviceId], references: [id, serviceId], onDelete: Cascade)

  @@id([soignantId, thematicId])
  @@index([thematicId])
}
```

### 2.3 Modèles modifiés

| Modèle | Changements |
| --- | --- |
| `User` | `-role`, `-soignantId`, `-soignant`. `+isSuperAdmin Boolean @default(false)`, `+deactivatedAt DateTime?`, `+establishmentMemberships`. |
| `Patient` | `+establishmentId`, `@@unique([id, establishmentId])`, `@@index([establishmentId])`. Les champs d'inclusion **restent** (étape 3). |
| `Soignant` | `+establishmentId`, `@@unique([id, establishmentId])`. `slotTemplates` et `thematics` deviennent `slotTemplateLinks SlotTemplateSoignant[]` et `thematicLinks SoignantThematic[]`. `-users`, `+memberships EstablishmentMembership[]`. |
| `Location` | `+establishmentId`. `name` : `@unique` → `@@unique([establishmentId, name])`. `@@unique([id, establishmentId])`. |
| `Thematic` | `+establishmentId`, `+serviceId`. `name` : `@unique` → `@@unique([serviceId, name])`. `@@unique([id, serviceId])`. `soignants` → `soignantLinks SoignantThematic[]`. |
| `PathwayTemplate`, `Pathway`, `SlotTemplate`, `Slot`, `Appointment`, `AppointmentPatient`, `DiagnosticEducatifTemplate`, `DiagnosticEducatif`, `EnrollmentIssue`, `PatientPathwayPriority`, `ForbiddenWeek`, `Todo` | `+establishmentId`, `+serviceId`, `@@unique([id, serviceId])` (sauf les tables à clé composée : `PatientPathwayPriority` garde son `@@id`), `@@index([serviceId])`. Les références vers un autre modèle de service passent en composite `(xId, serviceId) → X(id, serviceId)` ; vers un modèle d'établissement en `(xId, establishmentId) → X(id, establishmentId)`. |
| `SlotTemplate` | `soignants` → `soignantLinks SlotTemplateSoignant[]`. `location` et `thematic` en composite. |
| `ForbiddenWeek` | `startOfWeek` : `@unique` → `@@unique([serviceId, startOfWeek])`. |
| `PlanningCycle` | `id` : `@default("default")` → `@default(cuid())`. `+serviceId @unique`, `+establishmentId`. |
| `ActivityLog` | `+establishmentId String?`, `+serviceId String?`, index sur chacun. |

Relations composites nullables : Prisma exige que tous les champs d'une relation composite soient nullables ou
tous requis. Pour `SlotTemplate.locationId?` avec `establishmentId` requis, la relation composite n'est pas
déclarable telle quelle. Règle retenue : **la clé composite est posée en SQL brut dans la migration** pour ces
cas (`locationId`, `thematicId`, `templateID`, `pathwayID`, `soignantID` de `Todo`, `thematicId` de
`Appointment`), et Prisma garde la relation simple. La contrainte SQL existe, Prisma ne la connaît pas. Un
commentaire dans `schema.prisma` liste ces contraintes pour qu'un `migrate dev` futur ne les perde pas (Prisma
ne supprime pas une contrainte qu'il ne connaît pas, mais la documentation évite la surprise).

### 2.4 Migration `multi_tenant_socle`

Fichier SQL écrit à la main, généré d'abord par `prisma migrate dev --create-only` puis réordonné. Prisma
l'exécute dans une transaction.

**Temps 1, ajouter sans contraindre.** Créer les enums, les nouvelles tables, les colonnes de tenant en nullable
sur toutes les tables concernées, `User.isSuperAdmin` (défaut `false`), `User.deactivatedAt`.

**Temps 2, remplir.** Bloc `DO $$ … $$` :

1. S'il existe au moins une ligne dans `User`, `Patient` ou `PathwayTemplate`, insérer un `Establishment`
   (`name = 'Établissement'`) et un `Service` (`name = 'Service'`), sinon terminer le bloc.
2. `UPDATE` de `establishmentId` sur `Patient`, `Soignant`, `Location`, `ActivityLog` ; de `establishmentId` et
   `serviceId` sur toutes les tables de service.
3. Utilisateurs : pour chaque `User` de rôle `ADMIN` ou `USER`, insérer une `EstablishmentMembership`
   (`ADMIN` → `ADMIN`, `USER` → `MEMBER`, `soignantId` recopié) puis une `ServiceMembership` (`ADMIN` →
   `COORDINATEUR`, `USER` → `INTERVENANT`). Les `NONE` ne reçoivent rien.
4. Relations plusieurs-à-plusieurs : `INSERT INTO "SlotTemplateSoignant" SELECT …` depuis `_SlotTemplateSoignants`
   joint à `SlotTemplate` pour le `serviceId` ; idem `SoignantThematic` depuis `_SoignantThematics` et `Thematic`.
5. `PlanningCycle` : `UPDATE` de `serviceId` et `establishmentId` sur la ligne `default` ; l'`id` reste `default`
   (c'est un cuid valide au sens de Prisma, une chaîne ; seul le défaut change pour les futures lignes).

**Temps 3, contraindre et nettoyer.** `SET NOT NULL` sur les colonnes de tenant (hors `ActivityLog`), création
des unicités composites `(id, serviceId)` / `(id, establishmentId)`, remplacement des clés étrangères simples par
les composites, nouvelles unicités de nom, index. `DROP TABLE "_SlotTemplateSoignants", "_SoignantThematics"`.
`ALTER TABLE "User" DROP COLUMN "role", DROP COLUMN "soignantId"`. `DROP TYPE "Role"`.

Sur une base vide, le temps 2 se termine immédiatement et les `SET NOT NULL` passent sur des tables vides.

### 2.5 Vérification manuelle avant déploiement

Procédure documentée dans le plan, exécutée sur une copie de la base de production restaurée localement avec
`deploy/scripts/restore-db-dump.sh` :

1. `npm run prisma:migrate:deploy`.
2. Jouer `back/prisma/checks/multi-tenant-socle.sql` : compte des lignes à tenant nul par table (attendu 0),
   nombre d'appartenances par rôle comparé aux anciens rôles, égalité des cardinalités entre anciennes et
   nouvelles tables de liaison, unicité du `PlanningCycle`.
3. Lancer le back sur cette base et vérifier la connexion d'un compte `ADMIN` et d'un compte `USER`.

Le fichier de vérification est conservé dans le dépôt (il ne dépend pas du code), la procédure n'est jouée
qu'une fois.

## 3. Contexte de tenant

### 3.1 Stockage

`@fastify/request-context` (AsyncLocalStorage) est enregistré dans les plugins. Il porte une clé `tenant` de
type :

```ts
type Tenant = {
  userId: string
  establishmentId: string
  establishmentRole: EstablishmentRole
  serviceId: string | null          // null sur les routes /e/:establishmentId/admin/*
  serviceRole: ServiceRole | null
  soignantId: string | null
}
```

Une classe singleton `TenantContext` (`utils/tenant-context.ts`, enregistrée dans le container comme
`tenantContext`) l'encapsule :

- `current(): Tenant` lève `TenantContextMissingError` si aucun tenant n'est posé.
- `currentService(): Tenant & { serviceId: string; serviceRole: ServiceRole }` lève si `serviceId` est nul.
- `runAsSystem<T>(fn: () => Promise<T>)` pose un marqueur `system: true` dans le contexte pour les traitements
  hors requête (purge du journal d'activité au démarrage, futurs scripts). Le garde-fou accepte les requêtes sans
  filtre **uniquement** sous ce marqueur.

Pourquoi pas un scope Awilix par requête : tous les domaines et repositories sont des singletons capturés par les
routes à l'enregistrement. Les re-scoper toucherait chaque route et chaque domaine ; le stockage asynchrone laisse
tout en place.

### 3.2 Préhandlers

Trois décorateurs Fastify, dans un nouveau `plugins/tenant.plugin.ts` :

- `resolveTenant` (`onRequest`, après l'authentification) : lit `establishmentId` et `serviceId` dans
  `request.params`, cherche dans `request.currentUser.memberships` l'appartenance d'établissement puis de service.
  Absente → `Boom.notFound()`. Présente → pose `tenant` dans le contexte et sur `request.tenant`.
- `resolveEstablishmentAdmin` : idem avec `establishmentId` seul, exige `establishmentRole === 'ADMIN'`, pose un
  tenant avec `serviceId: null`.
- `requirePermission(permission)` (`preHandler`) : voir section 5.

`request.currentUser` (déjà chargé par le préhandler d'authentification) porte désormais l'arbre des
appartenances, chargé en une requête avec `include`. Un utilisateur avec `deactivatedAt` non nul est refusé en 401
`Account deactivated` à ce même endroit.

Les services désactivés (`Service.deactivatedAt`) sont exclus de la résolution : une appartenance à un service
désactivé n'ouvre pas le contexte (404).

## 4. Authentification

- `POST /auth/register` : ne prend plus `soignantId`. Crée l'identité seule.
- `POST /auth/sign-in`, `POST /auth/refresh` : la réponse ne renvoie plus `role` ni `soignantId` ; elle renvoie
  la même forme que `/me`.
- `GET /me` : identité + arbre des appartenances (forme donnée dans l'architecture, section 4.1), services
  désactivés exclus.
- `PATCH /me` : `firstName`, `lastName`, `password` (avec l'ancien mot de passe). Remplace l'usage de
  `PATCH /user/:id` par l'utilisateur sur lui-même.

## 5. Permissions

### 5.1 Matrice

Fichier `back/src/main/utils/permissions.ts`, sans dépendance, dupliqué à l'identique dans
`front/src/utils/permissions.ts` (un test unitaire back lit les deux fichiers et vérifie leur égalité
textuelle). Contenu : les types `ServicePermission`, `EstablishmentPermission`, et les deux tables. La matrice de
service ajoute deux permissions de lecture absentes du document d'habilitations, accordées aux quatre rôles :
`planning:read` (modèles, parcours, créneaux, cycle, semaines interdites) et `referentials:read` (thématiques,
modèles de diagnostic, soignants, lieux). Le document d'habilitations est mis à jour en conséquence.

### 5.2 `requirePermission`

`fastify.requirePermission(p)` renvoie un `preHandler` qui lit `tenantContext.current()` et vérifie que le rôle
détient `p` : rôle de service pour une `ServicePermission`, rôle d'établissement pour une
`EstablishmentPermission`. Sinon `Boom.forbidden('Insufficient permission')`.

**Fail-safe** : le plugin des routes tenant ajoute un hook `onRoute` qui vérifie que toute route enregistrée sous
le préfixe de service ou d'admin déclare `config.permission`. Une route sans permission fait échouer le démarrage
du serveur. Le `preHandler` est ajouté par ce même hook à partir de `config.permission`, les routes ne le
déclarent donc qu'une fois, dans `config`.

### 5.3 Permission par route

| Routeur | Routes | Permission |
| --- | --- | --- |
| `slot`, `slotTemplate`, `pathway`, `pathwayTemplate`, `forbiddenWeek`, `planningCycle` | `GET *` | `planning:read` |
| idem | `POST`, `PATCH`, `PUT`, `DELETE` | `planning:write` |
| `thematic`, `diagnosticEducatifTemplate` | `GET *` | `referentials:read` |
| idem | écritures | `referentials:write` |
| `soignant`, `location` (sous le préfixe de service) | `GET *` uniquement | `referentials:read` |
| `patient` | `GET /`, `GET /with-tags`, `GET /:id`, `GET /:id/…planning`, `GET /export` (données) | `patient:read` |
| `patient` | `POST /`, `PATCH /:id`, `DELETE /:id`, `PUT /:id/…priorities` | `patient:write` |
| `patient` | `POST /enroll`, `POST /:id/…remove-from-pathway` et équivalents | `appointment:write` |
| `patient/:id/diagnostic` | `GET *` | `clinical:read` |
| idem | écritures | `clinical:write` |
| `patient/:id/enrollment-issue` | `GET`, `DELETE` | `patient:read`, `appointment:write` |
| `appointment` | `GET *` | `patient:read` |
| idem | écritures | `appointment:write` |
| `todo` | tout | `todo:own` (filtré sur le `soignantId` du tenant) |
| `activityLog` (sous le préfixe de service) | `GET`, `POST /cleanup` | `planning:write` (coordinateur). La purge manuelle ne touche que les entrées du service courant ; la purge planifiée du démarrage tourne sous `runAsSystem` et couvre tout. |
| `/e/:establishmentId/admin/members` | tout | `members:manage` |
| `/e/:establishmentId/admin/soignant`, `/admin/location` | écritures | `soignants:manage`, `locations:manage` |

Le plan vérifie route par route l'exactitude de ce tableau contre le code ; en cas de doute, la permission la plus
restrictive l'emporte.

## 6. Routes API

### 6.1 Arborescence

```
/                      /health            /auth/*            (publiques ou authentification seule)
/me                    GET, PATCH         (authentification seule)
/e/:establishmentId/s/:serviceId/…        resolveTenant + permission
    slot, slot-template, pathway, pathway-template, thematic, diagnostic-template,
    patient, patient/:patientId/diagnostic, patient/:patientID/enrollment-issue,
    appointment, todo, forbidden-week, planning-cycle, activity-log,
    soignant (GET), location (GET)
/e/:establishmentId/admin/…               resolveEstablishmentAdmin + permission
    members, soignant (écritures), location (écritures)
```

Les routeurs existants sont enregistrés tels quels sous un plugin `tenantRoutes` porteur du préfixe paramétré et
du hook `resolveTenant`. Le routeur `user` disparaît, remplacé par `members`. Les routeurs `soignant` et
`location` sont scindés en lecture (service) et écriture (admin).

### 6.2 Routes membres

| Route | Effet |
| --- | --- |
| `GET /members` | Membres de l'établissement : identité, `deactivatedAt`, rôle d'établissement, `soignantId`, liste `{ serviceId, role }`. |
| `POST /members` | `{ email, establishmentRole, soignantId?, services: [{ serviceId, role }] }`. Si l'e-mail correspond à une identité existante sans appartenance à cet établissement, crée l'appartenance. Sinon 404 `Unknown user` : la création directe avec mot de passe provisoire est reportée à l'étape 4. |
| `PATCH /members/:membershipId` | Rôle d'établissement, `soignantId`, remplacement complet de la liste des services. |
| `DELETE /members/:membershipId` | Retire l'appartenance (et ses services). Ne touche pas à l'identité. |
| `POST /members/:membershipId/deactivate`, `/reactivate` | Pose ou retire `User.deactivatedAt`. Un administrateur ne peut pas se désactiver lui-même. |

Un administrateur ne peut pas retirer sa propre appartenance ni se retirer le rôle `ADMIN` s'il est le dernier
administrateur de l'établissement.

## 7. Repositories

### 7.1 Familles et règles

| Famille | Repositories | Règle |
| --- | --- | --- |
| Service | `slot`, `slotTemplate`, `pathway`, `pathwayTemplate`, `thematic`, `diagnosticEducatifTemplate`, `diagnosticEducatif`, `enrollmentIssue`, `appointment`, `forbiddenWeek`, `planningCycle`, `todo` | Tout `where` contient `serviceId: tenant.serviceId`. Tout `data` de création contient `serviceId` et `establishmentId`. Les créations imbriquées (créneaux d'un parcours, rendez-vous d'un créneau, patients d'un rendez-vous, liens soignants) portent aussi les deux colonnes. |
| Établissement | `patient`, `soignant`, `location`, `activityLog`, `membership` (nouveau), `service` (nouveau) | Tout `where` contient `establishmentId`. |
| Global | `user`, `establishment` (nouveau) | Aucun filtre. |

Les repositories reçoivent `tenantContext` par le constructeur et lisent le tenant **au moment de la requête**,
jamais dans le constructeur.

### 7.2 Recherche par identifiant

`findUnique({ where: { id } })` devient `findUnique({ where: { id_serviceId: { id, serviceId } } })` sur l'unicité
composite. `update` et `delete` par identifiant suivent la même règle. Un identifiant hors tenant produit la même
erreur Prisma qu'un identifiant inexistant, mappée en 404 par l'`ErrorHandler`.

### 7.3 Relations plusieurs-à-plusieurs

Les `include: { soignants: true }` deviennent `include: { soignantLinks: { include: { soignant: true } } }` et
les repositories **aplatissent** le résultat en `soignants: Soignant[]` avant de le renvoyer, pour que les DTO, les
domaines, les schémas de réponse et le front ne changent pas. Les écritures `soignants: { set: [...] }` deviennent
`soignantLinks: { deleteMany: {}, create: ids.map(...) }` avec les colonnes de tenant.

### 7.4 Journal d'activité

`ActivityLogRepository.create` lit le contexte et remplit `establishmentId` et `serviceId` (nuls si absents,
par exemple sous `runAsSystem`). Le subscriber et les événements ne changent pas : l'émission est synchrone, le
contexte asynchrone est donc présent dans le handler. La purge périodique du démarrage est enveloppée dans
`tenantContext.runAsSystem`.

## 8. Garde-fou Prisma

Extension `tenantGuardExtension` dans `infra/orm/tenant-guard.extension.ts`, ajoutée au client après
`normalizerExtension`. Elle reçoit le `TenantContext` à la construction (le client est construit dans
`PostgresOrm`, qui reçoit `tenantContext` par le container).

Règles, pour chaque opération sur un modèle listé :

| Modèles | Opérations | Exigence |
| --- | --- | --- |
| Service | `findMany`, `findFirst`, `findUnique*`, `count`, `aggregate`, `update`, `updateMany`, `delete`, `deleteMany`, `upsert` | `where` contient `serviceId` (directement ou dans une clé composite `id_serviceId`), égal au `serviceId` du tenant courant si un tenant est posé. |
| Service | `create`, `createMany`, `upsert` | `data` (chaque élément) contient `serviceId` et `establishmentId` égaux au tenant ; récursivement dans les `create` imbriqués vers un modèle de service. |
| Établissement | mêmes opérations | idem avec `establishmentId`. |
| Tous | toute opération | Sous `runAsSystem`, aucune exigence. Sans tenant et sans marqueur système, toute opération sur un modèle de tenant est rejetée. |

Erreur levée : `TenantScopeMissingError(model, operation, missingField)`, mappée en 500 par le gestionnaire
d'erreurs avec un message générique côté client et le détail dans les logs.

Le garde-fou ne remonte pas dans les `include` : un enfant inclus depuis un parent filtré est sûr par
construction. Il ne voit pas `$queryRaw` : règle de revue, aucun `$queryRaw` sur une table de tenant.

`UserRepository.findByID` avec `include` des appartenances est une opération sur `User` (modèle global) : le
garde-fou ne s'applique pas aux inclusions, donc l'authentification, qui tourne avant qu'un tenant soit posé,
passe.

## 9. Seed

`prisma/seed.ts` crée un établissement « CHU de démonstration » et un service « Réadaptation », puis passe leurs
identifiants à chaque fonction de seed. Les utilisateurs de seed reçoivent une appartenance `ADMIN` +
`COORDINATEUR`. Le second service et l'utilisateur multi-services arrivent à l'étape 2.

## 10. Front minimal

- `types/auth.ts` : `User` devient l'identité plus `establishments` (arbre). `Role` disparaît. Un type
  `TenantContext = { establishmentId, serviceId, establishmentRole, serviceRole, soignantId }`.
- `store/useAuthStore.ts` : dérive `context` de l'arbre : la première appartenance de service trouvée, `null` s'il
  n'y en a aucune. Choix documenté comme provisoire (étape 2 : sélecteur et dernier contexte visité).
- `constants/config.constant.ts` : `tenantApiUrl()` et `establishmentApiUrl()` construisent les préfixes depuis
  le store. Tous les modules `api/*.api.ts` sauf `auth.api.ts` remplacent `${apiUrl}/x` par `${tenantApiUrl()}/x`.
  Aucune clé de requête ne change (un seul contexte par session).
- `utils/permissions.ts` : copie de la matrice. `hooks/useCan.ts` : `useCan(permission)` lit le contexte du store.
- `routes/_authenticated.tsx` : redirige vers `/pending` si `context` est nul. `_admin.tsx` : `useCan('planning:write')`.
  `navbar`, `dashboardFilter.sidebar`, `soignant.sidebar`, `pending` : remplacer les tests de rôle par `useCan`.
- Écran `settings/user.tsx` renommé « Membres » : liste des membres de l'établissement (`GET /admin/members`),
  ajout par e-mail, édition du rôle d'établissement, du lien soignant et du rôle dans l'unique service,
  désactivation. `editUserForm.tsx` et `user.column.tsx` adaptés. Visible avec `useCan('members:manage')`.
- `user/settings.tsx` : utilise `PATCH /me`.
- Formulaire d'inscription : suppression du champ soignant.

## 11. Tests

### 11.1 Harnais e2e

- `back/.env.test.example` avec `DATABASE_URL` vers une base `medisync_test` sur le Postgres de la stack
  `deploy` ; `deploy/.env.test` pour la CI (référencé par les cibles `*:ci` existantes).
- `src/test/e2e/setup/app.ts` : construit le container avec la config de test, appelle `httpServer.configure()`,
  expose l'instance Fastify pour `inject`. `FastifyHttpServer` expose son instance (`get instance()`), et
  `configure()` est séparable de `listen()` (déjà le cas).
- `src/test/e2e/setup/db.ts` : client Prisma **sans** garde-fou pour préparer et nettoyer ; `truncateAll()` avant
  chaque fichier.
- `src/test/e2e/setup/fixtures.ts` : `createEstablishment()`, `createService()`, `createUser({ memberships })`,
  `signInCookie(user)` (appel réel de `/auth/sign-in`).
- La cible `test:e2e` dépend de `prisma:migrate:deploy:test`. Le hook `pre-commit` passe à `test:unit` ; `npm
  test` complet reste la cible de `validate` et de la CI.

### 11.2 Tests

| Test | Type | Contenu |
| --- | --- | --- |
| Garde-fou | unitaire | Pour chaque modèle déclaré et chaque opération : rejet sans filtre, rejet avec un `serviceId` différent du tenant, passage avec le bon filtre, passage sous `runAsSystem`. Client Prisma mocké par `query` d'extension. |
| Permissions | unitaire | Matrice : chaque rôle détient exactement les permissions attendues. Égalité textuelle des deux fichiers `permissions.ts`. |
| `resolveTenant` | e2e | Membre → 200 ; non-membre du service → 404 ; non-membre de l'établissement → 404 ; service désactivé → 404 ; compte désactivé → 401. |
| Isolation générique | e2e | Table de routes `GET /:id` par entité de service avec une fabrique de ressource. Pour chacune : créer dans B, demander depuis A → 404 ; demander depuis B → 200. Même chose pour `PATCH` et `DELETE`. |
| Permissions par route | e2e | Pour chaque rôle de service, un appel sur une route représentative de chaque permission : 200 ou 403 selon la matrice. |
| Membres | e2e | Ajout par e-mail, refus du dernier administrateur, désactivation effective à la requête suivante. |
| Fail-safe | unitaire | Enregistrer une route tenant sans `config.permission` fait échouer `configure()`. |

## 12. Déploiement

1. Sauvegarde manuelle de la base de production.
2. Procédure de vérification de la section 2.5 sur une copie.
3. Déploiement : la migration s'applique au démarrage du conteneur.
4. Vérification : connexion d'un administrateur, agenda, planning, fiche patient, écran Membres. Renommer
   l'établissement et le service n'est pas encore possible depuis l'interface (étape 4) ; un `UPDATE` SQL
   documenté le permet entre-temps.

Retour arrière : redéployer l'image précédente et restaurer la sauvegarde.

## 13. Documentation

- `back/CLAUDE.md` : section « Multi-tenant » (contexte, familles de repositories, garde-fou, `config.permission`,
  harnais e2e). La section « Adding a new entity » gagne les étapes tenant.
- `README.md` : tableau du domaine complété (établissement, service, appartenances), section Comptes réécrite avec
  les nouveaux rôles, mention de `.env.test`.
- `docs/multi-tenant/habilitations.md` : ajout de `planning:read` et `referentials:read`.
