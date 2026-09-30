import { buildTestApp, type TestApp } from './setup/app'
import { testDb, truncateAll } from './setup/db'
import {
  createEstablishment,
  createService,
  createUser,
  signIn,
  tenantUrl,
} from './setup/fixtures'

// LE NOM DE L'AUTEUR DANS LE JOURNAL D'ACTIVITE — la propriete qu'aucune porte ne tenait.
//
// POURQUOI CE FICHIER EXISTE. `ActivityLogSubscriber.#log`
// resout le nom de l'auteur avant d'ecrire sa ligne, et il le fait derriere un
// `.catch(() => null)` : si cette lecture echoue, la ligne est ecrite QUAND MEME, amputee de
// `userFirstName`/`userLastName`, sans la moindre trace. C'est arrive pour de vrai — le
// resserrement du garde-fou a fait tomber la lecture que ce souscripteur employait,
// et la tracabilite de QUI A FAIT QUOI s'est degradee en silence sur TOUTES les actions
// journalisees depuis une route de tenant (patients, diagnostics, rendez-vous, membres).
//
// CE QUI N'AURAIT RIEN VU, et c'est le coeur de l'affaire :
//   - le test unitaire du souscripteur bouchonne le depot, donc la vraie lecture n'y passe pas ;
//   - `members.test.ts` (« journalise les operations de gestion des membres ») lit la route du
//     journal mais n'affirme que la LISTE DES ACTIONS : la ligne existait toujours, seulement
//     videe de son auteur, donc ce test est reste vert de bout en bout ;
//   - un test qui se contenterait de verifier que la ligne EXISTE ne prouverait rien non plus,
//     pour exactement la meme raison.
// Il faut donc affirmer LA VALEUR : le prenom et le nom de la personne qui a agi.
//
// Le contexte compte : `appEventBus.emit` est SYNCHRONE, donc le rappel du souscripteur demarre
// a l'interieur de la portee `AsyncLocalStorage` de la requete — il s'execute SOUS CONTEXTE DE
// TENANT. Le depot le prouve lui-meme (`activityLog.repository.ts` lit `tenantContext.peek()`
// pour remplir `establishmentId`/`serviceId`, et ces colonnes sont bien renseignees). C'est
// pourquoi une regle du garde-fou qui ne vaut que sous tenant l'atteint.

let t: TestApp
let establishmentId: string
let serviceId: string
let cookies: Record<string, string>

const PRENOM = 'Camille'
const NOM = 'Auteure'

beforeAll(async () => {
  t = await buildTestApp()
  await truncateAll()
  const establishment = await createEstablishment('E')
  establishmentId = establishment.id
  const service = await createService(establishmentId, 'S')
  serviceId = service.id
  const auteur = await createUser({
    email: 'auteure@exemple.test',
    memberships: [
      {
        establishmentId,
        role: 'ADMIN',
        services: [{ serviceId, role: 'COORDINATEUR' }],
      },
    ],
  })
  // `createUser` ne pose pas d'identite : on la pose ici, puisque c'est precisement elle que ce
  // fichier verifie. Ecrite par le client NU, donc independamment de tout ce qu'on eprouve.
  await testDb.user.update({
    where: { id: auteur.id },
    data: { firstName: PRENOM, lastName: NOM },
  })
  // Un second compte, deja existant : la route d'ajout d'un membre rattache une adresse CONNUE
  // (une adresse inconnue y est refusee), et ce qu'on veut journaliser ici est le rattachement.
  await createUser({ email: 'membre@exemple.test' })
  cookies = await signIn(t.app, 'auteure@exemple.test')
})

afterAll(async () => {
  await t.close()
  await testDb.$disconnect()
})

// Le journal est ecrit en « tire et oublie » (`appEventBus`, jamais attendu par le handler) :
// on attend donc son apparition, sans jamais rendre vert un journal vide — la boucle rend ce
// qu'elle a trouve, et les assertions echouent sur un tableau vide.
const lignesDuJournal = async () => {
  for (let essai = 0; essai < 40; essai += 1) {
    const lignes = await testDb.activityLog.findMany({
      where: { establishmentId },
      orderBy: { createdAt: 'asc' },
    })
    if (lignes.length > 0) {
      return lignes
    }
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  return []
}

describe('journal d activite : le nom de l auteur, pas seulement le nombre de lignes', () => {
  it('inscrit le prenom et le nom de la personne qui a cree le patient', async () => {
    const cree = await t.app.inject({
      method: 'POST',
      url: tenantUrl(establishmentId, serviceId, '/patient'),
      cookies,
      payload: { firstName: 'Patient', lastName: 'Temoin' } as never,
    })
    expect(cree.statusCode).toBe(201)

    const lignes = await lignesDuJournal()

    // 1. La ligne existe — condition necessaire, et ELLE SEULE NE PROUVE RIEN : elle existait
    //    deja quand l'auteur etait perdu.
    const creation = lignes.find((ligne) => ligne.action === 'patient.created')
    expect(creation).toBeDefined()

    // 2. LA propriete : l'auteur est nomme. C'est la seule assertion de ce fichier qui rougit
    //    quand la lecture du nom echoue derriere le `.catch(() => null)` du souscripteur.
    expect({
      userFirstName: creation?.userFirstName,
      userLastName: creation?.userLastName,
    }).toEqual({ userFirstName: PRENOM, userLastName: NOM })
  })

  // La meme propriete sur le second chemin : la gestion des membres, sous
  // `/e/:id/admin`, un contexte de tenant SANS service. Les deux chemins passent par le meme
  // souscripteur, mais ils n'entrent pas dans le contexte par la meme porte
  // (`resolveTenant` contre `resolveEstablishmentAdmin`) — et c'est le contexte qui decide si la
  // regle du garde-fou s'applique.
  it('inscrit aussi le nom de l auteur pour une action d administration d etablissement', async () => {
    const ajout = await t.app.inject({
      method: 'POST',
      url: `/e/${establishmentId}/admin/members/`,
      cookies,
      payload: { email: 'membre@exemple.test', role: 'MEMBER' } as never,
    })
    expect(ajout.statusCode).toBe(201)

    for (let essai = 0; essai < 40; essai += 1) {
      const lignes = await testDb.activityLog.findMany({
        where: { establishmentId, entityType: 'member' },
      })
      if (lignes.length > 0) {
        expect({
          userFirstName: lignes[0]?.userFirstName,
          userLastName: lignes[0]?.userLastName,
        }).toEqual({ userFirstName: PRENOM, userLastName: NOM })
        return
      }
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
    throw new Error("aucune ligne de journal 'member' n a ete ecrite")
  })
})
