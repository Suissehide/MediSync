import fastifyRateLimit from '@fastify/rate-limit'
import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify'
import http from 'node:http'

// Etape 4a, tache 4, tour de correction 1, Important n°2, PUIS tour de correction 2, CRITIQUE
// (la valeur retenue au tour 1 — `trustProxy: 1` — etait une REGRESSION, mesuree sur de vraies
// connexions TCP : un appelant qui se connecte DIRECTEMENT obtenait l'adresse qu'il s'attribue
// lui-meme via l'en-tete, rendant la limite de 10/minute totalement contournable). Ce fichier
// n'utilise donc plus `fastify.inject` (qui ne passe par aucune vraie socket) : il ouvre un VRAI
// serveur TCP (`app.listen`) et lui envoie de VRAIES requetes HTTP (`node:http`), pour les deux
// chemins que le tour 2 exige d'eprouver : par le proxy (l'adresse du client est retenue, la
// limite la distingue) et en direct (l'adresse retenue est celle du socket, la limite mord).
//
// Valeur de production (`fastify-http-server.ts`) : `'loopback,linklocal,uniquelocal'` — une
// confiance PAR PLAGE D'ADRESSE, pas par position. `@fastify/proxy-addr` ne lit
// `X-Forwarded-For` QUE si le pair TCP direct appartient lui-meme a une de ces plages ; sinon
// `request.ip` reste l'adresse reelle du socket, sans jamais consulter l'en-tete — contrairement
// a un nombre (`trustProxy: 1`), qui ne regarde jamais qui est le pair, seulement sa POSITION.
const TRUSTED_RANGES = 'loopback,linklocal,uniquelocal'

const requestOnce = (
  port: number,
  forwardedFor?: string,
): Promise<{ status: number }> =>
  new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: '127.0.0.1',
        port,
        path: '/probe',
        method: 'GET',
        headers: forwardedFor ? { 'x-forwarded-for': forwardedFor } : {},
      },
      (res) => {
        res.resume()
        res.on('end', () => resolve({ status: res.statusCode ?? 0 }))
      },
    )
    req.on('error', reject)
    req.end()
  })

const requestIp = (
  port: number,
  forwardedFor?: string,
): Promise<{ ip: string }> =>
  new Promise((resolve, reject) => {
    let body = ''
    const req = http.request(
      {
        host: '127.0.0.1',
        port,
        path: '/ip',
        method: 'GET',
        headers: forwardedFor ? { 'x-forwarded-for': forwardedFor } : {},
      },
      (res) => {
        res.on('data', (chunk) => {
          body += chunk
        })
        res.on('end', () => resolve(JSON.parse(body)))
      },
    )
    req.on('error', reject)
    req.end()
  })

const portOf = (app: FastifyInstance): number => {
  const address = app.server.address()
  if (typeof address !== 'object' || address === null) {
    throw new Error('no TCP address bound')
  }
  return address.port
}

// Un serveur reel (VRAIE socket TCP, `127.0.0.1`, port ephemere) : une route qui echo l'adresse
// resolue (`/ip`), et une route soumise a une VRAIE limite de debit (`/probe`, 3/minute, via le
// VRAI plugin `@fastify/rate-limit`) — pour eprouver a la fois la resolution de `request.ip` ET
// son effet reel sur la limite, pas seulement la valeur intermediaire.
const buildRealServer = async (
  trustProxy: FastifyServerOptions['trustProxy'],
): Promise<{ app: FastifyInstance; port: number }> => {
  const app = Fastify({ trustProxy })
  await app.register(fastifyRateLimit, { global: false })
  app.get('/ip', (request) => ({ ip: request.ip }))
  app.get(
    '/probe',
    { config: { rateLimit: { max: 3, timeWindow: '1 minute' } } },
    () => ({ ok: true }),
  )
  await app.listen({ port: 0, host: '127.0.0.1' })
  return { app, port: portOf(app) }
}

describe('confiance dans le proxy (request.ip), dont depend la clef de la limite de debit — sur de vraies connexions TCP', () => {
  // `app.close()` est systematiquement dans un `finally` : une premiere version de ce fichier ne
  // fermait le serveur qu'apres les assertions, et une assertion en echec laissait alors une
  // vraie socket TCP ouverte — jest restait alors accroche indefiniment (constate par execution,
  // pendant la demonstration du rouge du tour 2 : le fichier sabote a fait tourner le processus
  // jusqu'au delai, tue explicitement plutot que laisse en fond).
  it("sans confiance dans le proxy, un X-Forwarded-For fabrique est ignore : request.ip reste l'adresse REELLE du socket (le pair TCP, pas une plage de confiance)", async () => {
    const { app, port } = await buildRealServer(false)
    try {
      const res = await requestIp(port, '203.0.113.7')

      expect(res.ip).not.toBe('203.0.113.7')
      expect(res.ip).toBe('127.0.0.1')
    } finally {
      await app.close()
    }
  })

  it("avec la confiance de production ('loopback,linklocal,uniquelocal'), le pair TCP direct (loopback en test local) est reconnu : request.ip devient l'entree fabriquee de X-Forwarded-For", async () => {
    const { app, port } = await buildRealServer(TRUSTED_RANGES)
    try {
      const res = await requestIp(port, '203.0.113.7')

      expect(res.ip).toBe('203.0.113.7')
    } finally {
      await app.close()
    }
  })

  // Chemin n°1 exige par le tour 2 : « par le proxy, l'adresse du client est bien retenue et la
  // limite le distingue ». Quatre clients DIFFERENTS derriere le meme proxy (quatre
  // X-Forwarded-For distincts, une seule requete chacun) : aucun ne doit heriter du compteur d'un
  // autre.
  it('via la plage de confiance : quatre clients distants distincts ne partagent PAS le meme compteur de debit', async () => {
    const { app, port } = await buildRealServer(TRUSTED_RANGES)
    try {
      const results = await Promise.all(
        ['1.1.1.1', '2.2.2.2', '3.3.3.3', '4.4.4.4'].map((ip) => requestOnce(port, ip)),
      )

      for (const result of results) {
        expect(result.status).toBe(200)
      }
    } finally {
      await app.close()
    }
  })

  // Complète le chemin n°1 : le MEME client (même X-Forwarded-For), lui, mord bien la limite —
  // la confiance par plage ne désactive pas la limite, elle la fait seulement porter sur la
  // bonne adresse.
  it('via la plage de confiance : le MEME client distant (meme X-Forwarded-For) mord la limite au-dela de trois requetes', async () => {
    const { app, port } = await buildRealServer(TRUSTED_RANGES)
    try {
      const statuses: number[] = []
      for (let i = 0; i < 4; i += 1) {
        const result = await requestOnce(port, '9.9.9.9')
        statuses.push(result.status)
      }

      expect(statuses).toEqual([200, 200, 200, 429])
    } finally {
      await app.close()
    }
  })

  // Chemin n°2 exige par le tour 2 : « en direct avec un en-tete fabrique, l'adresse retenue est
  // celle du socket et la limite mord ». Un appelant qui se connecte SANS passer par une plage de
  // confiance et change son en-tete a CHAQUE requete (ce qu'un attaquant ferait pour tenter de
  // contourner la limite) reste sur la MEME adresse reelle : la limite mord quand meme, à la
  // meme requete qu'un attaquant qui n'aurait jamais changé d'adresse. C'est la régression du
  // tour 1 : avec `trustProxy: 1`, ces quatre requetes passaient TOUTES (l'en-tete etait honore,
  // donc chacune avait sa propre clef) — montré rouge par exécution, puis rétabli (voir
  // task-4-report.md).
  it("en direct (hors plage de confiance), un en-tete fabrique DIFFERENT a chaque requete ne deplace rien : la limite mord comme si l'appelant n'avait jamais change d'adresse", async () => {
    const { app, port } = await buildRealServer(false)
    try {
      const statuses: number[] = []
      for (let i = 0; i < 4; i += 1) {
        const result = await requestOnce(port, `${i}.${i}.${i}.${i}`)
        statuses.push(result.status)
      }

      expect(statuses).toEqual([200, 200, 200, 429])
    } finally {
      await app.close()
    }
  })

  // Ce que la confiance PAR PLAGE ne protege pas — nomme dans un commentaire plutot que dans un
  // test qui ne pourrait rien affirmer de plus qu'une tautologie (deux réseaux Docker distincts
  // ne se simulent pas dans ce fichier) : elle suppose que tout pair TCP appartenant a une plage
  // privee EST le proxy legitime. Un autre conteneur deja present sur le MEME reseau Docker
  // `proxy` (`deploy/compose.yaml`) aurait, lui aussi, une adresse privee — indistinguable de
  // Traefik par ce seul critere. Ce residu suppose une infrastructure deja compromise (un
  // conteneur non legitime admis sur le reseau `proxy`), pas un appelant public ordinaire — c'est
  // pourquoi le remede retenu (la plage, pas une adresse exacte non plus fixee par Docker) reste
  // le bon compromis SANS toucher `deploy/compose.yaml` (question d'infrastructure, pas de code —
  // voir task-4-report.md).
})
