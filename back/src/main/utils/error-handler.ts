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
    const errorClass = error instanceof Error ? error.constructor.name : typeof error
    let boomError: Boom<unknown> = internal(
      `Something went wrong while handling ${entityName} [${errorClass}]`,
    )
    if (error instanceof Boom) {
      boomError = error
    } else if (error instanceof Prisma.PrismaClientKnownRequestError) {
      const { code, meta } = error
      // Meme exigence pour un code Prisma reconnu : on journalise le code et l'entite, jamais
      // `error.message` ni `meta` en clair (un futur code/version pourrait y faire porter une
      // valeur). Les fragments de `meta` utilises dans les messages ci-dessous (constraint,
      // target) sont des NOMS de colonne/contrainte du schema, jamais une valeur soumise.
      this.logger.debug(`Prisma error [${code}] on ${entityName}`)
      if (code === PrismaErrorCodes.OPERATION_DEPENDS_ON_MISSING_RECORD) {
        const cause = meta?.cause ?? `${entityName} with this ID doesn't exist`
        boomError = notFound(`${entityName}: ${cause}`)
      }
      if (code === PrismaErrorCodes.FOREIGN_KEY_CONSTRAINT_FAILED) {
        const field = parentEntityName ?? meta?.constraint ?? 'unknown relation'
        boomError = conflict(
          `${entityName} cannot be deleted because it has related records (${field})`,
        )
      }
      if (code === PrismaErrorCodes.OPERATION_FAILED_ON_UNIQUE_CONSTRAINT) {
        const target = meta?.target ?? 'unknown field'
        boomError = conflict(`${entityName} already exists (${target})`)
      }
    }
    return boomError
  }
}

export { ErrorHandler }
