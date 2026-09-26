import type { IocContainer } from '../../../types/application/ioc'
import type { LiveGrant } from '../../../types/domain/accessGrant.domain.interface'
import type {
  AccessGrantRepositoryInterface,
  CreateGrantRepo,
  EstablishmentGrantRow,
  SuperAdminGrantEntityRepo,
} from '../../../types/infra/orm/repositories/accessGrant.repository.interface'
import type { ErrorHandlerInterface } from '../../../types/utils/error-handler'
import type { TenantContextInterface } from '../../../types/utils/tenant-context'
import type { PostgresPrismaClient } from '../postgres-client'

class AccessGrantRepository implements AccessGrantRepositoryInterface {
  private readonly prisma: PostgresPrismaClient
  private readonly tenantContext: TenantContextInterface
  private readonly errorHandler: ErrorHandlerInterface

  constructor({ postgresOrm, tenantContext, errorHandler }: IocContainer) {
    this.prisma = postgresOrm.prisma
    this.tenantContext = tenantContext
    this.errorHandler = errorHandler
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

  // `POST /super-admin/grants` : `SuperAdminAccessGrant.create` n'est déclarée que sous le
  // contexte superadmin (SUPERADMIN_GLOBAL_OPERATIONS, tenant-guard.ts) — cette route n'a de
  // toute façon aucun tenant ambiant (préfixe `/super-admin`, aucun `:establishmentId` d'URL).
  create(params: CreateGrantRepo): Promise<SuperAdminGrantEntityRepo> {
    return this.tenantContext.runAsSuperAdmin(async () => {
      try {
        return await this.prisma.superAdminAccessGrant.create({ data: params })
      } catch (err) {
        throw this.errorHandler.boomErrorFromPrismaError({
          entityName: 'SuperAdminAccessGrant',
          error: err,
        })
      }
    })
  }

  // `DELETE /super-admin/grants/:id` : `.update` (pas `.delete`, jamais déclarée — voir le
  // commentaire au-dessus de `SUPERADMIN_GLOBAL_OPERATIONS`) pose `revokedAt`, la ligne survit.
  // Lève 404 (P2025, via `errorHandler`) si l'id est inconnu.
  async revoke(id: string, at: Date): Promise<void> {
    await this.tenantContext.runAsSuperAdmin(async () => {
      try {
        await this.prisma.superAdminAccessGrant.update({
          where: { id },
          data: { revokedAt: at },
        })
      } catch (err) {
        throw this.errorHandler.boomErrorFromPrismaError({
          entityName: 'SuperAdminAccessGrant',
          error: err,
        })
      }
    })
  }

  // `GET /e/:establishmentId/admin/grants` : appelée depuis une route déjà sous contexte tenant
  // RÉEL (`resolveEstablishmentAdmin`) — pas de `runAsSuperAdmin` ici, voir le commentaire sur
  // `findForEstablishment` (types/infra/orm/repositories/accessGrant.repository.interface.ts).
  // `include: { user }` est sûr : `SuperAdminAccessGrant.user -> User` est déclarée dans
  // MODEL_RELATIONS (global -> global), et la restriction qui refuserait de franchir ce pont
  // (`assertNoGlobalBridgeUnderSuperAdmin`) ne s'applique qu'au contexte superadmin — jamais au
  // contexte tenant ordinaire d'où cette lecture part. `establishmentId` vient de
  // `tenantContext.establishmentScope()`, jamais d'un argument que l'appelant pourrait fournir.
  findForEstablishment(): Promise<EstablishmentGrantRow[]> {
    const { establishmentId } = this.tenantContext.establishmentScope()
    return this.prisma.superAdminAccessGrant
      .findMany({
        where: { establishmentId },
        orderBy: { grantedAt: 'desc' },
        include: {
          user: {
            select: { id: true, email: true, firstName: true, lastName: true },
          },
        },
      })
      .then((rows) =>
        rows.map((row) => ({
          id: row.id,
          reason: row.reason,
          grantedAt: row.grantedAt,
          expiresAt: row.expiresAt,
          revokedAt: row.revokedAt,
          grantedBy: row.user,
        })),
      )
  }
}

export { AccessGrantRepository }
