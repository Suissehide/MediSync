# Catégories de la fiche patient — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** remplacer les deux sections figées de la fiche (`pathway`, `outcome`) par des catégories que le coordinateur crée, renomme, réordonne et supprime, les deux existantes gardant les dates d'entrée et de sortie.

**Architecture:** une table `ServiceFieldCategory` par service ; `ServiceFieldDefinition.section` devient `categoryId`. Les deux catégories à date sont créées par migration pour les services existants et à la première lecture pour les nouveaux. Le front construit onglets, groupes de colonnes et blocs de configuration depuis les catégories.

**Tech Stack:** Fastify 5, Prisma 7, Zod v4, Jest (back) ; React 19, TanStack Router/Query/Form/Table, Vitest (front). Biome.

**Spec:** `docs/superpowers/specs/2026-10-10-categories-fiche-design.md`

## Global Constraints

- **Ne jamais migrer, réinitialiser ni écrire dans `medisync`** ; tests sur `medisync_test` ; répétition sur une copie jetable (port **5433**).
- Jamais de serveur de dev, jamais de `git stash`, jamais de `pkill` large.
- Biome sur les fichiers touchés, jamais de `biome-ignore`, pas d'`as`/`!` pour faire taire le compilateur (le `'pathway' as ServiceFieldSection` de `serviceFields.patient.tsx` disparaît avec le type), commentaires une ligne ou rien en français, commits en français.
- Libellés d'interface : **« Supprimer » / « Supprimés » / « Restaurer »**, jamais « Archiver » / « Archivés », dans les écrans de configuration de la fiche (champs, choix, catégories). Le modèle et l'API gardent l'archivage.
- Texte principal en `text-foreground`, jamais `text-text` (gris #cbd5e1, illisible).
- Garde-fou d'ORM : échoue fermé ; pas de SQL brut dans un repository.
- Un autre chantier (`worktree-indicateurs-configurables`) ajoute une migration `20261010200000_indicator_sets` et touche `schema.prisma` : nommer la migration de ce chantier `20261011090000_service_field_categories` pour qu'elle passe après, et, à la fusion, résoudre `schema.prisma` en gardant les deux ajouts.
- `back npm run lint` et `front npm run lint` échouent déjà sur `main` : porte = aucune nouvelle erreur (`npx biome lint src` comparé au checkout principal).
- Commandes :
  - unit : `cd back && NODE_OPTIONS=--experimental-vm-modules npx jest -c src/test/jest.config.ts --selectProjects unit [fichier]`
  - e2e : `cd back && npm run prisma:migrate:deploy:test && NODE_OPTIONS=--experimental-vm-modules npx dotenv-cli@7.3.0 -e .env.test.local -e .env.test -- npx jest --runInBand -c src/test/jest.config.ts --selectProjects e2e [fichier]`
  - front : `cd front && npm run build && npx vitest run [fichier]`
- Worktree `.claude/worktrees/categories-fiche`, branche `worktree-categories-fiche`. Avant les tests : copier `back/.env`, `back/.env.test`, `back/.env.test.local`, `front/.env` du checkout principal, `npm ci` (back, front), `cd back && npm run prisma:generate`.

## Review Focus

1. **Deux premières lectures simultanées des catégories d'un service neuf** : exactement deux catégories créées, pas quatre, pas d'erreur 500 (test tâche 2).
2. **Supprimer une catégorie qui contient encore des champs actifs** : refus 400 avec un message clair, aucun champ rendu invisible (test tâche 2 ; bouton désactivé avec infobulle, test tâche 4).
3. **Déplacer un champ vers une catégorie supprimée ou d'un autre service** : 400, le champ ne bouge pas (test tâche 2).
4. **Choix de colonnes mémorisé** dans la liste des patients : il survit au passage des groupes « Inclusion / Bilan » aux libellés de catégories (identifiants inchangés ; test tâche 3).
5. **Une catégorie ajoutée sans aucun champ** : pas d'onglet vide dans la fiche patient (test tâche 3).

---

### Task 1 : modèle, migration, défauts

**Files:**
- Modify: `back/prisma/schema.prisma`, `back/src/main/infra/orm/tenant-guard.ts`
- Create: `back/prisma/migrations/20261011090000_service_field_categories/migration.sql`
- Create: `back/src/test/unit/migrations/service-field-categories.migration.test.ts`
- Modify: `back/src/main/utils/etp-field-preset.ts` (garde `section` comme indication de catégorie à date : `'pathway'` → `entryDate`, `'outcome'` → `exitDate`), `back/prisma/seed/patient.ts` (`seedEtpFields` crée d'abord les deux catégories), `back/src/main/utils/service-field-types.ts` (`SERVICE_FIELD_SECTIONS` remplacé par `CATEGORY_DATE_FIELDS = ['entryDate','exitDate'] as const`)

**Interfaces:**
- Produces: modèle `ServiceFieldCategory` (spec §3) ; `ServiceFieldDefinition.categoryId String` + relation `category` via `[categoryId, serviceId]` ; `Service.fieldCategories` ; `DEFAULT_CATEGORIES = [{ label: 'Parcours & Inclusion', dateField: 'entryDate', order: 0 }, { label: 'Sortie & Bilan', dateField: 'exitDate', order: 1 }]` exporté de `service-field-types.ts`.

- [ ] **Step 1 : test de migration (rouge)** — sur le modèle de `service-fields.migration.test.ts` (base gabarit jusqu'à la migration précédente incluse, préfixe `medisync_migr_cat`). Scénarios :
  1. **ok** : deux services avec des champs `pathway` et `outcome` (dont un archivé) → chacun a exactement les deux catégories de `DEFAULT_CATEGORIES` ; chaque champ pointe vers la catégorie de sa date ; la colonne `section` n'existe plus ; identifiants `z.cuid()` ;
  2. **garde** : un déclencheur qui, à l'`UPDATE` d'un champ `outcome`, le rattache à la catégorie d'entrée → échec qui nomme le service, `section` toujours présente, table des catégories absente ;
  3. **service sans champ** : reçoit quand même ses deux catégories.
- [ ] **Step 2 : schéma, garde-fou, migration** — `BEGIN;` … `COMMIT;` ; DDL via `prisma migrate diff` (lecture seule) comme au chantier précédent ; insertion des deux catégories par service (`'c' || replace(gen_random_uuid()::text, '-', '')`) ; ajout de `categoryId` nullable, `UPDATE … FROM` selon `section` ; garde `DO $$` (comptes par service et section égaux aux comptes par catégorie ; aucun `categoryId` nul) ; `SET NOT NULL`, clé étrangère, suppression de `section`. Déclarer le modèle au garde-fou jusqu'à ce que `tenant-guard-schema.test.ts` passe.
- [ ] **Step 3 : seed et préréglage** — `seedEtpFields` crée les deux catégories puis rattache chaque champ via `section` du préréglage.
- [ ] **Step 4 : compilation** — le compilateur énumère les usages de `section` côté back (domaine, repository, schémas, tests e2e) : les adapter **au minimum** pour compiler (le domaine reçoit `categoryId` à la place de `section`) ; l'API complète est la tâche 2. Les tests e2e existants qui créent des champs avec `section` passent `categoryId` lu depuis `GET /service-field-categories` (qui n'existe qu'en tâche 2 : en attendant, lire la catégorie en base via `testDb`).
- [ ] **Step 5 : vérifier** (build, unit, e2e), **répéter sur une copie jetable** de `medisync` (port 5433, base `medisync_cat_check`, supprimée ensuite) et rapporter le nombre de catégories créées et de champs rattachés.
- [ ] **Step 6 : commit** — `feat(fiche): categories de champs en base, migration des deux sections`

---

### Task 2 : API des catégories et des champs

**Files:**
- Create: repository, domaine, schéma, routes `serviceFieldCategory` (+ interfaces, IoC, montage dans `tenant.routes.ts`)
- Modify: `serviceField.domain.ts`, `serviceField.repository.ts`, `serviceField.schema.ts`, `routes/serviceField.ts`
- Test: `back/src/test/e2e/service-field-categories.test.ts`, `service-fields.test.ts`, `permissions.test.ts` (sondes)

**Interfaces:**
- Consumes: modèle de la tâche 1, `DEFAULT_CATEGORIES`.
- Produces:
  - `GET /service-field-categories` → `{ id, label, order, dateField: 'entryDate' | 'exitDate' | null, archived }[]` trié par `order` ; appelle `ensureDefaults()` d'abord ;
  - `POST /service-field-categories { label }` ; `PATCH /service-field-categories/:id { label?, archived? }` (`.strict()`) ; `PUT /service-field-categories/order { ids }` ;
  - champs : `categoryId` remplace `section` dans `ServiceField` ; `POST /service-fields { …, categoryId }` ; `PATCH /service-fields/:id { label?, unit?, archived?, categoryId? }` ; `PUT /service-fields/order { categoryId, ids }` ;
  - `serviceFieldRepository.findAll()` trie par `category.order` puis `order` (l'export Excel en hérite).

- [ ] **Step 1 : e2e (rouge)** :
  1. un service neuf : `GET` rend les deux catégories par défaut ; **deux `GET` lancés en parallèle** (`Promise.all`) → toujours deux catégories en base (Review Focus 1) ;
  2. créer « Suivi diététique » → ordre 2 ; renommer ; `PUT /order` la place avant « Sortie & Bilan » ;
  3. `PATCH { archived: true }` sur une catégorie à date → 400 ; sur une catégorie contenant un champ actif → 400 « Déplacez ou supprimez d'abord ses champs » (Review Focus 2) ; après déplacement du champ → 200 ; restauration ;
  4. créer un champ dans « Suivi diététique », le déplacer vers « Sortie & Bilan » (`PATCH { categoryId }`) → il passe en fin de cette catégorie ; vers une catégorie supprimée ou d'un autre service → 400, le champ n'a pas bougé (Review Focus 3) ;
  5. `PUT /service-fields/order` avec un jeu qui n'est pas exactement celui de la catégorie → 400 ;
  6. `GET /service-fields` : ordre catégories puis champs ; l'export Excel suit cet ordre ;
  7. intervenant : 403 en écriture, 200 en lecture ; isolation entre services (404).
- [ ] **Step 2 : implémenter** sur le patron de `serviceField.*`. `ensureDefaults` : créer les catégories manquantes de `DEFAULT_CATEGORIES` en ignorant l'erreur d'unicité Prisma (`P2002`, cf. `ensureExists` de `patientServiceFile.repository.ts`). Le déplacement d'un champ et la vérification « catégorie non vide » se font dans le domaine.
- [ ] **Step 3 : vérifier, commit** — `feat(fiche): routes des categories, deplacement et ordre des champs`

---

### Task 3 : front — fiche patient et liste

**Files:**
- Modify: `front/src/types/serviceField.ts` (`ServiceFieldCategory`, `categoryId` à la place de `section`), `api/serviceField.api.ts` + `queries/useServiceField.ts` (catégories : requête et mutations), `components/custom/Patient/edit/edit.patient.tsx`, `serviceFields.patient.tsx`, `pathway-inclusion.patient.tsx`, `outcome-review.patient.tsx` (fusionnés en un composant de catégorie qui affiche la date si `dateField`), `columns/patient.column.tsx`, `routes/.../patient/index.tsx`
- Test: `edit.patient.test.tsx`, `affectation-des-champs.test.ts`, `patient.column.test.tsx`, `patient/index.test.tsx`

**Interfaces:**
- Produces: `useServiceFieldCategoriesQuery(): { categories, isPending }` ; `ServiceFieldCategory = { id, label, order, dateField: 'entryDate' | 'exitDate' | null, archived }` ; `CategoryFields({ form, category, fields })`.

- [ ] **Step 1 : tests (rouges)** :
  - onglets : après « Informations générales » et « Profil & Contexte », un onglet par catégorie **active ayant au moins un champ visible ou une date** (Review Focus 5), dans l'ordre ; « Date d'entrée » en tête de la catégorie `entryDate`, « Date de sortie » dans `exitDate`, même renommées ;
  - les règles existantes tiennent : champs cliniques masqués sans `clinical:read`, valeur archivée « (archivé) », envoi des seuls champs modifiés ;
  - liste : le groupe d'une colonne générée est le libellé de sa catégorie ; ordre catégories puis champs ; une visibilité de colonne mémorisée sous l'ancien groupement reste appliquée (Review Focus 4) ; la liste attend aussi les catégories avant de monter la table (même règle que pour les champs).
- [ ] **Step 2 : implémenter.** Icônes : `RouteIcon` pour `entryDate`, `Bookmark` pour `exitDate`, `LayoutList` (lucide) pour les autres. Les identifiants d'onglet sont les `id` de catégorie.
- [ ] **Step 3 : vérifier, commit** — `feat(fiche): onglets et colonnes construits depuis les categories`

---

### Task 4 : front — écran de configuration

**Files:**
- Modify: `front/src/routes/_authenticated/e/$establishmentId/s/$serviceId/_settings/fiche-patient.tsx` (+ test), `components/custom/popup/serviceFieldForm.tsx`

- [ ] **Step 1 : tests (rouges)** :
  - un bloc par catégorie active dans l'ordre ; avec « Supprimés », les catégories et champs supprimés avec « Restaurer » ;
  - titre modifiable en place (clic → champ texte → Entrée ou perte de focus enregistre, Échap annule, vide refusé) ;
  - flèches de catégorie (jeu complet envoyé, supprimées comprises ; première « Monter » désactivée) ;
  - « Supprimer » : absent pour une catégorie à date ; désactivé avec infobulle « Déplacez ou supprimez d'abord ses champs » si elle a des champs actifs ; sinon confirmation puis `PATCH { archived: true }` ;
  - « Ajouter une catégorie » (libellé requis) ;
  - popup d'un champ : liste « Catégorie » (catégories actives) ; en création, pré-remplie avec la catégorie du bloc ; en modification, changer de catégorie envoie `PATCH { categoryId }` ;
  - **aucun texte « Archiver » / « Archivés »** dans l'écran ni la popup (champs, choix, catégories) ; les confirmations disent « Supprimer » et précisent que l'élément reste restaurable depuis « Supprimés » ;
  - doubles clics protégés sur toutes les actions (patron existant).
- [ ] **Step 2 : implémenter** ; libellés en `text-foreground`.
- [ ] **Step 3 : vérifier, commit** — `feat(fiche): configuration des categories, libelles Supprimer`

---

### Task 5 : documentation et portes

- [ ] Ajouter à `docs/fiche-configurable/deploiement.md` une section « Catégories » (sauvegarde, migration en transaction avec garde, contrôle : deux catégories par service et aucun champ sans catégorie).
- [ ] `back/CLAUDE.md`, `front/CLAUDE.md` : une ligne chacune (catégories en base, deux catégories à date non supprimables, créées à la première lecture pour un service neuf ; libellés « Supprimer » dans la configuration de la fiche).
- [ ] Portes complètes, comparaison Biome avec `main`. Commit `docs(fiche): categories, deploiement et conventions`.

La vérification navigateur (critère de fin de la spec) se fait par le contrôleur après fusion et application de la migration à la base de dev, avec sauvegarde préalable.

---

## Auto-relecture

**Couverture.** Spec §3 → tâche 1 (modèle, migration, défauts via tâche 2 `ensureDefaults`). §4 → tâche 2. §5 fiche et liste → tâche 3, configuration → tâche 4. §6 → réparti. §2.2 libellés → tâche 4 et Global Constraints.

**Conflits.** Tâche 1 adapte le back au minimum pour compiler, la tâche 2 livre l'API ; le front ne compile qu'après la tâche 3 si les types changent en tâche 2 : la tâche 2 ne touche pas au front, la tâche 3 change les types et tout le front qui en dépend dans le même commit. Fusion avec `indicateurs-configurables` : `schema.prisma` et ordre des migrations (Global Constraints).

**Noms.** `ServiceFieldCategory`, `DEFAULT_CATEGORIES`, `CATEGORY_DATE_FIELDS`, `ensureDefaults` (tâches 1-2) ; `useServiceFieldCategoriesQuery`, `CategoryFields` (tâche 3).
