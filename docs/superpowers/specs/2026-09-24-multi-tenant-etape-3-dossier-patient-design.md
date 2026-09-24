# Étape 3 — Dossier patient par service (spécification)

**Document d'architecture** : `docs/superpowers/specs/2026-09-22-multi-tenant-architecture-design.md`, sections 3.1 et 6.6.
**Étapes précédentes** : socle fusionné le 2026-09-23, contexte front fusionné le 2026-09-24.
**Décisions antérieures** : `docs/multi-tenant/decisions-etape-1.md` et `decisions-etape-2.md`.
**Habilitations** : `docs/multi-tenant/habilitations.md` fait foi.

## 1. Ce que cette étape change, et pourquoi elle est la plus risquée des quatre

Aujourd'hui, un patient est une ligne unique au niveau de l'établissement, qui porte à la fois son
identité et tout son parcours de soin. Deux services du même établissement qui suivent la même
personne écrivent donc dans la même ligne, et voient le travail l'un de l'autre.

Cette étape sépare les deux. L'identité reste à l'établissement. Seize colonnes — le parcours,
le diagnostic médical, les notes, le bilan de sortie — partent dans un **sous-dossier par
service**, invisible des autres services.

**C'est la seule étape du chantier qui déplace des données de santé existantes.** Les étapes 1 et
2 ajoutaient des colonnes ou déplaçaient du code ; celle-ci recopie puis supprime. Une migration
ratée ne se rattrape pas par un correctif : elle se rattrape par une restauration de sauvegarde,
avec la perte de tout ce qui a été saisi entre-temps. Tout ce document est écrit sous cette
contrainte.

**Hors périmètre, et nommément** : la traçabilité des accès aux dossiers et les écrans
d'administration d'établissement (étape 4) ; les filtres de tableaux persistés sous clés globales
et la descente du garde-fou d'ORM dans les inclusions imbriquées, tous deux reportés de l'étape 2
et à traiter ici seulement s'ils bloquent.

## 2. Les trois décisions de métier, prises avec Léo

### 2.1 Un second service part d'un sous-dossier vide, mais sait qu'il y en a un autre

Quand un service accueille un patient déjà connu de l'établissement, il crée son propre
sous-dossier, **entièrement vierge**. Il ne voit ni le contenu ni l'identité du service qui suit
déjà cette personne.

L'écran indique en revanche que ce patient **est suivi ailleurs**, sans dire où. Le soignant sait
ainsi qu'il peut se rapprocher d'un collègue, plutôt que de croire découvrir un dossier neuf.

**C'est une fuite d'information délibérée, et elle doit être traitée comme telle.** Le fait qu'une
personne soit suivie dans un autre service est une donnée de santé au sens large. Ce que le
signal révèle est borné à un booléen : ni le nom du service, ni son nombre, ni aucun contenu,
ni aucune date. La section 5.3 dit comment l'obtenir sans ouvrir davantage.

### 2.2 Le secrétariat voit le sous-dossier comme il voit le patient aujourd'hui

La règle existante est reportée telle quelle : trois champs masqués sur seize — les notes, le
détail et le diagnostic médical. Le reste du sous-dossier, jugé administratif, reste visible.
Aucune permission nouvelle, aucune modification de la matrice.

### 2.3 L'écran sépare visiblement ce qui est partagé de ce qui appartient au service

L'onglet « Profil & Contexte » mêle aujourd'hui des champs qui déménagent et des champs qui
restent. Il est découpé en deux blocs explicitement nommés : l'identité partagée entre les
services de l'établissement, et le dossier du service courant.

Le motif n'est pas esthétique. Sans cette séparation, quelqu'un peut croire qu'une note est
visible de tous, ou qu'une profession ne l'est pas. Le premier cas est un risque de confidentialité,
le second un risque de double saisie.

## 3. Modèle de données cible

### 3.1 La nouvelle table

`PatientServiceFile` : `id`, `patientId`, `serviceId`, `establishmentId`, `createdAt`, puis les
seize colonnes déplacées.

- `medicalDiagnosis`, `entryDate`, `careMode`, `orientation`, `etpDecision`, `programType`,
  `nonInclusionDetails`, `customContentDetails`, `goal`
- `exitDate`, `stopReason`, `etpFinalOutcome`
- `referringCaregiver`, `followUpToDo`, `notes`, `details`

Unique `(patientId, serviceId)` : un seul sous-dossier par patient et par service. Unique
`(id, serviceId)` pour servir de cible aux clés composites des enfants. Clé composite
`(patientId, establishmentId)` vers `Patient`. Suppression en cascade depuis le patient.

Le modèle rejoint `SERVICE_MODELS` dans le garde-fou d'ORM, et la table de déclaration des
relations enfants de `Patient`.

### 3.2 Ce qui reste sur `Patient`

Identité et contact — `firstName`, `lastName`, `gender`, `birthDate`, `phone1`, `phone2`,
`email` — et le contexte socio-démographique : `distance`, `educationLevel`, `occupation`,
`currentActivity`, `createDate`.

**Ce partage est une décision, pas une évidence.** La profession et le niveau d'études d'une
personne ne changent pas d'un service à l'autre ; son diagnostic et ses notes, si. C'est ce qui
justifie la ligne de partage, et c'est aussi ce que l'écran doit rendre lisible (2.3).

### 3.3 Les deux modèles qui suivent

`DiagnosticEducatif` et `EnrollmentIssue` portent déjà un `serviceId` et pointent vers `Patient`
par une clé composite passant par `establishmentId`. Ils se rattachent désormais au **sous-dossier**,
par `(patientId, serviceId)`.

Cela ferme au passage une incohérence : ce sont des modèles de service qui dépendaient d'un
parent d'établissement. Après l'étape, la chaîne est homogène — service vers service.

## 4. La migration

C'est la partie qui mérite le plus d'attention. Elle suit la forme éprouvée à l'étape 1 : trois
temps dans une seule transaction, encadrés par deux fichiers d'invariants aux libellés identiques,
joués avant et après.

### 4.1 Quel sous-dossier reçoit les données

Un patient peut aujourd'hui être actif dans plusieurs services, par ses rendez-vous, ses
diagnostics ou ses problèmes d'inscription. Ses seize colonnes, elles, sont uniques. Il faut
donc décider où elles vont.

**La migration exige qu'au moment où elle s'exécute, chaque établissement n'ait qu'un seul
service, et refuse sinon.** C'est le cas en production aujourd'hui, et ce le restera tant que
l'étape 4 n'aura pas donné le moyen de créer des services depuis l'interface. Refuser plutôt que
deviner est ici la seule conduite défendable : répartir au jugé les notes cliniques d'un patient
entre deux services produirait une perte silencieuse, c'est-à-dire le pire résultat possible.

Le message de refus doit nommer les établissements fautifs et leurs services, et renvoyer à une
procédure guidée à écrire le jour où le cas se présentera.

### 4.2 Les trois temps

1. **Ajouter** la table `PatientServiceFile`, vide, avec ses contraintes.
2. **Remplir** : un sous-dossier par patient, dans l'unique service de son établissement, avec la
   valeur de ses seize colonnes. Puis rattacher les diagnostics et les problèmes d'inscription
   à ce sous-dossier.
3. **Contraindre et nettoyer** : poser les clés étrangères des enfants, puis supprimer les
   seize colonnes de `Patient`.

### 4.3 Ce que les invariants doivent prouver

Les fichiers de l'étape 1 comptaient les lignes par table pour démontrer l'absence de perte. Ici
cela ne suffit pas : **les lignes ne bougent pas, ce sont les valeurs qui se déplacent.** Un
comptage de lignes resterait vert sur une migration qui aurait recopié des colonnes vides.

Les invariants doivent donc porter sur les **valeurs** :

- autant de sous-dossiers que de patients ;
- pour chacune des seize colonnes, le nombre de valeurs non nulles avant et après est
  identique ;
- une somme de contrôle sur le contenu textuel de chaque colonne, identique avant et après —
  c'est le seul contrôle qui attrape une recopie décalée d'une ligne, qu'un comptage laisserait
  passer ;
- aucun diagnostic ni problème d'inscription orphelin ;
- aucun sous-dossier sans patient, ni dans un service d'un autre établissement.

Sept des dix patients de la base de développement n'ont aujourd'hui **aucune** activité de
service. Ils doivent tous recevoir un sous-dossier : c'est précisément ce que la règle du service
unique garantit, et un invariant doit le vérifier plutôt que de le supposer.

### 4.4 Répétition obligatoire

La migration est répétée sur une copie jetable des données réelles **avant** tout déploiement,
comme à l'étape 1, et la procédure de déploiement est écrite dans le même esprit : chaque
commande, son résultat attendu, et ce qu'il faut faire s'il diffère. Le retour arrière est une
restauration de sauvegarde, et le document doit le dire sans détour.

## 5. Back

### 5.1 L'API du sous-dossier

Le sous-dossier est une ressource de service, servie sous le préfixe existant. Sa lecture et son
écriture suivent les permissions déjà en vigueur pour le patient — `patient:read`, `patient:write` —
et le filtrage clinique s'applique à ses trois champs sensibles comme il s'applique aujourd'hui à
ceux du patient.

Le sous-dossier est **créé automatiquement** à la première écriture, et à l'inscription d'un
patient dans un parcours du service. Le relevé a montré qu'aucun chemin de création de patient ne
renseigne les seize colonnes : elles sont toujours remplies après coup. La création automatique
est donc sans effet de bord.

### 5.2 Le filtrage clinique

Les crochets existants filtrent par nom de champ, récursivement. Les trois noms concernés ne
changent pas, et le sous-dossier étant servi par les mêmes routes, il est couvert sans
modification. **Cette affirmation doit être vérifiée par un test et non supposée** : c'est le genre
de propriété qu'on croit acquise et qui ne l'est pas.

### 5.3 Le signal d'un suivi ailleurs

C'est le seul endroit de tout le chantier où une lecture traverse volontairement la frontière
entre services. Il doit donc être unique, étroit et déclaré.

- Une seule fonction, à un seul endroit, rend un **booléen** : ce patient a-t-il au moins un
  sous-dossier dans un autre service du même établissement.
- Elle ne rend jamais d'identifiant, de nom de service, de compte, de date ni de contenu.
- Elle s'exécute dans le mode encadré que le garde-fou d'ORM prévoit déjà pour les traitements
  hors requête, et **jamais** en assouplissant le garde-fou.
- Un test prouve qu'elle rend vrai dans le bon cas, faux dans les autres, et qu'aucun autre appel
  du dépôt ne lit les sous-dossiers d'un autre service.

Ce dernier test est le plus important de l'étape. Une exception à une règle de cloisonnement ne
vaut que si elle est la seule, et cela se vérifie par un test, pas par une relecture.

### 5.4 Le garde-fou d'ORM

L'étape 2 a laissé une limite connue : le garde-fou ne descend pas dans les inclusions imbriquées,
et la condition exacte qui rouvrirait le trou est écrite dans le garde-fou lui-même. Elle se lit
ainsi : une lecture qui atteindrait un modèle d'établissement par une relation incluse, puis
redescendrait de lui vers un modèle de service.

**La lecture d'un patient avec son sous-dossier est exactement cette forme.** Cette étape doit donc
fermer la descente, ou démontrer que ses propres lectures ne l'empruntent pas. La première voie est
la bonne : la limite a été documentée pour être levée ici.

## 6. Front

- **Fiche patient en deux blocs**, nommés : l'identité partagée entre les services, et le dossier
  de ce service. Le second porte les seize champs, répartis dans les onglets existants.
- **Le signal de suivi ailleurs** apparaît dans le bloc d'identité, sous une forme sobre, et dit
  ce qu'il dit : cette personne est suivie dans un autre service, sans plus.
- **Liste par service** : les patients ayant un sous-dossier dans le service courant.
- **Création avec recherche d'identité** : avant de créer un patient, l'écran cherche une identité
  existante dans l'établissement, pour éviter les doublons. Trouver quelqu'un ne révèle que son
  identité, jamais son suivi.

## 7. Tests

**Le relevé a mis au jour un fait qui commande cette section : il n'existe aujourd'hui aucun test
end-to-end sur les routes du patient, et aucun test ne nomme une seule des seize colonnes hors
du filtrage clinique.** La migration la plus risquée du chantier partirait donc sans filet.

L'étape ajoute, **avant** d'écrire la migration :

- des tests end-to-end sur la lecture, l'écriture et la suppression d'un patient, portant
  explicitement les seize colonnes ;
- un test de cloisonnement : deux services, un même patient, chacun ne voit que son sous-dossier ;
- un test du signal de suivi ailleurs, dans les deux sens ;
- un test prouvant que le filtrage clinique couvre le sous-dossier ;
- un test des invariants de migration eux-mêmes, joués sur une base peuplée puis migrée.

## 8. Critère de sortie

Un même patient a un sous-dossier dans deux services, chacun n'y voit que le sien, et chacun sait
qu'il existe un suivi ailleurs sans pouvoir dire lequel. Les valeurs des seize colonnes sont
identiques avant et après migration, somme de contrôle à l'appui. Un compte secrétariat voit le
sous-dossier moins ses trois champs cliniques.
