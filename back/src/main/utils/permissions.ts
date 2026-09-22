// Matrice des habilitations. Référence : docs/multi-tenant/habilitations.md.
// Ce fichier est dupliqué à l'identique dans front/src/utils/permissions.ts ;
// un test unitaire back vérifie l'égalité des deux copies.

export type ServiceRole = 'COORDINATEUR' | 'INTERVENANT' | 'SECRETARIAT' | 'LECTURE'
export type EstablishmentRole = 'ADMIN' | 'MEMBER'

export type ServicePermission =
  | 'planning:read'
  | 'planning:write'
  | 'referentials:read'
  | 'referentials:write'
  | 'patient:read'
  | 'patient:write'
  | 'clinical:read'
  | 'clinical:write'
  | 'appointment:write'
  | 'pdf:export'
  | 'todo:own'
  | 'members:read'

export type EstablishmentPermission =
  | 'services:manage'
  | 'locations:manage'
  | 'soignants:manage'
  | 'members:manage'
  | 'activity-log:read'
  | 'access-log:read'

export type Permission = ServicePermission | EstablishmentPermission

const READ_ALL: readonly ServicePermission[] = [
  'planning:read',
  'referentials:read',
  'patient:read',
  'todo:own',
  'members:read',
]

export const SERVICE_PERMISSIONS: Record<ServiceRole, readonly ServicePermission[]> = {
  COORDINATEUR: [
    ...READ_ALL,
    'planning:write',
    'referentials:write',
    'patient:write',
    'clinical:read',
    'clinical:write',
    'appointment:write',
    'pdf:export',
  ],
  INTERVENANT: [
    ...READ_ALL,
    'patient:write',
    'clinical:read',
    'clinical:write',
    'appointment:write',
    'pdf:export',
  ],
  SECRETARIAT: [...READ_ALL, 'patient:write', 'appointment:write', 'pdf:export'],
  LECTURE: [...READ_ALL],
}

export const ESTABLISHMENT_PERMISSIONS: Record<EstablishmentRole, readonly EstablishmentPermission[]> = {
  ADMIN: [
    'services:manage',
    'locations:manage',
    'soignants:manage',
    'members:manage',
    'activity-log:read',
    'access-log:read',
  ],
  MEMBER: [],
}

const SERVICE_PERMISSION_SET: ReadonlySet<string> = new Set(
  Object.values(SERVICE_PERMISSIONS).flat(),
)

export const isServicePermission = (permission: Permission): permission is ServicePermission =>
  SERVICE_PERMISSION_SET.has(permission)

export type RoleSet = {
  serviceRole: ServiceRole | null
  establishmentRole: EstablishmentRole | null
}

export const hasPermission = (roles: RoleSet, permission: Permission): boolean => {
  if (isServicePermission(permission)) {
    return roles.serviceRole !== null && SERVICE_PERMISSIONS[roles.serviceRole].includes(permission)
  }
  return (
    roles.establishmentRole !== null &&
    ESTABLISHMENT_PERMISSIONS[roles.establishmentRole].includes(permission)
  )
}
