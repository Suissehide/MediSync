import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'

import { TOAST_SEVERITY } from '../constants/ui.constant.ts'
import type { PlanningConflict, Slot } from '../types/slot.ts'

dayjs.extend(utc)

const hour = (date: string) => dayjs.utc(date).format('HH:mm')

const SUMMARY: Record<PlanningConflict['type'], string> = {
  salle: 'salle déjà occupée',
  patient: 'patient déjà en rendez-vous à cette heure',
  capacite: 'capacité dépassée',
}

// Libellé vu depuis `slotID` : pour une salle, on nomme l'autre créneau.
export const describeConflict = (
  conflict: PlanningConflict,
  slotID: string,
  slots: Slot[],
): string => {
  if (conflict.type === 'capacite') {
    return `${conflict.count} patients pour ${conflict.capacity} places`
  }
  if (conflict.type === 'salle') {
    const name =
      slots.find((slot) => conflict.slotIDs.includes(slot.id))?.slotTemplate
        ?.location?.name ?? 'La salle'
    const other = slots.find(
      (slot) => slot.id !== slotID && conflict.slotIDs.includes(slot.id),
    )
    if (!other) {
      return `${name} déjà occupée`
    }
    const thematic = other.slotTemplate?.thematic
    return `${name} déjà occupée ${hour(other.startDate)}–${hour(other.endDate)}${thematic ? ` (${thematic})` : ''}`
  }
  const appointments = slots.flatMap((slot) =>
    (slot.appointments ?? []).map((appointment) => ({
      ...appointment,
      slotID: slot.id,
    })),
  )
  const patient = appointments
    .flatMap((appointment) => appointment.appointmentPatients ?? [])
    .find((ap) => ap.patient?.id === conflict.patientID)?.patient
  const name = patient
    ? `${patient.lastName} ${patient.firstName}`
    : 'Un patient'
  if (conflict.slotIDs.length === 1) {
    return `${name} a deux rendez-vous qui se chevauchent`
  }
  const other = appointments.find(
    (appointment) =>
      appointment.slotID !== slotID &&
      conflict.appointmentIDs.includes(appointment.id),
  )
  return other
    ? `${name} a déjà un rendez-vous à ${hour(other.startDate)}`
    : `${name} a déjà un rendez-vous à cette heure`
}

export const labelConflicts = (
  conflicts: PlanningConflict[],
  slots: Slot[],
) => {
  const labels = new Map<string, string[]>()
  for (const conflict of conflicts) {
    for (const slotID of conflict.slotIDs) {
      labels.set(slotID, [
        ...(labels.get(slotID) ?? []),
        describeConflict(conflict, slotID, slots),
      ])
    }
  }
  return labels
}

export const conflictWarning = (conflicts: PlanningConflict[]) => {
  const summary = [...new Set(conflicts.map((c) => SUMMARY[c.type]))].join(', ')
  return {
    title: `Enregistré, mais ${conflicts.length} conflit${conflicts.length > 1 ? 's' : ''}`,
    message: summary.charAt(0).toUpperCase() + summary.slice(1),
    severity: TOAST_SEVERITY.WARNING,
  }
}
