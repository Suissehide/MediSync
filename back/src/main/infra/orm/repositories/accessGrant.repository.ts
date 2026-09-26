import type { IocContainer } from '../../../types/application/ioc'
import type { LiveGrant } from '../../../types/domain/accessGrant.domain.interface'
import type { AccessGrantRepositoryInterface } from '../../../types/infra/orm/repositories/accessGrant.repository.interface'
import type { TenantContextInterface } from '../../../types/utils/tenant-context'
import type { PostgresPrismaClient } from '../postgres-client'

class AccessGrantRepository implements AccessGrantRepositoryInterface {
  private readonly prisma: PostgresPrismaClient
  private readonly tenantContext: TenantContextInterface

  constructor({ postgresOrm, tenantContext }: IocContainer) {
    this.prisma = postgresOrm.prisma
    this.tenantContext = tenantContext
  }

  // `SuperAdminAccessGrant`, `Establishment` et `Service` sont trois modèles distincts
  // (le premier et le deuxième globaux, le troisième d'établissement) : un `include` imbriqué
  // depuis `SuperAdminAccessGrant` vers `establishment` ou vers les services de celui-ci
  // franchirait le pont global refusé sous superadmin (voir le commentaire au-dessus de
  // `SUPERADMIN_OPERATIONS`, `infra/orm/tenant-guard.ts`). Le contournement sûr qui y est
  // documenté : deux lectures séparées puis une jointure en mémoire — ici trois lectures
  // (l'octroi lui-même, l'établissement, ses services), toutes déclarées pour le contexte
  // superadmin (`SUPERADMIN_GLOBAL_OPERATIONS.SuperAdminAccessGrant`/`.Establishment`,
  // `SUPERADMIN_OPERATIONS.Service`).
  findForUser(userId: string): Promise<LiveGrant[]> {
    return this.tenantContext.runAsSuperAdmin(async () => {
      const grants = await this.prisma.superAdminAccessGrant.findMany({
        where: { userId, revokedAt: null },
      })
      if (grants.length === 0) {
        return []
      }
      const establishmentIds = [...new Set(grants.map((grant) => grant.establishmentId))]
      // Un établissement désactivé n'a plus lieu d'apparaître, octroi ou pas : même parti pris
      // que partout ailleurs dans le dépôt (« désactivé » est invisible).
      const establishments = await this.prisma.establishment.findMany({
        where: { id: { in: establishmentIds }, deactivatedAt: null },
      })
      const services = await this.prisma.service.findMany({
        where: { establishmentId: { in: establishmentIds }, deactivatedAt: null },
      })
      const establishmentById = new Map(establishments.map((e) => [e.id, e]))
      const servicesByEstablishment = new Map<string, { id: string; name: string }[]>()
      for (const service of services) {
        const liste = servicesByEstablishment.get(service.establishmentId) ?? []
        liste.push({ id: service.id, name: service.name })
        servicesByEstablishment.set(service.establishmentId, liste)
      }
      return grants.flatMap((grant): LiveGrant[] => {
        const establishment = establishmentById.get(grant.establishmentId)
        if (!establishment) {
          return []
        }
        return [
          {
            establishmentId: grant.establishmentId,
            establishmentName: establishment.name,
            expiresAt: grant.expiresAt,
            revokedAt: grant.revokedAt,
            services: servicesByEstablishment.get(grant.establishmentId) ?? [],
          },
        ]
      })
    })
  }
}

export { AccessGrantRepository }
