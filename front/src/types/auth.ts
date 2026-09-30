export type ServiceRole =
  | 'COORDINATEUR'
  | 'INTERVENANT'
  | 'SECRETARIAT'
  | 'LECTURE'
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
    // Le soignant (métier du service) que le compte incarne DANS CE SERVICE — porté par
    // l'affectation de service depuis le 2026-09-29, les soignants étant propres à chaque
    // service. Optionnel, même raison que `origine` ci-dessous : les fixtures qui ne s'en
    // servent pas n'ont pas à le déclarer, et une absence se lit comme « aucun ».
    services: {
      id: string
      name: string
      role: ServiceRole
      soignantId?: string | null
    }[]
    // `GET /me` (back/src/main/utils/me-mapper.ts) rend TOUJOURS ce champ —
    // une appartenance réelle ou un accès ouvert par un octroi temporaire
    // (spec §3.5). Optionnel ici plutôt que requis pour ne pas devoir
    // retoucher la douzaine de fixtures de test qui construisent un `User` sans lui : une entrée sans
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

// `POST /auth/access-link/consume` (page publique) : le jeton est
// un mot de passe à usage unique. Il arrive dans l'URL du navigateur, mais
// ce type ne doit JAMAIS être sérialisé dans une URL d'appel — il part dans
// le corps de la requête (voir `AuthApi.consumeAccessLink`,
// `access-link.tsx`).
export type ConsumeAccessLinkInput = {
  token: string
  password: string
}
