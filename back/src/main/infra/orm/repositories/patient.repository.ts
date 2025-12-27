import type { IocContainer } from '../../../types/application/ioc'
import type { PatientWithAppointmentsDomain } from '../../../types/domain/patient.domain.interface'
import type {
  PatientCreateEntityRepo,
  PatientEntityRepo,
  PatientRepositoryInterface,
  PatientUpdateEntityRepo,
} from '../../../types/infra/orm/repositories/patient.repository.interface'
import type { ErrorHandlerInterface } from '../../../types/utils/error-handler'
import type { PostgresPrismaClient } from '../postgres-client'

class PatientRepository implements PatientRepositoryInterface {
  private readonly prisma: PostgresPrismaClient
  private readonly errorHandler: ErrorHandlerInterface

  constructor({ postgresOrm, errorHandler }: IocContainer) {
    this.prisma = postgresOrm.prisma
    this.errorHandler = errorHandler
  }

  findAll(): Promise<PatientEntityRepo[]> {
    return this.prisma.patient.findMany()
  }

  async findByID(patientID: string): Promise<PatientWithAppointmentsDomain> {
    try {
      return await this.prisma.patient.findUniqueOrThrow({
        where: { id: patientID },
        include: {
          appointmentPatients: {
            include: {
              appointment: true,
            },
          },
        },
      })
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({
        entityName: 'Patient',
        error: err,
      })
    }
  }

  async create(
    patientCreateParams: PatientCreateEntityRepo,
  ): Promise<PatientEntityRepo> {
    try {
      return await this.prisma.patient.create({
        data: patientCreateParams,
      })
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({
        entityName: 'Patient',
        error: err,
      })
    }
  }

  async update(
    patientID: string,
    patientUpdateParams: PatientUpdateEntityRepo,
  ): Promise<PatientEntityRepo> {
    try {
      return await this.prisma.patient.update({
        where: { id: patientID },
        data: patientUpdateParams,
      })
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({
        entityName: 'Patient',
        error: err,
      })
    }
  }

  async delete(patientID: string): Promise<PatientEntityRepo> {
    try {
      return await this.prisma.patient.delete({
        where: { id: patientID },
      })
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({
        entityName: 'Patient',
        error: err,
      })
    }
  }
}

export { PatientRepository }
