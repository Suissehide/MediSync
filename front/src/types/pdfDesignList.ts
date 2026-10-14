import type { PdfDesignContent } from './pdfDesign.ts'

export type PdfDesignSummary = {
  id: string
  name: string
  content: PdfDesignContent
  // Toujours faux pour un preset : seul un design de service peut etre celui par defaut.
  isDefault: boolean
}

export type PdfDesignList = {
  presets: PdfDesignSummary[]
  designs: PdfDesignSummary[]
}
