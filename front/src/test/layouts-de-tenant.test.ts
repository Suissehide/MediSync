import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { describe, expect, it } from 'vitest'

// Le cloisonnement du cache tient en deux moities indissociables : un
// `QueryClient` neuf par couple etablissement/service
// (`hooks/useTenantSwitch.ts`), et le DEMONTAGE des ecrans au changement de
// couple, qui n'arrive que parce que les layouts de tenant declarent
// `remountDeps: ({ params }) => params`. Sans la seconde, React Query garde
// l'observateur lie a l'ancien client — il le lie a la construction et ne le
// relie jamais — et l'ecran continue d'afficher le service precedent sous
// l'URL du nouveau, sans meme emettre de requete puisque les cles ne portent
// pas le tenant (D2).
//
// `routes/_authenticated/e/$establishmentId/remontage.test.tsx` verrouille
// cette propriete pour les DEUX layouts qui existent. Il ne peut rien dire
// d'un TROISIEME : un layout ajoute sans `remountDeps` serait silencieux, et
// le defaut ne se verrait qu'en comparant deux services a l'oeil.
//
// D'ou cette regle, de la meme forme que `lecture-directe-du-cache.test.ts`
// et pour la meme raison — elle a besoin d'une definition, non d'un motif
// syntaxique isole, et Biome ne sait pas l'exprimer. La definition d'un
// layout de tenant est : un fichier de route qui POSE le contexte
// (`setContext`). L'ensemble de ces fichiers doit etre exactement celui qui
// declare `remountDeps`. Aucune liste a tenir : les deux ensembles se
// derivent du code et doivent coincider.
//
// Les deux sens comptent. Un fichier qui pose le contexte sans declarer la
// dependance est le trou que cette regle existe pour fermer. Un fichier qui
// declare la dependance sans poser de contexte n'est pas un layout de
// tenant : il impose un remontage a des ecrans qui n'en ont pas besoin
// (c'est la raison pour laquelle la dependance n'est pas posee en
// `defaultRemountDeps` global), et sa presence ici signale soit un
// copier-coller, soit un layout dont le `setContext` a disparu — auquel cas
// la premiere moitie du mecanisme ne s'arme plus.

// Une ligne de commentaire ne declare rien : `$serviceId.tsx` cite
// `remountDeps` dans le long commentaire qui le justifie, et il ne doit pas
// etre compte deux fois ni, surtout, faire passer un fichier pour conforme
// parce qu'il en PARLE.
const estUnCommentaire = (ligne: string) =>
  ligne.startsWith('//') || ligne.startsWith('*')

// `remountDeps:` en position de propriete d'objet, pas dans une phrase. Pas
// ancre en debut de ligne : l'option peut etre ecrite sur la meme ligne que
// l'ouverture des options, et l'ancre laisserait alors passer un layout
// pourtant conforme — puis accuserait a tort le fichier d'oubli.
const DECLARE_REMOUNT_DEPS = /remountDeps\s*:/
// L'APPEL a `setContext`, quelle que soit la facon dont il a ete atteint. Une
// frontiere de mot, et surtout pas le point : `const { setContext } =
// useAuthStore.getState()` puis `setContext(tenant)` pose bel et bien le
// contexte, et un motif exigeant `.setContext(` laissait ce fichier-la passer
// au vert sans dependance de remontage — precisement le trou que ce test
// existe pour fermer. La frontiere de mot ne peut pas confondre avec un
// `resetContext`/`unsetContext` (pas de frontiere entre deux caracteres de
// mot), et ne produit aucun faux positif sur le depot : les deux seules
// occurrences hors commentaire sont les deux layouts.
const POSE_LE_CONTEXTE = /\bsetContext\s*\(/

// Vitest s'execute depuis `front/`, et l'environnement jsdom ne donne pas
// d'`import.meta.url` de schema `file:`.
const racineDesRoutes = join(process.cwd(), 'src', 'routes')

// Le routage est base sur les fichiers : un layout de tenant ne peut vivre
// que la-dessous. Les `.test.ts(x)` colocalises sont exclus du generateur de
// routes (`routeFileIgnorePattern`) et ne sont donc pas des routes — et ils
// montent justement les vraies options des deux layouts, ce qui les ferait
// compter a tort.
const fichiersDeRoute = (dossier: string): string[] =>
  readdirSync(dossier, { withFileTypes: true }).flatMap((entree) => {
    const chemin = join(dossier, entree.name)
    if (entree.isDirectory()) {
      return fichiersDeRoute(chemin)
    }
    if (!/\.tsx?$/.test(entree.name) || /\.test\.tsx?$/.test(entree.name)) {
      return []
    }
    return [chemin]
  })

const lignesUtiles = (chemin: string): string[] =>
  readFileSync(chemin, 'utf8')
    .split('\n')
    .map((ligne) => ligne.trim())
    .filter((ligne) => !estUnCommentaire(ligne))

const relatif = (chemin: string) =>
  relative(racineDesRoutes, chemin).split(sep).join('/')

const { posentLeContexte, declarentRemountDeps } = fichiersDeRoute(
  racineDesRoutes,
).reduce(
  (acc, chemin) => {
    const lignes = lignesUtiles(chemin)
    if (lignes.some((ligne) => POSE_LE_CONTEXTE.test(ligne))) {
      acc.posentLeContexte.push(relatif(chemin))
    }
    if (lignes.some((ligne) => DECLARE_REMOUNT_DEPS.test(ligne))) {
      acc.declarentRemountDeps.push(relatif(chemin))
    }
    return acc
  },
  { posentLeContexte: [] as string[], declarentRemountDeps: [] as string[] },
)

describe('layouts de tenant', () => {
  it('sont bien reconnus — garde-fou du garde-fou', () => {
    // Si le releve cessait de reconnaitre quoi que ce soit, les deux
    // ensembles seraient vides et l'egalite ci-dessous deviendrait vraie sur
    // du neant. On exige donc d'y retrouver les deux layouts connus — sans
    // exiger qu'il n'y en ait que deux : un troisieme layout legitime doit
    // avoir a prouver sa conformite, pas a corriger cette liste.
    expect(posentLeContexte).toEqual(
      expect.arrayContaining([
        '_authenticated/e/$establishmentId/admin.tsx',
        '_authenticated/e/$establishmentId/s/$serviceId.tsx',
      ]),
    )
  })

  it('declarent tous remountDeps, et eux seuls', () => {
    expect(
      declarentRemountDeps.sort(),
      "Un layout de tenant est un fichier de route qui appelle `setContext` : il DOIT declarer `remountDeps: ({ params }) => params`, faute de quoi le changement de couple re-rend au lieu de remonter et les ecrans gardent l'observateur de l'ancien client de requetes — donc la donnee du service precedent. Et un fichier de route qui declare `remountDeps` sans poser de contexte n'est pas un layout de tenant : il impose un remontage inutile, ou a perdu son `setContext`.",
    ).toEqual(posentLeContexte.sort())
  })
})
