// Jour de Paris fige au chargement : un test qui passe minuit garde les memes valeurs.
const AUJOURDHUI = new Date().toLocaleDateString('sv-SE', {
  timeZone: 'Europe/Paris',
})

// Valeur STOCKEE d'une seance (heure murale de Paris ecrite en UTC), `jours` apres aujourd'hui.
export const futur = (jours: number, heure = '09:00'): string => {
  const d = new Date(`${AUJOURDHUI}T${heure}:00.000Z`)
  d.setUTCDate(d.getUTCDate() + jours)
  return d.toISOString()
}
