import type { PathwayTemplate } from './pathwayTemplate.ts'
import type { Soignant } from './soignant.ts'
import type { Slot } from './slot.ts'

export type SlotTemplate = {
  id: string
  startTime: string
  endTime: string
  offsetDays?: number
  thematic?: string
  location?: string
  description?: string
  color?: string
  isIndividual?: boolean

  slot: Slot
  soignant?: Soignant
  template?: PathwayTemplate
}

export type CreateSlotTemplateParams = Omit<
  SlotTemplate,
  'id' | 'slot' | 'soignant' | 'template'
> & {
  soignantID: string
  templateID?: string
}
export type UpdateSlotTemplateParams = Omit<
  SlotTemplate,
  'slot' | 'startTime' | 'endTime'
> & {
  startTime?: string
  endTime?: string
}
