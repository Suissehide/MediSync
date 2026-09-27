# Étape 4b — Traçabilité des consultations (back et front)

**Date :** 2026-09-27
**Base :** `main` à `0ca8209` (fusion de l'étape 4a)
**Spécification cible :** `docs/superpowers/specs/2026-09-22-multi-tenant-architecture-design.md`, §8 étape 4
**Décisions de l'étape précédente :** `docs/multi-tenant/decisions-etape-4a.md`

## 1. Objet

L'étape 4a a construit des pouvoirs — super-admin, octrois temporaires, liens d'accès,
administration d'établissement — et **presque rien ne les regarde**. L'étape 4b ferme cet écart.

Elle porte trois choses :

1. **Le journal des consultations** (`PatientAccessLog`). Le journal actuel (`ActivityLog`) ne
   trace que les **écritures** : ses seize événements sont des créations, modifications et
   suppressions. Aucune lecture n'est enregistrée. Dans une application qui porte des données de
   santé, « qui a ouvert le dossier de cette personne » est la question qu'on pose après un
   incident, et l'application ne sait pas y répondre.
2. **Les trois angles morts de traçabilité laissés par 4a**, tous documentés et mesurés dans
   `decisions-etape-4a.md`.
3. **Le dernier trou d'isolation** : le garde-fou d'ORM ne s'applique à aucune route hors tenant.

## 2. Ce qui existe déjà, et qu'on ne refait pas

- **`ActivityLog`** : `establishmentId?`, `serviceId?`, `userID`, `userFirstName?`,
  `userLastName?`, `action`, `entityType`, `entityID`, `createdAt`. Alimenté par
  `ActivityLogSubscriber` depuis `AppEventBus`. Purgé à **douze mois**, en dur dans
  `ActivityLogDomain.cleanup`.
- **Le filtrage des champs cliniques** (`utils/clinical-fields.ts`), accroché par deux crochets
  Fastify **sur les greffons de routes**, pas sur les routes individuelles. C'est le précédent
  architectural de cette étape.
- **Les garde-fous de démarrage** : `assertRoutePermission`, `assertTenantShapedRoute`,
  `assertSuperAdminShapedRoute`. Le serveur refuse de démarrer si une route échappe au dispositif.
- **Le garde-fou d'ORM** (`infra/orm/tenant-guard.ts`), qui échoue fermé, avec ses familles de
  modèles et son test de monotonie rejouable.
- **Les rôles** : `ServiceRole = COORDINATEUR | INTERVENANT | SECRETARIAT | LECTURE`,
  `EstablishmentRole = ADMIN | MEMBER`.

## 3. Le modèle `PatientAccessLog`

**Un modèle de service** (`SERVICE_MODELS`) : un accès a toujours lieu depuis un service, et le
garde-fou le cloisonne comme les autres. Il porte `establishmentId` et `serviceId`, et
`@@unique([id, serviceId])` comme tout modèle de service.

| Colonne | Rôle |
|---|---|
| `id` | cuid |
| `establishmentId`, `serviceId` | le tenant, posé par le repository, jamais par l'appelant |
| `patientId` | le dossier consulté |
| `userID` | l'auteur |
| `userFirstName`, `userLastName` | recopiés à l'écriture, nullables |
| `action` | `dossier.ouvert` \| `sousDossier.ouvert` \| `export` |
| `exportCount` | nullable ; le nombre de dossiers, pour un export |
| `exportFilters` | nullable ; les critères de filtre, pour un export |
| `createdAt` | horodatage |

Index sur `patientId`, sur `createdAt`, et sur `(establishmentId, serviceId)`.

**Le journal ne porte aucun contenu clinique, jamais.** Il dit *qui a regardé quoi*, pas *ce qu'il
a vu*. `exportFilters` est le seul champ qui recopie une valeur soumise : il ne doit contenir que
les critères de filtre (recherche textuelle, étiquettes de parcours), et un test doit tenir que
les clés cliniques (`notes`, `details`, `medicalDiagnosis`, `transmissionNotes`) n'y figurent
jamais.

**Le nom de l'auteur est recopié à l'écriture** plutôt que joint à la lecture. Motif : c'est déjà
ce que fait `ActivityLog`, et surtout la jointure a coûté cher — au tour 1 de la tâche 15, le
souscripteur lisait l'arbre complet des appartenances pour obtenir un prénom, et le resserrement
du garde-fou a fait tomber cette lecture **en silence**, vidant la colonne « auteur » de toutes
les entrées neuves. La recopie est insensible à ce genre de resserrement.

## 4. Ce qui déclenche une ligne

**Trois actions, et trois seulement.**

- **`dossier.ouvert`** — `GET /patient/:patientID`.
- **`sousDossier.ouvert`** — `GET /patient/:patientID/service-file`, le sous-dossier de service,
  qui porte les seize colonnes de parcours et les champs cliniques.
- **`export`** — `GET /patient/export`.

**Les routes de lecture qui portent un `:patientID`, une par une**, puisque c'est exactement ce que
le garde-fou de démarrage du §5 va exiger de déclarer :

| Route | Traitement | Motif |
|---|---|---|
| `GET /patient/:patientID` | **journalisée** | l'ouverture du dossier |
| `GET /patient/:patientID/service-file` | **journalisée** | l'ouverture du sous-dossier |
| `GET /patient/:patientID/pathways` | **exemptée déclarée** | appelée par l'écran du dossier, en même temps que l'ouverture ; la journaliser doublerait chaque ligne sans rien apprendre |
| `GET /patient/:patientID/pathway/:pathwayID/appointments-count` | **exemptée déclarée** | rend un nombre, aucune identité, aucun contenu |

Cette table est **le point de départ, pas la vérité** : l'implémentation doit la reconstruire
depuis les routes réelles au moment d'écrire le garde-fou, et **signaler tout écart** plutôt que
de la recopier. Une route ajoutée entre-temps doit apparaître ici ou faire échouer le démarrage.

**Ce qui n'est pas tracé, délibérément** : les listes (`GET /patient`, `/with-tags`) et la
recherche d'identité (`/search`). Motif : chaque navigation vers une liste écrirait autant de
lignes qu'il y a de patients affichés, et l'essentiel s'y noierait. Le journal répond à « qui a
ouvert le dossier de X », pas à « qui a vu le nom de X passer dans une liste ».

**L'export mérite son traitement à part, et c'est une décision de cette spécification.** La règle
« ouvrir un dossier » ne le couvre pas, alors que c'est la lecture la plus sensible du lot : elle
rend des identités en masse et **elle sort de l'application**. Il est donc tracé, mais **en une
seule ligne** — pas une ligne par dossier exporté — avec le nombre de dossiers et les critères.
Un export non tracé serait indéfendable ; une ligne par patient reproduirait exactement le défaut
que l'option « toute lecture identifiante » a fait écarter.

**Si l'écriture du journal échoue, la lecture est quand même servie**, avec une erreur bruyante
côté serveur. L'inverse — refuser l'accès au dossier quand le journal est indisponible — est plus
pur en théorie d'audit, mais transforme un incident de base de données en impossibilité de
consulter un dossier dans un service de soins. *Coût si faux :* un incident de journal produit un
trou dans la traçabilité, visible dans les journaux applicatifs mais pas dans le journal des
accès.

**L'erreur ne doit jamais être avalée en silence.** C'est la leçon la plus chère de l'étape 4a :
tout `.catch` qui absorbe une erreur est un endroit où un resserrement du garde-fou se convertit
en dégradation silencieuse. Le `catch` de l'écriture journalise **la classe** de l'erreur — jamais
le message brut, qui recopierait le `data` de l'écriture ratée.

## 5. Où le dispositif s'accroche

**Un crochet posé sur le greffon de routes de service, pas sur chaque route**, exactement comme le
filtrage des champs cliniques. Ce dépôt a une règle constante : **une route neuve est couverte par
défaut**, et le serveur refuse de démarrer si une route échappe au dispositif.

Accrocher dans les domaines serait plus explicite à la lecture, mais la première route ajoutée
l'oublierait — et une traçabilité qui a des trous non signalés vaut moins qu'une absence de
traçabilité, parce qu'on la croit acquise.

**Le crochet s'exécute après la réponse**, sur une réponse réussie seulement : un 404 ou un 403
n'est pas une consultation. Il lit la route empruntée et l'identifiant du dossier dans les
paramètres, jamais dans le corps de la réponse.

**Un garde-fou de démarrage** (`assertPatientReadLogged`) sur le même modèle que les trois
existants : toute route de service dont la forme d'URL désigne un dossier identifié doit être
couverte, ou le serveur refuse de démarrer. La liste des routes exemptées est **déclarée, nommée
et motivée**, jamais implicite — et un test tient que la liste déclarée correspond exactement aux
routes réelles, **dans les deux sens**.

## 6. Qui lit le journal

Trois niveaux, trois routes, trois permissions.

| Lecteur | Route | Périmètre |
|---|---|---|
| Coordinateur de service | `GET /e/:establishmentId/s/:serviceId/patient/:patientID/acces` | les accès à ce dossier, dans ce service |
| Admin d'établissement | `GET /e/:establishmentId/admin/patients/:patientID/acces` | les accès à ce dossier, tous services de l'établissement |
| Super-admin | `GET /super-admin/access-log` | à l'échelle de la plateforme, filtrable |

Une permission neuve, `accessLog:read`, portée par `COORDINATEUR` côté service et par `ADMIN` côté
établissement. La matrice est dupliquée dans `front/src/utils/permissions.ts` et un test tient que
les deux copies sont identiques : la permission neuve doit figurer dans les deux.

**La route du super-admin ferme du même coup un trou de 4a** : les lignes écrites par le script
d'amorçage portent `establishmentId: null` et n'étaient lisibles par aucune route. Elle lit les
deux journaux — activité et accès — à l'échelle de la plateforme.

**Elle passe par `runAsSuperAdmin` et exige donc deux entrées neuves** dans les tables déclarées du
garde-fou (`SUPERADMIN_OPERATIONS` pour `PatientAccessLog`, et `ActivityLog.findMany` y figure
déjà). Une opération absente de ces tables est refusée : c'est la règle, et cette route ne la
contourne pas.

**Ce que ces écrans ne montrent jamais** : aucun contenu clinique, et côté super-admin aucune
identité de patient — seulement des identifiants. L'étape 4a a établi que le super-admin **compte**
les patients, il ne les lit pas ; cette étape ne rouvre pas ce choix.

## 7. La purge

`ActivityLogDomain.cleanup` purge à douze mois, **en dur**. Cette étape rend la durée
**paramétrable** — une variable de configuration validée par Zod, comme le reste de
`application/config.ts` — et l'applique aux **deux** journaux, avec une valeur par défaut de douze
mois.

**Le chiffre est provisoire et le document le dit.** La spécification cible range déjà la rétention
des journaux parmi les points « à instruire hors chantier », et Léo a choisi de le trancher avec un
conseil. Ce que cette étape livre, c'est le mécanisme et la valeur par défaut, pas la décision.

*Coût si faux :* une durée trop courte détruit des preuves ; trop longue, elle conserve des données
personnelles au-delà du nécessaire. Les deux se corrigent par une variable d'environnement, sans
reprise de code — c'est précisément pourquoi elle devient paramétrable.

## 8. Les trois angles morts de traçabilité laissés par 4a

1. **`UserDomain.reissueAccessLink` (côté super-admin) n'émet aucun événement.** La route la plus
   puissante du système n'apparaît dans aucun journal ; seule la colonne `AccessLink.createdBy` en
   garde trace. Elle gagne son événement et sa ligne.
2. **Les lignes du script d'amorçage ne sont lisibles par aucune route** (`establishmentId: null`).
   Fermé par la route super-admin du §6.
3. **Aucune route ne lit le journal à l'échelle de la plateforme.** Même fermeture.

## 9. Le dernier trou d'isolation

**Le garde-fou ne s'applique à aucune route hors tenant.** `routes/index.ts` appelle
`tenantContext.clear()` à chaque requête et seul `tenant.plugin.ts` entre dans un contexte : `/me`,
`/auth` et **tout le préfixe `/super-admin`** s'exécutent donc sans store, les dépôts n'entrant
dans `runAsSuperAdmin` qu'au coup par coup. Mesuré à l'étape 4a : sans contexte,
`Establishment.findUnique + include:{patients}`, `Establishment.deleteMany({})` et
`User.updateMany({data:{isSuperAdmin:true}})` passent.

Ce n'est pas une régression — zéro changement de verdict sous « aucun contexte » sur les
61 923 360 cas mesurés — mais c'est le trou le plus large qui reste, et il contredit la promesse
« échoue fermé » telle qu'on la lit aujourd'hui.

**Ce que cette étape en fait.** Le contexte « aucun » cesse d'être un laissez-passer : il devient
un **quatrième contexte déclaré**, avec sa liste d'opérations autorisées, sur le modèle exact de
`SUPERADMIN_OPERATIONS`. Ce qui doit y figurer se découvre en énumérant les appels réels des
routes non tenant — connexion, `/me`, consommation d'un lien d'accès — et non en le devinant.

**La règle qui prime, et elle a déjà servi à l'étape 4a :** ce resserrement fera tomber des
lectures existantes. **On corrige l'appel, jamais le garde-fou.** Si le garde-fou paraît refuser à
tort, on s'arrête et on le décrit plutôt que de l'élargir sous la pression d'un test rouge.

**La monotonie se mesure comme à l'étape 4a**, avec le harnais versé au dépôt
(`tenant-guard-monotonie.test.ts`, `MONOTONIE_REF=<ref> PROFONDEUR=9`) : zéro refus perdu, et le
nombre de cas comparés est donné, pas estimé.

*Coût si faux :* une liste trop étroite casse la connexion — le défaut se voit immédiatement, au
premier test. Une liste trop large rend le quatrième contexte décoratif ; c'est le risque réel, et
c'est pourquoi chaque entrée porte sa raison.

## 10. Ce qui reste délibérément hors périmètre

- **L'écriture plate sur une racine globale sous contexte de tenant** reste ouverte
  (`Establishment.update({where:{id:autre}, data:{name}})`). Antérieure à 4a, non fermée par elle,
  non fermée ici : le §9 traite le contexte « aucun », pas celui-là.
- **`GET /patient` rend encore les patients de tout l'établissement**, sans filtre de service.
  Manque connu depuis l'étape 3.
- **La course sur l'émission simultanée de liens**, et le fait que **personne ne peut révoquer
  l'octroi d'un autre** : assumés, mesurés, écrits.
- **La porte de lint du front est rouge** depuis avant l'étape 4a (32 erreurs, 11 fichiers). Ce
  n'est pas à ce chantier de la réparer, mais tout fichier neuf doit rester hors de ce décompte.
- **La politique de mot de passe et la double authentification**, que la spécification cible range
  explicitement hors chantier.

## 11. Critère de sortie

Trois conditions, toutes vérifiables :

1. Ouvrir un dossier patient, son sous-dossier, puis l'exporter, laisse **trois lignes** dans
   `PatientAccessLog` — et les trois sont lisibles par le coordinateur du service, l'administrateur
   de l'établissement et le super-admin, chacun dans son périmètre.
2. Une route de service neuve qui rend un dossier identifié et n'est pas couverte **fait échouer le
   démarrage du serveur**, en nommant ce qu'il faut déclarer.
3. Le contexte « aucun » a sa liste déclarée, la monotonie est mesurée et rejouable, et **aucun
   appel légitime n'a été réparé en élargissant le garde-fou**.

## 12. Ce que cette spécification ne tranche pas

- **La durée de rétention réelle** : le mécanisme est livré, le chiffre attend un conseil.
- **Ce que l'écran d'un coordinateur montre quand le journal est vide** — aucun accès, ou aucun
  droit de voir : décision d'interface, à prendre quand l'écran existe.
- **Si un accès par octroi temporaire doit être signalé comme tel** dans le journal. Un super-admin
  sous octroi emprunte le chemin de tenant ordinaire et sera donc journalisé comme un membre. Le
  distinguer supposerait de lire l'origine de l'appartenance au moment de l'écriture. À trancher à
  la conception du modèle, en notant le coût : sans cette distinction, un accès de dépannage est
  indiscernable d'un accès de soin.
