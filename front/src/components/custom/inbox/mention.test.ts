import { describe, expect, it } from 'vitest'

import type { ServiceMember } from '@/types/serviceMember.ts'
import { mentionCandidates, mentionQuery, stripMention } from './mention.ts'

const m = (
  id: string,
  firstName: string,
  lastName: string,
  role: ServiceMember['role'] = 'INTERVENANT',
  deactivatedAt: string | null = null,
) =>
  ({
    id,
    role,
    user: { id, firstName, lastName, email: `${id}@t.fr`, deactivatedAt },
  }) as ServiceMember

describe('mention', () => {
  it('lit la mention en cours', () => {
    expect(mentionQuery('Vérifier les ordonnances @cl')).toBe('cl')
    expect(mentionQuery('Vérifier @')).toBe('')
    expect(mentionQuery('Vérifier @claire ')).toBeNull()
    expect(mentionQuery('mail a@b')).toBe('b')
    expect(mentionQuery('rien')).toBeNull()
  })

  it('retire la mention du texte', () => {
    expect(stripMention('Vérifier les ordonnances @cl')).toBe(
      'Vérifier les ordonnances ',
    )
  })

  it('propose les membres actifs hors LECTURE, filtres sur le nom', () => {
    const members = [
      m('u1', 'Léo', 'Couffinhal'),
      m('u2', 'Claire', 'Leroy'),
      m('u3', 'Clément', 'Roux', 'LECTURE'),
      m('u4', 'Clara', 'Petit', 'INTERVENANT', '2026-01-01'),
    ]
    expect(mentionCandidates(members, 'cl', []).map((x) => x.user.id)).toEqual([
      'u2',
    ])
    expect(mentionCandidates(members, 'leroy', ['u2'])).toEqual([])
    expect(mentionCandidates(members, '', []).map((x) => x.user.id)).toEqual([
      'u1',
      'u2',
    ])
  })
})
