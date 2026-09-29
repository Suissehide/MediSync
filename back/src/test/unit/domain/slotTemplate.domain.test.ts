import Boom from '@hapi/boom'

import { SlotTemplateDomain } from '../../../main/domain/slotTemplate.domain'
import type { IocContainer } from '../../../main/types/application/ioc'

const buildDomain = (known: { locations: string[]; thematics: string[] }) => {
  const created: unknown[] = []
  const notFound = (name: string) =>
    Promise.reject(Boom.notFound(`${name} not found`))
  const container = {
    slotTemplateRepository: {
      create: (params: unknown) => {
        created.push(params)
        return Promise.resolve({ id: 'st', ...(params as object) })
      },
      update: (_id: string, params: unknown) =>
        Promise.resolve({ id: 'st', ...(params as object) }),
    },
    locationRepository: {
      findByID: (id: string) =>
        known.locations.includes(id)
          ? Promise.resolve({ id })
          : notFound('Location'),
    },
    thematicRepository: {
      findByID: (id: string) =>
        known.thematics.includes(id)
          ? Promise.resolve({ id })
          : notFound('Thematic'),
    },
  } as unknown as IocContainer
  return { domain: new SlotTemplateDomain(container), created }
}

const base = {
  startTime: new Date(),
  endTime: new Date(),
  offsetDays: 0,
  isIndividual: true,
  color: '#fff',
}

describe('SlotTemplateDomain references', () => {
  it('cree quand la salle et la thematique sont connues du tenant', async () => {
    const { domain, created } = buildDomain({
      locations: ['l1'],
      thematics: ['t1'],
    })
    await domain.create({
      ...base,
      locationID: 'l1',
      thematicId: 't1',
    } as never)
    expect(created).toHaveLength(1)
  })

  it('refuse une salle inconnue du tenant en 404', async () => {
    const { domain } = buildDomain({ locations: [], thematics: ['t1'] })
    await expect(
      domain.create({
        ...base,
        locationID: 'autre',
        thematicId: 't1',
      } as never),
    ).rejects.toMatchObject({ output: { statusCode: 404 } })
  })

  it('ignore les references nulles ou absentes', async () => {
    const { domain, created } = buildDomain({ locations: [], thematics: [] })
    await domain.create({
      ...base,
      locationID: null,
      thematicId: undefined,
    } as never)
    await domain.update('st', { color: '#000' } as never)
    expect(created).toHaveLength(1)
  })
})
