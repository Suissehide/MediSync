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
    // `GET /me` (back/src/main/utils/me-mapper.ts) rend TOUJOURS ce champ —
    // une appartenance réelle ou un accès ouvert par un octroi temporaire
    // (spec §3.5). Optionnel ici plutôt que requis (tour de correction 1,
    // Important n°2) pour ne pas devoir retoucher la douzaine de fixtures
    // de test qui construisent un `User` sans lui : une entrée sans
    // `origine` se traite exactement comme 'reelle' par tout code qui ne
    // teste que `=== 'octroi'`, ce qui est la seule lecture qu'en fait
    // aujourd'hui `$establishmentId.tsx` (voir `activeGrantNotice.tsx`).
    origine?: 'reelle' | 'octroi'
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

// `POST /auth/access-link/consume` (tâche 13, page publique) : le jeton est
// un mot de passe à usage unique. Il arrive dans l'URL du navigateur, mais
// ce type ne doit JAMAIS être sérialisé dans une URL d'appel — il part dans
// le corps de la requête (voir `AuthApi.consumeAccessLink`,
// `access-link.tsx`).
export type ConsumeAccessLinkInput = {
  token: string
  password: string
}
