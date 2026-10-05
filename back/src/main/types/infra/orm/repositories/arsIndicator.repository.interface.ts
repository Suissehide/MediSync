import type { ArsFile, ArsPresence } from '../../../../utils/ars-indicators'

// `files` : les sous-dossiers du service. `presences` : tous les rendez-vous du service, y compris
// ceux de patients sans sous-dossier ici — voir le commentaire d'`ArsCohort`.
export type ArsCohortRows = {
  files: ArsFile[]
  presences: ArsPresence[]
}

export interface ArsIndicatorRepositoryInterface {
  findCohort: () => Promise<ArsCohortRows>
  findServiceName: () => Promise<string>
}
