# Habilitations MediSync multi-établissement

Implémenté à l'étape 1 du chantier multi-tenant : ce document décrit le système de rôles et de
permissions réellement en place, pas une cible à venir.

Document de référence de la grille des rôles et des permissions. Il formalise
qui peut faire quoi dans l'application, par niveau de rattachement. C'est le
document à présenter lors d'un audit (RGPD article 32, référentiels PGSSI-S
sur les habilitations et l'imputabilité).

Statut : socle implémenté (établissement → services → modèles de parcours), **plus le rôle
super-admin, l'accès d'intervention temporaire et le lien de première connexion, implémentés à
l'étape 4a** (voir `decisions-etape-4a.md`). Une réserve, à ne pas lire comme un détail :
**il n'existe aucune traçabilité des actions du super-admin à l'échelle de la plateforme** —
c'est le sujet de l'étape 4b. (La réserve précédemment notée ici sur l'écran de création
d'établissement était vraie avant la tâche 14b, qui l'a comblée — corrigé à la revue finale de
l'étape 4a, sur vérification de l'écran dans le code : `createEstablishmentForm.tsx`.)
Voir la spec d'architecture dans `docs/superpowers/specs/`.

## Niveaux de rattachement

Un utilisateur est une identité globale (e-mail unique sur la plateforme). Il
possède zéro, une ou plusieurs appartenances à des établissements, et sous
chacune, zéro, une ou plusieurs appartenances à des services. Chaque
appartenance porte un rôle.

| Niveau | Entité | Rôles possibles |
| --- | --- | --- |
| Plateforme | `User.isSuperAdmin` | Super-admin |
| Établissement | `EstablishmentMembership.role` | `ADMIN`, `MEMBER` |
| Service | `ServiceMembership.role` | `COORDINATEUR`, `INTERVENANT`, `SECRETARIAT`, `LECTURE` |

## Rôles

| Niveau | Rôle | Ce qu'il peut faire |
| --- | --- | --- |
| Plateforme | **Super-admin** | Créer les établissements, nommer leur premier administrateur, consulter la santé globale de la plateforme, rechercher un compte par adresse et réémettre son lien de connexion, s'accorder un accès d'intervention temporaire. **Aucun accès au contenu des dossiers patients** — voir la nuance sur le nombre de dossiers et sur l'octroi, plus bas. |
| Établissement | **Chef d'établissement** (`ADMIN`, libellé « Administrateur » jusqu'au 2026-10-01) | Renommer l'établissement, créer et désactiver les services, rattacher les comptes à l'établissement, les affecter aux services avec un rôle, désactiver les comptes, lire le journal d'activité et le journal des accès aux dossiers patients. **Coordinateur implicite sur tous les services actifs** de l'établissement, affecté ou non — donc accès clinique à tous les dossiers suivis dans l'établissement (depuis le 2026-10-01, décision de Léo). Porté par `effectiveMemberships` (`domain/accessGrant.domain.ts`), comme l'octroi super-admin. |
| Établissement | **Membre** (`MEMBER`) | Aucun droit propre : simple rattachement qui permet d'être affecté à des services. |
| Service | **Coordinateur** (`COORDINATEUR`) | Tout ce que fait l'ancien rôle `ADMIN` dans le périmètre du service : modèles de parcours, planning, thématiques, semaines interdites, cycle de planification, modèles de diagnostic, dossiers patients et contenu clinique. **Plus l'équipe de son service depuis le 2026-10-05 (MDS-17)** : inviter, changer un rôle de service, retirer du service — jamais le rattachement d'établissement. |
| Service | **Intervenant** (`INTERVENANT`) | L'équivalent de l'ancien rôle `USER` : agenda, présences, transmissions, dossier patient et diagnostics éducatifs, tâches personnelles. |
| Service | **Secrétariat** (`SECRETARIAT`) | Identité et contact des patients, sous-dossier administratif, prise de rendez-vous, présences, export PDF du programme. Pas d'accès au contenu clinique (diagnostics éducatifs, transmissions, notes). |
| Service | **Lecture seule** (`LECTURE`) | Direction ou cadre : consultation du suivi, du planning et des listes, sans modification ni accès au contenu clinique. |

Un utilisateur peut cumuler des rôles différents dans plusieurs services d'un
même établissement, et appartenir à plusieurs établissements.

## Permissions par rôle de service

Le back n'interroge jamais un rôle directement : chaque route exige une
permission (`requirePermission('patient:write')`), et une matrice statique
associe les permissions aux rôles. C'est cette matrice qui fait foi.

| Permission | Périmètre | Coordinateur | Intervenant | Secrétariat | Lecture |
| --- | --- | :-: | :-: | :-: | :-: |
| `planning:read` | Lecture des modèles de parcours et de créneaux, parcours, créneaux, cycle de planification, semaines interdites | ✔ | ✔ | ✔ | ✔ |
| `planning:write` | Modèles de parcours et de créneaux, parcours, créneaux, cycle de planification, semaines interdites | ✔ | | | |
| `referentials:read` | Lecture des thématiques, modèles de diagnostic, soignants et salles du service | ✔ | ✔ | ✔ | ✔ |
| `referentials:write` | Thématiques, modèles de diagnostic éducatif ; soignants et salles du service, et le rattachement d'un membre du service à un soignant (depuis le 2026-09-29, `decisions-navigation.md`) | ✔ | | | |
| `patient:read` | Identité, contact, contexte social, sous-dossier hors champs cliniques, planning individuel, suivi | ✔ | ✔ | ✔ | ✔ |
| `patient:write` | Création et modification de l'identité, du contact, du social et du sous-dossier hors champs cliniques | ✔ | ✔ | ✔ | |
| `patient:delete` | Suppression d'un dossier patient | ✔ | | | |
| `clinical:read` | Diagnostics éducatifs, transmissions, notes et détails du sous-dossier | ✔ | ✔ | | |
| `clinical:write` | Idem en écriture | ✔ | ✔ | | |
| `appointment:write` | Rendez-vous, ajout et retrait de patients d'un créneau, présences, motif de refus, accompagnant | ✔ | ✔ | ✔ | |
| `pdf:export` | Export PDF du programme remis au patient | ✔ | ✔ | ✔ | |
| `todo:own` | Ses propres tâches | ✔ | ✔ | ✔ | ✔ |
| `members:read` | Voir les membres du service et leur rôle | ✔ | ✔ | ✔ | ✔ |
| `consultations:read` | Lire le journal des consultations (`PatientAccessLog`) du service courant : qui a ouvert quel dossier, quand — jamais un contenu clinique | ✔ | | | |
| `service-members:manage` | Gérer l'équipe du **seul service courant** : inviter (y compris en créant le compte et son lien de première connexion), changer le rôle de service, retirer du service — depuis le 2026-10-05, MDS-17 | ✔ | | | |
| `service-journal:read` | Lire le journal d'activité du **seul service courant** (écran « Journal d'activité » du menu Administration du service), sans les opérations d'administration de l'établissement — depuis le 2026-10-05 | ✔ | | | |

Règles associées :

- Les champs cliniques sont filtrés **par le back, dans les deux sens**, pas
  seulement masqués côté front. En sortie, un hook de sérialisation les
  retire de toute réponse quand l'appelant n'a pas `clinical:read` ; en
  entrée, un hook de validation les retire du corps de la requête quand il
  n'a pas `clinical:write`, de sorte qu'un rôle qui ne peut pas les lire ne
  puisse pas non plus les écraser (la clé retirée laisse la colonne
  inchangée, elle ne la vide pas). Les deux hooks sont posés sur les plugins
  de routes, pas sur chaque route : une route nouvelle est couverte par
  défaut. Concrètement :
  `notes`, `details` et `medicalDiagnosis` sur le patient, `transmissionNotes`
  sur un patient inscrit à un rendez-vous — y compris quand le patient est
  embarqué par une autre réponse (rendez-vous, créneau, parcours) et dans
  l'export Excel de la liste des patients. `etpDecision`, `goal`,
  `programType` et `stopReason` ne sont **pas** filtrés : ce sont des données
  administratives du programme, que le secrétariat a de bonnes raisons de
  voir.
- La suppression d'un dossier patient (`patient:delete`) est réservée au
  coordinateur : ni le secrétariat ni l'intervenant ne peuvent supprimer un
  dossier, même s'ils peuvent le modifier.
- **`service-members:manage` et `members:manage` sont deux échelles, pas un
  doublon** (MDS-17, 2026-10-05). La première ouvre la gestion de l'équipe **du
  service courant** au coordinateur : inviter une adresse (le service vient du
  tenant résolu, jamais de la requête), changer un rôle **de service**, retirer
  **l'affectation**. La seconde reste au chef d'établissement et porte ce que la
  première ne touche jamais : le rattachement d'établissement, le rôle
  d'établissement, la désactivation d'un compte, la réémission d'un lien. Un
  coordinateur ne rattache donc **qu'en `MEMBER`**, et retirer quelqu'un de son
  service ne retire ni son compte, ni son rattachement, ni ses autres services.
  - **Le coordinateur peut nommer un autre coordinateur de son service** : les
    quatre rôles de service lui sont ouverts. Décision de Léo, MDS-17.
  - **Inviter émet un lien de première connexion, qui réinitialise le mot de
    passe d'un `User` GLOBAL** : les refus de `assertIssuableToken` (compte
    super-admin, compte rattaché à un autre établissement) s'appliquent donc
    **tels quels** depuis cette route, par appel du même cœur partagé
    (`MembershipDomain.createAccountCore`) — jamais par une copie. La réponse ne
    porte que `accessLink`, `null` quand le compte était déjà rattaché ici :
    rendre le nom stocké ou l'identifiant du compte en ferait un oracle
    d'existence, exactement comme sur `POST /members/account`.
  - **Un coordinateur ne se rétrograde pas et ne se retire pas lui-même**, par
    symétrie avec `assertNotSelf` à l'échelle de l'établissement.
  - **Limite ouverte, assumée : aucune garde « dernier coordinateur du
    service ».** Le chef d'établissement étant coordinateur implicite de tous les
    services actifs, un service sans coordinateur reste administrable — à
    rouvrir si ce coordinateur implicite disparaît.
- **`consultations:read` et `access-log:read` sont deux permissions distinctes,
  et ce n'est pas un doublon.** La première ouvre la lecture du journal des
  consultations **du service courant** (coordinateur) ; la seconde, celle de
  **tous les services de l'établissement** (administrateur d'établissement).
  Les unifier est impossible en l'état : `hasPermission` choisit sa branche —
  service ou établissement — sur la seule appartenance de la chaîne à l'un des
  deux ensembles, **avant** de regarder les rôles, donc une chaîne présente dans
  les deux prendrait toujours la branche service et la route d'administration
  échouerait toujours. Une sémantique « ou » les unifierait, mais accorderait la
  permission de **service** à un administrateur membre d'un service en simple
  lecture : écarté. La permission de service s'est d'abord appelée
  `accessLog:read` et a été **renommée** — deux noms à un trait d'union et une
  casse près, dans une matrice dupliquée entre deux dépôts, est un piège de
  lecture permanent.
- La purge du journal d'activité relève d'un droit d'écriture
  (`activity-log:write`) distinct de sa lecture : supprimer des entrées
  d'audit ne peut pas passer pour une consultation.
- La mise à jour d'un patient dans un créneau (`AppointmentPatient`) sépare
  les champs de présence (`appointment:write`) des transmissions
  (`clinical:write`).
- **La traçabilité des lectures existe depuis l'étape 4b** (cette puce annonçait
  auparavant un modèle « qui n'existe pas encore » ; elle est réécrite ici, et
  **son périmètre annoncé était inexact**). Écrivent une ligne dans
  `PatientAccessLog`, avec l'utilisateur, l'établissement, le service, le
  patient et l'origine de l'accès : l'ouverture d'une fiche patient
  (`dossier.ouvert`), l'ouverture du sous-dossier de service et d'un diagnostic
  éducatif (`sousDossier.ouvert`), la consultation des problèmes d'inscription
  (`echecsInscription.consultes`), et **l'export Excel de la liste des
  patients**, tracé en **une seule ligne** avec son nombre de dossiers et ses
  critères (`export`). L'export **PDF** du programme (`pdf:export`) n'est **pas**
  tracé : la puce d'origine l'annonçait, ce n'est pas ce qui a été construit — et
  il ne pouvait pas l'être par ce mécanisme, `pdf:export` ne gardant **aucune
  route du back** (le document est fabriqué dans le navigateur). Ce qui est
  tracé, c'est la lecture du dossier qui l'alimente.
  Ne sont pas tracées non plus, délibérément, la liste des patients et la
  recherche — une ligne par affichage d'écran noierait les ouvertures de
  dossier. Une route GET dont l'URL désigne un dossier est journalisée **par
  défaut** : sinon elle doit être déclarée exemptée avec sa raison, ou le
  serveur refuse de démarrer. Détail, limites et coûts :
  `docs/multi-tenant/decisions-etape-4b.md`.
- Un compte se désactive (`User.deactivatedAt`), il ne se supprime pas, pour
  conserver l'imputabilité des actions passées dans les journaux.
- `User.deactivatedAt` porte sur l'**identité globale**, partagée entre tous
  les établissements auxquels le compte appartient. Un administrateur
  d'établissement ne peut donc désactiver ni réactiver un compte qui possède
  des appartenances dans plus d'un établissement : il agirait hors de son
  périmètre. Le cas est refusé explicitement, en attendant une désactivation
  par appartenance. **Le même raisonnement vaut pour un compte super-admin, et
  le refus y porte dans les deux sens** : un simple `ADMIN` d'établissement
  pouvait, avant l'étape 4a, couper l'accès du super-admin à toute la
  plateforme ; et un super-admin désactivé l'a été au niveau de la plateforme,
  un administrateur d'établissement n'a pas à le réactiver. **La seule sortie de
  secours d'un super-admin désactivé est le script d'amorçage**
  (`npm run bootstrap:super-admin`), qui réactive au passage l'identité qu'il
  promeut, et l'annonce.
- Toute opération de gestion des membres (rattachement, changement de rôle,
  affectation de service, désactivation, réactivation, retrait) écrit une
  ligne dans le journal d'activité, avec l'utilisateur qui l'a effectuée :
  c'est la surface qui accorde les droits, elle doit être imputable. La surface
  **de service** (MDS-17) écrit ses propres actions — `serviceMember.added`,
  `serviceMember.accountCreated`, `serviceMember.updated`,
  `serviceMember.removed` — et non les `member.*` : l'autorité et le périmètre
  diffèrent, les confondre effacerait la distinction que le journal doit porter.
  Écrites sous un contexte de service, elles sont donc visibles de l'écran
  d'activité **du service**, là où les `member.*` ne le sont pas.

## Permissions d'établissement et de plateforme

| Permission | Administrateur d'établissement | Super-admin |
| --- | :-: | :-: |
| `services:manage` (créer, renommer, désactiver un service) | ✔ | |
| `members:manage` (rattacher un compte, affecter aux services, changer les rôles, désactiver) | ✔ | |
| `activity-log:read` (journal d'activité de l'établissement, **tous services**, filtrable par service — écran « Journal d'activité » de l'administration depuis la navigation par échelle, `decisions-navigation.md`) | ✔ | |
| `activity-log:write` (purge des entrées du journal d'activité, sur le même périmètre que la lecture) | ✔ | |
| `access-log:read` (journal des accès aux dossiers patients, **tous services** de l'établissement — depuis l'étape 4b ; **aucun écran ne l'appelle encore**, voir `deploiement-etape-4b.md` §10) | ✔ | |
| `establishment:rename` (renommer **son** établissement — l'id vient du tenant résolu, jamais de la requête ; `PATCH /e/:establishmentId/admin`) | ✔ | |
| `establishments:manage` (créer un établissement, nommer son premier administrateur, rechercher un compte, réémettre un lien, s'accorder un octroi) | | ✔ |

Le super-admin n'a, **en propre**, aucune permission de service ni
d'établissement. `establishments:manage` n'est accordée par **aucun rôle** :
`hasPermission` rend toujours `false` pour elle, et ce qui ouvre réellement les
routes du préfixe `/super-admin`, c'est le drapeau `User.isSuperAdmin`, vérifié
par un crochet dédié qui répond **404 et non 403** à qui ne l'a pas — pour ne
pas révéler l'existence d'une zone qu'on n'a pas le droit de voir. La
déclaration de permission sur ces routes sert le garde-fou de démarrage (une
route sans permission déclarée fait échouer le démarrage), pas le contrôle
d'accès.

Deux nuances à ne pas taire :

- **Le nombre de dossiers d'un établissement est visible du super-admin**, et
  c'est une donnée de santé agrégée : il dit combien de personnes y sont
  suivies. Divulgation par la cardinalité seule, **assumée et bornée** — un
  nombre, jamais une identité, jamais un contenu (`decisions-etape-4a.md`, D3).
- **Sous octroi temporaire, le super-admin détient les permissions d'un
  administrateur d'établissement et d'un coordinateur de service**, donc l'accès
  clinique, le temps de l'octroi. C'est le but du mécanisme ; ce qui le borne,
  c'est la durée, le motif obligatoire et la visibilité (ci-dessous).

## Le lien de première connexion

Un compte créé par un administrateur ou par le super-admin ne reçoit **pas** de
mot de passe provisoire : il reçoit un **lien de première connexion à usage
unique**, valable sept jours, transmis à la main (il n'existe aucune
infrastructure de courriel). La base ne conserve que l'**empreinte** du jeton,
jamais le jeton ; l'usage unique est tenu par la base elle-même.

**L'invariant qui gouverne toute route rendant un tel lien : il réinitialise le
mot de passe du `User`, qui est GLOBAL.** Un lien ne donne pas accès « à cet
établissement » : il donne accès **au compte**, donc à tout ce que ce compte
atteint. Il en découle, au niveau établissement :

- un compte **rattaché à un autre établissement** ne peut recevoir de lien d'ici
  (l'administrateur de A prendrait le contrôle de son accès à B) ;
- un compte **super-admin** ne peut être ni rattaché, ni créé, ni recevoir de
  lien, ni être désactivé ou réactivé depuis l'administration d'un
  établissement. Les deux premiers refus emploient un message **opaque**,
  identique à celui d'une adresse inconnue, pour que la route ne devienne pas un
  détecteur de super-admins ; les deux derniers un message explicite, la cible
  étant déjà visible dans la liste des membres. **Conséquence assumée : un
  super-admin qui exerce aussi en service a besoin d'un second compte,
  ordinaire.** En revanche, le **retirer** de la liste des membres reste permis :
  cela ne touche pas le compte global ;
- la soupape, sans laquelle ces refus seraient une impasse : la réémission par le
  **super-admin**, seule autorité qui traverse légitimement les établissements.
  Il n'existe ni route de mot de passe oublié, ni changement de mot de passe sans
  l'ancien. **Cette réémission n'écrit aucune ligne de journal et n'émet aucun
  événement** — c'est le manque le plus important laissé ouvert par l'étape 4a.

## L'accès d'intervention temporaire (octroi)

Le super-admin peut s'accorder l'accès à un établissement, **pour lui-même
uniquement** (l'identité n'est jamais soumise dans la requête), en le
justifiant. Pendant l'octroi il est un membre ordinaire de cet établissement :
rôle **administrateur** d'établissement et **coordinateur** sur chacun de ses
services actifs. **Quatre heures par défaut, vingt-quatre au maximum** ; une
durée supérieure est refusée, jamais silencieusement ramenée. Le motif est
obligatoire, chaîne vide refusée.

- **L'octroi ne contourne rien.** Il ne donne pas un contexte privilégié : il
  confère des **appartenances**, et les requêtes empruntent le chemin de tenant
  ordinaire, avec le même cloisonnement et les mêmes filtres de champs cliniques
  que pour un membre réel. Le journal d'activité enregistre l'action sous
  l'**identité réelle** de son auteur.
- **Il est révocable à tout instant par la perte du drapeau** : retirer
  `isSuperAdmin` retire l'accès immédiatement, sans reconnexion, l'octroi étant
  évalué à chaque lecture.
- **Il est visible de ceux qu'il concerne** : l'administrateur de l'établissement
  voit les octrois en cours **et passés**, avec leur motif et le nom de leur
  auteur. Révoquer pose une date de révocation, **ne supprime pas** la ligne :
  c'est la moitié comptable du mécanisme, et sans elle il ne vaut rien.
- **Deux limites ouvertes**, à connaître : seul le titulaire d'un octroi peut le
  révoquer (personne ne peut révoquer celui d'un autre), et un octroi accordé sur
  un établissement **désactivé** n'est pas refusé à l'écriture alors qu'il
  n'ouvre rien.

## Correspondance avec les anciens rôles

Lors de la migration, l'unique établissement et l'unique service existants
sont créés, et les comptes actuels sont convertis ainsi :

| Ancien rôle global | Appartenance établissement | Appartenance service |
| --- | --- | --- |
| `ADMIN` | `ADMIN` | `COORDINATEUR` |
| `USER` | `MEMBER` | `INTERVENANT` |
| `NONE` (en attente) | aucune | aucune |

Le lien `User.soignantId` actuel devient `EstablishmentMembership.soignantId`. (Depuis le 2026-09-29, il vit sur `ServiceMembership.soignantId` : les soignants sont propres à chaque service — voir `decisions-navigation.md`.)
