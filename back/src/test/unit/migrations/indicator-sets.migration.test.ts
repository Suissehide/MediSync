import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { config as loadDotenv } from 'dotenv'
import { Client } from 'pg'
import { z } from 'zod/v4'

import { answerParamsSchema } from '../../../main/interfaces/http/fastify/schemas/indicatorSet.schema'
import { ARS_PRESET } from '../../../main/utils/indicators/ars-preset'

// Joue la VRAIE migration `indicator_sets` sur des bases jetables (jamais `medisync` ni `medisync_test`), sans test.skip.

jest.setTimeout(180_000)

const BACK_ROOT = join(__dirname, '../../../..')
const MIGRATIONS_DIR = join(BACK_ROOT, 'prisma/migrations')
const LAST_PRIOR_MIGRATION = '20261010180000_ars_manual_answer'
const TARGET_SQL = join(
  MIGRATIONS_DIR,
  '20261010200000_indicator_sets',
  'migration.sql',
)
const PREFIX = 'medisync_migr_indic'
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

const priorMigrationFiles = (): string[] => {
  const dirs = readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort()
  const index = dirs.indexOf(LAST_PRIOR_MIGRATION)
  if (index === -1) {
    throw new Error(
      `Migration "${LAST_PRIOR_MIGRATION}" introuvable : son nom a change, mettre ce test a jour.`,
    )
  }
  return dirs
    .slice(0, index + 1)
    .map((d) => join(MIGRATIONS_DIR, d, 'migration.sql'))
}

const applyTarget = (c: Client) => c.query(readFileSync(TARGET_SQL, 'utf8'))

const dropDatabase = async (maint: Client, name: string) => {
  await maint.query(
    'SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()',
    [name],
  )
  await maint.query(`DROP DATABASE IF EXISTS "${name}"`)
}

const tableExists = async (c: Client, table: string): Promise<boolean> => {
  const res = await c.query<{ reg: string | null }>(
    'SELECT to_regclass($1) AS reg',
    [`"${table}"`],
  )
  return res.rows[0]?.reg != null
}

// S1 et S2 portent les champs ETP (comme après `service_fields`), S3 non.
const seedBase = async (c: Client) => {
  await c.query(`
    INSERT INTO "Establishment" (id, name) VALUES ('E1', 'CHU'), ('E2', 'Clinique');
    INSERT INTO "Service" (id, "establishmentId", name) VALUES
      ('S1', 'E1', 'Cardiologie'), ('S2', 'E1', 'Pneumologie'), ('S3', 'E2', 'Diabetologie');
    INSERT INTO "ServiceFieldDefinition" (id, "establishmentId", "serviceId", key, label, type, section, "order") VALUES
      ('D1', 'E1', 'S1', 'orientation', 'Orientation', 'choice', 'pathway', 0),
      ('D2', 'E1', 'S1', 'stopReason', 'Motif d''arret', 'choice', 'outcome', 1),
      ('D3', 'E1', 'S2', 'orientation', 'Orientation', 'choice', 'pathway', 0),
      ('D4', 'E1', 'S2', 'stopReason', 'Motif d''arret', 'choice', 'outcome', 1),
      ('D5', 'E2', 'S3', 'orientation', 'Orientation', 'choice', 'pathway', 0);
  `)
}

const ANSWERS = [
  {
    year: 2025,
    code: '2.5',
    numberValue: 4,
    textValue: "Ateliers d'hiver",
    boolValue: null,
  },
  {
    year: 2026,
    code: '2.5',
    numberValue: 12,
    textValue: 'Ateliers en ville',
    boolValue: null,
  },
  {
    year: 2026,
    code: '4.2',
    numberValue: null,
    textValue: null,
    boolValue: true,
  },
] as const

const insertAnswers = async (c: Client) => {
  for (const [i, a] of ANSWERS.entries()) {
    await c.query(
      `INSERT INTO "ArsManualAnswer" (id, "establishmentId", "serviceId", year, code, "numberValue", "textValue", "boolValue", "updatedById", "updatedAt")
       VALUES ($1, 'E1', 'S1', $2, $3, $4, $5, $6, 'U1', now())`,
      [`A${i}`, a.year, a.code, a.numberValue, a.textValue, a.boolValue],
    )
  }
}

describe('migration indicator_sets', () => {
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

  it('pose la grille ARS sur chaque service ETP, reprend les reponses et supprime ArsManualAnswer', async () => {
    const c = await nouvelleBase('ok')
    try {
      await seedBase(c)
      await insertAnswers(c)

      await applyTarget(c)

      const sets = await c.query<{
        id: string
        serviceId: string
        establishmentId: string
        name: string
        order: number
      }>(
        'SELECT id, "serviceId", "establishmentId", name, "order" FROM "IndicatorSet" ORDER BY "serviceId"',
      )
      expect(
        sets.rows.map(({ serviceId, establishmentId, name, order }) => ({
          serviceId,
          establishmentId,
          name,
          order,
        })),
      ).toEqual([
        {
          serviceId: 'S1',
          establishmentId: 'E1',
          name: 'Grille ARS',
          order: 0,
        },
        {
          serviceId: 'S2',
          establishmentId: 'E1',
          name: 'Grille ARS',
          order: 0,
        },
      ])

      const indicators = await c.query<{
        id: string
        setId: string
        serviceId: string
        establishmentId: string
        code: string
        label: string
        group: string
        order: number
        nature: string
        measure: string | null
        options: unknown
        filters: unknown
        breakdownField: string | null
        input: string | null
        note: string | null
        parentCode: string | null
      }>(
        `SELECT i.id, i."setId", i."serviceId", i."establishmentId", i.code, i.label, i."group", i."order",
                i.nature, i.measure, i.options, i.filters, i."breakdownField", i.input, i.note, p.code AS "parentCode"
         FROM "Indicator" i LEFT JOIN "Indicator" p ON p.id = i."parentId" AND p."setId" = i."setId"
         ORDER BY i."serviceId", i."order"`,
      )
      const expected = ARS_PRESET.map((i, order) => ({
        code: i.code,
        label: i.label,
        group: i.group,
        order,
        nature: i.nature,
        measure: i.measure ?? null,
        options: i.options ?? null,
        filters: i.filters ?? null,
        breakdownField: i.breakdownField ?? null,
        input: i.input ?? null,
        note: i.note ?? null,
        parentCode: i.parentCode ?? null,
      }))
      for (const set of sets.rows) {
        const ofSet = indicators.rows.filter((i) => i.setId === set.id)
        expect(
          ofSet.every(
            (i) =>
              i.serviceId === set.serviceId &&
              i.establishmentId === set.establishmentId,
          ),
        ).toBe(true)
        expect(
          ofSet.map(
            ({ id, setId, serviceId, establishmentId, ...rest }) => rest,
          ),
        ).toEqual(expected)
      }
      expect(indicators.rows).toHaveLength(2 * ARS_PRESET.length)

      const answers = await c.query<{
        id: string
        serviceId: string
        establishmentId: string
        year: number
        code: string
        setServiceId: string
        numberValue: number | null
        textValue: string | null
        boolValue: boolean | null
        updatedById: string
      }>(
        `SELECT a.id, a."serviceId", a."establishmentId", a.year, i.code, s."serviceId" AS "setServiceId",
                a."numberValue", a."textValue", a."boolValue", a."updatedById"
         FROM "IndicatorAnswer" a JOIN "Indicator" i ON i.id = a."indicatorId" JOIN "IndicatorSet" s ON s.id = i."setId"
         ORDER BY a.year, i.code`,
      )
      expect(
        answers.rows.map(
          ({ year, code, numberValue, textValue, boolValue }) => ({
            year,
            code,
            numberValue,
            textValue,
            boolValue,
          }),
        ),
      ).toEqual(ANSWERS)
      expect(
        answers.rows.every(
          (a) =>
            a.serviceId === 'S1' &&
            a.setServiceId === 'S1' &&
            a.establishmentId === 'E1' &&
            a.updatedById === 'U1',
        ),
      ).toBe(true)

      const services = await c.query<{
        id: string
        stopReasonFieldKey: string | null
        completedChoiceKey: string | null
      }>(
        'SELECT id, "stopReasonFieldKey", "completedChoiceKey" FROM "Service" ORDER BY id',
      )
      expect(services.rows).toEqual([
        {
          id: 'S1',
          stopReasonFieldKey: 'stopReason',
          completedChoiceKey: 'PLUS_BESOIN_FIN_PARCOURS',
        },
        {
          id: 'S2',
          stopReasonFieldKey: 'stopReason',
          completedChoiceKey: 'PLUS_BESOIN_FIN_PARCOURS',
        },
        { id: 'S3', stopReasonFieldKey: null, completedChoiceKey: null },
      ])

      expect(await tableExists(c, 'ArsManualAnswer')).toBe(false)

      const ids = [...sets.rows, ...indicators.rows, ...answers.rows].map(
        (r) => r.id,
      )
      expect(ids.filter((id) => !z.cuid().safeParse(id).success)).toEqual([])
      expect(new Set(ids).size).toBe(ids.length)
      const refuses = indicators.rows.filter(
        (i) =>
          !answerParamsSchema.safeParse({
            setId: i.setId,
            year: 2026,
            indicatorId: i.id,
          }).success,
      )
      expect(refuses.map((i) => i.code)).toEqual([])
    } finally {
      await c.end()
    }
  })

  it('refuse et annule tout si une reponse n est pas reprise', async () => {
    const c = await nouvelleBase('garde')
    try {
      await seedBase(c)
      await insertAnswers(c)
      // La table n'existe qu'une fois la migration lancée : un déclencheur d'événement y pose le sabotage de 4.2.
      await c.query(`
        CREATE FUNCTION sabotage_42() RETURNS trigger AS $$
        BEGIN
          IF NEW."boolValue" IS NOT NULL THEN RETURN NULL; END IF;
          RETURN NEW;
        END $$ LANGUAGE plpgsql;
        CREATE FUNCTION sabotage() RETURNS event_trigger AS $$
        BEGIN
          IF to_regclass('"IndicatorAnswer"') IS NOT NULL AND current_setting('sabotage.pose', true) IS DISTINCT FROM 'oui' THEN
            PERFORM set_config('sabotage.pose', 'oui', true);
            CREATE TRIGGER sabotage_42 BEFORE INSERT ON "IndicatorAnswer" FOR EACH ROW EXECUTE FUNCTION sabotage_42();
          END IF;
        END $$ LANGUAGE plpgsql;
        CREATE EVENT TRIGGER sabotage ON ddl_command_end EXECUTE FUNCTION sabotage();
      `)

      await expect(applyTarget(c)).rejects.toThrow(/reponses non reprises/)
      await c.query('ROLLBACK')

      expect(await tableExists(c, 'ArsManualAnswer')).toBe(true)
      expect(await tableExists(c, 'IndicatorSet')).toBe(false)
      const kept = await c.query<{ n: number }>(
        'SELECT count(*)::int AS n FROM "ArsManualAnswer"',
      )
      expect(kept.rows[0]?.n).toBe(ANSWERS.length)
    } finally {
      await c.end()
    }
  })

  it('passe sans rien creer quand il n y a aucun service', async () => {
    const c = await nouvelleBase('vide')
    try {
      await applyTarget(c)
      const counts = await c.query<{ sets: number; indicators: number }>(
        `SELECT (SELECT count(*)::int FROM "IndicatorSet") AS sets,
                (SELECT count(*)::int FROM "Indicator") AS indicators`,
      )
      expect(counts.rows[0]).toEqual({ sets: 0, indicators: 0 })
      expect(await tableExists(c, 'ArsManualAnswer')).toBe(false)
    } finally {
      await c.end()
    }
  })
})
