import dayjs from 'dayjs'
import * as XLSX from 'xlsx'

import type { AppointmentType } from '../../generated/enums'

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
  PatientExportFilters,
  PatientPathwayDomain,
  PatientUpdateEntityDomain,
  PatientWithAppointmentsDomain,
  PatientWithTagsDomain,
  RemoveFromPathwayResult,
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
import type { ThematicRepositoryInterface } from '../types/infra/orm/repositories/thematic.repository.interface'
import type { Logger } from '../types/utils/logger'
import type { AppEventBus } from '../utils/app-event-bus'

const orEmpty = (value: string | null | undefined): string => value ?? ''
const formatDate = (value: Date | string | null | undefined): string =>
  value ? dayjs(value).format('DD/MM/YYYY') : ''

class PatientDomain implements PatientDomainInterface {
  private readonly logger: Logger
  private readonly patientRepository: PatientRepositoryInterface
  private readonly pathwayRepository: PathwayRepositoryInterface
  private readonly pathwayTemplateRepository: PathwayTemplateRepositoryInterface
  private readonly appointmentRepository: AppointmentRepositoryInterface
  private readonly enrollmentIssueRepository: EnrollmentIssueRepositoryInterface
  private readonly thematicRepository: ThematicRepositoryInterface
  private readonly appEventBus: AppEventBus

  constructor({
    patientRepository,
    pathwayRepository,
    pathwayTemplateRepository,
    appointmentRepository,
    enrollmentIssueRepository,
    thematicRepository,
    appEventBus,
    logger,
  }: IocContainer) {
    this.patientRepository = patientRepository
    this.pathwayRepository = pathwayRepository
    this.pathwayTemplateRepository = pathwayTemplateRepository
    this.appointmentRepository = appointmentRepository
    this.enrollmentIssueRepository = enrollmentIssueRepository
    this.thematicRepository = thematicRepository
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

  async exportExcel(filters: PatientExportFilters): Promise<Buffer> {
    const patients = await this.patientRepository.findForExport(filters)

    const rows = patients.map((p) => ({
      Prénom: orEmpty(p.firstName),
      Nom: orEmpty(p.lastName),
      Genre: orEmpty(p.gender),
      'Date de naissance': formatDate(p.birthDate),
      Téléphone: orEmpty(p.phone1),
      'Téléphone 2': orEmpty(p.phone2),
      Email: orEmpty(p.email),
      "Date d'entrée": formatDate(p.entryDate),
      'Date de sortie': formatDate(p.exitDate),
      Parcours: p.pathwayTemplateTags.join(', '),
      'Diagnostic médical': orEmpty(p.medicalDiagnosis),
      'Mode de prise en charge': orEmpty(p.careMode),
      Orientation: orEmpty(p.orientation),
      Profession: orEmpty(p.occupation),
      "Niveau d'étude": orEmpty(p.educationLevel),
      Distance: orEmpty(p.distance),
      'Motif de sortie': orEmpty(p.stopReason),
      Notes: orEmpty(p.notes),
    }))

    const ws = XLSX.utils.json_to_sheet(rows)

    ws['!cols'] = [
      { wch: 16 }, // Prénom
      { wch: 16 }, // Nom
      { wch: 10 }, // Genre
      { wch: 18 }, // Date de naissance
      { wch: 16 }, // Téléphone
      { wch: 16 }, // Téléphone 2
      { wch: 28 }, // Email
      { wch: 14 }, // Date d'entrée
      { wch: 14 }, // Date de sortie
      { wch: 30 }, // Parcours
      { wch: 28 }, // Diagnostic médical
      { wch: 24 }, // Mode de prise en charge
      { wch: 18 }, // Orientation
      { wch: 20 }, // Profession
      { wch: 18 }, // Niveau d'étude
      { wch: 14 }, // Distance
      { wch: 22 }, // Motif de sortie
      { wch: 40 }, // Notes
    ]

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Patients')
    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
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

  async countAppointmentsInPathway(
    patientID: string,
    pathwayID: string,
  ): Promise<{ count: number }> {
    const count = await this.patientRepository.countAppointmentsInPathway(
      patientID,
      pathwayID,
    )
    return { count }
  }

  async removeFromPathway(
    patientID: string,
    pathwayID: string,
    userID: string,
  ): Promise<RemoveFromPathwayResult> {
    const result = await this.patientRepository.removeFromPathway(
      patientID,
      pathwayID,
    )

    this.appEventBus.emit('patient.removedFromPathway', {
      userID,
      patientId: patientID,
      pathwayId: pathwayID,
    })

    return result
  }

  getPathways(patientID: string): Promise<PatientPathwayDomain[]> {
    return this.patientRepository.getPathwaysForPatient(patientID)
  }

  async setPathwayPriorities(
    patientID: string,
    orderedPathwayIDs: string[],
  ): Promise<void> {
    await this.patientRepository.setPathwayPriorities(
      patientID,
      orderedPathwayIDs,
    )
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

  private async resolveDuration(
    enrollment: PathwayEnrollmentInput,
  ): Promise<number> {
    if (enrollment.thematicID && !enrollment.duration) {
      const thematic = await this.thematicRepository.findByID(
        enrollment.thematicID,
      )
      return thematic.duration ?? 30
    }
    return enrollment.duration ?? 30
  }

  private selectValidPathway(
    pathways: PathwayWithSlotsRepo[],
    enrollment: PathwayEnrollmentInput,
    patient: PatientWithAppointmentsDomain,
    thematicDuration: number,
    firstAppointmentOnly: boolean,
    startDate: Date,
  ): PathwayWithSlotsRepo | undefined {
    if (!firstAppointmentOnly) {
      return pathways.find((pathway) =>
        this.isPathwayAvailable(
          pathway.slots,
          enrollment.timeOfDay,
          patient.appointmentPatients,
          1,
          thematicDuration,
        ),
      )
    }
    const startOfDay = new Date(startDate)
    startOfDay.setHours(0, 0, 0, 0)
    return pathways.find((pathway) =>
      pathway.slots
        .filter((slot) => new Date(slot.startDate) >= startOfDay)
        .sort(
          (a, b) =>
            new Date(a.startDate).getTime() - new Date(b.startDate).getTime(),
        )
        .some((slot) =>
          this.isSlotAvailable(
            slot,
            enrollment.timeOfDay,
            patient.appointmentPatients,
            1,
            thematicDuration,
          ),
        ),
    )
  }

  // Traite l'inscription du patient pour un tag de parcours donné et retourne
  // soit une inscription réussie, soit un échec (jamais les deux).
  private async enrollPatientInTag(
    patient: PatientWithAppointmentsDomain,
    enrollment: PathwayEnrollmentInput,
    startDate: Date,
  ): Promise<{
    enrollment?: EnrollmentResult['enrollments'][number]
    failure?: EnrollmentResult['failedEnrollments'][number]
  }> {
    const thematicDuration = await this.resolveDuration(enrollment)

    // Vérifier si le motif est requis
    const allTemplates = await this.pathwayTemplateRepository.findAll()
    const matchingTemplate = allTemplates.find((t) =>
      t.tags?.includes(enrollment.tag),
    )
    if (
      matchingTemplate?.motifRequired &&
      (!enrollment.motif || !enrollment.motif.trim())
    ) {
      return {
        failure: {
          slotTemplate: { id: enrollment.tag, name: enrollment.tag },
          reason: `Le motif est obligatoire pour le parcours "${enrollment.tag}"`,
        },
      }
    }

    const firstAppointmentOnly = matchingTemplate?.firstAppointmentOnly ?? false

    // Trouver les parcours disponibles par tag
    const pathways = firstAppointmentOnly
      ? await this.pathwayRepository.findByTemplateTagWithFutureSlots(
          enrollment.tag,
          startDate,
        )
      : await this.pathwayRepository.findByTemplateTagAndDate(
          enrollment.tag,
          startDate,
        )

    if (pathways.length === 0) {
      return {
        failure: {
          slotTemplate: { id: enrollment.tag },
          reason: `Aucun parcours disponible ou complet pour "${enrollment.tag}"`,
        },
      }
    }

    const validPathway = this.selectValidPathway(
      pathways,
      enrollment,
      patient,
      thematicDuration,
      firstAppointmentOnly,
      startDate,
    )

    if (!validPathway) {
      return {
        failure: {
          slotTemplate: { id: enrollment.tag, name: enrollment.tag },
          reason: `Aucun parcours disponible ou complet pour "${enrollment.tag}"`,
        },
      }
    }

    const appointments = await this.enrollOnPathway(
      patient,
      validPathway,
      enrollment,
      enrollment.thematicID,
      thematicDuration,
      firstAppointmentOnly,
      startDate,
    )
    return {
      enrollment: {
        slotTemplate: { id: enrollment.tag, name: enrollment.tag },
        appointments,
      },
    }
  }

  private async processEnrollments(
    patient: PatientWithAppointmentsDomain,
    pathwayTemplates: EnrollPatientInPathwaysInput['pathways'],
    startDate: Date,
    userID: string,
  ): Promise<EnrollmentResult> {
    const enrollments: EnrollmentResult['enrollments'] = []
    const failedEnrollments: EnrollmentResult['failedEnrollments'] = []

    for (const enrollment of pathwayTemplates) {
      try {
        const outcome = await this.enrollPatientInTag(
          patient,
          enrollment,
          startDate,
        )
        if (outcome.enrollment) {
          enrollments.push(outcome.enrollment)
        }
        if (outcome.failure) {
          failedEnrollments.push(outcome.failure)
        }
      } catch (error) {
        this.logger.error(
          `Erreur lors de l'inscription au parcours avec tag "${enrollment.tag}": ${error instanceof Error ? error.message : String(error)}`,
        )
        failedEnrollments.push({
          slotTemplate: {
            id: enrollment.tag,
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

  private isSlotAvailable(
    slot: SlotWithTemplateAndAppointmentsRepo,
    timeOfDay: TimeOfDay,
    patientAppointments: AppointmentPatientWithAppointmentDomain[],
    maxCapacity = 1,
    appointmentDuration = 30,
  ): boolean {
    const slotStart = dayjs(slot.startDate)
    const slotEnd = dayjs(slot.endDate)
    const slotHour = slotStart.hour()

    if (
      (timeOfDay === timeOfDaySchema.enum.MORNING && slotHour >= 13) ||
      (timeOfDay === timeOfDaySchema.enum.AFTERNOON && slotHour < 13)
    ) {
      return false
    }

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

    if (slot.slotTemplate.isIndividual) {
      const nextSlot = this.getNextAvailableAppointment(
        slotStart.toDate(),
        slotEnd.toDate(),
        slot.appointments,
        appointmentDuration,
      )
      if (!nextSlot) {
        return false
      }
    }

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
  }

  private isPathwayAvailable(
    slots: SlotWithTemplateAndAppointmentsRepo[],
    timeOfDay: TimeOfDay,
    patientAppointments: AppointmentPatientWithAppointmentDomain[],
    maxCapacity = 1,
    appointmentDuration = 30,
  ): boolean {
    return slots.every((slot) =>
      this.isSlotAvailable(slot, timeOfDay, patientAppointments, maxCapacity, appointmentDuration),
    )
  }

  // Inscrit le patient sur un créneau donné et retourne les rendez-vous
  // produits (0 ou 1). En mode firstAppointmentOnly, un créneau individuel
  // sans place disponible ne produit pas d'échec (retourne un tableau vide).
  private async enrollInSlot(
    slot: SlotWithTemplateAndAppointmentsRepo,
    patient: PatientEntityDomain,
    options: {
      type?: AppointmentType | null
      motif?: string | null
      thematicId?: string | null
      appointmentDuration: number
      firstAppointmentOnly: boolean
    },
  ): Promise<EnrollmentAppointment[]> {
    const { type, motif, thematicId, appointmentDuration, firstAppointmentOnly } =
      options

    if (slot.slotTemplate.isIndividual) {
      const nextSlot = this.getNextAvailableAppointment(
        slot.startDate,
        slot.endDate,
        slot.appointments,
        appointmentDuration,
      )
      if (!nextSlot) {
        return firstAppointmentOnly
          ? []
          : [
              {
                success: false,
                error: `Erreur lors de l'inscription au créneau du ${slot.startDate}`,
              },
            ]
      }
      const appointment = await this.appointmentRepository.create({
        startDate: nextSlot.startDate,
        endDate: nextSlot.endDate,
        thematicId: thematicId ?? undefined,
        type: type ?? undefined,
        slotID: slot.id,
        patientIDs: [patient.id],
        transmissionNotes: motif ?? undefined,
      })
      return [
        {
          id: appointment.id,
          startDate: appointment.startDate,
          endDate: appointment.endDate,
          success: true,
        },
      ]
    }

    // Créneau multiple : rejoindre un rendez-vous existant avec de la place,
    // sinon en créer un nouveau.
    const existingAppointment = slot.appointments.find((apt) => {
      const currentCapacity = apt.appointmentPatients?.length || 0
      const maxCapacity = slot.slotTemplate.capacity || Number.POSITIVE_INFINITY
      return currentCapacity < maxCapacity
    })

    if (existingAppointment) {
      await this.appointmentRepository.addPatientToAppointment({
        appointmentID: existingAppointment.id,
        patientID: patient.id,
        transmissionNotes: motif ?? undefined,
      })
      return [
        {
          id: existingAppointment.id,
          startDate: existingAppointment.startDate,
          endDate: existingAppointment.endDate,
          success: true,
        },
      ]
    }

    const appointment = await this.appointmentRepository.create({
      startDate: slot.startDate,
      endDate: slot.endDate,
      thematicId: thematicId ?? undefined,
      type: type ?? undefined,
      slotID: slot.id,
      patientIDs: [patient.id],
      transmissionNotes: motif ?? undefined,
    })
    return [
      {
        id: appointment.id,
        startDate: appointment.startDate,
        endDate: appointment.endDate,
        success: true,
      },
    ]
  }

  private async enrollOnPathway(
    patient: PatientEntityDomain,
    pathway: PathwayWithSlotsRepo,
    pathwayTemplate: PathwayEnrollmentInput,
    thematicId?: string,
    appointmentDuration = 30,
    firstAppointmentOnly = false,
    enrollmentDate?: Date,
  ): Promise<EnrollmentAppointment[]> {
    const { type, motif } = pathwayTemplate
    let slots = [...pathway.slots].sort(
      (a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime(),
    )

    // En mode firstAppointmentOnly, ne considérer que les slots futurs
    if (firstAppointmentOnly && enrollmentDate) {
      const startOfDay = new Date(enrollmentDate)
      startOfDay.setHours(0, 0, 0, 0)
      slots = slots.filter((slot) => new Date(slot.startDate) >= startOfDay)
    }

    const enrollmentAppointments: EnrollmentAppointment[] = []

    for (const slot of slots) {
      try {
        const slotAppointments = await this.enrollInSlot(slot, patient, {
          type,
          motif,
          thematicId,
          appointmentDuration,
          firstAppointmentOnly,
        })
        enrollmentAppointments.push(...slotAppointments)

        // En mode firstAppointmentOnly, on s'arrête au premier créneau réussi.
        if (firstAppointmentOnly && slotAppointments.some((a) => a.success)) {
          return enrollmentAppointments
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

    // Avance la fenêtre candidate [start, start+durée] tant qu'elle chevauche
    // un rendez-vous existant. On ré-itère car repousser le début après un
    // rendez-vous peut faire entrer la fenêtre en collision avec le suivant.
    let collisionFound = true
    while (collisionFound) {
      collisionFound = false
      const candidateEnd = nextAvailableStart.add(durationMinutes, 'minute')

      for (const appointment of sortedAppointments) {
        const appointmentStart = dayjs(appointment.startDate)
        const appointmentEnd = dayjs(appointment.endDate)

        // Chevauchement d'intervalles : start < apptEnd && candidateEnd > apptStart
        if (
          nextAvailableStart.isBefore(appointmentEnd) &&
          candidateEnd.isAfter(appointmentStart)
        ) {
          nextAvailableStart = appointmentEnd
          collisionFound = true
          break
        }
      }

      // Sortie si la fenêtre ne tient plus dans le créneau.
      if (nextAvailableStart.add(durationMinutes, 'minute').isAfter(slotEndDayjs)) {
        return null
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
