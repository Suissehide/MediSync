# Design : Notifications et tâches, étape 1 (tâches partagées et socle des notifications)

Handoff : `docs/superpowers/specs/handoffs/notifications-15/` (tour 15, 15a et 15b). Seul le tour 15 fait foi.

## Découpage du chantier

| Étape | Contenu | Spec |
|---|---|---|
| **1** | Tâches partagées par service (remplacent le Todo personnel), modèle `Notification` avec le seul type `MENTION`, les deux icônes de la topbar et leurs panneaux (15a) | ce document |
| 2 | Les huit autres types (rappel, patient ajouté, RDV modifié ou annulé, absence, diagnostic, fin de parcours, créneau presque complet, échéance) branchés sur `appEventBus`, les événements manquants ajoutés (annulation, suppression de RDV, modification de créneau, absence), section « Notifications » de Mon compte (15b) sans les e-mails | à écrire |
| 3 | E-mails sans données de santé, envoi immédiat ou résumé à 7 h, planification (rappels, J+7, échéances, purge à 30 jours) | à écrire |

## Décisions prises

- **Le Todo disparaît.** Les Todos existants sont migrés en tâches (voir Migration).
- **LECTURE n'a pas les tâches** : ni icône, ni accès API, ni mentionnable. Il garde les notifications.
- **On mentionne des utilisateurs**, pas des `Soignant` (un soignant est un métier, plusieurs comptes peuvent l'incarner).
- **Lecture de « Tous » : un appel par service, fusion côté front.** Tâches et notifications sont des modèles de service ordinaires, sous la garde de tenant. Pas d'endpoint agrégé sous `/me`, pas de `runAsSystem`. Un soignant a 1 à 3 services.
- **Fraîcheur** : `refetchInterval` de 60 s et rafraîchissement au focus. Pas de temps réel.
- **Échéance et patient** se renseignent par deux boutons icône à côté de « Ajouter ».
- Pas d'édition ni de suppression de tâche : le design n'en a pas.

## Données (Prisma)

Trois modèles de service : `establishmentId` et `serviceId` obligatoires, `@@unique([id, serviceId])`, `@@index([serviceId])`, inscrits dans `SERVICE_MODELS` et `MODEL_RELATIONS` de `tenant-guard.ts` (relations inverses comprises), plus un cas dans `src/test/e2e/isolation.test.ts`.

```prisma
model Task {
  id              String    @id @default(cuid())
  establishmentId String
  serviceId       String
  text            String
  authorId        String?   // User.id, sans relation (pont global) ; nul seulement pour un Todo migré sans auteur
  patientId       String?   // Patient.id, sans relation : voir plus bas
  dueDate         DateTime? @db.Date
  doneAt          DateTime?
  createdAt       DateTime  @default(now())
  assignees       TaskAssignee[]
}

model TaskAssignee {
  establishmentId String
  serviceId       String
  taskId          String
  userId          String    // User.id, sans relation
  task            Task      @relation(fields: [taskId, serviceId], references: [id, serviceId], onDelete: Cascade)
  @@id([taskId, userId])
  @@index([userId])
}

enum NotificationType { MENTION }

model Notification {
  id              String           @id @default(cuid())
  establishmentId String
  serviceId       String
  userId          String           // destinataire, User.id, sans relation
  type            NotificationType
  payload         Json
  readAt          DateTime?
  createdAt       DateTime         @default(now())
  @@index([userId, createdAt])
}
```

- Payload `MENTION` : `{ taskId, authorId, text }`. Le texte est copié : la notification reste lisible si la tâche change.
- `patientId` est une colonne simple, sans relation : une clé composite `[patientId, establishmentId]` ne pourrait pas passer à nul (`establishmentId` est obligatoire), et un service ne peut pas nettoyer les tâches d'un autre. Le nom est résolu à la lecture (`Patient` de l'établissement) ; un patient supprimé disparaît simplement de l'étiquette.
- `TaskAssignee` est créé en écriture imbriquée depuis `Task` : il va dans `NESTED_RELATIONS`.

### Migration des Todos

Dans le SQL de la migration, avant `DROP TABLE "Todo"` :

- chaque `Todo` devient une `Task` du même service : `text = title` (plus `description` après un saut de ligne si elle existe), `createdAt = createDate`, `doneAt = createDate` si `completed` ;
- tagués : les utilisateurs qui ont une `ServiceMembership` dans ce service avec ce `soignantId`, hors LECTURE ; auteur : le premier d'entre eux (par `userId`) ;
- sans soignant ou sans membre correspondant : tâche sans tagué et sans auteur.

Un test e2e rejoue ce SQL sur un jeu de Todos.

## API

Sous `/e/:establishmentId/s/:serviceId`, dans `tenantRoutes`.

| Route | Permission | Effet |
|---|---|---|
| `GET /taches` | `tasks:read` | Tâches ouvertes du service, plus celles terminées depuis moins de 30 jours, avec `assigneeIds` et `patient { id, firstName, lastName }`. |
| `POST /taches` | `tasks:write` | `{ text, assigneeIds[], patientId?, dueDate? }`. Voir règles ci-dessous. Renvoie la tâche. |
| `PATCH /taches/:taskId` | `tasks:write` | `{ done: boolean }` : pose ou retire `doneAt`. |
| `GET /notifications` | `notifications:own` | Mes notifications du service des 30 derniers jours, plus récentes d'abord. |
| `POST /notifications/:id/lu` | `notifications:own` | Pose `readAt` si c'est la mienne, 404 sinon. |
| `POST /notifications/tout-lu` | `notifications:own` | Pose `readAt` sur toutes mes non lues du service. |

Règles de `POST /taches` :

- `text` non vide après `trim`, 500 caractères au plus ;
- chaque tagué est un membre **actif** du service, hors LECTURE ; sinon 400 ;
- `assigneeIds` vide : l'auteur est le seul tagué ;
- `patientId` doit être un patient du service (dossier de service existant) ; sinon 400 ;
- dans la même transaction, une `Notification` `MENTION` par tagué autre que l'auteur.

Permissions (`utils/permissions.ts`, identique côté front, et `docs/multi-tenant/habilitations.md`) :

- `todo:own` est retirée ;
- `notifications:own` entre dans `READ_ALL` ;
- `tasks:read` et `tasks:write` sont données à COORDINATEUR, INTERVENANT et SECRETARIAT, pas à LECTURE.

`/taches` n'a pas de paramètre patient dans l'URL : rien à ajouter dans `access-log-routes.ts`.

## Front

### Topbar (`components/navbar.tsx`)

- À droite, `flex gap-2` : **Tâches** (`ListTodo`) puis **Notifications** (`Bell`), boutons 40×40 `rounded-[10px]`, fond `#ffffff26` quand ouverts. `aria-label` et `title`.
- Pastilles : bleue `#2563eb` = tâches ouvertes où je suis tagué ; rouge `#dc2626` = non lues. Rien à 0.
- Visibles partout sous `_authenticated`, y compris `/user/settings` : les URL sont construites depuis `user.establishments[].services[]` (`/e/{e}/s/{s}/…`), jamais par `tenantApiUrl()`.
- Tâches masquée si tous les services de l'utilisateur sont en LECTURE ; les services LECTURE sont exclus des requêtes de tâches.
- Un seul état `open: 'tasks' | 'notifs' | null` : ouvrir l'un ferme l'autre. Panneau `Popover` 490×740 max, `max-h-[calc(100vh-80px)]`, à 58px du haut, bord droit aligné sur son icône.

### Données

- `useQueries`, une requête par service, `refetchInterval: 60_000`, `refetchOnWindowFocus`. Clés `['taches', serviceId]` et `['notifications', serviceId]`.
- Mutations sur l'URL du service de l'élément ; invalidation de la seule clé du service.
- Noms des auteurs et tagués : `GET /membres` du service, sur son URL explicite (`useServiceMembersQuery` passe par `tenantApiUrl()`), désactivés compris pour l'historique.
- Services interrogés : les vraies affectations (`affecte !== false`) ; ni le coordinateur implicite d'un chef d'établissement, ni un octroi temporaire.
- Le bloc est monté avec `key={tenantKey(context)}` : un changement de contexte remplace le client de requêtes (`useTenantSwitch`), le remontage relie les observateurs au nouveau.
- `api/inbox.api.ts` et `queries/useInbox.ts` nomment `serviceId` : exception déclarée dans `src/test/conventions-tenant-api-queries.test.ts`, comme `setOwnSoignant`.
- Aucun store Zustand : React Query suffit. Rien à ajouter à `resetTenantStores()`.

### Panneau Notifications

Conforme au handoff 15a : en-tête avec compteur et « Tout lu » (un appel `tout-lu` par service qui a des non lues), pastilles « Tous » / un par service avec compteur, segment « Non lues / Toutes », groupes par service puis par jour (Aujourd'hui, Hier, Cette semaine, puis plus ancien), ligne avec pastille `ListTodo` #0f766e sur #f0fdfa, texte « **Claire Leroy** vous a mentionné dans une tâche : … », méta « Mention · {quand} », lien « Ouvrir la tâche », point bleu si non lue. État vide « Rien de neuf ». Pied « Conservées 30 jours » ; le lien « Préférences » arrive à l'étape 2.

Clic : marque lue, ferme ce panneau, ouvre Tâches filtré sur le service, surligne la tâche (#f0fdfa) quelques secondes et la fait défiler à l'écran. Si la tâche est terminée, le repli « Terminées » s'ouvre.

### Panneau Tâches

- Saisie : `input` « Nouvelle tâche… tapez @ pour mentionner », bouton « Ajouter » (grisé si vide), Entrée valide.
- Deux boutons icône avant « Ajouter » : `Calendar` (le `DatePicker` existant) et `User` (recherche patient du service, via le filtre `search` de la liste des patients, sur l'URL explicite du service). Chacun ajoute une étiquette retirable au-dessus de la saisie.
- Mention : `@` suivi de lettres ouvre la liste des membres actifs non LECTURE du service de la tâche, filtrés sur prénom et nom, 5 au plus. Flèches, Entrée, Échap. Choisir ajoute l'étiquette et retire le `@…` du texte.
- Service de la tâche : celui du filtre, ou le service courant (`useCurrentScale`) si « Tous », ou le premier service non LECTURE hors tenant.
- Liste conforme au handoff : case 20px, étiquettes (tagués, moi en `bg-blue-50 text-primary` « vous », patient, échéance en #b91c1c si passée), « {auteur} · {quand} » (+ « · {service} » sous « Tous »), surlignage de la tâche créée.
- Filtres « Pour moi » (tagué ou auteur) / « Toutes ». Repli « Terminées · N ». État vide « Aucune tâche en cours ». Pied : « Les soignants mentionnés reçoivent une notification. »
- Cocher et décocher : mise à jour optimiste, retour arrière sur erreur.

### Supprimé

`components/custom/todo/`, `store/useTodoStore.ts` (et ses entrées dans `useTenantSwitch.ts`), `api/todo.api.ts`, `queries/useTodo.ts`, `types/todo.ts`, la constante `TODO`, le Todo back (domaine, dépôt, routes, schémas, interfaces, IoC), `bruno/MediSync/Todo`. Le seed Todo devient un seed de tâches avec une mention vers le compte de dev.

## Tests

Back (e2e) :

- création avec mention : la notification part chez le tagué, pas chez l'auteur ;
- sans tagué : l'auteur est tagué, aucune notification ;
- tagué hors service, désactivé ou LECTURE : 400 ; patient hors service : 400 ;
- LECTURE : 403 sur `/taches`, 200 sur `/notifications` ;
- `lu` sur la notification d'un autre : 404 ; `tout-lu` ne touche que les miennes du service ;
- `GET /taches` exclut les terminées de plus de 30 jours ;
- isolation inter-services (`isolation.test.ts`) ;
- migration des Todos.

Front (Vitest) :

- pastilles : compte juste, rien à 0 ;
- un seul panneau ouvert ;
- `@cl` propose Claire Leroy, la choisir crée une étiquette et retire `@cl` ;
- cocher, décocher, repli « Terminées » ;
- clic sur une mention : panneau Tâches ouvert, tâche surlignée.

Vérification navigateur sur le front de dev (port 4270) avec deux comptes du seed.
