import { describe, expect, it } from 'vitest'

describe('harnais de test', () => {
  it('dispose de jsdom et d un stockage local vide', () => {
    expect(typeof document).toBe('object')
    expect(localStorage.length).toBe(0)
    localStorage.setItem('x', '1')
    expect(localStorage.getItem('x')).toBe('1')
  })
})
