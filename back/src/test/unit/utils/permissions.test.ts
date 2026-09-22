import { readFileSync } from 'node:fs'
import { join } from 'node:path'

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
  })

  it('est identique a la copie du front', () => {
    const back = readFileSync(join(__dirname, '../../../main/utils/permissions.ts'), 'utf8')
    const front = readFileSync(join(__dirname, '../../../../../front/src/utils/permissions.ts'), 'utf8')
    expect(front).toBe(back)
  })
})
