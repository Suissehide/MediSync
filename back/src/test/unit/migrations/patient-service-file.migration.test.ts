import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import { config as loadDotenv } from 'dotenv'
import { Client } from 'pg'

// Ce test joue la VRAIE migration `patient_service_file` — le fichier sur disque, pas une
// copie — sur une base Postgres jetable, créée et détruite pour l'occasion. Il ne touche
// jamais `medisync` (base de développement de Léo) ni `medisync_test` (base des tests e2e).
//
// Pourquoi un test "unit" plutôt qu'un test "e2e", alors qu'il ouvre une vraie connexion
// Postgres ? Parce que `npm run test:e2e` dépend (via wireit) de `prisma:migrate:deploy:test`,
// qui applique TOUTES les migrations en attente sur `medisync_test` avant même que Jest ne
// démarre. Or `medisync_test` est peuplée par `prisma db seed`, qui crée volontairement DEUX
// services par établissement (pour éprouver le cloisonnement inter-services des étapes
// précédentes) — exactement la situation que la garde du service unique refuse. Tant qu'un
// autre chantier n'a pas changé cela, `prisma:migrate:deploy:test` échoue avant que Jest ne
// s'exécute, et AUCUN test e2e ne peut tourner, celui-ci compris. Le projet "unit" ne dépend
// que de `prisma:generate` : ce test y est donc autonome, et continue de s'exécuter même
// quand `medisync_test` est dans cet état.
//
// Ne jamais faire silencieusement l'impasse : si Postgres n'est pas joignable, ou si une base
// ne peut pas être créée, les hooks ci-dessous lèvent avec un message explicite plutôt que
// d'appeler `test.skip` — un test qui passe au vert en ne s'exécutant pas vaudrait moins que
// pas de test du tout, sur la seule migration du chantier qui déplace des données de santé.

jest.setTimeout(180_000)

const BACK_ROOT = join(__dirname, '../../../..')
const MIGRATIONS_DIR = join(BACK_ROOT, 'prisma/migrations')
const CHECKS_DIR = join(BACK_ROOT, 'prisma/checks')
const TARGET_MIGRATION = '20260924160131_patient_service_file'
const TARGET_MIGRATION_SQL = join(MIGRATIONS_DIR, TARGET_MIGRATION, 'migration.sql')

// Préfixe distinctif : jamais "medisync" ni "medisync_test", pour qu'un DROP DATABASE de ce
// fichier ne puisse par construction jamais viser une base qui compte.
const PREFIX = 'medisync_migr_check'
const TEMPLATE_DB = `${PREFIX}_template`
const SCENARIOS = {
  ok: `${PREFIX}_ok`,
  deuxServices: `${PREFIX}_deux_services`,
  zeroService: `${PREFIX}_zero_service`,
} as const

type PgConn = { host: string; port: number; user: string; password: string }

// Reprend la convention de dotenv-cli utilisée par les scripts `*:test` (`-e .env.test.local
// -e .env.test`) : le premier fichier présent l'emporte. Seuls l'hôte, le port et les
// identifiants sont repris d'ici — jamais le nom de base qu'ils portent (`medisync_test`) :
// ce test ouvre ses propres bases, sous son propre préfixe.
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
      'Test de migration : impossible de resoudre la connexion Postgres. DATABASE_URL est ' +
        'absent une fois back/.env.test.local et back/.env.test charges. Sur cette machine, ' +
        'Postgres ecoute sur le port 5433 (conteneur medisync-postgres) — voir back/.env.test.local.',
    )
  }
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new Error(`Test de migration : DATABASE_URL n'est pas une URL valide ("${raw}").`)
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

// Termine les connexions residuelles avant un DROP DATABASE : une base issue d'une execution
// precedente interrompue (crash, Ctrl+C) peut laisser une connexion ouverte qui bloquerait
// sinon silencieusement le nettoyage.
const terminateConnectionsTo = async (maint: Client, name: string): Promise<void> => {
  await maint.query(
    `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
    [name],
  )
}

const dropDatabaseIfExists = async (maint: Client, name: string): Promise<void> => {
  await terminateConnectionsTo(maint, name)
  await maint.query(`DROP DATABASE IF EXISTS "${name}"`)
}

// Les migrations anterieures a la cible, dans l'ordre chronologique (le prefixe horodate des
// dossiers garantit que le tri alphabetique EST le tri chronologique). "Anterieures... jusqu'a
// celle-ci exclue" : la cible est appliquee separement, par `applyTargetMigration`, pour
// pouvoir inserer le jeu de donnees entre les deux.
const priorMigrationFiles = (): string[] => {
  const dirs = readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
  const targetIndex = dirs.indexOf(TARGET_MIGRATION)
  if (targetIndex === -1) {
    throw new Error(
      `Test de migration : la migration cible "${TARGET_MIGRATION}" est introuvable dans ` +
        `${MIGRATIONS_DIR}. Son nom a probablement change — mettre a jour ce test.`,
    )
  }
  return dirs.slice(0, targetIndex).map((dir) => join(MIGRATIONS_DIR, dir, 'migration.sql'))
}

// `client.query(text)` avec un seul argument texte (pas de tableau de parametres) emploie le
// protocole "simple query" de Postgres, qui accepte plusieurs instructions separees par des
// points-virgules dans un seul appel — necessaire ici, la migration cible et la plupart des
// migrations anterieures en portent plusieurs (CREATE TABLE, CREATE INDEX, ALTER TABLE...).
const applySqlFile = async (client: Client, path: string): Promise<void> => {
  const sql = readFileSync(path, 'utf8')
  await client.query(sql)
}

// Lit et joue le VRAI fichier de la migration cible, a chaque appel : si son contenu change,
// ce test change de comportement avec lui, il ne peut pas rester vert sur un fichier perime.
const applyTargetMigration = (client: Client): Promise<void> => applySqlFile(client, TARGET_MIGRATION_SQL)

const buildTemplateDatabase = async (conn: PgConn, maint: Client): Promise<void> => {
  await dropDatabaseIfExists(maint, TEMPLATE_DB)
  await maint.query(`CREATE DATABASE "${TEMPLATE_DB}"`)
  const client = clientFor(conn, TEMPLATE_DB)
  await client.connect()
  try {
    for (const file of priorMigrationFiles()) {
      await applySqlFile(client, file)
    }
  } finally {
    // La connexion doit etre fermee : CREATE DATABASE ... TEMPLATE exige que la base source
    // n'ait plus aucune connexion active au moment du clonage.
    await client.end()
  }
}

const cloneFromTemplate = async (maint: Client, name: string): Promise<void> => {
  await dropDatabaseIfExists(maint, name)
  await terminateConnectionsTo(maint, TEMPLATE_DB)
  await maint.query(`CREATE DATABASE "${name}" TEMPLATE "${TEMPLATE_DB}"`)
}

// Clone une base fraiche depuis le gabarit (migrations anterieures deja appliquees une seule
// fois, pour eviter de les rejouer a chaque scenario), execute `fn`, puis supprime la base —
// y compris si `fn` leve, pour ne jamais laisser de residu meme sur un test en echec.
const withScenarioDatabase = async <T>(
  conn: PgConn,
  maint: Client,
  name: string,
  fn: (client: Client) => Promise<T>,
): Promise<T> => {
  await cloneFromTemplate(maint, name)
  const client = clientFor(conn, name)
  await client.connect()
  try {
    return await fn(client)
  } finally {
    await client.end()
    await dropDatabaseIfExists(maint, name)
  }
}

const insertEstablishment = (client: Client, id: string, name: string): Promise<unknown> =>
  client.query('INSERT INTO "Establishment" (id, name) VALUES ($1, $2)', [id, name])

const insertService = (client: Client, id: string, establishmentId: string, name: string): Promise<unknown> =>
  client.query('INSERT INTO "Service" (id, "establishmentId", name) VALUES ($1, $2, $3)', [
    id,
    establishmentId,
    name,
  ])

// Les seize colonnes qui demenagent, dans l'ordre du schema d'avant migration.
const SIXTEEN_FIELDS = [
  'referringCaregiver',
  'followUpToDo',
  'notes',
  'details',
  'medicalDiagnosis',
  'entryDate',
  'careMode',
  'orientation',
  'etpDecision',
  'programType',
  'nonInclusionDetails',
  'customContentDetails',
  'goal',
  'exitDate',
  'stopReason',
  'etpFinalOutcome',
] as const

type SixteenField = (typeof SIXTEEN_FIELDS)[number]

type PatientSeed = {
  id: string
  firstName: string
  lastName: string
  createDate: string
  fields: Record<SixteenField, string | null>
}

const insertPatient = (client: Client, establishmentId: string, patient: PatientSeed): Promise<unknown> => {
  const columns = ['id', 'establishmentId', 'firstName', 'lastName', 'createDate', ...SIXTEEN_FIELDS]
  const values: (string | null)[] = [
    patient.id,
    establishmentId,
    patient.firstName,
    patient.lastName,
    patient.createDate,
    ...SIXTEEN_FIELDS.map((field) => patient.fields[field]),
  ]
  const quotedColumns = columns.map((c) => `"${c}"`).join(', ')
  const placeholders = values.map((_, i) => `$${i + 1}`).join(', ')
  return client.query(`INSERT INTO "Patient" (${quotedColumns}) VALUES (${placeholders})`, values)
}

type CheckRow = { check: string; value: string }

// Joue le VRAI fichier de controle (dossier-patient-avant.sql ou dossier-patient.sql) : ce
// sont eux la mesure qui sera rejouee au deploiement, ce test ne la reimplemente pas. Chaque
// fichier est une unique requete `SELECT ... UNION ALL ...`, jouee telle quelle.
const runCheckFile = async (client: Client, filename: string): Promise<Map<string, string>> => {
  const sql = readFileSync(join(CHECKS_DIR, filename), 'utf8')
  const result = await client.query<CheckRow>(sql)
  return new Map(result.rows.map((row) => [row.check, row.value]))
}

// Identifiants du scenario "ok" : deux patients aux seize valeurs toutes distinctes l'une de
// l'autre (dans un meme patient comme entre les deux), pour qu'une recopie decalee — d'un
// champ a l'autre, ou d'un patient a l'autre — ne puisse pas passer inapercue derriere une
// coincidence de valeurs. Au moins un NULL et au moins une date par patient.
const ESTAB_1 = 'estab-ok-1'
const SVC_1 = 'svc-ok-1'
const ESTAB_2 = 'estab-ok-2'
const SVC_2A = 'svc-ok-2a'
const SVC_2B = 'svc-ok-2b'

const PATIENT_1: PatientSeed = {
  id: 'patient-ok-1',
  firstName: 'Claire',
  lastName: 'Dubois',
  createDate: '2021-03-10T09:00:00.000Z',
  fields: {
    referringCaregiver: 'Dr Martin Lefevre',
    followUpToDo: 'RDV cardio dans 3 mois',
    notes: 'Patiente tres motivee, suit bien le programme',
    details: 'Antecedents familiaux de diabete',
    medicalDiagnosis: 'Diabete de type 2',
    entryDate: '2021-04-01',
    careMode: 'Ambulatoire',
    orientation: 'Education therapeutique structuree',
    etpDecision: 'Valide en reunion pluridisciplinaire',
    programType: 'Nutrition et activite physique',
    nonInclusionDetails: null,
    customContentDetails: 'Atelier cuisine adapte',
    goal: 'Perdre huit kilos en un an',
    exitDate: '2022-01-15',
    stopReason: 'Objectifs atteints, sortie du programme',
    etpFinalOutcome: 'Autonomie acquise sur l alimentation',
  },
}

const PATIENT_2: PatientSeed = {
  id: 'patient-ok-2',
  firstName: 'Marc',
  lastName: 'Renard',
  createDate: '2020-07-04T14:30:00.000Z',
  fields: {
    referringCaregiver: 'Dr Sophie Nguyen',
    followUpToDo: null,
    notes: 'RAS a ce jour',
    details: 'Vit seul, peu de soutien familial',
    medicalDiagnosis: 'Asthme severe',
    entryDate: '2020-09-12',
    careMode: 'Hospitalisation de jour',
    orientation: 'Suivi individuel renforce',
    etpDecision: 'Refuse une premiere fois puis accepte',
    programType: 'Reeducation respiratoire',
    nonInclusionDetails: 'Non concerne',
    customContentDetails: null,
    goal: 'Ameliorer le souffle a l effort',
    exitDate: null,
    stopReason: null,
    etpFinalOutcome: null,
  },
}

// Garde-fou interne : si un futur editeur affaiblit le jeu en rapprochant deux valeurs, ce
// test le dit lui-meme plutot que de laisser une empreinte coincider par accident.
const assertFixtureValuesAreDistinct = (): void => {
  const values = [
    ...SIXTEEN_FIELDS.map((f) => PATIENT_1.fields[f]),
    ...SIXTEEN_FIELDS.map((f) => PATIENT_2.fields[f]),
  ].filter((v): v is string => v !== null)
  expect(new Set(values).size).toBe(values.length)
}

const STRUCTURAL_ZERO_LABELS = [
  'Sous-dossiers sans patient',
  'Sous-dossiers hors etablissement du service',
  'Patients sans sous-dossier',
  'Diagnostics orphelins',
  'Inscriptions orphelines',
] as const

describe('migration patient_service_file — base jetable, jamais medisync ni medisync_test', () => {
  let conn: PgConn
  let maint: Client

  beforeAll(async () => {
    conn = resolveConnection()
    maint = clientFor(conn, 'postgres')
    try {
      await maint.connect()
    } catch (err) {
      throw new Error(
        `Test de migration : connexion a Postgres impossible sur ${conn.host}:${conn.port} ` +
          `(utilisateur "${conn.user}"). Verifier que le conteneur medisync-postgres tourne ` +
          `et publie bien sur ce port. Cause : ${(err as Error).message}`,
      )
    }
    await buildTemplateDatabase(conn, maint)
  })

  afterAll(async () => {
    if (!maint) {
      return
    }
    await dropDatabaseIfExists(maint, SCENARIOS.ok)
    await dropDatabaseIfExists(maint, SCENARIOS.deuxServices)
    await dropDatabaseIfExists(maint, SCENARIOS.zeroService)
    await dropDatabaseIfExists(maint, TEMPLATE_DB)
    await maint.end()
  })

  it(
    'recopie les seize colonnes de deux patients sans perte ni decalage, date le sous-dossier ' +
      'de la creation du patient et non d aujourd hui, et laisse passer un etablissement sans ' +
      'patient meme avec plusieurs services',
    async () => {
      assertFixtureValuesAreDistinct()

      await withScenarioDatabase(conn, maint, SCENARIOS.ok, async (client) => {
        await insertEstablishment(client, ESTAB_1, 'Etablissement Alpha')
        await insertService(client, SVC_1, ESTAB_1, 'Service Unique')
        // Un etablissement SANS patient, avec DEUX services : la garde ne doit pas s'y
        // interesser, puisqu'aucune de ses colonnes de parcours ne sera jamais recopiee.
        // C'est la correction apportee au plan (voir migration.sql) : la garde d'origine
        // aurait bloque ce cas sans raison de securite, en confondant "plusieurs services"
        // avec "plusieurs services ET des patients a repartir".
        await insertEstablishment(client, ESTAB_2, 'Etablissement Beta Sans Patient')
        await insertService(client, SVC_2A, ESTAB_2, 'Service Beta A')
        await insertService(client, SVC_2B, ESTAB_2, 'Service Beta B')
        await insertPatient(client, ESTAB_1, PATIENT_1)
        await insertPatient(client, ESTAB_1, PATIENT_2)

        const avant = await runCheckFile(client, 'dossier-patient-avant.sql')
        expect(avant.get('Patients')).toBe('2')
        expect(avant.get('Etablissements')).toBe('2')
        expect(avant.get('Services')).toBe('3')

        await applyTargetMigration(client)

        const apres = await runCheckFile(client, 'dossier-patient.sql')

        // Chaque libelle du fichier "avant" doit se retrouver a l'identique dans le fichier
        // "apres" : les trois comptages globaux, les seize presences, les seize empreintes.
        // Envelopper dans { label, value } plutot que comparer les deux Map directement fait
        // nommer par Jest le libelle fautif en cas d'ecart, au lieu d'un diff illisible.
        for (const [label, expected] of avant) {
          expect({ label, value: apres.get(label) }).toEqual({ label, value: expected })
        }

        // Invariants de structure, qui n'ont de sens qu'apres migration : le decompte
        // bilateral (autant de sous-dossiers que de patients, jamais plus) et les cinq
        // mesures d'orphelins, toutes a zero.
        expect(apres.get('Sous-dossiers')).toBe(avant.get('Patients'))
        for (const label of STRUCTURAL_ZERO_LABELS) {
          expect({ label, value: apres.get(label) }).toEqual({ label, value: '0' })
        }

        // La correction du plan sur `createdAt` : le sous-dossier recopie la date de creation
        // du patient, il n'est pas date d'aujourd'hui.
        const dates = await client.query<{ id: string; same: boolean }>(`
          SELECT p.id, (p."createDate" = f."createdAt") AS same
          FROM "Patient" p
          JOIN "PatientServiceFile" f ON f."patientId" = p.id
          ORDER BY p.id
        `)
        expect(dates.rows).toHaveLength(2)
        for (const row of dates.rows) {
          expect({ id: row.id, same: row.same }).toEqual({ id: row.id, same: true })
        }
      })
    },
  )

  it(
    'refuse un etablissement a plusieurs services des lors qu il a des patients, sans avoir ' +
      'touche une seule donnee',
    async () => {
      const ESTAB = 'estab-2svc'
      const SVC_A = 'svc-2svc-a'
      const SVC_B = 'svc-2svc-b'
      const patient: PatientSeed = {
        ...PATIENT_1,
        id: 'patient-2svc-1',
        fields: { ...PATIENT_1.fields, notes: 'Valeur originale a ne jamais perdre (2 services)' },
      }

      await withScenarioDatabase(conn, maint, SCENARIOS.deuxServices, async (client) => {
        await insertEstablishment(client, ESTAB, 'Etablissement CHU Fictif')
        await insertService(client, SVC_A, ESTAB, 'Service A')
        await insertService(client, SVC_B, ESTAB, 'Service B')
        await insertPatient(client, ESTAB, patient)

        await expect(applyTargetMigration(client)).rejects.toThrow(/plusieurs services/)

        // Rien touche : ni la table du sous-dossier, ni la moindre colonne de Patient. La
        // garde est la toute premiere instruction du fichier, avant meme la creation de la
        // table — si elle leve, il n'existe litteralement rien avant elle a defaire.
        const table = await client.query<{ reg: string | null }>(
          `SELECT to_regclass('"PatientServiceFile"') AS reg`,
        )
        expect(table.rows[0]?.reg).toBeNull()

        const count = await client.query<{ n: number }>('SELECT count(*)::int AS n FROM "Patient"')
        expect(count.rows[0]?.n).toBe(1)

        const notes = await client.query<{ notes: string | null }>(
          'SELECT notes FROM "Patient" WHERE id = $1',
          [patient.id],
        )
        expect(notes.rows[0]?.notes).toBe(patient.fields.notes)
      })
    },
  )

  it(
    'refuse un etablissement sans aucun service tant qu il a des patients, sans avoir touche ' +
      'une seule donnee',
    async () => {
      const ESTAB = 'estab-0svc'
      const patient: PatientSeed = {
        ...PATIENT_2,
        id: 'patient-0svc-1',
        fields: { ...PATIENT_2.fields, notes: 'Valeur originale a ne jamais perdre (0 service)' },
      }

      await withScenarioDatabase(conn, maint, SCENARIOS.zeroService, async (client) => {
        await insertEstablishment(client, ESTAB, 'Etablissement Sans Service')
        // Aucun service cree pour cet etablissement : c'est exactement le cas que la garde
        // d'origine du plan laissait passer (elle ne refusait que > 1 service). La jointure
        // du remplissage n'aurait produit aucune ligne pour ces patients, et le temps 3 aurait
        // ensuite supprime leurs seize colonnes sans qu'aucun sous-dossier ne les recoive —
        // une perte silencieuse, exactement ce que la garde existe pour empecher.
        await insertPatient(client, ESTAB, patient)

        await expect(applyTargetMigration(client)).rejects.toThrow(/aucun service/)

        const table = await client.query<{ reg: string | null }>(
          `SELECT to_regclass('"PatientServiceFile"') AS reg`,
        )
        expect(table.rows[0]?.reg).toBeNull()

        const count = await client.query<{ n: number }>('SELECT count(*)::int AS n FROM "Patient"')
        expect(count.rows[0]?.n).toBe(1)

        const notes = await client.query<{ notes: string | null }>(
          'SELECT notes FROM "Patient" WHERE id = $1',
          [patient.id],
        )
        expect(notes.rows[0]?.notes).toBe(patient.fields.notes)
      })
    },
  )
})
