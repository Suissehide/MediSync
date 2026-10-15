import { A4_HEIGHT, A4_WIDTH } from '../../../../types/pdfDesign.ts'

export type Poignee = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'
export type Boite = { x: number; y: number; w: number; h: number }

// Plancher d'une boite. Sans lui, tirer une poignee au-dela du bord oppose retourne la
// boite : largeur negative, element invisible, coordonnees absurdes enregistrees en base.
export const TAILLE_MINIMALE = 4
export const TOLERANCE_AIMANT = 4

// Les coordonnees d'un design sont en points entiers : la toile est rendue a l'echelle, donc
// un delta d'un pixel vaut une fraction de point, et sans arrondi un simple glissement
// enregistrerait des coordonnees a dix decimales.
const auPoint = (v: number) => Math.round(v)

export const deplacer = (
  depart: Boite,
  dxEcran: number,
  dyEcran: number,
  echelle: number,
): Boite => ({
  ...depart,
  x: auPoint(depart.x + dxEcran / echelle),
  y: auPoint(depart.y + dyEcran / echelle),
})

export const redimensionner = (
  depart: Boite,
  poignee: Poignee,
  dxEcran: number,
  dyEcran: number,
  echelle: number,
): Boite => {
  const dx = dxEcran / echelle
  const dy = dyEcran / echelle
  const gauche = poignee.includes('w')
  const droite = poignee.includes('e')
  const haut = poignee.startsWith('n')
  const bas = poignee.startsWith('s')

  // On raisonne en BORDS plutot qu'en origine + taille : le bord oppose a la poignee ne
  // bouge pas, par definition, et le plancher s'applique alors sans cas particulier.
  const bordDroit = depart.x + depart.w
  const bordBas = depart.y + depart.h

  const x = gauche
    ? Math.min(depart.x + dx, bordDroit - TAILLE_MINIMALE)
    : depart.x
  const y = haut ? Math.min(depart.y + dy, bordBas - TAILLE_MINIMALE) : depart.y
  const w = droite ? Math.max(depart.w + dx, TAILLE_MINIMALE) : bordDroit - x
  const h = bas ? Math.max(depart.h + dy, TAILLE_MINIMALE) : bordBas - y

  return { x: auPoint(x), y: auPoint(y), w: auPoint(w), h: auPoint(h) }
}

// Lignes auxquelles une boite se colle : les deux bords de la page, les deux axes medians,
// et les bords des voisins. L'aimantation ne touche QUE l'origine : redimensionner et
// aimanter en meme temps rendrait un geste illisible.
const lignes = (voisins: Boite[]) => ({
  verticales: [
    0,
    A4_WIDTH,
    A4_WIDTH / 2,
    ...voisins.flatMap((v) => [v.x, v.x + v.w, v.x + v.w / 2]),
  ],
  horizontales: [
    0,
    A4_HEIGHT,
    A4_HEIGHT / 2,
    ...voisins.flatMap((v) => [v.y, v.y + v.h, v.y + v.h / 2]),
  ],
})

const debutColle = (rang: number, cible: number, taille: number) => {
  if (rang === 0) {
    return cible
  }
  return rang === 1 ? cible - taille / 2 : cible - taille
}

const colle = (
  debut: number,
  taille: number,
  candidats: number[],
  tolerance: number,
): number => {
  // Trois reperes de la boite peuvent accrocher : son bord debut, son centre, son bord fin.
  const reperes = [debut, debut + taille / 2, debut + taille]
  let meilleur: { ecart: number; debut: number } | null = null
  for (const [rang, repere] of reperes.entries()) {
    for (const cible of candidats) {
      const ecart = Math.abs(repere - cible)
      if (ecart > tolerance) {
        continue
      }
      if (!meilleur || ecart < meilleur.ecart) {
        meilleur = { ecart, debut: debutColle(rang, cible, taille) }
      }
    }
  }
  return meilleur ? meilleur.debut : debut
}

export const aimanter = (
  boite: Boite,
  voisins: Boite[],
  tolerance = TOLERANCE_AIMANT,
): Boite => {
  const { verticales, horizontales } = lignes(voisins)
  return {
    ...boite,
    x: colle(boite.x, boite.w, verticales, tolerance),
    y: colle(boite.y, boite.h, horizontales, tolerance),
  }
}
