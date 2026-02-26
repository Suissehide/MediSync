export type Thematic = {
  id: string
  name: string
  soignants: { id: string; name: string }[]
}

export type CreateThematicParams = {
  name: string
  soignantIDs: string[]
}

export type UpdateThematicParams = {
  id: string
  name?: string
  soignantIDs?: string[]
}
