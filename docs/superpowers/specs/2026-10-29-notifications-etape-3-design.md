# Design : Notifications, étape 3 (e-mails)

Handoff : `docs/superpowers/specs/handoffs/notifications-15/` (15b : colonne « E-mail », bloc « Envoi des e-mails »). Étapes précédentes : `2026-10-19-notifications-etape-1-design.md`, `2026-10-20-notifications-etape-2-design.md` (fusionnées).

## Décisions prises

- **Contenu sans données de santé** : un e-mail ne contient que le type d'événement, la date, l'heure et la salle d'une séance, le nom d'un collègue auteur d'une mention, et un lien vers MediSync. **Jamais** de nom de patient, de thématique de séance, ni de texte de tâche (texte libre qui peut citer un patient).
- **Résumé quotidien** : à partir de 7 h (Europe/Paris), un e-mail par personne avec les notifications « à envoyer par e-mail » créées avant 7 h ce jour-là et **pas encore lues** dans l'app. Rien à envoyer : pas d'e-mail. Les rappels partent toujours à l'heure, même en mode résumé.
- **Approche** : une file d'envoi en base. Chaque notification porte un état d'e-mail ; une tâche planifiée, chaque minute, envoie ce qui est dû. Un seul point d'envoi quel que soit l'auteur de la notification (dispatcher, planificateur, mentions), rien de perdu au redémarrage.
- **Niveaux** (15b) : **Tout** = tout dans l'app et par e-mail ; **Essentiel** = tout dans l'app, par e-mail seulement les rappels, les RDV modifiés ou annulés et les mentions. Modifier une ligne passe en Personnalisé.
- **Aucun e-mail par défaut** (demande de l'utilisateur) : un compte qui n'a jamais réglé ses e-mails n'en reçoit aucun. Le niveau affiché par défaut est donc **Personnalisé** (tout dans l'app, aucun e-mail), puisque Essentiel promet des e-mails.

## Données

- `enum NotificationMailState { PENDING SENT SKIPPED }` ; `Notification.mailState NotificationMailState @default(PENDING)`. La migration passe toutes les notifications existantes à `SKIPPED` (l'historique ne part jamais par e-mail).
- `NotificationPrefs` gagne `mail: Record<NotificationPrefKey, boolean>` et `digest: 'now' | 'daily'`. Défaut : `level: 'custom'`, `app` tout à `true`, `mail` tout à `false`, `digest: 'now'`. `normalizePrefs` : une préférence enregistrée sans `mail` (toutes celles de l'étape 2) reçoit `mail` tout à `false` et passe en `level: 'custom'`. Choisir Tout met `mail` entier à `true` ; Essentiel met `mail` à `true` pour `reminder`, `moved`, `mention` et `false` ailleurs ; `app` reste tout à `true` dans les deux cas.
- Règle d'envoi : `mailAllows(prefs, type, serviceId)` = `prefs.mail[clé du type]` et le service passe le filtre `services` (même règle que `allows`, liste périmée comprise).

## Tâche d'envoi

`scheduleNotificationMails()` dans `application/starter.ts` : `setInterval` d'une minute, `unref()`, sous `tenantContext.runAsSystem`, déclarée dans `runAsSystem-unicite.test.ts`. `NotificationMailer.runOnce(now)` :

1. Lit les notifications `PENDING` des 30 derniers jours (au-delà : `SKIPPED`), avec destinataire (`User.email`, préférences normalisées, `deactivatedAt`).
2. Pour chacune :
   - destinataire désactivé, ou `mailAllows` faux → `SKIPPED` ;
   - `digest: 'now'`, ou type `REMINDER` → un e-mail tout de suite, puis `SENT` ;
   - `digest: 'daily'` → attend le résumé.
3. Résumé : si l'heure de Paris est ≥ 7:00, pour chaque destinataire en `daily`, les notifications `PENDING` créées avant 7:00 aujourd'hui : celles déjà lues → `SKIPPED` ; s'il en reste, un seul e-mail récapitulatif, puis `SENT`. Les notifications créées après 7:00 attendent le lendemain ; un serveur arrêté à 7 h rattrape au redémarrage.
4. Envoi par le `Mailer` existant (`send(kind, mail)`, en tâche de fond, trois reprises) ; `kind` = `notification` ou `notification-digest`, jamais de contenu au journal. L'état passe à `SENT` dès la mise en file.

Chaque passage est idempotent : un état `SENT` ou `SKIPPED` n'est jamais repris. Une erreur sur un destinataire n'arrête pas les autres (journalisée par classe).

## Gabarits (`infra/mail/templates.ts`, mise en page commune `layout`)

Dates « jeu. 22/10 à 09:00 » en Europe/Paris, à partir des heures stockées (heure de Paris écrite en UTC, `sessionInstant`). Salle seulement si connue.

| Type | Objet | Phrase |
|---|---|---|
| `REMINDER` | MediSync : rappel de séance | Rappel : vous avez une séance le {date}{, salle}. |
| `PATIENT_ADDED` | MediSync : patient ajouté | Un patient a été ajouté à votre séance du {date}. / Un patient a été ajouté à {n} de vos séances, la première le {date}. |
| `APPOINTMENT_MOVED` | MediSync : séance modifiée | Votre séance du {avant} est déplacée au {après}. / Votre séance du {date} change de salle : {salle}. |
| `APPOINTMENT_CANCELLED` | MediSync : séance annulée | Votre séance du {date} est annulée. |
| `ABSENT` | MediSync : absence | Un patient était absent à votre séance du {date}, sans justification. |
| `SLOT_ALMOST_FULL` | MediSync : créneau presque complet | Il ne reste qu'une place sur votre séance du {date}. |
| `DIAGNOSTIC_DUE` | MediSync : diagnostic à réaliser | Un diagnostic éducatif est à réaliser pour un patient inclus le {date d'entrée}. |
| `PATHWAY_END` | MediSync : fin de parcours | Un patient a terminé son parcours : bilan de fin à réaliser. |
| `TASK_DUE` | MediSync : tâche à échéance | Une de vos tâches arrive à échéance aujourd'hui. |
| `MENTION` | MediSync : mention dans une tâche | {Prénom Nom} vous a mentionné dans une tâche. |

Bouton « Ouvrir MediSync » vers `FRONT_URL`. Le résumé : objet « MediSync : vos notifications du {jour} », une ligne par notification (même phrase), même bouton. Pied : « Vous recevez cet e-mail selon vos préférences de notification. »

## Écran (15b complet)

Section « Notifications » de Mon compte :

- grille à deux colonnes d'interrupteurs, **Dans l'app** (`Bell`) et **E-mail** (`Mail`) ;
- descriptions des niveaux du handoff : Tout « Toutes les notifications, dans l'app et par e-mail. » ; Essentiel « Tout dans l'app ; par e-mail, seulement les rappels, les RDV modifiés et les mentions. » ;
- bloc **Envoi des e-mails** (`border-t pt-4`) : deux cartes radio, **Dès l'événement** (« Un e-mail par notification. ») et **Résumé quotidien à 7 h** (« Un seul e-mail par jour. Les rappels restent envoyés à l'heure. ») ; au-dessus : « À {email}, sans données de santé : un lien ouvre MediSync. ».

## Tests

Back (e2e, faux transport du `Mailer` déjà utilisé par les tests d'invitation) :

- `digest: 'now'` : un e-mail par notification autorisée, état `SENT` ; préférence `mail` coupée ou service non suivi → `SKIPPED`, aucun e-mail ;
- défaut (aucune préférence) : aucun e-mail ; niveau Essentiel choisi : rappel et mention envoyés, absence non ;
- `daily` : rien avant 7:00 ; à 7:00 un seul e-mail groupé ; une notification lue → exclue et `SKIPPED` ; un rappel part tout de suite même en `daily` ;
- second passage : aucun e-mail rejoué ; notifications existantes à la migration : jamais envoyées ;
- **aucun e-mail ne contient un nom de patient, une thématique ni un texte de tâche** (vérifié sur le contenu texte et HTML de chaque type, avec des données qui en portent) ;
- compte désactivé : rien.

Front (Vitest) : colonne E-mail ; défaut sans e-mail en Personnalisé ; Tout coche tous les e-mails, Essentiel coche rappel, modifié et mention ; choix d'envoi enregistré ; adresse affichée.
