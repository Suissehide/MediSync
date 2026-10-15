import { z } from 'zod/v4'

// 2 Mo d'image. Le base64 gonfle d'un tiers, d'ou la borne en CARACTERES plus bas : c'est
// elle que Zod verifie, et c'est elle qui nomme la limite a l'utilisateur.
export const TAILLE_MAXIMALE_OCTETS = 2 * 1024 * 1024
const TAILLE_MAXIMALE_BASE64 = Math.ceil((TAILLE_MAXIMALE_OCTETS * 4) / 3)

// Les seuls types que les deux moteurs de rendu savent lire. Cette liste borne ce qu'on
// accepte de STOCKER ; que la declaration dise vrai est verifie par la signature des octets,
// dans le domaine.
export const TYPES_IMAGE = ['image/png', 'image/jpeg', 'image/webp'] as const

export const createPdfAssetSchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  mimeType: z.enum(TYPES_IMAGE),
  base64: z
    .string()
    .min(1)
    .max(TAILLE_MAXIMALE_BASE64, {
      message: 'Cette image dépasse la taille maximale de 2 Mo',
    })
    .regex(/^[A-Za-z0-9+/\r\n]+={0,2}$/, {
      message: "Ce fichier n'a pas pu être lu comme une image",
    }),
})

export const pdfAssetSummarySchema = z.object({
  id: z.string(),
  fileName: z.string(),
  mimeType: z.string(),
})

export const pdfAssetListResponseSchema = z.array(pdfAssetSummarySchema)

export const pdfAssetBytesResponseSchema = z.object({
  mimeType: z.string(),
  base64: z.string(),
})

export const pdfAssetIdParamsSchema = z.object({ assetID: z.cuid() })

export type CreatePdfAssetBody = z.infer<typeof createPdfAssetSchema>
export type PdfAssetIdParams = z.infer<typeof pdfAssetIdParamsSchema>
