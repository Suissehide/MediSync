import { AsyncLocalStorage } from 'node:async_hooks'

import type {
  ServiceTenant,
  Tenant,
  TenantContextInterface,
  TenantStore,
} from '../types/utils/tenant-context'
import { TenantContextMissingError } from './tenant-errors'

// Porte le tenant de la requête courante. `enter` est appelé par le hook
// onRequest du plugin tenant (même mécanisme que @fastify/request-context) ;
// `run` sert aux tests et aux traitements encadrés ; `runAsSystem` aux
// tâches hors requête (purge planifiée) ; `clear` referme la portée en tête
// de chaque requête.
//
// Le stockage est typé `TenantStore | undefined` : `enterWith` teinte le
// contexte asynchrone jusqu'à la fin de la chaîne, sans refermer sa portée.
// Sur un worker réutilisé, une requête sans tenant hériterait donc du tenant
// de la précédente. `clear()` pose explicitement l'absence de tenant, et le
// hook onRequest global (interfaces/http/fastify/routes/index.ts) l'appelle
// en toute première instruction : chaque requête démarre sans tenant.
class TenantContext implements TenantContextInterface {
  private readonly storage = new AsyncLocalStorage<TenantStore | undefined>()

  // TOUR DE CORRECTION 3 (tâche 1) — la revue a trouvé, par exécution, une porte que ni le nom
  // d'une méthode ni la forme d'un appel ne peuvent surveiller : muter en place l'objet que
  // `peek()`/`getStore()` renvoie (`const s = tenantContext.peek(); (s as any).kind =
  // 'superadmin'`) change le store que TOUT code lira ensuite dans la même portée asynchrone —
  // sans jamais appeler `run` ni `enterWith`. `Object.freeze` sur le store CONSTRUIT ICI, avant
  // qu'il n'entre dans le stockage, ferme cette porte à l'exécution plutôt que de se contenter de
  // la nommer comme irréductible : une mutation ultérieure échoue silencieusement en mode non
  // strict, ou lève un `TypeError` en mode strict (les modules ES le sont — voir
  // `tenant-context.test.ts` pour la preuve par exécution).
  //
  // TOUR DE CORRECTION 4 — ce gel était SUPERFICIEL, et la re-revue a montré par exécution que la
  // porte restait grande ouverte à côté : `Object.freeze` ne gèle que l'enveloppe, donc
  // `peek().tenant.establishmentId = 'e9'` réussissait, survivait à une frontière asynchrone, et
  // repointait TOUT le contexte sur un autre établissement — une lecture filtrée sur
  // l'établissement substitué passait alors le garde-fou. Pire que le trou : ce fichier et
  // `runAsSystem-unicite.test.ts` déclaraient cette porte « fermée ». Le `tenant` imbriqué est
  // donc gelé lui aussi. `Tenant` ne porte que des scalaires (voir types/utils/tenant-context.ts,
  // six colonnes : chaînes, ou `null`), donc ce second gel est TOTAL, pas un niveau de plus dans
  // une récursion inachevée — un test le tient (`tenant-context.test.ts`, « aucune colonne de
  // Tenant n'est un objet »), pour que l'ajout d'une colonne imbriquée fasse rougir plutôt que de
  // rouvrir la porte en silence.
  //
  // Vérifié dans l'autre sens, celui qui casse : aucun appelant ne mute un tenant. Les deux
  // emplois de `peek()` hors de ce fichier ne font que LIRE ses colonnes
  // (`activityLog.repository.ts`), `resolveTenantFromUser` (`tenant.plugin.ts`) construit un objet
  // NEUF à chaque requête, et `currentService()` plus bas en rend une copie étalée plutôt que de
  // l'amender. Le gel se propage volontairement à `request.tenant`, qui est le MÊME objet que
  // celui posé ici (`tenant.plugin.ts` : `request.tenant = tenant` puis `tenantContext.enter(tenant)`)
  // et que `requireTenant` distribue à tous les handlers : c'était l'autre chemin par lequel la
  // re-revue atteignait le store sans jamais appeler `peek()`.
  enter(tenant: Tenant): void {
    this.storage.enterWith(Object.freeze({ kind: 'tenant', tenant: Object.freeze(tenant) }))
  }

  clear(): void {
    this.storage.enterWith(undefined)
  }

  // Même gel, et pour la même raison, que `enter` ci-dessus : l'enveloppe ET le tenant.
  run<T>(tenant: Tenant, fn: () => Promise<T>): Promise<T> {
    return this.storage.run(Object.freeze({ kind: 'tenant', tenant: Object.freeze(tenant) }), fn)
  }

  peek(): TenantStore | undefined {
    return this.storage.getStore()
  }

  current(): Tenant {
    const store = this.storage.getStore()
    if (!store || store.kind !== 'tenant') {
      throw new TenantContextMissingError('no tenant in the current request')
    }
    return store.tenant
  }

  currentService(): ServiceTenant {
    const tenant = this.current()
    if (tenant.serviceId === null || tenant.serviceRole === null) {
      throw new TenantContextMissingError('no service in the current tenant')
    }
    return { ...tenant, serviceId: tenant.serviceId, serviceRole: tenant.serviceRole }
  }

  scope(): { serviceId: string; establishmentId: string } {
    const { serviceId, establishmentId } = this.currentService()
    return { serviceId, establishmentId }
  }

  establishmentScope(): { establishmentId: string } {
    return { establishmentId: this.current().establishmentId }
  }

  runAsSystem<T>(fn: () => Promise<T>): Promise<T> {
    return this.storage.run(Object.freeze({ kind: 'system' }), fn)
  }

  // Troisieme contexte du garde-fou (tache 1, etape 4a) : substitue au filtre de tenant une
  // liste declaree et exhaustive de couples (modele, operation) permis — voir
  // SUPERADMIN_OPERATIONS, infra/orm/tenant-guard.ts. Piege deja rencontre a l'etape 3, valable
  // ici a l'identique : une requete Prisma est paresseuse. `runAsSuperAdmin(() =>
  // prisma.x.count(...))` renvoie la promesse SANS l'attendre, l'execution part alors hors de la
  // portee du contexte, et l'extension lit le tenant ambiant. Toujours `await` A L'INTERIEUR du
  // rappel.
  runAsSuperAdmin<T>(fn: () => Promise<T>): Promise<T> {
    return this.storage.run(Object.freeze({ kind: 'superadmin' }), fn)
  }
}

export { TenantContext }
