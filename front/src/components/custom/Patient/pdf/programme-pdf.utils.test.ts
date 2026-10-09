import dayjs from 'dayjs'
import isoWeek from 'dayjs/plugin/isoWeek'
import utc from 'dayjs/plugin/utc'
import { describe, expect, it } from 'vitest'

import type { Slot } from '../../../../types/slot.ts'
import { buildCalendarEntries } from './programme-pdf.utils.ts'

dayjs.extend(utc)
dayjs.extend(isoWeek)

// Lundi 11/05/2026, puis les deux lundis suivants.
const slot = (id: string, startDate: string, thematicId: string) =>
  ({
    id,
    startDate,
    endDate: startDate,
    locked: false,
    appointments: [],
    slotTemplate: { thematicId, soignants: [] },
  }) as unknown as Slot

const noticeTexts = (entries: ReturnType<typeof buildCalendarEntries>) =>
  entries.filter((e) => e.kind === 'notice').map((e) => e.text)

describe('buildCalendarEntries, consignes à jeton %dates%', () => {
  const troisRdv = [
    slot('s1', '2026-05-11T09:00:00.000Z', 't1'),
    slot('s2', '2026-05-18T09:00:00.000Z', 't1'),
    slot('s3', '2026-05-25T09:00:00.000Z', 't1'),
  ]

  it('liste toutes les dates de la thématique, une seule fois pour le programme', () => {
    const entries = buildCalendarEntries(
      troisRdv,
      undefined,
      [],
      new Map([['t1', 'Un seul rendez-vous parmi : %dates%']]),
    )

    expect(noticeTexts(entries)).toEqual([
      'Un seul rendez-vous parmi : 11/05, 18/05 et 25/05',
    ])
  })

  it('un seul rendez-vous donne une seule date, sans « et »', () => {
    const entries = buildCalendarEntries(
      [troisRdv[0]],
      undefined,
      [],
      new Map([['t1', 'Rendez-vous le %dates%']]),
    )

    expect(noticeTexts(entries)).toEqual(['Rendez-vous le 11/05'])
  })

  it('une consigne sans jeton reste rappelée à chaque semaine', () => {
    const entries = buildCalendarEntries(
      troisRdv,
      undefined,
      [],
      new Map([['t1', 'Venez à jeun']]),
    )

    expect(noticeTexts(entries)).toEqual([
      'Venez à jeun',
      'Venez à jeun',
      'Venez à jeun',
    ])
  })
})
