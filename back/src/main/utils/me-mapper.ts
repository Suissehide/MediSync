import type { EstablishmentRole, ServiceRole } from '../../generated/enums'
import { effectiveMemberships } from '../domain/accessGrant.domain'
import type { LiveGrant } from '../types/domain/accessGrant.domain.interface'
import type { UserWithMemberships } from '../types/infra/orm/repositories/user.repository.interface'

export type MeResponse = {
  id: string
  email: string
  firstName: string | null
  lastName: string | null
  isSuperAdmin: boolean
  establishments: {
    id: string
    name: string
    role: EstablishmentRole
    services: {
      id: string
      name: string
      role: ServiceRole
      soignantId: string | null
    }[]
    // Dit à l'écran d'où vient cet accès — voir R2 (décisions étape 4a) et
    // `EffectiveMembership.origine` (types/domain/accessGrant.domain.interface.ts). Sans ce
    // champ, `/me` ne pourrait jamais distinguer un établissement où l'utilisateur est
    // réellement membre d'un établissement qu'un octroi temporaire lui ouvre.
    origine: 'reelle' | 'octroi'
  }[]
}

// Arbre des appartenances EFFECTIVES (réelles + octrois vivants), actives seulement — un
// établissement ou un service désactivé disparaît de la réponse, le front ne peut donc jamais le
// sélectionner. `effectiveMemberships` (domain/accessGrant.domain.ts) est la SEULE fonction qui
// décide de cet arbre ; la résolution de tenant (tenant.plugin.ts) l'appelle aussi, pour ne
// jamais diverger de ce que `/me` affiche — voir
// src/test/unit/domain/effectiveMemberships-seul-appelant.test.ts.
//
// `grants` N'A PAS de valeur par défaut, à dessein (tour de correction 1, tâche 3) : un défaut à
// `[]` compilait sans broncher pour un appelant qui aurait oublié de lire les octrois —
// exactement la divergence que cette tâche existe pour empêcher (démontré par la revue :
// `routes/me.ts` omettant les octrois passait toute la suite existante, sans qu'aucun test ne
// s'en aperçoive). `tsc` (voir back/CLAUDE.md) force donc chaque appelant de `src/main`, y
// compris un futur, à dire explicitement « aucun octroi » (`[]`). `now` garde un défaut
// (`new Date()`) : aucun appelant ne peut se tromper en omettant l'heure réelle, ce n'est pas la
// même classe de risque.
export const toMeResponse = (
  user: UserWithMemberships,
  grants: LiveGrant[],
  now: Date = new Date(),
): MeResponse => {
  const effectives = effectiveMemberships(user, grants, now)
  const membershipByEstablishment = new Map(
    user.establishmentMemberships.map((m) => [m.establishmentId, m]),
  )
  const grantByEstablishment = new Map(
    grants.map((g) => [g.establishmentId, g]),
  )

  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    isSuperAdmin: user.isSuperAdmin,
    establishments: effectives.map((effective) => {
      if (effective.origine === 'reelle') {
        // Garanti présent : `effectiveMemberships` ne construit une entrée 'reelle' qu'à partir
        // de `user.establishmentMemberships`, jamais d'ailleurs.
        const membership = membershipByEstablishment.get(
          effective.establishmentId,
        )
        // Noms lus sur les services de l'établissement : un ADMIN y accède sans y être affecté.
        const serviceNameById = new Map(
          (membership?.establishment.services ?? []).map((s) => [s.id, s.name]),
        )
        const soignantByService = new Map(
          (membership?.serviceMemberships ?? []).map((sm) => [
            sm.serviceId,
            sm.soignantId,
          ]),
        )
        return {
          id: effective.establishmentId,
          name: membership?.establishment.name ?? '',
          role: effective.role,
          services: effective.services.map((service) => ({
            id: service.id,
            name: serviceNameById.get(service.id) ?? '',
            role: service.role,
            soignantId: soignantByService.get(service.id) ?? null,
          })),
          origine: effective.origine,
        }
      }
      // origine === 'octroi' : les noms viennent du grant correspondant, jamais de
      // `user.establishmentMemberships` (l'utilisateur n'y appartient pas réellement).
      const grant = grantByEstablishment.get(effective.establishmentId)
      const serviceNameById = new Map(
        (grant?.services ?? []).map((s) => [s.id, s.name]),
      )
      return {
        id: effective.establishmentId,
        name: grant?.establishmentName ?? '',
        role: effective.role,
        services: effective.services.map((service) => ({
          id: service.id,
          name: serviceNameById.get(service.id) ?? '',
          role: service.role,
          // Un octroi ne rattache jamais a un soignant.
          soignantId: null,
        })),
        origine: effective.origine,
      }
    }),
  }
}
