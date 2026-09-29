import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// Correctif tour 1 (tâche 11, revue, Important I4/S5) — le sabotage que la revue a rejoué sans qu'aucun
// test ne bouge : déplacer « Profession » (`occupation`, un champ de `Patient`) du bloc
// « Identité partagée » (`identite.patient.tsx`) vers le bloc « Dossier de ce service »
// (`details.patient.tsx`). C'est exactement le défaut que la tâche 11 existe pour empêcher —
// afficher côté service un champ que les autres services de l'établissement partagent, ou
// inversement — et rien ne le gardait.
//
// Patron repris du back (`back/src/test/unit/infra/patientServiceFile-coverage.test.ts`) : lire
// `prisma/schema.prisma`, la déclaration qui fait autorité sur qui porte quoi, et comparer dans
// les deux sens plutôt que de faire confiance aux noms de fichiers. Différence assumée avec le
// back : il n'y a pas d'équivalent front de `tenant-guard-schema.test.ts` capable de reparser
// toute la grammaire Prisma, donc l'extraction ci-dessous reste volontairement étroite — un
// champ scalaire est une ligne `nom Type` où `Type` est un des types Prisma utilisés par ces deux
// modèles (`String`, `DateTime`), jamais une relation (`Model`, `Model[]`, `Model?`). Suffisant
// ici : les deux modèles concernés n'ont que ces deux types de colonnes scalaires.
//
// Vitest s'exécute depuis `front/` (voir `src/test/layouts-de-tenant.test.ts` pour le même
// constat) : les chemins ci-dessous partent de `process.cwd()`, pas d'`import.meta.url`.
const schemaPath = join(process.cwd(), '..', 'back', 'prisma', 'schema.prisma')
const schema = readFileSync(schemaPath, 'utf8')
const schemaWithoutComments = schema.replace(/\/\/.*$/gm, '')

const modelBody = (name: string): string => {
  const pattern = new RegExp(`model\\s+${name}\\s*\\{([^}]*)\\}`)
  const match = pattern.exec(schemaWithoutComments)
  if (!match?.[1]) {
    throw new Error(`model ${name} introuvable dans prisma/schema.prisma`)
  }
  return match[1]
}

const SCALAR_TYPES = ['String', 'DateTime', 'Boolean', 'Int', 'Float', 'Json']
const scalarFieldPattern = new RegExp(
  `^\\s*([a-zA-Z][a-zA-Z0-9]*)\\s+(?:${SCALAR_TYPES.join('|')})\\??(?:\\s|$)`,
)

// Colonnes techniques (identité, clés de tenant, horodatage) — jamais portées par un formulaire,
// donc absentes des deux cotés à comparer.
const TECHNICAL_COLUMNS = new Set([
  'id',
  'patientId',
  'serviceId',
  'establishmentId',
  'createDate',
  'createdAt',
])

const scalarFieldsOf = (modelName: string): Set<string> => {
  const body = modelBody(modelName)
  const fields = body
    .split('\n')
    .map((line) => scalarFieldPattern.exec(line)?.[1])
    .filter((name): name is string => !!name && !TECHNICAL_COLUMNS.has(name))
  return new Set(fields)
}

// Les cinq composants qui affichent les champs de `Patient`/`PatientServiceFile`
// (`edit.patient.tsx` les monte tous). Un champ statiquement déclaré ici comme
// `form.AppField name="..."` engage le composant qui le déclare : c'est le patron que le
// développeur du tour précédent aurait dû suivre pour bouger « Profession », et que ce test tient
// à sa place.
const editDir = join(
  process.cwd(),
  'src',
  'components',
  'custom',
  'Patient',
  'edit',
)

const PATIENT_FILES = ['identity.patient.tsx', 'identite.patient.tsx']
const SERVICE_FILE_FILES = [
  'details.patient.tsx',
  'pathway-inclusion.patient.tsx',
  'outcome-review.patient.tsx',
]

const fieldNamePattern = /form\.AppField\s+name="([a-zA-Z0-9]+)"/g

const fieldsDeclaredIn = (fileName: string): string[] => {
  const source = readFileSync(join(editDir, fileName), 'utf8')
  return [...source.matchAll(fieldNamePattern)].map((match) => match[1])
}

describe('Affectation des champs Patient / PatientServiceFile — prisma/schema.prisma fait autorité', () => {
  const patientColumns = scalarFieldsOf('Patient')
  const serviceFileColumns = scalarFieldsOf('PatientServiceFile')

  it('le schéma porte bien les onze colonnes attendues sur Patient et les seize sur PatientServiceFile', () => {
    // Garde-fou du garde-fou : si le motif cessait de reconnaître une vraie colonne scalaire (par
    // exemple parce qu'un type Prisma inattendu apparaît), les comparaisons plus bas
    // deviendraient vraies par manque de données plutôt que par preuve.
    expect(patientColumns.size).toBe(11)
    expect(serviceFileColumns.size).toBe(16)
  })

  for (const fileName of PATIENT_FILES) {
    it(`${fileName} ne déclare que des champs de Patient`, () => {
      for (const field of fieldsDeclaredIn(fileName)) {
        expect(
          patientColumns.has(field),
          `${field} n'est pas une colonne de Patient`,
        ).toBe(true)
      }
    })
  }

  for (const fileName of SERVICE_FILE_FILES) {
    it(`${fileName} ne déclare que des champs de PatientServiceFile`, () => {
      for (const field of fieldsDeclaredIn(fileName)) {
        expect(
          serviceFileColumns.has(field),
          `${field} n'est pas une colonne de PatientServiceFile`,
        ).toBe(true)
      }
    })
  }

  it('chaque colonne de Patient est déclarée par exactement un des deux fichiers « Patient »', () => {
    const declaredByFile = new Map(
      PATIENT_FILES.map((f) => [f, fieldsDeclaredIn(f)]),
    )
    for (const column of patientColumns) {
      const owners = PATIENT_FILES.filter((f) =>
        declaredByFile.get(f)?.includes(column),
      )
      expect(
        owners,
        `${column} devrait apparaître dans exactement un fichier`,
      ).toHaveLength(1)
    }
  })

  it('chaque colonne de PatientServiceFile est déclarée par exactement un des trois fichiers « sous-dossier »', () => {
    const declaredByFile = new Map(
      SERVICE_FILE_FILES.map((f) => [f, fieldsDeclaredIn(f)]),
    )
    for (const column of serviceFileColumns) {
      const owners = SERVICE_FILE_FILES.filter((f) =>
        declaredByFile.get(f)?.includes(column),
      )
      expect(
        owners,
        `${column} devrait apparaître dans exactement un fichier`,
      ).toHaveLength(1)
    }
  })

  it("aucun champ n'a disparu ni n'est apparu : l'union des cinq fichiers vaut exactement Patient ∪ PatientServiceFile", () => {
    const declared = [...PATIENT_FILES, ...SERVICE_FILE_FILES].flatMap(
      fieldsDeclaredIn,
    )
    const declaredSet = new Set(declared)
    // Pas de doublon toutes sources confondues : un champ compté deux fois masquerait un champ
    // manquant ailleurs dans les vérifications ci-dessus.
    expect(declared).toHaveLength(declaredSet.size)
    expect(declaredSet).toEqual(
      new Set([...patientColumns, ...serviceFileColumns]),
    )
  })
})
