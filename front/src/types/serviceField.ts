export type ServiceFieldType =
  | 'text'
  | 'longtext'
  | 'number'
  | 'date'
  | 'choice'
  | 'multichoice'
  | 'boolean'

export type ServiceFieldCategory = {
  id: string
  label: string
  order: number
  dateField: 'entryDate' | 'exitDate' | null
  archived: boolean
}

export type ServiceFieldChoice = {
  id: string
  key: string
  label: string
  order: number
  archived: boolean
}

export type ServiceField = {
  id: string
  key: string
  label: string
  type: ServiceFieldType
  categoryId: string
  order: number
  clinical: boolean
  unit: string | null
  archived: boolean
  choices: ServiceFieldChoice[]
}

export type FieldValues = Record<string, unknown>

export type CreateServiceFieldParams = {
  label: string
  type: ServiceFieldType
  categoryId: string
  clinical?: boolean
  unit?: string | null
  choices?: string[]
}

export type UpdateServiceFieldParams = {
  id: string
  label?: string
  unit?: string | null
  archived?: boolean
  categoryId?: string
}

export type CreateServiceFieldChoiceParams = { fieldID: string; label: string }

export type UpdateServiceFieldChoiceParams = {
  fieldID: string
  choiceID: string
  label?: string
  archived?: boolean
}

export type ReorderServiceFieldsParams = {
  categoryId: string
  ids: string[]
}

export type UpdateServiceFieldCategoryParams = {
  id: string
  label?: string
  archived?: boolean
}

export type ReorderServiceFieldChoicesParams = {
  fieldID: string
  ids: string[]
}
