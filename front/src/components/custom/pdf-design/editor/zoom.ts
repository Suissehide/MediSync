// Les paliers du zoom de l'editeur. L'echelle AJUSTEE n'en est pas un : elle depend de la
// fenetre et vaut ce qu'il faut pour que la page entiere tienne dans le cadre, donc elle tombe
// presque toujours entre deux paliers.
export const PALIERS_DE_ZOOM = [0.25, 0.5, 0.75, 1, 1.5, 2]

// Deux echelles qui ne different que par l'arrondi sont la meme : sans cette marge, zoomer
// depuis un palier atteint par calcul (0,9999999) rendrait ce meme palier.
const MARGE = 0.001

// Le palier STRICTEMENT suivant dans le sens demande, ou l'echelle courante aux extremites —
// la fonction ne ment pas, c'est au bouton de se desarmer.
export const palierSuivant = (echelle: number, sens: 1 | -1): number => {
  const candidats =
    sens === 1
      ? PALIERS_DE_ZOOM.filter((palier) => palier > echelle + MARGE)
      : [...PALIERS_DE_ZOOM].reverse().filter((p) => p < echelle - MARGE)
  return candidats[0] ?? echelle
}
