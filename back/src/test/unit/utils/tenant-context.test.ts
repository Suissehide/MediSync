import { TenantContext } from '../../../main/utils/tenant-context'
import {
  TenantContextMissingError,
} from '../../../main/utils/tenant-errors'
import type { Tenant } from '../../../main/types/utils/tenant-context'

const tenant: Tenant = {
  userId: 'u1',
  establishmentId: 'e1',
  establishmentRole: 'MEMBER',
  serviceId: 's1',
  serviceRole: 'INTERVENANT',
  soignantId: null,
}

describe('TenantContext', () => {
  it('leve sans contexte', () => {
    const ctx = new TenantContext()
    expect(() => ctx.current()).toThrow(TenantContextMissingError)
    expect(ctx.peek()).toBeUndefined()
  })

  it('restitue le tenant pose dans le meme flux asynchrone', async () => {
    const ctx = new TenantContext()
    await ctx.run(tenant, async () => {
      await Promise.resolve()
      expect(ctx.current().serviceId).toBe('s1')
      expect(ctx.scope()).toEqual({ serviceId: 's1', establishmentId: 'e1' })
    })
  })

  it('currentService leve quand le service est nul', async () => {
    const ctx = new TenantContext()
    await ctx.run({ ...tenant, serviceId: null, serviceRole: null }, async () => {
      await Promise.resolve()
      expect(() => ctx.currentService()).toThrow(TenantContextMissingError)
      expect(ctx.establishmentScope()).toEqual({ establishmentId: 'e1' })
    })
  })

  it('runAsSystem pose le marqueur systeme', async () => {
    const ctx = new TenantContext()
    await ctx.runAsSystem(async () => {
      await Promise.resolve()
      expect(ctx.peek()).toEqual({ kind: 'system' })
      expect(() => ctx.current()).toThrow(TenantContextMissingError)
    })
    expect(ctx.peek()).toBeUndefined()
  })

  it('isole deux flux concurrents', async () => {
    const ctx = new TenantContext()
    const a = ctx.run({ ...tenant, serviceId: 'a' }, async () => {
      await new Promise((r) => setTimeout(r, 5))
      return ctx.current().serviceId
    })
    const b = ctx.run({ ...tenant, serviceId: 'b' }, async () => {
      await Promise.resolve()
      return ctx.current().serviceId
    })
    expect(await Promise.all([a, b])).toEqual(['a', 'b'])
  })
})
