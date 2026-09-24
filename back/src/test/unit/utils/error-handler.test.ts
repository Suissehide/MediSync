import { Boom } from '@hapi/boom'

import { Prisma } from '../../../generated/client'
import { ErrorHandler } from '../../../main/utils/error-handler'
import type { IocContainer } from '../../../main/types/application/ioc'
import type { Logger } from '../../../main/types/utils/logger'

// La valeur soumise dont ce test verifie qu'elle ne reapparait NULLE PART : ni dans le message
// renvoye par `boomErrorFromPrismaError`, ni dans un des appels au logger. C'est la reproduction
// exacte du defaut releve dans task-5-re-review-2.md (C1) : une PrismaClientValidationError,
// levee quand la forme de la requete Prisma est invalide (erreur de programmation, pas une
// erreur d'exploitation), recopie integralement le `data` de l'invocation dans son message —
// colonnes cliniques et identifiant de patient compris.
const CLINICAL_VALUE = 'MOTIF-CLINIQUE-CONFIDENTIEL'
const PATIENT_ID = 'cmug61zv400098gs16ejoelmj'

const buildPrismaValidationError = () =>
  new Prisma.PrismaClientValidationError(
    [
      'Invalid `this.prisma.appointment.create()` invocation in',
      '/app/src/main/infra/orm/repositories/appointment.repository.ts:100:44',
      '',
      `data: { patientId: "${PATIENT_ID}", transmissionNotes: "${CLINICAL_VALUE}" }`,
      '',
      'Unknown argument `serviceId`. Available options are marked with ?.',
    ].join('\n'),
    { clientVersion: '0.0.0-test' },
  )

const buildFakeLogger = () => {
  const calls: string[] = []
  const record = (message: string) => calls.push(message)
  const logger: Logger = {
    debug: record,
    error: record,
    info: record,
    trace: record,
    warn: record,
  }
  return { logger, calls }
}

describe('ErrorHandler.boomErrorFromPrismaError', () => {
  it('ne recopie ni la valeur clinique ni l identifiant patient dans le message Boom, sur une PrismaClientValidationError', () => {
    const { logger, calls } = buildFakeLogger()
    const errorHandler = new ErrorHandler({ logger } as IocContainer)

    const boomError = errorHandler.boomErrorFromPrismaError({
      entityName: 'Appointment',
      error: buildPrismaValidationError(),
    })

    expect(boomError).toBeInstanceOf(Boom)
    expect(boomError.message).not.toContain(CLINICAL_VALUE)
    expect(boomError.message).not.toContain(PATIENT_ID)

    // Rien de journalise non plus : c'est le vrai canal de fuite (Boom masque deja le message
    // d'un `internal()` cote reponse HTTP ; le journal, lui, n'est filtre par rien).
    for (const message of calls) {
      expect(message).not.toContain(CLINICAL_VALUE)
      expect(message).not.toContain(PATIENT_ID)
    }
  })

  it('garde de quoi diagnostiquer : la classe de l erreur et l entite concernee', () => {
    const { logger } = buildFakeLogger()
    const errorHandler = new ErrorHandler({ logger } as IocContainer)

    const boomError = errorHandler.boomErrorFromPrismaError({
      entityName: 'Appointment',
      error: buildPrismaValidationError(),
    })

    expect(boomError.message).toContain('PrismaClientValidationError')
    expect(boomError.message).toContain('Appointment')
  })

  it('ne recopie pas non plus une erreur generique inattendue (Error simple)', () => {
    const { logger, calls } = buildFakeLogger()
    const errorHandler = new ErrorHandler({ logger } as IocContainer)

    const boomError = errorHandler.boomErrorFromPrismaError({
      entityName: 'Patient',
      error: new Error(`echec sur ${CLINICAL_VALUE} / ${PATIENT_ID}`),
    })

    expect(boomError.message).not.toContain(CLINICAL_VALUE)
    expect(boomError.message).not.toContain(PATIENT_ID)
    for (const message of calls) {
      expect(message).not.toContain(CLINICAL_VALUE)
      expect(message).not.toContain(PATIENT_ID)
    }
  })
})
