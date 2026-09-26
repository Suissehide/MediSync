export type QueryState = 'pending' | 'error' | 'empty' | 'ready'

interface QueryStateInput {
  isPending: boolean
  error: unknown
  hasData: boolean
}

// Tour de correction 1, Important n°4 : nomme distinctement les quatre
// situations qu'un écran alimenté par une requête peut traverser. Une garde
// qui ne teste que `isPending || !data` confond deux d'entre elles : avec
// `retry: 0` (convention de ce dépôt), une requête en échec repasse
// `isPending` à `false` sans jamais poser de donnée — cette garde reste
// alors vraie indéfiniment, et l'écran affiche « Chargement… » pour
// toujours devant une erreur réelle (identifiant supprimé, back injoignable...).
// `isPending` est vérifié EN PREMIER : une erreur d'une requête précédente
// ne doit pas s'afficher pendant qu'une nouvelle tentative est en cours.
export const queryState = ({ isPending, error, hasData }: QueryStateInput): QueryState => {
  if (isPending) {
    return 'pending'
  }
  if (error) {
    return 'error'
  }
  if (!hasData) {
    return 'empty'
  }
  return 'ready'
}
