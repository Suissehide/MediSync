import Boom from '@hapi/boom'
import * as XLSX from 'xlsx'

import type { IocContainer } from '../types/application/ioc'
import type {
  ArsAnswerInput,
  ArsIndicatorDomainInterface,
  ArsIndicatorsView,
  ArsRange,
} from '../types/domain/arsIndicator.domain.interface'
import type { ArsIndicatorRepositoryInterface } from '../types/infra/orm/repositories/arsIndicator.repository.interface'
import type { ArsManualAnswerRepositoryInterface } from '../types/infra/orm/repositories/arsManualAnswer.repository.interface'
import {
  type ArsAnswer,
  type ArsIndicatorResult,
  computeArsIndicators,
  MANUAL_INPUTS,
} from '../utils/ars-indicators'

const jour = (d: Date): string => d.toISOString().slice(0, 10)

// L'année civile quand la période va exactement du 1er janvier au 31 décembre, sinon null.
const anneeCivile = ({ from, to }: ArsRange): number | null => {
  const annee = from.getUTCFullYear()
  return jour(from) === `${annee}-01-01` && jour(to) === `${annee}-12-31`
    ? annee
    : null
}

// Une reponse enregistree mais vide (bascule remise a vide, nombre efface) retombe sur la note
// de l'indicateur, comme une absence totale de reponse.
const valeurExcel = (i: ArsIndicatorResult): string | number => {
  if (i.answer === null) {
    return i.value ?? i.note ?? ''
  }
  if (i.input === 'yesno') {
    if (i.answer.boolValue === null) {
      return i.note ?? ''
    }
    return i.answer.boolValue ? 'Oui' : 'Non'
  }
  if (i.answer.numberValue !== null) {
    return i.answer.numberValue
  }
  // Le texte seul va dans le libelle (cf. exportExcel) : la valeur reste vide.
  return i.answer.textValue ? '' : (i.note ?? '')
}

class ArsIndicatorDomain implements ArsIndicatorDomainInterface {
  private readonly arsIndicatorRepository: ArsIndicatorRepositoryInterface
  private readonly arsManualAnswerRepository: ArsManualAnswerRepositoryInterface

  constructor({
    arsIndicatorRepository,
    arsManualAnswerRepository,
  }: IocContainer) {
    this.arsIndicatorRepository = arsIndicatorRepository
    this.arsManualAnswerRepository = arsManualAnswerRepository
  }

  async findAll({ from, to }: ArsRange): Promise<ArsIndicatorsView> {
    const manualYear = anneeCivile({ from, to })
    const [{ files, presences }, answers] = await Promise.all([
      this.arsIndicatorRepository.findCohort(),
      manualYear === null
        ? new Map<string, ArsAnswer>()
        : this.arsManualAnswerRepository.findByYear(manualYear),
    ])
    const indicators = computeArsIndicators({ from, to, files, presences }).map(
      (i) =>
        i.kind === 'manual' ? { ...i, answer: answers.get(i.code) ?? null } : i,
    )
    return { manualYear, indicators }
  }

  saveAnswer(
    year: number,
    code: string,
    body: ArsAnswerInput,
    userId: string,
  ): Promise<ArsAnswer> {
    if (!Object.hasOwn(MANUAL_INPUTS, code)) {
      throw Boom.badRequest(`L'indicateur ${code} ne se saisit pas`)
    }
    const input = MANUAL_INPUTS[code]
    if ((input === 'yesno') !== 'boolValue' in body) {
      throw Boom.badRequest(`Réponse d'un autre type que celui de ${code}`)
    }
    const values: ArsAnswer =
      'boolValue' in body
        ? { numberValue: null, textValue: null, boolValue: body.boolValue }
        : { ...body, boolValue: null }
    return this.arsManualAnswerRepository.upsert(year, code, values, userId)
  }

  async exportExcel(range: ArsRange): Promise<Buffer> {
    const [{ indicators }, serviceName] = await Promise.all([
      this.findAll(range),
      this.arsIndicatorRepository.findServiceName(),
    ])

    const periode = `${jour(range.from)} au ${jour(range.to)}`
    const rows = [
      { Code: 'Service', Libellé: serviceName, Valeur: '' },
      { Code: 'Période', Libellé: periode, Valeur: '' },
      { Code: '', Libellé: '', Valeur: '' },
      ...indicators.map((i) => ({
        Code: i.code,
        Libellé: i.answer?.textValue
          ? `${i.label} — ${i.answer.textValue}`
          : i.label,
        Valeur: valeurExcel(i),
      })),
    ]

    const ws = XLSX.utils.json_to_sheet(rows)
    ws['!cols'] = [{ wch: 10 }, { wch: 90 }, { wch: 40 }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Indicateurs ARS')
    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
  }
}

export { ArsIndicatorDomain }
