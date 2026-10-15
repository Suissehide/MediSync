import type { PdfAsset } from '../../../../../generated/client'

export type PdfAssetEntityRepo = PdfAsset

export type PdfAssetSummaryEntityRepo = Pick<
  PdfAsset,
  'id' | 'fileName' | 'mimeType'
>

export type PdfAssetCreateEntityRepo = {
  fileName: string
  mimeType: string
  // `Uint8Array<ArrayBuffer>` et non `Buffer` : la colonne Bytes de Prisma 7 refuse un
  // tampon potentiellement partage (`SharedArrayBuffer`), ce qu'est un `Buffer` pour TS.
  bytes: Uint8Array<ArrayBuffer>
}

export interface PdfAssetRepositoryInterface {
  create: (params: PdfAssetCreateEntityRepo) => Promise<PdfAssetEntityRepo>
  // Sans les octets : cette liste nourrit un selecteur, pas un rendu.
  findAllForService: () => Promise<PdfAssetSummaryEntityRepo[]>
  findByID: (assetID: string) => Promise<PdfAssetEntityRepo | null>
  remove: (assetID: string) => Promise<void>
}
