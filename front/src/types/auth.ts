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

// Contexte établissement/service courant, lu dans l'URL par le layout
// correspondant. `serviceId` et `serviceRole` sont nuls sur les écrans
// d'administration d'établissement, qui vivent sous une URL sans service.
export type TenantContext = {
  establishmentId: string
  serviceId: string | null
  establishmentRole: EstablishmentRole
  serviceRole: ServiceRole | null
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
