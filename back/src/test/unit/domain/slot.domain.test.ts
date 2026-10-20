import { SlotDomain } from '../../../main/domain/slot.domain'
import type { IocContainer } from '../../../main/types/application/ioc'
import type { SlotDateRangeRepo } from '../../../main/types/infra/orm/repositories/slot.repository.interface'

const at = (iso: string) => new Date(`2026-04-01T${iso}:00.000Z`)

// Repository factice : seul compte la fenêtre demandée à findAll.
const buildDomain = () => {
  const ranges: SlotDateRangeRepo[] = []
  const slot = {
    id: 'deplace',
    startDate: at('14:00'),
    endDate: at('15:00'),
    archivedAt: null,
    slotTemplate: { locationID: null, capacity: null },
    // Le créneau a été déplacé l'après-midi, son rendez-vous est resté le matin.
    appointments: [
      {
        id: 'r1',
        startDate: at('09:00'),
        endDate: at('09:30'),
        appointmentPatients: [{ patientId: 'p1' }],
      },
    ],
  }
  const slotRepository = {
    findByID: () => Promise.resolve(slot),
    findAll: (range: SlotDateRangeRepo) => {
      ranges.push(range)
      return Promise.resolve([slot])
    },
  }
  const domain = new SlotDomain({ slotRepository } as unknown as IocContainer)
  return { domain, ranges }
}

describe('SlotDomain.conflictsOf', () => {
  it('cherche aussi sur les horaires des rendez-vous qui debordent du creneau', async () => {
    const { domain, ranges } = buildDomain()

    await domain.conflictsOf('deplace')

    expect(ranges).toEqual([{ from: at('09:00'), to: at('15:00') }])
  })
})
