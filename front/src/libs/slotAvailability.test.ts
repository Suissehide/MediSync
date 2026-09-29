import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import { describe, expect, it } from 'vitest'

import type { Slot } from '../types/slot.ts'
import { getPathwayStartDates } from './slotAvailability.ts'

// `main.tsx` l'installe dans l'application ; un test de lib ne le charge pas.
dayjs.extend(utc)

const slot = ({
  pathwayID,
  start,
  end,
  isIndividual = false,
  appointment,
}: {
  pathwayID: string
  start: string
  end: string
  isIndividual?: boolean
  appointment?: { start: string; end: string; patientID: string }
}) =>
  ({
    id: `slot-${start}`,
    startDate: start,
    endDate: end,
    locked: false,
    pathway: { id: pathwayID, startDate: '2026-09-21T00:00:00.000Z' },
    slotTemplate: { isIndividual },
    appointments: appointment
      ? [
          {
            id: `apt-${appointment.start}`,
            startDate: appointment.start,
            endDate: appointment.end,
            appointmentPatients: [{ patient: { id: appointment.patientID } }],
          },
        ]
      : [],
  }) as unknown as Slot

describe('getPathwayStartDates', () => {
  it('retient le premier rendez-vous du patient, pas le début de la session', () => {
    const slots = [
      // Parcours individuel commencé le 21/09 : le patient n'y entre que le 06/10.
      slot({
        pathwayID: 'individuel',
        start: '2026-09-22T09:00:00.000Z',
        end: '2026-09-22T12:00:00.000Z',
        isIndividual: true,
      }),
      slot({
        pathwayID: 'individuel',
        start: '2026-10-13T09:00:00.000Z',
        end: '2026-10-13T12:00:00.000Z',
        isIndividual: true,
        appointment: {
          start: '2026-10-13T10:00:00.000Z',
          end: '2026-10-13T10:30:00.000Z',
          patientID: 'p1',
        },
      }),
      slot({
        pathwayID: 'individuel',
        start: '2026-10-06T09:00:00.000Z',
        end: '2026-10-06T12:00:00.000Z',
        isIndividual: true,
        appointment: {
          start: '2026-10-06T09:15:00.000Z',
          end: '2026-10-06T09:45:00.000Z',
          patientID: 'p1',
        },
      }),
    ]

    // Horaire du rendez-vous du patient, pas celui du créneau entier.
    expect(getPathwayStartDates(slots, 'p1')).toEqual(
      new Map([['individuel', '2026-10-06T09:15:00.000Z']]),
    )
  })

  it("ignore les créneaux d'un autre patient et ceux hors parcours", () => {
    const slots = [
      slot({
        pathwayID: 'groupe',
        start: '2026-10-05T13:45:00.000Z',
        end: '2026-10-05T15:00:00.000Z',
        appointment: {
          start: '2026-10-05T13:45:00.000Z',
          end: '2026-10-05T15:00:00.000Z',
          patientID: 'autre',
        },
      }),
    ]

    expect(getPathwayStartDates(slots, 'p1').size).toBe(0)
    expect(getPathwayStartDates(undefined, 'p1').size).toBe(0)
  })
})
