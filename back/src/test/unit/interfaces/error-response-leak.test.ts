import { conflict, notFound } from '@hapi/boom'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'

import { Prisma } from '../../../generated/client'
import { buildErrorHandler } from '../../../main/interfaces/http/fastify/errors/error.handler'
import { boomErrorNormalizer } from '../../../main/interfaces/http/fastify/errors/normalizers/boom.error.normalizer'
import { fastifyErrorNormalizer } from '../../../main/interfaces/http/fastify/errors/normalizers/fastify.error.normalizer'

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

// Un harnais minimal du meme contrat que `FastifyInstance`/`FastifyRequest`/`FastifyReply`, pour
// executer `buildErrorHandler` sans monter de vrai serveur Fastify. `log.debug`/`log.error` (les
// deux niveaux utilises par le gestionnaire), `request.accepts()` et `reply.status()`/`type()`
// sont exerces. Le canal `debug` est capture au meme titre que `error` (task-5-re-review-3.md, m3
// puis tour 5) : `LOG_LEVEL=DEBUG` est le reglage qu'on active precisement pour enqueter sur un
// incident, donc exactement le moment ou ce canal est lu.
const buildHarness = () => {
  const logsAtErrorLevel: string[] = []
  const logsAtDebugLevel: string[] = []
  const fastifyLike = {
    log: {
      debug: (message: unknown) => logsAtDebugLevel.push(String(message)),
      error: (message: string) => logsAtErrorLevel.push(message),
    },
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
    accepts: () => ({ type: () => 'json' }),
  }
  return {
    fastifyLike,
    fakeRequest,
    fakeReply,
    statusCodes,
    logsAtErrorLevel,
    logsAtDebugLevel,
  }
}

// `prismaErrorNormalizer` a ete retire (task-5-re-review-3.md, tour 5, voir
// fastify-http-server.ts) : c'etait du code mort qui, une fois "corrige", aurait recopie
// `error.message` pour toute PrismaClientKnownRequestError non attrapee. La chaine reelle ne
// compte donc plus que ces deux normalizers.
const runHandler = (
  error: unknown,
  harness: ReturnType<typeof buildHarness>,
): { error: string; message: string; statusCode: number } => {
  const handler = buildErrorHandler(fastifyErrorNormalizer, boomErrorNormalizer)
  const body = handler.call(
    harness.fastifyLike as unknown as FastifyInstance,
    error as never,
    harness.fakeRequest as unknown as FastifyRequest,
    harness.fakeReply as unknown as FastifyReply,
  )
  return body as { error: string; message: string; statusCode: number }
}

describe('la chaine de normalizers ne renvoie jamais une valeur soumise pour une erreur inattendue', () => {
  it('une ecriture clinique en echec sans catch (PrismaClientValidationError brute) ne fuit ni dans le corps, ni dans le journal `error`, ni dans le journal `debug`', () => {
    const harness = buildHarness()

    const body = runHandler(buildUnexpectedPrismaError(), harness)

    expect(harness.statusCodes).toEqual([500])
    expect(body.message).not.toContain(CLINICAL_VALUE)
    expect(body.message).not.toContain(PATIENT_ID)
    expect(body.error).not.toContain(CLINICAL_VALUE)

    expect(harness.logsAtErrorLevel).toHaveLength(2)
    for (const line of harness.logsAtErrorLevel) {
      expect(line).not.toContain(CLINICAL_VALUE)
      expect(line).not.toContain(PATIENT_ID)
    }
    // Le gestionnaire ne journalise plus rien a `debug` (task-5-re-review-3.md, m3 : l'ancien
    // `this.log.debug(error)` recopiait l'erreur brute, message et pile compris, et n'etait
    // eteint qu'a `LOG_LEVEL=INFO` — pas a `DEBUG`, le reglage qu'on active justement pour
    // enqueter). Le diagnostic de `error` suffit deja ; `debug` n'ajoute plus rien qui puisse fuir.
    expect(harness.logsAtDebugLevel).toHaveLength(0)
  })

  it('le journal `error` garde de quoi enqueter sur une erreur inattendue : classe, route et pile (jamais le message brut)', () => {
    const harness = buildHarness()

    runHandler(buildUnexpectedPrismaError(), harness)

    const [diagnosticLine] = harness.logsAtErrorLevel
    expect(diagnosticLine).toContain('class=PrismaClientValidationError')
    expect(diagnosticLine).toContain('PATCH /e/est1/s/svc1/patient/pat1/service-file')
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

    const body = runHandler(boomError, harness)

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

    const body = runHandler(boomError, harness)

    expect(harness.statusCodes).toEqual([404])
    expect(body).toEqual({
      error: 'Not Found',
      message: "Appointment: this ID doesn't exist",
      statusCode: 404,
    })
  })

  it('le journal `error` d un Boom porte son message : il est toujours ecrit par notre propre code, jamais recopie d une erreur brute', () => {
    const harness = buildHarness()
    const boomError = notFound('PatientServiceFile: this ID doesn\'t exist')

    runHandler(boomError, harness)

    const [diagnosticLine] = harness.logsAtErrorLevel
    expect(diagnosticLine).toContain("message=PatientServiceFile: this ID doesn't exist")
  })

  // task-5-re-review-3.md, I1 : le tour precedent ne testait la chaine qu'avec une
  // PrismaClientValidationError et une Error nue — jamais une PrismaClientKnownRequestError,
  // pourtant la seule qui porte `meta` et la seule dont un depot (boomErrorFromPrismaError) tire
  // des messages 404/409 rendus au client. Ici, la meme erreur atteint le gestionnaire *sans*
  // etre passee par boomErrorFromPrismaError (exactement le cas d'un depot sans `catch`, C1) :
  // `meta` peut porter une valeur soumise (constraint, target...) et ne doit jamais atteindre ni
  // le corps ni le journal.
  it("une PrismaClientKnownRequestError non attrapee (meta compris) ne fuit ni dans le corps, ni dans le journal, quel que soit le code", () => {
    const harness = buildHarness()
    const boomError = new Prisma.PrismaClientKnownRequestError(
      `Unique constraint failed on the fields: (\`patientId\`,\`notes\`,"${CLINICAL_VALUE}")`,
      {
        code: 'P2002',
        clientVersion: '0.0.0-test',
        meta: { target: ['patientId', CLINICAL_VALUE], modelName: 'PatientServiceFile' },
      },
    )

    const body = runHandler(boomError, harness)

    expect(harness.statusCodes).toEqual([500])
    expect(body.message).not.toContain(CLINICAL_VALUE)
    expect(body.error).not.toContain(CLINICAL_VALUE)
    for (const line of [...harness.logsAtErrorLevel, ...harness.logsAtDebugLevel]) {
      expect(line).not.toContain(CLINICAL_VALUE)
    }
  })
})
