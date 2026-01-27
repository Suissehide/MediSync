import type { IocContainer } from '../types/application/ioc'
import type {
  TodoCreateEntityDomain,
  TodoDomainInterface,
  TodoEntityDomain,
  TodoUpdateEntityDomain,
} from '../types/domain/todo.domain.interface'
import type { TodoRepositoryInterface } from '../types/infra/orm/repositories/todo.repository.interface'
import type { Logger } from '../types/utils/logger'

class TodoDomain implements TodoDomainInterface {
  private readonly logger: Logger
  private readonly todoRepository: TodoRepositoryInterface

  constructor({ todoRepository, logger }: IocContainer) {
    this.todoRepository = todoRepository
    this.logger = logger
  }

  findAll(): Promise<TodoEntityDomain[]> {
    return this.todoRepository.findAll()
  }

  findByID(todoID: string): Promise<TodoEntityDomain> {
    return this.todoRepository.findByID(todoID)
  }

  create(todoCreateParams: TodoCreateEntityDomain): Promise<TodoEntityDomain> {
    const todoInputParams = {
      ...todoCreateParams,
      createDate: new Date().toISOString(),
      completed: false,
    }
    return this.todoRepository.create(todoInputParams)
  }

  update(
    todoID: string,
    todoUpdateParams: TodoUpdateEntityDomain,
  ): Promise<TodoEntityDomain> {
    return this.todoRepository.update(todoID, todoUpdateParams)
  }

  delete(todoID: string): Promise<TodoEntityDomain> {
    return this.todoRepository.delete(todoID)
  }
}

export { TodoDomain }
