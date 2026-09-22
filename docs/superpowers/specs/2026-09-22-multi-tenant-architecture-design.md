# Refonte multi-tenant : architecture cible

Date : 2026-09-22
Statut : architecture cible validée en brainstorming, à décliner en une spec détaillée par étape.
Document associé : `docs/multi-tenant/habilitations.md` (grille des rôles et matrice des permissions, qui fait foi).

## 1. Contexte et objectifs

MediSync est aujourd'hui l'outil d'un seul service de réadaptation. Toutes les données sont globales : un seul jeu
d'utilisateurs, de soignants, de thématiques, de lieux, de modèles de parcours, un `PlanningCycle` singleton.

Le besoin qui déclenche la refonte : accueillir simultanément d'autres services du même établissement et d'autres
établissements, chacun avec plusieurs services. La hiérarchie cible est :

```
Plateforme
└── Établissement (hôpital, clinique)
    └── Service (équipe qui anime des programmes ETP)
        └── Modèles de parcours (un PathwayTemplate est un programme de 6 à 12 semaines)
```

Il n'y a pas de niveau « programme » distinct : un `PathwayTemplate` est un programme.

Objectifs :

- Cloisonner strictement les données entre services et entre établissements.
- Partager au niveau établissement ce qui doit l'être : identité des patients, lieux, profils soignants, comptes.
- Remplacer les trois rôles globaux par des rôles par niveau de rattachement (voir le document d'habilitations).
- Permettre à un utilisateur d'appartenir à plusieurs services et à plusieurs établissements.
- Rendre l'application auditable : traçabilité des consultations de dossiers patients, désactivation des comptes.
- Livrer par étapes mergeables, l'application restant utilisable par les utilisateurs actuels à chaque étape.

Hors périmètre, à traiter ensuite si un besoin apparaît : Row Level Security PostgreSQL, invitations par e-mail,
politique de mot de passe et double authentification, rétention et purge des journaux, fusion de deux identités
patients, site super-admin séparé (le super-admin vit dans la même application).

## 2. Décisions structurantes

| Décision | Choix | Raison |
| --- | --- | --- |
| Isolation des données | Filtrage explicite dans les repositories + garde-fou Prisma + clés étrangères composites + tests d'isolation | Lisible et testable. Le schéma dénormalisé rend la RLS possible plus tard sans reprise du modèle, mais aucun déclencheur (audit, incident) ne la justifie aujourd'hui. |
| Colonnes de tenant | `establishmentId` sur toute table d'établissement, `establishmentId` **et** `serviceId` sur toute table de service, dénormalisés | Filtre unique par table, clés composites possibles, pas de sous-requête pour remonter la hiérarchie. |
| Dossier patient | Identité unique par établissement, sous-dossier ETP par service (`PatientServiceFile`) | Un même patient peut être suivi par plusieurs services sans doublon d'identité. |
| Utilisateur | Identité globale (e-mail unique sur la plateforme), appartenances multiples à des établissements puis à des services | Un soignant exerçant dans deux établissements garde un seul compte. L'inverse serait à réécrire plus tard. |
| URLs front | `/e/<establishmentId>/s/<serviceId>/...` avec les identifiants, pas de slug | Liens partageables, deux contextes dans deux onglets, pas de problème de renommage. |
| Super-admin | Drapeau `User.isSuperAdmin`, écrans dans la même application | Même authentification, même déploiement. Aucun accès aux données patients. |
| Livraison | Quatre étapes mergeables, chacune avec sa spec et son plan | Trop gros pour une branche unique ; les utilisateurs actuels n'ont qu'un contexte, les états intermédiaires sont sûrs. |

## 3. Modèle de données cible

### 3.1 Nouvelles tables

| Table | Rôle | Champs clés |
| --- | --- | --- |
| `Establishment` | Un hôpital, une clinique | `id`, `name`, `createdAt`, `deactivatedAt?` |
| `Service` | Une équipe qui anime des programmes | `id`, `establishmentId`, `name`, `createdAt`, `deactivatedAt?`. Unique `(establishmentId, name)`. Unique `(id, establishmentId)` pour servir de cible aux clés composites. |
| `EstablishmentMembership` | Un utilisateur dans un établissement | `id`, `userId`, `establishmentId`, `role` (`EstablishmentRole` : `ADMIN`, `MEMBER`), `soignantId?` composite vers `Soignant(id, establishmentId)`. Unique `(userId, establishmentId)`. |
| `ServiceMembership` | Un utilisateur dans un service | `id`, `establishmentMembershipId`, `serviceId`, `establishmentId`, `role` (`ServiceRole` : `COORDINATEUR`, `INTERVENANT`, `SECRETARIAT`, `LECTURE`). Unique `(establishmentMembershipId, serviceId)`. Clé composite `(serviceId, establishmentId)` vers `Service`. |
| `PatientServiceFile` | Sous-dossier ETP d'un patient dans un service | `id`, `patientId`, `serviceId`, `establishmentId`, `createdAt`, puis les champs migrés depuis `Patient` : `medicalDiagnosis`, `entryDate`, `careMode`, `orientation`, `etpDecision`, `programType`, `nonInclusionDetails`, `customContentDetails`, `goal`, `exitDate`, `stopReason`, `etpFinalOutcome`, `referringCaregiver`, `followUpToDo`, `notes`, `details`. Unique `(patientId, serviceId)`. Clé composite `(patientId, establishmentId)` vers `Patient`. |
| `PatientAccessLog` | Traçabilité des consultations | `id`, `userId`, `establishmentId`, `serviceId`, `patientId`, `action` (`VIEW_PATIENT`, `VIEW_DIAGNOSTIC`, `EXPORT_PDF`), `entityId?`, `createdAt`. Index `(patientId, createdAt)`, `(userId, createdAt)`. Table séparée d'`ActivityLog` : volume et rétention différents. |
| `SlotTemplateSoignant` | Liaison explicite modèle de créneau ↔ soignant | `slotTemplateId`, `soignantId`, `establishmentId`. Clés composites des deux côtés. Remplace la relation implicite `SlotTemplateSoignants`. |
| `SoignantThematic` | Liaison explicite soignant ↔ thématique | `soignantId`, `thematicId`, `establishmentId`. Remplace la relation implicite `SoignantThematics`. |

### 3.2 Tables modifiées

| Table | Changement |
| --- | --- |
| `User` | Devient une identité globale : `email` unique plateforme, `+isSuperAdmin Boolean`, `+deactivatedAt?`. Suppression de `role` et `soignantId` (portés par les appartenances). L'enum `Role` disparaît. |
| `Patient` | `+establishmentId`. Suppression de tous les champs d'inclusion, de sortie, `notes`, `details`, `referringCaregiver`, `followUpToDo` (migrés dans `PatientServiceFile`). Garde identité, contact, contexte social, `createDate`. Unique `(id, establishmentId)`. |
| `Soignant`, `Location` | `+establishmentId`. `Location.name` unique par `(establishmentId, name)`. Unique `(id, establishmentId)`. |
| `Thematic` | `+establishmentId`, `+serviceId`. `name` unique par `(serviceId, name)`. Unique `(id, serviceId)`. |
| `PathwayTemplate`, `SlotTemplate`, `Pathway`, `Slot`, `Appointment`, `AppointmentPatient`, `DiagnosticEducatifTemplate`, `Todo` | `+establishmentId`, `+serviceId`. Unique `(id, serviceId)`. |
| `DiagnosticEducatif` | `patientId` remplacé par `patientServiceFileId`. `+establishmentId`, `+serviceId`. |
| `EnrollmentIssue` | `patientId` remplacé par `patientServiceFileId`. `+establishmentId`, `+serviceId`. |
| `PatientPathwayPriority` | Garde `patientId` et `pathwayId`. `+establishmentId`, `+serviceId`. |
| `ForbiddenWeek` | `+establishmentId`, `+serviceId`. `startOfWeek` unique par `(serviceId, startOfWeek)`. |
| `PlanningCycle` | Perd l'identifiant `"default"` : `id` cuid, `serviceId` unique, `+establishmentId`. |
| `ActivityLog` | `+establishmentId?`, `+serviceId?` (nullables : une action de plateforme n'a pas de contexte). Index sur les deux. |

### 3.3 Clés étrangères composites

Toute référence d'une table de service vers une table d'établissement porte `(xId, establishmentId)` et référence
`X(id, establishmentId)`. Toute référence entre tables de service porte `(xId, serviceId)` et référence
`X(id, serviceId)`. Exemples :

- `SlotTemplate(locationId, establishmentId) → Location(id, establishmentId)`
- `SlotTemplate(thematicId, serviceId) → Thematic(id, serviceId)`
- `Slot(slotTemplateId, serviceId) → SlotTemplate(id, serviceId)`
- `AppointmentPatient(patientId, establishmentId) → Patient(id, establishmentId)`

La base refuse ainsi toute référence croisée entre tenants, ce qu'aucun filtrage applicatif (ni la RLS) ne
garantit. Les comportements `onDelete` actuels sont conservés. Prisma supporte les relations multi-champs vers des
clés uniques composites ; c'est pour cela que les deux relations plusieurs-à-plusieurs deviennent explicites.

### 3.4 Règles métier issues du modèle

- Poser un patient dans un créneau du service X exige un `PatientServiceFile` dans X. L'ajout rapide depuis
  l'agenda le crée automatiquement s'il n'existe pas, vide, avec `entryDate` au jour même.
- Créer un patient depuis un service crée l'identité et le sous-dossier en une opération. Avant création, une
  recherche par nom et date de naissance dans l'établissement propose de rattacher une identité existante.
- Aucune visibilité croisée entre sous-dossiers : la fiche patient dans le service X ne mentionne pas l'existence
  d'un sous-dossier dans Y, même pour un utilisateur membre des deux. L'existence d'un suivi est une donnée de santé.
- Un compte se désactive (`deactivatedAt`), il ne se supprime pas. Ses appartenances sont conservées.

## 4. Identité, authentification et autorisation

### 4.1 Connexion et session

Inchangées dans leur mécanisme : e-mail et mot de passe, JWT dans un cookie `httpOnly`, rafraîchissement par
cookie. Le JWT ne porte que `userID`. Le préhandler d'authentification recharge l'utilisateur à chaque requête
(comportement actuel) avec ses appartenances, et refuse (401) un compte dont `deactivatedAt` est renseigné. La
désactivation est effective à la requête suivante sans invalidation de jeton.

`GET /me` renvoie l'identité et l'arbre des appartenances :

```json
{
  "id": "…", "email": "…", "firstName": "…", "lastName": "…", "isSuperAdmin": false,
  "establishments": [
    {
      "id": "…", "name": "CHU", "role": "ADMIN", "soignantId": "…",
      "services": [
        { "id": "…", "name": "Cardiologie", "role": "COORDINATEUR" },
        { "id": "…", "name": "Diabétologie", "role": "INTERVENANT" }
      ]
    }
  ]
}
```

### 4.2 Familles de routes et préhandlers

| Préfixe | Préhandler | Condition |
| --- | --- | --- |
| `/auth/*`, `/me`, `/health`, `/` | aucun ou authentification seule | — |
| `/e/:establishmentId/s/:serviceId/*` | `resolveTenant` | Le service appartient à l'établissement ; l'utilisateur a une appartenance active aux deux. Sinon **404** (ne pas révéler l'existence). Construit `request.tenant`. |
| `/e/:establishmentId/admin/*` | `resolveEstablishmentAdmin` | Appartenance d'établissement avec rôle `ADMIN`. Sinon 404. |
| `/super-admin/*` | `requireSuperAdmin` | `isSuperAdmin`. Sinon 404. |

`request.tenant` contient : `establishmentId`, `serviceId`, `establishmentRole`, `serviceRole`, `soignantId`,
`userId`.

### 4.3 Permissions

`requireMinRole(Role)` est remplacé par `requirePermission(Permission)`. Une matrice statique (un objet TypeScript
partagé par le back et le front via un fichier dupliqué à l'identique et testé) associe chaque permission aux
rôles qui la détiennent. La matrice de référence est dans `docs/multi-tenant/habilitations.md`. Toute route de
service déclare exactement une permission ; une route sans permission déclarée échoue au démarrage (fail-safe,
comme la garde d'authentification globale actuelle).

Conséquences sur les schémas de réponse : les champs couverts par `clinical:read` (diagnostics éducatifs,
transmissions, `notes`, `details` du sous-dossier) sont retirés **côté back** des réponses pour les rôles qui ne
l'ont pas. La route de mise à jour d'un `AppointmentPatient` sépare les champs de présence (`appointment:write`)
des transmissions (`clinical:write`).

### 4.4 Cycle de vie d'un compte

1. L'inscription libre crée une identité sans appartenance ; l'utilisateur tombe sur la page d'attente actuelle.
2. L'administrateur d'établissement rattache ce compte par e-mail (rôle d'établissement, lien optionnel vers un
   profil soignant), puis l'affecte à des services avec un rôle chacun. Il peut aussi créer directement le compte
   avec un mot de passe provisoire.
3. Le super-admin crée les établissements et nomme leur premier administrateur. Il n'a aucun autre accès.
4. La désactivation remplace la suppression.

### 4.5 Traçabilité

- Toute écriture d'`ActivityLog` porte le contexte (`establishmentId`, `serviceId`) quand il existe.
- Les routes de consultation d'une fiche patient (`GET` du patient et de son sous-dossier), d'un diagnostic
  éducatif et d'export PDF écrivent une ligne dans `PatientAccessLog` via l'`AppEventBus` existant
  (`patient.viewed`, `diagnostic.viewed`, `patient.pdfExported`), consommées par un `PatientAccessLogSubscriber`.
- L'administrateur d'établissement consulte les accès à un patient donné.

## 5. Scoping côté back

### 5.1 Injection du contexte

Le container Awilix gagne un scope par requête via `@fastify/awilix` (déjà présent). `resolveTenant` enregistre
`tenant` dans ce scope. Les repositories des modèles rattachés à un service ou à un établissement sont enregistrés
en scope requête et reçoivent `tenant` par le constructeur, comme ils reçoivent `postgresOrm` aujourd'hui. Leurs
signatures publiques ne changent pas : `slotRepository.findById(id)` filtre en interne sur `tenant.serviceId`. Les
domaines ignorent le tenant, sauf pour les règles métier qui en dépendent (création automatique du sous-dossier,
par exemple).

Trois familles de repositories :

| Famille | Modèles | Filtre |
| --- | --- | --- |
| Service | `PathwayTemplate`, `SlotTemplate`, `Pathway`, `Slot`, `Appointment`, `AppointmentPatient`, `Thematic`, `DiagnosticEducatifTemplate`, `DiagnosticEducatif`, `EnrollmentIssue`, `PatientServiceFile`, `PatientPathwayPriority`, `ForbiddenWeek`, `PlanningCycle`, `Todo` | `serviceId` en lecture, `serviceId` + `establishmentId` posés à la création |
| Établissement | `Patient`, `Location`, `Soignant`, `SlotTemplateSoignant`, `SoignantThematic`, `EstablishmentMembership`, `ServiceMembership`, `Service`, `ActivityLog`, `PatientAccessLog` | `establishmentId` |
| Global | `User`, `Establishment` | aucun ; réservés à l'authentification, à `/me` et au super-admin |

### 5.2 Garde-fou Prisma

Une extension Prisma déclare la liste des modèles de chaque famille. Sur toute opération :

- modèle de service : exige `serviceId` dans `where` (lecture, mise à jour, suppression, comptage) et dans `data`
  (création, y compris imbriquée) ;
- modèle d'établissement : idem avec `establishmentId` ;
- sinon lève une erreur explicite (`TenantScopeMissingError`) qui remonte en 500. Jamais de fuite silencieuse.

Le garde-fou tourne en production. Les requêtes légitimement transverses (migration de données, scripts
super-admin) utilisent un client dérivé sans garde-fou, qui n'est pas enregistré dans le container par défaut.
Les `$queryRaw` échappent au garde-fou : règle de revue, aucun nouveau `$queryRaw` sur une table de tenant.

### 5.3 Recherche par identifiant

`findUnique({ where: { id } })` ne porte pas le filtre. Les repositories passent à `findUnique` sur la clé
composite `(id, serviceId)` déclarée unique (ou `findFirst` avec les deux champs). Un identifiant d'un autre service
renvoie 404, indistinguable d'un identifiant inexistant.

### 5.4 Références croisées

Garanties par les clés composites (section 3.3). L'erreur Prisma de violation de clé étrangère est mappée en 400 par
l'`ErrorHandler` existant. Le domaine n'a rien à vérifier.

### 5.5 Tests

- **Isolation générique (e2e, Testcontainers)** : pour chaque route de service listée, créer une ressource dans un
  service B, la demander depuis un membre du service A, attendre 404. Même schéma entre deux établissements pour
  les routes d'établissement.
- **Garde-fou (unitaire)** : pour chaque modèle déclaré, une requête sans filtre est rejetée ; une requête filtrée
  passe.
- **Permissions (e2e)** : pour chaque route, chaque rôle de service obtient 200 ou 403 conformément à la matrice.
- **Filtrage clinique (e2e)** : un `SECRETARIAT` et un `LECTURE` ne reçoivent jamais les champs cliniques.

## 6. Front

### 6.1 Arbre de routes

```
routes/
├── __root.tsx
├── auth/, pending.tsx
├── _authenticated.tsx                      # authentifié, charge /me
├── _authenticated/
│   ├── index.tsx                           # → contexte par défaut
│   ├── choose-context.tsx                  # liste des couples accessibles
│   ├── agenda.tsx, suivi.tsx, patient/…    # anciennes URLs : redirigent vers /e/…/s/…, paramètres conservés
│   ├── e/$establishmentId/
│   │   ├── s/$serviceId.tsx                # layout tenant : vérifie l'appartenance, fournit useTenant()
│   │   ├── s/$serviceId/
│   │   │   ├── agenda.tsx, dashboard.tsx, suivi.tsx
│   │   │   ├── patient/index.tsx, patient/$patientID.tsx
│   │   │   └── _coordinator/settings/…     # planning, thematic, diagnostic-template (planning:write / referentials:write)
│   │   ├── admin.tsx                       # layout admin d'établissement
│   │   └── admin/ services, members, locations, soignants, activity-log, access-log
│   ├── super-admin.tsx, super-admin/establishments
│   └── user/settings.tsx
```

### 6.2 Résolution du contexte

Au chargement, `/me` alimente le store d'authentification (l'arbre des appartenances remplace `role`). Le
`beforeLoad` du layout tenant vérifie que le couple de l'URL figure dans les appartenances, sinon redirige vers
`choose-context`. Le contexte par défaut est le dernier visité (`localStorage`, clé par utilisateur), sinon le
premier disponible. Un utilisateur sans appartenance tombe sur `pending`. Un 404 reçu sur une route tenant alors
qu'un contexte est chargé redirige vers `choose-context` (favori périmé, appartenance retirée).

### 6.3 Sélecteur

Sélecteur combiné « Établissement › Service » dans la barre de navigation, affiché seulement si l'utilisateur a plus
d'un couple accessible. Changer de contexte navigue vers la même page dans le nouveau contexte si elle existe, sinon
vers l'agenda.

### 6.4 Appels API et cache

- `useTenant()` lit `establishmentId` et `serviceId` dans les paramètres de route et expose `apiBase`
  (`${apiUrl}/e/${establishmentId}/s/${serviceId}`).
- Les modules de `api/` prennent le tenant en premier argument. Les modules hors tenant (`auth.api.ts`, `/me`)
  sont inchangés.
- Toutes les clés de requête commencent par `[establishmentId, serviceId, …]`. Une convention `tenantKey(tenant,
  …rest)` centralise la construction.
- Les stores Zustand qui portent des données de service (filtres du dashboard, planning en édition, soignants
  sélectionnés, panier) sont réinitialisés au changement de contexte ; ceux qui sont persistés le sont sous une clé
  incluant le service.

### 6.5 Permissions à l'écran

`useCan(permission)` dérive des rôles du contexte courant la même matrice que le back. Il masque boutons d'action,
onglets de réglage et champs cliniques. Le back reste seul garant.

### 6.6 Fiche et liste patients

- Fiche en deux blocs : identité partagée (éditable avec `patient:write`), sous-dossier ETP du service courant avec
  ses diagnostics et son planning individuel. Aucune mention d'autres sous-dossiers.
- Liste par service : patients ayant un sous-dossier dans le service. Recherche d'identité existante dans
  l'établissement à la création.

### 6.7 Écrans d'administration

- Établissement : services, membres (recherche par e-mail, rôle d'établissement, lien soignant, affectations aux
  services avec rôle, désactivation), lieux, soignants, journal d'activité filtré par service, journal des accès
  par patient.
- Super-admin : liste et création d'établissements, nomination du premier administrateur.

## 7. Migration des données existantes

### 7.1 Principe

Deux migrations Prisma en SQL écrit à la main (une à l'étape 1, une à l'étape 3), chacune exécutée par Prisma dans
une transaction : tout passe ou rien. Le déploiement applique les migrations au démarrage du conteneur
(`start:migrate:production`).

Chaque migration suit le schéma en trois temps :

1. **Ajouter sans contraindre** : nouvelles tables, colonnes de tenant nullables, tables de liaison vides.
2. **Remplir** : si la base contient au moins une ligne dans une table métier, insérer un établissement et un
   service aux noms provisoires « Établissement » et « Service » (renommés ensuite depuis l'interface), puis
   remplir les colonnes de tenant partout. Convertir les utilisateurs selon la table de correspondance du
   document d'habilitations (`ADMIN` → `ADMIN` + `COORDINATEUR`, `USER` → `MEMBER` + `INTERVENANT`, `NONE` →
   aucune appartenance), le lien soignant reporté sur l'appartenance d'établissement. Copier les relations
   plusieurs-à-plusieurs dans les tables explicites. Recréer le `PlanningCycle` avec le `serviceId`. Remplir
   `ActivityLog.establishmentId`.
   À l'étape 3 : créer un `PatientServiceFile` par patient avec les colonnes migrées, rebrancher
   `DiagnosticEducatif` et `EnrollmentIssue`.
3. **Contraindre et nettoyer** : `NOT NULL`, clés composites, nouvelles unicités, suppression des colonnes migrées,
   des relations implicites et de l'enum `Role`.

### 7.2 Base vide

Sur une base neuve, le temps 2 ne fait rien : la migration ne crée pas d'établissement. Le seed crée un
établissement et deux services de développement, avec un utilisateur membre des deux à des rôles différents. Les
tests e2e partent d'une base vide et construisent leurs tenants.

### 7.3 Super-admin initial

`npm run bootstrap:super-admin -- <email>` pose `isSuperAdmin` sur une identité existante et écrit une ligne
d'`ActivityLog`. Pas de variable d'environnement au démarrage.

### 7.4 Sauvegarde et retour arrière

Sauvegarde manuelle avant chaque déploiement de migration, en plus du `pg_dump` quotidien. Retour arrière =
redéployer l'image précédente et restaurer avec `deploy/scripts/restore-db-dump.sh`. Les migrations n'ont pas de
« down » : la suppression de colonnes au temps 3 les rend irréversibles sans restauration.

### 7.5 Vérification

Un test de migration jetable restaure un extrait anonymisé de la base actuelle dans Testcontainers, applique la
migration et vérifie les invariants : aucune colonne de tenant nulle, un utilisateur `ADMIN` devenu administrateur
d'établissement et coordinateur, les soignants d'un modèle de créneau retrouvés dans la table de liaison, et à
l'étape 3 autant de sous-dossiers que de patients. Ce test est retiré après le déploiement de l'étape concernée.

## 8. Découpage en étapes

Chaque étape a sa spec (`docs/superpowers/specs/`), son plan (`docs/superpowers/plans/`), son worktree, et se
termine mergée sur `main` avec l'application utilisable par les utilisateurs actuels (un établissement, un
service). L'étape 1 est un prérequis des trois autres ; les étapes 2 et 3 sont indépendantes entre elles.

### Étape 1 — Socle (back surtout, la plus grosse)

- Migration : `Establishment`, `Service`, appartenances, rôles, colonnes de tenant partout, tables de liaison
  explicites, clés composites, conversion des utilisateurs, `PlanningCycle` par service, `ActivityLog` contextualisé.
  `Patient` reste à plat et gagne `establishmentId`.
- Back : `/me`, `resolveTenant`, scope Awilix par requête, repositories filtrés, garde-fou Prisma,
  `requirePermission` et matrice, routes préfixées. L'ancienne API non préfixée disparaît.
- Front minimal : le store d'authentification retient l'unique contexte renvoyé par `/me` ; le préfixe d'API est
  dérivé de ce store en un seul endroit. Aucune route ni clé de cache ne change. Le layout `_admin` teste
  `planning:write`.
- Seed avec un établissement et un service. Tests : isolation générique, garde-fou, permissions, migration jetable.
- **Sortie** : application indiscernable d'aujourd'hui pour un utilisateur ; un membre du service A reçoit 404 sur
  toute ressource du service B.

### Étape 2 — Contexte front (front seul)

- Routes sous `/e/$establishmentId/s/$serviceId`, layouts d'établissement et de super-admin vides, redirections
  des anciennes URLs, page `choose-context`.
- `useTenant()`, modules d'API avec tenant en argument, clés de requête préfixées, stores réinitialisés et
  persistés par service, `useCan()` sur boutons, onglets et champs cliniques.
- Sélecteur dans la barre de navigation. Seed avec deux services et un utilisateur membre des deux.
- **Sortie** : passer d'un service à l'autre ne montre jamais une donnée de l'autre ; un `SECRETARIAT` ne voit ni
  diagnostics ni transmissions.

### Étape 3 — Dossier patient (back et front)

- Migration : `PatientServiceFile`, copie des colonnes, rattachement des diagnostics et problèmes d'inscription,
  suppression des colonnes de `Patient`.
- API du sous-dossier, filtrage des champs cliniques dans les schémas de réponse, création automatique du
  sous-dossier à l'ajout rapide, séparation présence / transmissions sur `AppointmentPatient`.
- Fiche patient en deux blocs, liste par service, création avec recherche d'identité existante.
- **Sortie** : un même patient a un sous-dossier dans deux services sans que l'un voie l'autre.

### Étape 4 — Administration et traçabilité (back et front)

- Migration : table `PatientAccessLog` (la colonne `User.deactivatedAt` arrive dès l'étape 1, inutilisée).
- Écrans d'administration d'établissement et de super-admin, script de bootstrap du super-admin.
- `PatientAccessLog` : événements, subscriber, écran par patient.
- Désactivation de compte à la place de la suppression.
- **Sortie** : un second établissement se crée et se peuple entièrement depuis l'interface, sans accès à la base.

## 9. Conformité

Lecture technique, à faire valider par un conseil. L'hébergement sur un PaaS certifié HDS pour les six activités
couvre l'infrastructure ; la couche applicative reste sous RGPD (article 32) et référentiels PGSSI-S. Ce que la
refonte apporte à ce titre :

- cloisonnement logique documenté (ce document), testé (section 5.5) et vérifié en continu ;
- grille d'habilitations formalisée (`docs/multi-tenant/habilitations.md`) et matérialisée dans l'écran
  d'administration ;
- imputabilité : journal d'activité contextualisé, journal des accès en lecture aux dossiers patients,
  désactivation des comptes sans perte d'historique ;
- modèle « établissement » qui rend naturel un contrat de sous-traitance par établissement.

Points restant à instruire hors de ce chantier : qualification d'« exploitant » au sens de l'activité 5 HDS
lorsque l'éditeur administre l'application, politique de mot de passe et double authentification, rétention des
journaux.
