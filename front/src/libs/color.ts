export function hexToRGBA(hex: string, alpha: number) {
  const r = Number.parseInt(hex.slice(1, 3), 16)
  const g = Number.parseInt(hex.slice(3, 5), 16)
  const b = Number.parseInt(hex.slice(5, 7), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

export function parseRGBA(rgbaStr: string): string {
  const match = rgbaStr.match(
    /rgba?\((\d+),\s*(\d+),\s*(\d+),?\s*(\d*\.?\d+)?\)/,
  )
  if (!match) {
    return ''
  }

  const [, r, g, b, a] = match
  return rgbaToHex(
    Number.parseInt(r),
    Number.parseInt(g),
    Number.parseInt(b),
    a !== undefined ? Number.parseFloat(a) : 1,
  )
}

export function rgbaToHex(r: number, g: number, b: number, a = 1): string {
  const toHex = (n: number) => n.toString(16).padStart(2, '0')
  const alpha = Math.round(a * 255)
  return `#${toHex(r)}${toHex(g)}${toHex(b)}${toHex(alpha)}`
}

export function darkenHex(hex: string, amount = 0.3): string {
  const r = Math.round(Number.parseInt(hex.slice(1, 3), 16) * (1 - amount))
  const g = Math.round(Number.parseInt(hex.slice(3, 5), 16) * (1 - amount))
  const b = Math.round(Number.parseInt(hex.slice(5, 7), 16) * (1 - amount))
  const toHex = (n: number) => n.toString(16).padStart(2, '0')
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

export function getContrastTextColor(hex: string): string {
  const r = Number.parseInt(hex.slice(1, 3), 16)
  const g = Number.parseInt(hex.slice(3, 5), 16)
  const b = Number.parseInt(hex.slice(5, 7), 16)
  const brightness = (r * 299 + g * 587 + b * 114) / 1000
  return brightness > 125 ? '#000' : '#fff'
}

// Couleur d'un soignant dans la palette, d'après son rang dans la liste du service
// (triée par id : un nouveau soignant ne décale pas les couleurs des autres).
// ponytail: au-delà de 24 soignants les couleurs se répètent ; ajouter une couleur en base si besoin.
// Paires [teinte, texte foncé de la même teinte] : le texte reste lisible sur le fond pâle.
const PALETTE_SOIGNANTS: [string, string][] = [
  ['#3b82f6', '#1e40af'],
  ['#10b981', '#065f46'],
  ['#f59e0b', '#92400e'],
  ['#ef4444', '#991b1b'],
  ['#8b5cf6', '#5b21b6'],
  ['#06b6d4', '#155e75'],
  ['#ec4899', '#9d174d'],
  ['#84cc16', '#3f6212'],
  ['#f97316', '#9a3412'],
  ['#64748b', '#1e293b'],
  ['#14b8a6', '#115e59'],
  ['#eab308', '#713f12'],
  ['#0ea5e9', '#075985'],
  ['#f43f5e', '#9f1239'],
  ['#d946ef', '#86198f'],
  ['#6366f1', '#3730a3'],
  ['#a855f7', '#6b21a8'],
  ['#22c55e', '#166534'],
  ['#78716c', '#292524'],
  ['#a16207', '#422006'],
  ['#1e3a8a', '#1e3a8a'],
  ['#7f1d1d', '#7f1d1d'],
  ['#4d7c0f', '#365314'],
  ['#701a75', '#701a75'],
]

export function styleSoignant(id: string, soignantIDs: string[]) {
  const rang = [...soignantIDs].sort().indexOf(id)
  if (rang === -1) {
    return undefined
  }
  const [teinte, texte] = PALETTE_SOIGNANTS[rang % PALETTE_SOIGNANTS.length]
  return {
    backgroundColor: hexToRGBA(teinte, 0.15),
    borderColor: hexToRGBA(teinte, 0.5),
    color: texte,
  }
}
