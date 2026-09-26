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

  // TOUR DE CORRECTION 3 (tache 1) — Important de la revue : muter en place l'objet rendu par
  // `peek()` est une porte d'entree dans un mode non-tenant qu'aucune analyse de source ne peut
  // surveiller (voir runAsSystem-unicite.test.ts). Le remede choisi n'est pas une declaration de
  // cette limite, mais une fermeture a l'execution : le store est gele (`Object.freeze`) avant
  // d'entrer dans le stockage. Preuve par execution, dans les DEUX sens demandes par la revue —
  // que ca casse un appelant legitime (non : la lecture continue de fonctionner), et que ca ferme
  // reellement la porte (oui : la mutation leve, elle ne reussit jamais silencieusement).
  it('gele le store : une mutation en place echoue plutot que de faire glisser le contexte', async () => {
    const ctx = new TenantContext()
    await ctx.runAsSuperAdmin(async () => {
      await Promise.resolve()
      const store = ctx.peek()
      expect(store).toBeDefined()
      expect(Object.isFrozen(store)).toBe(true)
      // Les modules ES (donc ce fichier compile) tournent en mode strict : une affectation sur
      // une propriete en lecture seule y leve un TypeError plutot que d'echouer en silence — la
      // encore verifie par execution, pas suppose.
      expect(() => {
        // biome-ignore lint/suspicious/noExplicitAny: sabotage delibere pour l'epreuve
        ;(store as any).kind = 'tenant'
      }).toThrow(TypeError)
      // La mutation a echoue : le store lu juste apres reste superadmin, pas tenant.
      expect(ctx.peek()).toEqual({ kind: 'superadmin' })
    })
  })

  // TOUR DE CORRECTION 4 (tache 1) — la re-revue a montre par execution que le gel du tour 3 etait
  // SUPERFICIEL : `Object.freeze` ne gele que l'enveloppe, donc `peek().tenant.establishmentId =
  // 'e9'` reussissait, survivait a une frontiere asynchrone, et repointait tout le contexte sur un
  // autre etablissement — alors que ce fichier et `runAsSystem-unicite.test.ts` declaraient la
  // porte « fermee ». Ces trois tests tiennent la fermeture complete : le tenant imbrique est gele
  // lui aussi, l'objet que le plugin pose sur `request.tenant` est le MEME (donc gele par la meme
  // occasion), et `Tenant` reste plat — sans quoi un gel a deux niveaux ne suffirait plus.
  it('gele aussi le tenant imbrique : repointer l etablissement echoue, avant comme apres un tick', async () => {
    const ctx = new TenantContext()
    await ctx.run({ ...tenant }, async () => {
      await Promise.resolve()
      const store = ctx.peek()
      expect(store?.kind).toBe('tenant')
      const tenantDuStore = store?.kind === 'tenant' ? store.tenant : undefined
      expect(Object.isFrozen(tenantDuStore)).toBe(true)
      expect(() => {
        // biome-ignore lint/suspicious/noExplicitAny: sabotage delibere pour l'epreuve
        ;(tenantDuStore as any).establishmentId = 'e9'
      }).toThrow(TypeError)
      expect(ctx.current().establishmentId).toBe('e1')
      // La porte exacte que la revue a exploitee : la mutation survivait a un tick asynchrone et
      // valait pour tout le reste de la portee.
      await Promise.resolve()
      expect(ctx.peek()).toEqual({ kind: 'tenant', tenant })
    })
  })

  it('gele l objet passe a enter — celui-la meme que le plugin pose sur request.tenant', () => {
    const ctx = new TenantContext()
    // `tenant.plugin.ts` fait `request.tenant = tenant` PUIS `tenantContext.enter(tenant)` : c'est
    // un seul objet, distribue a tous les handlers par `requireTenant`. Le muter par cette
    // reference repointait le contexte sans jamais appeler `peek()`.
    const tenantDeLaRequete = { ...tenant }
    ctx.enter(tenantDeLaRequete)
    expect(Object.isFrozen(tenantDeLaRequete)).toBe(true)
    expect(() => {
      // biome-ignore lint/suspicious/noExplicitAny: sabotage delibere pour l'epreuve
      ;(tenantDeLaRequete as any).establishmentId = 'e9'
    }).toThrow(TypeError)
    expect(ctx.current().establishmentId).toBe('e1')
    ctx.clear()
  })

  it('n a aucune colonne imbriquee : le gel a deux niveaux est donc total, et le restera ou rougira', () => {
    const ctx = new TenantContext()
    ctx.enter({ ...tenant })
    const valeurs = Object.values(ctx.current())
    // Une colonne de `Tenant` qui deviendrait un objet (ou un tableau) rendrait le gel de nouveau
    // superficiel sans que rien ne le signale : ce test est ce qui le signale.
    for (const valeur of valeurs) {
      expect(typeof valeur === 'object' && valeur !== null).toBe(false)
    }
    expect(valeurs).toHaveLength(6)
    ctx.clear()
  })

  it('runAsSuperAdmin et runAsSystem restent utilisables normalement malgre le gel (aucun appelant legitime ne mute le store)', async () => {
    const ctx = new TenantContext()
    // Les deux emplois legitimes de production lisent seulement le store (activityLog.repository.ts,
    // tenant-guard.ts) — reproduit ici par une lecture ordinaire, qui doit continuer a fonctionner
    // sans exception ni contournement.
    await ctx.runAsSystem(async () => {
      await Promise.resolve()
      expect(ctx.peek()).toEqual({ kind: 'system' })
    })
    await ctx.run(tenant, async () => {
      await Promise.resolve()
      expect(ctx.current().establishmentId).toBe('e1')
      expect(ctx.scope()).toEqual({ serviceId: 's1', establishmentId: 'e1' })
    })
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
