import { z } from 'zod/v4'

import { pdfDesignContentSchema } from './pdf-design-content.schema'

// Pas d'`isDefault` : un modele livre n'est le defaut d'aucun service, et le promettre ici
// laisserait croire a un reglage qui n'existe pas. Pas de `z.cuid()` sur l'identifiant non
// plus — le modele de reference porte un id ecrit a la main (`preset-smcv-reference`), dont
// depend le seed.
export const pdfDesignPresetSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  content: pdfDesignContentSchema,
  sortOrder: z.number().int(),
})

export const pdfDesignPresetListResponseSchema = z.array(
  pdfDesignPresetSummarySchema,
)

export const listPdfDesignPresetsQuerySchema = z.object({
  archived: z.stringbool().default(false),
})

export const pdfDesignPresetIdParamsSchema = z.object({
  presetID: z.string().min(1),
})

export const createPdfDesignPresetSchema = z.object({
  sourcePresetId: z.string().min(1).optional(),
  name: z.string().trim().min(1).optional(),
})

export const updatePdfDesignPresetSchema = z.object({
  name: z.string().trim().min(1).optional(),
  content: pdfDesignContentSchema.optional(),
  // `false` restaure un modele supprime ; la suppression passe par DELETE.
  archived: z.literal(false).optional(),
})

export type ListPdfDesignPresetsQuery = z.infer<
  typeof listPdfDesignPresetsQuerySchema
>
export type PdfDesignPresetIdParams = z.infer<
  typeof pdfDesignPresetIdParamsSchema
>
export type CreatePdfDesignPresetBody = z.infer<
  typeof createPdfDesignPresetSchema
>
export type UpdatePdfDesignPresetBody = z.infer<
  typeof updatePdfDesignPresetSchema
>
