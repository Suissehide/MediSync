import type { FilterCondition } from './filters'
import type { MeasureKey } from './measures'

// Orientations par la CLÉ stockée, jamais le libellé ; `measures.test.ts` les tient contre `ETP_FIELD_PRESET`.
export const ARS_ORIENTATIONS = {
  horsHopital: 'ORIENTATION_PRO_SANTE_EXT',
  hospitalisation: 'ORIENTATION_PRO_SANTE_HOSPIT',
  consultationExterne: 'ORIENTATION_PRO_SANTE_CS',
} as const

export type IndicatorConfig = {
  code: string
  label: string
  group: string
  nature: 'computed' | 'manual' | 'unavailable'
  measure?: MeasureKey
  options?: Record<string, unknown>
  filters?: FilterCondition[]
  breakdownField?: string
  input?: 'number+text' | 'yesno'
  note?: string
  parentCode?: string
}

const orientation = (cle: string): FilterCondition => ({
  field: 'orientation',
  op: 'in',
  value: [cle],
})

export const ARS_PRESET: readonly IndicatorConfig[] = [
  {
    code: '1.1',
    group: 'Entrée',
    label: "Nombre de patients ayant bénéficié d'un diagnostic éducatif",
    nature: 'computed',
    measure: 'patientsEntres',
    options: {},
  },
  {
    code: '1.1bis',
    group: 'Entrée',
    label:
      "Dont nombre de patients ayant bénéficié d'un diagnostic éducatif en distanciel",
    nature: 'computed',
    measure: 'patientsEntres',
    options: { diagnosticADistance: true },
    parentCode: '1.1',
  },
  {
    code: '1.2',
    group: 'Entrée',
    label:
      "Nombre de patients orientés par un professionnel de santé en dehors d'un hôpital (dont médecin traitant)",
    nature: 'computed',
    measure: 'patientsEntres',
    options: {},
    filters: [orientation(ARS_ORIENTATIONS.horsHopital)],
  },
  {
    code: '1.3',
    group: 'Entrée',
    label:
      "Nombre de patients orientés par un professionnel de santé au cours d'une hospitalisation",
    nature: 'computed',
    measure: 'patientsEntres',
    options: {},
    filters: [orientation(ARS_ORIENTATIONS.hospitalisation)],
  },
  {
    code: '1.4',
    group: 'Entrée',
    label:
      "Nombre de patients orientés par un professionnel de santé à l'hôpital en consultation externe",
    nature: 'computed',
    measure: 'patientsEntres',
    options: {},
    filters: [orientation(ARS_ORIENTATIONS.consultationExterne)],
  },
  {
    code: '2.1',
    group: 'Séances',
    label:
      "Nombre de patients pris en charge au cours d'une hospitalisation (de jour, de semaine, complète) en établissement de santé uniquement",
    nature: 'computed',
    measure: 'patientsParModalite',
    options: { modalite: 'hospitalisation' },
  },
  {
    code: '2.2',
    group: 'Séances',
    label:
      "Nombre de patients pris en charge en soins externes d'un établissement de santé uniquement",
    nature: 'computed',
    measure: 'patientsParModalite',
    options: { modalite: 'externes' },
  },
  {
    code: '2.3',
    group: 'Séances',
    label:
      'Nombre de patients pris en charge en soins de ville uniquement (MSP, association, ex-réseau de PS libéraux…)',
    nature: 'unavailable',
    note: 'Aucune notion de soins de ville : le type de rendez-vous vaut ambulatoire, hôpital ou téléphonique',
  },
  {
    code: '2.4',
    group: 'Séances',
    label:
      'Nombre de patients pris en charge en programme mixte (hospitalisation + soins externes)',
    nature: 'computed',
    measure: 'patientsParModalite',
    options: { modalite: 'mixte' },
  },
  {
    code: '2.5',
    group: 'Séances',
    label: 'Autre type de prise en charge à chiffrer et à expliquer',
    nature: 'manual',
    input: 'number+text',
    note: "Champ libre de l'enquête, à renseigner à la main",
  },
  {
    code: '2.6',
    group: 'Séances',
    label: "Nombre total de séances individuelles d'ETP réalisées",
    nature: 'computed',
    measure: 'seancesIndividuelles',
    options: { aDistance: false },
  },
  {
    code: '2.6bis',
    group: 'Séances',
    label: "Dont nombre de séances individuelles d'ETP réalisées en distanciel",
    nature: 'computed',
    measure: 'seancesIndividuelles',
    options: { aDistance: true },
    parentCode: '2.6',
  },
  {
    code: '2.7',
    group: 'Séances',
    label: "Nombre total de séances collectives d'ETP réalisées",
    nature: 'computed',
    measure: 'seancesCollectives',
    options: { aDistance: false },
  },
  {
    code: '2.7bis',
    group: 'Séances',
    label: "Dont nombre de séances collectives d'ETP réalisées en distanciel",
    nature: 'computed',
    measure: 'seancesCollectives',
    options: { aDistance: true },
    parentCode: '2.7',
  },
  {
    code: '2.8',
    group: 'Séances',
    label: 'Nombre moyen de patients par séance collective',
    nature: 'computed',
    measure: 'moyennePatientsParSeanceCollective',
    options: {},
  },
  {
    code: '2.9',
    group: 'Séances',
    label:
      'Nombre de proches et/ou aidants du patient ayant participé au programme',
    nature: 'computed',
    measure: 'patientsAccompagnes',
    options: {},
  },
  {
    code: '2.10',
    group: 'Séances',
    label:
      "Nombre total de séances d'ETP avec une participation de proches et/ou aidants du patient",
    nature: 'computed',
    measure: 'seancesAvecProche',
    options: {},
  },
  {
    code: '2.11',
    group: 'Séances',
    label:
      'Nombre total de séances destinées exclusivement aux proches et/ou aidants du patient',
    nature: 'unavailable',
    note: 'Un rendez-vous est toujours rattaché à des patients : une séance sans patient ne se représente pas',
  },
  {
    code: '3.1',
    group: 'Sortie',
    label:
      'Nombre de patients ayant suivi un programme personnalisé complet (quel que soit le mode de prise en charge)',
    nature: 'computed',
    measure: 'patientsProgrammeComplet',
    options: { modalite: 'toutes' },
  },
  {
    code: '3.2',
    group: 'Sortie',
    label:
      "Nombre de patients ayant suivi un programme personnalisé complet (au cours d'une hospitalisation complète ou de jour)",
    nature: 'computed',
    measure: 'patientsProgrammeComplet',
    options: { modalite: 'hospitalisation' },
  },
  {
    code: '3.3',
    group: 'Sortie',
    label:
      "Nombre de patients ayant suivi un programme personnalisé complet (au cours d'une venue en soins externes)",
    nature: 'computed',
    measure: 'patientsProgrammeComplet',
    options: { modalite: 'externes' },
  },
  {
    code: '3.4',
    group: 'Sortie',
    label:
      'Nombre de patients ayant suivi un programme personnalisé complet (au cours d’une venue mixte)',
    nature: 'computed',
    measure: 'patientsProgrammeComplet',
    options: { modalite: 'mixte' },
  },
  {
    code: '3.5',
    group: 'Sortie',
    label:
      "Nombre de patients ayant suivi un programme personnalisé complet (au cours de séances d'ETP pratiquées en soins de ville)",
    nature: 'unavailable',
    note: 'Aucune notion de soins de ville : le type de rendez-vous vaut ambulatoire, hôpital ou téléphonique',
  },
  {
    code: '3.6',
    group: 'Sortie',
    label:
      "Nombre de patients ayant bénéficié d'une évaluation individuelle des compétences acquises de l'ETP",
    nature: 'computed',
    measure: 'patientsEvalues',
    options: {},
  },
  {
    code: '4.1',
    group: 'Modalités',
    label:
      "Nombre de patients ayant bénéficié d'un programme personnalisé lors d'une offre initiale d'ETP",
    nature: 'computed',
    measure: 'patientsProgrammePersonnalise',
    options: { variante: 'initial' },
  },
  {
    code: '4.1bis',
    group: 'Modalités',
    label:
      'Dont nombre de patients ayant terminé par une réactualisation (Réactu 1 à 4)',
    nature: 'computed',
    measure: 'patientsProgrammePersonnalise',
    options: { variante: 'initialTermineParReactu' },
    parentCode: '4.1',
  },
  {
    code: '4.2',
    group: 'Modalités',
    label:
      'Une offre de suivi ou de renforcement dans un nouveau programme est-elle proposée au sein de la structure ?',
    nature: 'manual',
    input: 'yesno',
    note: 'Question oui/non sur la structure, à renseigner à la main',
  },
  {
    code: '4.3',
    group: 'Modalités',
    label:
      "Nombre de patients ayant bénéficié d'un programme personnalisé lors d'une offre de suivi ou de renforcement d'ETP commençant par une réactualisation",
    nature: 'computed',
    measure: 'patientsProgrammePersonnalise',
    options: { variante: 'suiviCommenceParReactu' },
  },
  {
    code: '4.3bis',
    group: 'Modalités',
    label:
      'Dont nombre de patients ayant également terminé par une réactualisation (Réactu 1 à 4)',
    nature: 'computed',
    measure: 'patientsProgrammePersonnalise',
    options: { variante: 'suiviReactuDebutEtFin' },
    parentCode: '4.3',
  },
  {
    code: '4.4',
    group: 'Modalités',
    label:
      "Nombre de patients dont la synthèse de l'évaluation des compétences acquises a été transmise au moins à leur médecin traitant",
    nature: 'unavailable',
    note: 'Aucun modèle ne trace cet envoi (relève du ticket « Envoi du bilan par MSSanté »)',
  },
]
