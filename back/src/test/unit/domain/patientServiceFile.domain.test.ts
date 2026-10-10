import { PatientServiceFileDomain } from '../../../main/domain/patientServiceFile.domain'
import type { IocContainer } from '../../../main/types/application/ioc'

const definitions = [
  {
    key: 'orientation',
    type: 'text',
    clinical: false,
    archivedAt: null,
    choices: [],
  },
  {
    key: 'hba1c',
    type: 'number',
    clinical: false,
    archivedAt: null,
    choices: [],
  },
  { key: 'diag', type: 'text', clinical: true, archivedAt: null, choices: [] },
]

// Le dossier lu change entre deux lectures : `reads` est consomme dans l'ordre.
const buildDomain = (reads: Record<string, unknown>[], results: boolean[]) => {
  const writes: unknown[] = []
  const container = {
    patientServiceFileRepository: {
      upsert: (patientId: string) => Promise.resolve({ patientId }),
      findByPatient: (patientId: string) =>
        Promise.resolve({
          patientId,
          ...(reads.length > 1 ? reads.shift() : reads[0]),
        }),
      writeValues: (_id: string, _expected: unknown, next: unknown) => {
        writes.push(next)
        return Promise.resolve(results.shift() ?? false)
      },
    },
    serviceFieldRepository: { findAll: () => Promise.resolve(definitions) },
    appEventBus: { emit: () => undefined },
  } as unknown as IocContainer
  return { domain: new PatientServiceFileDomain(container), writes }
}

describe('PatientServiceFileDomain.upsert, concurrence optimiste', () => {
  it('relit et refusionne le correctif sur la valeur ecrite entre-temps', async () => {
    const { domain, writes } = buildDomain(
      [
        { data: {}, clinicalData: {} },
        { data: { orientation: 'B' }, clinicalData: { diag: 'AVC' } },
      ],
      [false, true],
    )
    const result = await domain.upsert(
      'p1',
      { data: { hba1c: 7 } } as never,
      'user-1',
    )
    expect(writes).toEqual([
      { data: { hba1c: 7 }, clinicalData: {} },
      { data: { orientation: 'B', hba1c: 7 }, clinicalData: { diag: 'AVC' } },
    ])
    expect(result).toMatchObject({
      data: { orientation: 'B', hba1c: 7 },
      clinicalData: { diag: 'AVC' },
    })
  })

  it('rend 409 apres trois essais perdus', async () => {
    const { domain, writes } = buildDomain([{ data: {}, clinicalData: {} }], [])
    await expect(
      domain.upsert('p1', { data: { hba1c: 7 } } as never, 'user-1'),
    ).rejects.toMatchObject({ output: { statusCode: 409 } })
    expect(writes).toHaveLength(3)
  })
})
