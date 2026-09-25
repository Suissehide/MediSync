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
  // `tenant-context.test.ts` pour la preuve par exécution). Gel superficiel seulement (`kind`,
  // et `tenant` comme référence) : aucun appelant connu ne mute un store après construction (les
  // deux emplois de `peek()` hors de ce fichier ne font que LIRE ses colonnes, voir
  // `activityLog.repository.ts`), donc rien ne casse.
  enter(tenant: Tenant): void {
    this.storage.enterWith(Object.freeze({ kind: 'tenant', tenant }))
  }

  clear(): void {
    this.storage.enterWith(undefined)
  }

  run<T>(tenant: Tenant, fn: () => Promise<T>): Promise<T> {
    return this.storage.run(Object.freeze({ kind: 'tenant', tenant }), fn)
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
