import Boom from '@hapi/boom'

import { DiagnosticEducatifDomain } from '../../../main/domain/diagnosticEducatif.domain'
import type { IocContainer } from '../../../main/types/application/ioc'

const buildDomain = (known: { templates: string[] }) => {
  const created: unknown[] = []
  const updated: unknown[] = []
  const notFound = (name: string) => Promise.reject(Boom.notFound(`${name} not found`))
  const container = {
    diagnosticEducatifRepository: {
      create: (params: unknown) => {
        created.push(params)
        return Promise.resolve({ id: 'diag', ...(params as object) })
      },
      update: (_id: string, params: unknown) => {
        updated.push(params)
        return Promise.resolve({ id: 'diag', ...(params as object) })
      },
    },
    diagnosticEducatifTemplateRepository: {
      findByID: (id: string) =>
        known.templates.includes(id)
          ? Promise.resolve({ id })
          : notFound('DiagnosticEducatifTemplate'),
    },
    patientServiceFileDomain: { ensureExists: () => Promise.resolve() },
    appEventBus: { emit: () => undefined },
  } as unknown as IocContainer
  return { domain: new DiagnosticEducatifDomain(container), created, updated }
}

const base = { patientId: 'patient-1' }

describe('DiagnosticEducatifDomain references', () => {
  it('cree quand le modele est connu du tenant', async () => {
    const { domain, created } = buildDomain({ templates: ['tpl1'] })
    await domain.create({ ...base, templateId: 'tpl1' } as never, 'user-1')
    expect(created).toHaveLength(1)
  })

  it('refuse un modele inconnu du tenant en 404 (creation)', async () => {
    const { domain } = buildDomain({ templates: [] })
    await expect(
      domain.create({ ...base, templateId: 'autre' } as never, 'user-1'),
    ).rejects.toMatchObject({ output: { statusCode: 404 } })
  })

  it('ignore un modele nul ou absent en creation', async () => {
    const { domain, created } = buildDomain({ templates: [] })
    await domain.create({ ...base } as never, 'user-1')
    expect(created).toHaveLength(1)
  })

  it('met a jour quand le modele est connu du tenant', async () => {
    const { domain, updated } = buildDomain({ templates: ['tpl1'] })
    await domain.update('diag-1', { templateId: 'tpl1' } as never, 'user-1')
    expect(updated).toHaveLength(1)
  })

  it('refuse un modele inconnu du tenant en 404 (mise a jour)', async () => {
    const { domain } = buildDomain({ templates: [] })
    await expect(
      domain.update('diag-1', { templateId: 'autre' } as never, 'user-1'),
    ).rejects.toMatchObject({ output: { statusCode: 404 } })
  })

  it('ignore un modele nul ou absent en mise a jour', async () => {
    const { domain, updated } = buildDomain({ templates: [] })
    await domain.update('diag-1', { title: 'x' } as never, 'user-1')
    expect(updated).toHaveLength(1)
  })
})
