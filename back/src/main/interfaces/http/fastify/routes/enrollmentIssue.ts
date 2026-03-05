import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod/v4'

import {
  type EnrollmentIssueParams,
  type EnrollmentIssuePatientParams,
  enrollmentIssueParamsSchema,
  enrollmentIssuePatientParamsSchema,
  enrollmentIssuesResponseSchema,
} from '../schemas/enrollmentIssue.schema'

const enrollmentIssueRouter: FastifyPluginAsync = (fastify) => {
  const { enrollmentIssueDomain } = fastify.iocContainer

  // Get all by patient
  fastify.get<{ Params: EnrollmentIssuePatientParams }>('/', {
    schema: {
      params: enrollmentIssuePatientParamsSchema,
      response: { 200: enrollmentIssuesResponseSchema },
    },
    onRequest: [fastify.verifySessionCookie],
  }, (request) => enrollmentIssueDomain.findByPatientID(request.params.patientID))

  // Delete (dismiss)
  fastify.delete<{ Params: EnrollmentIssueParams }>('/:issueID', {
    schema: {
      params: enrollmentIssueParamsSchema,
      response: { 204: z.null() },
    },
    onRequest: [fastify.verifySessionCookie],
  }, async (request, reply) => {
    await enrollmentIssueDomain.delete(request.params.issueID)
    reply.code(204).send()
  })

  return Promise.resolve()
}

export { enrollmentIssueRouter }
