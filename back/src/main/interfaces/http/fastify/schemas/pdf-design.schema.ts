import { z } from 'zod/v4'

import { pdfDesignContentSchema } from './pdf-design-content.schema'

// L'identifiant d'un preset n'est pas un cuid : le preset de reference porte un id stable
// ecrit a la main (`preset-smcv-reference`), dont depend le seed.
const pdfDesignSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  content: pdfDesignContentSchema,
  isDefault: z.boolean(),
})

export const pdfDesignListResponseSchema = z.object({
  presets: z.array(pdfDesignSummarySchema),
  designs: z.array(pdfDesignSummarySchema),
})

export type PdfDesignListResponse = z.infer<typeof pdfDesignListResponseSchema>
