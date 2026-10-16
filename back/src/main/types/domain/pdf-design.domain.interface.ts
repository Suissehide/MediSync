import type { PdfDesignContent } from '../../interfaces/http/fastify/schemas/pdf-design-content.schema'

export type PdfDesignSummaryDomain = {
  id: string
  name: string
  // Deja valide par le domaine, et rendu dans sa forme d'apres defauts : ce qui sort d'ici
  // passe le schema de reponse par construction. Un contenu invalide en base est ecarte avec
  // sa ligne, pas propage jusqu'au serialiseur — qui en ferait un 500 sur la liste entiere.
  content: PdfDesignContent
  isDefault: boolean
}

export type PdfDesignListDomain = {
  presets: PdfDesignSummaryDomain[]
  designs: PdfDesignSummaryDomain[]
}

export type PdfDesignCreateDomain = {
  sourcePresetId?: string
  sourceDesignId?: string
  name?: string
}

export type PdfDesignUpdateDomain = {
  name?: string
  content?: PdfDesignContent
  isDefault?: boolean
  archived?: boolean
}

export interface PdfDesignDomainInterface {
  findAllForService: (archived?: boolean) => Promise<PdfDesignListDomain>
  create: (params: PdfDesignCreateDomain) => Promise<PdfDesignSummaryDomain>
  update: (
    designID: string,
    params: PdfDesignUpdateDomain,
  ) => Promise<PdfDesignSummaryDomain>
  archive: (designID: string) => Promise<void>
}
