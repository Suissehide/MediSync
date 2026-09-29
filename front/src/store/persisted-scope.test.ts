import { describe, expect, it } from 'vitest'

import { scopedStorageName } from '@/store/scoped-storage.ts'

describe('nom de stockage indexe par service', () => {
  it('suffixe par le service courant', () => {
    expect(scopedStorageName('soignant-store', { serviceId: 's1' })).toBe(
      'soignant-store/s1',
    )
  })

  // Sans service (ecrans d'administration) ou sans contexte : un tiroir
  // neutre, jamais celui d'un service.
  it('retombe sur un tiroir neutre sans service', () => {
    expect(scopedStorageName('soignant-store', { serviceId: null })).toBe(
      'soignant-store/-',
    )
    expect(scopedStorageName('soignant-store', null)).toBe('soignant-store/-')
  })
})
