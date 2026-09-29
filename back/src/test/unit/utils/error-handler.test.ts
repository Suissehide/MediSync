import { Boom } from '@hapi/boom'

import { Prisma } from '../../../generated/client'
import type { IocContainer } from '../../../main/types/application/ioc'
import type { Logger } from '../../../main/types/utils/logger'
import { ErrorHandler } from '../../../main/utils/error-handler'

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

// Meme exigence, pour la branche `PrismaClientKnownRequestError` (task-5-re-review-3.md, I1) :
// aucun des trois tests ci-dessus n'en instancie une seule, alors que c'est la seule branche qui
// lit `meta`. On construit ici un `meta` qui porte la valeur clinique la ou le code la lisait
// avant simplification (`cause`, `target`) : si une lecture de `meta` etait reintroduite, ces deux
// tests rougiraient.
const buildPrismaKnownRequestError = (
  code: string,
  meta: Record<string, unknown>,
) =>
  new Prisma.PrismaClientKnownRequestError(
    `Prisma error ${code}: ${CLINICAL_VALUE} / ${PATIENT_ID}`,
    { code, clientVersion: '0.0.0-test', meta },
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

  it('ne recopie ni la valeur clinique ni l identifiant patient dans le message Boom rendu au client, sur une PrismaClientKnownRequestError P2025 dont le meta.cause porte la valeur', () => {
    const { logger, calls } = buildFakeLogger()
    const errorHandler = new ErrorHandler({ logger } as IocContainer)

    const boomError = errorHandler.boomErrorFromPrismaError({
      entityName: 'Patient',
      error: buildPrismaKnownRequestError('P2025', {
        modelName: 'Patient',
        operation: 'a delete',
        cause: `${CLINICAL_VALUE} / ${PATIENT_ID}`,
      }),
    })

    expect(boomError).toBeInstanceOf(Boom)
    expect(boomError.output.statusCode).toBe(404)
    // C'est le message du Boom, donc celui rendu au client (voir boom.error.normalizer.ts), pas
    // seulement celui d'un 500 : cette branche ne passe jamais par `internal()`.
    expect(boomError.message).not.toContain(CLINICAL_VALUE)
    expect(boomError.message).not.toContain(PATIENT_ID)
    for (const message of calls) {
      expect(message).not.toContain(CLINICAL_VALUE)
      expect(message).not.toContain(PATIENT_ID)
    }
  })

  it('ne recopie ni la valeur clinique ni l identifiant patient dans le message Boom rendu au client, sur une PrismaClientKnownRequestError P2002 dont le meta.target porte la valeur', () => {
    const { logger, calls } = buildFakeLogger()
    const errorHandler = new ErrorHandler({ logger } as IocContainer)

    const boomError = errorHandler.boomErrorFromPrismaError({
      entityName: 'PatientServiceFile',
      error: buildPrismaKnownRequestError('P2002', {
        modelName: 'PatientServiceFile',
        target: [`${CLINICAL_VALUE} / ${PATIENT_ID}`],
      }),
    })

    expect(boomError).toBeInstanceOf(Boom)
    expect(boomError.output.statusCode).toBe(409)
    expect(boomError.message).not.toContain(CLINICAL_VALUE)
    expect(boomError.message).not.toContain(PATIENT_ID)
    for (const message of calls) {
      expect(message).not.toContain(CLINICAL_VALUE)
      expect(message).not.toContain(PATIENT_ID)
    }
  })
})

// task-5-re-review-4.md, I4 : le commit d2ca64f a change le message 404 de repli d'un caractere
// pres (retrait du prefixe d'entite en double) en declarant qu'« aucun message client ne change
// en pratique » — c'etait faux pour cette branche, et rien ne l'a signale. Ces trois messages
// sont deliberes (ecrits a la main dans `boomErrorFromPrismaError`, jamais deduits d'une entree)
// et rendus tels quels au client : on les fige au caractere pres pour qu'un changement futur soit
// un choix explicite (voir ce test rougir), jamais un accident qui passe inapercu.
describe('ErrorHandler.boomErrorFromPrismaError – messages deliberes, figes au caractere pres (task-5-re-review-4.md, I4)', () => {
  it('P2025 (repli) rend "<Entite> with this ID doesn\'t exist"', () => {
    const { logger } = buildFakeLogger()
    const errorHandler = new ErrorHandler({ logger } as IocContainer)

    const boomError = errorHandler.boomErrorFromPrismaError({
      entityName: 'Patient',
      error: buildPrismaKnownRequestError('P2025', {}),
    })

    expect(boomError.output.statusCode).toBe(404)
    expect(boomError.message).toBe("Patient with this ID doesn't exist")
  })

  it('P2003 rend "<Entite> cannot be deleted because it has related records (<parent ou unknown relation>)"', () => {
    const { logger } = buildFakeLogger()
    const errorHandler = new ErrorHandler({ logger } as IocContainer)

    const boomError = errorHandler.boomErrorFromPrismaError({
      entityName: 'PatientServiceFile',
      error: buildPrismaKnownRequestError('P2003', {}),
    })

    expect(boomError.output.statusCode).toBe(409)
    expect(boomError.message).toBe(
      'PatientServiceFile cannot be deleted because it has related records (unknown relation)',
    )
  })

  it('P2003 avec un parent connu nomme ce parent plutot que "unknown relation"', () => {
    const { logger } = buildFakeLogger()
    const errorHandler = new ErrorHandler({ logger } as IocContainer)

    const boomError = errorHandler.boomErrorFromPrismaError({
      entityName: 'Slot',
      parentEntityName: 'Pathway',
      error: buildPrismaKnownRequestError('P2003', {}),
    })

    expect(boomError.output.statusCode).toBe(409)
    expect(boomError.message).toBe(
      'Slot cannot be deleted because it has related records (Pathway)',
    )
  })

  it('P2002 rend "<Entite> already exists (unknown field)"', () => {
    const { logger } = buildFakeLogger()
    const errorHandler = new ErrorHandler({ logger } as IocContainer)

    const boomError = errorHandler.boomErrorFromPrismaError({
      entityName: 'PatientServiceFile',
      error: buildPrismaKnownRequestError('P2002', {}),
    })

    expect(boomError.output.statusCode).toBe(409)
    expect(boomError.message).toBe(
      'PatientServiceFile already exists (unknown field)',
    )
  })
})
