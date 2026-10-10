# Indicateurs configurables par service — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** le coordinateur compose des jeux d'indicateurs (mesures codées, options, filtres sur les champs de la fiche, nombre ou répartition) consultables dans Pilotage ; la grille ARS devient un de ces jeux, à l'identique.

**Architecture:** un moteur pur (`back/src/main/utils/indicators/`) — catalogue de mesures reprises d'`ars-indicators.ts`, filtres qui restreignent la cohorte, répartition — alimenté par trois tables de service (`IndicatorSet`, `Indicator`, `IndicatorAnswer`). Les routes ARS de `pilotage-ars` sont remplacées par des routes par jeu ; l'écran ARS de `pilotage-ars` est généralisé à tout jeu. Une égalité stricte avec l'ancienne `computeArsIndicators`, figée dans les tests, garantit la grille ARS.

**Tech Stack:** Node 24, Fastify 5, Prisma 7, Zod v4, Jest 30 (back) ; React 19, TanStack Router/Query/Form, Vitest (front). Biome, wireit.

**Spec:** `docs/superpowers/specs/2026-10-10-indicateurs-configurables-design.md`

## Global Constraints

- **Prérequis bloquant** : `worktree-pilotage-ars` est fusionné sur `main`. Avant la tâche 1 : `git merge --no-ff main` dans ce worktree. Les noms de `pilotage-ars` cités ici (`ArsManualAnswer`, `arsManualAnswer.repository.ts`, `ArsIndicatorResult.kind/input/answer`, `MANUAL_INPUTS`, `BasculePilotage`, `front/src/components/custom/ars/*`, `arsCsv`, `useSaveArsAnswerMutation`, `stats:write`) viennent de son plan : si le code fusionné diffère, **le code fusionné fait foi**, et l'écart se note dans le rapport de tâche.
- **Ne jamais migrer, réinitialiser ni écrire dans la base `medisync`.** Tests sur `medisync_test` ; répétition de migration sur une copie jetable (port **5433**).
- **Jamais de serveur de dev** (4270 et 3000 appartiennent à Léo), **jamais de `git stash`**, **jamais de `pkill` large**.
- Biome uniquement, sur les fichiers touchés ; **jamais de `biome-ignore`** ; pas d'`as`/`!` pour faire taire le compilateur ; commentaires **une ligne ou rien**, en français ; commits en français.
- Le garde-fou d'ORM échoue fermé ; pas de SQL brut dans un repository.
- Codes, groupes, libellés et notes de la grille ARS : **mot pour mot** ceux d'`ARS_INDICATORS`.
- `back npm run lint` échoue déjà sur `main` (`membership.domain.ts`) : la porte est « aucune nouvelle erreur » (`npx biome lint src` comparé à `/Users/couffinhal/Documents/MediSync/back`). Idem front.
- Commandes :
  - unit : `cd back && NODE_OPTIONS=--experimental-vm-modules npx jest -c src/test/jest.config.ts --selectProjects unit [fichier]`
  - e2e : `cd back && npm run prisma:migrate:deploy:test && NODE_OPTIONS=--experimental-vm-modules npx dotenv-cli@7.3.0 -e .env.test.local -e .env.test -- npx jest --runInBand -c src/test/jest.config.ts --selectProjects e2e [fichier]`
  - front : `cd front && npm run build && npx vitest run [fichier]`
- Worktree `.claude/worktrees/indicateurs-configurables`, branche `worktree-indicateurs-configurables`. Avant les tests : copier `back/.env`, `back/.env.test`, `back/.env.test.local`, `front/.env` du checkout principal ; `npm ci` (back, front) ; `cd back && npm run prisma:generate`.

## Review Focus

1. **Filtre visant un champ archivé ou une clé de choix archivée** : l'indicateur reste calculé avec la condition et porte un avertissement, sans erreur (test tâche 2).
2. **Répartition sur un choix multiple** : un patient compte dans chacune de ses valeurs, le total reste le nombre de patients, « Non renseigné » compte ceux sans valeur (test tâche 2).
3. **Service sans champs ETP** (créé après le chantier 1) : aucun jeu ARS, `/indicateurs-ars` mène à l'Activité, le bloc des motifs d'arrêt est masqué (tests tâches 3, 6, 7).
4. **Indicateur parent archivé** : l'enfant s'affiche sans pourcentage, sans plantage (test tâche 7).
5. **Aperçu pendant la saisie** d'un filtre incomplet (champ choisi, aucune valeur) : 400 côté back, l'aperçu affiche « Configuration incomplète » au lieu d'une erreur rouge (tests tâches 5 et 8).

---

## Structure des fichiers

**Créés (back)**

| Fichier | Responsabilité |
|---|---|
| `back/src/main/utils/indicators/cohort.ts` | Types de cohorte (`IndicatorCohort`, `CohortFile`, `CohortPresence`) et utilitaires de date/rôle repris d'`ars-indicators.ts`. |
| `back/src/main/utils/indicators/measures.ts` | `MEASURES` : le catalogue. |
| `back/src/main/utils/indicators/filters.ts` | `FilterCondition`, `applyFilters`, `validateFilters`. |
| `back/src/main/utils/indicators/compute.ts` | `computeIndicator`, `breakdown`, `validateIndicator`. |
| `back/src/main/utils/indicators/ars-preset.ts` | `ARS_PRESET` : les 30 indicateurs de la grille ARS en configuration. |
| `back/prisma/migrations/2026101100xxxx_indicator_sets/migration.sql` | Tables, colonnes de `Service`, jeu ARS, reprise des réponses, garde. |
| `back/src/main/{infra/orm/repositories,domain}/indicatorSet.*`, `schemas/indicatorSet.schema.ts`, `routes/indicatorSet.ts` | API des jeux. |
| `back/src/test/unit/utils/indicators/*.test.ts`, `back/src/test/unit/utils/indicators/ars-oracle.ts` | Moteur, et l'ancienne grille figée comme oracle. |
| `back/src/test/unit/migrations/indicator-sets.migration.test.ts`, `back/src/test/e2e/indicator-sets.test.ts` | Migration, API. |

**Créés (front)** : `types/indicatorSet.ts`, `api/indicatorSet.api.ts`, `queries/useIndicatorSet.ts`, route `indicateurs.$setId.tsx`, route `_settings/indicateurs.tsx`, `components/custom/popup/indicatorForm.tsx`, `components/custom/indicators/filterEditor.tsx`, `components/custom/indicators/breakdownRows.tsx`.

**Supprimés en fin de chantier** : `back/src/main/utils/ars-indicators.ts` (fonctions déplacées), domaine/repository/routes `arsIndicator*` et `arsManualAnswer*`, `front/src/routes/.../indicateurs-ars.tsx` (devient une redirection), `FIN_DE_PARCOURS`, `STOP_REASON`.

---

### Task 1 : moteur — cohorte et catalogue, égalité avec la grille ARS

**Files:**
- Create: `back/src/main/utils/indicators/cohort.ts`, `measures.ts`, `ars-preset.ts`
- Create: `back/src/test/unit/utils/indicators/ars-oracle.ts` (copie figée), `back/src/test/unit/utils/indicators/measures.test.ts`
- Modify: `back/src/main/utils/ars-indicators.ts` (réexporte depuis `indicators/` le temps de la migration du code ; supprimé tâche 5)

**Interfaces:**
- Produces:

```ts
// cohort.ts — mêmes champs que ArsPresence / ArsFile, plus les valeurs de la fiche
export type CohortPresence = ArsPresence // reprise telle quelle (type renommé, champs identiques)
export type CohortFile = {
  patientId: string
  entryDate: Date | null
  exitDate: Date | null
  values: Record<string, unknown> // data et clinicalData fusionnés
  presences: CohortPresence[]
}
export type IndicatorCohort = { from: Date; to: Date; files: CohortFile[]; presences: CohortPresence[] }

// measures.ts
export type MeasureUnit = 'patients' | 'seances' | 'moyenne'
export type Measure<O> = {
  label: string
  description: string
  unit: MeasureUnit
  options: z.ZodType<O>
  // Patients retenus (mesures 'patients') : sert aussi à la répartition.
  patients?: (c: IndicatorCohort, options: O) => CohortFile[]
  compute: (c: IndicatorCohort, options: O) => number
}
export const MEASURES: Record<MeasureKey, Measure<unknown>>
export type MeasureKey =
  | 'patientsEntres' | 'patientsParModalite' | 'seancesIndividuelles' | 'seancesCollectives'
  | 'moyennePatientsParSeanceCollective' | 'patientsAccompagnes' | 'seancesAvecProche'
  | 'patientsProgrammeComplet' | 'patientsEvalues' | 'patientsProgrammePersonnalise'
  | 'patientsSortis' | 'patientsSuivis'

// ars-preset.ts
export type IndicatorConfig = {
  code: string; label: string; group: string
  nature: 'computed' | 'manual' | 'unavailable'
  measure?: MeasureKey; options?: Record<string, unknown>
  filters?: FilterCondition[]; breakdownField?: string
  input?: 'number+text' | 'yesno'; note?: string
  parentCode?: string
}
export const ARS_PRESET: readonly IndicatorConfig[]
```

- [ ] **Step 1 : figer l'oracle**

Copier `back/src/main/utils/ars-indicators.ts` **tel qu'il est après la fusion de `pilotage-ars`** dans `back/src/test/unit/utils/indicators/ars-oracle.ts`, en ne gardant que ce qui sert à `computeArsIndicators` (types, fonctions, `ARS_INDICATORS`). Ligne d'en-tête : `// Oracle figé : l'ancienne grille ARS codée, référence d'égalité du jeu « Grille ARS ». Ne pas modifier.`

- [ ] **Step 2 : le test d'égalité (rouge)**

`measures.test.ts` construit une cohorte riche à la main (pas de base), avec au moins :
- un dossier avec `entryDate` dans la période ; un sans `entryDate` mais avec un diagnostic éducatif honoré dans la période (rôle `DIAGNOSTIC_EDUCATIF`), dont un à distance (`type: 'telephonic'`) ;
- des parcours uniquement `hospital`, uniquement `ambulatory`/`telephonic`, et mixtes ;
- des programmes complets (séances puis `REACTUALISATION`) dans les trois modalités, et un en `ambulatory` seulement ;
- des réactualisations au début, à la fin, aux deux bouts, avec ≥ 3 séances entre ;
- des séances collectives (même `slotId`, plusieurs patients), dont une entièrement à distance ;
- des présences accompagnées ; des présences de patients sans dossier ;
- des orientations des trois clés ARS et une autre ;
- un dossier sorti dans la période.

Puis :

```ts
it('le jeu ARS calcule par le moteur egale l ancienne grille, code par code', () => {
  const attendu = computeArsIndicators(versAncienneCohorte(cohorte))
  for (const config of ARS_PRESET) {
    const ancien = attendu.find((r) => r.code === config.code)
    expect({ code: config.code, label: config.label, group: config.group }).toEqual({
      code: ancien?.code, label: ancien?.label, group: ancien?.group,
    })
    if (config.nature === 'computed') {
      expect({ code: config.code, value: computeIndicatorValue(cohorte, config) }).toEqual({
        code: config.code, value: ancien?.value,
      })
    } else {
      expect({ code: config.code, nature: config.nature, note: config.note }).toEqual({
        code: config.code, nature: ancien?.kind, note: ancien?.note,
      })
    }
  }
  expect(ARS_PRESET.map((c) => c.code)).toEqual(attendu.map((r) => r.code))
})
```

`versAncienneCohorte` construit l'`ArsCohort` de l'oracle : `stopReason` et `orientation` lus dans `values`. `computeIndicatorValue(cohort, config)` est un utilitaire de test : applique `config.filters` (tâche 2 ; ici, filtre `in` seulement, écrit en ligne dans le test et remplacé par `applyFilters` à la tâche 2) puis `MEASURES[measure].compute`. Vérifier en plus que chaque valeur calculée attendue est **non nulle** pour au moins un code de chaque groupe : une cohorte trop pauvre rendrait l'égalité triviale.

Run: unit sur ce fichier. Expected: FAIL (modules absents).

- [ ] **Step 3 : déplacer et paramétrer**

`cohort.ts` reprend `inRange`, `isRole`, `finDeJournee`, `deDate`, `sinceDe`, `honored`, `onlyOfTypes`, `completeProgram`, `reactuTimes`, `countAround`, `presencesInPeriod`, `collectiveSlots`, `isReactu`, signatures adaptées à `CohortFile`/`IndicatorCohort`, **corps inchangés**. `measures.ts` :

| Clé | Options (Zod) | `compute` |
|---|---|---|
| `patientsEntres` | `{ diagnosticADistance: z.boolean().default(false) }` | fichiers avec `deDate ≠ null`, et si l'option : avec une présence honorée dans la période, rôle DE, `type === 'telephonic'` |
| `patientsParModalite` | `{ modalite: z.enum(['hospitalisation','externes','mixte']) }` | `onlyOfTypes(['hospital'])` / `onlyOfTypes(['ambulatory','telephonic'])` / la règle de 2.4 |
| `seancesIndividuelles` | `{ aDistance: z.boolean().default(false) }` | présences individuelles de la période (et `telephonic` si l'option) |
| `seancesCollectives` | `{ aDistance: … }` | `collectiveSlots(c).size`, ou les créneaux entièrement `telephonic` |
| `moyennePatientsParSeanceCollective` | `{}` | règle de 2.8, arrondi au dixième |
| `patientsAccompagnes` | `{}` | règle de 2.9 |
| `seancesAvecProche` | `{}` | règle de 2.10 |
| `patientsProgrammeComplet` | `{ modalite: z.enum(['toutes','hospitalisation','externes','mixte']) }` | `completeProgram(f,c)` ; `['hospital']` ; **`['ambulatory']` seul** (règle de 3.3, différente de `patientsParModalite`) ; règle de 3.4 |
| `patientsEvalues` | `{}` | règle de 3.6 |
| `patientsProgrammePersonnalise` | `{ variante: z.enum(['initial','initialTermineParReactu','suiviCommenceParReactu','suiviReactuDebutEtFin']) }` | règles de 4.1, 4.1bis, 4.3, 4.3bis |
| `patientsSortis` | `{}` | fichiers avec `exitDate` dans la période |
| `patientsSuivis` | `{}` | patients distincts avec une présence honorée dans la période |

Chaque mesure `patients` expose `patients(c, o)` et définit `compute` comme `patients(c, o).length`, sauf `patientsAccompagnes` et `patientsSuivis` qui comptent des `patientId` de présences : leur `patients` rend les fichiers de ces patients quand ils en ont un, et leur `compute` reste le nombre de `patientId` distincts (un patient sans dossier compte, comme aujourd'hui). `ARS_PRESET` : les 30 lignes, codes / groupes / libellés / notes **recopiés** d'`ARS_INDICATORS`, et :

| Code | Configuration |
|---|---|
| 1.1 | `patientsEntres {}` |
| 1.1bis | `patientsEntres { diagnosticADistance: true }`, parent 1.1 |
| 1.2 / 1.3 / 1.4 | `patientsEntres {}` + `orientation in [ORIENTATION_PRO_SANTE_EXT]` / `[…_HOSPIT]` / `[…_CS]` |
| 2.1 / 2.2 / 2.4 | `patientsParModalite` hospitalisation / externes / mixte |
| 2.3, 2.11, 3.5, 4.4 | `unavailable`, note d'origine |
| 2.5 | `manual`, `number+text`, note d'origine |
| 2.6 / 2.6bis | `seancesIndividuelles` false / true (parent 2.6) |
| 2.7 / 2.7bis | `seancesCollectives` false / true (parent 2.7) |
| 2.8 / 2.9 / 2.10 | les trois mesures dédiées |
| 3.1 / 3.2 / 3.3 / 3.4 | `patientsProgrammeComplet` toutes / hospitalisation / externes / mixte |
| 3.6 | `patientsEvalues` |
| 4.1 / 4.1bis / 4.3 / 4.3bis | `patientsProgrammePersonnalise` initial / initialTermineParReactu (parent 4.1) / suiviCommenceParReactu / suiviReactuDebutEtFin (parent 4.3) |
| 4.2 | `manual`, `yesno`, note d'origine |

Les clés d'orientation viennent de `ARS_ORIENTATIONS` (gardée dans `ars-preset.ts`, avec le test de concordance contre `ETP_FIELD_PRESET` déplacé avec elle). `ars-indicators.ts` réexporte ce qui est encore importé ailleurs, le temps des tâches 5 et 6.

- [ ] **Step 4 : vert, puis sabotage**

Run: unit. Expected: PASS. Puis changer temporairement l'option de 3.3 en `toutes` : le test doit échouer en nommant `3.3`. Remettre. Rapporter.

- [ ] **Step 5 : commit** — `feat(indicateurs): moteur et catalogue de mesures, egal a la grille ARS`

---

### Task 2 : moteur — filtres, répartition, validation

**Files:**
- Create: `back/src/main/utils/indicators/filters.ts`, `compute.ts`
- Test: `back/src/test/unit/utils/indicators/filters.test.ts`, `compute.test.ts`
- Modify: `measures.test.ts` (remplace le filtre écrit en ligne par `applyFilters`)

**Interfaces:**
- Consumes: `MEASURES`, `IndicatorCohort`, `ServiceFieldEntityRepo` (définitions de champs, chantier 1 : `key, type, archivedAt, choices[{key,label,order,archivedAt}]`).
- Produces:

```ts
export type FilterCondition =
  | { field: string; op: 'in' | 'containsAny'; value: string[] }
  | { field: string; op: 'eq'; value: boolean | number }
  | { field: string; op: 'lt' | 'lte' | 'gt' | 'gte'; value: number }
  | { field: string; op: 'before' | 'after'; value: string }
export const filterConditionSchema: z.ZodType<FilterCondition>
export const OPERATORS_BY_TYPE: Record<ServiceFieldType, readonly FilterCondition['op'][]>
// text: [], longtext: [], choice: ['in'], multichoice: ['containsAny'], boolean: ['eq'],
// number: ['eq','lt','lte','gt','gte'], date: ['before','after']
export const applyFilters = (c: IndicatorCohort, filters: FilterCondition[]): IndicatorCohort
export type IndicatorDefinition = {
  nature: 'computed' | 'manual' | 'unavailable'
  measure: string | null; options: unknown; filters: unknown
  breakdownField: string | null; input: string | null; note: string | null
}
export type BreakdownRow = { key: string; label: string; value: number }
export type ComputedResult = { value: number | null; breakdown: BreakdownRow[] | null; warnings: string[] }
export const computeIndicator = (c: IndicatorCohort, def: IndicatorDefinition, fields: ServiceFieldEntityRepo[]): ComputedResult
export const validateIndicator = (def: IndicatorDefinition, fields: ServiceFieldEntityRepo[]): void // Boom.badRequest
export const EMPTY_KEY = '__empty__'
```

- [ ] **Step 1 : tests (rouges)**

`filters.test.ts` — une cohorte de quatre dossiers aux valeurs variées, et pour chaque opérateur un cas qui garde et un cas qui écarte :
- `in` sur choix ; `containsAny` sur choix multiple ; `eq` booléen (un patient sans valeur n'est **pas** retenu par `eq false`) ; `lt/lte/gt/gte/eq` sur nombre (bornes incluses ou non) ; `before/after` sur date (`'2026-03-01'` vs `'2026-03-01'` : strict) ;
- deux conditions = ET ;
- les présences des patients écartés disparaissent aussi, celles des patients sans dossier disparaissent dès qu'il y a un filtre et restent sans filtre ;
- `applyFilters(c, [])` rend une cohorte qui donne les mêmes résultats que `c` pour chaque mesure.

`compute.test.ts` :
- nombre : `computeIndicator` d'un `patientsEntres` filtré ;
- répartition sur un `choice` : une ligne par choix **actif** dans l'ordre des choix, plus les choix archivés qui ont un effectif, plus `{ key: '__empty__', label: 'Non renseigné' }` ; `value` = total ; somme des lignes = total ;
- répartition sur un `multichoice` (Review Focus 2) : un patient `['HTA','DIAB']` compte dans les deux lignes, `value` = nombre de patients, somme des lignes > total ;
- avertissements (Review Focus 1) : un filtre sur un champ archivé, ou dont une valeur est un choix archivé, calcule normalement et `warnings` contient `Filtre sur un champ archivé : {label}` / `Filtre sur un choix archivé : {label}` ;
- `manual` et `unavailable` : `{ value: null, breakdown: null, warnings: [] }`.

`validateIndicator`, un refus (400, message en français) par règle :
- mesure inconnue ; options hors schéma (`modalite: 'autre'`) ;
- filtre sur champ inexistant ; sur un `text` ; opérateur non permis pour le type ; valeur de mauvais type ; clé de choix inexistante ; `in` avec une liste vide (Review Focus 5) ;
- `breakdownField` inexistant, non `choice`/`multichoice`, ou sur une mesure non `patients` ;
- `manual` sans `input`, `unavailable` sans `note`.

Et un cas accepté par nature.

- [ ] **Step 2 : rouge** — Run unit sur les deux fichiers. Expected: FAIL.

- [ ] **Step 3 : implémenter**

```ts
const matches = (value: unknown, cond: FilterCondition): boolean => {
  if (value === undefined || value === null) {
    return false
  }
  switch (cond.op) {
    case 'in':
      return typeof value === 'string' && cond.value.includes(value)
    case 'containsAny':
      return Array.isArray(value) && value.some((v) => cond.value.includes(String(v)))
    case 'eq':
      return value === cond.value
    case 'lt':
      return typeof value === 'number' && value < cond.value
    case 'lte':
      return typeof value === 'number' && value <= cond.value
    case 'gt':
      return typeof value === 'number' && value > cond.value
    case 'gte':
      return typeof value === 'number' && value >= cond.value
    case 'before':
      return typeof value === 'string' && value < cond.value
    case 'after':
      return typeof value === 'string' && value > cond.value
  }
}

// Les filtres restreignent la cohorte aux patients qui les satisfont, dossiers et présences.
export const applyFilters = (c: IndicatorCohort, filters: FilterCondition[]): IndicatorCohort => {
  if (filters.length === 0) {
    return c
  }
  const files = c.files.filter((f) => filters.every((cond) => matches(f.values[cond.field], cond)))
  const kept = new Set(files.map((f) => f.patientId))
  return { ...c, files, presences: c.presences.filter((p) => kept.has(p.patientId)) }
}
```

`computeIndicator` : `computed` → parse les options avec le schéma de la mesure, `applyFilters`, `compute` ; si `breakdownField` : `patients(c', o)` regroupés par valeur du champ. `validateIndicator` porte les règles du Step 1. Les dates des valeurs sont des chaînes `YYYY-MM-DD` : la comparaison de chaînes est correcte.

- [ ] **Step 4 : vert** ; remplacer le filtre en ligne de `measures.test.ts` par `applyFilters` ; tout le dossier `indicators/` vert.

- [ ] **Step 5 : commit** — `feat(indicateurs): filtres, repartition et validation des indicateurs`

---

### Task 3 : modèle, migration, seed

**Files:**
- Modify: `back/prisma/schema.prisma`, `back/src/main/infra/orm/tenant-guard.ts`
- Create: `back/prisma/migrations/<horodatage>_indicator_sets/migration.sql`
- Create: `back/src/test/unit/migrations/indicator-sets.migration.test.ts`
- Modify: `back/prisma/seed.ts`, `back/prisma/seed/patient.ts` (ou un `seed/indicators.ts`)

**Interfaces:**
- Consumes: `ARS_PRESET` (tâche 1).
- Produces: modèles `IndicatorSet`, `Indicator`, `IndicatorAnswer` (spec §3, `IndicatorSet`→`indicators`, `Indicator`→`answers`, relations composites `(…, serviceId)`), colonnes `Service.stopReasonFieldKey`, `Service.completedChoiceKey`. Table `ArsManualAnswer` supprimée.

- [ ] **Step 1 : schéma et garde-fou** — modèles de la spec §3 ; relations : `IndicatorSet.service` via `[serviceId, establishmentId]`, `Indicator.set` via `[setId, serviceId]` → `IndicatorSet[id, serviceId]`, `Indicator.parent` (auto-relation via `[parentId, serviceId]`), `IndicatorAnswer.indicator` via `[indicatorId, serviceId]` → `Indicator[id, serviceId]`. Déclarer les trois modèles dans `SERVICE_MODELS`, leurs relations dans `MODEL_RELATIONS` et `NESTED_RELATIONS` jusqu'à ce que `tenant-guard-schema.test.ts` passe ; retirer `ArsManualAnswer`. Créer la migration avec `prisma migrate dev --create-only --name indicator_sets < /dev/null` (avec `.env` : `--create-only` n'applique rien ; vérifier ensuite `prisma migrate status`).

- [ ] **Step 2 : test de migration (rouge)** — sur le modèle de `service-fields.migration.test.ts` (base gabarit jusqu'à la migration précédente incluse, préfixe `medisync_migr_indic`) :
  1. **ok** : trois services, dont deux avec les champs ETP (définitions `orientation` et `stopReason`, comme après la migration `service_fields`) ; des `ArsManualAnswer` 2025 et 2026 sur 2.5 et 4.2 pour l'un. Après : chaque service ETP a un jeu « Grille ARS » (ordre 0) de 30 indicateurs **égaux à `ARS_PRESET` importé** (code, libellé, groupe, nature, mesure, options, filtres, input, note, ordre 0..29, parent résolu) ; le troisième n'a aucun jeu (Review Focus 3) ; les réponses sont dans `IndicatorAnswer` sur le bon indicateur et la bonne année, valeurs identiques ; `stopReasonFieldKey`/`completedChoiceKey` posés seulement sur les deux services ETP ; `ArsManualAnswer` n'existe plus ; identifiants `z.cuid()`.
  2. **garde** : un déclencheur qui empêche l'insertion d'une `IndicatorAnswer` pour 4.2 → la migration échoue, `ArsManualAnswer` existe toujours, `IndicatorSet` n'existe pas.
  3. **vide** : aucun service → passe.

- [ ] **Step 3 : migration** — `BEGIN;` en tête, `COMMIT;` en fin. Le SQL des 30 indicateurs est **généré à partir d'`ARS_PRESET`** (petit script ponctuel lancé une fois, non commité, sortie collée dans la migration) : une table temporaire `ars_preset(code, label, grp, ord, nature, measure, options jsonb, filters jsonb, input, note, parent_code)`, puis insertion par service ETP (service ayant une `ServiceFieldDefinition` `orientation` **et** `stopReason`), puis `UPDATE` des `parentId` par code, puis reprise des réponses (`JOIN` sur le code dans le jeu du même service), garde `DO $$ … RAISE EXCEPTION` (même nombre de réponses, et chaque `(serviceId, year, code, numberValue, textValue, boolValue)` d'origine retrouvé), puis `DROP TABLE "ArsManualAnswer"`. Les apostrophes des libellés sont doublées.

- [ ] **Step 4 : seed** — une fonction `seedArsIndicatorSet(prisma, tenant)` qui crée le jeu à partir d'`ARS_PRESET` (deux passes : indicateurs, puis `parentId`), appelée pour chaque service après `seedEtpFields`, et qui pose les deux colonnes de `Service`. Vérifier en semant une base jetable.

- [ ] **Step 5 : compilation** — régénérer Prisma ; le compilateur signale le repository `arsManualAnswer.repository.ts` de `pilotage-ars`. Remplacer son corps par une lecture/écriture d'`IndicatorAnswer` sur l'indicateur de même code du jeu « Grille ARS » du service (une dizaine de lignes), pour que les e2e de `pilotage-ars` restent verts jusqu'à la tâche 5, qui supprime ce repository.

- [ ] **Step 6 : vérifier** (build, unit, e2e) **puis répéter sur une copie jetable** de `medisync` (port 5433, base `medisync_indic_check`, suppression ensuite) ; rapporter le nombre de jeux créés et de réponses reprises.

- [ ] **Step 7 : commit** — `feat(indicateurs): jeux d'indicateurs en base, grille ARS et reponses migrees`

---

### Task 4 : API de configuration

**Files:**
- Create: repository, domaine, schéma, routes `indicatorSet` (+ interfaces, IoC, montage dans `tenant.routes.ts`)
- Create: route `activitySettings` (ou dans `serviceField.ts` si plus naturel ; choisir et justifier)
- Test: `back/src/test/e2e/indicator-sets.test.ts`, sonde(s) dans `permissions.test.ts`

**Interfaces:**
- Consumes: `validateIndicator`, `MEASURES`, `serviceFieldRepository.findAll()`.
- Produces (sous le préfixe de service) :
  - `GET /indicator-sets` → `IndicatorSetDto[]` = `{ id, name, order, archived, indicators: IndicatorDto[] }`, `IndicatorDto` = `{ id, code, label, group, order, nature, measure, options, filters, breakdownField, input, note, parentId, archived }` — actifs et archivés ;
  - `POST /indicator-sets { name }` ; `PATCH /indicator-sets/:setId { name?, archived? }` ; `PUT /indicator-sets/order { ids }` ;
  - `POST /indicator-sets/:setId/indicators` (corps = `IndicatorDto` sans `id/order/archived`) ; `PATCH …/:indicatorId` (mêmes champs, partiels, + `archived`) ; `PUT …/order { ids }` (jeu complet, archivés compris) ;
  - `GET /indicator-catalog` → `[{ key, label, description, unit, options: [{ name, label, choices?: [{value,label}], kind: 'boolean'|'enum' }] }]` ;
  - `PATCH /activity-settings { stopReasonFieldKey: string|null, completedChoiceKey: string|null }` → 200 ; le champ doit être un `choice` du service et la valeur un de ses choix (400 sinon) ; `completedChoiceKey` exige `stopReasonFieldKey`.
  - Lecture `stats:read`, écriture `stats:write`.

- [ ] **Step 1 : e2e (rouge)** — coordinateur et intervenant ; un service avec des champs créés par l'API du chantier 1 :
  1. créer un jeu « Suivi diabète », lui ajouter `patientsEntres` avec `comorbidites containsAny ['HTA']` et répartition `orientation` → 201 ; relu à l'identique ;
  2. code en double dans le jeu → 400 ; parent d'un autre jeu → 400 ; cycle de parents → 400 ;
  3. un refus de `validateIndicator` remonte en 400 avec son message ;
  4. archivage d'un indicateur et d'un jeu, restauration ; réordonnancement (jeu complet exigé, comme les champs) ;
  5. catalogue : 12 mesures, `patientsParModalite` expose `modalite` avec ses trois choix libellés ;
  6. réglages de l'Activité : un champ `text` → 400 ; un choix inconnu → 400 ; un couple valide → 200 et relu ;
  7. intervenant : 403 en écriture, 200 en lecture ; `LECTURE` : 403 en lecture ;
  8. isolation : jeu d'un autre service → 404.
- [ ] **Step 2 : implémenter** sur le patron de `serviceField.*` (chantier 1), y compris le tri stable des sorties et la garde contre les doubles clics côté API (`order` recalculé côté serveur). Libellés français du catalogue ici (ils servent à l'écran).
- [ ] **Step 3 : vérifier, commit** — `feat(indicateurs): configuration des jeux d'indicateurs`

---

### Task 5 : résultats, saisies, aperçu, export — fin de la grille codée

**Files:**
- Modify: domaine/routes `indicatorSet` ; `arsIndicator.repository.ts` → renommé `indicatorCohort.repository.ts` (`findCohort` rend `IndicatorCohort` avec `values`)
- Delete: `arsIndicator.domain.ts`, routes/schemas `arsIndicator*`, `arsManualAnswer.repository.ts` (+ interfaces, IoC), `back/src/main/utils/ars-indicators.ts`
- Test: `indicator-sets.test.ts` (describe « résultats »), adaptation de `indicateurs-ars.test.ts` et `indicateurs-ars-saisies.test.ts` (de `pilotage-ars`) en tests du jeu ARS

**Interfaces:**
- Produces:
  - `GET /indicator-sets/:setId/results?from&to` → `{ from, to, manualYear, indicators: [{ id, code, group, label, nature, value, breakdown, note, input, answer, parentId, warnings }] }` (indicateurs actifs, dans l'ordre) ;
  - `PUT /indicator-sets/:setId/answers/:year/:indicatorId` — règles de `pilotage-ars` (`number+text` : `numberValue` entier ≥ 0 | null, `textValue` ≤ 2000 | null ; `yesno` : `boolValue` ; autre type → 400 ; indicateur non `manual` → 400 ; `year` 2000-2100) → `answer` ;
  - `POST /indicator-sets/:setId/preview { indicator: IndicatorDefinition, from, to }` → `{ value, breakdown, warnings }` (`stats:write`), 400 si `validateIndicator` refuse ;
  - `GET /indicator-sets/:setId/export?from&to` (Excel) : colonnes de l'export ARS actuel ; une répartition ajoute une ligne par valeur sous l'indicateur (code vide, libellé « — {valeur} ») ; réponses saisies comme dans `pilotage-ars`.

- [ ] **Step 1 : e2e (rouge)** — reprendre **tous** les cas de `indicateurs-ars.test.ts` et `indicateurs-ars-saisies.test.ts` contre le jeu « Grille ARS » posé par le seed des tests (appeler `seedArsIndicatorSet` dans la préparation) : **mêmes valeurs attendues**, mêmes règles de saisie, même `manualYear`. Ajouter : résultat d'un indicateur filtré et réparti ; aperçu d'un indicateur valide ; aperçu avec `in []` → 400 (Review Focus 5) ; export avec une répartition ; saisie sur un indicateur d'un autre jeu du même service → 404 ; sur un indicateur `computed` → 400.
- [ ] **Step 2 : implémenter**, puis **supprimer** l'ancien domaine, les routes `/indicateurs-ars` et les saisies, `ars-indicators.ts`. `activity-indicators.ts` importe désormais depuis `indicators/cohort.ts`. Rien ne doit plus importer `ars-indicators`.
- [ ] **Step 3 : vérifier** (build, unit, e2e, dont `activite.test.ts` **sans changer ses valeurs attendues**) ; commit `feat(indicateurs): resultats, saisies et export par jeu ; la grille ARS codee disparait`

---

### Task 6 : Activité réglable

**Files:**
- Modify: `back/src/main/utils/activity-indicators.ts`, `activityReport.domain.ts` (lit les réglages du service), schéma de réponse de `/activite`
- Modify: `front/src/components/custom/pilotage/motifs.tsx`, `front/src/libs/activityCsv.ts`, `front/src/constants/patient.constant.ts` (retire `STOP_REASON`), types front de l'activité
- Test: `activite.test.ts`, `activity-indicators.test.ts`, tests front de l'Activité et du CSV

**Interfaces:**
- Produces: `computeActivity(cohort, settings: { stopReasonField: string; completedChoice: string; labels: Record<string, string> } | null)` ; la réponse porte `completion: … | null` (null sans réglage) et `dropoutReasons: { reason, label, count }[]`.

- [ ] **Step 1 : tests (rouges)** — back : avec les réglages pré-remplis, résultats identiques à aujourd'hui (tests existants inchangés) ; sans réglage → `completion: null` (Review Focus 3) ; avec un autre champ choisi (ex. `motifSortie`, valeur « fin » `TERMINE`) → abandons et libellés de ce champ. Front : sans `completion`, le bloc des motifs et la part terminé/abandon ne s'affichent pas ; les libellés viennent de `label` ; CSV idem.
- [ ] **Step 2 : implémenter** ; `FIN_DE_PARCOURS` et `STOP_REASON` disparaissent (grep vide).
- [ ] **Step 3 : vérifier, commit** — `feat(pilotage): les motifs d'arret suivent le champ choisi dans les reglages`

---

### Task 7 : front — consultation des jeux

**Files:**
- Create: `front/src/types/indicatorSet.ts`, `api/indicatorSet.api.ts`, `queries/useIndicatorSet.ts`, route `front/src/routes/_authenticated/e/$establishmentId/s/$serviceId/indicateurs.$setId.tsx` (+ test), `components/custom/indicators/breakdownRows.tsx`
- Modify: `BasculePilotage`, écran et composants `components/custom/ars/*` de `pilotage-ars` (généralisés, renommés `components/custom/indicators/*` si cela reste lisible), `indicateurs-ars.tsx` (redirection), `navigation.ts` (`activeAlso`, `HORS_ONGLETS`), `arsCsv.ts` (→ `indicatorCsv.ts`)

**Interfaces:**
- Consumes: routes de la tâche 5.
- Produces: `useIndicatorSetsQuery()`, `useIndicatorResultsQuery(setId, from, to)`, `useSaveIndicatorAnswerMutation(setId)` ; `<BasculePilotage actif={'activite' | setId} />`.

- [ ] **Step 1 : tests (rouges)** :
  - bascule : « Activité » puis un segment par jeu actif dans l'ordre ; `LECTURE` (sans `stats:read`) : pas de bascule ; segment actif `aria-current="page"` ;
  - `/indicateurs-ars` redirige vers `/indicateurs/{id du jeu "Grille ARS"}`, ou vers `/activite` s'il n'y en a pas (Review Focus 3) ;
  - l'écran d'un jeu rend les natures, le bandeau, la saisie (tests de `pilotage-ars` transposés, mêmes attentes) ;
  - répartition : sous-lignes libellé · effectif · % du total, barre, « Non renseigné » ;
  - avertissement : icône avec infobulle portant le texte de `warnings` ;
  - parent archivé (absent des résultats) : l'enfant s'affiche sans pourcentage (Review Focus 4) ;
  - CSV : répartition sur des lignes supplémentaires.
- [ ] **Step 2 : implémenter.** Couleurs de répartition : `choiceColor(index)` (`front/src/libs/choicePalette.ts`).
- [ ] **Step 3 : vérifier, commit** — `feat(indicateurs): consultation des jeux dans Pilotage`

---

### Task 8 : front — configuration

**Files:**
- Create: `front/src/routes/_authenticated/e/$establishmentId/s/$serviceId/_settings/indicateurs.tsx` (+ test), `components/custom/popup/indicatorForm.tsx`, `components/custom/indicators/filterEditor.tsx`
- Modify: `navigation.ts` (« Indicateurs », groupe Administration, `stats:write`, description « Jeux d'indicateurs et réglages de l'Activité »), `_settings.tsx` (`stats:write` dans `SETTINGS_PERMISSIONS`)

**Interfaces:**
- Consumes: routes des tâches 4 et 5, `useServiceFieldsQuery()` (chantier 1).

- [ ] **Step 1 : tests (rouges)** :
  - liste des jeux : créer, renommer, archiver (confirmation), restaurer, flèches (jeu complet envoyé, archivés compris) ;
  - un jeu : indicateurs par groupe, résumé lisible (« Patients entrés · Orientation parmi Orientation pro santé ext hôpital ») ;
  - popup : nature `computed` → sélecteur de mesure avec description, options du catalogue (booléen = case, enum = liste) ; nature `manual` → type de réponse ; `unavailable` → note ;
  - éditeur de filtres : le contrôle dépend du type du champ (cases pour choix et choix multiple, nombre, date, Oui/Non), les opérateurs proposés sont ceux du type, les champs `text`/`longtext` ne sont pas proposés ;
  - répartition : proposée seulement pour une mesure `patients`, parmi les champs à choix ;
  - aperçu : « Valeur sur {année} : N » après un délai, recalculé à la modification ; sur 400 → « Configuration incomplète » en gris, pas de toast (Review Focus 5) ;
  - réglages de l'Activité : champ parmi les champs à choix, puis valeur parmi ses choix ; enregistrer appelle `PATCH /activity-settings` ;
  - double clic protégé sur toutes les actions (patron du chantier 1).
- [ ] **Step 2 : implémenter** sur le patron de `_settings/fiche-patient.tsx` et `serviceFieldForm.tsx` (chantier 1). Libellés de texte en `text-foreground`, jamais `text-text`.
- [ ] **Step 3 : vérifier, commit** — `feat(indicateurs): ecran de configuration des jeux d'indicateurs`

---

### Task 9 : documentation, portes

**Files:** Create `docs/indicateurs-configurables/deploiement.md` ; Modify `back/CLAUDE.md`, `front/CLAUDE.md`.

- [ ] **Step 1 : déploiement** — sauvegarde ; **avant** : export Excel de la grille ARS 2025 et 2026 de chaque service ETP, et liste des réponses saisies (`select * from "ArsManualAnswer"`) ; déploiement (migration en transaction, garde) ; **après** : mêmes exports depuis le jeu « Grille ARS », requête de contrôle des `IndicatorAnswer` ; comparaison à l'identique ; retour arrière = restauration.
- [ ] **Step 2 : conventions** (une ligne chacune) : jeux d'indicateurs en base ; une mesure nouvelle = une entrée de `MEASURES` + son test ; la grille ARS est `ARS_PRESET`, égalité tenue par `ars-oracle.ts` ; les réglages de l'Activité sont sur `Service`.
- [ ] **Step 3 : portes complètes** et comparaison Biome avec `main` ; commit `docs(indicateurs): deploiement et conventions`.

La vérification dans le navigateur (créer « Suivi diabète », aperçu, consultation, export ; grille ARS identique avant/après) se fait par le contrôleur après la fusion et l'application de la migration à la base de dev, avec sauvegarde préalable.

---

## Auto-relecture

**Couverture de la spec.** §2.1, §3 migration → tâches 1, 3. §2.2, §4 catalogue → tâche 1. §3 filtres, §4 cohorte/répartition/validation → tâche 2. §2.3, §3 modèle → tâche 3. §5 API → tâches 4, 5. §2.4, §6 Activité → tâche 6. §6 consultation → tâche 7. §6 configuration → tâche 8. §7 → réparti. §8 → tâche 9. §9 : rien n'est construit.

**Conflits entre tâches.**

| Paire | Point partagé | Règle |
|---|---|---|
| 1 → 2 | `measures.test.ts` | Filtre écrit en ligne en tâche 1, remplacé par `applyFilters` en tâche 2. |
| 3 → 5 | `ArsManualAnswer` | Supprimée par la migration (tâche 3) ; le repository de `pilotage-ars` est provisoirement rebranché sur `IndicatorAnswer`, puis supprimé en tâche 5. |
| 5 ↔ tests de `pilotage-ars` | valeurs attendues | Transposés contre le jeu ARS **sans changer une valeur**. |
| 5 → 6 | `activity-indicators.ts` | Importe `indicators/cohort.ts` dès la tâche 5 ; ses réglages arrivent en tâche 6. |
| 7 ↔ 8 | navigation | La tâche 7 touche Pilotage, la 8 l'Administration. |

**Cohérence des noms.** `MEASURES`, `MeasureKey`, `IndicatorCohort`, `CohortFile`, `ARS_PRESET`, `IndicatorConfig` (tâche 1) ; `FilterCondition`, `applyFilters`, `computeIndicator`, `validateIndicator`, `IndicatorDefinition`, `BreakdownRow`, `EMPTY_KEY` (tâche 2) ; `seedArsIndicatorSet` (tâche 3) ; `IndicatorSetDto`, `IndicatorDto` (tâche 4).
