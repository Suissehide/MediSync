import type {
  ServiceFieldChoice,
  ServiceFieldDefinition,
} from '../../../../../generated/client'
import type {
  ServiceFieldSection,
  ServiceFieldType,
} from '../../../../utils/service-field-types'

export type ServiceFieldEntityRepo = ServiceFieldDefinition & {
  choices: ServiceFieldChoice[]
}

export type ServiceFieldChoiceCreateEntityRepo = {
  key: string
  label: string
  order: number
}

export type ServiceFieldCreateEntityRepo = {
  key: string
  label: string
  type: ServiceFieldType
  section: ServiceFieldSection
  order: number
  clinical: boolean
  unit: string | null
  choices: ServiceFieldChoiceCreateEntityRepo[]
}

export type ServiceFieldUpdateEntityRepo = {
  label?: string
  unit?: string | null
  archivedAt?: Date | null
}

export type ServiceFieldChoiceUpdateEntityRepo = {
  label?: string
  archivedAt?: Date | null
}

export interface ServiceFieldRepositoryInterface {
  findAll: () => Promise<ServiceFieldEntityRepo[]>
  findByID: (fieldID: string) => Promise<ServiceFieldEntityRepo>
  create: (
    params: ServiceFieldCreateEntityRepo,
  ) => Promise<ServiceFieldEntityRepo>
  update: (
    fieldID: string,
    params: ServiceFieldUpdateEntityRepo,
  ) => Promise<ServiceFieldEntityRepo>
  createChoice: (
    fieldID: string,
    params: ServiceFieldChoiceCreateEntityRepo,
  ) => Promise<ServiceFieldEntityRepo>
  updateChoice: (
    fieldID: string,
    choiceID: string,
    params: ServiceFieldChoiceUpdateEntityRepo,
  ) => Promise<ServiceFieldEntityRepo>
  reorderFields: (ids: string[]) => Promise<void>
  reorderChoices: (fieldID: string, ids: string[]) => Promise<void>
}
