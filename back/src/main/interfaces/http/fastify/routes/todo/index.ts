import { z } from 'zod'
import {
  todoResponseSchema,
  deleteTodoByIdParamsSchema,
  getTodoByIdParamsSchema,
  updateTodoByIdSchema,
  todosResponseSchema,
  createTodoSchema,
} from '../../schemas/todo/todo.schema'
import Boom from '@hapi/boom'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'

const todoRouter: FastifyPluginAsyncZod = (fastify) => {
  const { iocContainer } = fastify
  const { todoDomain, logger } = iocContainer

  // Get all
  fastify.get(
    '/',
    {
      schema: {
        response: {
          200: todosResponseSchema,
          404: z.object({ message: z.string() }),
        },
        tags: ['Todo'],
      },
      onRequest: [fastify.verifySessionCookie],
    },
    () => {
      return todoDomain.findAll()
    },
  )

  // Create
  fastify.post(
    '/',
    {
      schema: {
        body: createTodoSchema,
        response: {
          201: todoResponseSchema,
        },
        tags: ['Todo'],
      },
    },
    async (request, reply) => {
      const todo = await todoDomain.create(request.body)
      reply.code(201)
      return todo
    },
  )

  // Read by ID
  fastify.get(
    '/:todoID',
    {
      schema: {
        params: getTodoByIdParamsSchema,
        response: {
          200: todoResponseSchema,
          404: z.object({ message: z.string() }),
        },
        tags: ['Todo'],
      },
    },
    async (request) => {
      const { todoID } = request.params
      const todo = await todoDomain.findByID(todoID)
      if (!todo) {
        throw Boom.notFound('Todo not found')
      }
      return todo
    },
  )

  // Update
  fastify.patch(
    '/:todoID',
    {
      schema: {
        ...updateTodoByIdSchema,
        response: {
          200: todoResponseSchema,
          404: z.object({ message: z.string() }),
        },
        tags: ['Todo'],
      },
    },
    async (request) => {
      const { todoID } = request.params
      const updated = await todoDomain.update(todoID, request.body)
      if (!updated) {
        throw Boom.notFound('Todo not found')
      }
      return updated
    },
  )

  // Delete
  fastify.delete(
    '/:todoID',
    {
      schema: {
        params: deleteTodoByIdParamsSchema,
        response: {
          204: z.null(),
          404: z.object({ message: z.string() }),
        },
        tags: ['Todo'],
      },
    },
    async (request, reply) => {
      const { todoID } = request.params
      const deleted = await todoDomain.delete(todoID)
      if (!deleted) {
        logger.info('Todo not found')
        throw Boom.notFound('Todo not found')
      }
      reply.code(204).send()
    },
  )

  return Promise.resolve()
}

export { todoRouter }
