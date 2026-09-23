export type ServiceRole = 'COORDINATEUR' | 'INTERVENANT' | 'SECRETARIAT' | 'LECTURE'
export type EstablishmentRole = 'ADMIN' | 'MEMBER'

export type User = {
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

// Contexte établissement/service courant, dérivé de l'arbre des
// appartenances de l'utilisateur. Voir `deriveContext` dans le store.
export type TenantContext = {
  establishmentId: string
  serviceId: string
  establishmentRole: EstablishmentRole
  serviceRole: ServiceRole
  soignantId: string | null
}

export type AuthState = {
  isAuthenticated: boolean
  user: User | null
}

export type RegisterInput = {
  email: string
  firstName?: string
  lastName?: string
  password: string
}

export type LoginInput = {
  email: string
  password: string
}
