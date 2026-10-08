import type { IocContainer } from '../types/application/ioc'
import type {
  DiagnosticEducatifTemplateCreateEntity,
  DiagnosticEducatifTemplateDomainInterface,
  DiagnosticEducatifTemplateEntity,
  DiagnosticEducatifTemplateUpdateEntity,
} from '../types/domain/diagnosticEducatifTemplate.domain.interface'
import type { DiagnosticEducatifTemplateRepositoryInterface } from '../types/infra/orm/repositories/diagnosticEducatifTemplate.repository.interface'

class DiagnosticEducatifTemplateDomain
  implements DiagnosticEducatifTemplateDomainInterface
{
  private readonly diagnosticEducatifTemplateRepository: DiagnosticEducatifTemplateRepositoryInterface

  constructor({ diagnosticEducatifTemplateRepository }: IocContainer) {
    this.diagnosticEducatifTemplateRepository =
      diagnosticEducatifTemplateRepository
  }

  findAll(archived?: boolean): Promise<DiagnosticEducatifTemplateEntity[]> {
    return this.diagnosticEducatifTemplateRepository.findAll(archived)
  }

  findByID(id: string): Promise<DiagnosticEducatifTemplateEntity> {
    return this.diagnosticEducatifTemplateRepository.findByID(id)
  }

  create(
    params: DiagnosticEducatifTemplateCreateEntity,
  ): Promise<DiagnosticEducatifTemplateEntity> {
    return this.diagnosticEducatifTemplateRepository.create(params)
  }

  update(
    id: string,
    params: DiagnosticEducatifTemplateUpdateEntity,
  ): Promise<DiagnosticEducatifTemplateEntity> {
    return this.diagnosticEducatifTemplateRepository.update(id, params)
  }
  deleteForever(id: string): Promise<void> {
    return this.diagnosticEducatifTemplateRepository.deleteForever(id)
  }
}

export { DiagnosticEducatifTemplateDomain }
