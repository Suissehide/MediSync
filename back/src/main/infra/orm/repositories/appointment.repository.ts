import type { IocContainer } from '../../../types/application/ioc'
import type {
  AppointmentCreateEntityRepo,
  AppointmentEntityRepo,
  AppointmentRepositoryInterface,
  AppointmentUpdateEntityRepo,
} from '../../../types/infra/orm/repositories/appointment.repository.interface'
import type {
  AppointmentPatientAddEntityRepo,
  AppointmentPatientEntityRepo,
} from '../../../types/infra/orm/repositories/appointmentPatient.repository.interface'
import type { ErrorHandlerInterface } from '../../../types/utils/error-handler'
import type { TenantContextInterface } from '../../../types/utils/tenant-context'
import {
  flattenSlot,
  soignantLinksInclude,
} from '../includes/slot-template.include'
import type { PostgresPrismaClient } from '../postgres-client'

// Include partagé : un rendez-vous embarque sa thématique (clé étrangère
// scalaire `thematicId`, relation à un seul enregistrement — sûre par la
// même raison que `template`/`location`/`thematic` dans
// slot-template.include.ts, voir son commentaire d'en-tête) et ses
// participants. `appointmentPatients` est la relation inverse portée par la
// clé composite (appointmentId, serviceId) : Prisma ne peut ramener que les
// lignes dont le couple (appointmentId, serviceId) correspond à la ligne
// Appointment déjà filtrée par service — sûre par construction. `patient`,
// sous chaque `appointmentPatients`, est atteint depuis AppointmentPatient
// par la clé composite (patientId, establishmentId) : establishmentId y est
// la colonne propre de la ligne AppointmentPatient, toujours posée par ce
// repository via `this.scope` (services et établissements sont en relation
// fixe), donc toujours égale à l'établissement du tenant courant. Prisma ne
// peut donc résoudre que le patient de cet établissement — sûre par
// construction, malgré le changement de famille (établissement) au sein
// d'une relation de service.
const appointmentInclude = {
  thematic: true,
  appointmentPatients: { include: { patient: true } },
} as const
// `slot` : clé composite (slotID, serviceId), sûre par construction, même
// raisonnement. `slotTemplate` en dessous : clé composite
// (slotTemplateID, serviceId), sûre également ; `soignantLinks.soignant`,
// `location` et `thematic` sont sûres pour les raisons documentées dans
// slot-template.include.ts (composite pour les liens soignants, scalaire à
// un seul enregistrement pour location/thematic).
const appointmentWithSlotInclude = {
  ...appointmentInclude,
  slot: {
    include: {
      slotTemplate: {
        include: { ...soignantLinksInclude, location: true, thematic: true },
      },
    },
  },
} as const
type WithSlot = { slot?: Parameters<typeof flattenSlot>[0] | null }
const flattenAppointment = <T extends WithSlot>(row: T) =>
  row.slot ? { ...row, slot: flattenSlot(row.slot) } : row

class AppointmentRepository implements AppointmentRepositoryInterface {
  private readonly prisma: PostgresPrismaClient
  private readonly errorHandler: ErrorHandlerInterface
  private readonly tenantContext: TenantContextInterface

  constructor({ postgresOrm, errorHandler, tenantContext }: IocContainer) {
    this.prisma = postgresOrm.prisma
    this.errorHandler = errorHandler
    this.tenantContext = tenantContext
  }

  private get scope() {
    return this.tenantContext.scope()
  }

  findAll(): Promise<AppointmentEntityRepo[]> {
    return this.prisma.appointment.findMany({
      where: this.scope,
      include: appointmentInclude,
    })
  }

  async findByID(appointmentID: string): Promise<AppointmentEntityRepo> {
    try {
      const row = await this.prisma.appointment.findUniqueOrThrow({
        where: {
          id_serviceId: { id: appointmentID, serviceId: this.scope.serviceId },
        },
        include: appointmentWithSlotInclude,
      })
      return flattenAppointment(row)
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({
        entityName: 'Appointment',
        error: err,
      })
    }
  }

  async create(
    appointmentCreateParams: AppointmentCreateEntityRepo,
  ): Promise<AppointmentEntityRepo> {
    try {
      const { patientIDs, transmissionNotes, ...rest } = appointmentCreateParams
      const { serviceId } = this.scope

      // Pas de creation imbriquee ici (`appointment.create({ data: { appointmentPatients:
      // { create: [...] } } })`) : `serviceId` fait partie de la cle etrangere composite de la
      // relation `appointment` ([appointmentId, serviceId]), donc Prisma le deduit de la ligne
      // Appointment en cours de creation et REFUSE qu'on le passe dans la creation imbriquee
      // ("Unknown argument `serviceId`"). Et l'omettre ne suffit pas non plus : le garde-fou de
      // tenant (tenant-guard.ts, assertRowScope) exige `serviceId` explicitement sur toute
      // ligne AppointmentPatient ecrite, imbriquee ou non — l'omettre y declenche
      // `TenantScopeMissingError`. Les deux contraintes ne peuvent pas etre satisfaites en meme
      // temps sur UNE creation imbriquee. On cree donc l'Appointment seul, puis chaque
      // AppointmentPatient par une creation de premier niveau (meme forme que
      // `addPatientToAppointment` et la branche `create` de l'`upsert` de `update()`
      // ci-dessous, qui passent deja `...this.scope` en entier), dans une transaction pour
      // rester atomique.
      return await this.prisma.$transaction(async (tx) => {
        const appointment = await tx.appointment.create({
          data: { ...rest, ...this.scope },
        })

        if (patientIDs && patientIDs.length > 0) {
          await tx.appointmentPatient.createMany({
            data: patientIDs.map((patientId) => ({
              appointmentId: appointment.id,
              patientId,
              ...this.scope,
              transmissionNotes: transmissionNotes ?? undefined,
            })),
          })
        }

        return tx.appointment.findUniqueOrThrow({
          where: { id_serviceId: { id: appointment.id, serviceId } },
          include: appointmentInclude,
        })
      })
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({
        entityName: 'Appointment',
        error: err,
      })
    }
  }

  async update(
    appointmentID: string,
    appointmentUpdateParams: AppointmentUpdateEntityRepo,
  ): Promise<AppointmentEntityRepo> {
    const { appointmentPatients, ...appointmentData } = appointmentUpdateParams
    const { serviceId } = this.scope

    try {
      return await this.prisma.$transaction(async (tx) => {
        // Suppression explicite : le client a fourni une liste de patients vide.
        if (appointmentPatients && appointmentPatients.length === 0) {
          return tx.appointment.delete({
            where: { id_serviceId: { id: appointmentID, serviceId } },
            include: appointmentInclude,
          })
        }

        // Met à jour le rendez-vous principal
        await tx.appointment.update({
          where: { id_serviceId: { id: appointmentID, serviceId } },
          data: appointmentData,
        })

        // Mise à jour partielle : la liste des patients n'est pas fournie,
        // on ne touche pas aux participants existants.
        if (!appointmentPatients) {
          return tx.appointment.findUniqueOrThrow({
            where: { id_serviceId: { id: appointmentID, serviceId } },
            include: appointmentInclude,
          })
        }

        // Supprime les patients qui ne sont plus présents
        const incomingIDs = appointmentPatients
          .map((ap) => ap.id)
          .filter((id): id is string => !!id)

        await tx.appointmentPatient.deleteMany({
          where: {
            appointmentId: appointmentID,
            serviceId,
            id: { notIn: incomingIDs.length ? incomingIDs : [''] },
          },
        })

        // Upsert chaque patient lié
        for (const ap of appointmentPatients) {
          await tx.appointmentPatient.upsert({
            where: {
              id_serviceId: { id: ap.id ?? '', serviceId },
            },
            update: {
              accompanying: ap.accompanying,
              status: ap.status,
              rejectionReason: ap.rejectionReason,
              transmissionNotes: ap.transmissionNotes,
              convocationSent: ap.convocationSent,
            },
            create: {
              ...this.scope,
              accompanying: ap.accompanying,
              status: ap.status,
              rejectionReason: ap.rejectionReason,
              transmissionNotes: ap.transmissionNotes,
              convocationSent: ap.convocationSent,
              appointmentId: appointmentID,
              patientId: ap.patientID,
            },
          })
        }

        // Retourne le rendez-vous complet avec patients
        return tx.appointment.findUniqueOrThrow({
          where: { id_serviceId: { id: appointmentID, serviceId } },
          include: appointmentInclude,
        })
      })
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({
        entityName: 'Appointment',
        parentEntityName: 'AppointmentPatient',
        error: err,
      })
    }
  }

  async addPatientToAppointment(
    appointmentPatientUpdateParams: AppointmentPatientAddEntityRepo,
  ): Promise<AppointmentPatientEntityRepo> {
    try {
      const {
        appointmentID,
        patientID,
        accompanying,
        status,
        rejectionReason,
        transmissionNotes,
      } = appointmentPatientUpdateParams
      return await this.prisma.appointmentPatient.create({
        data: {
          ...this.scope,
          appointmentId: appointmentID,
          patientId: patientID,
          accompanying,
          status,
          rejectionReason,
          transmissionNotes,
        },
      })
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({
        entityName: 'AppointmentPatient',
        error: err,
      })
    }
  }

  async deleteOrphanedByIds(appointmentIDs: string[]): Promise<number> {
    if (appointmentIDs.length === 0) {
      return 0
    }
    const result = await this.prisma.appointment.deleteMany({
      where: {
        id: { in: appointmentIDs },
        serviceId: this.scope.serviceId,
        appointmentPatients: { none: {} },
      },
    })
    return result.count
  }

  async setConvocationSent(
    appointmentID: string,
    appointmentPatientID: string,
    convocationSent: boolean,
  ): Promise<void> {
    try {
      await this.prisma.appointmentPatient.update({
        where: {
          id_serviceId: {
            id: appointmentPatientID,
            serviceId: this.scope.serviceId,
          },
          appointmentId: appointmentID,
        },
        data: { convocationSent },
      })
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({
        entityName: 'AppointmentPatient',
        error: err,
      })
    }
  }

  async delete(appointmentID: string): Promise<AppointmentEntityRepo> {
    try {
      return await this.prisma.appointment.delete({
        where: {
          id_serviceId: { id: appointmentID, serviceId: this.scope.serviceId },
        },
      })
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({
        entityName: 'Appointment',
        error: err,
      })
    }
  }
}

export { AppointmentRepository }
