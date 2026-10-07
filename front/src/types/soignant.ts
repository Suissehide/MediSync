export type Soignant = {
  id: string
  name: string
  color?: string
}

export type CreateSoignantParams = Pick<Soignant, 'name' | 'color'>
// `name`/`color` facultatifs : une restauration n'envoie que `archived`.
export type UpdateSoignantParams = Pick<Soignant, 'id'> &
  Partial<Pick<Soignant, 'name' | 'color'>> & {
    /** `true` archive, `false` restaure. */
    archived?: boolean
  }
