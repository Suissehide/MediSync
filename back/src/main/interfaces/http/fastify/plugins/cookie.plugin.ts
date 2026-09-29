import fastifyCookie, { type FastifyCookieOptions } from '@fastify/cookie'
import Boom from '@hapi/boom'
import type {
  FastifyInstance,
  FastifyRequest,
  preHandlerAsyncHookHandler,
} from 'fastify'
import type { FastifyPluginAsync } from 'fastify/types/plugin'
import fastifyPlugin from 'fastify-plugin'

import type { UserEntityDomain } from '../../../../types/domain/user.domain.interface'
import type { JwtPayload } from '../../../../types/interfaces/http/fastify/plugins/jwt.plugin'
import { hashSecret, verifyJwt } from '../../../../utils/auth-helper'

declare module 'fastify' {
  export interface FastifyRequest {
    user: JwtPayload
    currentUser: UserEntityDomain
  }
}

declare module 'fastify' {
  export interface FastifyInstance {
    verifySessionCookie: preHandlerAsyncHookHandler
  }
}

const isNotFound = (error: unknown): boolean =>
  Boom.isBoom(error) && error.output.statusCode === 404

const cookiePreHandler = async function (
  this: FastifyInstance,
  request: FastifyRequest,
): Promise<void> {
  // La garde globale de routes/index.ts couvre toute requête protégée ; plus
  // aucune route ne déclare `verifySessionCookie` en local (tâche 15). Le
  // court-circuit reste par sûreté : une double déclaration ne doit pas
  // relancer la vérification.
  if (request.currentUser) {
    return
  }

  const { config, userDomain } = this.iocContainer
  const { jwtSecret } = config
  if (!jwtSecret) {
    throw Boom.unauthorized('missing jwtSecret in config')
  }

  const accessToken = request.cookies.access_token
  if (!accessToken) {
    throw Boom.unauthorized('Missing cookie')
  }

  try {
    const jwtPayload = verifyJwt<JwtPayload>(accessToken, jwtSecret)
    this.log.trace({ jwtPayload }, 'JWT payload in cookiePreHandler')
    request.user = jwtPayload
  } catch {
    throw Boom.unauthorized('Invalid cookie')
  }

  // Une signature valide ne prouve pas que le compte existe encore : sans ce
  // contrôle, un utilisateur supprimé garde l'accès jusqu'à expiration du
  // jeton. Hors du try ci-dessus, pour ne pas masquer l'erreur en « Invalid
  // cookie ».
  request.currentUser = await userDomain
    .findByID(request.user.userID)
    .catch((error: unknown) => {
      if (isNotFound(error)) {
        throw Boom.unauthorized('Unknown user')
      }
      throw error
    })

  // Un compte désactivé garde un jeton valide jusqu'à son expiration : ce
  // contrôle lui refuse l'accès dès la prochaine requête authentifiée.
  if (request.currentUser.deactivatedAt) {
    throw Boom.unauthorized('Account deactivated')
  }
}

const cookiePlugin: FastifyPluginAsync = fastifyPlugin(
  async (fastify: FastifyInstance) => {
    const { iocContainer, log } = fastify
    const { config } = iocContainer
    const { cookieSecret } = config
    if (!cookieSecret) {
      throw new Error('missing cookieSecret in config')
    }
    log.trace('Registering cookie plugin')
    const secret = hashSecret(cookieSecret)
    const cookieOptions: FastifyCookieOptions = {
      secret,
      hook: 'onRequest',
    }
    await fastify.register(fastifyCookie, cookieOptions)
    fastify.decorate('verifySessionCookie', cookiePreHandler)
    log.debug('Cookie plugin successfully registered')
  },
)

export { cookiePlugin }
