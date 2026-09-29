import type {
  Prisma,
  Soignant,
} from '../../../generated/client'

export type SoignantEntityDomain = Soignant
// Miroir de SoignantCreateEntityRepo/SoignantUpdateEntityRepo : le repository
// pose establishmentId et serviceId lui-même, l'appelant ne les fournit pas.
export type SoignantCreateEntityDomain = Omit<
  Prisma.SoignantUncheckedCreateInput,
  'establishmentId' | 'serviceId' | 'slotTemplateLinks'
>
export type SoignantUpdateEntityDomain = Omit<
  Prisma.SoignantUncheckedUpdateInput,
  'establishmentId' | 'serviceId'
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
