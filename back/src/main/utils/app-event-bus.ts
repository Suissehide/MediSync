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
  // Tache 10 : creer un compte de membre est la plus forte de ces operations — elle fabrique
  // une identite ET lui remet un acces. Un evenement A PART plutot que `member.added`, pour
  // que le journal distingue « rattache une identite existante » de « a cree ce compte ».
  'member.accountCreated': { userID: string; membershipId: string }
  // Reemettre un lien, c'est remettre a quelqu'un le pouvoir de reinitialiser le mot de
  // passe d'un compte : la trace importe autant que pour un changement de role.
  'member.accessLinkReissued': { userID: string; membershipId: string }
  // Tache 7 (etape 4b) : `UserDomain.reissueAccessLink`, sous le prefixe super-admin — la route
  // la plus puissante du systeme (elle reemet un lien d'acces pour N'IMPORTE QUEL compte, hors
  // de la garde de jeton qui borne `member.accessLinkReissued` a un seul etablissement). Un
  // evenement A PART plutot qu'une reutilisation de `member.accessLinkReissued` : cette route
  // n'a pas d'appartenance (`membershipId`) a rapporter, seulement le compte cible
  // (`targetUserId`), et la confondre avec la variante d'etablissement effacerait precisement la
  // distinction que le journal doit porter. `userID` est le super-admin qui agit.
  'user.accessLinkReissued': { userID: string; targetUserId: string }
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
