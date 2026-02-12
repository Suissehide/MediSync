import type {
  Prisma,
  Soignant,
} from '../../../generated/client'

export type SoignantEntityDomain = Soignant
export type SoignantCreateEntityDomain = Omit<
  Prisma.SoignantUncheckedCreateInput,
  'slotTemplates'
>
export type SoignantUpdateEntityDomain = Prisma.SoignantUncheckedUpdateInput

export interface SoignantDomainInterface {
  findAll: () => Promise<SoignantEntityDomain[]>
  findByID: (soignantID: string) => Promise<SoignantEntityDomain>
  create: (
    soignantCreateParams: SoignantCreateEntityDomain,
  ) => Promise<SoignantEntityDomain>
  update: (
    soignantID: string,
    soignantUpdateParams: SoignantUpdateEntityDomain,
  ) => Promise<SoignantEntityDomain>
  delete: (soignantID: string) => Promise<SoignantEntityDomain>
}
