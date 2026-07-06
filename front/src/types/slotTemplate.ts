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
  thematicId?: string | null
  locationID?: string | null
  isIndividual?: boolean
  capacity?: number
  color?: string
  description?: string

  slot: Slot
  soignants: Soignant[]
  template?: PathwayTemplate
  location?: Location | null
}

export type CreateSlotTemplateParams = Omit<
  SlotTemplate,
  'id' | 'slot' | 'soignants' | 'template' | 'location' | 'thematic'
> & {
  soignantIDs: string[]
  templateID?: string
}
export type UpdateSlotTemplateParams = Omit<
  SlotTemplate,
  | 'slot'
  | 'soignants'
  | 'template'
  | 'location'
  | 'startTime'
  | 'endTime'
  | 'thematic'
> & {
  offsetDays?: number
  startTime?: string
  endTime?: string
  soignantIDs?: string[]
}
