// Couleurs des colonnes à choix, attribuées selon la position de la valeur dans sa liste.
const CHOICE_PALETTE = [
  '#3B82F6',
  '#10B981',
  '#F59E0B',
  '#EF4444',
  '#8B5CF6',
  '#EC4899',
  '#14B8A6',
  '#F97316',
  '#6366F1',
  '#84CC16',
] as const

export const choiceColor = (index: number): string =>
  CHOICE_PALETTE[index % CHOICE_PALETTE.length] ?? CHOICE_PALETTE[0]
