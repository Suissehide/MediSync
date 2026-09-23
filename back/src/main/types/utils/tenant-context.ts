import type { EstablishmentRole, ServiceRole } from '../../utils/permissions'

export type Tenant = {
  userId: string
  establishmentId: string
  establishmentRole: EstablishmentRole
  serviceId: string | null
  serviceRole: ServiceRole | null
  soignantId: string | null
}

export type ServiceTenant = Tenant & { serviceId: string; serviceRole: ServiceRole }

export type TenantStore = { kind: 'tenant'; tenant: Tenant } | { kind: 'system' }

export interface TenantContextInterface {
  enter(tenant: Tenant): void
  // Referme la portée du tenant : toute opération sur un modèle de tenant
  // est refusée jusqu'au prochain `enter`.
  clear(): void
  run<T>(tenant: Tenant, fn: () => Promise<T>): Promise<T>
  peek(): TenantStore | undefined
  current(): Tenant
  currentService(): ServiceTenant
  scope(): { serviceId: string; establishmentId: string }
  establishmentScope(): { establishmentId: string }
  runAsSystem<T>(fn: () => Promise<T>): Promise<T>
}
