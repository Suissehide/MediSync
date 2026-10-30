import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import { describe, expect, it } from 'vitest'

import type { Slot } from '../types/slot.ts'
import {
  ecartEnJours,
  getFreeTranches,
  getPathwayProgress,
  getPathwayStartDates,
  getUpcomingSlotSuggestions,
  groupSlotsByDay,
  jourRelatif,
  splitPatientSlots,
} from './slotAvailability.ts'

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
  appointment?: {
    start: string
    end: string
    patientID: string
    status?: string
  }
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
            appointmentPatients: [
              {
                patient: { id: appointment.patientID },
                status: appointment.status,
              },
            ],
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

// Un rendez-vous du patient, à N jours de maintenant — les trois fonctions ci-dessous se lisent
// par rapport à l'instant courant, que ces tests ne figent pas.
const dansNJours = (jours: number, heure = '09:00') => {
  const jour = dayjs().add(jours, 'day').format('YYYY-MM-DD')
  const start = `${jour}T${heure}:00.000Z`
  const end = `${jour}T${heure.replace(/^(\d\d)/, (h) => `${+h + 1}`)}:00.000Z`
  return { start, end }
}

describe('splitPatientSlots', () => {
  it('sépare les rendez-vous du patient : à venir du plus proche, passés du plus récent', () => {
    const futurProche = dansNJours(3)
    const futurLoin = dansNJours(10)
    const passe = dansNJours(-5)
    const slots = [
      slot({
        pathwayID: 'a',
        ...futurLoin,
        appointment: { ...futurLoin, patientID: 'p1' },
      }),
      slot({
        pathwayID: 'a',
        ...passe,
        appointment: { ...passe, patientID: 'p1' },
      }),
      slot({
        pathwayID: 'a',
        ...futurProche,
        appointment: { ...futurProche, patientID: 'p1' },
      }),
    ]

    const { upcoming, past } = splitPatientSlots(slots, 'p1')

    expect(upcoming.map((s) => s.startDate)).toEqual([
      futurProche.start,
      futurLoin.start,
    ])
    expect(past.map((s) => s.startDate)).toEqual([passe.start])
  })

  it("laisse de côté un créneau où le patient n'a pas de rendez-vous", () => {
    const futur = dansNJours(2)
    const slots = [
      slot({
        pathwayID: 'a',
        ...futur,
        appointment: { ...futur, patientID: 'autre' },
      }),
      slot({ pathwayID: 'a', ...futur }),
    ]

    expect(splitPatientSlots(slots, 'p1')).toEqual({ upcoming: [], past: [] })
    expect(splitPatientSlots(slots, undefined)).toEqual({
      upcoming: [],
      past: [],
    })
  })
})

describe('getPathwayProgress', () => {
  const avec = (pathwayID: string, decalage: number, status?: string) => {
    const { start, end } = dansNJours(decalage)
    return slot({
      pathwayID,
      start,
      end,
      appointment: { start, end, patientID: 'p1', status },
    })
  }

  it('compte les présences notées sur le total des rendez-vous du parcours', () => {
    const progress = getPathwayProgress(
      [avec('ri', -13, 'yes'), avec('ri', -6, 'no'), avec('ri', 1)],
      'p1',
    )

    // « Non venu » et « non renseigné » comptent dans le total, jamais dans les réalisés.
    expect(progress.get('ri')).toEqual({ done: 1, total: 3 })
  })

  it('ne compte pas comme réalisé un rendez-vous À VENIR déjà noté présent', () => {
    // La base en porte (service Cardiologie) : « 1 / 1 réalisés » s'affichait sur un parcours qui
    // commence le mois suivant.
    const progress = getPathwayProgress([avec('psy', 23, 'yes')], 'p1')

    expect(progress.get('psy')).toEqual({ done: 0, total: 1 })
  })

  it("n'invente pas un parcours à zéro : un parcours sans créneau est absent de la carte", () => {
    const progress = getPathwayProgress([avec('ri', -6, 'yes')], 'p1')

    expect(progress.has('psy')).toBe(false)
    expect(getPathwayProgress(undefined, 'p1').size).toBe(0)
  })

  it("ignore la présence d'un AUTRE patient sur le même créneau collectif", () => {
    const passe = dansNJours(-6)
    const collectif = {
      ...slot({ pathwayID: 'ri', ...passe }),
      appointments: [
        {
          id: 'apt',
          startDate: passe.start,
          endDate: passe.end,
          appointmentPatients: [
            { patient: { id: 'autre' }, status: 'yes' },
            { patient: { id: 'p1' }, status: 'no' },
          ],
        },
      ],
    } as unknown as Slot

    expect(getPathwayProgress([collectif], 'p1')).toEqual(
      new Map([['ri', { done: 0, total: 1 }]]),
    )
  })
})

describe('groupSlotsByDay', () => {
  it('regroupe les créneaux consécutifs du même jour, dans l’ordre reçu', () => {
    const slots = [
      slot({
        pathwayID: 'a',
        start: '2026-10-14T08:30:00.000Z',
        end: '2026-10-14T09:45:00.000Z',
      }),
      slot({
        pathwayID: 'a',
        start: '2026-10-14T10:00:00.000Z',
        end: '2026-10-14T11:00:00.000Z',
      }),
      slot({
        pathwayID: 'a',
        start: '2026-10-19T08:30:00.000Z',
        end: '2026-10-19T09:45:00.000Z',
      }),
    ]

    expect(
      groupSlotsByDay(slots).map(({ day, slots }) => [day, slots.length]),
    ).toEqual([
      ['2026-10-14', 2],
      ['2026-10-19', 1],
    ])
  })

  it('groupe un créneau individuel sur le jour du rendez-vous du patient', () => {
    const slots = [
      slot({
        pathwayID: 'a',
        start: '2026-10-14T23:00:00.000Z',
        end: '2026-10-15T02:00:00.000Z',
        isIndividual: true,
        appointment: {
          start: '2026-10-15T00:30:00.000Z',
          end: '2026-10-15T01:00:00.000Z',
          patientID: 'p1',
        },
      }),
    ]

    expect(groupSlotsByDay(slots, 'p1')[0].day).toBe('2026-10-15')
  })
})

describe('ecartEnJours et jourRelatif', () => {
  it('compte des journées entières, pas des tranches de 24 h', () => {
    // 1 h 30 d'écart, mais deux journées différentes : « demain », pas « aujourd'hui ».
    expect(
      ecartEnJours('2026-10-15T00:30:00.000Z', '2026-10-14T23:00:00.000Z'),
    ).toBe(1)
    expect(
      ecartEnJours('2026-10-14T10:00:00.000Z', '2026-10-11T23:00:00.000Z'),
    ).toBe(3)
    expect(
      ecartEnJours('2026-10-05T10:00:00.000Z', '2026-10-11T08:00:00.000Z'),
    ).toBe(-6)
  })

  it('nomme les trois écarts proches et chiffre les autres', () => {
    expect(jourRelatif(0)).toBe("aujourd'hui")
    expect(jourRelatif(1)).toBe('demain')
    expect(jourRelatif(-1)).toBe('hier')
    expect(jourRelatif(3)).toBe('dans 3 jours')
    expect(jourRelatif(-6)).toBe('il y a 6 jours')
  })
})

describe('getUpcomingSlotSuggestions', () => {
  const proposable = (id: string, extra: Partial<Slot> = {}) => {
    const { start, end } = dansNJours(3)
    return {
      id,
      startDate: start,
      endDate: end,
      locked: false,
      slotTemplate: { thematicId: 'them-1', capacity: 5 },
      appointments: [],
      ...extra,
    } as unknown as Slot
  }

  it('ne propose pas un creneau supprime', () => {
    const suggestions = getUpcomingSlotSuggestions(
      [
        proposable('vivant'),
        proposable('supprime', { archivedAt: '2026-03-01' } as Partial<Slot>),
      ],
      'them-1',
      'p1',
    )

    expect(suggestions.map((s) => s.slot.id)).toEqual(['vivant'])
  })
})

describe('getFreeTranches', () => {
  const creneau = (appointments: { start: string; end: string }[]) =>
    ({
      id: 'slot-1',
      startDate: '2026-11-02T09:00:00.000Z',
      endDate: '2026-11-02T12:00:00.000Z',
      appointments: appointments.map((a, i) => ({
        id: `apt-${i}`,
        startDate: a.start,
        endDate: a.end,
      })),
    }) as unknown as Slot

  it('decoupe le creneau en tranches de la duree depuis son debut', () => {
    expect(
      getFreeTranches(creneau([]), 60).map((t) => t.start.slice(11, 16)),
    ).toEqual(['09:00', '10:00', '11:00'])
  })

  it('ecarte les tranches qui chevauchent un rendez-vous, sans en decaler aucune', () => {
    const tranches = getFreeTranches(
      creneau([
        { start: '2026-11-02T09:00:00.000Z', end: '2026-11-02T09:30:00.000Z' },
      ]),
      60,
    )
    expect(tranches.map((t) => t.start.slice(11, 16))).toEqual([
      '10:00',
      '11:00',
    ])
  })
})
