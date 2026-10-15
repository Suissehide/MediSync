import type { PdfCanvasPage, PdfPage } from '../../../../types/pdfDesign.ts'

// « avant » rapproche de la couverture, « arriere » en eloigne — le vocabulaire d'une bande
// horizontale, la ou `MoveButtons` dit monter/descendre pour une liste verticale.
export type SensDePage = 'avant' | 'arriere'

export const pageVierge = (): PdfCanvasPage => ({
  kind: 'canvas',
  id: crypto.randomUUID(),
  background: '#ffffff',
  elements: [],
})

export const pageCalendrier = (): PdfPage => ({
  kind: 'calendar',
  id: crypto.randomUUID(),
})

export const aUnCalendrier = (pages: PdfPage[]): boolean =>
  pages.some((page) => page.kind === 'calendar')

export const ajouterPage = (pages: PdfPage[], page: PdfPage): PdfPage[] => [
  ...pages,
  page,
]

// Le schema exige au moins une page : retirer la derniere produirait un contenu que
// l'enregistrement refuserait, et l'utilisateur ne l'apprendrait qu'au 400.
export const supprimerPage = (pages: PdfPage[], id: string): PdfPage[] =>
  pages.length <= 1 ? pages : pages.filter((page) => page.id !== id)

export const deplacerPage = (
  pages: PdfPage[],
  id: string,
  sens: SensDePage,
): PdfPage[] => {
  const rang = pages.findIndex((page) => page.id === id)
  const cible = sens === 'avant' ? rang - 1 : rang + 1
  if (rang < 0 || cible < 0 || cible >= pages.length) {
    return pages
  }
  const suivantes = [...pages]
  const [deplacee] = suivantes.splice(rang, 1)
  if (!deplacee) {
    return pages
  }
  suivantes.splice(cible, 0, deplacee)
  return suivantes
}
