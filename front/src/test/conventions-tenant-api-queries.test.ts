import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { describe, expect, it } from 'vitest'

// `front/CLAUDE.md` porte deux conventions decidees a l'etape 2, sur les DEUX memes dossiers
// (`src/api`, `src/queries`) :
//
// 1. « Le contexte est implicite » — le tenant (etablissement/service) n'est jamais un
//    argument d'un module d'API ou d'une requete. Il est lu par `tenantApiUrl()` /
//    `establishmentApiUrl()` (`constants/config.constant.ts`), au moment de l'appel, dans le
//    store — jamais recu, jamais transmis.
// 2. « Query keys deliberately do not carry the tenant » — une `queryKey` ne porte aucun
//    identifiant de tenant ; l'isolation vient d'un `QueryClient` neuf par couple
//    etablissement/service (`hooks/useTenantSwitch.ts`), pas d'un prefixe de cle.
//
// `src/test/layouts-de-tenant.test.ts` ne lit que `src/routes` : il ne voit ni `src/api` ni
// `src/queries`. `src/test/lecture-directe-du-cache.test.ts` balaie bien tout `src`, mais son
// sujet est la restauration de photographie (`getQueryData`/`getQueriesData`), pas ces deux
// conventions-ci — verifie par task-10-review.md, I3 : les deux sabotages ci-dessous le
// laissent vert.
//
// D'ou cette regle, de la meme forme que les deux tests cites (traversee de fichiers, motif de
// lignes, aucune liste a maintenir a la main). Les deux conventions se lisent par LE MEME
// vocabulaire : le seul moyen de faire porter le tenant a un module ou a une cle de requete est
// de nommer l'un de ses deux identifiants (`establishmentId`, `serviceId` — les deux seuls
// champs de tenant que `useAuthStore`/`TenantContext` exposent) ou de le designer par le mot
// `tenant` lui-meme (le sabotage F du relecteur : `getByPatient(patientID, tenant?)`). Une seule
// expression suffit donc aux deux infractions eprouvees par la revue (sabotages A et F) — voir
// plus bas les deux essais qui le prouvent.
//
// CE QUE CETTE REGLE NE PEUT PAS TENIR HONNETEMENT, PAR LECTURE SEULE : un module qui
// construirait une cle de requete a partir de la valeur RENVOYEE par `tenantApiUrl()` (l'URL
// elle-meme, ex. `queryKey: [CLE, tenantApiUrl()]`) sans jamais nommer `establishmentId`,
// `serviceId` ni `tenant`, echapperait au motif d'identifiants ci-dessous. C'est pourquoi une
// seconde expression, plus etroite, verrouille specifiquement les lignes `queryKey`/
// `mutationKey` contre un appel direct a l'une des deux fabriques d'URL — le seul autre vecteur
// de fuite qu'une lecture de source peut nommer sans deviner l'intention de l'auteur.
const IDENTIFIANTS_DE_TENANT = /\b(establishmentId|serviceId|tenant)\b/i
const CLE_AVEC_FABRIQUE_URL = /\b(queryKey|mutationKey)\s*:.*\b(tenantApiUrl|establishmentApiUrl)\s*\(/

// Aucune exception aujourd'hui : ni `src/api` ni `src/queries` n'a besoin de nommer le tenant
// pour respecter les deux conventions (verifie par lecture complete des deux dossiers). Si un
// module legitime en a un jour besoin, il doit etre ajoute ici, avec sa raison et le nombre
// exact d'occurrences attendues — jamais en silence : voir la boucle plus bas, qui echoue si le
// compte declare ne correspond pas au compte reel, dans les deux sens.
const EXCEPTIONS: { fichier: string; raison: string; occurrences: number }[] = []

// Vitest s'execute depuis `front/`, et l'environnement jsdom ne donne pas d'`import.meta.url` de
// schema `file:`.
const DOSSIERS_CONCERNES = [join(process.cwd(), 'src', 'api'), join(process.cwd(), 'src', 'queries')]

const estUnCommentaire = (ligne: string) => ligne.startsWith('//') || ligne.startsWith('*')

const fichiersDeProduction = (dossier: string): string[] =>
  readdirSync(dossier, { withFileTypes: true }).flatMap((entree) => {
    const chemin = join(dossier, entree.name)
    if (entree.isDirectory()) {
      return fichiersDeProduction(chemin)
    }
    if (!/\.tsx?$/.test(entree.name) || /\.test\.tsx?$/.test(entree.name)) {
      return []
    }
    return [chemin]
  })

const racine = join(process.cwd(), 'src')
const relatif = (chemin: string) => relative(racine, chemin).split(sep).join('/')

const lignesUtiles = (chemin: string) =>
  readFileSync(chemin, 'utf8')
    .split('\n')
    .map((ligne, index) => ({ numero: index + 1, texte: ligne.trim() }))
    .filter(({ texte }) => texte.length > 0 && !estUnCommentaire(texte))

const fichiers = DOSSIERS_CONCERNES.flatMap(fichiersDeProduction)

describe('conventions tenant de src/api et src/queries', () => {
  it('aucun module ne prend le tenant en argument, aucune cle de requete ne le porte', () => {
    const infractions = fichiers.flatMap((chemin) => {
      const relatifDuFichier = relatif(chemin)
      return lignesUtiles(chemin)
        .filter(({ texte }) => IDENTIFIANTS_DE_TENANT.test(texte))
        .map(({ numero, texte }) => ({ fichier: relatifDuFichier, ligne: numero, texte }))
    })

    const horsExceptions = infractions.filter(
      (infraction) => !EXCEPTIONS.some((exception) => exception.fichier === infraction.fichier),
    )

    expect(
      horsExceptions,
      "Le tenant (etablissement/service) est implicite dans tout `src/api` et `src/queries` " +
        "(front/CLAUDE.md, § « Le contexte est implicite » et § « Query keys deliberately do " +
        "not carry the tenant ») : ni un module d'API ni un hook de requete ne doit nommer " +
        "`establishmentId`, `serviceId` ou `tenant` — l'URL vient de `tenantApiUrl()`/" +
        '`establishmentApiUrl()` appelees sans argument, jamais d\'un parametre.',
    ).toEqual([])

    for (const exception of EXCEPTIONS) {
      expect(
        infractions.filter((infraction) => infraction.fichier === exception.fichier).length,
        `Nombre d'occurrences attendu dans ${exception.fichier} (${exception.raison}).`,
      ).toBe(exception.occurrences)
    }
  })

  it('aucune cle de requete ne se construit a partir de l URL de tenant elle-meme', () => {
    const infractions = fichiers.flatMap((chemin) => {
      const relatifDuFichier = relatif(chemin)
      return lignesUtiles(chemin)
        .filter(({ texte }) => CLE_AVEC_FABRIQUE_URL.test(texte))
        .map(({ numero, texte }) => ({ fichier: relatifDuFichier, ligne: numero, texte }))
    })

    expect(
      infractions,
      'Une `queryKey`/`mutationKey` ne doit jamais appeler `tenantApiUrl()`/' +
        "`establishmentApiUrl()` : l'isolation vient d'un `QueryClient` neuf par couple " +
        "etablissement/service (`hooks/useTenantSwitch.ts`), pas d'un prefixe de cle.",
    ).toEqual([])
  })
})
