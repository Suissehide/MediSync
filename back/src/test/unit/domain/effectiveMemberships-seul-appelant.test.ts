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
// a la maniere de `front/src/test/lecture-directe-du-cache.test.ts`, et surveille TROIS choses,
// chacune par un NOM :
//
//   A. tout appel a `effectiveMemberships(` — attrape un TROISIEME appelant NOMME, et fait
//      rougir si l'un des deux appelants autorises perd son appel (ou en gagne un second en
//      silence) ;
//   B. tout appel a `.findForUser(` (la lecture du repository) — attrape un appelant qui
//      court-circuiterait `liveGrantsForUser` (accessGrant.domain.ts). Le garde superadmin
//      lui-meme vit desormais DANS `AccessGrantRepository.findForUser` (tour de correction 1,
//      tache 8) : `liveGrantsForUser` n'est plus qu'un relais vers un `userId`, precisement pour
//      qu'aucun appelant ne puisse plus PRETENDRE un `isSuperAdmin` — la verite est relue fraiche
//      a chaque appel, jamais acceptee d'un argument ;
//   C. tout appel a `liveGrantsForUser(` — ajoute au tour de correction 2 (tache 8). Ce que ce
//      relais ne ferme PAS, et que la revue a signale a ce tour : reduire son argument a un seul
//      `userId` ne l'empeche pas d'etre un id de TIERS — rien ici ne distingue un appel legitime
//      (toujours l'id de l'appelant AUTHENTIFIE, jamais soumis) d'un appel qui passerait un id
//      arbitraire, et un tel appel obtiendrait les octrois de ce tiers. Surveiller le NOM de ses
//      appelants est donc la seule fermeture bon marche disponible ici, meme limite que pour
//      `effectiveMemberships` : un nouvel appelant NOMME fait rougir ce test, qu'il soit legitime
//      ou non — a charge de revue humaine de juger CHAQUE nouvelle entree de la liste.
//
// CE QU'IL NE GARANTIT PAS : une REIMPLEMENTATION locale qui recalculerait le meme arbre
// d'appartenances (ou relirait le repository via un detour — alias, `.bind`, cle de crochet
// calculee) SANS JAMAIS PRONONCER CES TROIS NOMS echapperait entierement a ce test — et, pour C.,
// un appel LEGITIMEMENT NOMME mais dont l'argument serait un id de tiers plutot que celui de
// l'appelant echapperait aussi : ce risque-la reste porte au journal de decisions de l'etape
// (tache 14), pas ferme ici. Fermer le reste exigerait soit une analyse de flux de donnees
// complete, soit une instrumentation a l'execution (intercepter reellement les fonctions
// exportees) — un chantier a part, hors de ce qu'une lecture statique des sources peut
// honnetement garantir (meme limite, deja actee, que `runAsSystem-unicite.test.ts`, fin de
// fichier).
const APPEL_EFFECTIVE_MEMBERSHIPS = /effectiveMemberships\(/
const APPEL_FIND_FOR_USER = /\.findForUser\(/
const APPEL_LIVE_GRANTS_FOR_USER = /liveGrantsForUser\(/

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
// qui relaie TOUJOURS l'appel — c'est `AccessGrantRepository.findForUser` elle-meme qui decide,
// en interne, si la lecture va plus loin qu'une verification fraiche du drapeau (tour de
// correction 1, tache 8 ; voir accessGrant.domain.ts). Tout autre appel contournerait ce relais.
const AUTORISES_FIND_FOR_USER = [
  {
    fichier: 'domain/accessGrant.domain.ts',
    raison: 'liveGrantsForUser — seul relais vers AccessGrantRepository.findForUser',
    appels: 1,
  },
]

// Tour de correction 2 (tache 8) : les cinq seuls appelants legitimes de `liveGrantsForUser` —
// toujours avec l'id de l'appelant AUTHENTIFIE (`request.currentUser.id`, ou un id fraichement
// relu depuis la meme session), jamais un id soumis. Voir le commentaire en tete de fichier,
// point C., pour ce que cette liste ferme et ce qu'elle ne ferme pas.
const AUTORISES_LIVE_GRANTS_FOR_USER = [
  {
    fichier: 'domain/auth.domain.ts',
    raison: 'signIn et refresh — l id du compte qui vient de prouver son mot de passe ou son jeton',
    appels: 2,
  },
  {
    fichier: 'interfaces/http/fastify/routes/me.ts',
    raison: 'GET / et PATCH / — request.currentUser.id, jamais un id soumis',
    appels: 2,
  },
  {
    fichier: 'interfaces/http/fastify/plugins/tenant.plugin.ts',
    raison: 'resolveTenantFromUser — request.currentUser.id',
    appels: 1,
  },
]

// Fichiers qui DEFINISSENT les fonctions surveillees : `export const effectiveMemberships = (...)`
// et `export const liveGrantsForUser = (userId, accessGrantRepository) =>
// accessGrantRepository.findForUser(userId)`. Une DEFINITION n'est pas un APPEL
// (`effectiveMemberships =` et `liveGrantsForUser =` portent chacun un `=` qu'aucune des trois
// regex d'appel ne matche — verifie : ni `effectiveMemberships(`, ni `liveGrantsForUser(`, ni
// `.findForUser(` ne trouvent leur propre ligne de definition), mais la ligne
// `accessGrantRepository.findForUser(userId)` a l'INTERIEUR de `liveGrantsForUser` EST un appel —
// c'est l'appel legitime, deja compte dans `AUTORISES_FIND_FOR_USER` ci-dessus. Rien a exclure
// nulle part pour ce volet, donc — `exclureDefinition` reste `false` pour B. et C.
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

  // Tour de correction 2 (tache 8) : voir le commentaire en tete de fichier, point C., pour ce
  // que ce test ferme et ce qu'il ne ferme pas.
  it('liveGrantsForUser n est appelee, dans back/src/main, qu aux cinq emplacements autorises', () => {
    verifieUnicite(
      appelsTrouves(APPEL_LIVE_GRANTS_FOR_USER, false),
      AUTORISES_LIVE_GRANTS_FOR_USER,
    )
  })
})
