import type { Tenant } from '../../../main/types/utils/tenant-context'
import { TenantContext } from '../../../main/utils/tenant-context'
import { TenantContextMissingError } from '../../../main/utils/tenant-errors'

const tenant: Tenant = {
  userId: 'u1',
  establishmentId: 'e1',
  establishmentRole: 'MEMBER',
  serviceId: 's1',
  serviceRole: 'INTERVENANT',
  soignantId: null,
}

// Mimique une requete Prisma reelle : rien ne se passe a la CONSTRUCTION de l'objet rendu par
// `client.modele.operation(args)`, seul un `.then()` ulterieur (ce que `await` fait) declenche le
// travail — ici, lire le store ALS ambiant au moment ou ce travail a lieu reellement. C'est cette
// paresse, pas `Promise.resolve()` (deja regle des la construction), qui reproduit fidelement le
// mecanisme mesure sur le vrai depot sans toucher a une vraie base.
class RequetePrismaFictive {
  private readonly lireStore: () => unknown
  constructor(lireStore: () => unknown) {
    this.lireStore = lireStore
  }
  // biome-ignore lint/suspicious/noThenProperty: thenable volontaire, imite la paresse d'une requete Prisma
  then(resolve: (valeur: unknown) => void): void {
    resolve(this.lireStore())
  }
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
    await ctx.run(
      { ...tenant, serviceId: null, serviceRole: null },
      async () => {
        await Promise.resolve()
        expect(() => ctx.currentService()).toThrow(TenantContextMissingError)
        expect(ctx.establishmentScope()).toEqual({ establishmentId: 'e1' })
      },
    )
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

  // Meme forme que runAsSystem ci-dessus, pour le troisieme contexte.
  it('runAsSuperAdmin pose le marqueur superadmin', async () => {
    const ctx = new TenantContext()
    await ctx.runAsSuperAdmin(async () => {
      await Promise.resolve()
      expect(ctx.peek()).toEqual({ kind: 'superadmin' })
      expect(() => ctx.current()).toThrow(TenantContextMissingError)
    })
    expect(ctx.peek()).toBeUndefined()
  })

  // CE QUE CE TEST VERIFIE : contrairement a l'intuition, le `await` A L'INTERIEUR du rappel
  // n'est PAS ce qui tient la portee du contexte. Mesure par execution (sabotage sur un appelant
  // reel, `PatientAccessLogRepository.findAllPlatformWide`) : les trois cas suivants, avec la
  // MEME requete paresseuse (`RequetePrismaFictive`, qui ne lit le store qu'a l'instant ou `.then()`
  // est reellement invoque — exactement le "Prisma est paresseux" repete partout ailleurs dans
  // ce depot) :
  //   - rappel `async` SANS aucun `await` interne -> contexte CORRECT ;
  //   - rappel `async` AVEC un `await` interne (la convention ecrite partout) -> contexte CORRECT ;
  //   - rappel SYNCHRONE NU (pas de `async` du tout) -> contexte PERDU.
  // Ce qui tient la propriete est donc l'ENROBAGE `async` du rappel, pas le mot-cle `await`
  // lui-meme : une fonction `async` qui REND une valeur "thenable" la fait passer par une
  // resolution de promesse que Node associe a la portee `AsyncLocalStorage` active au moment de
  // l'appel — exactement comme le ferait un `await` explicite. Voir le commentaire de
  // `runAsSuperAdmin` (utils/tenant-context.ts) pour la regle complete, y compris pourquoi
  // l'`await` interne reste neanmoins la convention du depot (Biome `suspicious/useAwait`,
  // lisibilite) — jamais parce qu'il tiendrait a lui seul cette propriete-ci.
  it('runAsSuperAdmin : c est l enrobage async du rappel qui tient le contexte face a une requete paresseuse, jamais le mot-cle await', async () => {
    const ctx = new TenantContext()

    // biome-ignore lint/suspicious/useAwait: l'absence d'await interne est precisement ce que ce cas eprouve
    const sansAwaitInterne = await ctx.runAsSuperAdmin(async () => {
      return new RequetePrismaFictive(() => ctx.peek())
    })
    expect(sansAwaitInterne).toEqual({ kind: 'superadmin' })

    const avecAwaitInterne = await ctx.runAsSuperAdmin(async () => {
      return await new RequetePrismaFictive(() => ctx.peek())
    })
    expect(avecAwaitInterne).toEqual({ kind: 'superadmin' })

    // Rappel volontairement SANS `async` : le point de ce cas est precisement son absence.
    const rappelSynchroneNu = () => new RequetePrismaFictive(() => ctx.peek())
    const contexteAppelSynchrone = await ctx.runAsSuperAdmin(rappelSynchroneNu)
    expect(contexteAppelSynchrone).toBeUndefined()
  })

  // Muter en place l'objet rendu par `peek()` est une porte d'entree dans un mode non-tenant
  // qu'aucune analyse de source ne peut surveiller (voir runAsSystem-unicite.test.ts). Le remede
  // choisi n'est pas une declaration de cette limite, mais une fermeture a l'execution : le store
  // est gele (`Object.freeze`) avant d'entrer dans le stockage. Preuve par execution, dans les
  // deux sens : que ca ne casse pas un appelant legitime (la lecture continue de fonctionner), et
  // que ca ferme reellement la porte (la mutation leve, elle ne reussit jamais silencieusement).
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

  // Le gel simple de l'enveloppe est SUPERFICIEL : `Object.freeze` ne gele que l'enveloppe, donc
  // `peek().tenant.establishmentId = 'e9'` reussirait, survivrait a une frontiere asynchrone, et
  // repointerait tout le contexte sur un autre etablissement. Ces trois tests tiennent la
  // fermeture complete : le tenant imbrique est gele lui aussi, l'objet que le plugin pose sur
  // `request.tenant` est le MEME (donc gele par la meme occasion), et `Tenant` reste plat — sans
  // quoi un gel a deux niveaux ne suffirait plus.
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
      // La porte precise ici : la mutation survivait a un tick asynchrone et valait pour tout le
      // reste de la portee.
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
