import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { config as loadDotenv } from 'dotenv'
import { Client, types } from 'pg'

// `timestamp` sans fuseau : on force la lecture en UTC, pas l'heure locale de la machine qui lance le test.
types.setTypeParser(1114, (val) => new Date(`${val.replace(' ', 'T')}Z`))

// Joue la VRAIE migration `taches_notifications` sur des bases Postgres jetables (jamais medisync/medisync_test) ; verifie Todo -> Task, tagues/auteur, et la disparition de Todo.

jest.setTimeout(180_000)

const BACK_ROOT = join(__dirname, '../../../..')
const MIGRATIONS_DIR = join(BACK_ROOT, 'prisma/migrations')
const TARGET_MIGRATION = '20261019100000_taches_notifications'
const PREFIX = 'medisync_migr_taches'

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

const migrationDirs = () =>
  readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort()

const priorMigrationFiles = (): string[] => {
  const dirs = migrationDirs()
  const index = dirs.indexOf(TARGET_MIGRATION)
  if (index === -1) {
    throw new Error(
      `Migration cible "${TARGET_MIGRATION}" introuvable : son nom a change, mettre ce test a jour.`,
    )
  }
  return dirs
    .slice(0, index)
    .map((d) => join(MIGRATIONS_DIR, d, 'migration.sql'))
}

const applyTarget = (c: Client) =>
  c.query(
    readFileSync(
      join(MIGRATIONS_DIR, TARGET_MIGRATION, 'migration.sql'),
      'utf8',
    ),
  )

describe('migration taches_notifications', () => {
  const conn = resolveConnection()
  const maint = clientFor(conn, 'postgres')
  const bases: string[] = []

  const nouvelleBase = async (suffixe: string): Promise<Client> => {
    const name = `${PREFIX}_${suffixe}`
    await maint.query(
      'SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()',
      [name],
    )
    await maint.query(`DROP DATABASE IF EXISTS "${name}"`)
    await maint.query(`CREATE DATABASE "${name}"`)
    bases.push(name)
    const c = clientFor(conn, name)
    await c.connect()
    for (const file of priorMigrationFiles()) {
      await c.query(readFileSync(file, 'utf8'))
    }
    return c
  }

  beforeAll(async () => {
    await maint.connect()
  })

  afterAll(async () => {
    for (const name of bases) {
      await maint.query(
        'SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()',
        [name],
      )
      await maint.query(`DROP DATABASE IF EXISTS "${name}"`)
    }
    await maint.end()
  })

  it('migre chaque Todo en tache, tague les membres qui incarnent le soignant, puis supprime Todo', async () => {
    const c = await nouvelleBase('ok')
    try {
      await c.query(`
        INSERT INTO "Establishment" (id, name) VALUES ('E', 'CHU');
        INSERT INTO "Service" (id, "establishmentId", name, "createdAt") VALUES ('A', 'E', 'Cardio', '2026-01-01');
        INSERT INTO "Soignant" (id, "establishmentId", "serviceId", name) VALUES ('S', 'E', 'A', 'IDE');
        INSERT INTO "User" (id, email, password, salt) VALUES
          ('U1', 'u1@t.fr', 'x', 'x'), ('U2', 'u2@t.fr', 'x', 'x'), ('U3', 'u3@t.fr', 'x', 'x');
        INSERT INTO "EstablishmentMembership" (id, "userId", "establishmentId", role) VALUES
          ('M1', 'U1', 'E', 'MEMBER'), ('M2', 'U2', 'E', 'MEMBER'), ('M3', 'U3', 'E', 'MEMBER');
        INSERT INTO "ServiceMembership" (id, "establishmentMembershipId", "serviceId", "establishmentId", role, "soignantId") VALUES
          ('SM1', 'M1', 'A', 'E', 'INTERVENANT', 'S'),
          ('SM2', 'M2', 'A', 'E', 'COORDINATEUR', 'S'),
          ('SM3', 'M3', 'A', 'E', 'LECTURE', 'S');
        INSERT INTO "Todo" (id, "establishmentId", "serviceId", "createDate", title, description, completed, "soignantID") VALUES
          ('T1', 'E', 'A', '2026-05-01', 'Appeler', 'le labo', true, 'S'),
          ('T2', 'E', 'A', '2026-05-02', 'Seul', NULL, false, NULL);
      `)
      await applyTarget(c)

      const t1 = (await c.query(`SELECT * FROM "Task" WHERE id = 'T1'`)).rows[0]
      expect(t1.text).toBe('Appeler\nle labo')
      expect(t1.authorId).toBe('U1')
      expect(t1.doneAt).toEqual(new Date('2026-05-01'))
      const tagues = (
        await c.query(
          `SELECT "userId" FROM "TaskAssignee" WHERE "taskId" = 'T1' ORDER BY "userId"`,
        )
      ).rows.map((r) => r.userId)
      expect(tagues).toEqual(['U1', 'U2'])

      const t2 = (await c.query(`SELECT * FROM "Task" WHERE id = 'T2'`)).rows[0]
      expect(t2.text).toBe('Seul')
      expect(t2.authorId).toBeNull()
      expect(t2.doneAt).toBeNull()
      expect(
        (await c.query(`SELECT 1 FROM "TaskAssignee" WHERE "taskId" = 'T2'`))
          .rowCount,
      ).toBe(0)

      expect(
        (await c.query(`SELECT to_regclass('"Todo"') AS t`)).rows[0].t,
      ).toBeNull()
    } finally {
      await c.end()
    }
  })
})
