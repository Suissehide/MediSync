import Boom from '@hapi/boom'

import {
  type PdfDesignContentInput,
  pdfDesignContentSchema,
} from '../interfaces/http/fastify/schemas/pdf-design-content.schema'
import type { IocContainer } from '../types/application/ioc'
import type {
  PdfDesignCreateDomain,
  PdfDesignDomainInterface,
  PdfDesignListDomain,
  PdfDesignSummaryDomain,
  PdfDesignUpdateDomain,
} from '../types/domain/pdf-design.domain.interface'
import type { PdfDesignRepositoryInterface } from '../types/infra/orm/repositories/pdf-design.repository.interface'
import type { Logger } from '../types/utils/logger'

type LigneDeDesign = {
  id: string
  name: string
  content: unknown
  isDefault?: boolean
  // Absent pour un preset : un modele livre est fini par construction, il n'a pas d'etat de
  // brouillon a porter.
  publishedAt?: Date | null
}

// Une toile vide et la page calendrier : le point de depart d'un design parti de rien.
export const CONTENU_VIERGE: PdfDesignContentInput = {
  version: 1,
  pages: [
    { kind: 'canvas', id: 'page-1', elements: [] },
    { kind: 'calendar', id: 'calendrier' },
  ],
}

// Le nom d'un design n'est pas unique en base (choix de la spec, aligne sur IndicatorSet),
// mais deux entrees identiques dans une liste sont illisibles. Les noms pris incluent les
// designs SUPPRIMES : sans cela la numerotation se remettrait a 2 apres une suppression, et
// restaurer l'ancien ferait deux lignes du meme nom.
// Exporte pour le domaine des modeles livres, qui numerote « Nouveau modèle » sur la meme
// regle : recopier cette boucle ferait deux verites a tenir en phase.
export const premierLibre = (
  candidat: (rang: number) => string,
  pris: string[],
): string => {
  for (let rang = 1; ; rang += 1) {
    const nom = candidat(rang)
    if (!pris.includes(nom)) {
      return nom
    }
  }
}

// « X (copie) », puis « X (copie 2) », « X (copie 3) »...
export const nomDeCopie = (base: string, pris: string[]): string =>
  premierLibre(
    (rang) => (rang === 1 ? `${base} (copie)` : `${base} (copie ${rang})`),
    pris,
  )

// « Nouveau design », puis « Nouveau design 2 ». Jamais « (copie) » : un design parti de rien
// n'est la copie de rien.
export const nomVierge = (pris: string[]): string =>
  premierLibre(
    (rang) => (rang === 1 ? 'Nouveau design' : `Nouveau design ${rang}`),
    pris,
  )

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
        // Ni un brouillon : `publishedAt` absent (preset) vaut « termine », null vaut
        // « brouillon ». Les deux ne se confondent pas, d'ou le `in` plutot qu'un `??`.
        isDraft: 'publishedAt' in ligne ? !ligne.publishedAt : false,
      })
    }
    return retenus
  }

  // Un contenu deja en base peut ne plus passer le schema. Sur une ligne PRECISE — celle qu'on
  // vient d'ecrire ou de lire par id — c'est une erreur serveur, pas une ligne a ecarter.
  #resume(ligne: LigneDeDesign): PdfDesignSummaryDomain {
    const [retenu] = this.#valides([ligne], 'design')
    if (!retenu) {
      throw Boom.internal('Le contenu de ce design ne passe pas le schema')
    }
    return retenu
  }

  // Les deux listes d'un coup : l'ecran d'administration et la modale de generation ont tous
  // deux besoin des presets ET des designs du service. Les supprimes ne concernent que les
  // designs : un preset archive n'est jamais propose, et c'est le super-admin qui les gere.
  async findAllForService(archived = false): Promise<PdfDesignListDomain> {
    const [presets, designs] = await Promise.all([
      archived ? [] : this.pdfDesignRepository.findAllPresets(),
      this.pdfDesignRepository.findAllForService(archived),
    ])
    return {
      presets: this.#valides(
        presets.map((p) => ({ id: p.id, name: p.name, content: p.content })),
        'preset de design',
      ),
      designs: this.#valides(designs, 'design'),
    }
  }

  async create(params: PdfDesignCreateDomain): Promise<PdfDesignSummaryDomain> {
    const pris = await this.pdfDesignRepository.namesInService()

    // Dupliquer un design DU SERVICE. Lu avant le preset : c'est la source la plus precise,
    // et les deux a la fois n'ont pas de sens.
    if (params.sourceDesignId) {
      const source = await this.pdfDesignRepository.findByID(
        params.sourceDesignId,
      )
      if (!source) {
        throw Boom.notFound('PdfDesign not found')
      }
      return this.#resume(
        await this.pdfDesignRepository.create({
          name: params.name ?? nomDeCopie(source.name, pris),
          content: source.content,
          // La filiation se transmet : une copie de copie vient toujours du meme preset, et
          // perdre la trace ici la rendrait indiscernable d'un design parti de rien.
          sourcePresetId: source.sourcePresetId,
        }),
      )
    }

    if (!params.sourcePresetId) {
      return this.#resume(
        await this.pdfDesignRepository.create({
          name: params.name ?? nomVierge(pris),
          content: CONTENU_VIERGE,
          sourcePresetId: null,
        }),
      )
    }

    const preset = await this.pdfDesignRepository.findPresetByID(
      params.sourcePresetId,
    )
    if (!preset) {
      throw Boom.notFound('PdfDesignPreset not found')
    }
    // Copie FIGEE : modifier le preset ensuite ne touche aucune copie deja faite.
    return this.#resume(
      await this.pdfDesignRepository.create({
        name: params.name ?? nomDeCopie(preset.name, pris),
        content: preset.content,
        sourcePresetId: preset.id,
      }),
    )
  }

  async update(
    designID: string,
    params: PdfDesignUpdateDomain,
  ): Promise<PdfDesignSummaryDomain> {
    const { isDraft, ...reste } = params
    // Le design par defaut sert a CHAQUE export : un brouillon ne peut pas l'etre. La garde
    // est ici et pas seulement a l'ecran — une route ne se garde pas sur la foi de son ecran —
    // et elle laisse passer le geste qui termine et pose le defaut d'un seul coup.
    if (params.isDefault === true && isDraft !== false) {
      const design = await this.pdfDesignRepository.findByID(designID)
      if (design && !design.publishedAt) {
        throw Boom.badRequest(
          'Un brouillon ne peut pas être le design par défaut : terminez-le d’abord.',
        )
      }
    }
    return this.#resume(
      await this.pdfDesignRepository.update(designID, {
        ...reste,
        ...(isDraft === undefined ? {} : { published: !isDraft }),
      }),
    )
  }

  async archive(designID: string): Promise<void> {
    await this.pdfDesignRepository.update(designID, { archived: true })
  }
}

export { PdfDesignDomain }
