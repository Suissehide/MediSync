# Design : Notifications, étape 2 (événements dans l'app et préférences)

Handoff : `docs/superpowers/specs/handoffs/notifications-15/` (tour 15 : 15a pour le panneau, 15b pour les préférences). Étape 1 : `2026-10-19-notifications-etape-1-design.md` (tâches, mentions, modèle `Notification`, panneaux de la topbar), complétée le 2026-10-20 par la mention par métier (`TaskSoignant`).

## Périmètre

| Étape | Contenu |
|---|---|
| 1 (fusionnée) | Tâches partagées, mentions (personne et métier), `Notification` de type `MENTION`, panneaux Tâches et Notifications |
| **2 (ce document)** | Les huit autres types, dans l'app ; planificateur (rappels, J+7, fins de parcours, échéances, purge à 30 jours) ; section « Notifications » de Mon compte, colonne « Dans l'app » seulement ; lien « Préférences » du panneau |
| 3 | E-mails sans données de santé (colonne « E-mail » de 15b, envoi immédiat ou résumé à 7 h) |

## Décisions prises

- Les événements déclenchés par le temps sont dans cette étape, avec un planificateur simple.
- La page de préférences n'affiche que la colonne « Dans l'app » ; la colonne « E-mail » et le choix « Envoi des e-mails » arrivent à l'étape 3.
- **Soignants de la séance** : les comptes qui incarnent un soignant lié au modèle de créneau (`SlotTemplateSoignant` : « qui anime la séance »), via `ServiceMembership.soignantId`, actifs (`deactivatedAt` nul), hors LECTURE. Un soignant étant un métier, tous les comptes qui l'incarnent dans le service sont concernés. L'auteur de l'action est toujours exclu. Un créneau sans soignant ne notifie personne. Même filtre que la mention par métier (`TaskDomain.create`).
- **Absence non justifiée** : un patient passe à `status = no` alors que `rejectionReason` est vide.
- **Diagnostic éducatif à réaliser** : inclusion = `PatientServiceFile.entryDate` ; à J+7, aucun `DiagnosticEducatif` pour ce patient dans le service. Sans date d'entrée, rien.
- **Fin de parcours** : le lendemain de la dernière séance du parcours du patient, s'il n'a aucune séance de thématique `BILAN_DE_FIN` prévue ou honorée dans ce parcours.
- **Diagnostic et fin de parcours** sont reçus par les comptes qui incarnent un soignant lié (`SoignantThematic`) à une thématique de rôle `DIAGNOSTIC_EDUCATIF` (resp. `BILAN_DE_FIN`) du service.
- **Créneau presque complet** : capacité comptée **par créneau**, comme l'agenda (`slotTemplate.capacity ?? 1`, patients de tous les rendez-vous du créneau). Déclenché quand un ajout fait passer les places restantes à exactement 1, pour une capacité ≥ 2. Une seule fois par créneau.
- **Inscription à un parcours** : une notification « Patient ajouté » **par soignant et par patient**, qui résume les séances (« BERNARD Jean a été ajouté à 6 de vos séances, la première le jeu. 22/10 »), jamais une par séance.

## Événements

| Type (`NotificationType`) | Libellé (15b) | Déclencheur | Destinataires | Lien |
|---|---|---|---|---|
| `REMINDER` | Rappel avant mes rendez-vous | planificateur, selon le délai du destinataire : la veille à 18 h, 2 h avant, 1 h avant | soignants de la séance | Ouvrir le RDV |
| `PATIENT_ADDED` | Patient ajouté à un de mes rendez-vous | patient ajouté à un rendez-vous (fiche RDV) ou inscription à un parcours | soignants de la séance | Ouvrir le RDV |
| `APPOINTMENT_MOVED` | Rendez-vous modifié ou annulé | date, horaire ou salle d'un rendez-vous ou de son créneau | soignants de la séance | Ouvrir le RDV |
| `APPOINTMENT_CANCELLED` | (même ligne de préférence) | rendez-vous supprimé ou vidé de ses patients, créneau archivé ou supprimé alors qu'il a des patients | soignants de la séance | Voir l'agenda |
| `ABSENT` | Absence non justifiée | patient passé à « non » sans raison saisie | soignants de la séance | Ouvrir la fiche |
| `DIAGNOSTIC_DUE` | Diagnostic éducatif à réaliser | planificateur : J+7 après `entryDate`, sans diagnostic | soignants des thématiques Diagnostic éducatif | Ouvrir la fiche |
| `PATHWAY_END` | Fin de parcours : bilan à faire | planificateur : lendemain de la dernière séance, sans Bilan de fin | soignants des thématiques Bilan de fin | Ouvrir la fiche |
| `SLOT_ALMOST_FULL` | Créneau presque complet | ajout laissant une place | soignants de la séance | Voir le créneau (agenda) |
| `TASK_DUE` | Tâche qui arrive à échéance | planificateur : le matin (à partir de 7 h) du jour d'échéance, tâche ouverte | tagués + comptes des métiers tagués | Ouvrir la tâche |

`MENTION` reste inchangé. Une préférence couvre `APPOINTMENT_MOVED` et `APPOINTMENT_CANCELLED` ensemble (clé `moved`).

### Payloads

Données de rendu figées à la création (la notification reste lisible si l'objet change ou disparaît), plus les identifiants pour naviguer :

- séance : `{ appointmentId, slotId, startDate, thematicName, locationName? }` ;
- patient : `{ patientId, patientName }` (« NOM Prénom ») ;
- auteur : `{ actorId }` quand une personne a agi ;
- `APPOINTMENT_MOVED` : `{ before: { startDate, locationName? }, after: {…} }` ;
- `PATIENT_ADDED` regroupé : `{ patientId, patientName, count, firstStartDate, appointmentId }` (premier RDV) ;
- `TASK_DUE` : `{ taskId, text, dueDate }`.

Les données de santé restent dans l'app : rien de tout ceci ne part par e-mail à cette étape.

## Architecture

### `NotificationDispatcher` (appelé par les domaines)

Pas de nouvel événement sur `appEventBus` : `activity-log-emissions-declarees.test.ts` exige qu'un événement déclaré écrive une ligne du journal d'activité, et `access-log-vocabulaire.test.ts` lie le vocabulaire du journal aux libellés du front. Y ajouter des événements de notification forcerait à journaliser et libeller des actions qui n'en sont pas.

Un service `NotificationDispatcher` (`services/notification.dispatcher.ts`) est appelé directement par les domaines. Chaque méthode publique rend la main tout de suite (`void`), travaille en tâche de fond dans le contexte de la requête, et **attrape toute erreur** (journalisée par sa classe, comme les purges) : une notification ratée n'échoue jamais l'action métier.

- `snapshot(appointmentIds)` : lit, **avant** une suppression, ce qu'il faut pour notifier ensuite (séance, soignants du créneau, patients) ;
- `patientsAdded(actorId, appointmentId, patientIds)`, `absent(actorId, appointmentId, patientIds)`, `moved(actorId, appointmentId, before)`, `cancelled(actorId, snapshots)`, `enrolled(actorId, patientId, appointmentIds)`, `slotFilled(actorId, slotId)`.

Branchements :

- `AppointmentDomain.update` : lit le rendez-vous avant l'écriture, compare après : patients ajoutés, patients passés à `no` sans raison, date changée ; si la liste est vidée, c'est une annulation (instantané pris avant) ;
- `AppointmentDomain.delete` : instantané avant, annulation après ;
- `SlotDomain.update` : horaire ou salle changés → « modifié » pour chaque rendez-vous du créneau ; `archivedAt` posé avec des patients → « annulé » ;
- `SlotDomain.delete` : instantané avant, annulation après ;
- `PatientDomain.processEnrollments` : les rendez-vous rejoints par chaque patient → `enrolled` en fin de traitement ;
- après tout ajout de patient, `slotFilled` évalue « presque complet ».

Le calcul des destinataires et le filtrage par préférences vivent dans le dispatcher ; l'écriture passe par `NotificationRepository`.

### Planificateur

`scheduleNotifications()` dans `application/starter.ts`, sur le modèle de `scheduleActivityLogCleanup` : `setInterval` de 15 minutes, `unref()`, sous `tenantContext.runAsSystem`, une entrée de plus dans `runAsSystem-unicite.test.ts`. Chaque passage :

- **rappels** : pour chaque destinataire, tout rendez-vous non commencé dont l'heure de rappel (selon son délai) est passée ; la clé d'unicité évite les doublons, et un rappel peut partir jusqu'à 15 min après l'heure exacte ;
- **diagnostic** : dossiers dont `entryDate + 7 j` est passé depuis moins de 30 jours, sans diagnostic ;
- **fin de parcours** : parcours dont la dernière séance du patient est passée depuis moins de 30 jours, sans Bilan de fin ;
- **échéances** : tâches ouvertes dont `dueDate` est aujourd'hui, à partir de 7 h (Europe/Paris) ;
- **purge** : notifications de plus de 30 jours.

Les heures (« la veille à 18 h », « 7 h ») sont en Europe/Paris.

### Unicité

`Notification.dedupeKey String?` avec `@@unique([userId, dedupeKey])`, écrites par `createMany({ skipDuplicates: true })`. Clés : `reminder:{appointmentId}:{startDate}`, `diag:{patientServiceFileId}`, `end:{pathwayId}:{patientId}`, `due:{taskId}:{dueDate}`, `full:{slotId}`. Les notifications d'action (ajout, modification, annulation, absence) n'en ont pas.

## Préférences

### Modèle

`User.notificationPrefs Json @default("{}")` : préférences globales au compte (le choix des services traverse les établissements). Forme :

```ts
type NotificationPrefs = {
  level: 'all' | 'essential' | 'custom'
  services: string[] | null      // null = tous les services du compte (défaut)
  app: Record<NotificationPrefKey, boolean>
  reminderDelay: 'eve' | '2h' | '1h'
}
type NotificationPrefKey = 'reminder' | 'added' | 'moved' | 'absent' | 'diag' | 'end' | 'full' | 'mention' | 'due'
```

Défaut (préférence absente ou partielle) : `essential`, tous les services, tout coché dans l'app, `eve`. Dans l'app, « Tout » et « Essentiel » cochent tout : ils ne diffèrent que par les e-mails (étape 3). Choisir un niveau réécrit la grille ; modifier une ligne passe en `custom`.

À l'écriture d'une notification, elle n'est pas créée si le service n'est pas dans `services` (quand non nul) ou si `app[clé]` est faux. `MENTION` obéit aussi à la préférence `mention`.

### API

`GET /me/notification-preferences` → préférences complétées des défauts. `PUT /me/notification-preferences` → validation Zod : au moins un service, et seulement des services du compte (sinon 400). Hors tenant, sous `/me`, sur le compte courant uniquement.

### Écran (15b, colonne « Dans l'app »)

Section « Notifications » de `routes/_authenticated/user/settings.tsx`, sous « Informations personnelles », titre avec `Bell`, bloc `bg-[#f8fafc] rounded-xl px-7 py-6 gap-[22px]` :

1. **Niveau** : trois cartes radio (Tout `BellRing`, Essentiel `Bell`, Personnalisé `SlidersHorizontal`), active `border-primary bg-blue-50`. Note : « Modifier une ligne passe en « Personnalisé ». »
2. **Pour quels services** : une case-bouton par service du compte, « {Établissement} › **{Service}** », au moins une cochée.
3. **Détail par événement** : groupes (Mes rendez-vous, Patients, Créneaux, Tâches), libellé 15px/500 et description 13px (textes de `EVENTS2` du handoff), un interrupteur `Switch` « Dans l'app » par ligne ; sous « Rappel », le délai en pastilles **La veille à 18 h / 2 h avant / 1 h avant**.

Enregistrement à chaque changement (pas de bouton), mise à jour optimiste, retour arrière sur erreur. Le pied du panneau Notifications gagne le lien « Préférences » vers cette section.

## Front : le panneau

`Notification` devient une union discriminée par `type`. Chaque ligne : pastille 34px teintée (table `TYPES` du handoff : icône, couleur, fond), texte avec les noms en gras, méta « {Type} · {quand} », lien d'action :

- « Ouvrir le RDV » / « Voir le créneau » / « Voir l'agenda » → agenda du service à la date de la séance ;
- « Ouvrir la fiche » → dossier patient ;
- « Ouvrir la tâche » → panneau Tâches (comportement de l'étape 1).

Un clic marque lue puis navigue (et ferme le panneau).

## Tests

Back (e2e, un fichier par famille) :

- chaque déclencheur d'action : les soignants de la séance reçoivent, l'auteur non, un LECTURE ou un compte désactivé non, un créneau sans soignant personne ;
- absence avec raison : rien ; inscription à un parcours : une notification par soignant et par patient ;
- créneau presque complet : une seule fois, capacité 1 : jamais ;
- planificateur : chaque type produit une fois, un second passage ne duplique rien ; rappel selon le délai du destinataire ; purge à 30 jours ;
- préférences : service décoché ou événement décoché → rien ; `PUT` refuse aucun service ou un service étranger ;
- une erreur dans l'abonné n'échoue pas la requête métier.

Front (Vitest) : un niveau réécrit la grille ; modifier une ligne passe en Personnalisé ; le dernier service ne se décoche pas ; rendu et lien de chaque type ; lien « Préférences ».

Vérification navigateur sur 4270 : déplacer un créneau, ajouter un patient, marquer une absence, puis lire les notifications d'un autre compte soignant.
