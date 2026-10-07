import type { Prisma, Soignant } from '../../../generated/client'

export type SoignantEntityDomain = Soignant
// Miroir de SoignantCreateEntityRepo/SoignantUpdateEntityRepo : le repository
// pose establishmentId et serviceId lui-même, l'appelant ne les fournit pas.
export type SoignantCreateEntityDomain = Omit<
  Prisma.SoignantUncheckedCreateInput,
  'establishmentId' | 'serviceId' | 'slotTemplateLinks'
>
export type SoignantUpdateEntityDomain = Omit<
  Prisma.SoignantUncheckedUpdateInput,
  'establishmentId' | 'serviceId' | 'archivedAt'
  // `archivedAt` est remplace par `archived` : une seule facon d'archiver.
> & { archived?: boolean }

export interface SoignantDomainInterface {
  findAll: (archived?: boolean) => Promise<SoignantEntityDomain[]>
  findByID: (soignantID: string) => Promise<SoignantEntityDomain>
  create: (
    soignantCreateParams: SoignantCreateEntityDomain,
  ) => Promise<SoignantEntityDomain>
  update: (
    soignantID: string,
    soignantUpdateParams: SoignantUpdateEntityDomain,
  ) => Promise<SoignantEntityDomain>
}
