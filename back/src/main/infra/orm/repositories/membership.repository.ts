import type { ServiceRole } from '../../../../generated/enums'
import type { IocContainer } from '../../../types/application/ioc'
import type { PrimaTransactionClient } from '../../../types/infra/orm/client'
import type {
  MembershipCreateRepo,
  MembershipRepositoryInterface,
  MembershipRow,
  MembershipUpdateRepo,
  ServiceMemberRow,
} from '../../../types/infra/orm/repositories/membership.repository.interface'
import type { ErrorHandlerInterface } from '../../../types/utils/error-handler'
import type { TenantContextInterface } from '../../../types/utils/tenant-context'
import type { PostgresPrismaClient } from '../postgres-client'

// Famille établissement : EstablishmentMembership porte establishmentId.
//
// Note sur les `include` (règle B) :
// - `user` mène au modèle global User, par la clé étrangère simple `userId`.
//   La relation est à un seul enregistrement, lue depuis une ligne déjà
//   filtrée par établissement : Prisma ne peut ramener que l'identité
//   précise déjà rattachée. Le `select` n'expose ni `password` ni `salt`.
// - `serviceMemberships` mène à ServiceMembership (même famille), par la clé
//   étrangère simple `establishmentMembershipId` : elle ne porte pas la
//   colonne de tenant, donc la relation reçoit un filtre explicite sur
//   `establishmentId` plutôt qu'une justification.
class MembershipRepository implements MembershipRepositoryInterface {
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

  // Les membres d'un SERVICE (2026-09-29), lus sous le contexte de ce service : `scope()` porte
  // establishmentId (le filtre qu'exige cette famille) ET serviceId (le service courant). Meme
  // regle B que ci-dessus pour `user` : une identite precise, sans `password` ni `salt`.
  private readonly serviceMemberSelect = {
    id: true,
    establishmentMembershipId: true,
    role: true,
    soignantId: true,
    establishmentMembership: {
      select: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            deactivatedAt: true,
            lastLoginAt: true,
          },
        },
      },
    },
  } as const

  findServiceMembers(): Promise<ServiceMemberRow[]> {
    const { establishmentId, serviceId } = this.tenantContext.scope()
    return this.prisma.serviceMembership.findMany({
      where: { establishmentId, serviceId },
      select: this.serviceMemberSelect,
      orderBy: { createdAt: 'asc' },
    })
  }

  async setServiceSoignant(
    serviceMembershipId: string,
    soignantId: string | null,
  ): Promise<ServiceMemberRow | null> {
    const { establishmentId, serviceId } = this.tenantContext.scope()
    const where = { id: serviceMembershipId, establishmentId, serviceId }
    const { count } = await this.prisma.serviceMembership.updateMany({
      where,
      data: { soignantId },
    })
    if (count === 0) {
      return null
    }
    return this.prisma.serviceMembership.findFirst({
      where,
      select: this.serviceMemberSelect,
    })
  }

  findServiceMemberByID(
    serviceMembershipId: string,
  ): Promise<ServiceMemberRow | null> {
    const { establishmentId, serviceId } = this.tenantContext.scope()
    return this.prisma.serviceMembership.findFirst({
      where: { id: serviceMembershipId, establishmentId, serviceId },
      select: this.serviceMemberSelect,
    })
  }

  findServiceMemberByMembership(
    establishmentMembershipId: string,
  ): Promise<ServiceMemberRow | null> {
    const { establishmentId, serviceId } = this.tenantContext.scope()
    return this.prisma.serviceMembership.findFirst({
      where: { establishmentMembershipId, establishmentId, serviceId },
      select: this.serviceMemberSelect,
    })
  }

  // `client` optionnel, meme raison que `create` plus bas : l'affectation d'un compte
  // fraichement cree partage le sort de sa creation et de l'emission de son lien.
  async addServiceMember(
    establishmentMembershipId: string,
    role: ServiceRole,
    client: PrimaTransactionClient = this.prisma,
  ): Promise<ServiceMemberRow> {
    const { establishmentId, serviceId } = this.tenantContext.scope()
    try {
      return await client.serviceMembership.create({
        data: { establishmentMembershipId, serviceId, establishmentId, role },
        select: this.serviceMemberSelect,
      })
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({
        entityName: 'ServiceMembership',
        error: err,
      })
    }
  }

  async setServiceRole(
    serviceMembershipId: string,
    role: ServiceRole,
  ): Promise<ServiceMemberRow | null> {
    const { establishmentId, serviceId } = this.tenantContext.scope()
    const where = { id: serviceMembershipId, establishmentId, serviceId }
    const { count } = await this.prisma.serviceMembership.updateMany({
      where,
      data: { role },
    })
    if (count === 0) {
      return null
    }
    return this.prisma.serviceMembership.findFirst({
      where,
      select: this.serviceMemberSelect,
    })
  }

  async deleteServiceMember(serviceMembershipId: string): Promise<void> {
    const { establishmentId, serviceId } = this.tenantContext.scope()
    await this.prisma.serviceMembership.deleteMany({
      where: { id: serviceMembershipId, establishmentId, serviceId },
    })
  }

  private get rowInclude() {
    const { establishmentId } = this.establishmentScope
    return {
      user: {
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          deactivatedAt: true,
          lastLoginAt: true,
        },
      },
      serviceMemberships: {
        where: { establishmentId },
        select: { serviceId: true, role: true },
      },
    } as const
  }

  findAll(): Promise<MembershipRow[]> {
    return this.prisma.establishmentMembership.findMany({
      where: this.establishmentScope,
      include: this.rowInclude,
      orderBy: { createdAt: 'asc' },
    })
  }

  async findByID(id: string): Promise<MembershipRow> {
    try {
      return await this.prisma.establishmentMembership.findUniqueOrThrow({
        where: { id_establishmentId: { id, ...this.establishmentScope } },
        include: this.rowInclude,
      })
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({
        entityName: 'Membership',
        error: err,
      })
    }
  }

  findByUserID(userId: string): Promise<MembershipRow | null> {
    return this.prisma.establishmentMembership.findFirst({
      where: { userId, ...this.establishmentScope },
      include: this.rowInclude,
    })
  }

  // Seuls les administrateurs encore actifs comptent : un compte désactivé ne
  // peut plus administrer l'établissement.
  countAdmins(): Promise<number> {
    return this.prisma.establishmentMembership.count({
      where: {
        ...this.establishmentScope,
        role: 'ADMIN',
        user: { deactivatedAt: null },
      },
    })
  }

  // « CE COMPTE EST-IL RATTACHE AILLEURS ? », UN BOOLEEN ET RIEN D'AUTRE.
  //
  // CE QU'ELLE REMPLACE. `MembershipDomain` lisait `UserRepository.findByID`, qui embarque
  // l'arbre COMPLET des appartenances du compte — tous etablissements confondus, avec leur nom et
  // leurs services — pour n'en garder qu'un `length` ou un `filter(...).length > 0`. Cette
  // lecture-la repart du modele GLOBAL `User` par une relation A-PLUSIEURS, et c'est le pont que
  // cette methode ferme sur le chemin de tenant (`assertNoGlobalToManyBridge`, tenant-guard.ts).
  // La question elle-meme reste legitime — `User.deactivatedAt` et un lien d'acces sont GLOBAUX,
  // donc agir dessus depuis un etablissement toucherait les autres, et c'est precisement ce que
  // les gardes appelantes refusent. Mais elle se pose en rendant UN BOOLEEN, jamais un
  // identifiant, un nom d'etablissement ni une date : ce qui traverse la frontiere passe de
  // l'arbre entier a un bit.
  //
  // POURQUOI `runAsSystem`, et pourquoi ce n'est pas un contournement du resserrement. La
  // question porte, par nature, sur les etablissements AUTRES que le courant : aucune requete
  // bornee au tenant courant ne peut y repondre, et le garde-fou refuse a juste titre un
  // `establishmentId: { not: … }` sous un contexte de tenant (prouve dans
  // `repository-scope.test.ts`, qui verifie aussi les BORNES de cette requete — ce fichier-la, pas
  // `runAsSystem-unicite.test.ts`, qui ne garde que la CAPACITE). C'est exactement la forme de
  // `PatientServiceFileRepository.estSuiviAilleurs` : une traversee declaree, nommee, bornee, qui
  // ne rend qu'un agregat. Cinquieme emploi declare du mode systeme ; voir
  // `runAsSystem-unicite.test.ts` pour l'enumeration.
  //
  // PIEGE DU DEPOT : Prisma est paresseux. L'etablissement courant est lu AVANT d'entrer dans le
  // mode encadre (`current()` y leverait, le store n'y etant plus de type tenant), et la requete
  // est `await`ee A L'INTERIEUR du rappel — sans quoi elle partirait hors de la portee du
  // contexte et le garde-fou lirait le tenant ambiant.
  async estRattacheAilleurs(userId: string): Promise<boolean> {
    const { establishmentId } = this.establishmentScope
    return await this.tenantContext.runAsSystem(async () => {
      const count = await this.prisma.establishmentMembership.count({
        where: { userId, establishmentId: { not: establishmentId } },
      })
      return count > 0
    })
  }

  async serviceExists(serviceId: string): Promise<boolean> {
    const count = await this.prisma.service.count({
      where: { id: serviceId, ...this.establishmentScope, deactivatedAt: null },
    })
    return count > 0
  }

  // `client` optionnel : voir le commentaire équivalent sur
  // `UserRepositoryInterface.create`. Sert à inscrire le rattachement dans la MÊME
  // transaction que la création du compte et l'émission du lien.
  async create(
    { services, ...params }: MembershipCreateRepo,
    client: PrimaTransactionClient = this.prisma,
  ): Promise<MembershipRow> {
    const { establishmentId } = this.establishmentScope
    try {
      return await client.establishmentMembership.create({
        data: {
          ...params,
          establishmentId,
          serviceMemberships: {
            create: services.map((service) => ({
              serviceId: service.serviceId,
              role: service.role,
              establishmentId,
            })),
          },
        },
        include: this.rowInclude,
      })
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({
        entityName: 'Membership',
        error: err,
      })
    }
  }

  async update(
    id: string,
    { services, ...params }: MembershipUpdateRepo,
  ): Promise<MembershipRow> {
    const { establishmentId } = this.establishmentScope
    const include = this.rowInclude
    try {
      return await this.prisma.$transaction(async (tx) => {
        // Vérifie l'appartenance à l'établissement courant avant de toucher
        // aux affectations de service.
        await tx.establishmentMembership.findUniqueOrThrow({
          where: { id_establishmentId: { id, establishmentId } },
        })
        if (services) {
          // Retirer, mettre a jour ou ajouter, jamais tout effacer puis tout recreer : une
          // affectation conservee garde son rattachement a un soignant du service
          // (`ServiceMembership.soignantId`, regle par le coordinateur), que l'ecran des membres
          // de l'etablissement ne connait pas et ne renvoie donc pas.
          const existantes = await tx.serviceMembership.findMany({
            where: { establishmentMembershipId: id, establishmentId },
            select: { serviceId: true },
          })
          const voulues = new Set(services.map((service) => service.serviceId))
          const retirees = existantes
            .map((a) => a.serviceId)
            .filter((serviceId) => !voulues.has(serviceId))
          if (retirees.length > 0) {
            await tx.serviceMembership.deleteMany({
              where: {
                establishmentMembershipId: id,
                establishmentId,
                serviceId: { in: retirees },
              },
            })
          }
          const deja = new Set(existantes.map((a) => a.serviceId))
          for (const service of services) {
            if (deja.has(service.serviceId)) {
              await tx.serviceMembership.updateMany({
                where: {
                  establishmentMembershipId: id,
                  establishmentId,
                  serviceId: service.serviceId,
                },
                data: { role: service.role },
              })
            } else {
              await tx.serviceMembership.create({
                data: {
                  establishmentMembershipId: id,
                  serviceId: service.serviceId,
                  role: service.role,
                  establishmentId,
                },
              })
            }
          }
        }
        return await tx.establishmentMembership.update({
          where: { id_establishmentId: { id, establishmentId } },
          data: params,
          include,
        })
      })
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({
        entityName: 'Membership',
        error: err,
      })
    }
  }

  async delete(id: string): Promise<void> {
    const { establishmentId } = this.establishmentScope
    await this.prisma.establishmentMembership.deleteMany({
      where: { id, establishmentId },
    })
  }
}

export { MembershipRepository }
