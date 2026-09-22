import * as crypto from 'node:crypto'

import type { PrismaClient, Soignant } from '../../src/generated/client'
import type { SeedTenant } from './tenant'

export function hashPassword(password: string) {
  const salt = crypto.randomBytes(16).toString('hex')
  const hash = crypto
    .pbkdf2Sync(password, salt, 1000, 64, 'sha512')
    .toString('hex')

  return { hash, salt }
}

export default async function seedUsers(
  prisma: PrismaClient,
  tenant: SeedTenant,
  soignants: Soignant[],
) {
  console.log('→ Seeding users...')

  const adminPass = hashPassword('Admin123!')
  const userPass = hashPassword('User123!')

  const users = [
    {
      email: 'admin@qwetle.fr',
      firstName: 'Léo',
      lastName: 'Couffinhal',
      pass: adminPass,
    },
    {
      email: 'sabrina.bernadet@cepta.fr',
      firstName: 'Sabrina',
      lastName: 'Bernadet',
      pass: userPass,
    },
  ]

  for (const [index, u] of users.entries()) {
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: {},
      create: {
        email: u.email,
        password: u.pass.hash,
        salt: u.pass.salt,
        firstName: u.firstName,
        lastName: u.lastName,
      },
    })
    await prisma.establishmentMembership.upsert({
      where: {
        userId_establishmentId: {
          userId: user.id,
          establishmentId: tenant.establishmentId,
        },
      },
      update: {},
      create: {
        userId: user.id,
        establishmentId: tenant.establishmentId,
        role: 'ADMIN',
        soignantId: soignants[index]?.id ?? null,
        serviceMemberships: {
          create: [
            {
              serviceId: tenant.serviceId,
              establishmentId: tenant.establishmentId,
              role: 'COORDINATEUR',
            },
          ],
        },
      },
    })
  }

  console.log(`✓ Created ${users.length} users`)
}
