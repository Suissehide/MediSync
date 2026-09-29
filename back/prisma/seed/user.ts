import * as crypto from 'node:crypto'

import type {
  PrismaClient,
  Service,
  ServiceRole,
  Soignant,
} from '../../src/generated/client'

export function hashPassword(password: string) {
  const salt = crypto.randomBytes(16).toString('hex')
  const hash = crypto
    .pbkdf2Sync(password, salt, 1000, 64, 'sha512')
    .toString('hex')

  return { hash, salt }
}

// Trois comptes, chacun démontrant une chose précise à la main :
// - l'administrateur d'établissement coordonne les DEUX services : c'est
//   lui qui exerce le sélecteur de service ;
// - l'intervenant n'appartient qu'au service A : connecté avec lui, aucun
//   sélecteur ne doit apparaître, et rien du service B ne doit être
//   joignable ;
// - le secrétariat du service A sert à vérifier le filtrage des champs
//   cliniques (notes, détails, diagnostic) à l'écran.
type UserSpec = {
  email: string
  firstName: string
  lastName: string
  password: string
  establishmentRole: 'ADMIN' | 'MEMBER'
  soignantIndex: number | null
  serviceMemberships: { service: Service; role: ServiceRole }[]
}

export default async function seedUsers(
  prisma: PrismaClient,
  establishmentId: string,
  services: { serviceA: Service; serviceB: Service },
  // Les soignants de chaque service : le rattachement d'un compte a un soignant se pose sur
  // chacune de ses affectations, vers le soignant de meme rang dans ce service (2026-09-29).
  soignantsParService: Map<string, Soignant[]>,
) {
  console.log('→ Seeding users...')

  const { serviceA, serviceB } = services

  const users: UserSpec[] = [
    {
      email: 'admin@qwetle.fr',
      firstName: 'Léo',
      lastName: 'Couffinhal',
      password: 'Admin123!',
      establishmentRole: 'ADMIN',
      soignantIndex: 0,
      serviceMemberships: [
        { service: serviceA, role: 'COORDINATEUR' },
        { service: serviceB, role: 'COORDINATEUR' },
      ],
    },
    {
      email: 'sabrina.bernadet@cepta.fr',
      firstName: 'Sabrina',
      lastName: 'Bernadet',
      password: 'User123!',
      establishmentRole: 'MEMBER',
      soignantIndex: 1,
      serviceMemberships: [{ service: serviceA, role: 'INTERVENANT' }],
    },
    {
      email: 'secretariat.cardiologie@cepta.fr',
      firstName: 'Nadia',
      lastName: 'Elmoukhtari',
      password: 'User123!',
      establishmentRole: 'MEMBER',
      soignantIndex: null,
      serviceMemberships: [{ service: serviceA, role: 'SECRETARIAT' }],
    },
  ]

  for (const u of users) {
    const { hash, salt } = hashPassword(u.password)
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: {},
      create: {
        email: u.email,
        password: hash,
        salt,
        firstName: u.firstName,
        lastName: u.lastName,
      },
    })
    const soignantDans = (serviceId: string) =>
      u.soignantIndex !== null ? (soignantsParService.get(serviceId)?.[u.soignantIndex]?.id ?? null) : null
    await prisma.establishmentMembership.upsert({
      where: {
        userId_establishmentId: { userId: user.id, establishmentId },
      },
      update: {},
      create: {
        userId: user.id,
        establishmentId,
        role: u.establishmentRole,
        serviceMemberships: {
          create: u.serviceMemberships.map(({ service, role }) => ({
            serviceId: service.id,
            establishmentId,
            role,
            soignantId: soignantDans(service.id),
          })),
        },
      },
    })
  }

  console.log(`✓ Created ${users.length} users`)
}
