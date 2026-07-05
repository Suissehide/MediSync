import type { FastifyPluginAsync } from 'fastify/types/plugin'
import fastifyPlugin from 'fastify-plugin'
import type {
  FastifyInstance,
  FastifyRequest,
  preHandlerAsyncHookHandler,
} from 'fastify'
import { hashSecret, verifyJwt } from '../../../../utils/auth-helper'
import fastifyCookie, { type FastifyCookieOptions } from '@fastify/cookie'
import Boom from '@hapi/boom'
import { Role } from '../../../../../generated/enums'
import type { JwtPayload } from '../../../../types/interfaces/http/fastify/plugins/jwt.plugin'

declare module 'fastify' {
  export interface FastifyRequest {
    user: JwtPayload
  }
}

declare module 'fastify' {
  export interface FastifyInstance {
    verifySessionCookie: preHandlerAsyncHookHandler
    requireMinRole: (minRole: Role) => preHandlerAsyncHookHandler
  }
}

// Hiérarchie des rôles : un utilisateur satisfait `minRole` si son rang est >=.
const roleRank: Record<Role, number> = {
  [Role.NONE]: 0,
  [Role.USER]: 1,
  [Role.ADMIN]: 2,
}

const cookiePreHandler = async function (
  this: FastifyInstance,
  request: FastifyRequest,
): Promise<void> {
  const { config } = this.iocContainer
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
    return await Promise.resolve()
  } catch {
    throw Boom.unauthorized('Invalid cookie')
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
    // Fabrique un preHandler exigeant un rôle minimum. `request.user` est déjà
    // renseigné par la garde d'authentification globale (onRequest).
    fastify.decorate('requireMinRole', function (this: FastifyInstance, minRole: Role) {
      const instance = this
      return async (request: FastifyRequest): Promise<void> => {
        const { userDomain } = instance.iocContainer
        const currentUser = await userDomain.findByID(request.user.userID)
        if (!currentUser || roleRank[currentUser.role] < roleRank[minRole]) {
          throw Boom.forbidden('Insufficient role')
        }
      }
    })
    log.debug('Cookie plugin successfully registered')
  },
)

export { cookiePlugin }
