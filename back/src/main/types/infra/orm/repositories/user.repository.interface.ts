import type {
  Establishment,
  EstablishmentMembership,
  Service,
  ServiceMembership,
  User,
} from '../../../../../generated/client'

export type UserEntityRepo = User
export type UserWithMemberships = User & {
  establishmentMemberships: (EstablishmentMembership & {
    establishment: Establishment
    serviceMemberships: (ServiceMembership & { service: Service })[]
  })[]
}
export type UserCreateEntityRepo = {
  email: string
  password: string
  firstName?: string
  lastName?: string
}
export type UserProfileUpdateRepo = { firstName?: string; lastName?: string }

export interface UserRepositoryInterface {
  findByID: (userId: string) => Promise<UserWithMemberships>
  findByEmail: (email: string) => Promise<UserEntityRepo>
  create: (user: UserCreateEntityRepo) => Promise<UserEntityRepo>
  updateProfile: (
    userID: string,
    params: UserProfileUpdateRepo,
  ) => Promise<UserEntityRepo>
  updatePassword: (userID: string, password: string) => Promise<void>
  setDeactivated: (userID: string, at: Date | null) => Promise<UserEntityRepo>
}
