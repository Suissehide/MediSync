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

// Rendez-vous déjà présents dans un créneau, indexés par identifiant de créneau.
type SlotAppointments = Record<string, CreatedAppointment[]>

const buildSlot = (
  id: string,
  startDate: Date,
  endDate: Date,
  isIndividual: boolean,
  slotAppointments: SlotAppointments,
) => ({
  id,
  startDate,
  endDate,
  slotTemplate: { id: `tpl-${id}`, isIndividual, capacity: 10, soignants: [] },
  appointments: (slotAppointments[id] ?? []).map((a) => ({
    id: a.id,
    startDate: a.startDate,
    endDate: a.endDate,
    appointmentPatients: a.patientIDs.map((patientID) => ({ patientID })),
  })),
})

const buildPathway = (
  id: string,
  startDate: Date,
  slots: ReturnType<typeof buildSlot>[],
) => ({ id, startDate, slots }) as unknown as PathwayWithSlotsRepo

const buildDomain = (
  initialAppointments: CreatedAppointment[] = [],
  slotAppointments: SlotAppointments = {},
) => {
  const created: CreatedAppointment[] = [...initialAppointments]
  let nextId = created.length + 1

  // Parcours multiple : un seul créneau le lundi 10h-11h.
  const groupPathway = buildPathway('pw-group', monday(10), [
    buildSlot(
      'slot-group-mon',
      monday(10),
      monday(11),
      false,
      slotAppointments,
    ),
  ])

  // Parcours individuel "premier créneau dispo" : lundi 10h-12h puis mardi 14h-16h.
  const individualPathway = buildPathway('pw-indiv', monday(10), [
    buildSlot('slot-indiv-mon', monday(10), monday(12), true, slotAppointments),
    buildSlot(
      'slot-indiv-tue',
      tuesday(14),
      tuesday(16),
      true,
      slotAppointments,
    ),
  ])

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
        // Le tag secondaire 'INDIV' du parcours multiple ne doit jamais servir
        // à résoudre une inscription : seul le tag principal compte.
        {
          id: 'tpl-group',
          mainTag: 'GROUPE',
          secondaryTags: ['INDIV'],
          firstAppointmentOnly: false,
          motifRequired: false,
        },
        {
          id: 'tpl-indiv',
          mainTag: 'INDIV',
          secondaryTags: [],
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

describe('PatientDomain – résolution du parcours par tag principal', () => {
  it("résout le parcours par son tag principal, pas par un tag secondaire d'un autre parcours", async () => {
    const { domain, created } = buildDomain()

    const result = await domain.enrollExistingPatientInPathways(
      {
        patientID: 'patient-1',
        startDate: monday(0),
        pathways: [{ tag: 'INDIV', timeOfDay: 'ALL_DAY', duration: 30 }],
      },
      'user-1',
    )

    expect(result.failedEnrollments).toEqual([])
    expect(created).toHaveLength(1)
    // Le parcours individuel est "premier créneau dispo" : la résolution par
    // tag principal doit donc passer par la recherche de créneaux futurs.
    expect((created[0] as CreatedAppointment).slotID).toBe('slot-indiv-mon')
  })
})

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
    // Sous-fenêtre libre du créneau du lundi, juste après le parcours multiple.
    expect(indivApt.slotID).toBe('slot-indiv-mon')
    expect(indivApt.startDate).toEqual(monday(11))
    expect(indivApt.endDate).toEqual(monday(11, 30))
  })

  it('prend la première sous-fenêtre libre après un rendez-vous existant du patient', async () => {
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
    expect(indivApt.slotID).toBe('slot-indiv-mon')
    expect(indivApt.startDate).toEqual(monday(11))
    expect(indivApt.endDate).toEqual(monday(11, 30))
  })

  it('combine les rendez-vous du créneau et ceux du patient pour trouver la sous-fenêtre', async () => {
    const otherPatientApt = {
      id: 'apt-other',
      startDate: monday(11),
      endDate: monday(11, 30),
      slotID: 'slot-indiv-mon',
      patientIDs: ['patient-2'],
    }
    const { domain, created } = buildDomain(
      [
        {
          id: 'apt-existing',
          startDate: monday(10),
          endDate: monday(11),
          slotID: 'slot-group-mon',
          patientIDs: ['patient-1'],
        },
      ],
      { 'slot-indiv-mon': [otherPatientApt] },
    )

    const result = await domain.enrollExistingPatientInPathways(
      {
        patientID: 'patient-1',
        startDate: monday(0),
        pathways: [{ tag: 'INDIV', timeOfDay: 'ALL_DAY', duration: 30 }],
      },
      'user-1',
    )

    expect(result.failedEnrollments).toEqual([])
    const indivApt = created.at(-1) as CreatedAppointment
    expect(indivApt.slotID).toBe('slot-indiv-mon')
    expect(indivApt.startDate).toEqual(monday(11, 30))
    expect(indivApt.endDate).toEqual(monday(12))
  })

  it('passe au créneau suivant si aucune sous-fenêtre ne tient', async () => {
    const { domain, created } = buildDomain([
      {
        id: 'apt-existing',
        startDate: monday(10),
        endDate: monday(11, 45),
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
    const indivApt = created.at(-1) as CreatedAppointment
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
