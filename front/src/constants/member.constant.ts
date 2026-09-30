import type { EstablishmentRole, ServiceRole } from '../types/auth.ts'

// Les deux rôles d'un membre sont distincts et se règlent séparément : celui
// de l'établissement (administrateur ou simple membre), et celui, propre à
// un service donné, porté par `serviceMemberships`. Partagé par les
// colonnes du tableau et par les formulaires d'ajout/modification.
export const ESTABLISHMENT_ROLE_LABEL: Record<EstablishmentRole, string> = {
  ADMIN: "Chef d'établissement",
  MEMBER: 'Membre',
}

export const SERVICE_ROLE_LABEL: Record<ServiceRole, string> = {
  COORDINATEUR: 'Coordinateur',
  INTERVENANT: 'Intervenant',
  SECRETARIAT: 'Secrétariat',
  LECTURE: 'Lecture',
}
