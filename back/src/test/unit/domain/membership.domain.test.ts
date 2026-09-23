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
      create: (p: unknown) => {
        calls.push('create')
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
    userRepository: {
      findByEmail: (email: string) =>
        email === 'new@b.fr'
          ? Promise.resolve({ id: 'u2' })
          : Promise.reject(Boom.notFound()),
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
const SELF_WITHOUT_SERVICE =
  'Vous ne pouvez pas retirer tous vos propres services : vous perdriez l\'accès à tous les écrans, y compris celui des membres qui permettrait de vous réaffecter'

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

  // Contrepartie de la regle precedente : se retirer son propre role reste
  // permis tant que l'etablissement garde un administrateur actif.
  it('autorise l auto-retrogradation quand un autre administrateur subsiste', async () => {
    const { domain, ctx, calls } = build(
      [row({}), row({ id: 'em2', userId: 'u2', user: user({ id: 'u2' }) })],
      2,
    )
    await asAdmin(ctx, () => domain.update('em1', { role: 'MEMBER' }))
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

  // Sans cette regle, un administrateur pouvait se retirer tous ses services
  // et perdre l'acces a tous les ecrans, y compris l'ecran Membres qui lui
  // permettrait de se reaffecter : s'il etait le dernier administrateur, la
  // sortie passait par du SQL en production.
  it('refuse a l utilisateur courant de vider sa propre liste de services', async () => {
    const { domain, ctx, calls } = build([row({})], 2)
    await rejectsWith(
      asAdmin(ctx, () => domain.update('em1', { services: [] })),
      409,
      SELF_WITHOUT_SERVICE,
    )
    expect(calls).toEqual([])
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
})
