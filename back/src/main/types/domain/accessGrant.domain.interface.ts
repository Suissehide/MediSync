import type { EstablishmentRole, ServiceRole } from '../../../generated/enums'

// Description d'un octroi telle que la fournit `AccessGrantRepositoryInterface.findForUser` :
// une ligne `SuperAdminAccessGrant` non révoquée (le filtre `revokedAt: null` est fait côté
// requête, voir `accessGrant.repository.ts`), enrichie du nom de l'établissement et de ses
// services ACTIFS au moment de la lecture. Ces deux derniers ne viennent jamais d'un `include`
// imbriqué depuis ce modèle global : deux lectures séparées (Establishment, Service) puis une
// jointure en mémoire — voir le commentaire au-dessus de `SUPERADMIN_OPERATIONS` dans
// `infra/orm/tenant-guard.ts`, qui documente ce contournement comme la façon sûre de faire.
//
// `expiresAt`/`revokedAt` restent bruts : c'est `effectiveMemberships`, plus bas, qui tranche la
// vivacité, avec l'horloge qu'on lui passe en argument — jamais relue ici.
export type LiveGrant = {
  establishmentId: string
  establishmentName: string
  expiresAt: Date
  revokedAt: Date | null
  services: { id: string; name: string }[]
}

// La forme exacte qu'emploient les tests.
// `origine` n'est pas décoratif : une appartenance RÉELLE prime toujours sur un octroi (voir
// `effectiveMemberships` ci-dessous), et le futur écran d'administration s'en sert pour dire
// qu'un accès vient d'un octroi plutôt que d'une appartenance ordinaire.
export type EffectiveMembership = {
  establishmentId: string
  role: EstablishmentRole
  services: { id: string; role: ServiceRole }[]
  origine: 'reelle' | 'octroi'
}
