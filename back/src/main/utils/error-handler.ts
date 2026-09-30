import { Boom, conflict, internal, notFound } from '@hapi/boom'

import { Prisma } from '../../generated/client'
import PrismaErrorCodes from '../infra/orm/error-codes-prisma'
import type { IocContainer } from '../types/application/ioc'
import type {
  ErrorHandlerInterface,
  InputErrorHandler,
} from '../types/utils/error-handler'
import type { Logger } from '../types/utils/logger'

class ErrorHandler implements ErrorHandlerInterface {
  private readonly logger: Logger

  constructor({ logger }: IocContainer) {
    this.logger = logger
  }

  boomErrorFromPrismaError({
    entityName,
    parentEntityName,
    error,
  }: InputErrorHandler): Boom<unknown> {
    // Ni le message renvoye par Boom, ni un journal, ne doivent jamais reproduire l'erreur brute
    // (`${error}`/`error.message`) : le message d'une PrismaClientValidationError recopie
    // integralement le `data` de l'invocation Prisma qui a echoue, colonnes cliniques et
    // identifiants de patient compris (task-5-re-review-2.md, C1 — une inscription en echec a
    // ainsi journalise transmissionNotes: "MOTIF-CLINIQUE-CONFIDENTIEL"). Boom masque deja ce
    // message cote reponse HTTP pour un `internal()` (500) : la fuite n'est donc pas vers le
    // client, elle est vers les journaux applicatifs, qu'aucun `redact` ne filtre. On ne
    // construit donc jamais ce message a partir de l'erreur elle-meme : seule sa classe et
    // l'entite concernee, qui ne peuvent porter aucune valeur soumise.
    const errorClass =
      error instanceof Error ? error.constructor.name : typeof error
    let boomError: Boom<unknown> = internal(
      `Something went wrong while handling ${entityName} [${errorClass}]`,
    )
    if (error instanceof Boom) {
      boomError = error
    } else if (error instanceof Prisma.PrismaClientKnownRequestError) {
      const { code } = error
      // Meme exigence pour un code Prisma reconnu : on journalise le code et l'entite, jamais
      // `error.message`. `meta` n'est plus lu du tout ici : verifie contre un vrai Postgres,
      // aucun des trois champs qu'on
      // lisait jusqu'ici (`meta.cause`, `meta.constraint`, `meta.target`) n'existe plus au premier
      // niveau de `meta` sous Prisma 7.8 — quand l'equivalent existe, c'est desormais imbrique
      // sous `meta.driverAdapterError.cause.constraint`. Les trois lectures etaient donc du code
      // mort : le `??` prenait toujours la branche de repli, jamais celle qui aurait pu un jour
      // porter une valeur soumise. On simplifie en ne lisant plus `meta` du tout, plutot que de
      // laisser vivre une lecture qu'un futur changement pourrait faire porter une valeur sans que
      // rien ici ne le remarque.
      this.logger.debug(`Prisma error [${code}] on ${entityName}`)
      if (code === PrismaErrorCodes.OPERATION_DEPENDS_ON_MISSING_RECORD) {
        boomError = notFound(`${entityName} with this ID doesn't exist`)
      }
      if (code === PrismaErrorCodes.FOREIGN_KEY_CONSTRAINT_FAILED) {
        const field = parentEntityName ?? 'unknown relation'
        boomError = conflict(
          `${entityName} cannot be deleted because it has related records (${field})`,
        )
      }
      if (code === PrismaErrorCodes.OPERATION_FAILED_ON_UNIQUE_CONSTRAINT) {
        boomError = conflict(`${entityName} already exists (unknown field)`)
      }
    }
    return boomError
  }
}

export { ErrorHandler }
