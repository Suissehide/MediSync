import type { SlotTemplate } from './slotTemplate.ts'

export type PathwayTemplate = {
  id: string
  name: string
  color: string
  tags: string[]
  displayOrder: number
  motifRequired: boolean
  slotTemplates?: SlotTemplate[]
}

export type CreatePathwayTemplateParams = Pick<
  PathwayTemplate,
  'name' | 'color'
> & { slotTemplateIDs?: string[]; tags?: string[]; motifRequired?: boolean }
export type UpdatePathwayTemplateParams = Pick<
  PathwayTemplate,
  'id' | 'name' | 'color'
> & {
  slotTemplateIDs?: string[]
  tags?: string[]
  motifRequired?: boolean
}
