import { execFileSync } from 'node:child_process'
import { existsSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { config as loadDotenv } from 'dotenv'
import { Client } from 'pg'

// Garde contre la derive silencieuse entre `schema.prisma` et le contenu reel des migrations :
// le defaut que ce fichier existe pour attraper. Le tour de correction 1 de la tache 6 a
// trouve `EnrollmentIssue` et `DiagnosticEducatif` toujours contraints vers `Patient` EN BASE
// (par les cles posees dans la migration `multi_tenant_socle`) alors que `schema.prisma` ne
// declarait plus que la relation vers `PatientServiceFile` — les deux anciennes clefs
// etrangeres n'avaient jamais ete retirees. Rien dans le depot ne l'aurait vue : ni `npm run
// build` (`tsc` ne connait que le schema, jamais la base), ni
// `patient-service-file.migration.test.ts` (il prouve que LA migration cible recopie et
// contraint correctement, pas que le schema et l'ensemble des migrations restent en accord
// une fois toutes rejouees), ni la revue de code (une lecture du schema seul ne voit aucune
// des deux clefs, puisqu'elles ne sont plus que dans une migration passee qu'on ne relit pas).
//
// La seule mesure honnete est celle que la commande officielle de Prisma produit : rejouer
// TOUTES les migrations du depot sur une base jetable, puis comparer l'etat qui en resulte au
// `schema.prisma` actuel. `prisma migrate diff --from-migrations --to-schema --exit-code` fait
// exactement cela ; ce test ne reimplemente aucune comparaison de schema lui-meme, il invoque
// le vrai outil et lit son verdict (code de sortie 0 = aucune derive, 2 = derive, tel que documente
// par `prisma migrate diff --help`).
//
// Preuve que ce test attrape reellement le defaut ci-dessus (et pas seulement un defaut
// imaginaire) : rejoue manuellement avec l'ancien contenu (avant ce tour de correction) de
// `20260924160131_patient_service_file/migration.sql`, cette meme commande rend le code 2 et
// imprime exactement les deux `DROP CONSTRAINT` qui manquaient. Voir le rapport du tour de
// correction 1 pour la sortie complete.

jest.setTimeout(180_000)

const BACK_ROOT = join(__dirname, '../../../..')
const PRISMA_DIR = join(BACK_ROOT, 'prisma')
const PRISMA_BIN = join(BACK_ROOT, 'node_modules/.bin/prisma')

// Nom distinctif : jamais "medisync" ni "medisync_test", pour qu'un DROP DATABASE de ce
// fichier ne puisse par construction jamais viser une base qui compte (meme convention que
// `patient-service-file.migration.test.ts`).
const SHADOW_DB = 'medisync_migr_check_drift_shadow'

// `prisma migrate diff --from-migrations` exige une base "shadow" pour rejouer l'historique
// et en deriver l'etat resultant (voir le message d'erreur de la commande elle-meme si ce
// parametre manque). Le `prisma.config.ts` du depot ne la declare pas — a raison : il est
// charge par CHAQUE commande Prisma (dev, build, generate...), et y exiger une variable
// d'environnement supplementaire casserait toutes ces commandes pour un besoin qui n'est
// autrement utile qu'ici. Ce test fournit donc son propre fichier de configuration, temporaire
// et jetable comme les bases qu'il cree, place a l'interieur de `prisma/` (et non dans un
// repertoire temporaire du systeme) pour que la resolution de module de `prisma/config`
// trouve `node_modules` du projet — verifie manuellement : le meme fichier place hors de
// l'arbre du projet echoue au chargement ("Cannot find module 'prisma/config'").
const TMP_CONFIG_NAME = '.tmp-schema-migrations-drift-check.config.ts'
const TMP_CONFIG_PATH = join(PRISMA_DIR, TMP_CONFIG_NAME)
const TMP_CONFIG_CONTENTS = `import type { PrismaConfig } from 'prisma'
import { defineConfig, env } from 'prisma/config'

export default defineConfig({
  schema: 'schema.prisma',
  migrations: {
    path: 'migrations',
  },
  datasource: {
    url: env('DATABASE_URL'),
    shadowDatabaseUrl: env('SHADOW_DATABASE_URL'),
  },
} satisfies PrismaConfig)
`

type PgConn = { host: string; port: number; user: string; password: string }

// Reprend la resolution de connexion de `patient-service-file.migration.test.ts` (non
// exportee de ce fichier, dupliquee ici a l'identique) : premier de `.env.test.local` /
// `.env.test' present l'emporte, seuls hote/port/identifiants sont repris — jamais le nom de
// base, ce test ouvre ses propres bases sous son propre prefixe.
const loadTestEnvFiles = (): void => {
  for (const file of ['.env.test.local', '.env.test']) {
    const path = join(BACK_ROOT, file)
    if (existsSync(path)) {
      loadDotenv({ path, quiet: true })
    }
  }
}

const resolveConnection = (): PgConn => {
  loadTestEnvFiles()
  const raw = process.env.DATABASE_URL
  if (!raw) {
    throw new Error(
      'Test de derive schema/migrations : impossible de resoudre la connexion Postgres. ' +
        'DATABASE_URL est absent une fois back/.env.test.local et back/.env.test charges. Sur ' +
        'cette machine, Postgres ecoute sur le port 5433 (conteneur medisync-postgres) — voir ' +
        'back/.env.test.local.',
    )
  }
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new Error(
      `Test de derive schema/migrations : DATABASE_URL n'est pas une URL valide ("${raw}").`,
    )
  }
  return {
    host: url.hostname,
    port: url.port ? Number(url.port) : 5432,
    user: decodeURIComponent(url.username || 'postgres'),
    password: decodeURIComponent(url.password || 'postgres'),
  }
}

const clientFor = (conn: PgConn, database: string): Client =>
  new Client({
    host: conn.host,
    port: conn.port,
    user: conn.user,
    password: conn.password,
    database,
  })

const terminateConnectionsTo = async (
  maint: Client,
  name: string,
): Promise<void> => {
  await maint.query(
    `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
    [name],
  )
}

const dropDatabaseIfExists = async (
  maint: Client,
  name: string,
): Promise<void> => {
  await terminateConnectionsTo(maint, name)
  await maint.query(`DROP DATABASE IF EXISTS "${name}"`)
}

type DiffResult = { status: number; output: string }

// `--exit-code` documente trois codes : 0 (diff vide), 1 (erreur d'execution), 2 (diff non
// vide). `execFileSync` leve sur tout code non nul ; ce wrapper distingue les trois cas au
// lieu de laisser passer une seule exception generique qui confondrait "la commande a
// echoue" et "la commande a reussi et a trouve une derive".
const runMigrateDiff = (conn: PgConn): DiffResult => {
  const url = `postgres://${conn.user}:${conn.password}@${conn.host}:${conn.port}/${SHADOW_DB}?schema=public`
  try {
    const stdout = execFileSync(
      PRISMA_BIN,
      [
        'migrate',
        'diff',
        '--config',
        TMP_CONFIG_NAME,
        '--from-migrations',
        'migrations',
        '--to-schema',
        'schema.prisma',
        '--exit-code',
        '--script',
      ],
      {
        cwd: PRISMA_DIR,
        env: { ...process.env, DATABASE_URL: url, SHADOW_DATABASE_URL: url },
        encoding: 'utf8',
      },
    )
    return { status: 0, output: stdout }
  } catch (err) {
    const execErr = err as {
      status?: number | null
      stdout?: string
      stderr?: string
    }
    return {
      status: execErr.status ?? -1,
      output: `${execErr.stdout ?? ''}${execErr.stderr ?? ''}`,
    }
  }
}

describe('schema.prisma et les migrations — aucune derive silencieuse', () => {
  let conn: PgConn
  let maint: Client

  beforeAll(async () => {
    conn = resolveConnection()
    maint = clientFor(conn, 'postgres')
    try {
      await maint.connect()
    } catch (err) {
      throw new Error(
        `Test de derive schema/migrations : connexion a Postgres impossible sur ${conn.host}:` +
          `${conn.port} (utilisateur "${conn.user}"). Verifier que le conteneur ` +
          `medisync-postgres tourne et publie bien sur ce port. Cause : ${(err as Error).message}`,
      )
    }
    await dropDatabaseIfExists(maint, SHADOW_DB)
    await maint.query(`CREATE DATABASE "${SHADOW_DB}"`)
    // Residu possible d'une execution precedente interrompue (crash, Ctrl+C) : le meme
    // nettoyage prealable que pour les bases, applique ici au fichier de config temporaire.
    rmSync(TMP_CONFIG_PATH, { force: true })
    writeFileSync(TMP_CONFIG_PATH, TMP_CONFIG_CONTENTS)
  })

  afterAll(async () => {
    rmSync(TMP_CONFIG_PATH, { force: true })
    if (!maint) {
      return
    }
    await dropDatabaseIfExists(maint, SHADOW_DB)
    await maint.end()
  })

  it('rejouer toutes les migrations du depot produit exactement l etat que decrit schema.prisma', () => {
    const result = runMigrateDiff(conn)

    if (result.status === 1) {
      throw new Error(
        `prisma migrate diff a echoue avant meme de comparer schema et migrations (pas une ` +
          `derive detectee, une erreur d'execution) : ${result.output}`,
      )
    }

    // Code 2 = derive : le schema et les migrations rejouees ne decrivent pas le meme etat.
    // `result.output` porte alors le script SQL qui la corrigerait — visible dans le rapport
    // Jest si cette assertion echoue, exactement ce qu'un mainteneur doit lire pour agir.
    expect({ status: result.status, output: result.output }).toEqual({
      status: 0,
      output: expect.stringContaining('This is an empty migration.'),
    })
  })
})
