import Boom from '@hapi/boom'

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

  // Voir CONTRAT 2 sur l'interface (`AccessGrantRepositoryInterface.findForUser`) : élargir le
  // type de l'ancien appelant (`liveGrantsForUser`, deux champs puis neuf) ne fermait rien — un
  // littéral fabriqué prétendant `isSuperAdmin: true` pour l'id d'un compte
  // RÉELLEMENT démis de ce drapeau, mais encore titulaire d'un octroi non révoqué, faisait
  // ressortir cet octroi RÉEL. `liveGrantsForUser` ne porte donc plus ce champ du tout : la
  // vérité est rechargée ICI, fraîche, à CHAQUE appel — jamais acceptée d'un appelant. Lecture
  // PLATE, volontairement HORS de `runAsSuperAdmin` : `User` est un modèle global, il se lit
  // sans restriction supplémentaire quel que soit le contexte ambiant (spec §4.1) — entrer le
  // contexte superadmin seulement APRÈS cette vérification garde la même réduction de surface
  // que l'ancienne version (qui évitait d'y entrer pour un compte non super-admin), à la
  // différence que la décision n'est plus une PRÉTENTION mais un FAIT relu à l'instant. Coût
  // assumé : un aller-retour Postgres de plus, sur clé primaire, pour tout compte — le prix de
  // ne plus faire confiance à l'appelant sur ce point précis.
  //
  // `SuperAdminAccessGrant`, `Establishment` et `Service` sont trois modèles distincts
  // (le premier et le deuxième globaux, le troisième d'établissement) : un `include` imbriqué
  // depuis `SuperAdminAccessGrant` vers `establishment` ou vers les services de celui-ci
  // franchirait le pont global refusé sous superadmin (voir le commentaire au-dessus de
  // `SUPERADMIN_OPERATIONS`, `infra/orm/tenant-guard.ts`). Le contournement sûr qui y est
  // documenté : deux lectures séparées puis une jointure en mémoire — ici trois lectures
  // (l'octroi lui-même, l'établissement, ses services), toutes déclarées pour le contexte
  // superadmin (`SUPERADMIN_GLOBAL_OPERATIONS.SuperAdminAccessGrant`/`.Establishment`,
  // `SUPERADMIN_OPERATIONS.Service`).
  async findForUser(userId: string): Promise<LiveGrant[]> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { isSuperAdmin: true },
    })
    if (user?.isSuperAdmin !== true) {
      return []
    }
    return this.tenantContext.runAsSuperAdmin(async () => {
      const grants = await this.prisma.superAdminAccessGrant.findMany({
        where: { userId, revokedAt: null },
      })
      if (grants.length === 0) {
        return []
      }
      const establishmentIds = [
        ...new Set(grants.map((grant) => grant.establishmentId)),
      ]
      // Un établissement désactivé n'a plus lieu d'apparaître, octroi ou pas : même parti pris
      // que partout ailleurs dans le dépôt (« désactivé » est invisible).
      const establishments = await this.prisma.establishment.findMany({
        where: { id: { in: establishmentIds }, deactivatedAt: null },
      })
      const services = await this.prisma.service.findMany({
        where: {
          establishmentId: { in: establishmentIds },
          deactivatedAt: null,
        },
      })
      const establishmentById = new Map(establishments.map((e) => [e.id, e]))
      const servicesByEstablishment = new Map<
        string,
        { id: string; name: string }[]
      >()
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

  // Appelée par `SuperAdminGrantDomain.grant` avant d'écrire —
  // voir le commentaire sur l'interface pour la définition exacte de « vivant » ici (plus étroit
  // que `revokedAt: null` seul). `count` est déclarée pour `SuperAdminAccessGrant` sous le
  // contexte superadmin (`LECTURES_GLOBALES_SANS_MUTATION`, tenant-guard.ts).
  hasLiveGrant(
    userId: string,
    establishmentId: string,
    now: Date,
  ): Promise<boolean> {
    return this.tenantContext.runAsSuperAdmin(async () => {
      const count = await this.prisma.superAdminAccessGrant.count({
        where: {
          userId,
          establishmentId,
          revokedAt: null,
          expiresAt: { gt: now },
        },
      })
      return count > 0
    })
  }

  // `DELETE /super-admin/grants/:id` : `.update` (pas `.delete`, jamais déclarée — voir le
  // commentaire au-dessus de `SUPERADMIN_GLOBAL_OPERATIONS`) pose `revokedAt`, la ligne survit.
  // Voir le commentaire sur l'interface pour les deux points garantis ici :
  // restriction au titulaire, et préservation de la PREMIÈRE date de révocation.
  async revoke(id: string, callerId: string, at: Date): Promise<void> {
    await this.tenantContext.runAsSuperAdmin(async () => {
      const grant = await this.prisma.superAdminAccessGrant.findUnique({
        where: { id },
      })
      if (!grant || grant.userId !== callerId) {
        throw Boom.notFound()
      }
      if (grant.revokedAt !== null) {
        // Déjà révoqué : no-op, la PREMIÈRE date reste — voir le commentaire sur l'interface.
        return
      }
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
