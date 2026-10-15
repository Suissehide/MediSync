import { z } from 'zod/v4'

import { pdfDesignContentSchema } from './pdf-design-content.schema'

// L'identifiant d'un preset n'est pas un cuid : le preset de reference porte un id stable
// ecrit a la main (`preset-smcv-reference`), dont depend le seed.
export const pdfDesignSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  content: pdfDesignContentSchema,
  isDefault: z.boolean(),
})

export const pdfDesignListResponseSchema = z.object({
  presets: z.array(pdfDesignSummarySchema),
  designs: z.array(pdfDesignSummarySchema),
})

export const listPdfDesignsQuerySchema = z.object({
  archived: z.stringbool().default(false),
})

export const pdfDesignIdParamsSchema = z.object({
  designID: z.cuid(),
})

// `sourcePresetId` absent = design vierge. Pas de cuid ici : les presets ont des ids ecrits a
// la main. `name` reste optionnel, le domaine suffixe « (copie) » tout seul.
export const createPdfDesignSchema = z.object({
  sourcePresetId: z.string().min(1).optional(),
  // `trim()` AVANT `min(1)` : « Mon design   » se stockait avec ses espaces, et un nom fait
  // d'espaces seuls passait pour un nom.
  name: z.string().trim().min(1).optional(),
})

export const updatePdfDesignSchema = z.object({
  name: z.string().trim().min(1).optional(),
  content: pdfDesignContentSchema.optional(),
  isDefault: z.boolean().optional(),
  // `false` restaure un design supprime ; la suppression passe par DELETE.
  archived: z.literal(false).optional(),
})

export type PdfDesignListResponse = z.infer<typeof pdfDesignListResponseSchema>
export type ListPdfDesignsQuery = z.infer<typeof listPdfDesignsQuerySchema>
export type PdfDesignIdParams = z.infer<typeof pdfDesignIdParamsSchema>
export type CreatePdfDesignBody = z.infer<typeof createPdfDesignSchema>
export type UpdatePdfDesignBody = z.infer<typeof updatePdfDesignSchema>
