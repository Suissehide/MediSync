import type { ServiceMember } from '@/types/serviceMember.ts'
import type { Soignant } from '@/types/soignant.ts'

const MENTION = /@([^\s@]*)$/

export const mentionQuery = (draft: string): string | null =>
  draft.match(MENTION)?.[1] ?? null

export const stripMention = (draft: string): string =>
  `${draft.replace(MENTION, '').replace(/\s+$/, '')} `

const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()

// Un candidat de mention est soit un metier (Soignant, non archive), soit une personne
// (ServiceMember) : la liste unique en melange les deux, le metier d'abord.
export type MentionCandidate =
  | { kind: 'soignant'; soignant: Soignant }
  | { kind: 'member'; member: ServiceMember }

const MAX_CANDIDATES = 6

export const mentionCandidates = (
  members: ServiceMember[],
  soignants: Soignant[],
  query: string,
  excludeUserIds: string[],
  excludeSoignantIds: string[],
): MentionCandidate[] => {
  const soignantMatches: MentionCandidate[] = soignants
    .filter((s) => !excludeSoignantIds.includes(s.id))
    .filter((s) => fold(s.name).includes(fold(query)))
    .map((soignant) => ({ kind: 'soignant', soignant }))
  const memberMatches: MentionCandidate[] = members
    .filter(
      (x) =>
        x.role !== 'LECTURE' &&
        x.user.deactivatedAt === null &&
        !excludeUserIds.includes(x.user.id),
    )
    .filter((x) =>
      fold(`${x.user.firstName ?? ''} ${x.user.lastName ?? ''}`).includes(
        fold(query),
      ),
    )
    .map((member) => ({ kind: 'member', member }))
  return [...soignantMatches, ...memberMatches].slice(0, MAX_CANDIDATES)
}
