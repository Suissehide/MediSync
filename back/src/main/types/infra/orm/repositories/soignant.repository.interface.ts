import type { Prisma, Soignant } from '../../../../../generated/client'

export type SoignantEntityRepo = Soignant
// Le repository pose establishmentId lui-même : l'appelant ne le fournit pas.
export type SoignantCreateEntityRepo = Omit<
  Prisma.SoignantUncheckedCreateInput,
  'establishmentId' | 'serviceId' | 'slotTemplateLinks'
>
export type SoignantUpdateEntityRepo = Omit<
  Prisma.SoignantUncheckedUpdateInput,
  'establishmentId' | 'serviceId' | 'archivedAt'
  // `archivedAt` est remplace par `archived` : une seule facon d'archiver.
> & { archived?: boolean }

export interface SoignantRepositoryInterface {
  findAll: (archived?: boolean) => Promise<SoignantEntityRepo[]>
  findByID: (soignantID: string) => Promise<SoignantEntityRepo>
  create: (
    soignantCreateParams: SoignantCreateEntityRepo,
  ) => Promise<SoignantEntityRepo>
  update: (
    soignantID: string,
    soignantUpdateParams: SoignantUpdateEntityRepo,
  ) => Promise<SoignantEntityRepo>
  // Suppression definitive : refusee si la ligne n'est pas archivee,
  // ou si quoi que ce soit la reference encore.
  deleteForever: (soignantID: string) => Promise<void>
}
