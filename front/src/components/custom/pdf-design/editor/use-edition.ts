import { useCallback, useMemo, useState } from 'react'

import type {
  PdfCanvasPage,
  PdfDesignContent,
  PdfElement,
} from '../../../../types/pdfDesign.ts'
import {
  dupliquerElement,
  type KindElement,
  nouvelElement,
} from './elements.ts'

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

  const pagesEditables = useMemo(
    () => contenu.pages.filter((p): p is PdfCanvasPage => p.kind === 'canvas'),
    [contenu],
  )

  // Le calendrier n'est pas composable : l'editeur ouvre sur la premiere TOILE.
  const pageCourante =
    pagesEditables.find((p) => p.id === pageId) ?? pagesEditables[0] ?? null

  const choisirPage = useCallback((id: string) => {
    setPageId(id)
    // Une selection qui survit au changement de page ferait pointer l'inspecteur sur un
    // element absent de la toile affichee.
    setSelection(null)
  }, [])

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

  // La copie se fabrique AVANT la mise a jour, jamais dans l'updater : React y appelle la
  // fonction au rendu suivant, donc un identifiant pris la-dedans arriverait trop tard pour
  // la selection — et deux fois en mode strict.
  const dupliquerSelection = useCallback(() => {
    const original = pageCourante?.elements.find((e) => e.id === selection)
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
    pagesEditables,
    pageCourante,
    choisirPage,
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
