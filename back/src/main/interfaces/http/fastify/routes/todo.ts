import Boom from '@hapi/boom'
import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod/v4'

import {
  type CreateTodoBody,
  createTodoSchema,
  type DeleteTodoByIdParams,
  deleteTodoByIdParamsSchema,
  type GetTodoByIdParams,
  getTodoByIdParamsSchema,
  todoResponseSchema,
  todosResponseSchema,
  type UpdateTodoBody,
  type UpdateTodoParams,
  updateTodoByIdSchema,
} from '../schemas/todo.schema'

const todoRouter: FastifyPluginAsync = (fastify) => {
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
      },
      onRequest: [fastify.verifySessionCookie],
    },
    () => {
      return todoDomain.findAll()
    },
  )

  // Read by ID
  fastify.get<{ Params: GetTodoByIdParams }>(
    '/:todoID',
    {
      schema: {
        params: getTodoByIdParamsSchema,
        response: {
          200: todoResponseSchema,
          404: z.object({ message: z.string() }),
        },
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

  // Create
  fastify.post<{ Body: CreateTodoBody }>(
    '/',
    {
      schema: {
        body: createTodoSchema,
        response: {
          201: todoResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const todo = await todoDomain.create(request.body)
      reply.code(201)
      return todo
    },
  )

  // Update
  fastify.patch<{
    Params: UpdateTodoParams
    Body: UpdateTodoBody
  }>(
    '/:todoID',
    {
      schema: {
        ...updateTodoByIdSchema,
        response: {
          200: todoResponseSchema,
          404: z.object({ message: z.string() }),
        },
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
  fastify.delete<{ Params: DeleteTodoByIdParams }>(
    '/:todoID',
    {
      schema: {
        params: deleteTodoByIdParamsSchema,
        response: {
          204: z.null(),
          404: z.object({ message: z.string() }),
        },
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
