import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { config as loadDotenv } from 'dotenv'
import { Client } from 'pg'

// Joue la VRAIE migration `soignants_salles_par_service` — le fichier sur disque — sur des bases
// Postgres jetables, creees et detruites ici, jamais `medisync` ni `medisync_test`. Meme principe
// et meme raison d'etre un test « unit » que `patient-service-file.migration.test.ts` (voir son
// en-tete) : les migrations anterieures, puis un jeu de donnees, puis la cible.
//
// Ce qu'on verifie : chaque soignant et chaque salle est copie dans CHAQUE service de son
// etablissement, la premiere copie garde l'identifiant d'origine, et chaque reference (creneau,
// thematique, tache, salle d'un creneau, rattachement d'un membre) vise la copie de SON service.

jest.setTimeout(180_000)

const BACK_ROOT = join(__dirname, '../../../..')
const MIGRATIONS_DIR = join(BACK_ROOT, 'prisma/migrations')
const TARGET_MIGRATION = '20260929100000_soignants_salles_par_service'
const PREFIX = 'medisync_migr_soignants'

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

describe('migration soignants_salles_par_service', () => {
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

  it('copie soignants et salles dans chaque service et reoriente chaque reference vers la copie de son service', async () => {
    const c = await nouvelleBase('ok')
    try {
      await c.query(`
        INSERT INTO "Establishment" (id, name) VALUES ('E', 'CHU Haut-Leveque'), ('F', 'Autre');
        INSERT INTO "Service" (id, "establishmentId", name, "createdAt") VALUES
          ('A', 'E', 'Cardiologie', '2026-01-01'),
          ('B', 'E', 'Pneumologie', '2026-02-01'),
          ('X', 'F', 'Ailleurs', '2026-01-01');
        INSERT INTO "Soignant" (id, "establishmentId", name) VALUES ('S', 'E', 'Dieteticienne'), ('SF', 'F', 'Kine');
        INSERT INTO "Location" (id, "establishmentId", name) VALUES ('L', 'E', 'Salle 1');
        INSERT INTO "SlotTemplate" (id, "establishmentId", "serviceId", "startTime", "endTime", "offsetDays", "isIndividual", color, "locationID") VALUES
          ('TA', 'E', 'A', '09:00', '10:00', 0, false, '#fff', 'L'),
          ('TB', 'E', 'B', '09:00', '10:00', 0, false, '#fff', 'L');
        INSERT INTO "SlotTemplateSoignant" ("slotTemplateId", "soignantId", "serviceId", "establishmentId") VALUES
          ('TA', 'S', 'A', 'E'), ('TB', 'S', 'B', 'E');
        INSERT INTO "Thematic" (id, "establishmentId", "serviceId", name) VALUES ('HB', 'E', 'B', 'Alimentation');
        INSERT INTO "SoignantThematic" ("soignantId", "thematicId", "serviceId", "establishmentId") VALUES ('S', 'HB', 'B', 'E');
        INSERT INTO "Todo" (id, "establishmentId", "serviceId", "createDate", title, completed, "soignantID") VALUES
          ('TODO_B', 'E', 'B', now(), 'Appeler', false, 'S'),
          ('TODO_ETRANGER', 'E', 'A', now(), 'Incoherent', false, 'SF');
        INSERT INTO "User" (id, email, password, salt) VALUES ('U', 'u@test.fr', 'x', 'y');
        INSERT INTO "EstablishmentMembership" (id, "userId", "establishmentId", role, "soignantId") VALUES ('M', 'U', 'E', 'MEMBER', 'S');
        INSERT INTO "ServiceMembership" (id, "establishmentMembershipId", "serviceId", "establishmentId", role) VALUES
          ('MA', 'M', 'A', 'E', 'INTERVENANT'), ('MB', 'M', 'B', 'E', 'INTERVENANT');
      `)

      await applyTarget(c)

      const soignants = (
        await c.query(
          `SELECT id, "serviceId", name FROM "Soignant" WHERE "establishmentId" = 'E' ORDER BY "serviceId"`,
        )
      ).rows
      expect(soignants.map((s) => [s.serviceId, s.name])).toEqual([
        ['A', 'Dieteticienne'],
        ['B', 'Dieteticienne'],
      ])
      // Le premier service (par date de creation) garde l'identifiant d'origine.
      expect(soignants[0].id).toBe('S')
      const copieB = soignants[1].id as string
      expect(copieB).not.toBe('S')
      expect(copieB).toMatch(/^c[0-9a-f]{32}$/)

      const salles = (
        await c.query(
          `SELECT id, "serviceId" FROM "Location" ORDER BY "serviceId"`,
        )
      ).rows
      expect(salles.map((l) => l.serviceId)).toEqual(['A', 'B'])
      expect(salles[0].id).toBe('L')
      const salleB = salles[1].id as string

      const un = async (sql: string) => (await c.query(sql)).rows[0]
      expect(
        (
          await un(
            `SELECT "soignantId" FROM "SlotTemplateSoignant" WHERE "slotTemplateId" = 'TA'`,
          )
        ).soignantId,
      ).toBe('S')
      expect(
        (
          await un(
            `SELECT "soignantId" FROM "SlotTemplateSoignant" WHERE "slotTemplateId" = 'TB'`,
          )
        ).soignantId,
      ).toBe(copieB)
      expect(
        (
          await un(
            `SELECT "soignantId" FROM "SoignantThematic" WHERE "thematicId" = 'HB'`,
          )
        ).soignantId,
      ).toBe(copieB)
      expect(
        (await un(`SELECT "soignantID" FROM "Todo" WHERE id = 'TODO_B'`))
          .soignantID,
      ).toBe(copieB)
      expect(
        (await un(`SELECT "soignantID" FROM "Todo" WHERE id = 'TODO_ETRANGER'`))
          .soignantID,
      ).toBeNull()
      expect(
        (await un(`SELECT "locationID" FROM "SlotTemplate" WHERE id = 'TA'`))
          .locationID,
      ).toBe('L')
      expect(
        (await un(`SELECT "locationID" FROM "SlotTemplate" WHERE id = 'TB'`))
          .locationID,
      ).toBe(salleB)
      expect(
        (
          await un(
            `SELECT "soignantId" FROM "ServiceMembership" WHERE id = 'MA'`,
          )
        ).soignantId,
      ).toBe('S')
      expect(
        (
          await un(
            `SELECT "soignantId" FROM "ServiceMembership" WHERE id = 'MB'`,
          )
        ).soignantId,
      ).toBe(copieB)

      const colonne = await c.query(
        `SELECT 1 FROM information_schema.columns WHERE table_name = 'EstablishmentMembership' AND column_name = 'soignantId'`,
      )
      expect(colonne.rowCount).toBe(0)

      // L'autre etablissement : son soignant rejoint son unique service, sans copie.
      expect(
        (
          await c.query(
            `SELECT "serviceId" FROM "Soignant" WHERE "establishmentId" = 'F'`,
          )
        ).rows,
      ).toEqual([{ serviceId: 'X' }])
    } finally {
      await c.end()
    }
  })

  it('refuse, sans rien toucher, un etablissement qui a des soignants mais aucun service', async () => {
    const c = await nouvelleBase('sans_service')
    try {
      await c.query(`
        INSERT INTO "Establishment" (id, name) VALUES ('E', 'Sans service');
        INSERT INTO "Soignant" (id, "establishmentId", name) VALUES ('S', 'E', 'Infirmiere');
      `)

      await expect(applyTarget(c)).rejects.toThrow(/aucun service \(E\)/)

      const colonne = await c.query(
        `SELECT 1 FROM information_schema.columns WHERE table_name = 'EstablishmentMembership' AND column_name = 'soignantId'`,
      )
      expect(colonne.rowCount).toBe(1)
      expect(
        (await c.query(`SELECT count(*)::int AS n FROM "Soignant"`)).rows[0].n,
      ).toBe(1)
    } finally {
      await c.end()
    }
  })
})
