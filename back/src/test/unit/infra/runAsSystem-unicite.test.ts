import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

import ts from 'typescript'

// `runAsSystem` (utils/tenant-context.ts) retire l'exigence du garde-fou d'ORM plutot que de la
// deplacer : sous ce mode, une requete peut lire N'IMPORTE QUEL etablissement et service, le
// garde-fou ne verifiant plus rien (voir infra/orm/tenant-guard.ts, `assertTenantScope`,
// `if (store.kind === 'system') { return }`). C'est une exception assumee au cloisonnement
// multi-tenant, deux fois seulement dans tout le back de production :
//
//   1. La purge planifiee du journal d'activite (`application/starter.ts`,
//      `scheduleActivityLogCleanup`) : hors de toute requete HTTP, il n'existe alors aucun
//      tenant a poser, et la purge doit toucher TOUTE la table, pas un seul etablissement.
//   2. Le signal de suivi ailleurs (`infra/orm/repositories/patientServiceFile.repository.ts`,
//      `estSuiviAilleurs`, design §5.3) : LA SEULE lecture de tout le chantier qui traverse
//      volontairement la frontiere entre services, pour rendre un booleen et rien d'autre.
//
// `runAsSuperAdmin` (meme fichier, tache 1 / etape 4a) y ajoute un troisieme mode, qui ne retire
// rien mais substitue au filtre de tenant une liste declaree et exhaustive de couples (modele,
// operation) — SUPERADMIN_OPERATIONS, infra/orm/tenant-guard.ts.
//
// Une exception a une regle de cloisonnement ne vaut que si elle reste la seule — spec §5.3 :
// "cela se verifie par un test, pas par une relecture." Ce test relit les sources plutot que de
// faire confiance a la memoire, a la maniere de
// `front/src/test/lecture-directe-du-cache.test.ts`.
//
// REVUE tache 7, tour 1, constat Critique C1 : une garde qui ne surveille que le NOM
// `runAsSystem` se contourne par trois idiomes ordinaires qu'un simple extract-variable ou un
// espace produisent sans y penser — `const f = ctx.runAsSystem.bind(ctx)`, `.runAsSystem (fn)`
// (espace avant la parenthese), et, le plus grave, une SECONDE methode qui entre en mode
// systeme sans jamais prononcer le nom `runAsSystem` : `uneAutreMethode(fn) { return
// this.storage.run({ kind: 'system' }, fn) }`. La revue a prouve par execution que cette
// derniere forme desactive reellement le garde-fou (un `findMany` sans aucun filtre de tenant
// passe sous elle). Ce fichier surveille donc deux choses, pas une :
//
//   A. tout ce qui REFERENCE la methode `runAsSystem` (au-dela du seul appel direct — voir
//      APPEL_RUN_AS_SYSTEM ci-dessous) ;
//   B. tout ce qui INVOQUE la capacite d'entrer en mode non-tenant (system OU superadmin) —
//      REECRIT au tour de correction 1 de la tache 1, voir le commentaire d'appelsDeuxArguments
//      plus bas pour le pourquoi.
//
// Volet A : reference a `runAsSystem`, sous forme d'ACCES A LA PROPRIETE plutot que du seul
// appel `.runAsSystem(`. `\b` (limite de mot) ferme la forme sur `.bind` (V2) et sur l'espace
// avant la parenthese (V5) sans exiger l'appel immediat ; le point exige en tete exclut la
// declaration de la methode elle-meme (`runAsSystem<T>(fn...) {`, ligne qui ne porte aucun point
// avant le nom) et l'entree d'interface (`runAsSystem<T>(fn...): Promise<T>` dans
// types/utils/tenant-context.ts, meme raison).
const APPEL_RUN_AS_SYSTEM = /\.runAsSystem\b/

// Les deux seuls emplois legitimes du back de production, pour le volet A. Chaque entree porte
// un nombre D'APPELS, pas un nombre de fichiers : un second appel ajoute dans un fichier deja
// permis doit etre discute, pas herite silencieusement.
const AUTORISES = [
  {
    fichier: 'application/starter.ts',
    raison: 'purge planifiee du journal d activite, hors de toute requete',
    appels: 1,
  },
  {
    fichier: 'infra/orm/repositories/patientServiceFile.repository.ts',
    raison: 'estSuiviAilleurs — le signal de suivi ailleurs',
    appels: 1,
  },
]

// Seul fichier ou le volet B a le droit de trouver un appel : celui qui DEFINIT `runAsSystem` et
// `runAsSuperAdmin`, et qui est donc, par construction, le seul endroit legitime d'ou peut naitre
// un mode non-tenant.
const SEUL_CONSTRUCTEUR_LEGITIME = 'utils/tenant-context.ts'

// Jest tourne via @swc/jest en module CommonJS (jest.config.ts) : __dirname est disponible.
const RACINE = join(__dirname, '../../../main')

const fichiersDeProduction = (dossier: string): string[] =>
  readdirSync(dossier, { withFileTypes: true }).flatMap((entree) => {
    const chemin = join(dossier, entree.name)
    if (entree.isDirectory()) {
      return fichiersDeProduction(chemin)
    }
    if (!/\.ts$/.test(entree.name)) {
      return []
    }
    return [chemin]
  })

const lignesCorrespondantes = (racine: string, motif: RegExp) =>
  fichiersDeProduction(racine).flatMap((chemin) => {
    const relatif = relative(racine, chemin).split(sep).join('/')
    return readFileSync(chemin, 'utf8')
      .split('\n')
      .map((ligne, index) => ({ fichier: relatif, ligne: index + 1, texte: ligne.trim() }))
      .filter((emplacement) => motif.test(emplacement.texte))
  })

// TOUR DE CORRECTION 1 (tache 1) — Critique 2 de la revue : l'ancien volet B cherchait la VALEUR
// `{ kind: 'system' }` / `{ kind: 'superadmin' }` comme une chaine de caracteres, ligne par
// ligne. Sur sept sabotages soumis a l'epreuve, cinq passaient a travers : gabarit
// (`` `system` `` plutot que `'system'`), litteral etale sur plusieurs lignes, virgule finale
// avant l'accolade, etalement (`{ ...marqueurExistant }`) et constante intermediaire construite
// hors du litteral inline. Les trois premiers ne sont que des artefacts du DECOUPAGE PAR LIGNE
// (une regex qui ne regarde qu'une ligne a la fois ne peut pas voir un litteral qui en occupe
// trois, ni tolerer une virgule ou un guillemet different) ; les deux derniers sont plus profonds
// : ils deguisent la VALEUR sans jamais re-ecrire `{ kind: 'system' }` nulle part ailleurs que
// dans le fichier legitime — aucun scan de texte, aussi soigneusement ecrit soit-il, ne peut
// distinguer un `{ ...x }` legitime d'un `{ ...x }` qui propage la capacite ailleurs.
//
// Ce que ces cinq sabotages ont EN COMMUN, et qui ne change JAMAIS quelle que soit la facon dont
// la valeur est ecrite : aucun n'a d'effet sans un appel a DEUX arguments a une methode nommee
// `run` (la signature de `AsyncLocalStorage#run(store, callback)`). C'est ce geste — pas la
// forme du premier argument — qui fait que `tenantContext.peek()` lira ensuite `{ kind: 'system'
// }` ou `{ kind: 'superadmin' }` pendant toute la portee du rappel. Le volet B surveille donc
// desormais CE geste : tout appel a deux arguments a une methode `.run(` (ou `['run'](`, meme
// forme via un acces par crochet a nom litteral — la revue avait cite l'etalement comme un
// contournement, et un acces dynamique par crochet en est un cousin direct), analyse comme du
// CODE (l'AST TypeScript, via le compilateur deja present dans ce depot pour `tsc`) plutot que
// comme du texte ligne par ligne. Analyser l'AST ferme au passage le multi-ligne et la virgule
// finale (des artefacts du decoupage par ligne, pas des idiomes distincts) ; ne plus regarder la
// VALEUR du premier argument ferme l'etalement et la constante intermediaire, puisque ni l'un ni
// l'autre ne change la FORME de l'appel lui-meme.
//
// CE QUE CE VOLET NE COUVRE TOUJOURS PAS, dit honnetement plutot que par une expression qui
// ferait semblant de le couvrir : un appel invoque par
// une forme qui n'est ni `.run(` ni `['run'](` avec un nom litteral — `.call`/`.apply`/
// `Reflect.apply`, une cle de crochet CALCULEE (`storage[unNomVariable](...)`), ou tout autre
// detour qui ne prononce jamais litteralement le nom `run` a l'endroit de l'appel. Fermer ce
// reste exigerait soit une analyse de flux de donnees complete (savoir que `unNomVariable` vaut
// `'run'` a l'execution), soit une instrumentation a l'execution (intercepter reellement
// `AsyncLocalStorage.prototype.run`) plutot qu'une lecture statique des sources — un chantier a
// part, hors de ce qu'un test de conformite des sources peut honnetement garantir. C'est aussi,
// plus fondamentalement, une limite du langage plutot que de ce test : le champ `storage` de
// `TenantContext` est marque `private`, mais `private` en TypeScript s'efface entierement a la
// compilation — a l'execution, n'importe quel code qui detient une reference vers l'instance
// injectee de `tenantContext` (et elle est injectee presque partout via le conteneur Awilix) peut
// lire `(tenantContext as any).storage` et l'invoquer directement, sans qu'aucune analyse de
// SOURCE ne puisse s'y opposer — une vraie frontiere exigerait une encapsulation qui survit a
// l'execution (`#champPrive` ou `WeakMap`), pas seulement au typage.
const appelsDeuxArguments = (racine: string): { fichier: string; ligne: number }[] =>
  fichiersDeProduction(racine).flatMap((chemin) => {
    const relatif = relative(racine, chemin).split(sep).join('/')
    const texte = readFileSync(chemin, 'utf8')
    const source = ts.createSourceFile(chemin, texte, ts.ScriptTarget.Latest, true)
    const trouvailles: { fichier: string; ligne: number }[] = []

    const nommeRun = (expression: ts.Expression): boolean => {
      if (ts.isPropertyAccessExpression(expression)) {
        return expression.name.text === 'run'
      }
      if (ts.isElementAccessExpression(expression)) {
        const cle = expression.argumentExpression
        return ts.isStringLiteralLike(cle) && cle.text === 'run'
      }
      return false
    }

    const visiter = (noeud: ts.Node): void => {
      if (ts.isCallExpression(noeud) && nommeRun(noeud.expression) && noeud.arguments.length === 2) {
        const { line } = source.getLineAndCharacterOfPosition(noeud.getStart(source))
        trouvailles.push({ fichier: relatif, ligne: line + 1 })
      }
      ts.forEachChild(noeud, visiter)
    }
    visiter(source)
    return trouvailles
  })

describe('unicite de l exception runAsSystem au cloisonnement multi-tenant', () => {
  it('n apparait, dans back/src/main, qu aux deux emplacements autorises (volet A : le nom, et ses detours)', () => {
    const trouvees = lignesCorrespondantes(RACINE, APPEL_RUN_AS_SYSTEM)

    const interdits = trouvees.filter(
      (emplacement) => !AUTORISES.some((permis) => permis.fichier === emplacement.fichier),
    )

    // Sens 1 : un emploi ajoute ailleurs doit faire rougir ce test. runAsSystem() hors des deux
    // emplacements autorises : cette exception au cloisonnement multi-tenant doit rester unique
    // et declaree (design §5.3, back/CLAUDE.md). Le tableau (vide s'il n'y a rien d'interdit)
    // s'affiche dans le diff Jest en cas d'echec : chaque entree porte deja fichier et ligne.
    expect(interdits).toEqual([])

    // Sens 2 : un emplacement autorise retire de la liste alors qu il est toujours employe (ou
    // dont le nombre d appels a change en silence) doit faire rougir aussi, sans quoi la liste
    // pourrit au premier refactor. `permis.raison` documente pourquoi l'emplacement est permis ;
    // si ce compte tombe a zero ou change, c'est ce commentaire qu'il faut relire.
    for (const permis of AUTORISES) {
      expect(
        trouvees.filter((emplacement) => emplacement.fichier === permis.fichier).length,
      ).toBe(permis.appels)
    }
  })

  it('n invoque la capacite d entrer en mode non-tenant qu au seul endroit legitime (volet B, reecrit : la capacite, pas la forme de la valeur)', () => {
    const appels = appelsDeuxArguments(RACINE)

    // Trois appels legitimes dans tout src/main, tous dans utils/tenant-context.ts : `run` pour
    // `enter`/`run` (tenant), pour `runAsSystem`, et pour `runAsSuperAdmin`. Un quatrieme appel
    // — ou un appel deplace hors de ce fichier — pousse ce compte au-dela de 3 et fait rougir
    // cette assertion, quelle que soit la facon dont son premier argument est ecrit (litteral,
    // gabarit, multi-ligne, virgule finale, etalement, constante importee : aucun ne change la
    // forme de CET appel, voir le commentaire d'appelsDeuxArguments ci-dessus).
    expect(appels).toHaveLength(3)
    for (const appel of appels) {
      expect(appel.fichier).toBe(SEUL_CONSTRUCTEUR_LEGITIME)
    }
  })
})

// Ce que ces deux volets NE couvrent PAS, dit honnetement plutot que par une expression qui
// ferait semblant de le couvrir (revue tache 7, tour 1 ; complete au tour de correction 1 de la
// tache 1 — voir le commentaire d'appelsDeuxArguments pour le detail du second volet) : un appel
// a `runAsSystem`/`runAsSuperAdmin`, ou une invocation directe de `.run(`, depuis
// `back/src/test` (par exemple un test qui fabriquerait un contexte systeme ou superadmin de
// toutes pieces). `RACINE` ne lit que `src/main` — le code de production livre — jamais
// `src/test`. Ce n'est pas un oubli : les tests unitaires legitimes de ce depot construisent deja
// `{ kind: 'system' }` et `{ kind: 'superadmin' }` directement (repository-scope.test.ts,
// tenant-context.test.ts, tenant-guard.test.ts) pour eprouver le garde-fou lui-meme, si bien
// qu'etendre ce scan a `src/test` exigerait une liste d'autorisation separee pour les tests — un
// chantier a part, hors du remede demande ici, et qui recoupe la meme limite deja actee pour la
// porte de typage (`npm run build` ne type pas `src/test` non plus : voir tache 7, revue, mineur
// m4). Un `runAsSystem`, un `runAsSuperAdmin` ou un appel `.run(` ecrit dans un fichier de test
// n'active d'ailleurs rien en production : il ne peut agir que sur l'execution de ce test-la.
