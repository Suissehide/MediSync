import type { SlotTemplate } from './slotTemplate.ts'

export type PathwayTemplate = {
  id: string
  name: string
  color: string
  slotTemplates?: SlotTemplate[]
}

export type CreatePathwayTemplateParams = Pick<
  PathwayTemplate,
  'name' | 'color'
> & { slotTemplateIDs?: string[] }
export type UpdatePathwayTemplateParams = Pick<
  PathwayTemplate,
  'id' | 'name' | 'color'
> & {
  slotTemplateIDs?: string[]
}
