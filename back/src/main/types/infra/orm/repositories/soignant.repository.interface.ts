import type {
  Prisma,
  Soignant,
} from 'generated/prisma/client'

export type SoignantEntityRepo = Soignant
export type SoignantCreateEntityRepo = Omit<
  Prisma.SoignantUncheckedCreateInput,
  'slotTemplates'
>
export type SoignantUpdateEntityRepo = Prisma.SoignantUncheckedUpdateInput

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
