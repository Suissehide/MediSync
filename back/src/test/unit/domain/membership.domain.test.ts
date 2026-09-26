import Boom from '@hapi/boom'

import { MembershipDomain } from '../../../main/domain/membership.domain'
import type { IocContainer } from '../../../main/types/application/ioc'
import type { MembershipRow } from '../../../main/types/infra/orm/repositories/membership.repository.interface'
import { TenantContext } from '../../../main/utils/tenant-context'

const user = (
  over: Partial<MembershipRow['user']> = {},
): MembershipRow['user'] => ({
  id: 'u1',
  email: 'a@b.fr',
  firstName: null,
  lastName: null,
  deactivatedAt: null,
  ...over,
})

const row = (over: Partial<MembershipRow>): MembershipRow => ({
  id: 'em1',
  userId: 'u1',
  establishmentId: 'e1',
  role: 'ADMIN',
  soignantId: null,
  createdAt: new Date(),
  user: user(),
  serviceMemberships: [],
  ...over,
})

// `admins` est le nombre d'administrateurs **actifs** (ce que compte le
// repository) ; `establishments` le nombre d'etablissements de l'identite
// visee, que le domaine lit via userRepository.findByID.
// Marqueur du client transactionnel : les trois ecritures de `createAccount` (le compte, le
// rattachement, le lien) doivent TOUTES le recevoir, sans quoi elles ne partagent pas un sort.
const TX = Symbol('transaction')

const build = (rows: MembershipRow[], admins = 1, establishments = 1) => {
  const ctx = new TenantContext()
  const calls: string[] = []
  const events: string[] = []
  const container = {
    tenantContext: ctx,
    appEventBus: {
      emit: (event: string) => {
        events.push(event)
      },
    },
    membershipRepository: {
      findAll: () => Promise.resolve(rows),
      findByID: (id: string) => {
        const found = rows.find((r) => r.id === id)
        return found ? Promise.resolve(found) : Promise.reject(Boom.notFound())
      },
      findByUserID: (userId: string) =>
        Promise.resolve(rows.find((r) => r.userId === userId) ?? null),
      countAdmins: () => Promise.resolve(admins),
      create: (p: unknown, client?: unknown) => {
        calls.push(client === TX ? 'create(tx)' : 'create')
        return Promise.resolve(row({ id: 'new', ...(p as object) }))
      },
      update: (id: string, p: unknown) => {
        calls.push('update')
        return Promise.resolve(row({ id, ...(p as object) }))
      },
      delete: () => {
        calls.push('delete')
        return Promise.resolve()
      },
      serviceExists: (id: string) => Promise.resolve(id === 's1'),
    },
    postgresOrm: {
      executeWithTransactionClient: (fn: (tx: unknown) => Promise<unknown>) => {
        calls.push('transaction')
        return fn(TX)
      },
    },
    accessLinkDomain: {
      issue: (userId: string, issuedBy: string, client?: unknown) => {
        calls.push(
          `issue(${userId},${issuedBy},${client === TX ? 'tx' : 'hors-tx'})`,
        )
        return Promise.resolve({ token: 'JETON-FACTICE' })
      },
    },
    userRepository: {
      // Trois adresses : une inconnue (tout le reste), une connue et libre, une connue mais
      // deja membre (`u1`, present dans `rows`), une connue et desactivee.
      findByEmail: (email: string) => {
        const comptes: Record<string, { id: string; deactivatedAt: Date | null }> = {
          'new@b.fr': { id: 'u2', deactivatedAt: null },
          'deja@b.fr': { id: 'u1', deactivatedAt: null },
          'dormant@b.fr': { id: 'u3', deactivatedAt: new Date() },
        }
        const compte = comptes[email]
        return compte ? Promise.resolve(compte) : Promise.reject(Boom.notFound())
      },
      create: (params: { email: string }, client?: unknown) => {
        calls.push(
          `user.create(${params.email},${client === TX ? 'tx' : 'hors-tx'})`,
        )
        return Promise.resolve({ id: 'u-neuf', deactivatedAt: null })
      },
      findByID: () =>
        Promise.resolve({
          establishmentMemberships: Array.from(
            { length: establishments },
            () => ({}),
          ),
        }),
      setDeactivated: () => {
        calls.push('deactivate')
        return Promise.resolve({})
      },
    },
    soignantRepository: {
      findByID: (id: string) =>
        id === 'so1'
          ? Promise.resolve({ id })
          : Promise.reject(Boom.notFound()),
    },
  } as unknown as IocContainer
  return { domain: new MembershipDomain(container), ctx, calls, events }
}

const asAdmin = (ctx: TenantContext, fn: () => Promise<unknown>) =>
  ctx.run(
    {
      userId: 'u1',
      establishmentId: 'e1',
      establishmentRole: 'ADMIN',
      serviceId: null,
      serviceRole: null,
      soignantId: null,
    },
    fn,
  )

// Les deux regles metier rendent toutes deux un 409 : on verrouille donc le
// message, sans quoi un test ne saurait pas laquelle s'est declenchee.
const LAST_ADMIN = 'Cannot remove the last administrator'
const SELF = 'Cannot apply this action to your own account'
const MULTI_ESTABLISHMENT =
  'This account belongs to several establishments; its activation cannot be changed from here'
const SELF_DEMOTION = 'Cannot remove your own administrator role'
const MULTI_ESTABLISHMENT_LINK =
  'This account belongs to several establishments; its access link cannot be reissued from here'
const ALREADY_MEMBER = 'This account is already a member of this establishment'
const DEACTIVATED_ACCOUNT =
  'This account is deactivated and cannot be added as a member'
const DEACTIVATED_LINK =
  'This account is deactivated; its access link cannot be reissued'

const rejectsWith = (
  promise: Promise<unknown>,
  statusCode: number,
  message: string,
) =>
  expect(promise).rejects.toMatchObject({
    output: { payload: { statusCode, message } },
  })

describe('MembershipDomain', () => {
  it('rattache une identite existante par e-mail', async () => {
    const { domain, ctx, calls, events } = build([row({})])
    await asAdmin(ctx, () =>
      domain.addByEmail({
        email: 'new@b.fr',
        role: 'MEMBER',
        soignantId: 'so1',
        services: [{ serviceId: 's1', role: 'INTERVENANT' }],
      }),
    )
    expect(calls).toEqual(['create'])
    expect(events).toEqual(['member.added'])
  })

  it('refuse un service etranger et un soignant etranger', async () => {
    const { domain, ctx } = build([row({})])
    await rejectsWith(
      asAdmin(ctx, () =>
        domain.addByEmail({
          email: 'new@b.fr',
          role: 'MEMBER',
          soignantId: null,
          services: [{ serviceId: 'zz', role: 'LECTURE' }],
        }),
      ),
      404,
      'Service zz not found',
    )
    await expect(
      asAdmin(ctx, () =>
        domain.addByEmail({
          email: 'new@b.fr',
          role: 'MEMBER',
          soignantId: 'zz',
          services: [],
        }),
      ),
    ).rejects.toMatchObject({ output: { statusCode: 404 } })
  })

  // Sinon un administrateur peut deviner quelles adresses ont un compte sur
  // la plateforme, en lisant la difference entre les deux refus.
  it('rend le meme refus pour une adresse inconnue et une adresse deja membre', async () => {
    const { domain, ctx, calls } = build([row({ userId: 'u2' })])
    const add = (email: string) =>
      asAdmin(ctx, () =>
        domain.addByEmail({
          email,
          role: 'MEMBER',
          soignantId: null,
          services: [],
        }),
      ).catch((err: { output: { payload: unknown } }) => err.output.payload)

    const unknownEmail = await add('inconnu@b.fr')
    const alreadyMember = await add('new@b.fr')

    expect(unknownEmail).toEqual(alreadyMember)
    expect(unknownEmail).toMatchObject({ statusCode: 400 })
    expect(calls).toEqual([])
  })

  // Cible : un AUTRE administrateur, et il n'en reste qu'un actif. Seule la
  // regle du dernier administrateur peut se declencher.
  it('refuse de retrograder, retirer ou desactiver le dernier administrateur', async () => {
    const build1 = () =>
      build(
        [row({}), row({ id: 'em2', userId: 'u2', user: user({ id: 'u2' }) })],
        1,
      )
    const a = build1()
    await rejectsWith(
      asAdmin(a.ctx, () => a.domain.update('em2', { role: 'MEMBER' })),
      409,
      LAST_ADMIN,
    )
    const b = build1()
    await rejectsWith(
      asAdmin(b.ctx, () => b.domain.remove('em2')),
      409,
      LAST_ADMIN,
    )
    const c = build1()
    await rejectsWith(
      asAdmin(c.ctx, () => c.domain.setDeactivated('em2', true)),
      409,
      LAST_ADMIN,
    )
    expect([...a.calls, ...b.calls, ...c.calls]).toEqual([])
  })

  // Cible : soi-meme, et il reste deux administrateurs actifs. Seule la regle
  // du soi-meme peut se declencher.
  it('refuse de se retirer et de se desactiver soi-meme meme quand un autre administrateur subsiste', async () => {
    const { domain, ctx, calls } = build(
      [row({}), row({ id: 'em2', userId: 'u2', user: user({ id: 'u2' }) })],
      2,
    )
    await rejectsWith(
      asAdmin(ctx, () => domain.remove('em1')),
      409,
      SELF,
    )
    await rejectsWith(
      asAdmin(ctx, () => domain.setDeactivated('em1', true)),
      409,
      SELF,
    )
    expect(calls).toEqual([])
  })

  // Un compte ne reduit jamais seul ses propres droits, c'est un collegue qui
  // le fait — par symetrie avec la regle du soi-meme sur remove/setDeactivated.
  it('refuse a l utilisateur courant de se retrograder en MEMBER', async () => {
    const { domain, ctx, calls } = build(
      [row({}), row({ id: 'em2', userId: 'u2', user: user({ id: 'u2' }) })],
      2,
    )
    await rejectsWith(
      asAdmin(ctx, () => domain.update('em1', { role: 'MEMBER' })),
      409,
      SELF_DEMOTION,
    )
    expect(calls).toEqual([])
  })

  it('laisse retrograder un autre administrateur quand il en reste un', async () => {
    const { domain, ctx, calls } = build(
      [row({}), row({ id: 'em2', userId: 'u2', user: user({ id: 'u2' }) })],
      2,
    )
    await asAdmin(ctx, () => domain.update('em2', { role: 'MEMBER' }))
    expect(calls).toEqual(['update'])
  })

  it('autorise ces operations sur un autre membre quand il reste un administrateur', async () => {
    const { domain, ctx, calls, events } = build(
      [
        row({}),
        row({
          id: 'em2',
          userId: 'u2',
          role: 'ADMIN',
          user: user({ id: 'u2' }),
        }),
      ],
      2,
    )
    await asAdmin(ctx, () => domain.update('em2', { role: 'MEMBER' }))
    await asAdmin(ctx, () => domain.setDeactivated('em2', true))
    await asAdmin(ctx, () => domain.remove('em2'))
    expect(calls).toEqual(['update', 'deactivate', 'delete'])
    expect(events).toEqual([
      'member.updated',
      'member.deactivated',
      'member.removed',
    ])
  })

  // Un compte deja desactive ne compte pas parmi les administrateurs actifs :
  // le refuser ne protegerait rien et empecherait le menage.
  it('n oppose pas la regle du dernier administrateur a un compte deja desactive', async () => {
    const off = row({
      id: 'em2',
      userId: 'u2',
      role: 'ADMIN',
      user: user({ id: 'u2', deactivatedAt: new Date() }),
    })
    const { domain, ctx, calls } = build([row({}), off], 1)
    await asAdmin(ctx, () => domain.remove('em2'))
    await asAdmin(ctx, () => domain.update('em2', { role: 'MEMBER' }))
    expect(calls).toEqual(['delete', 'update'])
  })

  // `User.deactivatedAt` est porte par l'identite globale : l'ecrire depuis
  // un etablissement couperait aussi les autres.
  it('refuse de changer l activation d un compte appartenant a plusieurs etablissements', async () => {
    const other = row({
      id: 'em2',
      userId: 'u2',
      role: 'MEMBER',
      user: user({ id: 'u2' }),
    })
    const { domain, ctx, calls } = build([row({}), other], 2, 2)
    await rejectsWith(
      asAdmin(ctx, () => domain.setDeactivated('em2', true)),
      409,
      MULTI_ESTABLISHMENT,
    )
    await rejectsWith(
      asAdmin(ctx, () => domain.setDeactivated('em2', false)),
      409,
      MULTI_ESTABLISHMENT,
    )
    expect(calls).toEqual([])
  })

  // Le garde de l'etape 1 n'existait que parce qu'un administrateur sans
  // service se retrouvait sans aucun ecran accessible. Les taches 8 et 12
  // lui donnent l'administration d'etablissement sous une URL sans service :
  // vider sa propre liste de services est donc redevenu une operation comme
  // une autre.
  it('autorise l utilisateur courant a vider sa propre liste de services', async () => {
    const { domain, ctx, calls } = build(
      [row({ serviceMemberships: [{ serviceId: 's1', role: 'INTERVENANT' }] })],
      2,
    )
    await asAdmin(ctx, () => domain.update('em1', { services: [] }))
    expect(calls).toEqual(['update'])
  })

  it('laisse vider la liste de services d un tiers', async () => {
    const { domain, ctx, calls } = build(
      [row({}), row({ id: 'em2', userId: 'u2', user: user({ id: 'u2' }) })],
      2,
    )
    await asAdmin(ctx, () => domain.update('em2', { services: [] }))
    expect(calls).toEqual(['update'])
  })

  it('laisse l utilisateur courant modifier sa propre appartenance en gardant un service', async () => {
    const { domain, ctx, calls } = build([row({})], 2)
    await asAdmin(ctx, () =>
      domain.update('em1', { services: [{ serviceId: 's1', role: 'LECTURE' }] }),
    )
    // Une mise a jour qui ne touche pas du tout aux services reste permise.
    await asAdmin(ctx, () => domain.update('em1', { soignantId: 'so1' }))
    expect(calls).toEqual(['update', 'update'])
  })

  it('journalise la reactivation', async () => {
    const other = row({
      id: 'em2',
      userId: 'u2',
      role: 'MEMBER',
      user: user({ id: 'u2' }),
    })
    const { domain, ctx, events } = build([row({}), other], 2)
    await asAdmin(ctx, () => domain.setDeactivated('em2', false))
    expect(events).toEqual(['member.reactivated'])
  })

  // --- Tache 10, step 1 : creer un compte de membre ---

  it('cree le compte, le rattache et emet son lien dans une seule transaction', async () => {
    const { domain, ctx, calls } = build([row({})])
    const resultat = await asAdmin(ctx, () =>
      domain.createAccount({
        email: 'inconnu@b.fr',
        firstName: 'Neuf',
        lastName: 'Compte',
        role: 'MEMBER',
        soignantId: 'so1',
        services: [{ serviceId: 's1', role: 'INTERVENANT' }],
      }),
    )

    // L'ORDRE compte (le compte avant le rattachement, le lien en dernier) et le CLIENT
    // compte : les trois ecritures portent le meme `tx`, sinon elles ne partagent aucun sort.
    expect(calls).toEqual([
      'transaction',
      'user.create(inconnu@b.fr,tx)',
      'create(tx)',
      'issue(u-neuf,u1,tx)',
    ])
    expect(resultat.accessLink).toEqual({ token: 'JETON-FACTICE' })
  })

  it('reutilise un compte existant au lieu de le recreer', async () => {
    const { domain, ctx, calls } = build([row({})])
    await asAdmin(ctx, () =>
      domain.createAccount({
        email: 'new@b.fr',
        role: 'MEMBER',
        soignantId: null,
        services: [],
      }),
    )

    // Aucun `user.create` : un compte deja connu n'est ni ecrase ni duplique.
    expect(calls).toEqual(['transaction', 'create(tx)', 'issue(u2,u1,tx)'])
  })

  it('emet l evenement de creation de compte, distinct du simple rattachement', async () => {
    const { domain, ctx, events } = build([row({})])
    await asAdmin(ctx, () =>
      domain.createAccount({
        email: 'inconnu@b.fr',
        role: 'MEMBER',
        soignantId: null,
        services: [],
      }),
    )
    expect(events).toEqual(['member.accountCreated'])
  })

  it('refuse une adresse deja membre, et un compte desactive, sans rien ecrire', async () => {
    const { domain, ctx, calls } = build([row({})])
    const appel = (email: string) =>
      asAdmin(ctx, () =>
        domain.createAccount({
          email,
          role: 'MEMBER',
          soignantId: null,
          services: [],
        }),
      )

    await rejectsWith(appel('deja@b.fr'), 409, ALREADY_MEMBER)
    await rejectsWith(appel('dormant@b.fr'), 409, DEACTIVATED_ACCOUNT)
    // Pas meme une transaction ouverte : les deux refus precedent toute ecriture.
    expect(calls).toEqual([])
  })

  it('verifie les references soumises avant d ouvrir la transaction', async () => {
    const { domain, ctx, calls } = build([row({})])
    await rejectsWith(
      asAdmin(ctx, () =>
        domain.createAccount({
          email: 'inconnu@b.fr',
          role: 'MEMBER',
          soignantId: null,
          services: [{ serviceId: 'zz', role: 'LECTURE' }],
        }),
      ),
      404,
      'Service zz not found',
    )
    expect(calls).toEqual([])
  })

  // --- Tache 10, step 3 : reemettre un lien ---

  it('reemet un lien pour l identite portee par l appartenance, jamais pour un id soumis', async () => {
    const { domain, ctx, calls } = build([
      row({ id: 'em2', userId: 'u7', user: user({ id: 'u7' }) }),
    ])

    const resultat = await asAdmin(ctx, () => domain.reissueAccessLink('em2'))

    // `u7` vient de la LIGNE chargee par le repository (filtre sur l'etablissement courant),
    // pas d'un identifiant que le client aurait pu choisir. Hors transaction : une seule
    // ecriture, rien a rendre atomique.
    expect(calls).toEqual(['issue(u7,u1,hors-tx)'])
    expect(resultat).toEqual({ token: 'JETON-FACTICE' })
  })

  // La garde la plus importante de la tache : un lien reinitialise le mot de passe du `User`,
  // qui est GLOBAL. Sans elle, l'administrateur de A prend le controle de l'acces a B.
  it('refuse de reemettre un lien pour un compte appartenant a plusieurs etablissements', async () => {
    const { domain, ctx, calls } = build([row({})], 1, 2)
    await rejectsWith(
      asAdmin(ctx, () => domain.reissueAccessLink('em1')),
      409,
      MULTI_ESTABLISHMENT_LINK,
    )
    expect(calls).toEqual([])
  })

  it('refuse de reemettre un lien pour un compte desactive', async () => {
    const { domain, ctx, calls } = build([
      row({ user: user({ deactivatedAt: new Date() }) }),
    ])
    await rejectsWith(
      asAdmin(ctx, () => domain.reissueAccessLink('em1')),
      409,
      DEACTIVATED_LINK,
    )
    // Rien d'emis : `issue` invaliderait au passage les liens encore actifs du compte.
    expect(calls).toEqual([])
  })

  it('emet l evenement de reemission', async () => {
    const { domain, ctx, events } = build([row({})])
    await asAdmin(ctx, () => domain.reissueAccessLink('em1'))
    expect(events).toEqual(['member.accessLinkReissued'])
  })

})
