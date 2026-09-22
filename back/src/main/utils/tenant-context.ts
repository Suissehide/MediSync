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
// tâches hors requête (purge planifiée).
class TenantContext implements TenantContextInterface {
  private readonly storage = new AsyncLocalStorage<TenantStore>()

  enter(tenant: Tenant): void {
    this.storage.enterWith({ kind: 'tenant', tenant })
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
}

export { TenantContext }
