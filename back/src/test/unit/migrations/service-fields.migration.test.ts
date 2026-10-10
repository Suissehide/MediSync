import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { config as loadDotenv } from 'dotenv'
import { Client } from 'pg'
import { z } from 'zod/v4'

import { ETP_FIELD_PRESET } from '../../../main/utils/etp-field-preset'

// Joue la VRAIE migration `service_fields` sur des bases jetables (jamais `medisync` ni `medisync_test`), sans test.skip.

jest.setTimeout(180_000)

const BACK_ROOT = join(__dirname, '../../../..')
const MIGRATIONS_DIR = join(BACK_ROOT, 'prisma/migrations')
const LAST_PRIOR_MIGRATION = '20261009130000_thematic_role'
const TARGET_SQL = join(
  MIGRATIONS_DIR,
  '20261010120000_service_fields',
  'migration.sql',
)
const PREFIX = 'medisync_migr_fields'
const TEMPLATE_DB = `${PREFIX}_template`

const TEN_COLUMNS = [
  'medicalDiagnosis',
  'careMode',
  'orientation',
  'etpDecision',
  'programType',
  'nonInclusionDetails',
  'customContentDetails',
  'goal',
  'stopReason',
  'etpFinalOutcome',
] as const

type TenColumn = (typeof TEN_COLUMNS)[number]
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

const remainingColumns = async (c: Client): Promise<string[]> => {
  const res = await c.query<{ column_name: string }>(
    `SELECT column_name FROM information_schema.columns
     WHERE table_name = 'PatientServiceFile' AND column_name = ANY($1)`,
    [[...TEN_COLUMNS]],
  )
  return res.rows.map((r) => r.column_name).sort()
}

type FileSeed = {
  id: string
  patientId: string
  serviceId: string
  establishmentId: string
  values: Record<TenColumn, string | null>
}

const insertFile = (c: Client, f: FileSeed) => {
  const columns = [
    'id',
    'patientId',
    'serviceId',
    'establishmentId',
    ...TEN_COLUMNS,
  ]
  const values = [
    f.id,
    f.patientId,
    f.serviceId,
    f.establishmentId,
    ...TEN_COLUMNS.map((k) => f.values[k]),
  ]
  return c.query(
    `INSERT INTO "PatientServiceFile" (${columns.map((k) => `"${k}"`).join(', ')})
     VALUES (${values.map((_, i) => `$${i + 1}`).join(', ')})`,
    values,
  )
}

const FULL_VALUES: Record<TenColumn, string | null> = {
  medicalDiagnosis: 'AOMI',
  careMode: 'HDJ',
  orientation: 'ORIENTATION_PRO_SANTE_EXT',
  etpDecision: 'OUI',
  programType: 'VIVA',
  nonInclusionDetails: 'REFUS',
  customContentDetails: 'Atelier cuisine adapte',
  goal: 'Marcher trente minutes par jour',
  stopReason: 'DECES',
  etpFinalOutcome: 'M12',
}

const seedBase = async (c: Client) => {
  await c.query(`
    INSERT INTO "Establishment" (id, name) VALUES ('E1', 'CHU'), ('E2', 'Clinique');
    INSERT INTO "Service" (id, "establishmentId", name) VALUES
      ('S1', 'E1', 'Cardiologie'), ('S2', 'E1', 'Pneumologie'), ('S3', 'E2', 'Diabetologie');
    INSERT INTO "Patient" (id, "establishmentId", "firstName", "lastName", "createDate") VALUES
      ('P1', 'E1', 'Claire', 'Dubois', now()),
      ('P2', 'E1', 'Marc', 'Renard', now()),
      ('P3', 'E2', 'Lea', 'Martin', now());
  `)
}

describe('migration service_fields', () => {
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

  it('pose le catalogue ETP sur chaque service, recopie les valeurs et supprime les dix colonnes', async () => {
    const c = await nouvelleBase('ok')
    try {
      await seedBase(c)
      await insertFile(c, {
        id: 'F1',
        patientId: 'P1',
        serviceId: 'S1',
        establishmentId: 'E1',
        values: FULL_VALUES,
      })
      await insertFile(c, {
        id: 'F2',
        patientId: 'P2',
        serviceId: 'S1',
        establishmentId: 'E1',
        values: {
          ...FULL_VALUES,
          medicalDiagnosis: 'Diabète de type 2',
          careMode: '',
          goal: null,
        },
      })
      await insertFile(c, {
        id: 'F3',
        patientId: 'P1',
        serviceId: 'S2',
        establishmentId: 'E1',
        values: { ...FULL_VALUES, medicalDiagnosis: 'AVC', careMode: 'HDS' },
      })
      await insertFile(c, {
        id: 'F4',
        patientId: 'P3',
        serviceId: 'S3',
        establishmentId: 'E2',
        values: { ...FULL_VALUES, orientation: 'NS', stopReason: null },
      })

      await applyTarget(c)

      const defs = await c.query<{
        id: string
        serviceId: string
        establishmentId: string
        key: string
        label: string
        type: string
        section: string
        clinical: boolean
        order: number
      }>(
        `SELECT id, "serviceId", "establishmentId", key, label, type, section, clinical, "order"
         FROM "ServiceFieldDefinition" ORDER BY "serviceId", "order"`,
      )
      const expectedDefs = ETP_FIELD_PRESET.map((f, order) => ({
        key: f.key,
        label: f.label,
        type: f.type,
        section: f.section,
        clinical: f.clinical,
        order,
      }))
      for (const [serviceId, establishmentId] of [
        ['S1', 'E1'],
        ['S2', 'E1'],
        ['S3', 'E2'],
      ]) {
        const ofService = defs.rows.filter((d) => d.serviceId === serviceId)
        expect(
          ofService.map(({ key, label, type, section, clinical, order }) => ({
            key,
            label,
            type,
            section,
            clinical,
            order,
          })),
        ).toEqual(expectedDefs)
        expect(
          ofService.every((d) => d.establishmentId === establishmentId),
        ).toBe(true)
      }

      const choices = await c.query<{
        id: string
        serviceId: string
        establishmentId: string
        defServiceId: string
        defEstablishmentId: string
        field: string
        key: string
        label: string
        order: number
        archived: boolean
      }>(
        `SELECT c.id, c."serviceId", c."establishmentId", d."serviceId" AS "defServiceId",
                d."establishmentId" AS "defEstablishmentId", d.key AS field, c.key, c.label, c."order",
                c."archivedAt" IS NOT NULL AS archived
         FROM "ServiceFieldChoice" c JOIN "ServiceFieldDefinition" d ON d.id = c."fieldId"
         ORDER BY c."serviceId", d."order", c."order"`,
      )
      expect(
        choices.rows.every(
          (c) =>
            c.serviceId === c.defServiceId &&
            c.establishmentId === c.defEstablishmentId,
        ),
      ).toBe(true)
      const expectedChoices = ETP_FIELD_PRESET.flatMap((f) =>
        f.choices.map((ch, order) => ({
          field: f.key,
          key: ch.key,
          label: ch.label,
          order,
        })),
      )
      for (const serviceId of ['S1', 'S2', 'S3']) {
        const active = choices.rows
          .filter((ch) => ch.serviceId === serviceId && !ch.archived)
          .map(({ field, key, label, order }) => ({ field, key, label, order }))
        expect(active).toEqual(expectedChoices)
      }
      expect(
        choices.rows
          .filter((ch) => ch.archived)
          .map(({ serviceId, field, key, label }) => ({
            serviceId,
            field,
            key,
            label,
          })),
      ).toEqual([
        {
          serviceId: 'S1',
          field: 'medicalDiagnosis',
          key: 'Diabète de type 2',
          label: 'Diabète de type 2',
        },
      ])

      const files = await c.query<{
        id: string
        data: Record<string, string>
        clinicalData: Record<string, string>
      }>(
        'SELECT id, data, "clinicalData" FROM "PatientServiceFile" ORDER BY id',
      )
      const { medicalDiagnosis, ...fullData } = FULL_VALUES
      const byId = new Map(files.rows.map((f) => [f.id, f]))
      expect(byId.get('F1')).toEqual({
        id: 'F1',
        data: fullData,
        clinicalData: { medicalDiagnosis },
      })
      const f2Data = Object.fromEntries(
        Object.entries(fullData).filter(
          ([k]) => k !== 'careMode' && k !== 'goal',
        ),
      )
      expect(byId.get('F2')).toEqual({
        id: 'F2',
        data: f2Data,
        clinicalData: { medicalDiagnosis: 'Diabète de type 2' },
      })
      expect(byId.get('F3')?.data.careMode).toBe('HDS')
      expect(byId.get('F3')?.clinicalData).toEqual({ medicalDiagnosis: 'AVC' })
      expect(byId.get('F4')?.data.orientation).toBe('NS')
      expect(byId.get('F4')?.data).not.toHaveProperty('stopReason')

      expect(await remainingColumns(c)).toEqual([])

      const ids = [...defs.rows, ...choices.rows].map((r) => r.id)
      expect(ids.filter((id) => !z.cuid().safeParse(id).success)).toEqual([])
      expect(new Set(ids).size).toBe(ids.length)
    } finally {
      await c.end()
    }
  })

  it('refuse et annule tout si une valeur n est pas recopiee a l identique', async () => {
    const c = await nouvelleBase('garde')
    try {
      await seedBase(c)
      await insertFile(c, {
        id: 'F1',
        patientId: 'P1',
        serviceId: 'S1',
        establishmentId: 'E1',
        values: { ...FULL_VALUES, orientation: 'SABOTAGE' },
      })
      await c.query(`
        CREATE FUNCTION sabotage() RETURNS trigger AS $$
        BEGIN
          IF NEW."orientation" = 'SABOTAGE' THEN NEW.data := '{}'; END IF;
          RETURN NEW;
        END $$ LANGUAGE plpgsql;
        CREATE TRIGGER sabotage BEFORE UPDATE ON "PatientServiceFile"
          FOR EACH ROW EXECUTE FUNCTION sabotage();
      `)

      await expect(applyTarget(c)).rejects.toThrow(
        /valeurs non recopiees pour .*\borientation\b/,
      )
      await c.query('ROLLBACK')

      expect(await remainingColumns(c)).toEqual([...TEN_COLUMNS].sort())
      const table = await c.query<{ reg: string | null }>(
        `SELECT to_regclass('"ServiceFieldDefinition"') AS reg`,
      )
      expect(table.rows[0]?.reg).toBeNull()
      const kept = await c.query<{ orientation: string }>(
        'SELECT orientation FROM "PatientServiceFile" WHERE id = $1',
        ['F1'],
      )
      expect(kept.rows[0]?.orientation).toBe('SABOTAGE')
    } finally {
      await c.end()
    }
  })

  it('passe sans rien creer quand il n y a aucun service', async () => {
    const c = await nouvelleBase('vide')
    try {
      await applyTarget(c)
      const counts = await c.query<{ defs: number; choices: number }>(
        `SELECT (SELECT count(*)::int FROM "ServiceFieldDefinition") AS defs,
                (SELECT count(*)::int FROM "ServiceFieldChoice") AS choices`,
      )
      expect(counts.rows[0]).toEqual({ defs: 0, choices: 0 })
      expect(await remainingColumns(c)).toEqual([])
    } finally {
      await c.end()
    }
  })
})
