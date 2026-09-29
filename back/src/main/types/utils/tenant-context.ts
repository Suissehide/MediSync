import type { EstablishmentRole, ServiceRole } from '../../utils/permissions'

export type Tenant = {
  userId: string
  establishmentId: string
  establishmentRole: EstablishmentRole
  serviceId: string | null
  serviceRole: ServiceRole | null
  soignantId: string | null
  // Optionnel a dessein (etape 4b, tache 2) : seule `resolveTenantFromUser`
  // (interfaces/http/fastify/plugins/tenant.plugin.ts) le pose, depuis
  // `EffectiveMembership.origine` (domain/accessGrant.domain.interface.ts) — le SEUL endroit qui
  // sait distinguer une appartenance reelle d'un octroi temporaire. Un `Tenant` construit
  // ailleurs (la grande majorite des fixtures de tests unitaires de ce depot, qui n'appellent
  // jamais cette fonction) n'a pas a le fournir ; `PatientAccessLogDomain.record` le lit et
  // traite son absence comme un acces reel plutot que comme un octroi — un defaut sur, jamais
  // l'inverse. Le rendre obligatoire aurait force une mise a jour de chaque fixture `Tenant` du
  // depot (plusieurs fichiers, aucun rapport avec les octrois) pour une information qu'un seul
  // appelant sait produire : cable etroit, plutot qu'un cablage large pour ce que cette tache ne
  // couvre pas.
  origine?: 'reelle' | 'octroi'
}

export type ServiceTenant = Tenant & {
  serviceId: string
  serviceRole: ServiceRole
}

export type TenantStore =
  | { kind: 'tenant'; tenant: Tenant }
  | { kind: 'system' }
  | { kind: 'superadmin' }

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
  runAsSuperAdmin<T>(fn: () => Promise<T>): Promise<T>
}
