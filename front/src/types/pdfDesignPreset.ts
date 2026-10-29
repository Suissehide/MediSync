import type { PdfDesignContent } from './pdfDesign.ts'

// Pas d'`isDefault` : un modele livre n'est le defaut d'aucun service.
export type PdfDesignPreset = {
  id: string
  name: string
  content: PdfDesignContent
  sortOrder: number
  // Un BROUILLON : il se compose ici, mais n'est propose a aucun service tant qu'il n'est pas
  // termine.
  isDraft: boolean
}

export type CreatePdfDesignPresetParams = {
  sourcePresetId?: string
  name?: string
}

export type UpdatePdfDesignPresetParams = {
  id: string
  name?: string
  content?: PdfDesignContent
  archived?: false
  isDraft?: boolean
}
