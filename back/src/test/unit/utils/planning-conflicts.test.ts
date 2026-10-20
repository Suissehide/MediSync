import {
  type ConflictSlot,
  detectConflicts,
} from '../../../main/utils/planning-conflicts'

const at = (hour: string) => new Date(`2026-04-01T${hour}:00.000Z`)

const slot = (
  id: string,
  start: string,
  end: string,
  overrides: Partial<ConflictSlot> = {},
): ConflictSlot => ({
  id,
  startDate: at(start),
  endDate: at(end),
  archivedAt: null,
  slotTemplate: { locationID: null, capacity: null },
  appointments: [],
  ...overrides,
})

const appointment = (
  id: string,
  start: string,
  end: string,
  patientIds: string[],
) => ({
  id,
  startDate: at(start),
  endDate: at(end),
  appointmentPatients: patientIds.map((patientId) => ({ patientId })),
})

// Une salle n'est disputée que si les deux créneaux accueillent quelqu'un.
const occupe = (
  id: string,
  start: string,
  end: string,
  locationID: string | null,
) =>
  slot(id, start, end, {
    slotTemplate: { locationID, capacity: null },
    appointments: [appointment(`r-${id}`, start, end, [`p-${id}`])],
  })

describe('detectConflicts', () => {
  describe('salle', () => {
    it('signale deux creneaux qui se chevauchent dans la meme salle', () => {
      expect(
        detectConflicts([
          occupe('a', '09:00', '10:00', 'loc-1'),
          occupe('b', '09:30', '10:30', 'loc-1'),
        ]),
      ).toEqual([{ type: 'salle', slotIDs: ['a', 'b'], locationID: 'loc-1' }])
    })

    it('ne signale pas deux creneaux bout a bout', () => {
      expect(
        detectConflicts([
          occupe('a', '09:00', '10:00', 'loc-1'),
          occupe('b', '10:00', '11:00', 'loc-1'),
        ]),
      ).toEqual([])
    })

    it('ne signale pas deux salles differentes ni deux creneaux sans salle', () => {
      expect(
        detectConflicts([
          occupe('a', '09:00', '10:00', 'loc-1'),
          occupe('b', '09:00', '10:00', 'loc-2'),
          occupe('c', '09:00', '10:00', null),
          occupe('d', '09:00', '10:00', null),
        ]),
      ).toEqual([])
    })

    it('ignore un creneau archive', () => {
      expect(
        detectConflicts([
          occupe('a', '09:00', '10:00', 'loc-1'),
          {
            ...occupe('b', '09:00', '10:00', 'loc-1'),
            archivedAt: at('08:00'),
          },
        ]),
      ).toEqual([])
    })

    it('ignore un creneau sans patient, comme une plage de parcours vide', () => {
      expect(
        detectConflicts([
          slot('plage', '09:00', '11:30', {
            slotTemplate: { locationID: 'loc-1', capacity: null },
            appointments: [appointment('vide', '09:00', '09:30', [])],
          }),
          occupe('a', '09:00', '09:45', 'loc-1'),
        ]),
      ).toEqual([])
    })
  })

  describe('patient', () => {
    it('signale un patient sur deux rendez-vous de creneaux differents qui se chevauchent', () => {
      expect(
        detectConflicts([
          slot('a', '09:00', '10:00', {
            appointments: [appointment('r1', '09:00', '10:00', ['p1'])],
          }),
          slot('b', '09:30', '11:00', {
            appointments: [appointment('r2', '09:30', '10:00', ['p1', 'p2'])],
          }),
        ]),
      ).toEqual([
        {
          type: 'patient',
          slotIDs: ['a', 'b'],
          appointmentIDs: ['r1', 'r2'],
          patientID: 'p1',
        },
      ])
    })

    it('signale deux rendez-vous du meme creneau qui se chevauchent avec un seul slotID', () => {
      expect(
        detectConflicts([
          slot('a', '09:00', '11:00', {
            appointments: [
              appointment('r1', '09:00', '10:00', ['p1']),
              appointment('r2', '09:30', '10:30', ['p1']),
            ],
          }),
        ]),
      ).toEqual([
        {
          type: 'patient',
          slotIDs: ['a'],
          appointmentIDs: ['r1', 'r2'],
          patientID: 'p1',
        },
      ])
    })

    it('ne signale pas des rendez-vous bout a bout ni des patients differents', () => {
      expect(
        detectConflicts([
          slot('a', '09:00', '11:00', {
            appointments: [
              appointment('r1', '09:00', '09:30', ['p1']),
              appointment('r2', '09:30', '10:00', ['p1']),
              appointment('r3', '09:00', '10:00', ['p2']),
            ],
          }),
        ]),
      ).toEqual([])
    })
  })

  describe('capacite', () => {
    it('signale un rendez-vous qui depasse la capacite', () => {
      expect(
        detectConflicts([
          slot('a', '09:00', '10:00', {
            slotTemplate: { locationID: null, capacity: 2 },
            appointments: [
              appointment('r1', '09:00', '10:00', ['p1', 'p2', 'p3']),
            ],
          }),
        ]),
      ).toEqual([
        {
          type: 'capacite',
          slotIDs: ['a'],
          appointmentID: 'r1',
          capacity: 2,
          count: 3,
        },
      ])
    })

    it('ne signale rien a capacite atteinte ni quand la capacite est vide', () => {
      expect(
        detectConflicts([
          slot('a', '09:00', '10:00', {
            slotTemplate: { locationID: null, capacity: 2 },
            appointments: [appointment('r1', '09:00', '10:00', ['p1', 'p2'])],
          }),
          slot('b', '11:00', '12:00', {
            appointments: [
              appointment('r2', '11:00', '12:00', ['p3', 'p4', 'p5']),
            ],
          }),
        ]),
      ).toEqual([])
    })
  })
})
