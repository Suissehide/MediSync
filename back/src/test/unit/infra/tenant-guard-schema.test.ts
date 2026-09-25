import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import {
  ESTABLISHMENT_MODELS,
  GLOBAL_TENANT_RELATIONS,
  MODEL_RELATIONS,
  NESTED_RELATIONS,
  SERVICE_MODELS,
  SUPERADMIN_GLOBAL_OPERATIONS,
  SUPERADMIN_OPERATIONS,
} from '../../../main/infra/orm/tenant-guard'

// Le garde-fou controle les include imbriques (a n'importe quelle profondeur, depuis une racine
// de service, d'etablissement, ou globale depuis le tour de correction 1 sur la tache 9/etape 3)
// a partir d'une table ecrite a la main,
// MODEL_RELATIONS, qui couvre desormais TOUS les modeles du schema et pas seulement ceux
// d'etablissement (l'ancienne TENANT_CHILD_RELATIONS). Sur `include`, une relation absente de la
// table est refusee, donc un oubli s'y voit. Sur `select`, il ne peut PAS en exiger autant : un
// select mele colonnes scalaires et relations, et ce generateur Prisma n'expose aucune metadonnee
// a l'execution qui permettrait de les distinguer. Une relation ajoutee au schema sans etre
// reportee dans la table passerait donc silencieusement par select.
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

// Une colonne scalaire requise (non nullable) de ce nom, au premier niveau du bloc. `String?`
// (ex. `ActivityLog.serviceId`) ne compte pas : une colonne optionnelle documente un rattachement
// possible, pas une obligation de filtrage — voir modelsRequiringServiceScope ci-dessous.
const hasRequiredColumn = (body: string, column: string): boolean =>
  new RegExp(`^\\s*${column}\\s+String(?!\\?)\\b`, 'm').test(body)

// Modeles qui portent serviceId ET establishmentId en colonnes requises : ce sont exactement les
// deux colonnes qui decident, dans tenant-guard.ts, de la famille « service » (voir familyOf).
// Absent des deux listes (SERVICE_MODELS et ESTABLISHMENT_MODELS), un tel modele tombe dans la
// famille « global », qui ne verifie plus AUCUN filtre de tenant sur AUCUNE operation — c'est le
// mode de defaillance le plus grave que ce fichier puisse laisser passer, et le seul qu'aucun
// autre test du depot n'attrape : la suite unitaire reste verte meme si un modele de service est
// retire de SERVICE_MODELS, tant que rien n'appelle le garde-fou en conditions reelles.
const modelsRequiringServiceScope = (): string[] =>
  [...models.entries()]
    .filter(([, body]) => hasRequiredColumn(body, 'serviceId') && hasRequiredColumn(body, 'establishmentId'))
    .map(([name]) => name)

// Exception documentee, pas un oubli : ServiceMembership porte serviceId et establishmentId en
// colonnes requises mais reste classe « etablissement » (ESTABLISHMENT_MODELS). Il n'est jamais
// lu par son propre serviceId : la seule relation qui y mene part de EstablishmentMembership, par
// establishmentMembershipId (colonne sans rapport avec le tenant), et le filtre de service y est
// pose a la main sur l'include (`membership.repository.ts`, commentaire « meme famille ») plutot
// que par assertWhere. Deplacer ServiceMembership vers SERVICE_MODELS changerait donc son
// filtrage a l'execution pour un modele que cette tache ne touche pas ; ce test se contente de
// nommer l'exception plutot que de la laisser faire echouer une regle par ailleurs correcte.
const HORS_SERVICE_MODELS: readonly string[] = ['ServiceMembership']

describe('SERVICE_MODELS reflete prisma/schema.prisma', () => {
  // Le trou qui a motive ce bloc : un modele qui porte serviceId et establishmentId requis mais
  // n'est dans aucune des deux listes tombe en famille « global », qui laisse tout passer.
  it('contient tout modele qui porte serviceId et establishmentId en colonnes requises', () => {
    const manquants = modelsRequiringServiceScope().filter(
      (model) => !SERVICE_MODELS.includes(model) && !HORS_SERVICE_MODELS.includes(model),
    )
    expect(manquants).toEqual([])
  })

  // L'autre sens : une entree qui ne correspond a aucun modele portant les deux colonnes
  // requises — modele disparu, renomme, ou dont une des deux colonnes est devenue optionnelle —
  // est une declaration morte.
  it('ne declare aucune entree qui ne porte pas les deux colonnes requises', () => {
    const required = modelsRequiringServiceScope()
    const mortes = SERVICE_MODELS.filter((model) => !required.includes(model))
    expect(mortes).toEqual([])
  })

  // Garde-fou de l'exception elle-meme : si ServiceMembership cessait un jour de porter les deux
  // colonnes requises, ou entrait dans SERVICE_MODELS, la ligne ci-dessus n'aurait plus de raison
  // d'exister et ce test le dit plutot que de laisser une exception mensongere.
  it('ne garde HORS_SERVICE_MODELS que pour un modele qui en aurait sinon besoin', () => {
    const required = modelsRequiringServiceScope()
    for (const model of HORS_SERVICE_MODELS) {
      expect(SERVICE_MODELS).not.toContain(model)
      expect(required).toContain(model)
    }
  })
})

// MODEL_RELATIONS (tache 9/etape 3) couvre TOUS les modeles du schema, pas seulement ceux
// d'etablissement : c'est ce qui permet au garde-fou de suivre la famille du modele courant a
// n'importe quelle profondeur d'inclusion imbriquee, et de reconnaitre une transition
// etablissement -> service la ou qu'elle se trouve dans l'arbre, pas seulement au premier
// niveau depuis la racine de la requete. Avant cette tache, cette table s'appelait
// TENANT_CHILD_RELATIONS et ne couvrait que ESTABLISHMENT_MODELS ; les tests ci-dessous
// portaient alors sur `[...ESTABLISHMENT_MODELS]`, ils portent maintenant sur `[...modelNames]`
// (tous les modeles reellement declares au schema, la meme source que relationsOf).
describe('MODEL_RELATIONS reflete prisma/schema.prisma', () => {
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
      serviceFiles: 'PatientServiceFile',
    })
  })

  it('declare chaque modele du schema', () => {
    expect(Object.keys(MODEL_RELATIONS).sort()).toEqual([...modelNames].sort())
  })

  // Le coeur : relation par relation, dans les deux sens, pour CHAQUE modele du schema — pas
  // seulement ceux d'etablissement. Une relation du schema absente de la table est un trou (elle
  // traverserait un include imbrique sans etre reconnue, donc refusee a tort, ou pire laisserait
  // une transition etablissement -> service non filtree si l'oubli portait sur elle) ; une
  // entree de la table absente du schema est une declaration morte, qui ne protege rien et ne se
  // voit pas a l'usage.
  it.each([...modelNames])('reflete exactement les relations de %s', (model) => {
    const body = models.get(model)
    expect(body).toBeDefined()
    expect(MODEL_RELATIONS[model]).toEqual(relationsOf(body ?? ''))
  })

  // Enonce separement la propriete de cloisonnement que le garde-fou exploite reellement, pour
  // qu'un echec dise « telle relation vers un modele de service manque » plutot que « deux
  // objets different ». Cette propriete precise ne concerne que les modeles d'etablissement
  // (c'est la ou nait la transition dangereuse), mais elle est desormais deja couverte, pour
  // TOUS les modeles, par l'egalite exacte ci-dessus : ce test reste pour la lisibilite du
  // message d'echec sur le cas qui compte pour le cloisonnement.
  it('ne laisse aucune relation vers un modele de service hors de la table', () => {
    const missing: string[] = []
    for (const model of ESTABLISHMENT_MODELS) {
      const declared = MODEL_RELATIONS[model] ?? {}
      for (const [field, target] of Object.entries(relationsOf(models.get(model) ?? ''))) {
        if (SERVICE_MODELS.includes(target) && declared[field] !== target) {
          missing.push(`${model}.${field} -> ${target}`)
        }
      }
    }
    expect(missing).toEqual([])
  })
})

// La seconde table ecrite a la main : celle des relations d'un modele GLOBAL qui exposent de la
// donnee de tenant. Le besoin est plus pressant que pour MODEL_RELATIONS, parce que
// `assertGlobalInclude` echoue OUVERT — une relation absente de la table n'est pas vue, donc
// l'include passe sans controle, la ou `assertNestedInclude` refuse ce qu'il ne connait pas. Avant
// ce test, la table avait deja derive : elle declarait un `User.soignant` disparu du schema
// depuis l'etape 1, ou le lien vers `Soignant` est passe a `EstablishmentMembership`.
//
// MAIS L'OBLIGATION N'EST PAS LA MEME, et ce paragraphe a longtemps affirme le contraire.
// MODEL_RELATIONS est une liste blanche qui EXIGE : ce qui n'y figure pas est refuse, donc
// y declarer une relation la rend simplement lisible et l'exhaustivite ne coute rien.
// GLOBAL_TENANT_RELATIONS fait l'inverse : y declarer une relation la RESTREINT, puisque
// `assertGlobalInclude` refuse alors tout include dessus hors findUnique(OrThrow). Exiger ici
// l'egalite avec toutes les relations du modele reviendrait donc a exiger qu'on restreigne un
// futur `User.notificationPreferences` sans aucun rapport avec le cloisonnement. L'exigence est
// resserree en consequence, et dite en trois proprietes ci-dessous.
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

  // Premiere et deuxieme proprietes (voir l'en-tete du bloc pour le pourquoi du resserrement) :
  // ce que la table doit garantir est qu'aucune relation MENANT A DU TENANT n'echappe au
  // controle — la seule propriete que `assertGlobalInclude` exploite, et la seule qui compte
  // puisqu'il echoue OUVERT. Les deux sens sont enonces separement pour que l'echec nomme le
  // defaut plutot que de dire « deux objets different ».
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
  // `assertGlobalInclude` ne regarde que le premier niveau. La descente dans les inclusions
  // imbriquees est desormais couverte ailleurs : `assertNestedInclude`, dans tenant-guard.ts, est
  // appelee aussi depuis une racine globale (tour de correction 1 sur la relecture de la tache
  // 9) et attrape toute transition etablissement -> service rencontree en profondeur — mais elle
  // ne remplace pas cette liste-ci, propre au premier niveau et a la question, differente, de
  // savoir si une relation de modele global merite d'etre restreinte a findUnique(OrThrow).
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

// La troisieme table ecrite a la main, NESTED_RELATIONS : une liste blanche pour les ecritures
// imbriquees (parent -> champ -> enfant). A la difference de MODEL_RELATIONS, elle n'a
// pas a etre exhaustive — voir son commentaire dans tenant-guard.ts — puisqu'un champ absent y
// est deja refuse a l'execution (fail closed) plutot que laisse sans controle. Ce test ne verifie
// donc qu'un seul sens : une entree qui ne correspond plus a une relation du schema (modele
// renomme, champ renomme, relation supprimee) est une declaration morte, qui ne protege plus
// rien et ne se voit pas a l'usage — le meme risque que celui deja tenu pour les deux tables
// ci-dessus.
describe('NESTED_RELATIONS reflete prisma/schema.prisma', () => {
  it('ne declare aucune relation morte', () => {
    const mortes: string[] = []
    for (const [model, relations] of Object.entries(NESTED_RELATIONS)) {
      const actual = relationsOf(models.get(model) ?? '')
      for (const [field, target] of Object.entries(relations)) {
        if (actual[field] !== target) {
          mortes.push(`${model}.${field} -> ${target}`)
        }
      }
    }
    expect(mortes).toEqual([])
  })
})

// La quatrieme table ecrite a la main, SUPERADMIN_OPERATIONS (tache 1, etape 4a) : la liste
// declaree des couples (modele, operation) permis sous le contexte superadmin (voir son
// commentaire dans tenant-guard.ts). Deux proprietes, dans les deux sens ou l'une des deux
// directions n'a pas de sens :
//   - chaque modele qu'elle nomme doit exister au schema (sinon la cle est une declaration
//     morte, qui ne protege ni n'autorise plus rien) ;
//   - chaque modele qu'elle nomme doit etre un modele de TENANT (service ou etablissement).
//     C'est la direction la plus utile : elle rougit le jour ou quelqu'un y ajoute un modele
//     GLOBAL, signe qu'il n'a pas compris que les globaux passent deja sans exception
//     (assertGlobalScope) et qu'il elargit la liste pour rien.
describe('SUPERADMIN_OPERATIONS reflete le schema', () => {
  const modeles = modelNames

  it('ne declare que des modeles qui existent', () => {
    for (const modele of Object.keys(SUPERADMIN_OPERATIONS)) {
      expect(modeles).toContain(modele)
    }
  })

  it('ne declare que des modeles de tenant — un modele global n a pas besoin d y figurer', () => {
    for (const modele of Object.keys(SUPERADMIN_OPERATIONS)) {
      expect([...SERVICE_MODELS, ...ESTABLISHMENT_MODELS]).toContain(modele)
    }
  })

  // TOUR DE CORRECTION 1 (tache 1) — Important de la revue : les deux tests ci-dessus ne tiennent
  // que la CONFORMITE au schema (modeles existants, modeles de tenant), jamais le CONTENU. Ils
  // restaient verts si la revue ajoutait `Soignant: ['findMany', 'deleteMany', 'updateMany']` —
  // Soignant est un modele de tenant qui existe au schema, donc les deux tests structurels
  // n'avaient rien a y redire, alors que la liste est la frontiere entre le super-admin et les
  // donnees de sante : c'est son CONTENU exact, pas seulement sa forme, qui doit etre tenu. Ce
  // test epingle donc la valeur entiere, cle par cle et operation par operation : tout ajout,
  // tout retrait, et tout changement d'une des OPERATIONS d'un modele deja present — y compris
  // leur ORDRE au sein d'un meme modele (`toEqual` compare les tableaux element par element) —
  // fait rougir ce test, forcant une revue deliberee au lieu d'un silence.
  //
  // CE QUE CE TEST NE TIENT PAS, dit platement plutot qu'affirme a tort (tour de correction 2 —
  // verifie par execution : `require('util').isDeepStrictEqual({a:1,b:2}, {b:2,a:1})` vaut
  // `true`, la meme semantique que `toEqual` sur un objet) : l'ORDRE DES CLES de
  // SUPERADMIN_OPERATIONS lui-meme (`Service` avant ou apres `Patient`, par exemple) n'est pas
  // observable par une egalite structurelle sur un objet JavaScript, et ce reordonnancement-la ne
  // fait donc PAS rougir ce test — sans consequence de toute facon, l'ordre des cles d'un objet
  // n'affecte jamais son comportement ici (SUPERADMIN_OPERATIONS[model] est un acces par cle, pas
  // par position).
  //
  // Le format est volontairement plat (`toEqual` sur l'objet entier) plutot qu'une assertion par
  // cle : un diff Jest sur l'objet entier montre immediatement CE QUI a change, ce qu'une boucle
  // avec `expect(...).toContain(...)` ne peut pas montrer aussi clairement.
  it('est exactement la liste attendue — tout changement de contenu doit etre delibere', () => {
    expect(SUPERADMIN_OPERATIONS).toEqual({
      Service: ['count', 'findMany'],
      EstablishmentMembership: ['count', 'findMany', 'create'],
      ServiceMembership: ['count', 'findMany'],
      Patient: ['count'],
      ActivityLog: ['findMany', 'count'],
    })
  })
})

// TOUR DE CORRECTION 4 (tache 1) — Critique de la re-revue : le resserrement du tour 3 refusait
// TOUTE mutation d'un modele global sous superadmin, par un ensemble d'OPERATIONS sans
// granularite par modele, et sans aucune porte pour en rouvrir une seule. SUPERADMIN_GLOBAL_
// OPERATIONS lui substitue une table PAR MODELE, symetrique de SUPERADMIN_OPERATIONS ci-dessus.
// Elle est la frontiere entre le super-admin et les tables globales exactement comme l'autre l'est
// pour les tables de tenant : elle est donc tenue ici dans les MEMES trois directions — modeles
// qui existent, modeles de la bonne famille, et contenu exact epingle.
//
// Les deux modeles que la tache 2 doit creer (`AccessLink`, `SuperAdminAccessGrant`) sont declares
// AVANT d'exister au schema, a dessein : la tache 2 les veut globaux, `familyOf` rend « global »
// par defaut, et sans declaration prealable les taches 4, 6, 8 et 10 se heurteraient au refus au
// milieu d'une tache de fonctionnalite. Cette avance est bornee par une liste d'attente explicite
// que le troisieme test ci-dessous fait POURRIR BRUYAMMENT le jour ou les tables arrivent, plutot
// que de la laisser vivre indefiniment.
const MODELES_GLOBAUX_A_VENIR: readonly string[] = ['AccessLink', 'SuperAdminAccessGrant']

describe('SUPERADMIN_GLOBAL_OPERATIONS reflete le schema', () => {
  it('ne declare que des modeles GLOBAUX — un modele de tenant releve de SUPERADMIN_OPERATIONS', () => {
    const modelesDeTenant = [...SERVICE_MODELS, ...ESTABLISHMENT_MODELS]
    for (const modele of Object.keys(SUPERADMIN_GLOBAL_OPERATIONS)) {
      expect(modelesDeTenant).not.toContain(modele)
    }
  })

  // Un meme modele dans les deux tables serait une ambiguite silencieuse : c'est `familyOf` qui
  // decide laquelle des deux portes il franchit, jamais l'auteur de la declaration, et l'entree
  // inutile ferait croire a une permission qui n'est jamais lue.
  it('ne partage aucun modele avec SUPERADMIN_OPERATIONS', () => {
    const communs = Object.keys(SUPERADMIN_GLOBAL_OPERATIONS).filter(
      (modele) => modele in SUPERADMIN_OPERATIONS,
    )
    expect(communs).toEqual([])
  })

  it('ne declare que des modeles qui existent, ou nommement en attente de la tache 2', () => {
    const inconnus = Object.keys(SUPERADMIN_GLOBAL_OPERATIONS).filter(
      (modele) => !modelNames.has(modele) && !MODELES_GLOBAUX_A_VENIR.includes(modele),
    )
    expect(inconnus).toEqual([])

    // L'autre sens, celui qui fait pourrir la liste d'attente : des que la tache 2 ajoute une de
    // ces tables au schema, ce test rougit. Le remede attendu est de RETIRER le modele de
    // MODELES_GLOBAUX_A_VENIR (le premier sens ci-dessus le couvrira alors par le schema), et, en
    // le faisant, de relire les operations declarees pour lui dans SUPERADMIN_GLOBAL_OPERATIONS
    // maintenant que ses colonnes existent vraiment.
    const dejaArrives = MODELES_GLOBAUX_A_VENIR.filter((modele) => modelNames.has(modele))
    expect(dejaArrives).toEqual([])

    // Et une entree d'attente qui ne correspond a aucune declaration est une ligne morte.
    const inutiles = MODELES_GLOBAUX_A_VENIR.filter(
      (modele) => !(modele in SUPERADMIN_GLOBAL_OPERATIONS),
    )
    expect(inutiles).toEqual([])
  })

  // Meme role, mot pour mot, que l'epingle de SUPERADMIN_OPERATIONS ci-dessus, et memes limites
  // (l'ordre des CLES d'un objet n'est pas observable par `toEqual` ; l'ordre des elements d'un
  // tableau l'est) : ce sont les OPERATIONS declarees, pas seulement la forme de la table, qui
  // decident de ce qu'un super-admin peut ecrire sur une table globale. La liste des lectures est
  // ecrite ici en clair plutot que reconstruite depuis la constante du garde-fou : une epingle qui
  // reutiliserait la meme source que le code ne tiendrait rien (elle suivrait toute modification
  // au lieu de la signaler).
  it('est exactement la liste attendue — tout changement de contenu doit etre delibere', () => {
    const lectures = [
      'findMany',
      'findFirst',
      'findFirstOrThrow',
      'findUnique',
      'findUniqueOrThrow',
      'count',
      'aggregate',
      'groupBy',
    ]
    expect(SUPERADMIN_GLOBAL_OPERATIONS).toEqual({
      User: [...lectures, 'create'],
      Establishment: [...lectures, 'create'],
      AccessLink: [...lectures, 'create', 'updateMany'],
      SuperAdminAccessGrant: [...lectures, 'create', 'update'],
    })
  })
})
