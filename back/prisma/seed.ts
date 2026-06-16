import 'dotenv/config'
import { PrismaPg } from '@prisma/adapter-pg'

import { PrismaClient } from '../src/generated/client'
import seedLocations from './seed/location'
import seedPathwayTemplates from './seed/pathwayTemplate'
import seedPatients from './seed/patient'
import seedSoignants from './seed/soignant'
import seedThematics from './seed/thematic'
import seedTodos from './seed/todo'
import seedUsers from './seed/user'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
const prisma = new PrismaClient({ adapter })

async function main() {
  console.log('🌱 Starting database seeding...')

  await seedUsers(prisma)
  const soignants = await seedSoignants(prisma)
  await seedThematics(prisma, soignants)
  await seedPatients(prisma)
  const locations = await seedLocations(prisma)
  await seedPathwayTemplates(prisma, soignants, locations)
  await seedTodos(prisma)

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
