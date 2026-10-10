import { PrismaPg } from '@prisma/adapter-pg'

import { PrismaClient } from '../../../generated/client'

// Garde-fou : les tests e2e vident les tables. N'accepter qu'une base medisync_test ou medisync_test_<suffixe>.
const TEST_DATABASE_PATTERN = /^medisync_test(_[a-z]+)?$/

const databaseNameOf = (url: string): string | null => {
  try {
    return new URL(url).pathname.replace(/^\//, '')
  } catch {
    return null
  }
}

const databaseUrl = process.env.DATABASE_URL ?? ''
if (!TEST_DATABASE_PATTERN.test(databaseNameOf(databaseUrl) ?? '')) {
  throw new Error(
    `Les tests e2e exigent une base de test : DATABASE_URL doit nommer medisync_test ou medisync_test_<suffixe>, reçu "${databaseUrl}".`,
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
