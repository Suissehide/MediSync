import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import {
  ESTABLISHMENT_MODELS,
  GLOBAL_TENANT_RELATIONS,
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
    for (const model of Object.keys(GLOBAL_TENANT_RELATIONS)) {
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

// Le pendant de tout ce qui precede, pour la seconde table ecrite a la main : celle des relations
// d'un modele GLOBAL qui exposent de la donnee de tenant.
//
// Elle porte la meme obligation d'exhaustivite, et pour une raison plus pressante encore :
// `assertGlobalInclude` echoue OUVERT. Une relation absente de la table n'est pas vue, donc
// l'include passe sans controle — la ou `assertChildInclude` refuse ce qu'il ne connait pas.
// Avant ce test, la table avait deja derive : elle declarait un `User.soignant` disparu du schema
// depuis l'etape 1, ou le lien vers `Soignant` est passe a `EstablishmentMembership`.
describe('GLOBAL_TENANT_RELATIONS reflete prisma/schema.prisma', () => {
  const globalModels = Object.keys(GLOBAL_TENANT_RELATIONS)

  it('ne declare que des modeles reellement globaux', () => {
    // Si un modele de cette table entrait un jour dans SERVICE_MODELS ou ESTABLISHMENT_MODELS,
    // `familyOf` cesserait de le router vers `assertGlobalInclude` et la table deviendrait muette
    // sans que rien ne le signale.
    expect(globalModels.length).toBeGreaterThan(0)
    for (const model of globalModels) {
      expect(SERVICE_MODELS).not.toContain(model)
      expect(ESTABLISHMENT_MODELS).not.toContain(model)
    }
  })

  // L'exigence porte sur ce que le garde-fou doit vraiment couvrir, et pas plus. Elle a d'abord
  // ete ecrite comme une egalite avec TOUTES les relations du modele, ce qui est juste pour
  // `Establishment` — dont chaque relation mene a du tenant — mais trop large pour `User` :
  // ajouter au schema un `User.notificationPreferences`, sans aucun rapport avec le tenant,
  // aurait fait echouer cette porte jusqu'a ce qu'on le declare ici. Or declarer une relation
  // dans cette table n'est pas neutre : `assertGlobalInclude` REFUSE alors tout include dessus
  // hors findUnique(OrThrow). L'egalite stricte poussait donc a restreindre une relation qui
  // n'avait pas a l'etre, ou a se battre avec le test.
  //
  // Ce que la table doit reellement garantir, c'est qu'aucune relation MENANT A DU TENANT
  // n'echappe au controle — c'est la seule propriete que `assertGlobalInclude` exploite, et la
  // seule qui compte puisqu'il echoue OUVERT. Les deux sens sont donc verifies separement.
  const MODELES_DE_TENANT = new Set([...SERVICE_MODELS, ...ESTABLISHMENT_MODELS])

  it.each(globalModels)('declare toutes les relations de %s qui menent a du tenant', (model) => {
    const body = models.get(model)
    expect(body).toBeDefined()
    const declarees = [...(GLOBAL_TENANT_RELATIONS[model] ?? [])]

    // Le trou : une relation vers un modele de tenant absente de la table n'est pas vue, donc
    // l'include passe sans controle et ramene la donnee de TOUS les tenants.
    const manquantes = Object.entries(relationsOf(body ?? ''))
      .filter(([field, target]) => MODELES_DE_TENANT.has(target) && !declarees.includes(field))
      .map(([field, target]) => `${model}.${field} -> ${target}`)
    expect(manquantes).toEqual([])
  })

  it.each(globalModels)('ne declare aucune relation morte sur %s', (model) => {
    const body = models.get(model)
    expect(body).toBeDefined()
    const relations = relationsOf(body ?? '')

    // L'autre sens, inchange : une entree de la table absente du schema ne protege rien et ne se
    // voit pas a l'usage. C'est exactement la derive qui avait eu lieu (`User.soignant`).
    const mortes = [...(GLOBAL_TENANT_RELATIONS[model] ?? [])].filter(
      (field) => relations[field] === undefined,
    )
    expect(mortes).toEqual([])
  })

  // LA FRICTION QUI RESTE, NOMMEE PLUTOT QUE SUPPRIMEE. Les deux tests ci-dessus laissent
  // passer, en silence, une relation d'un modele global qui ne pointe vers AUCUN modele de
  // tenant. C'est exactement ce qu'on voulait pour `User.notificationPreferences` — mais « ne
  // pointe vers aucun modele de tenant » est une conclusion qu'aucune regle syntaxique ne peut
  // tirer seule : une relation vers un modele global (ou vers un modele qui n'est dans aucune
  // des trois listes) peut tres bien redescendre vers du tenant au niveau suivant, et
  // `assertGlobalInclude` ne regarde que le premier niveau — la descente dans les inclusions
  // imbriquees est reportee a l'etape 3 par decision explicite (voir
  // `docs/multi-tenant/decisions-etape-2.md`).
  //
  // Ce test tient donc la liste, vide a ce jour, des relations de modeles globaux qui ne menent
  // pas a du tenant. Une relation ajoutee la-bas le fait echouer, et la reparation est d'ecrire
  // ici le nom de la relation et POURQUOI elle n'expose pas de donnee de tenant — pas de la
  // declarer dans GLOBAL_TENANT_RELATIONS, ce qui interdirait un include parfaitement legitime.
  // C'est la friction, et elle est a sa place : le cout est une ligne a ecrire, le benefice est
  // qu'aucune relation d'un modele global n'entre au schema sans que quelqu'un ait tranche.
  const SANS_DONNEE_DE_TENANT: readonly string[] = []

  it('n a aucune relation de modele global non classee', () => {
    const nonClassees = globalModels.flatMap((model) =>
      Object.entries(relationsOf(models.get(model) ?? ''))
        .filter(([field, target]) => {
          const declaree = [...(GLOBAL_TENANT_RELATIONS[model] ?? [])].includes(field)
          return !declaree && !MODELES_DE_TENANT.has(target)
        })
        .map(([field, target]) => `${model}.${field} -> ${target}`),
    )
    expect(nonClassees.filter((relation) => !SANS_DONNEE_DE_TENANT.includes(relation))).toEqual([])
  })
})
