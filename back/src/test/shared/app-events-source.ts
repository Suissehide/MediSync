import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// LECTURE DE `AppEvents` DEPUIS SA SOURCE, partagee par les deux tests qui en dependent :
//   - `e2e/activity-log-emissions-declarees.test.ts` (la garde dynamique : chaque evenement
//     declare ecrit-il reellement une ligne, sous son contexte reel ?) ;
//   - `unit/utils/access-log-vocabulaire.test.ts` (le contrat de vocabulaire entre les deux
//     depots : le front sait-il nommer chaque action que le back peut ecrire ?).
//
// ELLE VIT ICI, ET PAS DANS L'UN DES DEUX, pour que les deux posent EXACTEMENT la meme question
// a la meme source. Deux lecteurs distincts du meme fichier, c'est deux facons de deriver.
//
// REVUE FINALE DE BRANCHE, Important n°4 — POURQUOI CE N'EST PLUS UNE REGEX LIGNE PAR LIGNE.
// La premiere version exigeait l'accolade fermante sur la MEME ligne
// (`/^\s*'([\w.]+)':\s*\{([^}]*)\}/`). Un evenement declare sur quatre lignes — la forme que le
// formateur produit de lui-meme des que la charge depasse la largeur de ligne, et un evenement
// existant fait deja 87 caracteres — n'etait tout simplement PAS VU : ni classe, ni exempte, ni
// signale. PROUVE par execution : un evenement a trois champs ajoute sur quatre lignes a
// `AppEvents`, absent des deux tables de la garde dynamique, laissait ce fichier-la 18/18 VERT,
// alors que son en-tete promettait qu'« un evenement ajoute au type et oublie ici fait echouer
// ce fichier plutot que de passer inapercu ». C'est la garde dont TOUTE la raison d'etre est que
// l'analyse statique echoue ouvert ; elle echouait ouvert elle-meme.
//
// Une regex ne peut pas equilibrer des accolades. La lecture ci-dessous les EQUILIBRE : elle
// isole le bloc `type AppEvents = { ... }`, puis, a l'interieur, chaque entree `'nom': { ... }`
// par comptage, quelle que soit sa mise en page.
const CHEMIN_APP_EVENT_BUS = join(
  __dirname,
  '../../main/utils/app-event-bus.ts',
)
const CHAMP_STRING = /(\w+)\s*:\s*string/g
const DEBUT_ENTREE = /'([\w.]+)'\s*:\s*\{/g

// Borne basse : la lecture ne doit jamais rendre MOINS d'evenements que le nombre connu au jour
// ou cette ligne est ecrite. Elle n'attrape PAS le cas multiligne (un evenement non vu laisse le
// compte inchange, pas diminue) — c'est le parcours equilibre qui l'attrape, et l'exemple
// multiligne qui le prouve. Elle attrape l'autre mode d'echec, celui ou la lecture casse
// ENTIEREMENT (fichier renomme, type deplace, bloc reformate autrement) : sans elle, une liste
// vide rendrait verts les deux fichiers appelants en ne testant plus rien du tout.
export const BORNE_BASSE_EVENEMENTS = 17

export type EvenementDeclare = { nom: string; champs: string[] }

// Retire les commentaires avant tout comptage d'accolades : une accolade CITEE dans un
// commentaire desequilibrerait le parcours. Aucune cle d'evenement ne contient `//` ni `/*`,
// donc un retrait textuel suffit — la meme limite, et la meme raison de l'accepter, que le
// volet C de `runAsSystem-unicite.test.ts`.
export const sansCommentaires = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')

// Rend le contenu du `{ ... }` qui s'ouvre a `debut` (l'accolade ouvrante elle-meme), accolades
// equilibrees, ou `null` si le bloc n'est jamais referme.
export const blocEquilibre = (
  source: string,
  debut: number,
): { corps: string; fin: number } | null => {
  let profondeur = 0
  for (let i = debut; i < source.length; i += 1) {
    if (source[i] === '{') {
      profondeur += 1
    } else if (source[i] === '}') {
      profondeur -= 1
      if (profondeur === 0) {
        return { corps: source.slice(debut + 1, i), fin: i }
      }
    }
  }
  return null
}

// Exportee pour etre eprouvee sur un EXEMPLE MULTILIGNE plutot que seulement sur la source
// reelle, qui pourrait tres bien n'etre que monoligne le jour ou on la lit — c'est exactement ce
// qui a permis au defaut de vivre.
export const evenementsDansSource = (
  sourceBrute: string,
): EvenementDeclare[] => {
  const source = sansCommentaires(sourceBrute)
  const declaration = source.indexOf('type AppEvents')
  if (declaration === -1) {
    return []
  }
  const ouvrante = source.indexOf('{', declaration)
  if (ouvrante === -1) {
    return []
  }
  const bloc = blocEquilibre(source, ouvrante)
  if (bloc === null) {
    return []
  }
  const evenements: EvenementDeclare[] = []
  const corps = bloc.corps
  let position = 0
  for (;;) {
    DEBUT_ENTREE.lastIndex = position
    const entree = DEBUT_ENTREE.exec(corps)
    if (entree === null) {
      return evenements
    }
    // `entree.index + entree[0].length - 1` : l'accolade ouvrante capturee par le motif.
    const charge = blocEquilibre(corps, entree.index + entree[0].length - 1)
    if (charge === null) {
      return evenements
    }
    evenements.push({
      nom: entree[1] ?? '',
      champs: [...charge.corps.matchAll(CHAMP_STRING)].flatMap((m) =>
        m[1] === undefined ? [] : [m[1]],
      ),
    })
    // Reprend APRES la charge : une entree imbriquee ne serait jamais comptee comme un
    // evenement de premier rang.
    position = charge.fin + 1
  }
}

export const evenementsDeclares = (): EvenementDeclare[] =>
  evenementsDansSource(readFileSync(CHEMIN_APP_EVENT_BUS, 'utf8'))
