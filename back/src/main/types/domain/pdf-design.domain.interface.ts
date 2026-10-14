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

export interface PdfDesignDomainInterface {
  findAllForService: () => Promise<PdfDesignListDomain>
}
