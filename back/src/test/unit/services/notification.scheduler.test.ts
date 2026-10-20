import { reminderTime } from '../../../main/services/notification.scheduler'
import { sessionInstant } from '../../../main/utils/date'

// Entrees en valeurs STOCKEES (heure murale de Paris ecrite comme UTC), sorties en instants reels.
const stored = (s: string) => new Date(`${s}Z`)
const instant = (iso: string) => new Date(iso)

describe('NotificationScheduler.reminderTime', () => {
  it('veille du changement d heure d octobre (2026-10-25, 10h Paris) : 18h Paris la veille, pas 19h', () => {
    expect(reminderTime(stored('2026-10-25T10:00:00'), 'eve')).toEqual(
      instant('2026-10-24T16:00:00Z'),
    )
  })

  it('instant ambigu de la bascule (2026-10-25 02:30 Paris) : reste la veille 18h', () => {
    expect(reminderTime(stored('2026-10-25T02:30:00'), 'eve')).toEqual(
      instant('2026-10-24T16:00:00Z'),
    )
  })

  it('seance tardive (23h30 Paris) : la veille reste celle du jour stocke', () => {
    expect(reminderTime(stored('2026-11-10T23:30:00'), 'eve')).toEqual(
      instant('2026-11-09T17:00:00Z'),
    )
  })

  it('veille du changement d heure de mars (2026-03-29, 10h Paris) : 18h Paris la veille, pas 17h', () => {
    expect(reminderTime(stored('2026-03-29T10:00:00'), 'eve')).toEqual(
      instant('2026-03-28T17:00:00Z'),
    )
  })

  it('date ordinaire de novembre : 18h Paris la veille', () => {
    expect(reminderTime(stored('2026-11-10T10:00:00'), 'eve')).toEqual(
      instant('2026-11-09T17:00:00Z'),
    )
  })

  it('2h et 1h : depuis l instant reel, en hiver (10h Paris = 09h UTC)', () => {
    const startDate = stored('2026-11-10T10:00:00')
    expect(reminderTime(startDate, '2h')).toEqual(
      instant('2026-11-10T07:00:00Z'),
    )
    expect(reminderTime(startDate, '1h')).toEqual(
      instant('2026-11-10T08:00:00Z'),
    )
  })

  it('2h et 1h le jour du changement d octobre (10h Paris = 09h UTC apres la bascule)', () => {
    const startDate = stored('2026-10-25T10:00:00')
    expect(reminderTime(startDate, '2h')).toEqual(
      instant('2026-10-25T07:00:00Z'),
    )
    expect(reminderTime(startDate, '1h')).toEqual(
      instant('2026-10-25T08:00:00Z'),
    )
  })

  it('2h et 1h le jour du changement de mars (10h Paris = 08h UTC)', () => {
    const startDate = stored('2026-03-29T10:00:00')
    expect(reminderTime(startDate, '2h')).toEqual(
      instant('2026-03-29T06:00:00Z'),
    )
    expect(reminderTime(startDate, '1h')).toEqual(
      instant('2026-03-29T07:00:00Z'),
    )
  })
})

describe('sessionInstant', () => {
  it('convertit l heure murale de Paris stockee en instant reel', () => {
    expect(sessionInstant(stored('2026-10-25T10:00:00'))).toEqual(
      instant('2026-10-25T09:00:00Z'),
    )
    expect(sessionInstant(stored('2026-07-01T10:00:00'))).toEqual(
      instant('2026-07-01T08:00:00Z'),
    )
    expect(sessionInstant(stored('2026-11-10T10:00:00'))).toEqual(
      instant('2026-11-10T09:00:00Z'),
    )
  })
})
