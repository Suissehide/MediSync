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

// TOUR DE CORRECTION 1 (tâche 8, étape 4a) — Important n°2 de la relecture : rien n'empêchait
// deux octrois VIVANTS sur le MÊME établissement (un premier pas encore expiré, un second
// s'accordé par-dessus) de produire ici DEUX `EffectiveMembership` identiques par
// `establishmentId` — `/me` listait alors deux fois le même établissement. La résolution de
// tenant s'en sortait (elle prend le premier match, `Array.find`), mais le sélecteur du front
// aurait affiché une ligne en double. Choix retenu (voir `SuperAdminGrantDomain.grant`,
// domain/superAdminGrant.domain.ts, pour l'AUTRE moitié du remède) : EMPÊCHER la création d'un
// second octroi vivant sur un établissement qui en a déjà un, ET dédoublonner ici quand même, en
// défense — un octroi créé avant ce garde, ou par toute autre voie future, ne redonnerait pas de
// doublon pour autant. Sans perte d'information : `AccessGrantRepositoryInterface.findForUser`
// dérive `services`/`establishmentName` de l'ÉTABLISSEMENT, jamais de la ligne d'octroi
// elle-même (voir son implémentation) — deux octrois vivants sur le même établissement portent
// donc rigoureusement le même contenu utile, seul `expiresAt`/`revokedAt` diffère, et ni l'un ni
// l'autre ne survit dans `EffectiveMembership`. Garder le premier rencontré est donc sans perte.
const dedoublonneParEtablissement = (grants: LiveGrant[]): LiveGrant[] => {
  const vus = new Set<string>()
  return grants.filter((grant) => {
    if (vus.has(grant.establishmentId)) {
      return false
    }
    vus.add(grant.establishmentId)
    return true
  })
}

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
//     tardivement : la requête suivante le referme, sans reconnexion, et le remet tout aussi vite
//     si le drapeau revient (200 → 404 → 200, éprouvé par exécution). Seconde barrière,
//     redondante et pas un substitut à celle-ci : `AccessGrantRepository.findForUser` (PAS
//     `liveGrantsForUser`, qui n'est plus qu'un relais depuis le tour de correction 1, tâche 8 —
//     voir son commentaire) relit elle-même `User.isSuperAdmin`, fraîche, avant d'entrer le
//     contexte superadmin ; un compte qui n'a structurellement rien à y trouver n'y entre donc
//     jamais.
//
//   - Une appartenance réelle prime TOUJOURS sur un octroi au même établissement — même
//     désactivée. Se limiter aux appartenances actives pour cette primauté rouvrirait
//     exactement le cas qu'elle doit fermer : un membre réel d'un établissement désactivé
//     (donc invisible, comme partout ailleurs dans ce dépôt), titulaire par ailleurs d'un octroi
//     vivant sur ce même établissement, ressusciterait un rôle ADMIN par la voie de l'octroi —
//     là où aucune voie ne doit passer. `etablissementsAvecAppartenance` est donc construit sur
//     la liste BRUTE des appartenances, pas sur `reelles` (déjà filtrée).
//
//   - Deux octrois vivants sur le MÊME établissement ne produisent jamais deux entrées (tour de
//     correction 1, tâche 8) : voir `dedoublonneParEtablissement` ci-dessous.
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
    ? dedoublonneParEtablissement(
        grants.filter(
          (grant) =>
            estVivant(grant, now) &&
            !etablissementsAvecAppartenance.has(grant.establishmentId),
        ),
      ).map(commeOctroi)
    : []
  return [...reelles, ...octrois]
}

// Seul appelant légitime de `AccessGrantRepositoryInterface.findForUser` : voir
// src/test/unit/domain/effectiveMemberships-seul-appelant.test.ts.
//
// TOUR DE CORRECTION 1 (tâche 8, étape 4a) — CE QUE LE TOUR PRÉCÉDENT N'A PAS FERMÉ. Cette
// fonction prenait un `UserEntityRepo` (= `User` complet) et faisait confiance à SON CHAMP
// `isSuperAdmin` pour décider de lire. La relecture a reconstruit le littéral complet — neuf
// champs scalaires, mot de passe et sel VIDES — pour un compte réellement titulaire d'un octroi
// mais RETIRÉ du drapeau super-admin depuis (exactement le scénario de « l octroi ne confere
// plus rien des que son titulaire n est plus super-admin », tenant-resolution.test.ts) : en
// prétendant `isSuperAdmin: true` dans le littéral, l'appel faisait ressortir l'octroi RÉEL de ce
// compte — établissement, services — alors que la vérité actuelle en base est `false`. Élargir le
// type de deux à neuf champs n'avait rien fermé : AUCUN type ne peut empêcher qui que ce soit de
// fabriquer un objet conforme, `src/main` étant vérifié par `tsc` mais pas exécuté sous un
// vérificateur à l'exécution — la fonction devait cesser de faire confiance à CE QU'ON LUI DONNE
// SUR CE POINT.
//
// REMÈDE : plus aucun champ `isSuperAdmin` en entrée — seulement un `userId`. CE N'EST PAS « plus
// rien à mentir » (tour de correction 2 — la relecture a montré que cette phrase promettait un
// cran de trop) : l'identifiant LUI-MÊME reste une valeur qu'un appelant pourrait substituer — un
// id de tiers obtiendrait les octrois de ce tiers, et rien ici ne le distingue d'un appel
// légitime, ni le compilateur, ni le lint, ni le garde-fou statique. Ce qui est vrai : la
// confiance ne porte plus sur NEUF champs (dont un booléen qu'il suffisait d'affirmer) mais sur
// UN SEUL — et c'est ce seul-là que surveille désormais
// `effectiveMemberships-seul-appelant.test.ts` (tour de correction 2 : il relit désormais aussi
// les appels à CETTE fonction, comme il le faisait déjà pour `effectiveMemberships`) : un appel
// non nommé dans sa liste fait rougir le test, que son argument soit fabriqué ou légitime. La
// vérité du DRAPEAU, elle, est rechargée ELLE-MÊME, fraîche, par
// `AccessGrantRepository.findForUser` (une lecture triviale de
// `User.isSuperAdmin`, avant toute autre chose — voir son commentaire), jamais mise en cache ni
// acceptée d'un appelant : rejouer exactement le scénario du relecteur (compte démis, octroi non
// révoqué encore en base) rend désormais `[]`, voir tenant-resolution.test.ts, « la lecture
// directe du depot ne fait plus confiance a une pretention isSuperAdmin ». Ce que cela NE ferme
// PAS — porté au journal de décisions de l'étape (tâche 14) plutôt que traité ici : que
// `userId` provienne bien, à chaque appel, d'une session authentifiée plutôt que d'un id soumis.
//
// Coût assumé : un aller-retour Postgres de plus par requête (une lecture d'une seule colonne,
// sur clé primaire) pour TOUT compte, super-admin ou non — là où l'ancienne version l'évitait
// pour un compte déjà chargé. C'est le prix exact de ne plus faire confiance à l'appelant ; la
// surface d'entrée dans `runAsSuperAdmin` elle-même reste aussi réduite qu'avant (la lecture
// fraîche est HORS de ce contexte, voir `AccessGrantRepository.findForUser` — seul un compte dont
// la vérité ACTUELLE est `isSuperAdmin: true` fait franchir la porte).
export const liveGrantsForUser = (
  userId: string,
  accessGrantRepository: AccessGrantRepositoryInterface,
): Promise<LiveGrant[]> => accessGrantRepository.findForUser(userId)
