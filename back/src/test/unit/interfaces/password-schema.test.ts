import { passwordSchema } from '../../../main/interfaces/http/fastify/schemas/password.schema'

describe('passwordSchema', () => {
  it('exige 8 caracteres et les quatre types', () => {
    for (const faible of [
      'Ab1!',
      'ABCDEF1!',
      'abcdef1!',
      'Abcdefg!',
      'Abcdefg1',
    ]) {
      expect(passwordSchema.safeParse(faible).success).toBe(false)
    }
    expect(passwordSchema.safeParse('Abcdef1!').success).toBe(true)
  })
})
