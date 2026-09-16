import { PatientDomain } from '../../../main/domain/patient.domain'
import type { IocContainer } from '../../../main/types/application/ioc'
import type { PathwayWithSlotsRepo } from '../../../main/types/infra/orm/repositories/pathway.repository.interface'

type CreatedAppointment = {
  id: string
  startDate: Date
  endDate: Date
  slotID: string
  patientIDs: string[]
}

// Lundi 21 septembre 2026 (heure locale, comme isSlotAvailable qui lit .hour()).
const monday = (hour: number, minute = 0) =>
  new Date(2026, 8, 21, hour, minute, 0, 0)
const tuesday = (hour: number, minute = 0) =>
  new Date(2026, 8, 22, hour, minute, 0, 0)

const overlaps = (
  a: { startDate: Date; endDate: Date },
  b: { startDate: Date; endDate: Date },
) => a.startDate < b.endDate && a.endDate > b.startDate

const buildSlot = (
  id: string,
  startDate: Date,
  endDate: Date,
  isIndividual: boolean,
) => ({
  id,
  startDate,
  endDate,
  slotTemplate: { id: `tpl-${id}`, isIndividual, capacity: 10, soignants: [] },
  appointments: [],
})

const buildPathway = (
  id: string,
  startDate: Date,
  slots: ReturnType<typeof buildSlot>[],
) => ({ id, startDate, slots }) as unknown as PathwayWithSlotsRepo

// Parcours multiple : un seul créneau le lundi 10h-11h.
const groupPathway = buildPathway('pw-group', monday(10), [
  buildSlot('slot-group-mon', monday(10), monday(11), false),
])

// Parcours individuel "premier créneau dispo" : lundi 10h-12h puis mardi 14h-16h.
const individualPathway = buildPathway('pw-indiv', monday(10), [
  buildSlot('slot-indiv-mon', monday(10), monday(12), true),
  buildSlot('slot-indiv-tue', tuesday(14), tuesday(16), true),
])

const buildDomain = (initialAppointments: CreatedAppointment[] = []) => {
  const created: CreatedAppointment[] = [...initialAppointments]
  let nextId = created.length + 1

  const patient = { id: 'patient-1', firstName: 'Ada', lastName: 'Lovelace' }

  const patientWithAppointments = () => ({
    ...patient,
    enrollmentIssues: [],
    appointmentPatients: created
      .filter((a) => a.patientIDs.includes(patient.id))
      .map((a) => ({
        appointmentID: a.id,
        patientID: patient.id,
        appointment: { id: a.id, startDate: a.startDate, endDate: a.endDate },
      })),
  })

  const container = {
    logger: {
      error: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    },
    appEventBus: { emit: jest.fn() },
    patientRepository: {
      create: jest.fn(async () => patient),
      findByID: jest.fn(async () => patientWithAppointments()),
    },
    pathwayRepository: {
      findByTemplateTagAndDate: jest.fn(async (tag: string) =>
        tag === 'GROUPE' ? [groupPathway] : [],
      ),
      findByTemplateTagWithFutureSlots: jest.fn(async (tag: string) =>
        tag === 'INDIV' ? [individualPathway] : [],
      ),
    },
    pathwayTemplateRepository: {
      findAll: jest.fn(async () => [
        {
          id: 'tpl-group',
          tags: ['GROUPE'],
          firstAppointmentOnly: false,
          motifRequired: false,
        },
        {
          id: 'tpl-indiv',
          tags: ['INDIV'],
          firstAppointmentOnly: true,
          motifRequired: false,
        },
      ]),
    },
    appointmentRepository: {
      create: jest.fn(
        (params: {
          startDate: Date
          endDate: Date
          slotID: string
          patientIDs: string[]
        }) => {
          const appointment = {
            id: `apt-${nextId++}`,
            startDate: params.startDate,
            endDate: params.endDate,
            slotID: params.slotID,
            patientIDs: [...params.patientIDs],
          }
          created.push(appointment)
          return Promise.resolve(appointment)
        },
      ),
      addPatientToAppointment: jest.fn(
        (params: { appointmentID: string; patientID: string }) => {
          created
            .find((a) => a.id === params.appointmentID)
            ?.patientIDs.push(params.patientID)
          return Promise.resolve(params)
        },
      ),
    },
    enrollmentIssueRepository: { create: jest.fn(async () => undefined) },
    thematicRepository: { findByID: jest.fn() },
  }

  const domain = new PatientDomain(container as unknown as IocContainer)
  return { domain, created }
}

describe('PatientDomain – parcours individuel "premier créneau dispo"', () => {
  it('ne chevauche pas le parcours multiple inscrit dans la même requête', async () => {
    const { domain, created } = buildDomain()

    const result = await domain.enrollPatientInPathways(
      {
        patientData: { firstName: 'Ada', lastName: 'Lovelace' } as never,
        startDate: monday(0),
        pathways: [
          { tag: 'GROUPE', timeOfDay: 'ALL_DAY', duration: 30 },
          { tag: 'INDIV', timeOfDay: 'ALL_DAY', duration: 30 },
        ],
      },
      'user-1',
    )

    expect(result.failedEnrollments).toEqual([])
    expect(created).toHaveLength(2)
    const [groupApt, indivApt] = created as [
      CreatedAppointment,
      CreatedAppointment,
    ]
    expect(groupApt.slotID).toBe('slot-group-mon')
    expect(overlaps(groupApt, indivApt)).toBe(false)
    expect(indivApt.slotID).toBe('slot-indiv-tue')
  })

  it('ne chevauche pas un rendez-vous existant du patient', async () => {
    const { domain, created } = buildDomain([
      {
        id: 'apt-existing',
        startDate: monday(10),
        endDate: monday(11),
        slotID: 'slot-group-mon',
        patientIDs: ['patient-1'],
      },
    ])

    const result = await domain.enrollExistingPatientInPathways(
      {
        patientID: 'patient-1',
        startDate: monday(0),
        pathways: [{ tag: 'INDIV', timeOfDay: 'ALL_DAY', duration: 30 }],
      },
      'user-1',
    )

    expect(result.failedEnrollments).toEqual([])
    expect(created).toHaveLength(2)
    const [existingApt, indivApt] = created as [
      CreatedAppointment,
      CreatedAppointment,
    ]
    expect(overlaps(existingApt, indivApt)).toBe(false)
    expect(indivApt.slotID).toBe('slot-indiv-tue')
  })

  it('respecte le moment de la journée demandé (après-midi)', async () => {
    const { domain, created } = buildDomain()

    const result = await domain.enrollExistingPatientInPathways(
      {
        patientID: 'patient-1',
        startDate: monday(0),
        pathways: [{ tag: 'INDIV', timeOfDay: 'AFTERNOON', duration: 30 }],
      },
      'user-1',
    )

    expect(result.failedEnrollments).toEqual([])
    expect(created).toHaveLength(1)
    expect((created[0] as CreatedAppointment).slotID).toBe('slot-indiv-tue')
  })
})
