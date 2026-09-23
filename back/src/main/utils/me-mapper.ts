import type { EstablishmentRole, ServiceRole } from '../../generated/enums'
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

// Arbre des appartenances actives. Un établissement ou un service désactivé
// disparaît de la réponse : le front ne peut donc jamais le sélectionner.
export const toMeResponse = (user: UserWithMemberships): MeResponse => ({
  id: user.id,
  email: user.email,
  firstName: user.firstName,
  lastName: user.lastName,
  isSuperAdmin: user.isSuperAdmin,
  establishments: user.establishmentMemberships
    .filter((m) => m.establishment.deactivatedAt === null)
    .map((m) => ({
      id: m.establishmentId,
      name: m.establishment.name,
      role: m.role,
      soignantId: m.soignantId,
      services: m.serviceMemberships
        .filter((sm) => sm.service.deactivatedAt === null)
        .map((sm) => ({
          id: sm.serviceId,
          name: sm.service.name,
          role: sm.role,
        })),
    })),
})
