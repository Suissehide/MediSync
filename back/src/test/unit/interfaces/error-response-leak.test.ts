import { conflict, notFound } from '@hapi/boom'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'

import { Prisma } from '../../../generated/client'
import { buildErrorHandler } from '../../../main/interfaces/http/fastify/errors/error.handler'
import { boomErrorNormalizer } from '../../../main/interfaces/http/fastify/errors/normalizers/boom.error.normalizer'
import { fastifyErrorNormalizer } from '../../../main/interfaces/http/fastify/errors/normalizers/fastify.error.normalizer'
import { prismaErrorNormalizer } from '../../../main/interfaces/http/fastify/errors/normalizers/prisma.error.normalizer'

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
// executer `buildErrorHandler` sans monter de vrai serveur Fastify. Seuls `log.debug`/`log.error`
// (les deux appels faits par le gestionnaire), `request.accepts()` et `reply.status()`/`type()`
// sont exerces.
const buildHarness = () => {
  const logsAtErrorLevel: string[] = []
  const fastifyLike = {
    log: {
      // Non exerce par les assertions : le canal `debug` reste un gap connu (m3,
      // task-5-re-review-3.md), hors des quatre corrections de ce tour.
      debug: () => undefined,
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
    accepts: () => ({ type: () => 'json' }),
  }
  return { fastifyLike, fakeRequest, fakeReply, statusCodes, logsAtErrorLevel }
}

const runHandler = (
  error: unknown,
  harness: ReturnType<typeof buildHarness>,
): { error: string; message: string; statusCode: number } => {
  const handler = buildErrorHandler(
    prismaErrorNormalizer,
    fastifyErrorNormalizer,
    boomErrorNormalizer,
  )
  const body = handler.call(
    harness.fastifyLike as unknown as FastifyInstance,
    error as never,
    harness.fakeRequest as unknown as FastifyRequest,
    harness.fakeReply as unknown as FastifyReply,
  )
  return body as { error: string; message: string; statusCode: number }
}

describe('la chaine de normalizers ne renvoie jamais une valeur soumise pour une erreur inattendue', () => {
  it('une ecriture clinique en echec sans catch (PrismaClientValidationError brute) ne fuit ni dans le corps ni dans le journal `error`', () => {
    const harness = buildHarness()

    const body = runHandler(buildUnexpectedPrismaError(), harness)

    expect(harness.statusCodes).toEqual([500])
    expect(body.message).not.toContain(CLINICAL_VALUE)
    expect(body.message).not.toContain(PATIENT_ID)
    expect(body.error).not.toContain(CLINICAL_VALUE)

    expect(harness.logsAtErrorLevel).toHaveLength(1)
    for (const line of harness.logsAtErrorLevel) {
      expect(line).not.toContain(CLINICAL_VALUE)
      expect(line).not.toContain(PATIENT_ID)
    }
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
})
