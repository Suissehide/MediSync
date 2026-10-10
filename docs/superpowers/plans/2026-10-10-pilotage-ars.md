# Pilotage, partie Indicateurs ARS — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refondre l'écran Indicateurs ARS selon le handoff, permettre la saisie de 2.5 et 4.2 par service et année civile, et le ranger sous l'onglet Pilotage avec une bascule Activité | Indicateurs ARS.

**Architecture:** Le calcul ARS marque chaque indicateur d'un `kind` (et d'un `input` pour les saisies) ; une table `ArsManualAnswer` garde les réponses par (service, année, code), jointes au rapport quand la période est une année civile et reprises dans les exports ; une route PUT protégée par `stats:write`. Le front refait l'écran d'après le handoff et ajoute une bascule partagée par les deux pages.

**Tech Stack:** Prisma + PostgreSQL, Fastify + Zod, Jest (back) ; React + TanStack Router/Query + Tailwind v4 + Vitest (front).

**Spec:** `docs/superpowers/specs/2026-10-10-pilotage-ars-design.md` — écran : `docs/superpowers/specs/handoffs/indicateurs-ars/README.md` (+ `Indicateurs ARS.dc.html`).

## Global Constraints

- `ARS_INDICATORS` (codes, groupes, libellés, notes) : mot pour mot. Garde de l'écran `stats:read` inchangée.
- Saisie : seulement 2.5 (`number+text`) et 4.2 (`yesno`) ; seulement si la période est exactement une année civile (`manualYear`) ; écriture sous `stats:write` (COORDINATEUR seul).
- Agrégats uniquement ; les saisies sont des données de structure, pas de patient.
- Copies de la matrice des permissions back/front identiques octet pour octet ; `docs/multi-tenant/habilitations.md` mis à jour dans le même commit.
- Pas de nouvelle dépendance. Biome, jamais `biome-ignore`. Commentaires : une ligne ou rien, en français. Couleurs : tokens existants ou variables CSS nommées dans `front/src/styles/_colors.css` (avec valeur sombre) ; jamais de hex dans un composant.
- Back tests : `cd back && NODE_OPTIONS=--experimental-vm-modules npm run with:dotenv -- -e .env.test.local -e .env.test -- jest --runInBand -c src/test/jest.config.ts <fichier>` ; migration sur la base de TEST seulement : `cd back && npm run with:dotenv -- -e .env.test.local -e .env.test -- prisma migrate deploy && npx prisma generate`. Front : `cd front && npx vitest run <fichier>`, `npx tsc -b`.
- Tests en français sans accents ; commits en français ; jamais `git stash`.

## Review Focus

1. Période libre (pas une année civile) : `manualYear` null, aucune réponse jointe, champs désactivés, exports sans valeur saisie. Tests Tasks 3 et 6.
2. Un utilisateur sans `stats:write` (aucun rôle ne l'a aujourd'hui hors COORDINATEUR, mais la matrice peut changer) : PUT 403 ; à l'écran, champs désactivés. Tests Tasks 1, 3, 6.
3. Un PUT sur 1.1 (calculé) ou avec `boolValue` sur 2.5 → 400, rien n'est écrit. Test Task 3.
4. Deux services de l'établissement saisissent 2.5 pour 2026 : chacun ne voit que la sienne. Test Task 3.
5. La saisie au blur ne doit pas envoyer une requête par frappe, ni perdre la dernière valeur si l'utilisateur change d'année juste après. Test Task 6.

---

### Task 1: Permission `stats:write`

**Files:** `back/src/main/utils/permissions.ts`, `front/src/utils/permissions.ts` (copie), `docs/multi-tenant/habilitations.md`.

- [ ] Ajouter `| 'stats:write'` après `'stats:read'` dans `ServicePermission`, avec le commentaire d'une ligne « Saisir les indicateurs ARS à renseigner à la main (2.5, 4.2) du service courant. », et `'stats:write'` dans `COORDINATEUR` après `'stats:read'`. `cp back/src/main/utils/permissions.ts front/src/utils/permissions.ts`.
- [ ] Doc : ligne de matrice `| \`stats:write\` | Saisir les réponses de l'enquête ARS qui ne se calculent pas (2.5, 4.2) pour le service courant, par année — depuis le 2026-10-10 | ✔ | | | |`, et mention dans le rôle Coordinateur.
- [ ] Run `back/src/test/unit/utils/permissions.test.ts` → PASS. Commit `feat(ars): permission stats:write pour le coordinateur`.

---

### Task 2: `kind` et `input` dans le calcul

**Files:** `back/src/main/utils/ars-indicators.ts` (`ArsIndicator` manual gagne `input`, `ArsIndicatorResult` gagne `kind`, `input`, `answer`), `back/src/main/interfaces/http/fastify/schemas/arsIndicator.schema.ts` (réponse), tests `back/src/test/unit/utils/ars-indicators.test.ts`.

**Interfaces — Produces:**

```ts
export type ArsKind = 'computed' | 'unavailable' | 'manual'
export type ArsInput = 'number+text' | 'yesno'
export type ArsAnswer = { numberValue: number | null; textValue: string | null; boolValue: boolean | null }
export type ArsIndicatorResult = {
  code: string; group: ArsGroup; label: string; value: number | null; note: string | null
  kind: ArsKind; input: ArsInput | null; answer: ArsAnswer | null
}
export const MANUAL_INPUTS: Readonly<Record<string, ArsInput>> // { '2.5': 'number+text', '4.2': 'yesno' }, dérivé d'ARS_INDICATORS
```

- [ ] Tests : `computeArsIndicators` rend `kind: 'computed'` pour 1.1, `'unavailable'` pour 2.3, `'manual'` + `input: 'number+text'` pour 2.5, `'manual'` + `'yesno'` pour 4.2 ; `answer: null` partout ; codes, libellés et notes identiques à avant (snapshot des 30 `{code,label,note}`). FAIL.
- [ ] Implémenter : ajouter `input` aux deux entrées `manual` d'`ARS_INDICATORS` (2.5 `number+text`, 4.2 `yesno`) sans toucher leurs autres champs ; `computeArsIndicators` pose `kind`, `input`, `answer: null` ; exporter `MANUAL_INPUTS`. Schéma Zod de réponse : ajouter `kind`, `input`, `answer` (nullable) et, au niveau racine, `manualYear: z.number().nullable()` (la route le remplit à la Task 3 ; ici `null`).
- [ ] Faire passer + `indicateurs-ars.test.ts` (e2e). Commit `feat(ars): nature de chaque indicateur (calcule, a saisir, non disponible)`.

---

### Task 3: Réponses saisies (table, lecture, écriture, exports)

**Files:**
- Modify: `back/prisma/schema.prisma` (+ migration `…_ars_manual_answer`), `back/src/main/infra/orm/tenant-guard.ts` (`SERVICE_MODELS`, relations si le test l'exige)
- Create: `back/src/main/infra/orm/repositories/arsManualAnswer.repository.ts` + interface, enregistrement IoC
- Modify: `back/src/main/domain/arsIndicator.domain.ts` (+ interface), `routes/arsIndicator.ts`, `schemas/arsIndicator.schema.ts`
- Test: `back/src/test/e2e/indicateurs-ars-saisies.test.ts`, `back/src/test/e2e/permissions.test.ts` (sonde PUT), tests du garde-fou

**Interfaces — Produces:** `GET /indicateurs-ars?from&to` → `{ from, to, manualYear, indicators }` (réponse jointe aux `manual` si `manualYear`) ; `PUT /indicateurs-ars/saisies/:year/:code` (body selon §2 de la spec) → `ArsAnswer`.

- [ ] e2e d'abord : un coordinateur saisit 2.5 = 12 + « Ateliers en ville » pour 2026, puis 4.2 = true ; `GET 2026` les rend dans `answer` avec `manualYear: 2026` ; `GET` du 2026-03-01 au 2026-09-30 → `manualYear: null`, `answer: null` (Review Focus 1) ; PUT sur 1.1 → 400, PUT 2.5 avec `boolValue` → 400, PUT 4.2 avec `numberValue` → 400 (Review Focus 3) ; un second service saisit 2.5 = 3 et chacun lit la sienne (Review Focus 4) ; deuxième PUT sur 2.5 met à jour sans doublon ; l'export Excel 2026 porte 12 en 2.5 et « Oui » en 4.2, et le CSV n'est pas concerné ici (front). Sonde `permissions.test.ts` : `stats:write`, `PUT /indicateurs-ars/saisies/2026/4.2`, payload `{ boolValue: true }`, `heldStatus: 200` (Review Focus 2). FAIL.
- [ ] Implémenter :
  - Modèle Prisma `ArsManualAnswer` (spec §2), relation `updatedBy User` si le schéma l'impose sinon `updatedById String` simple ; `@@unique([serviceId, year, code])`, `@@index([serviceId])`. Migration appliquée à la base de test.
  - Repository scopé (`this.tenantContext.scope()`) : `findByYear(year)`, `upsert(year, code, values, userId)`.
  - Domaine : `findAll({from,to})` calcule `manualYear` (from = `YYYY-01-01`, to = `YYYY-12-31`, même année) ; si non nul, joint les réponses (`answer`) aux `manual`. `saveAnswer(year, code, body, userId)` valide code et type via `MANUAL_INPUTS` (400 sinon, `Boom.badRequest`). `exportExcel` utilise le même `findAll` : pour un `manual` avec réponse, `Valeur` = nombre (2.5) ou « Oui »/« Non » (4.2), et l'explication de 2.5 dans `Libellé` après le libellé, séparée par « — ».
  - Route PUT, schémas Zod (`params: year coerce int 2000-2100, code string` ; body union stricte selon le code, validée dans le domaine), permission `stats:write`. L'id utilisateur vient du contexte d'auth existant (voir comment d'autres routes l'obtiennent, ex. journal d'activité).
- [ ] Faire passer : nouveau e2e, `indicateurs-ars.test.ts`, `permissions.test.ts`, tests du garde-fou (`tenant-guard*.test.ts`, `schema-drift` s'il existe). Lint, tsc filtré. Commit `feat(ars): saisie des indicateurs a renseigner, par service et par annee`.

---

### Task 4: Front — données, navigation, bascule

**Files:** `front/src/types/arsIndicator.ts`, `front/src/api/arsIndicator.api.ts` (`saveAnswer(year, code, body)`), `front/src/queries/useArsIndicator.ts` (mutation + `manualYear`), `front/src/navigation/navigation.ts` (+ tests de navigation/navbar), Create `front/src/components/custom/pilotage/basculePilotage.tsx` (+ test), rendu en tête de `activite.tsx` et `indicateurs-ars.tsx`.

**Interfaces — Produces:** types `ArsKind`, `ArsInput`, `ArsAnswer`, `ArsIndicator` étendu, `ArsIndicators.manualYear` ; `ArsIndicatorApi.saveAnswer` ; `useSaveArsAnswerMutation()` qui invalide la requête des indicateurs de la période ; `<BasculePilotage actif="activite" | "ars" />`.

- [ ] Tests : la bascule rend « Activité » et « Indicateurs ARS » pour un coordinateur, seulement « Activité » pour LECTURE (et dans ce cas, pas de bascule du tout si un seul segment : décider « pas de bascule » et le tester) ; liens vers les deux routes ; segment actif `aria-current="page"`. Navigation : « Indicateurs ARS » absent du menu Administration ; l'onglet Pilotage actif sur `/indicateurs-ars` ; `navigation.test.ts` vert (ARS dans `HORS_ONGLETS`). FAIL.
- [ ] Implémenter (style du handoff §1 : fond `border` #e2e8f0 → token, segment actif blanc avec ombre légère, h 30px).
- [ ] Suite front complète, `tsc -b`. Commit `feat(pilotage): bascule Activite / Indicateurs ARS sous l'onglet Pilotage`.

---

### Task 5: Front — écran ARS (lecture)

**Files:** `front/src/routes/_authenticated/e/$establishmentId/s/$serviceId/indicateurs-ars.tsx` (+ test), Create `front/src/components/custom/ars/*.tsx` (bandeau, carte de groupe, ligne), `front/src/styles/_colors.css` si un token manque (à saisir ambre #f59e0b / #fffbeb / #b45309, saisi = primary, non disponible #cbd5e1).

- [ ] Tests (handoff § Tests) : les 3 états selon `kind` ; compteurs et barre du bandeau cohérents avec les données ; filtre (Tous / Calculés / À saisir / Non disponibles) masque les lignes et les sections vides ; % des « bis » seulement si parent > 0 (« 1.1bis » : « x % du 1.1 ») ; décimale à virgule (3,7) ; bouton copier (`navigator.clipboard.writeText` mocké) appelle avec la valeur brute et annonce « Copié » ; badge « Non disponible » ; pied avec lien vers l'Activité. Les champs de saisie s'affichent mais restent désactivés dans cette tâche (la Task 6 les branche). FAIL.
- [ ] Implémenter d'après le handoff §2-§5 ; garder `PeriodPicker`, `queryState`, `erreurExport`, les deux exports.
- [ ] Suite front complète, `tsc -b`. Commit `feat(ars): ecran en cartes, bandeau d'avancement et etats des indicateurs`.

---

### Task 6: Front — saisie

**Files:** composants `front/src/components/custom/ars/*` (champs 2.5 et 4.2), `indicateurs-ars.tsx`, `front/src/libs/arsCsv.ts` (+ test), tests de l'écran.

- [ ] Tests : avec `stats:write` et une année civile, saisir 2.5 puis quitter le champ envoie UN `PUT …/saisies/2026/2.5` (debounce, pas un par frappe) avec `{ numberValue: 12, textValue: … }` puis affiche « Enregistré » ; 4.2 Oui → `{ boolValue: true }` ; sans `stats:write` → champs désactivés ; période libre → désactivés avec « Choisissez une année civile pour saisir » ; changer d'année juste après une frappe envoie la saisie en attente pour l'ANCIENNE année (Review Focus 5) ; fond ambre tant que non saisi, blanc après ; labels associés (`aria-labelledby` vers le libellé). CSV : 2.5 saisi → valeur 12 et note « Ateliers en ville » ; 4.2 → « Oui ». FAIL.
- [ ] Implémenter (mutation de la Task 4 ; erreur d'enregistrement visible, la valeur reste dans le champ).
- [ ] Suite front complète, `tsc -b`. Commit `feat(ars): saisie de 2.5 et 4.2 dans la page`.

---

### Task 7: Vérification (contrôleur)

- [ ] Suites complètes, merge de main, fusion. Appliquer la migration à la base de dev (`cd back && npm run with:dotenv -- -e .env -- prisma migrate deploy`) ; rappeler à Léo de redémarrer son back de dev. Contrôle visuel des deux pages et de la bascule.
