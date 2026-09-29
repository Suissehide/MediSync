import { conflict, notFound } from '@hapi/boom'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'

import { Prisma } from '../../../generated/client'
import { buildErrorHandler } from '../../../main/interfaces/http/fastify/errors/error.handler'
import { boomErrorNormalizer } from '../../../main/interfaces/http/fastify/errors/normalizers/boom.error.normalizer'
import { fastifyErrorNormalizer } from '../../../main/interfaces/http/fastify/errors/normalizers/fastify.error.normalizer'
import {
  TenantContextMissingError,
  TenantScopeMissingError,
} from '../../../main/utils/tenant-errors'

// Reproduit task-5-re-review-3.md C1 : les 29 methodes de depot sans `catch` (dont tout le depot
// `activityLog`) laissent une erreur Prisma brute tomber directement dans ce gestionnaire —
// exactement la meme chaine de normalizers que celle enregistree dans `fastify-http-server.ts`.
const CLINICAL_VALUE = 'MOTIF-CLINIQUE-CONFIDENTIEL'
const PATIENT_ID = 'cmug61zv400098gs16ejoelmj'

const buildUnexpectedPrismaError = () =>
  new Prisma.PrismaClientValidationError(
    [
      'Invalid `this.prisma.patientServiceFile.upsert()` invocation in',
      '/app/src/main/infra/orm/repositories/patientServiceFile.repository.ts:39:49',
      '',
      `create: { patientId: "${PATIENT_ID}", notes: "${CLINICAL_VALUE}" }`,
      '',
      'Unknown argument `SABOTAGE_COLONNE_INCONNUE`. Available options are marked with ?.',
    ].join('\n'),
    { clientVersion: '0.0.0-test' },
  )

type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal'
const LOG_LEVELS: LogLevel[] = [
  'trace',
  'debug',
  'info',
  'warn',
  'error',
  'fatal',
]

// Un harnais minimal du meme contrat que `FastifyInstance`/`FastifyRequest`/`FastifyReply`, pour
// executer `buildErrorHandler` sans monter de vrai serveur Fastify. Les SIX niveaux de log
// possibles sont cables, pas seulement `debug`/`error` (task-5-re-review-4.md, I1) : les tests
// precedents ne gardaient que le canal auquel leur auteur pensait, si bien qu'une fuite ecrite
// par un canal voisin (`warn`, `info`, ...) passait au vert. `callsByLevel` garde le detail par
// niveau pour les assertions structurelles (« exactement 2 lignes `error`, 0 `debug` ») ;
// `allCalls` est la liste fusionnee de tous les niveaux, celle qu'une assertion anti-fuite doit
// boucler dessus pour garder une PROPRIETE plutot qu'un CAS. `accept` choisit la branche du
// gestionnaire exercee (JSON par defaut, HTML sur demande — la branche HTML n'etait exercee par
// aucun test avant ce tour).
const buildHarness = (accept: 'json' | 'html' = 'json') => {
  const callsByLevel: Record<LogLevel, string[]> = {
    trace: [],
    debug: [],
    info: [],
    warn: [],
    error: [],
    fatal: [],
  }
  const allCalls: string[] = []
  const record = (level: LogLevel) => (message: unknown) => {
    const text = String(message)
    callsByLevel[level].push(text)
    allCalls.push(text)
  }
  const fastifyLike = {
    log: Object.fromEntries(LOG_LEVELS.map((level) => [level, record(level)])),
  }
  const statusCodes: number[] = []
  const fakeReply = {
    status(code: number) {
      statusCodes.push(code)
      return fakeReply
    },
    type() {
      return fakeReply
    },
  }
  const fakeRequest = {
    id: 'req-test-1',
    method: 'PATCH',
    url: '/e/est1/s/svc1/patient/pat1/service-file',
    accepts: () => ({ type: () => accept }),
  }
  return {
    fastifyLike,
    fakeRequest,
    fakeReply,
    statusCodes,
    callsByLevel,
    allCalls,
  }
}

// `prismaErrorNormalizer` a ete retire (task-5-re-review-3.md, tour 5, voir
// fastify-http-server.ts) : c'etait du code mort qui, une fois "corrige", aurait recopie
// `error.message` pour toute PrismaClientKnownRequestError non attrapee. La chaine reelle ne
// compte donc plus que ces deux normalizers.
const runHandler = (
  error: unknown,
  harness: ReturnType<typeof buildHarness>,
): string | { error: string; message: string; statusCode: number } => {
  const handler = buildErrorHandler(fastifyErrorNormalizer, boomErrorNormalizer)
  return handler.call(
    harness.fastifyLike as unknown as FastifyInstance,
    error as never,
    harness.fakeRequest as unknown as FastifyRequest,
    harness.fakeReply as unknown as FastifyReply,
  )
}

const asJsonBody = (
  body: ReturnType<typeof runHandler>,
): { error: string; message: string; statusCode: number } =>
  body as { error: string; message: string; statusCode: number }

describe('la chaine de normalizers ne renvoie jamais une valeur soumise pour une erreur inattendue', () => {
  it('une ecriture clinique en echec sans catch (PrismaClientValidationError brute) ne fuit ni dans le corps, ni dans aucun canal du journal', () => {
    const harness = buildHarness()

    const body = asJsonBody(runHandler(buildUnexpectedPrismaError(), harness))

    expect(harness.statusCodes).toEqual([500])
    expect(body.message).not.toContain(CLINICAL_VALUE)
    expect(body.message).not.toContain(PATIENT_ID)
    expect(body.error).not.toContain(CLINICAL_VALUE)

    expect(harness.callsByLevel.error).toHaveLength(2)
    // Le gestionnaire ne journalise plus rien a `debug` (task-5-re-review-3.md, m3 : l'ancien
    // `this.log.debug(error)` recopiait l'erreur brute, message et pile compris, et n'etait
    // eteint qu'a `LOG_LEVEL=INFO` — pas a `DEBUG`, le reglage qu'on active justement pour
    // enqueter). Le diagnostic de `error` suffit deja ; `debug` n'ajoute plus rien qui puisse fuir.
    expect(harness.callsByLevel.debug).toHaveLength(0)
    // Et rien sur AUCUN canal (task-5-re-review-4.md, I1) : une ligne ajoutee demain sur `warn`
    // ou `info` doit faire rougir ce test, pas seulement une ligne ajoutee sur `error`.
    for (const line of harness.allCalls) {
      expect(line).not.toContain(CLINICAL_VALUE)
      expect(line).not.toContain(PATIENT_ID)
    }
  })

  it('meme requete, demandee en HTML : le corps rendu (branche HTML du gestionnaire) ne fuit pas non plus (task-5-re-review-4.md, I1)', () => {
    const harness = buildHarness('html')

    const body = runHandler(buildUnexpectedPrismaError(), harness)

    expect(harness.statusCodes).toEqual([500])
    expect(typeof body).toBe('string')
    const html = body as string
    expect(html).not.toContain(CLINICAL_VALUE)
    expect(html).not.toContain(PATIENT_ID)
    for (const line of harness.allCalls) {
      expect(line).not.toContain(CLINICAL_VALUE)
      expect(line).not.toContain(PATIENT_ID)
    }
  })

  it('le journal `error` garde de quoi enqueter sur une erreur inattendue : classe, route et pile (jamais le message brut)', () => {
    const harness = buildHarness()

    runHandler(buildUnexpectedPrismaError(), harness)

    const [diagnosticLine] = harness.callsByLevel.error
    expect(diagnosticLine).toContain('class=PrismaClientValidationError')
    expect(diagnosticLine).toContain(
      'PATCH /e/est1/s/svc1/patient/pat1/service-file',
    )
    expect(diagnosticLine).toContain('req-test-1')
    // La pile est presente (des lignes de frame), mais jamais le message brut de l'erreur : ce
    // message multi-lignes recopie integralement le `data` de l'invocation Prisma qui a echoue
    // (voir buildUnexpectedPrismaError ci-dessus).
    expect(diagnosticLine).toMatch(/at .+\(.+:\d+:\d+\)/)
    expect(diagnosticLine).not.toContain('message=')
  })

  it('un 409 delibere (contrainte metier) rend exactement le message dont le front dependent par egalite de chaine', () => {
    const harness = buildHarness()
    // Message exact attendu par `front/src/api/members.api.ts` (CONFLICT_MESSAGES) : un
    // changement ici casserait silencieusement l'affichage cote front.
    const boomError = conflict('Cannot remove the last administrator')

    const body = asJsonBody(runHandler(boomError, harness))

    expect(harness.statusCodes).toEqual([409])
    expect(body).toEqual({
      error: 'Conflict',
      message: 'Cannot remove the last administrator',
      statusCode: 409,
    })
  })

  it('un 404 delibere rend exactement le message construit par le domaine', () => {
    const harness = buildHarness()
    const boomError = notFound("Appointment: this ID doesn't exist")

    const body = asJsonBody(runHandler(boomError, harness))

    expect(harness.statusCodes).toEqual([404])
    expect(body).toEqual({
      error: 'Not Found',
      message: "Appointment: this ID doesn't exist",
      statusCode: 404,
    })
  })

  it('le journal `error` d un Boom porte son message : il est toujours ecrit par notre propre code, jamais recopie d une erreur brute', () => {
    const harness = buildHarness()
    const boomError = notFound("PatientServiceFile: this ID doesn't exist")

    runHandler(boomError, harness)

    const [diagnosticLine] = harness.callsByLevel.error
    expect(diagnosticLine).toContain(
      "message=PatientServiceFile: this ID doesn't exist",
    )
  })

  // task-5-re-review-4.md, I3 : le message d'une TenantScopeMissingError/TenantContextMissingError
  // (`utils/tenant-errors.ts`) est, au meme titre que celui d'un Boom, un texte que notre propre
  // code a ecrit — jamais recopie d'une entree soumise. `back/CLAUDE.md` promet que ce message
  // "names the entry to add" : sans lui au journal, le garde-fou de tenant refuse une requete
  // sans jamais dire quelle entree ajouter a `SERVICE_MODELS`/`NESTED_RELATIONS`.
  it('le journal `error` garde le message d une TenantScopeMissingError : c est notre propre code qui l a ecrit', () => {
    const harness = buildHarness()
    const tenantError = new TenantScopeMissingError(
      'Pathway',
      'findAll',
      'serviceId',
    )

    runHandler(tenantError, harness)

    const [diagnosticLine] = harness.callsByLevel.error
    expect(diagnosticLine).toContain(
      'message=Tenant scope missing: Pathway.findAll without serviceId',
    )
  })

  it('le journal `error` garde aussi le message d une TenantContextMissingError', () => {
    const harness = buildHarness()
    const tenantError = new TenantContextMissingError('aucun tenant pose')

    runHandler(tenantError, harness)

    const [diagnosticLine] = harness.callsByLevel.error
    expect(diagnosticLine).toContain(
      'message=Tenant context missing: aucun tenant pose',
    )
  })

  // task-5-re-review-3.md, I1 : le tour precedent ne testait la chaine qu'avec une
  // PrismaClientValidationError et une Error nue — jamais une PrismaClientKnownRequestError,
  // pourtant la seule qui porte `meta` et la seule dont un depot (boomErrorFromPrismaError) tire
  // des messages 404/409 rendus au client. Ici, la meme erreur atteint le gestionnaire *sans*
  // etre passee par boomErrorFromPrismaError (exactement le cas d'un depot sans `catch`, C1) :
  // `meta` peut porter une valeur soumise (constraint, target...) et ne doit jamais atteindre ni
  // le corps ni le journal.
  it('une PrismaClientKnownRequestError non attrapee (meta compris) ne fuit ni dans le corps, ni dans le journal, quel que soit le code', () => {
    const harness = buildHarness()
    const boomError = new Prisma.PrismaClientKnownRequestError(
      `Unique constraint failed on the fields: (\`patientId\`,\`notes\`,"${CLINICAL_VALUE}")`,
      {
        code: 'P2002',
        clientVersion: '0.0.0-test',
        meta: {
          target: ['patientId', CLINICAL_VALUE],
          modelName: 'PatientServiceFile',
        },
      },
    )

    const body = asJsonBody(runHandler(boomError, harness))

    expect(harness.statusCodes).toEqual([500])
    expect(body.message).not.toContain(CLINICAL_VALUE)
    expect(body.error).not.toContain(CLINICAL_VALUE)
    for (const line of harness.allCalls) {
      expect(line).not.toContain(CLINICAL_VALUE)
    }
  })
})
