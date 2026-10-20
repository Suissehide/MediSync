import { describe, expect, it } from 'vitest'

import type { ServiceMember } from '@/types/serviceMember.ts'
import { dayGroup, memberName, whenLabel } from './inbox.utils.ts'

const now = new Date('2026-10-19T12:00:00')

describe('inbox.utils', () => {
  it('dit quand', () => {
    expect(whenLabel('2026-10-19T11:59:40', now)).toBe("à l'instant")
    expect(whenLabel('2026-10-19T11:55:00', now)).toBe('il y a 5 min')
    expect(whenLabel('2026-10-19T09:00:00', now)).toBe('il y a 3 h')
    expect(whenLabel('2026-10-18T17:10:00', now)).toBe('Hier 17:10')
    expect(whenLabel('2026-10-12T09:00:00', now)).toBe('lun. 12/10')
  })

  it('range par jour', () => {
    expect(dayGroup('2026-10-19T08:00:00', now)).toBe("Aujourd'hui")
    expect(dayGroup('2026-10-18T08:00:00', now)).toBe('Hier')
    expect(dayGroup('2026-10-14T08:00:00', now)).toBe('Cette semaine')
    expect(dayGroup('2026-10-01T08:00:00', now)).toBe('Plus ancien')
  })

  it('nomme un membre', () => {
    const m = {
      user: {
        id: 'u2',
        firstName: 'Claire',
        lastName: 'Leroy',
        email: 'c@t.fr',
      },
    } as ServiceMember
    expect(memberName([m], 'u2')).toBe('Claire Leroy')
    expect(memberName([m], 'u9')).toBe('Un ancien membre')
    expect(memberName([m], null)).toBe('Un ancien membre')
  })
})
