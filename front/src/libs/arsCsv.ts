import type { ArsIndicator } from '../types/arsIndicator.ts'
import { nombre, toCsv } from './csv.ts'

// Une ligne par indicateur ; sans valeur, la raison va dans la colonne note.
export const arsCsv = (
  indicateurs: ArsIndicator[],
  serviceName: string,
  from: string,
  to: string,
): string =>
  toCsv(
    [
      ['code', 'libellé', 'valeur', 'note'],
      ['Service', serviceName, '', ''],
      ['Période', `${from} au ${to}`, '', ''],
      ...indicateurs.map((i) => [
        i.code,
        i.label,
        i.value === null ? '' : nombre(i.value),
        i.note ?? '',
      ]),
    ],
    [1],
  )
