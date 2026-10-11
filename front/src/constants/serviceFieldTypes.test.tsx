import { describe, expect, it } from 'vitest'

import type { ServiceField } from '../types/serviceField.ts'
import {
  fieldValue,
  formatFieldValue,
  toPatchValue,
} from './serviceFieldTypes.tsx'

const field = (over: Partial<ServiceField>): ServiceField => ({
  id: 'f',
  key: 'k',
  label: 'K',
  type: 'text',
  categoryId: 'cat-parcours',
  order: 0,
  clinical: false,
  unit: null,
  archived: false,
  choices: [],
  ...over,
})

describe('serviceFieldTypes', () => {
  it('lit la valeur dans la bonne colonne', () => {
    const row = { data: { k: 'a' }, clinicalData: { k: 'b' } }
    expect(fieldValue(field({}), row)).toBe('a')
    expect(fieldValue(field({ clinical: true }), row)).toBe('b')
    expect(fieldValue(field({}), null)).toBeUndefined()
  })

  it('transforme les valeurs vides du formulaire en effacement', () => {
    expect(toPatchValue('text', '')).toBeNull()
    expect(toPatchValue('multichoice', [])).toBeNull()
    expect(toPatchValue('number', undefined)).toBeNull()
    expect(toPatchValue('number', 7.2)).toBe(7.2)
    expect(toPatchValue('boolean', 'true')).toBe(true)
    expect(toPatchValue('boolean', 'false')).toBe(false)
    expect(toPatchValue('boolean', '')).toBeNull()
  })

  it('formate comme l export', () => {
    const choices = [
      { id: '1', key: 'HTA', label: 'Hypertension', order: 0, archived: false },
    ]
    expect(
      formatFieldValue(field({ type: 'multichoice', choices }), ['HTA', 'X']),
    ).toBe('Hypertension, X')
    expect(formatFieldValue(field({ type: 'boolean' }), false)).toBe('Non')
    expect(formatFieldValue(field({ type: 'date' }), '2026-03-01')).toBe(
      '01/03/2026',
    )
    expect(formatFieldValue(field({ type: 'number', unit: '%' }), 7.2)).toBe(
      '7.2 %',
    )
  })
})
