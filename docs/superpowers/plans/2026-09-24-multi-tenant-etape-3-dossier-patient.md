# Étape 3 — Dossier patient par service : plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** sortir seize colonnes de parcours et de contenu clinique de la table `Patient` vers un sous-dossier par service, sans qu'aucune valeur ne se perde et sans qu'un service voie celui d'un autre.

**Architecture:** l'identité reste à l'établissement, le parcours part dans `PatientServiceFile`, unique par couple patient/service. `DiagnosticEducatif` et `EnrollmentIssue` se rattachent au sous-dossier. Une seule lecture traverse volontairement la frontière entre services, bornée à un booléen. La migration s'exécute en trois temps dans une transaction, encadrée par des invariants qui portent des sommes de contrôle et non de simples comptages.

**Tech Stack:** Node 24, Fastify 5, Prisma 7 (générateur `prisma-client`, sortie dans `src/generated`), Zod v4, Jest 30 côté back ; React 19, Vite, TanStack Router/Query/Form, Vitest côté front. Biome, wireit.

**Spec:** `docs/superpowers/specs/2026-09-24-multi-tenant-etape-3-dossier-patient-design.md`

## Global Constraints

- **C'est la seule étape du chantier qui déplace des données de santé existantes.** Une migration ratée se rattrape par une restauration de sauvegarde, avec perte de tout ce qui a été saisi entre-temps. Aucune tâche ne s'écarte de cette prudence.
- **Ne jamais migrer, réinitialiser ni écrire dans la base `medisync`.** C'est la base de développement de l'utilisateur, elle contient de vraies données. Les tests passent par `.env.test` et `medisync_test`. Une répétition de migration se fait sur une **copie jetable** créée par `pg_dump`, supprimée ensuite.
- **Ne jamais démarrer de serveur de développement.** Le port 4270 appartient à l'utilisateur.
- **N'utiliser jamais `git stash`** : la pile est partagée avec d'autres sessions.
- **Aucune assertion de type ni de non-nullité** pour faire taire le compilateur. Là où une valeur peut manquer, traiter l'absence.
- `back/src/main/utils/permissions.ts` et `front/src/utils/permissions.ts` sont identiques octet pour octet, vérifié par un test. Cette étape **n'ajoute aucune permission** et n'y touche pas.
- Le garde-fou d'ORM **échoue fermé**. Si un resserrement fait tomber une lecture, on corrige l'appel, jamais le garde-fou.
- Deux tests de dépôt existent et ne doivent être ni contournés ni amendés : `front/src/test/lecture-directe-du-cache.test.ts` et `front/src/test/layouts-de-tenant.test.ts`.
- Commentaires, documentation et messages de commit en français. Terminer chaque message par : `Claude-Session: https://claude.ai/code/session_01G1JrhGqWHmVH6XB2XTTwJe`
- **Portes** : `cd back && npm run build && npm run lint && npm run test:unit -- --ci && npm run test:e2e`, et `cd front && npm run build && npm test`. `cd front && npm run lint` **n'est pas une porte** — il échoue déjà sur `main` avec trente-deux erreurs ; le critère est que la branche n'en ajoute aucune, mesuré en comparant `npx biome lint src` entre la branche et `/Users/couffinhal/Documents/MediSync/front`.

---

## Structure des fichiers

**Créés (back)**

| Fichier | Responsabilité |
|---|---|
| `back/prisma/migrations/<horodatage>_patient_service_file/migration.sql` | La migration en trois temps, écrite à la main. |
| `back/prisma/checks/dossier-patient-avant.sql` | Invariants joués **avant**, avec sommes de contrôle par colonne. |
| `back/prisma/checks/dossier-patient.sql` | Invariants joués **après**, mêmes libellés, comparables ligne à ligne. |
| `back/src/main/domain/patientServiceFile.domain.ts` + son interface | Lecture et écriture du sous-dossier, création automatique. |
| `back/src/main/infra/orm/repositories/patientServiceFile.repository.ts` + son interface | Accès Prisma, filtré par service. |
| `back/src/main/interfaces/http/fastify/schemas/patientServiceFile.schema.ts` | Validation des seize champs, déplacée depuis le schéma patient. |
| `back/src/test/e2e/patient.test.ts` | Le filet manquant : lecture, écriture, suppression, les seize colonnes nommées. |
| `back/src/test/e2e/dossier-service.test.ts` | Cloisonnement des sous-dossiers, et le signal de suivi ailleurs. |

**Créés (front)**

| Fichier | Responsabilité |
|---|---|
| `front/src/api/patientServiceFile.api.ts`, `front/src/queries/usePatientServiceFile.ts` | Accès au sous-dossier. |
| `front/src/components/custom/Patient/edit/identite.patient.tsx` | Le bloc d'identité partagée, extrait de l'onglet actuel. |

**Modifiés (back)** : `schema.prisma`, `tenant-guard.ts` (familles, relations enfants, descente dans les inclusions), `patient.repository.ts` et `patient.domain.ts` (les seize colonnes les quittent), `patient.schema.ts`, `diagnosticEducatif.*` et `enrollmentIssue.*` (rattachement au sous-dossier), `tenant.routes.ts`.

**Modifiés (front)** : `types/patient.ts`, les quatre fichiers de `components/custom/Patient/edit/`, `columns/patient.column.tsx`, `queries/usePatient.tsx`.

---

## Task 1 : le filet manquant — tests end-to-end du patient, avant tout

Le relevé a établi qu'il n'existe **aucun** test end-to-end sur les routes du patient, et qu'aucun test ne nomme une seule des seize colonnes hors du filtrage clinique. La migration la plus risquée du chantier partirait sans filet. Cette tâche l'installe, **sur le code actuel**, avant toute modification.

**Files:**
- Create: `back/src/test/e2e/patient.test.ts`

**Interfaces:**
- Consumes: le harnais e2e existant (`back/src/test/e2e/setup/`), qui fournit `buildTestApp`, `testDb`, `truncateAll` et les fabriques d'utilisateur et d'appartenance.
- Produces: un filet qui doit rester vert **après** la migration, au prix d'un seul changement : le chemin où les seize colonnes se lisent.

- [ ] **Step 1 : lire le harnais avant d'écrire**

```bash
cd back && cat src/test/e2e/setup/fixtures.ts && sed -n '1,40p' src/test/e2e/clinical-fields.test.ts
```

Reprends la forme de `clinical-fields.test.ts` : c'est le seul test e2e qui manipule un patient avec des champs cliniques, et ses fabriques sont celles à réutiliser.

- [ ] **Step 2 : écrire les tests**

Couvre, pour un compte `COORDINATEUR` du service :

1. créer un patient, puis le mettre à jour en renseignant **les seize colonnes nommées une par une**, et relire : chaque valeur revient à l'identique ;
2. la liste des patients contient le patient créé ;
3. la suppression le retire, et retire ses diagnostics et ses problèmes d'inscription ;
4. l'export Excel répond 200 et son corps n'est pas vide.

Les seize noms, à écrire littéralement dans le test et non générés : `medicalDiagnosis`, `entryDate`, `careMode`, `orientation`, `etpDecision`, `programType`, `nonInclusionDetails`, `customContentDetails`, `goal`, `exitDate`, `stopReason`, `etpFinalOutcome`, `referringCaregiver`, `followUpToDo`, `notes`, `details`.

Le compte est de **seize**, vérifié contre `back/prisma/schema.prisma`. Si tu en trouves un autre nombre, arrête-toi et dis-le : tout le plan et la spécification reposent sur cette liste, et un écart signifierait qu'une colonne a été oubliée ou ajoutée depuis.

- [ ] **Step 3 : les voir verts sur le code actuel**

```bash
cd back && npm run test:e2e
```
Attendu : la suite passe. Si l'un de ces tests échoue **avant** toute modification, c'est un défaut préexistant : ne le corrige pas, décris-le et arrête-toi.

- [ ] **Step 4 : commit**

```bash
git add back/src/test/e2e/patient.test.ts
git commit -m "test(patient): poser le filet avant de deplacer les colonnes

Aucun test end-to-end ne couvrait les routes du patient, et aucun test ne
nommait une des colonnes que l'etape 3 va deplacer. La migration la plus
risquee du chantier serait partie sans filet.

Ces tests sont ecrits sur le code actuel et doivent rester verts apres la
migration : c'est leur seule raison d'etre.

Claude-Session: https://claude.ai/code/session_01G1JrhGqWHmVH6XB2XTTwJe"
```

---

## Task 2 : le modèle et ses déclarations au garde-fou

**Files:**
- Modify: `back/prisma/schema.prisma`
- Modify: `back/src/main/infra/orm/tenant-guard.ts`
- Test: `back/src/test/unit/infra/tenant-guard-schema.test.ts`

**Interfaces:**
- Produces: le modèle `PatientServiceFile`, et ses déclarations dans `SERVICE_MODELS`, `TENANT_CHILD_RELATIONS['Patient']` et `NESTED_RELATIONS['Patient']`.

- [ ] **Step 1 : déclarer le modèle**

Dans `back/prisma/schema.prisma`, à côté de `Patient` :

```prisma
// Sous-dossier d'un patient dans un service. L'identite reste sur `Patient`,
// au niveau de l'etablissement ; tout ce qui releve du parcours de soin vit
// ici, invisible des autres services.
model PatientServiceFile {
  id              String @id @default(cuid())
  patientId       String
  serviceId       String
  establishmentId String

  referringCaregiver String?
  followUpToDo       String?
  notes              String?
  details            String?

  medicalDiagnosis     String?
  entryDate            DateTime? @db.Date
  careMode             String?
  orientation          String?
  etpDecision          String?
  programType          String?
  nonInclusionDetails  String?
  customContentDetails String?
  goal                 String?

  exitDate        DateTime? @db.Date
  stopReason      String?
  etpFinalOutcome String?

  createdAt DateTime @default(now())

  patient Patient @relation(fields: [patientId, establishmentId], references: [id, establishmentId], onDelete: Cascade)
  service Service @relation(fields: [serviceId, establishmentId], references: [id, establishmentId])

  diagnostics      DiagnosticEducatif[]
  enrollmentIssues EnrollmentIssue[]

  @@unique([patientId, serviceId])
  @@unique([id, serviceId])
  @@index([serviceId])
  @@index([patientId])
}
```

Ajoute la relation inverse `serviceFiles PatientServiceFile[]` sur `Patient`, et `patientServiceFiles PatientServiceFile[]` sur `Service`. **Ne retire encore aucune colonne de `Patient`** : la tâche 4 le fera, après la copie.

- [ ] **Step 2 : déclarer au garde-fou**

Dans `back/src/main/infra/orm/tenant-guard.ts` : ajouter `'PatientServiceFile'` à `SERVICE_MODELS`, et l'entrée `serviceFiles: 'PatientServiceFile'` dans `TENANT_CHILD_RELATIONS['Patient']` **et** dans `NESTED_RELATIONS['Patient']`.

- [ ] **Step 3 : vérifier que le test de conformité au schéma l'exige**

```bash
cd back && npm run prisma:generate && npm run test:unit -- --ci
```

Ce test lit le schéma et compare les tables de déclaration. Il doit **échouer** si tu oublies une des deux entrées. Retire-en une, constate l'échec, remets-la, et rapporte ce que tu as observé.

- [ ] **Step 4 : créer la migration sans l'appliquer**

```bash
cd back && npm run prisma:migrate:create
```
Nomme-la `patient_service_file`. **N'applique rien.** La tâche 3 réécrit entièrement son contenu.

- [ ] **Step 5 : commit**

```bash
git add back/prisma/schema.prisma back/src/main/infra/orm/tenant-guard.ts back/prisma/migrations
git commit -m "feat(patient): declarer le sous-dossier de service et son cloisonnement

Le modele est pose, ses colonnes sont encore vides et `Patient` garde les
siennes : la tache 3 recopie, la tache 4 supprime. Le garde-fou le connait des
maintenant, pour qu'aucune lecture ne lui echappe pendant l'intervalle.

Claude-Session: https://claude.ai/code/session_01G1JrhGqWHmVH6XB2XTTwJe"
```

---

## Task 3 : les invariants, écrits avant la migration

Ils sont écrits **avant** la migration, et non après, pour une raison précise : un invariant écrit après coup est écrit en connaissance du résultat, et tend à vérifier ce que la migration a fait plutôt que ce qu'elle devait faire.

**Files:**
- Create: `back/prisma/checks/dossier-patient-avant.sql`
- Create: `back/prisma/checks/dossier-patient.sql`

**Interfaces:**
- Consumes: le schéma d'avant migration.
- Produces: deux fichiers aux **libellés identiques**, comparables ligne à ligne.

- [ ] **Step 1 : lire la forme éprouvée**

```bash
cd back && cat prisma/checks/multi-tenant-socle-avant.sql
```

Reprends sa forme : un `SELECT … UNION ALL`, un libellé par mesure, rejouable à l'identique.

- [ ] **Step 2 : ce que les invariants doivent prouver**

Les fichiers de l'étape 1 comptaient des lignes, parce que les lignes se déplaçaient. **Ici les lignes ne bougent pas, ce sont les valeurs qui changent de table.** Un comptage resterait vert sur une migration qui aurait recopié des colonnes vides, ou décalé d'une ligne. Il faut donc trois familles de mesures :

1. **Des comptages de présence**, une ligne par colonne : combien de valeurs non nulles. Avant, sur `Patient` ; après, sur `PatientServiceFile`.
2. **Une somme de contrôle par colonne**, sur le contenu ordonné par patient. C'est la seule mesure qui attrape une recopie décalée, qu'un comptage laisse passer.
3. **Des invariants de structure** : autant de sous-dossiers que de patients, aucun sous-dossier orphelin, aucun sous-dossier dans un service d'un autre établissement, aucun diagnostic ni problème d'inscription orphelin.

- [ ] **Step 3 : écrire le fichier « avant »**

`back/prisma/checks/dossier-patient-avant.sql`, en entier :

```sql
-- À jouer AVANT la migration patient_service_file. Comparer chaque ligne de sa sortie,
-- libellé par libellé, à celle de dossier-patient.sql jouée APRÈS : toute valeur
-- différente signale une perte, une recopie vide ou un décalage.
--
-- Les comptages seuls ne suffisent PAS ici : les lignes ne se déplacent pas, ce sont les
-- valeurs qui changent de table. Une recopie décalée d'une ligne garderait des comptages
-- identiques. D'où la somme de contrôle sur le contenu ordonné, qui, elle, la détecte.

SELECT 'Patients' AS check, count(*)::text AS value FROM "Patient"
UNION ALL SELECT 'Etablissements', count(*)::text FROM "Establishment"
UNION ALL SELECT 'Services', count(*)::text FROM "Service"

-- Presence : une ligne par colonne qui demenage.
UNION ALL SELECT 'Presence medicalDiagnosis', count("medicalDiagnosis")::text FROM "Patient"
UNION ALL SELECT 'Presence entryDate', count("entryDate")::text FROM "Patient"
UNION ALL SELECT 'Presence careMode', count("careMode")::text FROM "Patient"
UNION ALL SELECT 'Presence orientation', count("orientation")::text FROM "Patient"
UNION ALL SELECT 'Presence etpDecision', count("etpDecision")::text FROM "Patient"
UNION ALL SELECT 'Presence programType', count("programType")::text FROM "Patient"
UNION ALL SELECT 'Presence nonInclusionDetails', count("nonInclusionDetails")::text FROM "Patient"
UNION ALL SELECT 'Presence customContentDetails', count("customContentDetails")::text FROM "Patient"
UNION ALL SELECT 'Presence goal', count("goal")::text FROM "Patient"
UNION ALL SELECT 'Presence exitDate', count("exitDate")::text FROM "Patient"
UNION ALL SELECT 'Presence stopReason', count("stopReason")::text FROM "Patient"
UNION ALL SELECT 'Presence etpFinalOutcome', count("etpFinalOutcome")::text FROM "Patient"
UNION ALL SELECT 'Presence referringCaregiver', count("referringCaregiver")::text FROM "Patient"
UNION ALL SELECT 'Presence followUpToDo', count("followUpToDo")::text FROM "Patient"
UNION ALL SELECT 'Presence notes', count("notes")::text FROM "Patient"
UNION ALL SELECT 'Presence details', count("details")::text FROM "Patient"

-- Somme de controle : contenu ordonne par patient, colonne par colonne.
UNION ALL SELECT 'Empreinte medicalDiagnosis',
  coalesce(md5(string_agg(coalesce("medicalDiagnosis", '~'), '|' ORDER BY id)), 'vide') FROM "Patient"
UNION ALL SELECT 'Empreinte entryDate',
  coalesce(md5(string_agg(coalesce("entryDate"::text, '~'), '|' ORDER BY id)), 'vide') FROM "Patient"
UNION ALL SELECT 'Empreinte careMode',
  coalesce(md5(string_agg(coalesce("careMode", '~'), '|' ORDER BY id)), 'vide') FROM "Patient"
UNION ALL SELECT 'Empreinte orientation',
  coalesce(md5(string_agg(coalesce("orientation", '~'), '|' ORDER BY id)), 'vide') FROM "Patient"
UNION ALL SELECT 'Empreinte etpDecision',
  coalesce(md5(string_agg(coalesce("etpDecision", '~'), '|' ORDER BY id)), 'vide') FROM "Patient"
UNION ALL SELECT 'Empreinte programType',
  coalesce(md5(string_agg(coalesce("programType", '~'), '|' ORDER BY id)), 'vide') FROM "Patient"
UNION ALL SELECT 'Empreinte nonInclusionDetails',
  coalesce(md5(string_agg(coalesce("nonInclusionDetails", '~'), '|' ORDER BY id)), 'vide') FROM "Patient"
UNION ALL SELECT 'Empreinte customContentDetails',
  coalesce(md5(string_agg(coalesce("customContentDetails", '~'), '|' ORDER BY id)), 'vide') FROM "Patient"
UNION ALL SELECT 'Empreinte goal',
  coalesce(md5(string_agg(coalesce("goal", '~'), '|' ORDER BY id)), 'vide') FROM "Patient"
UNION ALL SELECT 'Empreinte exitDate',
  coalesce(md5(string_agg(coalesce("exitDate"::text, '~'), '|' ORDER BY id)), 'vide') FROM "Patient"
UNION ALL SELECT 'Empreinte stopReason',
  coalesce(md5(string_agg(coalesce("stopReason", '~'), '|' ORDER BY id)), 'vide') FROM "Patient"
UNION ALL SELECT 'Empreinte etpFinalOutcome',
  coalesce(md5(string_agg(coalesce("etpFinalOutcome", '~'), '|' ORDER BY id)), 'vide') FROM "Patient"
UNION ALL SELECT 'Empreinte referringCaregiver',
  coalesce(md5(string_agg(coalesce("referringCaregiver", '~'), '|' ORDER BY id)), 'vide') FROM "Patient"
UNION ALL SELECT 'Empreinte followUpToDo',
  coalesce(md5(string_agg(coalesce("followUpToDo", '~'), '|' ORDER BY id)), 'vide') FROM "Patient"
UNION ALL SELECT 'Empreinte notes',
  coalesce(md5(string_agg(coalesce("notes", '~'), '|' ORDER BY id)), 'vide') FROM "Patient"
UNION ALL SELECT 'Empreinte details',
  coalesce(md5(string_agg(coalesce("details", '~'), '|' ORDER BY id)), 'vide') FROM "Patient"
;
```

Le `coalesce(..., '~')` compte : sans lui, une valeur nulle disparaîtrait de l'agrégat et un décalage passerait inaperçu. L'ordre par `id` doit être **le même** dans les deux fichiers.

- [ ] **Step 4 : écrire le fichier « après »**

`back/prisma/checks/dossier-patient.sql`, avec les **mêmes libellés**, mesurés sur `PatientServiceFile` et joints à `Patient` par `patientId` pour que l'ordre reste celui du patient :

```sql
UNION ALL SELECT 'Empreinte medicalDiagnosis',
  coalesce(md5(string_agg(coalesce(f."medicalDiagnosis", '~'), '|' ORDER BY f."patientId")), 'vide')
  FROM "PatientServiceFile" f
```

Ajoute les invariants de structure, absents du fichier « avant » puisqu'ils n'ont de sens qu'après :

```sql
UNION ALL SELECT 'Sous-dossiers sans patient', count(*)::text FROM "PatientServiceFile" f
  WHERE NOT EXISTS (SELECT 1 FROM "Patient" p WHERE p.id = f."patientId")
UNION ALL SELECT 'Sous-dossiers hors etablissement du service', count(*)::text
  FROM "PatientServiceFile" f JOIN "Service" s ON s.id = f."serviceId"
  WHERE s."establishmentId" <> f."establishmentId"
UNION ALL SELECT 'Patients sans sous-dossier', count(*)::text FROM "Patient" p
  WHERE NOT EXISTS (SELECT 1 FROM "PatientServiceFile" f WHERE f."patientId" = p.id)
UNION ALL SELECT 'Diagnostics orphelins', count(*)::text FROM "DiagnosticEducatif" d
  WHERE NOT EXISTS (SELECT 1 FROM "PatientServiceFile" f
                    WHERE f."patientId" = d."patientId" AND f."serviceId" = d."serviceId")
```

Les trois derniers doivent valoir **0**, et « Patients sans sous-dossier » aussi : sept des dix patients de la base de développement n'ont aucune activité de service, et doivent malgré tout recevoir un sous-dossier.

- [ ] **Step 5 : les jouer sur la base de test, avant toute migration**

```bash
cd back && npm run with:dotenv -- -e .env.test.local -e .env.test -- prisma db seed
docker exec medisync-postgres psql -U postgres -d medisync_test < prisma/checks/dossier-patient-avant.sql
```
Attendu : la requête s'exécute sans erreur et rend une ligne par mesure. **Ne joue rien contre `medisync`.**

- [ ] **Step 6 : commit**

```bash
git add back/prisma/checks
git commit -m "test(migration): des invariants qui portent sur les valeurs, pas sur les lignes

A l'etape 1 les lignes se deplacaient, un comptage suffisait. Ici les lignes ne
bougent pas : ce sont les valeurs qui changent de table. Un comptage resterait
vert sur une recopie vide ou decalee d'une ligne, d'ou une somme de controle
par colonne sur le contenu ordonne.

Ecrits avant la migration, et non apres : un invariant ecrit en connaissance du
resultat verifie ce que la migration a fait, pas ce qu'elle devait faire.

Claude-Session: https://claude.ai/code/session_01G1JrhGqWHmVH6XB2XTTwJe"
```

---

## Task 4 : la migration

**Files:**
- Modify: `back/prisma/migrations/<horodatage>_patient_service_file/migration.sql`
- Modify: `back/prisma/schema.prisma` (retrait des seize colonnes de `Patient`)

**Interfaces:**
- Consumes: le modèle de la tâche 2, les invariants de la tâche 3.
- Produces: la table remplie, les enfants rattachés, les colonnes retirées de `Patient`.

- [ ] **Step 1 : la garde du service unique, en tête**

La migration **refuse de s'exécuter** si un établissement a plus d'un service. C'est le cas en production aujourd'hui, et le restera tant que l'étape 4 n'aura pas donné le moyen d'en créer depuis l'interface. Répartir au jugé les notes cliniques d'un patient entre deux services produirait une perte silencieuse, qui est le pire résultat possible.

```sql
DO $$
DECLARE fautif text;
BEGIN
  SELECT string_agg(e.name || ' (' || c || ' services)', ', ')
  INTO fautif
  FROM (SELECT "establishmentId", count(*) AS c FROM "Service" GROUP BY 1 HAVING count(*) > 1) x
  JOIN "Establishment" e ON e.id = x."establishmentId";

  IF fautif IS NOT NULL THEN
    RAISE EXCEPTION 'Migration refusee : ces etablissements ont plusieurs services (%). '
      'Les colonnes de parcours d''un patient sont uniques et ne peuvent pas etre reparties '
      'automatiquement. Une procedure guidee est necessaire.', fautif;
  END IF;
END $$;
```

- [ ] **Step 2 : les trois temps**

1. Créer la table et ses contraintes — Prisma l'a déjà généré par `migrate:create`, garde ce bloc.
2. Remplir :

```sql
INSERT INTO "PatientServiceFile" (
  id, "patientId", "serviceId", "establishmentId",
  "referringCaregiver", "followUpToDo", notes, details,
  "medicalDiagnosis", "entryDate", "careMode", orientation, "etpDecision",
  "programType", "nonInclusionDetails", "customContentDetails", goal,
  "exitDate", "stopReason", "etpFinalOutcome", "createdAt"
)
SELECT
  gen_random_uuid()::text, p.id, s.id, p."establishmentId",
  p."referringCaregiver", p."followUpToDo", p.notes, p.details,
  p."medicalDiagnosis", p."entryDate", p."careMode", p.orientation, p."etpDecision",
  p."programType", p."nonInclusionDetails", p."customContentDetails", p.goal,
  p."exitDate", p."stopReason", p."etpFinalOutcome", now()
FROM "Patient" p
JOIN "Service" s ON s."establishmentId" = p."establishmentId";
```

La jointure sur le service unique de l'établissement est ce que la garde du temps 1 rend sûr.

3. Rattacher les enfants, puis retirer les colonnes de `Patient` — dans cet ordre, jamais l'inverse.

- [ ] **Step 3 : retirer les colonnes du schéma Prisma**

Retire les seize colonnes du modèle `Patient` dans `back/prisma/schema.prisma`, et régénère :

```bash
cd back && npm run prisma:generate && npx tsc --noEmit -p tsconfig.json
```

Le compilateur va maintenant **énumérer** tous les usages de ces colonnes. C'est la partie utile de cette étape : traite-les un par un, ne fais taire aucune erreur.

- [ ] **Step 4 : répéter sur une copie jetable, jamais sur `medisync`**

```bash
docker exec medisync-postgres pg_dump -U postgres -Fc -d medisync -f /tmp/av.dump
docker exec medisync-postgres psql -U postgres -c 'CREATE DATABASE medisync_etape3_check;'
docker exec medisync-postgres pg_restore -U postgres -d medisync_etape3_check /tmp/av.dump
docker exec -i medisync-postgres psql -U postgres -d medisync_etape3_check < back/prisma/checks/dossier-patient-avant.sql > /tmp/avant.txt
cd back && DATABASE_URL="postgres://postgres:postgres@localhost:5433/medisync_etape3_check?schema=public" npm run prisma:migrate:deploy
docker exec -i medisync-postgres psql -U postgres -d medisync_etape3_check < back/prisma/checks/dossier-patient.sql > /tmp/apres.txt
```

**Le port est 5433 sur cette machine**, pas 5432 : un conteneur Postgres d'un autre projet occupe 5432, et une commande recopiée telle quelle s'y connecterait sans erreur visible.

Compare les deux sorties **en normalisant l'espacement**, `psql` alignant la colonne des libellés sur le libellé le plus long de son propre résultat :

```bash
# Le motif distingue les mesures comparables des invariants de structure : sans le
# `|` exige apres les trois premiers libelles, « Patients sans sous-dossier » serait
# capte par « Patients » et produirait un faux ecart sur une migration PARFAITE —
# c'est-a-dire un retour arriere inutile, sous tension.
norm() { grep -E '^ (Patients|Etablissements|Services) +\||^ (Presence|Empreinte) ' "$1" \
  | sed 's/|/ /' | awk '{v=$NF; $NF=""; gsub(/[[:space:]]+$/,"",$0); gsub(/[[:space:]]+/," ",$0); print $0" = "v}' | sort; }
diff <(norm /tmp/avant.txt) <(norm /tmp/apres.txt) && echo "aucun ecart"
```

Attendu : **aucun écart** sur les présences et les empreintes, et les quatre invariants de structure à 0. Supprime ensuite la copie :

```bash
docker exec medisync-postgres psql -U postgres -c 'DROP DATABASE medisync_etape3_check;'
docker exec medisync-postgres rm -f /tmp/av.dump
```

- [ ] **Step 5 : commit**

```bash
git add back/prisma
git commit -m "feat(migration): deplacer le parcours du patient vers un sous-dossier de service

Trois temps dans une transaction : creer, recopier, contraindre et nettoyer. La
migration refuse de s'executer si un etablissement a plusieurs services — les
colonnes de parcours d'un patient sont uniques et les repartir au juge
produirait une perte silencieuse.

Repetee sur une copie jetable des donnees reelles : aucun ecart sur les
presences ni sur les empreintes des seize colonnes, quatre invariants de
structure a zero.

Claude-Session: https://claude.ai/code/session_01G1JrhGqWHmVH6XB2XTTwJe"
```

---

## Task 5 : l'accès au sous-dossier, côté back

**Files:**
- Create: `back/src/main/infra/orm/repositories/patientServiceFile.repository.ts` + son interface dans `types/infra/orm/repositories/`
- Create: `back/src/main/domain/patientServiceFile.domain.ts` + son interface dans `types/domain/`
- Create: `back/src/main/interfaces/http/fastify/schemas/patientServiceFile.schema.ts`
- Modify: `back/src/main/interfaces/http/fastify/routes/patient.ts`, `application/ioc/awilix/awilix-ioc-container.ts`, `types/application/ioc.ts`, `schemas/patient.schema.ts`

**Interfaces:**
- Produces: `findByPatient(patientId)`, `upsert(patientId, params)` — le repository pose `serviceId` et `establishmentId` lui-même, l'appelant ne les fournit pas, comme tous les repositories de ce dépôt.

- [ ] **Step 1 : lire un repository de service existant avant d'écrire**

```bash
cd back && cat src/main/infra/orm/repositories/enrollmentIssue.repository.ts
```
Suis sa forme : `this.scope` par méthode, jamais au constructeur ; `boomErrorFromPrismaError` pour les erreurs Prisma ; clé composite `id_serviceId` pour les recherches par identifiant.

- [ ] **Step 2 : le repository**

`findByPatient` filtre sur `{ patientId, ...this.scope }`. `upsert` emploie la clé `patientId_serviceId` et pose `...this.scope` dans la branche de création.

**La création automatique vit ici, dans `upsert`, et nulle part ailleurs.** Le relevé a établi qu'aucun chemin de création de patient ne renseigne ces colonnes : elles sont toujours écrites après coup. Un `upsert` suffit donc, et évite d'avoir à créer le sous-dossier à l'inscription dans un parcours.

- [ ] **Step 3 : déplacer les seize champs du schéma de validation**

Retire-les de l'objet `patientEntity` de `patient.schema.ts` et porte-les dans `patientServiceFile.schema.ts`, à l'identique — mêmes types, mêmes contraintes. C'est le seul endroit du back où ces colonnes sont énumérées à la main.

- [ ] **Step 4 : les routes**

Sous le préfixe de service existant, montées dans `tenant.routes.ts` : lecture et écriture du sous-dossier d'un patient. Permissions `patient:read` et `patient:write`, **aucune permission nouvelle**. Le `onRoute` fait échouer le démarrage si elles manquent.

- [ ] **Step 5 : vérifier, puis commiter**

```bash
cd back && npm run build && npm run lint && npm run test:unit -- --ci && npm run test:e2e
```

Le filet de la tâche 1 doit être adapté : les seize colonnes se lisent désormais sur le sous-dossier. **C'est le seul changement autorisé sur ce fichier de test** — si tu dois en changer autre chose, c'est que le comportement a régressé.

---

## Task 6 : rattacher les diagnostics et les problèmes d'inscription

**Files:**
- Modify: `back/prisma/schema.prisma`, la migration de la tâche 4, les repositories et domaines de `DiagnosticEducatif` et `EnrollmentIssue`

**Interfaces:**
- Produces: les deux modèles pointent vers `PatientServiceFile` par `(patientId, serviceId)` au lieu de `Patient` par `(patientId, establishmentId)`.

Cela ferme une incohérence du schéma actuel : ce sont des modèles de **service** qui dépendaient d'un parent d'**établissement**. Après cette tâche la chaîne est homogène.

- [ ] **Step 1** : dans le schéma, remplacer la relation `patient` par une relation `serviceFile` vers `PatientServiceFile(patientId, serviceId)`, en conservant `onDelete: Cascade`.
- [ ] **Step 2** : compléter le temps 3 de la migration pour poser la nouvelle clé étrangère après le remplissage.
- [ ] **Step 3** : traiter les erreurs de typage que le compilateur révèle. Les lectures par patient deviennent des lectures par sous-dossier.
- [ ] **Step 4** : rejouer la répétition de la tâche 4, étape 4, en entier. L'invariant « Diagnostics orphelins » doit valoir 0.
- [ ] **Step 5** : commit.

---

## Task 7 : le signal de suivi ailleurs

**C'est le seul endroit de tout le chantier où une lecture traverse volontairement la frontière entre services.** Il doit être unique, étroit et déclaré.

**Files:**
- Modify: `back/src/main/domain/patientServiceFile.domain.ts`, `back/src/main/infra/orm/repositories/patientServiceFile.repository.ts`
- Create: `back/src/test/e2e/dossier-service.test.ts`

**Interfaces:**
- Produces: `estSuiviAilleurs(patientId): Promise<boolean>` — un booléen, rien d'autre.

- [ ] **Step 1 : la fonction**

Elle rend vrai si le patient a au moins un sous-dossier dans un **autre** service du **même** établissement. Elle ne rend jamais d'identifiant, de nom de service, de compte, de date ni de contenu. Un booléen.

Elle s'exécute dans le mode encadré que le garde-fou d'ORM prévoit pour les traitements hors requête — cherche `runAsSystem` dans `back/src/main/utils/tenant-context.ts` — et **jamais** en assouplissant le garde-fou. Commente la raison : c'est une exception assumée, elle doit se lire comme telle.

- [ ] **Step 2 : les tests, dans cet ordre d'importance**

1. **Le test d'unicité de l'exception**, le plus important de l'étape : aucun autre endroit du back ne lit les sous-dossiers d'un autre service. Écris-le à la manière de `front/src/test/lecture-directe-du-cache.test.ts` — une lecture des sources qui échoue si `runAsSystem` apparaît ailleurs que dans les emplacements nommés. Vérifie l'échec dans les deux sens.
2. Le signal rend vrai quand un sous-dossier existe dans un autre service, faux quand il n'en existe pas, faux quand le seul autre sous-dossier est dans un autre **établissement**.
3. Le cloisonnement : deux services, un même patient, chacun ne lit que son sous-dossier — et l'autre reçoit 404, jamais un sous-dossier vide.

- [ ] **Step 3** : vérifier chaque test rouge sans son mécanisme, et commiter.

---

## Task 8 : le filtrage clinique couvre le sous-dossier

Les crochets filtrent par nom de champ, récursivement, et le sous-dossier est servi par les mêmes routes : il devrait être couvert sans modification. **Cette affirmation doit être prouvée par un test, pas supposée.** C'est le genre de propriété qu'on croit acquise et qui ne l'est pas — ce chantier en a corrigé huit.

**Files:**
- Modify: `back/src/test/e2e/clinical-fields.test.ts`

- [ ] **Step 1** : ajouter les cas — un compte `SECRETARIAT` lit un sous-dossier et n'y voit ni `notes`, ni `details`, ni `medicalDiagnosis`, mais y voit `goal`, `programType` et `stopReason` ; il écrit dans le sous-dossier et les trois champs cliniques restent **inchangés**, ni écrasés ni vidés.
- [ ] **Step 2** : vérifier ces tests rouges en retirant temporairement le crochet, et commiter.

---

## Task 9 : le garde-fou descend dans les inclusions imbriquées

L'étape 2 a laissé cette limite, et a écrit dans le garde-fou la condition exacte qui la rouvrirait : *une lecture qui atteindrait un modèle d'établissement par une relation incluse, puis redescendrait de lui vers un modèle de service*.

**La lecture d'un patient avec son sous-dossier est exactement cette forme.** La limite a été documentée pour être levée ici.

**Files:**
- Modify: `back/src/main/infra/orm/tenant-guard.ts`
- Modify: `back/src/test/unit/infra/tenant-guard.test.ts`, `tenant-guard-schema.test.ts`

- [ ] **Step 1** : lire le commentaire de la limite dans `tenant-guard.ts`, et la liste des chaînes qu'il nomme.
- [ ] **Step 2** : étendre le contrôle pour qu'il descende récursivement. Il faut une table parent → relation → cible pour **tous** les modèles, pas seulement ceux d'établissement. Le test de conformité au schéma doit la tenir, comme il tient déjà les deux autres.
- [ ] **Step 3** : corriger les lectures que le resserrement fait tomber — **l'appel, jamais le garde-fou**. S'il te paraît refuser à tort, décris le cas et arrête-toi.
- [ ] **Step 4** : retirer le commentaire de limite, qui n'a plus d'objet, et vérifier qu'aucune autre phrase du dépôt ne l'annonce encore.
- [ ] **Step 5** : commit.

---

## Task 10 : l'accès au sous-dossier, côté front

**Files:**
- Create: `front/src/api/patientServiceFile.api.ts`, `front/src/queries/usePatientServiceFile.ts`, `front/src/types/patientServiceFile.ts`
- Modify: `front/src/types/patient.ts` (les seize champs le quittent)

- [ ] **Step 1** : le type du sous-dossier reprend les seize champs, le type `Patient` les perd. Le compilateur énumère ensuite les usages : traite-les un par un.
- [ ] **Step 2** : le module d'API compose son URL par `tenantApiUrl()`, comme les quatorze autres. **Ne prends pas le tenant en argument** : le contexte est implicite et vient de l'URL, c'est la convention du dépôt — voir `front/CLAUDE.md`.
- [ ] **Step 3** : les clés de requête **ne portent pas** le tenant. Le cloisonnement du cache repose sur un client neuf par couple et sur le démontage des écrans. Ne « fais pas mieux » en préfixant : deux mécanismes concurrents, dont l'un incomplet, valent moins qu'un seul entier.
- [ ] **Step 4** : vérifier, commiter.

## Task 11 : la fiche patient en deux blocs

C'est la décision 2.3 de la spécification, et son motif n'est pas esthétique : sans cette séparation, on peut croire qu'une note est visible de tous, ou qu'une profession ne l'est pas. Le premier cas est un risque de confidentialité, le second de double saisie.

**Files:**
- Create: `front/src/components/custom/Patient/edit/identite.patient.tsx`
- Modify: `details.patient.tsx`, `pathway-inclusion.patient.tsx`, `outcome-review.patient.tsx`, `edit.patient.tsx`, `form.patient.ts`

- [ ] **Step 1** : l'onglet « Profil & Contexte » mêle aujourd'hui `referringCaregiver`, `followUpToDo`, `notes` et `details`, qui déménagent, avec `distance`, `educationLevel`, `occupation` et `currentActivity`, qui restent. Sépare-les en deux blocs **nommés** : l'identité partagée entre les services de l'établissement, et le dossier de ce service.
- [ ] **Step 2** : l'enregistrement écrit désormais à deux endroits. Une seule action pour l'utilisateur, deux appels. Si l'un échoue, dis lequel — ne laisse pas croire que tout a été enregistré.
- [ ] **Step 3** : les deux autres onglets ne portent que des champs du sous-dossier, leur découpage ne change pas.
- [ ] **Step 4** : vérifier, commiter.

## Task 12 : la liste des patients par service

**Files:** `back/src/main/infra/orm/repositories/patient.repository.ts`, `front/src/columns/patient.column.tsx`, `front/src/routes/.../patient/index.tsx`

- [ ] **Step 1** : la liste rend les patients ayant un sous-dossier **dans le service courant**, au lieu de tous ceux de l'établissement. C'est le changement le plus visible de l'étape pour l'utilisateur.
- [ ] **Step 2** : la colonne `entryDate` du tableau se lit désormais sur le sous-dossier.
- [ ] **Step 3** : un test e2e prouve que la liste d'un service ne contient pas un patient suivi uniquement dans l'autre. **C'est le test qui rend la vérification manuelle possible** : jusqu'ici, les deux services montraient les mêmes patients.
- [ ] **Step 4** : vérifier, commiter.

## Task 13 : créer un patient en cherchant une identité existante

**Files:** `front/src/components/custom/popup/addPatientForm.tsx`, route de recherche côté back

- [ ] **Step 1** : avant de créer, l'écran cherche une identité existante **dans l'établissement**, pour éviter les doublons.
- [ ] **Step 2** : **la recherche ne révèle que l'identité** — nom, prénom, date de naissance. Jamais le suivi, jamais un service, jamais un contenu. Un test le prouve.
- [ ] **Step 3** : choisir une identité existante crée le sous-dossier dans le service courant, sans toucher à l'identité.
- [ ] **Step 4** : vérifier, commiter.

## Task 14 : le signal de suivi ailleurs, à l'écran

**Files:** `front/src/components/custom/Patient/view/overview.patient.tsx` ou le bloc d'identité de la tâche 11

- [ ] **Step 1** : une mention sobre dans le bloc d'identité, qui dit ce qu'elle dit : cette personne est suivie dans un autre service. **Ni le nom du service, ni leur nombre, ni aucune date.**
- [ ] **Step 2** : un test vérifie que la mention apparaît quand le booléen est vrai, et pas sinon.
- [ ] **Step 3** : vérifier, commiter.

## Task 15 : documentation, déploiement en production, vérification manuelle

**Files:**
- Create: `docs/multi-tenant/decisions-etape-3.md`, `docs/multi-tenant/deploiement-etape-3.md`, `docs/multi-tenant/verification-etape-3.md`
- Modify: `back/CLAUDE.md`, `front/CLAUDE.md`

- [ ] **Step 1 : les décisions**

Sur le modèle des deux documents existants : chaque décision, son motif, et ce qu'elle coûte si elle est fausse. Au minimum : la ligne de partage entre ce qui reste et ce qui déménage ; le sous-dossier vide avec signal de suivi ailleurs, et le fait que ce signal est **une fuite d'information délibérée et bornée** ; le refus de migrer un établissement à plusieurs services ; et les invariants par empreinte plutôt que par comptage.

- [ ] **Step 2 : le déploiement en production — la partie qui compte**

**Établis d'abord l'état réel de la production.** Le document de déploiement de l'étape 1 dit que la production ne l'avait pas encore reçue. Si c'est toujours vrai, **trois migrations s'appliqueront d'un coup au premier démarrage du conteneur** : le socle, puis celle-ci. Le document doit dire cet ordre, et comment le vérifier avant de déployer :

```shell
# combien de migrations la production a-t-elle deja appliquees ?
# (a lancer sur la base de production, en lecture seule)
select count(*) from "_prisma_migrations";
```

Écris la procédure sur le modèle de `docs/multi-tenant/deploiement-etape-1.md`, dont tu reprendras les acquis durement gagnés :

- **une sauvegarde manuelle avant toute chose**, et la façon de la restaurer ;
- **une fenêtre de maintenance** : arrêter l'ancien conteneur avant de déployer, faute de quoi il écrit pendant que les contraintes se posent ;
- **une répétition sur une copie du dump de production**, avec les invariants joués avant et après et comparés en normalisant l'espacement ;
- **la mise en garde sur le port** : sur la machine de développement, un conteneur Postgres d'un autre projet occupe 5432 et MediSync écoute sur 5433 ;
- **le retour arrière est une restauration de sauvegarde**, et le document doit le dire sans détour : contrairement aux étapes précédentes, il n'y a pas de correctif de code qui rattrape une migration ratée ici.

Dis aussi que les utilisateurs seront déconnectés une fois, comme à l'étape 2, si la version déployée est la première à porter le contexte front.

- [ ] **Step 3 : la vérification manuelle**

Huit points au plus, chacun disant ce qu'on fait et ce qu'on doit observer. **Fonde-la sur ce que le seed rend réellement visible** : à l'étape 2, la liste des patients était identique dans les deux services et une procédure qui s'y serait fiée n'aurait rien contrôlé. Après cette étape ce n'est plus vrai — c'est même le critère de sortie — mais vérifie-le plutôt que de le supposer.

- [ ] **Step 4 : les conventions**

Porte dans les deux guides ce que cette étape change : le sous-dossier est un modèle de service ; les seize colonnes ne sont plus sur le patient ; et l'exception de lecture inter-services, avec l'endroit unique où elle vit et le test qui la tient.

- [ ] **Step 5** : les six portes, et le décompte de lint du front comparé à `main`. Commit.

---

## Auto-relecture du plan

**Couverture de la spécification.** §2.1 → tâches 7 et 14. §2.2 → tâche 8. §2.3 → tâche 11. §3.1 et §3.2 → tâches 2 et 4. §3.3 → tâche 6. §4 → tâches 3 et 4. §5.1 → tâche 5. §5.2 → tâche 8. §5.3 → tâche 7. §5.4 → tâche 9. §6 → tâches 10 à 14. §7 → tâches 1, 7, 8, 12, 13. §8 → tâche 15.

**Conflits entre tâches.**

| Paire | Ce qui se partage | Constat |
|---|---|---|
| 1 → 4, 5 | le filet e2e du patient | Écrit sur le code actuel en tâche 1, il doit rester vert après. La tâche 5 n'a le droit d'y changer **qu'une chose** : le chemin où les seize colonnes se lisent. Tout autre changement signale une régression. |
| 2 → 4 | le modèle et la migration générée | La tâche 2 crée la migration par l'outil mais ne l'applique pas ; la tâche 4 en réécrit le contenu. Ordre impératif. |
| 3 → 4 | les invariants | Écrits **avant** la migration, délibérément : un invariant écrit après vérifie ce qui a été fait, pas ce qui devait l'être. |
| 4 ↔ 6 | la migration et les clés étrangères des enfants | La tâche 6 complète le temps 3 de la migration écrite en 4, et impose de **rejouer la répétition en entier**. Ne pas se fier à celle de la tâche 4. |
| 4 → 5, 10 | le retrait des colonnes de `Patient` | Il fait tomber le typage partout : c'est voulu, c'est le moyen d'énumérer les usages. Les tâches 5 et 10 traitent respectivement le back et le front. |
| 7 ↔ 9 | le garde-fou | La tâche 7 emploie le mode encadré pour une exception assumée ; la tâche 9 resserre le garde-fou. Le test d'unicité de la tâche 7 doit rester vert après 9. |
| 9 ↔ toutes les lectures | le resserrement | Il fera probablement tomber des lectures. **Corriger l'appel, jamais le garde-fou.** |
| 12 ↔ vérification manuelle | la liste par service | C'est la tâche 12 qui rend la vérification manuelle capable de démontrer quelque chose. Avant elle, les deux services montrent les mêmes patients. |

**Cohérence interne.** Le compte des colonnes est de **seize**, vérifié contre le schéma ; la spécification l'annonçait à tort comme dix-sept, corrigé dans les deux documents. Les noms employés dans les tâches 1, 3, 4 et 5 sont la même liste, dans le même ordre.

**Ce que ce plan ne dit pas, et qui devra être tranché en chemin.** Le comportement exact de l'enregistrement en deux appels de la tâche 11 quand le second échoue ; et ce que la liste par service montre à un compte qui n'a aucun sous-dossier dans le service courant — une liste vide, ou un message. Les deux sont des décisions d'interface, à prendre au moment où l'écran existe, pas maintenant.
