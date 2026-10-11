import type { IndicatorResult } from '@/types/indicatorSet.ts'

export type Statut = 'calcule' | 'saisi' | 'restant' | 'indisponible'
export type Filtre = 'tous' | 'calcule' | 'aSaisir' | 'indisponible'

export const statut = (i: IndicatorResult): Statut => {
  if (i.nature === 'computed') {
    return 'calcule'
  }
  if (i.nature === 'unavailable') {
    return 'indisponible'
  }
  const reponse =
    i.input === 'yesno' ? i.answer?.boolValue : i.answer?.numberValue
  return reponse == null ? 'restant' : 'saisi'
}

export const visible = (s: Statut, filtre: Filtre) =>
  filtre === 'tous' ||
  (filtre === 'aSaisir' ? s === 'saisi' || s === 'restant' : s === filtre)

export const compter = (indicateurs: IndicatorResult[], s: Statut) =>
  indicateurs.filter((i) => statut(i) === s).length
