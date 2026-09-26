# Déploiement de l'étape 4a (administration : établissements, services, comptes)

**Cette migration ne déplace aucune donnée.** C'est ce qui distingue cette étape de la
précédente, et c'est le premier point à avoir en tête : le retour arrière **redevient ordinaire**,
là où celui de l'étape 3 était une restauration de sauvegarde avec perte de tout ce qui avait été
saisi depuis.

**Vérifié dans `back/prisma/migrations/20260926000004_administration/migration.sql` avant d'écrire
cette phrase**, ligne par ligne — le fichier fait 48 lignes et ne contient rien d'autre :

| Ce que la migration fait | Combien |
|---|---|
| `ALTER TABLE "User" ADD COLUMN "lastLoginAt" TIMESTAMP(3)` (nullable, sans défaut) | 1 colonne |
| `CREATE TABLE "AccessLink"` | 1 table |
| `CREATE TABLE "SuperAdminAccessGrant"` | 1 table |
| `CREATE INDEX` / `CREATE UNIQUE INDEX` sur les deux tables neuves | 4 index |
| `ADD CONSTRAINT … FOREIGN KEY` depuis les deux tables neuves | 3 clés étrangères |
| `DROP` de quoi que ce soit | **0** |
| `UPDATE`, `INSERT`, `DELETE`, copie de colonne | **0** |

Aucune ligne existante n'est lue, écrite ni supprimée. Les deux tables créées sont **vides** après
la migration, et le restent tant que personne n'émet de lien ni ne s'accorde d'octroi. La colonne
ajoutée est nullable et vaut `NULL` pour tous les comptes existants — ce qui s'affichera comme
« jamais connecté » dans la liste du super-admin jusqu'à la première connexion de chacun, et c'est
le comportement attendu, pas un défaut.

**Conséquence directe sur le retour arrière** : redéployer l'image précédente suffit. Les deux
tables et la colonne restent en base sans gêner l'ancien code, qui ne les connaît pas. Aucune
restauration de sauvegarde n'est nécessaire pour revenir en arrière **sur cette étape seule** —
la sauvegarde reste prise par principe (§1), pas parce que le retour arrière en dépend.

---

## ⚠ 0. Le point qui décide de toute la procédure : l'étape 3 est-elle déployée ?

**À faire en premier, sans le supposer.** Au moment où ce document est écrit, le déploiement en
production de l'étape 3 **n'a pas été exécuté** (`docs/multi-tenant/deploiement-etape-3.md` est en
attente), et le document de déploiement de l'étape 3 constatait lui-même que la production n'avait
**ni l'étape 1 ni l'étape 2**.

Si c'est toujours le cas, **la simplicité de cette migration ne rend pas ce déploiement simple** :
`prisma migrate deploy` appliquera d'affilée, dans la même commande et au premier démarrage du
conteneur :

1. `20260922144905_multi_tenant_socle` (étape 1) — convertit des comptes ;
2. `20260924160131_patient_service_file` (étape 3) — **recopie puis supprime** seize colonnes de
   parcours de chaque patient ;
3. `20260926000004_administration` (étape 4a) — la migration décrite ci-dessus.

**Dans ce cas, c'est `deploiement-etape-3.md` qui gouverne**, intégralement : sa fenêtre de
maintenance, sa répétition obligatoire sur une copie jetable des données réelles, ses invariants
par empreinte relevés avant et après, et son retour arrière par restauration de sauvegarde.
N'appliquer la procédure allégée ci-dessous que **si l'étape 3 est déjà en production**.

Constater l'état réel, en lecture seule, sur la base de production :

```shell
cd back && DATABASE_URL="<url de la base de production>" npx prisma migrate status
```

**Attendu, dans le cas « étape 3 déjà déployée »** : une seule migration en attente,
`20260926000004_administration`. Tout autre résultat renvoie à §0 ci-dessus.

---

## 1. Sauvegarde manuelle

Par principe, pas parce que le retour arrière en dépend (voir l'en-tête). Depuis Dokploy,
déclencher une sauvegarde du service `postgres` et télécharger le fichier produit, ainsi que le
précédent pour comparaison.

**Attendu** : deux fichiers `.sql.gz` téléchargés, celui d'avant le déploiement étant non vide et
daté de quelques minutes.

## 2. Répétition sur une copie locale

Facultative sur cette étape seule (rien n'est déplacé), **obligatoire dans le cas §0** où l'étape 3
s'appliquerait au passage. Si elle est faite :

```shell
deploy/scripts/restore-db-dump.sh <sauvegarde.sql.gz>
cd back && DATABASE_URL="<url de la copie locale>" npx prisma migrate deploy
```

**Attendu** : `All migrations have been successfully applied.`

Contrôle spécifique à cette étape, en lecture seule sur la copie migrée — il vérifie exactement ce
que l'en-tête affirme, à savoir que rien n'a bougé :

```sql
SELECT count(*) AS liens FROM "AccessLink";                 -- attendu : 0
SELECT count(*) AS octrois FROM "SuperAdminAccessGrant";    -- attendu : 0
SELECT count(*) AS comptes,
       count("lastLoginAt") AS avec_derniere_connexion
  FROM "User";                                              -- attendu : avec_derniere_connexion = 0
SELECT count(*) AS super_admins FROM "User" WHERE "isSuperAdmin";  -- attendu : 0
```

**Attendu** : les deux tables neuves vides, `lastLoginAt` nulle partout, et **aucun super-admin** —
le drapeau ne se pose que par le script de l'étape 4 ci-dessous, et le seed n'en crée aucun.

Le nombre de comptes, de patients et d'établissements doit par ailleurs être **identique** à celui
d'avant migration. S'il ne l'est pas, s'arrêter : cette migration n'a aucune raison de le changer.

## 3. Déployer l'image

**Avant toute chose, arrêter l'ancien conteneur applicatif** (depuis Dokploy, arrêter le service
back), pour qu'aucune écriture n'ait lieu pendant la migration.

**Attendu** : le service back n'a plus de conteneur en cours d'exécution.

Déployer l'image de cette étape. La migration s'applique au démarrage du conteneur.

**Attendu** : dans les journaux du conteneur, `All migrations have been successfully applied.`,
puis le démarrage normal du serveur.

**Si le démarrage échoue avec un message nommant une route sans permission ou une route mal
placée**, ce n'est pas une panne de migration : ce sont les garde-fous `assertRoutePermission`,
`assertTenantShapedRoute` et `assertSuperAdminShapedRoute`, qui **refusent délibérément de
démarrer** plutôt que de servir une route non gardée. Le message nomme la route.

## 4. Créer le premier super-admin — c'est le seul moyen, et il n'y en a pas d'autre

**Aucune route n'écrit `User.isSuperAdmin`.** Le seed n'en crée aucun. Sans cette étape, la zone
`/super-admin` est inatteignable par tout le monde et l'étape 4a ne sert à rien.

Le script **promeut un compte qui existe déjà** : il faut donc que la personne se soit d'abord
inscrite par l'inscription publique (qui reste ouverte, voir `decisions-etape-4a.md`, D1), ou
qu'elle existe depuis la migration de l'étape 1. Une adresse inconnue est refusée.

```shell
# depuis le conteneur back, ou depuis un poste dont DATABASE_URL pointe sur la production
cd back && npm run bootstrap:super-admin -- <adresse@exemple>
```

**Attendu**, l'une de ces trois sorties :

- `OK — <adresse> est maintenant super-admin.`
- `OK — <adresse> était déjà super-admin et actif : rien à faire.` (le script est idempotent)
- `OK — <adresse> est maintenant super-admin.` suivi de `OK — <adresse> était désactivé : le
  compte a été RÉACTIVÉ au passage (seul recours, aucune route ne peut réactiver un super-admin).`

**Ce troisième cas est un effet de bord voulu, et il est annoncé exprès** : promouvoir un compte
désactivé créerait un compte privilégié dormant. Si la réactivation n'était pas souhaitée, il faut
le traiter tout de suite.

Deux points à connaître avant de lancer :

- **Le script est aussi la seule sortie de secours d'un super-admin désactivé.** Aucune route ne
  peut le réactiver : `assertNotSuperAdmin` refuse les deux sens depuis l'administration d'un
  établissement, délibérément. Le noter quelque part de durable.
- **`npm run bootstrap:super-admin` emploie le `tsx` installé localement**, pas `with:tsx`. C'est
  volontaire : `with:tsx` (`npx -y tsx@4.13.2`) échoue sous Node 26
  (`Cannot find module './plugins'`). Ce défaut reste ouvert pour `npm run seed`, qui partage
  `with:tsx` — **`npm run seed` ne fonctionne donc pas sous Node 26**, ce qui n'a pas d'incidence
  en production mais en a une pour qui rejouerait une copie locale.

Vérifier ensuite en base (lecture seule), sans jamais afficher de mot de passe ni de sel :

```sql
SELECT email, "isSuperAdmin", "deactivatedAt" FROM "User" WHERE "isSuperAdmin";
```

**Attendu** : exactement la ou les adresses promues, `deactivatedAt` nulle.

## 5. Vérifier en production

1. Se connecter avec le compte promu. **Attendu** : l'application redirige vers `/super-admin`
   dès la racine — c'est délibéré, un super-admin fraîchement amorcé n'a **aucune appartenance**,
   et sans cette redirection il atterrirait sur l'écran d'attente, sans barre latérale ni lien
   sortant (`decisions-etape-4a.md`, D19).
2. Onglet **Établissements** : la liste doit montrer l'établissement existant avec ses compteurs
   (services, comptes, dossiers) et son premier administrateur. Ouvrir son détail : services,
   membres, journal d'activité.
3. Onglet **Comptes** : rechercher par adresse un compte connu. **Attendu** : ses rattachements,
   ses rôles, ses désactivations, son dernier accès — jamais une donnée de patient.
4. Se connecter avec un compte **ordinaire** et saisir `/super-admin` dans la barre d'adresse.
   **Attendu** : « Not Found », exactement comme une URL inventée — pas une redirection, pas un
   message « accès refusé ». Le back répond 404 et non 403 sous ce préfixe, pour la même raison.
5. Vérifier que les écrans existants (agenda, patients, planning) affichent les mêmes données
   qu'avant le déploiement. Cette migration n'a aucune raison de les changer ; si l'un d'eux est
   vide ou différent, s'arrêter et passer au retour arrière.

## 6. Vérifier le niveau de journalisation et trancher la rotation des trois secrets de session

**Les deux points que Léo a explicitement reportés au déploiement.** Ils viennent de l'étape 3
(`deploiement-etape-3.md`, §6) et n'ont pas été traités, faute de déploiement : **ils sont donc
toujours à traiter ici**, quel que soit le scénario du §0.

Jusqu'au correctif de l'étape 3, le back journalisait **toute sa configuration en clair** au
niveau `debug` — `jwtSecret`, `jwtRefreshSecret` et `cookieSecret` compris — et
`deploy/.env.example` proposait `LOG_LEVEL=debug`. Le code actuel masque ces trois valeurs par nom
de clé (`recordToString(redactSecrets(config))`, `awilix-ioc-container.ts`) et
`deploy/.env.example` propose désormais `LOG_LEVEL=INFO` : vérifié dans le dépôt au moment
d'écrire ce document. **Cela ne dit rien de ce qui est réellement en place en production, ni de ce
qui a pu être journalisé avant.**

1. **Vérifier le `LOG_LEVEL` réellement en place**, pas la valeur de l'exemple : variable
   d'environnement du conteneur back (Dokploy, variables du service, ou `docker exec` +
   `printenv LOG_LEVEL` sur le conteneur en cours). Si elle vaut `debug` — ou n'est pas définie et
   retombe sur un défaut à `debug` — la fuite a pu être active depuis le premier déploiement.
2. **Chercher dans les journaux conservés** (rétention Dokploy ou agrégateur, selon ce qui
   existe) une ligne `Loaded config:`. Une occurrence en clair signifie que les trois secrets sont
   **potentiellement compromis**, qu'ils aient ou non réellement fuité vers un tiers.
3. **Trancher, au vu de ce qui est trouvé.** Si aucune occurrence en clair n'est trouvée dans des
   journaux accessibles, la rotation n'est pas nécessaire dans l'urgence — mais passer
   `LOG_LEVEL` à `INFO` reste requis si ce n'est pas déjà fait, indépendamment. Si une occurrence
   en clair est trouvée, ou si le niveau `debug` a été en place sans qu'on puisse établir depuis
   quand, **régénérer les trois secrets** (`openssl rand -hex 32` par valeur) et redéployer.

**Ce que la rotation coûte, à dire avant de la déclencher** : ces trois secrets signent
respectivement les jetons d'accès, les jetons de rafraîchissement et le cookie de session. Les
régénérer invalide **toutes les sessions en cours, sans exception** — chaque personne connectée,
quel que soit son rôle, devra se reconnecter. Ce n'est pas amorti par une reconnexion automatique.
Prévenir les utilisateurs, comme pour une fenêtre de maintenance.

**Un point propre à cette étape, à trancher au même moment** : si un lien de première connexion a
déjà été émis et pas encore consommé au moment de la rotation, **il reste valide** — les liens ne
sont signés par aucun de ces trois secrets, seule leur empreinte est en base. La rotation ne les
invalide pas, et il n'y a rien à faire pour eux.

## 7. Retour arrière

**Ordinaire, contrairement à l'étape 3.** Redéployer l'image précédente suffit : les deux tables et
la colonne ajoutées restent en base, inutilisées par l'ancien code, qui les ignore. Aucune donnée
n'a été déplacée, donc rien n'est à restaurer.

```shell
# Vérifier l'état après redéploiement de l'image précédente
cd back && DATABASE_URL="<url de la base de production>" npx prisma migrate status
```

`20260926000004_administration` **restera listée comme appliquée**, et c'est normal : le retour
arrière est un retour arrière de **code**, pas de schéma. Si l'on veut réellement défaire le
schéma — ce dont rien n'oblige — les deux tables se suppriment et la colonne se retire sans perte,
puisqu'elles ne contiennent que des données créées par cette étape :

```sql
-- À ne faire QUE si l'on accepte de perdre les liens d'accès non consommés et
-- l'historique des octrois (la trace comptable de qui est intervenu où, et pourquoi).
DROP TABLE "SuperAdminAccessGrant";
DROP TABLE "AccessLink";
ALTER TABLE "User" DROP COLUMN "lastLoginAt";
DELETE FROM "_prisma_migrations" WHERE migration_name = '20260926000004_administration';
```

**Le coût de ce second geste, à dire** : `SuperAdminAccessGrant` porte l'historique des accès
d'intervention, en cours **et passés**, avec leur motif et leur auteur. C'est la moitié comptable
du mécanisme d'octroi (`decisions-etape-4a.md`, D5), et c'est précisément pour cela que révoquer
un octroi pose `revokedAt` au lieu de supprimer la ligne. Le supprimer efface cette trace.

**⚠ Dans le cas §0** (l'étape 3 s'est appliquée au passage), **ce retour arrière ne suffit pas** :
il faut la restauration de sauvegarde décrite dans `deploiement-etape-3.md`, §7, parce que les
seize colonnes de parcours auront été recopiées **puis supprimées**.

## 8. Ce que ce déploiement ne donne pas

À dire pour qu'on ne le découvre pas à l'usage :

- **Il n'y a aucun écran de création d'établissement.** La route existe
  (`POST /super-admin/establishments`, corps : nom de l'établissement, adresse du premier
  administrateur) et rend le lien de première connexion de cet administrateur ; le code front
  correspondant a été retiré comme code mort, non testé, et parce que son type portait un second
  jeton en clair qu'aucune garde ne surveillait. La zone super-admin n'a que deux onglets,
  Établissements (liste et détail) et Comptes. **Créer un second établissement se fait donc par un
  appel HTTP authentifié**, pas depuis l'interface. Voir `verification-etape-4a.md`, qui en tire
  les conséquences sur le critère de sortie de la cible.
- **Aucune traçabilité à l'échelle de la plateforme.** La réémission d'un lien par le super-admin
  n'émet aucun événement et n'apparaît dans aucun journal ; les lignes de journal du script
  d'amorçage existent en base mais aucune route ne les lit. C'est le sujet de l'étape 4b
  (`decisions-etape-4a.md`, « Ce qui reste ouvert »).
- **Depuis l'écran Membres, on ne peut affecter personne à un service** : une affectation ne se
  pose qu'à la création du compte, et une seule. Le manque est à l'écran, pas à l'API.

## À ne jamais faire, sur cette base ou sur `medisync`

- `npm run prisma:migrate:reset` sans suffixe — il vise la base de développement, pas une copie.
- Définir `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION`.
- Jouer une migration ou un `DROP` directement sur la base de production sans avoir d'abord
  répété sur une copie jetable restaurée depuis un `pg_dump`.
- Lancer le seed contre une base de production : il crée un arbre établissement/services complet
  en plus de l'existant.
</content>
