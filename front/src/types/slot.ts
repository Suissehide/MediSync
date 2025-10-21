import type { Appointment } from './appointment.ts'
import type { Pathway } from './pathway.ts'
import type {
  CreateSlotTemplateParams,
  SlotTemplate,
  UpdateSlotTemplateParams,
} from './slotTemplate.ts'

export type Slot = {
  id: string
  startDate: string
  endDate: string
  appointments: Appointment[]
  pathway?: Pathway
  slotTemplate: SlotTemplate
}

export type CreateSlotParams = Pick<Slot, 'startDate' | 'endDate'> & {
  pathwayID?: string
}
export type CreateSlotParamsWithTemplateID = CreateSlotParams & {
  slotTemplateID: string
}
export type CreateSlotParamsWithTemplateData = CreateSlotParams & {
  slotTemplate: CreateSlotTemplateParams
}
export type UpdateSlotParams = Pick<Slot, 'id'> & {
  startDate?: string
  endDate?: string
  slotTemplate?: UpdateSlotTemplateParams
}
