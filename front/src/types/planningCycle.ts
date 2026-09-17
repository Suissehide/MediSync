export type PlanningCycle = {
  /** Lundi de la semaine de départ, au format ISO renvoyé par l'API. */
  startOfWeek: string
  /** Longueur du cycle, en semaines (1 à 52). */
  weekCount: number
}
