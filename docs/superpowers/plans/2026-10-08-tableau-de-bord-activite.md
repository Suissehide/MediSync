# Tableau de bord d'activité du service (MDS-40) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un écran « Activité » par service et par période, en chiffres agrégés, qui répond à « combien de patients, combien ont terminé, où sont les absences », avec un export CSV, lisible par `COORDINATEUR` et `LECTURE`.

**Architecture:** La cohorte en mémoire de l'écran ARS (`arsIndicator.repository.ts` → `findCohort`) est étendue de quelques champs ; un module pur `activity-indicators.ts` calcule le rapport en réutilisant les définitions de l'ARS ; une route JSON le sert. Le front affiche le rapport et fabrique le CSV lui-même, à partir du JSON.

**Tech Stack:** Fastify + Zod + Prisma (back, Jest), React + TanStack Router/Query + Tailwind v4 (front, Vitest), Biome.

**Spec:** `docs/superpowers/specs/2026-10-07-tableau-de-bord-activite-design.md`

**Écart assumé avec la spec (§4.1) :** pas de route `/activite/export` côté back. Le CSV est fabriqué
par le front (`libs/activityCsv.ts`) depuis le JSON déjà chargé : les libellés des motifs d'arrêt
(`STOP_REASON`) et le texte des définitions vivent dans le front, une route back aurait dû les
recopier. La propriété « aucune donnée nominative » se vérifie donc sur le JSON (e2e), qui est la
seule source du CSV.

## Global Constraints

- Lint et format : Biome (`npx biome check --write <fichiers>`), jamais ESLint/Prettier ; jamais de `biome-ignore`.
- Commentaires : une ligne ou rien, en français ; pas de pavé explicatif.
- Agrégats uniquement : la réponse de `/activite` ne contient aucun identifiant ni nom de patient.
- Bornes de période : `[from, finDeJournee(to)]`, UTC, comme l'ARS.
- Seuil de lecture des absences : `SEUIL_ABSENCES = 5` présences pointées.
- Permission : `activity:read`, accordée à `COORDINATEUR` et `LECTURE` seulement.
- Pas de nouvelle dépendance (ni librairie de graphique, ni librairie CSV).
- Tests back : `cd back && NODE_OPTIONS=--experimental-vm-modules npm run with:dotenv -- -e .env.test.local -e .env.test -- jest --runInBand -c src/test/jest.config.ts <fichier>` (les `.env*` sont déjà copiés dans ce worktree, `prisma generate` déjà fait).
- Tests front : `cd front && npx vitest run <fichier>`.
- Noms de tests en français, sans accents (convention du dépôt).
- Commits : `feat(activite): …` / `refactor(ars): …`, en français.

## Review Focus

1. Un patient inclus l'an dernier et sorti cette année avec un programme complet doit compter dans « Ont terminé » — `completeProgram` de l'ARS borne le diagnostic éducatif à la période ; ici on l'évalue depuis l'origine. Test dans la Task 3.
2. Une période sans aucune sortie ne doit ni planter ni afficher « NaN % » : taux `null`, affiché « — ». Tests Tasks 3 et 6.
3. Un créneau collectif avec trois patients présents et deux soignants compte sa durée deux fois (une par soignant), pas six. Test Task 3.
4. Une case de la carte avec 2 rendez-vous pointés, tous deux absents, ne doit pas être désignée « le plus d'absences ». Test Task 3.
5. Un `INTERVENANT` qui tape l'adresse `/activite` à la main est renvoyé au Dashboard, et l'API lui répond 403. Tests Tasks 4 et 6.

---

## File Structure

| Fichier | Rôle |
| --- | --- |
| `back/src/main/utils/permissions.ts`, `front/src/utils/permissions.ts` | + `activity:read` (copies identiques) |
| `docs/multi-tenant/habilitations.md` | ligne de matrice + rôles Coordinateur et Lecture |
| `back/src/main/utils/ars-indicators.ts` | champs ajoutés à `ArsPresence`/`ArsFile` ; exporte `inRange`, `isRole`, `deDate`, `completeProgram`, `finDeJournee` |
| `back/src/main/infra/orm/repositories/arsIndicator.repository.ts` | `findCohort` charge les nouveaux champs |
| `back/src/main/utils/activity-indicators.ts` (nouveau) | `computeActivity(cohort): ActivityReport`, pur |
| `back/src/main/domain/activityReport.domain.ts` (nouveau) + interface | `report(range)` |
| `back/src/main/interfaces/http/fastify/routes/activityReport.ts` + `schemas/activityReport.schema.ts` (nouveaux) | `GET /activite` |
| `back/src/main/application/ioc/awilix/awilix-ioc-container.ts`, `types/application/ioc.ts`, `routes/tenant.routes.ts` | câblage |
| `front/src/types/activity.ts`, `api/activity.api.ts`, `queries/useActivity.ts` (nouveaux) | accès aux données |
| `front/src/components/custom/periodPicker.tsx` (nouveau) | raccourcis d'année + plage libre, extraits de l'écran ARS |
| `front/src/constants/activity.constant.ts` (nouveau) | définitions affichées et exportées |
| `front/src/libs/activityCsv.ts` (nouveau) | rapport → CSV |
| `front/src/routes/_authenticated/e/$establishmentId/s/$serviceId/activite.tsx` (nouveau) | l'écran |
| `front/src/navigation/navigation.ts` | onglet « Activité » |

Le nom `activityReport` évite la confusion avec le journal d'activité existant (`activityLog`, `serviceActivityLogRouter`).

---

### Task 1: Permission `activity:read`

**Files:**
- Modify: `back/src/main/utils/permissions.ts` (union `ServicePermission`, `SERVICE_PERMISSIONS`)
- Modify: `front/src/utils/permissions.ts` (même modification, octet pour octet)
- Modify: `docs/multi-tenant/habilitations.md:43` et `:72`
- Test: `back/src/test/unit/utils/permissions.test.ts` (existant, vérifie l'égalité des deux copies)

**Interfaces:**
- Produces: la chaîne `'activity:read'` dans `ServicePermission`, détenue par `COORDINATEUR` et `LECTURE`.

- [ ] **Step 1: Ajouter la permission dans le back**

Dans `back/src/main/utils/permissions.ts`, après `| 'stats:read'` :

```ts
  // Tableau de bord d'activite du service courant, en chiffres agreges (MDS-40). Accordee a
  // LECTURE : c'est l'ecran de la direction.
  | 'activity:read'
```

Remplacer la ligne de commentaire de `stats:read` « Non accordee a LECTURE : la direction lira le tableau de bord de MDS-40. » par « Non accordee a LECTURE : la direction lit `activity:read`. »

Dans `SERVICE_PERMISSIONS`, ajouter `'activity:read',` après `'stats:read',` (COORDINATEUR), et remplacer `LECTURE: [...READ_ALL],` par :

```ts
  LECTURE: [...READ_ALL, 'activity:read'],
```

- [ ] **Step 2: Recopier à l'identique dans le front**

```bash
cp back/src/main/utils/permissions.ts front/src/utils/permissions.ts
```

- [ ] **Step 3: Lancer le test d'égalité**

Run: `cd back && NODE_OPTIONS=--experimental-vm-modules npm run with:dotenv -- -e .env.test.local -e .env.test -- jest --runInBand -c src/test/jest.config.ts src/test/unit/utils/permissions.test.ts`
Expected: PASS

- [ ] **Step 4: Mettre la doc à jour**

Dans `docs/multi-tenant/habilitations.md`, ajouter après la ligne `stats:read` de la matrice :

```markdown
| `activity:read` | Lire le tableau de bord d'activité du service courant (file active, sorties, absentéisme, séances) : chiffres agrégés, aucune donnée nominative — depuis le 2026-10-08, MDS-40 | ✔ | | | ✔ |
```

Dans la table des rôles, ligne Coordinateur, après la phrase sur MDS-26, ajouter : « **Plus le tableau de bord d'activité de son service depuis le 2026-10-08 (MDS-40).** ». Ligne Lecture, remplacer la description par : « Direction ou cadre : consultation du suivi, du planning, des listes et du tableau de bord d'activité (MDS-40), sans modification ni accès au contenu clinique. »

- [ ] **Step 5: Commit**

```bash
git add back/src/main/utils/permissions.ts front/src/utils/permissions.ts docs/multi-tenant/habilitations.md
git commit -m "feat(activite): permission activity:read pour le coordinateur et la lecture (MDS-40)"
```

---

### Task 2: Cohorte étendue

**Files:**
- Modify: `back/src/main/utils/ars-indicators.ts:34-52` (types), `:84-166` (exports), `:488`
- Modify: `back/src/main/infra/orm/repositories/arsIndicator.repository.ts:32-100`
- Modify: `back/src/test/unit/utils/ars-indicators.test.ts:19-36` (fabriques)
- Test: `back/src/test/e2e/indicateurs-ars.test.ts` (existant, exerce `findCohort` contre la base)

**Interfaces:**
- Produces (dans `ars-indicators.ts`) :
  - `export type PresenceStatus = 'yes' | 'no' | null`
  - `ArsPresence` + `status: PresenceStatus`, `pathwayId: string | null`, `pathwayLabel: string | null`, `slotMinutes: number`, `soignants: string[]`
  - `ArsFile` + `exitDate: Date | null`, `stopReason: string | null`
  - `export const inRange`, `export const isRole`, `export const deDate`, `export const completeProgram`, `export const finDeJournee` (signatures inchangées)

- [ ] **Step 1: Étendre les types et exporter les fonctions**

Dans `ars-indicators.ts` :

```ts
export type PresenceStatus = 'yes' | 'no' | null

export type ArsPresence = {
  patientId: string
  date: Date
  type: AppointmentType | null
  individual: boolean
  slotId: string
  thematicName: string | null
  honored: boolean
  accompanied: boolean
  status: PresenceStatus
  pathwayId: string | null
  pathwayLabel: string | null
  slotMinutes: number
  soignants: string[]
}

export type ArsFile = {
  patientId: string
  entryDate: Date | null
  exitDate: Date | null
  stopReason: string | null
  orientation: string | null
  presences: ArsPresence[]
}
```

Ajouter `export` devant `const inRange`, `const isRole`, `const deDate`, `const completeProgram`, `const finDeJournee`.

- [ ] **Step 2: Mettre à jour les fabriques du test ARS**

Dans `back/src/test/unit/utils/ars-indicators.test.ts`, `presence` reçoit en plus :

```ts
  status: 'yes',
  pathwayId: null,
  pathwayLabel: null,
  slotMinutes: 60,
  soignants: [],
```

et `dossier` reçoit `exitDate: null, stopReason: null,`. Attention : `presence({ honored: false })` doit rester cohérent ; remplacer dans la fabrique le spread final par :

```ts
  ...p,
  status: p.status !== undefined ? p.status : p.honored === false ? 'no' : 'yes',
```

(placé APRÈS `...p` pour que `honored: false` seul donne `status: 'no'`).

- [ ] **Step 3: Lancer les tests unitaires ARS**

Run: `cd back && NODE_OPTIONS=--experimental-vm-modules npm run with:dotenv -- -e .env.test.local -e .env.test -- jest --runInBand -c src/test/jest.config.ts src/test/unit/utils/ars-indicators.test.ts`
Expected: PASS (aucun indicateur ARS ne change)

- [ ] **Step 4: Charger les champs dans le repository**

Dans `findCohort`, la lecture des sous-dossiers :

```ts
        select: {
          patientId: true,
          entryDate: true,
          exitDate: true,
          stopReason: true,
          orientation: true,
        },
```

La lecture des rendez-vous : remplacer le `slot: { select: { slotTemplate: … } }` par :

```ts
              slot: {
                select: {
                  startDate: true,
                  endDate: true,
                  pathway: {
                    select: {
                      id: true,
                      startDate: true,
                      template: { select: { name: true } },
                    },
                  },
                  slotTemplate: {
                    select: {
                      isIndividual: true,
                      thematic: { select: { name: true } },
                      soignantLinks: {
                        select: { soignant: { select: { name: true } } },
                      },
                    },
                  },
                },
              },
```

Ajouter au-dessus de la classe :

```ts
const libelleParcours = (pathway: {
  startDate: Date
  template: { name: string } | null
}): string => {
  const [annee, mois, jour] = pathway.startDate.toISOString().slice(0, 10).split('-')
  return `${pathway.template?.name ?? 'Parcours sans modèle'} — ${jour}/${mois}/${annee}`
}
```

Et dans le `map` des présences, après `accompanied` :

```ts
      status: ap.status,
      pathwayId: ap.appointment.slot.pathway?.id ?? null,
      pathwayLabel: ap.appointment.slot.pathway
        ? libelleParcours(ap.appointment.slot.pathway)
        : null,
      slotMinutes:
        (ap.appointment.slot.endDate.getTime() -
          ap.appointment.slot.startDate.getTime()) /
        60_000,
      soignants: ap.appointment.slot.slotTemplate.soignantLinks.map(
        (l) => l.soignant.name,
      ),
```

et dans le `map` des dossiers : `exitDate: f.exitDate, stopReason: f.stopReason,`.

- [ ] **Step 5: Vérifier la cohorte contre la base**

Run: `cd back && npx tsc --noEmit -p . && NODE_OPTIONS=--experimental-vm-modules npm run with:dotenv -- -e .env.test.local -e .env.test -- jest --runInBand -c src/test/jest.config.ts src/test/e2e/indicateurs-ars.test.ts src/test/unit/infra/repository-scope.test.ts`
Expected: PASS. Si le garde-fou de tenant (`tenant-guard`) refuse la traversée `slot.pathway` ou `slotTemplate.soignantLinks`, ne pas l'affaiblir : lire `assertTenantScope` et déplacer la lecture fautive dans une requête séparée scopée (`this.prisma.slot.findMany({ where: this.scope, … })`), jointe en mémoire par `slotID`.

- [ ] **Step 6: Commit**

```bash
git add back/src/main/utils/ars-indicators.ts back/src/main/infra/orm/repositories/arsIndicator.repository.ts back/src/test/unit/utils/ars-indicators.test.ts
git commit -m "refactor(ars): cohorte etendue (sorties, statut, parcours, duree, soignants) pour MDS-40"
```

---

### Task 3: Calcul du rapport d'activité

**Files:**
- Create: `back/src/main/utils/activity-indicators.ts`
- Test: `back/src/test/unit/utils/activity-indicators.test.ts`

**Interfaces:**
- Consumes: `ArsCohort`, `ArsPresence`, `ArsFile`, `inRange`, `isRole`, `deDate`, `completeProgram`, `finDeJournee` (Task 2).
- Produces:

```ts
export const SEUIL_ABSENCES = 5
export const FIN_DE_PARCOURS = 'PLUS_BESOIN_FIN_PARCOURS'
export type AbsenceCell = { absent: number; pointed: number; rate: number | null }
export type ActivityReport = {
  patients: { active: number; newlyIncluded: number; exited: number }
  completion: {
    completed: number
    exited: number
    rate: number | null
    dropouts: number
    dropoutReasons: { reason: string; count: number }[]
  }
  absences: {
    overall: AbsenceCell
    worst: { thematic: string; weekday: number } | null
    weekdays: number[]
    byThematic: { thematic: string; total: AbsenceCell; cells: AbsenceCell[] }[]
    byPathway: { pathway: string; cell: AbsenceCell }[]
  }
  sessions: {
    individual: number
    collective: number
    educationalDiagnoses: number
    finalReviews: number
  }
  hoursBySoignant: { soignant: string; hours: number }[]
}
export const computeActivity: (cohort: ArsCohort) => ActivityReport
```

`weekday` : 0 = lundi … 6 = dimanche. `cells` a toujours 7 entrées ; `weekdays` liste les jours ayant au moins une présence pointée (le front n'affiche que ceux-là). `rate` d'une case ou d'une ligne : `null` sous `SEUIL_ABSENCES` ; `overall.rate` : `null` seulement à zéro pointé.

- [ ] **Step 1: Écrire les tests**

```ts
import type {
  ArsCohort,
  ArsFile,
  ArsPresence,
} from '../../../main/utils/ars-indicators'
import {
  computeActivity,
  SEUIL_ABSENCES,
} from '../../../main/utils/activity-indicators'

const PERIODE = { from: new Date('2026-01-01'), to: new Date('2026-12-31') }

// 2026-03-02 est un lundi.
const presence = (p: Partial<ArsPresence> = {}): ArsPresence => ({
  patientId: 'p1',
  date: new Date('2026-03-02T09:00:00Z'),
  type: 'ambulatory',
  individual: true,
  slotId: 'slot-1',
  thematicName: 'Mes médicaments',
  honored: p.status === undefined || p.status === 'yes',
  accompanied: false,
  status: 'yes',
  pathwayId: null,
  pathwayLabel: null,
  slotMinutes: 60,
  soignants: [],
  ...p,
})

const dossier = (f: Partial<ArsFile> = {}): ArsFile => ({
  patientId: 'p1',
  entryDate: new Date('2026-02-01'),
  exitDate: null,
  stopReason: null,
  orientation: null,
  presences: [],
  ...f,
})

const cohorte = (files: ArsFile[], extra: ArsPresence[] = []): ArsCohort => ({
  ...PERIODE,
  files,
  presences: [...files.flatMap((f) => f.presences), ...extra],
})

describe('patients', () => {
  it('compte la file active en patients distincts presents, dossier ou non', () => {
    const r = computeActivity(
      cohorte(
        [dossier({ presences: [presence(), presence({ slotId: 's2' })] })],
        [presence({ patientId: 'sans-dossier' }), presence({ patientId: 'absent', status: 'no' })],
      ),
    )
    expect(r.patients.active).toBe(2)
  })

  it('ignore les presences hors periode pour la file active', () => {
    const r = computeActivity(
      cohorte([], [presence({ date: new Date('2025-12-31T09:00:00Z') })]),
    )
    expect(r.patients.active).toBe(0)
  })

  it('compte une presence du dernier jour de la periode', () => {
    const r = computeActivity(
      cohorte([], [presence({ date: new Date('2026-12-31T15:00:00Z') })]),
    )
    expect(r.patients.active).toBe(1)
  })

  it('compte les nouveaux inclus par la date de diagnostic educatif', () => {
    const r = computeActivity(
      cohorte([
        dossier({ patientId: 'a', entryDate: new Date('2026-04-01') }),
        dossier({ patientId: 'b', entryDate: new Date('2025-04-01') }),
      ]),
    )
    expect(r.patients.newlyIncluded).toBe(1)
  })

  it('compte les sortis par la date de sortie', () => {
    const r = computeActivity(
      cohorte([
        dossier({ patientId: 'a', exitDate: new Date('2026-06-01') }),
        dossier({ patientId: 'b', exitDate: new Date('2027-01-02') }),
        dossier({ patientId: 'c' }),
      ]),
    )
    expect(r.patients.exited).toBe(1)
  })
})

describe('completion', () => {
  const complet = (patientId: string) => [
    presence({ patientId, date: new Date('2025-10-01T09:00:00Z') }),
    presence({
      patientId,
      date: new Date('2026-02-01T09:00:00Z'),
      thematicName: 'Réactu 1',
    }),
  ]

  // Review Focus 1 : inclus l'an dernier, sorti cette annee, programme complet.
  it('compte comme termine un programme commence avant la periode', () => {
    const r = computeActivity(
      cohorte([
        dossier({
          entryDate: new Date('2025-09-15'),
          exitDate: new Date('2026-03-01'),
          stopReason: 'PLUS_BESOIN_FIN_PARCOURS',
          presences: complet('p1'),
        }),
      ]),
    )
    expect(r.completion.completed).toBe(1)
    expect(r.completion.rate).toBe(1)
  })

  it('compte les abandons par motif, hors fin de parcours', () => {
    const r = computeActivity(
      cohorte([
        dossier({ patientId: 'a', exitDate: new Date('2026-05-01'), stopReason: 'PERDU_DE_VUE' }),
        dossier({ patientId: 'b', exitDate: new Date('2026-05-01'), stopReason: 'PERDU_DE_VUE' }),
        dossier({ patientId: 'c', exitDate: new Date('2026-05-01'), stopReason: 'DECES' }),
        dossier({ patientId: 'd', exitDate: new Date('2026-05-01'), stopReason: 'PLUS_BESOIN_FIN_PARCOURS' }),
        dossier({ patientId: 'e', exitDate: new Date('2026-05-01') }),
      ]),
    )
    expect(r.completion.dropouts).toBe(3)
    expect(r.completion.dropoutReasons).toEqual([
      { reason: 'PERDU_DE_VUE', count: 2 },
      { reason: 'DECES', count: 1 },
    ])
  })

  // Review Focus 2.
  it('rend un taux nul plutot qu une division par zero sans sortie', () => {
    const r = computeActivity(cohorte([dossier()]))
    expect(r.completion.exited).toBe(0)
    expect(r.completion.rate).toBeNull()
  })
})

describe('absences', () => {
  const pointes = (n: number, p: Partial<ArsPresence>) =>
    Array.from({ length: n }, (_, i) => presence({ slotId: `x${i}`, ...p }))

  it('exclut les non pointes du taux', () => {
    const r = computeActivity(
      cohorte([], [
        presence({ status: 'yes' }),
        presence({ status: 'no' }),
        presence({ status: null }),
      ]),
    )
    expect(r.absences.overall).toEqual({ absent: 1, pointed: 2, rate: 0.5 })
  })

  it('ventile par thematique et par jour de semaine', () => {
    const mardi = new Date('2026-03-03T09:00:00Z')
    const r = computeActivity(
      cohorte([], [
        ...pointes(4, { thematicName: 'Coaching', date: mardi, status: 'no' }),
        ...pointes(1, { thematicName: 'Coaching', date: mardi, status: 'yes' }),
      ]),
    )
    const coaching = r.absences.byThematic.find((t) => t.thematic === 'Coaching')
    expect(coaching?.cells[1]).toEqual({ absent: 4, pointed: 5, rate: 0.8 })
    expect(coaching?.cells[0]).toEqual({ absent: 0, pointed: 0, rate: null })
    expect(r.absences.weekdays).toEqual([1])
    expect(r.absences.worst).toEqual({ thematic: 'Coaching', weekday: 1 })
  })

  // Review Focus 4.
  it('ne designe pas un pire endroit sous le seuil', () => {
    const r = computeActivity(
      cohorte([], pointes(SEUIL_ABSENCES - 1, { thematicName: 'Rare', status: 'no' })),
    )
    expect(r.absences.byThematic[0].cells[0].rate).toBeNull()
    expect(r.absences.worst).toBeNull()
  })

  it('range une presence sans parcours dans Hors parcours', () => {
    const r = computeActivity(
      cohorte([], [
        presence({ status: 'no' }),
        presence({ status: 'no', pathwayId: 'pw', pathwayLabel: 'Réadaptation — 05/10/2026' }),
      ]),
    )
    expect(r.absences.byPathway.map((p) => p.pathway).sort()).toEqual([
      'Hors parcours',
      'Réadaptation — 05/10/2026',
    ])
  })
})

describe('seances et temps soignant', () => {
  it('compte les seances individuelles et les creneaux collectifs distincts', () => {
    const r = computeActivity(
      cohorte([], [
        presence({ slotId: 'i1' }),
        presence({ slotId: 'i2', status: 'no' }),
        presence({ slotId: 'c1', individual: false, patientId: 'a' }),
        presence({ slotId: 'c1', individual: false, patientId: 'b' }),
      ]),
    )
    expect(r.sessions.individual).toBe(1)
    expect(r.sessions.collective).toBe(1)
  })

  it('compte les diagnostics educatifs et les bilans de fin realises', () => {
    const r = computeActivity(
      cohorte([], [
        presence({ thematicName: 'Diagnostic éducatif' }),
        presence({ thematicName: 'Réactu 2' }),
        presence({ thematicName: 'Réactu 3', status: 'no' }),
      ]),
    )
    expect(r.sessions.educationalDiagnoses).toBe(1)
    expect(r.sessions.finalReviews).toBe(1)
  })

  // Review Focus 3 : trois presents, deux soignants -> 2 x 90 min, pas 6.
  it('compte la duree d un creneau une fois par soignant', () => {
    const collectif = { slotId: 'c1', individual: false, slotMinutes: 90, soignants: ['IDE', 'Diététicienne'] }
    const r = computeActivity(
      cohorte([], [
        presence({ ...collectif, patientId: 'a' }),
        presence({ ...collectif, patientId: 'b' }),
        presence({ ...collectif, patientId: 'c' }),
      ]),
    )
    expect(r.hoursBySoignant).toEqual([
      { soignant: 'Diététicienne', hours: 1.5 },
      { soignant: 'IDE', hours: 1.5 },
    ])
  })

  it('ne compte pas le temps d un creneau sans present', () => {
    const r = computeActivity(
      cohorte([], [presence({ status: 'no', soignants: ['IDE'] })]),
    )
    expect(r.hoursBySoignant).toEqual([])
  })
})
```

- [ ] **Step 2: Vérifier l'échec**

Run: `cd back && NODE_OPTIONS=--experimental-vm-modules npm run with:dotenv -- -e .env.test.local -e .env.test -- jest --runInBand -c src/test/jest.config.ts src/test/unit/utils/activity-indicators.test.ts`
Expected: FAIL, « Cannot find module '../../../main/utils/activity-indicators' »

- [ ] **Step 3: Implémenter**

```ts
import {
  type ArsCohort,
  type ArsPresence,
  completeProgram,
  deDate,
  finDeJournee,
  inRange,
  isRole,
} from './ars-indicators'

export const SEUIL_ABSENCES = 5
export const FIN_DE_PARCOURS = 'PLUS_BESOIN_FIN_PARCOURS'

export type AbsenceCell = { absent: number; pointed: number; rate: number | null }

export type ActivityReport = {
  patients: { active: number; newlyIncluded: number; exited: number }
  completion: {
    completed: number
    exited: number
    rate: number | null
    dropouts: number
    dropoutReasons: { reason: string; count: number }[]
  }
  absences: {
    overall: AbsenceCell
    worst: { thematic: string; weekday: number } | null
    weekdays: number[]
    byThematic: { thematic: string; total: AbsenceCell; cells: AbsenceCell[] }[]
    byPathway: { pathway: string; cell: AbsenceCell }[]
  }
  sessions: {
    individual: number
    collective: number
    educationalDiagnoses: number
    finalReviews: number
  }
  hoursBySoignant: { soignant: string; hours: number }[]
}

const cell = (ps: ArsPresence[], seuil = SEUIL_ABSENCES): AbsenceCell => {
  const absent = ps.filter((p) => p.status === 'no').length
  const pointed = ps.length
  return { absent, pointed, rate: pointed >= seuil && pointed > 0 ? absent / pointed : null }
}

const groupBy = <K>(ps: ArsPresence[], key: (p: ArsPresence) => K): Map<K, ArsPresence[]> => {
  const groups = new Map<K, ArsPresence[]>()
  for (const p of ps) {
    groups.set(key(p), [...(groups.get(key(p)) ?? []), p])
  }
  return groups
}

// 0 = lundi … 6 = dimanche, en UTC comme les bornes de période.
const weekday = (date: Date): number => (date.getUTCDay() + 6) % 7

const byCountDesc = <T extends { count: number }>(a: T, b: T) => b.count - a.count

export const computeActivity = (cohort: ArsCohort): ActivityReport => {
  const c: ArsCohort = { ...cohort, to: finDeJournee(cohort.to) }
  const inPeriod = c.presences.filter((p) => inRange(p.date, c.from, c.to))
  const honored = inPeriod.filter((p) => p.status === 'yes')
  const pointed = inPeriod.filter((p) => p.status !== null)

  const exited = c.files.filter((f) => inRange(f.exitDate, c.from, c.to))
  // Le programme s'évalue depuis l'origine : un patient inclus l'an dernier peut terminer cette année.
  const depuisToujours: ArsCohort = { ...c, from: new Date(0) }
  const completed = exited.filter((f) => completeProgram(f, depuisToujours))
  const dropped = exited.filter((f) => f.stopReason !== null && f.stopReason !== FIN_DE_PARCOURS)

  const byThematic = [...groupBy(pointed, (p) => p.thematicName ?? 'Sans thématique')]
    .map(([thematic, ps]) => {
      const days = groupBy(ps, (p) => weekday(p.date))
      return {
        thematic,
        total: cell(ps),
        cells: Array.from({ length: 7 }, (_, d) => cell(days.get(d) ?? [])),
      }
    })
    .sort((a, b) => b.total.pointed - a.total.pointed)

  let worst: ActivityReport['absences']['worst'] = null
  let worstRate = -1
  for (const t of byThematic) {
    for (const [d, day] of t.cells.entries()) {
      if (day.rate !== null && day.rate > worstRate) {
        worstRate = day.rate
        worst = { thematic: t.thematic, weekday: d }
      }
    }
  }

  const realizedSlots = groupBy(honored, (p) => p.slotId)
  const minutes = new Map<string, number>()
  for (const [, [p]] of realizedSlots) {
    for (const soignant of p.soignants) {
      minutes.set(soignant, (minutes.get(soignant) ?? 0) + p.slotMinutes)
    }
  }

  return {
    patients: {
      active: new Set(honored.map((p) => p.patientId)).size,
      newlyIncluded: c.files.filter((f) => deDate(f, c) !== null).length,
      exited: exited.length,
    },
    completion: {
      completed: completed.length,
      exited: exited.length,
      rate: exited.length > 0 ? completed.length / exited.length : null,
      dropouts: dropped.length,
      dropoutReasons: [...groupByReason(dropped.map((f) => f.stopReason as string))].sort(byCountDesc),
    },
    absences: {
      overall: cell(pointed, 1),
      worst,
      weekdays: [...new Set(pointed.map((p) => weekday(p.date)))].sort(),
      byThematic,
      byPathway: [...groupBy(pointed, (p) => p.pathwayLabel ?? 'Hors parcours')]
        .map(([pathway, ps]) => ({ pathway, cell: cell(ps) }))
        .sort((a, b) => b.cell.pointed - a.cell.pointed),
    },
    sessions: {
      individual: honored.filter((p) => p.individual).length,
      collective: new Set(honored.filter((p) => !p.individual).map((p) => p.slotId)).size,
      educationalDiagnoses: honored.filter((p) => isRole('diagnosticEducatif', p.thematicName)).length,
      finalReviews: honored.filter((p) => isRole('reactualisation', p.thematicName)).length,
    },
    hoursBySoignant: [...minutes]
      .map(([soignant, m]) => ({ soignant, hours: m / 60 }))
      .sort((a, b) => b.hours - a.hours || a.soignant.localeCompare(b.soignant)),
  }
}

const groupByReason = (reasons: string[]) =>
  [...reasons.reduce((m, r) => m.set(r, (m.get(r) ?? 0) + 1), new Map<string, number>())].map(
    ([reason, count]) => ({ reason, count }),
  )
```

Note : `isRole` attend une clé de `ARS_THEMATIC_ROLES` — `'diagnosticEducatif'` et `'reactualisation'` existent. Le tri des `hoursBySoignant` à égalité par nom rend le test « une fois par soignant » déterministe.

- [ ] **Step 4: Faire passer**

Run: la commande du Step 2.
Expected: PASS. Puis `cd back && npx biome check --write src/main/utils/activity-indicators.ts src/test/unit/utils/activity-indicators.test.ts && npx tsc --noEmit -p .` sans erreur. Si Biome signale une complexité excessive sur `computeActivity`, extraire `absences(pointed)` et `hoursBySoignant(honored)` en fonctions du module (pas de `biome-ignore`).

- [ ] **Step 5: Commit**

```bash
git add back/src/main/utils/activity-indicators.ts back/src/test/unit/utils/activity-indicators.test.ts
git commit -m "feat(activite): calcul du rapport d'activite du service (MDS-40)"
```

---

### Task 4: Route `GET /activite`

**Files:**
- Create: `back/src/main/types/domain/activityReport.domain.interface.ts`
- Create: `back/src/main/domain/activityReport.domain.ts`
- Create: `back/src/main/interfaces/http/fastify/schemas/activityReport.schema.ts`
- Create: `back/src/main/interfaces/http/fastify/routes/activityReport.ts`
- Modify: `back/src/main/types/application/ioc.ts:86-88`, `back/src/main/application/ioc/awilix/awilix-ioc-container.ts:143-145,245-253`, `back/src/main/interfaces/http/fastify/routes/tenant.routes.ts:15,197-199`
- Test: `back/src/test/e2e/activite.test.ts` (nouveau), `back/src/test/e2e/permissions.test.ts` (sonde)

**Interfaces:**
- Consumes: `computeActivity`, `ActivityReport` (Task 3), `ArsIndicatorRepositoryInterface.findCohort` (Task 2), `arsIndicatorQuerySchema`.
- Produces: `GET {tenant}/activite?from=YYYY-MM-DD&to=YYYY-MM-DD` → `{ from: string; to: string } & ActivityReport` ; 400 si `from > to` ; 403 sans `activity:read`.

- [ ] **Step 1: Écrire l'e2e**

`back/src/test/e2e/activite.test.ts` :

```ts
import { buildTestApp, type TestApp } from './setup/app'
import { testDb, truncateAll } from './setup/db'
import {
  createEstablishment,
  createService,
  createUser,
  signIn,
  tenantUrl,
} from './setup/fixtures'

describe('tableau de bord d activite', () => {
  let t: TestApp
  let establishmentId: string
  let serviceA: string
  let serviceB: string
  let cookies: { access_token: string }

  beforeAll(async () => {
    t = await buildTestApp()
    await truncateAll()
    const est = await createEstablishment()
    establishmentId = est.id
    serviceA = (await createService(est.id, 'Service A')).id
    serviceB = (await createService(est.id, 'Service B')).id
    await createUser({
      email: 'direction@test.fr',
      memberships: [
        {
          establishmentId,
          services: [
            { serviceId: serviceA, role: 'LECTURE' },
            { serviceId: serviceB, role: 'LECTURE' },
          ],
        },
      ],
    })
    cookies = await signIn(t.app, 'direction@test.fr')
  })

  afterAll(async () => {
    await t.close()
    await testDb.$disconnect()
  })

  const lire = (serviceId: string, periode = 'from=2026-01-01&to=2026-12-31') =>
    t.app.inject({
      method: 'GET',
      url: tenantUrl(establishmentId, serviceId, `/activite?${periode}`),
      cookies,
    })

  const seance = async (serviceId: string, patientId: string, status: 'yes' | 'no') => {
    const soignant = await testDb.soignant.create({
      data: { name: 'IDE', serviceId, establishmentId },
    })
    const template = await testDb.slotTemplate.create({
      data: {
        startTime: new Date(),
        endTime: new Date(),
        offsetDays: 0,
        isIndividual: true,
        color: '#fff',
        serviceId,
        establishmentId,
        soignantLinks: { create: { soignantId: soignant.id, establishmentId } },
      },
    })
    const slot = await testDb.slot.create({
      data: {
        startDate: new Date('2026-06-01T09:00:00Z'),
        endDate: new Date('2026-06-01T10:30:00Z'),
        serviceId,
        establishmentId,
        slotTemplateID: template.id,
      },
    })
    const appointment = await testDb.appointment.create({
      data: {
        startDate: slot.startDate,
        endDate: slot.endDate,
        type: 'ambulatory',
        serviceId,
        establishmentId,
        slotID: slot.id,
      },
    })
    await testDb.appointmentPatient.create({
      data: { appointmentId: appointment.id, patientId, serviceId, establishmentId, status },
    })
  }

  it('ouvre l ecran a la lecture et isole les services', async () => {
    const patient = await testDb.patient.create({
      data: { establishmentId, firstName: 'Nominatif', lastName: 'Interdit', createDate: new Date() },
    })
    await seance(serviceA, patient.id, 'yes')
    await seance(serviceB, patient.id, 'no')

    const a = await lire(serviceA)
    expect(a.statusCode).toBe(200)
    expect(a.json().patients.active).toBe(1)
    expect(a.json().absences.overall).toMatchObject({ absent: 0, pointed: 1 })
    expect(a.json().hoursBySoignant).toEqual([{ soignant: 'IDE', hours: 1.5 }])

    const b = await lire(serviceB)
    expect(b.json().patients.active).toBe(0)
    expect(b.json().absences.overall).toMatchObject({ absent: 1, pointed: 1 })
  })

  // L'exigence centrale : la reponse, seule source du CSV, ne porte aucun nom ni identifiant.
  it('ne laisse passer aucun nom ni identifiant de patient', async () => {
    const res = await lire(serviceA)
    const patient = await testDb.patient.findFirstOrThrow({ where: { lastName: 'Interdit' } })
    const corps = res.body
    expect(['Nominatif', 'Interdit', patient.id].filter((terme) => corps.includes(terme))).toEqual([])
  })

  it('refuse une periode dont la fin precede le debut', async () => {
    const res = await lire(serviceA, 'from=2026-12-31&to=2026-01-01')
    expect(res.statusCode).toBe(400)
  })
})
```

Dans `back/src/test/e2e/permissions.test.ts`, ajouter à `probes`, après les sondes `stats:read` :

```ts
  {
    permission: 'activity:read',
    method: 'GET',
    path: '/activite?from=2026-01-01&to=2026-12-31',
    heldStatus: 200,
  },
```

(La boucle des rôles rend 403 à `INTERVENANT` et `SECRETARIAT`, 200 à `COORDINATEUR` et `LECTURE` — Review Focus 5, côté API.)

- [ ] **Step 2: Vérifier l'échec**

Run: `cd back && NODE_OPTIONS=--experimental-vm-modules npm run with:dotenv -- -e .env.test.local -e .env.test -- jest --runInBand -c src/test/jest.config.ts src/test/e2e/activite.test.ts`
Expected: FAIL (404 sur `/activite`)

- [ ] **Step 3: Domaine, schéma, route, câblage**

`types/domain/activityReport.domain.interface.ts` :

```ts
import type { ActivityReport } from '../../utils/activity-indicators'
import type { ArsRange } from './arsIndicator.domain.interface'

export interface ActivityReportDomainInterface {
  report: (range: ArsRange) => Promise<ActivityReport>
}
```

`domain/activityReport.domain.ts` :

```ts
import type { IocContainer } from '../types/application/ioc'
import type { ActivityReportDomainInterface } from '../types/domain/activityReport.domain.interface'
import type { ArsRange } from '../types/domain/arsIndicator.domain.interface'
import type { ArsIndicatorRepositoryInterface } from '../types/infra/orm/repositories/arsIndicator.repository.interface'
import { type ActivityReport, computeActivity } from '../utils/activity-indicators'

// Même cohorte que l'ARS : les deux écrans partagent leurs définitions (MDS-40).
class ActivityReportDomain implements ActivityReportDomainInterface {
  private readonly arsIndicatorRepository: ArsIndicatorRepositoryInterface

  constructor({ arsIndicatorRepository }: IocContainer) {
    this.arsIndicatorRepository = arsIndicatorRepository
  }

  async report({ from, to }: ArsRange): Promise<ActivityReport> {
    const { files, presences } = await this.arsIndicatorRepository.findCohort()
    return computeActivity({ from, to, files, presences })
  }
}

export { ActivityReportDomain }
```

`schemas/activityReport.schema.ts` :

```ts
import { z } from 'zod'

const cell = z.object({
  absent: z.number(),
  pointed: z.number(),
  rate: z.number().nullable(),
})

export const activityReportResponseSchema = z.object({
  from: z.string(),
  to: z.string(),
  patients: z.object({ active: z.number(), newlyIncluded: z.number(), exited: z.number() }),
  completion: z.object({
    completed: z.number(),
    exited: z.number(),
    rate: z.number().nullable(),
    dropouts: z.number(),
    dropoutReasons: z.array(z.object({ reason: z.string(), count: z.number() })),
  }),
  absences: z.object({
    overall: cell,
    worst: z.object({ thematic: z.string(), weekday: z.number() }).nullable(),
    weekdays: z.array(z.number()),
    byThematic: z.array(z.object({ thematic: z.string(), total: cell, cells: z.array(cell) })),
    byPathway: z.array(z.object({ pathway: z.string(), cell })),
  }),
  sessions: z.object({
    individual: z.number(),
    collective: z.number(),
    educationalDiagnoses: z.number(),
    finalReviews: z.number(),
  }),
  hoursBySoignant: z.array(z.object({ soignant: z.string(), hours: z.number() })),
})
```

`routes/activityReport.ts` :

```ts
import type { FastifyPluginAsync } from 'fastify'

import { activityReportResponseSchema } from '../schemas/activityReport.schema'
import { type ArsIndicatorQuery, arsIndicatorQuerySchema } from '../schemas/arsIndicator.schema'

// Tableau de bord d'activité du service courant : chiffres agrégés, aucune donnée nominative (MDS-40).
const activityReportRouter: FastifyPluginAsync = (fastify) => {
  const { activityReportDomain } = fastify.iocContainer

  fastify.get<{ Querystring: ArsIndicatorQuery }>(
    '/',
    {
      schema: {
        querystring: arsIndicatorQuerySchema,
        response: { 200: activityReportResponseSchema },
      },
      config: { permission: 'activity:read' },
    },
    async (request) => {
      const { from, to } = request.query
      return {
        from: from.toISOString().slice(0, 10),
        to: to.toISOString().slice(0, 10),
        ...(await activityReportDomain.report({ from, to })),
      }
    },
  )

  return Promise.resolve()
}

export { activityReportRouter }
```

Câblage :
- `types/application/ioc.ts`, après le bloc ArsIndicator : `// ActivityReport (tableau de bord d'activité)` puis `readonly activityReportDomain: ActivityReportDomainInterface`, avec l'import correspondant.
- `awilix-ioc-container.ts` : importer `ActivityReportDomain`, appeler `this.#registerActivityReportDomain()` après `#registerArsIndicatorRepository()` (l. 145), et définir à côté de `#registerArsIndicatorRepository` :

```ts
  #registerActivityReportDomain(): void {
    this.register('activityReportDomain', asClass(ActivityReportDomain).singleton())
  }
```

- `tenant.routes.ts` : `import { activityReportRouter } from './activityReport'` et, après l'enregistrement `arsIndicatorRouter` : `await fastify.register(activityReportRouter, { prefix: '/activite' })`.

- [ ] **Step 4: Faire passer**

Run: `cd back && npx biome check --write src/main && npx tsc --noEmit -p . && NODE_OPTIONS=--experimental-vm-modules npm run with:dotenv -- -e .env.test.local -e .env.test -- jest --runInBand -c src/test/jest.config.ts src/test/e2e/activite.test.ts src/test/e2e/permissions.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add back/src
git commit -m "feat(activite): route GET /activite, lisible par le coordinateur et la lecture (MDS-40)"
```

---

### Task 5: Données front et sélecteur de période partagé

**Files:**
- Create: `front/src/types/activity.ts`, `front/src/api/activity.api.ts`, `front/src/queries/useActivity.ts`
- Create: `front/src/components/custom/periodPicker.tsx`
- Modify: `front/src/constants/process.constant.ts:219-221` (clé de requête)
- Modify: `front/src/routes/_authenticated/e/$establishmentId/s/$serviceId/indicateurs-ars.tsx` (utilise `PeriodPicker`)
- Test: `.../indicateurs-ars.test.tsx` (existant, doit rester vert)

**Interfaces:**
- Produces:
  - `type ActivityReport` (même forme que la réponse back, `from`/`to` compris) et `type AbsenceCell` dans `types/activity.ts`
  - `ActivityApi.get(from: string, to: string): Promise<ActivityReport>`
  - `useActivityQuery(from: string, to: string): { report: ActivityReport | undefined; isPending: boolean; error: unknown }`
  - `type Periode = { from: Dayjs; to: Dayjs }`, `anneeCivile(annee: number): Periode`, `PERIOD_FORMAT = 'YYYY-MM-DD'`, `<PeriodPicker periode={Periode} onChange={(p: Periode) => void} />` dans `components/custom/periodPicker.tsx`

- [ ] **Step 1: Types, API, requête**

`types/activity.ts` :

```ts
export type AbsenceCell = { absent: number; pointed: number; rate: number | null }

export type ActivityReport = {
  from: string
  to: string
  patients: { active: number; newlyIncluded: number; exited: number }
  completion: {
    completed: number
    exited: number
    rate: number | null
    dropouts: number
    dropoutReasons: { reason: string; count: number }[]
  }
  absences: {
    overall: AbsenceCell
    worst: { thematic: string; weekday: number } | null
    weekdays: number[]
    byThematic: { thematic: string; total: AbsenceCell; cells: AbsenceCell[] }[]
    byPathway: { pathway: string; cell: AbsenceCell }[]
  }
  sessions: {
    individual: number
    collective: number
    educationalDiagnoses: number
    finalReviews: number
  }
  hoursBySoignant: { soignant: string; hours: number }[]
}
```

`api/activity.api.ts` :

```ts
import { tenantApiUrl } from '@/constants/config.constant.ts'
import { handleHttpError } from '@/libs/httpErrorHandler.ts'
import type { ActivityReport } from '@/types/activity.ts'
import { fetchWithAuth } from './fetchWithAuth.ts'

export const ActivityApi = {
  get: async (from: string, to: string): Promise<ActivityReport> => {
    const response = await fetchWithAuth(`${tenantApiUrl()}/activite?from=${from}&to=${to}`)
    if (!response.ok) {
      handleHttpError(response, {}, "Impossible de charger l'activité du service")
    }
    return await response.json()
  },
}
```

`constants/process.constant.ts`, après `ARS_INDICATOR` :

```ts
export const ACTIVITY = {
  GET: 'get_activity',
}
```

`queries/useActivity.ts` :

```ts
import { useQuery } from '@tanstack/react-query'

import { ActivityApi } from '../api/activity.api.ts'
import { ACTIVITY } from '../constants/process.constant.ts'

export const useActivityQuery = (from: string, to: string) => {
  const { data, isPending, error } = useQuery({
    queryKey: [ACTIVITY.GET, from, to],
    queryFn: () => ActivityApi.get(from, to),
    retry: 0,
  })
  return { report: data, isPending, error }
}
```

- [ ] **Step 2: Extraire `PeriodPicker`**

`components/custom/periodPicker.tsx` — le bloc `ToggleGroup` + deux `DatePicker` d'`indicateurs-ars.tsx`, à l'identique :

```tsx
import dayjs, { type Dayjs } from 'dayjs'
import utc from 'dayjs/plugin/utc'

import { DatePicker } from '@/components/ui/datePicker.tsx'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group.tsx'

dayjs.extend(utc)

export type Periode = { from: Dayjs; to: Dayjs }

export const PERIOD_FORMAT = 'YYYY-MM-DD'

export const anneeCivile = (annee: number): Periode => ({
  from: dayjs.utc(`${annee}-01-01`),
  to: dayjs.utc(`${annee}-12-31`),
})

export const ANNEES = [0, 1, 2].map((recul) => dayjs.utc().year() - recul)

// Raccourcis d'année civile et plage libre : un segment n'est actif que si la période tombe pile sur lui.
export function PeriodPicker({
  periode,
  onChange,
}: {
  periode: Periode
  onChange: (periode: Periode) => void
}) {
  const anneeActive = ANNEES.find((annee) => {
    const civile = anneeCivile(annee)
    return periode.from.isSame(civile.from, 'day') && periode.to.isSame(civile.to, 'day')
  })

  const deplacerBorne = (borne: 'from' | 'to') => (valeur: Dayjs | null) => {
    if (valeur?.isValid()) {
      onChange({ ...periode, [borne]: valeur })
    }
  }

  return (
    <>
      <ToggleGroup
        value={anneeActive ? String(anneeActive) : ''}
        onValueChange={(valeur) => valeur && onChange(anneeCivile(Number(valeur)))}
      >
        {ANNEES.map((annee) => (
          <ToggleGroupItem key={annee} value={String(annee)}>
            {annee}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      <div className="flex items-center gap-2 text-sm text-text-light">
        <span>du</span>
        <DatePicker
          value={periode.from}
          onChange={deplacerBorne('from')}
          className="w-40"
          format="DD/MM/YYYY"
          maxDate={periode.to}
        />
        <span>au</span>
        <DatePicker
          value={periode.to}
          onChange={deplacerBorne('to')}
          className="w-40"
          format="DD/MM/YYYY"
          minDate={periode.from}
        />
      </div>
    </>
  )
}
```

Dans `indicateurs-ars.tsx` : supprimer `FORMAT`, `anneeCivile`, `ANNEES`, `anneeActive`, `deplacerBorne`, les imports `DatePicker`/`ToggleGroup`/`Dayjs` devenus inutiles ; importer `{ ANNEES, anneeCivile, PERIOD_FORMAT, PeriodPicker }` ; remplacer `FORMAT` par `PERIOD_FORMAT` ; remplacer le `ToggleGroup` et le `div` des deux `DatePicker` par `<PeriodPicker periode={periode} onChange={setPeriode} />`.

- [ ] **Step 3: Vérifier que l'écran ARS n'a pas bougé**

Run: `cd front && npx biome check --write src && npx tsc -b && npx vitest run src/routes/_authenticated/e/\$establishmentId/s/\$serviceId/indicateurs-ars.test.tsx`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add front/src
git commit -m "refactor(ars): selecteur de periode partage ; acces front au rapport d'activite (MDS-40)"
```

---

### Task 6: L'écran « Activité », son export CSV et son onglet

**Files:**
- Create: `front/src/constants/activity.constant.ts`
- Create: `front/src/libs/activityCsv.ts`, test `front/src/libs/activityCsv.test.ts`
- Create: `front/src/routes/_authenticated/e/$establishmentId/s/$serviceId/activite.tsx`, test `activite.test.tsx` à côté
- Modify: `front/src/navigation/navigation.ts` (après l'entrée « Suivi »)
- Modify: `front/src/routeTree.gen.ts` (régénéré)

**Interfaces:**
- Consumes: `ActivityReport`, `AbsenceCell`, `useActivityQuery`, `PeriodPicker`, `anneeCivile`, `ANNEES`, `PERIOD_FORMAT` (Task 5) ; `STOP_REASON` (`constants/patient.constant.ts:94`) ; `queryState` ; `can`.
- Produces: `ACTIVITY_DEFINITIONS: { label: string; definition: string }[]`, `JOURS: string[]`, `activityCsv(report: ActivityReport): string`, `pourcent(rate: number | null): string`.

- [ ] **Step 1: Définitions et CSV, test d'abord**

`libs/activityCsv.test.ts` :

```ts
import { describe, expect, it } from 'vitest'

import type { ActivityReport } from '../types/activity.ts'
import { activityCsv, pourcent } from './activityCsv.ts'

const vide = { absent: 0, pointed: 0, rate: null }

const rapport: ActivityReport = {
  from: '2026-01-01',
  to: '2026-12-31',
  patients: { active: 148, newlyIncluded: 57, exited: 42 },
  completion: {
    completed: 31,
    exited: 42,
    rate: 31 / 42,
    dropouts: 11,
    dropoutReasons: [{ reason: 'PERDU_DE_VUE', count: 5 }],
  },
  absences: {
    overall: { absent: 12, pointed: 100, rate: 0.12 },
    worst: { thematic: 'Coaching; PRM', weekday: 1 },
    weekdays: [1],
    byThematic: [
      {
        thematic: 'Coaching; PRM',
        total: { absent: 4, pointed: 10, rate: 0.4 },
        cells: [vide, { absent: 4, pointed: 10, rate: 0.4 }, vide, vide, vide, vide, vide],
      },
    ],
    byPathway: [],
  },
  sessions: { individual: 312, collective: 96, educationalDiagnoses: 41, finalReviews: 28 },
  hoursBySoignant: [{ soignant: 'IDE', hours: 120.5 }],
}

describe('activityCsv', () => {
  it('commence par le BOM et l en-tete, separe par des points-virgules', () => {
    const csv = activityCsv(rapport)
    expect(csv.startsWith('﻿section;libellé;valeur;définition\r\n')).toBe(true)
  })

  it('ecrit les motifs par leur libelle et les nombres decimaux a la francaise', () => {
    const csv = activityCsv(rapport)
    expect(csv).toContain('Motifs d\'arrêt;Perdu de vue;5;')
    expect(csv).toContain('Heures soignant;IDE;120,5;')
  })

  it('protege un libelle qui contient le separateur', () => {
    expect(activityCsv(rapport)).toContain('"Coaching; PRM — mardi"')
  })

  it('formate un taux absent en tiret', () => {
    expect(pourcent(null)).toBe('—')
    expect(pourcent(0.738)).toBe('74 %')
  })
})
```

`constants/activity.constant.ts` :

```ts
export const JOURS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche']

// Les mêmes phrases à l'écran et dans le CSV : la spec MDS-40 §3 en est la source.
export const ACTIVITY_DEFINITIONS = [
  { label: 'File active', definition: 'Patients distincts ayant au moins une présence dans la période.' },
  { label: 'Nouveaux inclus', definition: 'Dossiers dont le diagnostic éducatif tombe dans la période (même règle que l\'enquête ARS).' },
  { label: 'Sortis', definition: 'Dossiers dont la date de sortie tombe dans la période.' },
  { label: 'Ont terminé', definition: 'Sortis dont le programme est complet : un diagnostic éducatif, au moins une séance, au moins une réactualisation, depuis l\'entrée.' },
  { label: 'Abandons', definition: 'Sortis avec un motif d\'arrêt autre que « Plus de besoin / Fin de parcours ».' },
  { label: 'Absentéisme', definition: 'Absents divisés par les rendez-vous pointés (présents et absents) ; les rendez-vous non pointés sont exclus. Moins de 5 rendez-vous pointés : pas de taux.' },
  { label: 'Séances individuelles', definition: 'Présences sur un créneau individuel.' },
  { label: 'Séances collectives', definition: 'Créneaux collectifs ayant eu au moins un présent.' },
  { label: 'Heures soignant', definition: 'Durée de chaque créneau réalisé, comptée une fois pour chaque métier affecté au créneau.' },
  { label: 'Bilans de fin', definition: 'Présences à une réactualisation : approximation, il n\'existe pas de bilan de fin dédié.' },
  { label: 'Délai adressage → entrée', definition: 'Non calculé : MediSync n\'enregistre ni liste d\'attente ni date d\'adressage.' },
]
```

`libs/activityCsv.ts` :

```ts
import { ACTIVITY_DEFINITIONS, JOURS } from '../constants/activity.constant.ts'
import { STOP_REASON } from '../constants/patient.constant.ts'
import type { ActivityReport } from '../types/activity.ts'

export const pourcent = (rate: number | null): string =>
  rate === null ? '—' : `${Math.round(rate * 100)} %`

const nombre = (n: number): string => String(n).replace('.', ',')

const champ = (v: string): string => (/[;"\r\n]/.test(v) ? `"${v.replaceAll('"', '""')}"` : v)

const definition = (label: string): string =>
  ACTIVITY_DEFINITIONS.find((d) => d.label === label)?.definition ?? ''

// BOM et point-virgule : Excel en français ouvre le fichier sans assistant d'import.
export const activityCsv = (r: ActivityReport): string => {
  const lignes: string[][] = [
    ['section', 'libellé', 'valeur', 'définition'],
    ['Période', `${r.from} au ${r.to}`, '', ''],
    ['Patients', 'File active', nombre(r.patients.active), definition('File active')],
    ['Patients', 'Nouveaux inclus', nombre(r.patients.newlyIncluded), definition('Nouveaux inclus')],
    ['Patients', 'Sortis', nombre(r.patients.exited), definition('Sortis')],
    ['Parcours', 'Ont terminé', nombre(r.completion.completed), definition('Ont terminé')],
    ['Parcours', 'Taux de complétion', pourcent(r.completion.rate), ''],
    ['Parcours', 'Abandons', nombre(r.completion.dropouts), definition('Abandons')],
    ...r.completion.dropoutReasons.map((m) => [
      "Motifs d'arrêt",
      STOP_REASON[m.reason as keyof typeof STOP_REASON] ?? m.reason,
      nombre(m.count),
      '',
    ]),
    ['Absences', 'Ensemble', pourcent(r.absences.overall.rate), definition('Absentéisme')],
    ...r.absences.byThematic.flatMap((t) => [
      ['Absences par thématique', t.thematic, pourcent(t.total.rate), `${t.total.absent} sur ${t.total.pointed}`],
      ...t.cells.flatMap((c, d) =>
        c.pointed > 0
          ? [['Absences par thématique et jour', `${t.thematic} — ${JOURS[d]}`, pourcent(c.rate), `${c.absent} sur ${c.pointed}`]]
          : [],
      ),
    ]),
    ...r.absences.byPathway.map((p) => [
      'Absences par parcours',
      p.pathway,
      pourcent(p.cell.rate),
      `${p.cell.absent} sur ${p.cell.pointed}`,
    ]),
    ['Séances', 'Individuelles', nombre(r.sessions.individual), definition('Séances individuelles')],
    ['Séances', 'Collectives', nombre(r.sessions.collective), definition('Séances collectives')],
    ['Séances', 'Diagnostics éducatifs', nombre(r.sessions.educationalDiagnoses), ''],
    ['Séances', 'Bilans de fin', nombre(r.sessions.finalReviews), definition('Bilans de fin')],
    ...r.hoursBySoignant.map((h) => ['Heures soignant', h.soignant, nombre(h.hours), definition('Heures soignant')]),
  ]
  return `﻿${lignes.map((l) => l.map(champ).join(';')).join('\r\n')}\r\n`
}
```

Run: `cd front && npx vitest run src/libs/activityCsv.test.ts`
Expected: PASS (après création des deux fichiers ; lancer d'abord avec le test seul pour constater l'échec « Failed to resolve import »).

- [ ] **Step 2: Test de l'écran**

`activite.test.tsx` reprend le harnais d'`indicateurs-ars.test.tsx` (lignes 1-150) en remplaçant : l'import `arsRoute` par `import { Route as activiteRoute } from './activite.tsx'` ; la route `arsScreenRoute` par une route `path: 'activite'` avec `beforeLoad: optionsDe(activiteRoute).beforeLoad, component: optionsDe(activiteRoute).component` ; le filtre `url.includes('/indicateurs-ars')` par `url.includes('/activite')` ; l'entrée d'historique par `'/e/e1/s/s1/activite'` ; `avecRole` accepte `'COORDINATEUR' | 'INTERVENANT' | 'LECTURE'`, et `const lecture = avecRole('u3', 'LECTURE')` s'ajoute à `coordinateur` et `intervenant`. Le rapport de test est celui de `activityCsv.test.ts` (recopié). Les cas :

```tsx
describe('ecran d activite', () => {
  it('repond aux trois questions du critere de fin', async () => {
    monter({ ok: true, status: 200, corps: rapport }, lecture)
    expect(await screen.findByText('148')).toBeInTheDocument()
    expect(screen.getByText(/31 sur 42 sortis/)).toBeInTheDocument()
    expect(screen.getByText('12 %')).toBeInTheDocument()
    expect(screen.getByText(/Coaching; PRM, le mardi/)).toBeInTheDocument()
  })

  it('annonce une erreur plutot que des chiffres muets', async () => {
    monter({ ok: false, status: 500 })
    expect(await screen.findByRole('alert')).toHaveTextContent(/Impossible de charger l'activité/)
    expect(screen.getByRole('button', { name: 'Exporter en CSV' })).toBeDisabled()
  })

  it('invite a changer de periode quand rien ne s est passe', async () => {
    const calme = {
      ...rapport,
      patients: { active: 0, newlyIncluded: 0, exited: 0 },
      completion: { completed: 0, exited: 0, rate: null, dropouts: 0, dropoutReasons: [] },
      absences: { overall: { absent: 0, pointed: 0, rate: null }, worst: null, weekdays: [], byThematic: [], byPathway: [] },
      sessions: { individual: 0, collective: 0, educationalDiagnoses: 0, finalReviews: 0 },
      hoursBySoignant: [],
    }
    monter({ ok: true, status: 200, corps: calme })
    expect(await screen.findByText(/Aucune activité sur cette période/)).toBeInTheDocument()
  })

  // Review Focus 5, côté écran.
  it('renvoie un intervenant au tableau de bord', async () => {
    monter({ ok: true, status: 200, corps: rapport }, intervenant)
    expect(await screen.findByText('Tableau de bord')).toBeInTheDocument()
  })
})
```

Run: `cd front && npx vitest run src/routes/_authenticated/e/\$establishmentId/s/\$serviceId/activite.test.tsx`
Expected: FAIL (module `./activite.tsx` introuvable)

- [ ] **Step 3: L'écran**

`activite.tsx` :

```tsx
import { createFileRoute, redirect } from '@tanstack/react-router'
import { type ReactNode, useState } from 'react'

import { ANNEES, anneeCivile, PERIOD_FORMAT, PeriodPicker } from '@/components/custom/periodPicker.tsx'
import DashboardLayout from '@/components/dashboard.layout.tsx'
import { Button } from '@/components/ui/button.tsx'
import { ACTIVITY_DEFINITIONS, JOURS } from '@/constants/activity.constant.ts'
import { STOP_REASON } from '@/constants/patient.constant.ts'
import { can } from '@/hooks/useCan.ts'
import { activityCsv, pourcent } from '@/libs/activityCsv.ts'
import { queryState } from '@/libs/queryState.ts'
import { useActivityQuery } from '@/queries/useActivity.ts'
import type { AbsenceCell, ActivityReport } from '@/types/activity.ts'
import { resolveTenantContext } from '@/utils/tenant-context.ts'

// Tableau de bord d'activité du service, en chiffres agrégés (MDS-40).
export const Route = createFileRoute('/_authenticated/e/$establishmentId/s/$serviceId/activite')({
  beforeLoad: ({ context, params }) => {
    const tenant = resolveTenantContext(context.authState.user, params)
    if (!can(tenant, 'activity:read')) {
      throw redirect({ to: '/e/$establishmentId/s/$serviceId/dashboard', params })
    }
  },
  component: ActivitePage,
})

const estVide = (r: ActivityReport) =>
  r.patients.active === 0 &&
  r.patients.newlyIncluded === 0 &&
  r.patients.exited === 0 &&
  r.absences.overall.pointed === 0

function ActivitePage() {
  const [periode, setPeriode] = useState(() => anneeCivile(ANNEES[0]))
  const from = periode.from.format(PERIOD_FORMAT)
  const to = periode.to.format(PERIOD_FORMAT)
  const { report, isPending, error } = useActivityQuery(from, to)
  const etat = queryState({ isPending, error, hasData: report !== undefined })

  const exporter = () => {
    if (!report) {
      return
    }
    const href = URL.createObjectURL(new Blob([activityCsv(report)], { type: 'text/csv;charset=utf-8' }))
    const lien = document.createElement('a')
    lien.href = href
    lien.download = `activite_${from}_${to}.csv`
    lien.click()
    URL.revokeObjectURL(href)
  }

  return (
    <DashboardLayout>
      <div className="flex-1 min-h-0 bg-background p-4 md:p-6 rounded-lg flex flex-col w-full gap-6 overflow-auto">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h1 className="h-9 flex items-center text-text-dark text-xl font-semibold">Activité</h1>
          <div className="flex items-center gap-3 flex-wrap">
            <PeriodPicker periode={periode} onChange={setPeriode} />
            <Button onClick={exporter} disabled={etat !== 'ready'}>
              Exporter en CSV
            </Button>
          </div>
        </div>

        {etat === 'pending' && <p className="text-text-light">Chargement...</p>}
        {(etat === 'error' || etat === 'empty') && (
          <p role="alert" className="text-text-light">
            Impossible de charger l'activité du service. Réessayez plus tard.
          </p>
        )}
        {etat === 'ready' && report && estVide(report) && (
          <p className="text-text-light">
            Aucune activité sur cette période. Choisissez une autre année ou élargissez la plage.
          </p>
        )}
        {etat === 'ready' && report && !estVide(report) && <Rapport r={report} />}
      </div>
    </DashboardLayout>
  )
}

function Rapport({ r }: { r: ActivityReport }) {
  const pire = r.absences.worst
  return (
    <>
      <section aria-label="Réponses" className="grid gap-4 md:grid-cols-3">
        <Reponse question="Combien de patients" chiffre={String(r.patients.active)} unite="en file active">
          {r.patients.newlyIncluded} nouveaux inclus, {r.patients.exited} sortis
        </Reponse>
        <Reponse
          question="Combien ont terminé"
          chiffre={pourcent(r.completion.rate)}
          unite={`${r.completion.completed} sur ${r.completion.exited} sortis`}
        >
          {r.completion.dropouts} abandons
        </Reponse>
        <Reponse question="Où sont les absences" chiffre={pourcent(r.absences.overall.rate)} unite="des rendez-vous pointés">
          {pire ? `Le plus : ${pire.thematic}, le ${JOURS[pire.weekday]}` : 'Trop peu de rendez-vous pointés pour situer un pic'}
        </Reponse>
      </section>

      <CarteAbsences r={r} />

      <div className="grid gap-6 md:grid-cols-2">
        <Barres
          titre="Motifs d'arrêt"
          lignes={r.completion.dropoutReasons.map((m) => ({
            libelle: STOP_REASON[m.reason as keyof typeof STOP_REASON] ?? m.reason,
            valeur: m.count,
            texte: String(m.count),
          }))}
          vide="Aucun abandon sur la période."
        />
        <section className="flex flex-col gap-3">
          <h2 className="text-text-dark font-semibold">Séances et temps soignant</h2>
          <p className="text-sm text-text-dark tabular-nums">
            {r.sessions.individual} séances individuelles, {r.sessions.collective} collectives.{' '}
            {r.sessions.educationalDiagnoses} diagnostics éducatifs, {r.sessions.finalReviews} bilans de fin.
          </p>
          <Barres
            titre="Heures par métier"
            lignes={r.hoursBySoignant.map((h) => ({
              libelle: h.soignant,
              valeur: h.hours,
              texte: `${String(Math.round(h.hours * 10) / 10).replace('.', ',')} h`,
            }))}
            vide="Aucun créneau réalisé avec un soignant affecté."
          />
        </section>
      </div>

      <details className="text-sm">
        <summary className="cursor-pointer text-text-dark font-medium">Définitions</summary>
        <dl className="mt-3 grid gap-2 max-w-prose">
          {ACTIVITY_DEFINITIONS.map((d) => (
            <div key={d.label}>
              <dt className="font-medium text-text-dark">{d.label}</dt>
              <dd className="text-text-light">{d.definition}</dd>
            </div>
          ))}
        </dl>
      </details>
    </>
  )
}

function Reponse({
  question,
  chiffre,
  unite,
  children,
}: {
  question: string
  chiffre: string
  unite: string
  children: ReactNode
}) {
  return (
    <div className="flex flex-col gap-1 border-l-2 border-primary pl-4">
      <h2 className="text-sm text-text-light">{question}</h2>
      <p className="text-text-dark">
        <span className="text-4xl font-semibold tabular-nums">{chiffre}</span>{' '}
        <span className="text-sm">{unite}</span>
      </p>
      <p className="text-sm text-text-light">{children}</p>
    </div>
  )
}

// La teinte suit le taux ; le pourcentage reste écrit, la couleur n'est jamais seule.
const teinte = (c: AbsenceCell) =>
  c.rate === null ? undefined : { backgroundColor: `color-mix(in oklab, var(--color-destructive) ${Math.round(c.rate * 70)}%, transparent)` }

function Case({ c }: { c: AbsenceCell }) {
  if (c.pointed === 0) {
    return <span className="text-text-light">·</span>
  }
  return c.rate === null ? (
    <span className="text-text-light" title={`${c.pointed} rendez-vous pointés : trop peu pour un taux`}>
      {c.pointed} rdv
    </span>
  ) : (
    <span title={`${c.absent} absents sur ${c.pointed} pointés`}>{pourcent(c.rate)}</span>
  )
}

function CarteAbsences({ r }: { r: ActivityReport }) {
  const jours = r.absences.weekdays
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-text-dark font-semibold">Carte des absences</h2>
      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-max min-w-full text-sm border-separate border-spacing-0">
          <thead>
            <tr className="text-text-light">
              <th className="sticky left-0 bg-background text-left font-normal px-3 py-2">Thématique</th>
              {jours.map((d) => (
                <th key={d} className="font-normal px-3 py-2 capitalize">{JOURS[d]}</th>
              ))}
              <th className="font-normal px-3 py-2">Total</th>
            </tr>
          </thead>
          <tbody>
            {r.absences.byThematic.map((t) => (
              <tr key={t.thematic} className="border-t border-border">
                <th scope="row" className="sticky left-0 bg-background text-left font-normal text-text-dark px-3 py-2 whitespace-nowrap">
                  {t.thematic}
                </th>
                {jours.map((d) => (
                  <td key={d} className="px-3 py-2 text-center tabular-nums" style={teinte(t.cells[d])}>
                    <Case c={t.cells[d]} />
                  </td>
                ))}
                <td className="px-3 py-2 text-center tabular-nums font-medium">
                  <Case c={t.total} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Barres
        titre="Par parcours"
        lignes={r.absences.byPathway.map((p) => ({
          libelle: p.pathway,
          valeur: p.cell.rate ?? 0,
          texte: p.cell.rate === null ? `${p.cell.pointed} rdv` : pourcent(p.cell.rate),
        }))}
        vide="Aucun rendez-vous pointé."
      />
    </section>
  )
}

function Barres({
  titre,
  lignes,
  vide,
}: {
  titre: string
  lignes: { libelle: string; valeur: number; texte: string }[]
  vide: string
}) {
  const max = Math.max(...lignes.map((l) => l.valeur), 0)
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-sm font-medium text-text-dark">{titre}</h3>
      {lignes.length === 0 ? (
        <p className="text-sm text-text-light">{vide}</p>
      ) : (
        <ul className="flex flex-col gap-1.5 text-sm">
          {lignes.map((l) => (
            <li key={l.libelle} className="grid grid-cols-[minmax(0,12rem)_1fr_auto] items-center gap-3">
              <span className="truncate text-text-dark" title={l.libelle}>{l.libelle}</span>
              <span className="h-2 rounded-sm bg-muted">
                <span
                  className="block h-full rounded-sm bg-primary"
                  style={{ width: max > 0 ? `${(l.valeur / max) * 100}%` : 0 }}
                />
              </span>
              <span className="tabular-nums text-text-light">{l.texte}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
```

Vérifier que le token `--color-destructive` existe dans `front/src/styles/_globals.css` (`@theme`) ; sinon utiliser le token rouge qui y est déclaré (grep `destructive`), jamais une couleur en dur.

- [ ] **Step 4: Onglet et arbre des routes**

Dans `navigation.ts`, après l'entrée « Suivi » :

```ts
    {
      label: 'Activité',
      to: '/e/$establishmentId/s/$serviceId/activite',
      // La MEME permission que le `beforeLoad` de l'ecran.
      permission: 'activity:read',
      group: 'Quotidien',
    },
```

Régénérer l'arbre : `cd front && npx vite build` (le greffon TanStack Router réécrit `src/routeTree.gen.ts`).

- [ ] **Step 5: Tout faire passer**

Run: `cd front && npx biome check --write src && npx tsc -b && npx vitest run`
Expected: PASS (dont `navigation.test.ts`, qui exige l'onglet pour le nouvel écran).

- [ ] **Step 6: Commit**

```bash
git add front/src
git commit -m "feat(activite): ecran Activite, carte des absences et export CSV (MDS-40)"
```

---

### Task 7: Contrôle visuel et fusion

- [ ] **Step 1: Suite complète**

Run: back `jest --runInBand` complet (commande des Global Constraints, sans fichier) et front `npx vitest run`.
Expected: tout vert.

- [ ] **Step 2: Fusion**

Merger `main` dans le worktree s'il a avancé, relancer les suites, puis depuis le checkout principal : `git merge --no-ff worktree-activite-service -m "merge: tableau de bord d'activite du service (MDS-40)"`, puis `graphify update .`.

- [ ] **Step 3: Contrôle visuel sur le serveur de dev (4270)**

Ouvrir `/e/<e>/s/<s>/activite` : en clair, en sombre, à 390 px de large. Vérifier : les trois réponses lisibles, la carte défile horizontalement avec la colonne des thématiques épinglée, aucune case teintée sans pourcentage écrit, l'onglet « Activité » visible pour un coordinateur, et le CSV qui s'ouvre proprement dans un tableur. Corriger dans le worktree, re-fusionner.
