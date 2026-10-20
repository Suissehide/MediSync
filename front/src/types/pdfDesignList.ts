import type { PdfDesignContent } from './pdfDesign.ts'

export type PdfDesignSummary = {
  id: string
  name: string
  content: PdfDesignContent
  // Toujours faux pour un preset : seul un design de service peut etre celui par defaut.
  isDefault: boolean
  // Un BROUILLON : il se compose et se modifie, mais n'est pas propose au moment d'exporter
  // le document d'un patient. Toujours faux pour un preset — un modele livre est fini.
  isDraft: boolean
}

export type PdfDesignList = {
  presets: PdfDesignSummary[]
  designs: PdfDesignSummary[]
}

// Une source, ou aucune (design vierge) : un modele livre, ou un design du service.
export type CreatePdfDesignParams = {
  sourcePresetId?: string
  sourceDesignId?: string
  name?: string
}

export type UpdatePdfDesignParams = {
  id: string
  name?: string
  content?: PdfDesignContent
  isDefault?: boolean
  archived?: boolean
  isDraft?: boolean
}
