import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { describe, expect, it } from 'vitest'

// `front/CLAUDE.md` porte deux conventions, sur les DEUX memes dossiers
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
// conventions-ci : les deux sabotages ci-dessous le laissent vert.
//
// D'ou cette regle, de la meme forme que les deux tests cites (traversee de fichiers, motif de
// lignes, aucune liste a maintenir a la main). Les deux conventions se lisent par LE MEME
// vocabulaire : le seul moyen de faire porter le tenant a un module ou a une cle de requete est
// de nommer l'un de ses deux identifiants (`establishmentId`, `serviceId` — les deux seuls
// champs de tenant que `useAuthStore`/`TenantContext` exposent) ou de le designer par le mot
// `tenant` lui-meme (ex. `getByPatient(patientID, tenant?)`). Une seule
// expression suffit donc aux deux infractions possibles — voir
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
const CLE_AVEC_FABRIQUE_URL =
  /\b(queryKey|mutationKey)\s*:.*\b(tenantApiUrl|establishmentApiUrl)\s*\(/

// Le super-admin est HORS DE TOUT TENANT (front/CLAUDE.md, § « Le contexte
// est implicite ») — `GET /super-admin/establishments/:id` prend un identifiant d'etablissement
// comme une DONNEE de son chemin, exactement comme une route prendrait un `patientID`, jamais
// comme un tenant implicite lu dans le store. Les deux fichiers ci-dessous nomment donc
// `establishmentId` en toutes lettres plutot que de chercher un nom qui echappe au motif (ce
// serait faire passer le test sans honorer la convention). Chaque compte a ete verifie par
// lecture ligne a ligne :
//   - `api/superAdmin.api.ts` : 5 occurrences (2 avant la pagination des journaux du 2026-10-01),
//     dans les DEUX methodes qui visent UN etablissement precis plutot que la collection ou une
//     action independante de tout etablissement — `getEstablishment` (le parametre de fonction et
//     l'interpolation dans l'URL) et `getEstablishmentActivityLog` (le champ de l'objet d'entree,
//     sa destructuration et l'interpolation dans l'URL).
//   - `queries/useSuperAdmin.ts` : 6 occurrences (3 avant cette meme date), dans
//     `useSuperAdminEstablishmentQuery` et `useSuperAdminEstablishmentActivityLogQuery` — pour
//     chacune : le parametre du hook, la cle de requete et l'appel a l'API. La cle de requete
//     porte l'identifiant pour la MEME raison qu'une fiche patient porte `patientID` dans la
//     sienne (identite de la ressource demandee), pas pour cloisonner un cache par tenant : ces
//     ecrans vivent tous sous un seul et meme `QueryClient`, jamais sous un layout de tenant.
const EXCEPTIONS: { fichier: string; raison: string; occurrences: number }[] = [
  {
    fichier: 'api/superAdmin.api.ts',
    raison:
      'le super-admin designe un etablissement comme une DONNEE de GET /super-admin/establishments/:id ' +
      'et de GET /super-admin/establishments/:id/activity-log (journal pagine, 2026-10-01), ' +
      'pas comme un tenant implicite',
    occurrences: 5,
  },
  {
    fichier: 'queries/useSuperAdmin.ts',
    raison:
      'meme donnee que ci-dessus, plus la cle de requete qui identifie la ressource demandee ' +
      '(comme PATIENT.GET_BY_ID le fait de patientID), sans lien avec le cloisonnement par tenant ' +
      '-- deux hooks depuis la pagination du journal (2026-10-01), trois occurrences chacun',
    occurrences: 6,
  },
  {
    fichier: 'api/superAdminAccessLog.api.ts',
    raison:
      'meme raisonnement que superAdmin.api.ts#getEstablishment : `establishmentId` est un FILTRE ' +
      'optionnel de GET /super-admin/access-log, une DONNEE de la requete (etablissement/compte/action), ' +
      'jamais un tenant implicite -- ces ecrans vivent hors de tout layout de tenant',
    occurrences: 2,
  },
  {
    fichier: 'api/activityLog.api.ts',
    raison:
      'navigation par echelle (2026-09-28) : `serviceId` est un FILTRE optionnel du journal ' +
      "d'activite de l'administration d'etablissement (lecture et purge), une DONNEE de la requete " +
      "comme l'`establishmentId` de superAdminAccessLog.api.ts -- le tenant, lui, reste implicite " +
      '(`establishmentApiUrl()` sans argument)',
    occurrences: 6,
  },
]

// Vitest s'execute depuis `front/`, et l'environnement jsdom ne donne pas d'`import.meta.url` de
// schema `file:`.
const DOSSIERS_CONCERNES = [
  join(process.cwd(), 'src', 'api'),
  join(process.cwd(), 'src', 'queries'),
]

const estUnCommentaire = (ligne: string) =>
  ligne.startsWith('//') || ligne.startsWith('*')

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
const relatif = (chemin: string) =>
  relative(racine, chemin).split(sep).join('/')

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
        .map(({ numero, texte }) => ({
          fichier: relatifDuFichier,
          ligne: numero,
          texte,
        }))
    })

    const horsExceptions = infractions.filter(
      (infraction) =>
        !EXCEPTIONS.some(
          (exception) => exception.fichier === infraction.fichier,
        ),
    )

    expect(
      horsExceptions,
      'Le tenant (etablissement/service) est implicite dans tout `src/api` et `src/queries` ' +
        '(front/CLAUDE.md, § « Le contexte est implicite » et § « Query keys deliberately do ' +
        "not carry the tenant ») : ni un module d'API ni un hook de requete ne doit nommer " +
        "`establishmentId`, `serviceId` ou `tenant` — l'URL vient de `tenantApiUrl()`/" +
        "`establishmentApiUrl()` appelees sans argument, jamais d'un parametre.",
    ).toEqual([])

    for (const exception of EXCEPTIONS) {
      expect(
        infractions.filter(
          (infraction) => infraction.fichier === exception.fichier,
        ).length,
        `Nombre d'occurrences attendu dans ${exception.fichier} (${exception.raison}).`,
      ).toBe(exception.occurrences)
    }
  })

  it('aucune cle de requete ne se construit a partir de l URL de tenant elle-meme', () => {
    const infractions = fichiers.flatMap((chemin) => {
      const relatifDuFichier = relatif(chemin)
      return lignesUtiles(chemin)
        .filter(({ texte }) => CLE_AVEC_FABRIQUE_URL.test(texte))
        .map(({ numero, texte }) => ({
          fichier: relatifDuFichier,
          ligne: numero,
          texte,
        }))
    })

    expect(
      infractions,
      'Une `queryKey`/`mutationKey` ne doit jamais appeler `tenantApiUrl()`/' +
        "`establishmentApiUrl()` : l'isolation vient d'un `QueryClient` neuf par couple " +
        "etablissement/service (`hooks/useTenantSwitch.ts`), pas d'un prefixe de cle.",
    ).toEqual([])
  })
})
