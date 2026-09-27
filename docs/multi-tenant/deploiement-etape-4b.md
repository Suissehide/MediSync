# Déploiement de l'étape 4b (traçabilité des consultations)

**Cette migration ne déplace aucune donnée.** Comme celle de l'étape 4a, et contrairement à celle de
l'étape 3 : le retour arrière est **ordinaire**, là où celui de l'étape 3 était une restauration de
sauvegarde avec perte de tout ce qui avait été saisi depuis.

**Vérifié dans les trois fichiers de migration avant d'écrire cette phrase**, ligne par ligne — ils
font 34, 2 et 2 lignes et ne contiennent rien d'autre :

| Ce que les trois migrations font | Combien |
|---|---|
| `CREATE TABLE "PatientAccessLog"` | 1 table |
| `CREATE INDEX` sur `patientId`, `createdAt`, `(establishmentId, serviceId)` | 3 index |
| `CREATE UNIQUE INDEX "PatientAccessLog_id_serviceId_key"` | 1 index unique |
| `ADD CONSTRAINT … FOREIGN KEY` depuis la table neuve (vers `Patient`, vers `Service`) | 2 clés étrangères |
| `ALTER TABLE "PatientAccessLog" ADD COLUMN "accesParOctroi" BOOLEAN NOT NULL DEFAULT false` | 1 colonne, **sur la table neuve** |
| `ALTER TABLE "PatientAccessLog" ALTER COLUMN "patientId" DROP NOT NULL` | 1 assouplissement, **sur la table neuve** |
| `DROP` de quoi que ce soit | **0** |
| `UPDATE`, `INSERT`, `DELETE`, copie de colonne | **0** |
| Modification d'une table **préexistante** | **0** |

Les trois fichiers, dans l'ordre :

- `back/prisma/migrations/20260927005824_patient_access_log/migration.sql`
- `back/prisma/migrations/20260927012531_patient_access_log_acces_par_octroi/migration.sql`
- `back/prisma/migrations/20260927033409_make_patient_access_log_patient_id_nullable/migration.sql`

**Aucune ligne existante n'est lue, écrite ni supprimée, et aucune table préexistante n'est
touchée.** Les deux `ALTER` portent tous deux sur la table créée par la première migration, qui est
**vide** à ce moment-là : l'ajout de colonne avec défaut et le `DROP NOT NULL` s'appliquent donc à
zéro ligne. La table reste vide après la migration, et le reste jusqu'à la première consultation
d'un dossier.

**Conséquence directe sur le retour arrière** : redéployer l'image précédente suffit. La table reste
en base sans gêner l'ancien code, qui ne la connaît pas. Aucune restauration de sauvegarde n'est
nécessaire pour revenir en arrière **sur cette étape seule** — la sauvegarde reste prise par
principe (§2), pas parce que le retour arrière en dépend.

---

## ⚠ 0. Le point qui décide de toute la procédure : quelles étapes sont déjà déployées ?

**À faire en premier, sans le supposer.** Au moment où ce document est écrit, **aucun des
déploiements des étapes 1, 2, 3 et 4a n'a été exécuté en production** — `deploiement-etape-3.md` et
`deploiement-etape-4a.md` sont tous deux en attente, et le document de l'étape 3 constatait
lui-même que la production n'avait ni l'étape 1 ni l'étape 2.

Si c'est toujours le cas, **la simplicité de cette migration ne rend pas ce déploiement simple** :
`prisma migrate deploy` appliquera d'affilée, dans la même commande et au premier démarrage du
conteneur :

1. `20260922144905_multi_tenant_socle` (étape 1) — convertit des comptes ;
2. `20260924160131_patient_service_file` (étape 3) — **recopie puis supprime** seize colonnes de
   parcours de chaque patient ;
3. `20260926000004_administration` (étape 4a) — additive ;
4. les **trois** migrations de l'étape 4b décrites ci-dessus — additives.

**Dans ce cas, c'est `deploiement-etape-3.md` qui gouverne**, intégralement : sa fenêtre de
maintenance, sa répétition obligatoire sur une copie jetable des données réelles, ses invariants par
empreinte relevés avant et après, et son retour arrière par restauration de sauvegarde. Et
`deploiement-etape-4a.md` gouverne le §4 (créer le premier super-admin), sans lequel l'écran
plateforme de cette étape est inatteignable.

Constater l'état réel, en lecture seule, sur la base de production :

```shell
cd back && DATABASE_URL="<url de la base de production>" npx prisma migrate status
```

**Attendu, dans le cas « étape 4a déjà déployée »** : exactement **trois** migrations en attente,
celles listées en tête de ce document. Tout autre résultat renvoie à §0 ci-dessus.

### Un avertissement propre à cette étape, sur la base de **développement** locale

**Deux des trois migrations ont été appliquées à la base de développement `medisync` pendant le
chantier**, malgré un `--create-only` (un nom de migration passé par `stdin` a fait passer outre le
drapeau). Signalé par l'implémenteur lui-même, puis vérifié : la base locale est à 57 migrations là
où `main` n'en porte que 55, les deux surnuméraires étant `patient_access_log` et
`patient_access_log_acces_par_octroi`.

**Contenu appliqué : la table neuve, ses index, ses clés étrangères, et la colonne booléenne sur
cette même table neuve. Aucun verbe destructeur, aucun remplissage rétroactif, aucune donnée
existante touchée.** Le coût réel est de nuisance, pas de données : **tant que la branche 4b n'est
pas fusionnée, `prisma migrate status` lancé depuis `main` signalera deux migrations appliquées
qu'il ne connaît pas**. Cela disparaît à la fusion. C'est dit ici plutôt que masqué. **Cela ne
concerne que la base de développement locale, pas la production.**

---

## 1. Ce dont ce déploiement a besoin et qui n'est pas dans git

**`back/.env` et `back/.env.test.local` sont ignorés par git.** Ils n'existent donc dans **aucun
espace de travail neuf**, et rien ne tourne sans eux : ni les tests, ni le serveur. Tout worktree
futur rencontrera cette marche. Les recopier depuis le dépôt principal.

En production, les variables viennent des fichiers de composition, pas de `back/.env`. Voir §5 pour
la variable nouvelle de cette étape — **et pour la raison pour laquelle elle n'arrive pas encore au
conteneur.**

## 2. Sauvegarde manuelle

Par principe, pas parce que le retour arrière en dépend (voir l'en-tête). Depuis Dokploy,
déclencher une sauvegarde du service `postgres` et télécharger le fichier produit, ainsi que le
précédent pour comparaison.

**Attendu** : deux fichiers `.sql.gz` téléchargés, celui d'avant le déploiement étant non vide et
daté de quelques minutes.

## 3. Répétition sur une copie locale

Facultative sur cette étape seule (rien n'est déplacé), **obligatoire dans le cas §0** où l'étape 3
s'appliquerait au passage.

```shell
deploy/scripts/restore-db-dump.sh <sauvegarde.sql.gz>
cd back && DATABASE_URL="<url de la copie locale>" npx prisma migrate deploy
```

**Attendu** : `All migrations have been successfully applied.`

Contrôle spécifique à cette étape, en lecture seule sur la copie migrée — il vérifie exactement ce
que l'en-tête affirme :

```sql
SELECT count(*) AS consultations FROM "PatientAccessLog";   -- attendu : 0
SELECT count(*) AS patients FROM "Patient";                 -- attendu : identique à avant migration
SELECT count(*) AS comptes  FROM "User";                    -- attendu : identique à avant migration
SELECT count(*) AS journal_activite FROM "ActivityLog";     -- attendu : identique à avant migration
```

**Attendu** : la table neuve vide, et **les trois autres comptes strictement identiques** à ceux
d'avant migration. S'ils ne le sont pas, s'arrêter : ces trois migrations n'ont aucune raison de les
changer.

## 4. Déployer l'image

**Avant toute chose, arrêter l'ancien conteneur applicatif** (depuis Dokploy, arrêter le service
back), pour qu'aucune écriture n'ait lieu pendant la migration.

**Attendu** : le service back n'a plus de conteneur en cours d'exécution.

Déployer l'image de cette étape. La migration s'applique au démarrage du conteneur.

**Attendu** : dans les journaux du conteneur, `All migrations have been successfully applied.`, puis
le démarrage normal du serveur, puis **deux lignes de purge** (voir §6).

### Les garde-fous qui peuvent refuser de démarrer, et ce que chaque message veut dire

Un démarrage qui échoue en nommant une route **n'est pas une panne de migration** : ce sont les
garde-fous, qui **refusent délibérément** de démarrer plutôt que de servir une route non gardée.
Cette étape en ajoute quatre aux trois existants. Le message nomme toujours ce qu'il faut corriger.

| Message contient | Garde-fou | Ce qu'il faut faire |
|---|---|---|
| « route sans permission » | `assertRoutePermission` | déclarer la permission de la route |
| « route mal placée » (tenant / super-admin) | `assertTenantShapedRoute`, `assertSuperAdminShapedRoute` | déplacer la route sous le bon préfixe |
| **« Route de lecture patient hors du journal des consultations : GET … »** | `assertPatientReadLogged` | inscrire la route dans `LOGGED_PATIENT_ROUTES` (avec son action) ou `EXEMPTED_PATIENT_ROUTES` (avec sa raison), `back/src/main/utils/access-log-routes.ts` |
| **« Entrees mortes dans le journal des consultations : … »** | `assertNoDeadPatientAccessEntry` | l'entrée déclarée ne correspond plus à aucune route GET réelle : retirer l'entrée, ou corriger l'URL |
| **une route de forme patient posée hors du préfixe de tenant** | `assertPatientRouteUnderTenant` | déplacer la route sous `/e/:establishmentId/s/:serviceId`, ou la déclarer dans `EXEMPTED_ADMIN_PATIENT_ROUTES` avec sa raison |
| **une exemption d'administration morte** | `assertNoDeadAdminPatientExemption` | même chose, dans l'autre sens |
| **une erreur de validation sur `LOG_RETENTION_MONTHS`** | le schéma de configuration | voir §5 : la valeur doit être un **entier strictement positif** |

**Ne jamais « débloquer » un de ces refus en renommant un paramètre de route.** C'est exactement le
contournement que ce chantier a trouvé et défait (voir `decisions-etape-4b.md`, D9) : un renommage ne
déclare rien, il rend le filet aveugle pour toute route future qui choisirait ce nom.

## 5. ⚠ `LOG_RETENTION_MONTHS` — variable nouvelle, valeur **provisoire**, et **aujourd'hui non transmise au conteneur**

**Ce qu'elle fait.** Elle gouverne la rétention des **deux** journaux : `ActivityLog` (journal
d'activité, existant) et `PatientAccessLog` (journal des consultations, nouveau). Chacun a sa purge
planifiée, qui tourne au démarrage puis toutes les 24 h.

**Sa valeur par défaut est 12 mois, et cette valeur est PROVISOIRE.** Elle reprend le douze qui était
en dur dans le code depuis l'étape 2. **Elle attend un conseil** : la durée de conservation d'un
journal d'accès à des données de santé n'est pas un choix d'ingénierie. Tant que la question n'est
pas tranchée, ne rien changer — le défaut est le comportement actuel, à l'identique.

**Elle refuse de démarrer sur une valeur absurde**, délibérément : `0`, `-3`, `douze` font échouer le
chargement de la configuration. Mesuré sur la base de test : avec une rétention de zéro, la date de
coupure vaut l'instant présent et **toutes les lignes disparaissent au premier passage, y compris
une ligne vieille d'une minute**. Un démarrage qui échoue se voit ; deux journaux vidés la nuit,
non.

### ⚠ La variable n'arrive pas au conteneur en l'état

**Vérifié dans le dépôt en écrivant ce document** : `LOG_RETENTION_MONTHS` **n'apparaît dans aucune
section `environment:`** de `deploy/compose.yaml` ni de
`deploy/dokploy/docker-compose.dokploy.yml`. La poser dans le fichier `.env` de déploiement **ne la
fera donc pas parvenir à l'application** — celle-ci lira son défaut de douze mois quoi qu'il arrive,
sans le moindre signal.

Ce n'est pas bloquant aujourd'hui (le défaut *est* la valeur voulue), et c'est pour cela que rien
n'a été modifié ici. **Mais le jour où la valeur est tranchée, il faudra d'abord ajouter la ligne**,
dans les **deux** fichiers, à côté de `LOG_LEVEL` :

```yaml
# deploy/compose.yaml, service back, section environment:
      - LOG_RETENTION_MONTHS

# deploy/dokploy/docker-compose.dokploy.yml, service back, section environment:
      - LOG_RETENTION_MONTHS=${LOG_RETENTION_MONTHS}
```

…et la déclarer dans `deploy/.env.example` avec son commentaire. **Vérifier ensuite que la valeur est
bien celle attendue**, pas celle de l'exemple :

```shell
docker exec <conteneur-back> printenv LOG_RETENTION_MONTHS
```

**Attendu** : la valeur posée. Si la commande ne rend rien, la variable n'est pas transmise et
l'application tourne sur son défaut.

## 6. Vérifier en production

Le détail point par point, sur le chemin réel de l'interface, est dans
`docs/multi-tenant/verification-etape-4b.md`. Le minimum à constater ici, juste après le
déploiement :

1. **Les deux purges se sont exécutées au démarrage.** Chercher dans les journaux du conteneur, dans
   les premières secondes :

   ```
   ActivityLog cleanup: N entrées supprimées
   PatientAccessLog cleanup: N entrées supprimées
   ```

   **Attendu** : les deux lignes, avec `N = 0` sur un premier déploiement. **Si l'une manque ou
   porte un message `… cleanup failed [<classe>]`, s'arrêter et lire §8** — une purge qui échoue en
   boucle n'émet aucun autre signal.

2. **Une consultation laisse une trace.** Se connecter avec un compte coordinateur, ouvrir un
   dossier patient depuis la liste, puis cliquer le bouton **« Journal des accès »** sur la fiche.
   **Attendu** : au moins une ligne, à la date et à l'heure de l'ouverture qu'on vient de faire, avec
   son propre nom en auteur, l'action « Dossier ouvert », le service courant, et la colonne
   « Origine » indiquant un accès réel.

3. **L'écran plateforme répond.** Se connecter avec le super-admin, barre de navigation
   « Journal des accès ». **Attendu** : l'écran s'affiche sur le journal des **consultations** par
   défaut, avec la ligne créée au point 2.

4. **Les écrans existants sont inchangés.** Agenda, patients, planning : mêmes données qu'avant le
   déploiement. Ces migrations n'ont aucune raison de les changer ; si l'un d'eux est vide ou
   différent, s'arrêter et passer au retour arrière (§9).

## 7. Vérifier le niveau de journalisation et trancher la rotation des trois secrets de session

**Les deux points que Léo a explicitement reportés, d'abord depuis l'étape 3, puis depuis
l'étape 4a.** Ils n'ont toujours pas été traités, faute de déploiement : **ils restent donc à traiter
ici**, quel que soit le scénario du §0.

Jusqu'au correctif de l'étape 3, le back journalisait **toute sa configuration en clair** au niveau
`debug` — `jwtSecret`, `jwtRefreshSecret` et `cookieSecret` compris — et `deploy/.env.example`
proposait `LOG_LEVEL=debug`. Le code actuel masque ces trois valeurs par nom de clé
(`recordToString(redactSecrets(config))`, `awilix-ioc-container.ts`) et `deploy/.env.example` propose
désormais `LOG_LEVEL=INFO` : **vérifié dans le dépôt au moment d'écrire ce document**. **Cela ne dit
rien de ce qui est réellement en place en production, ni de ce qui a pu être journalisé avant.**

1. **Vérifier le `LOG_LEVEL` réellement en place**, pas la valeur de l'exemple : variable
   d'environnement du conteneur back (Dokploy, variables du service, ou `docker exec` +
   `printenv LOG_LEVEL`). Si elle vaut `debug` — ou n'est pas définie et retombe sur un défaut à
   `debug` — la fuite a pu être active depuis le premier déploiement.
2. **Chercher dans les journaux conservés** une ligne `Loaded config:`. Une occurrence en clair
   signifie que les trois secrets sont **potentiellement compromis**, qu'ils aient ou non réellement
   fuité vers un tiers.
3. **Trancher, au vu de ce qui est trouvé.** Si aucune occurrence en clair n'est trouvée dans des
   journaux accessibles, la rotation n'est pas nécessaire dans l'urgence — mais passer `LOG_LEVEL` à
   `INFO` reste requis si ce n'est pas déjà fait, indépendamment. Si une occurrence en clair est
   trouvée, ou si `debug` a été en place sans qu'on puisse établir depuis quand, **régénérer les
   trois secrets** (`openssl rand -hex 32` par valeur) et redéployer.

**Ce que la rotation coûte, à dire avant de la déclencher** : ces trois secrets signent
respectivement les jetons d'accès, les jetons de rafraîchissement et le cookie de session. Les
régénérer invalide **toutes les sessions en cours, sans exception** — chaque personne connectée,
quel que soit son rôle, devra se reconnecter. Prévenir les utilisateurs, comme pour une fenêtre de
maintenance.

**Un point propre à l'étape 4a, toujours valable** : un lien de première connexion émis et non encore
consommé au moment de la rotation **reste valide** — les liens ne sont signés par aucun de ces trois
secrets, seule leur empreinte est en base. Il n'y a rien à faire pour eux.

**Un point propre à cette étape-ci** : le journal des consultations **n'est pas concerné** par la
rotation. Aucune de ses colonnes ne porte de secret, et le crochet d'écriture ne journalise jamais le
message brut d'une erreur, seulement sa **classe** — précisément parce qu'une erreur Prisma non
absorbée recopierait l'identifiant du patient et le nom de l'agent dans le journal technique.

## 8. Surveiller la purge — parce que rien ne le fait à votre place

Deux limites **connues, non aggravées par cette étape**, qui s'appliquent maintenant aux deux
journaux. Elles sont ici plutôt que dans un ticket, parce qu'elles se constatent au déploiement.

- **Aucun signal si la purge échoue à chaque exécution.** Le `catch` journalise la classe de
  l'erreur et continue. Une purge qui ne purge jamais laisse les deux journaux croître
  indéfiniment — **symétrique exact du risque surveillé** (une rétention à zéro qui vide tout), et
  tout aussi muet. Rien ne compare le nombre supprimé à une attente, rien n'alerte.
  **À faire à la main** : relever périodiquement, en lecture seule,

  ```sql
  SELECT count(*) AS lignes, min("createdAt") AS plus_ancienne FROM "PatientAccessLog";
  SELECT count(*) AS lignes, min("createdAt") AS plus_ancienne FROM "ActivityLog";
  ```

  **Attendu** : `plus_ancienne` ne doit jamais remonter au-delà de la rétention configurée. Si elle
  le fait, la purge échoue en boucle — chercher `cleanup failed` dans les journaux du conteneur.

- **Aucun verrou entre instances.** Chaque instance planifie sa purge et l'exécute au démarrage.
  Sans corruption (la suppression est idempotente), mais avec du travail redondant. *Nuance vérifiée
  en écrivant ce document* : `NODE_CLUSTER` est transmis au conteneur par les deux fichiers de
  composition mais **n'est lu nulle part dans `back/src`** — il n'y a donc aujourd'hui qu'un seul
  processus, et cette limite ne mord que le jour où le service serait mis à l'échelle.

## 9. Retour arrière

**Ordinaire, contrairement à l'étape 3.** Redéployer l'image précédente suffit : la table ajoutée
reste en base, inutilisée par l'ancien code, qui l'ignore. Aucune donnée n'a été déplacée, donc rien
n'est à restaurer.

```shell
# Vérifier l'état après redéploiement de l'image précédente
cd back && DATABASE_URL="<url de la base de production>" npx prisma migrate status
```

Les trois migrations **resteront listées comme appliquées**, et c'est normal : le retour arrière est
un retour arrière de **code**, pas de schéma.

Si l'on veut réellement défaire le schéma — ce dont rien n'oblige — la table se supprime sans perte
pour le reste, puisqu'elle ne contient que des données créées par cette étape :

```sql
-- À ne faire QUE si l'on accepte de perdre tout l'historique des consultations
-- déjà enregistré depuis le déploiement.
DROP TABLE "PatientAccessLog";
DELETE FROM "_prisma_migrations" WHERE migration_name IN (
  '20260927005824_patient_access_log',
  '20260927012531_patient_access_log_acces_par_octroi',
  '20260927033409_make_patient_access_log_patient_id_nullable'
);
```

**Le coût de ce second geste, à dire** : cette table est la **seule** trace des consultations de
dossiers patients. La supprimer efface qui a ouvert quoi, et quand, depuis le déploiement — y compris
les accès obtenus par octroi temporaire, que rien d'autre ne distingue d'un accès de soin. Le journal
d'activité (`ActivityLog`) ne les remplace pas : il ne trace que les **écritures**.

**⚠ Dans le cas §0** (l'étape 3 s'est appliquée au passage), **ce retour arrière ne suffit pas** : il
faut la restauration de sauvegarde décrite dans `deploiement-etape-3.md`, §7, parce que les seize
colonnes de parcours auront été recopiées **puis supprimées**.

## 10. Ce que ce déploiement ne donne pas

À dire pour qu'on ne le découvre pas à l'usage. Chacun de ces points est développé dans
`decisions-etape-4b.md`, « Ce qui reste ouvert ».

- **Aucun écran pour la lecture à l'échelle de l'établissement.** La route
  `GET /e/:establishmentId/admin/patients/:patientID/acces` existe, est gardée par `access-log:read`,
  est éprouvée en e2e **et** en isolation entre établissements — mais **le front ne l'appelle nulle
  part** (vérifié dans `front/src/api/` et `front/src/routes/.../admin/`). Elle n'est donc atteignable
  aujourd'hui que par appel direct. Les deux écrans livrés sont celui du **service** (bouton
  « Journal des accès » sur la fiche patient) et celui de la **plateforme** (super-admin).
- **L'action `echecsInscription.consultes` n'est produite par aucun chemin de l'interface.** Le front
  ne fait aucun `GET .../enrollment-issue` : les problèmes d'inscription arrivent à l'écran embarqués
  dans la réponse de la fiche patient, donc la consultation est bien tracée — mais sous
  `dossier.ouvert`. Le filtre « Échecs d'inscription consultés » ne rendra rien tant qu'un écran
  n'appellera pas la route dédiée.
- **Le journal trace les routes qui NOMMENT un patient, pas celles qui en RENDENT les données.** La
  liste des patients (`GET /patient`, non journalisée par construction) renvoie pour chaque patient
  ses problèmes d'inscription avec leur motif en **texte libre** ; une lecture de rendez-vous embarque
  les transmissions des patients inscrits. Ce n'est pas un défaut d'implémentation, c'est le périmètre
  choisi — mais la phrase « toute lecture de données de patient laisse une trace » serait fausse.
- **La purge n'a ni verrou entre instances, ni signal si elle échoue en boucle** (§8).
- **`LOG_RETENTION_MONTHS` n'arrive pas au conteneur** en l'état (§5).
- **`runAsSuperAdmin` n'est énuméré par rien.** Quatorze sites d'appel dans `src/main` (douze avant
  cette étape ; les deux ajoutés sont les lectures plateforme des deux journaux), aucune liste nommée
  nulle part. Défendable — les tables déclarées bornent ce qu'on peut y faire — mais différent de
  « chaque site est nommé et justifié ».

## À ne jamais faire, sur cette base ou sur `medisync`

- `npm run prisma:migrate:reset` **sans suffixe** — il vise la base de développement, pas une copie.
- Définir `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION`.
- Jouer une migration ou un `DROP` directement sur la base de production sans avoir d'abord répété
  sur une copie jetable restaurée depuis un `pg_dump`.
- Lancer le seed contre une base de production : il crée un arbre établissement/services complet en
  plus de l'existant.
- Passer un nom de migration par `stdin` à `prisma migrate dev --create-only` : c'est ce qui a fait
  passer outre le drapeau et appliqué deux migrations à la base de développement pendant ce chantier
  (§0).
