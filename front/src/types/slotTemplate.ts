import type { PathwayTemplate } from './pathwayTemplate.ts'
import type { Slot } from './slot.ts'
import type { Soignant } from './soignant.ts'

export type SlotTemplate = {
  id: string
  startTime: string
  endTime: string
  offsetDays?: number
  thematic?: string
  location?: string
  isIndividual?: boolean
  capacity?: number
  duration?: number
  color?: string
  description?: string

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
  'slot' | 'soignant' | 'template' | 'startTime' | 'endTime'
> & {
  offsetDays?: number
  startTime?: string
  endTime?: string
  soignantID?: string
}
