import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { testDb, truncateAll } from './setup/db'
import { createEstablishment, createService } from './setup/fixtures'

const migration = readFileSync(
  join(
    __dirname,
    '../../../prisma/migrations/20261009130000_thematic_role/migration.sql',
  ),
  'utf8',
)
const bloc =
  migration
    .split('-- preremplissage-debut')[1]
    ?.split('-- preremplissage-fin')[0] ?? ''

describe('preremplissage du role des thematiques', () => {
  let serviceId: string
  let establishmentId: string

  beforeAll(async () => {
    await truncateAll()
    establishmentId = (await createEstablishment('E-ROLE')).id
    serviceId = (await createService(establishmentId, 'S-ROLE')).id
  })

  afterAll(async () => {
    await testDb.$disconnect()
  })

  const creer = (name: string, role: 'REACTUALISATION' | null = null) =>
    testDb.thematic.create({ data: { name, serviceId, establishmentId, role } })

  it('reconnait les noms prefixes et laisse les autres sans role', async () => {
    const [de, cepta, reactu, bilan, fin, diet, deja] = await Promise.all([
      creer('SMCP Diagnostic éducatif'),
      creer('Diagnostic Éducatif – Bilan CEPTA'),
      creer('SMCP Réactu 2'),
      creer('Bilan de sortie'),
      creer('Bilan de fin de programme'),
      creer('Diététique'),
      creer('Bilan de sortie bis', 'REACTUALISATION'),
    ])
    expect(bloc).toContain('UPDATE')
    await testDb.$executeRawUnsafe(bloc)

    const role = async (id: string) =>
      (await testDb.thematic.findUniqueOrThrow({ where: { id } })).role
    expect(await role(de.id)).toBe('DIAGNOSTIC_EDUCATIF')
    // Review Focus 1 : le diagnostic l'emporte sur « Bilan ».
    expect(await role(cepta.id)).toBe('DIAGNOSTIC_EDUCATIF')
    expect(await role(reactu.id)).toBe('REACTUALISATION')
    expect(await role(bilan.id)).toBe('BILAN_DE_FIN')
    expect(await role(fin.id)).toBe('BILAN_DE_FIN')
    expect(await role(diet.id)).toBeNull()
    // Review Focus 2 : un rôle déjà posé n'est jamais écrasé.
    expect(await role(deja.id)).toBe('REACTUALISATION')
  })
})
