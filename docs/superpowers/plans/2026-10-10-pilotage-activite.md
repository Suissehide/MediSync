# Pilotage, partie Activité (v3) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refondre la page Activité selon le handoff Pilotage v3 : nouveaux agrégats (mensuel, par jour), filtre par parcours (patients), préréglages de période, mise en page en cartes, onglet « Pilotage ».

**Architecture:** Le back étend la cohorte partagée (`pathwayTemplateId` par présence), filtre la cohorte par patients avant `computeActivity`, et ajoute `monthly` et `absences.byWeekday` au rapport. Le front reprend la page section par section d'après le handoff, avec les composants et tokens existants ; barres en CSS.

**Tech Stack:** Fastify + Zod + Prisma + Jest (back) ; React + TanStack Router/Query + Tailwind v4 + Vitest (front).

**Spec:** `docs/superpowers/specs/2026-10-10-pilotage-activite-design.md` — et, pour l'écran, le handoff `docs/superpowers/specs/handoffs/pilotage-v3/README.md` + `Pilotage v3.dc.html` (prototype ; à lire, pas à copier).

## Global Constraints

- Agrégats uniquement : aucune donnée nominative dans la réponse, à l'écran, dans un `title`, dans le CSV.
- `ACTIVITY_DEFINITIONS` (`front/src/constants/activity.constant.ts`) : textes inchangés, mêmes textes à l'écran et dans le CSV.
- Seuil « moins de 5 rendez-vous pointés : pas de taux » via `rate === null` (`SEUIL_ABSENCES = 5`).
- Bornes `[from, finDeJournee(to)]`, UTC ; lundi = 0.
- Filtre parcours = patients ayant au moins un rendez-vous (tout statut) sur un créneau d'un parcours du modèle, à n'importe quelle date ; tous leurs chiffres restent.
- « 12 derniers mois » = du 1er du mois d'il y a 11 mois à aujourd'hui ; « Trimestre » = trimestre civil en cours.
- Onglet « Pilotage » ; titre de page « Activité » ; route `/activite` inchangée ; garde `activity:read` inchangée.
- Pas de nouvelle dépendance. Biome, jamais `biome-ignore`. Commentaires : une ligne ou rien, en français. Couleurs : tokens existants, sinon variables CSS nommées dans `front/src/styles/_colors.css` (avec mode sombre), jamais de hex dans les composants.
- Back tests : `cd back && NODE_OPTIONS=--experimental-vm-modules npm run with:dotenv -- -e .env.test.local -e .env.test -- jest --runInBand -c src/test/jest.config.ts <fichier>`. Front : `cd front && npx vitest run <fichier>`, `npx tsc -b`. Back `tsc` : propre sur les fichiers touchés (erreurs préexistantes ailleurs).
- Tests en français sans accents ; commits en français ; jamais `git stash`.

## Review Focus

1. Période d'un trimestre : `monthly` a 3 éléments, et la somme des `newlyIncluded` / `exited` mensuels égale les totaux (un patient avec deux présences « diagnostic » dans deux mois n'est rangé qu'une fois). Test Task 1.
2. Filtre parcours : un patient du modèle garde ses présences **hors parcours** dans les chiffres ; un patient sans rendez-vous du modèle disparaît de tous les chiffres, dossier compris. Test Task 1.
3. Mois futurs (période de l'année en cours) : colonnes vides, pas de barre à 0 trompeuse ni de file active « 0 ». Test Task 4.
4. Thématique dont `total.rate === null` : sort du tableau principal pour la section faible volume ; une thématique avec un taux total mais des jours à « N rdv » reste dans le tableau principal. Test Task 5.
5. Bascule Définitions : le texte affiché est exactement celui d'`ACTIVITY_DEFINITIONS` (aucune réécriture). Test Task 4.

---

### Task 1: Agrégats et filtre (calcul, back)

**Files:**
- Modify: `back/src/main/utils/ars-indicators.ts` (`ArsPresence.pathwayTemplateId: string | null`)
- Modify: `back/src/main/infra/orm/repositories/arsIndicator.repository.ts` (charger `pathway.template.id`)
- Modify: `back/src/main/utils/activity-indicators.ts`
- Modify: `back/src/test/unit/utils/activity-indicators.test.ts`, `back/src/test/unit/utils/ars-indicators.test.ts` (fabriques), `back/src/test/e2e/indicateurs-ars.test.ts` (test `findCohort` : assertion du nouveau champ)

**Interfaces:**
- Produces:
  - `ArsPresence.pathwayTemplateId: string | null`
  - `ActivityReport.monthly: { month: string; newlyIncluded: number; exited: number; active: number }[]`
  - `ActivityReport.absences.byWeekday: AbsenceCell[]` (7)
  - `export const filterByPathwayTemplate = (cohort: ArsCohort, pathwayTemplateId: string): ArsCohort`

- [ ] **Step 1: Tests (unitaires)**

Dans `activity-indicators.test.ts` (fabrique `presence` : `pathwayTemplateId: null` par défaut) :

```ts
describe('monthly', () => {
  const TRIMESTRE = { from: new Date('2026-10-01'), to: new Date('2026-12-31') }

  it('rend un element par mois de la periode', () => {
    const r = computeActivity({ ...TRIMESTRE, files: [], presences: [] })
    expect(r.monthly.map((m) => m.month)).toEqual(['2026-10', '2026-11', '2026-12'])
  })

  it('range inclus et sortis une seule fois, sommes egales aux totaux', () => {
    const de1 = presence({ patientId: 'a', date: new Date('2026-10-05T09:00:00Z'), thematicRole: 'DIAGNOSTIC_EDUCATIF' })
    const de2 = presence({ patientId: 'a', date: new Date('2026-11-05T09:00:00Z'), thematicRole: 'DIAGNOSTIC_EDUCATIF' })
    const r = computeActivity({
      ...TRIMESTRE,
      files: [
        dossier({ patientId: 'a', entryDate: null, presences: [de1, de2] }),
        dossier({ patientId: 'b', entryDate: new Date('2026-11-10'), exitDate: new Date('2026-12-02') }),
      ],
      presences: [de1, de2],
    })
    expect(r.monthly).toEqual([
      { month: '2026-10', newlyIncluded: 1, exited: 0, active: 1 },
      { month: '2026-11', newlyIncluded: 1, exited: 0, active: 1 },
      { month: '2026-12', newlyIncluded: 0, exited: 1, active: 0 },
    ])
    expect(r.monthly.reduce((s, m) => s + m.newlyIncluded, 0)).toBe(r.patients.newlyIncluded)
    expect(r.monthly.reduce((s, m) => s + m.exited, 0)).toBe(r.patients.exited)
  })
})

describe('byWeekday', () => {
  it('agrege toutes thematiques par jour avec le seuil', () => {
    const lundi = new Date('2026-03-02T09:00:00Z')
    const ps = [
      ...Array.from({ length: 3 }, (_, i) => presence({ slotId: `a${i}`, thematicName: 'A', date: lundi, status: 'no' })),
      ...Array.from({ length: 2 }, (_, i) => presence({ slotId: `b${i}`, thematicName: 'B', date: lundi, status: 'yes' })),
      presence({ thematicName: 'C', date: new Date('2026-03-03T09:00:00Z'), status: 'no' }),
    ]
    const r = computeActivity(cohorte([], ps))
    expect(r.absences.byWeekday).toHaveLength(7)
    expect(r.absences.byWeekday[0]).toEqual({ absent: 3, pointed: 5, rate: 0.6 })
    expect(r.absences.byWeekday[1]).toEqual({ absent: 1, pointed: 1, rate: null })
  })
})

describe('filterByPathwayTemplate', () => {
  it('garde les patients du modele avec toutes leurs presences et retire les autres', () => {
    const duModele = presence({ patientId: 'a', slotId: 's1', pathwayTemplateId: 'T1' })
    const horsParcours = presence({ patientId: 'a', slotId: 's2', pathwayTemplateId: null })
    const autre = presence({ patientId: 'b', slotId: 's3', pathwayTemplateId: 'T2' })
    const c = cohorte(
      [dossier({ patientId: 'a', presences: [duModele, horsParcours] }), dossier({ patientId: 'b', presences: [autre] })],
    )
    const f = filterByPathwayTemplate(c, 'T1')
    expect(f.files.map((x) => x.patientId)).toEqual(['a'])
    expect(f.presences).toEqual([duModele, horsParcours])
  })

  it('rend une cohorte vide pour un modele inconnu', () => {
    const c = cohorte([dossier({ presences: [presence()] })])
    const f = filterByPathwayTemplate(c, 'inconnu')
    expect(f.files).toEqual([])
    expect(f.presences).toEqual([])
  })
})
```

(Adapter `cohorte`/`dossier` aux fabriques existantes du fichier.) Lancer : FAIL.

- [ ] **Step 2: Implémenter**

`ars-indicators.ts` : `pathwayTemplateId: string | null` dans `ArsPresence`. Repository : `pathway: { select: { id: true, startDate: true, template: { select: { id: true, name: true } } } }` et `pathwayTemplateId: ap.appointment.slot.pathway?.template?.id ?? null`. Mettre à jour les fabriques de `ars-indicators.test.ts` et l'assertion du test e2e `findCohort` (le parcours seedé a un modèle : vérifier son id).

`activity-indicators.ts` :

```ts
// Patients ayant au moins un rendez-vous dans un parcours du modèle, avec tous leurs chiffres.
export const filterByPathwayTemplate = (cohort: ArsCohort, pathwayTemplateId: string): ArsCohort => {
  const patients = new Set(cohort.presences.filter((p) => p.pathwayTemplateId === pathwayTemplateId).map((p) => p.patientId))
  return {
    ...cohort,
    files: cohort.files.filter((f) => patients.has(f.patientId)),
    presences: cohort.presences.filter((p) => patients.has(p.patientId)),
  }
}

const moisDe = (date: Date): string => date.toISOString().slice(0, 7)

const moisDeLaPeriode = (from: Date, to: Date): string[] => {
  const mois: string[] = []
  const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1))
  while (d <= to) {
    mois.push(moisDe(d))
    d.setUTCMonth(d.getUTCMonth() + 1)
  }
  return mois
}
```

Dans `computeActivity` : calculer une fois `deDates = c.files.map((f) => deDate(f, c))`, s'en servir pour `newlyIncluded` (au lieu de rappeler `deDate`) et pour `monthly` :

```ts
monthly: moisDeLaPeriode(c.from, c.to).map((month) => ({
  month,
  newlyIncluded: deDates.filter((d) => d !== null && moisDe(d) === month).length,
  exited: exited.filter((f) => f.exitDate !== null && moisDe(f.exitDate) === month).length,
  active: new Set(honored.filter((p) => moisDe(p.date) === month).map((p) => p.patientId)).size,
})),
```

`absences()` : ajouter `byWeekday: Array.from({ length: 7 }, (_, d) => cell(pointed.filter((p) => weekday(p.date) === d)))`.

Si Biome signale la complexité de `computeActivity`, extraire `monthly(...)` en fonction du module.

- [ ] **Step 3: Faire passer** — les deux fichiers unitaires, `indicateurs-ars.test.ts`, `activite.test.ts`. Lint, tsc filtré.

- [ ] **Step 4: Commit** — `feat(pilotage): agregats mensuels, totaux par jour et filtre par modele de parcours`

---

### Task 2: Paramètre `pathwayTemplateId` de la route

**Files:**
- Modify: `back/src/main/interfaces/http/fastify/schemas/activityReport.schema.ts` (query + réponse)
- Modify: `back/src/main/interfaces/http/fastify/routes/activityReport.ts`
- Modify: `back/src/main/domain/activityReport.domain.ts` + `types/domain/activityReport.domain.interface.ts`
- Test: `back/src/test/e2e/activite.test.ts`

**Interfaces:**
- Consumes: `filterByPathwayTemplate`, `monthly`, `byWeekday` (Task 1).
- Produces: `GET {tenant}/activite?from&to[&pathwayTemplateId]` ; réponse = rapport + `monthly` + `absences.byWeekday`.

- [ ] **Step 1: e2e** — dans `activite.test.ts` : créer un `PathwayTemplate` et un `Pathway` sur un créneau d'un patient A ; un patient B sans parcours ; `GET /activite?…&pathwayTemplateId=<id>` → `patients.active` ne compte que A ; sans le paramètre, A et B ; avec un id inconnu (cuid valide) → 200 et tout à 0 ; la réponse porte `monthly` (12 éléments pour 2026) et `absences.byWeekday` (7). Lancer : FAIL.

- [ ] **Step 2: Implémenter**
  - Schéma de requête : celui de l'ARS (`arsIndicatorQuerySchema`) étendu d'un `pathwayTemplateId: z.string().min(1).optional()` — en conservant le `refine` from ≤ to (le reconstruire si l'extension d'un objet raffiné n'est pas possible : objet de base partagé + `refine` dans chaque schéma).
  - Schéma de réponse : ajouter `monthly` et `absences.byWeekday`.
  - Domaine : `report({ from, to }, pathwayTemplateId?)` ; si fourni, `computeActivity(filterByPathwayTemplate(cohorte, pathwayTemplateId))`.
  - La route passe `request.query.pathwayTemplateId`.

- [ ] **Step 3: Faire passer** — `activite.test.ts`, `permissions.test.ts`. Lint, tsc filtré.

- [ ] **Step 4: Commit** — `feat(pilotage): filtre par modele de parcours sur l'activite`

---

### Task 3: Socle front (données, préréglages, onglet, couleurs)

**Files:**
- Modify: `front/src/types/activity.ts`, `front/src/api/activity.api.ts`, `front/src/queries/useActivity.ts`
- Modify: `front/src/components/custom/periodPicker.tsx` (+ test `periodPicker.test.tsx` à côté)
- Modify: `front/src/navigation/navigation.ts` (label « Pilotage ») + les tests de navbar/navigation qui citent « Activité »
- Modify: `front/src/styles/_colors.css` (+ `_globals.css` si le `@theme` doit exposer les nouvelles couleurs à Tailwind)

**Interfaces:**
- Produces:
  - types : `monthly`, `absences.byWeekday` dans `ActivityReport`
  - `ActivityApi.get(from, to, pathwayTemplateId?)`, `useActivityQuery(from, to, pathwayTemplateId?)` (clé de requête incluant le parcours)
  - `periodPicker.tsx` : `douzeDerniersMois(aujourdhui?: Dayjs): Periode`, `trimestreEnCours(aujourdhui?: Dayjs): Periode`, prop `presets?: boolean` sur `PeriodPicker`
  - tokens CSS (noms à reprendre tels quels) : `--color-termine` #16a34a, `--color-abandon` #d97706, `--color-autres-sortis` #cbd5e1, `--color-collectives` #93c5fd, `--color-segment-actif` #04182b, `--color-surface-douce` #f8fafc, `--color-carte` #ffffff — chacun avec une valeur sombre lisible ; utilisables en classes Tailwind (`bg-termine`, `bg-surface-douce`, …).

- [ ] **Step 1: Tests** — `periodPicker.test.tsx` : `douzeDerniersMois(dayjs.utc('2026-10-10'))` → du 2025-11-01 au 2026-10-10 ; `trimestreEnCours(dayjs.utc('2026-10-10'))` → du 2026-10-01 au 2026-12-31 ; `trimestreEnCours(dayjs.utc('2026-02-15'))` → 2026-01-01 → 2026-03-31 ; rendu avec `presets` : cliquer « Trimestre » appelle `onChange` avec ces bornes ; sans `presets`, le segmenté est absent. FAIL.

- [ ] **Step 2: Implémenter** — fonctions pures + segmenté (style du handoff : actif fond `segment-actif`, texte blanc) ; actif quand la période tombe pile dessus. API/query avec le paramètre optionnel (n'ajouter `&pathwayTemplateId=` que s'il est défini). Libellé de l'onglet « Pilotage ». Tokens CSS.

- [ ] **Step 3: Faire passer** — test du picker, `indicateurs-ars.test.tsx` (inchangé, l'ARS n'active pas `presets`), `activite.test.tsx`, tests de navigation/navbar, suite complète une fois ; `tsc -b`.

- [ ] **Step 4: Commit** — `feat(pilotage): prereglages de periode, filtre parcours cote donnees, onglet Pilotage`

---

### Task 4: Page — en-tête, trois questions, entrées et sorties, bilans

**Files:**
- Modify: `front/src/routes/_authenticated/e/$establishmentId/s/$serviceId/activite.tsx` — si le fichier dépasse ~400 lignes, extraire les sections dans `front/src/components/custom/pilotage/*.tsx` (un composant par carte)
- Modify: `activite.test.tsx`

**Interfaces:**
- Consumes: Task 3 (`PeriodPicker presets`, `useActivityQuery(from, to, pathwayTemplateId)`, tokens), `usePathwayTemplateQueries`, `ACTIVITY_DEFINITIONS`.

- [ ] **Step 1: Tests** — dans `activite.test.tsx` (mock sélectif de fetch : `/activite` et la liste des modèles de parcours) :
  - en-tête : « Chiffres agrégés uniquement, aucune donnée nominative. » ;
  - « Combien ont terminé » : la légende « N terminés · N abandons · N autres sortis » avec autres = exited − completed − dropouts ;
  - bascule « Définitions » : absente par défaut ; après clic, le texte de « File active » est exactement `ACTIVITY_DEFINITIONS` ;
  - mensuel : pour une période 2026 et une date du jour fixée (`vi.setSystemTime(new Date('2026-10-10'))`), le mois de novembre n'a ni barre ni file active affichée (Review Focus 3) ; le `title` d'octobre vaut « Oct : N inclus, N sortis » (format du handoff) ;
  - bilans : « 92 / 567 · 16 % » (espace insécable avant %) ;
  - filtre parcours : choisir un modèle relance la requête avec `pathwayTemplateId`.
  FAIL.

- [ ] **Step 2: Implémenter** — sections 1, 2 et 3 du handoff (en-tête, `Reponse` en cartes + barre empilée + définitions, carte « Entrées et sorties par mois », carte « Bilans et suivi éducatif »). Conteneur `max-w-[1320px] mx-auto flex flex-col gap-4`, cartes `bg-carte border border-border rounded-[10px] px-5 py-[18px]`. Icônes lucide : ShieldCheck, BookOpen, Download, Calendar. Les sections 4 à 6 gardent provisoirement leur rendu actuel.

- [ ] **Step 3: Faire passer** — tests de l'écran, suite complète une fois, `tsc -b`, biome.

- [ ] **Step 4: Commit** — `feat(pilotage): en-tete, questions en cartes, entrees et sorties par mois, bilans`

---

### Task 5: Page — carte des absences, motifs, séances, pied

**Files:**
- Modify: `activite.tsx` (ou les composants `components/custom/pilotage/*`), `activite.test.tsx`

- [ ] **Step 1: Tests** — (mocker `@tanstack/react-virtual` si un tableau virtualisé est utilisé ; ici la carte est une grille non virtualisée, préférer `<table>` ou `role="table"`)
  - tri : par défaut taux total décroissant ; « A → Z » trie par nom ;
  - faible volume : une thématique `total.rate === null` n'est pas dans le tableau principal ; la ligne « Autres thématiques · faible volume (N) » la révèle au clic ; une thématique à taux total mais avec des jours « N rdv » reste dans le tableau principal (Review Focus 4) ;
  - « Toutes thématiques » : ses cellules sont celles de `absences.byWeekday` et son total celui de `absences.overall` ;
  - motifs : 6 affichés, « Voir les 8 motifs » puis tous, puis « Afficher moins » ;
  - séances : barre empilée individuelles / collectives avec la légende en % ; 4 mini-tuiles ;
  - pied : « Moins de 5 rendez-vous pointés : pas de taux. Mêmes définitions à l'écran et dans l'export CSV. »
  FAIL.

- [ ] **Step 2: Implémenter** — sections 4, 5 et 6 du handoff (`Case` conservée ; teinte `color-mix` sur `--color-destructive` conservée ; légende 0 % → 40 % ; « Par parcours » sous un filet).

- [ ] **Step 3: Faire passer** — idem Task 4.

- [ ] **Step 4: Commit** — `feat(pilotage): carte des absences triable, motifs, seances et pied`

---

### Task 6: CSV

**Files:**
- Modify: `front/src/libs/activityCsv.ts`, `front/src/libs/activityCsv.test.ts`

- [ ] **Step 1: Tests** — lignes `Entrées et sorties par mois;2026-10;12 inclus, 9 sortis, 40 en file active;` (une par mois, définition vide) et `Absences toutes thématiques;lundi;22 %;30 sur 136` (une par jour avec des pointés). FAIL.
- [ ] **Step 2: Implémenter** dans `activityCsv` (après les absences par parcours), avec les helpers existants (`pourcent`, `nombre`, `toCsv`).
- [ ] **Step 3: Faire passer**, **Step 4: Commit** — `feat(pilotage): export CSV mensuel et par jour`

---

### Task 7: Vérification (contrôleur)

- [ ] Suites complètes, merge de main dans le worktree, fusion sur main.
- [ ] Contrôle visuel sur le serveur de dev (4270, Chrome du Mac) en clair et en sombre, avec et sans filtre de parcours, sur une année et sur « Trimestre ».
