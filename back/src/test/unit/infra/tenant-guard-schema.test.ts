import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import {
  ESTABLISHMENT_MODELS,
  SERVICE_MODELS,
  TENANT_CHILD_RELATIONS,
} from '../../../main/infra/orm/tenant-guard'

// Le garde-fou controle les include d'un modele d'etablissement a partir d'une table ecrite a la
// main, TENANT_CHILD_RELATIONS. Sur `include`, une relation absente de la table est refusee, donc
// un oubli s'y voit. Sur `select`, il ne peut PAS en exiger autant : un select mele colonnes
// scalaires et relations, et ce generateur Prisma n'expose aucune metadonnee a l'execution qui
// permettrait de les distinguer. Une relation ajoutee au schema sans etre reportee dans la table
// passerait donc silencieusement par select.
//
// Ce fichier ferme ce cas a la construction plutot qu'a l'execution, ce qui est plus fort : il
// relit prisma/schema.prisma et exige que la table en soit le reflet exact. Une relation ajoutee,
// renommee ou supprimee la-bas fait echouer la porte ici tant qu'elle n'est pas reportee.

const schemaPath = join(__dirname, '../../../../prisma/schema.prisma')
const schema = readFileSync(schemaPath, 'utf8')

// Retire les commentaires de fin de ligne : un `// Soignant referent` ne doit pas etre lu comme
// une declaration de champ.
const withoutComments = schema.replace(/\/\/.*$/gm, '')

// Blocs `model X { … }`. Le schema n'imbrique aucune accolade dans un bloc de modele : la
// premiere accolade fermante termine donc le bloc.
const modelBlocks = (): Map<string, string> => {
  const blocks = new Map<string, string>()
  const pattern = /model\s+(\w+)\s*\{([^}]*)\}/g
  for (const match of withoutComments.matchAll(pattern)) {
    const [, name, body] = match
    if (name && body !== undefined) {
      blocks.set(name, body)
    }
  }
  return blocks
}

const models = modelBlocks()
const modelNames = new Set(models.keys())

// Champs d'un modele dont le TYPE est lui-meme un modele : ce sont ses relations. Les scalaires
// (String, DateTime, Int…) et les enums (EstablishmentRole, AppointmentType…) sont ecartes par
// construction, puisqu'ils ne sont pas declares par un bloc `model`. Les attributs de bloc
// (`@@unique`, `@@index`, `@@id`) sont ignores : ils commencent par `@@`, jamais par un nom.
const relationsOf = (body: string): Record<string, string> => {
  const relations: Record<string, string> = {}
  for (const line of body.split('\n')) {
    const match = /^\s*(\w+)\s+(\w+)(\[\])?\??/.exec(line)
    if (!match) {
      continue
    }
    const [, field, type] = match
    if (field && type && modelNames.has(type)) {
      relations[field] = type
    }
  }
  return relations
}

describe('TENANT_CHILD_RELATIONS reflete prisma/schema.prisma', () => {
  it('lit bien le schema', () => {
    // Garde-fou du garde-fou : si le fichier bouge ou si l'analyse ci-dessus cesse de
    // reconnaitre les blocs, les tests suivants deviendraient vrais sur un schema vide.
    expect(modelNames.size).toBeGreaterThan(15)
    for (const model of [...SERVICE_MODELS, ...ESTABLISHMENT_MODELS]) {
      expect(modelNames).toContain(model)
    }
    // Une relation connue, pour prouver que relationsOf lit autre chose que du vide.
    expect(relationsOf(models.get('Patient') ?? '')).toMatchObject({
      enrollmentIssues: 'EnrollmentIssue',
    })
  })

  it('declare chaque modele d etablissement', () => {
    expect(Object.keys(TENANT_CHILD_RELATIONS).sort()).toEqual([...ESTABLISHMENT_MODELS].sort())
  })

  // Le coeur : relation par relation, dans les deux sens. Une relation du schema absente de la
  // table est un trou (elle passerait par select sans controle) ; une entree de la table absente
  // du schema est une declaration morte, qui ne protege rien et ne se voit pas a l'usage.
  it.each([...ESTABLISHMENT_MODELS])('reflete exactement les relations de %s', (model) => {
    const body = models.get(model)
    expect(body).toBeDefined()
    expect(TENANT_CHILD_RELATIONS[model]).toEqual(relationsOf(body ?? ''))
  })

  // Enonce separement la propriete que le garde-fou exploite reellement, pour qu'un echec dise
  // « telle relation vers un modele de service manque » plutot que « deux objets different ».
  it('ne laisse aucune relation vers un modele de service hors de la table', () => {
    const missing: string[] = []
    for (const model of ESTABLISHMENT_MODELS) {
      const declared = TENANT_CHILD_RELATIONS[model] ?? {}
      for (const [field, target] of Object.entries(relationsOf(models.get(model) ?? ''))) {
        if (SERVICE_MODELS.includes(target) && declared[field] !== target) {
          missing.push(`${model}.${field} -> ${target}`)
        }
      }
    }
    expect(missing).toEqual([])
  })
})
