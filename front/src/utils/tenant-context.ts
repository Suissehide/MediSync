import type { TenantContext, User } from '@/types/auth.ts'

// Le dernier contexte visité est retenu par utilisateur : sur un poste
// partagé, le favori de l'un ne doit pas être proposé à l'autre.
export const LAST_CONTEXT_KEY = (userId: string) => `medisync/last-context/${userId}`

type Params = { establishmentId?: string; serviceId?: string }

const establishmentOf = (user: User | null, establishmentId?: string) =>
  !user || !establishmentId
    ? undefined
    : user.establishments.find((e) => e.id === establishmentId)

// Un couple de l'URL n'est accepté que s'il figure dans les appartenances.
// Le back refuserait de toute façon par un 404 ; refuser ici évite d'envoyer
// la requête et permet de rediriger vers le choix de contexte.
export const resolveTenantContext = (user: User | null, params: Params): TenantContext | null => {
  const establishment = establishmentOf(user, params.establishmentId)
  if (!establishment || !params.serviceId) {
    return null
  }
  const service = establishment.services.find((s) => s.id === params.serviceId)
  if (!service) {
    return null
  }
  return {
    establishmentId: establishment.id,
    serviceId: service.id,
    establishmentRole: establishment.role,
    serviceRole: service.role,
    soignantId: establishment.soignantId,
  }
}

// Contexte des écrans d'administration : un établissement, aucun service, et
// le rôle ADMIN exigé — un simple membre n'a rien à y faire.
export const resolveEstablishmentContext = (
  user: User | null,
  params: Pick<Params, 'establishmentId'>,
): TenantContext | null => {
  const establishment = establishmentOf(user, params.establishmentId)
  if (!establishment || establishment.role !== 'ADMIN') {
    return null
  }
  return {
    establishmentId: establishment.id,
    serviceId: null,
    establishmentRole: establishment.role,
    serviceRole: null,
    soignantId: establishment.soignantId,
  }
}

const readLastContext = (userId: string): Params | null => {
  try {
    const raw = localStorage.getItem(LAST_CONTEXT_KEY(userId))
    return raw ? (JSON.parse(raw) as Params) : null
  } catch {
    // Stockage indisponible ou contenu illisible : on retombe sur le premier
    // couple, jamais sur une exception.
    return null
  }
}

export const rememberContext = (userId: string, context: TenantContext): void => {
  if (context.serviceId === null) {
    return
  }
  try {
    localStorage.setItem(
      LAST_CONTEXT_KEY(userId),
      JSON.stringify({ establishmentId: context.establishmentId, serviceId: context.serviceId }),
    )
  } catch {
    // Rien à faire : le confort de retrouver son service ne vaut pas une
    // exception au chargement.
  }
}

export const forgetContext = (userId: string): void => {
  try {
    localStorage.removeItem(LAST_CONTEXT_KEY(userId))
  } catch {
    // idem
  }
}

// Dans l'ordre : le dernier visité s'il est toujours valide, sinon le premier
// couple de l'arbre, sinon rien — et la personne tombe sur /pending.
export const defaultTenantContext = (user: User | null): TenantContext | null => {
  if (!user) {
    return null
  }
  const last = readLastContext(user.id)
  if (last) {
    const remembered = resolveTenantContext(user, last)
    if (remembered) {
      return remembered
    }
  }
  for (const establishment of user.establishments) {
    const service = establishment.services[0]
    if (service) {
      return resolveTenantContext(user, { establishmentId: establishment.id, serviceId: service.id })
    }
  }
  return null
}
