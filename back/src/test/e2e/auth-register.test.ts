import { buildTestApp, type TestApp } from './setup/app'
import { testDb, truncateAll } from './setup/db'

// POURQUOI CE FICHIER EXISTE (tache 9, etape 4b).
//
// La tache 9 fait de l'absence de contexte un QUATRIEME contexte declare : sans store, un modele
// global ne passe plus que par les couples nommes dans `NO_CONTEXT_GLOBAL_OPERATIONS`
// (tenant-guard.ts). Cette liste a ete etablie par MESURE — le garde-fou instrumente, la suite
// e2e complete lancee, 1 243 appels sans contexte, 8 couples distincts.
//
// `POST /auth/register` n'etait exerce par AUCUN test e2e. Sa seule ecriture,
// `UserRepository.create` depuis `AuthDomain.register`, n'apparaissait donc dans aucune mesure,
// alors que c'est la seule route non tenant qui cree un compte hors `runAsSuperAdmin`. Une liste
// tiree telle quelle du journal aurait ferme cette route en production sans qu'un seul test du
// depot rougisse — le genre exact de defaut que la tache 9 existe pour empecher.
//
// Ce fichier rend la methode de decouverte complete : la route est desormais couverte, donc une
// prochaine instrumentation verrait `User.create`. Preuve par sabotage, suites completes
// relancees pour la verifier : en retirant `'create'` de `NO_CONTEXT_GLOBAL_OPERATIONS.User`,
// DEUX tests rougissent sur les 819 du back (554 unitaires + 265 e2e) — le premier de ce fichier
// (500 au lieu de 201, aucun compte cree en base) et, cote unitaire, `laisse passer
// POST /auth/register — UserRepository.create` (tenant-guard.test.ts). Rien d'autre. Les deux
// disent la meme chose a deux niveaux : l'unitaire que le couple est refuse, celui-ci que la
// ROUTE cesse de fonctionner — c'est le second qui manquait, et qui est la raison de ce fichier.
//
// Le routeur est limite a 5 requetes par minute (`register.router.ts`) : ce fichier en consomme
// DEUX, pour la meme raison qu'`access-link.test.ts` compte les siennes.
describe('POST /auth/register', () => {
  let testApp: TestApp

  beforeAll(async () => {
    testApp = await buildTestApp()
  })

  afterAll(async () => {
    await testApp.close()
    await testDb.$disconnect()
  })

  beforeEach(async () => {
    await truncateAll()
  })

  const register = (payload: Record<string, unknown>) =>
    testApp.app.inject({ method: 'POST', url: '/auth/register', payload })

  it('cree le compte sans aucun contexte de tenant', async () => {
    const reponse = await register({
      email: 'nouveau@test.fr',
      firstName: 'Nina',
      lastName: 'Registre',
      password: 'MotDePasseValide123!!',
    })

    expect(reponse.statusCode).toBe(201)
    const cree = await testDb.user.findUnique({
      where: { email: 'nouveau@test.fr' },
    })
    // La ligne est reellement en base : un 201 seul ne prouverait rien, le handler ne renvoie
    // pas le compte cree.
    expect(cree).not.toBeNull()
    expect(cree?.firstName).toBe('Nina')
    // Ni le mot de passe en clair ni un compte privilegie par accident.
    expect(cree?.password).not.toBe('MotDePasseValide123!!')
    expect(cree?.isSuperAdmin).toBe(false)
  })

  it('refuse un mot de passe trop court, sans rien ecrire', async () => {
    const reponse = await register({ email: 'court@test.fr', password: 'court' })

    expect(reponse.statusCode).toBe(400)
    await expect(
      testDb.user.count({ where: { email: 'court@test.fr' } }),
    ).resolves.toBe(0)
  })
})
