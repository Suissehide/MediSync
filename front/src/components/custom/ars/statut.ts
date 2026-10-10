import type { ArsIndicator } from '@/types/arsIndicator.ts'

export type Statut = 'calcule' | 'saisi' | 'restant' | 'indisponible'
export type Filtre = 'tous' | 'calcule' | 'aSaisir' | 'indisponible'

export const statut = (i: ArsIndicator): Statut => {
  if (i.kind === 'computed') {
    return 'calcule'
  }
  if (i.kind === 'unavailable') {
    return 'indisponible'
  }
  const reponse =
    i.input === 'yesno' ? i.answer?.boolValue : i.answer?.numberValue
  return reponse == null ? 'restant' : 'saisi'
}

export const visible = (s: Statut, filtre: Filtre) =>
  filtre === 'tous' ||
  (filtre === 'aSaisir' ? s === 'saisi' || s === 'restant' : s === filtre)

export const compter = (indicateurs: ArsIndicator[], s: Statut) =>
  indicateurs.filter((i) => statut(i) === s).length
