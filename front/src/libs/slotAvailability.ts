import dayjs from 'dayjs'

import type { Slot } from '../types/slot.ts'

/** Durée minimale exploitable d'un intervalle libre, alignée sur le pas des
 * options de durée de `generateDurationOptions`. */
export const MIN_APPOINTMENT_MINUTES = 15

/** Nombre de créneaux proposés dans la popup d'ajout rapide. */
export const UPCOMING_SLOT_LIMIT = 10

export type FreeInterval = { start: string; end: string }

export type SlotSuggestion = {
  slot: Slot
  /** Le patient sélectionné a déjà un rendez-vous sur ce créneau. */
  alreadyBooked: boolean
  /** Plus de place : capacité atteinte, ou plus aucun intervalle libre. */
  isFull: boolean
  bookedCount: number
  capacity: number
  isIndividual: boolean
  /** Premier intervalle libre — créneaux individuels uniquement. */
  freeInterval?: FreeInterval
  /** Rendez-vous collectif existant que le patient peut rejoindre. */
  joinableAppointmentID?: string
}

/**
 * Intervalles libres d'un créneau : ses bornes, moins les rendez-vous déjà
 * posés. Les intervalles plus courts que MIN_APPOINTMENT_MINUTES sont écartés
 * car aucune durée ne pourrait y être choisie.
 */
export const getFreeIntervals = (slot: Slot): FreeInterval[] => {
  const slotEnd = dayjs.utc(slot.endDate)
  const booked = (slot.appointments ?? [])
    .map((appointment) => ({
      start: dayjs.utc(appointment.startDate),
      end: dayjs.utc(appointment.endDate),
    }))
    .sort((a, b) => a.start.diff(b.start))

  const intervals: FreeInterval[] = []
  let cursor = dayjs.utc(slot.startDate)

  for (const appointment of booked) {
    if (appointment.start.isAfter(cursor)) {
      intervals.push({
        start: cursor.toISOString(),
        end: appointment.start.toISOString(),
      })
    }
    if (appointment.end.isAfter(cursor)) {
      cursor = appointment.end
    }
  }

  if (slotEnd.isAfter(cursor)) {
    intervals.push({ start: cursor.toISOString(), end: slotEnd.toISOString() })
  }

  return intervals.filter(
    (interval) =>
      dayjs.utc(interval.end).diff(dayjs.utc(interval.start), 'minute') >=
      MIN_APPOINTMENT_MINUTES,
  )
}

/** Nombre total de patients inscrits sur le créneau, tous rendez-vous confondus. */
export const getBookedPatientCount = (slot: Slot): number =>
  (slot.appointments ?? []).reduce(
    (total, appointment) => total + (appointment.appointmentPatients?.length ?? 0),
    0,
  )

export const getSlotCapacity = (slot: Slot): number =>
  slot.slotTemplate?.capacity ?? 1

export const isPatientBookedOnSlot = (slot: Slot, patientID: string): boolean =>
  (slot.appointments ?? []).some((appointment) =>
    appointment.appointmentPatients?.some((ap) => ap.patient.id === patientID),
  )

/**
 * Un créneau individuel est disponible s'il reste un intervalle libre ;
 * un créneau collectif l'est tant que sa capacité n'est pas atteinte.
 */
export const hasSlotAvailability = (slot: Slot): boolean =>
  slot.slotTemplate?.isIndividual
    ? getFreeIntervals(slot).length > 0
    : getBookedPatientCount(slot) < getSlotCapacity(slot)

/**
 * Les prochains créneaux d'une thématique, disponibles ou non. Les créneaux
 * complets (`isFull`) et ceux où le patient est déjà inscrit (`alreadyBooked`)
 * restent dans la liste — la vue les affiche non cliquables — pour que
 * l'utilisateur voie l'agenda réel plutôt qu'une liste trouée.
 *
 * `from` (date ISO) décale le début de la recherche : on part du début de ce
 * jour-là, jamais avant maintenant — un créneau déjà écoulé n'est proposé dans
 * aucun cas, y compris quand `from` vaut aujourd'hui.
 */
export const getUpcomingSlotSuggestions = (
  slots: Slot[] | undefined,
  thematicID: string,
  patientID: string,
  from?: string,
  limit: number = UPCOMING_SLOT_LIMIT,
): SlotSuggestion[] => {
  if (!slots || !thematicID || !patientID) {
    return []
  }

  const now = dayjs.utc()
  const fromStartOfDay = from ? dayjs.utc(from).startOf('day') : now
  const lowerBound = fromStartOfDay.isAfter(now) ? fromStartOfDay : now

  return slots
    .filter(
      (slot) =>
        slot.slotTemplate?.thematicId === thematicID &&
        !slot.locked &&
        dayjs.utc(slot.startDate).isAfter(lowerBound),
    )
    .sort((a, b) => dayjs.utc(a.startDate).diff(dayjs.utc(b.startDate)))
    .slice(0, limit)
    .map((slot) => {
      const isIndividual = !!slot.slotTemplate?.isIndividual
      const existingAppointment = slot.appointments?.[0]

      return {
        slot,
        alreadyBooked: isPatientBookedOnSlot(slot, patientID),
        isFull: !hasSlotAvailability(slot),
        bookedCount: getBookedPatientCount(slot),
        capacity: getSlotCapacity(slot),
        isIndividual,
        freeInterval: isIndividual ? getFreeIntervals(slot)[0] : undefined,
        joinableAppointmentID:
          !isIndividual && existingAppointment ? existingAppointment.id : undefined,
      }
    })
}

/**
 * Plage horaire à afficher pour un patient. Sur un créneau individuel, chaque
 * patient a son propre rendez-vous (une sous-plage du créneau) : on affiche
 * l'horaire de ce rendez-vous plutôt que celui du créneau entier. Sinon, on
 * garde l'horaire du créneau.
 */
export const getSlotDisplayRange = (
  slot: Slot,
  patientID?: string,
): { start: string; end: string } => {
  if (slot.slotTemplate?.isIndividual && patientID) {
    const appointment = slot.appointments?.find((appointment) =>
      appointment.appointmentPatients?.some((ap) => ap.patient.id === patientID),
    )
    if (appointment) {
      return { start: appointment.startDate, end: appointment.endDate }
    }
  }
  return { start: slot.startDate, end: slot.endDate }
}
