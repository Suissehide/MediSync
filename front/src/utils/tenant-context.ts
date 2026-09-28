import type { TenantContext, User } from '@/types/auth.ts'

// Le dernier contexte visité est retenu par utilisateur : sur un poste
// partagé, le favori de l'un ne doit pas être proposé à l'autre.
export const LAST_CONTEXT_KEY = (userId: string) => `medisync/last-context/${userId}`

type Params = { establishmentId?: string; serviceId?: string }

// Ce module est appelé depuis les gardes de route, donc avant tout rendu :
// un `user` de forme inattendue (état persisté d'une version antérieure,
// stockage corrompu) ne doit jamais faire lever `.find`/`.for…of` sur un
// champ absent ou non-tableau. Une exception ici remplace toute l'application
// par un écran d'erreur — c'est exactement ce qui s'est produit il y a
// quelques heures sur ce dépôt (même garde dans useAuthStore.deriveContext).
const establishmentsOf = (user: User | null): User['establishments'] =>
  user && Array.isArray(user.establishments) ? user.establishments : []

const servicesOf = (establishment: User['establishments'][number]) =>
  Array.isArray(establishment.services) ? establishment.services : []

const establishmentOf = (user: User | null, establishmentId?: string) =>
  establishmentId ? establishmentsOf(user).find((e) => e.id === establishmentId) : undefined

// Un couple accessible : un service de l'arbre des appartenances, avec son
// établissement. Dérivation commune au sélecteur d'échelle (`ScaleSelector`)
// et à la page de choix (`/choose-context`) — les mêmes gardes que le reste
// de ce module (`establishmentsOf`/`servicesOf`) la protègent contre un
// `user` de forme inattendue.
export type AccessibleCouple = {
  establishment: User['establishments'][number]
  service: User['establishments'][number]['services'][number]
}

export const accessibleCouples = (user: User | null): AccessibleCouple[] =>
  establishmentsOf(user).flatMap((establishment) =>
    servicesOf(establishment).map((service) => ({ establishment, service })),
  )

// Un couple de l'URL n'est accepté que s'il figure dans les appartenances.
// Le back refuserait de toute façon par un 404 ; refuser ici évite d'envoyer
// la requête et permet de rediriger vers le choix de contexte.
export const resolveTenantContext = (user: User | null, params: Params): TenantContext | null => {
  const establishment = establishmentOf(user, params.establishmentId)
  if (!establishment || !params.serviceId) {
    return null
  }
  const service = servicesOf(establishment).find((s) => s.id === params.serviceId)
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

// Reconnait la forme d'une route de tenant — celles que batissent
// `tenantApiUrl` (`/e/:establishmentId/s/:serviceId/...`) et
// `establishmentApiUrl` (`/e/:establishmentId/admin/...`) — pour en extraire
// le couple ou l'etablissement vise. `null` si le chemin ne correspond a
// aucune des deux formes ; ne devrait pas arriver depuis `fetchWithAuth`, qui
// filtre deja sur `/e/`, mais autant rester total plutot que de lever.
const tenantRouteParams = (pathname: string): Params | null => {
  const withService = /^\/e\/([^/]+)\/s\/([^/]+)(?:\/|$)/.exec(pathname)
  if (withService) {
    return { establishmentId: withService[1], serviceId: withService[2] }
  }
  const withoutService = /^\/e\/([^/]+)\/admin(?:\/|$)/.exec(pathname)
  if (withoutService) {
    return { establishmentId: withoutService[1] }
  }
  return null
}

// Un 404 sur une route de tenant a deux causes indiscernables cote back (le
// 404 est deliberement neutre, pour ne rien reveler a qui sonde des
// identifiants au hasard) : une ressource absente du service courant (couple
// toujours valide), ou un arbre des appartenances perime (affectation
// retiree pendant la session). On les distingue cote front, en reverifiant
// le couple/etablissement VISE PAR L'URL EN ECHEC (jamais le contexte
// courant du store, qui a pu changer entre l'emission de la requete et la
// resolution du 404) contre l'arbre FRAICHEMENT RECHARGE. S'il y figure
// encore, le 404 etait legitime. S'il en a disparu, l'arbre etait perime.
//
// Reutilise resolveTenantContext/resolveEstablishmentContext — les memes
// fonctions que les gardes de route — plutot que de definir une seconde
// notion de « couple valide » qui pourrait diverger de la premiere.
export const isTenantRouteStale = (user: User | null, pathname: string): boolean => {
  const params = tenantRouteParams(pathname)
  if (!params) {
    return false
  }
  if (params.serviceId) {
    return resolveTenantContext(user, params) === null
  }
  return resolveEstablishmentContext(user, params) === null
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

// Établissements où l'utilisateur est administrateur — validés via
// `resolveEstablishmentContext` (même vérification de rôle, jamais
// redupliquée ici) plutôt qu'un filtre direct sur `establishment.role`.
// Utile à l'index (destination de repli) et à `/choose-context` (liste
// complète) pour qui n'a aucun couple établissement/service accessible :
// depuis les tâches 8 et 12, l'administration d'établissement reste un
// accès réel, à distinguer de l'absence totale d'accès qui seule mérite
// l'écran d'attente.
export const administeredEstablishments = (user: User | null): User['establishments'] =>
  establishmentsOf(user).filter(
    (establishment) => resolveEstablishmentContext(user, { establishmentId: establishment.id }) !== null,
  )

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
  for (const establishment of establishmentsOf(user)) {
    const service = servicesOf(establishment)[0]
    if (service) {
      return resolveTenantContext(user, { establishmentId: establishment.id, serviceId: service.id })
    }
  }
  return null
}

// Navigation par echelle (2026-09-28) : toutes les destinations d'un compte, dans l'ordre ou le
// selecteur d'echelle et `/choose-context` les presentent — pour chaque etablissement, ses
// services puis son administration si le compte l'administre ; la plateforme en dernier, pour
// un super-admin. Une seule derivation pour les deux ecrans : c'est ce qui les empeche de
// diverger (le selecteur ne connaissait jusqu'ici que les couples de service).
export type Destination =
  | { kind: 'service'; establishment: User['establishments'][number]; service: AccessibleCouple['service'] }
  | { kind: 'admin'; establishment: User['establishments'][number] }
  | { kind: 'platform' }

export const accessibleDestinations = (user: User | null): Destination[] => {
  const administered = new Set(administeredEstablishments(user).map((e) => e.id))
  const destinations: Destination[] = establishmentsOf(user).flatMap((establishment) => [
    ...servicesOf(establishment).map((service) => ({ kind: 'service' as const, establishment, service })),
    ...(administered.has(establishment.id) ? [{ kind: 'admin' as const, establishment }] : []),
  ])
  if (user?.isSuperAdmin === true) {
    destinations.push({ kind: 'platform' })
  }
  return destinations
}
