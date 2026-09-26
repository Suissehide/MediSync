import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

// Le risque le plus grave de la tache 3 (etape 4a) n'est pas qu'`effectiveMemberships` soit
// fausse, c'est qu'elle soit calculee a deux endroits : `/me` alimente le selecteur du front, la
// resolution de tenant decide de ce qu'une requete a le droit de lire. Si les deux divergent d'un
// cheveu, il existera un acces que l'un accorde et que l'autre refuse — ou l'inverse, ce qui est
// pire.
//
// CE QUE CE FICHIER GARANTIT, DIT SANS EXAGERER (tour de correction 1, tache 3 — la revue a
// montre qu'une version precedente de ce commentaire pretendait plus) : il relit les sources,
// a la maniere de `front/src/test/lecture-directe-du-cache.test.ts`, et surveille deux choses,
// chacune par un NOM :
//
//   A. tout appel a `effectiveMemberships(` — attrape un TROISIEME appelant NOMME, et fait
//      rougir si l'un des deux appelants autorises perd son appel (ou en gagne un second en
//      silence) ;
//   B. tout appel a `.findForUser(` (la lecture du repository) — attrape un appelant qui
//      court-circuiterait `liveGrantsForUser` (accessGrant.domain.ts) et donc son garde
//      superadmin (voir ce fichier : un octroi ne confere rien a qui n'est plus super-admin, et
//      la lecture elle-meme ne doit s'executer que pour ce cas).
//
// CE QU'IL NE GARANTIT PAS : une REIMPLEMENTATION locale qui recalculerait le meme arbre
// d'appartenances (ou relirait le repository via un detour — alias, `.bind`, cle de crochet
// calculee) SANS JAMAIS PRONONCER CES DEUX NOMS echapperait entierement a ce test. Fermer ce
// reste exigerait soit une analyse de flux de donnees complete, soit une instrumentation a
// l'execution (intercepter reellement les fonctions exportees) — un chantier a part, hors de ce
// qu'une lecture statique des sources peut honnetement garantir (meme limite, deja actee, que
// `runAsSystem-unicite.test.ts`, fin de fichier).
const APPEL_EFFECTIVE_MEMBERSHIPS = /effectiveMemberships\(/
const APPEL_FIND_FOR_USER = /\.findForUser\(/

// Les deux seuls appelants legitimes d'`effectiveMemberships`. Chaque entree porte un nombre
// D'APPELS, pas un nombre de fichiers : un second appel ajoute dans un fichier deja permis doit
// etre discute, pas herite silencieusement.
const AUTORISES_EFFECTIVE_MEMBERSHIPS = [
  {
    fichier: 'utils/me-mapper.ts',
    raison: 'toMeResponse — alimente le selecteur d etablissement/service du front',
    appels: 1,
  },
  {
    fichier: 'interfaces/http/fastify/plugins/tenant.plugin.ts',
    raison: 'resolveTenantFromUser — decide ce qu une requete a le droit de lire',
    appels: 1,
  },
]

// Seul appelant legitime de `AccessGrantRepositoryInterface.findForUser` : `liveGrantsForUser`,
// qui n'invoque la lecture que pour un compte encore super-admin (voir accessGrant.domain.ts).
// Tout autre appel contournerait ce garde.
const AUTORISES_FIND_FOR_USER = [
  {
    fichier: 'domain/accessGrant.domain.ts',
    raison: 'liveGrantsForUser — seul point qui decide QUAND lire, et donc quand entrer le contexte superadmin',
    appels: 1,
  },
]

// Fichiers qui DEFINISSENT les fonctions surveillees : `export const effectiveMemberships = (...)`
// et `export const liveGrantsForUser = (...) => user.isSuperAdmin ? accessGrantRepository.findForUser(...)`.
// Une DEFINITION n'est pas un APPEL (`effectiveMemberships =` porte un `=` que la regex d'appel
// ne matche jamais), mais la ligne `accessGrantRepository.findForUser(user.id)` a l'INTERIEUR de
// `liveGrantsForUser` EST un appel — c'est l'appel legitime, deja compte dans
// `AUTORISES_FIND_FOR_USER` ci-dessus. Rien a exclure ici pour ce volet, donc.
const FICHIER_DEFINITION = 'domain/accessGrant.domain.ts'

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

const appelsTrouves = (
  motif: RegExp,
  exclureDefinition: boolean,
): { fichier: string; ligne: number }[] =>
  fichiersDeProduction(RACINE).flatMap((chemin) => {
    const relatif = relative(RACINE, chemin).split(sep).join('/')
    if (exclureDefinition && relatif === FICHIER_DEFINITION) {
      return []
    }
    return readFileSync(chemin, 'utf8')
      .split('\n')
      .map((ligne, index) => ({ fichier: relatif, ligne: index + 1, texte: ligne }))
      .filter((emplacement) => motif.test(emplacement.texte))
      .map(({ fichier, ligne }) => ({ fichier, ligne }))
  })

const verifieUnicite = (
  trouvees: { fichier: string; ligne: number }[],
  autorises: { fichier: string; appels: number }[],
): void => {
  const interdits = trouvees.filter(
    (emplacement) => !autorises.some((permis) => permis.fichier === emplacement.fichier),
  )
  // Sens 1 : un appelant supplementaire, non nomme dans la liste, doit faire rougir ce test.
  expect(interdits).toEqual([])
  // Sens 2 : un emplacement autorise qui perdrait son appel (ou en gagnerait un second en
  // silence) doit rougir aussi, sans quoi la liste pourrit au premier refactor.
  for (const permis of autorises) {
    expect(
      trouvees.filter((emplacement) => emplacement.fichier === permis.fichier).length,
    ).toBe(permis.appels)
  }
}

describe('unicite des appelants nommes d effectiveMemberships et de findForUser', () => {
  it('effectiveMemberships n est appelee, dans back/src/main, qu aux deux emplacements autorises', () => {
    verifieUnicite(
      appelsTrouves(APPEL_EFFECTIVE_MEMBERSHIPS, true),
      AUTORISES_EFFECTIVE_MEMBERSHIPS,
    )
  })

  it('findForUser n est appelee, dans back/src/main, que par liveGrantsForUser', () => {
    verifieUnicite(appelsTrouves(APPEL_FIND_FOR_USER, false), AUTORISES_FIND_FOR_USER)
  })
})
