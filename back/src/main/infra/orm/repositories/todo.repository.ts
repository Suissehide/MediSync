import type { IocContainer } from '../../../types/application/ioc'
import type {
  TodoCreateEntityRepo,
  TodoEntityRepo,
  TodoRepositoryInterface,
  TodoUpdateEntityRepo,
} from '../../../types/infra/orm/repositories/todo.repository.interface'
import type { ErrorHandlerInterface } from '../../../types/utils/error-handler'
import type { PostgresPrismaClient } from '../postgres-client'

class TodoRepository implements TodoRepositoryInterface {
  private readonly prisma: PostgresPrismaClient
  private readonly errorHandler: ErrorHandlerInterface

  constructor({ postgresOrm, errorHandler }: IocContainer) {
    this.prisma = postgresOrm.prisma
    this.errorHandler = errorHandler
  }

  findAll(): Promise<TodoEntityRepo[]> {
    return this.prisma.todo.findMany({
      orderBy: [{ createDate: 'desc' }],
    })
  }

  async findByID(todoID: string): Promise<TodoEntityRepo> {
    try {
      return await this.prisma.todo.findUniqueOrThrow({
        where: { id: todoID },
      })
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({
        entityName: 'Todo',
        error: err,
      })
    }
  }

  async create(
    todoCreateParams: TodoCreateEntityRepo,
  ): Promise<TodoEntityRepo> {
    try {
      return await this.prisma.todo.create({
        data: todoCreateParams,
      })
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({
        entityName: 'Todo',
        error: err,
      })
    }
  }

  async update(
    todoID: string,
    todoUpdateParams: TodoUpdateEntityRepo,
  ): Promise<TodoEntityRepo> {
    try {
      return await this.prisma.todo.update({
        where: { id: todoID },
        data: todoUpdateParams,
      })
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({
        entityName: 'Todo',
        error: err,
      })
    }
  }

  async delete(todoID: string): Promise<TodoEntityRepo> {
    try {
      return await this.prisma.todo.delete({
        where: { id: todoID },
      })
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({
        entityName: 'Todo',
        error: err,
      })
    }
  }
}

export { TodoRepository }
