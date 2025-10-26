export type User = {
  id: string
  email: string
  firstName?: string
  lastName?: string
  role?: Role
}

export type Role = 'NONE' | 'USER' | 'ADMIN'

export type AuthState = {
  isAuthenticated: boolean
  user: User | null
}

export type RegisterInput = {
  password: string
} & User

export type LoginInput = {
  email: string
  password: string
}

export type UpdateUserParams = User
