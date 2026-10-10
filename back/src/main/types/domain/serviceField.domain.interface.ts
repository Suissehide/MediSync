import type {
  ServiceFieldChoice,
  ServiceFieldDefinition,
} from '../../../generated/client'
import type {
  ServiceFieldSection,
  ServiceFieldType,
} from '../../utils/service-field-types'

export type ServiceFieldEntityDomain = ServiceFieldDefinition & {
  choices: ServiceFieldChoice[]
}

export type ServiceFieldCreateEntityDomain = {
  label: string
  type: ServiceFieldType
  section: ServiceFieldSection
  clinical?: boolean
  unit?: string | null
  choices?: string[]
}

export type ServiceFieldUpdateEntityDomain = {
  label?: string
  unit?: string | null
  archived?: boolean
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
  reorderFields: (section: ServiceFieldSection, ids: string[]) => Promise<void>
  reorderChoices: (fieldID: string, ids: string[]) => Promise<void>
}
