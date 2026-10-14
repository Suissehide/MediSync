import { pdfDesignContentSchema } from '../interfaces/http/fastify/schemas/pdf-design-content.schema'
import type { IocContainer } from '../types/application/ioc'
import type {
  PdfDesignDomainInterface,
  PdfDesignListDomain,
  PdfDesignSummaryDomain,
} from '../types/domain/pdf-design.domain.interface'
import type { PdfDesignRepositoryInterface } from '../types/infra/orm/repositories/pdf-design.repository.interface'
import type { Logger } from '../types/utils/logger'

type LigneDeDesign = {
  id: string
  name: string
  content: unknown
  isDefault?: boolean
}

class PdfDesignDomain implements PdfDesignDomainInterface {
  private readonly pdfDesignRepository: PdfDesignRepositoryInterface
  private readonly logger: Logger

  constructor({ pdfDesignRepository, logger }: IocContainer) {
    this.pdfDesignRepository = pdfDesignRepository
    this.logger = logger
  }

  // Un contenu qui ne passe plus le schema — un preset retouche a la main, une version future —
  // fait tomber SA ligne, jamais la liste. Le laisser remonter jusqu'au serialiseur de reponse
  // le transformerait en 500 : les presets etant GLOBAUX, une seule ligne cassee eteindrait
  // l'export PDF de TOUS les services a la fois. Le defaut est journalise, pas avale.
  #valides(lignes: LigneDeDesign[], origine: string): PdfDesignSummaryDomain[] {
    const retenus: PdfDesignSummaryDomain[] = []
    for (const ligne of lignes) {
      const analyse = pdfDesignContentSchema.safeParse(ligne.content)
      if (!analyse.success) {
        this.logger.error(
          `${origine} ${ligne.id} ecarte : son contenu ne passe pas le schema`,
        )
        continue
      }
      retenus.push({
        id: ligne.id,
        name: ligne.name,
        content: analyse.data,
        // Un preset n'est jamais le design par defaut : seul un design de service l'est.
        isDefault: ligne.isDefault ?? false,
      })
    }
    return retenus
  }

  // Les deux listes d'un coup : l'ecran d'administration et la modale de generation ont tous
  // deux besoin des presets ET des designs du service.
  async findAllForService(): Promise<PdfDesignListDomain> {
    const [presets, designs] = await Promise.all([
      this.pdfDesignRepository.findAllPresets(),
      this.pdfDesignRepository.findAllForService(),
    ])
    return {
      presets: this.#valides(
        presets.map((p) => ({ id: p.id, name: p.name, content: p.content })),
        'preset de design',
      ),
      designs: this.#valides(designs, 'design'),
    }
  }
}

export { PdfDesignDomain }
