import type { LiveGrant } from '../../../domain/accessGrant.domain.interface'

export interface AccessGrantRepositoryInterface {
  // Octrois NON révoqués de cet utilisateur, un par établissement, chacun enrichi du nom de
  // l'établissement et de ses services actifs. Peut inclure des octrois déjà expirés dans le
  // temps : c'est `effectiveMemberships` qui tranche la vivacité, pas cette lecture — voir
  // `types/domain/accessGrant.domain.interface.ts`.
  findForUser: (userId: string) => Promise<LiveGrant[]>
}
