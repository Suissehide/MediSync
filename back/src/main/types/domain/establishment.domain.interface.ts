import type { Establishment } from '../../../generated/client'

// Le premier administrateur d'un établissement neuf (spec §3.1, §4.1, §6.2, tâche 6). Une seule
// route l'appelle aujourd'hui : `POST /super-admin/establishments`.
export type CreateEstablishmentInput = {
  name: string
  email: string
  firstName?: string
  lastName?: string
}

// Sous-ensemble de `User` : ni `password` ni `salt` ne sortent jamais de ce domaine (même
// discipline que `MembershipRepository.rowInclude`, membership.repository.ts).
export type FirstAdminEntityDomain = {
  id: string
  email: string
  firstName: string | null
  lastName: string | null
}

export type CreateEstablishmentResult = {
  establishment: Establishment
  firstAdmin: FirstAdminEntityDomain
  // Le jeton en clair, rendu une seule fois — voir `AccessLinkDomainInterface.issue`.
  accessLink: { token: string }
}

export interface EstablishmentDomainInterface {
  // Review Focus n°4 (task-6-brief.md) : si `email` désigne déjà un compte, il n'est NI écrasé
  // (ni le nom, ni le mot de passe) NI créé une seconde fois — il est seulement rattaché, en
  // ADMIN, au nouvel établissement. La forme du résultat est identique dans les deux cas :
  // rien ne permet à l'appelant de distinguer un compte créé d'un compte réutilisé.
  createWithFirstAdmin: (
    input: CreateEstablishmentInput,
    issuedBy: string,
  ) => Promise<CreateEstablishmentResult>
}
