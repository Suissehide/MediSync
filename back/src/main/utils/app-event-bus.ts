import { EventEmitter } from 'node:events'

type AppEvents = {
  'patient.created':    { userID: string; patientId: string }
  'patient.updated':    { userID: string; patientId: string }
  'patient.deleted':    { userID: string; patientId: string }
  'patient.enrolled':   { userID: string; patientId: string }
  'patient.removedFromPathway': { userID: string; patientId: string; pathwayId: string }
  'diagnostic.created': { userID: string; diagnosticId: string }
  'diagnostic.updated': { userID: string; diagnosticId: string }
  'appointment.created': { userID: string; appointmentId: string }
  'appointment.updated': { userID: string; appointmentId: string }
  // Gestion des membres : c'est la surface qui accorde les droits, elle doit
  // etre imputable au meme titre que les ecritures sur un dossier patient.
  // `userID` est l'utilisateur qui agit, `membershipId` l'appartenance visee.
  'member.added':       { userID: string; membershipId: string }
  'member.updated':     { userID: string; membershipId: string }
  'member.removed':     { userID: string; membershipId: string }
  'member.deactivated': { userID: string; membershipId: string }
  'member.reactivated': { userID: string; membershipId: string }
}

class AppEventBus {
  private emitter = new EventEmitter()

  emit<K extends keyof AppEvents>(event: K, payload: AppEvents[K]): void {
    this.emitter.emit(event, payload)
  }

  on<K extends keyof AppEvents>(
    event: K,
    handler: (payload: AppEvents[K]) => void,
  ): void {
    this.emitter.on(event, handler)
  }
}

export { AppEventBus }
export type { AppEvents }
