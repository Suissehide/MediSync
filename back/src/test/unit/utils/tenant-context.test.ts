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

  // Meme forme que runAsSystem ci-dessus, pour le troisieme contexte (tache 1, etape 4a). Le
  // `await Promise.resolve()` a l'interieur du rappel n'est pas cosmetique : une requete Prisma
  // est paresseuse, et `runAsSuperAdmin(() => prisma.x.count(...))` renverrait la promesse SANS
  // l'attendre si le rappel n'attendait rien lui-meme — l'execution partirait alors hors de la
  // portee du contexte (voir le commentaire de runAsSuperAdmin, utils/tenant-context.ts).
  it('runAsSuperAdmin pose le marqueur superadmin', async () => {
    const ctx = new TenantContext()
    await ctx.runAsSuperAdmin(async () => {
      await Promise.resolve()
      expect(ctx.peek()).toEqual({ kind: 'superadmin' })
      expect(() => ctx.current()).toThrow(TenantContextMissingError)
    })
    expect(ctx.peek()).toBeUndefined()
  })

  // `enter` utilise `enterWith`, qui teinte le contexte asynchrone jusqu'a
  // la fin de la chaine sans refermer sa portee : sans `clear`, une requete
  // suivante sur le meme worker heriterait du tenant de la precedente.
  it('clear referme la portee posee par enter', () => {
    const ctx = new TenantContext()
    ctx.enter(tenant)
    expect(ctx.peek()).toEqual({ kind: 'tenant', tenant })

    ctx.clear()

    expect(ctx.peek()).toBeUndefined()
    expect(() => ctx.current()).toThrow(TenantContextMissingError)
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
