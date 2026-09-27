import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { SANS_ETABLISSEMENT } from '../../../main/interfaces/http/fastify/schemas/superAdminAccessLog.schema'
import { ACTIVITY_LOG_SCRIPT_ACTIONS } from '../../../main/utils/activity-log-actions'
import {
  blocEquilibre,
  evenementsDeclares,
  sansCommentaires,
} from '../../shared/app-events-source'

// LE CONTRAT DE VOCABULAIRE ENTRE LES DEUX DEPOTS (revue finale de branche, mineur : « le
// vocabulaire d'actions n'a AUCUN test de contrat entre les deux depots, la ou les matrices de
// permissions en ont un »).
//
// CE QU'IL EXISTAIT DEJA, ET CE QUI MANQUAIT. `unit/utils/permissions.test.ts` tient la matrice
// de permissions identique entre back et front, par lecture des deux fichiers. Le VOCABULAIRE
// D'ACTIONS des deux journaux n'avait rien de tel — et c'est exactement par la que le defaut de
// la tache 11 est passe : l'ecran plateforme a reutilise le dictionnaire de l'ecran d'activite
// DE SERVICE (huit cles) pour afficher un journal qui peut en porter DIX-NEUF. Manquaient les
// sept `member.*`, `patient.removedFromPathway`, les deux actions d'amorcage, et
// `user.accessLinkReissued` — la ligne que la tache 7 existe pour creer, sur la route la plus
// puissante du systeme. Rien ne rougissait : un libelle manquant retombe sur la valeur brute, et
// le filtre « Action » ne proposait simplement pas la valeur.
//
// CE FICHIER LIE DONC LE DICTIONNAIRE A LA SOURCE, dans les DEUX sens :
//   - une action que le back peut ecrire et que le front ne sait pas nommer fait rougir ;
//   - un libelle front qui ne correspond a aucune action du back fait rougir aussi (une entree
//     morte se lit comme une capacite qui n'existe pas).
//
// LES SOURCES DU BACK SONT LUES, JAMAIS RECOPIEES : `AppEvents` par le meme lecteur que la garde
// dynamique (`../../shared/app-events-source`), les actions de script depuis la constante de
// production qui les porte, et `AccessAction` depuis son union de types. Recopier l'une des
// trois ici ferait de ce fichier un second endroit ou le vocabulaire peut deriver, ce qui est
// precisement le defaut qu'il ferme.
const RACINE_FRONT = join(__dirname, '../../../../../front/src')

const litFront = (chemin: string): string =>
  readFileSync(join(RACINE_FRONT, chemin), 'utf8')

// Les cles de premier rang d'un objet litteral nomme. Lecture LIGNE PAR LIGNE du corps (les deux
// depots formatent une propriete par ligne, Biome l'impose), apres retrait des commentaires :
// une cle citee dans un commentaire ne doit pas compter, et une accolade citee ne doit pas
// desequilibrer le parcours.
const CLE = /^\s*(?:'([^']+)'|"([^"]+)"|([A-Za-z_$][\w$]*))\s*:/

const clesDeLObjet = (source: string, nom: string): string[] => {
  const propre = sansCommentaires(source)
  const declaration = propre.indexOf(`const ${nom}`)
  if (declaration === -1) {
    throw new Error(`Objet ${nom} introuvable : le contrat lit un fichier qui a change de forme.`)
  }
  const ouvrante = propre.indexOf('{', declaration)
  const bloc = blocEquilibre(propre, ouvrante)
  if (bloc === null) {
    throw new Error(`Objet ${nom} jamais referme.`)
  }
  return bloc.corps
    .split('\n')
    .flatMap((ligne) => {
      const trouve = CLE.exec(ligne)
      const cle = trouve?.[1] ?? trouve?.[2] ?? trouve?.[3]
      return cle === undefined ? [] : [cle]
    })
}

// `AccessAction` (back) : une union de litteraux, une valeur par ligne.
const VALEUR_UNION = /'([^']+)'/g
const valeursDeAccessAction = (): string[] => {
  const source = sansCommentaires(
    readFileSync(
      join(__dirname, '../../../main/types/domain/patientAccessLog.domain.interface.ts'),
      'utf8',
    ),
  )
  const debut = source.indexOf('export type AccessAction')
  const fin = source.indexOf('\n\n', debut)
  const union = source.slice(debut, fin === -1 ? undefined : fin)
  return [...union.matchAll(VALEUR_UNION)].flatMap((m) => (m[1] === undefined ? [] : [m[1]]))
}

const trie = (valeurs: readonly string[]): string[] => [...valeurs].sort()

describe("le vocabulaire du journal d'activite est couvert par le front, exactement", () => {
  const actionsDuBack = [
    ...evenementsDeclares().map((e) => e.nom),
    ...ACTIVITY_LOG_SCRIPT_ACTIONS,
  ]

  // Garde-fou du garde-fou : si la lecture des sources rendait une liste vide, tout le reste de
  // ce fichier serait vert sans rien prouver.
  it('lit bien les deux sources du back, et elles ne se recouvrent pas', () => {
    expect(evenementsDeclares().length).toBeGreaterThanOrEqual(17)
    expect(ACTIVITY_LOG_SCRIPT_ACTIONS.length).toBe(2)
    expect(new Set(actionsDuBack).size).toBe(actionsDuBack.length)
  })

  it("l'ecran PLATEFORME sait nommer chaque action que le journal d'activite peut porter", () => {
    const service = clesDeLObjet(
      litFront('constants/activityLog.constant.ts'),
      'ACTION_LABELS',
    )
    const plateformeSeulement = clesDeLObjet(
      litFront('constants/superAdminAccessLog.constant.ts'),
      'PLATFORM_ONLY_ACTIVITY_ACTION_LABELS',
    )
    expect(trie([...service, ...plateformeSeulement])).toEqual(trie(actionsDuBack))
  })

  // Les deux dictionnaires se COMPLETENT, ils ne se recouvrent pas : une cle presente dans les
  // deux serait un libelle duplique, que l'un des deux finirait par contredire.
  it('les deux dictionnaires du front ne partagent aucune cle', () => {
    const service = clesDeLObjet(
      litFront('constants/activityLog.constant.ts'),
      'ACTION_LABELS',
    )
    const plateformeSeulement = clesDeLObjet(
      litFront('constants/superAdminAccessLog.constant.ts'),
      'PLATFORM_ONLY_ACTIVITY_ACTION_LABELS',
    )
    expect(service.filter((cle) => plateformeSeulement.includes(cle))).toEqual([])
  })

  // L'ecran DE SERVICE, lui, n'a pas a nommer ce qu'il ne voit jamais — mais tout ce qu'il nomme
  // doit exister. Une entree morte ici se lirait comme une action que l'application peut ecrire.
  it("l'ecran de service ne nomme aucune action qui n'existe pas", () => {
    const service = clesDeLObjet(
      litFront('constants/activityLog.constant.ts'),
      'ACTION_LABELS',
    )
    expect(service.filter((cle) => !actionsDuBack.includes(cle))).toEqual([])
  })
})

describe('le vocabulaire du journal des consultations est couvert par le front, exactement', () => {
  it('ACCESS_LOG_ACTION_LABELS recouvre exactement AccessAction', () => {
    const front = clesDeLObjet(
      litFront('constants/accessLog.constant.ts'),
      'ACCESS_LOG_ACTION_LABELS',
    )
    expect(trie(front)).toEqual(trie(valeursDeAccessAction()))
  })
})

// La valeur reservee du filtre d'etablissement est une convention PARTAGEE entre les deux depots
// (revue finale de branche, Important n°1) : le front l'envoie, le back la reconnait. Deux
// litteraux qui doivent rester egaux, exactement comme la matrice de permissions.
describe('la valeur reservee « sans etablissement » est la meme des deux cotes', () => {
  it('le front envoie exactement ce que le back reconnait', () => {
    const [valeurFront] = [
      ...litFront('constants/superAdminAccessLog.constant.ts').matchAll(
        /export const SANS_ETABLISSEMENT = '([^']+)'/g,
      ),
    ]
    expect(valeurFront?.[1]).toBe(SANS_ETABLISSEMENT)
  })
})
