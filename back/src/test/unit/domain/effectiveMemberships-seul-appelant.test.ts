import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

// Le risque le plus grave de la tache 3 (etape 4a) n'est pas qu'`effectiveMemberships` soit
// fausse, c'est qu'elle soit calculee a deux endroits : `/me` alimente le selecteur du front, la
// resolution de tenant decide de ce qu'une requete a le droit de lire. Si les deux divergent d'un
// cheveu, il existera un acces que l'un accorde et que l'autre refuse — ou l'inverse, ce qui est
// pire.
//
// Ce test relit les sources plutot que de faire confiance a la memoire, a la maniere de
// `front/src/test/lecture-directe-du-cache.test.ts` : il compte les APPELS a
// `effectiveMemberships(` dans `back/src/main` et exige qu'ils ne vivent qu'aux deux
// emplacements autorises, un chacun. Un troisieme appel — ou une reimplementation locale qui
// recalculerait le meme arbre sans jamais nommer la fonction — doit faire rougir ce test.
// La definition elle-meme (`export const effectiveMemberships = (...) => {`) ne matche jamais
// cette regex : un `=` s'intercale toujours entre le nom et la parenthese d'appel — verifie en
// plus par `FICHIER_DEFINITION` plus bas, exclu explicitement plutot que de compter sur cette
// seule propriete de la regex.
const APPEL_EFFECTIVE_MEMBERSHIPS = /effectiveMemberships\(/

// Les deux seuls appelants legitimes. Chaque entree porte un nombre D'APPELS, pas un nombre de
// fichiers : un second appel ajoute dans un fichier deja permis doit etre discute, pas herite
// silencieusement.
const AUTORISES = [
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

// Fichier qui DEFINIT la fonction : `export const effectiveMemberships = (...) => {`. Ce n'est
// pas un appel (pas de parenthese immediatement apres le nom, un `=` s'intercale), mais il est
// exclu explicitement plutot que de compter sur la seule forme de la regex pour le distinguer.
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

const appelsTrouves = (): { fichier: string; ligne: number }[] =>
  fichiersDeProduction(RACINE).flatMap((chemin) => {
    const relatif = relative(RACINE, chemin).split(sep).join('/')
    if (relatif === FICHIER_DEFINITION) {
      return []
    }
    return readFileSync(chemin, 'utf8')
      .split('\n')
      .map((ligne, index) => ({ fichier: relatif, ligne: index + 1, texte: ligne }))
      .filter((emplacement) => APPEL_EFFECTIVE_MEMBERSHIPS.test(emplacement.texte))
      .map(({ fichier, ligne }) => ({ fichier, ligne }))
  })

describe('unicite de l appelant d effectiveMemberships', () => {
  it('n est appelee, dans back/src/main, qu aux deux emplacements autorises', () => {
    const trouvees = appelsTrouves()

    const interdits = trouvees.filter(
      (emplacement) => !AUTORISES.some((permis) => permis.fichier === emplacement.fichier),
    )

    // Sens 1 : un troisieme appelant doit faire rougir ce test.
    expect(interdits).toEqual([])

    // Sens 2 : un emplacement autorise qui perdrait son appel (ou en gagnerait un second en
    // silence) doit rougir aussi, sans quoi la liste pourrit au premier refactor.
    for (const permis of AUTORISES) {
      expect(
        trouvees.filter((emplacement) => emplacement.fichier === permis.fichier).length,
      ).toBe(permis.appels)
    }
  })
})
