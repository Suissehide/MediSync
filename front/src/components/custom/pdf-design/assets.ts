import type { PdfDesignContent } from '../../../types/pdfDesign.ts'

// Quelles images deposees ce contenu reclame. C'est l'APPELANT qui va chercher les octets :
// les moteurs, eux, ne savent pas lire un cache react-query — `render-pdf` tourne hors React.
export const assetIdsDe = (contenu: PdfDesignContent): string[] => {
  const ids = new Set<string>()
  for (const page of contenu.pages) {
    if (page.kind !== 'canvas') {
      continue
    }
    for (const element of page.elements) {
      if (element.kind === 'image' && 'assetId' in element.source) {
        ids.add(element.source.assetId)
      }
    }
  }
  return [...ids]
}
