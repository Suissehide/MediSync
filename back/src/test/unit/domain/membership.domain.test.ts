import Boom from '@hapi/boom'

import { MembershipDomain } from '../../../main/domain/membership.domain'
import type { IocContainer } from '../../../main/types/application/ioc'
import type { MembershipRow } from '../../../main/types/infra/orm/repositories/membership.repository.interface'
import { TenantContext } from '../../../main/utils/tenant-context'

const row = (over: Partial<MembershipRow>): MembershipRow => ({
  id: 'em1',
  userId: 'u1',
  establishmentId: 'e1',
  role: 'ADMIN',
  soignantId: null,
  createdAt: new Date(),
  user: {
    id: 'u1',
    email: 'a@b.fr',
    firstName: null,
    lastName: null,
    deactivatedAt: null,
  },
  serviceMemberships: [],
  ...over,
})

const build = (rows: MembershipRow[], admins = 1) => {
  const ctx = new TenantContext()
  const calls: string[] = []
  const container = {
    tenantContext: ctx,
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
  return { domain: new MembershipDomain(container), ctx, calls }
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

describe('MembershipDomain', () => {
  it('rattache une identite existante par e-mail', async () => {
    const { domain, ctx, calls } = build([row({})])
    await asAdmin(ctx, () =>
      domain.addByEmail({
        email: 'new@b.fr',
        role: 'MEMBER',
        soignantId: 'so1',
        services: [{ serviceId: 's1', role: 'INTERVENANT' }],
      }),
    )
    expect(calls).toEqual(['create'])
  })

  it('refuse un e-mail inconnu, un service etranger, un soignant etranger', async () => {
    const { domain, ctx } = build([row({})])
    await expect(
      asAdmin(ctx, () =>
        domain.addByEmail({
          email: 'x@b.fr',
          role: 'MEMBER',
          soignantId: null,
          services: [],
        }),
      ),
    ).rejects.toMatchObject({ output: { statusCode: 404 } })
    await expect(
      asAdmin(ctx, () =>
        domain.addByEmail({
          email: 'new@b.fr',
          role: 'MEMBER',
          soignantId: null,
          services: [{ serviceId: 'zz', role: 'LECTURE' }],
        }),
      ),
    ).rejects.toMatchObject({ output: { statusCode: 404 } })
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

  it('refuse de retrograder ou retirer le dernier administrateur, et de se desactiver soi-meme', async () => {
    const { domain, ctx } = build([row({})], 1)
    await expect(
      asAdmin(ctx, () => domain.update('em1', { role: 'MEMBER' })),
    ).rejects.toMatchObject({ output: { statusCode: 409 } })
    await expect(
      asAdmin(ctx, () => domain.remove('em1')),
    ).rejects.toMatchObject({
      output: { statusCode: 409 },
    })
    await expect(
      asAdmin(ctx, () => domain.setDeactivated('em1', true)),
    ).rejects.toMatchObject({ output: { statusCode: 409 } })
  })

  it('autorise ces operations sur un autre membre quand il reste un administrateur', async () => {
    const { domain, ctx, calls } = build(
      [row({}), row({ id: 'em2', userId: 'u2', role: 'ADMIN' })],
      2,
    )
    await asAdmin(ctx, () => domain.update('em2', { role: 'MEMBER' }))
    await asAdmin(ctx, () => domain.setDeactivated('em2', true))
    await asAdmin(ctx, () => domain.remove('em2'))
    expect(calls).toEqual(['update', 'deactivate', 'delete'])
  })
})
