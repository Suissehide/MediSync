import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import ts from 'typescript'

// ARBITRAGE n°1 : la garde porte sur LE JETON, pas sur la route.
//
// `AccessLinkDomain.issue` rend un jeton en clair qui, consomme, REINITIALISE LE MOT DE PASSE DU
// `User` — un modele GLOBAL. Un jeton ne donne donc pas acces « a cet etablissement » : il donne
// acces AU COMPTE, et a tout ce que ce compte atteint, y compris d'autres etablissements et, si
// le compte porte le drapeau, le prefixe `/super-admin`.
//
// Une garde posee sur la seule REEMISSION laissait `POST /account` — la route d'a cote, dans le
// meme fichier — la contourner entierement. Une garde par route se reoublie a la route suivante ;
// ce fichier rend l'oubli visible a l'execution plutot qu'a la lecture.
//
// `test:unit` (wireit, package.json) ne declarait pas `src/main/**` dans ses
// `files` : apres l'ajout d'un cinquieme site d'emission dans `src/main`, `npm run test:unit`
// repondait « Ran 0 scripts and skipped 2 » — vert, en reutilisant son cache — alors que ce
// fichier etait bel et bien rouge sous Jest direct. Un garde-fou qui ne rougit que si on pense a
// contourner le cache ne garde rien dans la boucle locale. `files` declare desormais
// `src/main/**` (verifie : le meme sabotage rend « Tests: 1 failed, 421 passed » par la commande
// npm). `test:e2e` et `cover:unit` ne souffraient pas du defaut, ils le declaraient deja.
//
// Il garde DEUX proprietes distinctes, et il faut dire laquelle fait quoi (meme lecon que
// `runAsSystem-unicite.test.ts`, qui distingue les siennes) :
//
//   A. Chaque site d'emission de `src/main` est DECLARE ici, nomme, avec sa raison et son
//      nombre d'appels. Un cinquieme site — une quatrieme route qui remet un jeton — fait
//      rougir ce test, quelle que soit sa garde. Ce volet ne lit JAMAIS le contenu d'une garde :
//      il dit seulement OU la capacite d'emettre est invoquee.
//   B. Dans `membership.domain.ts` — le seul fichier du niveau ADMINISTRATEUR D'ETABLISSEMENT
//      qui emette — il y a AU MOINS autant d'appels a `assertIssuableToken` que d'emissions.
//      Ce volet ne prouve pas que la garde precede l'emission sur le meme chemin d'execution
//      (une analyse de flux le faudrait) ; il prouve qu'on ne peut pas ajouter une troisieme
//      emission dans ce fichier sans ecrire, quelque part, un appel de plus a la garde. Ce que
//      la garde fait REELLEMENT, ce sont les tests e2e qui l'etablissent, en rejouant la chaine
//      complete (jeton -> consume -> session -> acces convoite) : voir members.test.ts,
//      « ne remet aucun jeton pour ... ».
//
// CE QU'AUCUN DES DEUX VOLETS NE COUVRE, dit plutot que sous-entendu : une emission passee par
// un alias (`const emettre = accessLinkDomain.issue.bind(accessLinkDomain)`) ou par un appel
// indirect (`.call`, `.apply`, cle de crochet calculee) n'ecrit pas `.issue(` a l'endroit de
// l'appel et echappe donc au volet A — la meme limite, pour la meme raison, que celle declaree
// dans `runAsSystem-unicite.test.ts`. Le nombre d'appels declare par site ferme le cas ordinaire
// (un site ajoute, un compte qui change) ; il ne ferme pas le detournement delibere.
const METHODE_EMISSION = 'issue'
const METHODE_GARDE = 'assertIssuableToken'

const NIVEAU_ETABLISSEMENT = 'domain/membership.domain.ts'

// Chaque entree porte un nombre D'APPELS, pas un nombre de fichiers : une seconde emission
// ajoutee dans un fichier deja permis doit etre discutee, pas heritee en silence.
const SITES_DECLARES = [
  {
    fichier: 'domain/establishment.domain.ts',
    raison:
      'creation d un etablissement et de son premier administrateur, par le SUPER-ADMIN ' +
      '(POST /super-admin/establishments). Hors du niveau administrateur d etablissement : ' +
      'l appelant a deja autorite sur toute la plateforme, il n y a aucun privilege a franchir.',
    appels: 1,
  },
  {
    fichier: NIVEAU_ETABLISSEMENT,
    raison:
      'les DEUX routes du niveau administrateur d etablissement qui remettent un jeton — ' +
      'createAccount (POST /account) et reissueAccessLink (POST /:membershipId/access-link). ' +
      'Chacune est precedee de assertIssuableToken, dont le volet B compte les appels.',
    appels: 2,
  },
  {
    fichier: 'domain/user.domain.ts',
    raison:
      'LA SOUPAPE (arbitrage n°3) : la reemission par le super-admin, seul recours d une ' +
      'personne en poste dans plusieurs etablissements qui perd son mot de passe. Sans garde ' +
      'de comptage, a dessein — c est ce qui rend la garde du niveau etablissement tenable.',
    appels: 1,
  },
]

// Jest tourne via @swc/jest en module CommonJS (jest.config.ts) : __dirname est disponible.
const RACINE = join(__dirname, '../../../main')

const fichiersDeProduction = (dossier: string): string[] =>
  readdirSync(dossier, { withFileTypes: true }).flatMap((entree) => {
    const chemin = join(dossier, entree.name)
    if (entree.isDirectory()) {
      return fichiersDeProduction(chemin)
    }
    return /\.ts$/.test(entree.name) ? [chemin] : []
  })

// Analyse l'AST plutot que le texte : un appel etale sur plusieurs lignes, un commentaire qui
// cite l'idiome ou une chaine qui le contient ne comptent pas — trois faux positifs que le
// volet textuel de `runAsSystem-unicite.test.ts` a declares faute de pouvoir les eviter, et que
// l'AST evite ici par construction. Une DECLARATION de methode (`async issue(...)` dans
// accessLink.domain.ts) n'est pas un CallExpression : elle n'est donc pas comptee.
const appelsDeMethode = (
  racine: string,
  nom: string,
): { fichier: string; ligne: number }[] =>
  fichiersDeProduction(racine).flatMap((chemin) => {
    const relatif = relative(racine, chemin).split(sep).join('/')
    const source = ts.createSourceFile(
      chemin,
      readFileSync(chemin, 'utf8'),
      ts.ScriptTarget.Latest,
      true,
    )
    const trouvailles: { fichier: string; ligne: number }[] = []

    const nommeLaMethode = (expression: ts.Expression): boolean => {
      if (ts.isPropertyAccessExpression(expression)) {
        return expression.name.text === nom
      }
      if (ts.isElementAccessExpression(expression)) {
        const cle = expression.argumentExpression
        return ts.isStringLiteralLike(cle) && cle.text === nom
      }
      return false
    }

    const visiter = (noeud: ts.Node): void => {
      if (ts.isCallExpression(noeud) && nommeLaMethode(noeud.expression)) {
        const { line } = source.getLineAndCharacterOfPosition(
          noeud.getStart(source),
        )
        trouvailles.push({ fichier: relatif, ligne: line + 1 })
      }
      ts.forEachChild(noeud, visiter)
    }
    visiter(source)
    return trouvailles
  })

describe('sites d emission d un lien d acces', () => {
  it('n emet, dans back/src/main, qu aux emplacements declares (volet A)', () => {
    const emissions = appelsDeMethode(RACINE, METHODE_EMISSION)

    // Sens 1 : une emission ajoutee ailleurs doit faire rougir. Le tableau (vide s il n y a
    // rien d interdit) s affiche dans le diff Jest : chaque entree porte fichier et ligne.
    const interdits = emissions.filter(
      (site) =>
        !SITES_DECLARES.some((declare) => declare.fichier === site.fichier),
    )
    expect(interdits).toEqual([])

    // Sens 2 : un site declare dont le nombre d appels change — ou qui disparait — doit rougir
    // aussi, sans quoi la liste pourrit au premier remaniement. `declare.raison` dit pourquoi
    // le site est permis ; si ce compte bouge, c est ce texte qu il faut relire.
    for (const declare of SITES_DECLARES) {
      expect(
        emissions.filter((site) => site.fichier === declare.fichier).length,
      ).toBe(declare.appels)
    }
  })

  it('appelle la garde du jeton au moins autant de fois qu il emet, au niveau etablissement (volet B)', () => {
    const emissions = appelsDeMethode(RACINE, METHODE_EMISSION).filter(
      (site) => site.fichier === NIVEAU_ETABLISSEMENT,
    )
    const gardes = appelsDeMethode(RACINE, METHODE_GARDE).filter(
      (site) => site.fichier === NIVEAU_ETABLISSEMENT,
    )

    expect(emissions.length).toBeGreaterThan(0)
    expect(gardes.length).toBeGreaterThanOrEqual(emissions.length)

    // La garde n appartient qu a ce niveau : si elle apparaissait ailleurs, c est qu on aurait
    // duplique le predicat au lieu de le partager — exactement ce que l arbitrage n°1 interdit.
    expect(
      appelsDeMethode(RACINE, METHODE_GARDE).filter(
        (site) => site.fichier !== NIVEAU_ETABLISSEMENT,
      ),
    ).toEqual([])
  })
})
