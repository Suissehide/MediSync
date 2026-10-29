import type { PdfDesignContent } from '../../interfaces/http/fastify/schemas/pdf-design-content.schema'

export type PdfDesignPresetSummaryDomain = {
  id: string
  name: string
  // Deja valide par le domaine : ce qui sort d'ici passe le schema de reponse par
  // construction. Un contenu illisible en base est ecarte avec sa ligne, pas propage jusqu'au
  // serialiseur — qui en ferait un 500 sur la liste entiere.
  content: PdfDesignContent
  sortOrder: number
  // Un BROUILLON : il se compose cote super-admin, mais n'est propose a aucun service.
  isDraft: boolean
}

export type PdfDesignPresetCreateDomain = {
  sourcePresetId?: string
  name?: string
}

export type PdfDesignPresetUpdateDomain = {
  name?: string
  content?: PdfDesignContent
  archived?: boolean
  isDraft?: boolean
}

export interface PdfDesignPresetDomainInterface {
  findAll: (archived?: boolean) => Promise<PdfDesignPresetSummaryDomain[]>
  create: (
    params: PdfDesignPresetCreateDomain,
  ) => Promise<PdfDesignPresetSummaryDomain>
  update: (
    presetID: string,
    params: PdfDesignPresetUpdateDomain,
  ) => Promise<PdfDesignPresetSummaryDomain>
  archive: (presetID: string) => Promise<void>
  // La liste doit decrire EXACTEMENT l'ensemble existant, sans manque, sans intrus et sans
  // repetition — sinon 400, et rien n'est ecrit.
  reorder: (ids: string[]) => Promise<void>
}
