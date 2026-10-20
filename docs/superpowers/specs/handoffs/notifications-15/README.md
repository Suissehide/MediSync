# Handoff : Notifications, Tâches et préférences (tour 15 : 15a et 15b)

## Périmètre
- **15a, topbar** : deux icônes, **Tâches** (coche) et **Notifications** (cloche). Chacune ouvre son propre panneau.
- **15b, Mon compte** : section **Notifications** des préférences (niveau, services, réglage par événement et par canal, envoi des e-mails).
- Cibles : les **soignants**. Canaux : **dans l'app** et **e-mail**.

## Fichier de design
`Notifications.dc.html` est une référence HTML cliquable, pas du code de production. Seul le tour 15 (le haut de la page) est à implémenter. Les tours 14 en dessous sont des pistes abandonnées.

Les données sont fictives (soignants, patients, tâches). À recréer avec les composants existants (`Popover`, `Button`, `Input`, `Switch`, `Checkbox`, tokens Tailwind).

**Rien de cela n'existe aujourd'hui** dans le code : modèles, API et envoi des e-mails sont à créer (voir « Back » en fin de document).

---

## 15a : Topbar
- À droite de la topbar sombre (#04182b) : `flex gap-2` avec deux boutons icône de 40×40 `rounded-[10px]`, icône blanche de 20px, d'abord **Tâches** (`ListTodo`) puis **Notifications** (`Bell`).
  - Le bouton ouvert passe sur fond `#ffffff26` ; au repos il est transparent.
  - Pastille en haut à droite (`top-1 right-[3px]`) : min 18×18, `rounded-full`, bord 2px #04182b, 11px/700 blanc.
    - Tâches : **bleu** #2563eb, nombre de tâches **ouvertes où je suis tagué**.
    - Notifications : **rouge** #dc2626, nombre de **non lues**.
    - Pas de pastille à 0.
  - Ajouter `aria-label` et `title` (« Tâches », « Notifications »).
- Un seul panneau ouvert à la fois. Ouvrir l'un ferme l'autre.

### Panneau (commun aux deux)
- `Popover` de 490×740px max (`max-h-[calc(100vh-80px)]`), `rounded-xl border shadow-[0_16px_40px_rgba(4,24,43,.22)]`.
- Placé à **top 58px** sous la topbar. Son bord droit est aligné sur son icône : 14px pour la cloche, 62px pour la coche.
- **En-tête** (`px-[18px] pt-3.5 border-b`) : icône 17px + titre 17px/700 (« Notifications » ou « Tâches ») + compteur `bg-blue-50 text-primary` 12px/600. À droite, pour les notifications uniquement : bouton texte « Tout lu » (`CheckCheck`), en primary, ou #94a3b8 quand il n'y a rien à lire.
- **Barre de filtres** (`px-[18px] py-2.5 gap-[5px] border-b border-muted`, une seule ligne) :
  - pastilles de service **« Tous » / un par service de l'utilisateur** (h 30px, `rounded-full`, `shrink-0 whitespace-nowrap`). Active : `bg-[#04182b] text-white`. Inactive : `border bg-white text-text-dark`. Les services ont un compteur (non lues ou tâches ouvertes) ; « Tous » n'en a pas ;
  - à droite, un sélecteur segmenté `shrink-0` : **Non lues / Toutes** pour les notifications, **Pour moi / Toutes** pour les tâches.

### Contenu : Notifications
- Si « Tous » est sélectionné : regroupées **par service**, puis par jour (Aujourd'hui, Hier, Cette semaine). Si un service est sélectionné : par jour seulement. L'en-tête de groupe fait 12px/600 `text-text-light`.
- **Ligne** (bouton pleine largeur, `px-[18px] py-3 gap-3`, survol `bg-[#f8fafc]`, non lue `bg-[#f8fbff]`) :
  - pastille ronde de 34px teintée selon le type, avec son icône ;
  - texte 14px avec les noms en gras ;
  - dessous : « {Type} · {quand} » en 12px, puis un lien d'action (« Ouvrir le RDV », « Ouvrir la fiche », « Ouvrir la tâche ») ;
  - point bleu de 8px si non lue ;
  - un clic marque comme lue et navigue.
- Types et couleurs :

  | Type | Icône | Couleur | Fond |
  |---|---|---|---|
  | rappel RDV | `AlarmClock` | primary | blue-50 |
  | patient ajouté | `UserPlus` | — | — |
  | RDV modifié ou annulé | `CalendarX` | — | — |
  | absence | `UserX` | — | — |
  | diagnostic à faire | `ClipboardList` | — | — |
  | fin de parcours | `Flag` | — | — |
  | créneau presque complet | `Users` | — | — |
  | mention dans une tâche | `ListTodo` | #0f766e | #f0fdfa |

  Les autres couleurs sont dans `TYPES`, dans le fichier.
- État vide : icône + « Rien de neuf ».
- Pied : « Conservées 30 jours » et un lien vers les préférences (15b).

### Contenu : Tâches
- **Zone de saisie** en haut (`border-[1.5px] rounded-[10px]`, bordure primary au focus) : `input` « Nouvelle tâche… tapez @ pour mentionner » + bouton « Ajouter » (primary, grisé si vide). Entrée valide.
  - **Mention** : `@` suivi de lettres ouvre une liste sous la saisie. Elle propose les **soignants du service** de la tâche, filtrés sur le nom (nom + métier). Les choix flèches et Entrée sont à prévoir.
  - Choisir un soignant ajoute une **étiquette** au-dessus de la saisie (avatar, nom, `×` pour retirer) et retire le `@…` du texte.
  - Sans mention, la tâche est assignée à son auteur.
  - Le service de la tâche est celui du filtre, ou le service courant si le filtre est sur « Tous ».
- **Liste des tâches ouvertes** (`px-[18px] py-3 border-b border-muted`) :
  - case à cocher de 20px, `rounded-md` ;
  - texte 14px ;
  - puis une rangée d'**étiquettes** : soignants tagués (`rounded-full`, moi en `bg-blue-50 text-primary`), patient lié (outline, `User`), échéance 12px/600 avec `Calendar` (#b91c1c si en retard) ;
  - dessous : « {auteur} · {quand} » en 12px `text-text-light` ;
  - une tâche qui vient d'être créée est surlignée brièvement.
- Cocher fait passer la tâche dans **« Terminées (N) »**, un repli en bas de liste (`ChevronRight` / `ChevronDown`) : texte barré #94a3b8. Décocher la rouvre.
- Filtres : « Pour moi » = tagué **ou** auteur ; « Toutes » = toutes les tâches des services filtrés.
- État vide : « Aucune tâche ».
- Pied : une phrase d'aide 13px (voir le fichier).

### Lien entre les deux
Être **mentionné** dans une tâche crée une notification de type « mention » (« Claire Leroy vous a mentionné dans une tâche : … »). Un clic sur cette notification ouvre le panneau Tâches et surligne la tâche.

---

## 15b : Mon compte, section Notifications
Elle se place sous les infos du compte, avec le titre « Notifications » (`Bell` + 20px/600 + trait). Le bloc est `bg-[#f8fafc] rounded-xl px-7 py-6 gap-[22px]`.

1. **Niveau** : 3 cartes radio (`grid-cols-3 gap-2.5`, `p-3.5 rounded-[10px] border-[1.5px]`, active `border-primary bg-blue-50`) :
   - **Tout** (`BellRing`) : « Toutes les notifications, dans l'app et par e-mail. »
   - **Essentiel** (`Bell`) : tout dans l'app ; par e-mail, seulement les rappels, les RDV modifiés et les mentions. C'est le **défaut**.
   - **Personnalisé** (`SlidersHorizontal`).
   - Choisir Tout ou Essentiel réécrit la grille ci-dessous. Modifier une ligne de la grille fait passer le niveau en « Personnalisé ». Note sous le titre de la grille : « Modifier une ligne passe en « Personnalisé ». »
2. **Pour quels services** : cases à cocher en boutons (h 38px, `border rounded-lg`), « {Établissement} › **{Service}** ». Un par service de l'utilisateur, tous cochés par défaut. Au moins un doit rester coché.
3. **Détail par événement** (`border-t pt-[18px]`) : grille `minmax(0,1fr) 110px 110px` avec les colonnes **Dans l'app** (`Bell`) et **E-mail** (`Mail`). Les **interrupteurs** font 40×24.
   - Groupes (12px uppercase) et événements :
     - **Mes rendez-vous** : Rappel avant mes rendez-vous, Patient ajouté à un de mes rendez-vous, Rendez-vous modifié ou annulé.
     - **Patients** : Absence non justifiée, Diagnostic éducatif à réaliser (7 jours après l'inclusion), Fin de parcours : bilan à faire.
     - **Créneaux** : Créneau presque complet.
     - **Tâches** : Mention dans une tâche, Tâche qui arrive à échéance (le matin du jour d'échéance).
   - Chaque ligne affiche son libellé en 15px/500 et sa description en 13px `text-text-light`.
   - Sous « Rappel » : délai en pastilles **La veille à 18 h / 2 h avant / 1 h avant**.
4. **Envoi des e-mails** (`border-t pt-4`) : 2 cartes radio, **Dès l'événement** (« Un e-mail par notification. ») ou **Résumé quotidien à 7 h** (« Un seul e-mail par jour. Les rappels restent envoyés à l'heure. »). Au-dessus : « À {email}, sans données de santé : un lien ouvre MediSync. »

Les réglages s'enregistrent à chaque changement (pas de bouton).

---

## Back (à créer)
- `Notification { id, userId, serviceId, type, payload, readAt, createdAt }`. Purge à 30 jours.
- `Task { id, serviceId, text, authorId, patientId?, dueDate?, doneAt?, createdAt }` + `TaskAssignee { taskId, userId }`.
  - Créer une tâche ou ajouter une mention génère une notification de type `mention` pour chaque tagué autre que l'auteur.
- `NotificationPrefs { userId, level: 'all'|'essential'|'custom', services: serviceId[], matrix: { [event]: { app, mail } }, reminderDelay: 'eve'|'2h'|'1h', digest: 'now'|'daily' }`.
- Tâches planifiées :
  - rappels de RDV selon le délai choisi ;
  - diagnostic manquant à J+7 ;
  - échéance des tâches le matin ;
  - résumé quotidien à 7 h.
- **E-mails sans données de santé** : pas de nom de patient. On écrit par exemple « Un patient a été ajouté à votre séance du 22/10 », avec un lien vers MediSync.
- Droits :
  - on ne voit que les notifications et les tâches de ses services ;
  - on ne peut mentionner que les membres du service de la tâche ;
  - le rôle LECTURE n'a pas les tâches. **À confirmer.**

## Tests
- Pastilles : non lues (rouge) et tâches ouvertes taguées (bleu) ; aucune pastille à 0 ; un seul panneau ouvert.
- Filtre par service et Non lues / Toutes ; « Tout lu ».
- `@cl` propose Claire Leroy ; la choisir crée une étiquette ; la tâche est créée avec ce tagué ; la notification de mention part chez Claire et pas chez l'auteur.
- Cocher / décocher, et le repli « Terminées ».
- Préférences : un niveau réécrit la grille ; modifier une ligne passe en « Personnalisé » ; un service décoché n'envoie plus rien ; le résumé quotidien regroupe les e-mails, mais pas les rappels.

## Tokens
primary #2563eb · primary-dark #1147bb · topbar #04182b · text #04182b · text-dark #334155 · text-light #64748b · border #e2e8f0 · muted #f1f5f9 / #f8fafc · non lue #f8fbff · #cbd5e1 · #94a3b8 · pastille notif #dc2626 · tâche #0f766e / #f0fdfa · retard #b91c1c · info #eff6ff.

Icônes lucide-react : Bell, BellRing, ListTodo, CheckCheck, Mail, SlidersHorizontal, AlarmClock, UserPlus, CalendarX, UserX, ClipboardList, Flag, Users, User, Calendar, ChevronRight, ChevronDown, Check, X.

*Vérifier dans le fichier les icônes et couleurs exactes de chaque type (`TYPES`), ainsi que le texte d'aide en pied du panneau Tâches.*
