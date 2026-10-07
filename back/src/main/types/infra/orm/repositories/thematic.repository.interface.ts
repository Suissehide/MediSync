import type { Soignant, Thematic } from '../../../../../generated/client'

export type ThematicEntityRepo = Thematic
export type ThematicWithSoignantsEntityRepo = Thematic & {
  soignants: Soignant[]
}
export type ThematicCreateEntityRepo = {
  name: string
  duration?: number | null
  pdfNotice?: string | null
  soignantIDs: string[]
}
export type ThematicUpdateEntityRepo = {
  name?: string
  duration?: number | null
  pdfNotice?: string | null
  soignantIDs?: string[]
  // `true` archive, `false` restaure.
  archived?: boolean
}

export interface ThematicRepositoryInterface {
  findAll: (archived?: boolean) => Promise<ThematicWithSoignantsEntityRepo[]>
  findByID: (thematicID: string) => Promise<ThematicWithSoignantsEntityRepo>
  create: (
    thematicCreateParams: ThematicCreateEntityRepo,
  ) => Promise<ThematicWithSoignantsEntityRepo>
  update: (
    thematicID: string,
    thematicUpdateParams: ThematicUpdateEntityRepo,
  ) => Promise<ThematicWithSoignantsEntityRepo>
  // Suppression definitive : refusee si la ligne n'est pas archivee,
  // ou si quoi que ce soit la reference encore.
  deleteForever: (thematicID: string) => Promise<void>
}
