import type { PathwayTemplate, Prisma } from '../../../../../generated/client'
import type { SlotTemplateWithSoignantsRepo } from './slotTemplate.repository.interface'

export type PathwayTemplateEntityRepo = PathwayTemplate
export type PathwayTemplateWithSlotTemplatesRepo = PathwayTemplateEntityRepo & {
  slotTemplates: SlotTemplateWithSoignantsRepo[]
}
// Le repository pose serviceId/establishmentId (tenant) lui-même : l'appelant
// ne les fournit pas. `pathways` et `slotTemplates` sont les relations
// réellement portées par le modèle (le schéma n'a jamais eu de champ `slots`
// ni `template` sur PathwayTemplate) ; `slotTemplates` est remplacé par
// `slotTemplateIDs`, converti en `connect` par clé composite dans le
// repository.
export type PathwayTemplateCreateEntityRepo = Omit<
  Prisma.PathwayTemplateUncheckedCreateInput,
  'establishmentId' | 'serviceId' | 'pathways' | 'slotTemplates'
> & {
  slotTemplateIDs?: string[]
  secondaryTags?: string[]
}
export type PathwayTemplateUpdateEntityRepo = Omit<
  Prisma.PathwayTemplateUncheckedUpdateInput,
  'establishmentId' | 'serviceId' | 'pathways' | 'slotTemplates'
> & {
  pathwayIDs?: string[]
  slotTemplateIDs?: string[]
  secondaryTags?: string[]
}

export interface PathwayTemplateRepositoryInterface {
  findAll: () => Promise<PathwayTemplateWithSlotTemplatesRepo[]>
  findByID: (id: string) => Promise<PathwayTemplateWithSlotTemplatesRepo>
  create: (
    pathwayTemplateCreateParams: PathwayTemplateCreateEntityRepo,
  ) => Promise<PathwayTemplateWithSlotTemplatesRepo>
  update: (
    pathwayTemplateID: string,
    pathwayTemplateUpdateParams: PathwayTemplateUpdateEntityRepo,
  ) => Promise<PathwayTemplateWithSlotTemplatesRepo>
  delete: (
    pathwayTemplateID: string,
  ) => Promise<PathwayTemplateWithSlotTemplatesRepo>
  reorder: (orderedIds: string[]) => Promise<void>
}
