import type { UserEntityRepo } from '../infra/orm/repositories/user.repository.interface'

export type UserEntityDomain = UserEntityRepo
export type UserDTO = Pick<UserEntityRepo, 'email' | 'firstname' | 'lastname'>

export interface UserDomainInterface {
  findByID(id: string): Promise<UserEntityDomain>
}
