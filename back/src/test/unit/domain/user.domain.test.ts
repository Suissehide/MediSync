import Boom from '@hapi/boom'

import { UserDomain } from '../../../main/domain/user.domain'
import type { IocContainer } from '../../../main/types/application/ioc'
import type { UserEntityRepo } from '../../../main/types/infra/orm/repositories/user.repository.interface'
import { TenantContext } from '../../../main/utils/tenant-context'

// Tâche 11 (étape 4a) : `UserDomain.bootstrapSuperAdmin` est la fonction que
// `back/scripts/bootstrap-super-admin.ts` appelle — le script lui-même n'a rien à tester, voir
// le brief. Exigences qui n'appartiennent PAS au brief mais s'imposent au vu du code déjà en
// place (voir le rapport de tâche pour le détail) :
//   - un script hors HTTP n'a aucun tenant à poser : la fonction doit s'encadrer elle-même dans
//     `tenantContext.runAsSystem`, sans compter sur son appelant pour le faire (comme
//     `scheduleActivityLogCleanup`, application/starter.ts) ;
//   - `MembershipDomain.setDeactivated` refuse tout changement de `deactivatedAt` dès que
//     `user.isSuperAdmin` est vrai, DANS LES DEUX SENS (assertNotSuperAdmin) — et aucune route de
//     `/super-admin` n'écrit `deactivatedAt` non plus. Un super-admin désactivé n'a donc AUCUN
//     chemin de retour ailleurs que par ce script : il doit pouvoir réactiver, pas seulement
//     poser le drapeau ;
//   - tour de correction 1 (revue) : les écritures `User` + `ActivityLog` d'un même appel
//     partagent une seule transaction Postgres, pour qu'une promotion ne puisse jamais survivre
//     seule à l'échec de sa ligne de journal (voir le test « annule TOUTE la promotion… »
//     ci-dessous).
const user = (over: Partial<UserEntityRepo> = {}): UserEntityRepo => ({
  id: 'u1',
  email: 'a@b.fr',
  password: 'hash',
  salt: 'salt',
  firstName: 'Ada',
  lastName: 'Lovelace',
  isSuperAdmin: false,
  deactivatedAt: null,
  lastLoginAt: null,
  ...over,
})

// Marqueur littéral du script : jamais un cuid (id de compte). Une virgule, un `:` ou une
// majuscule suffit à en être sûr — les cuids générés par `@default(cuid())` (schema.prisma) sont
// entièrement en minuscules alphanumériques. La relecture du souscripteur ne doit trouver AUCUN
// compte à cette adresse, laissant `userFirstName`/`userLastName` à `null`.
const NOT_A_CUID = /[^a-z0-9]/

type LogCall = {
  userID: string
  userFirstName: string | null
  userLastName: string | null
  action: string
  entityType: string
  entityID: string
}

const build = (
  found: UserEntityRepo | null,
  opts: { failLogAction?: string } = {},
) => {
  const ctx = new TenantContext()
  const grantCalls: string[] = []
  const deactivationCalls: (Date | null)[] = []
  const logCalls: LogCall[] = []
  const txArgsSeen: unknown[] = []
  const transactionOpenCount = { value: 0 }
  // Preuve que la fonction s'encadre elle-même en mode système (et pas seulement qu'elle
  // appelle des méthodes) : le stub lit le contexte AMBIANT au moment de l'appel, exactement ce
  // qu'un `runAsSystem` retiré ou mal placé (promesse rendue sans être attendue à l'intérieur du
  // rappel, cf. le piège documenté sur `runAsSuperAdmin`) laisserait faux.
  const contextKindsSeenAtFindByEmail: (string | undefined)[] = []

  // État COMMIS, comme une vraie ligne Postgres relue APRÈS la fin d'une transaction — distinct
  // de ce qu'une écriture faite SOUS transaction retourne à l'appelant (`latest`, user.domain.ts)
  // avant que cette transaction n'ait résolu. Une écriture reçue avec le marqueur de la
  // transaction OUVERTE est différée (`pendingWrites`) et n'est appliquée à `committed` que si le
  // rappel transactionnel RÉSOUT ; une écriture reçue SANS marqueur (le code n'irait plus par
  // `executeWithTransactionClient`) s'applique IMMÉDIATEMENT, exactement comme un vrai
  // `client.user.update(...)` hors `$transaction` — c'est cette distinction qui permet au test
  // d'atomicité ci-dessous de faire la différence entre « bien encadré » et « pas encadré du
  // tout », plutôt que de rester vert dans les deux cas par accident.
  let committed: UserEntityRepo | null = found
  let openTransaction: {
    marker: symbol
    pendingWrites: (() => void)[]
  } | null = null

  const applyOrDefer = (next: UserEntityRepo, tx: unknown): void => {
    if (openTransaction && tx === openTransaction.marker) {
      openTransaction.pendingWrites.push(() => {
        committed = next
      })
    } else {
      committed = next
    }
  }

  const container = {
    tenantContext: ctx,
    postgresOrm: {
      executeWithTransactionClient: async (
        fn: (tx: symbol) => Promise<unknown>,
      ) => {
        transactionOpenCount.value += 1
        const marker = Symbol('tx')
        const previous = openTransaction
        openTransaction = { marker, pendingWrites: [] }
        try {
          const result = await fn(marker)
          // COMMIT : rien n'est visible avant que le rappel n'ait résolu.
          for (const apply of openTransaction.pendingWrites) {
            apply()
          }
          return result
        } finally {
          // ROLLBACK implicite si `fn` a rejeté : `pendingWrites` n'a jamais été rejoué.
          openTransaction = previous
        }
      },
    },
    userRepository: {
      findByEmail: (_email: string) => {
        contextKindsSeenAtFindByEmail.push(ctx.peek()?.kind)
        // Message générique réaliste : c'est celui que rend réellement
        // `errorHandler.boomErrorFromPrismaError` sur `findUniqueOrThrow` (voir user.domain.ts,
        // le commentaire sur `searchByEmail`), PAS déjà le message propre attendu par
        // l'appelant. Un stub qui rendrait directement `Boom.notFound('No account with this
        // email')` prouverait le refus mais jamais que la fonction REMAPPE elle-même le message
        // — exactement le sabotage qui laisserait ce test vert par accident.
        return committed
          ? Promise.resolve(committed)
          : Promise.reject(Boom.notFound("User with this ID doesn't exist"))
      },
      grantSuperAdmin: (userID: string, tx?: symbol) => {
        txArgsSeen.push(tx)
        grantCalls.push(userID)
        const next = user({ ...committed, id: userID, isSuperAdmin: true })
        applyOrDefer(next, tx)
        return Promise.resolve(next)
      },
      setDeactivated: (userID: string, at: Date | null, tx?: symbol) => {
        txArgsSeen.push(tx)
        deactivationCalls.push(at)
        const next = user({ ...committed, id: userID, deactivatedAt: at })
        applyOrDefer(next, tx)
        return Promise.resolve(next)
      },
    },
    activityLogRepository: {
      create: (params: LogCall, tx?: symbol) => {
        txArgsSeen.push(tx)
        logCalls.push(params)
        if (opts.failLogAction === params.action) {
          return Promise.reject(new Error('log write failed'))
        }
        return Promise.resolve()
      },
    },
  } as unknown as IocContainer

  const domain = new UserDomain(container)
  return {
    domain,
    ctx,
    grantCalls,
    deactivationCalls,
    logCalls,
    txArgsSeen,
    transactionOpenCount,
    contextKindsSeenAtFindByEmail,
    getCommitted: () => committed,
  }
}

describe('UserDomain.bootstrapSuperAdmin', () => {
  it('refuse une adresse inconnue plutôt que de créer un compte', async () => {
    const { domain, grantCalls, deactivationCalls, logCalls } = build(null)

    await expect(
      domain.bootstrapSuperAdmin('inconnu@b.fr'),
    ).rejects.toMatchObject({
      isBoom: true,
      output: { statusCode: 404 },
      // Le message PROPRE à cet appelant, pas le générique de `findUniqueOrThrow` que le stub
      // rend (ci-dessus) : prouve que la fonction absorbe et remappe elle-même le 404, plutôt
      // que de laisser filtrer tel quel un message qui parlerait d'un « ID » à un appelant qui a
      // cherché par adresse.
      message: 'No account with this email',
    })
    expect(grantCalls).toEqual([])
    expect(deactivationCalls).toEqual([])
    expect(logCalls).toEqual([])
  })

  it("pose le drapeau sur un compte actif qui ne l'a pas encore, et journalise", async () => {
    const {
      domain,
      grantCalls,
      deactivationCalls,
      logCalls,
      contextKindsSeenAtFindByEmail,
    } = build(user({ id: 'u1', isSuperAdmin: false, deactivatedAt: null }))

    const result = await domain.bootstrapSuperAdmin('a@b.fr')

    expect(result.user.isSuperAdmin).toBe(true)
    expect(result.granted).toBe(true)
    expect(result.reactivated).toBe(false)
    expect(grantCalls).toEqual(['u1'])
    expect(deactivationCalls).toEqual([]) // rien à réactiver : le compte était déjà actif
    expect(contextKindsSeenAtFindByEmail).toEqual(['system'])

    expect(logCalls).toHaveLength(1)
    const [entry] = logCalls
    expect(entry.entityType).toBe('user')
    expect(entry.entityID).toBe('u1')
    // Ni un acteur inventé, ni la cible elle-même (elle ne s'est pas auto-promue) : un marqueur
    // structurellement distinct d'un identifiant de compte.
    expect(entry.userID).not.toBe('u1')
    expect(NOT_A_CUID.test(entry.userID)).toBe(true)
    expect(entry.userFirstName).toBeNull()
    expect(entry.userLastName).toBeNull()
  })

  it('réactive un super-admin déjà désactivé — seul recours, aucune route ne le fait', async () => {
    const deactivatedSince = new Date('2026-01-01T00:00:00.000Z')
    const { domain, grantCalls, deactivationCalls, logCalls } = build(
      user({ id: 'u1', isSuperAdmin: true, deactivatedAt: deactivatedSince }),
    )

    const result = await domain.bootstrapSuperAdmin('a@b.fr')

    expect(result.granted).toBe(false) // déjà posé : pas de deuxième écriture inutile
    expect(result.reactivated).toBe(true)
    expect(grantCalls).toEqual([])
    expect(deactivationCalls).toEqual([null])
    expect(logCalls).toHaveLength(1)
    expect(logCalls[0]?.action).not.toBe('') // une ligne réellement distincte, voir l'action ci-dessous
  })

  it('pose le drapeau ET réactive en un seul appel, si les deux sont nécessaires', async () => {
    const { domain, grantCalls, deactivationCalls, logCalls } = build(
      user({
        id: 'u1',
        isSuperAdmin: false,
        deactivatedAt: new Date('2026-01-01'),
      }),
    )

    const result = await domain.bootstrapSuperAdmin('a@b.fr')

    expect(result.granted).toBe(true)
    expect(result.reactivated).toBe(true)
    expect(grantCalls).toEqual(['u1'])
    expect(deactivationCalls).toEqual([null])
    // Deux faits distincts, deux lignes — pas une ligne qui n'en dirait qu'un des deux.
    expect(logCalls).toHaveLength(2)
  })

  it('second appel sur une identité déjà super-admin ET active : aucune écriture, aucune transaction (idempotence choisie)', async () => {
    const {
      domain,
      grantCalls,
      deactivationCalls,
      logCalls,
      transactionOpenCount,
    } = build(user({ id: 'u1', isSuperAdmin: true, deactivatedAt: null }))

    const result = await domain.bootstrapSuperAdmin('a@b.fr')

    expect(result.user.isSuperAdmin).toBe(true)
    expect(result.granted).toBe(false)
    expect(result.reactivated).toBe(false)
    expect(grantCalls).toEqual([])
    expect(deactivationCalls).toEqual([])
    expect(logCalls).toEqual([]) // rien n'a changé : aucune ligne, le journal ne mentirait pas par excès
    expect(transactionOpenCount.value).toBe(0) // rien à changer : pas la peine d'ouvrir une transaction
  })

  // Tour de correction 1, Important n°1 (revue) : sans transaction, une ligne de journal en échec
  // APRÈS une promotion réussie laissait le compte réellement promu tout en rejetant l'appel — et
  // l'idempotence (ci-dessus, délibérée) empêchait ensuite tout second appel de rejouer cette
  // branche, perdant pour toujours la trace de « qui a créé ce super-admin, et quand ».
  it('annule TOUTE la promotion si la ligne de journal échoue : rien ne persiste (transaction)', async () => {
    const { domain, grantCalls, getCommitted } = build(
      user({ id: 'u1', isSuperAdmin: false, deactivatedAt: null }),
      { failLogAction: 'superAdmin.granted' },
    )

    await expect(domain.bootstrapSuperAdmin('a@b.fr')).rejects.toThrow(
      'log write failed',
    )

    // La preuve n'est PAS que l'appel a rejeté (un simple `catch` autour de la ligne de journal
    // suffirait à simuler ça sans rien garantir) : c'est que l'ÉCRITURE SUR `User` N'A PAS
    // SURVÉCU, alors même que `grantSuperAdmin` a bien été APPELÉE — sans quoi (si la première
    // écriture n'avait même pas été tentée) ce test ne prouverait rien du tout.
    expect(grantCalls).toEqual(['u1'])
    expect(getCommitted()?.isSuperAdmin).toBe(false)
  })

  it('les écritures User et ActivityLog d un même appel reçoivent le même marqueur de transaction', async () => {
    const { domain, txArgsSeen } = build(
      user({
        id: 'u1',
        isSuperAdmin: false,
        deactivatedAt: new Date('2026-01-01'),
      }),
    )

    await domain.bootstrapSuperAdmin('a@b.fr')

    // grantSuperAdmin, create(granted), setDeactivated, create(reactivated) : 4 appels, un seul
    // marqueur commun — la preuve qu'ils partagent une seule transaction, pas quatre écritures
    // indépendantes qui se ressembleraient par coïncidence.
    expect(txArgsSeen).toHaveLength(4)
    expect(new Set(txArgsSeen).size).toBe(1)
    expect(txArgsSeen[0]).toBeDefined()
  })
})
