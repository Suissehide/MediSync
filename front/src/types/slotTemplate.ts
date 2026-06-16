import type { Location } from './location.ts'
import type { PathwayTemplate } from './pathwayTemplate.ts'
import type { Slot } from './slot.ts'
import type { Soignant } from './soignant.ts'

export type SlotTemplate = {
  id: string
  startTime: string
  endTime: string
  offsetDays?: number
  thematic?: string
  locationID?: string | null
  isIndividual?: boolean
  capacity?: number
  color?: string
  description?: string

  slot: Slot
  soignant?: Soignant
  template?: PathwayTemplate
  location?: Location | null
}

export type CreateSlotTemplateParams = Omit<
  SlotTemplate,
  'id' | 'slot' | 'soignant' | 'template' | 'location'
> & {
  soignantID: string
  templateID?: string
}
export type UpdateSlotTemplateParams = Omit<
  SlotTemplate,
  'slot' | 'soignant' | 'template' | 'location' | 'startTime' | 'endTime'
> & {
  offsetDays?: number
  startTime?: string
  endTime?: string
  soignantID?: string
}
