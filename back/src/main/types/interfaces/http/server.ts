import type http from 'node:http'
import type { FastifyInstance } from 'fastify'
export interface HttpServer {
  readonly baseUrl: string | undefined
  readonly instance: FastifyInstance
  configure: () => Promise<void>
  start: () => Promise<void>
  stop: () => Promise<void>
  getServer: () => http.Server
}
