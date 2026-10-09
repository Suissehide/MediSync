import type { SlotTemplate } from './slotTemplate.ts'

export type PathwayTemplate = {
  id: string
  name: string
  color: string
  mainTag: string
  secondaryTags: string[]
  displayOrder: number
  motifRequired: boolean
  firstAppointmentOnly: boolean
  prerequisiteIDs: string[]
  slotTemplates?: SlotTemplate[]
}

export type CreatePathwayTemplateParams = Pick<
  PathwayTemplate,
  'name' | 'color' | 'mainTag'
> & {
  slotTemplateIDs?: string[]
  secondaryTags?: string[]
  motifRequired?: boolean
  firstAppointmentOnly?: boolean
  prerequisiteIDs?: string[]
}
export type UpdatePathwayTemplateParams = Pick<
  PathwayTemplate,
  'id' | 'name' | 'color' | 'mainTag'
> & {
  slotTemplateIDs?: string[]
  secondaryTags?: string[]
  motifRequired?: boolean
  firstAppointmentOnly?: boolean
  prerequisiteIDs?: string[]
}
