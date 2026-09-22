import Boom from '@hapi/boom'
import dayjs from 'dayjs'

import type { Slot, SlotTemplate, Soignant } from '../../../../generated/client'

import {
  flattenSlot,
  soignantLinksInclude,
} from '../includes/slot-template.include'
import type { IocContainer } from '../../../types/application/ioc'
import type {
  PathwayCreateEntityRepo,
  PathwayEntityRepo,
  PathwayRepositoryInterface,
  PathwayUpdateEntityRepo,
  PathwayWithSlotsRepo,
  PathwayWithTemplateAndSlotsRepo,
  RegeneratePathwaysResultRepo,
  TrackingPathwayRepo,
} from '../../../types/infra/orm/repositories/pathway.repository.interface'
import type { AppointmentWithPatientsRepo } from '../../../types/infra/orm/repositories/appointment.repository.interface'
import type { ErrorHandlerInterface } from '../../../types/utils/error-handler'
import type { TenantContextInterface } from '../../../types/utils/tenant-context'
import type { PostgresPrismaClient } from '../postgres-client'
import { combineDateAndTime } from '../../../utils/date'
import {
  buildWeekMapping,
  computeEffectiveOffset,
} from '../../../utils/pathway-schedule'

// Include partagé : un parcours embarque ses créneaux, chacun avec son
// modèle de créneau (liens soignants aplatis par flattenSlot) et ses
// rendez-vous. `slotTemplate` est atteint par la clé composite
// (slotTemplateID, serviceId) : sûre par construction, la colonne de tenant
// est déjà dans la clé étrangère. `appointments` (clé composite (slotID,
// serviceId)), `appointmentPatients` (clé composite (appointmentId,
// serviceId)) et `patient` (clé composite (patientId, establishmentId))
// sont sûres pour la même raison.
//
// `slots` elle-même est la relation inverse Pathway → Slot, portée par le
// FK scalaire `pathwayID` (pas de clé composite avec serviceId) : voir la
// note dans pathwayTemplate.repository.ts sur `slotTemplates`, le même
// raisonnement s'applique ici à l'identique (sûre tant que `pathwayID`
// n'est jamais écrit inter-service sans vérification — garanti par le
// `connect` composite de `create` ci-dessous et par la construction interne
// de `regenerate`/`delete`, mais dépend de la tâche 14 pour la voie
// SlotRepository.create/update qui accepte `pathwayID` en scalaire brut).
const slotsWithTemplateInclude = {
  slots: {
    include: {
      slotTemplate: { include: soignantLinksInclude },
      appointments: {
        include: { appointmentPatients: { include: { patient: true } } },
      },
    },
  },
} as const
// Ligne de créneau telle que la ramène `slotsWithTemplateInclude`. La
// nommer ici plutôt que de la déduire de la contrainte de `flattenSlot`
// (qui, elle, ignore `appointments`) préserve les rendez-vous dans le
// résultat aplati.
type SlotRowWithAppointments = Slot & {
  slotTemplate: SlotTemplate & { soignantLinks: { soignant: Soignant }[] }
  appointments: AppointmentWithPatientsRepo[]
}
const flattenSlots = <T extends { slots: SlotRowWithAppointments[] }>({
  slots,
  ...rest
}: T) => ({
  ...rest,
  slots: slots.map((slot) => flattenSlot(slot)),
})

class PathwayRepository implements PathwayRepositoryInterface {
  private readonly prisma: PostgresPrismaClient
  private readonly errorHandler: ErrorHandlerInterface
  private readonly tenantContext: TenantContextInterface

  constructor({ postgresOrm, errorHandler, tenantContext }: IocContainer) {
    this.prisma = postgresOrm.prisma
    this.errorHandler = errorHandler
    this.tenantContext = tenantContext
  }

  private get scope() {
    return this.tenantContext.scope()
  }

  findAll(): Promise<PathwayWithTemplateAndSlotsRepo[]> {
    return this.prisma.pathway.findMany({
      where: this.scope,
      include: {
        // `template` : scalaire `templateID`, relation à un seul
        // enregistrement — même sûreté que `template`/`location`/`thematic`
        // dans slot-template.include.ts. `slots` : voir la note en tête de
        // fichier.
        template: true,
        slots: true,
      },
    })
  }

  async findByID(pathwayID: string): Promise<PathwayEntityRepo> {
    try {
      return await this.prisma.pathway.findUniqueOrThrow({
        where: {
          id_serviceId: { id: pathwayID, serviceId: this.scope.serviceId },
        },
      })
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({
        entityName: 'Pathway',
        error: err,
      })
    }
  }

  async findByTemplateIDAndDate(
    pathwayTemplateID: string,
    startDate: Date,
  ): Promise<PathwayWithSlotsRepo[]> {
    const startOfDay = new Date(startDate)
    startOfDay.setHours(0, 0, 0, 0)
    try {
      const rows = await this.prisma.pathway.findMany({
        where: {
          ...this.scope,
          startDate: { gte: startOfDay },
          template: {
            id: pathwayTemplateID,
          },
        },
        orderBy: {
          startDate: 'asc',
        },
        include: slotsWithTemplateInclude,
      })
      return rows.map(flattenSlots)
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({
        entityName: 'Pathway',
        error: err,
      })
    }
  }

  async regenerate(
    pathwayTemplateID: string,
    fromDate: Date,
  ): Promise<RegeneratePathwaysResultRepo> {
    const template = await this.prisma.pathwayTemplate.findUnique({
      where: {
        id_serviceId: {
          id: pathwayTemplateID,
          serviceId: this.scope.serviceId,
        },
      },
      include: { slotTemplates: { include: soignantLinksInclude } },
    })
    if (!template) {
      throw Boom.notFound('PathwayTemplate not found')
    }

    const startOfDay = new Date(fromDate)
    startOfDay.setHours(0, 0, 0, 0)

    const maxOffsetDays =
      template.slotTemplates.length > 0
        ? Math.max(...template.slotTemplates.map((st) => st.offsetDays ?? 0))
        : 0

    try {
      return await this.prisma.$transaction(async (tx) => {
        const forbiddenWeeks = await tx.forbiddenWeek.findMany({
          where: this.scope,
        })

        const pathways = await tx.pathway.findMany({
          where: {
            ...this.scope,
            templateID: pathwayTemplateID,
            startDate: { gte: startOfDay },
          },
          include: {
            slots: {
              include: { appointments: { select: { id: true } } },
            },
          },
        })

        let slotsDeleted = 0
        let slotsKept = 0
        let slotsCreated = 0

        for (const pathway of pathways) {
          const occupiedSlots = pathway.slots.filter(
            (slot) => slot.appointments.length > 0,
          )
          const emptySlots = pathway.slots.filter(
            (slot) => slot.appointments.length === 0,
          )

          // Remove empty slots and their cloned slot templates.
          if (emptySlots.length > 0) {
            const emptySlotIDs = emptySlots.map((slot) => slot.id)
            const emptyTemplateIDs = emptySlots.map(
              (slot) => slot.slotTemplateID,
            )
            await tx.slot.deleteMany({
              where: {
                id: { in: emptySlotIDs },
                serviceId: this.scope.serviceId,
              },
            })
            // Guard: only cloned slot templates (templateID null) are ever
            // deleted — never a master template shared by a PathwayTemplate.
            await tx.slotTemplate.deleteMany({
              where: {
                id: { in: emptyTemplateIDs },
                templateID: null,
                serviceId: this.scope.serviceId,
              },
            })
            slotsDeleted += emptySlots.length
          }

          slotsKept += occupiedSlots.length

          const weekMapping = buildWeekMapping(
            pathway.startDate,
            maxOffsetDays,
            forbiddenWeeks,
          )

          for (const slotTemplate of template.slotTemplates) {
            const effectiveOffset = computeEffectiveOffset(
              slotTemplate.offsetDays ?? 0,
              weekMapping,
            )
            const base = dayjs(pathway.startDate)
              .add(effectiveOffset, 'day')
              .toISOString()
            const start = combineDateAndTime(base, slotTemplate.startTime)
            const end = combineDateAndTime(base, slotTemplate.endTime)

            // Skip regenerating a step already covered by a kept slot.
            const alreadyCovered = occupiedSlots.some(
              (slot) => slot.startDate.getTime() === start.getTime(),
            )
            if (alreadyCovered) {
              continue
            }

            const clonedSlotTemplate = await tx.slotTemplate.create({
              data: {
                ...this.scope,
                startTime: slotTemplate.startTime,
                endTime: slotTemplate.endTime,
                offsetDays: effectiveOffset,
                isIndividual: slotTemplate.isIndividual,
                capacity: slotTemplate.capacity,
                thematicId: slotTemplate.thematicId,
                locationID: slotTemplate.locationID,
                description: slotTemplate.description,
                color: slotTemplate.color,
                soignantLinks: {
                  create: slotTemplate.soignantLinks.map((l) => ({
                    soignantId: l.soignantId,
                    ...this.scope,
                  })),
                },
              },
            })

            await tx.slot.create({
              data: {
                ...this.scope,
                startDate: start,
                endDate: end,
                slotTemplateID: clonedSlotTemplate.id,
                pathwayID: pathway.id,
              },
            })
            slotsCreated += 1
          }
        }

        return {
          pathwaysUpdated: pathways.length,
          slotsDeleted,
          slotsKept,
          slotsCreated,
        }
      })
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({
        entityName: 'Pathway',
        error: err,
      })
    }
  }

  async findByTemplateTagAndDate(
    tag: string,
    startDate: Date,
  ): Promise<PathwayWithSlotsRepo[]> {
    const startOfDay = new Date(startDate)
    startOfDay.setHours(0, 0, 0, 0)
    try {
      const rows = await this.prisma.pathway.findMany({
        where: {
          ...this.scope,
          startDate: { gte: startOfDay },
          template: {
            mainTag: tag,
          },
        },
        orderBy: {
          startDate: 'asc',
        },
        include: slotsWithTemplateInclude,
      })
      return rows.map(flattenSlots)
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({
        entityName: 'Pathway',
        error: err,
      })
    }
  }

  async findByTemplateTagWithFutureSlots(
    tag: string,
    date: Date,
  ): Promise<PathwayWithSlotsRepo[]> {
    const startOfDay = new Date(date)
    startOfDay.setHours(0, 0, 0, 0)
    try {
      const rows = await this.prisma.pathway.findMany({
        where: {
          ...this.scope,
          template: {
            mainTag: tag,
          },
          slots: {
            some: {
              startDate: { gte: startOfDay },
            },
          },
        },
        orderBy: {
          startDate: 'asc',
        },
        include: slotsWithTemplateInclude,
      })
      return rows.map(flattenSlots)
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({
        entityName: 'Pathway',
        error: err,
      })
    }
  }

  async findTracking(
    year: number,
    month: number,
  ): Promise<TrackingPathwayRepo[]> {
    const startOfMonth = new Date(year, month - 1, 1)
    const endOfMonth = new Date(year, month, 0, 23, 59, 59, 999)

    const pathways = await this.prisma.pathway.findMany({
      where: {
        ...this.scope,
        slots: {
          some: {
            startDate: {
              gte: startOfMonth,
              lte: endOfMonth,
            },
          },
        },
      },
      include: {
        // `template` : même sûreté que dans findAll ci-dessus (scalaire,
        // un seul enregistrement). `slots` : voir la note en tête de
        // fichier — le `where` ci-dessous ne filtre que par date, pas par
        // tenant.
        template: true,
        slots: {
          where: {
            startDate: {
              gte: startOfMonth,
              lte: endOfMonth,
            },
          },
          include: {
            appointments: {
              include: {
                appointmentPatients: {
                  include: {
                    patient: true,
                  },
                },
              },
            },
          },
        },
      },
    })

    const pathwayIds = pathways.map((p) => p.id)
    const endDates = await this.prisma.slot.groupBy({
      by: ['pathwayID'],
      where: { pathwayID: { in: pathwayIds }, serviceId: this.scope.serviceId },
      _max: { endDate: true },
    })
    const endDateMap = new Map(
      endDates.map((e) => [e.pathwayID, e._max.endDate]),
    )

    return pathways.map((pathway) => {
      const patientMap = new Map<
        string,
        TrackingPathwayRepo['patients'][number]
      >()

      const appointmentEntries = pathway.slots.flatMap((slot) =>
        slot.appointments.flatMap((appointment) =>
          appointment.appointmentPatients.map((ap) => ({ appointment, ap })),
        ),
      )

      for (const { appointment, ap } of appointmentEntries) {
        const patientId = ap.patient.id
        let patientEntry = patientMap.get(patientId)
        if (!patientEntry) {
          patientEntry = {
            id: ap.patient.id,
            firstName: ap.patient.firstName,
            lastName: ap.patient.lastName,
            appointments: [],
          }
          patientMap.set(patientId, patientEntry)
        }
        patientEntry.appointments.push({
          date: appointment.startDate,
          status: ap.status,
        })
      }

      return {
        id: pathway.id,
        startDate: pathway.startDate,
        endDate: endDateMap.get(pathway.id) ?? null,
        template: pathway.template
          ? {
              id: pathway.template.id,
              name: pathway.template.name,
              color: pathway.template.color,
              mainTag: pathway.template.mainTag,
              secondaryTags: pathway.template.secondaryTags,
            }
          : null,
        patients: Array.from(patientMap.values()),
      }
    })
  }

  async create(
    pathwayCreateParams: PathwayCreateEntityRepo,
  ): Promise<PathwayEntityRepo> {
    try {
      return await this.prisma.pathway.create({
        data: {
          ...this.scope,
          startDate: pathwayCreateParams.startDate,
          templateID: pathwayCreateParams.templateID ?? null,
          slots: {
            connect: pathwayCreateParams.slotIDs.map((id) => ({
              id_serviceId: { id, serviceId: this.scope.serviceId },
            })),
          },
        },
      })
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({
        entityName: 'Pathway',
        error: err,
      })
    }
  }

  async update(
    pathwayID: string,
    pathwayUpdateParams: PathwayUpdateEntityRepo,
  ): Promise<PathwayEntityRepo> {
    try {
      return await this.prisma.pathway.update({
        where: {
          id_serviceId: { id: pathwayID, serviceId: this.scope.serviceId },
        },
        data: pathwayUpdateParams,
      })
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({
        entityName: 'Pathway',
        error: err,
      })
    }
  }

  async delete(pathwayID: string): Promise<PathwayEntityRepo> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        // Find the pathway with its slots to get slotTemplateIDs
        const pathway = await tx.pathway.findUniqueOrThrow({
          where: {
            id_serviceId: { id: pathwayID, serviceId: this.scope.serviceId },
          },
          include: {
            slots: {
              select: {
                id: true,
                slotTemplateID: true,
              },
            },
          },
        })

        const slotIDs = pathway.slots.map((slot) => slot.id)
        const slotTemplateIDs = pathway.slots.map((slot) => slot.slotTemplateID)

        // Delete all slots
        await tx.slot.deleteMany({
          where: { id: { in: slotIDs }, serviceId: this.scope.serviceId },
        })

        // Delete all slotTemplates — même garde qu'en régénération : seuls
        // les clones (templateID null) sont supprimés, jamais un modèle
        // maître partagé.
        await tx.slotTemplate.deleteMany({
          where: {
            id: { in: slotTemplateIDs },
            templateID: null,
            serviceId: this.scope.serviceId,
          },
        })

        // Delete the pathway
        return await tx.pathway.delete({
          where: {
            id_serviceId: { id: pathwayID, serviceId: this.scope.serviceId },
          },
        })
      })
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({
        entityName: 'Pathway',
        error: err,
      })
    }
  }
}

export { PathwayRepository }
