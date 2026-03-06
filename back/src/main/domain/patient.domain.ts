import dayjs from 'dayjs'

import {
  type TimeOfDay,
  timeOfDaySchema,
} from '../interfaces/http/fastify/schemas/patient.schema'
import type { IocContainer } from '../types/application/ioc'
import type { AppointmentPatientWithAppointmentDomain } from '../types/domain/appointmentPatient.domain.interface'
import type {
  EnrollExistingPatientInPathwaysInput,
  EnrollmentAppointment,
  EnrollmentResult,
  EnrollPatientInPathwaysInput,
  PathwayEnrollmentInput,
  PatientCreateEntityDomain,
  PatientDomainInterface,
  PatientEntityDomain,
  PatientUpdateEntityDomain,
  PatientWithAppointmentsDomain,
  PatientWithTagsDomain,
} from '../types/domain/patient.domain.interface'
import type { AppointmentRepositoryInterface } from '../types/infra/orm/repositories/appointment.repository.interface'
import type {
  PathwayRepositoryInterface,
  PathwayWithSlotsRepo,
} from '../types/infra/orm/repositories/pathway.repository.interface'
import type { PathwayTemplateRepositoryInterface } from '../types/infra/orm/repositories/pathwayTemplate.repository.interface'
import type { EnrollmentIssueRepositoryInterface } from '../types/infra/orm/repositories/enrollmentIssue.repository.interface'
import type { PatientRepositoryInterface } from '../types/infra/orm/repositories/patient.repository.interface'
import type { SlotWithTemplateAndAppointmentsRepo } from '../types/infra/orm/repositories/slot.repository.interface'
import type { Logger } from '../types/utils/logger'
import type { AppEventBus } from '../utils/app-event-bus'

class PatientDomain implements PatientDomainInterface {
  private readonly logger: Logger
  private readonly patientRepository: PatientRepositoryInterface
  private readonly pathwayRepository: PathwayRepositoryInterface
  private readonly pathwayTemplateRepository: PathwayTemplateRepositoryInterface
  private readonly appointmentRepository: AppointmentRepositoryInterface
  private readonly enrollmentIssueRepository: EnrollmentIssueRepositoryInterface
  private readonly appEventBus: AppEventBus

  constructor({
    patientRepository,
    pathwayRepository,
    pathwayTemplateRepository,
    appointmentRepository,
    enrollmentIssueRepository,
    appEventBus,
    logger,
  }: IocContainer) {
    this.patientRepository = patientRepository
    this.pathwayRepository = pathwayRepository
    this.pathwayTemplateRepository = pathwayTemplateRepository
    this.appointmentRepository = appointmentRepository
    this.enrollmentIssueRepository = enrollmentIssueRepository
    this.appEventBus = appEventBus
    this.logger = logger
  }

  findAll(): Promise<PatientEntityDomain[]> {
    return this.patientRepository.findAll()
  }

  findAllWithTags(): Promise<PatientWithTagsDomain[]> {
    return this.patientRepository.findAllWithTags()
  }

  findByID(patientID: string): Promise<PatientEntityDomain> {
    return this.patientRepository.findByID(patientID)
  }

  async create(
    patientCreateParams: PatientCreateEntityDomain,
    userID: string,
  ): Promise<PatientEntityDomain> {
    const patientInputParams = {
      ...patientCreateParams,
      createDate: new Date().toISOString(),
    }
    const patient = await this.patientRepository.create(patientInputParams)
    this.appEventBus.emit('patient.created', { userID, patientId: patient.id })
    return patient
  }

  async update(
    patientID: string,
    patientUpdateParams: PatientUpdateEntityDomain,
    userID: string,
  ): Promise<PatientEntityDomain> {
    const patient = await this.patientRepository.update(patientID, patientUpdateParams)
    this.appEventBus.emit('patient.updated', { userID, patientId: patient.id })
    return patient
  }

  async delete(patientID: string, userID: string): Promise<PatientEntityDomain> {
    const patient = await this.patientRepository.findByID(patientID)
    const appointmentIDs = patient.appointmentPatients.map(
      (ap) => ap.appointment.id,
    )

    const deleted = await this.patientRepository.delete(patientID)

    if (appointmentIDs.length > 0) {
      await this.appointmentRepository.deleteOrphanedByIds(appointmentIDs)
    }

    this.appEventBus.emit('patient.deleted', { userID, patientId: deleted.id })
    return deleted
  }

  async enrollPatientInPathways(
    enrollmentData: EnrollPatientInPathwaysInput,
    userID: string,
  ): Promise<EnrollmentResult> {
    const patient = await this.create(enrollmentData.patientData, userID)
    return this.processEnrollments(
      { ...patient, appointmentPatients: [], enrollmentIssues: [] },
      enrollmentData.pathways,
      enrollmentData.startDate,
      userID,
    )
  }

  async enrollExistingPatientInPathways(
    enrollmentData: EnrollExistingPatientInPathwaysInput,
    userID: string,
  ): Promise<EnrollmentResult> {
    const patient = await this.patientRepository.findByID(
      enrollmentData.patientID,
    )
    return this.processEnrollments(
      patient,
      enrollmentData.pathways,
      enrollmentData.startDate,
      userID,
    )
  }

  private async processEnrollments(
    patient: PatientWithAppointmentsDomain,
    pathwayTemplates: EnrollPatientInPathwaysInput['pathways'],
    startDate: Date,
    userID: string,
  ): Promise<EnrollmentResult> {
    const enrollments: EnrollmentResult['enrollments'] = []
    const failedEnrollments: EnrollmentResult['failedEnrollments'] = []

    for (const pathwayTemplate of pathwayTemplates) {
      try {
        const pathwayTemplateInstance =
          await this.pathwayTemplateRepository.findByID(
            pathwayTemplate.pathwayTemplateID,
          )

        const pathways = await this.pathwayRepository.findByTemplateIDAndDate(
          pathwayTemplate.pathwayTemplateID,
          startDate,
        )

        const validPathway = pathways.find((pathway) =>
          this.isPathwayAvailable(
            pathway.slots,
            pathwayTemplate.timeOfDay,
            patient.appointmentPatients,
          ),
        )

        if (validPathway) {
          const appointments = await this.enrollOnPathway(
            patient,
            validPathway,
            pathwayTemplate,
          )
          enrollments.push({
            slotTemplate: {
              id: pathwayTemplateInstance.id,
              name: pathwayTemplateInstance.name,
            },
            appointments,
          })
        } else {
          failedEnrollments.push({
            slotTemplate: {
              id: pathwayTemplateInstance.id,
              name: pathwayTemplateInstance.name,
            },
            reason: `Aucune disponibilité pour le parcours ${pathwayTemplateInstance.name}`,
          })
        }
      } catch (error) {
        this.logger.error(
          `Erreur lors de l'inscription au parcours ${pathwayTemplate.pathwayTemplateID}: ${error instanceof Error ? error.message : String(error)}`,
        )
        failedEnrollments.push({
          slotTemplate: {
            id: pathwayTemplate.pathwayTemplateID,
          },
          reason:
            error instanceof Error
              ? error.message
              : "Erreur inconnue lors de l'inscription",
        })
      }
    }

    if (failedEnrollments.length > 0) {
      await this.enrollmentIssueRepository.create(
        patient.id,
        failedEnrollments.map((f) => ({
          pathwayTemplateID: f.slotTemplate.id,
          pathwayName: f.slotTemplate.name,
          reason: f.reason,
          startDate,
        })),
      )
    }

    this.appEventBus.emit('patient.enrolled', { userID, patientId: patient.id })

    return {
      patient: await this.patientRepository.findByID(patient.id),
      enrollments,
      failedEnrollments,
    }
  }

  private isPathwayAvailable(
    slots: SlotWithTemplateAndAppointmentsRepo[],
    timeOfDay: TimeOfDay,
    patientAppointments: AppointmentPatientWithAppointmentDomain[],
    maxCapacity = 1,
  ): boolean {
    // Tous les slots doivent passer les vérifications
    return slots.every((slot) => {
      const slotStart = dayjs(slot.startDate)
      const slotEnd = dayjs(slot.endDate)
      const slotHour = slotStart.hour()

      // 1️⃣ Vérifier le moment de la journée
      if (
        (timeOfDay === timeOfDaySchema.enum.MORNING && slotHour >= 13) ||
        (timeOfDay === timeOfDaySchema.enum.AFTERNOON && slotHour < 13)
      ) {
        return false
      }

      // 2️⃣ Vérifier si le patient n'a pas déjà un appointment qui chevauche
      const overlapsPatient = patientAppointments.some((patientAppointment) => {
        const appointment = patientAppointment.appointment
        const appointmentStart = dayjs(appointment.startDate)
        const appointmentEnd = dayjs(appointment.endDate)
        return (
          slotStart.isBefore(appointmentEnd) &&
          slotEnd.isAfter(appointmentStart)
        )
      })
      if (overlapsPatient) {
        return false
      }

      // 3️⃣ Slots individuels : vérifier qu'un créneau libre existe
      if (slot.slotTemplate.isIndividual) {
        const nextSlot = this.getNextAvailableAppointment(
          slotStart.toDate(),
          slotEnd.toDate(),
          slot.appointments,
          30, //TODO: slot.duration
        )
        if (!nextSlot) {
          return false
        }
      }

      // 4️⃣ Slots multiples : vérifier la capacité
      if (!slot.slotTemplate.isIndividual) {
        if (slot.appointments && slot.appointments.length > 0) {
          const allFull = slot.appointments.every(
            (appointment) =>
              (appointment.appointmentPatients?.length ?? 0) >=
              (slot.slotTemplate.capacity ?? maxCapacity),
          )
          if (allFull) {
            return false
          }
        }
      }

      return true
    })
  }

  private async enrollOnPathway(
    patient: PatientEntityDomain,
    pathway: PathwayWithSlotsRepo,
    pathwayTemplate: PathwayEnrollmentInput,
  ): Promise<EnrollmentAppointment[]> {
    const { thematic, type } = pathwayTemplate
    const slots = pathway.slots
    const enrollmentAppointments: EnrollmentAppointment[] = []

    for (const slot of slots) {
      try {
        // Vérifier si le créneau est individuel ou multiple
        if (slot.slotTemplate.isIndividual) {
          // Créneau individuel : créer un nouveau rendez-vous
          const nextSlot = this.getNextAvailableAppointment(
            slot.startDate,
            slot.endDate,
            slot.appointments,
            30, //TODO: slot.duration
          )
          if (nextSlot) {
            const appointment = await this.appointmentRepository.create({
              startDate: nextSlot.startDate,
              endDate: nextSlot.endDate,
              thematic: thematic ?? undefined,
              type: type ?? undefined,
              slotID: slot.id,
              patientIDs: [patient.id],
            })

            enrollmentAppointments.push({
              id: appointment.id,
              startDate: appointment.startDate,
              endDate: appointment.endDate,
              success: true,
            })
          } else {
            enrollmentAppointments.push({
              success: false,
              error: `Erreur lors de l'inscription au créneau du ${slot.startDate}`,
            })
          }
        } else {
          // Créneau multiple : rejoindre un rendez-vous existant ou en créer un
          // Vérifier s'il existe déjà des rendez-vous avec de la place
          const existingAppointment = slot.appointments.find((apt) => {
            const currentCapacity = apt.appointmentPatients?.length || 0
            const maxCapacity =
              slot.slotTemplate.capacity || Number.POSITIVE_INFINITY
            return currentCapacity < maxCapacity
          })

          if (existingAppointment) {
            // Rejoindre le rendez-vous existant
            await this.appointmentRepository.addPatientToAppointment({
              appointmentID: existingAppointment.id,
              patientID: patient.id,
            })

            enrollmentAppointments.push({
              id: existingAppointment.id,
              startDate: existingAppointment.startDate,
              endDate: existingAppointment.endDate,
              success: true,
            })
          } else {
            // Créer un nouveau rendez-vous
            const appointment = await this.appointmentRepository.create({
              startDate: slot.startDate,
              endDate: slot.endDate,
              slotID: slot.id,
              patientIDs: [patient.id],
            })

            enrollmentAppointments.push({
              id: appointment.id,
              startDate: appointment.startDate,
              endDate: appointment.endDate,
              success: true,
            })
          }
        }
      } catch {
        enrollmentAppointments.push({
          success: false,
          error: `Erreur lors de l'inscription au créneau du ${slot.startDate}`,
        })
      }
    }

    return enrollmentAppointments
  }

  private getNextAvailableAppointment(
    slotStart: Date,
    slotEnd: Date,
    existingAppointments: { startDate: Date; endDate: Date }[],
    durationMinutes = 30,
  ) {
    // Trier les rendez-vous existants par startDate
    const sortedAppointments = [...existingAppointments].sort(
      (a, b) => a.startDate.getTime() - b.startDate.getTime(),
    )

    let nextAvailableStart = dayjs(slotStart)
    const slotEndDayjs = dayjs(slotEnd)

    for (const appointment of sortedAppointments) {
      const appointmentStart = dayjs(appointment.startDate)
      const appointmentEnd = dayjs(appointment.endDate)

      // Si le créneau chevauche le rendez-vous existant
      if (
        nextAvailableStart.isBefore(appointmentEnd) &&
        nextAvailableStart.isAfter(appointmentStart.subtract(1, 'ms'))
      ) {
        nextAvailableStart = appointmentEnd
      }
    }

    const nextAvailableEnd = nextAvailableStart.add(durationMinutes, 'minute')

    // Vérifier que ça tient dans le slot
    if (nextAvailableEnd.isAfter(slotEndDayjs)) {
      return null
    }

    return {
      startDate: nextAvailableStart.toDate(),
      endDate: nextAvailableEnd.toDate(),
    }
  }
}

export { PatientDomain }
