export type AuthState = { isAuthenticated: boolean; user: User | null }

export type User = {
  email: string
  firstname?: string
  lastname?: string
}

export type RegisterInput = {
  password: string
} & User

export type LoginInput = {
  email: string
  password: string
}
