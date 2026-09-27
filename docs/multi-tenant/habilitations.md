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
| Établissement | **Administrateur d'établissement** (`ADMIN`) | Créer et désactiver les services, gérer les lieux et les profils soignants, rattacher les comptes à l'établissement, les affecter aux services avec un rôle, désactiver les comptes, lire le journal d'activité et le journal des accès aux dossiers patients. |
| Établissement | **Membre** (`MEMBER`) | Aucun droit propre : simple rattachement qui permet d'être affecté à des services. |
| Service | **Coordinateur** (`COORDINATEUR`) | Tout ce que fait l'ancien rôle `ADMIN` dans le périmètre du service : modèles de parcours, planning, thématiques, semaines interdites, cycle de planification, modèles de diagnostic, dossiers patients et contenu clinique. |
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
| `referentials:read` | Lecture des thématiques, modèles de diagnostic, soignants et lieux | ✔ | ✔ | ✔ | ✔ |
| `referentials:write` | Thématiques, modèles de diagnostic éducatif | ✔ | | | |
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
- La purge du journal d'activité relève d'un droit d'écriture
  (`activity-log:write`) distinct de sa lecture : supprimer des entrées
  d'audit ne peut pas passer pour une consultation.
- La mise à jour d'un patient dans un créneau (`AppointmentPatient`) sépare
  les champs de présence (`appointment:write`) des transmissions
  (`clinical:write`).
- **À venir (étape 4b)** : toute lecture d'une fiche patient, d'un diagnostic
  éducatif et tout export PDF écriront une ligne dans le journal des accès
  (`PatientAccessLog`) avec l'utilisateur, l'établissement, le service et le
  patient. Ce modèle n'existe pas encore : à ce jour, **aucune traçabilité
  des lectures n'est en place**. Seules les écritures sont journalisées, dans
  le journal d'activité (voir la puce ci-dessous sur la gestion des membres).
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
  c'est la surface qui accorde les droits, elle doit être imputable.

## Permissions d'établissement et de plateforme

| Permission | Administrateur d'établissement | Super-admin |
| --- | :-: | :-: |
| `services:manage` (créer, renommer, désactiver un service) | ✔ | |
| `locations:manage` | ✔ | |
| `soignants:manage` (profils soignants de l'établissement) | ✔ | |
| `members:manage` (rattacher un compte, affecter aux services, changer les rôles, désactiver) | ✔ | |
| `activity-log:read` (journal d'activité de l'établissement) | ✔ | |
| `activity-log:write` (purge des entrées du journal d'activité) | ✔ | |
| `access-log:read` (journal des accès aux dossiers patients) | ✔ | |
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

Le lien `User.soignantId` actuel devient `EstablishmentMembership.soignantId`.
