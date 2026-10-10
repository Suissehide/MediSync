import type {
  ServiceFieldChoice,
  ServiceFieldDefinition,
} from '../../../generated/client'
import type { ServiceFieldType } from '../../utils/service-field-types'

export type ServiceFieldEntityDomain = ServiceFieldDefinition & {
  choices: ServiceFieldChoice[]
}

export type ServiceFieldCreateEntityDomain = {
  label: string
  type: ServiceFieldType
  categoryId: string
  clinical?: boolean
  unit?: string | null
  choices?: string[]
}

export type ServiceFieldUpdateEntityDomain = {
  label?: string
  unit?: string | null
  archived?: boolean
  categoryId?: string
}

export type ServiceFieldChoiceUpdateEntityDomain = {
  label?: string
  archived?: boolean
}

export interface ServiceFieldDomainInterface {
  findAll: () => Promise<ServiceFieldEntityDomain[]>
  findByID: (fieldID: string) => Promise<ServiceFieldEntityDomain>
  create: (
    params: ServiceFieldCreateEntityDomain,
  ) => Promise<ServiceFieldEntityDomain>
  update: (
    fieldID: string,
    params: ServiceFieldUpdateEntityDomain,
  ) => Promise<ServiceFieldEntityDomain>
  createChoice: (
    fieldID: string,
    label: string,
  ) => Promise<ServiceFieldEntityDomain>
  updateChoice: (
    fieldID: string,
    choiceID: string,
    params: ServiceFieldChoiceUpdateEntityDomain,
  ) => Promise<ServiceFieldEntityDomain>
  reorderFields: (categoryId: string, ids: string[]) => Promise<void>
  reorderChoices: (fieldID: string, ids: string[]) => Promise<void>
}
