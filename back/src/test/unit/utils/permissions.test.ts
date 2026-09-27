import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { EstablishmentRole, ServiceRole } from '../../../generated/enums'
import {
  ESTABLISHMENT_PERMISSIONS,
  hasPermission,
  SERVICE_PERMISSIONS,
} from '../../../main/utils/permissions'

describe('permissions', () => {
  it('donne toutes les permissions de service au coordinateur', () => {
    expect(SERVICE_PERMISSIONS.COORDINATEUR).toEqual(
      expect.arrayContaining([
        'planning:read', 'planning:write', 'referentials:read', 'referentials:write',
        'patient:read', 'patient:write', 'clinical:read', 'clinical:write',
        'appointment:write', 'pdf:export', 'todo:own', 'members:read',
      ]),
    )
  })

  it('refuse le contenu clinique au secretariat et a la lecture', () => {
    expect(SERVICE_PERMISSIONS.SECRETARIAT).not.toContain('clinical:read')
    expect(SERVICE_PERMISSIONS.LECTURE).not.toContain('clinical:read')
    expect(SERVICE_PERMISSIONS.LECTURE).not.toContain('patient:write')
  })

  it('accorde les lectures a tous les roles', () => {
    for (const role of ['COORDINATEUR', 'INTERVENANT', 'SECRETARIAT', 'LECTURE'] as const) {
      expect(SERVICE_PERMISSIONS[role]).toContain('planning:read')
      expect(SERVICE_PERMISSIONS[role]).toContain('referentials:read')
      expect(SERVICE_PERMISSIONS[role]).toContain('patient:read')
      expect(SERVICE_PERMISSIONS[role]).toContain('todo:own')
      expect(SERVICE_PERMISSIONS[role]).toContain('members:read')
    }
  })

  it('reserve la gestion des membres a l administrateur d etablissement', () => {
    expect(ESTABLISHMENT_PERMISSIONS.ADMIN).toContain('members:manage')
    expect(ESTABLISHMENT_PERMISSIONS.MEMBER).toHaveLength(0)
  })

  it('hasPermission route vers le bon niveau', () => {
    const roles = { serviceRole: 'SECRETARIAT', establishmentRole: 'ADMIN' } as const
    expect(hasPermission(roles, 'appointment:write')).toBe(true)
    expect(hasPermission(roles, 'clinical:write')).toBe(false)
    expect(hasPermission(roles, 'members:manage')).toBe(true)
    expect(hasPermission({ serviceRole: null, establishmentRole: 'MEMBER' }, 'patient:read')).toBe(false)
    // Le journal d'activite est monte sous le prefixe de service mais porte
    // une permission d'etablissement : c'est establishmentRole qui tranche,
    // jamais le role de service.
    expect(hasPermission(roles, 'activity-log:read')).toBe(true)
    expect(hasPermission({ serviceRole: 'COORDINATEUR', establishmentRole: 'MEMBER' }, 'activity-log:read')).toBe(false)
  })

  // Etape 4b, tache 5 : deux permissions distinctes portent le journal des consultations,
  // `accessLog:read` (service, COORDINATEUR) et `access-log:read` (etablissement, ADMIN) — noms
  // volontairement differents, voir le commentaire au-dessus de `accessLog:read`
  // (utils/permissions.ts). Ce test tient la propriete qui justifie cette distinction : un
  // administrateur d'etablissement sans service courant (le cas reel de la route
  // d'administration, `serviceId: null`) doit obtenir `access-log:read`, jamais `accessLog:read`
  // — et reciproquement, un coordinateur de service ne doit jamais obtenir `access-log:read`
  // par sa seule appartenance de service.
  it('distingue accessLog:read (service) de access-log:read (etablissement)', () => {
    expect(
      hasPermission({ serviceRole: null, establishmentRole: 'ADMIN' }, 'access-log:read'),
    ).toBe(true)
    expect(
      hasPermission({ serviceRole: null, establishmentRole: 'ADMIN' }, 'accessLog:read'),
    ).toBe(false)
    expect(
      hasPermission({ serviceRole: 'COORDINATEUR', establishmentRole: 'MEMBER' }, 'accessLog:read'),
    ).toBe(true)
    expect(
      hasPermission({ serviceRole: 'COORDINATEUR', establishmentRole: 'MEMBER' }, 'access-log:read'),
    ).toBe(false)
  })

  // `establishments:manage` (etape 4a, tache 6) n'est accordee par AUCUN role d'etablissement ni
  // de service (habilitations.md : seule la colonne Super-admin est cochee) : c'est
  // `requireSuperAdmin` (drapeau `isSuperAdmin`), pas cette matrice, qui protege
  // `POST /super-admin/establishments`. Verifie meme avec le role le plus permissif (ADMIN).
  it('n accorde jamais establishments:manage par un role d etablissement ou de service', () => {
    expect(hasPermission({ serviceRole: null, establishmentRole: 'ADMIN' }, 'establishments:manage')).toBe(false)
    expect(hasPermission({ serviceRole: 'COORDINATEUR', establishmentRole: 'ADMIN' }, 'establishments:manage')).toBe(false)
  })

  // Les roles sont declares a trois endroits : les enums Prisma, cette
  // matrice, et le schema HTTP des membres. Ce test empeche la matrice de
  // diverger du schema en silence — un role ajoute cote Prisma et oublie ici
  // n'aurait aucune permission sans que rien ne le signale.
  it('couvre exactement les roles des enums Prisma', () => {
    expect(Object.keys(SERVICE_PERMISSIONS).sort()).toEqual(
      Object.values(ServiceRole).sort(),
    )
    expect(Object.keys(ESTABLISHMENT_PERMISSIONS).sort()).toEqual(
      Object.values(EstablishmentRole).sort(),
    )
  })

  it('est identique a la copie du front', () => {
    const back = readFileSync(join(__dirname, '../../../main/utils/permissions.ts'), 'utf8')
    const front = readFileSync(join(__dirname, '../../../../../front/src/utils/permissions.ts'), 'utf8')
    expect(front).toBe(back)
  })
})
