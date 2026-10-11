import { MEASURES, type MeasureKey } from './measures'

export type OptionChoiceCatalog = { value: string; label: string }

export type MeasureOptionCatalog = {
  name: string
  label: string
  kind: 'boolean' | 'enum'
  choices?: OptionChoiceCatalog[]
}

export type MeasureCatalogEntry = {
  key: string
  label: string
  description: string
  unit: string
  options: MeasureOptionCatalog[]
}

// Libellés et choix du catalogue : écrits à la main, pas dérivés des schémas Zod des mesures
// (`measures.ts`), dont les clés d'option et de choix sont des identifiants techniques.
const OPTIONS_BY_MEASURE: Record<MeasureKey, MeasureOptionCatalog[]> = {
  patientsEntres: [
    {
      name: 'diagnosticADistance',
      label: 'Diagnostic éducatif à distance',
      kind: 'boolean',
    },
  ],
  patientsParModalite: [
    {
      name: 'modalite',
      label: 'Modalité',
      kind: 'enum',
      choices: [
        { value: 'hospitalisation', label: 'Hospitalisation' },
        { value: 'externes', label: 'Externes' },
        { value: 'mixte', label: 'Mixte' },
      ],
    },
  ],
  seancesIndividuelles: [
    { name: 'aDistance', label: 'À distance', kind: 'boolean' },
  ],
  seancesCollectives: [
    { name: 'aDistance', label: 'À distance', kind: 'boolean' },
  ],
  moyennePatientsParSeanceCollective: [],
  patientsAccompagnes: [],
  seancesAvecProche: [],
  patientsProgrammeComplet: [
    {
      name: 'modalite',
      label: 'Modalité',
      kind: 'enum',
      choices: [
        { value: 'toutes', label: 'Toutes' },
        { value: 'hospitalisation', label: 'Hospitalisation' },
        { value: 'externes', label: 'Externes' },
        { value: 'mixte', label: 'Mixte' },
      ],
    },
  ],
  patientsEvalues: [],
  patientsProgrammePersonnalise: [
    {
      name: 'variante',
      label: 'Variante',
      kind: 'enum',
      choices: [
        { value: 'initial', label: 'Initial' },
        {
          value: 'initialTermineParReactu',
          label: 'Initial terminé par réactualisation',
        },
        {
          value: 'suiviCommenceParReactu',
          label: 'Suivi commencé par réactualisation',
        },
        {
          value: 'suiviReactuDebutEtFin',
          label: 'Suivi encadré par réactualisation',
        },
      ],
    },
  ],
  patientsSortis: [],
  patientsSuivis: [],
}

// `Object.entries` oublie que ses clés sont des `MeasureKey` : ce garde-fou le leur rappelle,
// comme `isServicePermission` (utils/permissions.ts) pour un besoin identique.
const isMeasureKey = (key: string): key is MeasureKey =>
  Object.hasOwn(MEASURES, key)

export const MEASURE_CATALOG: MeasureCatalogEntry[] = Object.entries(
  MEASURES,
).map(([key, m]) => ({
  key,
  label: m.label,
  description: m.description,
  unit: m.unit,
  options: isMeasureKey(key) ? OPTIONS_BY_MEASURE[key] : [],
}))
