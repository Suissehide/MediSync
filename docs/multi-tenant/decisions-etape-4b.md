# Décisions de l'étape 4b (traçabilité des consultations)

Ce document conserve les décisions prises pendant la conception et l'exécution de l'étape 4b,
telles qu'elles ont été consignées au fil du chantier dans `progress.md` (le registre de tâches,
git-ignoré, qui disparaît avec l'espace de travail). Il fait pour l'étape 4b ce que
`decisions-etape-1.md`, `decisions-etape-2.md`, `decisions-etape-3.md` et `decisions-etape-4a.md`
font pour les étapes précédentes : dire ce qui a été décidé, pourquoi, et **ce que la décision
coûte si elle se révèle fausse** — pour une application qui manipule de vraies données de santé,
ce raisonnement doit rester lisible longtemps après le code qui le traduit.

Là où ce document contredit la spécification ou le plan d'origine de l'étape, **c'est lui qui fait
foi** : sur cette étape seule, une quinzaine de fois, un implémenteur ou un relecteur a eu raison
contre le brief, et ce sont ces corrections-là qui sont écrites ici.

**Règle de lecture, appliquée en écrivant ce document.** Quand une propriété est tenue par un test,
**le fichier est nommé**. Quand elle n'est tenue que par la relecture, c'est écrit. Quand une
limite est ouverte, elle est écrite **comme une limite**, dans « Ce qui reste ouvert » — pas diluée
dans une phrase rassurante.

Le défaut dominant de ce chantier est **la phrase qui promet plus que le code ne tient**, et il a
frappé une dizaine de fois sur cette seule étape : un test de la garde clinique qui rougissait sur
un `TypeError` au lieu du refus qu'il annonçait (tâche 2) ; une garde dont la couverture est passée
de trois cas à un, en silence (tâche 9) ; un instrument de mesure qui voyait **un cinquième de
moins** qu'il n'annonçait (tâche 9) ; un rapport qui substituait « source » à « action » pour faire
passer un filtre non testé pour couvert (tâche 11). Chacun de ces quatre est nommé à sa place
ci-dessous.

**Et l'erreur symétrique a été commise à l'étape précédente** : les documents de clôture de
l'étape 4a ont d'abord été **plus alarmants que le code**, parce qu'ils avaient été écrits avant la
dernière tâche et déclaraient encore ouverts des manques comblés depuis. Chaque affirmation de ce
document a donc été **vérifiée dans le code au moment de l'écrire**, jamais recopiée d'un rapport
de tâche. Les endroits où une note de chantier s'est révélée fausse sont signalés en annexe.

Documents liés :

- `docs/superpowers/specs/2026-09-27-multi-tenant-etape-4b-tracabilite-design.md` — la spécification de cette étape
- `docs/superpowers/specs/2026-09-22-multi-tenant-architecture-design.md` — la cible et son découpage en étapes
- `docs/multi-tenant/decisions-etape-4a.md` — l'étape précédente : l'administration, les octrois, le lien d'accès
- `docs/multi-tenant/habilitations.md` — les rôles et la matrice de permissions, qui fait foi
- `docs/multi-tenant/deploiement-etape-4b.md` — la procédure de déploiement issue de ces décisions
- `docs/multi-tenant/verification-etape-4b.md` — ce qui devient vérifiable à l'écran, et par quel chemin
- `back/CLAUDE.md`, `front/CLAUDE.md` — les conventions qui en sont nées, écrites pour le prochain implémenteur

---

## L'invariant d'où tout découle

**Une consultation ne laisse aucune trace d'elle-même.** Une écriture, si : depuis l'étape 2, tout
ce qui modifie passe par `ActivityLog` (`services/activity-log.subscriber.ts`). Une lecture, non —
et c'est précisément la lecture qui pose le problème dans un service de soin, parce que le
détournement d'un dossier patient ressemble exactement à son usage légitime : quelqu'un l'ouvre.

D'où le modèle `PatientAccessLog` et sa règle centrale, qui est un **refus de démarrage**, pas une
liste tenue à la main :

> Toute route **GET** dont l'URL désigne un dossier patient est journalisée par défaut. Si elle ne
> l'est pas, elle doit être **déclarée exemptée, avec sa raison**. Sinon le serveur **refuse de
> démarrer** en nommant la route.

`assertPatientReadLogged` (`interfaces/http/fastify/plugins/tenant.plugin.ts`), posée en `onRoute`
par `tenantRoutes`. C'est le troisième garde-fou de démarrage du dépôt, frère de
`assertTenantShapedRoute` et `assertSuperAdminShapedRoute`.

*Coût si cet invariant est mal lu* : il l'a déjà été, deux fois sur cette étape. Une première
version reconnaissait un dossier au **nom** du paramètre (`:patientID`) ; une route réelle
`GET /patient/:patient_id/sonde-revue` ajoutée au vrai routeur **démarrait sans broncher, servait un
dossier identifié, n'écrivait aucune ligne, et rien ne le signalait** (tâche 3, mesuré par la
revue). Une seconde version renommait un paramètre (`:patientID` → `:patientRef`) pour sortir du
filet : une sonde `GET /e/:establishmentId/admin/patients/:patientRef/sonde`, servie par un vrai
`findUniqueOrThrow`, **rendait un dossier complet en 200, sans aucune ligne de journal, et les 21
suites e2e restaient vertes** (tâche 5, mesuré par la revue). Les deux sont fermées — voir D8 et
D9 — mais elles disent ce que coûte une promesse de couverture adossée à une convention de nommage.

---

## Les décisions

### D1 — Ce qui déclenche une ligne, et ce qui n'en déclenche pas

**Cinq routes journalisées, trois exemptées, quatre actions.** La liste vit en un seul endroit,
`back/src/main/utils/access-log-routes.ts`, et rien ne s'y ajoute sans raison écrite.

| Route (URL déclarée, sous `/e/:establishmentId/s/:serviceId`) | Action |
|---|---|
| `/patient/:patientID` | `dossier.ouvert` |
| `/patient/:patientID/service-file` | `sousDossier.ouvert` |
| `/patient/:patientId/diagnostic` | `sousDossier.ouvert` |
| `/patient/:patientId/diagnostic/:diagnosticId` | `sousDossier.ouvert` |
| `/patient/:patientID/enrollment-issue` | `echecsInscription.consultes` |

Plus l'export (D2), qui n'a pas de paramètre d'URL et passe par un dispositif dédié.

Les trois exemptions, chacune avec sa raison en clair dans `EXEMPTED_PATIENT_ROUTES` :
`/pathways` (appelée par l'écran du dossier **en même temps** que l'ouverture — la journaliser
doublerait chaque ligne sans rien apprendre), `/pathway/:pathwayID/appointments-count` (rend un
nombre, aucune identité, aucun contenu) et `/acces` (lire le journal n'est pas consulter le
dossier — voir D9).

**Les listes et la recherche restent hors du journal.** `GET /patient`, `GET /patient/search`,
`GET /patient/with-tags` n'ont aucun paramètre en position de dossier : le garde-fou ne les exige
dans aucune liste, et c'est voulu.

**L'export PDF du programme n'est pas tracé non plus**, contrairement à ce qu'annonçait
`habilitations.md` avant cette étape — et il ne pouvait pas l'être par ce mécanisme : vérifié en
écrivant ce document, `pdf:export` ne garde **aucune route du back** (le document est fabriqué dans
le navigateur, `programme-pdf-modal.tsx`). Il n'y a pas de requête à accrocher. Ce qui est tracé,
c'est la lecture du dossier qui l'alimente. La phrase fausse a été corrigée dans `habilitations.md`.

*Motif* : un journal d'audit ne vaut que par ce qu'on peut y lire. Chaque affichage de la liste des
patients écrirait une ligne par consultation d'écran ; en quelques jours, l'ouverture de dossier
qu'on cherche serait noyée. Le périmètre est donc **le dossier identifié**, pas « toute lecture
identifiante ».

**La quatrième action, `echecsInscription.consultes`, a été ajoutée en chemin, et c'est un
renversement.** Le premier jet exemptait cette route en disant que c'était sa décision la moins
solide — non parce qu'elle ne mérite pas d'être tracée, mais parce qu'**aucune des trois actions ne
la décrivait sans mentir**. La revue a montré que les deux faits sur lesquels l'exemption écrite
s'appuyait étaient faux : `enrollmentIssueResponseSchema` **porte bien `patientId`**, et `reason`
est une **chaîne libre** que rien dans le schéma ni dans le modèle Prisma ne borne à un « motif
technique ». Le refus d'une étiquette approximative était juste ; la conclusion qu'on en tirait ne
l'était pas. `action` étant une colonne texte, une quatrième valeur ne coûte aucune migration.

*Ce que le code tient, et par quels tests* : `back/src/test/unit/interfaces/access-log-hook.test.ts`
(« laisse passer toutes les entrees des deux listes declarees », « ne prend pas une route de
collection pour un dossier identifie ») et `back/src/test/e2e/patient-access-log.test.ts` (« couvre
exactement les routes GET reelles qui designent un dossier patient », « laisse demarrer une route de
collection sous /patient/, sans parametre »). Le sens inverse — une entrée de liste qui ne
correspond plus à aucune route réelle — est tenu par `assertNoDeadPatientAccessEntry`, posée en
`onReady` avec les routes **réellement vues**, jamais une liste recopiée.

*Coût si c'est faux* : trop étroit, une consultation abusive passe sans trace et le journal donne
une fausse assurance ; trop large, l'essentiel se noie et personne ne relit le journal — ce qui
revient au même. Pour la quatrième action précisément, le coût est plus modeste : **une valeur que
personne ne filtre**.

**Limite de cette décision, nommée plutôt que découverte plus tard** : `echecsInscription.consultes`
n'est **produite par aucun chemin de l'interface aujourd'hui**. Vérifié dans le front au moment
d'écrire : aucun appel à `GET /patient/:patientID/enrollment-issue` n'existe (`front/src/api/`,
`front/src/queries/` — seul un `DELETE .../enrollment-issue/:issueID` est appelé). Les problèmes
d'inscription arrivent à l'écran **embarqués dans la réponse de `GET /patient/:id`**
(`patient.repository.ts`, `enrollmentIssues` sur le sous-dossier), donc la consultation **est**
tracée, mais sous `dossier.ouvert`. La route dédiée existe, est journalisée, et n'est appelée par
personne. Ce n'est pas un défaut de l'étape ; c'est une ligne que le journal n'affichera pas tant
qu'un écran n'appellera pas cette route.

### D2 — L'export est tracé en UNE ligne, et `patientId` est devenu nullable pour cela

`GET /patient/export` rend un classeur Excel de toute la liste filtrée. Il produit **une seule
ligne** de journal, portant le **nombre de dossiers rendus** et les **critères** — jamais une ligne
par patient.

Le plan n'avait pas vu le conflit : la table exigeait `patientId` non nul, et cette route n'a aucun
identifiant de patient dans son URL. **Arbitrage rendu : rendre `patientId` nullable**, plutôt que
déplacer l'export dans `ActivityLog`.

*Motif* : les deux lectures du journal — « qui a ouvert ce dossier » et « qu'a fait ce compte » —
doivent se répondre **dans une seule table**. Un export réparti dans l'autre journal obligerait
quiconque enquête à croiser deux sources aux colonnes différentes.

*Ce que le code tient, et par quels tests* : `back/src/test/e2e/patient-access-log.test.ts` (« trace
un export en UNE ligne, avec le nombre de dossiers et les criteres ») ;
`back/src/test/unit/interfaces/access-log-hook.test.ts`, `describe('plannedPatientExportAccess')`,
six cas dont « normalise une etiquette unique en tableau, comme le fait le filtrage reel ». Ce
dernier ferme un défaut mesuré : une étiquette unique était **filtrée** sur `["asthme"]` et
**journalisée** `"asthme"` — le journal décrivait un critère qui n'était pas celui qui avait été
appliqué.

`exportCount` vient du gestionnaire (`routes/patient.ts` pose `request.patientExportCount` avant de
répondre), jamais d'une seconde requête : rejouer la requête risquerait de compter autre chose si
un patient est créé ou supprimé entre les deux lectures. S'il est absent sur cette route, **aucune
ligne n'est écrite et l'incident est journalisé** — plutôt qu'une ligne au compte inconnu.

*Coût si c'est faux* : une colonne nullable de plus et un index qui porte des nuls. Et un coût
structurel à connaître : la clé étrangère composite `(patientId, establishmentId)` est en
`MATCH SIMPLE`, donc **elle n'est pas vérifiée quand `patientId` est nul** — les lignes d'export ne
sont rattachées à aucun patient par la base, seulement par leur `establishmentId`/`serviceId`. C'est
la conséquence directe et assumée de la nullabilité, pas un oubli.

### D3 — La lecture est servie même si le journal échoue, mais jamais en silence

Le crochet est posé en **`onResponse`** — donc **après** que la réponse soit partie — et l'écriture
est suivie d'un `.catch` qui journalise et n'interrompt rien.

*Motif* : refuser l'accès à un dossier parce que le journal est indisponible transformerait un
incident de base de données en **impossibilité de soigner**. Poser le crochet après la réponse a un
second effet : une écriture lente n'allonge jamais la lecture du dossier, et le code de statut est
connu — un 404, un 403, un 500 ne laissent aucune ligne.

*Et jamais en silence* : c'est la leçon directe de l'étape 4a, où un `.catch` a vidé la colonne
« auteur » de toutes les lignes neuves sans que rien ne le signale. Ici, l'échec écrit une ligne
d'erreur portant le `reqId` (`request.log`, pas `fastify.log` : une perte de trace d'audit doit
pouvoir être rattachée à la requête qui aurait dû la laisser). **Seule la CLASSE de l'erreur est
journalisée**, jamais son message : une erreur Prisma non attrapée recopie intégralement le `data`
de l'écriture ratée, donc l'identifiant du patient et le nom de l'agent.

*Ce que le code tient, et par quels tests* :
`back/src/test/unit/interfaces/access-log-hook.test.ts` (« ecrit une ligne quand une route
journalisee repond en succes », « appelle record A L INTERIEUR du contexte de tenant »). La même
discipline « classe seulement » est éprouvée pour les deux purges dans
`back/src/test/unit/application/starter.test.ts` (« ne journalise que la classe de l erreur, jamais
son message brut », deux fois).

*Coût si c'est faux* : dans un sens, une panne de base devient une panne de soin ; dans l'autre, une
perte de trace muette — c'est-à-dire un journal dont on ne sait pas s'il est complet, ce qui vaut à
peu près zéro pour un audit.

### D4 — Les lignes suivent la suppression du patient (`onDelete: Cascade`)

Supprimer un dossier patient efface son journal de consultations.

*Motif, et il repose sur deux faits vérifiés dans le code, pas sur une préférence* : (1) la
suppression est **elle-même journalisée avec son auteur** — `PatientDomain.delete` émet
`patient.deleted` (`userID`, `patientId`), capté par `ActivityLogSubscriber`, qui écrit une ligne
`ActivityLog` nommant l'auteur ; (2) `PatientServiceFile`, le dossier clinique lui-même, **cascade
déjà** depuis `Patient` par la même relation — la donnée que ce journal décrirait avoir été
consultée disparaît de toute façon au même instant. Conserver les lignes laisserait un journal qui
désigne un dossier qui n'existe plus, `patientId` devenant une clé morte.

*Ce que le code tient, et par quel test* : la cardinalité de la relation est sabotée dans les trois
sens et le test **nommé** rougit avec son message précis, sans ricochet (revue de la tâche 1). La
décision et ses deux faits sont écrits **à leur source**, dans le commentaire du modèle
`PatientAccessLog` (`back/prisma/schema.prisma`), pas seulement ici.

*Coût si c'est faux, et il est réel* : si une consultation abusive précède de peu la suppression du
patient — par le même acteur, ou un complice qui couvre ses traces — **le détail fin est perdu avec
elle** : qui, quand, combien de lignes exportées. Seule la ligne `patient.deleted` demeure. Si ce
risque devait un jour peser plus que la cohérence référentielle (par exemple une obligation
réglementaire de conserver la preuve d'accès après suppression du dossier), **la ligne à changer est
celle du `onDelete` dans `schema.prisma`** — pas une lecture silencieuse du trou ailleurs.

**Ce que la cascade ne fait pas** : il n'y a **aucune clé étrangère sur `userID`**. `userFirstName`
et `userLastName` sont des instantanés dénormalisés. Supprimer un compte — ce que l'application ne
fait pas, elle désactive (`habilitations.md`) — n'effacerait donc pas ses lignes, et le nom resterait
lisible dans le journal. C'est cohérent avec l'imputabilité voulue, et ce n'est écrit nulle part
ailleurs.

### D5 — `accesParOctroi`, et l'histoire qu'il faut raconter en entier

**La décision.** Un super-admin muni d'un `SuperAdminAccessGrant` vivant (mécanisme de l'étape 4a)
emprunte le **chemin de tenant ordinaire** : `effectiveMemberships` lui donne les mêmes
appartenances qu'un membre réel. Sans distinction, **un accès de dépannage est indiscernable d'un
accès de soin** dans le journal. Le plan laissait ce point ouvert ; l'arbitrage rendu à la tâche 2
est de **l'enregistrer comme tel**, dans une colonne booléenne `accesParOctroi`.

*Motif* : c'est exactement ce à quoi sert un journal d'audit dans une application de santé, et le
mécanisme d'octroi a été bâti à l'étape 4a avec la redevabilité pour raison d'être — la ligne
d'octroi y est décrite comme « la trace comptable sur laquelle repose tout le mécanisme ».
`tenant.plugin.ts#resolveTenantFromUser` connaissait déjà `membership.origine` ; il ne restait qu'à
le transmettre plutôt que de le laisser disparaître. Défaut `false` : une ligne écrite par un chemin
qui ne pose pas cette information reste un **accès réel** plutôt que d'affirmer à tort un dépannage.

*Ce que le code tient, et par quels tests* :
`back/src/test/unit/domain/patientAccessLog.domain.test.ts` (« pose establishmentId/serviceId depuis
le scope, et accesParOctroi a faux pour un acces reel » ; « pose accesParOctroi a vrai pour le meme
acces obtenu par octroi temporaire ») et, sur le chemin réel,
`back/src/test/e2e/patient-access-log.test.ts` (« expose accesParOctroi, avec sa vraie valeur par
ligne (jamais une constante) ») et `back/src/test/e2e/super-admin-access-log.test.ts` (« expose
accesParOctroi sur source=acces, avec sa vraie valeur par etablissement » ; « rend accesParOctroi a
null sur source=activite »). Ce dernier point n'est pas cosmétique : sur une ligne du journal
d'activité la notion n'existe pas, et `false` y affirmerait un accès réel là où aucun octroi n'est
même concevable — d'où `null`.

**Et maintenant l'histoire, parce qu'elle est plus instructive que la décision.**

La colonne a été créée à la **tâche 2**. Elle a été **invisible pendant cinq tâches**.

Le cahier des charges de la **tâche 5** — celle qui construit les deux premières lectures —
énumérait les champs de réponse : « l'auteur, l'action, la date, le service ». Il n'y avait pensé à
aucun moment. L'implémenteur de la tâche 5 a suivi cette liste **à la lettre, et correctement** : le
schéma Zod de réponse excluait `accesParOctroi`, et le commentaire du schéma le nommait
explicitement parmi les champs exclus, au même rang que `exportFilters` et `patientId`.

Résultat, découvert seulement à la **tâche 10**, quand il a fallu afficher ces lignes : la colonne
créée pour distinguer un accès de dépannage d'un accès de soin était **écrite sur chaque ligne et
lisible par personne**. Une écriture morte. La distinction n'existait que dans la base.

**Aucune tâche n'était fautive isolément.** La tâche 2 a créé la colonne et l'a justifiée. La tâche 5
a suivi son brief. Les tâches 6, 7, 8 et 9 n'avaient aucune raison d'aller relire un schéma de
réponse. Le défaut était **dans le cahier des charges**, à la jonction de deux tâches, et c'est le
genre de défaut que **seule une revue transverse attrape** — ici, la première tâche qui a eu besoin
d'afficher le champ.

Ce qui a été fait à la tâche 10 : `accesParOctroi` exposé dans les **trois** schémas de lecture
(service, établissement, plateforme) et affiché sur les deux écrans, colonne « Origine ». Et surtout,
**la phrase fausse a été corrigée là où elle était** — le commentaire des deux fichiers de schéma ne
cite plus ce champ parmi les exclusions ; il explique pourquoi il l'a été et pourquoi il ne l'est
plus. Vérifié en écrivant ce document : aucun commentaire du dépôt ne le range encore parmi les
champs exclus.

*Coût de la décision d'exposer, s'il elle est fausse* : une colonne de plus à l'écran, qu'on peut
masquer. Ce n'est ni un contenu clinique, ni une identité : c'est un booléen sur la **provenance**
de l'accès, l'information la plus pertinente d'un journal d'audit après l'auteur lui-même.

*Coût de la leçon, s'il elle n'est pas retenue* : c'est la classe de défaut que cette étape entière
existe pour fermer. Une colonne écrite que personne ne lit est le pendant exact d'une consultation
que personne ne trace.

### D6 — La rétention est paramétrable, douze mois par défaut, et **la valeur est provisoire**

`LOG_RETENTION_MONTHS` gouverne la purge des **deux** journaux (`ActivityLog` et
`PatientAccessLog`), chacun avec sa propre purge planifiée dans `application/starter.ts`.

**Douze mois est une valeur d'attente, pas une décision.** Elle reprend le douze qui était en dur
dans le code depuis l'étape 2, et elle **attend un conseil** — la durée de conservation d'un journal
d'accès à des données de santé n'est pas un choix d'ingénierie. Voir `deploiement-etape-4b.md`, §5.

**Une valeur absurde fait échouer le DÉMARRAGE**, jamais la purge. Le schéma de configuration exige
un entier strictement positif (`.pipe(z.number().int().positive())`), donc `0`, `-3` et `douze`
refusent tous de charger.

*Motif, et il a été mesuré* : la purge tourne seule, à intervalle régulier, sans personne pour
regarder son résultat. Mesure faite sur la base de test (revue de la tâche 8) : avec une rétention
de zéro, la date de coupure vaut `now`, les deux lignes insérées disparaissent **y compris celle
vieille d'une minute**. Un zéro pris au pied de la lettre vide donc les deux journaux au premier
passage. Un démarrage qui échoue se voit ; un journal vidé la nuit, non.

*Ce que le code tient, et par quels tests* : `back/src/test/unit/application/config.test.ts` (« refuse
de demarrer avec une retention absurde », trois valeurs : `0`, `-3`, `douze` ; « demarre avec la
retention explicite fournie » ; « defaut a douze mois quand LOG_RETENTION_MONTHS est absent ») et
`back/src/test/unit/domain/patientAccessLog.domain.test.ts` (« purge a la duree configuree, pas a
douze mois en dur »). Le calcul est **dupliqué** entre les deux domaines à dessein, jamais factorisé :
un sabotage qui remet douze en dur dans l'un ne doit faire rougir que le test de celui-là.

*Coût si c'est faux* : trop court, on efface la trace avant qu'elle serve ; trop long, la table
grossit sans borne et le journal devient impraticable. Le paramétrage lui-même ne coûte rien —
c'est la valeur qui reste à trancher.

**⚠ Ce paramètre n'est aujourd'hui pas livrable en production.** Vérifié en écrivant ce document :
`LOG_RETENTION_MONTHS` **n'est listé ni dans `deploy/compose.yaml` ni dans
`deploy/dokploy/docker-compose.dokploy.yml`**, dans aucune section `environment:`. Le poser dans le
fichier `.env` du déploiement ne le fera donc **pas** parvenir au conteneur : l'application lira son
défaut de douze mois quoi qu'il arrive. Voir `deploiement-etape-4b.md`, §5, qui dit la ligne exacte
à ajouter.

### D7 — « Aucun contexte » est un **quatrième contexte déclaré**, plus un laissez-passer

Avant cette étape, le garde-fou d'ORM connaissait trois contextes : `tenant`, `system`, `superadmin`.
Le quatrième cas — **aucun store du tout** — n'était pas un contexte, c'était un trou.

Et « aucun contexte » n'est pas un cas marginal : `routes/index.ts` appelle `tenantContext.clear()`
en tête de **chaque** requête, et `tenant.plugin.ts` est le **seul** à appeler `enter()`. Donc
`/auth`, `/me` et **tout le préfixe `/super-admin`** s'exécutent sans store. Pour un modèle de
**tenant**, ce cas était déjà refusé (`assertTenantScope` lève dès que `!store`). Pour un modèle
**global**, il n'y avait **aucune porte de permission** : `Establishment.deleteMany({})`,
`Establishment.findUnique({ include: { patients: true } })` et
`User.updateMany({ data: { isSuperAdmin: true } })` passaient.

`NO_CONTEXT_GLOBAL_OPERATIONS` (`infra/orm/tenant-guard.ts`) est le **miroir exact** de
`SUPERADMIN_GLOBAL_OPERATIONS` pour ce cas : un couple (modèle, opération) absent est refusé, et un
modèle global absent de la table l'est en entier, lecture comprise. Neuf couples déclarés,
**chacun portant en commentaire la ou les routes qui le justifient**.

*La liste a été mesurée, pas devinée* : le garde-fou a été instrumenté pour journaliser chaque couple
vu avec `peek() === undefined`, et la suite e2e complète lancée — **1 243 appels, 8 couples
distincts, aucun sur un modèle de tenant**.

**Et la mesure a manqué une entrée, ce qui est la vraie leçon.** `User.create` n'apparaissait dans
aucun des 1 243 appels, parce qu'**aucun test e2e n'exerçait `POST /auth/register`** — la seule route
non-tenant qui crée un compte hors `runAsSuperAdmin`. Déclarer la liste telle que mesurée aurait
**fermé l'inscription en production sans qu'un seul test rougisse**. Le couple a été déclaré **et** la
route couverte (`back/src/test/e2e/auth-register.test.ts`), pour que la méthode de découverte
redevienne complète : l'instrumentation rejouée donne **1 244 appels, 9 couples**.

> **La leçon, écrite pour la prochaine fois : une liste dérivée d'une mesure ne vaut que ce que vaut
> la couverture de la mesure.** L'e2e ne couvrait que 11 des 15 routes non-tenant (manquaient
> `register`, `refresh`, `sign-out`, `PATCH /me`).

*Ce que le code tient, et par quels tests* : `back/src/test/unit/infra/tenant-guard.test.ts` (la table
et ses refus), `back/src/test/e2e/auth-register.test.ts` (« cree le compte sans aucun contexte de
tenant »), et la preuve de non-régression par `back/src/test/unit/infra/tenant-guard-monotonie.test.ts`.

*Coût si c'est faux* : une route légitime fermée en production. C'est arrivé en répétition, et c'est
exactement pour cela que chaque entrée porte sa route : **une entrée sans route est une entrée à
supprimer.**

*Ce que cette table ne ferme pas* : trois limites nommées, dont deux dans « Ce qui reste ouvert »
ci-dessous. La plus importante à ne pas mal lire : **une écriture déclarée n'est bornée ni par la
ligne ni par la colonne**.

### D8 — La détection est **structurelle**, jamais par nom de paramètre

`patientIdParamOf` (`utils/access-log-routes.ts`) reconnaît un dossier à un segment `/patient/`
**suivi d'un paramètre, quel qu'en soit le nom** — pas à une comparaison littérale sur `:patientID`.
Un second filet, **conservé en plus et jamais à sa place**, attrape un paramètre nommé
`patientId`/`patientID` (casse indifférente) hors d'un segment `/patient/`.

*Motif, et il est factuel* : le dépôt a **déjà prouvé que l'orthographe dérive** — `:patientID` chez
les uns, `:patientId` pour `diagnosticEducatifRouter`. Un `includes(':patientID')`, la forme du
précédent `assertTenantShapedRoute`, aurait laissé **trois routes hors du garde-fou sans rien
signaler**. Et la démonstration par sonde (voir « L'invariant ») a montré qu'une détection par nom,
même tolérante, **ne peut pas porter une promesse de couverture par défaut**.

*Ce que le code tient, et par quels tests* : `back/src/test/unit/interfaces/access-log-hook.test.ts`
(« reconnait un dossier a la STRUCTURE de l URL, quel que soit le nom du parametre », « reconnait
aussi l orthographe :patientId », « garde le filet par nom pour un dossier hors d un segment
/patient/ », « ne prend pas une route de collection pour un dossier identifie », « examine aussi une
route declaree avec plusieurs methodes »). Le relecteur a rejoué la sonde avec **trois orthographes
que l'implémenteur n'avait pas essayées** (`:pxid`, `:identifiant`, `:numDossier`) : les trois font
échouer le démarrage en nommant la route, sans aucun faux positif sur les quatre GET sans paramètre.

**Le frère racine.** Une première version limitait ce garde-fou au greffon de tenant, en se
réclamant d'un précédent **factuellement inverse** : `assertTenantShapedRoute` est posé **à la
racine** précisément pour ne **pas** avoir cette limite, et son commentaire le dit trente lignes plus
haut dans le même fichier. `assertPatientRouteUnderTenant` (`routes/tenant.routes.ts`), posé à la
racine par `routes/index.ts`, refuse donc **sèchement** toute route GET de forme patient enregistrée
hors du préfixe de tenant. Il ne consulte aucune liste de journalisation : une exemption y
déclarerait une couverture que le crochet, absent hors du greffon, ne pourrait pas tenir.

*Coût si c'est faux* : une route exotique refusée au démarrage — **ce qui se voit immédiatement**.
C'est le bon sens du défaut : le garde-fou sur-refuse plutôt que de sous-couvrir.

**Résidu, accepté et écrit comme tel** : une route qui désignerait un dossier sous un **autre nom de
segment ET un autre nom de paramètre** (`/dossier/:id`) échappe aux deux filets. Le fermer
exigerait de déclarer **toute** route GET à paramètre sous le greffon de tenant — défendable, mais
hors périmètre. Aucune règle syntaxique ne peut deviner qu'un segment inédit désigne un patient.

### D9 — Lire le journal n'est pas consulter le dossier — et une exemption se **déclare**, elle ne se contourne pas

Les deux routes de lecture par patient (`/patient/:patientID/acces` côté service,
`/admin/patients/:patientID/acces` côté établissement) portent elles-mêmes un identifiant de
patient. Elles sont donc vues par les deux garde-fous, et **déclarées exemptées, chacune dans la
liste qui la concerne** :

- `EXEMPTED_PATIENT_ROUTES` pour celle de service : elle vit sous `tenantRoutes`, donc le crochet
  d'écriture la couvre ; elle choisit simplement de ne pas s'en servir.
- `EXEMPTED_ADMIN_PATIENT_ROUTES` pour celle d'administration : elle ne vit pas sous le greffon,
  donc elle ne promet **aucune** couverture — elle déclare qu'il n'en faut pas.

*Motif* : ces routes ne rendent ni identité de patient ni contenu clinique (le schéma de réponse
porte l'auteur, l'action, la date, le service et `accesParOctroi`) ; elles **filtrent une table
d'audit** par l'identifiant de l'URL. Et les journaliser ferait grossir le journal **à chaque fois
qu'on le consulte lui-même**, jusqu'à noyer les accès de soin sous les accès d'audit.

**La correction qui compte, et ce n'était pas un détail.** Le premier jet de la route
d'administration **renommait son paramètre** (`:patientID` → `:patientRef`) pour sortir des deux
filets. C'est exactement le contournement par renommage que ce chantier combat : un renommage ne
déclare rien, il **rend le filet aveugle pour toute future route qui choisirait ce nom**. La revue
l'a démontré avec une sonde réelle (voir « L'invariant »), et un commentaire de 25 lignes expliquait
alors à la prochaine personne quel nom fait taire le garde-fou. La route est revenue à `:patientID`,
et sa dispense est déclarée dans une liste, avec sa raison.

*Ce que le code tient, et par quels tests* : `back/src/test/unit/interfaces/access-log-hook.test.ts`
(`describe('assertPatientRouteUnderTenant')` : « refuse une route de lecture designant un dossier
posee hors du prefixe de tenant », « laisse passer une route d administration explicitement exemptee,
avec :patientID », et surtout « refuse toujours une route non declaree de la meme forme »). Les
**entrées mortes** des deux listes font échouer le démarrage à leur tour
(`assertNoDeadPatientAccessEntry`, `assertNoDeadAdminPatientExemption`, trois cas chacune).

*Coût si c'est faux* : une route d'administration qui lirait vraiment un dossier passerait pour un
lecteur d'audit. C'est pourquoi l'exemption porte sa raison en clair et pointe le schéma de réponse
qui la rend vérifiable.

*Ce que cette décision ne dit pas* : **le chemin d'administration n'a aucun écran**. Vérifié en
écrivant ce document : le front n'appelle nulle part `/admin/patients/:patientID/acces`
(`front/src/api/`, `front/src/routes/.../admin/`). La route existe, est gardée, est éprouvée en e2e
et en isolation — et n'est atteignable aujourd'hui que par appel direct. Voir
`verification-etape-4b.md`, qui en tire les conséquences.

### D10 — Deux permissions distinctes, et la seconde a été **renommée** pour ne pas être un homographe

La lecture de service exige `consultations:read` (rôle **COORDINATEUR** uniquement) ; la lecture
d'établissement exige `access-log:read` (rôle **ADMIN** d'établissement, permission préexistante sur
`main`).

*Motif — pourquoi deux, et non une* : `hasPermission` choisit sa branche — service ou établissement —
sur la seule **appartenance de la chaîne** à l'un des deux ensembles, **avant** de regarder les rôles
de l'appelant. Une chaîne présente dans les deux ensembles prendrait toujours la branche service, y
compris pour un appelant d'administration dont `serviceRole` est `null` : la route d'administration
échouerait donc **toujours**. Vérifié par exécution, en écrivant d'abord le test faux.

*Ce que le commentaire du code ne dit pas, et ne doit pas dire* : que l'unification serait
« impossible ». Une sémantique « ou » (accordée dès que l'une des deux branches accorde) la rendrait
viable en huit lignes — **essayée et mesurée verte (234/234)**, puis **rejetée** : un ADMIN
d'établissement membre d'un service en LECTURE obtiendrait alors la permission sur la route **de
service**, par sa seule appartenance de service. Brouiller deux échelles d'habilitation dans une
fonction dont dépend chaque route du dépôt n'est pas un prix acceptable pour économiser une chaîne.

**Le renommage.** Le premier jet appelait la permission de service `accessLog:read` — un homographe
presque parfait d'`access-log:read`, **dans une matrice dupliquée entre deux dépôts**. Deux noms à un
trait d'union et une casse près est un piège de lecture permanent, pas seulement pour cette tâche.
Renommée `consultations:read` : aucune parenté visuelle, et un mot que rien d'autre ne prend.

*Ce que le code tient, et par quels tests* : `back/src/test/unit/utils/permissions.test.ts`, le test
de miroir back/front (les deux fichiers `permissions.ts` sont textuellement identiques),
`back/src/test/e2e/patient-access-log.test.ts` (« refuse la lecture de service a qui n a pas
consultations:read (LECTURE) », « refuse la lecture d etablissement a un simple MEMBRE (404, pas
403) »). La matrice fait foi dans `docs/multi-tenant/habilitations.md`.

*Coût si c'est faux* : un renommage de plus à propager dans deux dépôts.

### D11 — Le cloisonnement de la lecture d'établissement est tenu **de bout en bout**, et il ne l'était pas

La route d'administration lit sous `runAsSystem()` — `PatientAccessLog` est un modèle de
**service**, et le garde-fou exige `serviceId` pour toute opération dessus, alors que
l'administration d'établissement n'a pas de service courant. Le repository pose lui-même
`establishmentId` depuis `establishmentScope()`.

**Reclasser le modèle en `ESTABLISHMENT_MODELS` pour éviter `runAsSystem` a été essayé et rejeté par
la preuve de monotonie** : 855 refus perdus, 110 chemins distincts, sur quatre contextes dont le
tenant **ordinaire** (325) et l'administration d'établissement (300) — pas seulement superadmin (119)
et l'absence de contexte (111). Ce chiffre a d'abord été rapporté comme « une vingtaine de chemins » :
**artefact d'affichage**, le test imprimait `slice(0, 20)`. La conclusion était juste, l'argument
était sous-dimensionné quarante fois.

*Ce que le code tient, et par quels tests* : l'emploi est **déclaré et justifié** dans
`back/src/test/unit/infra/runAsSystem-unicite.test.ts` (six fichiers, huit appels, chacun avec sa
raison écrite), et les bornes posées à la main sont tenues par
`back/src/test/unit/infra/repository-scope.test.ts` (« findByPatientInEstablishment interroge sous
runAsSystem, sans service courant, filtre par establishmentId seul » ; « la forme de la requete d
administration est refusee hors du mode encadre, et permise dedans »).

**Et c'est la vérification qui comptait.** Avant le tour de correction, **retirer `establishmentId`
du `where` de cette lecture laissait les 234 e2e verts** : un administrateur de A pouvait lire le
journal d'un patient de B, et la seule chose qui s'y opposait était une assertion unitaire sur la
forme d'un objet. Cause : la fixture ne créait qu'un seul établissement, et aucun cas n'avait été
ajouté à `isolation.test.ts` — l'étape 8 de la procédure « nouvelle entité » du `CLAUDE.md`.
Depuis, la fixture a un second établissement réellement peuplé et le même sabotage fait rougir un
test e2e : `back/src/test/e2e/isolation.test.ts`, « un administrateur de A ne voit pas la ligne de B,
meme en visant son propre etablissement avec l identifiant du patient de B ».

*Coût si c'est faux* : une fuite de journal d'audit entre établissements. C'est-à-dire la
démonstration que le cloisonnement ne tient pas, faite par l'outil censé le prouver.

### D12 — Le journal des consultations ne peut jamais porter de contenu clinique

`exportFilters` est le seul champ libre de la table — `search` y est un texte potentiellement saisi
par un agent, donc potentiellement un nom de patient. `PatientAccessLogDomain.record` **refuse avant
tout appel au dépôt** une valeur dont les critères porteraient une des quatre clés réservées à
`clinical:read` (`utils/clinical-fields.ts`).

*Deux trous élargis au tour de correction, sur cette barrière unique* : (1) la vérification ne
regardait que les clés de **premier niveau** — elle descend désormais récursivement dans les objets
**et** les tableaux ; (2) une chaîne non analysable comme JSON était **silencieusement acceptée** —
elle est désormais **refusée**. Une barrière qui laisse passer tout ce qu'elle ne sait pas lire
promet plus qu'elle ne tient.

**Et c'est ici qu'est la meilleure illustration du défaut dominant de ce chantier.** Le test qui
« prouvait » cette garde rougissait bien sous sabotage étroit — mais **pour la mauvaise raison** : le
domaine y était monté **sans `tenantContext`**, si bien qu'en retirant `notes` de la liste vérifiée,
l'exécution ne s'arrêtait pas sur le refus clinique mais plantait plus loin sur un `TypeError`.
Rejoué avec un `tenantContext` **réel** — le chemin de production — le même sabotage laissait **le
contenu clinique partir en écriture** : `repository.create` appelé, `"notes":"texte clinique"`
constaté dans l'appel Prisma capturé. La seule barrière du journal contre une fuite clinique
n'était donc éprouvée dans **aucune** condition où elle doit tenir.

*Ce que le code tient aujourd'hui, et par quel test* :
`back/src/test/unit/domain/patientAccessLog.domain.test.ts` monte un `tenantContext` réel, entré par
`ctx.run`, avant d'appeler `record` (« ecrit la ligne, sans identifiant de patient, quand les
criteres construits depuis la requete sont legitimes » ; « refuse meme un export dont les criteres
porteraient une cle clinique importee »). Vérification refaite : en retirant la seule clé `notes` de
la liste, le test nommé « sur le chemin reel » rougit avec `Received promise resolved instead of
rejected` — la garde ne refuse pas, **et c'est la bonne raison**.

**Une seconde ligne de défense, découverte par sabotage et bien réelle.** Le relecteur de la tâche 10
a tenté de faire fuir `exportFilters` par la route plateforme, avec un `...row` étalé et une fixture
portant une valeur marquée. **Rien n'a fui.** Ce qui l'arrête n'est pas seulement la discipline
« champ par champ » de la route — que son sabotage contournait — mais **le schéma Zod de réponse,
sérialisé en mode « strip »**, qui retire toute clé absente de sa forme. La défense en profondeur est
ici réelle, pas déclarative.

*Coût si c'est faux* : du contenu clinique dans un journal d'audit lisible par un rôle qui n'a pas
`clinical:read` — c'est-à-dire l'inverse exact de ce que cette table est censée protéger.

### D13 — Un seul journal à la fois sur l'écran plateforme

`GET /super-admin/access-log` exige un paramètre `source` (`activite` ou `acces`) et ne rend **jamais
les deux à la fois**.

*Motif* : les colonnes des deux journaux ne se recouvrent qu'en partie (`entityType`/`entityID` d'un
côté, `patientId`/`accesParOctroi` de l'autre). Un mélange silencieux masquerait plus qu'il
n'éclairerait un écran de diagnostic. Le DTO a une forme **unique** pour les deux sources, les
champs propres à l'une valant `null` sur les lignes de l'autre — et il est construit **champ par
champ** par la route, jamais par un `...row` étalé.

*Ce que le code tient, et par quels tests* : `back/src/test/e2e/super-admin-access-log.test.ts`
(**quinze** cas, dont « rend les lignes du script d amorcage, que nulle autre route ne peut lire »,
les trois filtres, et « ne rend jamais d identite de patient — seulement des identifiants ») ;
`front/src/routes/_authenticated/super-admin/access-log.test.tsx` côté écran (**seize** cas).

**Ce que la revue finale de branche a changé sur cet écran, et pourquoi ce n'étaient pas des
détails.** Trois défauts se tenaient par la main, et aucun n'était visible en regardant une seule
tâche :

1. **Le filtre « compte » était appliqué dans le navigateur, sur une page bornée à 200 lignes.** Il
   ne pouvait donc que réduire ce qui était déjà rendu : chercher un compte affichait « aucune
   entrée » alors que ses lignes existaient, plus bas dans la table. Le filtre **serveur**
   correspondant existait, était couvert par un test e2e, et **n'était appelé par personne** — il
   n'acceptait qu'un `userID` **exact**, que personne ne tape de mémoire sur un écran de
   diagnostic. Il accepte désormais les deux formes que la saisie produit (identifiant exact **ou**
   fragment de prénom/nom, insensible à la casse, `%`/`_` échappés), et c'est **lui** qui est
   branché. La saisie est différée de 300 ms avant l'envoi : sans cela, chaque frappe déclencherait
   un `ILIKE` sur toute la plateforme.
2. **Les lignes du script d'amorçage redevenaient invisibles** au-delà de 200 entrées — voir
   « Ce qui reste ouvert », §8. Une valeur réservée du filtre d'établissement
   (`SANS_ETABLISSEMENT`, miroir vérifié par un test entre les deux dépôts) les vise désormais.
   Elle n'est proposée que sur `activite` : `PatientAccessLog.establishmentId` est non nullable, et
   le back répond **400** à la combinaison plutôt qu'une liste vide qui se lirait « aucune
   aujourd'hui ».
3. **Le filtre « Action » n'atteignait que 8 des 19 actions réellement écrites.** La tâche 11
   réutilisait le dictionnaire de l'écran d'activité **de service** — vrai de sa provenance, faux de
   sa couverture : cet écran-là ne voit jamais les sept `member.*`, les deux actions d'amorçage,
   `patient.removedFromPathway` (absente depuis l'étape 2, y compris de l'écran de service), ni
   `user.accessLinkReissued` — **la ligne que la tâche 7 existe pour créer**, sur la route la plus
   puissante du système. Les dix-neuf sont couvertes, et
   `back/src/test/unit/utils/access-log-vocabulaire.test.ts` **lie désormais le dictionnaire à la
   source** (clés de `AppEvents` + `ACTIVITY_LOG_SCRIPT_ACTIONS`, et `AccessAction` pour l'autre
   journal), dans les deux sens — ce que les matrices de permissions avaient déjà et que le
   vocabulaire d'actions n'avait pas.

**Le défaut à ne pas répéter, et c'est le quatrième de la liste d'ouverture.** Le rapport de la
tâche 11 faisait passer le **troisième filtre (action)** pour couvert en substituant « source » (le
sélecteur de journal) à « action » (le filtre). Prouvé faux : neutraliser l'envoi du filtre laissait
**les onze tests verts**. Le code était correct ; c'est la couverture et la phrase qui manquaient.
Fermé : le sabotage exact fait désormais rougir **un seul test sur douze**, celui qui le nomme.

*Coût si c'est faux* : un écran de diagnostic sur lequel on ne peut pas se fier à ce qu'on ne voit
pas.

### D14 — Chaque événement déclaré doit **réellement** écrire une ligne, prouvé par exécution

La tâche 7 a trouvé un défaut **totalement muet** : la réémission de lien par le super-admin émettait
bien son événement, la souscription existait bien — mais `/super-admin` tourne **sans aucun store**,
`ActivityLog` est un modèle d'établissement, le garde-fou refusait l'écriture, et le `catch` du
souscripteur réduisait le refus à une ligne de journal applicatif. **Rien n'échouait, rien ne
manquait visiblement ; seule la trace disparaissait.** C'est la même famille que la régression de
l'auteur à l'étape 4a.

Corrigé en encadrant **cette seule souscription** dans `runAsSystem` (pas les onze autres actions du
fichier : les élargir toutes masquerait une **vraie** perte de contexte sur une route de tenant), avec
déclaration du site neuf.

**Et une garde de classe a été ajoutée au dépôt**, parce qu'un garde-fou statique (« chaque événement
déclaré a-t-il une souscription ? ») n'aurait pas attrapé ce défaut-ci : `back/src/test/e2e/activity-log-emissions-declarees.test.ts`
**émet chaque événement déclaré sous le contexte réel de son site d'appel** et exige qu'une ligne
apparaisse, avec une liste d'exemptions **nommée** (vide aujourd'hui). Les événements sont lus depuis
la **source** de `AppEvents`, jamais recopiés à la main : un événement ajouté et oublié fait échouer
ce fichier.

Elle vit en **e2e**, jamais en unitaire : un dépôt bouchonné ne reproduit pas le refus du vrai
garde-fou Prisma, donc un test unitaire attraperait la caricature du défaut, pas le défaut.

*Ce que le code tient* : le sabotage qui retire l'encadrement `runAsSystem` fait rougir **deux
tests**. Avant cette tâche, ce défaut exact ne faisait rougir **rien**.

*Coût si c'est faux* : un espion de plus dans un test, et dix-huit cas e2e supplémentaires. Contre
une trace d'audit qui disparaît sans que rien ne le dise.

### D15 — Une requête `HEAD` n'écrit pas de ligne

Une requête `HEAD` ne rend aucun corps : personne n'a rien lu. Le jumeau qu'en crée
`exposeHeadRoutes` porte pourtant la **même** `routeOptions.url` que la route GET, donc rien d'autre
ne l'en distinguerait.

*Mesuré avant d'être écrit* : aujourd'hui l'application n'expose aucune route HEAD
(`exposeHeadRoutes: false`), et une sonde réelle reçoit 404, zéro ligne. **Ce filtre ne change donc
rien aujourd'hui** ; il rend la propriété indépendante d'un réglage qui tient en un mot ailleurs.
L'implémenteur a refusé d'écrire un test HTTP qui serait vert pour la mauvaise raison ; la propriété
est tenue au niveau du crochet (`back/src/test/unit/interfaces/access-log-hook.test.ts`, « n ecrit
rien pour une requete qui ne rend aucun corps (HEAD) »).

*Motif* : un journal qui enregistre des lectures qui n'ont pas eu lieu induit en erreur autant qu'un
journal qui en manque.

*Coût si c'est faux* : rien aujourd'hui ; un compteur faussé le jour où `exposeHeadRoutes` change.

---

## Ce qui reste ouvert

**Neuf** limites, mesurées et nommées. Aucune n'est un oubli : chacune a été examinée, et la raison
de ne pas la fermer ici est écrite.

*(La revue finale de branche a relevé deux choses sur cette phrase. D'abord l'arithmétique : elle
annonçait **six** limites et en listait **sept** — corrigé. Ensuite, et c'est le vrai point, deux
limites réelles étaient déclarées ailleurs dans le dépôt mais **absentes de ce registre**, qui est
le document désigné comme faisant foi : la **borne de 200 lignes** de l'écran plateforme, et les
**deux colonnes de l'export que personne ne rend**. Elles sont les §8 et §9 ci-dessous. Une limite
écrite dans un commentaire de code mais pas ici est une limite que personne ne relira.)*

### 1. Le garde-fou couvre les routes qui **nomment** un patient, pas celles qui en **rendent** les données

C'est la limite de conception de l'étape, et elle est structurelle : un crochet `onRoute` ne peut
examiner que **la forme de l'URL**. Les deux ensembles diffèrent, et l'écart est réel :

- `GET /patient` — **la liste des patients du service, non journalisée par construction (D1)** —
  renvoie pour chaque patient ses `enrollmentIssues`, **avec leur `reason` en texte libre**
  (`patient.repository.ts#findAll`, `patientResponseSchema`). C'est-à-dire exactement ce qui a
  justifié de créer une quatrième action pour la route dédiée.
- une lecture de rendez-vous embarque les patients inscrits, dont le champ clinique
  `transmissionNotes` (`appointmentPatient.schema.ts`, `utils/clinical-fields.ts`).

**Ce n'est pas un défaut d'implémentation, c'est le périmètre choisi** (D1 : le journal trace le
dossier identifié, pas toute lecture identifiante). Mais la phrase « toute consultation d'un dossier
laisse une trace » **serait fausse** si on l'étendait à « toute lecture de données de patient », et
c'est écrit ici pour qu'on ne l'étende pas.

### 2. Résidu de détection : un segment inédit avec un nom de paramètre inédit

`/dossier/:id` n'est attrapé **ni** par la règle structurelle (`/patient/` + paramètre) **ni** par le
filet par nom (`:patientId`). `/dossier/:patientID` l'est, par le second. Fermer ce résidu exigerait
d'imposer la déclaration de **toute** route GET à paramètre sous le greffon de tenant : défendable,
mais un arbitrage qui dépasse cette étape. Voir D8.

### 3. Sous contexte de **tenant**, l'écriture plate sur une racine globale reste ouverte

`Establishment.deleteMany({})`, `Establishment.update({ where: { id: unAutre }, data: … })` et
`User.updateMany({ data: { isSuperAdmin: true } })` **passent toujours** sous un contexte de tenant
ordinaire, faute de colonne de tenant à comparer sur un modèle global. Le contexte `superadmin` a sa
table (`SUPERADMIN_GLOBAL_OPERATIONS`), « aucun contexte » a désormais la sienne (D7) ; **le contexte
tenant n'en a toujours pas**. Préexistant, hors périmètre, et un test le constate explicitement.

### 4. Une écriture **déclarée** n'est bornée ni par la ligne ni par la colonne

`NO_CONTEXT_GLOBAL_OPERATIONS` déclare des couples (modèle, opération) ; elle ne dit **rien** de ce
que l'écriture touche. Mesuré, sans contexte :

| Forme | Verdict |
|---|---|
| `User.update({ where: { id }, data: { isSuperAdmin: true } })` | **passe** |
| `User.update({ data: { isSuperAdmin: true } })` (sans `where`) | **passe** |
| `AccessLink.updateMany({ where: {}, data: … })` | **passe** |
| `User.updateMany({ where: {}, data: { isSuperAdmin: true } })` | refusé |

Autrement dit : le défaut emblématique est fermé **en masse**, son jumeau **ligne à ligne** ne l'est
pas. Ce n'est **pas exploitable aujourd'hui** — vérifié route par route — mais c'est une propriété
des **appelants**, pas de la table : `registerSchema` (Zod) dépouille les clés inconnues du corps, et
`PATCH /me` déstructure explicitement `firstName`/`lastName`. **À une ligne d'appel près.**

Et **ne jamais lire « n'écrit que des colonnes scalaires » comme une garantie** : `isSuperAdmin` **est**
une colonne scalaire. Fermer ce point demanderait une table d'un autre genre — (modèle, opération,
colonnes permises) — que ni `SUPERADMIN_GLOBAL_OPERATIONS` ni celle-ci ne portent.

### 5. Tout événement futur émis depuis une route non-tenant sera refusé et **avalé**

Le mécanisme de la tâche 7 (D14) est fermé **pour l'existant** : les dix-sept événements déclarés
(`AppEvents`, `utils/app-event-bus.ts`) sont classés, chacun sous le contexte réel de son site
d'appel, et la garde dynamique le prouve par exécution. **Le piège reste armé pour ce qui n'est pas encore écrit** : un événement futur émis depuis
`/auth`, `/me` ou `/super-admin` sera refusé par le garde-fou, et le `catch` du souscripteur réduira
le refus à une ligne de journal applicatif. Rien n'échoue, rien ne manque visiblement — **seule la
trace disparaît**. La garde dynamique rougira, ce qui est le point ; mais elle rougit au moment où
l'on ajoute l'événement, pas au moment où la trace manque en production.

### 6. La purge n'a **ni verrou entre instances, ni signal si elle échoue en boucle**

Deux constats hérités, **non aggravés** par cette étape, qui s'appliquent désormais aux **deux**
journaux :

- **Aucun signal si la purge échoue à chaque exécution.** Le `catch` journalise la classe de l'erreur
  et continue. Une purge qui ne purge jamais laisse les deux journaux croître indéfiniment —
  **symétrique exact du risque surveillé** (une rétention à zéro qui vide tout), et tout aussi muet.
  Rien ne compare le nombre supprimé à une attente, rien n'alerte.
- **Aucun verrou entre instances.** Chaque instance planifie sa purge et l'exécute au démarrage. Sans
  corruption (la suppression est idempotente), mais avec du travail redondant. *Nuance vérifiée en
  écrivant ce document* : `NODE_CLUSTER` est transmis au conteneur par les deux fichiers de
  composition mais **n'est lu nulle part dans `back/src`** — il n'y a donc aujourd'hui qu'un seul
  processus, et cette limite ne mord que le jour où le service serait mis à l'échelle.

### 7. `runAsSuperAdmin` n'est énuméré par rien

**Quatorze sites d'appel dans `src/main`** au moment d'écrire ce document (recomptés : 1 dans
`establishment.domain.ts`, 4 dans `accessGrant.repository.ts`, 1 dans `activityLog.repository.ts`,
7 dans `establishment.repository.ts`, 1 dans `patientAccessLog.repository.ts`). Douze avant cette
étape ; les deux ajoutés sont les `findAllPlatformWide` des deux dépôts de journaux.

**Aucune liste nommée nulle part.** La liste d'autorisation de `runAsSystem-unicite.test.ts` existe
pour `runAsSystem` seul. Un quinzième appel ajouté n'importe où dans `src/main` laisse tous les
contrôles de ce fichier verts. Seule sa **construction** est unique (un `run`, un littéral
`{ kind: "superadmin" }`, confinés à `tenant-context.ts`), ce qui ferme une seconde voie d'entrée mais
pas « qui a le droit de l'invoquer une fois dedans ».

**C'est défendable** — les tables `SUPERADMIN_OPERATIONS`/`SUPERADMIN_GLOBAL_OPERATIONS` bornent ce
qu'on peut y faire, donc un quinzième site ne peut pas à lui seul élargir les droits — **mais c'est
une garantie différente de « chaque site est nommé et justifié »**, et le vocabulaire alentour ne doit
pas se lire comme promettant la seconde. Lacune préexistante, **aggravée de deux sites par cette
étape**, et dite ici plutôt que tue.

### 8. L'écran plateforme ne rend jamais plus de **200 lignes**, et rien ne permet de remonter plus loin

`PLATFORM_ACCESS_LOG_LIMIT` vaut **200** dans les deux dépôts de journaux, le tri est
`createdAt desc`. Au-delà de 200 lignes dans le périmètre demandé, **les plus anciennes sortent de
la réponse**, et **aucune pagination ne permet d'y revenir**. La seule façon de les atteindre est de
**resserrer les filtres** jusqu'à ce que le périmètre tienne sous la borne.

**Ce que cela a réellement cassé, et qui n'avait pas été vu** (revue finale de branche) : les lignes
du script d'amorçage sont, par construction, **les plus anciennes de la table**. Passé 200 entrées
dans le journal d'activité, elles tombaient hors de la page — et **aucun filtre ne permettait de les
viser**, le filtre d'établissement ne sachant pas demander « sans établissement » et la liste
déroulante ne proposant que des établissements réels. La documentation présentait pourtant cette
lisibilité comme **acquise** (« l'un des deux trous que cet écran ferme », § 9 du guide de
vérification) : elle ne l'était que sur un journal jeune.

**Trois choses ont changé, aucune ne supprime la borne** :
- le filtre **compte** est désormais évalué **en base** et non dans le navigateur (il l'était : il
  ne pouvait donc que réduire une page déjà tronquée, et rendait « aucune entrée » pour un compte
  dont les lignes existaient) ;
- le filtre d'établissement accepte une valeur réservée, **« Sans établissement »**, qui vise
  exactement les lignes d'amorçage ;
- la borne est **déclarée** — ici, et dans les deux fichiers qui la portent.

**Pourquoi pas une pagination** : c'est l'arbitrage rendu, et il mérite d'être écrit plutôt que
supposé. Une pagination sur cette route demanderait un curseur stable (`createdAt` n'est pas unique),
un total, et une pagination côté écran pour les deux sources — un chantier qui dépasse une passe de
revue, sur un écran de **diagnostic** dont le besoin réel est « retrouver les lignes de X », auquel
un filtre serveur répond mieux qu'un défilement de pages. **Si le journal devient un outil
d'investigation rétrospective plutôt que de diagnostic, c'est cette décision-là qu'il faut rouvrir**,
pas la valeur 200.

*Coût si c'est faux* : un écran d'audit qui affirme « aucune entrée » là où il devrait dire « pas
dans les 200 dernières ». La distinction n'est pas affichée aujourd'hui — l'écran ne signale pas
qu'il a tronqué.

### 9. Deux colonnes de l'export ne sont rendues par **aucune** lecture ni **aucun** écran

`PatientAccessLog.exportCount` (le nombre de dossiers rendus par un export) et
`exportFilters` (ses critères, en JSON) sont **écrits** à chaque export — c'est tout l'objet de la
tâche 4 — et **lus par personne** : ni la lecture de service, ni celle d'établissement, ni celle de
la plateforme ne les portent dans leur schéma de réponse, et aucun écran ne les affiche. Une ligne
d'export s'affiche donc aujourd'hui comme « Export », sans son ampleur ni son périmètre.

**Les deux ne relèvent pas du même arbitrage, et c'est le point** :
- **`exportFilters` est exclu pour une raison de fond, qui tient** : c'est le seul champ de texte
  libre de la table, il peut porter un nom de patient (`search`), et le domaine ne le laisse passer
  qu'après avoir refusé toute clé clinique. L'exposer demanderait de décider *à qui*, et sous quelle
  permission. **À garder fermé par défaut.**
- **`exportCount` est un nombre, et rien d'autre.** L'argument qui a fait exposer `accesParOctroi`
  au tour de correction 1 de la tâche 10 s'applique **mot pour mot** : « ce n'est ni un contenu
  clinique, ni une identité », et « une colonne écrite sur chaque ligne mais lue par personne est
  précisément la classe de défaut que cette étape existe pour fermer ». Savoir qu'un export a rendu
  **3** dossiers ou **4 000** est exactement ce qu'un auditeur regarde en premier.

**Ce n'est pas corrigé ici**, parce que l'exposer touche trois schémas de réponse, trois écrans et
leurs tests — et parce que l'écart avec `accesParOctroi` est un **écart d'arbitrage**, pas un défaut
de code : personne n'a jamais tranché sur ce champ-là. C'est donc posé ici comme **question ouverte
et nommée** plutôt que décidée en passant. Le registre du « ce qui reste ouvert » est le document
qui fait foi ; il le disait dans un commentaire de schéma, il le dit maintenant ici.

*Coût si c'est faux* : le journal sait combien de dossiers sont sortis et ne le dit à personne.

---

## Annexe — ce qui s'est révélé faux en chemin

Ce chantier a été conduit avec un registre de tâches et des revues systématiques. Les corrections
ci-dessous sont celles où **une consigne, un rapport ou un commentaire du dépôt disait faux**, et où
le code a tranché. Elles sont listées parce que la prochaine étape rencontrera les mêmes pièges.

1. **« Le composite est impossible » (commentaire de `schema.prisma`, `EstablishmentMembership`)** —
   faux. Vérifié par édition temporaire du schéma, `prisma validate` et `prisma generate` : Prisma
   accepte une relation composite dont un seul champ référent est nullable. Le commentaire a été
   corrigé **à sa source**, avec la mesure et le coût de laisser la relation simple.
2. **« Toujours `await` À L'INTÉRIEUR du rappel »** — l'adage le plus répété du dépôt, et il était
   imprécis. Reformulé **trois fois** sur ce chantier ; l'énoncé exact est en tête de `back/CLAUDE.md`
   et rappelé plus bas dans cette annexe.
3. **Le balayage de monotonie voyait un cinquième de moins qu'il n'annonçait** — il ignorait la
   profondeur 0 (les formes nues, sans `include`) et **quatre verbes** sur dix (`delete`, `deleteMany`,
   `updateMany`, `upsert`). Or `Establishment.deleteMany({})` nu est exactement la forme que la tâche 9
   modifiait. Élargi, il compare **100 249 450 cas** contre 80 198 400 à profondeur 9 — **vingt
   millions de cas d'écart** — toujours **zéro refus perdu**. Son en-tête présentait l'espace comme
   complet ; il nomme désormais ce qui reste dehors.
4. **« ~1 800 verdicts assouplis contre `main` »** — chiffre hérité de l'étape 4a, faux sur **trois**
   plans. Mesure refaite en écrivant ce document (`MONOTONIE_REF=main`, profondeur 4, 4 016 chaînes,
   **202 250 cas**) : **349 refus perdus**, répartis `{tenant: 315, superadmin: 34}`, **zéro sans
   contexte** (la tâche 9 a refermé cette famille entière), et **349 sur 349** dus à `PatientAccessLog`
   — un modèle de l'étape **4b**, pas aux deux tables de l'étape 4a. Vérifié par filtrage de la liste
   complète, pas sur un échantillon. Ajouter un modèle assouplit forcément des verdicts : la seule
   question qui vaille est de savoir lesquels.
5. **« Une vingtaine de chemins »** (justification du rejet de la reclassification du modèle) —
   artefact d'affichage, le test imprimait `slice(0, 20)`. La mesure réelle est **855 cas, 110 chemins
   distincts**, et le contexte tenant **ordinaire** est touché lui aussi. Conclusion juste, argument
   sous-dimensionné quarante fois.
6. **« Quatre emplois de `SuperAdminAccessGrant` »** puis cinq noms listés à la ligne suivante, et il
   en existait un **sixième**. Cause exacte, qui vaut d'être connue : le motif de recherche employé
   pour l'énumération se brisait sur le **retour à la ligne** que le formateur insère entre le modèle
   et le verbe. Cette énumération servait de contre-vérification à une mesure ; un motif qui rate un
   site rend la contre-vérification muette. Deux leçons distinctes : l'une se corrige avec un meilleur
   outil de recherche, l'autre en relisant ce qu'on vient d'affirmer.
7. **Deux sabotages du plan ne pouvaient pas rougir** — (a) sur le chemin HTTP, « tenant absent »
   implique 404, donc la garde de statut sort déjà : la condition était morte ; (b) `onResponse`
   s'exécute après le départ du corps, donc une assertion `not.toHaveProperty('stack')` y est vraie par
   construction.
8. **`GET /patient/export` dans le plan** — le plan comptait quatre routes GET portant un identifiant
   de patient ; il y en a **sept** (manquaient les deux du diagnostic éducatif et celle des problèmes
   d'inscription).
9. **`loadConfig()` ne prenait aucun argument** alors que le test littéral d'un brief l'appelait avec
   un objet. Corrigé en ajoutant un paramètre optionnel (`process.env` par défaut) plutôt qu'en
   réécrivant le test — injectable pour éprouver une rétention absurde sans toucher au `process.env`
   du processus de test.
10. **Le chemin de fichier prévu pour le premier écran de front** aurait rendu l'écran **silencieusement
    invisible** : la fiche patient ne rend jamais d'`<Outlet/>`, l'écran serait devenu un enfant jamais
    affiché. Restructuré en `index.tsx`, après lecture de la source du routeur.
11. **`access-log:read` n'a pas été créée par cette étape** — elle est sur `main` depuis la première
    version de `permissions.ts`. Une recherche `git log -S` avait induit en erreur.

*Et ce que la **revue finale de branche** a trouvé faux à son tour, sur du texte que les tours
précédents avaient pourtant relu :*

12. **La garde dynamique des événements échouait OUVERT** — c'est-à-dire de la façon exacte contre
    laquelle elle existe. Son motif de lecture, ligne par ligne, exigeait l'accolade fermante **sur
    la même ligne** ; un événement déclaré sur quatre lignes — la forme que le formateur produit
    dès que la charge dépasse la largeur de ligne, et un événement existant fait déjà 87 caractères
    — n'était **pas vu du tout** : ni classé, ni exempté, ni signalé. Prouvé par exécution : un
    événement à trois champs ajouté sur quatre lignes laissait le fichier **18/18 vert**, alors que
    son en-tête promettait le contraire en toutes lettres. La lecture **équilibre** désormais les
    accolades, et `EXEMPLE_MULTILIGNE` le tient par un test qui **est** le contre-exemple.
13. **Le sens inverse des deux listes de routes n'était tenu par rien.** Les deux contrôles
    d'entrée morte étaient éprouvés **comme fonctions**, sur des tableaux fabriqués ; rien ne
    vérifiait qu'ils soient **appelés** au démarrage. Mesuré : commenter **l'un ou l'autre** des
    deux appels dans son `onReady` laissait **557 unitaires et 268 e2e verts**. Le sens aller, lui,
    rougissait bien — et la documentation écrivait « les entrées mortes des deux listes font
    échouer le démarrage à leur tour » : vrai dans le code, tenu par rien. Quatre cas de câblage le
    tiennent maintenant, et les deux sabotages rougissent chacun sur son propre test.
14. **L'énoncé du piège Prisma était périmé là où il faisait autorité.** `utils/tenant-context.ts`
    se présentait comme « la source corrigée » et portait encore l'énoncé **intermédiaire**
    (« ce qui tient la propriété, c'est l'enrobage `async` »), que ce document et `back/CLAUDE.md`
    nomment comme un symptôme depuis la tâche 6. Pire : cette généralisation est **contredite par un
    appelant de production quarante lignes plus loin** — la purge existante utilise un rappel
    synchrone nu et fonctionne. Le risque allait dans le mauvais sens : qui croit l'enrobage
    suffisant placera la lecture **après** une attente. Corrigé aux trois endroits qui le portaient
    encore (`tenant-context.ts`, et les deux `findAllPlatformWide`), plus le commentaire de la purge
    neuve qui s'en servait pour justifier de s'écarter de sa voisine.
15. **Une entrée « au cas où » dans la capacité super-admin.** `PatientAccessLog` était déclaré
    `['findMany', 'count']` « par symétrie » avec `ActivityLog` ; `count` n'était exercé par **aucun
    appel** de `src/main`. La discipline posée à la tâche 9 est écrite au-dessus de la table
    voisine : « une entrée sans route est une entrée à supprimer ». Retiré.
16. **Une énumération périmée, au même endroit et pour la même raison qu'il y a cinq tâches.** La
    raison d'exemption de la route de lecture énumérait « uniquement l'auteur, l'action, la date et
    le service » — la liste du cahier des charges de la tâche 5, périmée depuis que la tâche 10 a
    exposé `accesParOctroi`. C'est **la phrase même** qui avait rendu ce champ invisible cinq tâches
    durant, recopiée dans un commentaire et laissée derrière le code qu'elle décrit.
17. **La liste numérotée des emplois de `runAsSystem` n'avait jamais intégré le site de la tâche
    7**, et mélangeait deux unités de compte (« emplois déclarés » et « appels »). Le site était
    pourtant bien déclaré dans `AUTORISES` depuis son commit : c'est la **prose** qui avait dérivé,
    et un commentaire de `starter.ts` parlait d'un « septième emploi déclaré » qui n'existe pas
    (six emplois, huit appels).
18. **L'énumération de l'Important n°2 de la consigne était elle-même incomplète** — voir le
    rapport de revue : elle listait dix actions manquantes (sept `member.*`, deux d'amorçage,
    `user.accessLinkReissued`) pour un écart de **onze**. La onzième,
    `patient.removedFromPathway`, manquait **aussi à l'écran de service**, depuis l'étape 2. Le
    contrat de vocabulaire l'a trouvée, pas la relecture.

**L'énoncé corrigé du piège Prisma, puisqu'il a fallu trois tours pour l'obtenir.** Une requête Prisma
est **paresseuse**. Ce qui fait perdre le contexte n'est pas l'absence du mot-clé `await`, et ce n'est
pas non plus exactement la présence de l'enrobage `async` :

> **Ce qui compte, c'est que la lecture du contexte survienne AVANT le premier point de suspension.**

Un rappel **synchrone** convient parfaitement s'il lit le contexte tout de suite : `deleteOlderThan`
(les deux dépôts de journaux) appelle `tenantContext.peek()` **synchroniquement en tête de son corps**,
avant tout `await`, et la propriété tient. Un rappel `async` ne protège de rien s'il lit **après** une
attente. L'énoncé intermédiaire — « c'est l'enrobage `async` qui tient la propriété » — était plus
juste que le premier (« toujours `await` à l'intérieur ») mais décrivait un **symptôme** : l'enrobage
`async` marche parce qu'il fait passer la valeur rendue par une résolution de promesse que Node
rattache à la portée active, ce qui revient à ne pas suspendre avant d'avoir lu. La convention du
dépôt reste d'écrire un rappel `async` avec un `await` interne — mais pour une raison **différente de
celle qu'on croyait** : la règle Biome `suspicious/useAwait` refuse un rappel `async` sans aucun
`await`, et un rappel qui ne suspend jamais se lit mal à côté de ses voisins. La pratique était bonne,
le motif était faux.
