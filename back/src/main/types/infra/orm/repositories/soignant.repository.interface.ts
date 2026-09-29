import type { Prisma, Soignant } from '../../../../../generated/client'

export type SoignantEntityRepo = Soignant
// Le repository pose establishmentId lui-même : l'appelant ne le fournit pas.
export type SoignantCreateEntityRepo = Omit<
  Prisma.SoignantUncheckedCreateInput,
  'establishmentId' | 'serviceId' | 'slotTemplateLinks'
>
export type SoignantUpdateEntityRepo = Omit<
  Prisma.SoignantUncheckedUpdateInput,
  'establishmentId' | 'serviceId'
>

export interface SoignantRepositoryInterface {
  findAll: () => Promise<SoignantEntityRepo[]>
  findByID: (soignantID: string) => Promise<SoignantEntityRepo>
  create: (
    soignantCreateParams: SoignantCreateEntityRepo,
  ) => Promise<SoignantEntityRepo>
  update: (
    soignantID: string,
    soignantUpdateParams: SoignantUpdateEntityRepo,
  ) => Promise<SoignantEntityRepo>
  delete: (soignantID: string) => Promise<SoignantEntityRepo>
}
