import { z } from 'zod/v4'

// 2 Mo d'image. Le base64 gonfle d'un tiers, d'ou la borne en CARACTERES plus bas : c'est
// elle que Zod verifie, et c'est elle qui nomme la limite a l'utilisateur.
export const TAILLE_MAXIMALE_OCTETS = 2 * 1024 * 1024
// `4 * ceil(n / 3)`, et non `ceil(4n / 3)` : le base64 remplit le dernier groupe de quatre
// caracteres. Les deux formules different de trois caracteres au plus, ce qui suffisait a
// faire refuser une image de 2 Mo PILE — avec un message affirmant qu'elle depassait 2 Mo.
const TAILLE_MAXIMALE_BASE64 = 4 * Math.ceil(TAILLE_MAXIMALE_OCTETS / 3)

// Les seuls types que les DEUX moteurs savent lire, et c'est react-pdf qui ferme la liste :
// `@react-pdf/image` n'accepte que jpg, jpeg et png (`isValidFormat`), et pour tout autre il
// journalise puis produit le document SANS l'image. Un WebP, un GIF ou un SVG seraient donc
// acceptes, visibles sur la toile, et absents de chaque programme patient — en silence. Cette
// liste borne ce qu'on accepte de STOCKER ; que la declaration dise vrai est verifie par la
// signature des octets, dans le domaine.
export const TYPES_IMAGE = ['image/png', 'image/jpeg'] as const

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
