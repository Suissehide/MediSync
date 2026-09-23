import Boom from '@hapi/boom'

import { AuthDomain } from '../../../main/domain/auth.domain'
import type { IocContainer } from '../../../main/types/application/ioc'
import type {
  UserCreateEntityRepo,
  UserEntityRepo,
  UserWithMemberships,
} from '../../../main/types/infra/orm/repositories/user.repository.interface'
import { hashPassword, verifyPassword } from '../../../main/utils/hash'

// On garde l'implémentation réelle (le test dépend de son comportement),
// mais `verifyPassword` devient un jest.fn espionnable : SWC compile les
// exports en propriétés non reconfigurables, ce que `jest.spyOn` refuse sur
// le module réel.
jest.mock('../../../main/utils/hash', () => {
  const actual: typeof import('../../../main/utils/hash') = jest.requireActual(
    '../../../main/utils/hash',
  )
  return {
    ...actual,
    verifyPassword: jest.fn(actual.verifyPassword),
  }
})

// Repository factice : un seul utilisateur connu, pour vérifier que
// `signIn` ne distingue plus « adresse inconnue » de « mot de passe faux ».
const KNOWN_EMAIL = 'known@medisync.fr'
const KNOWN_PASSWORD = 'correct-horse-battery-staple'
const { hash, salt } = hashPassword(KNOWN_PASSWORD)

const buildKnownUser = (
  overrides: Partial<UserEntityRepo> = {},
): UserEntityRepo => ({
  id: 'u1',
  email: KNOWN_EMAIL,
  password: hash,
  salt,
  firstName: 'A',
  lastName: 'B',
  isSuperAdmin: false,
  deactivatedAt: null,
  ...overrides,
})

const withMemberships = (user: UserEntityRepo): UserWithMemberships => ({
  ...user,
  establishmentMemberships: [],
})

const buildDomain = (knownUser: UserEntityRepo = buildKnownUser()) => {
  const findByEmailCalls: string[] = []

  const userRepository = {
    findByID: (userID: string) => {
      if (userID !== knownUser.id) {
        throw Boom.notFound('User not found')
      }
      return Promise.resolve(withMemberships(knownUser))
    },
    findByEmail: (email: string) => {
      findByEmailCalls.push(email)
      if (email !== knownUser.email) {
        return Promise.reject(Boom.notFound('User not found'))
      }
      return Promise.resolve(knownUser)
    },
    create: (_user: UserCreateEntityRepo) => Promise.resolve(knownUser),
    updateProfile: () => Promise.resolve(knownUser),
    updatePassword: () => Promise.resolve(),
    setDeactivated: () => Promise.resolve(knownUser),
  }

  const config = {
    jwtSecret: 'test-secret',
    jwtRefreshSecret: 'test-refresh-secret',
    jwtExpiresIn: '15m',
    jwtRefreshExpiresIn: '7d',
  }

  const logger = {
    debug: () => {},
    error: () => {},
    info: () => {},
    trace: () => {},
    warn: () => {},
  }

  const domain = new AuthDomain({
    userRepository,
    config,
    logger,
  } as unknown as IocContainer)

  return { domain, findByEmailCalls }
}

describe('AuthDomain.signIn — non-énumération des comptes', () => {
  it('refuse une adresse inconnue avec la meme erreur 401 qu un mot de passe faux', async () => {
    const { domain } = buildDomain()

    await expect(
      domain.signIn('unknown@medisync.fr', 'whatever-password'),
    ).rejects.toMatchObject({
      output: { statusCode: 401 },
      message: 'Invalid email or password',
    })
  })

  it('refuse un mot de passe errone avec la meme erreur 401', async () => {
    const { domain } = buildDomain()

    await expect(
      domain.signIn(KNOWN_EMAIL, 'wrong-password'),
    ).rejects.toMatchObject({
      output: { statusCode: 401 },
      message: 'Invalid email or password',
    })
  })

  it('execute reellement la verification du mot de passe quand l utilisateur n existe pas', async () => {
    const { domain } = buildDomain()
    const verifyPasswordMock = jest.mocked(verifyPassword)
    verifyPasswordMock.mockClear()

    await domain
      .signIn('unknown@medisync.fr', 'whatever-password')
      .catch(() => undefined)

    // La vérification à vide doit réellement s'exécuter (pas de court-circuit
    // sur `!user`) : c'est elle qui égalise le coût des deux chemins.
    expect(verifyPasswordMock).toHaveBeenCalledTimes(1)
    expect(verifyPasswordMock).toHaveBeenCalledWith(
      expect.objectContaining({ password: 'whatever-password' }),
    )
  })

  it('accepte un mot de passe correct pour un compte actif et renvoie le tableau de bord', async () => {
    const { domain } = buildDomain()

    const result = await domain.signIn(KNOWN_EMAIL, KNOWN_PASSWORD)

    expect(result.me.id).toBe('u1')
    expect(result.accessToken).toEqual(expect.any(String))
    expect(result.refreshToken).toEqual(expect.any(String))
  })

  it('refuse un compte desactive meme avec le bon mot de passe', async () => {
    const { domain } = buildDomain(
      buildKnownUser({ deactivatedAt: new Date() }),
    )

    await expect(
      domain.signIn(KNOWN_EMAIL, KNOWN_PASSWORD),
    ).rejects.toMatchObject({
      output: { statusCode: 401 },
      message: 'Account deactivated',
    })
  })
})
