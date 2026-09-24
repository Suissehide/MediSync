# Vérification manuelle de l'étape 2 (contexte front)

Procédure à exécuter à la main contre le serveur de développement (port
4270), après avoir démarré l'application normalement et peuplé la base par le
seed à deux services décrit dans
`.superpowers/sdd/2026-09-23-multi-tenant-etape-2-contexte-front/task-16-report.md`.
Ce document ne remplace pas les portes automatisées (`back`: build, lint,
tests unitaires, tests e2e ; `front`: build, tests) — il vérifie ce qu'elles
ne peuvent pas vérifier : ce qu'un compte voit réellement à l'écran.

## Comptes du seed

| Compte | Mot de passe | Services | Ce qu'il permet de vérifier |
|---|---|---|---|
| `admin@qwetle.fr` | `Admin123!` | Cardiologie **et** Pneumologie (COORDINATEUR des deux) | le sélecteur de service, le changement de service, l'accès à l'administration |
| `sabrina.bernadet@cepta.fr` | `User123!` | Cardiologie seul (INTERVENANT) | l'absence de sélecteur pour un compte à un seul service |
| `secretariat.cardiologie@cepta.fr` | `User123!` | Cardiologie seul (SECRETARIAT) | non utilisé ci-dessous (sert au filtrage des champs cliniques, hors périmètre de cette étape) |

## Un piège à éviter : la liste des patients ne prouve rien ici

**La liste des patients et la fiche patient ne doivent jamais servir à
constater un défaut de cloisonnement entre services, avec ce seed.** Le
patient est un modèle d'**établissement** (décision assumée de l'étape 1 :
dossier à l'établissement, sous-dossiers par service) : les 16 patients du
seed sont **rigoureusement identiques**, nom pour nom, dans Cardiologie et
dans Pneumologie. Ce sont les sous-dossiers de l'étape 3 qui rendront un
patient distinct par service. Un test qui ouvrirait la liste des patients
après un changement de service et n'y verrait « aucune ligne du mauvais
service » ne démontrerait donc rien : il n'y a tout simplement rien à y voir,
qu'un défaut de cloisonnement existe ou non sur cet écran.

La liste ci-dessous, écran par écran, vient de la revue de
`task-16-report.md` (vérifiée exacte) et dit où regarder à la place —
reprise telle quelle :

> **Montrent une différence, avec les données actuelles :**
>
> - **Panneau « Mes tâches » (`Todo`, ouvert depuis la barre de navigation —
>   `front/src/components/navbar.tsx`, rendu dès qu'un `serviceId` est actif —
>   via `TodoSheet`/`todoItem.tsx`)** : c'est le seul écran dont le **contenu
>   textuel** diffère de façon flagrante entre les deux services — 2 tâches
>   par service, l'une citant nommément un patient propre au service
>   (« Vérifier le dossier médical de **Claire** » en Cardiologie, « … de
>   **Nadia** » en Pneumologie). `Todo` est un modèle de service (`serviceId`
>   dans le schéma), l'appel passe par `tenantApiUrl()` (scopé au service
>   courant) : une tâche du mauvais service apparaîtrait ici sans ambiguïté.
> - **Écran Membres de l'établissement
>   (`front/src/routes/.../admin/members.tsx`)** : pas un écran « de
>   service », mais montre nommément quel compte appartient à quel(s)
>   service(s) avec quel rôle — utile pour vérifier la **configuration des
>   comptes** eux-mêmes (admin coordinateur des deux, Sabrina et le
>   secrétariat limités à Cardiologie), pas le cloisonnement des données
>   cliniques.
> - **Sélecteur de service** (dépend du compte connecté, pas du contenu) :
>   l'admin voit un choix entre Cardiologie et Pneumologie ; Sabrina et le
>   secrétariat n'en voient aucun puisqu'ils n'appartiennent qu'à un service.
>   Structurel, pas basé sur une donnée métier.
>
> **Ne montrent aucune différence, avec les données actuelles :**
>
> - **Fiche patient et liste des patients (`patient/index.tsx`,
>   `patient/$patientID.tsx`)** — les 16 patients sont rigoureusement
>   identiques quel que soit le service affiché (modèle d'établissement). **Un
>   défaut de cloisonnement sur le patient ne peut pas être détecté ici avec
>   ces données.**
> - **Planning / agenda (`agenda.tsx`, `dashboard.tsx`,
>   `_settings/planning.tsx`)** — reposent sur les créneaux réellement
>   programmés (`Slot`/`Appointment`) ; le seed n'en crée aucun (seuls les
>   gabarits `PathwayTemplate`/`SlotTemplate` sont peuplés). Planning vide
>   dans les deux services : aucune différence visible.
> - **Suivi de parcours (`suivi.tsx`)** — s'appuie sur les inscriptions
>   réelles aux rendez-vous (`AppointmentPatient`), non seedées : vide dans
>   les deux services.
> - **Thématiques (`_settings/thematic.tsx`) et gabarits de parcours
>   (`_settings/planning.tsx`, catalogue)** — même catalogue de noms réutilisé
>   tel quel pour les deux services (64 thématiques et 25 gabarits
>   identiques, nom pour nom, dans Cardiologie et Pneumologie) : une fuite
>   entre services y serait invisible, le contenu correct et le contenu fuité
>   se ressemblant trait pour trait.
> - **Soignants (`_settings/soignant.tsx`) et locaux
>   (`_settings/location.tsx`)** — ressources d'établissement, volontairement
>   partagées entre les deux services de cet établissement (peuplées une
>   seule fois) : identiques dans les deux services, mais ce n'est pas un
>   défaut, c'est le comportement voulu — hors périmètre du cloisonnement de
>   service.
> - **Modèles de diagnostic éducatif (`_settings/diagnostic-template.tsx`) et
>   journal d'activité (`_settings/activity-log.tsx`)** — aucune donnée
>   seedée : vides dans les deux services, rien à comparer.

## Procédure

1. **Compte à un seul service.** Se connecter avec `sabrina.bernadet@cepta.fr`.
   Observer : aucun sélecteur de service dans la barre de navigation ;
   l'application se comporte comme avant l'étape 2 — aucun choix à faire,
   navigation directe sur Cardiologie, rien à l'écran ne trahit l'existence
   d'un second service.
2. **Compte à deux services.** Se connecter avec `admin@qwetle.fr`. Observer :
   le sélecteur de service apparaît dans la barre de navigation, proposant
   Cardiologie et Pneumologie. Choisir l'autre service dans le sélecteur
   recharge l'écran affiché sur les données de l'autre service (pas de
   rechargement de page complet — le changement passe par le routeur).
3. **Après le changement de service (suite de l'étape 2), ouvrir le panneau
   « Mes tâches »** (icône dédiée dans la barre de navigation). Observer :
   les deux tâches affichées sont bien celles du service nouvellement
   sélectionné, l'une citant nommément un patient propre à ce service
   (« … Claire » en Cardiologie, « … Nadia » en Pneumologie) — **aucune tâche
   de l'ancien service ne doit apparaître, y compris furtivement pendant le
   chargement.** C'est le point de contrôle qui remplace « ouvrir la liste
   des patients » : voir l'encart ci-dessus sur pourquoi la liste des
   patients ne prouve rien avec ce seed.
4. **Filtres de soignants persistés par service.** Toujours avec
   `admin@qwetle.fr`, sur le tableau de bord (Dashboard) en Cardiologie,
   cocher un ou plusieurs soignants dans le filtre de la barre latérale.
   Changer de service vers Pneumologie via le sélecteur : le filtre doit
   apparaître **décoché** (aucun soignant coché n'a été reporté sur
   Pneumologie). Revenir sur Cardiologie : les soignants cochés précédemment
   doivent être **retrouvés tels quels**. Ce point vérifie l'indexation par
   service des stores persistés (`scoped-storage.ts`), pas une donnée du
   seed. **Il ne vérifie que ces quatre stores-là, et c'est toute sa
   portée** : d'autres réglages persistés vivent hors de `scoped-storage.ts`,
   sous des clés globales — les filtres et la visibilité des colonnes des
   tableaux (`filters/<id>`, `column-visibility/<id>`) et la journée
   sélectionnée de l'agenda. Ceux-là traversent bel et bien un changement de
   service : report assumé, voir D11. Ne pas lire ce point comme « aucun
   réglage persisté ne subsiste ».
5. **Anciennes URL.** Avec un compte connecté, naviguer directement vers
   `/agenda?date=2026-01-01` (ou toute autre ancienne URL top-niveau du menu
   — `/settings/planning`, `/settings/soignant`, etc., avec un paramètre de
   recherche). Observer : redirection automatique vers l'équivalent sous
   `/e/:establishmentId/s/:serviceId/...` (le service par défaut — le dernier
   visité s'il est encore valide, sinon le premier de l'arbre des
   appartenances), et le paramètre de recherche (`?date=2026-01-01`) est
   **conservé** dans l'URL d'arrivée.
6. **URL d'un service auquel on n'appartient pas.** Connecté avec
   `sabrina.bernadet@cepta.fr` (Cardiologie seul), remplacer dans la barre
   d'adresse l'identifiant de service par celui de Pneumologie (le récupérer
   en se connectant temporairement avec `admin@qwetle.fr` et en regardant
   l'URL une fois sur Pneumologie), en conservant le même identifiant
   d'établissement, puis naviguer directement sur cette URL. Observer :
   redirection vers la page de choix de contexte (`/choose-context`), **pas**
   un écran d'erreur ni un 404 brut. Vérifier aussi qu'un lien vers un
   patient ou une ressource simplement absente (identifiant inventé, ou
   patient supprimé) dans un service auquel on appartient **ne** redirige
   **pas** vers `/choose-context` : un 404 ordinaire doit rester un 404
   ordinaire.
7. **Administrateur sans passer par un service.** Avec `admin@qwetle.fr`,
   depuis l'index de l'application (`/`) ou en naviguant directement vers
   `/e/:establishmentId/admin/members`, observer que l'écran Membres est
   atteint sans jamais être passé par un layout de service. Point
   complémentaire recommandé, non couvrable avec les comptes actuels du seed
   (tous ont au moins un service) : un administrateur d'établissement
   **sans aucune** affectation de service doit, lui aussi, atterrir sur cet
   écran depuis l'index et depuis `/choose-context` — pas sur l'écran
   d'attente (`/pending`). Si un tel compte est créé pour un test ponctuel
   (hors seed standard), c'est le scénario exact qui a fait l'objet d'une
   correction pendant cette étape (voir `decisions-etape-2.md`, décision
   D15) : à revérifier si l'un des mécanismes de résolution de contexte est
   retouché.
8. **Déconnexion puis reconnexion.** Avec `admin@qwetle.fr`, basculer sur
   Pneumologie, puis se déconnecter et se reconnecter avec le même compte.
   Observer : l'application propose directement Pneumologie (dernier service
   visité), sans repasser par le premier service ni par la page de choix.
