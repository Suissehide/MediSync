import type { PdfCanvasPage, PdfPage } from '../../../../types/pdfDesign.ts'
import { copieDElement } from './elements.ts'

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

// Le calendrier porte son nom plutot qu'un numero : il n'est pas une page qu'on compose, et
// l'appeler « Page 2 » laisserait croire qu'on peut y poser un texte. Les toiles se numerotent
// donc entre elles — inserer le calendrier au milieu ne fait pas sauter la couverture de
// « Page 1 » a « Page 2 ».
export const nomsDePages = (pages: PdfPage[]): string[] => {
  let rangDeToile = 0
  return pages.map((page) => {
    if (page.kind === 'calendar') {
      return 'Calendrier'
    }
    rangDeToile += 1
    return `Page ${rangDeToile}`
  })
}

// `cible` est un rang d'INSERTION lu AVANT le retrait, comme l'indicateur du glisser-deposer :
// « avant la page n ». Deposer sur soi-meme ou juste apres soi ne change donc rien, et c'est
// exactement ce que l'indicateur n'affiche pas.
export const reordonnerPages = (
  pages: PdfPage[],
  id: string,
  cible: number,
): PdfPage[] => {
  const rang = pages.findIndex((page) => page.id === id)
  if (rang < 0 || cible < 0 || cible > pages.length) {
    return pages
  }
  if (cible === rang || cible === rang + 1) {
    return pages
  }
  const suivantes = [...pages]
  const [deplacee] = suivantes.splice(rang, 1)
  if (!deplacee) {
    return pages
  }
  suivantes.splice(cible > rang ? cible - 1 : cible, 0, deplacee)
  return suivantes
}

// Chaque element recoit une identite NEUVE : partager un identifiant entre deux pages ferait
// selectionner les deux boites a la fois, et l'inspecteur modifierait celle qu'on ne voit pas.
export const copieDePage = (page: PdfCanvasPage): PdfCanvasPage => ({
  ...page,
  id: crypto.randomUUID(),
  elements: page.elements.map(copieDElement),
})

// La copie se pose JUSTE APRES son original : c'est la seule place ou on la cherche.
export const insererApres = (
  pages: PdfPage[],
  id: string,
  page: PdfPage,
): PdfPage[] => {
  const rang = pages.findIndex((p) => p.id === id)
  if (rang < 0) {
    return [...pages, page]
  }
  return [...pages.slice(0, rang + 1), page, ...pages.slice(rang + 1)]
}
