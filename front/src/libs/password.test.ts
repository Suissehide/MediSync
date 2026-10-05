import { describe, expect, it } from 'vitest'

import { passwordError } from './password.ts'

describe('passwordError', () => {
  it('exige 8 caracteres et les quatre types', () => {
    expect(passwordError('Ab1!')).toMatch(/8 caractères/)
    expect(passwordError('ABCDEF1!')).toMatch(/minuscule/)
    expect(passwordError('abcdef1!')).toMatch(/majuscule/)
    expect(passwordError('Abcdefg!')).toMatch(/chiffre/)
    expect(passwordError('Abcdefg1')).toMatch(/caractère spécial/)
    expect(passwordError('Abcdef1!')).toBeUndefined()
  })
})
