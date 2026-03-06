export type ActivityLog = {
  id: string
  userID: string
  userFirstName: string | null
  userLastName: string | null
  action: string
  entityType: string
  entityID: string
  createdAt: string
}

export type ActivityLogsResponse = {
  data: ActivityLog[]
  total: number
  page: number
}
