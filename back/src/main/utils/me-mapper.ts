import { effectiveMemberships } from '../domain/accessGrant.domain'
import type { EstablishmentRole, ServiceRole } from '../../generated/enums'
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
    soignantId: string | null
    services: { id: string; name: string; role: ServiceRole }[]
  }[]
}

// Arbre des appartenances EFFECTIVES (réelles + octrois vivants), actives seulement — un
// établissement ou un service désactivé disparaît de la réponse, le front ne peut donc jamais le
// sélectionner. `effectiveMemberships` (domain/accessGrant.domain.ts) est la SEULE fonction qui
// décide de cet arbre ; la résolution de tenant (tenant.plugin.ts) l'appelle aussi, pour ne
// jamais diverger de ce que `/me` affiche — voir
// src/test/unit/domain/effectiveMemberships-seul-appelant.test.ts.
//
// `grants`/`now` par défaut (`[]` / `new Date()`) : aucun octroi n'existait avant l'étape 4a, et
// un appelant qui ne les fournit pas retrouve exactement le comportement d'avant (seulement les
// appartenances réelles) plutôt que d'échouer.
export const toMeResponse = (
  user: UserWithMemberships,
  grants: LiveGrant[] = [],
  now: Date = new Date(),
): MeResponse => {
  const effectives = effectiveMemberships(user, grants, now)
  const membershipByEstablishment = new Map(
    user.establishmentMemberships.map((m) => [m.establishmentId, m]),
  )
  const grantByEstablishment = new Map(grants.map((g) => [g.establishmentId, g]))

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
        const membership = membershipByEstablishment.get(effective.establishmentId)
        const serviceById = new Map(
          (membership?.serviceMemberships ?? []).map((sm) => [sm.serviceId, sm.service.name]),
        )
        return {
          id: effective.establishmentId,
          name: membership?.establishment.name ?? '',
          role: effective.role,
          soignantId: membership?.soignantId ?? null,
          services: effective.services.map((service) => ({
            id: service.id,
            name: serviceById.get(service.id) ?? '',
            role: service.role,
          })),
        }
      }
      // origine === 'octroi' : les noms viennent du grant correspondant, jamais de
      // `user.establishmentMemberships` (l'utilisateur n'y appartient pas réellement).
      const grant = grantByEstablishment.get(effective.establishmentId)
      const serviceNameById = new Map((grant?.services ?? []).map((s) => [s.id, s.name]))
      return {
        id: effective.establishmentId,
        name: grant?.establishmentName ?? '',
        role: effective.role,
        soignantId: null,
        services: effective.services.map((service) => ({
          id: service.id,
          name: serviceNameById.get(service.id) ?? '',
          role: service.role,
        })),
      }
    }),
  }
}
