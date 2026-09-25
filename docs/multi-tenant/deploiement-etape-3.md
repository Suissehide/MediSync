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

Les deux fichiers « avant » se jouent avant toute migration, quel que soit le
scénario établi à l'étape 0 — les colonnes qu'ils mesurent ne sont touchées
ni par l'une ni par l'autre migration tant qu'elle n'a pas été appliquée :

```shell
docker exec -i medisync-postgres psql -U postgres -d medisync_deploy_check \
  < back/prisma/checks/dossier-patient-avant.sql > dossier-avant.txt
```

**Scénario B uniquement** (ni l'étape 1 ni l'étape 3 en production, établi à
l'étape 0) — jouer en plus l'« avant » de l'étape 1 :

```shell
docker exec -i medisync-postgres psql -U postgres -d medisync_deploy_check \
  < back/prisma/checks/multi-tenant-socle-avant.sql > socle-avant.txt
```

### Appliquer la ou les migrations en attente

```shell
cd back
DATABASE_URL="postgres://postgres:postgres@localhost:5432/medisync_deploy_check?schema=public" \
  npm run prisma:migrate:deploy
```

**Attendu** : `All migrations have been successfully applied.` Chaque
migration s'exécute dans sa propre transaction : un échec ne laisse pas la
base à moitié migrée. La migration de cette étape (§4.2 de la spécification)
refuse en outre explicitement de s'exécuter, **avant toute écriture**, si un
établissement ayant des patients possède plusieurs services actifs ou
désactivés, ou n'en possède aucun (voir `decisions-etape-3.md`, D4) — le
message nomme les établissements et services fautifs. Si elle échoue, lire le
message et le comprendre avant de retenter : la même migration est déjà
passée sur une copie des données réelles pendant le développement, un échec
ici signale un écart entre cette copie-ci et celle-là, pas un défaut de la
migration elle-même. Ne pas rejouer la commande en boucle.

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
en boucle ou que les logs montrent une erreur de migration, **ne pas tenter
de réparer en production** : chaque migration s'exécute dans sa propre
transaction (aucune n'a rien pu appliquer à moitié) — passer directement à
l'étape 7. **Il n'existe pas de correctif de code qui rattrape une migration
de cette étape ratée** : les seize colonnes source auront déjà disparu de
`Patient`, et le seul chemin de retour est la restauration de la sauvegarde
de l'étape 1.

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

**Attendu** : l'application redémarre sur le schéma et les données d'avant la
migration. Vérifier que la dernière migration appliquée n'est pas
`20260924160131_patient_service_file` (ni, en scénario B, `20260922144905_multi_tenant_socle`
si le retour arrière doit remonter avant l'étape 1 elle-même) :

```shell
cd back && DATABASE_URL="<url de la base restaurée>" npx prisma migrate status
```

Si l'une des deux figure encore, la restauration n'a pas eu l'effet attendu
(mauvais fichier, ou la commande a visé la mauvaise base) : recommencer la
restauration avant de rouvrir l'accès aux utilisateurs.

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
