# Détection des conflits de planification — conception (MDS-39)

## Objectif

Aucun double-booking ne passe sans avertissement explicite. Le coordinateur enregistre toujours ; un conflit est signalé par un toast au moment de l'enregistrement et par un badge sur les créneaux concernés tant qu'il existe.

## Périmètre

Trois règles :

| Règle | Conflit quand |
|---|---|
| `salle` | deux créneaux non archivés, **ayant chacun au moins un patient**, qui se chevauchent ont la même `slotTemplate.locationID` |
| `patient` | un même patient a deux rendez-vous qui se chevauchent (créneaux non archivés, même créneau ou non) |
| `capacite` | un rendez-vous d'un créneau dont `slotTemplate.capacity` est renseignée compte plus de patients que cette capacité |

Chevauchement : `a.start < b.end && a.end > b.start` (deux intervalles bout à bout ne se chevauchent pas).

Un créneau sans patient ne dispute la salle à personne : une plage de parcours vide, dans laquelle on crée des créneaux individuels, n'est pas un double-booking. Décidé après mesure sur les données de dev (semaine du 19/10 : 47 conflits sans ce filtre, 9 avec).

Hors périmètre :

- Règles soignant (même soignant, soignant indisponible) : `Soignant` est un métier, pas une personne. Ticket séparé qui modélisera les personnes et leurs absences.
- Capacité vide : pas de limite, rien n'est signalé. L'incohérence existante (`isSlotAvailable` et le front la traitent comme 1) n'est pas corrigée ici.
- Pas de blocage, pas de forçage, pas d'entrée dans le journal d'activité : le badge sert de trace.
- Génération de parcours (`instantiate`, `regenerate`) et inscription en masse inchangées ; leurs conflits éventuels apparaissent en badge.
- Mode modèles de l'écran Planning (créneaux non datés).

## Back

### Détection

`back/src/main/utils/planning-conflicts.ts` exporte une fonction pure :

```ts
type PlanningConflict =
  | { type: 'salle'; slotIDs: [string, string]; locationID: string }
  | { type: 'patient'; slotIDs: string[]; appointmentIDs: [string, string]; patientID: string }
  | { type: 'capacite'; slotIDs: [string]; appointmentID: string; capacity: number; count: number }

detectConflicts(slots: ConflictSlot[]): PlanningConflict[]
```

`ConflictSlot` contient le strict nécessaire : `id`, `startDate`, `endDate`, `archivedAt`, `slotTemplate.{ locationID, capacity }`, `appointments[].{ id, startDate, endDate, appointmentPatients[].patientID }`. Les créneaux archivés sont ignorés. Chaque paire n'est signalée qu'une fois.

### Données

Une méthode du dépôt des créneaux charge les créneaux du service courant dont l'intervalle chevauche `[from, to]`, avec `slotTemplate` (salle, capacité) et `appointments.appointmentPatients`. `SlotDomain.findConflicts({ from, to })` l'appelle et applique `detectConflicts`.

### Endpoint

`GET /slot/conflicts?from=&to=`, permission `planning:read`, réponse `{ conflicts: PlanningConflict[] }`.

### Création et modification

`POST /slot`, `PATCH /slot/:slotID`, `POST /appointment` et `PATCH /appointment/:appointmentID` enregistrent comme aujourd'hui, puis ajoutent `conflicts` à la réponse : les conflits de la fenêtre horaire du créneau touché qui le concernent. Le reste du contrat ne change pas. Si le `PATCH` d'un rendez-vous le supprime (liste de patients vide), `conflicts` est vide.

## Front

- `useSlotConflicts(from, to)` dans `front/src/queries/useSlot.ts` appelle l'endpoint sur la plage visible et indexe le résultat par `slotID`.
- `describeConflict(conflict, context)` dans `front/src/libs/utils.ts` produit le libellé (« Salle B occupée par Atelier diététique 10:00–11:00 », « Mme X a déjà un rendez-vous à 10:30 », « 9 patients pour 8 places »). Elle sert à l'infobulle et au toast.
- Badge : pastille d'alerte dans `components/custom/Calendar/eventContent.tsx` à côté de celle du verrou, couleur `destructive`, infobulle `title` listant les libellés. Les conflits passent par `extendedProps` dans `buildCalendarEventsFromSlots`. Visible sur le tableau de bord et sur l'écran Planning en mode créneaux réels.
- Agenda du jour (`routes/…/agenda.tsx`) : même pastille dans la cellule du créneau.
- Après une mutation slot ou appointment : si la réponse contient des conflits, toast d'avertissement (« Enregistré, mais 1 conflit : … ») ; la requête des conflits est invalidée dans tous les cas.

## Tests

- Unitaires back (`src/test/unit/utils/planning-conflicts.test.ts`) : chaque règle, créneaux bout à bout, créneau archivé, capacité vide, absence de doublon.
- E2e back : `GET /slot/conflicts` sur deux créneaux dans la même salle ; champ `conflicts` d'un `PATCH /slot` qui crée un conflit.
- Vitest front : `describeConflict` pour chaque type.
- Navigateur : deux créneaux dans la même salle → badge et toast.
