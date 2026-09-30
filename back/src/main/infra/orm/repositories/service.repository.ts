import type { IocContainer } from '../../../types/application/ioc'
import type {
  ServiceCreateEntityRepo,
  ServiceEntityRepo,
  ServiceRepositoryInterface,
  ServiceUpdateEntityRepo,
} from '../../../types/infra/orm/repositories/service.repository.interface'
import type { ErrorHandlerInterface } from '../../../types/utils/error-handler'
import type { TenantContextInterface } from '../../../types/utils/tenant-context'
import type { PostgresPrismaClient } from '../postgres-client'

// Famille établissement (ESTABLISHMENT_MODELS, tenant-guard.ts) : `Service` et
// `ServiceMembership` portent tous deux `establishmentId`, aucun des deux n'exige de service
// courant — c'est ce qui rend cette classe utilisable depuis l'administration d'établissement
// (`serviceId` null dans le tenant), sans détour par `runAsSystem` ni par aucun mode encadré.
class ServiceRepository implements ServiceRepositoryInterface {
  private readonly prisma: PostgresPrismaClient
  private readonly errorHandler: ErrorHandlerInterface
  private readonly tenantContext: TenantContextInterface

  constructor({ postgresOrm, errorHandler, tenantContext }: IocContainer) {
    this.prisma = postgresOrm.prisma
    this.errorHandler = errorHandler
    this.tenantContext = tenantContext
  }

  private get establishmentScope() {
    return this.tenantContext.establishmentScope()
  }

  findAll(): Promise<ServiceEntityRepo[]> {
    return this.prisma.service.findMany({
      where: this.establishmentScope,
      orderBy: { createdAt: 'asc' },
    })
  }

  async findByID(serviceID: string): Promise<ServiceEntityRepo> {
    try {
      return await this.prisma.service.findUniqueOrThrow({
        where: {
          id_establishmentId: { id: serviceID, ...this.establishmentScope },
        },
      })
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({
        entityName: 'Service',
        error: err,
      })
    }
  }

  // Décision 3.2 (spec §3.2) : créer un service y rattache son créateur, comme COORDINATEUR.
  // `Service.create` et `ServiceMembership.create` (quand elle a lieu, voir plus bas) sont
  // réunis dans une seule transaction — sans elle, un échec entre les deux laisserait un service
  // neuf sans aucun coordinateur, le cul-de-sac exact que la décision existe pour éviter.
  // `creatorUserId` vient du tenant courant (`ServiceDomain.create`, jamais du corps de la
  // requête) : le créateur ne choisit pas qui devient coordinateur, c'est toujours lui-même.
  //
  // Sous un octroi temporaire (spec §4.3),
  // l'acteur est un membre ordinaire de l'établissement au sens des permissions, mais AUCUNE
  // `EstablishmentMembership` réelle n'est, ni ne doit être, créée — l'octroi est évalué à
  // chaque requête, jamais matérialisé (spec §4.3 : « pas de rattachement réel, sans quoi il
  // survivrait à l'expiration »). `findUniqueOrThrow` faisait donc échouer la création elle-même
  // sous un octroi (aucune ligne à trouver), une brèche dans l'invariant central (un octroi ne
  // doit jamais faire diverger le chemin d'écriture du chemin de lecture). Remède : `findFirst`,
  // qui ne suppose plus rien. Trouvée (acteur réellement
  // membre), on rattache (décision 3.2 s'applique). Absente (acteur sous octroi), on NE rattache
  // rien — il a déjà accès à tous les services actifs de l'établissement par son octroi, et un
  // rattachement réel survivrait précisément à ce que l'octroi doit borner dans le temps ; le
  // service se crée quand même, sans coordinateur ajouté.
  //
  // CONSEQUENCE A CONNAITRE : un service créé sous octroi naît
  // donc SANS AUCUN MEMBRE, et le reste DÉFINITIVEMENT — passée l'expiration de l'octroi qui l'a
  // créé, plus personne ne le rejoint automatiquement (voir le test e2e d'expiration,
  // `services.test.ts` : le service persiste, actif, mais inatteignable par son créateur). Ce
  // n'est pas un défaut à corriger ici : un administrateur RÉEL de l'établissement le voit dans
  // la liste (`findAll`) et peut y ajouter un membre par les routes existantes
  // (`/e/:establishmentId/admin/members`) — mais rien ne le fait pour lui. `findFirst({
  // establishmentId, ... })` (et non un simple `{ userId }`) est aussi ce qui empêche un
  // super-admin réellement membre non-administrateur d'un AUTRE établissement, agissant ici sous
  // octroi, de voir la recherche matcher SON appartenance là-bas et y rattacher — à tort — un
  // `ServiceMembership` du service qu'il vient de créer ICI : un rattachement permanent et faux,
  // qui aurait survécu à l'expiration de l'octroi. Éprouvé par exécution (`services.test.ts`) :
  // sans le filtre d'établissement, le garde-fou d'ORM refuse même la lecture (500, modèle
  // d'établissement lu sans sa borne) plutôt que de laisser filer un mauvais rattachement en
  // silence — mais une création de service ne doit dépendre, pour réussir, d'aucune appartenance
  // sur un AUTRE établissement, encore moins échouer à cause d'elle. La borne explicite est donc
  // ce qui rend la requête correcte dans les DEUX régimes : avec le garde-fou (qui la rendrait de
  // toute façon obligatoire) et sans lui (où elle resterait la seule chose à empêcher le
  // mauvais rattachement).
  async create(
    { name }: ServiceCreateEntityRepo,
    creatorUserId: string,
  ): Promise<ServiceEntityRepo> {
    const { establishmentId } = this.establishmentScope
    try {
      return await this.prisma.$transaction(async (tx) => {
        const service = await tx.service.create({
          data: { name, establishmentId },
        })
        const membership = await tx.establishmentMembership.findFirst({
          where: { userId: creatorUserId, establishmentId },
        })
        if (membership) {
          await tx.serviceMembership.create({
            data: {
              establishmentMembershipId: membership.id,
              serviceId: service.id,
              establishmentId,
              role: 'COORDINATEUR',
            },
          })
        }
        return service
      })
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({
        entityName: 'Service',
        error: err,
      })
    }
  }

  async update(
    serviceID: string,
    serviceUpdateParams: ServiceUpdateEntityRepo,
  ): Promise<ServiceEntityRepo> {
    try {
      return await this.prisma.service.update({
        where: {
          id_establishmentId: { id: serviceID, ...this.establishmentScope },
        },
        data: serviceUpdateParams,
      })
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({
        entityName: 'Service',
        error: err,
      })
    }
  }
}

export { ServiceRepository }
