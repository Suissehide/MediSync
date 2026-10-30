import { cuid } from '../../../main/interfaces/http/fastify/schemas/id.schema'

describe('cuid()', () => {
  it('accepte les identifiants importes de Draxa, en prod depuis le 2026-10-01', () => {
    for (const id of ['clgx_ap_93', 'clgx_pa_1860']) {
      expect(cuid().safeParse(id).success).toBe(true)
    }
  })

  it('accepte un cuid genere par Prisma', () => {
    expect(cuid().safeParse('cmh7k2x9b0000qz8r4f1d2e3a').success).toBe(true)
  })

  it('refuse ce qui n est pas un identifiant', () => {
    for (const id of [
      '',
      'abc',
      'clgx-ap-93',
      'c a b c d e f g h',
      'xlgx_ap_93',
    ]) {
      expect(cuid().safeParse(id).success).toBe(false)
    }
  })
})
