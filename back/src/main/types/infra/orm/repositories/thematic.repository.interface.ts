import type { Soignant, Thematic } from '../../../../../generated/client'

export type ThematicEntityRepo = Thematic
export type ThematicWithSoignantsEntityRepo = Thematic & {
  soignants: Soignant[]
}
export type ThematicCreateEntityRepo = {
  name: string
  soignantIDs: string[]
}
export type ThematicUpdateEntityRepo = {
  name?: string
  soignantIDs?: string[]
}

export interface ThematicRepositoryInterface {
  findAll: () => Promise<ThematicWithSoignantsEntityRepo[]>
  findByID: (thematicID: string) => Promise<ThematicWithSoignantsEntityRepo>
  create: (
    thematicCreateParams: ThematicCreateEntityRepo,
  ) => Promise<ThematicWithSoignantsEntityRepo>
  update: (
    thematicID: string,
    thematicUpdateParams: ThematicUpdateEntityRepo,
  ) => Promise<ThematicWithSoignantsEntityRepo>
  delete: (thematicID: string) => Promise<ThematicEntityRepo>
}
