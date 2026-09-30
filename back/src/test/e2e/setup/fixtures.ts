import type { FastifyInstance } from 'fastify'

import type { EstablishmentRole, ServiceRole } from '../../../generated/enums'
import { hashPassword } from '../../../main/utils/hash'
import { testDb } from './db'

export const DEFAULT_PASSWORD = 'Password123!!'

export const createEstablishment = (name = 'Etab') =>
  testDb.establishment.create({ data: { name } })

export const createService = (
  establishmentId: string,
  name = `Service ${Math.random()}`,
) => testDb.service.create({ data: { establishmentId, name } })

type MembershipFixture = {
  establishmentId: string
  role?: EstablishmentRole
  // Le soignant incarne dans un service se pose sur l'affectation de service (2026-09-29).
  services?: {
    serviceId: string
    role: ServiceRole
    soignantId?: string | null
  }[]
}

// Crée un compte et, pour chaque etablissement donné, son appartenance ainsi
// que ses appartenances de service. Un mot de passe par défaut est utilisé
// si aucun n'est fourni : suffisant pour les tests qui n'ont pas besoin d'un
// mot de passe distinct par utilisateur.
export const createUser = async (params: {
  email: string
  password?: string
  isSuperAdmin?: boolean
  memberships?: MembershipFixture[]
}) => {
  const { hash, salt } = hashPassword(params.password ?? DEFAULT_PASSWORD)
  const user = await testDb.user.create({
    data: {
      email: params.email,
      password: hash,
      salt,
      isSuperAdmin: params.isSuperAdmin ?? false,
    },
  })
  for (const m of params.memberships ?? []) {
    await testDb.establishmentMembership.create({
      data: {
        userId: user.id,
        establishmentId: m.establishmentId,
        role: m.role ?? 'MEMBER',
        serviceMemberships: {
          create: (m.services ?? []).map((s) => ({
            serviceId: s.serviceId,
            role: s.role,
            soignantId: s.soignantId ?? null,
            establishmentId: m.establishmentId,
          })),
        },
      },
    })
  }
  return user
}

// Authentifie un utilisateur déjà créé et renvoie le cookie de session, prêt
// à passer à `app.inject({ cookies })`.
export const signIn = async (
  app: FastifyInstance,
  email: string,
  password = DEFAULT_PASSWORD,
) => {
  const res = await app.inject({
    method: 'POST',
    url: '/auth/sign-in',
    payload: { email, password },
  })
  if (res.statusCode >= 300) {
    throw new Error(`sign-in failed: ${res.statusCode} ${res.body}`)
  }
  const token = res.cookies.find((c) => c.name === 'access_token')?.value
  if (!token) {
    throw new Error('no access_token cookie')
  }
  return { access_token: token }
}

// Un octroi temporaire, tel que le posera plus tard la route d'émission — ici créé
// directement en base, ce test n'exerçant que la lecture (résolution de tenant / `/me`).
export const grantAccess = (params: {
  userId: string
  establishmentId: string
  expiresAt: Date
  reason?: string
  revokedAt?: Date | null
}) =>
  testDb.superAdminAccessGrant.create({
    data: {
      userId: params.userId,
      establishmentId: params.establishmentId,
      expiresAt: params.expiresAt,
      reason: params.reason ?? 'diagnostic',
      revokedAt: params.revokedAt ?? null,
    },
  })

export const tenantUrl = (
  establishmentId: string,
  serviceId: string,
  path: string,
) => `/e/${establishmentId}/s/${serviceId}${path}`

export const adminUrl = (establishmentId: string, path: string) =>
  `/e/${establishmentId}/admin${path}`

// Deux services dans le même établissement, un utilisateur membre de chacun
// (coordinateur, pour disposer de toutes les permissions de service). Sert
// de socle aux tests d'isolation et de résolution du tenant.
export const twoServicesScenario = async (app: FastifyInstance) => {
  const est = await createEstablishment()
  const serviceA = await createService(est.id, 'A')
  const serviceB = await createService(est.id, 'B')
  await createUser({
    email: 'a@test.fr',
    memberships: [
      {
        establishmentId: est.id,
        services: [{ serviceId: serviceA.id, role: 'COORDINATEUR' }],
      },
    ],
  })
  await createUser({
    email: 'b@test.fr',
    memberships: [
      {
        establishmentId: est.id,
        services: [{ serviceId: serviceB.id, role: 'COORDINATEUR' }],
      },
    ],
  })
  const cookiesA = await signIn(app, 'a@test.fr')
  const cookiesB = await signIn(app, 'b@test.fr')
  return { est, serviceA, serviceB, cookiesA, cookiesB }
}
