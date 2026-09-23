# Déploiement de l'étape 1 (socle multi-tenant)

Cette migration convertit chaque compte existant en une appartenance d'établissement et une
appartenance de service (voir `docs/multi-tenant/habilitations.md`, § « Correspondance avec les
anciens rôles »), sans changer ce qu'un compte migré voit ou peut faire. Elle a déjà été répétée
avec succès pendant le développement, sur une copie jetable des données réelles (restaurée depuis
un `pg_dump`, jamais sur la base elle-même) : la migration est passée, tous les invariants sont
revenus à la valeur attendue, et les comptes de lignes des dix-huit tables métier étaient
identiques valeur pour valeur avant et après, contrôlés par un `diff` des deux sorties. Cette
procédure répète la même vérification une deuxième fois, juste avant le déploiement, sur les
données les plus fraîches possibles.

Chaque étape est numérotée, dit ce qu'on doit observer, et ce qu'il faut faire si ce n'est pas le
cas. En cas de doute à n'importe quelle étape : s'arrêter et passer à l'étape 6 (retour arrière)
plutôt que d'improviser sur une base qui contient de vrais dossiers patients.

## À savoir avant de commencer

- **Le critère « `npm run validate` doit passer » ne doit pas être utilisé.** Il ne passe pas, et
  ce n'est pas cette étape qui doit le corriger : `npm run lint:ci` (back, contrôle de formatage de
  tout `src`, y compris le code généré par Prisma) échoue déjà sur `main`, avant ce chantier ; de
  même `npm run lint` (front) échoue déjà sur `main` (dette de style sans rapport avec la refonte).
  Les portes qui comptent, et qui passent réellement sur cette branche, sont :
  `cd back && npm run build`, `npm run lint`, `npm run test:unit`, `npm run test:e2e`, et
  `cd front && npm run build`.
- **Le seed de démonstration (`back/prisma/seed.ts`) n'est pas rejouable sur une base déjà
  peuplée.** Il crée un établissement et un service sans condition, et plusieurs de ses fonctions
  insèrent sans vérifier l'existant : le relancer produit un second arbre de données en double.
  Ne jamais l'exécuter (`npm run prisma:seed`, `npm run prisma:migrate:reset`) sur une base de
  production ou de démonstration déjà peuplée.
- **Une base de développement déjà migrée peut devoir être réinitialisée.** La migration
  `20260922144905_multi_tenant_socle` a été corrigée après une première application sur des bases
  jetables : son empreinte a donc changé. La production n'est pas concernée (elle ne l'a jamais
  appliquée), mais toute base de développement qui l'aurait déjà appliquée verra
  `prisma migrate deploy` signaler une migration modifiée. La réponse est de réinitialiser cette
  base de développement, jamais de forcer la production.

## 1. Sauvegarde manuelle

Depuis l'interface Dokploy : télécharger le dernier `pg_dump` du service `postgres-backup`, puis en
déclencher un nouveau pour disposer d'une sauvegarde aussi fraîche que possible juste avant la
migration.

**Attendu** : deux fichiers `.sql.gz` téléchargés (l'ancien, pour comparaison, et le nouveau, qui
sert de retour arrière à l'étape 6). Si le déclenchement échoue, **ne pas continuer** : sans cette
sauvegarde fraîche, l'étape 6 ne pourrait restaurer qu'un état plus ancien.

## 2. Répétition sur une copie locale

> **Le `localhost:5432` codé en dur dans tous les blocs de cette section est une valeur par
> défaut, pas la vôtre.** Vérifier le port Postgres réel dans `deploy/.env` (`POSTGRES_PORT`) et
> le substituer dans **chaque** commande ci-dessous, y compris si l'on n'exécute que le deuxième
> ou le troisième bloc.
>
> Ce n'est pas une précaution théorique : sur la machine de développement, MediSync écoute sur
> **5433**, et un conteneur Postgres d'un tout autre projet occupe 5432. Une commande recopiée
> telle quelle s'y connecte sans erreur visible et opère sur la mauvaise base. Vérifier avec
> `docker ps --format '{{.Names}}\t{{.Ports}}' | grep postgres` avant de commencer.

Restaurer le dump le plus récent dans une base **jetable**, distincte de la base de développement
locale (`DB_NAME` cible une autre base que celle par défaut, pour ne rien détruire de son propre
environnement de travail) :

```shell
DB_NAME=medisync_deploy_check deploy/scripts/restore-db-dump.sh <dump-le-plus-recent.sql.gz>
```

**Attendu** : le script confirme la restauration (voir `deploy/scripts/restore-db-dump.sh` pour le
détail des messages). Relever les comptes de référence sur cette copie, avant toute migration :

```shell
docker exec medisync-postgres psql -U postgres -d medisync_deploy_check -c \
  'SELECT role, count(*) FROM "User" GROUP BY role;'
docker exec medisync-postgres psql -U postgres -d medisync_deploy_check -c \
  'SELECT count(*) FROM "_SlotTemplateSoignants";'
docker exec medisync-postgres psql -U postgres -d medisync_deploy_check -c \
  'SELECT count(*) FROM "_SoignantThematics";'
docker exec -i medisync-postgres psql -U postgres -d medisync_deploy_check \
  < back/prisma/checks/multi-tenant-socle-avant.sql
```

Noter ces quatre résultats (nombre de comptes par ancien rôle, nombre de liens soignant/créneau,
nombre de liens soignant/thématique, et la sortie du fichier « avant », qui compte les lignes de 17
tables). Appliquer ensuite la migration sur cette copie (`DATABASE_URL` surchargé pour cette seule
commande, port réel — voir la mise en garde en tête de section) :

```shell
cd back
DATABASE_URL="postgres://postgres:postgres@localhost:5432/medisync_deploy_check?schema=public" \
  npm run prisma:migrate:deploy
```

**Attendu** : `All migrations have been successfully applied.` La migration s'exécute dans une
transaction : un échec ne laisse pas la base à moitié migrée. Si elle échoue, lire le message
d'erreur et le comprendre avant de retenter : la même migration est déjà passée sur une copie des
données réelles, un échec ici signale donc un écart entre cette copie-ci et celle de la répétition,
pas un défaut de la migration. Ne pas rejouer la commande en boucle.

Jouer le fichier d'invariants « après », puis comparer les comptes de lignes par table qu'il donne
en seconde moitié de sortie à ceux du fichier « avant » :

```shell
docker exec -i medisync-postgres psql -U postgres -d medisync_deploy_check \
  < back/prisma/checks/multi-tenant-socle.sql
```

> **Comparer les valeurs, pas les lignes.** `psql` aligne la colonne des libellés sur le libellé le
> plus long de *son* résultat, et les deux fichiers n'ont pas le même : un `diff` brut des deux
> sorties signale alors les dix-huit lignes comme différentes alors que chaque valeur est
> identique. Sous tension, cela se lit comme une perte de données et déclenche un retour arrière
> inutile. Enregistrer chaque sortie dans un fichier (`… > avant.txt`, `… > apres.txt`) et les
> comparer en normalisant l'espacement :
>
> ```shell
> norm() { grep -E '^ (Lignes|Appartenances|Coordinateurs|Liens)' "$1" \
>   | sed 's/|/ /' \
>   | awk '{v=$NF; $NF=""; gsub(/[[:space:]]+$/,"",$0); gsub(/[[:space:]]+/," ",$0); print $0" = "v}' \
>   | sort; }
> diff <(norm avant.txt) <(norm apres.txt) && echo "aucun ecart"
> ```

**Attendu** : toutes les lignes « sans établissement »/« sans service » valent **0** ; le nombre
d'établissements et de services vaut **1** chacun ; les comptes d'appartenances et de
coordinateurs correspondent aux comptes `ADMIN`/`USER` relevés avant migration ; et chaque compte
de lignes par table est **identique** à celui obtenu avec le fichier « avant ». **Le moindre écart
signale une perte de données** : ne pas continuer, supprimer la copie (`docker exec
medisync-postgres psql -U postgres -c "DROP DATABASE medisync_deploy_check;"`) et reprendre cette
étape depuis une nouvelle copie du dump.

Démarrer enfin le back sur cette copie migrée et se connecter avec un ancien compte `ADMIN` et un
ancien compte `USER` (devenus respectivement coordinateur et intervenant du service unique) :

```shell
DATABASE_URL="postgres://postgres:postgres@localhost:5432/medisync_deploy_check?schema=public" \
  npm run start:development
```

**Attendu** : les deux comptes se connectent et retrouvent exactement ce qu'ils voyaient avant
(agenda, planning, fiche patient) — aucune différence visible pour un compte migré est le critère
de réussite de cette étape.

Une fois la vérification faite, arrêter ce back (`Ctrl+C`) puis supprimer la copie jetable :

```shell
docker exec medisync-postgres psql -U postgres -c "DROP DATABASE medisync_deploy_check;"
```

## 3. Déployer l'image

**Avant toute chose, arrêter l'ancien conteneur applicatif** (depuis Dokploy, arrêter le service
back), ou à défaut interdire les écritures sur la base. La migration pose des contraintes
`NOT NULL` sur des tables que l'ancien conteneur, encore vivant pendant le déploiement, peut
continuer d'écrire sans renseigner les nouvelles colonnes : une ligne insérée entre le
remplissage et la pose des contraintes ferait échouer la migration, ou passerait au travers.
C'est une fenêtre de maintenance : l'application est indisponible entre cet arrêt et la fin de
l'étape 4.

**Attendu** : le service back n'a plus de conteneur en cours d'exécution, et l'application
répond en erreur depuis un navigateur. Si l'ancien conteneur ne s'arrête pas, **ne pas déployer**
— une migration lancée en concurrence d'écritures n'est pas rattrapable autrement que par
l'étape 6.

La migration s'applique automatiquement au démarrage du conteneur de production
(`npm run start:migrate:production` → `prisma migrate deploy` puis lancement du serveur). Déployer
l'image comme d'habitude depuis Dokploy.

**Attendu** : dans les logs du conteneur, `All migrations have been successfully applied.` suivi
de `Server is ready`. Si le conteneur redémarre en boucle ou que les logs montrent une erreur de
migration, **ne pas tenter de réparer en production** : la migration s'exécute dans une
transaction (elle n'a rien pu appliquer partiellement) — passer directement à l'étape 6.

## 4. Vérifier en production

> **Tout le monde sera déconnecté une fois, c'est attendu.** Le navigateur conserve l'utilisateur
> dans son stockage local, et cet utilisateur a changé de forme avec le multi-tenant. Le store est
> versionné : au premier chargement de la nouvelle version, l'état hérité est purgé et l'écran de
> connexion s'affiche. Le cookie de session étant toujours valide, se reconnecter est immédiat.
> Prévenir les utilisateurs, et ne pas prendre cette déconnexion pour un échec du déploiement.
>
> Si à la place l'application affiche « Une erreur est survenue » avec
> `user.establishments is not iterable`, c'est que la version déployée est antérieure au
> correctif du versionnement : contournement immédiat côté navigateur, vider le stockage local du
> site (outils de développement, Application, Local Storage), puis déployer une image à jour.

Se connecter avec un compte existant et vérifier, dans l'ordre : la connexion, l'agenda (une
journée avec des rendez-vous), le planning (calendrier des créneaux), une fiche patient (identité
et dossier), l'écran Membres (menu Administration, `/settings/user` : la liste des comptes de
l'établissement s'affiche).

**Attendu** : chaque écran affiche les mêmes données qu'avant le déploiement. Si l'un d'eux est
vide ou en erreur alors qu'il ne l'était pas, **ne pas modifier de données** : passer à l'étape 6.

## 5. Renommer l'établissement et le service

Aucun écran ne le permet encore (prévu à l'étape 4 du chantier). Sur la base de **production**
(pas la copie locale) :

```sql
UPDATE "Establishment" SET name = '...';
UPDATE "Service" SET name = '...';
```

**Attendu** : `UPDATE 1` pour chacune des deux commandes — la migration ne crée qu'un seul
établissement et un seul service, ces requêtes n'ont donc pas besoin de `WHERE`. Un autre nombre
signifie qu'une opération précédente a créé un arbre en double (voir l'avertissement sur le seed
ci-dessus) : s'arrêter et vérifier avant de renommer au hasard.

## 6. Retour arrière

Redéployer l'image précédente (celle d'avant l'étape 3), puis restaurer la sauvegarde de
l'étape 1 **sur la base de production** (`deploy/scripts/restore-db-dump.sh` restaure toujours la
base du conteneur `medisync-postgres` joignable depuis l'endroit où on l'exécute : l'exécuter là où
tourne la production, pas depuis un poste local qui ne verrait que sa propre base) :

```shell
deploy/scripts/restore-db-dump.sh <sauvegarde-de-l-etape-1.sql.gz>
```

**Attendu** : l'application redémarre sur le schéma et les données d'avant la migration. Vérifier
que la dernière migration appliquée n'est pas `20260922144905_multi_tenant_socle` (`DATABASE_URL`
pointé sur la base qui vient d'être restaurée, comme à l'étape 2) :

```shell
cd back && DATABASE_URL="<url de la base restaurée>" npx prisma migrate status
```

Si elle y figure encore, la restauration n'a pas eu l'effet attendu (mauvais fichier, ou la
commande a visé la mauvaise base) : recommencer la restauration avant de rouvrir l'accès aux
utilisateurs.
