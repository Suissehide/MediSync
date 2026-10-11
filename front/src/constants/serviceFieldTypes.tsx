import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import {
  AlignLeft,
  Calendar,
  CircleDot,
  Hash,
  ListChecks,
  type LucideIcon,
  ToggleLeft,
  Type,
} from 'lucide-react'

import type {
  FieldValues,
  ServiceField,
  ServiceFieldType,
} from '../types/serviceField.ts'

dayjs.extend(utc)

export const SERVICE_FIELD_TYPE_LABELS: Record<ServiceFieldType, string> = {
  text: 'Texte court',
  longtext: 'Texte long',
  number: 'Nombre',
  date: 'Date',
  choice: 'Choix unique',
  multichoice: 'Choix multiple',
  boolean: 'Oui / Non',
}

export const SERVICE_FIELD_TYPE_ICONS: Record<ServiceFieldType, LucideIcon> = {
  text: Type,
  longtext: AlignLeft,
  number: Hash,
  date: Calendar,
  choice: CircleDot,
  multichoice: ListChecks,
  boolean: ToggleLeft,
}

export const fieldValue = (
  field: ServiceField,
  row: { data?: FieldValues; clinicalData?: FieldValues } | null | undefined,
): unknown => (field.clinical ? row?.clinicalData : row?.data)?.[field.key]

export const emptyFormValue = (type: ServiceFieldType): '' | string[] =>
  type === 'multichoice' ? [] : ''

// Valeur stockée → valeur de formulaire (booléen en 'true'/'false', date en ISO UTC).
export const toFormValue = (
  type: ServiceFieldType,
  value: unknown,
): unknown => {
  if (value === undefined || value === null) {
    return emptyFormValue(type)
  }
  if (type === 'boolean') {
    return String(value === true)
  }
  if (type === 'date' && typeof value === 'string') {
    return dayjs.utc(value).toISOString()
  }
  return value
}

export const toPatchValue = (
  type: ServiceFieldType,
  formValue: unknown,
): unknown => {
  if (
    formValue === undefined ||
    formValue === null ||
    formValue === '' ||
    (Array.isArray(formValue) && formValue.length === 0)
  ) {
    return null
  }
  if (type === 'boolean') {
    return formValue === 'true'
  }
  if (type === 'date' && typeof formValue === 'string') {
    return dayjs.utc(formValue).format('YYYY-MM-DD')
  }
  return formValue
}

export const formatFieldValue = (
  field: ServiceField,
  value: unknown,
): string => {
  const label = (key: unknown) =>
    field.choices.find((c) => c.key === key)?.label ?? String(key)
  if (value === undefined || value === null) {
    return ''
  }
  switch (field.type) {
    case 'choice':
      return label(value)
    case 'multichoice':
      return Array.isArray(value) ? value.map(label).join(', ') : ''
    case 'boolean':
      return value === true ? 'Oui' : 'Non'
    case 'date':
      return typeof value === 'string'
        ? dayjs.utc(value).format('DD/MM/YYYY')
        : ''
    case 'number':
      return field.unit ? `${value} ${field.unit}` : String(value)
    default:
      return String(value)
  }
}
