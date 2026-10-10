export type PlanningCycle = {
  /** Lundi de la semaine de départ, au format ISO renvoyé par l'API. */
  startOfWeek: string
  /** Longueur du cycle, en semaines (1 à 52). */
  weekCount: number
  /** Semaines interdites, exclues du décompte ; ajoutées par usePlanningCycleQueries, jamais envoyées à l'API. */
  forbiddenWeekStarts?: string[]
}
