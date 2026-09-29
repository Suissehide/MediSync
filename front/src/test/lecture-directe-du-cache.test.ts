import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { describe, expect, it } from 'vitest'

// Toute la sûreté multi-tenant des restaurations de cache tient à un passage
// obligé : on photographie par `snapshotForTenant`, on repose par
// `restoreForTenant`, qui renonce si le couple établissement/service a changé.
// Le type `TenantSnapshot` ferme les contournements par la photo — la donnée
// est enfermée dans une fermeture, le couple n'est pas falsifiable — mais il
// ne peut rien contre celui-ci, qui est aussi le plus probable : un
// contributeur écrit une nouvelle mutation optimiste, relit le cache par
// `getQueryData`, le repose par `setQueryData`, et rouvre la fuite sans que
// rien ne proteste.
//
// D'où cette règle. Elle est écrite comme un test plutôt que comme une règle
// Biome parce qu'elle a besoin d'une liste d'exceptions de deux appels
// précis, plus l'exemption des fichiers de test : Biome ne sait l'exprimer
// qu'en semant des commentaires de suppression dans les fichiers mêmes qu'elle
// surveille, ce qui disperse l'exception au lieu de la nommer. Ici, les deux
// emplacements autorisés sont écrits en un seul endroit, avec leur raison, et
// la règle tombe dans la même porte que le reste (`npm test`).
const LECTURES_DIRECTES = /\.getQueryData\b|\.getQueriesData\b/

// Les deux seules lectures directes légitimes du front.
const AUTORISEES = [
  {
    fichier: 'hooks/useTenantSwitch.ts',
    // C'est LA photographie : le point d'entrée unique du mécanisme. Sans
    // cette lecture, il n'y a pas de photo à reposer.
    raison: 'corps de snapshotForTenant',
    appels: 1,
  },
  {
    fichier: 'queries/useSlot.ts',
    // Les créneaux sont cachés par fenêtre : cet appel énumère les clés
    // chargées (`.map(([queryKey]) => queryKey)`) et les passe à
    // `snapshotForTenant`. Il ne lit aucune donnée et n'en repose aucune.
    raison: 'enumeration des cles des fenetres de creneaux',
    appels: 1,
  },
]

// Vitest s'execute depuis `front/`, et l'environnement jsdom ne donne pas
// d'`import.meta.url` de schema `file:`.
const racine = join(process.cwd(), 'src')

const fichiersDeProduction = (dossier: string): string[] =>
  readdirSync(dossier, { withFileTypes: true }).flatMap((entree) => {
    const chemin = join(dossier, entree.name)
    if (entree.isDirectory()) {
      return fichiersDeProduction(chemin)
    }
    if (!/\.tsx?$/.test(entree.name)) {
      return []
    }
    // Les tests lisent le cache pour affirmer sur son contenu : c'est leur
    // travail, et ils ne reposent rien dans l'application.
    if (
      /\.test\.tsx?$/.test(entree.name) ||
      entree.name === 'routeTree.gen.ts'
    ) {
      return []
    }
    return [chemin]
  })

describe('lecture directe du cache de requetes', () => {
  it('n existe qu aux deux emplacements autorises', () => {
    const trouvees = fichiersDeProduction(racine).flatMap((chemin) => {
      const relatif = relative(racine, chemin).split(sep).join('/')
      return readFileSync(chemin, 'utf8')
        .split('\n')
        .map((ligne, index) => ({
          fichier: relatif,
          ligne: index + 1,
          texte: ligne.trim(),
        }))
        .filter((emplacement) => LECTURES_DIRECTES.test(emplacement.texte))
    })

    const interdites = trouvees.filter(
      (emplacement) =>
        !AUTORISEES.some((permise) => permise.fichier === emplacement.fichier),
    )

    // Le message nomme le remede : passer par le mecanisme, pas relire le
    // cache a la main.
    expect(
      interdites,
      "Lecture directe du cache hors des deux emplacements autorises : photographier par `snapshotForTenant` et reposer par `restoreForTenant`, sans quoi la donnee d'un autre service peut etre reposee apres un changement de contexte.",
    ).toEqual([])

    // L'exception porte sur deux APPELS, pas sur deux fichiers : un second
    // appel ajoute dans un fichier permis doit etre discute, pas herite. Et si
    // une lecture legitime disparait, l'exception doit disparaitre avec elle,
    // sans quoi elle rouvre une porte que plus personne ne surveille.
    for (const permise of AUTORISEES) {
      expect(
        trouvees.filter(
          (emplacement) => emplacement.fichier === permise.fichier,
        ).length,
        `Nombre d appels attendu dans ${permise.fichier} (${permise.raison}).`,
      ).toBe(permise.appels)
    }
  })
})
