import Boom from '@hapi/boom'

import type { IocContainer } from '../types/application/ioc'
import type {
  PathwayTemplateCreateEntityDomain,
  PathwayTemplateDomainInterface,
  PathwayTemplateEntityDomain,
  PathwayTemplateUpdateEntityDomain,
  PathwayTemplateWithSlotTemplatesDomain,
} from '../types/domain/pathwayTemplate.domain.interface'
import type { PathwayTemplateRepositoryInterface } from '../types/infra/orm/repositories/pathwayTemplate.repository.interface'
import type { SlotTemplateRepositoryInterface } from '../types/infra/orm/repositories/slotTemplate.repository.interface'

class PathwayTemplateDomain implements PathwayTemplateDomainInterface {
  private readonly pathwayTemplateRepository: PathwayTemplateRepositoryInterface
  private readonly slotTemplateRepository: SlotTemplateRepositoryInterface

  constructor({
    pathwayTemplateRepository,
    slotTemplateRepository,
  }: IocContainer) {
    this.pathwayTemplateRepository = pathwayTemplateRepository
    this.slotTemplateRepository = slotTemplateRepository
  }

  findAll(): Promise<PathwayTemplateEntityDomain[]> {
    return this.pathwayTemplateRepository.findAll()
  }

  findByID(
    pathwayTemplateID: string,
  ): Promise<PathwayTemplateWithSlotTemplatesDomain> {
    return this.pathwayTemplateRepository.findByID(pathwayTemplateID)
  }

  async create(
    pathwayTemplateCreateParams: PathwayTemplateCreateEntityDomain,
  ): Promise<PathwayTemplateEntityDomain> {
    await this.assertPrerequisites(
      undefined,
      pathwayTemplateCreateParams.prerequisiteIDs,
    )
    return this.pathwayTemplateRepository.create(pathwayTemplateCreateParams)
  }

  // Prérequis connus du service, et jamais de dépendance circulaire.
  private async assertPrerequisites(
    templateID: string | undefined,
    prerequisiteIDs: string[] | undefined,
  ): Promise<void> {
    if (!prerequisiteIDs?.length) {
      return
    }
    const all = await this.pathwayTemplateRepository.findAll()
    const prerequisitesOf = new Map(all.map((t) => [t.id, t.prerequisiteIDs]))
    if (prerequisiteIDs.some((id) => !prerequisitesOf.has(id))) {
      throw Boom.badRequest('Parcours prérequis inconnu')
    }
    const seen = new Set<string>()
    const stack = [...prerequisiteIDs]
    while (stack.length > 0) {
      const id = stack.pop() as string
      if (id === templateID) {
        throw Boom.badRequest(
          'Un parcours ne peut pas dépendre de lui-même, même indirectement',
        )
      }
      if (!seen.has(id)) {
        seen.add(id)
        stack.push(...(prerequisitesOf.get(id) ?? []))
      }
    }
  }

  async update(
    pathwayTemplateID: string,
    pathwayTemplateUpdateParams: PathwayTemplateUpdateEntityDomain,
  ): Promise<PathwayTemplateEntityDomain> {
    const current =
      await this.pathwayTemplateRepository.findByID(pathwayTemplateID)
    if (!current) {
      throw new Error('PathwayTemplate not found')
    }
    await this.assertPrerequisites(
      pathwayTemplateID,
      pathwayTemplateUpdateParams.prerequisiteIDs,
    )

    const updated = this.pathwayTemplateRepository.update(
      pathwayTemplateID,
      pathwayTemplateUpdateParams,
    )

    if (
      pathwayTemplateUpdateParams.color &&
      pathwayTemplateUpdateParams.color !== current.color &&
      current.slotTemplates.length > 0
    ) {
      await this.slotTemplateRepository.updateMany(
        current.slotTemplates.map((st) => st.id),
        { color: pathwayTemplateUpdateParams.color },
      )
    }

    return updated
  }

  delete(pathwayTemplateID: string): Promise<PathwayTemplateEntityDomain> {
    return this.pathwayTemplateRepository.delete(pathwayTemplateID)
  }

  reorder(orderedIds: string[]): Promise<void> {
    return this.pathwayTemplateRepository.reorder(orderedIds)
  }
}

export { PathwayTemplateDomain }
