import { useCallback, useRef, useState } from 'react'

import type { PdfDesignContent } from '../../../../types/pdfDesign.ts'

// ponytail: plafond assume — pile d'instantanes bornee a 50. Des instantanes du JSON plutot
// que des patches inversibles : le document est petit (quelques dizaines d'elements), et un
// instantane ne peut pas diverger de l'etat reel, la ou un patch mal ecrit le peut en silence.
// Si un design grossit au point que la memoire gene, passer aux patches ; pas avant.
export const LIMITE = 50

// Un geste emet des dizaines de changements par seconde. Sans regroupement, un seul
// glissement remplirait la pile et « Annuler » reculerait d'un pixel a la fois.
export const REGROUPEMENT = 400

export function useHistorique(
  remplacerContenu: (contenu: PdfDesignContent) => void,
) {
  // La pile vit dans une ref : la pousser ne doit RIEN redessiner, elle est alimentee a
  // chaque geste. Seuls les deux booleens affichables passent par un etat.
  const pile = useRef<PdfDesignContent[]>([])
  const curseur = useRef(-1)
  const [bornes, setBornes] = useState({
    peutAnnuler: false,
    peutRetablir: false,
  })

  // Stable : ne lit que des refs, donc aucune dependance a declarer chez ses appelants.
  const publier = useCallback(() => {
    setBornes({
      peutAnnuler: curseur.current > 0,
      peutRetablir: curseur.current < pile.current.length - 1,
    })
  }, [])

  const pousser = useCallback(
    (contenu: PdfDesignContent) => {
      // Le futur est oublie : sans cela « Retablir » ramenerait un etat qui n'a jamais suivi
      // celui qu'on voit.
      const passe = pile.current.slice(0, curseur.current + 1)
      const suivante = [...passe, contenu].slice(-LIMITE)
      pile.current = suivante
      curseur.current = suivante.length - 1
      publier()
    },
    [publier],
  )

  const annuler = useCallback(() => {
    if (curseur.current <= 0) {
      return
    }
    curseur.current -= 1
    const cible = pile.current[curseur.current]
    if (cible) {
      remplacerContenu(cible)
    }
    publier()
  }, [remplacerContenu, publier])

  const retablir = useCallback(() => {
    if (curseur.current >= pile.current.length - 1) {
      return
    }
    curseur.current += 1
    const cible = pile.current[curseur.current]
    if (cible) {
      remplacerContenu(cible)
    }
    publier()
  }, [remplacerContenu, publier])

  // Le point de branchement de l'editeur : appele a chaque rendu, il ne retient qu'un
  // instantane par rafale, et jamais celui qu'`annuler`/`retablir` vient de restaurer —
  // sinon l'etat annule reviendrait aussitot dans la pile et « Annuler » ne remonterait
  // jamais plus d'un cran.
  const attente = useRef<ReturnType<typeof setTimeout> | null>(null)
  const synchroniser = useCallback(
    (contenu: PdfDesignContent) => {
      if (contenu === pile.current[curseur.current]) {
        return
      }
      if (attente.current) {
        clearTimeout(attente.current)
      }
      // Le tout premier etat entre sans attendre : c'est le point de retour.
      if (pile.current.length === 0) {
        pousser(contenu)
        return
      }
      attente.current = setTimeout(() => pousser(contenu), REGROUPEMENT)
    },
    [pousser],
  )

  return { pousser, synchroniser, annuler, retablir, ...bornes }
}
