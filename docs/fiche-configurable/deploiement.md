# Déploiement de la fiche patient configurable

**Cette migration déplace aussi de vraies données de santé**, comme l'étape 3
du chantier multi-tenant (`docs/multi-tenant/deploiement-etape-3.md`, dont ce
document reprend le modèle) : les dix colonnes de parcours ETP de
`PatientServiceFile` (diagnostic médical, mode de prise en charge,
orientation, ETP décision, type de programme, précision non inclusion,
précision contenu personnalisé, objectif, motif d'arrêt, point final de
parcours) quittent la table pour deux colonnes JSON, `data` et `clinicalData`
(la seule clinique : `medicalDiagnosis`). **Le retour arrière n'est pas un
correctif de code : c'est une restauration de sauvegarde**, pour la même
raison qu'à l'étape 3 — les dix colonnes sont supprimées dans la même
migration qui les recopie.

Cette migration a été répétée avec succès pendant le développement, sur une
copie jetable de la base de développement (`pg_dump` → restauration →
`prisma migrate deploy`, jamais sur `medisync` elle-même) : **0 choix
archivé créé sur les dix champs** (toutes les valeurs saisies sont des clés
du catalogue ETP), 2 934 sous-dossiers, 2 911 avec `data` non vide et 2 808
avec `clinicalData` non vide — exactement le nombre de lignes source ayant au
moins une valeur non vide (2 911) et un diagnostic non vide (2 808), les
chiffres de cette répétition. Cette procédure répète la même vérification une
deuxième fois, sur les données les plus fraîches possibles, juste avant le
déploiement.

## 0. Établir l'état réel de la production

**En lecture seule, sans rien modifier :**

```sql
SELECT migration_name, finished_at
FROM "_prisma_migrations"
WHERE migration_name = '20261010120000_service_fields';
```

- **0 ligne** : la migration n'est pas encore passée, suivre tout ce document.
- **1 ligne** : déjà appliquée ; un redéploiement de cette même image est une
  opération normale, sans les étapes 1 à 5 ci-dessous.

## 1. Sauvegarde manuelle, et la commande de restauration

Depuis l'interface Dokploy : télécharger le dernier `pg_dump` du service
`postgres-backup`, puis en déclencher un nouveau pour disposer d'une
sauvegarde aussi fraîche que possible juste avant la migration.

**Attendu** : un fichier `.sql.gz` frais téléchargé. Si le déclenchement
échoue, **ne pas continuer**.

Commande de restauration, à garder sous la main pour l'étape 6 (retour
arrière) — elle restaure toujours la base du conteneur `medisync-postgres`
joignable depuis l'endroit où elle s'exécute, jamais un hôte distant (voir le
garde-fou de `deploy/scripts/restore-db-dump.sh`) :

```shell
deploy/scripts/restore-db-dump.sh <sauvegarde-fraiche.sql.gz>
```

## 2. Relever l'« avant », en lecture seule

**À faire avant l'arrêt du conteneur** (étape 3) : l'export ARS ci-dessous
passe par l'écran applicatif, donc par l'ancien conteneur encore vivant — le
relever après l'arrêt ne donnerait plus accès à l'écran.

**Compte des dix colonnes**, une chaîne vide valant absence comme dans la
migration (`NULLIF(col, '')`) :

```sql
-- lit seulement, ne modifie rien
SELECT
  count(*) FILTER (WHERE NULLIF("medicalDiagnosis", '') IS NOT NULL)   AS "medicalDiagnosis",
  count(*) FILTER (WHERE NULLIF("careMode", '') IS NOT NULL)           AS "careMode",
  count(*) FILTER (WHERE NULLIF("orientation", '') IS NOT NULL)        AS "orientation",
  count(*) FILTER (WHERE NULLIF("etpDecision", '') IS NOT NULL)        AS "etpDecision",
  count(*) FILTER (WHERE NULLIF("programType", '') IS NOT NULL)        AS "programType",
  count(*) FILTER (WHERE NULLIF("nonInclusionDetails", '') IS NOT NULL) AS "nonInclusionDetails",
  count(*) FILTER (WHERE NULLIF("customContentDetails", '') IS NOT NULL) AS "customContentDetails",
  count(*) FILTER (WHERE NULLIF("goal", '') IS NOT NULL)               AS "goal",
  count(*) FILTER (WHERE NULLIF("stopReason", '') IS NOT NULL)         AS "stopReason",
  count(*) FILTER (WHERE NULLIF("etpFinalOutcome", '') IS NOT NULL)    AS "etpFinalOutcome"
FROM "PatientServiceFile";
```

**Garder ce résultat** : c'est la référence de la comparaison de l'étape 5.

**Grille ARS d'une période connue** : depuis l'écran « Indicateurs ARS »,
choisir une période (par exemple l'année en cours) et exporter la grille.
**Garder l'export** : même référence, côté indicateurs plutôt que colonnes.

## 3. Arrêter l'ancien conteneur

**Arrêter l'ancien conteneur applicatif** (depuis Dokploy, arrêter le
service back), ou à défaut interdire les écritures sur la base. L'ancien
conteneur, encore vivant pendant la migration, continuerait d'écrire sur les
dix colonnes sans passer par `data`/`clinicalData` : une ligne modifiée entre
la recopie et la suppression des colonnes serait recopiée dans un état déjà
périmé, ou ferait échouer la garde. C'est une fenêtre de maintenance :
l'application est indisponible entre cet arrêt et la fin de l'étape 5.

**Attendu** : le service back n'a plus de conteneur en cours d'exécution.

## 4. Déployer

La migration s'applique automatiquement au démarrage du conteneur de
production (`npm run start:migrate:production` → `prisma migrate deploy` puis
lancement du serveur). Déployer l'image comme d'habitude depuis Dokploy.

Toute la migration (`20261010120000_service_fields`) tient dans une seule
transaction (`BEGIN` en première ligne, `COMMIT` en dernière) : la garde
compare, valeur par valeur, chaque colonne source non vide à la clé
correspondante de `data`/`clinicalData` (`IS DISTINCT FROM`) et lève une
exception PostgreSQL au moindre écart — ce qui annule la transaction entière,
recopie et suppression des colonnes comprises, avant que rien ne soit
committé. Un échec de la garde ne touche donc aucune donnée, mais bloque le
journal des migrations exactement comme à l'étape 3 multi-tenant (voir
`docs/multi-tenant/deploiement-etape-3.md`, §2 et §4, pour la commande de
déblocage `prisma migrate resolve --rolled-back` et le piège du redémarrage
en boucle — le même mécanisme s'applique ici avec le nom de cette migration).

**Attendu** : dans les logs du conteneur, `All migrations have been
successfully applied.` suivi de `Server is ready`.

## 5. Comparer

**Clés par champ dans `data`/`clinicalData`**, à comparer colonne par colonne
avec le résultat de l'étape 2 (même décompte, sous une autre forme : une clé
n'existe dans le JSON que si la valeur source n'était pas vide, par
construction de la migration) :

```sql
-- lit seulement, ne modifie rien
SELECT key, count(*) AS "nb_valeurs"
FROM "PatientServiceFile", jsonb_object_keys(data) AS key
GROUP BY key
UNION ALL
SELECT key, count(*) AS "nb_valeurs"
FROM "PatientServiceFile", jsonb_object_keys("clinicalData") AS key
GROUP BY key
ORDER BY key;
```

**Attendu** : la ligne `medicalDiagnosis` égale le compte de la colonne
`medicalDiagnosis` de l'étape 2, et chacune des neuf autres lignes égale le
compte de sa colonne correspondante. **Le moindre écart signale une perte ou
un décalage de données** : passer à l'étape 6.

**Grille ARS de la même période**, réexportée depuis l'écran « Indicateurs
ARS » : comparer à l'export pris avant migration à l'étape 2. **Attendu** :
mêmes chiffres. Un écart sur un seul indicateur vaut le même traitement
qu'un écart sur les colonnes.

## 6. Retour arrière

**Le retour arrière de cette migration est une restauration de sauvegarde,
sans détour — il n'y en a pas d'autre.** Les dix colonnes sont supprimées
dans la même migration qui les recopie : une fois la transaction committée,
la seule source qui en contenait la valeur a disparu de `PatientServiceFile`,
et tout ce qui aura été saisi entre la sauvegarde de l'étape 1 et la
restauration sera **perdu**.

Redéployer l'image précédente (celle d'avant l'étape 4), puis restaurer la
sauvegarde de l'étape 1 **sur la base de production**, avec la commande
donnée à l'étape 1 (`deploy/scripts/restore-db-dump.sh`, exécutée là où tourne
la production, jamais depuis un poste de développement — voir
`docs/multi-tenant/deploiement-etape-3.md` §7 pour ce que cette confusion
coûte).

**Vérifier positivement**, pas par l'absence d'un nom dans une liste :

```sql
SELECT
  (SELECT count(*) FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'PatientServiceFile'
       AND column_name IN ('medicalDiagnosis', 'careMode', 'orientation',
                            'etpDecision', 'programType', 'nonInclusionDetails',
                            'customContentDetails', 'goal', 'stopReason',
                            'etpFinalOutcome')) AS colonnes_dix;
```

**Attendu, retour arrière réussi** : `colonnes_dix` = **10**. Si le retour
arrière a échoué (migration encore appliquée) : `colonnes_dix` = **0**.

## 7. Catégories (migration `20261011090000_service_field_categories`)

Cette migration remplace les deux sections fixes de `ServiceFieldDefinition`
(`pathway`/`outcome`) par des catégories en base (`ServiceFieldCategory`),
propres à chaque service. **Les migrations Prisma s'appliquent dans l'ordre
de leur nom, toutes au même démarrage de conteneur** :
`20261010120000_service_fields` (ci-dessus), puis
`20261010200000_indicator_sets` (chantier `worktree-indicateurs-configurables`,
fusionné séparément sur `main`), puis `20261011090000_service_field_categories`
(celle-ci). **Ne pas déployer cette catégorie avant que `indicator_sets` ait
été fusionnée sur `main`** : les trois migrations ne font qu'une seule
commande `prisma migrate deploy`, et aucune des trois ne peut être insérée
entre les deux autres sans renommer les fichiers de migration. Elle partage
la sauvegarde (étape 1), l'arrêt de conteneur (étape 3) et le retour arrière
par restauration (étape 6) de la migration ci-dessus ; elle ouvre sa propre
transaction (`BEGIN`/`COMMIT`) : un échec de la garde ci-dessous n'annule pas
la migration précédente si elle a déjà committé.

**Avant l'étape 3 (arrêt du conteneur), en lecture seule :**

```sql
-- lit seulement, ne modifie rien
SELECT "serviceId", section, count(*) AS "nb_champs"
FROM "ServiceFieldDefinition"
GROUP BY "serviceId", section
ORDER BY "serviceId", section;
```

**Garder ce résultat** : référence de la comparaison ci-dessous.

À l'étape 4, la migration crée deux catégories à date par service (« Parcours
& Inclusion » / `entryDate`, « Sortie & Bilan » / `exitDate`), rattache
chaque champ existant à la catégorie correspondant à son ancienne section,
puis une garde (bloc `DO $$`) compare, par service, le nombre de champs par
ancienne section au nombre de champs rattachés à la catégorie
correspondante, et vérifie qu'aucun champ n'est resté sans catégorie — toute
différence lève une exception qui annule la transaction entière avant que
`categoryId` ne devienne obligatoire et que la colonne `section` ne soit
supprimée.

Cette migration a été répétée avec succès sur une copie jetable de la base
de développement : 2 catégories créées par service, 11 champs sur 11
rattachés.

**Après l'étape 4, à comparer au résultat ci-dessus :**

```sql
-- lit seulement, ne modifie rien
SELECT c."serviceId", c."dateField", count(f.id) AS "nb_champs"
FROM "ServiceFieldCategory" c
LEFT JOIN "ServiceFieldDefinition" f ON f."categoryId" = c.id
GROUP BY c."serviceId", c."dateField"
ORDER BY c."serviceId", c."dateField";
```

**Attendu** : la ligne `entryDate` de chaque service égale son compte
`pathway` ci-dessus, la ligne `exitDate` égale son compte `outcome`. Deux
lignes par service, pas plus : la contrainte d'unicité `(serviceId,
dateField)` empêche d'en créer une troisième à date.

**Retour arrière** : identique à l'étape 6 (restauration de la sauvegarde de
l'étape 1) ; rien de spécifique à ajouter.
