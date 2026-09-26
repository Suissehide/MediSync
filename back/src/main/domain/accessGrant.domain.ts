import type { UserWithMemberships } from '../types/infra/orm/repositories/user.repository.interface'
import type { EffectiveMembership, LiveGrant } from '../types/domain/accessGrant.domain.interface'

// Un octroi est vivant s'il n'a été ni révoqué ni atteint son terme, jugé contre l'horloge
// REÇUE (jamais lue ici) : c'est ce qui rend l'expiration éprouvable sans attendre, à l'unité
// comme en e2e (voir tenant-resolution.test.ts, « refuse dès que l'octroi expire »).
const estVivant = (grant: LiveGrant, now: Date): boolean =>
  grant.revokedAt === null && grant.expiresAt.getTime() > now.getTime()

// Rôle que confère un octroi vivant : ADMIN sur l'établissement, COORDINATEUR sur TOUS ses
// services actifs. La spécification ne tranche que le rôle de service (« coordinateur ») ; le
// rôle d'établissement qui l'accompagne ne l'est pas, et c'est ici qu'il est tranché. Motif :
// l'octroi sert au diagnostic, et un accès qui ne verrait pas la liste des membres (réservée à
// un ADMIN d'établissement, voir utils/permissions.ts) ne diagnostiquerait pas le cas le plus
// fréquent — un problème d'appartenance. De même, se limiter à un sous-ensemble de services
// laisserait par construction hors de portée le service même où le problème se trouve.
const commeOctroi = (grant: LiveGrant): EffectiveMembership => ({
  establishmentId: grant.establishmentId,
  role: 'ADMIN',
  // `grant.services ?? []` : le brief teste la vivacité d'un octroi avec un littéral à trois
  // champs (`{ establishmentId, expiresAt, revokedAt }`, sans `services`) — non typé (src/test
  // n'est pas vérifié par tsc, voir back/CLAUDE.md), mais réel à l'exécution. `AccessGrantRepository`
  // fournit toujours `services` en production ; ce repli ne change donc rien en dehors des tests
  // qui ne testent pas ce champ.
  services: (grant.services ?? []).map((service) => ({ id: service.id, role: 'COORDINATEUR' })),
  origine: 'octroi',
})

// Arbre des appartenances RÉELLES, actives seulement (un établissement ou un service désactivé
// disparaît) — reprend ici la filtration jusqu'ici dupliquée entre `me-mapper.ts` et
// `tenant.plugin.ts` (`resolveTenantFromUser`), l'un et l'autre appelant désormais cette
// fonction plutôt que de la refaire chacun à sa façon.
const appartenancesReelles = (user: UserWithMemberships): EffectiveMembership[] =>
  user.establishmentMemberships
    .filter((membership) => membership.establishment.deactivatedAt === null)
    .map((membership) => ({
      establishmentId: membership.establishmentId,
      role: membership.role,
      services: membership.serviceMemberships
        .filter((serviceMembership) => serviceMembership.service.deactivatedAt === null)
        .map((serviceMembership) => ({
          id: serviceMembership.serviceId,
          role: serviceMembership.role,
        })),
      origine: 'reelle' as const,
    }))

// Fonction UNIQUE dont dépendent à la fois `/me` (utils/me-mapper.ts) et la résolution de tenant
// (interfaces/http/fastify/plugins/tenant.plugin.ts) — voir
// src/test/unit/domain/effectiveMemberships-seul-appelant.test.ts, qui rougit si un troisième
// endroit calcule des appartenances sans passer par elle. C'est le point le plus délicat de
// l'étape 4a : deux chemins qui calculeraient les appartenances chacun à sa façon finiraient par
// diverger, et la divergence se solderait par un accès que l'un accorde et que l'autre refuse —
// ou l'inverse, ce qui est pire.
//
// Une appartenance réelle prime toujours sur un octroi : un super-admin qui est AUSSI membre
// ordinaire d'un établissement n'y apparaît pas deux fois, et c'est son rôle réel qui compte, pas
// celui, plus large, que l'octroi lui aurait donné.
export const effectiveMemberships = (
  user: UserWithMemberships,
  grants: LiveGrant[],
  now: Date,
): EffectiveMembership[] => {
  const reelles = appartenancesReelles(user)
  const etablissementsReels = new Set(reelles.map((membership) => membership.establishmentId))
  const octrois = grants
    .filter((grant) => estVivant(grant, now) && !etablissementsReels.has(grant.establishmentId))
    .map(commeOctroi)
  return [...reelles, ...octrois]
}
