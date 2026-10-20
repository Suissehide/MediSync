// Donnees de rendu figees a la creation d'une notification de seance : lues
// AVANT une suppression pour que la notification reste lisible si le
// rendez-vous, le creneau ou ses patients disparaissent ensuite.
export type SessionSnapshot = {
  appointmentId: string
  slotId: string
  startDate: Date
  thematicName: string | null
  locationName: string | null
  soignantIds: string[]
  patients: { id: string; name: string }[]
}

export type SlotOccupancy = {
  capacity: number
  booked: number
  soignantIds: string[]
  firstAppointmentId: string | null
  startDate: Date
  thematicName: string | null
}

export interface NotificationContextRepositoryInterface {
  sessions: (appointmentIds: string[]) => Promise<SessionSnapshot[]>
  slotOccupancy: (slotId: string) => Promise<SlotOccupancy>
}
