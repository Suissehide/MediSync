import 'dotenv/config'
import { PrismaPg } from '@prisma/adapter-pg'

import type { Service } from '../src/generated/client'
import { PrismaClient } from '../src/generated/client'
import type { PatientData } from './seed/data/patient'
import { PATIENTS_CARDIOLOGIE, PATIENTS_PNEUMOLOGIE } from './seed/data/patient'
import seedLocations from './seed/location'
import seedPathwayTemplates from './seed/pathwayTemplate'
import seedPatients from './seed/patient'
import seedSoignants from './seed/soignant'
import seedTenant from './seed/tenant'
import seedThematics from './seed/thematic'
import type { TodoData } from './seed/todo'
import seedTodos from './seed/todo'
import seedUsers from './seed/user'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
const prisma = new PrismaClient({ adapter })

type ServiceContent = { patients: PatientData[]; todos: TodoData[] }

// Un établissement, deux services : les fonctions de peuplement service par
// service prennent toutes le même couple (establishmentId, serviceId) en
// argument, l'ajout d'un second service est donc mécanique. Le contenu de
// chaque service est en revanche volontairement distinct (patients, et les
// tâches qui les citent) : avec les mêmes données dans les deux services, un
// défaut de cloisonnement ne se verrait pas à l'œil.
const CARDIOLOGIE: ServiceContent = {
  patients: PATIENTS_CARDIOLOGIE,
  todos: [
    {
      title: 'Vérifier le dossier médical de Claire',
      description: 'S’assurer que les derniers résultats sont à jour.',
      completed: false,
    },
    {
      title: 'Préparer atelier nutrition',
      description:
        'Réviser la présentation PowerPoint et les supports imprimés.',
      completed: true,
    },
  ],
}

const PNEUMOLOGIE: ServiceContent = {
  patients: PATIENTS_PNEUMOLOGIE,
  todos: [
    {
      title: 'Vérifier le dossier médical de Nadia',
      description: 'S’assurer que la dernière spirométrie est à jour.',
      completed: false,
    },
    {
      title: 'Préparer atelier souffle',
      description: 'Réviser les supports de réhabilitation respiratoire.',
      completed: true,
    },
  ],
}

async function seedService(
  prisma: PrismaClient,
  establishmentId: string,
  service: Service,
  content: ServiceContent,
) {
  const tenant = { establishmentId, serviceId: service.id }

  // Soignants et salles sont propres a chaque service depuis le 2026-09-29 : chaque service
  // recoit son propre jeu, sous les memes noms.
  const soignants = await seedSoignants(prisma, tenant)
  const locations = await seedLocations(prisma, tenant)
  const thematics = await seedThematics(prisma, soignants, tenant)
  await seedPatients(prisma, tenant, content.patients)
  await seedPathwayTemplates(prisma, soignants, locations, thematics, tenant)
  await seedTodos(prisma, tenant, content.todos)
  return soignants
}

async function main() {
  console.log('🌱 Starting database seeding...')

  const { establishment, serviceA, serviceB } = await seedTenant(prisma)

  const soignantsA = await seedService(prisma, establishment.id, serviceA, CARDIOLOGIE)
  const soignantsB = await seedService(prisma, establishment.id, serviceB, PNEUMOLOGIE)

  await seedUsers(
    prisma,
    establishment.id,
    { serviceA, serviceB },
    new Map([
      [serviceA.id, soignantsA],
      [serviceB.id, soignantsB],
    ]),
  )

  console.log('✅ Seeding completed successfully!')
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
