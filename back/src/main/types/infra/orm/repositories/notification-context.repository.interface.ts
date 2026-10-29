// Donnees de rendu figees a la creation, lues avant suppression pour rester lisibles ensuite.
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
