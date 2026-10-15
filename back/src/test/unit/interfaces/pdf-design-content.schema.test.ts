import { pdfDesignContentSchema } from '../../../main/interfaces/http/fastify/schemas/pdf-design-content.schema'

const toile = (id: string) => ({ kind: 'canvas' as const, id, elements: [] })
const calendrier = (id: string) => ({ kind: 'calendar' as const, id })

describe('pdfDesignContentSchema, les pages', () => {
  it('accepte un design sans page calendrier', () => {
    const r = pdfDesignContentSchema.safeParse({
      version: 1,
      pages: [toile('a'), toile('b')],
    })
    expect(r.success).toBe(true)
  })

  it('accepte une page calendrier', () => {
    const r = pdfDesignContentSchema.safeParse({
      version: 1,
      pages: [toile('a'), calendrier('c')],
    })
    expect(r.success).toBe(true)
  })

  // Deux exemplaires rendraient deux fois les memes creneaux : le document repeterait le
  // planning a l'identique, sans que rien ne le signale.
  it('refuse deux pages calendrier', () => {
    const r = pdfDesignContentSchema.safeParse({
      version: 1,
      pages: [calendrier('c1'), toile('a'), calendrier('c2')],
    })
    expect(r.success).toBe(false)
  })

  it('refuse un design sans aucune page', () => {
    const r = pdfDesignContentSchema.safeParse({ version: 1, pages: [] })
    expect(r.success).toBe(false)
  })
})
