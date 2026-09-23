import 'dotenv/config'
import { PrismaPg } from '@prisma/adapter-pg'

import { PrismaClient } from '../src/generated/client'
import seedLocations from './seed/location'
import seedPathwayTemplates from './seed/pathwayTemplate'
import seedPatients from './seed/patient'
import seedSoignants from './seed/soignant'
import seedTenant from './seed/tenant'
import seedThematics from './seed/thematic'
import seedTodos from './seed/todo'
import seedUsers from './seed/user'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
const prisma = new PrismaClient({ adapter })

async function main() {
  console.log('🌱 Starting database seeding...')

  const { establishment, service } = await seedTenant(prisma)
  const tenant = { establishmentId: establishment.id, serviceId: service.id }

  const soignants = await seedSoignants(prisma, tenant)
  await seedUsers(prisma, tenant, soignants)
  const thematics = await seedThematics(prisma, soignants, tenant)
  await seedPatients(prisma, tenant)
  const locations = await seedLocations(prisma, tenant)
  await seedPathwayTemplates(prisma, soignants, locations, thematics, tenant)
  await seedTodos(prisma, tenant)

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
