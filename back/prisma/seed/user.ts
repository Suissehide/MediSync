import crypto from 'node:crypto'
import { type PrismaClient, Role } from '@prisma/client'

import { hashPassword } from '../../src/main/utils/hash'

export default async function seedUsers(prisma: PrismaClient) {
  console.log('→ Seeding users...')

  const adminPass = hashPassword('Admin123!')
  const userPass = hashPassword('User123!')

  await prisma.user.createMany({
    data: [
      {
        email: 'admin@qwetle.fr',
        password: adminPass.hash,
        salt: adminPass.salt,
        firstName: 'Léo',
        lastName: 'Admin',
        role: Role.ADMIN,
      },
      {
        email: 'user@example.com',
        password: userPass.hash,
        salt: userPass.salt,
        firstName: 'Sabrina',
        lastName: 'User',
        role: Role.USER,
      },
    ],
    skipDuplicates: true,
  })
}
