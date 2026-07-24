import Boom from '@hapi/boom'
import dayjs from 'dayjs'

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
import type { ErrorHandlerInterface } from '../../../types/utils/error-handler'
import type { PostgresPrismaClient } from '../postgres-client'
import { combineDateAndTime } from '../../../utils/date'
import {
  buildWeekMapping,
  computeEffectiveOffset,
} from '../../../utils/pathway-schedule'

class PathwayRepository implements PathwayRepositoryInterface {
  private readonly prisma: PostgresPrismaClient
  private readonly errorHandler: ErrorHandlerInterface

  constructor({ postgresOrm, errorHandler }: IocContainer) {
    this.prisma = postgresOrm.prisma
    this.errorHandler = errorHandler
  }

  findAll(): Promise<PathwayWithTemplateAndSlotsRepo[]> {
    return this.prisma.pathway.findMany({
      include: {
        template: true,
        slots: true,
      },
    })
  }

  async findByID(pathwayID: string): Promise<PathwayEntityRepo> {
    try {
      return await this.prisma.pathway.findUniqueOrThrow({
        where: { id: pathwayID },
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
      return await this.prisma.pathway.findMany({
        where: {
          startDate: { gte: startOfDay },
          template: {
            id: pathwayTemplateID,
          },
        },
        orderBy: {
          startDate: 'asc',
        },
        include: {
          slots: {
            include: {
              slotTemplate: {
                include: {
                  soignants: true,
                },
              },
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
      where: { id: pathwayTemplateID },
      include: { slotTemplates: { include: { soignants: true } } },
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
        const forbiddenWeeks = await tx.forbiddenWeek.findMany()

        const pathways = await tx.pathway.findMany({
          where: {
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
            await tx.slot.deleteMany({ where: { id: { in: emptySlotIDs } } })
            await tx.slotTemplate.deleteMany({
              where: { id: { in: emptyTemplateIDs } },
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
                startTime: slotTemplate.startTime,
                endTime: slotTemplate.endTime,
                offsetDays: effectiveOffset,
                isIndividual: slotTemplate.isIndividual,
                capacity: slotTemplate.capacity,
                thematicId: slotTemplate.thematicId,
                locationID: slotTemplate.locationID,
                description: slotTemplate.description,
                color: slotTemplate.color,
                soignants: {
                  connect: slotTemplate.soignants.map((s) => ({ id: s.id })),
                },
              },
            })

            await tx.slot.create({
              data: {
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
      return await this.prisma.pathway.findMany({
        where: {
          startDate: { gte: startOfDay },
          template: {
            tags: { has: tag },
          },
        },
        orderBy: {
          startDate: 'asc',
        },
        include: {
          slots: {
            include: {
              slotTemplate: {
                include: {
                  soignants: true,
                },
              },
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
      return await this.prisma.pathway.findMany({
        where: {
          template: {
            tags: { has: tag },
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
        include: {
          slots: {
            include: {
              slotTemplate: {
                include: {
                  soignants: true,
                },
              },
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
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({
        entityName: 'Pathway',
        error: err,
      })
    }
  }

  async findTracking(year: number, month: number): Promise<TrackingPathwayRepo[]> {
    const startOfMonth = new Date(year, month - 1, 1)
    const endOfMonth = new Date(year, month, 0, 23, 59, 59, 999)

    const pathways = await this.prisma.pathway.findMany({
      where: {
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
      where: { pathwayID: { in: pathwayIds } },
      _max: { endDate: true },
    })
    const endDateMap = new Map(endDates.map((e) => [e.pathwayID, e._max.endDate]))

    return pathways.map((pathway) => {
      const patientMap = new Map<string, TrackingPathwayRepo['patients'][number]>()

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
              tags: pathway.template.tags,
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
          startDate: pathwayCreateParams.startDate,
          template: {
            connect: { id: pathwayCreateParams.templateID ?? undefined },
          },
          slots: {
            connect: pathwayCreateParams.slotIDs.map((id) => ({ id })),
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
        where: { id: pathwayID },
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
          where: { id: pathwayID },
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
          where: { id: { in: slotIDs } },
        })

        // Delete all slotTemplates
        await tx.slotTemplate.deleteMany({
          where: { id: { in: slotTemplateIDs } },
        })

        // Delete the pathway
        return await tx.pathway.delete({
          where: { id: pathwayID },
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
