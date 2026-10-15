import Boom from '@hapi/boom'

import { pdfDesignContentSchema } from '../interfaces/http/fastify/schemas/pdf-design-content.schema'
import type { IocContainer } from '../types/application/ioc'
import type {
  PdfDesignPresetCreateDomain,
  PdfDesignPresetDomainInterface,
  PdfDesignPresetSummaryDomain,
  PdfDesignPresetUpdateDomain,
} from '../types/domain/pdf-design-preset.domain.interface'
import type { PdfDesignPresetRepositoryInterface } from '../types/infra/orm/repositories/pdf-design-preset.repository.interface'
import type { Logger } from '../types/utils/logger'
import { sameIds } from '../utils/service-field-types'
import { CONTENU_VIERGE, nomDeCopie, premierLibre } from './pdf-design.domain'

type LigneDePreset = {
  id: string
  name: string
  content: unknown
  sortOrder: number
}

// « Nouveau modèle », puis « Nouveau modèle 2 ». Meme regle que `nomVierge` cote service, sur
// le mot qu'emploie l'ecran super-admin.
export const nomDeModeleVierge = (pris: string[]): string =>
  premierLibre(
    (rang) => (rang === 1 ? 'Nouveau modèle' : `Nouveau modèle ${rang}`),
    pris,
  )

class PdfDesignPresetDomain implements PdfDesignPresetDomainInterface {
  private readonly pdfDesignPresetRepository: PdfDesignPresetRepositoryInterface
  private readonly logger: Logger

  constructor({ pdfDesignPresetRepository, logger }: IocContainer) {
    this.pdfDesignPresetRepository = pdfDesignPresetRepository
    this.logger = logger
  }

  // Meme regle que cote service : un contenu qui ne passe plus le schema fait tomber SA ligne,
  // jamais la liste. Un modele livre etant GLOBAL, le laisser remonter au serialiseur
  // eteindrait l'ecran entier pour une seule ligne retouchee a la main.
  #valides(lignes: LigneDePreset[]): PdfDesignPresetSummaryDomain[] {
    const retenus: PdfDesignPresetSummaryDomain[] = []
    for (const ligne of lignes) {
      const analyse = pdfDesignContentSchema.safeParse(ligne.content)
      if (!analyse.success) {
        this.logger.error(
          `modele livre ${ligne.id} ecarte : son contenu ne passe pas le schema`,
        )
        continue
      }
      retenus.push({
        id: ligne.id,
        name: ligne.name,
        content: analyse.data,
        sortOrder: ligne.sortOrder,
      })
    }
    return retenus
  }

  // Sur une ligne PRECISE — celle qu'on vient d'ecrire — un contenu illisible est une erreur
  // serveur, pas une ligne a ecarter en silence.
  #resume(ligne: LigneDePreset): PdfDesignPresetSummaryDomain {
    const [retenu] = this.#valides([ligne])
    if (!retenu) {
      throw Boom.internal('Le contenu de ce modèle ne passe pas le schéma')
    }
    return retenu
  }

  async findAll(archived = false): Promise<PdfDesignPresetSummaryDomain[]> {
    return this.#valides(await this.pdfDesignPresetRepository.findAll(archived))
  }

  // Les noms pris incluent les modeles SUPPRIMES : sans cela la numerotation se remettrait a 2
  // apres une suppression, et restaurer l'ancien ferait deux lignes du meme nom.
  async #nomsPris(): Promise<string[]> {
    const [actifs, supprimes] = await Promise.all([
      this.pdfDesignPresetRepository.findAll(false),
      this.pdfDesignPresetRepository.findAll(true),
    ])
    return [...actifs, ...supprimes].map((p) => p.name)
  }

  // Le rang du nouveau : apres tous les autres, supprimes compris — un modele restaure ne doit
  // pas se retrouver au meme rang qu'un autre.
  async #rangSuivant(): Promise<number> {
    const [actifs, supprimes] = await Promise.all([
      this.pdfDesignPresetRepository.findAll(false),
      this.pdfDesignPresetRepository.findAll(true),
    ])
    const rangs = [...actifs, ...supprimes].map((p) => p.sortOrder)
    return rangs.length === 0 ? 0 : Math.max(...rangs) + 1
  }

  async create(
    params: PdfDesignPresetCreateDomain,
  ): Promise<PdfDesignPresetSummaryDomain> {
    const [pris, sortOrder] = await Promise.all([
      this.#nomsPris(),
      this.#rangSuivant(),
    ])

    if (!params.sourcePresetId) {
      return this.#resume(
        await this.pdfDesignPresetRepository.create({
          name: params.name ?? nomDeModeleVierge(pris),
          content: CONTENU_VIERGE,
          sortOrder,
        }),
      )
    }

    const source = await this.pdfDesignPresetRepository.findByID(
      params.sourcePresetId,
    )
    if (!source) {
      throw Boom.notFound('PdfDesignPreset not found')
    }
    return this.#resume(
      await this.pdfDesignPresetRepository.create({
        name: params.name ?? nomDeCopie(source.name, pris),
        content: source.content,
        sortOrder,
      }),
    )
  }

  async update(
    presetID: string,
    params: PdfDesignPresetUpdateDomain,
  ): Promise<PdfDesignPresetSummaryDomain> {
    const existant = await this.pdfDesignPresetRepository.findByID(presetID)
    if (!existant) {
      throw Boom.notFound('PdfDesignPreset not found')
    }
    return this.#resume(
      await this.pdfDesignPresetRepository.update(presetID, params),
    )
  }

  // Suppression = archivage, comme les quatre referentiels. Les copies deja faites par les
  // services ne bougent pas : elles sont FIGEES depuis l'etape 2, et c'est ce qui permet
  // d'archiver un modele sans toucher aux documents de qui que ce soit.
  async archive(presetID: string): Promise<void> {
    const existant = await this.pdfDesignPresetRepository.findByID(presetID)
    if (!existant) {
      throw Boom.notFound('PdfDesignPreset not found')
    }
    await this.pdfDesignPresetRepository.update(presetID, { archived: true })
  }

  // La liste doit decrire EXACTEMENT l'ensemble existant. Une liste incomplete laisserait les
  // absents a leur ancien rang, entremeles avec les nouveaux ; une liste qui repete un modele
  // lui donnerait son dernier rang. On refuse en entier plutot que d'ecrire a moitie.
  //
  // `sameIds` ne suffit PAS : il compare des ENSEMBLES, donc `['a','b','b']` contre
  // `['a','b']` lui convient. D'ou la comparaison des longueurs, ici et pas dans l'utilitaire
  // partage — le corriger la-bas changerait le comportement des champs et des categories.
  async reorder(ids: string[]): Promise<void> {
    const existants = await this.pdfDesignPresetRepository.findAll(false)
    const attendus = existants.map((p) => p.id)
    if (ids.length !== attendus.length || !sameIds(attendus, ids)) {
      throw Boom.badRequest(
        'La liste ne correspond pas exactement aux modèles livrés.',
      )
    }
    await this.pdfDesignPresetRepository.reorder(ids)
  }
}

export { PdfDesignPresetDomain }
