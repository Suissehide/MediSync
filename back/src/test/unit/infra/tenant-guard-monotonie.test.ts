import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

import { assertTenantScope, MODEL_RELATIONS } from '../../../main/infra/orm/tenant-guard'
import type { TenantStore } from '../../../main/types/utils/tenant-context'

// LA MESURE DE MONOTONIE, REJOUABLE — pas un chiffre dans un rapport.
//
// POURQUOI CE FICHIER EXISTE (tache 15, tour de correction 1). Les quatre tours de la tache 1,
// puis la tache 15, ont chacun mesure « aucun refus n'a ete PERDU » avec un harnais jetable,
// supprime aussitot apres. Le chiffre finissait dans un rapport et n'etait reproductible par
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
// nomme la reference. La mesure de la tache 15 se rejoue ainsi, exactement :
//     MONOTONIE_REF=f022ef9 PROFONDEUR=9 npx jest -c src/test/jest.config.ts \
//       --selectProjects unit --testPathPatterns tenant-guard-monotonie
//
// CE QUE `MONOTONIE_REF=main` REND, ET CE QUE CELA VEUT DIRE (mesure a profondeur 4) : 1 800
// « refus perdus » pour l'etape 4a ENTIERE — et ils sont tous explicables, verifies un par un.
// 1 552 sans contexte et 42 sous tenant ont pour racine ou pour etape `AccessLink` /
// `SuperAdminAccessGrant`, deux modeles que la tache 2 a AJOUTES au schema : avant elle, ils
// n'etaient pas dans MODEL_RELATIONS, donc tout `include` les nommant etait refuse comme « non
// declare ». Les declarer les rend utilisables — ce n'est pas un refus perdu au sens du
// cloisonnement, c'est une table qui nait. Les 206 sous superadmin sont la reouverture
// DELIBEREE du tour de correction 4 de la tache 1 (SUPERADMIN_GLOBAL_OPERATIONS, ou chaque
// couple est justifie un par un). Rien d'inexplique — mais c'est bien pour pouvoir le VERIFIER
// que ce harnais est verse au depot plutot que jete.
//
// CE QU'IL MESURE. Pour chaque cas, le verdict des deux versions (passe / refuse) :
//   - REFUS PERDU (refuse avant, passe maintenant) => ECHEC. C'est la propriete.
//   - refus gagne (passe avant, refuse maintenant) => compte et affiche, jamais un echec : c'est
//     ce que fait un resserrement.
// L'espace : toutes les racines du schema x 8 formes d'operation x 5 contextes x toutes les
// chaines d'inclusion du graphe MODEL_RELATIONS jusqu'a `PROFONDEUR` (parcours en PROFONDEUR —
// le graphe porte des cycles, la profondeur est la seule garde ; en largeur, un niveau entier
// tiendrait des millions de tableaux en memoire).
//
// PROFONDEUR : 4 par defaut (3 538 chaines, 141 520 cas, ~1 s), pour que la suite unitaire reste
// rapide. Le balayage profond se lance a la main et c'est lui qui vaut preuve. Mesure de
// reference de la tache 15, rejouable par la commande ci-dessus : profondeur 9, 1 548 084
// chaines, 61 923 360 cas compares, ZERO refus perdu, et zero changement de verdict hors du
// chemin de tenant (~10 min).
//
// LIMITE, NOMMEE : si `git show` ne peut pas produire la version de reference (historique
// absent, reference inconnue), ce test ECHOUE au lieu de se taire. Un test de monotonie qui se
// desactive tout seul le jour ou il ne trouve pas sa reference serait pire qu'absent — il
// dirait « vert » sans avoir rien compare.

const PROFONDEUR = Number(process.env.PROFONDEUR ?? '4')
const REF = process.env.MONOTONIE_REF ?? 'HEAD'

const CHEMIN_DANS_LE_DEPOT = 'back/src/main/infra/orm/tenant-guard.ts'
// Revue finale de l'étape 4a, mineur : ce fichier matérialisait sa copie EN PLUS, à côté du
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
  const source = execFileSync('git', ['show', `${REF}:${CHEMIN_DANS_LE_DEPOT}`], {
    cwd: racineDuDepot,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  })
  const actuel = readFileSync(join(racineDuDepot, CHEMIN_DANS_LE_DEPOT), 'utf8')
  sourcesIdentiques = actuel === source
  writeFileSync(CHEMIN_BASELINE, reecrireLesImportsRelatifs(source), 'utf8')
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return (require(CHEMIN_BASELINE) as { assertTenantScope: Assert }).assertTenantScope
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
  tenant: { ...tenant.tenant, serviceId: null, serviceRole: null, establishmentRole: 'ADMIN' },
}
const CONTEXTES: { nom: string; store: TenantStore | undefined }[] = [
  { nom: 'tenant', store: tenant },
  { nom: 'tenant-admin', store: tenantAdmin },
  { nom: 'superadmin', store: { kind: 'superadmin' } },
  { nom: 'system', store: { kind: 'system' } },
  { nom: 'sans-contexte', store: undefined },
]

const includeDuChemin = (chemin: readonly string[], filtre: boolean): Record<string, unknown> => {
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
  return reste.length === 0 ? { [tete]: true } : { [tete]: { select: selectDuChemin(reste) } }
}

// Les huit formes : lectures nues, la forme `select`, deux ECRITURES decorees d'un `include`
// (un `create ... include` rend ce qu'un `findMany ... include` rendrait), et la chaine filtree
// sur le service courant a chaque saut.
const formes = (chemin: readonly string[]) => {
  const inc = includeDuChemin(chemin, false)
  const incFiltre = includeDuChemin(chemin, true)
  const sel = selectDuChemin(chemin)
  return [
    { operation: 'findMany', args: { include: inc } },
    { operation: 'findUnique', args: { where: { id: 'x1' }, include: inc } },
    { operation: 'findFirst', args: { where: { establishmentId: 'e1', serviceId: 's1' }, include: inc } },
    { operation: 'findMany', args: { select: sel } },
    { operation: 'create', args: { data: { establishmentId: 'e1', serviceId: 's1' }, include: inc } },
    { operation: 'update', args: { where: { id: 'x1' }, data: {}, include: inc } },
    { operation: 'count', args: { where: { establishmentId: 'e1' }, include: inc } },
    { operation: 'findMany', args: { where: { establishmentId: 'e1', serviceId: 's1' }, include: incFiltre } },
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
  for (const [champ, relation] of Object.entries(MODEL_RELATIONS[modele] ?? {})) {
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

    for (const racine of Object.keys(MODEL_RELATIONS)) {
      for (const chemin of cheminsDepuis(racine, PROFONDEUR, [])) {
        chaines += 1
        for (const { operation, args } of formes(chemin)) {
          for (const { nom, store } of CONTEXTES) {
            cas += 1
            const a = passe(avant, racine, operation, args, store)
            const b = passe(assertTenantScope, racine, operation, args, store)
            if (a === b) {
              continue
            }
            if (a === false && b === true) {
              perdus.push(`${nom} | ${racine}.${operation} | ${chemin.join('>')}`)
              perdusParContexte.set(nom, (perdusParContexte.get(nom) ?? 0) + 1)
            } else {
              gagnes.set(nom, (gagnes.get(nom) ?? 0) + 1)
            }
          }
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
