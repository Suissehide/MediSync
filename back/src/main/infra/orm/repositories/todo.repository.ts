import type { IocContainer } from '../../../types/application/ioc'
import type {
  TodoCreateEntityRepo,
  TodoEntityRepo,
  TodoRepositoryInterface,
  TodoUpdateEntityRepo,
} from '../../../types/infra/orm/repositories/todo.repository.interface'
import type { ErrorHandlerInterface } from '../../../types/utils/error-handler'
import type { TenantContextInterface } from '../../../types/utils/tenant-context'
import type { PostgresPrismaClient } from '../postgres-client'

class TodoRepository implements TodoRepositoryInterface {
  private readonly prisma: PostgresPrismaClient
  private readonly errorHandler: ErrorHandlerInterface
  private readonly tenantContext: TenantContextInterface

  constructor({ postgresOrm, errorHandler, tenantContext }: IocContainer) {
    this.prisma = postgresOrm.prisma
    this.errorHandler = errorHandler
    this.tenantContext = tenantContext
  }

  private get scope() {
    return this.tenantContext.scope()
  }

  // Les taches sont personnelles : chaque soignant ne voit que les siennes
  // (et celles sans soignant, a soignantID null) au sein de son service.
  findAll(): Promise<TodoEntityRepo[]> {
    return this.prisma.todo.findMany({
      where: { ...this.scope, soignantID: this.tenantContext.currentService().soignantId },
      orderBy: [{ createDate: 'desc' }],
      include: { soignant: true },
    })
  }

  async findByID(todoID: string): Promise<TodoEntityRepo> {
    try {
      return await this.prisma.todo.findUniqueOrThrow({
        where: { id_serviceId: { id: todoID, serviceId: this.scope.serviceId } },
        include: { soignant: true },
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
        data: {
          ...todoCreateParams,
          ...this.scope,
          soignantID: this.tenantContext.currentService().soignantId,
        },
        include: { soignant: true },
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
        where: { id_serviceId: { id: todoID, serviceId: this.scope.serviceId } },
        data: todoUpdateParams,
        include: { soignant: true },
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
        where: { id_serviceId: { id: todoID, serviceId: this.scope.serviceId } },
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
