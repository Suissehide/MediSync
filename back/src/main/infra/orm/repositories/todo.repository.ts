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

  // Les taches sont personnelles (permission `todo:own`, voir
  // docs/multi-tenant/habilitations.md) : chaque soignant ne voit que les
  // siennes au sein de son service. Quand le compte courant n'est rattache a
  // aucun soignant, le filtre ne disparait pas — il porte sur
  // `soignantID: null`, les taches sans soignant.
  private get ownScope() {
    return {
      ...this.scope,
      soignantID: this.tenantContext.currentService().soignantId,
    }
  }

  findAll(): Promise<TodoEntityRepo[]> {
    return this.prisma.todo.findMany({
      where: this.ownScope,
      orderBy: [{ createDate: 'desc' }],
      include: { soignant: true },
    })
  }

  // La cle unique composite `id_serviceId` ne permet pas d'ajouter le filtre
  // non unique `soignantID` a un findUnique/update/delete : la lecture passe
  // donc par `findFirstOrThrow`, et les ecritures par une lecture de garde
  // prealable. L'absence de droit se presente ainsi comme une absence de
  // ressource (404 via `boomErrorFromPrismaError`), pas comme une erreur
  // distincte qui revelerait l'existence de la tache d'un collegue.
  private async assertOwned(todoID: string): Promise<void> {
    await this.prisma.todo.findFirstOrThrow({
      where: { id: todoID, ...this.ownScope },
      select: { id: true },
    })
  }

  async findByID(todoID: string): Promise<TodoEntityRepo> {
    try {
      return await this.prisma.todo.findFirstOrThrow({
        where: { id: todoID, ...this.ownScope },
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
      await this.assertOwned(todoID)
      return await this.prisma.todo.update({
        where: {
          id_serviceId: { id: todoID, serviceId: this.scope.serviceId },
        },
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
      await this.assertOwned(todoID)
      return await this.prisma.todo.delete({
        where: {
          id_serviceId: { id: todoID, serviceId: this.scope.serviceId },
        },
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
