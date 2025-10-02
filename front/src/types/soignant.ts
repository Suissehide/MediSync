export type Soignant = {
  id: string
  name: string
  color?: string
  active: boolean
}

export type CreateSoignantParams = Pick<Soignant, 'name' | 'color'>
export type UpdateSoignantParams = Pick<
  Soignant,
  'id' | 'name' | 'color' | 'active'
>
