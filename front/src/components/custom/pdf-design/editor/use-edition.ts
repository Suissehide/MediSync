import { useCallback, useState } from 'react'

import type {
  PdfDesignContent,
  PdfElement,
  PdfPage,
} from '../../../../types/pdfDesign.ts'
import {
  dupliquerElement,
  type KindElement,
  nouvelElement,
} from './elements.ts'
import {
  ajouterPage,
  aUnCalendrier,
  copieDePage,
  deplacerPage,
  insererApres,
  pageCalendrier,
  pageVierge,
  reordonnerPages,
  type SensDePage,
  supprimerPage,
} from './pages.ts'

export function useEdition(contenuInitial: PdfDesignContent) {
  const [contenu, setContenu] = useState(contenuInitial)
  const [enregistre, setEnregistre] = useState(contenuInitial)
  const [pageId, setPageId] = useState<string | null>(null)
  const [selection, setSelection] = useState<string | null>(null)

  const modifie = contenu !== enregistre

  // Le contenu arrive APRES le premier rendu : la requete repond en second, et un
  // `useState` seul resterait sur le contenu vide du montage. On se resynchronise donc
  // quand la source change d'identite — mais JAMAIS tant qu'il reste des modifications non
  // enregistrees : une invalidation declenchee ailleurs effacerait le travail en cours.
  const [vu, setVu] = useState(contenuInitial)
  if (vu !== contenuInitial && !modifie) {
    setVu(contenuInitial)
    setContenu(contenuInitial)
    setEnregistre(contenuInitial)
    setSelection(null)
  }

  // Toutes les pages, dans l'ordre : la bande les montre toutes, y compris le calendrier,
  // qu'on deplace et qu'on supprime comme les autres meme s'il ne se compose pas.
  const pages = contenu.pages

  // L'editeur OUVRE sur la premiere toile : le calendrier n'a rien a composer. Une fois
  // ouvert, la page courante peut etre n'importe laquelle — c'est la bande qui mene. Le
  // dernier repli sert au design dont la seule page EST le calendrier.
  const premiereToile = pages.find((page) => page.kind === 'canvas')
  const pageCourante =
    pages.find((page) => page.id === pageId) ??
    premiereToile ??
    pages[0] ??
    null

  const choisirPage = useCallback((id: string) => {
    setPageId(id)
    // Une selection qui survit au changement de page ferait pointer l'inspecteur sur un
    // element absent de la toile affichee.
    setSelection(null)
  }, [])

  const peutAjouterCalendrier = !aUnCalendrier(pages)

  // Point d'entree UNIQUE de toute modification, avec `remplacerContenu` : tout passe par
  // `majElements`, y compris les operations de liste, et l'historique (tache 8) s'y branche
  // sans toucher aux appelants.
  const idCourant = pageCourante?.id
  const majElements = useCallback(
    (transformer: (elements: PdfElement[]) => PdfElement[]) => {
      setContenu((avant) => ({
        ...avant,
        pages: avant.pages.map((page) =>
          page.kind === 'canvas' && page.id === idCourant
            ? { ...page, elements: transformer(page.elements) }
            : page,
        ),
      }))
    },
    [idCourant],
  )

  const modifierElement = useCallback(
    (elementId: string, champs: Partial<PdfElement>) => {
      majElements((elements) =>
        elements.map((e) =>
          e.id === elementId ? ({ ...e, ...champs } as PdfElement) : e,
        ),
      )
    },
    [majElements],
  )

  const ajouterElement = useCallback(
    (kind: KindElement) => {
      const element = nouvelElement(kind)
      majElements((elements) => [...elements, element])
      setSelection(element.id)
    },
    [majElements],
  )

  const supprimerSelection = useCallback(() => {
    if (!selection) {
      return
    }
    majElements((elements) => elements.filter((e) => e.id !== selection))
    setSelection(null)
  }, [majElements, selection])

  // Meme discipline que `majElements` : un seul endroit modifie la liste des pages, et
  // l'historique de l'etape 2 continue de s'y brancher sans rien savoir de plus.
  const majPages = useCallback(
    (transformer: (pages: PdfPage[]) => PdfPage[]) => {
      setContenu((avant) => ({ ...avant, pages: transformer(avant.pages) }))
    },
    [],
  )

  const ajouterToile = useCallback(() => {
    const page = pageVierge()
    majPages((avant) => ajouterPage(avant, page))
    setPageId(page.id)
    setSelection(null)
  }, [majPages])

  const ajouterCalendrier = useCallback(() => {
    if (!peutAjouterCalendrier) {
      return
    }
    const page = pageCalendrier()
    majPages((avant) => ajouterPage(avant, page))
    setPageId(page.id)
    setSelection(null)
  }, [majPages, peutAjouterCalendrier])

  // On compare a `idCourant`, PAS a `pageId` : tant qu'on n'a pas clique dans la bande,
  // `pageId` est nul et la page affichee est implicite. Supprimer celle-la laissait sinon
  // une selection pointant sur un element qui n'existe plus nulle part.
  const supprimerUnePage = useCallback(
    (id: string) => {
      if (pages.length <= 1) {
        return
      }
      majPages((avant) => supprimerPage(avant, id))
      if (idCourant === id) {
        setPageId(null)
        setSelection(null)
      }
    },
    [majPages, idCourant, pages.length],
  )

  // La page affichee est EPINGLEE avant de toucher a l'ordre : sans cela, une autre toile
  // qui passe devant devient « la premiere toile », et la zone centrale saute sur une page
  // que personne n'a demandee, en laissant la selection sur un element de l'ancienne.
  const deplacerUnePage = useCallback(
    (id: string, sens: SensDePage) => {
      if (idCourant) {
        setPageId(idCourant)
      }
      majPages((avant) => deplacerPage(avant, id, sens))
    },
    [majPages, idCourant],
  )

  // Meme epinglage que ci-dessus, et pour la meme raison : un depot qui fait passer une autre
  // toile devant ferait sauter la zone centrale sur une page que personne n'a demandee.
  // La page courante est gardee PAR IDENTIFIANT, pas par rang — c'est tout le point.
  const deposerPage = useCallback(
    (id: string, cible: number) => {
      if (idCourant) {
        setPageId(idCourant)
      }
      majPages((avant) => reordonnerPages(avant, id, cible))
    },
    [majPages, idCourant],
  )

  // Comme `dupliquerSelection` : la copie se fabrique AVANT la mise a jour, sinon son
  // identifiant arriverait trop tard pour que l'editeur s'y place.
  const dupliquerPageCourante = useCallback(() => {
    if (pageCourante?.kind !== 'canvas') {
      return
    }
    const copie = copieDePage(pageCourante)
    majPages((avant) => insererApres(avant, pageCourante.id, copie))
    setPageId(copie.id)
    setSelection(null)
  }, [majPages, pageCourante])

  // La copie se fabrique AVANT la mise a jour, jamais dans l'updater : React y appelle la
  // fonction au rendu suivant, donc un identifiant pris la-dedans arriverait trop tard pour
  // la selection — et deux fois en mode strict.
  const dupliquerSelection = useCallback(() => {
    // La page courante peut etre le calendrier, qui n'a pas d'elements.
    const original =
      pageCourante?.kind === 'canvas'
        ? pageCourante.elements.find((e) => e.id === selection)
        : undefined
    if (!original) {
      return
    }
    const copie = dupliquerElement(original)
    majElements((elements) => [...elements, copie])
    setSelection(copie.id)
  }, [majElements, pageCourante, selection])

  // L'ordre du tableau EST l'ordre de peinture : le premier plan est la FIN du tableau.
  const changerOrdre = useCallback(
    (sens: 'avant' | 'arriere') => {
      if (!selection) {
        return
      }
      majElements((elements) => {
        const vise = elements.find((e) => e.id === selection)
        if (!vise) {
          return elements
        }
        const autres = elements.filter((e) => e.id !== selection)
        return sens === 'avant' ? [...autres, vise] : [vise, ...autres]
      })
    },
    [majElements, selection],
  )

  const remplacerContenu = useCallback((suivant: PdfDesignContent) => {
    setContenu(suivant)
  }, [])

  // On ne touche PAS a `vu` ici : la requete n'est invalidee qu'apres (`onSettled`), donc la
  // source est encore l'ancien objet du cache. Se dire a jour reveillerait la
  // resynchronisation ci-dessus et ramenerait la version d'avant l'enregistrement — avec,
  // dans la fenetre qui suit, le risque que le geste suivant reparte de la et annule en
  // silence ce qu'on vient d'ecrire.
  const marquerEnregistre = useCallback(() => {
    setEnregistre(contenu)
  }, [contenu])

  return {
    contenu,
    pages,
    pageCourante,
    peutAjouterCalendrier,
    choisirPage,
    ajouterToile,
    ajouterCalendrier,
    supprimerPage: supprimerUnePage,
    deplacerPage: deplacerUnePage,
    deposerPage,
    dupliquerPage: dupliquerPageCourante,
    selection,
    choisirElement: setSelection,
    modifierElement,
    ajouterElement,
    supprimerSelection,
    dupliquerSelection,
    changerOrdre,
    remplacerContenu,
    marquerEnregistre,
    modifie,
  }
}
