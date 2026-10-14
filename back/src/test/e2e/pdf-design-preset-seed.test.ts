import seedPdfDesignPresets from '../../../prisma/seed/pdfDesignPreset'
import { REFERENCE_PRESET_ID } from '../../main/utils/pdf-design/reference-preset'
import { testDb, truncateAll } from './setup/db'

// Le seed des presets est le seul chemin par lequel un design arrive en base avant qu'un
// editeur existe. Sa propriete critique n'est pas « il cree la ligne » mais « il ne la REECRIT
// pas » : un rejeu a chaque deploiement effacerait sinon, sans bruit, les retouches du
// super-admin. C'est une perte de donnees silencieuse, donc elle a son test.
describe('seed des presets de design', () => {
  beforeAll(async () => {
    await truncateAll()
  })

  afterAll(async () => {
    await testDb.$disconnect()
  })

  it('cree le preset de reference a la premiere execution', async () => {
    await seedPdfDesignPresets(testDb)

    const presets = await testDb.pdfDesignPreset.findMany()
    expect(presets).toHaveLength(1)
    expect(presets[0]).toMatchObject({
      id: REFERENCE_PRESET_ID,
      name: 'Programme SMCV',
      sortOrder: 0,
      archivedAt: null,
    })
  })

  it('n en cree pas un second a la deuxieme execution', async () => {
    await seedPdfDesignPresets(testDb)

    expect(await testDb.pdfDesignPreset.count()).toBe(1)
  })

  it('n ecrase NI le nom NI le contenu retouches par le super-admin', async () => {
    const retouche = {
      version: 1,
      pages: [{ kind: 'canvas', id: 'retouche', elements: [] }],
    }
    await testDb.pdfDesignPreset.update({
      where: { id: REFERENCE_PRESET_ID },
      data: { name: 'Programme retouche a la main', content: retouche },
    })

    await seedPdfDesignPresets(testDb)

    const preset = await testDb.pdfDesignPreset.findUniqueOrThrow({
      where: { id: REFERENCE_PRESET_ID },
    })
    expect(preset.name).toBe('Programme retouche a la main')
    expect(preset.content).toEqual(retouche)
  })
})
