import type {
  UserEntityRepo,
  UserWithMemberships,
} from '../infra/orm/repositories/user.repository.interface'

export type UserEntityDomain = UserWithMemberships
export type UserProfileUpdateDomain = { firstName?: string; lastName?: string }
export type PasswordChangeDomain = {
  currentPassword: string
  newPassword: string
}

export interface UserDomainInterface {
  findByID: (userID: string) => Promise<UserEntityDomain>
  updateProfile: (
    userID: string,
    params: UserProfileUpdateDomain,
  ) => Promise<UserEntityRepo>
  changePassword: (
    userID: string,
    params: PasswordChangeDomain,
  ) => Promise<void>
}
