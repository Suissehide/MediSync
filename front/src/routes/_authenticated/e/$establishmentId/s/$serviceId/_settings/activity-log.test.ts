import { describe, expect, it } from 'vitest'

import { activityLogColumns } from '@/columns/activityLog.column.tsx'
import type { User } from '@/types/auth.ts'
import { Route } from './activity-log.tsx'

const membre = (role: 'COORDINATEUR' | 'INTERVENANT'): User => ({
  id: 'u1',
  email: 'a@b.fr',
  firstName: null,
  lastName: null,
  isSuperAdmin: false,
  establishments: [
    {
      id: 'e1',
      name: 'CHU',
      role: 'MEMBER',
      services: [{ id: 's1', name: 'Cardio', role }],
    },
  ],
})

const lancer = (user: User) =>
  (Route.options.beforeLoad as (a: unknown) => unknown)({
    context: { authState: { isAuthenticated: true, user } },
    params: { establishmentId: 'e1', serviceId: 's1' },
  })

describe('journal d activite du chef de service', () => {
  it('s ouvre au coordinateur', () => {
    expect(() => lancer(membre('COORDINATEUR'))).not.toThrow()
  })

  it('renvoie un intervenant au tableau de bord', () => {
    expect(() => lancer(membre('INTERVENANT'))).toThrow(
      expect.objectContaining({
        isRedirect: true,
        to: '/e/$establishmentId/s/$serviceId/dashboard',
      }),
    )
  })

  it('nomme les actions de l administration, member.* compris', () => {
    const colonne = activityLogColumns.find(
      (c) => 'accessorKey' in c && c.accessorKey === 'action',
    )
    const cell = colonne?.cell as (info: { getValue: () => string }) => string
    expect(cell({ getValue: () => 'member.accountCreated' })).toBe(
      'Compte de membre créé',
    )
  })
})
