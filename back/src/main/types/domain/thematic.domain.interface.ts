import type { Soignant, Thematic } from '../../../generated/client'

export type ThematicEntityDomain = Thematic
export type ThematicWithSoignantsEntityDomain = Thematic & {
  soignants: Soignant[]
}
export type ThematicCreateEntityDomain = {
  name: string
  soignantIDs: string[]
}
export type ThematicUpdateEntityDomain = {
  name?: string
  soignantIDs?: string[]
}

export interface ThematicDomainInterface {
  findAll: () => Promise<ThematicWithSoignantsEntityDomain[]>
  findByID: (thematicID: string) => Promise<ThematicWithSoignantsEntityDomain>
  create: (
    thematicCreateParams: ThematicCreateEntityDomain,
  ) => Promise<ThematicWithSoignantsEntityDomain>
  update: (
    thematicID: string,
    thematicUpdateParams: ThematicUpdateEntityDomain,
  ) => Promise<ThematicWithSoignantsEntityDomain>
  delete: (thematicID: string) => Promise<ThematicEntityDomain>
}
