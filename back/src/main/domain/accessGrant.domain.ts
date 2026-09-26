import type {
  EffectiveMembership,
  LiveGrant,
} from '../types/domain/accessGrant.domain.interface'
import type { AccessGrantRepositoryInterface } from '../types/infra/orm/repositories/accessGrant.repository.interface'
import type { UserWithMemberships } from '../types/infra/orm/repositories/user.repository.interface'

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
  services: (grant.services ?? []).map((service) => ({
    id: service.id,
    role: 'COORDINATEUR',
  })),
  origine: 'octroi',
})

// Arbre des appartenances RÉELLES, actives seulement (un établissement ou un service désactivé
// disparaît) — reprend ici la filtration jusqu'ici dupliquée entre `me-mapper.ts` et
// `tenant.plugin.ts` (`resolveTenantFromUser`), l'un et l'autre appelant désormais cette
// fonction plutôt que de la refaire chacun à sa façon.
const appartenancesReelles = (
  user: UserWithMemberships,
): EffectiveMembership[] =>
  user.establishmentMemberships
    .filter((membership) => membership.establishment.deactivatedAt === null)
    .map((membership) => ({
      establishmentId: membership.establishmentId,
      role: membership.role,
      services: membership.serviceMemberships
        .filter(
          (serviceMembership) =>
            serviceMembership.service.deactivatedAt === null,
        )
        .map((serviceMembership) => ({
          id: serviceMembership.serviceId,
          role: serviceMembership.role,
        })),
      origine: 'reelle' as const,
    }))

// Fonction UNIQUE dont dépendent à la fois `/me` (utils/me-mapper.ts) et la résolution de tenant
// (interfaces/http/fastify/plugins/tenant.plugin.ts) — voir
// src/test/unit/domain/effectiveMemberships-seul-appelant.test.ts, qui rougit si un appelant
// nommé disparaît ou si un troisième apparaît (ce test ne peut pas voir une réimplémentation
// locale qui ne nommerait jamais cette fonction — voir son commentaire pour ce qu'il garantit
// réellement). C'est le point le plus délicat de l'étape 4a : deux chemins qui calculeraient les
// appartenances chacun à sa façon finiraient par diverger, et la divergence se solderait par un
// accès que l'un accorde et que l'autre refuse — ou l'inverse, ce qui est pire.
//
// Deux garanties, chacune ajoutée après une revue qui a démontré par exécution qu'elle manquait
// (tour de correction 1, tâche 3) :
//
//   - Un octroi ne confère RIEN si son titulaire n'est plus super-admin, jugé ICI, à la lecture,
//     contre le MÊME `user` que celui dont dépendent les appartenances réelles — jamais mis en
//     cache, exactement comme l'expiration. Retirer le drapeau ne retire donc jamais l'accès que
//     tardivement : la requête suivante le referme, sans reconnexion. `liveGrantsForUser`
//     ci-dessous fait aussi l'économie de la lecture pour un compte qui n'a structurellement
//     jamais rien à y trouver — une seconde barrière, pas un substitut à celle-ci.
//
//   - Une appartenance réelle prime TOUJOURS sur un octroi au même établissement — même
//     désactivée. Se limiter aux appartenances actives pour cette primauté rouvrirait
//     exactement le cas qu'elle doit fermer : un membre réel d'un établissement désactivé
//     (donc invisible, comme partout ailleurs dans ce dépôt), titulaire par ailleurs d'un octroi
//     vivant sur ce même établissement, ressusciterait un rôle ADMIN par la voie de l'octroi —
//     là où aucune voie ne doit passer. `etablissementsAvecAppartenance` est donc construit sur
//     la liste BRUTE des appartenances, pas sur `reelles` (déjà filtrée).
//
// Ce qu'elle ne garantit PAS, et qui reste à la charge de l'appelant : qu'un octroi visant un
// établissement désactivé — sans qu'aucune appartenance réelle, active ou non, ne l'atteste —
// n'arrive jamais jusqu'ici. `LiveGrant` (types/domain/accessGrant.domain.interface.ts) ne porte
// pas cette information ; c'est `AccessGrantRepository.findForUser` qui filtre les établissements
// désactivés en amont. Cette fonction fait donc confiance à ses `grants` sur ce seul point.
export const effectiveMemberships = (
  user: UserWithMemberships,
  grants: LiveGrant[],
  now: Date,
): EffectiveMembership[] => {
  const reelles = appartenancesReelles(user)
  const etablissementsAvecAppartenance = new Set(
    user.establishmentMemberships.map(
      (membership) => membership.establishmentId,
    ),
  )
  const octrois = user.isSuperAdmin
    ? grants
        .filter(
          (grant) =>
            estVivant(grant, now) &&
            !etablissementsAvecAppartenance.has(grant.establishmentId),
        )
        .map(commeOctroi)
    : []
  return [...reelles, ...octrois]
}

// N'entre JAMAIS le contexte superadmin (tenantContext.runAsSuperAdmin, dans
// `AccessGrantRepository.findForUser`) pour un compte qui n'est pas — ou plus — super-admin : un
// octroi ne lui confère de toute façon rien (voir `effectiveMemberships` ci-dessus), donc la
// lecture n'a structurellement rien à trouver. La tâche 1 a mis quatre tours de correction à
// réduire la surface où ce contexte est actif ; l'élargir à CHAQUE requête de CHAQUE
// utilisateur — superadmin ou non — l'aurait rouverte. Seul appelant légitime de
// `AccessGrantRepositoryInterface.findForUser` : voir
// src/test/unit/domain/effectiveMemberships-seul-appelant.test.ts.
export const liveGrantsForUser = (
  user: Pick<UserWithMemberships, 'id' | 'isSuperAdmin'>,
  accessGrantRepository: AccessGrantRepositoryInterface,
): Promise<LiveGrant[]> =>
  user.isSuperAdmin
    ? accessGrantRepository.findForUser(user.id)
    : Promise.resolve([])
