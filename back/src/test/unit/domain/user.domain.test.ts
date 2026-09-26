import Boom from '@hapi/boom'

import { UserDomain } from '../../../main/domain/user.domain'
import type { IocContainer } from '../../../main/types/application/ioc'
import type { UserEntityRepo } from '../../../main/types/infra/orm/repositories/user.repository.interface'
import { TenantContext } from '../../../main/utils/tenant-context'

// Tâche 11 (étape 4a) : `UserDomain.bootstrapSuperAdmin` est la fonction que
// `back/scripts/bootstrap-super-admin.ts` appelle — le script lui-même n'a rien à tester, voir
// le brief. Deux exigences n'appartiennent PAS au brief mais s'imposent au vu du code déjà en
// place (voir le rapport de tâche pour le détail) :
//   - un script hors HTTP n'a aucun tenant à poser : la fonction doit s'encadrer elle-même dans
//     `tenantContext.runAsSystem`, sans compter sur son appelant pour le faire (comme
//     `scheduleActivityLogCleanup`, application/starter.ts) ;
//   - `MembershipDomain.setDeactivated` refuse tout changement de `deactivatedAt` dès que
//     `user.isSuperAdmin` est vrai, DANS LES DEUX SENS (assertNotSuperAdmin) — et aucune route de
//     `/super-admin` n'écrit `deactivatedAt` non plus. Un super-admin désactivé n'a donc AUCUN
//     chemin de retour ailleurs que par ce script : il doit pouvoir réactiver, pas seulement
//     poser le drapeau.
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

const build = (found: UserEntityRepo | null) => {
  const ctx = new TenantContext()
  const grantCalls: string[] = []
  const deactivationCalls: (Date | null)[] = []
  const logCalls: {
    userID: string
    userFirstName: string | null
    userLastName: string | null
    action: string
    entityType: string
    entityID: string
  }[] = []
  // Preuve que la fonction s'encadre elle-même en mode système (et pas seulement qu'elle
  // appelle des méthodes) : le stub lit le contexte AMBIANT au moment de l'appel, exactement ce
  // qu'un `runAsSystem` retiré ou mal placé (promesse rendue sans être attendue à l'intérieur du
  // rappel, cf. le piège documenté sur `runAsSuperAdmin`) laisserait faux.
  const contextKindsSeenAtFindByEmail: (string | undefined)[] = []
  // Etat mutable, comme une vraie ligne Postgres : chaque ecriture stub doit refleter les
  // ecritures precedentes (isSuperAdmin ET deactivatedAt), sans quoi un stub trop simple pourrait
  // masquer un bug reel de la fonction (elle NE relit PAS un troisieme coup a chaque ecriture ;
  // elle accumule le dernier retour connu — voir `current`, user.domain.ts).
  let stored: UserEntityRepo | null = found

  const container = {
    tenantContext: ctx,
    userRepository: {
      findByEmail: (_email: string) => {
        contextKindsSeenAtFindByEmail.push(ctx.peek()?.kind)
        // Message générique réaliste : c'est celui que rend réellement
        // `errorHandler.boomErrorFromPrismaError` sur `findUniqueOrThrow` (voir user.domain.ts,
        // le commentaire sur `searchByEmail`), PAS déjà le message propre attendu par
        // l'appelant. Un stub qui rendrait directement `Boom.notFound('No account with this
        // email')` prouverait le refus mais jamais que la fonction REMAPPE elle-même le message
        // — exactement le sabotage qui laisserait ce test vert par accident.
        return stored
          ? Promise.resolve(stored)
          : Promise.reject(Boom.notFound("User with this ID doesn't exist"))
      },
      grantSuperAdmin: (userID: string) => {
        grantCalls.push(userID)
        stored = user({ ...stored, id: userID, isSuperAdmin: true })
        return Promise.resolve(stored)
      },
      setDeactivated: (userID: string, at: Date | null) => {
        deactivationCalls.push(at)
        stored = user({ ...stored, id: userID, deactivatedAt: at })
        return Promise.resolve(stored)
      },
    },
    activityLogRepository: {
      create: (params: {
        userID: string
        userFirstName: string | null
        userLastName: string | null
        action: string
        entityType: string
        entityID: string
      }) => {
        logCalls.push(params)
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
    contextKindsSeenAtFindByEmail,
  }
}

describe('UserDomain.bootstrapSuperAdmin', () => {
  it('refuse une adresse inconnue plutôt que de créer un compte', async () => {
    const { domain, grantCalls, deactivationCalls, logCalls } = build(null)

    await expect(domain.bootstrapSuperAdmin('inconnu@b.fr')).rejects.toMatchObject({
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
    const { domain, grantCalls, deactivationCalls, logCalls, contextKindsSeenAtFindByEmail } =
      build(user({ id: 'u1', isSuperAdmin: false, deactivatedAt: null }))

    const result = await domain.bootstrapSuperAdmin('a@b.fr')

    expect(result.isSuperAdmin).toBe(true)
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

    await domain.bootstrapSuperAdmin('a@b.fr')

    expect(grantCalls).toEqual([]) // déjà posé : pas de deuxième écriture inutile
    expect(deactivationCalls).toEqual([null])
    expect(logCalls).toHaveLength(1)
    expect(logCalls[0]?.action).not.toBe('') // une ligne réellement distincte, voir l'action ci-dessous
  })

  it('pose le drapeau ET réactive en un seul appel, si les deux sont nécessaires', async () => {
    const { domain, grantCalls, deactivationCalls, logCalls } = build(
      user({ id: 'u1', isSuperAdmin: false, deactivatedAt: new Date('2026-01-01') }),
    )

    await domain.bootstrapSuperAdmin('a@b.fr')

    expect(grantCalls).toEqual(['u1'])
    expect(deactivationCalls).toEqual([null])
    // Deux faits distincts, deux lignes — pas une ligne qui n'en dirait qu'un des deux.
    expect(logCalls).toHaveLength(2)
  })

  it('second appel sur une identité déjà super-admin ET active : aucune écriture (idempotence choisie)', async () => {
    const { domain, grantCalls, deactivationCalls, logCalls } = build(
      user({ id: 'u1', isSuperAdmin: true, deactivatedAt: null }),
    )

    const result = await domain.bootstrapSuperAdmin('a@b.fr')

    expect(result.isSuperAdmin).toBe(true)
    expect(grantCalls).toEqual([])
    expect(deactivationCalls).toEqual([])
    expect(logCalls).toEqual([]) // rien n'a changé : aucune ligne, le journal ne mentirait pas par excès
  })
})
