import Boom from '@hapi/boom'

import type { IocContainer } from '../types/application/ioc'
import type {
  PasswordChangeDomain,
  UserDomainInterface,
  UserEntityDomain,
  UserProfileUpdateDomain,
} from '../types/domain/user.domain.interface'
import type {
  UserEntityRepo,
  UserRepositoryInterface,
} from '../types/infra/orm/repositories/user.repository.interface'
import { verifyPassword } from '../utils/hash'

class UserDomain implements UserDomainInterface {
  private readonly userRepository: UserRepositoryInterface

  constructor({ userRepository }: IocContainer) {
    this.userRepository = userRepository
  }

  findByID(userID: string): Promise<UserEntityDomain> {
    return this.userRepository.findByID(userID)
  }

  updateProfile(
    userID: string,
    params: UserProfileUpdateDomain,
  ): Promise<UserEntityRepo> {
    return this.userRepository.updateProfile(userID, params)
  }

  async changePassword(
    userID: string,
    { currentPassword, newPassword }: PasswordChangeDomain,
  ): Promise<void> {
    const user = await this.userRepository.findByID(userID)
    const valid = verifyPassword({
      password: currentPassword,
      salt: user.salt,
      hash: user.password,
    })
    if (!valid) {
      throw Boom.forbidden('Current password is incorrect')
    }
    await this.userRepository.updatePassword(userID, newPassword)
  }
}

export { UserDomain }
