import type { Prisma } from '../../../../generated/client'
import type { IocContainer } from '../../../types/application/ioc'
import type {
  PdfDesignPresetCreateEntityRepo,
  PdfDesignPresetEntityRepo,
  PdfDesignPresetRepositoryInterface,
  PdfDesignPresetUpdateEntityRepo,
} from '../../../types/infra/orm/repositories/pdf-design-preset.repository.interface'
import type { ErrorHandlerInterface } from '../../../types/utils/error-handler'
import type { TenantContextInterface } from '../../../types/utils/tenant-context'
import type { PostgresPrismaClient } from '../postgres-client'

// UN DEPOT A PART, et non deux methodes de plus dans `pdf-design.repository.ts` : celui-la lit
// les memes lignes sous contexte de TENANT, ou un modele global passe sans filtre. Encadrer ses
// methodes casserait ce chemin-la.
//
// Ici, chaque requete entre dans `runAsSuperAdmin`. Sans cet encadrement elle s'executerait
// SANS AUCUN STORE — les routes `/super-admin` n'entrent dans aucun contexte — et tomberait
// sous `NO_CONTEXT_GLOBAL_OPERATIONS`, qui ne declare pas ce modele : refus. C'est
// `SUPERADMIN_GLOBAL_OPERATIONS` qui l'autorise, et elle ne s'applique que dedans.
//
// Le rappel est `async` avec un `await` DEDANS : une requete Prisma est paresseuse, et le
// contexte doit etre lu avant le premier point de suspension (back/CLAUDE.md).
// Les colonnes qu'un PATCH touche, et elles seules : un champ absent du corps ne doit pas
// arriver a `undefined` dans `data`, ou Prisma le remettrait a son defaut.
const donneesDeMiseAJour = (params: PdfDesignPresetUpdateEntityRepo) => ({
  ...(params.name === undefined ? {} : { name: params.name }),
  ...(params.content === undefined
    ? {}
    : { content: params.content as Prisma.InputJsonValue }),
  ...(params.sortOrder === undefined ? {} : { sortOrder: params.sortOrder }),
  ...(params.archived === undefined
    ? {}
    : params.archived
      ? { archivedAt: new Date() }
      : { archivedAt: null }),
  // La date dit quand le modele a ete termine ; la remettre a null le retire de ce que les
  // services peuvent dupliquer, sans toucher aux copies deja faites.
  ...(params.published === undefined
    ? {}
    : params.published
      ? { publishedAt: new Date() }
      : { publishedAt: null }),
})

class PdfDesignPresetRepository implements PdfDesignPresetRepositoryInterface {
  private readonly prisma: PostgresPrismaClient
  private readonly errorHandler: ErrorHandlerInterface
  private readonly tenantContext: TenantContextInterface

  constructor({ postgresOrm, errorHandler, tenantContext }: IocContainer) {
    this.prisma = postgresOrm.prisma
    this.errorHandler = errorHandler
    this.tenantContext = tenantContext
  }

  findAll(archived = false): Promise<PdfDesignPresetEntityRepo[]> {
    return this.tenantContext.runAsSuperAdmin(
      async () =>
        await this.prisma.pdfDesignPreset.findMany({
          where: { archivedAt: archived ? { not: null } : null },
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        }),
    )
  }

  findByID(presetID: string): Promise<PdfDesignPresetEntityRepo | null> {
    return this.tenantContext.runAsSuperAdmin(
      async () =>
        await this.prisma.pdfDesignPreset.findUnique({
          where: { id: presetID },
        }),
    )
  }

  create(
    params: PdfDesignPresetCreateEntityRepo,
  ): Promise<PdfDesignPresetEntityRepo> {
    return this.tenantContext.runAsSuperAdmin(async () => {
      try {
        return await this.prisma.pdfDesignPreset.create({
          data: {
            name: params.name,
            content: params.content as Prisma.InputJsonValue,
            sortOrder: params.sortOrder,
          },
        })
      } catch (err) {
        throw this.errorHandler.boomErrorFromPrismaError({
          entityName: 'PdfDesignPreset',
          error: err,
        })
      }
    })
  }

  update(
    presetID: string,
    params: PdfDesignPresetUpdateEntityRepo,
  ): Promise<PdfDesignPresetEntityRepo> {
    return this.tenantContext.runAsSuperAdmin(async () => {
      try {
        return await this.prisma.pdfDesignPreset.update({
          where: { id: presetID },
          data: donneesDeMiseAJour(params),
        })
      } catch (err) {
        throw this.errorHandler.boomErrorFromPrismaError({
          entityName: 'PdfDesignPreset',
          error: err,
        })
      }
    })
  }

  // Une transaction d'`update` indexes, et non un `updateMany` : la table de capacites
  // declare `update`, pas `updateMany` — et ici chaque ligne recoit un rang DIFFERENT, ce
  // qu'un `updateMany` ne saurait pas faire de toute facon.
  reorder(ids: string[]): Promise<void> {
    return this.tenantContext.runAsSuperAdmin(async () => {
      await this.prisma.$transaction(
        ids.map((id, index) =>
          this.prisma.pdfDesignPreset.update({
            where: { id },
            data: { sortOrder: index },
          }),
        ),
      )
    })
  }
}

export { PdfDesignPresetRepository }
