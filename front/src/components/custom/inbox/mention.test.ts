import { describe, expect, it } from 'vitest'

import type { ServiceMember } from '@/types/serviceMember.ts'
import type { Soignant } from '@/types/soignant.ts'
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

const s = (id: string, name: string): Soignant => ({ id, name })

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
    expect(
      mentionCandidates(members, [], 'cl', [], []).map(
        (c) => c.kind === 'member' && c.member.user.id,
      ),
    ).toEqual(['u2'])
    expect(mentionCandidates(members, [], 'leroy', ['u2'], [])).toEqual([])
    expect(
      mentionCandidates(members, [], '', [], []).map(
        (c) => c.kind === 'member' && c.member.user.id,
      ),
    ).toEqual(['u1', 'u2'])
  })

  it('@psy propose Psychologue avant les personnes', () => {
    const members = [m('u1', 'Psy', 'Chomel')]
    const soignants = [s('so1', 'Psychologue')]
    const candidates = mentionCandidates(members, soignants, 'psy', [], [])
    expect(candidates).toEqual([
      { kind: 'soignant', soignant: soignants[0] },
      { kind: 'member', member: members[0] },
    ])
  })

  it('un soignant archive (deja filtre amont) ou exclu ne ressort pas', () => {
    const soignants = [s('so1', 'Psychologue'), s('so2', 'Diététicienne')]
    expect(
      mentionCandidates([], soignants, 'psy', [], ['so1']).map(
        (c) => c.kind === 'soignant' && c.soignant.id,
      ),
    ).toEqual([])
  })

  it('limite a 6 candidats au total, metiers puis personnes', () => {
    const soignants = [s('so1', 'A1'), s('so2', 'A2'), s('so3', 'A3')]
    const members = [
      m('u1', 'A4', 'x'),
      m('u2', 'A5', 'x'),
      m('u3', 'A6', 'x'),
      m('u4', 'A7', 'x'),
    ]
    expect(mentionCandidates(members, soignants, 'a', [], [])).toHaveLength(6)
  })
})
