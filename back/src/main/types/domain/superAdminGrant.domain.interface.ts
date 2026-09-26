import type {
  EstablishmentGrantRow,
  SuperAdminGrantEntityRepo,
} from '../infra/orm/repositories/accessGrant.repository.interface'

// Tâche 8 (étape 4a) : s'accorder un accès temporaire — motif obligatoire, durée bornée (spec
// §3.5). `userId` est TOUJOURS celui de l'appelant (`request.currentUser.id`, jamais du corps de
// la requête) : le mécanisme est un accès qu'on S'ACCORDE, pas un octroi qu'on poserait sur un
// tiers.
export type GrantInput = {
  userId: string
  establishmentId: string
  reason: string
  // Heures, bornées par le schéma HTTP (`superAdminGrant.schema.ts`) à `]0, 24]` — un défaut
  // manquant ici serait une seconde source de vérité pour la même règle. `undefined` retombe sur
  // `DEFAULT_GRANT_DURATION_HOURS` (domain/superAdminGrant.domain.ts), quatre heures.
  durationHours?: number
}

export interface SuperAdminGrantDomainInterface {
  // Lève `Boom.notFound` si `establishmentId` ne désigne aucun établissement (`Establishment`
  // est global, cette route n'a aucun tenant ambiant pour le garantir autrement).
  grant: (input: GrantInput) => Promise<SuperAdminGrantEntityRepo>
  // Révoque avant terme (spec §6.2). Lève `Boom.notFound` si l'id est inconnu. Idempotent EN
  // PRATIQUE mais pas en PRÉCISION : révoquer un octroi déjà révoqué réécrit `revokedAt` avec
  // l'horodatage COURANT plutôt que de garder le premier — `SuperAdminAccessGrant.update` est la
  // seule opération déclarée pour ce modèle sous contexte superadmin (PAS `updateMany`), donc pas
  // de lecture conditionnelle bon marché possible dans la même écriture ; aucune route de ce plan
  // ne dépend de la date EXACTE d'une double révocation.
  revoke: (id: string) => Promise<void>
  // `GET /e/:establishmentId/admin/grants` : en cours ET passés (spec §3.5, §6.2), motif et
  // auteur inclus. Aucun `establishmentId` en paramètre, à dessein (même parti pris que
  // `MembershipRepository`, qui lit `tenantContext.establishmentScope()` en interne plutôt que de
  // recevoir l'id en argument) : cette méthode n'est appelable QUE depuis une route déjà sous
  // contexte tenant réel (`resolveEstablishmentAdmin`), jamais avec un id soumis par
  // l'appelant — jamais l'id brut de l'URL, toujours celui que la résolution de tenant a déjà
  // vérifié appartenir à l'administrateur courant.
  forEstablishment: () => Promise<EstablishmentGrantRow[]>
}
