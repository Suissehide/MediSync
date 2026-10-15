import Boom from '@hapi/boom'

import type { IocContainer } from '../types/application/ioc'
import type {
  PdfAssetBytesDomain,
  PdfAssetCreateDomain,
  PdfAssetDomainInterface,
  PdfAssetSummaryDomain,
} from '../types/domain/pdf-asset.domain.interface'
import type { PdfAssetRepositoryInterface } from '../types/infra/orm/repositories/pdf-asset.repository.interface'

// Les premiers octets d'un fichier disent ce qu'il est. Le `mimeType` du corps, lui, est
// DECLARE par le client : accepter sa parole laisserait stocker un PDF ou un script sous un
// `image/png`, que les deux moteurs rendraient en vide sans rien dire.
const SIGNATURES: Record<string, number[]> = {
  'image/png': [0x89, 0x50, 0x4e, 0x47],
  'image/jpeg': [0xff, 0xd8, 0xff],
  // WebP : « RIFF », puis la taille sur quatre octets, puis « WEBP ».
  'image/webp': [0x52, 0x49, 0x46, 0x46],
}

const signatureCorrespond = (bytes: Uint8Array, mimeType: string): boolean => {
  const attendue = SIGNATURES[mimeType]
  if (!attendue) {
    return false
  }
  return attendue.every((octet, rang) => bytes[rang] === octet)
}

class PdfAssetDomain implements PdfAssetDomainInterface {
  private readonly pdfAssetRepository: PdfAssetRepositoryInterface

  constructor({ pdfAssetRepository }: IocContainer) {
    this.pdfAssetRepository = pdfAssetRepository
  }

  async create(params: PdfAssetCreateDomain): Promise<PdfAssetSummaryDomain> {
    const bytes = new Uint8Array(Buffer.from(params.base64, 'base64'))
    if (bytes.length === 0) {
      throw Boom.badRequest("Ce fichier n'a pas pu être lu comme une image")
    }
    if (!signatureCorrespond(bytes, params.mimeType)) {
      throw Boom.badRequest(
        `Ce fichier ne ressemble pas à une image ${params.mimeType}`,
      )
    }
    const cree = await this.pdfAssetRepository.create({
      fileName: params.fileName,
      mimeType: params.mimeType,
      bytes,
    })
    return { id: cree.id, fileName: cree.fileName, mimeType: cree.mimeType }
  }

  findAllForService(): Promise<PdfAssetSummaryDomain[]> {
    return this.pdfAssetRepository.findAllForService()
  }

  async findByID(assetID: string): Promise<PdfAssetBytesDomain> {
    const asset = await this.pdfAssetRepository.findByID(assetID)
    if (!asset) {
      throw Boom.notFound('PdfAsset not found')
    }
    return {
      mimeType: asset.mimeType,
      base64: Buffer.from(asset.bytes).toString('base64'),
    }
  }
}

export { PdfAssetDomain }
