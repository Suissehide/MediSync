import type { IndicatorResult } from '../types/indicatorSet.ts'
import { nombre, toCsv } from './csv.ts'

// Une ligne par indicateur, puis une par ligne de répartition ; sans valeur, la raison va dans la note.
export const indicatorCsv = (
  indicateurs: IndicatorResult[],
  serviceName: string,
  from: string,
  to: string,
): string =>
  toCsv(
    [
      ['code', 'libellé', 'valeur', 'note'],
      ['Service', serviceName, '', ''],
      ['Période', `${from} au ${to}`, '', ''],
      ...indicateurs.flatMap((i) => [
        [i.code, i.label, ...valeurEtNote(i)],
        ...(i.breakdown ?? []).map((b) => [
          '',
          `— ${b.label}`,
          nombre(b.value),
          '',
        ]),
      ]),
    ],
    [1],
  )

// Une reponse saisie remplace la valeur ; l'explication saisie remplace la note. Une reponse
// enregistree mais vide (bascule remise a vide, nombre efface sans texte) retombe sur la note
// de l'indicateur, comme une absence totale de reponse.
const valeurEtNote = ({ value, note, input, answer }: IndicatorResult) => {
  const sansReponse: [string, string] = [
    value === null ? '' : nombre(value),
    note ?? '',
  ]
  if (input === 'yesno' && answer && answer.boolValue !== null) {
    return [answer.boolValue ? 'Oui' : 'Non', '']
  }
  if (
    input === 'number+text' &&
    answer &&
    (answer.numberValue !== null || answer.textValue)
  ) {
    return [
      answer.numberValue === null ? '' : nombre(answer.numberValue),
      answer.textValue ?? '',
    ]
  }
  return sansReponse
}
