import Boom from '@hapi/boom'

import { AppointmentDomain } from '../../../main/domain/appointment.domain'
import type { IocContainer } from '../../../main/types/application/ioc'

const buildDomain = (known: { thematics: string[] }) => {
  const created: unknown[] = []
  const updated: unknown[] = []
  const notFound = (name: string) =>
    Promise.reject(Boom.notFound(`${name} not found`))
  const container = {
    appointmentRepository: {
      create: (params: unknown) => {
        created.push(params)
        return Promise.resolve({ id: 'apt', ...(params as object) })
      },
      update: (_id: string, params: unknown) => {
        updated.push(params)
        return Promise.resolve({ id: 'apt', ...(params as object) })
      },
    },
    slotDomain: {
      findByID: (id: string) => Promise.resolve({ id, locked: false }),
    },
    thematicRepository: {
      findByID: (id: string) =>
        known.thematics.includes(id)
          ? Promise.resolve({ id })
          : notFound('Thematic'),
    },
    appEventBus: { emit: () => undefined },
  } as unknown as IocContainer
  return { domain: new AppointmentDomain(container), created, updated }
}

const base = {
  startDate: new Date(),
  endDate: new Date(),
  slotID: 'slot-1',
  patientIDs: ['p1'],
}

describe('AppointmentDomain references', () => {
  it('cree quand la thematique est connue du tenant', async () => {
    const { domain, created } = buildDomain({ thematics: ['t1'] })
    await domain.create({ ...base, thematicId: 't1' } as never, 'user-1')
    expect(created).toHaveLength(1)
  })

  it('refuse une thematique inconnue du tenant en 404 (creation)', async () => {
    const { domain } = buildDomain({ thematics: [] })
    await expect(
      domain.create({ ...base, thematicId: 'autre' } as never, 'user-1'),
    ).rejects.toMatchObject({ output: { statusCode: 404 } })
  })

  it('ignore une thematique nulle ou absente en creation', async () => {
    const { domain, created } = buildDomain({ thematics: [] })
    await domain.create({ ...base, thematicId: undefined } as never, 'user-1')
    expect(created).toHaveLength(1)
  })

  it('met a jour quand la thematique est connue du tenant', async () => {
    const { domain, updated } = buildDomain({ thematics: ['t1'] })
    await domain.update('apt-1', { thematicId: 't1' } as never, 'user-1')
    expect(updated).toHaveLength(1)
  })

  it('refuse une thematique inconnue du tenant en 404 (mise a jour)', async () => {
    const { domain } = buildDomain({ thematics: [] })
    await expect(
      domain.update('apt-1', { thematicId: 'autre' } as never, 'user-1'),
    ).rejects.toMatchObject({ output: { statusCode: 404 } })
  })

  it('ignore une thematique nulle ou absente en mise a jour', async () => {
    const { domain, updated } = buildDomain({ thematics: [] })
    await domain.update('apt-1', { motif: 'x' } as never, 'user-1')
    expect(updated).toHaveLength(1)
  })
})
