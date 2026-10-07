export type Location = {
  id: string
  name: string
}

export type CreateLocationParams = {
  name: string
}

export type UpdateLocationParams = {
  id: string
  name?: string
  /** `true` archive, `false` restaure. */
  archived?: boolean
}
