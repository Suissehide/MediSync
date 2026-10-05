export type ActivityLog = {
  id: string
  userID: string
  userFirstName: string | null
  userLastName: string | null
  // Rendu par le journal de l'administration d'établissement seulement (nul pour une opération
  // sans service) ; absent du détail d'établissement du super-admin.
  serviceId?: string | null
  action: string
  entityType: string
  entityID: string
  // Ce que la ligne designe, en clair. Absent du detail d'etablissement du super-admin.
  detail?: string | null
  createdAt: string
}

export type ActivityLogsResponse = {
  data: ActivityLog[]
  total: number
  page: number
  pageSize?: number
}
