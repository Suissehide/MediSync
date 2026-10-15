import Boom from '@hapi/boom'

import type { IocContainer } from '../types/application/ioc'
import type {
  PdfAssetBytesDomain,
  PdfAssetCreateDomain,
  PdfAssetDomainInterface,
  PdfAssetSummaryDomain,
} from '../types/domain/pdf-asset.domain.interface'
import type { PdfAssetRepositoryInterface } from '../types/infra/orm/repositories/pdf-asset.repository.interface'
import type { PdfDesignRepositoryInterface } from '../types/infra/orm/repositories/pdf-design.repository.interface'

// Les premiers octets d'un fichier disent ce qu'il est. Le `mimeType` du corps, lui, est
// DECLARE par le client : accepter sa parole laisserait stocker un PDF ou un script sous un
// `image/png`, que les deux moteurs rendraient en vide sans rien dire.
const SIGNATURES: Record<string, number[]> = {
  'image/png': [0x89, 0x50, 0x4e, 0x47],
  'image/jpeg': [0xff, 0xd8, 0xff],
  // WebP : « RIFF », puis la taille sur quatre octets, puis « WEBP ».
  'image/webp': [0x52, 0x49, 0x46, 0x46],
}

// Le type tel qu'un humain le nomme : « une image image/png » se lit mal dans un message.
const NOMS: Record<string, string> = {
  'image/png': 'PNG',
  'image/jpeg': 'JPEG',
  'image/webp': 'WebP',
}

const signatureCorrespond = (bytes: Uint8Array, mimeType: string): boolean => {
  const attendue = SIGNATURES[mimeType]
  if (!attendue) {
    return false
  }
  return attendue.every((octet, rang) => bytes[rang] === octet)
}

type DesignLu = { name: string; content: unknown }

// On lit le JSON des contenus plutot que d'ajouter une table de liaison : un element image
// porte deja son `assetId`, et une table de plus serait une seconde verite a tenir en phase a
// chaque enregistrement de design. Un contenu illisible est ignore — il ne prouve rien sur
// l'usage de l'image.
export const designsUtilisant = (
  designs: DesignLu[],
  assetID: string,
): string[] =>
  designs
    .filter((design) => {
      const pages = (design.content as { pages?: unknown })?.pages
      return Array.isArray(pages) && pages.some((page) => porte(page, assetID))
    })
    .map((design) => design.name)

const porte = (page: unknown, assetID: string): boolean => {
  const elements = (page as { elements?: unknown })?.elements
  return (
    Array.isArray(elements) &&
    elements.some(
      (element) =>
        (element as { source?: { assetId?: string } })?.source?.assetId ===
        assetID,
    )
  )
}

class PdfAssetDomain implements PdfAssetDomainInterface {
  private readonly pdfAssetRepository: PdfAssetRepositoryInterface
  private readonly pdfDesignRepository: PdfDesignRepositoryInterface

  constructor({ pdfAssetRepository, pdfDesignRepository }: IocContainer) {
    this.pdfAssetRepository = pdfAssetRepository
    this.pdfDesignRepository = pdfDesignRepository
  }

  async create(params: PdfAssetCreateDomain): Promise<PdfAssetSummaryDomain> {
    const bytes = new Uint8Array(Buffer.from(params.base64, 'base64'))
    if (bytes.length === 0) {
      throw Boom.badRequest("Ce fichier n'a pas pu être lu comme une image")
    }
    if (!signatureCorrespond(bytes, params.mimeType)) {
      throw Boom.badRequest(
        `Ce fichier ne ressemble pas à une image ${NOMS[params.mimeType] ?? params.mimeType}`,
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

  // `referentials:write` suffit a supprimer une image, mais pas a casser un design : la
  // suppression est refusee tant qu'un contenu porte l'identifiant, et la reponse NOMME les
  // designs pour que l'utilisateur sache ou aller les corriger.
  //
  // `findAllForService()` ne rend que les designs ACTIFS, et c'est voulu : un design supprime
  // ne bloque pas: il n'est plus proposable, et le restaurer avec une image manquante tombe
  // dans le cas deja couvert — le PDF sort sans cette image.
  async remove(assetID: string): Promise<void> {
    const asset = await this.pdfAssetRepository.findByID(assetID)
    if (!asset) {
      throw Boom.notFound('PdfAsset not found')
    }
    const designs = await this.pdfDesignRepository.findAllForService()
    const utilisateurs = designsUtilisant(designs, assetID)
    if (utilisateurs.length > 0) {
      throw Boom.conflict(
        `Cette image est utilisée par : ${utilisateurs.join(', ')}`,
      )
    }
    await this.pdfAssetRepository.remove(assetID)
  }
}

export { PdfAssetDomain }
