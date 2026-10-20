import type { ServiceMember } from '@/types/serviceMember.ts'

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

export const mentionCandidates = (
  members: ServiceMember[],
  query: string,
  exclude: string[],
): ServiceMember[] =>
  members
    .filter(
      (x) =>
        x.role !== 'LECTURE' &&
        x.user.deactivatedAt === null &&
        !exclude.includes(x.user.id),
    )
    .filter((x) =>
      fold(`${x.user.firstName ?? ''} ${x.user.lastName ?? ''}`).includes(
        fold(query),
      ),
    )
    .slice(0, 5)
