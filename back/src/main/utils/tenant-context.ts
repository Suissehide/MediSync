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

  enter(tenant: Tenant): void {
    this.storage.enterWith({ kind: 'tenant', tenant })
  }

  clear(): void {
    this.storage.enterWith(undefined)
  }

  run<T>(tenant: Tenant, fn: () => Promise<T>): Promise<T> {
    return this.storage.run({ kind: 'tenant', tenant }, fn)
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
    return this.storage.run({ kind: 'system' }, fn)
  }

  // Troisieme contexte du garde-fou (tache 1, etape 4a) : substitue au filtre de tenant une
  // liste declaree et exhaustive de couples (modele, operation) permis — voir
  // SUPERADMIN_OPERATIONS, infra/orm/tenant-guard.ts. Piege deja rencontre a l'etape 3, valable
  // ici a l'identique : une requete Prisma est paresseuse. `runAsSuperAdmin(() =>
  // prisma.x.count(...))` renvoie la promesse SANS l'attendre, l'execution part alors hors de la
  // portee du contexte, et l'extension lit le tenant ambiant. Toujours `await` A L'INTERIEUR du
  // rappel.
  runAsSuperAdmin<T>(fn: () => Promise<T>): Promise<T> {
    return this.storage.run({ kind: 'superadmin' }, fn)
  }
}

export { TenantContext }
