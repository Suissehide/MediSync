import { toSelectOptions } from '../libs/utils.ts'

// Role lu par les indicateurs ARS et Activite a la place du nom de la thematique.
export const THEMATIC_ROLE: Record<
  'DIAGNOSTIC_EDUCATIF' | 'REACTUALISATION' | 'BILAN_DE_FIN',
  string
> = {
  DIAGNOSTIC_EDUCATIF: 'Diagnostic éducatif',
  REACTUALISATION: 'Réactualisation',
  BILAN_DE_FIN: 'Bilan de fin',
}

export type ThematicRole = keyof typeof THEMATIC_ROLE

// Radix interdit un `Select.Item` de valeur '' : sentinelle pour « Aucun » (cf. NO_SERVICE_ROLE).
export const NO_THEMATIC_ROLE = 'NONE'

export const THEMATIC_ROLE_OPTIONS = [
  { value: NO_THEMATIC_ROLE, label: 'Aucun' },
  ...toSelectOptions(THEMATIC_ROLE),
]
