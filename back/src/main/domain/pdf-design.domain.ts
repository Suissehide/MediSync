import type { IocContainer } from '../types/application/ioc'
import type {
  PdfDesignDomainInterface,
  PdfDesignListDomain,
} from '../types/domain/pdf-design.domain.interface'
import type { PdfDesignRepositoryInterface } from '../types/infra/orm/repositories/pdf-design.repository.interface'

class PdfDesignDomain implements PdfDesignDomainInterface {
  private readonly pdfDesignRepository: PdfDesignRepositoryInterface

  constructor({ pdfDesignRepository }: IocContainer) {
    this.pdfDesignRepository = pdfDesignRepository
  }

  // Les deux listes d'un coup : l'ecran d'administration et la modale de generation ont tous
  // deux besoin des presets ET des designs du service.
  async findAllForService(): Promise<PdfDesignListDomain> {
    const [presets, designs] = await Promise.all([
      this.pdfDesignRepository.findAllPresets(),
      this.pdfDesignRepository.findAllForService(),
    ])
    return {
      presets: presets.map((preset) => ({
        id: preset.id,
        name: preset.name,
        content: preset.content,
        // Un preset n'est jamais le design par defaut : seul un design de service l'est.
        isDefault: false,
      })),
      designs: designs.map((design) => ({
        id: design.id,
        name: design.name,
        content: design.content,
        isDefault: design.isDefault,
      })),
    }
  }
}

export { PdfDesignDomain }
