import type { Config } from '../types/application/config'
import type { IocContainer } from '../types/application/ioc'

import type {
  AuthDomainInterface,
  CreateUserInput,
  RegisterResponse,
  SignInResponse,
  SignOutResponse,
} from '../types/domain/auth.domain.interface'
import type { Logger } from '../types/utils/logger'
import type { UserRepositoryInterface } from '../types/infra/orm/repositories/user.repository.interface'
import { verifyPassword } from '../utils/hash'
import { generateJwt, verifyJwt } from '../utils/auth-helper'
import Boom from '@hapi/boom'
import type { JwtPayload } from '../types/interfaces/http/fastify/plugins/jwt.plugin'

class AuthDomain implements AuthDomainInterface {
  private readonly logger: Logger
  private readonly userRepository: UserRepositoryInterface
  private readonly config: Config

  constructor({ userRepository, config, logger }: IocContainer) {
    this.userRepository = userRepository
    this.config = config
    this.logger = logger
  }

  async signIn(email: string, password: string): Promise<SignInResponse> {
    const user = await this.userRepository.findByEmail(email)
    if (!user) {
      this.logger.error('Auth error: invalid email or password')
      throw Boom.unauthorized('Invalid email or password')
    }
    const isValidPassword = verifyPassword({
      password,
      salt: user.salt,
      hash: user.password,
    })
    if (!isValidPassword) {
      this.logger.error('Auth error: invalid email or password')
      throw Boom.unauthorized('Invalid email or password')
    }

    const payload = {
      userID: user.id,
    }
    const { jwtSecret, jwtRefreshSecret, jwtExpiresIn, jwtRefreshExpiresIn } =
      this.config

    const accessToken = generateJwt(payload, jwtSecret, {
      expiresIn: jwtExpiresIn,
    })
    const refreshToken = generateJwt(payload, jwtRefreshSecret, {
      expiresIn: jwtRefreshExpiresIn,
    })

    return {
      accessToken,
      refreshToken,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
    }
  }

  async refresh(refreshToken: string): Promise<SignInResponse> {
    const { jwtRefreshSecret, jwtSecret, jwtExpiresIn, jwtRefreshExpiresIn } =
      this.config

    let payload: JwtPayload
    try {
      payload = verifyJwt<JwtPayload>(refreshToken, jwtRefreshSecret)
    } catch (err) {
      this.logger.warn(`Refresh token invalid or expired: ${err}`)
      throw Boom.unauthorized('Invalid refresh token')
    }

    const user = await this.userRepository.findByID(payload.userID)
    if (!user) {
      this.logger.error('User not found for this refresh token')
      throw Boom.unauthorized('Invalid refresh token')
    }

    const newAccessToken = generateJwt({ userID: user.id }, jwtSecret, {
      expiresIn: jwtExpiresIn,
    })

    const newRefreshToken = generateJwt({ userID: user.id }, jwtRefreshSecret, {
      expiresIn: jwtRefreshExpiresIn,
    })

    return {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
    }
  }

  async register(createUserInput: CreateUserInput): Promise<RegisterResponse> {
    await this.userRepository.create(createUserInput)
    return {
      success: true,
    }
  }

  signOut(): SignOutResponse {
    return {
      success: true,
    }
  }
}

export { AuthDomain }
