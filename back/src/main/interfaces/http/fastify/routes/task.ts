import type { FastifyPluginAsync } from 'fastify'

import {
  type CreateTaskBody,
  createTaskSchema,
  type SetTaskDoneBody,
  setTaskDoneSchema,
  type TaskParams,
  taskParamsSchema,
  taskResponseSchema,
  tasksResponseSchema,
} from '../schemas/task.schema'

const taskRouter: FastifyPluginAsync = (fastify) => {
  const { taskDomain } = fastify.iocContainer

  fastify.get(
    '/',
    {
      schema: { response: { 200: tasksResponseSchema } },
      config: { permission: 'tasks:read' },
    },
    () => taskDomain.findAll(),
  )

  fastify.post<{ Body: CreateTaskBody }>(
    '/',
    {
      schema: { body: createTaskSchema, response: { 201: taskResponseSchema } },
      config: { permission: 'tasks:write' },
    },
    async (request, reply) => {
      const task = await taskDomain.create(request.body)
      reply.code(201)
      return task
    },
  )

  fastify.patch<{ Params: TaskParams; Body: SetTaskDoneBody }>(
    '/:taskId',
    {
      schema: {
        params: taskParamsSchema,
        body: setTaskDoneSchema,
        response: { 200: taskResponseSchema },
      },
      config: { permission: 'tasks:write' },
    },
    (request) => taskDomain.setDone(request.params.taskId, request.body.done),
  )

  return Promise.resolve()
}

export { taskRouter }
