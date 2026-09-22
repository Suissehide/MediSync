import { PrismaPg } from '@prisma/adapter-pg'

import { PrismaClient } from '../../../generated/client'

// Garde-fou : les tests e2e vident les tables. Refuser toute base dont l'URL
// ne nomme pas explicitement la base de test protège la base de développement.
const databaseUrl = process.env.DATABASE_URL ?? ''
if (!databaseUrl.includes('medisync_test')) {
  throw new Error(
    `Les tests e2e exigent la base de test : DATABASE_URL doit contenir "medisync_test", reçu "${databaseUrl}".`,
  )
}

// Client brut, sans extension : réservé à la préparation et au nettoyage.
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
export const testDb = new PrismaClient({ adapter })

// Vide toutes les tables du schéma public sauf l'historique des migrations.
export const truncateAll = async (): Promise<void> => {
  const tables = await testDb.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
  `
  if (tables.length === 0) {
    return
  }
  const list = tables.map((t) => `"public"."${t.tablename}"`).join(', ')
  await testDb.$executeRawUnsafe(`TRUNCATE TABLE ${list} CASCADE`)
}
