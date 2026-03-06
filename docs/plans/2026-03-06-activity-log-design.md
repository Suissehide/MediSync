# Design — Système de traçabilité d'activité (Activity Log)

**Date** : 2026-03-06
**Statut** : Approuvé

---

## Contexte

MediSync a besoin d'un système de traçabilité des actions métier par compte utilisateur, consultable et filtrable par les administrateurs. L'objectif est d'auditer qui a fait quoi sur les entités cliniques clés.

---

## Périmètre

### Actions loguées

| Event | Entité | Déclencheur |
|---|---|---|
| `patient.created` | Patient | Création d'un patient |
| `patient.updated` | Patient | Modification d'un patient |
| `patient.deleted` | Patient | Suppression d'un patient |
| `patient.enrolled` | Patient | Inscription à un parcours |
| `diagnostic.created` | DiagnosticEducatif | Création d'un diagnostic |
| `diagnostic.updated` | DiagnosticEducatif | Modification d'un diagnostic |
| `appointment.created` | Appointment | Création d'un rendez-vous |
| `appointment.updated` | Appointment | Modification d'un rendez-vous |

### Données par log
- `userID` — compte ayant déclenché l'action
- `action` — identifiant de l'event (ex. `patient.created`)
- `entityType` — type d'entité concernée (ex. `patient`)
- `entityId` — id de l'entité concernée
- `createdAt` — horodatage

### Rétention
12 mois glissants. Nettoyage déclenché via `POST /activity-log/cleanup` (admin uniquement).

---

## Architecture

### Pattern : Event Bus interne

Choix délibéré d'un event bus (vs injection directe du repo dans chaque domain) pour découpler les domains du système de logging. Les domains émettent des events sans connaître leurs abonnés.

```
Domain
  → AppEventBus.emit(event, payload)
    → ActivityLogSubscriber.handle()
      → ActivityLogRepository.create()
        → Table ActivityLog (Postgres)
```

### AppEventBus

Wrapper typé autour de `EventEmitter` Node.js natif. Singleton enregistré dans l'IoC Awilix.

```ts
type AppEvents = {
  'patient.created':   { userID: string; patientId: string }
  'patient.updated':   { userID: string; patientId: string }
  'patient.deleted':   { userID: string; patientId: string }
  'patient.enrolled':  { userID: string; patientId: string }
  'diagnostic.created': { userID: string; diagnosticId: string }
  'diagnostic.updated': { userID: string; diagnosticId: string }
  'appointment.created': { userID: string; appointmentId: string }
  'appointment.updated': { userID: string; appointmentId: string }
}
```

### ActivityLogSubscriber

Service instancié au démarrage dans le constructeur de l'IoC container (après `appEventBus` et `activityLogRepository`). S'abonne à tous les events et délègue la persistance.

### Passage du userID

Le JWT expose `request.user.userID` dans les routes Fastify. Les routes transmettent le `userID` aux méthodes des domains via un paramètre supplémentaire. Les interfaces de domain sont mises à jour en conséquence.

---

## Schéma Prisma

```prisma
model ActivityLog {
  id         String   @id @default(cuid())
  userID     String
  action     String
  entityType String
  entityId   String
  createdAt  DateTime @default(now())

  @@index([userID])
  @@index([action])
  @@index([createdAt])
}
```

Pas de FK sur `userID` pour ne pas bloquer la suppression d'un compte.

---

## API

### GET /activity-log
Réservé aux admins (vérification `role === ADMIN`). Pagination côté serveur (50 par page).

**Query params** : `page`, `action`, `userID`, `from` (date ISO)

**Réponse** :
```json
{
  "data": [{ "id", "userID", "action", "entityType", "entityId", "createdAt", "user": { "firstName", "lastName" } }],
  "total": 312,
  "page": 1
}
```

### POST /activity-log/cleanup
Réservé aux admins. Supprime les logs `createdAt < now() - 12 mois`. Retourne le nombre de lignes supprimées.

---

## Interface admin

Nouvelle page `_admin/settings/activity-log.tsx` dans le menu settings existant.

**Filtres** :
- Recherche par utilisateur (firstName/lastName)
- Dropdown action (tous + les 8 types)
- Dropdown période (7j / 30j / 3 mois / 12 mois)

**Tableau** : Date | Heure | Utilisateur | Action (libellé FR) | Entité (type + id tronqué)

**Pagination** : côté serveur, 50 résultats par page.

---

## Fichiers à créer

### Back-end
- `src/main/utils/app-event-bus.ts` — AppEventBus + types des events
- `src/main/services/activity-log.subscriber.ts` — ActivityLogSubscriber
- `src/main/types/infra/orm/repositories/activityLog.repository.interface.ts`
- `src/main/infra/orm/repositories/activityLog.repository.ts`
- `src/main/types/domain/activityLog.domain.interface.ts`
- `src/main/domain/activityLog.domain.ts`
- `src/main/interfaces/http/fastify/schemas/activityLog.schema.ts`
- `src/main/interfaces/http/fastify/routes/activityLog.ts`
- `prisma/migrations/XXXX_add_activity_log/`

### Front-end
- `src/api/activityLog.api.ts`
- `src/queries/useActivityLog.ts`
- `src/routes/_authenticated/_admin/settings/activity-log.tsx`
- `src/constants/process.constant.ts` (ajout clés)

## Fichiers modifiés

### Back-end
- `prisma/schema.prisma` — nouveau model ActivityLog
- `src/main/types/application/ioc.ts` — ajout appEventBus, activityLogDomain, activityLogRepository
- `src/main/application/ioc/awilix/awilix-ioc-container.ts` — enregistrement
- `src/main/interfaces/http/fastify/routes/index.ts` — enregistrement route
- `src/main/domain/patient.domain.ts` — emit events + userID en param
- `src/main/types/domain/patient.domain.interface.ts` — userID en param
- `src/main/domain/diagnosticEducatif.domain.ts` — emit events + userID
- `src/main/types/domain/diagnosticEducatif.domain.interface.ts` — userID en param
- `src/main/domain/appointment.domain.ts` — emit events + userID
- `src/main/types/domain/appointment.domain.interface.ts` — userID en param
- Routes patient, diagnosticEducatif, appointment — passage du `request.user.userID`

### Front-end
- Navbar/settings menu — ajout lien "Activité"
