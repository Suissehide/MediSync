import Boom from '@hapi/boom'

import { PathwayDomain } from '../../../main/domain/pathway.domain'
import type { IocContainer } from '../../../main/types/application/ioc'

const buildDomain = (known: { templates: string[] }) => {
  const created: unknown[] = []
  const updated: unknown[] = []
  const notFound = (name: string) =>
    Promise.reject(Boom.notFound(`${name} not found`))
  const container = {
    pathwayRepository: {
      create: (params: unknown) => {
        created.push(params)
        return Promise.resolve({ id: 'pw', ...(params as object) })
      },
      update: (_id: string, params: unknown) => {
        updated.push(params)
        return Promise.resolve({ id: 'pw', ...(params as object) })
      },
    },
    pathwayTemplateRepository: {
      findByID: (id: string) =>
        known.templates.includes(id)
          ? Promise.resolve({ id })
          : notFound('PathwayTemplate'),
    },
  } as unknown as IocContainer
  return { domain: new PathwayDomain(container), created, updated }
}

const base = { startDate: new Date(), slotIDs: [] as string[] }

describe('PathwayDomain references', () => {
  it('cree quand le modele de parcours est connu du tenant', async () => {
    const { domain, created } = buildDomain({ templates: ['tpl1'] })
    await domain.create({ ...base, templateID: 'tpl1' } as never)
    expect(created).toHaveLength(1)
  })

  it('refuse un modele de parcours inconnu du tenant en 404 (creation)', async () => {
    const { domain } = buildDomain({ templates: [] })
    await expect(
      domain.create({ ...base, templateID: 'autre' } as never),
    ).rejects.toMatchObject({ output: { statusCode: 404 } })
  })

  it('ignore un modele de parcours nul ou absent en creation', async () => {
    const { domain, created } = buildDomain({ templates: [] })
    await domain.create({ ...base } as never)
    expect(created).toHaveLength(1)
  })

  it('met a jour quand le modele de parcours est connu du tenant', async () => {
    const { domain, updated } = buildDomain({ templates: ['tpl1'] })
    await domain.update('pw-1', { templateID: 'tpl1', slotIDs: [] } as never)
    expect(updated).toHaveLength(1)
  })

  it('refuse un modele de parcours inconnu du tenant en 404 (mise a jour)', async () => {
    const { domain } = buildDomain({ templates: [] })
    await expect(
      domain.update('pw-1', { templateID: 'autre', slotIDs: [] } as never),
    ).rejects.toMatchObject({ output: { statusCode: 404 } })
  })

  it('ignore un modele de parcours nul ou absent en mise a jour', async () => {
    const { domain, updated } = buildDomain({ templates: [] })
    await domain.update('pw-1', { slotIDs: [] } as never)
    expect(updated).toHaveLength(1)
  })
})
