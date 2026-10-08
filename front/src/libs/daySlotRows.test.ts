import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import { describe, expect, it } from 'vitest'

import type { Slot } from '../types/slot.ts'
import { buildDaySlotRows } from './utils.ts'

dayjs.extend(utc)

const slot = (id: string, startDate: string, extra: Partial<Slot> = {}) =>
  ({
    id,
    startDate,
    endDate: startDate,
    locked: false,
    appointments: [],
    slotTemplate: { soignants: [] },
    ...extra,
  }) as unknown as Slot

const appointment = (id: string, patientID: string) => ({
  id,
  appointmentPatients: [{ id: `ap-${id}`, patient: { id: patientID } }],
})

describe('buildDaySlotRows', () => {
  it('une ligne par créneau du jour, avec les patients de tous ses rendez-vous', () => {
    const rows = buildDaySlotRows(
      [
        slot('vide', '2026-03-02T14:00:00.000Z'),
        slot('deux', '2026-03-02T09:00:00.000Z', {
          appointments: [appointment('a1', 'p1'), appointment('a2', 'p2')],
        } as Partial<Slot>),
        slot('un', '2026-03-02T11:00:00.000Z', {
          appointments: [appointment('a3', 'p3')],
        } as Partial<Slot>),
        slot('archive-vide', '2026-03-02T10:00:00.000Z', {
          archivedAt: '2026-03-01',
        }),
        slot('autre-jour', '2026-03-03T09:00:00.000Z'),
      ],
      dayjs.utc('2026-03-02'),
    )

    expect(rows.map((r) => r.id)).toEqual(['deux', 'un', 'vide'])
    expect(rows.map((r) => r.appointmentId)).toEqual([null, 'a3', null])
    expect(rows[0].patients.map((p) => p.appointmentId)).toEqual(['a1', 'a2'])
    expect(rows.map((r) => r.canBook)).toEqual([false, false, true])
  })
})

describe('buildDaySlotRows, créneau individuel', () => {
  it('à partir de deux rendez-vous, un sous-tableau avec les intervalles libres', () => {
    const at = (h: string) => `2026-03-02T${h}:00.000Z`
    const [row] = buildDaySlotRows(
      [
        slot('ind', at('10:00'), {
          endDate: at('12:00'),
          slotTemplate: { soignants: [], isIndividual: true },
          appointments: [
            {
              ...appointment('a2', 'p2'),
              startDate: at('11:00'),
              endDate: at('11:30'),
            },
            {
              ...appointment('a1', 'p1'),
              startDate: at('10:00'),
              endDate: at('10:30'),
            },
          ],
        } as unknown as Partial<Slot>),
      ],
      dayjs.utc('2026-03-02'),
    )

    expect(row.canBook).toBe(false)
    expect(
      row.subRows?.map((r) => [
        r.kind,
        dayjs.utc(r.startDate).format('HH:mm'),
        r.canBook,
      ]),
    ).toEqual([
      ['appointment', '10:00', false],
      ['free', '10:30', true],
      ['appointment', '11:00', false],
      ['free', '11:30', true],
    ])
  })
})
