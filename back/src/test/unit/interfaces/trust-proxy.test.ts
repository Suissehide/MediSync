import Fastify from 'fastify'

// Etape 4a, tache 4, tour de correction 1, Important n°2 : sans confiance explicite dans le
// proxy, `request.ip` — donc la clef par defaut de `@fastify/rate-limit`
// (`defaultKeyGenerator = (req) => req.ip`, node_modules/@fastify/rate-limit/index.js) — vaut
// l'adresse du DERNIER sauteur TCP. Derriere Traefik (voir `deploy/compose.yaml`, un seul hop
// devant le service `back`), c'est Traefik lui-meme : TOUTES les requetes de TOUS les
// utilisateurs partagent alors la meme adresse cote Fastify, et la limite de 10/minute sur
// `/auth/sign-in` ou `/auth/access-link/consume` est PARTAGEE par tout le monde plutot
// qu'appliquee par client.
//
// `fastify-http-server.ts` pose desormais `trustProxy: 1` : fait confiance a EXACTEMENT un
// sauteur (celui immediatement devant le process Node, Traefik) et lit `request.ip` comme la
// derniere adresse de `X-Forwarded-For` en repartant de la droite — jamais la premiere, qu'un
// appelant peut ecrire lui-meme. Ce fichier prouve les deux moities de la propriete avec de
// vrais objets Fastify (pas une reimplementation d'un module tiers) :
//   1. SANS `trustProxy`, un `X-Forwarded-For` forge est totalement ignore (`request.ip` reste
//      l'adresse du socket) — la porte que la configuration ferme.
//   2. AVEC `trustProxy: 1` (la valeur reelle de production), la meme en-tete forgee ne deplace
//      PAS `request.ip` : seule l'entree juste avant le sauteur de confiance compte, quel que
//      soit le nombre d'entrees qu'un appelant ajoute lui-meme en tete de la chaine.
const FORGED_XFF = '9.9.9.9, 8.8.8.8, 203.0.113.7'
// La derniere entree de la chaine ci-dessus : c'est ce que Traefik, le seul sauteur de confiance,
// aurait lui-meme ajoute en observant la connexion entrante — la seule valeur qu'un appelant ne
// peut pas forger depuis l'AVANT de Traefik.
const REAL_CLIENT_IP_AS_SEEN_BY_THE_TRUSTED_HOP = '203.0.113.7'

describe('confiance dans le proxy (request.ip), dont depend la clef de la limite de debit', () => {
  it("sans confiance dans le proxy, un X-Forwarded-For force est ignore : request.ip reste l'adresse du socket (127.0.0.1 en injection)", async () => {
    const app = Fastify({})
    app.get('/ip', (request) => ({ ip: request.ip }))
    await app.ready()

    const res = await app.inject({
      method: 'GET',
      url: '/ip',
      headers: { 'x-forwarded-for': FORGED_XFF },
    })

    expect(res.json().ip).not.toBe(REAL_CLIENT_IP_AS_SEEN_BY_THE_TRUSTED_HOP)
    expect(res.json().ip).toBe('127.0.0.1')

    await app.close()
  })

  it("avec trustProxy: 1 (la valeur de production), request.ip est l'entree juste avant le sauteur de confiance, jamais une entree forgee en tete", async () => {
    const app = Fastify({ trustProxy: 1 })
    app.get('/ip', (request) => ({ ip: request.ip }))
    await app.ready()

    const res = await app.inject({
      method: 'GET',
      url: '/ip',
      headers: { 'x-forwarded-for': FORGED_XFF },
    })

    expect(res.json().ip).toBe(REAL_CLIENT_IP_AS_SEEN_BY_THE_TRUSTED_HOP)

    await app.close()
  })

  // Ce que `trustProxy: 1` NE PROTEGE PAS, nomme plutot que suppose (reserve du rapport de
  // correction) : cette propriete ne tient QUE si le seul chemin reseau vers le process Node est
  // effectivement celui qui passe par Traefik. `deploy/compose.yaml` publie AUSSI le port du
  // conteneur `back` directement sur l'hote, a cote du reseau `proxy` : si ce port est joignable
  // sans passer par Traefik, un appelant direct devient lui-meme le « sauteur de confiance », et
  // peut alors forger n'importe quelle adresse. Ce test ne peut pas trancher une question
  // d'infrastructure ; il fixe seulement ce que le code fait, pour que la question reseau reste
  // separee de la question de configuration.
  it('un appelant qui atteint directement le process (sans passer par le sauteur de confiance) peut forger request.ip : limite connue de trustProxy', async () => {
    const app = Fastify({ trustProxy: 1 })
    app.get('/ip', (request) => ({ ip: request.ip }))
    await app.ready()

    // Un SEUL sauteur forge (celui immediatement adjacent), pas une chaine : c'est exactement ce
    // qu'un appelant qui parlerait DIRECTEMENT au process (en contournant Traefik) peut ecrire.
    const res = await app.inject({
      method: 'GET',
      url: '/ip',
      headers: { 'x-forwarded-for': '6.6.6.6' },
    })

    expect(res.json().ip).toBe('6.6.6.6')

    await app.close()
  })
})
