import type { MeResponse } from '../../utils/me-mapper'

export type CreateUserInput = {
  email: string
  password: string
  firstName?: string
  lastName?: string
}
export type SignInResponse = {
  accessToken: string
  refreshToken: string
  me: MeResponse
}
export type SignOutResponse = {
  success: boolean
}
export type RegisterResponse = {
  success: boolean
}

export interface AuthDomainInterface {
  signIn: (email: string, password: string) => Promise<SignInResponse>
  refresh: (refreshToken: string) => Promise<SignInResponse>
  signOut: () => SignOutResponse
  register: (createUserInput: CreateUserInput) => Promise<RegisterResponse>
}
