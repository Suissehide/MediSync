export const nombre = (n: number): string => String(n).replace('.', ',')

// Un libellé saisi par l'équipe qui commence par `=`, `+`, `-`, `@`, une tabulation ou un retour
// chariot est préfixé d'une apostrophe : le tableur le lit alors comme du texte, pas une formule.
const neutralise = (v: string): string => (/^[=+\-@\t\r]/.test(v) ? `'${v}` : v)

const champ = (v: string): string =>
  /[;"\r\n]/.test(v) ? `"${v.split('"').join('""')}"` : v

// BOM et point-virgule : Excel en français ouvre le fichier sans assistant d'import. `libres` :
// les colonnes qui portent du texte saisi par l'équipe, les seules à neutraliser.
export const toCsv = (lignes: string[][], libres: number[]): string =>
  `﻿${lignes
    .map((l) =>
      l.map((v, i) => champ(libres.includes(i) ? neutralise(v) : v)).join(';'),
    )
    .join('\r\n')}\r\n`

// Lettres, chiffres et tirets : le nom du service devient un segment de nom de fichier.
export const slugify = (nom: string): string =>
  nom
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'service'

export const telecharger = (blob: Blob, nom: string) => {
  const href = URL.createObjectURL(blob)
  const lien = document.createElement('a')
  lien.href = href
  lien.download = nom
  lien.click()
  URL.revokeObjectURL(href)
}

export const telechargerCsv = (contenu: string, nom: string) =>
  telecharger(new Blob([contenu], { type: 'text/csv;charset=utf-8' }), nom)
