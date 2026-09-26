import Boom from '@hapi/boom'

import type { Config } from '../types/application/config'
import type { IocContainer } from '../types/application/ioc'
import type {
  AuthDomainInterface,
  CreateUserInput,
  RegisterResponse,
  SignInResponse,
  SignOutResponse,
} from '../types/domain/auth.domain.interface'
import type { AccessGrantRepositoryInterface } from '../types/infra/orm/repositories/accessGrant.repository.interface'
import type { UserRepositoryInterface } from '../types/infra/orm/repositories/user.repository.interface'
import type { JwtPayload } from '../types/interfaces/http/fastify/plugins/jwt.plugin'
import type { Logger } from '../types/utils/logger'
import { generateJwt, verifyJwt } from '../utils/auth-helper'
import { verifyPassword } from '../utils/hash'
import { toMeResponse } from '../utils/me-mapper'
import { liveGrantsForUser } from './accessGrant.domain'

const isNotFound = (error: unknown): boolean =>
  Boom.isBoom(error) && error.output.statusCode === 404

class AuthDomain implements AuthDomainInterface {
  private readonly logger: Logger
  private readonly userRepository: UserRepositoryInterface
  private readonly accessGrantRepository: AccessGrantRepositoryInterface
  private readonly config: Config

  // Constantes pour éviter les timing attacks
  private readonly DUMMY_SALT = '$2b$10$dummysaltfordummyhash'
  private readonly DUMMY_HASH =
    '$2b$10$dummysaltfordummyhash.dummyhashdummyhashdummyhash'

  constructor({
    userRepository,
    accessGrantRepository,
    config,
    logger,
  }: IocContainer) {
    this.userRepository = userRepository
    this.accessGrantRepository = accessGrantRepository
    this.config = config
    this.logger = logger
  }

  private generateTokens(userID: string): {
    accessToken: string
    refreshToken: string
  } {
    const { jwtSecret, jwtRefreshSecret, jwtExpiresIn, jwtRefreshExpiresIn } =
      this.config

    return {
      accessToken: generateJwt({ userID }, jwtSecret, {
        expiresIn: jwtExpiresIn,
      }),
      refreshToken: generateJwt({ userID }, jwtRefreshSecret, {
        expiresIn: jwtRefreshExpiresIn,
      }),
    }
  }

  async signIn(email: string, password: string): Promise<SignInResponse> {
    // Adresse inconnue : `findByEmail` lève un 404 (findUniqueOrThrow), qu'on
    // intercepte ici pour retomber sur `null`, exactement comme `refresh` le
    // fait déjà pour un utilisateur disparu. On garde ainsi une seule forme
    // d'interface (`findByEmail` continue de renvoyer `UserEntityRepo`, sans
    // `| null`) et un seul endroit qui sait transformer « absent » en
    // « identifiants invalides ».
    const user = await this.userRepository
      .findByEmail(email)
      .catch((err: unknown) => {
        if (isNotFound(err)) {
          return null
        }
        throw err
      })

    // Protection contre les timing attacks : la vérification du mot de passe
    // s'exécute toujours, même quand l'utilisateur n'existe pas, pour que les
    // deux chemins (adresse inconnue / mot de passe erroné) coûtent le même
    // temps et renvoient la même erreur.
    const isValidPassword = verifyPassword({
      password,
      salt: user?.salt ?? this.DUMMY_SALT,
      hash: user?.password ?? this.DUMMY_HASH,
    })

    if (!user || !isValidPassword) {
      this.logger.warn(`Failed login attempt for email: ${email}`)
      throw Boom.unauthorized('Invalid email or password')
    }

    // Ce contrôle n'intervient qu'une fois le mot de passe vérifié : il ne
    // révèle donc rien à quiconque ne connaît pas déjà les identifiants
    // valides, et ne rouvre pas la fuite corrigée ci-dessus.
    if (user.deactivatedAt) {
      throw Boom.unauthorized('Account deactivated')
    }

    // Tâche 7 (étape 4a) : posée ICI, une fois le mot de passe vérifié et le compte confirmé
    // actif — jamais sur `refresh`, qui ne redémontre aucun secret. Sans cette écriture,
    // `User.lastLoginAt` reste vide pour tout le monde et la liste du super-admin affiche
    // « jamais » à chaque établissement, quelle que soit son activité réelle (spec §3.3).
    await this.userRepository.recordLogin(user.id, new Date())

    const full = await this.userRepository.findByID(user.id)
    const grants = await liveGrantsForUser(user.id, this.accessGrantRepository)
    const { accessToken, refreshToken } = this.generateTokens(user.id)

    return {
      accessToken,
      refreshToken,
      me: toMeResponse(full, grants, new Date()),
    }
  }

  async refresh(currentRefreshToken: string): Promise<SignInResponse> {
    const { jwtRefreshSecret } = this.config

    let payload: JwtPayload
    try {
      payload = verifyJwt<JwtPayload>(currentRefreshToken, jwtRefreshSecret)
    } catch (err) {
      this.logger.warn(`Refresh token invalid or expired: ${err}`)
      throw Boom.unauthorized('Invalid refresh token')
    }

    // findByID lève un 404 quand le compte a disparu ; ici c'est le jeton qui
    // n'est plus valide, pas une ressource manquante.
    const user = await this.userRepository
      .findByID(payload.userID)
      .catch((err: unknown) => {
        if (isNotFound(err)) {
          return null
        }
        throw err
      })
    if (!user) {
      this.logger.warn('User not found for this refresh token')
      throw Boom.unauthorized('Invalid refresh token')
    }

    if (user.deactivatedAt) {
      throw Boom.unauthorized('Account deactivated')
    }

    const grants = await liveGrantsForUser(user.id, this.accessGrantRepository)
    const { accessToken, refreshToken } = this.generateTokens(user.id)

    return {
      accessToken,
      refreshToken,
      me: toMeResponse(user, grants, new Date()),
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
