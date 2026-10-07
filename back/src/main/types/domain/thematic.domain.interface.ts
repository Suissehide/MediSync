import type { Soignant, Thematic } from '../../../generated/client'

export type ThematicWithSoignantsEntityDomain = Thematic & {
  soignants: Soignant[]
}
export type ThematicCreateEntityDomain = {
  name: string
  duration?: number | null
  pdfNotice?: string | null
  soignantIDs: string[]
}
export type ThematicUpdateEntityDomain = {
  name?: string
  duration?: number | null
  pdfNotice?: string | null
  soignantIDs?: string[]
  // `true` archive, `false` restaure.
  archived?: boolean
}

export interface ThematicDomainInterface {
  findAll: (archived?: boolean) => Promise<ThematicWithSoignantsEntityDomain[]>
  findByID: (thematicID: string) => Promise<ThematicWithSoignantsEntityDomain>
  create: (
    thematicCreateParams: ThematicCreateEntityDomain,
  ) => Promise<ThematicWithSoignantsEntityDomain>
  update: (
    thematicID: string,
    thematicUpdateParams: ThematicUpdateEntityDomain,
  ) => Promise<ThematicWithSoignantsEntityDomain>
}
