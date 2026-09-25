# Déploiement de l'étape 3 (dossier patient par service)

**Cette migration déplace de vraies données de santé.** Contrairement à
`multi-tenant_socle` (étape 1), qui ajoutait des colonnes et convertissait des
comptes, celle-ci **recopie puis supprime** : les seize colonnes de parcours
de chaque patient (diagnostic médical, notes, bilan de sortie…) quittent
`Patient` pour un sous-dossier par service, `PatientServiceFile`. **Le retour
arrière n'est pas un correctif de code : c'est une restauration de
sauvegarde**, avec perte de tout ce qui a été saisi entre la sauvegarde et la
restauration. Aucun tour de correction ne rattrape une migration ratée une
fois les colonnes source supprimées. Toute cette procédure est écrite sous
cette contrainte — en cas de doute à n'importe quelle étape, s'arrêter et
passer à l'étape 7 (retour arrière) plutôt qu'improviser sur des dossiers
patients réels.

Cette migration a été répétée avec succès pendant le développement, sur une
copie jetable des données réelles (restaurée depuis un `pg_dump`, jamais sur
la base elle-même) : les invariants par empreinte (voir `decisions-etape-3.md`,
D5) sont revenus identiques avant et après, sur les seize colonnes des deux
patients concernés. Cette procédure répète la même vérification une deuxième
fois, sur les données les plus fraîches possibles, juste avant le déploiement.

## 0. Établir l'état réel de la production — à faire en premier, sans le supposer

Le document de déploiement de l'étape 1 constatait que la production n'avait
**ni l'étape 1 ni l'étape 2**. Si c'est toujours le cas au moment de ce
déploiement, **deux migrations s'appliqueront d'un coup** au premier démarrage
du conteneur : `20260922144905_multi_tenant_socle` (étape 1), puis
`20260924160131_patient_service_file` (cette étape), dans cet ordre, l'une
après l'autre, dans la même commande `prisma migrate deploy`.

> **Correction du brief de cette tâche, qui annonçait « trois migrations ».**
> Vérifié dans `back/prisma/migrations/` : l'étape 2 n'a introduit **aucune**
> migration de schéma (elle était front + trois travaux back sans changement
> de schéma — resserrement du garde-fou, permissions, seed à deux services ;
> voir `decisions-etape-2.md`, D3). Il n'existe donc que **deux** migrations
> multi-tenant en attente possible, pas trois. Si le compte ci-dessous ne
> colle pas à ce raisonnement, s'arrêter et vérifier plutôt que de continuer
> sur une hypothèse fausse.

**Vérification, en lecture seule, à lancer directement sur la base de
production** (elle ne modifie rien) :

```sql
-- lit seulement, ne modifie rien
SELECT migration_name, finished_at
FROM "_prisma_migrations"
WHERE migration_name IN (
  '20260922144905_multi_tenant_socle',
  '20260924160131_patient_service_file'
)
ORDER BY started_at;
```

**Ce qu'il faut en faire :**

| Résultat | État de la production | Migrations qui s'appliqueront au déploiement | À faire |
|---|---|---|---|
| 0 ligne | ni l'étape 1 ni l'étape 3 | les deux, dans l'ordre | Suivre **tout** ce document, y compris la répétition des invariants de l'étape 1 (§2, scénario B) |
| 1 ligne (`multi_tenant_socle` seul) | étape 1 reçue, pas l'étape 3 | `patient_service_file` seule | Suivre ce document en scénario A (§2) : seuls les invariants de cette étape sont à rejouer |
| 2 lignes | étape 1 et étape 3 déjà reçues | aucune | Rien à migrer ; un redéploiement de cette même image est une opération normale, sans les étapes 1 à 4 de ce document |

Un contrôle approximatif et plus rapide, donné pour mémoire — **moins fiable
que celui ci-dessus**, parce qu'il se casse si une migration sans rapport avec
le multi-tenant est fusionnée entre-temps : `SELECT count(*) FROM
"_prisma_migrations";`. À ce commit, le dépôt compte 54 migrations au total,
52 avant les deux migrations multi-tenant : 52 = ni l'une ni l'autre, 53 =
l'étape 1 seule, 54 = les deux déjà appliquées. Préférer la requête par nom
ci-dessus, qui reste juste même si ce compte a bougé.

### Contrôle supplémentaire, en lecture seule : la précondition de la garde de la migration

**Uniquement si le résultat ci-dessus est 1 ligne (`multi_tenant_socle` seul)**
— c'est-à-dire si `Establishment`/`Service` existent déjà en production. La
migration de cette étape (§4.2 de la spécification, voir `decisions-etape-3.md`,
D4) refuse de s'exécuter si un établissement ayant au moins un patient possède
plusieurs services, ou aucun. Ce contrôle, en lecture seule, dit **avant**
d'entrer en fenêtre de maintenance si ce refus se produira, plutôt que de le
découvrir après avoir arrêté le conteneur applicatif :

```sql
-- lit seulement, ne modifie rien
SELECT e.id AS etablissement, e.name,
       count(DISTINCT s.id) FILTER (WHERE s.id IS NOT NULL) AS nb_services
FROM "Establishment" e
JOIN "Patient" p ON p."establishmentId" = e.id
LEFT JOIN "Service" s ON s."establishmentId" = e.id
GROUP BY e.id, e.name
HAVING count(DISTINCT s.id) FILTER (WHERE s.id IS NOT NULL) <> 1;
```

**Attendu : 0 ligne.** Une ligne renvoyée nomme un établissement où la
migration refusera (le nombre de services montré, `0` ou `2` et plus, dit
lequel des deux refus de D4 s'appliquerait) : régler la situation (créer ou
désactiver un service, selon le cas) avant de continuer, plutôt que d'entrer
en fenêtre de maintenance pour se retrouver bloqué (voir §2 et §4 plus bas
pour ce que ce blocage coûte si on le découvre après coup).

**Scénario B (0 ligne au contrôle précédent) : ce contrôle ne s'applique pas
encore**, et ce n'est pas un oubli — `Establishment`/`Service` n'existent pas
avant que `multi_tenant_socle` ne les crée, et cette même migration crée
exactement un établissement et un service pour toutes les données
existantes : la garde de `patient_service_file` ne peut donc pas refuser dans
ce scénario précis, par construction. Le premier déploiement qui pourra
violer cette précondition est un déploiement **ultérieur** à celui-ci (une
fois l'étape 4 du chantier multi-tenant en place, qui permettra de créer un
second service).

## 1. Sauvegarde manuelle

Depuis l'interface Dokploy : télécharger le dernier `pg_dump` du service
`postgres-backup`, puis en déclencher un nouveau pour disposer d'une
sauvegarde aussi fraîche que possible juste avant la migration.

**Attendu** : deux fichiers `.sql.gz` téléchargés (l'ancien, pour comparaison,
et le nouveau, qui sert de retour arrière à l'étape 7). Si le déclenchement
échoue, **ne pas continuer** : sans cette sauvegarde fraîche, l'étape 7 ne
pourrait restaurer qu'un état plus ancien.

## 2. Répétition sur une copie locale

> **Le `localhost:5432` codé en dur dans tous les blocs de cette section est
> une valeur par défaut, pas la vôtre.** Vérifier le port Postgres réel dans
> `deploy/.env` (`POSTGRES_PORT`) et le substituer dans **chaque** commande
> ci-dessous.
>
> Ce n'est pas une précaution théorique : sur la machine de développement,
> MediSync écoute sur **5433**, et un conteneur Postgres d'un tout autre
> projet occupe 5432. Une commande recopiée telle quelle s'y connecte sans
> erreur visible et opère sur la mauvaise base. Vérifier avec `docker ps
> --format '{{.Names}}\t{{.Ports}}' | grep postgres` avant de commencer.

Restaurer le dump le plus récent dans une base **jetable**, distincte de la
base de développement locale :

```shell
DB_NAME=medisync_deploy_check deploy/scripts/restore-db-dump.sh <dump-le-plus-recent.sql.gz>
```

**Attendu** : le script confirme la restauration.

### Relever les invariants « avant », avant toute migration

**Scénario A (une ligne à l'étape 0, `multi_tenant_socle` déjà reçue) :**
`dossier-patient-avant.sql` se joue avant toute migration, sans autre
précaution — les colonnes qu'il mesure ne sont touchées que par la migration
de cette étape, pas encore appliquée à ce stade :

```shell
docker exec -i medisync-postgres psql -U postgres -d medisync_deploy_check \
  < back/prisma/checks/dossier-patient-avant.sql > dossier-avant.txt
```

**Scénario B (0 ligne à l'étape 0) : ne PAS jouer `dossier-patient-avant.sql`
tel quel.** Il interroge `"Establishment"` et `"Service"`, deux tables que
**seule la migration `multi_tenant_socle` crée** — en scénario B elles
n'existent pas encore. `psql` échoue alors avec
`ERROR: relation "Establishment" does not exist`, écrit sur **stderr** ; la
redirection `> dossier-avant.txt` de la commande ci-dessus produit dans ce cas
un fichier de **0 octet**, sans autre signal à l'écran que cette ligne
d'erreur qui défile. Si on ne le remarque pas et qu'on poursuit, la
comparaison normalisée plus bas annoncera **35 écarts sur 35** — la perte
apparente de toutes les colonnes cliniques de tous les patients — sur une
migration par ailleurs parfaite. `prisma migrate deploy` n'offre aucun point
d'arrêt entre les deux migrations pour prendre la mesure « avant » une fois
`Establishment`/`Service` créées mais avant que `patient_service_file` n'ait
tourné : il les applique toutes les deux d'un coup.

**La mesure qui remplace `dossier-patient-avant.sql` en scénario B** : les
mêmes lignes « Patients », « Presence <colonne> » et « Empreinte <colonne> »
(33 des 35 lignes comparées plus bas), obtenues en retirant du fichier, à
l'exécution, les deux lignes qui interrogent `Establishment`/`Service` — sans
modifier le fichier lui-même :

```shell
grep -v -e "'Etablissements'" -e "'Services'" back/prisma/checks/dossier-patient-avant.sql \
  | docker exec -i medisync-postgres psql -U postgres -d medisync_deploy_check > dossier-avant.txt
```

**Ce qu'il faut observer** : un fichier `dossier-avant.txt` non vide, avec les
33 lignes `Patients`/`Presence …`/`Empreinte …` remplies de valeurs réelles
(pas d'erreur `relation … does not exist`). Si le fichier est vide ou contient
une erreur, ne pas continuer : reprendre cette étape, vérifier qu'on a bien
suivi la branche scénario B et pas la commande du scénario A par erreur.

**Scénario B uniquement, dans les deux cas** — jouer en plus l'« avant » de
l'étape 1 :

```shell
docker exec -i medisync-postgres psql -U postgres -d medisync_deploy_check \
  < back/prisma/checks/multi-tenant-socle-avant.sql > socle-avant.txt
```

### Appliquer la ou les migrations en attente

```shell
cd back
DATABASE_URL="postgres://postgres:postgres@localhost:5432/medisync_deploy_check?schema=public" \
  npm run prisma:migrate:deploy
cd ..
```

**Ne pas oublier le `cd ..` ci-dessus** : les blocs qui suivent (invariants
« après », comparaison, suppression de la copie) utilisent tous des chemins
relatifs à la racine du dépôt (`back/prisma/checks/…`) — rester dans `back/`
les ferait échouer (fichier introuvable) ou comparer deux fichiers écrits
dans des répertoires différents.

**Attendu** : `All migrations have been successfully applied.` Chaque
migration s'exécute dans sa propre transaction : un échec ne laisse pas les
**données** à moitié migrées. La migration de cette étape (§4.2 de la
spécification) refuse en outre explicitement de s'exécuter, **avant toute
écriture**, si un établissement ayant des patients possède plusieurs services
actifs ou désactivés, ou n'en possède aucun (voir `decisions-etape-3.md`,
D4 ; le contrôle de §0 ci-dessus est fait pour éviter d'en arriver là) — le
message nomme les établissements et services fautifs.

> **Un échec laisse en revanche le journal des migrations bloqué, et
> retenter ne suffit pas.** Prisma inscrit la migration en échec dans
> `_prisma_migrations` ; toute tentative suivante — y compris
> `prisma migrate deploy` rejoué en boucle, et le `start:migrate:production`
> que le conteneur de production rejoue à **chaque redémarrage**
> (`back/deploy/Dockerfile`) — échoue ensuite avec `P3009` **sans rien
> appliquer**, même si la cause du premier échec a été corrigée entre-temps.
> **Ne pas rejouer la commande en boucle** : lire le message d'erreur et le
> comprendre d'abord (la même migration est déjà passée sur une copie des
> données réelles pendant le développement, un échec ici signale un écart
> entre cette copie-ci et celle-là, pas un défaut de la migration
> elle-même), corriger la cause, **puis débloquer explicitement le
> journal** avant de rejouer :
>
> ```shell
> cd back
> npx prisma migrate resolve --rolled-back 20260924160131_patient_service_file
> npm run prisma:migrate:deploy
> cd ..
> ```
>
> Sans cette commande, corriger la cause ne suffit pas : la migration reste
> marquée en échec et **aucun déploiement suivant ne pourra plus s'appliquer**,
> pas seulement celui-ci.

### Relever les invariants « après », et comparer

```shell
docker exec -i medisync-postgres psql -U postgres -d medisync_deploy_check \
  < back/prisma/checks/dossier-patient.sql > dossier-apres.txt
```

**Scénario B** — jouer en plus l'« après » de l'étape 1 :

```shell
docker exec -i medisync-postgres psql -U postgres -d medisync_deploy_check \
  < back/prisma/checks/multi-tenant-socle.sql > socle-apres.txt
```

> **Comparer les valeurs, pas les lignes.** `psql` aligne la colonne des
> libellés sur le libellé le plus long de *son propre* résultat, et les
> fichiers « avant » et « après » n'ont pas le même — celui d'après porte des
> libellés plus longs (« Sous-dossiers hors etablissement du service »)
> absents de l'avant. Un `diff` brut des deux sorties signale alors des
> écarts sur des valeurs strictement identiques, rien qu'à cause de
> l'alignement. Sous tension, cela se lit comme une perte de données et
> déclenche un retour arrière inutile.
>
> **Second piège, propre à cette étape et déjà rencontré une fois pendant le
> développement** (voir `decisions-etape-3.md`, D5) : un filtre par simple
> préfixe de libellé capte à tort « Patients sans sous-dossier » sous
> « Patients », ce qui produirait un écart sur une migration pourtant
> parfaite. Le filtre ci-dessous compare le libellé **exact**, pas un
> préfixe :
>
> ```shell
> norm() { awk -F'|' 'NF>=2 {
>     label=$1; gsub(/^[ \t]+|[ \t]+$/, "", label)
>     value=$2; gsub(/^[ \t]+|[ \t]+$/, "", value)
>     if (label == "Patients" || label == "Etablissements" || label == "Services" \
>         || label ~ /^Presence / || label ~ /^Empreinte /) {
>       print label" = "value
>     }
>   }' "$1" | sort; }
> diff <(norm dossier-avant.txt) <(norm dossier-apres.txt) && echo "aucun ecart sur les 35 lignes communes"
> ```

**Attendu, sur les 35 lignes communes (`Patients`, `Etablissements`,
`Services`, 16 `Presence <colonne>`, 16 `Empreinte <colonne>`)** : `diff`
silencieux, `aucun ecart sur les 35 lignes communes`. **Le moindre écart
signale une perte ou un décalage de données** : ne pas continuer.

**Scénario B : deux lignes de plus dans le `diff`, et c'est attendu, pas un
écart.** `dossier-avant.txt` a été construit sans `Etablissements`/`Services`
(voir plus haut) : le `diff` affiche donc, en plus des 33 lignes communes,
```
> Etablissements = 1
> Services = 1
```
(éprouvé : sur une base jetable construite au niveau pré-étape-1 avec dix
patients réels, seules ces deux lignes apparaissent, précédées de `>` — le
signe d'une ligne présente uniquement dans l'« après » — et aucune des 33
autres lignes ne diverge). Ces deux lignes n'existent pas encore côté
« avant » par construction, exactement comme les six lignes structurelles
ci-dessous : ce n'est un problème que si une **troisième** ligne apparaît, ou
si l'une des 33 lignes communes diffère. **En scénario B, l'attendu est donc :
diff ne montre que ces deux lignes `>`, rien d'autre.**

Vérifier en plus, dans `dossier-apres.txt` seul (ces lignes n'existent pas
dans le fichier « avant », c'est attendu) :

- `Sous-dossiers` = la valeur de `Patients` (un sous-dossier par patient,
  ni plus ni moins) ;
- `Sous-dossiers sans patient` = **0** ;
- `Sous-dossiers hors etablissement du service` = **0** ;
- `Patients sans sous-dossier` = **0** ;
- `Diagnostics orphelins` = **0** ;
- `Inscriptions orphelines` = **0**.

**Scénario B**, appliquer la même comparaison normalisée (adapter la liste de
libellés dans `norm()` à ceux de `multi-tenant-socle-avant.sql` /
`multi-tenant-socle.sql` — voir `deploiement-etape-1.md` pour le détail exact
de ces libellés) entre `socle-avant.txt` et `socle-apres.txt`.

Si un écart apparaît à n'importe quelle comparaison : **ne pas continuer**,
supprimer la copie (`docker exec medisync-postgres psql -U postgres -c "DROP
DATABASE medisync_deploy_check;"`) et reprendre cette étape depuis une
nouvelle copie du dump.

### Démarrer le back sur cette copie migrée

```shell
DATABASE_URL="postgres://postgres:postgres@localhost:5432/medisync_deploy_check?schema=public" \
  npm run start:development
```

Se connecter avec un compte existant et ouvrir une fiche patient : les deux
blocs (identité partagée, dossier du service) s'affichent, les seize champs
du dossier de service portent les mêmes valeurs qu'avant migration.

Une fois la vérification faite, arrêter ce back (`Ctrl+C`) puis supprimer la
copie jetable :

```shell
docker exec medisync-postgres psql -U postgres -c "DROP DATABASE medisync_deploy_check;"
```

## 3. Fenêtre de maintenance : arrêter l'ancien conteneur avant de déployer

**Avant toute chose, arrêter l'ancien conteneur applicatif** (depuis Dokploy,
arrêter le service back), ou à défaut interdire les écritures sur la base.
L'ancien conteneur, encore vivant pendant le déploiement, continue d'écrire
sur `Patient` sans passer par le sous-dossier : une ligne modifiée entre le
remplissage de `PatientServiceFile` et la suppression des seize colonnes de
`Patient` serait recopiée dans un état déjà périmé, ou ferait échouer la
migration. C'est une fenêtre de maintenance : l'application est indisponible
entre cet arrêt et la fin de l'étape 5.

**Attendu** : le service back n'a plus de conteneur en cours d'exécution, et
l'application répond en erreur depuis un navigateur. Si l'ancien conteneur ne
s'arrête pas, **ne pas déployer**.

## 4. Déployer l'image

La ou les migrations en attente (voir §0) s'appliquent automatiquement au
démarrage du conteneur de production (`npm run start:migrate:production` →
`prisma migrate deploy` puis lancement du serveur). Déployer l'image comme
d'habitude depuis Dokploy.

**Attendu** : dans les logs du conteneur, `All migrations have been
successfully applied.` suivi de `Server is ready`. Si le conteneur redémarre
en boucle ou que les logs montrent une erreur de migration, distinguer deux
cas avant d'agir — **le conteneur va continuer de rejouer `prisma migrate
deploy` à chaque redémarrage, et ne réussira ni l'un ni l'autre tant que le
bon geste n'a pas été fait :**

- **Le message nomme des établissements et des services (le refus de la
  garde D4, `decisions-etape-3.md`)** : aucune donnée n'a été touchée (la
  garde refuse avant la moindre écriture), mais le journal des migrations
  reste bloqué (`P3009` à chaque tentative suivante) tant qu'il n'est pas
  débloqué explicitement — voir §2 ci-dessus pour la commande
  (`npx prisma migrate resolve --rolled-back 20260924160131_patient_service_file`),
  à exécuter depuis là où l'on peut atteindre la base de production, après
  avoir corrigé la précondition (le contrôle de §0 est fait pour l'éviter,
  mais une donnée a pu changer entre §0 et ce déploiement). Redéployer
  ensuite : pas besoin de restaurer une sauvegarde pour un refus qui n'a
  touché aucune donnée.
- **Toute autre erreur** : **ne pas tenter de réparer en production**. Chaque
  migration s'exécute dans sa propre transaction — un échec ne laisse pas les
  **données** à moitié migrées, mais laisse le **journal** des migrations
  bloqué exactement comme ci-dessus, et cette fois la cause n'est pas connue
  avec la même certitude. Passer directement à l'étape 7. **Il n'existe pas
  de correctif de code qui rattrape une migration de cette étape ratée** :
  les seize colonnes source auront déjà disparu de `Patient`, et le seul
  chemin de retour est la restauration de la sauvegarde de l'étape 1.

## 5. Vérifier en production

> **Tout le monde sera déconnecté une fois, c'est attendu — potentiellement
> pour deux raisons cumulées selon l'état constaté à l'étape 0.** Si la
> production n'avait pas encore reçu l'étape 1, le format de l'utilisateur
> stocké côté navigateur change (voir `deploiement-etape-1.md`, §4) ; si elle
> n'avait pas non plus reçu l'étape 2, c'est la **première** version à poser
> le contexte de tenant côté front (`docs/multi-tenant/decisions-etape-2.md`)
> — chaque compte reverra l'écran de connexion une fois au premier
> chargement. Le cookie de session restant valide, se reconnecter est
> immédiat. Prévenir les utilisateurs, ne pas prendre cette déconnexion pour
> un échec du déploiement.
>
> Si à la place l'application affiche « Une erreur est survenue » avec
> `user.establishments is not iterable`, c'est que la version déployée est
> antérieure au correctif du versionnement de l'étape 1 : contournement
> immédiat côté navigateur, vider le stockage local du site (outils de
> développement, Application, Local Storage), puis déployer une image à jour.

Se connecter avec un compte existant et vérifier, dans l'ordre : la
connexion, l'agenda, le planning, **une fiche patient** — c'est le point
propre à cette étape : l'écran affiche désormais deux blocs, l'identité
partagée puis le dossier du service courant avec ses seize champs, aux mêmes
valeurs qu'avant le déploiement — et l'écran Membres.

**Attendu** : chaque écran affiche les mêmes données qu'avant le déploiement.
Si l'un d'eux est vide ou en erreur alors qu'il ne l'était pas, **ne pas
modifier de données** : passer à l'étape 7.

## 6. Vérifier le niveau de journalisation et trancher la rotation des trois secrets de session

**Point que Léo a explicitement décidé de traiter à ce déploiement** (voir
`decisions-etape-3.md`, section sur la fuite des secrets de configuration).
Jusqu'à ce chantier, le back journalisait **toute sa configuration en clair**
au niveau `debug`, `jwtSecret`, `jwtRefreshSecret` et `cookieSecret` compris,
et `deploy/.env.example` proposait `LOG_LEVEL=debug` par défaut — c'est-à-dire
le réglage sous lequel cette fuite aurait été active.

1. **Vérifier le `LOG_LEVEL` réellement en place en production**, pas la
   valeur de l'exemple : la variable d'environnement du conteneur back
   (Dokploy, variables du service, ou `docker exec` + `printenv LOG_LEVEL`
   sur le conteneur en cours). Si elle vaut `debug` (ou n'est pas définie et
   retombe sur un défaut à `debug` selon la configuration Dokploy en place),
   la fuite documentée peut avoir été active depuis le premier déploiement
   ayant journalisé au niveau `debug`.
2. **Chercher dans les journaux conservés** (rétention Dokploy / agrégateur
   de logs, selon ce qui existe) une ligne `Loaded config:` — c'est la ligne
   émise par `awilix-ioc-container.ts` au démarrage. Avant la correction de
   cette étape, elle portait les trois secrets en clair ; après, ils sont
   masqués par nom de clé. Une occurrence en clair dans des journaux
   conservés signifie que ces trois secrets sont **potentiellement
   compromis**, qu'ils aient ou non réellement fuité vers un tiers.
3. **Trancher, au vu de ce qui est trouvé** : si aucune occurrence en clair
   n'est trouvée dans des journaux accessibles, la rotation n'est pas
   nécessaire dans l'urgence — mais passer `LOG_LEVEL` à `INFO` reste requis
   si ce n'est pas déjà fait, indépendamment. Si une occurrence en clair est
   trouvée, ou si le niveau `debug` a été en place sans qu'on puisse
   établir depuis quand, **régénérer les trois secrets**
   (`openssl rand -hex 32` par valeur, comme le commente déjà
   `deploy/.env.example`) et redéployer avec les nouvelles valeurs.

**Ce que la rotation coûte, à dire avant de la déclencher** : les trois
secrets signent respectivement les jetons d'accès, les jetons de
rafraîchissement, et le cookie de session lui-même. Les régénérer invalide
**toutes les sessions en cours, sans exception** — chaque personne connectée,
quel que soit son rôle, devra se reconnecter. Contrairement à la déconnexion
« une fois » de l'étape ci-dessus (purge d'un état de navigateur périmé,
transparente avec un cookie encore valide), une rotation de secrets invalide
le cookie lui-même : ce n'est pas amorti par une reconnexion automatique.
Prévenir les utilisateurs avant de la déclencher, comme pour une fenêtre de
maintenance.

## 7. Retour arrière

**Le retour arrière de cette étape est une restauration de sauvegarde, sans
détour.** Contrairement aux étapes 1 et 2, aucun correctif de code ne peut
rattraper une migration de cette étape ratée ou incomplète : une fois les
seize colonnes supprimées de `Patient`, la seule source qui en contenait la
valeur a disparu, et tout ce qui aura été saisi entre la sauvegarde de
l'étape 1 et la restauration sera **perdu**.

Redéployer l'image précédente (celle d'avant l'étape 4), puis restaurer la
sauvegarde de l'étape 1 **sur la base de production** :

```shell
deploy/scripts/restore-db-dump.sh <sauvegarde-de-l-etape-1.sql.gz>
```

> **`deploy/scripts/restore-db-dump.sh` restaure toujours la base du
> conteneur `medisync-postgres` joignable depuis l'endroit où on l'exécute :
> l'exécuter là où tourne la production, pas depuis un poste local qui ne
> verrait que sa propre base.** Le script a pour valeurs par défaut le
> conteneur **local** (`CONTAINER=medisync-postgres`) et la base de
> développement **locale** (`DB_NAME=medisync`), et refuse explicitement de
> parler à un démon Docker distant (voir `deploy/scripts/restore-db-dump.sh`,
> section « Garde-fou : cible locale uniquement ») — il ne peut donc pas se
> tromper de cible en restaurant sur un serveur distant par erreur, mais rien
> n'empêche de le lancer, sans le vouloir, **depuis un poste de développement**
> plutôt que depuis l'endroit où tourne la production : dans ce cas il
> détruit et remplace la base de développement locale (`medisync`), et **ne
> touche pas la production**, sans qu'aucun message ne le distingue d'une
> vraie restauration réussie. Au moment le plus tendu de la procédure, c'est
> le pire moment pour découvrir qu'on a détruit la mauvaise base et laissé la
> production dans l'état qui a déclenché ce retour arrière.

**Attendu** : l'application redémarre sur le schéma et les données d'avant la
migration. La vérifier **positivement**, pas par l'absence d'un nom dans une
liste — `npx prisma migrate status` liste les migrations **non** appliquées,
pas celles qui le sont : sur une restauration **ratée** (la migration est
encore en place), il répond `Database schema is up to date!`, un message qui
se lit comme un succès alors que c'en est l'inverse. Utiliser à la place la
requête par nom de §0 (en lecture seule, elle dit vrai dans les deux sens) ou,
plus directement, ce contrôle qui constate lui-même l'état du schéma :

```shell
docker exec -i medisync-postgres psql -U postgres -d <nom-de-la-base-restauree> -c "
    SELECT
      (SELECT count(*) FROM information_schema.columns
         WHERE table_schema='public' AND table_name='Patient'
           AND column_name IN ('medicalDiagnosis','entryDate','careMode','orientation',
                                'etpDecision','programType','nonInclusionDetails',
                                'customContentDetails','goal','exitDate','stopReason',
                                'etpFinalOutcome','referringCaregiver','followUpToDo',
                                'notes','details')) AS colonnes_patient_seize,
      to_regclass('public.\"PatientServiceFile\"') AS table_sous_dossier;"
```

(`<nom-de-la-base-restauree>` : `medisync` en production, le nom passé à
`DB_NAME` sur une copie locale). **Attendu, retour
arrière réussi** : `colonnes_patient_seize` = **16** et `table_sous_dossier`
**vide** (aucune table). **Si le retour arrière a échoué** (migration encore
appliquée) : `colonnes_patient_seize` = **0** et `table_sous_dossier` =
`PatientServiceFile` — l'échec se voit directement dans les deux colonnes,
sans avoir à interpréter un message d'apparence rassurante. Éprouvé dans les
deux sens sur des bases jetables : `medisync` elle-même (jamais migrée par
cette étape) rend `16` / vide ; une base où la migration est restée appliquée
rend `0` / `PatientServiceFile`.

En scénario B, si le retour arrière doit remonter avant l'étape 1 elle-même,
vérifier en plus que `to_regclass('public."Establishment"')` est vide (aucune
des tables de l'étape 1 ne doit rester).

Si l'un des deux contrôles ne donne pas le résultat attendu, la restauration
n'a pas eu l'effet voulu (mauvais fichier, ou la commande a visé la mauvaise
base — voir l'avertissement ci-dessus) : recommencer la restauration avant de
rouvrir l'accès aux utilisateurs.

---

## À ne jamais faire, sur cette base ou sur `medisync`

- **`medisync` (la base de développement de Léo) est en lecture seule pour
  cette procédure** : jamais migrée, jamais réinitialisée, jamais écrite par
  ce document. `npm run prisma:migrate:reset` **sans suffixe** vise
  `.env`/`.env.local`, c'est-à-dire `medisync` : ne jamais le lancer dans le
  cadre d'un déploiement.
- Ne jamais lever `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION` pour
  accélérer une étape de cette procédure : ce garde-fou existe pour exiger le
  consentement d'un humain, pas celui d'un agent qui l'invoquerait pour
  lui-même.
- Le seed de démonstration (`back/prisma/seed.ts`) n'est pas rejouable sur
  une base déjà peuplée (voir `deploiement-etape-1.md`) : ne jamais
  l'exécuter sur la production.
