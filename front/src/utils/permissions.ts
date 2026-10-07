// Matrice des habilitations. Référence : docs/multi-tenant/habilitations.md.
// Ce fichier est dupliqué à l'identique dans front/src/utils/permissions.ts ;
// un test unitaire back vérifie l'égalité des deux copies.

export type ServiceRole =
  | 'COORDINATEUR'
  | 'INTERVENANT'
  | 'SECRETARIAT'
  | 'LECTURE'
export type EstablishmentRole = 'ADMIN' | 'MEMBER'

export type ServicePermission =
  | 'planning:read'
  | 'planning:write'
  | 'referentials:read'
  | 'referentials:write'
  | 'patient:read'
  | 'patient:write'
  | 'patient:delete'
  | 'clinical:read'
  | 'clinical:write'
  | 'appointment:write'
  | 'pdf:export'
  | 'todo:own'
  | 'members:read'
  // Gerer l'equipe du SEUL service courant : inviter, changer le role de service, retirer.
  // Distincte de `members:manage` (etablissement), qui porte les comptes et les
  // rattachements : un coordinateur n'en a aucun.
  | 'service-members:manage'
  // Lire le journal des consultations (`PatientAccessLog`), a l'echelle du
  // SEUL service courant. `access-log:read` (EstablishmentPermission ci-dessous, deja present
  // pour ADMIN depuis la toute premiere version de ce fichier, bd26a72) ne convient pas pour
  // cette route DE SERVICE : `hasPermission` (plus bas) choisit sa branche — service ou
  // etablissement — sur la seule APPARTENANCE de la chaine a l'un des deux ensembles, avant
  // meme de regarder les roles de l'appelant. Une chaine presente dans les DEUX ensembles
  // prendrait toujours la branche service, y compris pour un appelant d'administration
  // d'etablissement dont `serviceRole` est `null` — la route d'administration echouerait donc
  // TOUJOURS, quel que soit son `establishmentRole`. Verifie par execution en ecrivant d'abord
  // ce test faux.
  //
  // `accessLog:read` (premier jet) etait un homographe presque
  // parfait d'`access-log:read`, dans une matrice DUPLIQUEE entre deux depots (back et front) :
  // un piege de lecture permanent. Le court-circuit ci-dessus
  // explique pourquoi deux permissions DISTINCTES sont necessaires ; il n'explique pas pourquoi
  // choisir un nom qui ne se distingue de l'autre que par la casse et un trait d'union. Renomme
  // en `consultations:read` : aucune parente visuelle avec `access-log:read`, et un mot qui n'est
  // pas deja pris par une autre permission de ce fichier.
  //
  // CE QUE CE COMMENTAIRE NE DIT PAS ET NE DOIT PAS DIRE : que deux permissions seraient
  // « impossibles » a unifier. Une semantique « ou » (accordee des que l'UNE des deux branches
  // accorde) aurait rendu une seule permission viable en huit lignes — essaye et REJETE, parce
  // qu'elle brouillerait alors deux echelles d'habilitation distinctes : un ADMIN d'etablissement
  // membre d'un service en LECTURE obtiendrait `consultations:read` sur la route DE SERVICE par
  // sa seule appartenance de service, une confusion durable que cette tache ne doit pas
  // introduire dans une fonction dont depend chaque route du depot.
  | 'consultations:read'
  // Journal d'activite du SEUL service courant (chef de service). Nom distinct d'`activity-log:read`
  // pour la meme raison que `consultations:read`.
  | 'service-journal:read'
  // Indicateurs de l'enquete annuelle ARS du service courant, en chiffres agreges et sans donnee
  // nominative (MDS-26). Non accordee a LECTURE : la direction lit `activity:read`.
  | 'stats:read'
  // Tableau de bord d'activite du service courant, en chiffres agreges (MDS-40). Accordee a
  // LECTURE : c'est l'ecran de la direction.
  | 'activity:read'

export type EstablishmentPermission =
  | 'services:manage'
  | 'members:manage'
  | 'activity-log:read'
  | 'activity-log:write'
  | 'access-log:read'
  | 'establishment:rename'

// Portée par le drapeau `User.isSuperAdmin`, jamais par un rôle d'établissement ou de service
// (habilitations.md, table « Permissions d'établissement et de plateforme » — colonne
// Super-admin, seule cochée pour `establishments:manage`). Aucune route ne la vérifie par
// `hasPermission` : `requireSuperAdmin` (super-admin.routes.ts) tranche seul, sur le drapeau.
export type SuperAdminPermission = 'establishments:manage'

export type Permission =
  | ServicePermission
  | EstablishmentPermission
  | SuperAdminPermission

const READ_ALL: readonly ServicePermission[] = [
  'planning:read',
  'referentials:read',
  'patient:read',
  'todo:own',
  'members:read',
]

export const SERVICE_PERMISSIONS: Record<
  ServiceRole,
  readonly ServicePermission[]
> = {
  COORDINATEUR: [
    ...READ_ALL,
    'planning:write',
    'referentials:write',
    'patient:write',
    'patient:delete',
    'clinical:read',
    'clinical:write',
    'appointment:write',
    'pdf:export',
    'consultations:read',
    'service-members:manage',
    'service-journal:read',
    'stats:read',
    'activity:read',
  ],
  INTERVENANT: [
    ...READ_ALL,
    'patient:write',
    'clinical:read',
    'clinical:write',
    'appointment:write',
    'pdf:export',
  ],
  SECRETARIAT: [
    ...READ_ALL,
    'patient:write',
    'appointment:write',
    'pdf:export',
  ],
  LECTURE: [...READ_ALL, 'activity:read'],
}

export const ESTABLISHMENT_PERMISSIONS: Record<
  EstablishmentRole,
  readonly EstablishmentPermission[]
> = {
  ADMIN: [
    'services:manage',
    'members:manage',
    'activity-log:read',
    'activity-log:write',
    'access-log:read',
    'establishment:rename',
  ],
  MEMBER: [],
}

const SERVICE_PERMISSION_SET: ReadonlySet<string> = new Set(
  Object.values(SERVICE_PERMISSIONS).flat(),
)

export const isServicePermission = (
  permission: Permission,
): permission is ServicePermission => SERVICE_PERMISSION_SET.has(permission)

const ESTABLISHMENT_PERMISSION_SET: ReadonlySet<string> = new Set(
  Object.values(ESTABLISHMENT_PERMISSIONS).flat(),
)

export const isEstablishmentPermission = (
  permission: Permission,
): permission is EstablishmentPermission =>
  ESTABLISHMENT_PERMISSION_SET.has(permission)

export type RoleSet = {
  serviceRole: ServiceRole | null
  establishmentRole: EstablishmentRole | null
}

export const hasPermission = (
  roles: RoleSet,
  permission: Permission,
): boolean => {
  if (isServicePermission(permission)) {
    return (
      roles.serviceRole !== null &&
      SERVICE_PERMISSIONS[roles.serviceRole].includes(permission)
    )
  }
  if (isEstablishmentPermission(permission)) {
    return (
      roles.establishmentRole !== null &&
      ESTABLISHMENT_PERMISSIONS[roles.establishmentRole].includes(permission)
    )
  }
  // Une SuperAdminPermission (`establishments:manage`) : aucun rôle d'établissement ou de
  // service ne l'accorde jamais — voir le commentaire au-dessus de son type.
  return false
}
