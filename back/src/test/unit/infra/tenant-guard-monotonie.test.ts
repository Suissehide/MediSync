import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

import {
  assertTenantScope,
  MODEL_RELATIONS,
} from '../../../main/infra/orm/tenant-guard'
import type { TenantStore } from '../../../main/types/utils/tenant-context'

// LA MESURE DE MONOTONIE, REJOUABLE — pas un chiffre dans un rapport.
//
// POURQUOI CE FICHIER EXISTE. Le meme balayage — « aucun refus n'a ete PERDU » — a deja ete
// mesure plusieurs fois avec un harnais jetable, supprime aussitot apres. Le chiffre finissait
// dans un rapport et n'etait reproductible par
// personne — or un balayage qu'on ne peut pas rejouer ne protege pas la PROCHAINE modification
// du garde-fou, qui est exactement le moment ou il servirait. Ce fichier verse le harnais au
// depot.
//
// CE QU'IL N'EMBARQUE PAS : une seconde copie du garde-fou. La version « d'avant » est tiree de
// GIT a l'execution (`git show <ref>:…`), donc elle ne peut pas se perimer ni diverger.
//
// LA REFERENCE, ET POURQUOI C'EST `HEAD` PAR DEFAUT. `MONOTONIE_REF` choisit la version de
// comparaison ; le defaut est `HEAD`, c'est-a-dire « mon arbre de travail contre le dernier
// commit ». C'est la seule valeur par defaut qui ait un sens a tout moment : pendant qu'on
// modifie le garde-fou, elle repond exactement a « est-ce que ce que je suis en train d'ecrire
// perd un refus ? ». Sur un arbre PROPRE, les deux sources sont alors IDENTIQUES et la mesure ne
// compare rien — le test le DIT dans sa sortie (« sources identiques, controle a vide ») plutot
// que de laisser prendre un vert pour une preuve.
//
// Pour comparer a autre chose qu'au dernier commit — une branche entiere, une etape —, on
// nomme la reference :
//     MONOTONIE_REF=<ref> PROFONDEUR=9 npx jest -c src/test/jest.config.ts \
//       --selectProjects unit --testPathPatterns tenant-guard-monotonie
// (la commande rejoue bien la COMPARAISON, jamais le CHIFFRE. L'espace balaye depend de
// MODEL_RELATIONS et des formes definies plus bas, qui ont change plusieurs fois — voir plus bas.)
//
// CE QUE `MONOTONIE_REF=main` REND, ET CE QUE CELA VEUT DIRE. Mesure actuelle, a
// profondeur 4, sur 202 250 cas :
//     349 refus perdus — {"tenant":315,"superadmin":34}, et ZERO sans contexte.
// Les deux ecarts ont chacun leur raison :
//   - zero sans contexte, parce que la porte de permission NO_CONTEXT_GLOBAL_OPERATIONS a
//     referme cette famille entiere ;
//   - les 349 restants sont, verifies un par un par filtrage de la liste complete (349 sur 349,
//     pas un echantillon), tous des cas dont la racine ou une etape est `PatientAccessLog` /
//     `accessLogs` — un modele ajoute apres coup au graphe. Meme MECANISME que
//     l'explication d'origine, autre modele : avant son entree dans MODEL_RELATIONS, tout
//     `include` le nommant etait refuse comme « non declare ». Le declarer le rend utilisable ;
//     ce n'est pas un refus perdu au sens du cloisonnement, c'est une table qui nait.
// LECON, et c'est la raison d'etre de ce harnais : ce paragraphe est un CHIFFRE DANS UN
// COMMENTAIRE, exactement ce que ce fichier a ete cree pour remplacer. Il se perime a chaque
// modele ajoute. Relancez la commande plutot que de le croire.
//
// CE QU'IL MESURE. Pour chaque cas, le verdict des deux versions (passe / refuse) :
//   - REFUS PERDU (refuse avant, passe maintenant) => ECHEC. C'est la propriete.
//   - refus gagne (passe avant, refuse maintenant) => compte et affiche, jamais un echec : c'est
//     ce que fait un resserrement.
// L'ESPACE BALAYE, DECRIT EXACTEMENT. Deux familles, et
// c'est la reunion des deux qui fait l'espace :
//   1. PROFONDEUR 0 — les formes NUES (`FORMES_NUES` plus bas) : chaque racine x chaque verbe,
//      SANS aucun `include` ni `select`. Elles manquaient entierement : toutes les formes
//      etaient decorees d'au moins une relation incluse, si bien qu'un `Establishment.deleteMany
//      ({})` nu n'etait jamais compare.
//   2. PROFONDEURS 1..PROFONDEUR — les formes DECOREES (`formes()`) : chaque racine x chaque
//      forme x chaque chaine d'inclusion du graphe MODEL_RELATIONS (parcours en PROFONDEUR — le
//      graphe porte des cycles, la profondeur est la seule garde ; en largeur, un niveau entier
//      tiendrait des millions de tableaux en memoire).
// Le tout x 5 contextes (tenant, tenant-admin, superadmin, system, sans-contexte).
//
// LES VERBES COUVERTS : les dix qu'un modele peut subir de destructif ou de structurant —
// findMany, findUnique, findFirst, count, create, update, updateMany, upsert, delete,
// deleteMany. Les formes nues les portent tous les dix ; les formes decorees en portent huit
// (ni `updateMany` ni `deleteMany`, qui n'acceptent pas d'`include` chez Prisma — les decorer
// mesurerait une forme qui ne peut pas exister). Auparavant, les formes decorees n'en
// couvraient que six et les nues n'existaient pas : `delete`, `deleteMany`, `updateMany` et
// `upsert` n'etaient balayes nulle part. Ce qui reste hors du balayage, nomme plutot que
// sous-entendu : `findFirstOrThrow`, `findUniqueOrThrow`, `createMany`, `createManyAndReturn`,
// `updateManyAndReturn`, `aggregate`, `groupBy` — chacun partage sa logique de verification avec
// un verbe present ici (voir READ_OPERATIONS / WRITE_OPERATIONS dans le garde-fou), mais
// « partage sa logique » n'est pas « est mesure », et c'est dit ainsi.
//
// PROFONDEUR : 4 par defaut (4 016 chaines, 202 250 cas, ~2 s), pour que la suite unitaire reste
// rapide. Le balayage profond se lance a la main et c'est lui qui vaut preuve.
//
// LE NOMBRE DE CAS N'EST PAS UNE CONSTANTE, ne le recopiez pas d'un rapport : il se derive de
// MODEL_RELATIONS et grossit a chaque relation ajoutee au schema, et il a deja change plusieurs
// fois pour cette seule raison. Profondeur 9 : 61 923 360 cas mesures contre
// `f022ef9` ; 80 198 400 apres que le graphe a gagne
// `PatientAccessLog` ; et davantage depuis que cet en-tete elargit l'espace. Citez le chiffre
// que VOTRE execution a imprime — le `console.log` du second test le donne en entier.
//
// LIMITE, NOMMEE : si `git show` ne peut pas produire la version de reference (historique
// absent, reference inconnue), ce test ECHOUE au lieu de se taire. Un test de monotonie qui se
// desactive tout seul le jour ou il ne trouve pas sa reference serait pire qu'absent — il
// dirait « vert » sans avoir rien compare.

const PROFONDEUR = Number(process.env.PROFONDEUR ?? '4')
const REF = process.env.MONOTONIE_REF ?? 'HEAD'

const CHEMIN_DANS_LE_DEPOT = 'back/src/main/infra/orm/tenant-guard.ts'
// Ce fichier matérialisait sa copie EN PLUS, à côté du
// garde-fou, DANS `src/main` — pendant toute la durée du test, `npm run lint` la lint, `npm run
// build` l'émet (elle vit sous `src/main/tsconfig.json`), et les énumérations de ce dossier la
// balaient. Supprimée en `afterAll`, mais un jest interrompu (crash, kill -9, CI coupée) la
// laisse derrière — un `build` lancé juste après la ramasserait. Écrite maintenant dans CE
// dossier (`src/test`, jamais couvert par `lint` ni par le typecheck de `build`), avec ses
// imports RELATIFS réécrits pour continuer à résoudre : la version tirée de git porte des
// chemins relatifs à SON emplacement d'origine (`../../../generated/client`, etc.), qui ne
// pointeraient plus juste une fois copiés ici tels quels.
const CHEMIN_BASELINE = join(__dirname, 'tenant-guard.baseline-monotonie.ts')
// Répertoire d'origine du garde-fou dans le dépôt (jamais lu sur le disque : sert uniquement de
// base de résolution pour les imports relatifs de la source tirée de git).
const REPERTOIRE_DORIGINE = join(__dirname, '../../../main/infra/orm')

type Assert = typeof assertTenantScope

// Vrai quand la reference et l'arbre de travail portent le MEME garde-fou : la comparaison ne
// compare alors rien, et il faut le dire.
let sourcesIdentiques = false

// Réécrit chaque import relatif (`from '../../foo'`) pour qu'il continue de résoudre depuis LA
// NOUVELLE localisation du fichier (`__dirname`, dans `src/test`) plutôt que depuis son
// emplacement d'origine (`REPERTOIRE_DORIGINE`, dans `src/main`) — générique, donc valable même
// si `tenant-guard.ts` gagne ou perd un import plus tard.
const reecrireLesImportsRelatifs = (source: string): string =>
  source.replace(/from '(\.\.[^']*)'/g, (_match, specificateur: string) => {
    const cible = resolve(REPERTOIRE_DORIGINE, specificateur)
    let reecrit = relative(__dirname, cible).replace(/\\/g, '/')
    if (!reecrit.startsWith('.')) {
      reecrit = `./${reecrit}`
    }
    return `from '${reecrit}'`
  })

const materialiserLaVersionDeReference = (): Assert => {
  const racineDuDepot = execFileSync('git', ['rev-parse', '--show-toplevel'], {
    cwd: __dirname,
    encoding: 'utf8',
  }).trim()
  const source = execFileSync(
    'git',
    ['show', `${REF}:${CHEMIN_DANS_LE_DEPOT}`],
    {
      cwd: racineDuDepot,
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
    },
  )
  const actuel = readFileSync(join(racineDuDepot, CHEMIN_DANS_LE_DEPOT), 'utf8')
  sourcesIdentiques = actuel === source
  writeFileSync(CHEMIN_BASELINE, reecrireLesImportsRelatifs(source), 'utf8')
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return (require(CHEMIN_BASELINE) as { assertTenantScope: Assert })
    .assertTenantScope
}

const tenant: TenantStore = {
  kind: 'tenant',
  tenant: {
    userId: 'u1',
    establishmentId: 'e1',
    establishmentRole: 'MEMBER',
    serviceId: 's1',
    serviceRole: 'INTERVENANT',
    soignantId: null,
  },
}
const tenantAdmin: TenantStore = {
  kind: 'tenant',
  tenant: {
    ...tenant.tenant,
    serviceId: null,
    serviceRole: null,
    establishmentRole: 'ADMIN',
  },
}
const CONTEXTES: { nom: string; store: TenantStore | undefined }[] = [
  { nom: 'tenant', store: tenant },
  { nom: 'tenant-admin', store: tenantAdmin },
  { nom: 'superadmin', store: { kind: 'superadmin' } },
  { nom: 'system', store: { kind: 'system' } },
  { nom: 'sans-contexte', store: undefined },
]

const includeDuChemin = (
  chemin: readonly string[],
  filtre: boolean,
): Record<string, unknown> => {
  const [tete, ...reste] = chemin
  if (tete === undefined) {
    return {}
  }
  const bornes = filtre ? { where: { serviceId: 's1' } } : {}
  return reste.length === 0
    ? { [tete]: filtre ? bornes : true }
    : { [tete]: { ...bornes, include: includeDuChemin(reste, filtre) } }
}
const selectDuChemin = (chemin: readonly string[]): Record<string, unknown> => {
  const [tete, ...reste] = chemin
  if (tete === undefined) {
    return {}
  }
  return reste.length === 0
    ? { [tete]: true }
    : { [tete]: { select: selectDuChemin(reste) } }
}

const LIGNE_DE_TENANT = { establishmentId: 'e1', serviceId: 's1' }

// PROFONDEUR 0 — les formes NUES, sans `include` ni `select`.
// Appliquees une fois par racine, en plus des formes decorees ci-dessous. C'est
// ici, et nulle part ailleurs, que `Establishment.deleteMany({})` entre dans le balayage. Les dix verbes y figurent, y compris les deux
// (`updateMany`, `deleteMany`) que Prisma n'accepte pas avec un `include`.
const FORMES_NUES: { operation: string; args: Record<string, unknown> }[] = [
  { operation: 'findMany', args: {} },
  { operation: 'findUnique', args: { where: { id: 'x1' } } },
  { operation: 'findFirst', args: { where: LIGNE_DE_TENANT } },
  { operation: 'count', args: { where: { establishmentId: 'e1' } } },
  { operation: 'create', args: { data: LIGNE_DE_TENANT } },
  { operation: 'update', args: { where: { id: 'x1' }, data: {} } },
  { operation: 'updateMany', args: { where: {}, data: {} } },
  {
    operation: 'upsert',
    args: { where: { id: 'x1' }, create: LIGNE_DE_TENANT, update: {} },
  },
  { operation: 'delete', args: { where: { id: 'x1' } } },
  { operation: 'deleteMany', args: { where: {} } },
]

// Les huit formes DECOREES : lectures nues, la forme `select`, des ECRITURES decorees d'un
// `include` (un `create ... include` rend ce qu'un `findMany ... include` rendrait), et la
// chaine filtree sur le service courant a chaque saut. `delete` et `upsert`
// acceptent tous deux un `include` chez Prisma, et `upsert` porte en
// plus ses deux branches `create`/`update`, que rien ne decorait jusqu'ici.
const formes = (chemin: readonly string[]) => {
  const inc = includeDuChemin(chemin, false)
  const incFiltre = includeDuChemin(chemin, true)
  const sel = selectDuChemin(chemin)
  return [
    { operation: 'findMany', args: { include: inc } },
    { operation: 'findUnique', args: { where: { id: 'x1' }, include: inc } },
    { operation: 'findFirst', args: { where: LIGNE_DE_TENANT, include: inc } },
    { operation: 'findMany', args: { select: sel } },
    { operation: 'create', args: { data: LIGNE_DE_TENANT, include: inc } },
    {
      operation: 'update',
      args: { where: { id: 'x1' }, data: {}, include: inc },
    },
    {
      operation: 'count',
      args: { where: { establishmentId: 'e1' }, include: inc },
    },
    {
      operation: 'findMany',
      args: { where: LIGNE_DE_TENANT, include: incFiltre },
    },
    { operation: 'delete', args: { where: { id: 'x1' }, include: inc } },
    {
      operation: 'upsert',
      args: {
        where: { id: 'x1' },
        create: LIGNE_DE_TENANT,
        update: {},
        include: inc,
      },
    },
  ]
}

const passe = (
  fn: Assert,
  model: string,
  operation: string,
  args: Record<string, unknown>,
  store: TenantStore | undefined,
): boolean => {
  try {
    fn({ model, operation, args }, store)
    return true
  } catch {
    return false
  }
}

const cheminsDepuis = function* (
  modele: string,
  restant: number,
  chemin: string[],
): Generator<string[]> {
  if (restant === 0) {
    return
  }
  for (const [champ, relation] of Object.entries(
    MODEL_RELATIONS[modele] ?? {},
  )) {
    chemin.push(champ)
    yield chemin
    yield* cheminsDepuis(relation.model, restant - 1, chemin)
    chemin.pop()
  }
}

describe(`monotonie du garde-fou contre ${REF} (profondeur ${PROFONDEUR})`, () => {
  let avant: Assert

  beforeAll(() => {
    avant = materialiserLaVersionDeReference()
  })

  afterAll(() => {
    if (existsSync(CHEMIN_BASELINE)) {
      rmSync(CHEMIN_BASELINE)
    }
  })

  // Garde-fou du garde-fou : sans cela, une erreur d'analyse rendrait les tests vrais sur un
  // graphe vide, et « zero refus perdu » ne voudrait plus rien dire.
  it('balaye bien un graphe non vide', () => {
    expect(Object.keys(MODEL_RELATIONS).length).toBeGreaterThan(15)
    let chaines = 0
    for (const racine of Object.keys(MODEL_RELATIONS)) {
      for (const _ of cheminsDepuis(racine, PROFONDEUR, [])) {
        chaines += 1
      }
    }
    expect(chaines).toBeGreaterThan(50)
  })

  it('ne perd aucun refus, sur aucun contexte', () => {
    let cas = 0
    let chaines = 0
    const perdus: string[] = []
    const perdusParContexte = new Map<string, number>()
    const gagnes = new Map<string, number>()

    const comparer = (
      racine: string,
      operation: string,
      args: Record<string, unknown>,
      chemin: readonly string[],
    ): void => {
      for (const { nom, store } of CONTEXTES) {
        cas += 1
        const a = passe(avant, racine, operation, args, store)
        const b = passe(assertTenantScope, racine, operation, args, store)
        if (a === b) {
          continue
        }
        if (a === false && b === true) {
          perdus.push(
            `${nom} | ${racine}.${operation} | ${chemin.join('>') || '(nu)'}`,
          )
          perdusParContexte.set(nom, (perdusParContexte.get(nom) ?? 0) + 1)
        } else {
          gagnes.set(nom, (gagnes.get(nom) ?? 0) + 1)
        }
      }
    }

    for (const racine of Object.keys(MODEL_RELATIONS)) {
      // Profondeur 0 : la racine seule, sans include ni select.
      for (const { operation, args } of FORMES_NUES) {
        comparer(racine, operation, args, [])
      }
      for (const chemin of cheminsDepuis(racine, PROFONDEUR, [])) {
        chaines += 1
        for (const { operation, args } of formes(chemin)) {
          comparer(racine, operation, args, chemin)
        }
      }
    }

    console.log(
      (sourcesIdentiques
        ? `monotonie vs ${REF} — SOURCES IDENTIQUES, controle a vide (rien n'est compare : ` +
          'nommer une autre reference avec MONOTONIE_REF pour une vraie mesure). '
        : '') +
        `monotonie vs ${REF} — profondeur ${PROFONDEUR}, ${chaines} chaines, ${cas} cas compares, ` +
        `${perdus.length} refus perdus ${JSON.stringify(Object.fromEntries(perdusParContexte))}, ` +
        `refus gagnes : ${JSON.stringify(Object.fromEntries(gagnes))}`,
    )
    // LA propriete. Le tableau des refus perdus s'affiche dans le diff Jest en cas d'echec, avec
    // le contexte, la racine et le chemin exact qui s'est rouvert.
    expect(perdus.slice(0, 20)).toEqual([])
    expect(perdus).toHaveLength(0)
  })
})
