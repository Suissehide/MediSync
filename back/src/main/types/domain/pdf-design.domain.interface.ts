export type PdfDesignSummaryDomain = {
  id: string
  name: string
  // Valide a la sortie par `pdfDesignContentSchema` dans le schema de reponse : un contenu
  // retouche a la main en base qui ne passe plus fait echouer la reponse plutot que de partir
  // douteux vers le navigateur.
  content: unknown
  isDefault: boolean
}

export type PdfDesignListDomain = {
  presets: PdfDesignSummaryDomain[]
  designs: PdfDesignSummaryDomain[]
}

export interface PdfDesignDomainInterface {
  findAllForService: () => Promise<PdfDesignListDomain>
}
