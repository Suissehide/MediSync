export type User = {
  id: string
  email: string
  firstName?: string
  lastName?: string
  role: Role
  soignantId?: string | null
}

export type Role = 'NONE' | 'USER' | 'ADMIN'

export type AuthState = {
  isAuthenticated: boolean
  user: User | null
}

export type RegisterInput = Pick<User, 'email' | 'firstName' | 'lastName' | 'soignantId'> & {
  password: string
}

export type LoginInput = {
  email: string
  password: string
}

export type UpdateUserParams = {
  id: string
  email?: string
  firstName?: string
  lastName?: string
  role?: Role
  soignantId?: string | null
}
