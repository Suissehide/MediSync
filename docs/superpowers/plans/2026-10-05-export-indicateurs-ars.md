# Export des indicateurs de l'enquête annuelle ARS — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Donner au chef de service un écran « Indicateurs ARS » par période, en chiffres agrégés, avec export tableur, pour qu'il remplisse son enquête annuelle sans ressaisie.

**Architecture:** Une table de définitions en TypeScript porte les 30 indicateurs et leurs règles de calcul, sans dépendance à Prisma. Un dépôt charge la cohorte du service en une requête, un domaine applique la table et produit soit du JSON soit un classeur xlsx. Deux routes de service gardées par une nouvelle permission `stats:read`, une page front en lecture seule.

**Tech Stack:** Fastify + Zod + Prisma + Awilix côté back, `xlsx` 0.18.5 pour l'export, Jest pour les tests back. React + TanStack Router/Query côté front, Vitest pour les tests front. Biome pour lint et format (jamais eslint ni prettier).

**Spec:** `docs/superpowers/specs/2026-10-05-export-indicateurs-ars-design.md`

## Global Constraints

- **Biome uniquement** pour lint et format, côté front comme côté back. Jamais `eslint`, jamais `prettier`.
- **Aucun `biome-ignore`.** Si une règle se plaint, on corrige le code.
- **Commentaires synthétiques** : une ligne, ou rien. Pas de pavé explicatif dans le code.
- **Les modèles Prisma s'importent depuis `src/generated/`**, jamais depuis `@prisma/client`.
- **Le conteneur Awilix (`awilix-ioc-container.ts`) est le seul site de câblage.** Toute classe nouvelle s'y enregistre et se type dans `types/application/ioc.ts`.
- **`back/src/main/utils/permissions.ts` et `front/src/utils/permissions.ts` sont identiques octet pour octet**, vérifié par `back/src/test/unit/utils/permissions.test.ts:153`. Toute modification porte sur les deux fichiers, commentaires compris.
- **Toute route de tenant déclare une permission** (`config: { permission: … }`) : le garde-fou `assertRoutePermission` refuse le démarrage sinon.
- **Les dépôts lisent le tenant par appel** (`this.tenantContext.scope()`), jamais dans le constructeur.
- Le typecheck de `npm run build` ne couvre **pas** `src/test`. Une erreur de type dans un test ne rougit pas le build ; ne pas en conclure que « tout compile ».

## Review Focus

Cinq classes d'entrée que la spec implique sans qu'aucune tâche ne les exerce spontanément. Chacune reçoit son test dans la tâche qui possède le code.

1. **Période sans aucun dossier** — tous les indicateurs valent 0, et 2.8 ne divise pas par zéro. Test en tâche 3.
2. **Dossier sans date d'entrée et sans rendez-vous de diagnostic éducatif** — exclu de 1.1 et de tout ce qui en dépend, sans `NaN` ni exception. Test en tâche 2.
3. **`from` postérieure à `to`** — refus 400 par le schéma, pas une période vide rendue en silence comme si tout valait 0. Test en tâche 5.
4. **Rendez-vous sans thématique** (`thematicId` nul et modèle de créneau sans thématique) — n'est ni une réactualisation ni un diagnostic éducatif, et ne lève pas sur un `undefined.name`. Test en tâche 2.
5. **Patient suivi dans deux services du même établissement** — ses rendez-vous de l'autre service ne comptent pas dans les chiffres de celui-ci. Test en tâche 5.

---

## Structure des fichiers

**Back — créés :**

| Fichier | Responsabilité |
| --- | --- |
| `back/src/main/utils/ars-indicators.ts` | Rôles de thématiques, types de cohorte, table des 30 indicateurs, calcul. Aucune dépendance Prisma. |
| `back/src/main/types/infra/orm/repositories/arsIndicator.repository.interface.ts` | Contrat du dépôt |
| `back/src/main/infra/orm/repositories/arsIndicator.repository.ts` | Chargement de la cohorte du service, nom du service |
| `back/src/main/types/domain/arsIndicator.domain.interface.ts` | Contrat du domaine |
| `back/src/main/domain/arsIndicator.domain.ts` | Orchestration + export xlsx |
| `back/src/main/interfaces/http/fastify/schemas/arsIndicator.schema.ts` | Zod requête et réponse |
| `back/src/main/interfaces/http/fastify/routes/arsIndicator.ts` | Deux routes |
| `back/src/test/unit/utils/ars-indicators.test.ts` | Un cas par indicateur calculé |
| `back/src/test/e2e/indicateurs-ars.test.ts` | Routes, isolation, export |

**Back — modifiés :** `utils/permissions.ts`, `application/ioc/awilix/awilix-ioc-container.ts`, `types/application/ioc.ts`, `interfaces/http/fastify/routes/tenant.routes.ts`, `src/test/unit/utils/permissions.test.ts`, `src/test/e2e/permissions.test.ts`.

**Front — créés :** `src/api/arsIndicator.api.ts`, `src/queries/useArsIndicator.ts`, `src/types/arsIndicator.ts`, `src/routes/_authenticated/e/$establishmentId/s/$serviceId/indicateurs-ars.tsx`.

**Front — modifiés :** `src/utils/permissions.ts`, `src/navigation/navigation.ts`, `src/constants/process.constant.ts`.

**Docs — modifié :** `docs/multi-tenant/habilitations.md`.

---

### Task 1 : la permission `stats:read`

**Files:**
- Modify: `back/src/main/utils/permissions.ts`
- Modify: `front/src/utils/permissions.ts` (copie identique)
- Modify: `back/src/test/unit/utils/permissions.test.ts`
- Modify: `docs/multi-tenant/habilitations.md`

**Interfaces:**
- Consumes: rien.
- Produces: `'stats:read'` ajoutée au type `ServicePermission` et à `SERVICE_PERMISSIONS.COORDINATEUR`.

La sonde e2e de cette permission n'est **pas** ajoutée ici : la boucle de `src/test/e2e/permissions.test.ts` attend un 403 pour un rôle qui ne détient pas la permission, et une route inexistante rend 404. Elle arrive en tâche 6, avec la route.

- [ ] **Step 1: Écrire le test unitaire qui échoue**

Dans `back/src/test/unit/utils/permissions.test.ts`, ajouter à l'intérieur du `describe('permissions', …)` :

```ts
  it('reserve les indicateurs ARS au coordinateur', () => {
    expect(SERVICE_PERMISSIONS.COORDINATEUR).toContain('stats:read')
    for (const role of ['INTERVENANT', 'SECRETARIAT', 'LECTURE'] as const) {
      expect(SERVICE_PERMISSIONS[role]).not.toContain('stats:read')
    }
  })
```

- [ ] **Step 2: Lancer le test et vérifier qu'il échoue**

Run: `cd back && npx jest -c src/test/jest.config.ts src/test/unit/utils/permissions.test.ts`
Expected: FAIL — `expect(received).toContain('stats:read')`.

- [ ] **Step 3: Ajouter la permission dans le fichier du back**

Dans `back/src/main/utils/permissions.ts`, après la ligne `| 'consultations:read'` dans `ServicePermission` :

```ts
  // Indicateurs de l'enquête annuelle ARS, en chiffres agrégés et sans donnée nominative
  // (MDS-26). Non accordée à LECTURE : la direction lira le tableau de bord de MDS-40.
  | 'stats:read'
```

et dans `SERVICE_PERMISSIONS.COORDINATEUR`, après `'service-members:manage',` :

```ts
    'stats:read',
```

- [ ] **Step 4: Recopier le fichier à l'identique dans le front**

Run: `cp back/src/main/utils/permissions.ts front/src/utils/permissions.ts`

Le test `est identique a la copie du front` compare les deux fichiers octet pour octet ; la copie est la seule façon sûre.

- [ ] **Step 5: Lancer les tests et vérifier qu'ils passent**

Run: `cd back && npx jest -c src/test/jest.config.ts src/test/unit/utils/permissions.test.ts`
Expected: PASS, y compris `est identique a la copie du front`.

- [ ] **Step 6: Mettre à jour le document d'habilitations**

Dans `docs/multi-tenant/habilitations.md`, ajouter une ligne au tableau « Permissions par rôle de service », après la ligne `service-members:manage` :

```markdown
| `stats:read` | Lire les indicateurs de l'enquête annuelle ARS du service courant : chiffres agrégés, aucune donnée nominative (MDS-26, 2026-10-05) | ✔ | | | |
```

Et dans la ligne du rôle **Coordinateur** du tableau « Rôles », ajouter à la fin de la cellule : « Plus les indicateurs de l'enquête annuelle ARS de son service depuis le 2026-10-05 (MDS-26). »

- [ ] **Step 7: Commit**

```bash
git add back/src/main/utils/permissions.ts front/src/utils/permissions.ts back/src/test/unit/utils/permissions.test.ts docs/multi-tenant/habilitations.md
git commit -m "feat(ars): permission stats:read reservee au coordinateur (MDS-26)"
```

---

### Task 2 : socle de calcul et groupe 1 (entrée)

**Files:**
- Create: `back/src/main/utils/ars-indicators.ts`
- Create: `back/src/test/unit/utils/ars-indicators.test.ts`

**Interfaces:**
- Consumes: `AppointmentType` depuis `src/generated/client`.
- Produces :
  - `ArsPresence`, `ArsFile`, `ArsCohort`, `ArsGroup`, `ArsIndicator`, `ArsIndicatorResult` (types)
  - `ARS_THEMATIC_ROLES: { reactualisation: readonly string[]; diagnosticEducatif: readonly string[] }`
  - `ARS_INDICATORS: readonly ArsIndicator[]`
  - `computeArsIndicators(cohort: ArsCohort): ArsIndicatorResult[]`

- [ ] **Step 1: Écrire les tests qui échouent**

Créer `back/src/test/unit/utils/ars-indicators.test.ts` :

```ts
import {
  ARS_THEMATIC_ROLES,
  type ArsCohort,
  type ArsFile,
  type ArsPresence,
  computeArsIndicators,
} from '../../../main/utils/ars-indicators'

const PERIODE = {
  from: new Date('2026-01-01'),
  to: new Date('2026-12-31'),
}

const presence = (p: Partial<ArsPresence> = {}): ArsPresence => ({
  date: new Date('2026-03-01'),
  type: 'ambulatory',
  individual: true,
  slotId: 'slot-1',
  thematicName: 'Mes médicaments',
  honored: true,
  accompanied: false,
  ...p,
})

const dossier = (f: Partial<ArsFile> = {}): ArsFile => ({
  patientId: 'p1',
  entryDate: new Date('2026-02-01'),
  orientation: null,
  presences: [],
  ...f,
})

const cohorte = (files: ArsFile[]): ArsCohort => ({ ...PERIODE, files })

const valeur = (cohort: ArsCohort, code: string): number | null => {
  const found = computeArsIndicators(cohort).find((i) => i.code === code)
  if (!found) {
    throw new Error(`indicateur ${code} absent de la table`)
  }
  return found.value
}

describe('rôles de thématiques', () => {
  it('reconnaît les quatre libellés de diagnostic éducatif, majuscule accentuée comprise', () => {
    expect(ARS_THEMATIC_ROLES.diagnosticEducatif).toContain(
      'Diagnostic Éducatif – HDJ SMR',
    )
    expect(ARS_THEMATIC_ROLES.diagnosticEducatif).toContain(
      'Diagnostic éducatif',
    )
  })

  it('ne reconnaît pas une thématique inconnue', () => {
    expect(ARS_THEMATIC_ROLES.reactualisation).not.toContain('Réactu 5')
    expect(ARS_THEMATIC_ROLES.reactualisation).toEqual([
      'Réactu 1',
      'Réactu 2',
      'Réactu 3',
      'Réactu 4',
    ])
  })
})

describe('groupe 1 — entrée', () => {
  it('1.1 compte les dossiers dont la date d entree tombe dans la periode', () => {
    const c = cohorte([
      dossier({ entryDate: new Date('2026-02-01') }),
      dossier({ patientId: 'p2', entryDate: new Date('2025-02-01') }),
    ])
    expect(valeur(c, '1.1')).toBe(1)
  })

  it('1.1 retient un dossier sans date d entree mais avec un rendez-vous de diagnostic educatif honore', () => {
    const c = cohorte([
      dossier({
        entryDate: null,
        presences: [
          presence({
            thematicName: 'Diagnostic Éducatif – Ambulatoire',
            date: new Date('2026-04-02'),
          }),
        ],
      }),
    ])
    expect(valeur(c, '1.1')).toBe(1)
  })

  // Review Focus 2 : ni NaN, ni exception, le dossier est simplement hors cohorte.
  it('1.1 ignore un dossier sans date d entree et sans rendez-vous de diagnostic educatif', () => {
    const c = cohorte([
      dossier({ entryDate: null, presences: [presence()] }),
    ])
    expect(valeur(c, '1.1')).toBe(0)
  })

  // Review Focus 4 : un rendez-vous sans thematique ne leve pas et ne porte aucun role.
  it('1.1 traite un rendez-vous sans thematique sans lever', () => {
    const c = cohorte([
      dossier({ entryDate: null, presences: [presence({ thematicName: null })] }),
    ])
    expect(() => valeur(c, '1.1')).not.toThrow()
    expect(valeur(c, '1.1')).toBe(0)
  })

  it('1.1bis compte ceux dont le diagnostic educatif a eu lieu par telephone', () => {
    const c = cohorte([
      dossier({
        presences: [
          presence({
            thematicName: 'Diagnostic éducatif',
            type: 'telephonic',
            date: new Date('2026-02-01'),
          }),
        ],
      }),
      dossier({ patientId: 'p2' }),
    ])
    expect(valeur(c, '1.1bis')).toBe(1)
  })

  it('1.2, 1.3 et 1.4 ventilent par orientation', () => {
    const c = cohorte([
      dossier({ orientation: 'Orientation pro santé ext hôpital' }),
      dossier({
        patientId: 'p2',
        orientation: 'Orientation pro santé au cours hospit',
      }),
      dossier({ patientId: 'p3', orientation: 'Orientation pro santé en Cs' }),
      dossier({ patientId: 'p4', orientation: 'Venue spontanée' }),
    ])
    expect(valeur(c, '1.2')).toBe(1)
    expect(valeur(c, '1.3')).toBe(1)
    expect(valeur(c, '1.4')).toBe(1)
  })
})
```

- [ ] **Step 2: Lancer les tests et vérifier qu'ils échouent**

Run: `cd back && npx jest -c src/test/jest.config.ts src/test/unit/utils/ars-indicators.test.ts`
Expected: FAIL — `Cannot find module '../../../main/utils/ars-indicators'`.

- [ ] **Step 3: Écrire le socle et le groupe 1**

Créer `back/src/main/utils/ars-indicators.ts` :

```ts
import type { AppointmentType } from '../../generated/client'

// Rattachement des thématiques à leur rôle dans la grille ARS. Liste nommée et non préfixe : les
// quatre libellés de diagnostic éducatif des données réelles diffèrent par la casse de l'accent.
// ponytail: constante pour le pilote ; devient un réglage par service (champ de rôle sur
// `Thematic`) quand le chef de service doit le changer lui-même — les `compute` ne bougeront pas,
// ils reçoivent déjà des rôles résolus.
export const ARS_THEMATIC_ROLES = {
  reactualisation: ['Réactu 1', 'Réactu 2', 'Réactu 3', 'Réactu 4'],
  diagnosticEducatif: [
    'Diagnostic éducatif',
    'Diagnostic Éducatif – Bilan CEPTA',
    'Diagnostic Éducatif – HDJ SMR',
    'Diagnostic Éducatif – Ambulatoire',
  ],
} as const

type ThematicRole = keyof typeof ARS_THEMATIC_ROLES

export type ArsPresence = {
  date: Date
  type: AppointmentType | null
  individual: boolean
  slotId: string
  thematicName: string | null
  honored: boolean
  accompanied: boolean
}

export type ArsFile = {
  patientId: string
  entryDate: Date | null
  orientation: string | null
  presences: ArsPresence[]
}

export type ArsCohort = { from: Date; to: Date; files: ArsFile[] }

export type ArsGroup = 'Entrée' | 'Séances' | 'Sortie' | 'Modalités'

export type ArsIndicator = {
  code: string
  group: ArsGroup
  label: string
} & (
  | { compute: (cohort: ArsCohort) => number }
  | { unavailable: string }
  | { manual: string }
)

export type ArsIndicatorResult = {
  code: string
  group: ArsGroup
  label: string
  value: number | null
  note: string | null
}

const inRange = (date: Date | null, from: Date, to: Date): boolean =>
  date !== null && date >= from && date <= to

const isRole = (role: ThematicRole, name: string | null): boolean =>
  name !== null && (ARS_THEMATIC_ROLES[role] as readonly string[]).includes(name)

const honored = (file: ArsFile): ArsPresence[] =>
  file.presences.filter((p) => p.honored)

// Date du diagnostic éducatif : la date d'entrée du dossier si elle tombe dans la période, sinon
// le premier rendez-vous honoré de thématique « diagnostic éducatif » dans la période.
const deDate = (file: ArsFile, c: ArsCohort): Date | null => {
  if (inRange(file.entryDate, c.from, c.to)) {
    return file.entryDate
  }
  const dates = honored(file)
    .filter(
      (p) =>
        inRange(p.date, c.from, c.to) &&
        isRole('diagnosticEducatif', p.thematicName),
    )
    .map((p) => p.date.getTime())
  return dates.length > 0 ? new Date(Math.min(...dates)) : null
}

const countFiles = (c: ArsCohort, keep: (f: ArsFile) => boolean): number =>
  c.files.filter(keep).length

const countOriented = (c: ArsCohort, orientation: string): number =>
  countFiles(
    c,
    (f) => deDate(f, c) !== null && f.orientation === orientation,
  )

export const ARS_INDICATORS: readonly ArsIndicator[] = [
  {
    code: '1.1',
    group: 'Entrée',
    label: "Nombre de patients ayant bénéficié d'un diagnostic éducatif",
    compute: (c) => countFiles(c, (f) => deDate(f, c) !== null),
  },
  {
    code: '1.1bis',
    group: 'Entrée',
    label:
      "Dont nombre de patients ayant bénéficié d'un diagnostic éducatif en distanciel",
    compute: (c) =>
      countFiles(
        c,
        (f) =>
          deDate(f, c) !== null &&
          honored(f).some(
            (p) =>
              inRange(p.date, c.from, c.to) &&
              isRole('diagnosticEducatif', p.thematicName) &&
              p.type === 'telephonic',
          ),
      ),
  },
  {
    code: '1.2',
    group: 'Entrée',
    label:
      "Nombre de patients orientés par un professionnel de santé en dehors d'un hôpital (dont médecin traitant)",
    compute: (c) => countOriented(c, 'Orientation pro santé ext hôpital'),
  },
  {
    code: '1.3',
    group: 'Entrée',
    label:
      "Nombre de patients orientés par un professionnel de santé au cours d'une hospitalisation",
    compute: (c) => countOriented(c, 'Orientation pro santé au cours hospit'),
  },
  {
    code: '1.4',
    group: 'Entrée',
    label:
      "Nombre de patients orientés par un professionnel de santé à l'hôpital en consultation externe",
    compute: (c) => countOriented(c, 'Orientation pro santé en Cs'),
  },
]

export const computeArsIndicators = (c: ArsCohort): ArsIndicatorResult[] =>
  ARS_INDICATORS.map((i) => {
    const base = { code: i.code, group: i.group, label: i.label }
    if ('compute' in i) {
      return { ...base, value: i.compute(c), note: null }
    }
    if ('unavailable' in i) {
      return { ...base, value: null, note: i.unavailable }
    }
    return { ...base, value: null, note: i.manual }
  })
```

- [ ] **Step 4: Lancer les tests et vérifier qu'ils passent**

Run: `cd back && npx jest -c src/test/jest.config.ts src/test/unit/utils/ars-indicators.test.ts`
Expected: PASS, les neuf cas.

- [ ] **Step 5: Vérifier le lint**

Run: `cd back && npm run lint`
Expected: aucune erreur. Aucun `biome-ignore` ajouté.

- [ ] **Step 6: Commit**

```bash
git add back/src/main/utils/ars-indicators.ts back/src/test/unit/utils/ars-indicators.test.ts
git commit -m "feat(ars): socle de calcul et indicateurs du groupe entree (MDS-26)"
```

---

### Task 3 : groupe 2 (séances et mode de prise en charge)

**Files:**
- Modify: `back/src/main/utils/ars-indicators.ts`
- Modify: `back/src/test/unit/utils/ars-indicators.test.ts`

**Interfaces:**
- Consumes: `ArsCohort`, `ArsFile`, `ArsPresence`, les aides `inRange`, `isRole`, `honored`, `deDate`, `countFiles` de la tâche 2 ; les fabriques de test `presence`, `dossier`, `cohorte`, `valeur`.
- Produces: `sinceDe(file, cohort): ArsPresence[] | null` — les présences honorées entre la date de DE et la fin de période, `null` si pas de date de DE. Consommée par les tâches 4.

- [ ] **Step 1: Écrire les tests qui échouent**

Ajouter à `back/src/test/unit/utils/ars-indicators.test.ts` :

```ts
describe('groupe 2 — séances et mode de prise en charge', () => {
  it('2.1 compte les patients pris en charge uniquement en hospitalisation', () => {
    const c = cohorte([
      dossier({
        presences: [
          presence({ type: 'hospital' }),
          presence({ type: 'hospital', date: new Date('2026-05-01') }),
        ],
      }),
      dossier({
        patientId: 'p2',
        presences: [presence({ type: 'hospital' }), presence({ type: 'ambulatory' })],
      }),
    ])
    expect(valeur(c, '2.1')).toBe(1)
  })

  it('2.2 compte les patients pris en charge uniquement en soins externes, distanciel compris', () => {
    const c = cohorte([
      dossier({
        presences: [
          presence({ type: 'ambulatory' }),
          presence({ type: 'telephonic' }),
        ],
      }),
    ])
    expect(valeur(c, '2.2')).toBe(1)
  })

  it('2.4 compte le parcours mixte, ni 2.1 ni 2.2', () => {
    const c = cohorte([
      dossier({
        presences: [
          presence({ type: 'hospital' }),
          presence({ type: 'ambulatory' }),
        ],
      }),
    ])
    expect(valeur(c, '2.1')).toBe(0)
    expect(valeur(c, '2.2')).toBe(0)
    expect(valeur(c, '2.4')).toBe(1)
  })

  it('2.6 compte les seances individuelles honorees de la periode', () => {
    const c = cohorte([
      dossier({
        presences: [
          presence({ individual: true }),
          presence({ individual: true, honored: false }),
          presence({ individual: false }),
          presence({ individual: true, date: new Date('2025-03-01') }),
        ],
      }),
    ])
    expect(valeur(c, '2.6')).toBe(1)
  })

  it('2.6bis compte celles qui ont eu lieu par telephone', () => {
    const c = cohorte([
      dossier({
        presences: [
          presence({ individual: true, type: 'telephonic' }),
          presence({ individual: true, type: 'ambulatory' }),
        ],
      }),
    ])
    expect(valeur(c, '2.6bis')).toBe(1)
  })

  it('2.7 compte les creneaux collectifs distincts, pas les presences', () => {
    const c = cohorte([
      dossier({
        presences: [
          presence({ individual: false, slotId: 'a' }),
          presence({ individual: false, slotId: 'a' }),
          presence({ individual: false, slotId: 'b' }),
        ],
      }),
    ])
    expect(valeur(c, '2.7')).toBe(2)
  })

  // Draxa rendait 0 en dur ici : la correction est l'objet de ce cas.
  it('2.7bis compte les creneaux collectifs entierement en distanciel', () => {
    const c = cohorte([
      dossier({
        presences: [
          presence({ individual: false, slotId: 'a', type: 'telephonic' }),
          presence({ individual: false, slotId: 'b', type: 'telephonic' }),
          presence({ individual: false, slotId: 'b', type: 'ambulatory' }),
        ],
      }),
    ])
    expect(valeur(c, '2.7bis')).toBe(1)
  })

  it('2.8 rend la moyenne de patients par seance collective, a une decimale', () => {
    const c = cohorte([
      dossier({
        presences: [
          presence({ individual: false, slotId: 'a' }),
          presence({ individual: false, slotId: 'a' }),
          presence({ individual: false, slotId: 'b' }),
        ],
      }),
    ])
    expect(valeur(c, '2.8')).toBe(1.5)
  })

  // Review Focus 1 : aucune division par zero quand la periode est vide.
  it('2.8 vaut 0 sans aucune seance collective', () => {
    expect(valeur(cohorte([]), '2.8')).toBe(0)
  })

  // Review Focus 1 : une periode sans dossier rend 0 partout, jamais NaN ni null.
  it('rend 0 pour tous les indicateurs calcules sur une periode vide', () => {
    for (const r of computeArsIndicators(cohorte([]))) {
      if (r.note === null) {
        expect(r.value).toBe(0)
      }
    }
  })

  // Draxa recopiait 2.10 ici : la correction est l'objet de ce cas.
  it('2.9 compte des patients distincts, la ou 2.10 compte des seances', () => {
    const c = cohorte([
      dossier({
        presences: [
          presence({ accompanied: true }),
          presence({ accompanied: true, date: new Date('2026-04-01') }),
        ],
      }),
    ])
    expect(valeur(c, '2.9')).toBe(1)
    expect(valeur(c, '2.10')).toBe(2)
  })
})
```

- [ ] **Step 2: Lancer les tests et vérifier qu'ils échouent**

Run: `cd back && npx jest -c src/test/jest.config.ts src/test/unit/utils/ars-indicators.test.ts -t "groupe 2"`
Expected: FAIL — `indicateur 2.1 absent de la table`.

- [ ] **Step 3: Ajouter les aides et les treize entrées du groupe 2**

Dans `back/src/main/utils/ars-indicators.ts`, après `countOriented`, ajouter :

```ts
// Les présences honorées entre la date de DE et la fin de période. `null` sans date de DE.
const sinceDe = (file: ArsFile, c: ArsCohort): ArsPresence[] | null => {
  const start = deDate(file, c)
  if (start === null) {
    return null
  }
  return honored(file).filter((p) => p.date >= start && p.date <= c.to)
}

const onlyOfTypes = (
  file: ArsFile,
  c: ArsCohort,
  types: readonly AppointmentType[],
): boolean => {
  const ps = sinceDe(file, c)
  return (
    ps !== null &&
    ps.length > 0 &&
    ps.every((p) => p.type !== null && types.includes(p.type))
  )
}

const presencesInPeriod = (c: ArsCohort): ArsPresence[] =>
  c.files.flatMap((f) => honored(f)).filter((p) => inRange(p.date, c.from, c.to))

const collectiveSlots = (c: ArsCohort): Map<string, ArsPresence[]> => {
  const slots = new Map<string, ArsPresence[]>()
  for (const p of presencesInPeriod(c).filter((p) => !p.individual)) {
    slots.set(p.slotId, [...(slots.get(p.slotId) ?? []), p])
  }
  return slots
}
```

Puis, dans `ARS_INDICATORS`, après l'entrée `1.4` :

```ts
  {
    code: '2.1',
    group: 'Séances',
    label:
      "Nombre de patients pris en charge au cours d'une hospitalisation (de jour, de semaine, complète) en établissement de santé uniquement",
    compute: (c) => countFiles(c, (f) => onlyOfTypes(f, c, ['hospital'])),
  },
  {
    code: '2.2',
    group: 'Séances',
    label:
      "Nombre de patients pris en charge en soins externes d'un établissement de santé uniquement",
    compute: (c) =>
      countFiles(c, (f) => onlyOfTypes(f, c, ['ambulatory', 'telephonic'])),
  },
  {
    code: '2.3',
    group: 'Séances',
    label:
      'Nombre de patients pris en charge en soins de ville uniquement (MSP, association, ex-réseau de PS libéraux…)',
    unavailable:
      'Aucune notion de soins de ville : le type de rendez-vous vaut ambulatoire, hôpital ou téléphonique',
  },
  {
    code: '2.4',
    group: 'Séances',
    label:
      "Nombre de patients pris en charge en programme mixte (hospitalisation + soins externes)",
    compute: (c) =>
      countFiles(c, (f) => {
        const ps = sinceDe(f, c)
        return (
          ps !== null &&
          ps.length > 0 &&
          !onlyOfTypes(f, c, ['hospital']) &&
          !onlyOfTypes(f, c, ['ambulatory', 'telephonic'])
        )
      }),
  },
  {
    code: '2.5',
    group: 'Séances',
    label: 'Autre type de prise en charge à chiffrer et à expliquer',
    manual: "Champ libre de l'enquête, à renseigner à la main",
  },
  {
    code: '2.6',
    group: 'Séances',
    label: "Nombre total de séances individuelles d'ETP réalisées",
    compute: (c) => presencesInPeriod(c).filter((p) => p.individual).length,
  },
  {
    code: '2.6bis',
    group: 'Séances',
    label:
      "Dont nombre de séances individuelles d'ETP réalisées en distanciel",
    compute: (c) =>
      presencesInPeriod(c).filter(
        (p) => p.individual && p.type === 'telephonic',
      ).length,
  },
  {
    code: '2.7',
    group: 'Séances',
    label: "Nombre total de séances collectives d'ETP réalisées",
    compute: (c) => collectiveSlots(c).size,
  },
  {
    code: '2.7bis',
    group: 'Séances',
    label: "Dont nombre de séances collectives d'ETP réalisées en distanciel",
    compute: (c) =>
      [...collectiveSlots(c).values()].filter((ps) =>
        ps.every((p) => p.type === 'telephonic'),
      ).length,
  },
  {
    code: '2.8',
    group: 'Séances',
    label: 'Nombre moyen de patients par séance collective',
    compute: (c) => {
      const slots = collectiveSlots(c)
      if (slots.size === 0) {
        return 0
      }
      const total = [...slots.values()].reduce((n, ps) => n + ps.length, 0)
      return Math.round((total / slots.size) * 10) / 10
    },
  },
  {
    code: '2.9',
    group: 'Séances',
    label:
      'Nombre de proches et/ou aidants du patient ayant participé au programme',
    compute: (c) =>
      countFiles(c, (f) =>
        honored(f).some(
          (p) => inRange(p.date, c.from, c.to) && p.accompanied,
        ),
      ),
  },
  {
    code: '2.10',
    group: 'Séances',
    label:
      "Nombre total de séances d'ETP avec une participation de proches et/ou aidants du patient",
    compute: (c) => presencesInPeriod(c).filter((p) => p.accompanied).length,
  },
  {
    code: '2.11',
    group: 'Séances',
    label:
      'Nombre total de séances destinées exclusivement aux proches et/ou aidants du patient',
    unavailable:
      'Un rendez-vous est toujours rattaché à des patients : une séance sans patient ne se représente pas',
  },
```

- [ ] **Step 4: Lancer les tests et vérifier qu'ils passent**

Run: `cd back && npx jest -c src/test/jest.config.ts src/test/unit/utils/ars-indicators.test.ts -t "groupe 2"`
Expected: PASS, les douze cas.

- [ ] **Step 5: Vérifier le lint**

Run: `cd back && npm run lint`
Expected: aucune erreur.

- [ ] **Step 6: Commit**

```bash
git add back/src/main/utils/ars-indicators.ts back/src/test/unit/utils/ars-indicators.test.ts
git commit -m "feat(ars): indicateurs du groupe seances, 2.7bis et 2.9 corriges (MDS-26)"
```

---

### Task 4 : groupes 3 (sortie) et 4 (modalités)

**Files:**
- Modify: `back/src/main/utils/ars-indicators.ts`
- Modify: `back/src/test/unit/utils/ars-indicators.test.ts`

**Interfaces:**
- Consumes: `sinceDe`, `isRole`, `countFiles`, `inRange`, `honored` des tâches 2 et 3.
- Produces: la table `ARS_INDICATORS` complète, 30 entrées. Les trois tests du `describe('indicateurs sans donnee')` de la tâche 2 passent au vert ici.

- [ ] **Step 1: Écrire les tests qui échouent**

Ajouter à `back/src/test/unit/utils/ars-indicators.test.ts` :

```ts
const reactu = (p: Partial<ArsPresence> = {}) =>
  presence({ thematicName: 'Réactu 1', ...p })

describe('groupe 3 — sortie', () => {
  it('3.1 exige une seance et une reactualisation apres le diagnostic educatif', () => {
    const complet = dossier({
      presences: [
        presence({ date: new Date('2026-03-01') }),
        reactu({ date: new Date('2026-06-01') }),
      ],
    })
    const sansReactu = dossier({
      patientId: 'p2',
      presences: [presence({ date: new Date('2026-03-01') })],
    })
    expect(valeur(cohorte([complet, sansReactu]), '3.1')).toBe(1)
  })

  it('3.2 et 3.3 restreignent au type de prise en charge', () => {
    const hospit = dossier({
      presences: [
        presence({ type: 'hospital', date: new Date('2026-03-01') }),
        reactu({ type: 'hospital', date: new Date('2026-06-01') }),
      ],
    })
    const ambu = dossier({
      patientId: 'p2',
      presences: [
        presence({ type: 'ambulatory', date: new Date('2026-03-01') }),
        reactu({ type: 'ambulatory', date: new Date('2026-06-01') }),
      ],
    })
    const c = cohorte([hospit, ambu])
    expect(valeur(c, '3.2')).toBe(1)
    expect(valeur(c, '3.3')).toBe(1)
  })

  // Draxa recopiait 3.1 ici : la correction est l'objet de ce cas.
  it('3.4 compte le parcours mixte, pas le total de 3.1', () => {
    const mixte = dossier({
      presences: [
        presence({ type: 'hospital', date: new Date('2026-03-01') }),
        reactu({ type: 'ambulatory', date: new Date('2026-06-01') }),
      ],
    })
    const c = cohorte([mixte])
    expect(valeur(c, '3.1')).toBe(1)
    expect(valeur(c, '3.2')).toBe(0)
    expect(valeur(c, '3.3')).toBe(0)
    expect(valeur(c, '3.4')).toBe(1)
  })

  it('3.6 compte les patients ayant eu une reactualisation dans la periode', () => {
    const c = cohorte([dossier({ presences: [reactu()] })])
    expect(valeur(c, '3.6')).toBe(1)
  })
})

describe('groupe 4 — modalités', () => {
  it('4.1 exige au moins trois seances honorees depuis le diagnostic educatif', () => {
    const trois = dossier({
      presences: [
        presence({ date: new Date('2026-03-01') }),
        presence({ date: new Date('2026-04-01') }),
        presence({ date: new Date('2026-05-01') }),
      ],
    })
    const deux = dossier({
      patientId: 'p2',
      presences: [
        presence({ date: new Date('2026-03-01') }),
        presence({ date: new Date('2026-04-01') }),
      ],
    })
    expect(valeur(cohorte([trois, deux]), '4.1')).toBe(1)
  })

  it('4.1bis exige trois seances avant la derniere reactualisation', () => {
    const c = cohorte([
      dossier({
        presences: [
          presence({ date: new Date('2026-03-01') }),
          presence({ date: new Date('2026-04-01') }),
          presence({ date: new Date('2026-05-01') }),
          reactu({ date: new Date('2026-06-01') }),
        ],
      }),
    ])
    expect(valeur(c, '4.1bis')).toBe(1)
  })

  it('4.3 exige trois seances apres la premiere reactualisation', () => {
    const c = cohorte([
      dossier({
        presences: [
          reactu({ date: new Date('2026-02-01') }),
          presence({ date: new Date('2026-03-01') }),
          presence({ date: new Date('2026-04-01') }),
          presence({ date: new Date('2026-05-01') }),
        ],
      }),
    ])
    expect(valeur(c, '4.3')).toBe(1)
  })

  it('4.3bis exige trois seances entre deux reactualisations', () => {
    const c = cohorte([
      dossier({
        presences: [
          reactu({ date: new Date('2026-02-01') }),
          presence({ date: new Date('2026-03-01') }),
          presence({ date: new Date('2026-04-01') }),
          presence({ date: new Date('2026-05-01') }),
          reactu({ thematicName: 'Réactu 2', date: new Date('2026-06-01') }),
        ],
      }),
    ])
    expect(valeur(c, '4.3bis')).toBe(1)
  })
})

describe('table complète', () => {
  it('rend une valeur nulle et une raison pour 2.3, 2.11, 3.5 et 4.4', () => {
    const resultats = computeArsIndicators(cohorte([]))
    for (const code of ['2.3', '2.11', '3.5', '4.4']) {
      const i = resultats.find((r) => r.code === code)
      expect(i?.value).toBeNull()
      expect(i?.note).toEqual(expect.any(String))
    }
  })

  it('marque 2.5 et 4.2 comme a renseigner a la main', () => {
    const resultats = computeArsIndicators(cohorte([]))
    for (const code of ['2.5', '4.2']) {
      const i = resultats.find((r) => r.code === code)
      expect(i?.value).toBeNull()
      expect(i?.note).toContain('renseigner')
    }
  })

  it('rend les 30 indicateurs, dans l ordre des groupes', () => {
    const resultats = computeArsIndicators(cohorte([]))
    expect(resultats).toHaveLength(30)
    expect(resultats.map((r) => r.group)).toEqual([
      ...Array(5).fill('Entrée'),
      ...Array(13).fill('Séances'),
      ...Array(6).fill('Sortie'),
      ...Array(6).fill('Modalités'),
    ])
  })
})
```

- [ ] **Step 2: Lancer les tests et vérifier qu'ils échouent**

Run: `cd back && npx jest -c src/test/jest.config.ts src/test/unit/utils/ars-indicators.test.ts -t "groupe 3"`
Expected: FAIL — `indicateur 3.1 absent de la table`.

- [ ] **Step 3: Ajouter les aides et les douze entrées restantes**

Dans `back/src/main/utils/ars-indicators.ts`, après `collectiveSlots`, ajouter :

```ts
const isReactu = (p: ArsPresence): boolean =>
  isRole('reactualisation', p.thematicName)

// Programme complet : un diagnostic éducatif, au moins une séance et au moins une
// réactualisation après lui.
const completeProgram = (
  file: ArsFile,
  c: ArsCohort,
  types?: readonly AppointmentType[],
): boolean => {
  const ps = sinceDe(file, c)
  if (ps === null) {
    return false
  }
  if (types && !ps.every((p) => p.type !== null && types.includes(p.type))) {
    return false
  }
  return ps.some((p) => !isReactu(p)) && ps.some(isReactu)
}

const reactuTimes = (ps: ArsPresence[]): number[] =>
  ps.filter(isReactu).map((p) => p.date.getTime())

const countAround = (
  file: ArsFile,
  c: ArsCohort,
  pick: (times: number[], all: number[]) => number,
): number => {
  const ps = sinceDe(file, c)
  if (ps === null) {
    return 0
  }
  const times = reactuTimes(ps)
  if (times.length === 0) {
    return 0
  }
  return pick(
    times,
    ps.map((p) => p.date.getTime()),
  )
}
```

Puis, à la fin de `ARS_INDICATORS` :

```ts
  {
    code: '3.1',
    group: 'Sortie',
    label:
      'Nombre de patients ayant suivi un programme personnalisé complet (quel que soit le mode de prise en charge)',
    compute: (c) => countFiles(c, (f) => completeProgram(f, c)),
  },
  {
    code: '3.2',
    group: 'Sortie',
    label:
      "Nombre de patients ayant suivi un programme personnalisé complet (au cours d'une hospitalisation complète ou de jour)",
    compute: (c) => countFiles(c, (f) => completeProgram(f, c, ['hospital'])),
  },
  {
    code: '3.3',
    group: 'Sortie',
    label:
      "Nombre de patients ayant suivi un programme personnalisé complet (au cours d'une venue en soins externes)",
    compute: (c) => countFiles(c, (f) => completeProgram(f, c, ['ambulatory'])),
  },
  {
    code: '3.4',
    group: 'Sortie',
    label:
      'Nombre de patients ayant suivi un programme personnalisé complet (au cours d’une venue mixte)',
    compute: (c) =>
      countFiles(
        c,
        (f) =>
          completeProgram(f, c) &&
          !completeProgram(f, c, ['hospital']) &&
          !completeProgram(f, c, ['ambulatory']),
      ),
  },
  {
    code: '3.5',
    group: 'Sortie',
    label:
      "Nombre de patients ayant suivi un programme personnalisé complet (au cours de séances d'ETP pratiquées en soins de ville)",
    unavailable:
      'Aucune notion de soins de ville : le type de rendez-vous vaut ambulatoire, hôpital ou téléphonique',
  },
  {
    code: '3.6',
    group: 'Sortie',
    label:
      "Nombre de patients ayant bénéficié d'une évaluation individuelle des compétences acquises de l'ETP",
    compute: (c) =>
      countFiles(c, (f) =>
        honored(f).some((p) => inRange(p.date, c.from, c.to) && isReactu(p)),
      ),
  },
  {
    code: '4.1',
    group: 'Modalités',
    label:
      "Nombre de patients ayant bénéficié d'un programme personnalisé lors d'une offre initiale d'ETP",
    compute: (c) =>
      countFiles(c, (f) => (sinceDe(f, c)?.length ?? 0) >= 3),
  },
  {
    code: '4.1bis',
    group: 'Modalités',
    label:
      'Dont nombre de patients ayant terminé par une réactualisation (Réactu 1 à 4)',
    compute: (c) =>
      countFiles(
        c,
        (f) =>
          countAround(
            f,
            c,
            (times, all) =>
              all.filter((t) => t < Math.max(...times)).length,
          ) >= 3,
      ),
  },
  {
    code: '4.2',
    group: 'Modalités',
    label:
      'Une offre de suivi ou de renforcement dans un nouveau programme est-elle proposée au sein de la structure ?',
    manual: 'Question oui/non sur la structure, à renseigner à la main',
  },
  {
    code: '4.3',
    group: 'Modalités',
    label:
      "Nombre de patients ayant bénéficié d'un programme personnalisé lors d'une offre de suivi ou de renforcement d'ETP commençant par une réactualisation",
    compute: (c) =>
      countFiles(
        c,
        (f) =>
          countAround(
            f,
            c,
            (times, all) =>
              all.filter((t) => t > Math.min(...times)).length,
          ) >= 3,
      ),
  },
  {
    code: '4.3bis',
    group: 'Modalités',
    label:
      'Dont nombre de patients ayant également terminé par une réactualisation (Réactu 1 à 4)',
    compute: (c) =>
      countFiles(
        c,
        (f) =>
          countAround(f, c, (times, all) => {
            if (times.length < 2) {
              return 0
            }
            const first = Math.min(...times)
            const last = Math.max(...times)
            return all.filter((t) => t > first && t < last).length
          }) >= 3,
      ),
  },
  {
    code: '4.4',
    group: 'Modalités',
    label:
      "Nombre de patients dont la synthèse de l'évaluation des compétences acquises a été transmise au moins à leur médecin traitant",
    unavailable:
      "Aucun modèle ne trace cet envoi (relève du ticket « Envoi du bilan par MSSanté »)",
  },
```

- [ ] **Step 4: Lancer tout le fichier de test**

Run: `cd back && npx jest -c src/test/jest.config.ts src/test/unit/utils/ars-indicators.test.ts`
Expected: PASS en totalité — les 9 cas de la tâche 2, les 12 de la tâche 3, et les 11 de celle-ci, dont `rend les 30 indicateurs, dans l ordre des groupes`.

- [ ] **Step 5: Vérifier le lint**

Run: `cd back && npm run lint`
Expected: aucune erreur.

- [ ] **Step 6: Commit**

```bash
git add back/src/main/utils/ars-indicators.ts back/src/test/unit/utils/ars-indicators.test.ts
git commit -m "feat(ars): indicateurs des groupes sortie et modalites, 3.4 corrige (MDS-26)"
```

---

### Task 5 : dépôt, domaine et route de lecture

Dépôt, domaine et route tiennent en une tâche : un dépôt sans consommateur n'a pas de livrable
qu'on puisse éprouver, et un relecteur ne pourrait pas accepter l'un en refusant l'autre.

**Files:**
- Create: `back/src/main/types/infra/orm/repositories/arsIndicator.repository.interface.ts`
- Create: `back/src/main/infra/orm/repositories/arsIndicator.repository.ts`
- Create: `back/src/main/types/domain/arsIndicator.domain.interface.ts`
- Create: `back/src/main/domain/arsIndicator.domain.ts`
- Create: `back/src/main/interfaces/http/fastify/schemas/arsIndicator.schema.ts`
- Create: `back/src/main/interfaces/http/fastify/routes/arsIndicator.ts`
- Create: `back/src/test/e2e/indicateurs-ars.test.ts`
- Modify: `back/src/main/interfaces/http/fastify/routes/tenant.routes.ts`
- Modify: `back/src/main/application/ioc/awilix/awilix-ioc-container.ts`
- Modify: `back/src/main/types/application/ioc.ts`
- Modify: `back/src/test/e2e/permissions.test.ts`

**Interfaces:**
- Consumes: `ArsFile`, `ArsIndicatorResult`, `computeArsIndicators` (tâches 2 à 4) ; `'stats:read'` (tâche 1).
- Produces:
  - `ArsIndicatorRepositoryInterface { findCohort(): Promise<ArsFile[]>; findServiceName(): Promise<string> }`
  - `ArsRange = { from: Date; to: Date }` et `ArsIndicatorDomainInterface { findAll(range): Promise<ArsIndicatorResult[]> }`
  - clés IoC `arsIndicatorRepository` et `arsIndicatorDomain`
  - route `GET {TENANT_PREFIX}/indicateurs-ars`

- [ ] **Step 1: Écrire les tests e2e qui échouent**

Créer `back/src/test/e2e/indicateurs-ars.test.ts` :

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

describe('indicateurs ARS', () => {
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
      email: 'coordo@test.fr',
      memberships: [
        {
          establishmentId,
          services: [
            { serviceId: serviceA, role: 'COORDINATEUR' },
            { serviceId: serviceB, role: 'COORDINATEUR' },
          ],
        },
      ],
    })
    cookies = await signIn(t.app, 'coordo@test.fr')
  })

  afterAll(async () => {
    await t.close()
    await testDb.$disconnect()
  })

  const lire = async (serviceId: string) =>
    t.app.inject({
      method: 'GET',
      url: tenantUrl(
        establishmentId,
        serviceId,
        '/indicateurs-ars?from=2026-01-01&to=2026-12-31',
      ),
      cookies,
    })

  // Review Focus 5 : un dossier du service B ne compte jamais dans les chiffres du service A.
  it('ne compte que les dossiers du service courant', async () => {
    const patient = await testDb.patient.create({
      data: {
        establishmentId,
        firstName: 'Alex',
        lastName: 'Martin',
        createDate: new Date(),
      },
    })
    await testDb.patientServiceFile.create({
      data: {
        establishmentId,
        serviceId: serviceB,
        patientId: patient.id,
        entryDate: new Date('2026-03-01'),
      },
    })

    const vide = await lire(serviceA)
    const plein = await lire(serviceB)

    expect(vide.statusCode).toBe(200)
    const indicateurA = vide.json().indicators.find(
      (i: { code: string }) => i.code === '1.1',
    )
    const indicateurB = plein.json().indicators.find(
      (i: { code: string }) => i.code === '1.1',
    )
    expect(indicateurA.value).toBe(0)
    expect(indicateurB.value).toBe(1)
  })

  it('rend les 30 indicateurs', async () => {
    const res = await lire(serviceA)
    expect(res.statusCode).toBe(200)
    expect(res.json().indicators).toHaveLength(30)
  })

  // Review Focus 3 : une période à l'envers est refusée, pas rendue vide en silence.
  it('refuse une periode dont la fin precede le debut', async () => {
    const res = await t.app.inject({
      method: 'GET',
      url: tenantUrl(
        establishmentId,
        serviceA,
        '/indicateurs-ars?from=2026-12-31&to=2026-01-01',
      ),
      cookies,
    })
    expect(res.statusCode).toBe(400)
  })
})
```

Ajouter aussi la sonde dans le tableau `probes` de `back/src/test/e2e/permissions.test.ts` :

```ts
  {
    permission: 'stats:read',
    method: 'GET',
    path: '/indicateurs-ars?from=2026-01-01&to=2026-12-31',
    heldStatus: 200,
  },
```

- [ ] **Step 2: Lancer les tests et vérifier qu'ils échouent**

Run: `cd back && npx jest -c src/test/jest.config.ts src/test/e2e/indicateurs-ars.test.ts`
Expected: FAIL — 404 sur toutes les lectures, la route n'existe pas encore.

- [ ] **Step 3: Écrire le contrat du dépôt**

Créer `back/src/main/types/infra/orm/repositories/arsIndicator.repository.interface.ts` :

```ts
import type { ArsFile } from '../../../../utils/ars-indicators'

export interface ArsIndicatorRepositoryInterface {
  findCohort: () => Promise<ArsFile[]>
  findServiceName: () => Promise<string>
}
```

- [ ] **Step 4: Écrire le dépôt**

Créer `back/src/main/infra/orm/repositories/arsIndicator.repository.ts` :

```ts
import type { IocContainer } from '../../../types/application/ioc'
import type { ArsIndicatorRepositoryInterface } from '../../../types/infra/orm/repositories/arsIndicator.repository.interface'
import type { TenantContextInterface } from '../../../types/utils/tenant-context'
import type { ArsFile } from '../../../utils/ars-indicators'
import type { PostgresPrismaClient } from '../postgres-client'

// Pas de borne de date basse : plusieurs indicateurs remontent jusqu'à la date d'entrée, qui
// précède souvent la période demandée.
// ponytail: charge tout le service en mémoire ; filtrer en base si un service pèse trop.
class ArsIndicatorRepository implements ArsIndicatorRepositoryInterface {
  private readonly prisma: PostgresPrismaClient
  private readonly tenantContext: TenantContextInterface

  constructor({ postgresOrm, tenantContext }: IocContainer) {
    this.prisma = postgresOrm.prisma
    this.tenantContext = tenantContext
  }

  private get scope() {
    return this.tenantContext.scope()
  }

  async findCohort(): Promise<ArsFile[]> {
    const { serviceId } = this.scope
    const files = await this.prisma.patientServiceFile.findMany({
      where: this.scope,
      select: {
        patientId: true,
        entryDate: true,
        orientation: true,
        patient: {
          select: {
            appointmentPatients: {
              // Isolation : les rendez-vous du patient dans un AUTRE service ne comptent pas.
              where: { serviceId },
              select: {
                status: true,
                accompanying: true,
                appointment: {
                  select: {
                    startDate: true,
                    type: true,
                    slotID: true,
                    thematic: { select: { name: true } },
                    slot: {
                      select: {
                        slotTemplate: {
                          select: {
                            isIndividual: true,
                            thematic: { select: { name: true } },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    })

    return files.map((f) => ({
      patientId: f.patientId,
      entryDate: f.entryDate,
      orientation: f.orientation,
      presences: f.patient.appointmentPatients.map((ap) => ({
        date: ap.appointment.startDate,
        type: ap.appointment.type,
        individual: ap.appointment.slot.slotTemplate.isIndividual,
        slotId: ap.appointment.slotID,
        thematicName:
          ap.appointment.thematic?.name ??
          ap.appointment.slot.slotTemplate.thematic?.name ??
          null,
        honored: ap.status === 'yes',
        accompanied: ap.accompanying === 'Oui',
      })),
    }))
  }

  async findServiceName(): Promise<string> {
    const { serviceId, establishmentId } = this.scope
    const service = await this.prisma.service.findUniqueOrThrow({
      where: { id_establishmentId: { id: serviceId, establishmentId } },
      select: { name: true },
    })
    return service.name
  }
}

export { ArsIndicatorRepository }
```

- [ ] **Step 5: Câbler dans le conteneur**

Dans `back/src/main/types/application/ioc.ts`, ajouter près de la ligne `readonly thematicRepository`, en respectant l'ordre alphabétique du bloc :

```ts
  readonly arsIndicatorRepository: ArsIndicatorRepositoryInterface
```

avec l'import de type correspondant en tête de fichier.

Dans `back/src/main/application/ioc/awilix/awilix-ioc-container.ts`, importer `ArsIndicatorRepository` et ajouter, près des autres `register` de dépôts :

```ts
    this.register(
      'arsIndicatorRepository',
      asClass(ArsIndicatorRepository).singleton(),
    )
```

- [ ] **Step 6: Écrire le contrat du domaine**

Créer `back/src/main/types/domain/arsIndicator.domain.interface.ts` :

```ts
import type { ArsIndicatorResult } from '../../utils/ars-indicators'

export type ArsRange = { from: Date; to: Date }

export interface ArsIndicatorDomainInterface {
  findAll: (range: ArsRange) => Promise<ArsIndicatorResult[]>
}
```

- [ ] **Step 7: Écrire le domaine**

Créer `back/src/main/domain/arsIndicator.domain.ts` :

```ts
import type { IocContainer } from '../types/application/ioc'
import type {
  ArsIndicatorDomainInterface,
  ArsRange,
} from '../types/domain/arsIndicator.domain.interface'
import type { ArsIndicatorRepositoryInterface } from '../types/infra/orm/repositories/arsIndicator.repository.interface'
import {
  type ArsIndicatorResult,
  computeArsIndicators,
} from '../utils/ars-indicators'

class ArsIndicatorDomain implements ArsIndicatorDomainInterface {
  private readonly arsIndicatorRepository: ArsIndicatorRepositoryInterface

  constructor({ arsIndicatorRepository }: IocContainer) {
    this.arsIndicatorRepository = arsIndicatorRepository
  }

  async findAll({ from, to }: ArsRange): Promise<ArsIndicatorResult[]> {
    const files = await this.arsIndicatorRepository.findCohort()
    return computeArsIndicators({ from, to, files })
  }
}

export { ArsIndicatorDomain }
```

- [ ] **Step 8: Écrire le schéma Zod**

Créer `back/src/main/interfaces/http/fastify/schemas/arsIndicator.schema.ts` :

```ts
import { z } from 'zod'

export const arsIndicatorQuerySchema = z
  .object({
    from: z.coerce.date(),
    to: z.coerce.date(),
  })
  .refine((q) => q.from <= q.to, {
    message: 'La date de début doit précéder la date de fin',
  })

export type ArsIndicatorQuery = z.infer<typeof arsIndicatorQuerySchema>

export const arsIndicatorsResponseSchema = z.object({
  from: z.string(),
  to: z.string(),
  indicators: z.array(
    z.object({
      code: z.string(),
      group: z.string(),
      label: z.string(),
      value: z.number().nullable(),
      note: z.string().nullable(),
    }),
  ),
})
```

- [ ] **Step 9: Écrire la route**

Créer `back/src/main/interfaces/http/fastify/routes/arsIndicator.ts` :

```ts
import type { FastifyPluginAsync } from 'fastify'

import {
  type ArsIndicatorQuery,
  arsIndicatorQuerySchema,
  arsIndicatorsResponseSchema,
} from '../schemas/arsIndicator.schema'

// Indicateurs de l'enquête annuelle ARS du service courant : chiffres agrégés, aucune donnée
// nominative (MDS-26).
const arsIndicatorRouter: FastifyPluginAsync = (fastify) => {
  const { arsIndicatorDomain } = fastify.iocContainer

  fastify.get<{ Querystring: ArsIndicatorQuery }>(
    '/',
    {
      schema: {
        querystring: arsIndicatorQuerySchema,
        response: { 200: arsIndicatorsResponseSchema },
      },
      config: { permission: 'stats:read' },
    },
    async (request) => {
      const { from, to } = request.query
      return {
        from: from.toISOString().slice(0, 10),
        to: to.toISOString().slice(0, 10),
        indicators: await arsIndicatorDomain.findAll({ from, to }),
      }
    },
  )

  return Promise.resolve()
}

export { arsIndicatorRouter }
```

- [ ] **Step 10: Monter la route et câbler le domaine**

Dans `back/src/main/interfaces/http/fastify/routes/tenant.routes.ts`, importer `arsIndicatorRouter` et ajouter après la ligne `serviceMembersRouter` :

```ts
  await fastify.register(arsIndicatorRouter, { prefix: '/indicateurs-ars' })
```

Dans `types/application/ioc.ts`, ajouter `readonly arsIndicatorDomain: ArsIndicatorDomainInterface` et son import. Dans `awilix-ioc-container.ts`, importer `ArsIndicatorDomain` et ajouter :

```ts
    this.register('arsIndicatorDomain', asClass(ArsIndicatorDomain).singleton())
```

- [ ] **Step 11: Lancer les tests e2e**

Run: `cd back && npx jest -c src/test/jest.config.ts src/test/e2e/indicateurs-ars.test.ts src/test/e2e/permissions.test.ts`
Expected: PASS. Les trois cas de `indicateurs-ars.test.ts` (isolation, 30 indicateurs, période à l'envers) et la nouvelle sonde `stats:read` sur les quatre rôles.

- [ ] **Step 12: Build et lint**

Run: `cd back && npm run build && npm run lint`
Expected: aucune erreur.

- [ ] **Step 13: Commit**

```bash
git add back/src/main back/src/test/e2e
git commit -m "feat(ars): route de lecture des indicateurs ARS du service (MDS-26)"
```

---

### Task 6 : export tableur

**Files:**
- Modify: `back/src/main/domain/arsIndicator.domain.ts`
- Modify: `back/src/main/types/domain/arsIndicator.domain.interface.ts`
- Modify: `back/src/main/interfaces/http/fastify/routes/arsIndicator.ts`
- Modify: `back/src/test/e2e/indicateurs-ars.test.ts`

**Interfaces:**
- Consumes: `findAll`, `findServiceName` (tâche 5).
- Produces: `exportExcel(range: ArsRange): Promise<Buffer>` sur le domaine ; route `GET {TENANT_PREFIX}/indicateurs-ars/export`.

- [ ] **Step 1: Écrire le test qui échoue**

Ajouter à `back/src/test/e2e/indicateurs-ars.test.ts` :

```ts
  it('rend un classeur nomme par le service et la periode', async () => {
    const res = await t.app.inject({
      method: 'GET',
      url: tenantUrl(
        establishmentId,
        serviceA,
        '/indicateurs-ars/export?from=2026-01-01&to=2026-12-31',
      ),
      cookies,
    })
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toContain('spreadsheetml')
    expect(res.rawPayload.length).toBeGreaterThan(0)
    expect(res.headers['content-disposition']).toContain(
      'indicateurs-ars_2026-01-01_2026-12-31.xlsx',
    )
  })
```

- [ ] **Step 2: Lancer le test et vérifier qu'il échoue**

Run: `cd back && npx jest -c src/test/jest.config.ts src/test/e2e/indicateurs-ars.test.ts -t "classeur"`
Expected: FAIL — 404.

- [ ] **Step 3: Ajouter `exportExcel` au contrat**

Dans `back/src/main/types/domain/arsIndicator.domain.interface.ts` :

```ts
export interface ArsIndicatorDomainInterface {
  findAll: (range: ArsRange) => Promise<ArsIndicatorResult[]>
  exportExcel: (range: ArsRange) => Promise<Buffer>
}
```

- [ ] **Step 4: Implémenter l'export**

Dans `back/src/main/domain/arsIndicator.domain.ts`, ajouter l'import `import * as XLSX from 'xlsx'` et la méthode :

```ts
  async exportExcel(range: ArsRange): Promise<Buffer> {
    const [indicators, serviceName] = await Promise.all([
      this.findAll(range),
      this.arsIndicatorRepository.findServiceName(),
    ])

    const periode = `${range.from.toISOString().slice(0, 10)} au ${range.to
      .toISOString()
      .slice(0, 10)}`
    const rows = [
      { Code: 'Service', Libellé: serviceName, Valeur: '' },
      { Code: 'Période', Libellé: periode, Valeur: '' },
      { Code: '', Libellé: '', Valeur: '' },
      ...indicators.map((i) => ({
        Code: i.code,
        Libellé: i.label,
        Valeur: i.value ?? (i.note ?? ''),
      })),
    ]

    const ws = XLSX.utils.json_to_sheet(rows)
    ws['!cols'] = [{ wch: 10 }, { wch: 90 }, { wch: 40 }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Indicateurs ARS')
    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
  }
```

- [ ] **Step 5: Ajouter la route d'export**

Dans `back/src/main/interfaces/http/fastify/routes/arsIndicator.ts`, après la route de lecture :

```ts
  // Le classeur est un Buffer : pas de `response` Zod, la sérialisation JSON ne s'y applique pas.
  fastify.get<{ Querystring: ArsIndicatorQuery }>(
    '/export',
    {
      schema: { querystring: arsIndicatorQuerySchema },
      config: { permission: 'stats:read' },
    },
    async (request, reply) => {
      const { from, to } = request.query
      const buffer = await arsIndicatorDomain.exportExcel({ from, to })
      const nom = `indicateurs-ars_${from.toISOString().slice(0, 10)}_${to
        .toISOString()
        .slice(0, 10)}.xlsx`
      await reply
        .header(
          'Content-Type',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        )
        .header('Content-Disposition', `attachment; filename="${nom}"`)
        .send(buffer)
    },
  )
```

- [ ] **Step 6: Lancer les tests**

Run: `cd back && npx jest -c src/test/jest.config.ts src/test/e2e/indicateurs-ars.test.ts`
Expected: PASS, les quatre cas.

- [ ] **Step 7: Build et lint**

Run: `cd back && npm run build && npm run lint`
Expected: aucune erreur.

- [ ] **Step 8: Commit**

```bash
git add back/src/main back/src/test/e2e/indicateurs-ars.test.ts
git commit -m "feat(ars): export tableur des indicateurs ARS (MDS-26)"
```

---

### Task 7 : page front et entrée de navigation

**Files:**
- Create: `front/src/types/arsIndicator.ts`
- Create: `front/src/api/arsIndicator.api.ts`
- Create: `front/src/queries/useArsIndicator.ts`
- Create: `front/src/routes/_authenticated/e/$establishmentId/s/$serviceId/indicateurs-ars.tsx`
- Modify: `front/src/constants/process.constant.ts`
- Modify: `front/src/navigation/navigation.ts`

**Interfaces:**
- Consumes: `GET /e/:establishmentId/s/:serviceId/indicateurs-ars` et `/export` (tâches 5 et 6) ; `tenantApiUrl()` ; `can()` ; `'stats:read'` (tâche 1).
- Produces: route `/e/$establishmentId/s/$serviceId/indicateurs-ars`.

`front/src/navigation/navigation.test.ts` exige qu'un écran de section figure dans `NAVIGATION` ou dans `HORS_ONGLETS`. Omettre l'entrée fait rougir ce test — c'est le garde-fou, pas une option.

- [ ] **Step 1: Écrire les types et l'appel réseau**

Créer `front/src/types/arsIndicator.ts` :

```ts
export type ArsIndicator = {
  code: string
  group: string
  label: string
  value: number | null
  note: string | null
}

export type ArsIndicators = {
  from: string
  to: string
  indicators: ArsIndicator[]
}
```

Créer `front/src/api/arsIndicator.api.ts` :

```ts
import { tenantApiUrl } from '@/constants/config.constant.ts'
import { handleHttpError } from '@/libs/httpErrorHandler.ts'
import type { ArsIndicators } from '@/types/arsIndicator.ts'
import { fetchWithAuth } from './fetchWithAuth.ts'

const url = (from: string, to: string) =>
  `${tenantApiUrl()}/indicateurs-ars?from=${from}&to=${to}`

export const ArsIndicatorApi = {
  get: async (from: string, to: string): Promise<ArsIndicators> => {
    const response = await fetchWithAuth(url(from, to))
    if (!response.ok) {
      handleHttpError(response, {}, 'Impossible de charger les indicateurs ARS')
    }
    return await response.json()
  },

  exportExcel: async (from: string, to: string): Promise<Blob> => {
    const response = await fetchWithAuth(
      `${tenantApiUrl()}/indicateurs-ars/export?from=${from}&to=${to}`,
    )
    if (!response.ok) {
      handleHttpError(response, {}, "Impossible d'exporter les indicateurs ARS")
    }
    return await response.blob()
  },
}
```

Vérifier la signature exacte de `handleHttpError` dans `front/src/libs/httpErrorHandler.ts` et l'aligner si elle diffère.

- [ ] **Step 2: Écrire la requête**

Ajouter à `front/src/constants/process.constant.ts`, sur le modèle des constantes voisines :

```ts
export const ARS_INDICATOR = {
  GET: 'ARS_INDICATOR_GET',
}
```

Créer `front/src/queries/useArsIndicator.ts` :

```ts
import { useQuery } from '@tanstack/react-query'

import { ArsIndicatorApi } from '../api/arsIndicator.api.ts'
import { ARS_INDICATOR } from '../constants/process.constant.ts'

export const useArsIndicatorsQuery = (year: number) => {
  const from = `${year}-01-01`
  const to = `${year}-12-31`
  const { data, isPending, isError } = useQuery({
    queryKey: [ARS_INDICATOR.GET, year],
    queryFn: () => ArsIndicatorApi.get(from, to),
    retry: 0,
  })
  return { indicators: data?.indicators ?? [], isPending, isError, from, to }
}
```

- [ ] **Step 3: Écrire la page**

Créer `front/src/routes/_authenticated/e/$establishmentId/s/$serviceId/indicateurs-ars.tsx` :

```tsx
import { createFileRoute, redirect } from '@tanstack/react-router'
import { useState } from 'react'

import DashboardLayout from '@/components/dashboard.layout.tsx'
import { Button } from '@/components/ui/button.tsx'
import { can } from '@/hooks/useCan.ts'
import { ArsIndicatorApi } from '@/api/arsIndicator.api.ts'
import { useArsIndicatorsQuery } from '@/queries/useArsIndicator.ts'
import { resolveTenantContext } from '@/utils/tenant-context.ts'

// Indicateurs de l'enquête annuelle ARS, en chiffres agrégés (MDS-26). Même garde et même
// redirection que `patient/$patientID/acces.tsx` : le contexte reste valide, seule la permission
// manque.
export const Route = createFileRoute(
  '/_authenticated/e/$establishmentId/s/$serviceId/indicateurs-ars',
)({
  beforeLoad: ({ context, params }) => {
    const tenant = resolveTenantContext(context.authState.user, params)
    if (!can(tenant, 'stats:read')) {
      throw redirect({
        to: '/e/$establishmentId/s/$serviceId/dashboard',
        params,
      })
    }
  },
  component: ArsIndicatorsPage,
})

const GROUPES = ['Entrée', 'Séances', 'Sortie', 'Modalités'] as const

function ArsIndicatorsPage() {
  const [year, setYear] = useState(new Date().getFullYear())
  const { indicators, isPending, from, to } = useArsIndicatorsQuery(year)

  const telecharger = async () => {
    const blob = await ArsIndicatorApi.exportExcel(from, to)
    const href = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = href
    a.download = `indicateurs-ars_${from}_${to}.xlsx`
    a.click()
    URL.revokeObjectURL(href)
  }

  const annees = Array.from({ length: 6 }, (_, i) => new Date().getFullYear() - i)

  return (
    <DashboardLayout>
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold">Indicateurs ARS</h1>
        <div className="flex items-center gap-2">
          <select
            aria-label="Année"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="h-9 rounded-md border border-(--color-border) px-2"
          >
            {annees.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
          <Button onClick={telecharger} disabled={isPending}>
            Exporter
          </Button>
        </div>
      </div>

      {isPending ? (
        <p className="mt-6">Chargement…</p>
      ) : (
        GROUPES.map((groupe) => (
          <section key={groupe} className="mt-8">
            <h2 className="mb-2 text-lg font-medium">{groupe}</h2>
            <table className="w-full text-sm">
              <tbody>
                {indicators
                  .filter((i) => i.group === groupe)
                  .map((i) => (
                    <tr
                      key={i.code}
                      className={i.note ? 'text-(--color-muted-foreground)' : ''}
                    >
                      <td className="w-16 py-1 align-top font-mono">{i.code}</td>
                      <td className="py-1 align-top">{i.label}</td>
                      <td className="w-64 py-1 text-right align-top">
                        {i.value ?? i.note}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </section>
        ))
      )}
    </DashboardLayout>
  )
}
```

Aligner les classes utilitaires sur celles qu'emploient `suivi.tsx` et `patient/$patientID/acces.tsx` si elles diffèrent : ce dépôt a ses conventions de style, les reprendre plutôt qu'en inventer.

- [ ] **Step 4: Ajouter l'entrée de navigation**

Dans `front/src/navigation/navigation.ts`, dans `NAVIGATION.service`, après l'entrée `Salles` :

```ts
    {
      label: 'Indicateurs ARS',
      to: '/e/$establishmentId/s/$serviceId/indicateurs-ars',
      permission: 'stats:read',
      group: 'Administration',
      description: "Chiffres agrégés de l'enquête annuelle",
    },
```

- [ ] **Step 5: Lancer les tests front**

Run: `cd front && npx vitest run src/navigation/navigation.test.ts`
Expected: PASS — `donne un onglet, ou une raison ecrite, a chaque ecran des trois echelles` reste vert, la nouvelle route étant déclarée.

- [ ] **Step 6: Lancer toute la suite front et le lint**

Run: `cd front && npx vitest run && npm run lint`
Expected: PASS, aucune erreur de lint, aucun `biome-ignore` ajouté.

- [ ] **Step 7: Vérifier dans l'application**

Démarrer le front sur le port 4270 (le seul serveur de dev possible), se connecter avec un compte coordinateur, ouvrir le menu Administration, cliquer « Indicateurs ARS », vérifier que les quatre blocs s'affichent et que l'export télécharge un fichier ouvrable.

- [ ] **Step 8: Commit**

```bash
git add front/src
git commit -m "feat(ars): ecran indicateurs ARS du service (MDS-26)"
```

---

## Validation finale

- [ ] **Lancer la validation complète du back**

Run: `cd back && npm run validate`
Expected: `deps:check`, `build`, `lint` et `cover` au vert.

- [ ] **Lancer la suite front**

Run: `cd front && npx vitest run && npm run lint`
Expected: au vert.

- [ ] **Mettre à jour le graphe de connaissance**

Run: `graphify update .`
