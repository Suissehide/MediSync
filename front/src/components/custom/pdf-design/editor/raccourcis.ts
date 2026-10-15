export type ToucheClavier = {
  key: string
  shiftKey: boolean
  metaKey: boolean
  ctrlKey: boolean
  // Une frappe venue d'un champ de saisie ne commande pas l'editeur : sinon taper « z » dans
  // l'inspecteur annulerait le geste precedent.
  dansUnChamp: boolean
}

export type ActionClavier =
  | { type: 'annuler' }
  | { type: 'retablir' }
  | { type: 'deselectionner' }
  | { type: 'supprimer' }
  | { type: 'deplacer'; dx: number; dy: number }

const FLECHES: Record<string, { dx: number; dy: number }> = {
  ArrowLeft: { dx: -1, dy: 0 },
  ArrowRight: { dx: 1, dy: 0 },
  ArrowUp: { dx: 0, dy: -1 },
  ArrowDown: { dx: 0, dy: 1 },
}

// Une fonction pure plutot qu'un gestionnaire dans le composant : c'est la partie du clavier
// qui porte des decisions, et elle se teste sans monter l'editeur.
export const actionDuClavier = (
  touche: ToucheClavier,
): ActionClavier | null => {
  if (touche.dansUnChamp) {
    return null
  }
  if ((touche.metaKey || touche.ctrlKey) && touche.key.toLowerCase() === 'z') {
    return { type: touche.shiftKey ? 'retablir' : 'annuler' }
  }
  if (touche.key === 'Escape') {
    return { type: 'deselectionner' }
  }
  if (touche.key === 'Delete' || touche.key === 'Backspace') {
    return { type: 'supprimer' }
  }
  const fleche = FLECHES[touche.key]
  if (!fleche) {
    return null
  }
  const pas = touche.shiftKey ? 10 : 1
  return { type: 'deplacer', dx: fleche.dx * pas, dy: fleche.dy * pas }
}

export const CHAMPS_DE_SAISIE = ['INPUT', 'TEXTAREA', 'SELECT']
