import type { FastifyPluginAsync } from 'fastify'

import {
  activitySettingsResponseSchema,
  type UpdateActivitySettingsBody,
  updateActivitySettingsSchema,
} from '../schemas/activitySettings.schema'

// Réglages du service lui-même (`Service.stopReasonFieldKey`/`completedChoiceKey`), pas une
// définition de champ : séparé de `serviceField.ts`, qui ne porte que `ServiceFieldDefinition`.
const activitySettingsRouter: FastifyPluginAsync = (fastify) => {
  const { iocContainer } = fastify
  const { serviceDomain } = iocContainer

  fastify.patch<{ Body: UpdateActivitySettingsBody }>(
    '/',
    {
      schema: {
        body: updateActivitySettingsSchema,
        response: { 200: activitySettingsResponseSchema },
      },
      config: { permission: 'stats:write' },
    },
    async (request) => {
      const service = await serviceDomain.updateActivitySettings(request.body)
      return {
        stopReasonFieldKey: service.stopReasonFieldKey,
        completedChoiceKey: service.completedChoiceKey,
      }
    },
  )

  return Promise.resolve()
}

export { activitySettingsRouter }
