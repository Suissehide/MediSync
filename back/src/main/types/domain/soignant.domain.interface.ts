import type {
  Prisma,
  Soignant,
} from '../../../generated/client'

export type SoignantEntityDomain = Soignant
// Miroir de SoignantCreateEntityRepo/SoignantUpdateEntityRepo : le repository
// pose establishmentId lui-même, l'appelant ne le fournit pas.
export type SoignantCreateEntityDomain = Omit<
  Prisma.SoignantUncheckedCreateInput,
  'establishmentId' | 'slotTemplateLinks'
>
export type SoignantUpdateEntityDomain = Omit<
  Prisma.SoignantUncheckedUpdateInput,
  'establishmentId'
>

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
