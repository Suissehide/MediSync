export type Thematic = {
  id: string
  name: string
  duration?: number | null
  soignants: { id: string; name: string }[]
}

export type CreateThematicParams = {
  name: string
  duration?: number | null
  soignantIDs: string[]
}

export type UpdateThematicParams = {
  id: string
  name?: string
  duration?: number | null
  soignantIDs?: string[]
}
