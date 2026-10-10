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
      ...indicateurs.map((i) => [i.code, i.label, ...valeurEtNote(i)]),
    ],
    [1],
  )

// Une reponse saisie remplace la valeur ; l'explication de 2.5 remplace la note.
const valeurEtNote = ({ value, note, input, answer }: ArsIndicator) => {
  if (input === 'yesno' && answer && answer.boolValue !== null) {
    return [answer.boolValue ? 'Oui' : 'Non', '']
  }
  if (input === 'number+text' && answer) {
    return [
      answer.numberValue === null ? '' : nombre(answer.numberValue),
      answer.textValue ?? '',
    ]
  }
  return [value === null ? '' : nombre(value), note ?? '']
}
