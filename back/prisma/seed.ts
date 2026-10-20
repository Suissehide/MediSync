import 'dotenv/config'
import { PrismaPg } from '@prisma/adapter-pg'

import type { Service } from '../src/generated/client'
import { PrismaClient } from '../src/generated/client'
import type { PatientData } from './seed/data/patient'
import { PATIENTS_CARDIOLOGIE, PATIENTS_PNEUMOLOGIE } from './seed/data/patient'
import { seedArsIndicatorSet } from './seed/indicators'
import seedLocations from './seed/location'
import seedPathwayTemplates from './seed/pathwayTemplate'
import seedPatients, { seedEtpFields } from './seed/patient'
import seedPdfDesignPresets from './seed/pdfDesignPreset'
import seedSoignants from './seed/soignant'
import type { TaskData } from './seed/task'
import seedTasks from './seed/task'
import seedTenant from './seed/tenant'
import seedThematics from './seed/thematic'
import seedUsers from './seed/user'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
const prisma = new PrismaClient({ adapter })

type ServiceContent = { patients: PatientData[]; tasks: TaskData[] }

// Un établissement, deux services : les fonctions de peuplement service par
// service prennent toutes le même couple (establishmentId, serviceId) en
// argument, l'ajout d'un second service est donc mécanique. Le contenu de
// chaque service est en revanche volontairement distinct (patients, et les
// tâches qui les citent) : avec les mêmes données dans les deux services, un
// défaut de cloisonnement ne se verrait pas à l'œil.
const CARDIOLOGIE: ServiceContent = {
  patients: PATIENTS_CARDIOLOGIE,
  tasks: [
    { text: 'Vérifier le dossier médical de Claire', done: false },
    { text: 'Préparer atelier nutrition', done: true },
  ],
}

const PNEUMOLOGIE: ServiceContent = {
  patients: PATIENTS_PNEUMOLOGIE,
  tasks: [
    { text: 'Vérifier le dossier médical de Nadia', done: false },
    { text: 'Préparer atelier souffle', done: true },
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
  await seedEtpFields(prisma, tenant)
  await seedArsIndicatorSet(prisma, tenant)
  await seedPatients(prisma, tenant, content.patients)
  await seedPathwayTemplates(prisma, soignants, locations, thematics, tenant)
  return soignants
}

async function main() {
  console.log('🌱 Starting database seeding...')

  const { establishment, serviceA, serviceB } = await seedTenant(prisma)

  // Hors de la boucle des services : un preset est global, il n'appartient a aucun service.
  await seedPdfDesignPresets(prisma)

  const soignantsA = await seedService(
    prisma,
    establishment.id,
    serviceA,
    CARDIOLOGIE,
  )
  const soignantsB = await seedService(
    prisma,
    establishment.id,
    serviceB,
    PNEUMOLOGIE,
  )

  const users = await seedUsers(
    prisma,
    establishment.id,
    { serviceA, serviceB },
    new Map([
      [serviceA.id, soignantsA],
      [serviceB.id, soignantsB],
    ]),
  )

  // Tâches après les comptes : le compte de dev (tagué) et l'auteur sabrina en dépendent.
  const devUser = users.find((u) => u.email === 'admin@qwetle.fr')
  const author = users.find((u) => u.email === 'sabrina.bernadet@cepta.fr')
  if (!devUser || !author) {
    throw new Error('Comptes de seed introuvables pour les tâches')
  }

  await seedTasks(
    prisma,
    { establishmentId: establishment.id, serviceId: serviceA.id },
    CARDIOLOGIE.tasks,
    author.id,
    devUser.id,
  )
  // Sabrina n'est pas membre de Pneumologie : le compte de dev y est aussi l'auteur, sans se notifier lui-même.
  await seedTasks(
    prisma,
    { establishmentId: establishment.id, serviceId: serviceB.id },
    PNEUMOLOGIE.tasks,
    devUser.id,
    devUser.id,
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
