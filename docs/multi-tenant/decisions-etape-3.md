# Décisions de l'étape 3 (dossier patient par service)

Ce document conserve les décisions prises pendant la conception et l'exécution
de l'étape 3, telles qu'elles ont été consignées au fil du chantier dans
`progress.md` (le registre de tâches, git-ignoré, qui disparaît avec l'espace
de travail). Il fait pour l'étape 3 ce que `decisions-etape-1.md` et
`decisions-etape-2.md` font pour les étapes précédentes.

**Cette étape a une particularité que les deux précédentes n'avaient pas :
c'est la seule qui déplace des données de santé déjà écrites.** Les étapes 1
et 2 ajoutaient des colonnes ou déplaçaient du code ; celle-ci recopie puis
supprime. Le retour arrière n'est pas un correctif de code mais une
restauration de sauvegarde, avec perte de tout ce qui a été saisi entre-temps
(voir `deploiement-etape-3.md`). Chaque décision ci-dessous a été prise sous
cette contrainte.

Documents liés :

- `docs/superpowers/specs/2026-09-24-multi-tenant-etape-3-dossier-patient-design.md` — la spécification de cette étape
- `docs/multi-tenant/decisions-etape-1.md`, `decisions-etape-2.md` — les décisions des étapes précédentes
- `docs/multi-tenant/habilitations.md` — les rôles et la matrice de permissions, qui fait foi
- `docs/multi-tenant/deploiement-etape-3.md` — la procédure de déploiement issue de ces décisions
- `docs/multi-tenant/verification-etape-3.md` — la vérification manuelle
- `back/CLAUDE.md`, `front/CLAUDE.md` — les conventions qui en découlent

---

## Les trois décisions de métier, prises avec Léo avant exécution

Trois choix de conception n'appartiennent pas à l'exécutant du chantier — ils
ont été tranchés avec Léo avant que la première tâche ne commence
(« Ruling préalable 1 »). Coût s'ils sont faux : ce sont ses
choix, pas ceux de l'exécution.

- Un second service qui prend en charge un patient déjà suivi ailleurs part
  d'un sous-dossier **entièrement vide**, mais un signal lui indique qu'un
  autre existe, sans dire lequel.
- Le secrétariat voit le sous-dossier exactement comme il voit le patient
  aujourd'hui : trois champs cliniques masqués sur seize (`notes`, `details`,
  `medicalDiagnosis`), le reste — jugé administratif — reste visible. Aucune
  permission nouvelle.
- L'écran sépare visiblement l'identité partagée entre services du dossier
  propre au service courant, pour qu'une note ne soit jamais prise pour
  visible de tous, ni une profession pour invisible d'un service à l'autre.

## D1 — La ligne de partage entre ce qui reste sur le patient et ce qui déménage

**Motif.** Seize colonnes — parcours, diagnostic médical, notes, bilan de
sortie — partent dans `PatientServiceFile`, une table par patient et par
service (`patientId`, `serviceId`, `establishmentId`, seize colonnes, unique
`(patientId, serviceId)`). Restent sur `Patient` : l'identité et le contact
(`firstName`, `lastName`, `gender`, `birthDate`, `phone1`, `phone2`, `email`)
et le contexte socio-démographique (`distance`, `educationLevel`,
`occupation`, `currentActivity`, `createDate`). Le critère n'est pas
arbitraire : la profession ou le niveau d'études d'une personne ne changent
pas d'un service à l'autre, son diagnostic et ses notes, si — c'est cette
ligne que l'écran (2.3 ci-dessus) doit aussi rendre lisible visuellement, pas
seulement dans le schéma.

`DiagnosticEducatif` et `EnrollmentIssue`, qui portaient déjà un `serviceId`
mais pointaient vers `Patient` par une clé composite d'établissement, sont
rattachés au **sous-dossier** plutôt qu'au patient. Cela ferme une
incohérence : deux modèles de service dépendaient d'un parent d'établissement.
Après l'étape, la chaîne de suppression est homogène : patient → sous-dossier
→ enfants (tâche 6).

**Coût si faux.** La liste des seize colonnes recomptée deux fois
indépendamment contre le schéma (tâche 1, revue) et de nouveau à la tâche 4 —
si un champ clinique était resté sur `Patient`, il resterait visible de tous
les services de l'établissement ; si un champ administratif avait migré à
tort, une saisie faite dans un service ne se répercuterait pas dans un autre
alors qu'elle le devrait.

## D2 — Le sous-dossier vide avec signal de suivi ailleurs est une fuite d'information délibérée et bornée

**Motif** (« Ruling préalable 2 », tâche 2). Le fait qu'une personne
soit suivie dans un autre service est, au sens large, une donnée de santé. La
spécification (§2.1, §5.3) l'exige néanmoins : sans lui, un soignant croirait
découvrir un dossier neuf plutôt que de savoir qu'un collègue le suit déjà.
Décision : borner strictement ce que le signal révèle à un **booléen** — ni
nom de service, ni nombre, ni date, ni contenu — et exiger un test prouvant
qu'aucune autre lecture du dépôt ne traverse cette frontière entre services.

**Ce que la fuite coûte si elle n'est pas bornée.** Une exception à une règle
de cloisonnement qui n'est pas strictement contenue tend à se banaliser et à
devenir la règle — c'est le motif même du ruling. Concrètement, la fonction
qui calcule le signal (`estSuiviAilleurs`, `patientServiceFile.repository.ts`)
est la **seule** lecture de tout le dépôt qui traverse volontairement la
frontière de service, elle s'exécute dans le mode encadré du garde-fou d'ORM
(`runAsSystem`) réservé aux traitements hors requête — et ne ramène qu'une
colonne. **Le mode `runAsSystem` retire l'exigence du garde-fou, il ne la
déplace pas** (voir le commentaire en capitales à
`patientServiceFile.repository.ts:131-138`) : sous ce mode, le garde-fou
n'exige plus aucun filtre de service ni d'établissement, et la requête
pourrait donc lire tous les établissements si on la laissait faire. La sûreté
vient **entièrement** des deux bornes que la requête porte à la main
(`establishmentId`, `serviceId: { not }`), capturées avant d'entrer dans le
mode — sans modifier le garde-fou lui-même, qui reste inchangé pour tout le
reste du dépôt. Vérifié au journal Postgres par la revue de la tâche 7 : la
requête inter-service ne ramène jamais une ligne de sous-dossier, à comparer
aux vingt et une colonnes que ramène la lecture du sous-dossier propre au
service. Même une erreur provoquée délibérément sur cette requête ne fait
fuiter ni son contenu ni sa ligne : 500 générique, journal réduit à la classe
et à la pile.

## D3 — Le signal n'est rendu que si le service courant possède déjà un sous-dossier pour ce patient

**Motif** (tâche 13, Critique + Ruling). C'est la correction la
plus importante de l'étape sur ce point précis, trouvée par la rencontre de
deux tâches par ailleurs justes isolément. La recherche d'identité (tâche 13)
tient sa promesse à la lettre : elle ne rend que quatre champs d'identité,
aucun canal indirect par le nombre, l'ordre ou le temps. Mais elle rend
l'identifiant du patient, et `GET /patient/:id` porte `followedElsewhere`
depuis la tâche 7. Deux requêtes, sans aucun rattachement : un membre du seul
service B apprenait qu'un patient est suivi en A — y compris avec un compte
en lecture seule qui ne fait que chercher un nom. La tâche 13 n'ouvrait pas la
route : elle **armait** une fuite jusque-là latente en rendant l'identifiant
atteignable.

**Décision.** `followedElsewhere` n'est calculé et rendu que si le service
courant possède **déjà** un sous-dossier pour ce patient. Depuis la tâche 12
(D6 ci-dessous), tout patient créé ou rattaché dans un service y a un
sous-dossier : la condition recouvre donc exactement « ce patient est chez
moi », et la propriété de la spécification §6 redevient vraie — trouver
quelqu'un ne révèle jamais que son identité.

**Coût si faux, ou si la condition régresse.** Chercher un patient
révélerait, à qui a seulement le droit de le trouver, qu'il est suivi ailleurs
— exactement l'inverse de ce que D2 borne. Le sabotage le plus instructif du
chantier (tâche 13) montre que cette garantie est fragile à démonter à moitié :
élargir la sélection SQL d'une colonne laisse la suite verte ; retirer le
schéma de réponse aussi ; **les deux ensemble** font rougir la suite. Ce qui
est réellement tenu, c'est le corps HTTP — le bon choix, mais une conséquence
qu'aucun commentaire ne documentait avant cette étape.

## D4 — Le refus de migrer un établissement à plusieurs services, et celui qui n'en a aucun

**Motif** (« Ruling préalable 3 », spec §4.1). Un patient peut
être actif dans plusieurs services (rendez-vous, diagnostics, inscriptions) ;
ses seize colonnes, elles, sont uniques. Répartir au jugé entre deux services
produirait une perte silencieuse de notes cliniques — le pire résultat
possible sur des données de santé. La migration refuse donc de s'exécuter :

- si un établissement ayant au moins un patient possède **plus d'un**
  service — y compris les services désactivés, décision assumée et non un
  oubli : un service désactivé peut porter de l'historique d'un patient, et
  choisir à la place de l'exploitant lequel des deux services doit le
  recevoir est exactement ce que cette garde existe pour empêcher (message
  explicite sur ce point, pour qu'un exploitant ne le prenne pas pour une
  fausse alerte) ;
- si un établissement ayant au moins un patient possède **zéro** service —
  sans service, aucun sous-dossier ne peut être créé, les seize colonnes
  seraient supprimées sans recopie.

Les deux gardes sont la toute première instruction du fichier de migration,
avant même la création de la table : si l'une lève, rigoureusement aucune
donnée n'a été touchée, pas même par la création d'une table vide. Chaque
message nomme les établissements et services fautifs, pour qu'un opérateur
puisse agir sans requête supplémentaire.

**Coût si faux.** Un refus au déploiement là où une répartition automatique
aurait pu, par chance, retomber juste — contre une perte silencieuse de
notes cliniques dans l'autre sens. Le refus est le seul comportement
défendable ici ; c'est le cas en production aujourd'hui (un seul service par
établissement) et cela le restera tant que l'étape 4 n'aura pas donné le
moyen d'en créer un second depuis l'interface.

## D5 — Les invariants portent une empreinte par colonne, pas un comptage de lignes

**Motif** (« Ruling préalable 4 », spec §4.3). À l'étape 1, les
lignes se déplaçaient d'une table à l'autre : un comptage de lignes avant et
après suffisait à démontrer qu'aucune n'avait disparu. Ici, **les lignes
restent, seules les valeurs changent de table** : un comptage resterait vert
sur une migration qui aurait recopié des colonnes entièrement vides, ou
décalé une ligne d'un patient sur l'autre.

**Décision.** Les fichiers d'invariants (`back/prisma/checks/dossier-patient*.sql`)
comparent, pour chacune des seize colonnes : le nombre de valeurs non nulles
avant et après (présence), et une **somme de contrôle MD5** sur le contenu
textuel de chaque colonne, agrégé dans un ordre stable (par `patientId`).
C'est le seul contrôle qui attrape une recopie décalée d'une ligne — deux
patients aux seize valeurs distinctes suffisent à le prouver, et c'est
exactement ce qui a été fait : le décalage d'une ligne entre deux patients
laisse les seize **comptages** rigoureusement identiques et fait virer les
seize **empreintes**.

Deux détails de la mesure, sans lesquels elle mentirait :

- la sentinelle (`E'\x01'`) qui représente une valeur nulle dans l'agrégat, et
  le séparateur (`E'\x02'`) entre deux valeurs, sont des octets de contrôle
  et non des caractères imprimables (`~`, `|`) : avec un caractère saisissable,
  une valeur `NULL` et la valeur littérale `'~'` produiraient la même
  empreinte, et `string_agg('a|b','c')` collisionnerait avec
  `string_agg('a','b|c')` — deux pertes de données invisibles à la mesure.
  Trouvé et corrigé au premier tour de revue de la tâche 3 ;
- le motif de comparaison des libellés ne doit pas capter par préfixe : une
  correction faite dans le plan lui-même (« Patients sans sous-dossier »
  captée à tort par un préfixe trop large produisait un écart sur une
  migration **parfaite** — précisément le défaut que la procédure de
  déploiement de l'étape 1 avait déjà identifié comme le plus coûteux sous
  tension : un faux écart déclenche un retour arrière inutile).

Une **garde de non-régression structurelle** s'y ajoute, distincte des
invariants sur les valeurs (tâche 6) : après avoir fait pointer les enfants
(`EnrollmentIssue`, `DiagnosticEducatif`) vers le sous-dossier plutôt que vers
le patient, `prisma migrate diff` doit ne plus rien proposer entre le schéma
et la base. Sans cette garde, une dérive silencieuse serait passée inaperçue
— constaté une fois en tâche 6 : les deux anciennes clés étrangères vers
`Patient` étaient encore en base bien que retirées du schéma Prisma, et
seule cette comparaison directe l'a révélé.

**Coût si faux.** Aucun : l'empreinte est strictement plus forte qu'un
comptage de lignes et ne peut jamais masquer une perte qu'un comptage aurait
vue.

## D6 — La création d'un patient crée son sous-dossier, et le coût est assumé

**Motif** (tâche 12). La spécification (§5.1) dit que le
sous-dossier est créé « à la première écriture, et à l'inscription d'un
patient dans un parcours du service ». Le relevé de la tâche 5 a montré que
ces deux chemins ne couvrent pas la création directe d'un patient (« Créer
sans parcours ») : un patient ainsi créé ne recevait **aucun** sous-dossier
et disparaissait de la liste de **tout** service, y compris celui où il
venait d'être créé — une perte d'accès à un dossier de santé, sur un chemin
qui existe dans l'interface, éprouvée par la tâche 12 (liste à zéro élément
juste après la création).

**Décision.** `PatientDomain.create` appelle désormais `ensureExists`, comme
le font déjà l'inscription à un parcours et la création d'un diagnostic
éducatif. Créer un patient depuis un service, c'est le suivre dans ce
service ; un patient invisible partout est strictement pire qu'un signal de
suivi qui s'allume à tort.

**Coût assumé, et il est irréversible.** Un sous-dossier créé par erreur dans
le mauvais service — par exemple via « Créer sans parcours » depuis le
mauvais onglet — reste **vide et irréversible** : aucune route ne supprime un
sous-dossier (voir la liste des limites connues, ci-dessous), seule la
suppression du patient entier le ferait. Ce sous-dossier vide allumera le
signal « suivi ailleurs » (D2/D3) pour les autres services qui suivent
réellement ce patient. Décision assumée en connaissance de cause : entre une
trace de trop et un dossier introuvable, la trace de trop est le moindre
mal — et elle, au moins, se voit et peut se signaler à un collègue.

## D7 — L'exception de lecture inter-services : unique, et le test qui tient son unicité

**Motif.** La spécification (§5.3) exige que l'unique lecture qui traverse la
frontière entre services soit « unique, étroite et déclarée », et que le
test qui la garde vérifie une **capacité**, pas seulement un nom. Le premier
tour de revue de la tâche 7 a démontré la différence : sur six sabotages du
test d'unicité (`back/src/test/unit/infra/runAsSystem-unicite.test.ts`),
trois passaient — `.runAsSystem.bind(ctx)`, une **nouvelle méthode** de
`TenantContext` faisant elle-même `storage.run({ kind: 'system' }, fn)`, et
un espace avant la parenthèse — et la forme `bind` désarmait réellement le
garde-fou, prouvé par exécution : un `findMany` sans aucun filtre passait.

**Décision.** Le test surveille désormais deux volets : la référence à la
méthode, **et** la construction du store système elle-même. Vérifié à chaque
tâche suivante (8, 9, 13) : toujours exactement **deux** emplois de
`runAsSystem` en production — le signal de suivi ailleurs
(`patientServiceFile.repository.ts`) et la purge planifiée du journal
d'activité (`starter.ts`, antérieure à cette étape) — tous deux sur la liste
autorisée du test.

**Coût si faux.** Une exception à une règle de cloisonnement qui se laisse
contourner par un simple renommage ou une méthode jumelle n'est plus une
exception : c'est un trou dans le garde-fou qui porte le nom d'une garantie.

## D8 — L'écriture du sous-dossier est en `PATCH`, jamais en `PUT`, et un vrai `PUT` serait dangereux ici

**Motif** (tâche 5, deux Rulings). Les seize champs du sous-dossier sont tous
facultatifs dans le corps de la requête, et le dépôt (`update: params`) laisse
Prisma ignorer toute clé absente : une charge partielle produit une mise à
jour partielle — ce qu'un `PUT` ne promet pas, et ce que `PATCH` promet par
convention. Route concernée :
`fastify.patch<...>('/', …)` dans `back/src/main/interfaces/http/fastify/routes/patientServiceFile.ts`.

**Ce qu'un vrai `PUT` casserait.** `stripClinicalInput` retire
`notes`/`details`/`medicalDiagnosis` du corps d'un compte secrétariat pour
laisser ces trois colonnes inchangées (`back/src/main/utils/clinical-fields.ts`).
En sémantique de remplacement complet, une clé absente du corps vaudrait
« remets cette colonne à `null` » : le secrétariat effacerait donc ces trois
champs cliniques à **chaque** enregistrement — exactement la perte que ce
crochet existe pour empêcher. Aucun appelant du dépôt ne compte par ailleurs
sur un remplacement complet ; rien ne dépend de la sémantique `PUT` ici.

**Coût si faux.** Une route à qui l'on donnerait la sémantique de remplacement
d'un `PUT` effacerait silencieusement des données cliniques à chaque
enregistrement fait par un rôle qui n'a pas le droit de les voir — pas une
régression visible tout de suite, mais une perte de données réelle sur une
application qui manipule de vraies données de santé.

## D9 — La route du sous-dossier est exemptée du rappel de tenant périmé, coût assumé

**Motif** (tâche 10, « Ruling à conscience »). Le sous-dossier de service d'un
patient rend un `404` tant qu'aucune écriture ne l'a encore créé pour ce
patient dans ce service — c'est délibéré côté back, et c'est l'état
**majoritaire** juste après une migration, avant qu'aucun patient n'ait de
sous-dossier dans un second service (voir `front/src/api/fetchWithAuth.ts`,
`CHEMINS_404_NORMAUX`). Sans cette exemption de chemin, chaque ouverture d'une
fiche patient sans sous-dossier paierait un aller-retour `/me` complet en
tâche de fond, pour un `404` qui ne dit rien de la fraîcheur du couple
établissement/service.

**Coût assumé.** Sur cette route précise, un tenant réellement périmé (une
affectation retirée pendant la session) **ne sera plus détecté** par le
rappel — l'exemption est de chemin, pas de contrat back, donc le 404
lui-même reste inchangé, seul le déclenchement du rappel front est court-
circuité ici. Le rappel continue de se déclencher normalement sur toute autre
route de tenant. Décision prise en connaissance de cause : l'alternative (un
aller-retour `/me` à chaque fiche patient sans sous-dossier, sur l'état
majoritaire attendu juste après cette étape) coûtait plus cher que le risque
résiduel.

## D10 — Le front n'envoie que les champs réellement modifiés, jamais le formulaire entier

**Motif** (tâche 10/11). `edit.patient.tsx` n'envoie, dans le corps du
`PATCH`, que les champs effectivement touchés depuis la dernière lecture ou
le dernier enregistrement réussi (une photographie figée des valeurs par
défaut, pas le `isDirty` de TanStack Form, qui reste vrai indéfiniment après
toute modification même si la valeur est ensuite rétablie) — jamais le
formulaire entier. Treize des seize colonnes du sous-dossier ne sont
protégées par aucune liste d'autorisation côté back : une lecture périmée ou
partielle suivie d'un enregistrement naïf du formulaire complet effacerait
silencieusement de vraies données cliniques ou de parcours, pour n'importe
quel rôle. Documenté côté front dans `front/CLAUDE.md`, section « Patient
sub-record (étape 3) ».

**Coût si faux.** Démontré par le sabotage n°3 de la tâche 11 : envoyer même
un seul champ non modifié suffit, sur une lecture périmée, à écraser une
valeur posée entre-temps par un autre onglet ou un autre compte — treize
colonnes réelles exposées, sans qu'aucune erreur ne le signale à l'écran.

---

## Ce que ce chantier a trouvé en chemin et qui ne venait pas de lui

Quatre défauts préexistants, sans rapport direct avec le dossier patient par
service, ont été trouvés en éprouvant autre chose et corrigés dans ce
chantier plutôt que d'être parqués sans réparation — parce qu'ils touchaient,
chacun, à l'intégrité ou à la confidentialité de données de santé réelles.

### Le rendez-vous avec patient, cassé depuis l'étape 1/2

**Ce qui l'a révélé.** La revue de la tâche 5, en éprouvant un tout autre
correctif (la traçabilité des écritures cliniques), a rejoué une inscription
réelle dans un parcours et obtenu **500**, ou selon le chemin **200 avec
`success: false` et aucun rendez-vous créé** — l'erreur avalée par un `catch
{}` muet. Cause : `AppointmentRepository.create` passait `serviceId` dans une
création imbriquée où Prisma l'interdit, `serviceId` faisant partie de la clé
composite de la relation, **alors que le garde-fou d'ORM l'exige
explicitement sur toute écriture d'`AppointmentPatient`**. Les deux
contraintes ne pouvaient pas être satisfaites sur une création imbriquée : il
fallait restructurer en transaction, pas retirer un champ — ce que
l'implémenteur a fait, en signalant explicitement avoir écarté le correctif
plus petit. Daté du commit `dacff75`, déjà sur `main` avant ce chantier ;
aucun test ne le voyait. La production ne l'avait pas reçu (elle n'a ni
l'étape 1 ni l'étape 2), mais il partira réparé avec ce chantier.

### Les fuites de données de santé vers les journaux et vers le navigateur

**Ce qui l'a révélé.** La même revue, en éprouvant la traçabilité des
écritures cliniques, a d'abord établi que le journal des modifications
(`ActivityLog`) ne fuit rien — la meilleure nouvelle du chantier — puis a mis
au jour, par cinq tours de correction successifs, une chaîne de fuites plus
large que le point d'origine :

- `utils/error-handler.ts` recopiait le message brut d'une erreur de
  validation Prisma (donc la charge utile soumise) dans le journal
  applicatif, pour **vingt fichiers du back** passant par ce gestionnaire ;
- le gestionnaire d'erreurs Fastify et son normaliseur, non touchés par le
  premier correctif, recopiaient `error.message` brut **dans le journal et
  dans le corps de la réponse HTTP**, pour **vingt-neuf méthodes sur dix-sept
  dépôts** sans `catch` propre — éprouvé sur une écriture clinique réelle :
  `notes`, `details`, `medicalDiagnosis` et l'identifiant du patient
  partaient au navigateur en 500 ;
- la pile d'une erreur Prisma contient elle aussi la charge utile — V8
  préfixe toute pile par `${name}: ${message}` — filtrée aux seules lignes de
  frame plutôt que retirée en bloc ;
- le journal des requêtes recopiait la chaîne de requête au niveau `info`
  (`?search=<nom du patient>`) sur le chemin heureux, sans qu'aucune erreur
  ne soit nécessaire ;
- `not-found.handler.ts` recopiait `request.url` en entier (chaîne de
  requête comprise) dans le corps d'un 404 et deux lignes de journal —
  trouvé au **cinquième** passage sur le même motif, après que trois
  helpers voisins avaient déjà été corrigés dans le même dossier.

**Décision.** Fermer chaque occurrence plutôt que la première trouvée : un
masquage générique remplace toute interpolation brute d'erreur, `meta.cause`
et les champs Prisma équivalents (vérifiés inexistants en Prisma 7.8) sont
retirés comme code mort plutôt que réactivés, et le normaliseur Prisma qui
aurait recopié `error.message` pour toute erreur non attrapée a été
**supprimé** plutôt que réparé. Chaque fermeture a été rouverte par la revue
suivante sur un canal voisin (`warn`, `info`, branche HTML) — trois re-revues
consécutives ont chacune trouvé un Critique en **éprouvant un correctif**
plutôt qu'en relisant du code neuf, ce qui a justifié la troisième.

### La fuite des secrets de configuration

**Ce qui l'a révélé.** Un balayage systématique du back, mené en fin de
tâche 5 sur quatre motifs de recherche nommés (et non sur une liste
préétablie), a trouvé que `recordToString(config)` journalisait **toute la
configuration chargée** au niveau `debug` — `jwtSecret`, `jwtRefreshSecret`
et `cookieSecret` en clair, c'est-à-dire les secrets qui signent les cookies
de session. La cause probable de l'exposition a été trouvée séparément :
`deploy/.env.example` proposait `LOG_LEVEL=debug` par défaut.

**Décision.** Un masquage générique sur le nom de clé couvre désormais les
quatorze clés de configuration existantes (vérifié, `redactSecrets` dans
`back/src/main/utils/helper.ts`, appliqué avant journalisation dans
`awilix-ioc-container.ts`), et `deploy/.env.example` propose `LOG_LEVEL=INFO`
par défaut, avec un commentaire expliquant pourquoi `debug` ne doit jamais
tourner en production. **Décision de Léo, explicitement reportée à cette
tâche** : « on note et on verra au déploiement » — voir
`deploiement-etape-3.md`, qui porte la vérification du niveau réellement en
place en production et l'arbitrage sur la rotation des trois secrets de
session.

### La fuite inter-établissements par une racine globale

**Ce qui l'a révélé.** La meilleure preuve produite de tout le chantier
(tâche 9, revue) : une énumération exhaustive de tous les chemins du graphe
de relations Prisma jusqu'à la profondeur 5, depuis les vingt-quatre racines
de service et d'établissement — 6 649 chemins, 13 298 cas, comparés au
verdict attendu du garde-fou resserré. Le resserrement lui-même (fermer la
descente dans les inclusions imbriquées, limite documentée depuis l'étape 2 et
que cette étape devait lever — voir §5.4 de la spécification) s'est révélé
strictement monotone : zéro refus perdu, 2 684 refus nouveaux, sur 10 456 cas
communs aux deux versions du garde-fou.

Mais l'énumération a aussi trouvé une fuite **réelle**, entre établissements
et non entre services : une lecture partant de `User` (racine globale)
franchissait `assertGlobalInclude` — qui n'exige qu'une lecture unique — puis
descendait sans aucun contrôle vers un modèle de service
(`user > establishmentMemberships > soignant > todos`). Démontré contre une
base jetable et le vrai garde-fou : un compte membre du **seul**
établissement A a lu le `medicalDiagnosis` et les `notes` d'un patient de
l'établissement B.

**Décision.** Fermée immédiatement plutôt que documentée : la revue a montré
un correctif de sept lignes, portes vertes, chemin de connexion intact
(`assertServiceRelationFilter` traite désormais l'absence de tenant comme
l'absence de service et refuse, au lieu de laisser passer par défaut). « Une
fuite de données de santé entre établissements, démontrée et corrigeable en
sept lignes, ne se documente pas » (tâche 9).

---

## Cinq limites connues, écrites et non corrigées

Ces cinq points sont établis, documentés, et **délibérément non traités**
dans cette étape — ni dans le code, ni ici au-delà de leur description.
Aucun d'eux n'est une fuite de données ouverte ; chacun est une porte de
sûreté qui pourrait s'ouvrir plus large qu'elle ne devrait, sur une surface
que ce chantier a identifiée sans la fermer.

1. **La porte de typage du back couvre `src/main`, jamais `src/test`.**
   Confirmé deux fois par une erreur de type délibérée introduite dans un
   fichier e2e, qui laisse `npm run build` (donc la construction CI) verte.
   Une erreur de typage réelle dans un test ne bloque donc rien tant qu'elle
   n'affecte pas l'exécution.
2. **Le vrai angle mort n'est pas un dossier, c'est un objet construit par
   diffusion (`{ ...p }`) puis remis à Prisma ou à Zod.** TypeScript ne
   vérifie pas les propriétés excédentaires d'un objet ainsi construit et
   assigné à une variable avant d'être passé — contrairement à un littéral
   passé directement en argument. Trois occurrences ont été recensées dans ce
   chantier, la plus grave ayant laissé le seed de démonstration mort
   pendant un tour de correction entier sans qu'aucune porte ne le voie
   (`tsc` sortait à zéro sur le seed cassé).
3. **Les sept requêtes Bruno du dossier patient (`back/bruno/MediSync/Patient/`)
   rendent 404.** `BASE_URL` de la collection ne porte pas le préfixe de
   tenant (`/e/:establishmentId/s/:serviceId`) — défaut de toute la
   collection, préexistant à cette étape et non spécifique au patient.
4. **`GET /patient` (`findAll`, `patient.domain.ts`) rend des fiches
   complètes à l'échelle de l'établissement, sans filtre de service.**
   Alimente quatre écrans du front. Préexistant à cette étape (le patient
   étant un modèle d'établissement depuis l'étape 1), non corrigé ici.
   **FERMÉ depuis** : `findAll` filtre désormais par sous-dossier du service
   courant, comme `findAllWithTags` — et `findForExport` avec lui, le même
   trou étant ouvert dans l'export Excel (test de cloisonnement dans
   `patient.test.ts`).
5. **Le test d'unicité de l'exception de lecture inter-services
   (`runAsSystem-unicite.test.ts`) ne couvre pas les appels depuis
   `src/test`.** Plusieurs tests légitimes construisent le store système pour
   éprouver le garde-fou lui-même ; les couvrir exigerait une liste
   d'autorisation propre à ce dossier, qui n'existe pas. Même limite que le
   point 1, sur une pièce différente.

**Corollaire du point D6, à ne pas perdre : aucune route ne supprime un
sous-dossier.** Le signal de suivi ailleurs, une fois allumé — par une
inscription, un diagnostic ou une création dans le mauvais service — ne
s'éteint jamais par l'application. Seule la suppression du patient entier
(qui supprime tous ses sous-dossiers en cascade) le ferait.
