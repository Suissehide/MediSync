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
  locked: boolean
  appointments: Appointment[]
  pathway?: Pathway
  slotTemplate: SlotTemplate
}

/**
 * Fenêtre demandée au serveur. Bornes en date seule (YYYY-MM-DD), interprétées
 * en UTC : `to` est exclusive, comme la fin de plage de FullCalendar.
 */
export type SlotDateRange = {
  from: string
  to: string
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
export type UpdateSlotParams = Omit<
  Slot,
  'startDate' | 'endDate' | 'appointments' | 'pathway' | 'slotTemplate' | 'locked'
> & {
  startDate?: string
  endDate?: string
  locked?: boolean
  slotTemplate?: UpdateSlotTemplateParams
}
