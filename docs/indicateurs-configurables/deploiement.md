# Déploiement des indicateurs configurables

Cette migration (`20261010200000_indicator_sets`) ajoute les jeux
d'indicateurs (`IndicatorSet`/`Indicator`/`IndicatorAnswer`), pose un jeu
« Grille ARS » sur chaque service ETP (celui dont `ServiceFieldDefinition`
porte les clés `orientation` **et** `stopReason`) en rejouant `ARS_PRESET`,
règle `Service.stopReasonFieldKey`/`completedChoiceKey` sur ces mêmes
services, recopie les réponses de `ArsManualAnswer` vers `IndicatorAnswer`
puis supprime `ArsManualAnswer`. **Elle déplace de vraies réponses d'enquête
ARS**, comme la fiche patient configurable déplaçait de vraies données
cliniques (`docs/fiche-configurable/deploiement.md`, dont ce document reprend
le modèle) : le retour arrière n'est pas un correctif de code, c'est une
restauration de sauvegarde, pour la même raison — `ArsManualAnswer` est
supprimée dans la migration qui la recopie.

Toute la migration tient dans une seule transaction (`BEGIN`/`COMMIT`) avec
une garde en fin de script : elle compare le nombre de réponses avant/après
et vérifie que chacune se retrouve à l'identique (service, code, année,
valeurs) de l'autre côté, et lève une exception PostgreSQL au moindre écart —
ce qui annule toute la transaction, recopie et suppression comprises, avant
que rien ne soit committé. Répétée avec succès sur une copie de la base de
développement : 1 jeu créé, 1 réponse migrée, garde passée.

## 0. Établir l'état réel de la production

**En lecture seule, sans rien modifier :**

```sql
SELECT migration_name, finished_at
FROM "_prisma_migrations"
WHERE migration_name = '20261010200000_indicator_sets';
```

- **0 ligne** : la migration n'est pas encore passée, suivre tout ce document.
- **1 ligne** : déjà appliquée ; un redéploiement de cette même image est une
  opération normale, sans les étapes 1 à 5 ci-dessous.

### Contrôle supplémentaire, en lecture seule : la précondition de la garde

La migration crée le jeu « Grille ARS » **seulement** sur les services dont
`ServiceFieldDefinition` porte les deux clés `orientation` et `stopReason`.
Une réponse `ArsManualAnswer` d'un service qui n'a pas les deux ne retrouve
alors aucun indicateur en face : la garde la compte « manquante » et annule
toute la transaction (aucune perte, mais la migration refuse de passer).
Vérifier **avant** la fenêtre de maintenance :

```sql
-- lit seulement, ne modifie rien
SELECT a.id, a."serviceId", s.name AS service, a.code, a.year
FROM "ArsManualAnswer" a
JOIN "Service" s ON s.id = a."serviceId"
WHERE NOT EXISTS (
        SELECT 1 FROM "ServiceFieldDefinition" d
        WHERE d."serviceId" = a."serviceId" AND d.key = 'orientation')
   OR NOT EXISTS (
        SELECT 1 FROM "ServiceFieldDefinition" d
        WHERE d."serviceId" = a."serviceId" AND d.key = 'stopReason');
```

**Attendu : 0 ligne.** Si des lignes sortent, ne pas déployer en l'état :
soit ajouter les deux champs manquants au(x) service(s) listé(s) (écran
Configuration du service, avant la migration), soit confirmer que ces
réponses sont obsolètes et les supprimer de `ArsManualAnswer` — puis rejouer
cette requête jusqu'à 0 ligne avant de poursuivre.

## 1. Sauvegarde manuelle, et la commande de restauration

Depuis l'interface Dokploy : télécharger le dernier `pg_dump` du service
`postgres-backup`, puis en déclencher un nouveau pour disposer d'une
sauvegarde aussi fraîche que possible juste avant la migration.

**Attendu** : un fichier `.sql.gz` frais téléchargé. Si le déclenchement
échoue, **ne pas continuer**.

Commande de restauration, à garder sous la main pour l'étape 6 (retour
arrière) :

```shell
deploy/scripts/restore-db-dump.sh <sauvegarde-fraiche.sql.gz>
```

## 2. Relever l'« avant », en lecture seule — le back tourne encore

**Cette étape a besoin de l'ancien conteneur back encore en service** (export
via l'écran) : la faire avant l'arrêt de l'étape 3, pas après.

**Par service ETP**, depuis l'ancien écran « Indicateurs ARS » (bouton
d'export) : exporter la grille Excel pour l'année 2025 puis pour l'année
2026. Garder les deux fichiers par service — référence de la comparaison de
l'étape 5.

**Liste des réponses saisies**, toutes années et tous services :

```sql
-- lit seulement, ne modifie rien
SELECT * FROM "ArsManualAnswer" ORDER BY "serviceId", code, year;
```

Garder ce résultat (export CSV ou copie du résultat).

## 3. Arrêter l'ancien conteneur

Arrêter le service back depuis Dokploy, une fois l'étape 2 terminée. L'ancien
conteneur, encore vivant pendant la migration, continuerait d'écrire dans
`ArsManualAnswer` sans passer par `IndicatorAnswer` : une réponse saisie
entre la sauvegarde et la suppression de la table serait perdue sans que la
garde ne la voie. Fenêtre de maintenance : l'application est indisponible
entre cet arrêt et la fin de l'étape 4.

**Attendu** : le service back n'a plus de conteneur en cours d'exécution.

## 4. Déployer

La migration s'applique automatiquement au démarrage du conteneur de
production (`npm run start:migrate:production` → `prisma migrate deploy` puis
lancement du serveur). Déployer l'image comme d'habitude depuis Dokploy.

**Attendu** : dans les logs du conteneur, `All migrations have been
successfully applied.` suivi de `Server is ready`. Un échec de la garde
laisse le journal des migrations bloqué comme aux étapes précédentes
(`docs/multi-tenant/deploiement-etape-3.md` §2 et §4, pour la commande de
déblocage `prisma migrate resolve --rolled-back` et le piège du redémarrage
en boucle) — ne pas rejouer la commande en boucle, lire le message d'abord
et revenir au contrôle du §0 ci-dessus.

## 5. Comparer

**Par service, même requête de contrôle** côté `IndicatorAnswer`, jointe au
jeu et à l'indicateur :

```sql
-- lit seulement, ne modifie rien
SELECT s.name AS service, iset.name AS jeu, i.code, a.year,
       a."numberValue", a."textValue", a."boolValue"
FROM "IndicatorAnswer" a
JOIN "Indicator" i ON i.id = a."indicatorId"
JOIN "IndicatorSet" iset ON iset.id = i."setId"
JOIN "Service" s ON s.id = a."serviceId"
ORDER BY s.name, i.code, a.year;
```

**Attendu** : même nombre de lignes que la liste de l'étape 2, chaque ligne
retrouvée à l'identique (service, code, année, valeurs) — `jeu` vaut
« Grille ARS » pour toutes.

**Par service ETP**, réexporter les grilles 2025 et 2026 depuis le nouvel
écran « Grille ARS » (sous Pilotage, menu du service) et comparer, service
par service et année par année, aux exports de l'étape 2. **Attendu** :
mêmes chiffres partout. Le moindre écart, sur une ligne de la requête
ci-dessus ou sur un indicateur de la grille exportée, signale une perte ou un
décalage : passer à l'étape 6.

## 6. Retour arrière

**Restauration de sauvegarde, sans détour.** `ArsManualAnswer` est
supprimée dans la même migration qui la recopie : une fois la transaction
committée, la seule source qui en contenait la valeur a disparu, et tout ce
qui aura été saisi entre la sauvegarde de l'étape 1 et la restauration sera
**perdu**.

Redéployer l'image précédente (celle d'avant l'étape 4), puis restaurer la
sauvegarde de l'étape 1 **sur la base de production**, avec la commande
donnée à l'étape 1, exécutée là où tourne la production.

**Vérifier positivement**, pas par l'absence d'un nom dans une liste :

```sql
SELECT count(*) AS ars_manual_answer_existe
FROM information_schema.tables
WHERE table_schema = 'public' AND table_name = 'ArsManualAnswer';
```

**Attendu, retour arrière réussi** : `ars_manual_answer_existe` = **1**. Si
le retour arrière a échoué (migration encore appliquée) : **0**.
