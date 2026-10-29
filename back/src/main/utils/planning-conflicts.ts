type Interval = { startDate: Date; endDate: Date }

type ConflictAppointment = Interval & {
  id: string
  appointmentPatients: { patientId: string }[]
}

export type ConflictSlot = Interval & {
  id: string
  archivedAt?: Date | null
  slotTemplate: { locationID?: string | null; capacity?: number | null }
  appointments: ConflictAppointment[]
}

export type PlanningConflict =
  | { type: 'salle'; slotIDs: string[]; locationID: string }
  | {
      type: 'patient'
      slotIDs: string[]
      appointmentIDs: string[]
      patientID: string
    }
  | {
      type: 'capacite'
      slotIDs: string[]
      appointmentID: string
      capacity: number
      count: number
    }

const overlaps = (a: Interval, b: Interval) =>
  a.startDate < b.endDate && a.endDate > b.startDate

// Une plage vide (parcours sans inscrit) ne dispute la salle à personne.
const isOccupied = (slot: ConflictSlot) =>
  slot.appointments.some((a) => a.appointmentPatients.length > 0)

// ponytail: comparaison par paires en O(n²), suffit pour une semaine de service ; balayage trié si les plages s'allongent.
export const detectConflicts = (slots: ConflictSlot[]): PlanningConflict[] => {
  const live = slots.filter((slot) => !slot.archivedAt)
  const conflicts: PlanningConflict[] = []

  const occupied = live.filter(isOccupied)
  occupied.forEach((a, index) => {
    const locationID = a.slotTemplate.locationID
    for (const b of occupied.slice(index + 1)) {
      if (
        locationID &&
        locationID === b.slotTemplate.locationID &&
        overlaps(a, b)
      ) {
        conflicts.push({ type: 'salle', slotIDs: [a.id, b.id], locationID })
      }
    }
  })

  const appointments = live.flatMap((slot) =>
    slot.appointments.map((appointment) => ({
      ...appointment,
      slotID: slot.id,
    })),
  )
  appointments.forEach((a, index) => {
    for (const b of appointments.slice(index + 1)) {
      if (!overlaps(a, b)) {
        continue
      }
      const bPatients = new Set(b.appointmentPatients.map((p) => p.patientId))
      for (const { patientId } of a.appointmentPatients) {
        if (bPatients.has(patientId)) {
          conflicts.push({
            type: 'patient',
            slotIDs: [...new Set([a.slotID, b.slotID])],
            appointmentIDs: [a.id, b.id],
            patientID: patientId,
          })
        }
      }
    }
  })

  for (const slot of live) {
    const { capacity } = slot.slotTemplate
    if (capacity === null || capacity === undefined) {
      continue
    }
    for (const appointment of slot.appointments) {
      const count = new Set(
        appointment.appointmentPatients.map((p) => p.patientId),
      ).size
      if (count > capacity) {
        conflicts.push({
          type: 'capacite',
          slotIDs: [slot.id],
          appointmentID: appointment.id,
          capacity,
          count,
        })
      }
    }
  }

  return conflicts
}
