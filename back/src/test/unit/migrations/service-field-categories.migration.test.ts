import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { config as loadDotenv } from 'dotenv'
import { Client } from 'pg'
import { z } from 'zod/v4'

import { DEFAULT_CATEGORIES } from '../../../main/utils/service-field-types'

// Joue la VRAIE migration `service_field_categories` sur des bases jetables (jamais `medisync` ni `medisync_test`), sans test.skip.

jest.setTimeout(180_000)

const BACK_ROOT = join(__dirname, '../../../..')
const MIGRATIONS_DIR = join(BACK_ROOT, 'prisma/migrations')
const TARGET = '20261011090000_service_field_categories'
const TARGET_SQL = join(MIGRATIONS_DIR, TARGET, 'migration.sql')
const PREFIX = 'medisync_migr_cat'
const TEMPLATE_DB = `${PREFIX}_template`

type PgConn = { host: string; port: number; user: string; password: string }

const resolveConnection = (): PgConn => {
  for (const file of ['.env.test.local', '.env.test']) {
    const path = join(BACK_ROOT, file)
    if (existsSync(path)) {
      loadDotenv({ path, quiet: true })
    }
  }
  const raw = process.env.DATABASE_URL
  if (!raw) {
    throw new Error(
      'Test de migration : DATABASE_URL absent une fois back/.env.test(.local) charges.',
    )
  }
  const url = new URL(raw)
  return {
    host: url.hostname,
    port: url.port ? Number(url.port) : 5432,
    user: decodeURIComponent(url.username || 'postgres'),
    password: decodeURIComponent(url.password || 'postgres'),
  }
}

const clientFor = (conn: PgConn, database: string) =>
  new Client({ ...conn, database })

const priorMigrationFiles = (): string[] =>
  readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory() && e.name < TARGET)
    .map((e) => e.name)
    .sort()
    .map((d) => join(MIGRATIONS_DIR, d, 'migration.sql'))

const applyTarget = (c: Client) => c.query(readFileSync(TARGET_SQL, 'utf8'))

const dropDatabase = async (maint: Client, name: string) => {
  await maint.query(
    'SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()',
    [name],
  )
  await maint.query(`DROP DATABASE IF EXISTS "${name}"`)
}

const hasSectionColumn = async (c: Client): Promise<boolean> => {
  const res = await c.query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_name = 'ServiceFieldDefinition' AND column_name = 'section'`,
  )
  return res.rowCount === 1
}

const seedBase = async (c: Client) => {
  await c.query(`
    INSERT INTO "Establishment" (id, name) VALUES ('E1', 'CHU'), ('E2', 'Clinique');
    INSERT INTO "Service" (id, "establishmentId", name) VALUES
      ('S1', 'E1', 'Cardiologie'), ('S2', 'E1', 'Pneumologie'), ('S3', 'E2', 'Diabetologie');
  `)
}

const insertField = (
  c: Client,
  id: string,
  serviceId: string,
  establishmentId: string,
  section: 'pathway' | 'outcome',
  archived = false,
) =>
  c.query(
    `INSERT INTO "ServiceFieldDefinition" (id, "establishmentId", "serviceId", key, label, type, section, "order", "archivedAt")
     VALUES ($1, $2, $3, $1, $1, 'text', $4, 0, $5)`,
    [id, establishmentId, serviceId, section, archived ? new Date() : null],
  )

const SECTION_DATE: Record<string, string> = {
  pathway: 'entryDate',
  outcome: 'exitDate',
}

describe('migration service_field_categories', () => {
  const conn = resolveConnection()
  const maint = clientFor(conn, 'postgres')
  const bases: string[] = []

  const nouvelleBase = async (suffixe: string): Promise<Client> => {
    const name = `${PREFIX}_${suffixe}`
    await dropDatabase(maint, name)
    await maint.query(`CREATE DATABASE "${name}" TEMPLATE "${TEMPLATE_DB}"`)
    bases.push(name)
    const c = clientFor(conn, name)
    await c.connect()
    return c
  }

  beforeAll(async () => {
    await maint.connect()
    await dropDatabase(maint, TEMPLATE_DB)
    await maint.query(`CREATE DATABASE "${TEMPLATE_DB}"`)
    const t = clientFor(conn, TEMPLATE_DB)
    await t.connect()
    try {
      for (const file of priorMigrationFiles()) {
        await t.query(readFileSync(file, 'utf8'))
      }
    } finally {
      await t.end()
    }
  })

  afterAll(async () => {
    for (const name of [...bases, TEMPLATE_DB]) {
      await dropDatabase(maint, name)
    }
    await maint.end()
  })

  it('tient toute la migration dans une transaction explicite', () => {
    const sql = readFileSync(TARGET_SQL, 'utf8').trim()
    expect(sql.split('\n')[0]).toBe('BEGIN;')
    expect(sql.endsWith('COMMIT;')).toBe(true)
  })

  it('cree les deux categories par service, rattache chaque champ selon sa section et supprime section', async () => {
    const c = await nouvelleBase('ok')
    try {
      await seedBase(c)
      await insertField(c, 'F1', 'S1', 'E1', 'pathway')
      await insertField(c, 'F2', 'S1', 'E1', 'outcome')
      await insertField(c, 'F3', 'S1', 'E1', 'outcome', true)
      await insertField(c, 'F4', 'S2', 'E1', 'pathway', true)
      await insertField(c, 'F5', 'S2', 'E1', 'outcome')
      const sections = new Map(
        (
          await c.query<{ id: string; section: string }>(
            'SELECT id, section FROM "ServiceFieldDefinition"',
          )
        ).rows.map((r) => [r.id, r.section]),
      )

      await applyTarget(c)

      const cats = await c.query<{
        id: string
        serviceId: string
        establishmentId: string
        label: string
        dateField: string | null
        order: number
        archived: boolean
      }>(
        `SELECT id, "serviceId", "establishmentId", label, "dateField", "order", "archivedAt" IS NOT NULL AS archived
         FROM "ServiceFieldCategory" ORDER BY "serviceId", "order"`,
      )
      for (const [serviceId, establishmentId] of [
        ['S1', 'E1'],
        ['S2', 'E1'],
        ['S3', 'E2'],
      ]) {
        expect(
          cats.rows
            .filter((r) => r.serviceId === serviceId)
            .map(({ label, dateField, order, establishmentId, archived }) => ({
              label,
              dateField,
              order,
              establishmentId,
              archived,
            })),
        ).toEqual(
          DEFAULT_CATEGORIES.map((d) => ({
            ...d,
            establishmentId,
            archived: false,
          })),
        )
      }

      const fields = await c.query<{
        id: string
        serviceId: string
        catServiceId: string
        dateField: string
      }>(
        `SELECT d.id, d."serviceId", c."serviceId" AS "catServiceId", c."dateField"
         FROM "ServiceFieldDefinition" d JOIN "ServiceFieldCategory" c ON c.id = d."categoryId"
         ORDER BY d.id`,
      )
      expect(fields.rows).toHaveLength(5)
      for (const f of fields.rows) {
        expect(f.catServiceId).toBe(f.serviceId)
        expect(f.dateField).toBe(SECTION_DATE[sections.get(f.id) ?? ''])
      }

      expect(await hasSectionColumn(c)).toBe(false)
      const ids = cats.rows.map((r) => r.id)
      expect(ids.filter((id) => !z.cuid().safeParse(id).success)).toEqual([])
      expect(new Set(ids).size).toBe(ids.length)
    } finally {
      await c.end()
    }
  })

  it('refuse et annule tout si un champ outcome se retrouve dans la categorie d entree', async () => {
    const c = await nouvelleBase('garde')
    try {
      await seedBase(c)
      await insertField(c, 'F1', 'S1', 'E1', 'pathway')
      await insertField(c, 'F2', 'S1', 'E1', 'outcome')
      await insertField(c, 'F3', 'S2', 'E1', 'outcome')
      await c.query(`
        CREATE FUNCTION sabotage() RETURNS trigger AS $$
        BEGIN
          IF NEW.section = 'outcome' AND NEW."serviceId" = 'S1' THEN
            NEW."categoryId" := (SELECT id FROM "ServiceFieldCategory"
              WHERE "serviceId" = NEW."serviceId" AND "dateField" = 'entryDate');
          END IF;
          RETURN NEW;
        END $$ LANGUAGE plpgsql;
        CREATE TRIGGER sabotage BEFORE UPDATE ON "ServiceFieldDefinition"
          FOR EACH ROW EXECUTE FUNCTION sabotage();
      `)

      await expect(applyTarget(c)).rejects.toThrow(/Cardiologie/)
      await c.query('ROLLBACK')

      expect(await hasSectionColumn(c)).toBe(true)
      const table = await c.query<{ reg: string | null }>(
        `SELECT to_regclass('"ServiceFieldCategory"') AS reg`,
      )
      expect(table.rows[0]?.reg).toBeNull()
    } finally {
      await c.end()
    }
  })

  it('donne ses deux categories a un service sans champ', async () => {
    const c = await nouvelleBase('vide')
    try {
      await seedBase(c)
      await applyTarget(c)
      const res = await c.query<{ serviceId: string; n: number }>(
        `SELECT "serviceId", count(*)::int AS n FROM "ServiceFieldCategory" GROUP BY "serviceId" ORDER BY "serviceId"`,
      )
      expect(res.rows).toEqual([
        { serviceId: 'S1', n: 2 },
        { serviceId: 'S2', n: 2 },
        { serviceId: 'S3', n: 2 },
      ])
    } finally {
      await c.end()
    }
  })
})
