import dayjs from 'dayjs'
import timezone from 'dayjs/plugin/timezone'
import utc from 'dayjs/plugin/utc'

import { reminderTime } from '../../../main/services/notification.scheduler'

dayjs.extend(utc)
dayjs.extend(timezone)

const paris = (s: string) => dayjs.tz(s, 'Europe/Paris').toDate()

// reminderTime('eve') : la veille a 18h Paris, reconstruite depuis une chaine de date plutot que
// chainee sur l'instant de depart — sinon le decalage (ete/hiver) de `startDate` survit au
// changement de jour et fausse l'heure autour d'un changement d'heure (preuve ici).
describe('NotificationScheduler.reminderTime', () => {
  it('veille du changement d heure d octobre (2026-10-25, 10h Paris) : 18h Paris la veille, pas 19h', () => {
    expect(reminderTime(paris('2026-10-25 10:00'), 'eve')).toEqual(
      paris('2026-10-24 18:00'),
    )
  })

  it('instant ambigu de la bascule (2026-10-25 02:30 Paris) : reste la veille 18h', () => {
    expect(reminderTime(paris('2026-10-25 02:30'), 'eve')).toEqual(
      paris('2026-10-24 18:00'),
    )
  })

  it('veille du changement d heure de mars (2026-03-29, 10h Paris) : 18h Paris la veille, pas 17h', () => {
    expect(reminderTime(paris('2026-03-29 10:00'), 'eve')).toEqual(
      paris('2026-03-28 18:00'),
    )
  })

  it('date ordinaire de novembre : 18h Paris la veille', () => {
    expect(reminderTime(paris('2026-11-10 10:00'), 'eve')).toEqual(
      paris('2026-11-09 18:00'),
    )
  })

  it('2h et 1h restent un decalage fixe, hors Paris', () => {
    const startDate = paris('2026-11-10 10:00')
    expect(reminderTime(startDate, '2h')).toEqual(
      dayjs(startDate).subtract(2, 'hour').toDate(),
    )
    expect(reminderTime(startDate, '1h')).toEqual(
      dayjs(startDate).subtract(1, 'hour').toDate(),
    )
  })
})
