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

// Ce que chaque rôle permet, affiché dans l'aide des formulaires de membre.
// Référence : docs/multi-tenant/habilitations.md (et utils/permissions.ts).
export const ESTABLISHMENT_ROLE_DESCRIPTION: Record<EstablishmentRole, string> =
  {
    ADMIN:
      "Gère l'établissement : services, membres, journaux d'activité et d'accès. Coordinateur de tous les services, même sans y être affecté.",
    MEMBER:
      "Aucun droit propre : n'accède qu'aux services auxquels il est affecté, selon le rôle choisi pour chacun.",
  }

export const SERVICE_ROLE_DESCRIPTION: Record<ServiceRole, string> = {
  COORDINATEUR:
    'Tout le service : paramétrage (parcours, planning, thématiques, modèles), dossiers patients et contenu clinique, journal des consultations.',
  INTERVENANT:
    'Agenda, présences, dossiers patients, diagnostics éducatifs et transmissions. Pas de paramétrage du service.',
  SECRETARIAT:
    'Identité et coordonnées des patients, rendez-vous, présences, export PDF. Pas d’accès au contenu clinique.',
  LECTURE:
    'Consultation du suivi, du planning et des listes, sans modification ni accès au contenu clinique.',
}
