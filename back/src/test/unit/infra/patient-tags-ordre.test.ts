import { distinctMainTags } from '../../../main/infra/orm/repositories/patient.repository'

const rdv = (id: string, mainTag: string | null, startDate: string) => ({
  appointment: {
    slot: {
      pathway: {
        id,
        startDate: new Date(startDate),
        template: mainTag ? { mainTag } : null,
      },
    },
  },
})

describe('distinctMainTags', () => {
  it('ordonne par priorite du patient, puis par date de debut, sans doublon', () => {
    const tags = distinctMainTags(
      [
        rdv('a', 'Asthme', '2026-01-01'),
        rdv('b', 'Diabete', '2026-03-01'),
        rdv('c', 'Cardio', '2026-02-01'),
        rdv('d', 'Obesite', '2026-01-15'),
        rdv('a', 'Asthme', '2026-01-01'),
        rdv('e', null, '2025-01-01'),
      ],
      [
        { pathwayID: 'b', priority: 0 },
        { pathwayID: 'c', priority: 1 },
      ],
    )
    expect(tags).toEqual(['Diabete', 'Cardio', 'Asthme', 'Obesite'])
  })
})
