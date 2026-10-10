# Fiche patient configurable par service — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** le coordinateur d'un service définit lui-même les champs des onglets *Parcours & Inclusion* et *Sortie & Bilan* de la fiche patient ; les dix champs ETP actuels deviennent la configuration initiale des services existants, sans perte de données.

**Architecture:** deux tables de définitions (`ServiceFieldDefinition`, `ServiceFieldChoice`) et deux colonnes JSON sur `PatientServiceFile` : `data` pour les valeurs ordinaires, `clinicalData` pour les valeurs des champs cliniques. Cette seconde colonne laisse le crochet de filtrage clinique existant (par nom de clé, refus par défaut) couvrir les champs configurables sans aucune requête supplémentaire. Un registre de types côté back valide chaque écriture ; un registre de types côté front rend formulaire, colonnes, filtres. L'export Excel et la liste des patients se construisent depuis les définitions.

**Tech Stack:** Node 24, Fastify 5, Prisma 7 (sortie `src/generated`), Zod v4, Jest 30 côté back ; React 19, Vite, TanStack Router/Query/Form/Table, Vitest côté front. Biome, wireit.

**Spec:** `docs/superpowers/specs/2026-10-10-fiche-patient-configurable-design.md`

## Écarts à la spec, décidés en écrivant ce plan

Ils sont reportés dans la spec par la tâche 1.

1. **`clinicalData` en seconde colonne JSON** au lieu d'une seule colonne `data`. Le filtrage clinique (`utils/clinical-fields.ts`, crochets `stripClinicalFields` / `stripClinicalInput`) retire les clés **par leur nom**, à toute profondeur, sans requête : ajouter `clinicalData` à `CLINICAL_FIELDS` suffit à le retirer en lecture et en écriture pour qui n'a pas le droit, sur toutes les routes, y compris les futures. Filtrer des clés de `data` selon les définitions aurait demandé une requête par réponse dans un crochet de sérialisation.
2. **`clinical` figé après création**, comme `key` et `type` : changer ce drapeau obligerait à déplacer les valeurs d'une colonne à l'autre.
3. **`ServiceFieldChoice` porte `serviceId` et `establishmentId`** : le garde-fou d'ORM classe tout modèle comme modèle de service ou modèle global, et un choix n'est pas global.
4. **Oui/Non se saisit par une liste Oui / Non effaçable**, pas par un interrupteur : un interrupteur ne sait pas dire « non renseigné », et confondre « non » et « non renseigné » fausserait les futurs indicateurs.
5. **Pas de filtre par plage de dates** dans ce chantier : la colonne « Date de sortie » existante n'en a pas non plus. Les dates sont triables.
6. **`STOP_REASON` reste dans `patient.constant.ts`** jusqu'au chantier 2 : l'écran d'activité s'en sert pour libeller les motifs d'abandon.

## Global Constraints

- **Ne jamais migrer, réinitialiser ni écrire dans la base `medisync`** : c'est la base de développement de Léo, avec de vraies données. Tests sur `medisync_test` (`.env.test`) ; répétition de migration sur une copie jetable.
- **Ne jamais démarrer de serveur de développement.** Le port 4270 (front) et 3000 (back) appartiennent à Léo. **Jamais de `pkill` large** : tuer un processus par PID.
- **Jamais de `git stash`** : la pile est partagée avec d'autres sessions.
- Lint et format **Biome uniquement**, sur les fichiers touchés : `npx biome check --write <fichiers>`. **Jamais de `biome-ignore`**.
- **Aucune assertion de type ni de non-nullité** pour faire taire le compilateur (`as`, `!`) hors des patrons déjà présents dans le fichier modifié.
- Commentaires : **une ligne ou rien**, en français. Messages de commit en français.
- Le garde-fou d'ORM **échoue fermé** : si une lecture tombe, on corrige l'appel, jamais le garde-fou. Pas de SQL brut (`$queryRaw`, `$executeRaw`) dans un repository : il échapperait au garde-fou.
- Aucune permission nouvelle : `back/src/main/utils/permissions.ts` et `front/src/utils/permissions.ts` ne changent pas.
- Valeurs de choix stockées = **clés** (`ORIENTATION_PRO_SANTE_EXT`), jamais les libellés.
- Travail dans le worktree `.claude/worktrees/fiche-configurable` (branche `worktree-fiche-configurable`). Avant tout test : copier `back/.env`, `back/.env.test`, `back/.env.test.local` et `front/.env` depuis `/Users/couffinhal/Documents/MediSync`, puis `npm ci` dans `back/` et `front/`, puis `cd back && npm run prisma:generate`.
- **Commandes de test back** :
  - unitaires : `cd back && NODE_OPTIONS=--experimental-vm-modules npx jest -c src/test/jest.config.ts --selectProjects unit`
  - e2e : `cd back && npm run prisma:migrate:deploy:test && NODE_OPTIONS=--experimental-vm-modules npx dotenv-cli@7.3.0 -e .env.test.local -e .env.test -- npx jest --runInBand -c src/test/jest.config.ts --selectProjects e2e`
  - un seul fichier : ajouter son chemin en fin de commande.
- **Portes de fin de tâche** : `cd back && npm run build && npm run lint` et `cd front && npm run build && npx vitest run`. `cd front && npm run lint` échoue déjà sur `main` : le critère est que la branche n'ajoute aucune erreur (`npx biome lint src` comparé à `/Users/couffinhal/Documents/MediSync/front`).

## Review Focus

1. **Secrétariat qui enregistre une fiche contenant un champ clinique** : la valeur clinique en base doit rester intacte, ni effacée ni écrasée — `clinicalData` retiré du corps par le crochet (test e2e tâche 5).
2. **Deux soignants qui enregistrent la même fiche en même temps, sur deux champs différents** : aucune des deux saisies ne doit disparaître (test unitaire de la boucle optimiste, tâche 5).
3. **Vieux dossier dont la valeur est un choix archivé, réenregistré sans y toucher** : l'enregistrement doit réussir ; un front qui renverrait la valeur inchangée ne doit pas prendre une 400 (test tâche 5). Côté front, seuls les champs modifiés partent, ce qui couvre le cas courant.
4. **Valeur existante absente des constantes (saisie libre héritée de l'import Draxa)** : elle doit survivre à la migration, s'afficher et rester filtrable (test de migration, tâche 3).
5. **Champ vidé dans le formulaire** (texte effacé, choix multiple vidé) : la clé doit disparaître de `data`, pas rester à `""` ou `[]` qui compteraient comme « renseigné » dans les filtres et les futurs indicateurs (test tâche 2, normalisation dans `mergeFieldPatch`).

---

## Structure des fichiers

**Créés (back)**

| Fichier | Responsabilité |
|---|---|
| `back/src/main/utils/etp-field-preset.ts` | Catalogue des dix champs ETP et de leurs choix : source du seed et référence du test de migration. |
| `back/src/main/utils/service-field-types.ts` | Registre de types : validation d'une valeur, fusion d'un correctif partiel, génération de clés. |
| `back/prisma/migrations/20261010120000_service_fields/migration.sql` | Tables, colonnes JSON, recopie, garde, suppression des dix colonnes. |
| `back/src/main/infra/orm/repositories/serviceField.repository.ts` + interface | Accès Prisma aux définitions et choix, filtré par service. |
| `back/src/main/domain/serviceField.domain.ts` + interface | Création (génération de clé, ordre), modification (champs figés), archivage, réordonnancement. |
| `back/src/main/interfaces/http/fastify/schemas/serviceField.schema.ts` | Validation Zod des routes de définitions. |
| `back/src/main/interfaces/http/fastify/routes/serviceField.ts` | Routes `/service-fields`. |
| `back/src/test/unit/utils/service-field-types.test.ts` | Registre de types. |
| `back/src/test/unit/migrations/service-fields.migration.test.ts` | La vraie migration jouée sur une base jetable. |
| `back/src/test/e2e/service-fields.test.ts` | Routes de définitions, écriture de fiche, droits. |

**Créés (front)**

| Fichier | Responsabilité |
|---|---|
| `front/src/types/serviceField.ts` | Types des définitions. |
| `front/src/api/serviceField.api.ts`, `front/src/queries/useServiceField.ts` | Accès aux définitions. |
| `front/src/constants/serviceFieldTypes.tsx` | Registre de types : composant de formulaire, colonne, valeur vide. |
| `front/src/components/custom/Patient/edit/serviceFields.patient.tsx` | Rendu des champs configurés d'une section. |
| `front/src/routes/_authenticated/e/$establishmentId/s/$serviceId/_settings/fiche-patient.tsx` | Écran d'administration. |
| `front/src/components/custom/popup/serviceFieldForm.tsx` | Popup de création / modification d'un champ. |

**Modifiés** : `back/prisma/schema.prisma`, `tenant-guard.ts`, `clinical-fields.ts`, `patientServiceFile.*`, `patient.repository.ts`, `patient.domain.ts`, `patient.schema.ts`, `arsIndicator.repository.ts`, `tenant.routes.ts`, l'ioc, `prisma/seed/patient.ts`, `prisma/seed/data/patient.ts` ; `front/src/types/patient.ts`, `types/patientServiceFile.ts`, `columns/patient.column.tsx`, `components/table/choiceColumn.tsx`, `components/custom/Patient/edit/*`, `constants/patient.constant.ts`, `navigation/navigation.ts`.

---

### Task 1 : catalogue ETP, registre de types back, spec à jour

**Files:**
- Create: `back/src/main/utils/etp-field-preset.ts`
- Create: `back/src/main/utils/service-field-types.ts`
- Test: `back/src/test/unit/utils/service-field-types.test.ts`
- Modify: `docs/superpowers/specs/2026-10-10-fiche-patient-configurable-design.md`

**Interfaces:**
- Produces:
  - `ETP_FIELD_PRESET: readonly EtpFieldPreset[]` avec `EtpFieldPreset = { key: string; label: string; type: 'choice' | 'longtext'; section: 'pathway' | 'outcome'; clinical: boolean; choices: readonly { key: string; label: string }[] }`
  - `SERVICE_FIELD_TYPES`, `type ServiceFieldType`, `SERVICE_FIELD_SECTIONS`, `type ServiceFieldSection`
  - `type FieldDefinitionForValidation = { key: string; type: ServiceFieldType; clinical: boolean; archivedAt: Date | null; choices: { key: string; archivedAt: Date | null }[] }`
  - `mergeFieldPatch(definitions, current: FieldValues, patch: Record<string, unknown>, clinical: boolean): FieldValues` — lève `Boom.badRequest` ; `type FieldValues = Record<string, unknown>`
  - `fieldKeyFromLabel(label: string, taken: ReadonlySet<string>): string` (camelCase) et `choiceKeyFromLabel(label: string, taken: ReadonlySet<string>): string` (MAJUSCULES_SOULIGNÉES)

- [ ] **Step 1 : reporter les écarts dans la spec**

Dans la spec, appliquer les six écarts listés en tête de ce plan : §3 (seconde colonne `clinicalData Json @default("{}")`, `serviceId`/`establishmentId` sur `ServiceFieldChoice`, `clinical` figé), §5 (« Droits cliniques » : `clinicalData` ajouté à `CLINICAL_FIELDS`, plus de filtrage par définition ; `PATCH` refuse aussi `clinical`), §6 (Oui/Non en liste ; pas de filtre de dates ; `STOP_REASON` conservé). Une phrase par écart, pas plus.

- [ ] **Step 2 : écrire le catalogue ETP**

`back/src/main/utils/etp-field-preset.ts` — recopie **exacte** des constantes de `front/src/constants/patient.constant.ts` (mêmes clés, mêmes libellés, même ordre, espaces doubles compris : `"Distance  d'habitation"`) :

```ts
// Configuration initiale des services existants : reprise exacte des constantes front d'avant la migration service_fields.
export type EtpFieldPreset = {
  key: string
  label: string
  type: 'choice' | 'longtext'
  section: 'pathway' | 'outcome'
  clinical: boolean
  choices: readonly { key: string; label: string }[]
}

const choices = (dict: Record<string, string>) =>
  Object.entries(dict).map(([key, label]) => ({ key, label }))

export const ETP_FIELD_PRESET: readonly EtpFieldPreset[] = [
  {
    key: 'medicalDiagnosis',
    label: 'Diagnostic médical',
    type: 'choice',
    section: 'pathway',
    clinical: true,
    choices: choices({
      AOMI: 'AOMI',
      AVC: 'AVC',
      CORONAROPATHIE: 'CORONAROPATHIE',
      PREVENTION: 'PREVENTION',
    }),
  },
  {
    key: 'careMode',
    label: 'Mode de prise en charge',
    type: 'choice',
    section: 'pathway',
    clinical: false,
    choices: choices({ AMBU: 'Ambu', HDJ: 'HDJ', HDS: 'HDS', HOSPIT: 'Hospit' }),
  },
  {
    key: 'orientation',
    label: 'Orientation',
    type: 'choice',
    section: 'pathway',
    clinical: false,
    choices: choices({
      NS: 'NS',
      ORIENTATION_PRO_SANTE_HOSPIT: 'Orientation pro santé au cours hospit',
      ORIENTATION_PRO_SANTE_CS: 'Orientation pro santé en Cs',
      ORIENTATION_PRO_SANTE_EXT: 'Orientation pro santé ext hôpital',
      VENUE_SPONTANEE: 'Venue spontanée',
    }),
  },
  {
    key: 'etpDecision',
    label: 'ETP décision',
    type: 'choice',
    section: 'pathway',
    clinical: false,
    choices: choices({ NON: 'Non', OUI: 'Oui' }),
  },
  {
    key: 'programType',
    label: 'Type de programme',
    type: 'choice',
    section: 'pathway',
    clinical: false,
    choices: choices({ VIVA: 'ViVa', VIVA_AOMI: 'ViVa module AOMI' }),
  },
  {
    key: 'nonInclusionDetails',
    label: 'Précision non inclusion',
    type: 'choice',
    section: 'pathway',
    clinical: false,
    choices: choices({
      ABSENCE_BESOINS_EDUCATIFS: 'Absence de besoins éducatifs',
      ABSENCE_CRITERES_MEDICAUX: "Absence de critères médicaux d'inclusion",
      BARRIERE_LANGUE: 'Barrière de la langue',
      DISTANCE_HABITATION: "Distance  d'habitation",
      INDISPONIBILITE: 'Indisponibilité',
      MANQUE_MOTIVATION: 'Manque de motivation',
      NS: 'NS',
      PRISE_CHARGE_BESOINS_QUOTIDIENS: 'Prise en charge des besoins quotidiens',
      PROBLEME_SANTE: 'Problème de santé',
      PROBLEMES_MEDICAUX: 'Problèmes médicaux à régler',
      REFUS: 'Refus',
      TRANSPORT: 'Transport',
      TROUBLES_COGNITIFS: 'Troubles cognitifs',
      TROUBLES_PSYCHIATRIQUES: 'Troubles psychiatriques',
    }),
  },
  {
    key: 'customContentDetails',
    label: 'Précision contenu personnalisé',
    type: 'longtext',
    section: 'pathway',
    clinical: false,
    choices: [],
  },
  {
    key: 'goal',
    label: 'Objectif',
    type: 'longtext',
    section: 'pathway',
    clinical: false,
    choices: [],
  },
  {
    key: 'stopReason',
    label: "Motif d'arrêt de programme",
    type: 'choice',
    section: 'outcome',
    clinical: false,
    choices: choices({
      ABSENCE_BESOINS_EDUCATIFS: 'Absence besoins éducatifs',
      ABSENCE_CRITERES_MEDICAUX: "Absence de critères médicaux d'inclusion",
      BARRIERE_LANGUE: 'Barrière de la langue',
      DISTANCE_HABITATION: "Distance d'habitation",
      DECES: 'Décès',
      DEMENAGEMENT: 'Déménagement',
      INDISPONIBILITE: 'Indisponibilité',
      MANQUE_MOTIVATION: 'Manque de motivation',
      NS: 'NS',
      PERDU_DE_VUE: 'Perdu de vue',
      PLUS_BESOIN_FIN_PARCOURS: 'Plus de besoin/Fin de parcours',
      PRISE_CHARGE_BESOINS_QUOTIDIENS: 'Prise en charge besoins quotidiens',
      PROBLEME_SANTE: 'Problème de santé',
      PROBLEMES_MEDICAUX: 'Problèmes médicaux à régler',
      REFUS: 'Refus',
      SOUHAIT_ARRET: 'Souhait arrêt',
      TRANSPORT: 'Transport',
      TROUBLES_COGNITIFS: 'Troubles cognitifs',
      TROUBLES_PSYCHIATRIQUES: 'Troubles psychiatriques',
    }),
  },
  {
    key: 'etpFinalOutcome',
    label: 'Point final parcours ETP',
    type: 'choice',
    section: 'outcome',
    clinical: false,
    choices: choices({
      ATELIER: 'Atelier',
      ATELIER_INFORMATION: 'Atelier information',
      BCVS: 'BCVs',
      CONSULTATION: 'Consultation',
      DE: 'DE',
      ENTRETIEN_INDIVIDUEL: 'Entretien individuel',
      M12: 'M12',
      M3: 'M3',
      RENF1: 'Renf1',
      RENF2: 'Renf2',
      SUIVI_TELEPHONIQUE: 'Suivi téléphonique',
    }),
  },
]
```

Vérifier les libellés des deux champs texte long contre `front/src/components/custom/Patient/edit/pathway-inclusion.patient.tsx` (`label="Précision contenu personnalisé"`, `label="Objectif"`).

- [ ] **Step 3 : écrire les tests du registre (rouges)**

`back/src/test/unit/utils/service-field-types.test.ts` :

```ts
import {
  choiceKeyFromLabel,
  type FieldDefinitionForValidation,
  fieldKeyFromLabel,
  mergeFieldPatch,
} from '../../../main/utils/service-field-types'

const def = (
  over: Partial<FieldDefinitionForValidation> & { key: string },
): FieldDefinitionForValidation => ({
  type: 'text',
  clinical: false,
  archivedAt: null,
  choices: [],
  ...over,
})

const ARCHIVED = new Date('2026-01-01')
const defs = [
  def({ key: 'nom', type: 'text' }),
  def({ key: 'hba1c', type: 'number' }),
  def({ key: 'sortie', type: 'date' }),
  def({ key: 'tabac', type: 'boolean' }),
  def({
    key: 'orientation',
    type: 'choice',
    choices: [
      { key: 'A', archivedAt: null },
      { key: 'VIEUX', archivedAt: ARCHIVED },
    ],
  }),
  def({
    key: 'comorbidites',
    type: 'multichoice',
    choices: [
      { key: 'HTA', archivedAt: null },
      { key: 'DIABETE', archivedAt: null },
      { key: 'VIEUX', archivedAt: ARCHIVED },
    ],
  }),
  def({ key: 'diag', type: 'choice', clinical: true, choices: [{ key: 'AVC', archivedAt: null }] }),
  def({ key: 'ancien', archivedAt: ARCHIVED }),
]

const merge = (current: Record<string, unknown>, patch: Record<string, unknown>, clinical = false) =>
  mergeFieldPatch(defs, current, patch, clinical)

describe('mergeFieldPatch', () => {
  it('accepte une valeur valide par type', () => {
    expect(
      merge({}, {
        nom: 'Dupont',
        hba1c: 7.2,
        sortie: '2026-03-01',
        tabac: false,
        orientation: 'A',
        comorbidites: ['HTA', 'DIABETE'],
      }),
    ).toEqual({
      nom: 'Dupont',
      hba1c: 7.2,
      sortie: '2026-03-01',
      tabac: false,
      orientation: 'A',
      comorbidites: ['HTA', 'DIABETE'],
    })
  })

  it.each([
    ['nom', 3],
    ['hba1c', '7'],
    ['hba1c', Number.POSITIVE_INFINITY],
    ['sortie', '01/03/2026'],
    ['sortie', '2026-02-30'],
    ['tabac', 'oui'],
    ['orientation', 'INCONNU'],
    ['comorbidites', ['HTA', 'HTA']],
    ['comorbidites', 'HTA'],
  ])('refuse %s = %p', (key, value) => {
    expect(() => merge({}, { [key]: value })).toThrow(/invalide/)
  })

  it('garde les cles absentes du correctif et efface sur null, chaine vide ou liste vide', () => {
    expect(
      merge(
        { nom: 'A', hba1c: 7, comorbidites: ['HTA'], orientation: 'A' },
        { nom: '', comorbidites: [], orientation: null },
      ),
    ).toEqual({ hba1c: 7 })
  })

  it('accepte un choix archive deja present, refuse un choix archive nouveau', () => {
    expect(merge({ orientation: 'VIEUX' }, { orientation: 'VIEUX' })).toEqual({ orientation: 'VIEUX' })
    expect(() => merge({}, { orientation: 'VIEUX' })).toThrow(/invalide/)
    expect(merge({ comorbidites: ['VIEUX'] }, { comorbidites: ['VIEUX', 'HTA'] })).toEqual({
      comorbidites: ['VIEUX', 'HTA'],
    })
    expect(() => merge({ comorbidites: ['HTA'] }, { comorbidites: ['VIEUX'] })).toThrow(/invalide/)
  })

  it('refuse une cle inconnue, un champ archive, et un champ range dans la mauvaise colonne', () => {
    expect(() => merge({}, { inconnu: 'x' })).toThrow(/inconnu/)
    expect(() => merge({}, { ancien: 'x' })).toThrow(/archivé/)
    expect(() => merge({}, { diag: 'AVC' })).toThrow(/clinique/)
    expect(() => merge({}, { nom: 'x' }, true)).toThrow(/clinique/)
    expect(merge({}, { diag: 'AVC' }, true)).toEqual({ diag: 'AVC' })
  })

  it('ne modifie pas les objets recus', () => {
    const current = { nom: 'A' }
    merge(current, { nom: 'B' })
    expect(current).toEqual({ nom: 'A' })
  })
})

describe('generation de cles', () => {
  it('derive une cle camelCase sans accents, suffixee en cas de collision', () => {
    expect(fieldKeyFromLabel('HbA1c', new Set())).toBe('hba1c')
    expect(fieldKeyFromLabel('Suivi tabac', new Set())).toBe('suiviTabac')
    expect(fieldKeyFromLabel('Comorbidités', new Set())).toBe('comorbidites')
    expect(fieldKeyFromLabel('Comorbidités', new Set(['comorbidites']))).toBe('comorbidites2')
    expect(fieldKeyFromLabel('12 mois', new Set())).toBe('champ12Mois')
    expect(fieldKeyFromLabel('!!!', new Set())).toBe('champ')
  })

  it('derive une cle de choix en majuscules soulignees', () => {
    expect(choiceKeyFromLabel('Diabète type 2', new Set())).toBe('DIABETE_TYPE_2')
    expect(choiceKeyFromLabel('HTA', new Set(['HTA']))).toBe('HTA_2')
    expect(choiceKeyFromLabel('—', new Set())).toBe('CHOIX')
  })
})
```

- [ ] **Step 4 : les voir échouer**

Run: `cd back && NODE_OPTIONS=--experimental-vm-modules npx jest -c src/test/jest.config.ts --selectProjects unit src/test/unit/utils/service-field-types.test.ts`
Expected: FAIL, module `service-field-types` introuvable.

- [ ] **Step 5 : écrire le registre**

`back/src/main/utils/service-field-types.ts` :

```ts
import Boom from '@hapi/boom'

export const SERVICE_FIELD_TYPES = [
  'text',
  'longtext',
  'number',
  'date',
  'choice',
  'multichoice',
  'boolean',
] as const
export type ServiceFieldType = (typeof SERVICE_FIELD_TYPES)[number]

export const SERVICE_FIELD_SECTIONS = ['pathway', 'outcome'] as const
export type ServiceFieldSection = (typeof SERVICE_FIELD_SECTIONS)[number]

export type FieldValues = Record<string, unknown>

export type FieldDefinitionForValidation = {
  key: string
  type: ServiceFieldType
  clinical: boolean
  archivedAt: Date | null
  choices: { key: string; archivedAt: Date | null }[]
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/

// Refuse aussi un jour qui n'existe pas (2026-02-30), que Date reporterait au mois suivant.
const isIsoDay = (value: unknown): boolean => {
  if (typeof value !== 'string' || !ISO_DAY.test(value)) {
    return false
  }
  const day = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(day.getTime()) && day.toISOString().startsWith(value)
}

// Un choix archivé reste acceptable s'il est déjà la valeur en base : réenregistrer un vieux dossier ne doit pas échouer.
const isUsableChoice = (
  def: FieldDefinitionForValidation,
  key: unknown,
  previous: unknown,
): boolean => {
  const choice = def.choices.find((c) => c.key === key)
  if (!choice) {
    return false
  }
  if (choice.archivedAt === null) {
    return true
  }
  return Array.isArray(previous) ? previous.includes(key) : previous === key
}

const VALIDATORS: Record<
  ServiceFieldType,
  (value: unknown, def: FieldDefinitionForValidation, previous: unknown) => boolean
> = {
  text: (v) => typeof v === 'string',
  longtext: (v) => typeof v === 'string',
  number: (v) => typeof v === 'number' && Number.isFinite(v),
  date: isIsoDay,
  boolean: (v) => typeof v === 'boolean',
  choice: (v, def, previous) => isUsableChoice(def, v, previous),
  multichoice: (v, def, previous) =>
    Array.isArray(v) &&
    new Set(v).size === v.length &&
    v.every((k) => isUsableChoice(def, k, previous)),
}

const isEmpty = (value: unknown): boolean =>
  value === null ||
  value === undefined ||
  value === '' ||
  (Array.isArray(value) && value.length === 0)

// Applique un correctif partiel : clé présente = remplacée, vide = effacée, clé absente = inchangée.
export const mergeFieldPatch = (
  definitions: readonly FieldDefinitionForValidation[],
  current: FieldValues,
  patch: Record<string, unknown>,
  clinical: boolean,
): FieldValues => {
  const byKey = new Map(definitions.map((d) => [d.key, d]))
  const next: FieldValues = { ...current }
  for (const [key, value] of Object.entries(patch)) {
    const def = byKey.get(key)
    if (!def) {
      throw Boom.badRequest(`Champ inconnu : ${key}`)
    }
    if (def.archivedAt !== null) {
      throw Boom.badRequest(`Champ archivé : ${key}`)
    }
    if (def.clinical !== clinical) {
      throw Boom.badRequest(`Champ rangé dans la mauvaise colonne (clinique) : ${key}`)
    }
    if (isEmpty(value)) {
      delete next[key]
      continue
    }
    if (!VALIDATORS[def.type](value, def, current[key])) {
      throw Boom.badRequest(`Valeur invalide pour ${key}`)
    }
    next[key] = value
  }
  return next
}

const words = (label: string): string[] =>
  label
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)

const withSuffix = (base: string, taken: ReadonlySet<string>, sep: string): string => {
  if (!taken.has(base)) {
    return base
  }
  let n = 2
  while (taken.has(`${base}${sep}${n}`)) {
    n++
  }
  return `${base}${sep}${n}`
}

export const fieldKeyFromLabel = (label: string, taken: ReadonlySet<string>): string => {
  const camel = words(label)
    .map((w, i) => (i === 0 ? w.toLowerCase() : w[0].toUpperCase() + w.slice(1).toLowerCase()))
    .join('')
  const base = camel === '' ? 'champ' : /^[0-9]/.test(camel) ? `champ${camel[0].toUpperCase()}${camel.slice(1)}` : camel
  return withSuffix(base, taken, '')
}

export const choiceKeyFromLabel = (label: string, taken: ReadonlySet<string>): string => {
  const base = words(label).join('_').toUpperCase() || 'CHOIX'
  return withSuffix(base, taken, '_')
}
```

Attention : `fieldKeyFromLabel('12 mois')` doit donner `champ12Mois` (`camel` vaut `12Mois`, le préfixe garde la casse) ; ajuster l'expression si le test dit autre chose, sans changer le test. `w[0]` peut être signalé par le compilateur (`noUncheckedIndexedAccess`) : utiliser `w.charAt(0)` partout.

- [ ] **Step 6 : les voir passer**

Run: même commande qu'au Step 4. Expected: PASS.

- [ ] **Step 7 : lint et commit**

```bash
cd back && npx biome check --write src/main/utils/etp-field-preset.ts src/main/utils/service-field-types.ts src/test/unit/utils/service-field-types.test.ts
git add -A back/src/main/utils back/src/test/unit/utils docs/superpowers/specs
git commit -m "feat(fiche): catalogue ETP et registre de types des champs configurables"
```

---

### Task 2 : modèle Prisma et déclarations au garde-fou

**Files:**
- Modify: `back/prisma/schema.prisma`
- Modify: `back/src/main/infra/orm/tenant-guard.ts`
- Modify: `back/src/main/utils/clinical-fields.ts` (+ son test `back/src/test/unit/utils/clinical-fields.test.ts`)
- Create: `back/prisma/migrations/20261010120000_service_fields/migration.sql` (partie structurelle seulement)

**Interfaces:**
- Produces: modèles `ServiceFieldDefinition`, `ServiceFieldChoice` ; colonnes `PatientServiceFile.data` et `PatientServiceFile.clinicalData` (`Json @default("{}")`). Les dix colonnes ETP sont **encore présentes** à la fin de cette tâche.

- [ ] **Step 1 : déclarer les modèles**

Dans `back/prisma/schema.prisma`, après `PatientServiceFile` :

```prisma
// Champ configurable de la fiche patient d'un service. `key`, `type` et `clinical` sont figés après création.
model ServiceFieldDefinition {
  id              String    @id @default(cuid())
  establishmentId String
  serviceId       String
  key             String
  label           String
  type            String
  section         String
  order           Int
  clinical        Boolean   @default(false)
  unit            String?
  createdAt       DateTime  @default(now())
  archivedAt      DateTime?

  service Service              @relation(fields: [serviceId, establishmentId], references: [id, establishmentId])
  choices ServiceFieldChoice[]

  @@unique([serviceId, key])
  @@unique([id, serviceId])
  @@index([serviceId])
}

model ServiceFieldChoice {
  id              String    @id @default(cuid())
  establishmentId String
  serviceId       String
  fieldId         String
  key             String
  label           String
  order           Int
  archivedAt      DateTime?

  field ServiceFieldDefinition @relation(fields: [fieldId, serviceId], references: [id, serviceId])

  @@unique([fieldId, key])
  @@index([fieldId])
}
```

Sur `Service`, ajouter `fieldDefinitions ServiceFieldDefinition[]`. Sur `PatientServiceFile`, ajouter après `etpFinalOutcome` :

```prisma
  data         Json @default("{}")
  clinicalData Json @default("{}")
```

- [ ] **Step 2 : déclarer au garde-fou**

Dans `back/src/main/infra/orm/tenant-guard.ts` :
- `SERVICE_MODELS` : ajouter `'ServiceFieldDefinition'` et `'ServiceFieldChoice'`.
- `NESTED_RELATIONS` : ajouter `ServiceFieldDefinition: { choices: 'ServiceFieldChoice' }`.
- `MODEL_RELATIONS` : `Service` gagne `fieldDefinitions: many('ServiceFieldDefinition')` ; ajouter `ServiceFieldDefinition: { service: one('Service'), choices: many('ServiceFieldChoice') }` et `ServiceFieldChoice: { field: one('ServiceFieldDefinition') }`.

- [ ] **Step 3 : vérifier que le test de conformité l'exige**

```bash
cd back && npm run prisma:generate && NODE_OPTIONS=--experimental-vm-modules npx jest -c src/test/jest.config.ts --selectProjects unit src/test/unit/infra/tenant-guard-schema.test.ts
```

Expected: PASS. Retirer temporairement l'entrée `ServiceFieldChoice` de `MODEL_RELATIONS`, constater l'échec, la remettre. Si un autre test de ce fichier réclame une entrée non listée ici (par exemple `GLOBAL_TENANT_RELATIONS`), suivre ce que le test exige.

- [ ] **Step 4 : `clinicalData` est un champ clinique**

Dans `back/src/main/utils/clinical-fields.ts`, ajouter `'clinicalData'` à `CLINICAL_FIELDS` et remplacer la ligne de commentaire qui liste les champs par : `//   - sur le sous-dossier de service : notes, details, clinicalData (valeurs des champs configurables cliniques) ;`. `medicalDiagnosis` **reste** dans la liste jusqu'à la tâche 3, qui supprime la colonne.

Dans `back/src/test/unit/utils/clinical-fields.test.ts`, le test « chaque champ clinique n existe que sur les modeles attendus » nomme les modèles porteurs : ajouter `clinicalData: ['PatientServiceFile']` à sa table des attendus. Ajouter au premier test un cas : `withoutClinicalFields({ data: { a: 1 }, clinicalData: { b: 2 } })` rend `{ data: { a: 1 } }`.

- [ ] **Step 5 : créer la migration sans l'appliquer**

```bash
cd back && npm run prisma:migrate:create -- --name service_fields
```

**`prisma:migrate:create` lit `.env` : il ne doit rien appliquer (`--create-only` est dans le script).** Renommer le dossier créé en `20261010120000_service_fields` pour qu'il suive `20261009130000_thematic_role`. Garder le SQL généré (tables, index, clés étrangères, deux colonnes JSON) : la tâche 3 le complète.

- [ ] **Step 6 : vérifier et commiter**

```bash
cd back && npm run build && NODE_OPTIONS=--experimental-vm-modules npx jest -c src/test/jest.config.ts --selectProjects unit
```

Expected: PASS, y compris `schema-migrations-drift`.

```bash
git add back/prisma back/src/main/infra/orm/tenant-guard.ts back/src/main/utils/clinical-fields.ts back/src/test/unit/utils/clinical-fields.test.ts
git commit -m "feat(fiche): modeles des champs configurables et colonnes JSON du sous-dossier"
```

---

### Task 3 : migration des données, garde, seed

**Files:**
- Modify: `back/prisma/migrations/20261010120000_service_fields/migration.sql`
- Modify: `back/prisma/schema.prisma` (retrait des dix colonnes)
- Create: `back/src/test/unit/migrations/service-fields.migration.test.ts`
- Modify: `back/prisma/seed/patient.ts`, `back/prisma/seed/data/patient.ts`, `back/prisma/seed.ts`
- Modify (compilation) : `back/src/main/infra/orm/repositories/arsIndicator.repository.ts`, `patient.repository.ts`, `patient.repository.interface.ts`, `patient.schema.ts`, `patient.domain.ts`, `patientServiceFile.schema.ts`, `clinical-fields.ts`, tests e2e qui écrivent ces colonnes.

**Interfaces:**
- Consumes: `ETP_FIELD_PRESET` (tâche 1), modèles (tâche 2).
- Produces: base migrée ; `readChoice(values: unknown, key: string): string | null` exporté de `service-field-types.ts` pour lire une valeur texte d'un JSON.

- [ ] **Step 1 : lire la migration éprouvée et son test**

```bash
cd back && sed -n 100,200p prisma/migrations/20260924160131_patient_service_file/migration.sql && sed -n 120,400p src/test/unit/migrations/patient-service-file.migration.test.ts
```

Reprendre : la génération d'identifiants compatibles `z.cuid()` (`'c' || replace(gen_random_uuid()::text, '-', '')`), la forme de la garde (`DO $$ … RAISE EXCEPTION`), la structure du test (base gabarit, scénarios, nettoyage, refus de `test.skip`).

- [ ] **Step 2 : écrire le test de migration (rouge)**

`back/src/test/unit/migrations/service-fields.migration.test.ts`, sur le modèle de `patient-service-file.migration.test.ts` (copier ses utilitaires de connexion et de base jetable, préfixe `medisync_migr_fields`). La base gabarit applique toutes les migrations **jusqu'à `20261009130000_thematic_role` incluse**, puis chaque scénario insère ses données et joue `20261010120000_service_fields/migration.sql`.

Scénarios et attentes :

1. **ok** — deux établissements, trois services, quatre sous-dossiers avec des valeurs pour les dix colonnes, dont une valeur `'Diabète de type 2'` en `medicalDiagnosis` (absente des constantes), une `''` en `careMode`, une `NULL` en `goal`. Après migration :
   - chaque service a exactement les dix définitions de `ETP_FIELD_PRESET` (clé, libellé, type, section, `clinical`, ordre 0..9 dans l'ordre du catalogue), et leurs choix (clé, libellé, ordre) — **comparés à `ETP_FIELD_PRESET` importé**, c'est le test de concordance ;
   - le choix `'Diabète de type 2'` existe, archivé, libellé = clé, sur la définition `medicalDiagnosis` des seuls services où il est utilisé ;
   - `clinicalData` vaut `{"medicalDiagnosis": "Diabète de type 2"}` ; `data` ne contient ni `careMode` (chaîne vide) ni `goal` (nul) ;
   - les dix colonnes n'existent plus (`information_schema.columns`) ;
   - tous les identifiants créés passent `z.cuid()`.
2. **garde** — on ajoute avant la migration un déclencheur `BEFORE UPDATE` sur `PatientServiceFile` qui remet `data` à `'{}'` quand `"orientation"` vaut `'SABOTAGE'` : la migration doit **échouer** avec un message qui contient `orientation`, les dix colonnes doivent **toujours exister** et la table `ServiceFieldDefinition` **ne pas exister** (transaction annulée).
3. **vide** — aucun service : la migration passe et ne crée rien.

Run: `cd back && NODE_OPTIONS=--experimental-vm-modules npx jest -c src/test/jest.config.ts --selectProjects unit src/test/unit/migrations/service-fields.migration.test.ts`
Expected: FAIL (aucune définition créée, colonnes encore présentes).

- [ ] **Step 3 : compléter la migration**

À la suite du SQL généré par la tâche 2, dans `migration.sql` :

```sql
-- Définitions ETP pour chaque service existant (ordre = ordre du catalogue ETP_FIELD_PRESET).
CREATE TEMP TABLE etp_fields (key text, label text, type text, section text, ord int, clinical boolean);
INSERT INTO etp_fields VALUES
  ('medicalDiagnosis', 'Diagnostic médical', 'choice', 'pathway', 0, true),
  ('careMode', 'Mode de prise en charge', 'choice', 'pathway', 1, false),
  ('orientation', 'Orientation', 'choice', 'pathway', 2, false),
  ('etpDecision', 'ETP décision', 'choice', 'pathway', 3, false),
  ('programType', 'Type de programme', 'choice', 'pathway', 4, false),
  ('nonInclusionDetails', 'Précision non inclusion', 'choice', 'pathway', 5, false),
  ('customContentDetails', 'Précision contenu personnalisé', 'longtext', 'pathway', 6, false),
  ('goal', 'Objectif', 'longtext', 'pathway', 7, false),
  ('stopReason', 'Motif d''arrêt de programme', 'choice', 'outcome', 8, false),
  ('etpFinalOutcome', 'Point final parcours ETP', 'choice', 'outcome', 9, false);

CREATE TEMP TABLE etp_choices (field text, key text, label text, ord int);
INSERT INTO etp_choices VALUES
  ('medicalDiagnosis', 'AOMI', 'AOMI', 0),
  ('medicalDiagnosis', 'AVC', 'AVC', 1),
  -- … une ligne par choix de ETP_FIELD_PRESET, dans l'ordre du catalogue, ord à partir de 0 par champ.
  ('etpFinalOutcome', 'SUIVI_TELEPHONIQUE', 'Suivi téléphonique', 10);

INSERT INTO "ServiceFieldDefinition" (id, "establishmentId", "serviceId", key, label, type, section, "order", clinical)
SELECT 'c' || replace(gen_random_uuid()::text, '-', ''), s."establishmentId", s.id, f.key, f.label, f.type, f.section, f.ord, f.clinical
FROM "Service" s CROSS JOIN etp_fields f;

INSERT INTO "ServiceFieldChoice" (id, "establishmentId", "serviceId", "fieldId", key, label, "order")
SELECT 'c' || replace(gen_random_uuid()::text, '-', ''), d."establishmentId", d."serviceId", d.id, c.key, c.label, c.ord
FROM "ServiceFieldDefinition" d JOIN etp_choices c ON c.field = d.key;

-- Valeurs saisies hors des constantes : choix archivés, libellé = clé, pour ne rien perdre.
INSERT INTO "ServiceFieldChoice" (id, "establishmentId", "serviceId", "fieldId", key, label, "order", "archivedAt")
SELECT 'c' || replace(gen_random_uuid()::text, '-', ''), d."establishmentId", d."serviceId", d.id, v.value, v.value,
       1000 + row_number() OVER (PARTITION BY d.id ORDER BY v.value), now()
FROM (
  SELECT DISTINCT "serviceId", x.field, x.value
  FROM "PatientServiceFile" f
  CROSS JOIN LATERAL (VALUES
    ('medicalDiagnosis', NULLIF(f."medicalDiagnosis", '')),
    ('careMode', NULLIF(f."careMode", '')),
    ('orientation', NULLIF(f."orientation", '')),
    ('etpDecision', NULLIF(f."etpDecision", '')),
    ('programType', NULLIF(f."programType", '')),
    ('nonInclusionDetails', NULLIF(f."nonInclusionDetails", '')),
    ('stopReason', NULLIF(f."stopReason", '')),
    ('etpFinalOutcome', NULLIF(f."etpFinalOutcome", ''))
  ) AS x(field, value)
  WHERE x.value IS NOT NULL
) v
JOIN "ServiceFieldDefinition" d ON d."serviceId" = v."serviceId" AND d.key = v.field
WHERE NOT EXISTS (SELECT 1 FROM etp_choices c WHERE c.field = v.field AND c.key = v.value);

-- Recopie : une chaîne vide vaut absence.
UPDATE "PatientServiceFile" SET
  data = jsonb_strip_nulls(jsonb_build_object(
    'careMode', NULLIF("careMode", ''),
    'orientation', NULLIF("orientation", ''),
    'etpDecision', NULLIF("etpDecision", ''),
    'programType', NULLIF("programType", ''),
    'nonInclusionDetails', NULLIF("nonInclusionDetails", ''),
    'customContentDetails', NULLIF("customContentDetails", ''),
    'goal', NULLIF("goal", ''),
    'stopReason', NULLIF("stopReason", ''),
    'etpFinalOutcome', NULLIF("etpFinalOutcome", '')
  )),
  "clinicalData" = jsonb_strip_nulls(jsonb_build_object('medicalDiagnosis', NULLIF("medicalDiagnosis", '')));

-- Garde : chaque valeur non vide doit se retrouver, à l'identique, dans la colonne JSON attendue.
DO $$
DECLARE fautif text;
BEGIN
  SELECT string_agg(field, ', ') INTO fautif FROM (
    SELECT 'medicalDiagnosis' AS field WHERE EXISTS (SELECT 1 FROM "PatientServiceFile" WHERE NULLIF("medicalDiagnosis", '') IS DISTINCT FROM "clinicalData"->>'medicalDiagnosis')
    UNION ALL SELECT 'careMode' WHERE EXISTS (SELECT 1 FROM "PatientServiceFile" WHERE NULLIF("careMode", '') IS DISTINCT FROM data->>'careMode')
    UNION ALL SELECT 'orientation' WHERE EXISTS (SELECT 1 FROM "PatientServiceFile" WHERE NULLIF("orientation", '') IS DISTINCT FROM data->>'orientation')
    UNION ALL SELECT 'etpDecision' WHERE EXISTS (SELECT 1 FROM "PatientServiceFile" WHERE NULLIF("etpDecision", '') IS DISTINCT FROM data->>'etpDecision')
    UNION ALL SELECT 'programType' WHERE EXISTS (SELECT 1 FROM "PatientServiceFile" WHERE NULLIF("programType", '') IS DISTINCT FROM data->>'programType')
    UNION ALL SELECT 'nonInclusionDetails' WHERE EXISTS (SELECT 1 FROM "PatientServiceFile" WHERE NULLIF("nonInclusionDetails", '') IS DISTINCT FROM data->>'nonInclusionDetails')
    UNION ALL SELECT 'customContentDetails' WHERE EXISTS (SELECT 1 FROM "PatientServiceFile" WHERE NULLIF("customContentDetails", '') IS DISTINCT FROM data->>'customContentDetails')
    UNION ALL SELECT 'goal' WHERE EXISTS (SELECT 1 FROM "PatientServiceFile" WHERE NULLIF("goal", '') IS DISTINCT FROM data->>'goal')
    UNION ALL SELECT 'stopReason' WHERE EXISTS (SELECT 1 FROM "PatientServiceFile" WHERE NULLIF("stopReason", '') IS DISTINCT FROM data->>'stopReason')
    UNION ALL SELECT 'etpFinalOutcome' WHERE EXISTS (SELECT 1 FROM "PatientServiceFile" WHERE NULLIF("etpFinalOutcome", '') IS DISTINCT FROM data->>'etpFinalOutcome')
  ) x;
  IF fautif IS NOT NULL THEN
    RAISE EXCEPTION 'Migration service_fields refusee : valeurs non recopiees pour %', fautif;
  END IF;
END $$;

ALTER TABLE "PatientServiceFile"
  DROP COLUMN "medicalDiagnosis", DROP COLUMN "careMode", DROP COLUMN "orientation",
  DROP COLUMN "etpDecision", DROP COLUMN "programType", DROP COLUMN "nonInclusionDetails",
  DROP COLUMN "customContentDetails", DROP COLUMN "goal", DROP COLUMN "stopReason",
  DROP COLUMN "etpFinalOutcome";

DROP TABLE etp_fields, etp_choices;
COMMIT;
```

**Toute la migration est entre `BEGIN;` et `COMMIT;`** : ajouter `BEGIN;` en toute première ligne du fichier, avant le SQL structurel généré par la tâche 2. Une garde qui lève doit laisser la base exactement comme avant, tables comprises.

Remplacer le commentaire `-- … une ligne par choix` par **toutes** les lignes, recopiées de `ETP_FIELD_PRESET` (4 + 4 + 5 + 2 + 2 + 14 + 19 + 11 = 61 lignes). Le test de concordance du Step 2 attrape un oubli. La garde compare valeur à valeur (`IS DISTINCT FROM`) plutôt que des comptages : une recopie décalée garderait des comptages identiques.

- [ ] **Step 4 : retirer les dix colonnes du schéma Prisma**

Retirer de `PatientServiceFile` dans `schema.prisma` : `medicalDiagnosis`, `careMode`, `orientation`, `etpDecision`, `programType`, `nonInclusionDetails`, `customContentDetails`, `goal`, `stopReason`, `etpFinalOutcome`. Puis :

```bash
cd back && npm run prisma:generate && npx tsc --noEmit -p tsconfig.json
```

Le compilateur énumère les usages. Les traiter **un par un**, ainsi :

- Ajouter à `back/src/main/utils/service-field-types.ts` :

  ```ts
  // Lit une valeur texte d'une colonne JSON de valeurs ; null si absente ou d'un autre type.
  export const readChoice = (values: unknown, key: string): string | null => {
    if (typeof values !== 'object' || values === null || Array.isArray(values)) {
      return null
    }
    const value: unknown = Reflect.get(values, key)
    return typeof value === 'string' ? value : null
  }
  ```

  avec un test unitaire dans `service-field-types.test.ts` : `readChoice({ a: 'x' }, 'a') === 'x'`, `readChoice({ a: 1 }, 'a') === null`, `readChoice(null, 'a') === null`, `readChoice([], 'a') === null`.
- `arsIndicator.repository.ts` : `select` passe de `stopReason/orientation` à `data: true`, et le `map` écrit `stopReason: readChoice(f.data, 'stopReason')`, `orientation: readChoice(f.data, 'orientation')`. **`ArsFile` ne change pas** : la grille ARS et le rapport d'activité ne voient aucune différence.
- `patient.repository.ts#findAllWithTags` : le `select` de `serviceFiles` remplace les huit champs par `data: true, clinicalData: true` ; le `map` remplace les huit lignes aplaties par `data: serviceFiles[0]?.data ?? {}` et `clinicalData: serviceFiles[0]?.clinicalData ?? {}`. `PatientWithTagsEntityRepo` remplace les huit champs optionnels par `data?: Prisma.JsonValue` et `clinicalData?: Prisma.JsonValue`. `patientWithTagsResponseSchema` remplace les huit champs par `data: z.record(z.string(), z.unknown()).optional()` et `clinicalData: z.record(z.string(), z.unknown()).optional()`.
- `patientServiceFile.schema.ts` : retirer les dix champs de `patientServiceFileEntity` ; ajouter au schéma de réponse `data: z.record(z.string(), z.unknown())` et `clinicalData: z.record(z.string(), z.unknown()).optional()` (optionnel : le crochet le retire pour qui n'a pas `clinical:read`). Le corps du PATCH est traité en tâche 5 ; ici, seulement le retrait.
- `patient.domain.ts#EXPORT_COLUMNS` : retirer les quatre colonnes qui lisent `careMode`, `orientation`, `stopReason`, `medicalDiagnosis` (la tâche 6 les remplace par les colonnes générées).
- `clinical-fields.ts` : retirer `'medicalDiagnosis'` de `CLINICAL_FIELDS` et de son test des porteurs ; mettre à jour la ligne de commentaire.
- Les tests e2e qui écrivent ces colonnes par `testDb.patientServiceFile.create/update` (au moins `clinical-fields.test.ts`, `indicateurs-ars.test.ts`, `activite.test.ts`, `patient.test.ts`) : remplacer `orientation: 'X'` par `data: { orientation: 'X' }`, `medicalDiagnosis: 'X'` par `clinicalData: { medicalDiagnosis: 'X' }`. **Ne changer aucune valeur attendue** : la grille ARS et le rapport d'activité doivent rendre les mêmes chiffres. Si une valeur attendue doit changer, s'arrêter et le signaler.
- Dans `clinical-fields.test.ts` (e2e), les assertions sur `medicalDiagnosis` deviennent des assertions sur `clinicalData` : absent pour le secrétariat, présent pour l'intervenant.

- [ ] **Step 5 : le seed**

Le seed tourne **après** les migrations, sur des services qu'il crée lui-même : il doit poser la configuration ETP.

Dans `back/prisma/seed/patient.ts`, ajouter et exporter :

```ts
// Configuration ETP des services du seed : la migration service_fields ne la pose que sur les services existants.
export async function seedEtpFields(prisma: PrismaClient, tenant: SeedTenant) {
  for (const [order, field] of ETP_FIELD_PRESET.entries()) {
    await prisma.serviceFieldDefinition.create({
      data: {
        ...tenant,
        key: field.key,
        label: field.label,
        type: field.type,
        section: field.section,
        clinical: field.clinical,
        order,
        choices: {
          create: field.choices.map((c, i) => ({
            ...tenant,
            key: c.key,
            label: c.label,
            order: i,
          })),
        },
      },
    })
  }
}
```

(`import { ETP_FIELD_PRESET } from '../../src/main/utils/etp-field-preset'`.) L'appeler dans `seed.ts` pour chaque service, juste avant `seedPatients`. Dans `seedPatients`, `clinicalFile` devient `{ data?: Record<string, string>; clinicalData?: Record<string, string> }` et s'écrit tel quel. Dans `seed/data/patient.ts`, réécrire chaque `clinicalFile` avec des **clés** valides, par exemple `{ clinicalData: { medicalDiagnosis: 'CORONAROPATHIE' }, data: { orientation: 'ORIENTATION_PRO_SANTE_EXT', programType: 'VIVA' } }` : le seed actuel stocke des libellés libres (« Diabète de type 2 ») qui ne seraient plus des choix valides.

- [ ] **Step 6 : vérifier**

```bash
cd back && npm run build && npm run lint \
  && NODE_OPTIONS=--experimental-vm-modules npx jest -c src/test/jest.config.ts --selectProjects unit \
  && npm run prisma:migrate:deploy:test && npm run prisma:seed:test \
  && NODE_OPTIONS=--experimental-vm-modules npx dotenv-cli@7.3.0 -e .env.test.local -e .env.test -- npx jest --runInBand -c src/test/jest.config.ts --selectProjects e2e
```

Expected: tout passe, le test de migration compris.

- [ ] **Step 7 : répétition sur une copie jetable des vraies données**

```bash
docker exec medisync-postgres pg_dump -U postgres -Fc -d medisync -f /tmp/fields.dump
docker exec medisync-postgres psql -U postgres -c 'CREATE DATABASE medisync_fields_check;'
docker exec medisync-postgres pg_restore -U postgres -d medisync_fields_check /tmp/fields.dump
cd back && DATABASE_URL="postgres://postgres:postgres@localhost:5433/medisync_fields_check?schema=public" npx prisma migrate deploy
docker exec medisync-postgres psql -U postgres -d medisync_fields_check -c "SELECT d.key, count(*) FILTER (WHERE c.\"archivedAt\" IS NOT NULL) AS archives FROM \"ServiceFieldDefinition\" d JOIN \"ServiceFieldChoice\" c ON c.\"fieldId\" = d.id GROUP BY d.key ORDER BY d.key;"
docker exec medisync-postgres psql -U postgres -c 'DROP DATABASE medisync_fields_check;'
docker exec medisync-postgres rm -f /tmp/fields.dump
```

**Port 5433**, pas 5432 (un autre projet occupe 5432). Expected : la migration passe (la garde ne lève pas). Rapporter le nombre de choix archivés créés par champ : c'est la mesure des valeurs héritées hors constantes.

- [ ] **Step 8 : commit**

```bash
git add -A back
git commit -m "feat(fiche): migrer les dix champs ETP vers les champs configurables

La garde compare chaque valeur a sa recopie JSON avant de supprimer
les colonnes. Les valeurs hors constantes deviennent des choix archives."
```

---

### Task 4 : API des définitions

**Files:**
- Create: `back/src/main/types/infra/orm/repositories/serviceField.repository.interface.ts`, `back/src/main/infra/orm/repositories/serviceField.repository.ts`
- Create: `back/src/main/types/domain/serviceField.domain.interface.ts`, `back/src/main/domain/serviceField.domain.ts`
- Create: `back/src/main/interfaces/http/fastify/schemas/serviceField.schema.ts`, `back/src/main/interfaces/http/fastify/routes/serviceField.ts`
- Modify: `back/src/main/types/application/ioc.ts`, `back/src/main/application/ioc/awilix/awilix-ioc-container.ts`, `back/src/main/interfaces/http/fastify/routes/tenant.routes.ts`
- Test: `back/src/test/e2e/service-fields.test.ts`

**Interfaces:**
- Consumes: `fieldKeyFromLabel`, `choiceKeyFromLabel`, `SERVICE_FIELD_TYPES`, `SERVICE_FIELD_SECTIONS` (tâche 1).
- Produces (repository, tout filtré par `this.scope`) :
  - `type ServiceFieldEntityRepo = ServiceFieldDefinition & { choices: ServiceFieldChoice[] }` (choix triés par `order`)
  - `findAll(): Promise<ServiceFieldEntityRepo[]>` — actifs et archivés, triés par `section`, `order`
  - `findByID(id): Promise<ServiceFieldEntityRepo>`
  - `create(params: { key; label; type; section; order; clinical; unit: string | null; choices: { key; label; order }[] }): Promise<ServiceFieldEntityRepo>`
  - `update(id, params: { label?; unit?: string | null; archivedAt?: Date | null }): Promise<ServiceFieldEntityRepo>`
  - `createChoice(fieldId, { key; label; order }): Promise<ServiceFieldEntityRepo>`
  - `updateChoice(fieldId, choiceId, { label?; archivedAt?: Date | null }): Promise<ServiceFieldEntityRepo>`
  - `reorderFields(ids: string[]): Promise<void>` et `reorderChoices(fieldId, ids: string[]): Promise<void>` — transaction, `order` = index
- Produces (HTTP, sous `/e/:establishmentId/s/:serviceId/service-fields`) :
  - `GET /` (`referentials:read`) → `ServiceField[]`
  - `POST /` (`referentials:write`) corps `{ label, type, section, clinical?, unit?, choices?: string[] }` → 201
  - `PATCH /:fieldID` corps `{ label?, unit?, archived? }` → 200 ; tout autre champ (`key`, `type`, `clinical`, `section`) → 400 (schéma Zod `.strict()`)
  - `POST /:fieldID/choices` corps `{ label }` → 201 ; `PATCH /:fieldID/choices/:choiceID` corps `{ label?, archived? }`
  - `PUT /order` corps `{ section, ids: string[] }` et `PUT /:fieldID/choices/order` corps `{ ids: string[] }` → 204
  - forme de `ServiceField` en réponse : `{ id, key, label, type, section, order, clinical, unit, archived: boolean, choices: { id, key, label, order, archived: boolean }[] }`

- [ ] **Step 1 : lire les voisins**

```bash
cd back && cat src/main/types/infra/orm/repositories/thematic.repository.interface.ts src/main/types/domain/thematic.domain.interface.ts && sed -n 1,80p src/test/e2e/thematique-archivage.test.ts
```

Suivre leur forme : `this.scope` lu par méthode, `boomErrorFromPrismaError`, clé `id_serviceId`, routes avec `config.permission`.

- [ ] **Step 2 : écrire les tests e2e (rouges)**

`back/src/test/e2e/service-fields.test.ts`, describe « definitions des champs de la fiche ». Un établissement, un service, un `COORDINATEUR` et un `INTERVENANT` (fixtures `createUser`, une connexion par rôle partagée par le fichier — `sign-in` est limité à 10/minute). Cas :

1. le coordinateur crée « Comorbidités » (`multichoice`, `section: 'pathway'`, `choices: ['HTA', 'Diabète type 2']`) → 201, `key === 'comorbidites'`, `order === 0`, choix de clés `['HTA', 'DIABETE_TYPE_2']` ;
2. créer un second champ de même libellé → `key === 'comorbidites2'`, `order === 1` ;
3. `PATCH` avec `{ type: 'text' }`, puis `{ key: 'x' }`, puis `{ clinical: true }` → 400 chacun, et le champ relu n'a pas changé ;
4. `PATCH { archived: true }` → `archived: true` ; le `GET` le rend toujours ; `PATCH { archived: false }` le restaure ;
5. ajout d'un choix « Asthme » → clé `ASTHME`, `order` 2 ; archivage du choix ;
6. `PUT /order` avec les deux champs inversés → le `GET` les rend dans le nouvel ordre ;
7. l'`INTERVENANT` reçoit 403 sur `POST /`, et 200 sur `GET /` ;
8. cloisonnement : un champ créé dans le service A est absent du `GET` du service B, et `PATCH` d'un champ de A depuis B → 404.

Run: commande e2e des Global Constraints avec `src/test/e2e/service-fields.test.ts`. Expected: FAIL (404 sur la route).

- [ ] **Step 3 : implémenter repository, domaine, schéma, routes**

Le domaine porte les règles :

```ts
async create(params: ServiceFieldCreateEntityDomain): Promise<ServiceFieldEntityDomain> {
  const existing = await this.serviceFieldRepository.findAll()
  const key = fieldKeyFromLabel(params.label, new Set(existing.map((f) => f.key)))
  const order = existing.filter((f) => f.section === params.section).length
  const taken = new Set<string>()
  const choices = (params.choices ?? []).map((label, i) => {
    const choiceKey = choiceKeyFromLabel(label, taken)
    taken.add(choiceKey)
    return { key: choiceKey, label, order: i }
  })
  return this.serviceFieldRepository.create({
    key,
    label: params.label,
    type: params.type,
    section: params.section,
    clinical: params.clinical ?? false,
    unit: params.type === 'number' ? (params.unit ?? null) : null,
    order,
    choices,
  })
}
```

- `choices` n'est accepté que pour `choice` et `multichoice` (400 sinon, dans le domaine) ; un champ `choice`/`multichoice` créé sans choix est accepté (le coordinateur les ajoute ensuite).
- `createChoice` calcule la clé contre **toutes** les clés du champ, archivées comprises, et `order` = nombre de choix existants. Refuser (400) l'ajout d'un choix à un champ qui n'est ni `choice` ni `multichoice`.
- `reorderFields` vérifie que les `ids` sont exactement les champs de la section (400 sinon) ; même règle pour `reorderChoices`.
- La réponse aplatit `archivedAt` en `archived: boolean`, comme les autres référentiels.
- Monter le routeur dans `tenant.routes.ts` : `await fastify.register(serviceFieldRouter, { prefix: '/service-fields' })`. Enregistrer domaine et repository dans l'ioc à côté de `thematic*`.

Schéma Zod de création :

```ts
export const createServiceFieldSchema = z.object({
  label: z.string().trim().min(1).max(120),
  type: z.enum(SERVICE_FIELD_TYPES),
  section: z.enum(SERVICE_FIELD_SECTIONS),
  clinical: z.boolean().optional(),
  unit: z.string().trim().max(20).nullable().optional(),
  choices: z.array(z.string().trim().min(1).max(120)).optional(),
})

export const updateServiceFieldSchema = z
  .object({
    label: z.string().trim().min(1).max(120).optional(),
    unit: z.string().trim().max(20).nullable().optional(),
    archived: z.boolean().optional(),
  })
  .strict()
```

- [ ] **Step 4 : les voir passer, vérifier, commiter**

```bash
cd back && npm run build && npm run lint && <commande e2e> src/test/e2e/service-fields.test.ts
git add -A back
git commit -m "feat(fiche): routes de configuration des champs de la fiche"
```

---

### Task 5 : écriture de la fiche — validation, colonnes, concurrence

**Files:**
- Modify: `back/src/main/interfaces/http/fastify/schemas/patientServiceFile.schema.ts`
- Modify: `back/src/main/domain/patientServiceFile.domain.ts` (+ interface)
- Modify: `back/src/main/infra/orm/repositories/patientServiceFile.repository.ts` (+ interface)
- Test: `back/src/test/e2e/service-fields.test.ts` (describe « ecriture de la fiche »), `back/src/test/unit/domain/patientServiceFile.domain.test.ts`

**Interfaces:**
- Consumes: `mergeFieldPatch` (tâche 1), `serviceFieldRepository.findAll()` (tâche 4).
- Produces:
  - corps du PATCH : les champs fixes actuels **plus** `data?: Record<string, unknown>` et `clinicalData?: Record<string, unknown>`
  - repository : `writeValues(patientId, expected: { data: Prisma.JsonValue; clinicalData: Prisma.JsonValue }, next: { data: FieldValues; clinicalData: FieldValues }): Promise<boolean>` — `updateMany` conditionné à l'égalité JSON des deux colonnes lues ; rend `false` si une autre écriture est passée entre-temps

- [ ] **Step 1 : tests e2e (rouges)**

Dans `service-fields.test.ts`, describe « ecriture de la fiche ». Préparer, par l'API du coordinateur : `orientation` (`choice`, choix `A`, `B`), `hba1c` (`number`), `diag` (`choice`, `clinical: true`, choix `AVC`, `AOMI`). Un patient avec un sous-dossier, un `SECRETARIAT` en plus. Cas :

1. le coordinateur `PATCH { data: { orientation: 'A', hba1c: 7.2 }, clinicalData: { diag: 'AVC' } }` → 200 ; la réponse et la base portent ces valeurs ;
2. `PATCH { data: { hba1c: null } }` → `hba1c` disparaît, `orientation` reste ;
3. `PATCH { data: { orientation: 'Z' } }` → 400, base inchangée ; `PATCH { data: { inconnu: 1 } }` → 400 ; `PATCH { data: { diag: 'AVC' } }` → 400 (mauvaise colonne) ;
4. le choix `A` est archivé ; `PATCH { data: { orientation: 'A' } }` sur ce dossier qui vaut déjà `A` → 200 ; sur un autre dossier vide → 400 ;
5. **le secrétariat** `PATCH { data: { orientation: 'B' }, clinicalData: { diag: 'AOMI' } }` → 200 ; en base `orientation === 'B'` et `diag === 'AVC'` (inchangé) ; sa lecture du sous-dossier ne contient pas `clinicalData`.

- [ ] **Step 2 : test unitaire de la concurrence (rouge)**

`back/src/test/unit/domain/patientServiceFile.domain.test.ts` (créer s'il n'existe pas, sur le modèle des autres tests de `src/test/unit/domain/`) : un faux repository dont `writeValues` rend `false` au premier appel (après qu'une « autre écriture » a modifié le dossier lu) puis `true`. Vérifier que le domaine relit, refusionne le correctif sur la **nouvelle** valeur lue, et que le second appel à `writeValues` reçoit les deux modifications. Un second cas : `writeValues` rend toujours `false` → après trois essais, `Boom.conflict`.

- [ ] **Step 3 : implémenter**

Schéma du corps : `upsertPatientServiceFileBodySchema = z.object({ ...patientServiceFileEntity, data: z.record(z.string(), z.unknown()).optional(), clinicalData: z.record(z.string(), z.unknown()).optional() })`.

Domaine, dans `upsert` :

```ts
async upsert(patientId, params, userID) {
  const { data, clinicalData, ...fixed } = params
  let serviceFile = await this.patientServiceFileRepository.upsert(patientId, fixed)
  if (data !== undefined || clinicalData !== undefined) {
    serviceFile = await this.writeValues(patientId, data ?? {}, clinicalData ?? {})
  }
  this.appEventBus.emit('patient.updated', { userID, patientId: serviceFile.patientId })
  return serviceFile
}

// Concurrence optimiste : on n'écrit que si les colonnes JSON n'ont pas bougé depuis la lecture.
private async writeValues(patientId: string, dataPatch: Record<string, unknown>, clinicalPatch: Record<string, unknown>) {
  const definitions = await this.serviceFieldRepository.findAll()
  for (let attempt = 0; attempt < 3; attempt++) {
    const current = await this.patientServiceFileRepository.findByPatient(patientId)
    if (!current) {
      throw Boom.notFound('PatientServiceFile not found')
    }
    const next = {
      data: mergeFieldPatch(definitions, asValues(current.data), dataPatch, false),
      clinicalData: mergeFieldPatch(definitions, asValues(current.clinicalData), clinicalPatch, true),
    }
    if (await this.patientServiceFileRepository.writeValues(patientId, current, next)) {
      return { ...current, ...next }
    }
  }
  throw Boom.conflict('Le dossier a été modifié en même temps, réessayez.')
}
```

`asValues(json: unknown): FieldValues` rend l'objet s'il est un objet simple, `{}` sinon ; l'ajouter à `service-field-types.ts` avec un test. Ajouter `serviceFieldRepository` au constructeur du domaine.

Repository :

```ts
async writeValues(patientId, expected, next): Promise<boolean> {
  const { count } = await this.prisma.patientServiceFile.updateMany({
    where: {
      patientId,
      ...this.scope,
      data: { equals: expected.data ?? {} },
      clinicalData: { equals: expected.clinicalData ?? {} },
    },
    data: { data: next.data, clinicalData: next.clinicalData },
  })
  return count === 1
}
```

Si le typage Prisma refuse `equals` sur un `JsonValue` nul, normaliser `expected` en `{}` comme ci-dessus ; ne pas caster.

- [ ] **Step 4 : vérifier, commiter**

```bash
cd back && npm run build && npm run lint && <commande unit> && <commande e2e>
git add -A back
git commit -m "feat(fiche): ecriture validee des valeurs configurables, sans ecrasement concurrent"
```

---

### Task 6 : liste des patients et export Excel

**Files:**
- Modify: `back/src/main/domain/patient.domain.ts` (`findAllWithTags`, `exportExcel`)
- Test: `back/src/test/e2e/service-fields.test.ts` (describe « liste et export »)

**Interfaces:**
- Consumes: `serviceFieldRepository.findAll()`, `readChoice`.
- Produces: `GET /patient/with-tags` rend `data` et `clinicalData` **sans les clés des champs `longtext`** ; l'export ajoute, après les colonnes fixes, une colonne par champ actif (clinique seulement si `includeClinicalFields`), en-tête = libellé, valeur = libellé du choix.

- [ ] **Step 1 : tests e2e (rouges)**

Préparer un champ `goal` (`longtext`), `orientation` (`choice`, choix `A` libellé « Alpha »), `comorbidites` (`multichoice`, `HTA` « Hypertension », `DIAB` « Diabète »), `tabac` (`boolean`), `sortie` (`date`), `diag` (`choice` clinique, `AVC` « AVC »), et un champ archivé `ancien` (`text`). Un patient avec toutes les valeurs. Cas :

1. `GET /patient/with-tags` : `data` contient `orientation`, `comorbidites`, `tabac`, `sortie`, mais pas `goal` ; `clinicalData.diag === 'AVC'` pour le coordinateur, `clinicalData` absent pour le secrétariat ;
2. l'export du coordinateur (lire le classeur avec `XLSX.read`, comme `clinical-fields.test.ts`) a les colonnes « Orientation » = « Alpha », comorbidités = « Hypertension, Diabète », tabac = « Oui », sortie = « 01/03/2026 », diag = « AVC », la colonne « Objectif » avec le texte long, et **pas** de colonne pour `ancien` ;
3. l'export du secrétariat n'a pas la colonne du champ clinique.

- [ ] **Step 2 : implémenter**

Dans `PatientDomain` (ajouter `serviceFieldRepository` au constructeur) :

```ts
async findAllWithTags(): Promise<PatientWithTagsDomain[]> {
  const [patients, fields] = await Promise.all([
    this.patientRepository.findAllWithTags(),
    this.serviceFieldRepository.findAll(),
  ])
  const longKeys = new Set(fields.filter((f) => f.type === 'longtext').map((f) => f.key))
  const withoutLong = (values: unknown) =>
    Object.fromEntries(Object.entries(asValues(values)).filter(([k]) => !longKeys.has(k)))
  return patients.map((p) => ({ ...p, data: withoutLong(p.data), clinicalData: withoutLong(p.clinicalData) }))
}
```

Pour l'export, construire les colonnes après `EXPORT_COLUMNS` :

```ts
const formatValue = (field: ServiceFieldEntityRepo, value: unknown): string => {
  const label = (key: unknown) => field.choices.find((c) => c.key === key)?.label ?? String(key)
  if (value === undefined || value === null) return ''
  if (field.type === 'choice') return label(value)
  if (field.type === 'multichoice') return Array.isArray(value) ? value.map(label).join(', ') : ''
  if (field.type === 'boolean') return value === true ? 'Oui' : 'Non'
  if (field.type === 'date' && typeof value === 'string') return formatDate(new Date(`${value}T00:00:00Z`))
  return String(value)
}
```

Colonnes : `fields.filter((f) => f.archivedAt === null && (includeClinicalFields || !f.clinical))`, triées par section puis `order`, largeur 22, valeur lue dans `p.serviceFile?.clinicalData` ou `p.serviceFile?.data` selon `f.clinical`. Écrire les `if` avec accolades (Biome).

- [ ] **Step 3 : vérifier, commiter**

```bash
cd back && npm run build && npm run lint && <commande e2e>
git add -A back
git commit -m "feat(fiche): liste et export construits depuis les champs du service"
```

---

### Task 7 : front — types, accès aux définitions, registre de types

**Files:**
- Create: `front/src/types/serviceField.ts`, `front/src/api/serviceField.api.ts`, `front/src/queries/useServiceField.ts`, `front/src/constants/serviceFieldTypes.tsx`
- Modify: `front/src/types/patient.ts`, `front/src/types/patientServiceFile.ts`, `front/src/constants/process.constant.ts`
- Test: `front/src/constants/serviceFieldTypes.test.tsx`

**Interfaces:**
- Produces:

```ts
// types/serviceField.ts
export type ServiceFieldType = 'text' | 'longtext' | 'number' | 'date' | 'choice' | 'multichoice' | 'boolean'
export type ServiceFieldSection = 'pathway' | 'outcome'
export type ServiceFieldChoice = { id: string; key: string; label: string; order: number; archived: boolean }
export type ServiceField = {
  id: string
  key: string
  label: string
  type: ServiceFieldType
  section: ServiceFieldSection
  order: number
  clinical: boolean
  unit: string | null
  archived: boolean
  choices: ServiceFieldChoice[]
}
export type FieldValues = Record<string, unknown>
```

  - `ServiceFieldApi` : `getAll`, `create`, `update`, `createChoice`, `updateChoice`, `reorder`, `reorderChoices` — URL `${tenantApiUrl()}/service-fields…`, forme de `thematic.api.ts`
  - `useServiceFieldsQuery(): { fields: ServiceField[]; isPending }` (clé `[SERVICE_FIELD.GET_ALL]`) et `useServiceFieldMutations()` (chaque mutation invalide `SERVICE_FIELD.GET_ALL` et `PATIENT.GET_ALL_WITH_TAGS`)
  - `fieldValue(field, row: { data?: FieldValues; clinicalData?: FieldValues } | null | undefined): unknown`
  - `SERVICE_FIELD_TYPE_LABELS: Record<ServiceFieldType, string>` (« Texte court », « Texte long », « Nombre », « Date », « Choix unique », « Choix multiple », « Oui / Non »)
  - `emptyFormValue(type): '' | string[]` et `toPatchValue(type, formValue): unknown` (`''` et `[]` → `null` ; nombre `undefined` → `null` ; booléen `'true'`/`'false'` → `true`/`false`)
  - `formatFieldValue(field, value): string` (même règles que l'export back)

- [ ] **Step 1 : types**

`PatientWithTags` : retirer les huit champs à choix, ajouter `data?: FieldValues` et `clinicalData?: FieldValues`. `PatientServiceFile` : retirer les dix champs, ajouter `data: FieldValues` et `clinicalData?: FieldValues`. `UpdatePatientServiceFileFields` reste `Omit<…>` et gagne donc `data`/`clinicalData` optionnels via `Partial` : écrire `Partial<Omit<PatientServiceFile, 'id' | 'patientId' | 'serviceId' | 'establishmentId' | 'createdAt'>>`.

Lancer `cd front && npx tsc --noEmit -p tsconfig.app.json` : les erreurs restantes sont dans les fichiers des tâches 8 et 9 — les laisser, elles y sont traitées. **Ne pas commiter avant la fin du Step 4.**

- [ ] **Step 2 : test du registre (rouge)**

`front/src/constants/serviceFieldTypes.test.tsx` :

```ts
import { describe, expect, it } from 'vitest'

import type { ServiceField } from '../types/serviceField.ts'
import { fieldValue, formatFieldValue, toPatchValue } from './serviceFieldTypes.tsx'

const field = (over: Partial<ServiceField>): ServiceField => ({
  id: 'f', key: 'k', label: 'K', type: 'text', section: 'pathway', order: 0,
  clinical: false, unit: null, archived: false, choices: [], ...over,
})

describe('serviceFieldTypes', () => {
  it('lit la valeur dans la bonne colonne', () => {
    const row = { data: { k: 'a' }, clinicalData: { k: 'b' } }
    expect(fieldValue(field({}), row)).toBe('a')
    expect(fieldValue(field({ clinical: true }), row)).toBe('b')
    expect(fieldValue(field({}), null)).toBeUndefined()
  })

  it('transforme les valeurs vides du formulaire en effacement', () => {
    expect(toPatchValue('text', '')).toBeNull()
    expect(toPatchValue('multichoice', [])).toBeNull()
    expect(toPatchValue('number', undefined)).toBeNull()
    expect(toPatchValue('number', 7.2)).toBe(7.2)
    expect(toPatchValue('boolean', 'true')).toBe(true)
    expect(toPatchValue('boolean', 'false')).toBe(false)
    expect(toPatchValue('boolean', '')).toBeNull()
  })

  it('formate comme l export', () => {
    const choices = [{ id: '1', key: 'HTA', label: 'Hypertension', order: 0, archived: false }]
    expect(formatFieldValue(field({ type: 'multichoice', choices }), ['HTA', 'X'])).toBe('Hypertension, X')
    expect(formatFieldValue(field({ type: 'boolean' }), false)).toBe('Non')
    expect(formatFieldValue(field({ type: 'date' }), '2026-03-01')).toBe('01/03/2026')
    expect(formatFieldValue(field({ type: 'number', unit: '%' }), 7.2)).toBe('7.2 %')
  })
})
```

Run: `cd front && npx vitest run src/constants/serviceFieldTypes.test.tsx` — Expected: FAIL.

- [ ] **Step 3 : implémenter le registre, l'API, les requêtes**

API et requêtes : recopier la forme de `thematic.api.ts` et `queries/useThematic.ts`, avec les toasts du dépôt (`useToast`, `TOAST_SEVERITY`). Ajouter `SERVICE_FIELD` à `process.constant.ts` (`GET_ALL`, `CREATE`, `UPDATE`, `CREATE_CHOICE`, `UPDATE_CHOICE`, `REORDER`). Le registre implémente les fonctions listées en Interfaces ; les dates se formatent avec `dayjs.utc(value).format('DD/MM/YYYY')`.

- [ ] **Step 4 : vérifier**

Run: `cd front && npx vitest run src/constants/serviceFieldTypes.test.tsx` — Expected: PASS. Le commit se fait en fin de tâche 8 (le front ne compile qu'à ce moment).

---

### Task 8 : front — fiche patient dynamique

**Files:**
- Create: `front/src/components/custom/Patient/edit/serviceFields.patient.tsx`
- Modify: `front/src/components/custom/Patient/edit/form.patient.ts`, `edit.patient.tsx`, `pathway-inclusion.patient.tsx`, `outcome-review.patient.tsx`
- Modify: `front/src/constants/patient.constant.ts` (retrait des constantes migrées)
- Test: `front/src/components/custom/Patient/edit/edit.patient.test.tsx`, `affectation-des-champs.test.ts`

**Interfaces:**
- Consumes: `useServiceFieldsQuery`, `fieldValue`, `emptyFormValue`, `toPatchValue`, `useCan`.
- Produces: `ServiceFieldsSection({ form, section, fields })` qui rend, dans l'ordre, les champs actifs de la section ; formulaire du sous-dossier avec `values.fields: Record<string, unknown>` (une entrée par champ actif, valeur de formulaire).

- [ ] **Step 1 : lire les tests existants**

```bash
cd front && sed -n 1,80p src/components/custom/Patient/edit/edit.patient.test.tsx && cat src/components/custom/Patient/edit/affectation-des-champs.test.ts
```

`affectation-des-champs.test.ts` énumère sans doute les champs par onglet : mettre à jour sa liste (les dix champs migrés n'existent plus en dur), sans affaiblir ce qu'il vérifie pour les champs fixes.

- [ ] **Step 2 : tests (rouges)**

Dans `edit.patient.test.tsx`, en simulant `ServiceFieldApi.getAll` (même procédé de simulation que le fichier utilise déjà pour `PatientServiceFileApi`) avec : `orientation` (`choice`, `A` actif, `VIEUX` archivé), `hba1c` (`number`, unité `%`), `diag` (`choice`, clinique), `ancien` (archivé), et un sous-dossier `data: { orientation: 'VIEUX', hba1c: 7 }`, `clinicalData: { diag: 'AVC' }`. Cas :

1. l'onglet *Parcours & Inclusion* affiche « Date d'entrée », puis les libellés dans l'ordre configuré ; « ancien » absent ;
2. la valeur archivée s'affiche « VIEUX (archivé) » et n'est pas proposée dans la liste ouverte ;
3. avec un rôle sans `clinical:read`, le champ `diag` n'est pas rendu ;
4. modifier seulement `hba1c` puis enregistrer envoie `{ patientID, data: { hba1c: 8 } }` — ni `orientation`, ni `clinicalData` ;
5. vider `hba1c` envoie `{ data: { hba1c: null } }`.

- [ ] **Step 3 : implémenter**

- `form.patient.ts` : retirer les dix champs de `patientServiceFileFormOpts.defaultValues` et ajouter `fields: {} as Record<string, unknown>`. `buildServiceFileDefaults(data, fields: ServiceField[])` remplit `fields[f.key]` pour chaque champ **actif** : valeur lue par `fieldValue`, sinon `emptyFormValue(f.type)` ; booléen → `'true'`/`'false'`/`''`.
- `edit.patient.tsx` : lire `useServiceFieldsQuery()` ; `serviceFileReady` attend aussi la fin de cette lecture. Dans `serviceFileForm.onSubmit`, les champs fixes restent calculés comme aujourd'hui ; pour les champs configurables, parcourir les champs actifs et retenir ceux dont `formApi.getFieldMeta(\`fields.${f.key}\`)?.isDefaultValue === false`, puis ranger `toPatchValue(f.type, value)` dans `data` ou `clinicalData` selon `f.clinical`. N'ajouter `data`/`clinicalData` au corps que s'ils ont au moins une clé. Après succès, `formApi.reset(buildServiceFileDefaults(response, fields))`.
- `serviceFields.patient.tsx` : un `withForm` qui reçoit `section` et `fields`, filtre `!f.archived && f.section === section && (canReadClinical || !f.clinical)`, trie par `order`, et rend pour chaque champ `<form.AppField name={\`fields.${f.key}\`}>` avec le composant du type :
  - `text` → `field.Input`, `longtext` → `field.TextArea`, `number` → `field.Number` (libellé suffixé « (unité) » si `unit`), `date` → `field.DatePicker`
  - `choice` → `field.Select` avec les choix actifs, plus, si la valeur courante est un choix archivé, une option `{ value, label: \`${label} (archivé)\` }`
  - `multichoice` → `field.MultiSelect`, même règle pour les valeurs archivées présentes
  - `boolean` → `field.Select` options `[{ value: 'true', label: 'Oui' }, { value: 'false', label: 'Non' }]`, `clearable`
- `pathway-inclusion.patient.tsx` : garde le titre et `entryDate`, remplace les huit champs par `<ServiceFieldsSection form={form} section="pathway" fields={fields} />`. Même chose pour `outcome-review.patient.tsx` avec `exitDate` et `section="outcome"`. Les deux composants reçoivent `fields` en prop depuis `edit.patient.tsx`.
- `patient.constant.ts` : retirer `MEDICAL_DIAGNOSIS`, `CARE_MODE`, `ORIENTATION`, `ETP_DECISION`, `PROGRAM_TYPE`, `NON_INCLUSION_DETAILS`, `ETP_FINAL_OUTCOME` et leurs `*_OPTIONS`, ainsi que `STOP_REASON_OPTIONS`. **Garder `STOP_REASON`** (écran d'activité, jusqu'au chantier 2).

- [ ] **Step 4 : vérifier, commiter (tâches 7 et 8)**

```bash
cd front && npx tsc --noEmit -p tsconfig.app.json && npx vitest run src/components/custom/Patient src/constants
npx biome check --write <fichiers touchés>
git add -A front
git commit -m "feat(fiche): formulaire patient construit depuis les champs du service"
```

Le build complet attend la tâche 9 si `patient.column.tsx` ne compile pas encore ; dans ce cas, faire la tâche 9 avant ce commit et commiter les deux ensemble.

---

### Task 9 : front — colonnes et filtres de la liste des patients

**Files:**
- Modify: `front/src/components/table/choiceColumn.tsx` (+ `choiceColumn.test.tsx`)
- Modify: `front/src/columns/patient.column.tsx`
- Modify: `front/src/routes/_authenticated/e/$establishmentId/s/$serviceId/patient/index.tsx` (passage des définitions)

**Interfaces:**
- Consumes: `ServiceField`, `fieldValue`, `formatFieldValue`.
- Produces: `multiChoiceColumn<TData>(id, accessor: (row) => string[] | undefined, options)` dans `choiceColumn.tsx` ; `getPatientColumns({ onView, fields })`.

- [ ] **Step 1 : tests (rouges)**

Dans `choiceColumn.test.tsx`, sur le modèle des tests existants de `choiceColumn` :
1. `multiChoiceColumn` rend une étiquette par valeur ;
2. son filtre retient une ligne si **une** de ses valeurs est cochée, et une ligne vide si « Non renseigné » est coché ;
3. ses valeurs facettées comptent chaque valeur séparément (une ligne `['HTA', 'DIAB']` compte pour `HTA` et pour `DIAB`) — si TanStack facette le tableau entier comme une seule valeur, définir `getUniqueValues: (row) => accessor(row) ?? [undefined]` sur la colonne et le tester.

- [ ] **Step 2 : implémenter**

```ts
export function multiChoiceColumn<TData>(
  id: string,
  accessor: (row: TData) => string[] | null | undefined,
  options: { label: string; group?: string; choices: Choice[] },
): ColumnDef<TData, string[] | undefined> {
  const { label, group, choices } = options
  const indexOf = new Map(choices.map((c, i) => [c.value, i]))
  const values = (row: TData) => {
    const v = accessor(row)
    return v && v.length > 0 ? v : undefined
  }
  const filterFn: FilterFn<TData> = (row, columnId, selected: string[]) => {
    const v = row.getValue<string[] | undefined>(columnId)
    return v ? v.some((x) => selected.includes(x)) : selected.includes(EMPTY_CHOICE)
  }
  filterFn.autoRemove = (v) => !Array.isArray(v) || v.length === 0
  return {
    id,
    accessorFn: values,
    getUniqueValues: (row) => values(row) ?? [undefined],
    header: label,
    sortUndefined: 'last',
    sortingFn: (a, b, columnId) =>
      (a.getValue<string[]>(columnId) ?? []).map((v) => choiceLabel(choices, v)).join(', ')
        .localeCompare((b.getValue<string[]>(columnId) ?? []).map((v) => choiceLabel(choices, v)).join(', '), 'fr'),
    filterFn,
    cell: ({ getValue }) => (
      <div className="flex flex-wrap gap-1">
        {(getValue() ?? []).map((value) => {
          const index = indexOf.get(value)
          return (
            <Etiquette key={value} ton="neutre" couleur={index === undefined ? undefined : choiceColor(index)}>
              {choiceLabel(choices, value)}
            </Etiquette>
          )
        })}
      </div>
    ),
    meta: { optional: { label, group }, choices },
  }
}
```

Dans `patient.column.tsx`, retirer les huit `choiceColumn` codés en dur et les imports de constantes ; générer, à la place, une colonne par champ **actif** (`!f.archived`) dont le type n'est pas `longtext`, groupe « Inclusion » pour `pathway` et « Bilan » pour `outcome`, id = `f.key`, accesseur = `fieldValue(f, row)` :
- `choice` → `choiceColumn` (choix = **tous** les choix, archivés compris, pour libeller les vieilles valeurs ; les choix archivés après les actifs)
- `multichoice` → `multiChoiceColumn`, mêmes choix
- `boolean` → `choiceColumn` avec `[{ value: 'true', label: 'Oui' }, { value: 'false', label: 'Non' }]` et un accesseur qui convertit le booléen en `'true'`/`'false'`
- `text`, `number`, `date` → `columnHelper.accessor` optionnel (`meta.optional`), `sortUndefined: 'last'`, cellule `formatFieldValue` ; le nombre trie numériquement (accesseur qui rend le nombre)

La colonne fixe « Date de sortie » reste telle quelle, après les colonnes générées. La page passe `fields` depuis `useServiceFieldsQuery()` et mémorise les colonnes sur `[fields, onView]`.

- [ ] **Step 3 : vérifier, commiter**

```bash
cd front && npm run build && npx vitest run
git add -A front
git commit -m "feat(fiche): colonnes et filtres de la liste generes depuis les champs du service"
```

---

### Task 10 : front — écran d'administration de la fiche

**Files:**
- Create: `front/src/routes/_authenticated/e/$establishmentId/s/$serviceId/_settings/fiche-patient.tsx`
- Create: `front/src/components/custom/popup/serviceFieldForm.tsx`
- Modify: `front/src/navigation/navigation.ts`
- Test: `front/src/routes/_authenticated/e/$establishmentId/s/$serviceId/_settings/fiche-patient.test.tsx`

**Interfaces:**
- Consumes: `useServiceFieldsQuery`, `useServiceFieldMutations`, `SERVICE_FIELD_TYPE_LABELS`.

- [ ] **Step 1 : lire les voisins**

```bash
cd front && cat 'src/routes/_authenticated/e/$establishmentId/s/$serviceId/_settings/location.tsx' src/components/custom/popup/addLocationForm.tsx
```

Reprendre : `beforeLoad` qui redirige sans `referentials:write`, `DashboardLayout`, en-tête `h1`, `Switch` « Archivés », popups de `components/custom/popup/`, `ConfirmDeleteForm` pour l'archivage.

- [ ] **Step 2 : tests (rouges)**

Avec `ServiceFieldApi` simulé :
1. l'écran affiche deux blocs, « Parcours & Inclusion » et « Sortie & Bilan », chacun avec ses champs actifs dans l'ordre et le type en clair (« Choix unique ») ;
2. créer « Comorbidités » de type « Choix multiple » avec deux choix appelle `create` avec `{ label: 'Comorbidités', type: 'multichoice', section: 'pathway', clinical: false, choices: ['HTA', 'Diabète'] }` ;
3. dans la popup d'un champ existant, le type et la case « Clinique » sont désactivés ;
4. la flèche « descendre » du premier champ appelle `reorder` avec les deux identifiants inversés ; la flèche « monter » du premier est désactivée ;
5. le bouton « Archiver » ouvre la confirmation puis appelle `update(id, { archived: true })` ; avec « Archivés » coché, un champ archivé affiche « Restaurer ».

- [ ] **Step 3 : implémenter**

- Écran : pour chaque section, une liste (pas une `ReactTable` : il faut des flèches d'ordre) de lignes « libellé — type — Clinique (étiquette si vrai) — boutons ↑ ↓ Modifier Archiver ». Les flèches sont des `Button variant="outline" size="icon-sm"` avec `aria-label` (« Monter », « Descendre »). Un bouton « Ajouter un champ » par section ouvre la popup pré-remplie avec cette section.
- Popup `serviceFieldForm.tsx` (`useAppForm`) : libellé (requis), type (`field.Select`, désactivé en modification), unité (affichée si `number`), « Clinique » (`field.Checkbox`, désactivé en modification, aide : « Masqué au secrétariat et à la lecture seule »), et pour `choice`/`multichoice` : à la création, une saisie des choix (`TagInput` de `components/ui/tagInput.tsx` s'il convient, sinon une liste de `Input` avec « Ajouter un choix ») ; en modification, la liste des choix existants avec libellé modifiable, ↑ ↓ et Archiver/Restaurer, plus un champ « Nouveau choix ».
- Navigation : ajouter dans `navigation.ts`, après « Diagnostics éducatifs » :

```ts
    {
      label: 'Fiche patient',
      to: '/e/$establishmentId/s/$serviceId/fiche-patient',
      permission: 'referentials:write',
      group: 'Administration',
      description: 'Champs des onglets Parcours et Sortie',
    },
```

- [ ] **Step 4 : vérifier, commiter**

```bash
cd front && npm run build && npx vitest run
git add -A front
git commit -m "feat(fiche): ecran de configuration de la fiche patient"
```

---

### Task 11 : documentation, déploiement, vérification navigateur

**Files:**
- Create: `docs/fiche-configurable/deploiement.md`
- Modify: `back/CLAUDE.md`, `front/CLAUDE.md`

- [ ] **Step 1 : procédure de déploiement**

`docs/fiche-configurable/deploiement.md`, sur le modèle de `docs/multi-tenant/deploiement-etape-3.md` :
1. sauvegarde manuelle de la production, et la commande de restauration ;
2. arrêter l'ancien conteneur (il écrirait pendant la migration) ;
3. relever, en lecture seule, le nombre de valeurs non vides des dix colonnes, et générer la grille ARS d'une période connue (export depuis l'écran « Indicateurs ARS ») ;
4. déployer (la migration s'applique au démarrage, sa garde annule tout en cas d'écart) ;
5. comparer : nombre de clés par champ dans `data`/`clinicalData` (requête fournie), grille ARS de la même période ;
6. retour arrière : restauration de la sauvegarde. Le dire sans détour : les colonnes sont supprimées dans la même migration, il n'y a pas d'autre retour arrière.

- [ ] **Step 2 : conventions**

Dans `back/CLAUDE.md` : les champs de *Parcours & Inclusion* et *Sortie & Bilan* sont configurables (`ServiceFieldDefinition`) ; valeurs dans `PatientServiceFile.data` et `clinicalData` ; `clinicalData` est filtré par nom comme `notes` ; toute écriture passe par `mergeFieldPatch` ; un type nouveau = une entrée dans `service-field-types.ts` et une dans `front/src/constants/serviceFieldTypes.tsx`. Dans `front/CLAUDE.md` : la même règle pour le registre front. Une ligne par point.

- [ ] **Step 3 : portes complètes**

```bash
cd back && npm run build && npm run lint && <commande unit> && <commande e2e>
cd ../front && npm run build && npx vitest run && npx biome lint src 2>&1 | tail -1
```

Comparer le décompte Biome front à celui de `/Users/couffinhal/Documents/MediSync/front` : la branche n'en ajoute aucun.

- [ ] **Step 4 : vérification dans le navigateur**

Après le merge de `main` dans le worktree et la fusion vers `main` (règle du dépôt), la base de développement de Léo reçoit la migration au prochain démarrage du back ; **ne pas la lancer soi-même**, demander à Léo de redémarrer son back. Puis, sur `http://localhost:4270` avec le compte du seed (`back/prisma/seed/user.ts`), en coordinateur :
1. *Administration → Fiche patient* : les dix champs ETP sont là, dans l'ordre ;
2. créer « Comorbidités » (choix multiple, HTA, Diabète) dans *Parcours & Inclusion* ;
3. ouvrir un patient, renseigner Comorbidités = HTA, enregistrer, recharger : la valeur est là ;
4. liste des patients → « Colonnes » → ajouter « Comorbidités » ; filtrer sur HTA : seul ce patient reste ;
5. *Indicateurs ARS* sur l'année en cours : mêmes chiffres qu'avant la migration (capture prise avant).

- [ ] **Step 5 : commit**

```bash
git add -A docs back/CLAUDE.md front/CLAUDE.md
git commit -m "docs(fiche): deploiement et conventions des champs configurables"
```

---

## Auto-relecture

**Couverture de la spec.** §3 → tâches 1, 2. §4 (migration, garde, choix archivés, adaptations ARS/rapport) → tâche 3. §5 définitions → tâche 4 ; écriture → tâche 5 ; droits cliniques → tâches 2 (`clinicalData` dans `CLINICAL_FIELDS`), 5 (test secrétariat), 6 (liste, export). §6 registre → tâche 7 ; fiche → tâche 8 ; liste → tâche 9 ; export → tâche 6 ; administration → tâche 10. §7 performance → tâche 6 (textes longs retirés de la liste). §8 tests et déploiement → tâches 3, 11. §9 hors périmètre : rien n'est construit pour les indicateurs.

**Conflits entre tâches.**

| Paire | Point partagé | Règle |
|---|---|---|
| 2 → 3 | la migration | La tâche 2 crée le SQL structurel, la tâche 3 le complète ; aucune n'applique sur `medisync`. |
| 3 → 5, 6 | colonnes supprimées | La tâche 3 ne fait que ce qu'il faut pour compiler (export amputé de quatre colonnes) ; la tâche 6 les remplace. Entre les deux, l'export est incomplet : ne pas fusionner vers `main` avant la tâche 6. |
| 7 ↔ 8 ↔ 9 | types front | Le changement de types casse la compilation jusqu'à la tâche 9 ; commiter 7-9 ensemble si nécessaire, mais ne jamais commiter un front qui ne compile pas. |
| 3 ↔ tests e2e existants | valeurs attendues ARS / activité | Seule la façon d'écrire les données de test change, jamais une valeur attendue. |

**Cohérence des noms.** `mergeFieldPatch`, `readChoice`, `asValues`, `fieldKeyFromLabel`, `choiceKeyFromLabel` (back) ; `fieldValue`, `toPatchValue`, `emptyFormValue`, `formatFieldValue`, `multiChoiceColumn`, `ServiceFieldsSection` (front) : chacun défini une fois, aux tâches 1, 3, 5, 7, 8, 9.
