import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

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
//   B. tout ce qui CONSTRUIT la valeur `{ kind: 'system' }` elle-meme, quel que soit le nom de
//      la methode qui l'enveloppe — c'est CA, et non le nom `runAsSystem`, qui fait effectivement
//      entrer le contexte en mode systeme aux yeux du garde-fou (tenant-guard.ts:567).
//
// Le second volet est celui qui tient la propriete que la spec demande : meme si quelqu'un
// renomme, enveloppe ou indirecte `runAsSystem` sous un nom que le volet A ne reconnaitrait pas,
// il ne peut pas fabriquer le mode systeme sans ecrire cette construction — et elle est comptee
// ici, une fois, au seul endroit legitime.
//
// Volet A : reference a `runAsSystem`, sous forme d'ACCES A LA PROPRIETE plutot que du seul
// appel `.runAsSystem(`. `\b` (limite de mot) ferme la forme sur `.bind` (V2) et sur l'espace
// avant la parenthese (V5) sans exiger l'appel immediat ; le point exige en tete exclut la
// declaration de la methode elle-meme (`runAsSystem<T>(fn...) {`, ligne qui ne porte aucun point
// avant le nom) et l'entree d'interface (`runAsSystem<T>(fn...): Promise<T>` dans
// types/utils/tenant-context.ts, meme raison).
const APPEL_RUN_AS_SYSTEM = /\.runAsSystem\b/

// Volet B : construction de la valeur `{ kind: 'system' }` (avec ou sans espaces, guillemets
// simples ou doubles) — PAS sa lecture (`store.kind === 'system'`, dans tenant-guard.ts, ne
// matche pas : il n'y a pas de `:` entre `kind` et `'system'`). C'est la forme que prend, dans le
// code source, l'entree en mode systeme quel que soit le nom de la methode qui l'appelle.
const CONSTRUCTION_MODE_SYSTEME = /\{\s*kind\s*:\s*['"]system['"]\s*\}/

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

// Seul fichier ou le volet B a le droit de trouver une construction : celui qui DEFINIT
// `runAsSystem` et qui est donc, par construction, le seul endroit legitime d'ou peut naitre la
// valeur `{ kind: 'system' }`.
const SEUL_CONSTRUCTEUR_LEGITIME = 'utils/tenant-context.ts'

// `types/utils/tenant-context.ts` declare le TYPE `TenantStore = { kind: 'tenant'; ... } | {
// kind: 'system' }` : la meme sous-chaine y apparait textuellement, mais a titre de membre
// d'union TypeScript, jamais construite comme valeur executee. Un fichier de declaration de type
// pur ne peut, par construction, faire entrer aucun contexte en mode systeme — il est donc exclu
// du volet B plutot que de tenter de distinguer par regex un litteral de type d'un litteral de
// valeur (les deux s'ecrivent `{ kind: 'system' }`).
const FICHIER_DECLARATION_TYPE = 'types/utils/tenant-context.ts'

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

  it('ne construit la valeur { kind: "system" } qu au seul endroit legitime (volet B : la capacite, pas le nom)', () => {
    const constructions = lignesCorrespondantes(RACINE, CONSTRUCTION_MODE_SYSTEME).filter(
      (emplacement) => emplacement.fichier !== FICHIER_DECLARATION_TYPE,
    )

    // Une seule construction dans tout src/main (hors declaration de type), et elle doit vivre
    // dans le fichier qui possede `runAsSystem`. Une deuxieme construction — meme enveloppee sous
    // un autre nom de methode, meme ajoutee dans ce meme fichier a cote de `runAsSystem` — pousse
    // ce compte a deux et fait rougir cette assertion, quel que soit le nom choisi pour
    // l'atteindre : c'est la propriete que le volet A, qui ne lit qu'un nom, ne peut pas garder
    // seul (constat C1 de la revue de cette tache).
    expect(constructions).toHaveLength(1)
    expect(constructions[0]?.fichier).toBe(SEUL_CONSTRUCTEUR_LEGITIME)
  })
})

// Ce que ces deux volets NE couvrent PAS, dit honnetement plutot que par une expression qui
// ferait semblant de le couvrir (revue tache 7, tour 1) : un appel a `runAsSystem` depuis
// `back/src/test` (par exemple un test qui invoquerait `tenantContext.runAsSystem(...)` pour
// fabriquer un contexte systeme de toutes pieces). `RACINE` ne lit que `src/main` — le code de
// production livre — jamais `src/test`. Ce n'est pas un oubli : les tests unitaires legitimes de
// ce depot construisent deja `{ kind: 'system' }` directement (repository-scope.test.ts,
// tenant-context.test.ts, tenant-guard.test.ts) et appellent `runAsSystem` pour eprouver le
// garde-fou lui-meme, si bien qu'etendre ce scan a `src/test` exigerait une liste d'autorisation
// separee pour les tests — un chantier a part, hors du remede demande ici, et qui recoupe la
// meme limite deja actee pour la porte de typage (`npm run build` ne type pas `src/test` non
// plus : voir tache 7, revue, mineur m4). Un `runAsSystem` ou un `{ kind: 'system' }` ecrit dans un
// fichier de test n'active d'ailleurs rien en production : il ne peut agir que sur l'execution de
// ce test-la.
