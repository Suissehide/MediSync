// Phrase qui nomme ce qui empeche une suppression definitive. Le refus lui-meme
// vient de la base (`onDelete: Restrict`) ; ce comptage ne sert qu'a dire
// POURQUOI, en francais et avec les nombres.
type Reference = { count: number; singulier: string; pluriel: string }

const accorde = ({ count, singulier, pluriel }: Reference) =>
  `${count} ${count > 1 ? pluriel : singulier}`

export const phraseDesReferences = (references: Reference[]): string | null => {
  const utilisees = references.filter((r) => r.count > 0).map(accorde)
  if (utilisees.length === 0) {
    return null
  }
  const dernier = utilisees.pop() as string
  return utilisees.length === 0
    ? dernier
    : `${utilisees.join(', ')} et ${dernier}`
}
