import type { IocContainer } from '../../../types/application/ioc'
import type { PatientWithAppointmentsDomain } from '../../../types/domain/patient.domain.interface'
import type {
  PatientCreateEntityRepo,
  PatientEntityRepo,
  PatientExportFilters,
  PatientForExportEntityRepo,
  PatientIdentitySearchFilters,
  PatientIdentitySearchResultRepo,
  PatientPathwayEntityRepo,
  PatientRepositoryInterface,
  PatientUpdateEntityRepo,
  PatientWithTagsEntityRepo,
} from '../../../types/infra/orm/repositories/patient.repository.interface'
import type { ErrorHandlerInterface } from '../../../types/utils/error-handler'
import type { TenantContextInterface } from '../../../types/utils/tenant-context'
import type { PostgresPrismaClient } from '../postgres-client'

type AppointmentPatientWithMainTag = {
  appointment: {
    slot: { pathway: { template: { mainTag: string } | null } | null } | null
  } | null
}

// Tags principaux distincts des parcours auxquels un patient est inscrit.
const distinctMainTags = (
  appointmentPatients: AppointmentPatientWithMainTag[],
): string[] => [
  ...new Set(
    appointmentPatients.flatMap((ap) => {
      const mainTag = ap.appointment?.slot?.pathway?.template?.mainTag
      return mainTag ? [mainTag] : []
    }),
  ),
]

class PatientRepository implements PatientRepositoryInterface {
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

  // Le patient est un modèle d'établissement, mais plusieurs de ses méthodes
  // interrogent des modèles de service (parcours, rendez-vous, priorités) :
  // `scope` fournit le filtre service + établissement pour ces requêtes-là.
  private get scope() {
    return this.tenantContext.scope()
  }

  findAll(): Promise<PatientEntityRepo[]> {
    return this.prisma.patient.findMany({ where: this.establishmentScope })
  }

  async findAllWithTags(): Promise<PatientWithTagsEntityRepo[]> {
    const patients = await this.prisma.patient.findMany({
      // La liste rend les patients ayant un sous-dossier dans le SERVICE courant, pas tous ceux
      // de l'etablissement (tache 12, etape 3 du multi-tenant) : avant ce filtre, les deux
      // services montraient la meme liste — voir task-12-brief.md, et le test de cloisonnement
      // dans patient.test.ts. `some` ne filtre que les LIGNES rendues, `include.serviceFiles`
      // ci-dessous continue de porter son propre `where` pour ne recuperer, pour ce patient, que
      // le sous-dossier du service courant (jamais celui d'un autre service).
      where: {
        ...this.establishmentScope,
        serviceFiles: { some: { serviceId: this.scope.serviceId } },
      },
      include: {
        appointmentPatients: {
          where: { serviceId: this.scope.serviceId },
          select: {
            appointment: {
              select: {
                slot: {
                  select: {
                    pathway: {
                      select: {
                        template: { select: { mainTag: true } },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        // Les problemes d'inscription et la date d'entree vivent desormais sur le sous-dossier
        // de service (etape 3 du multi-tenant) : la lecture passe par lui, puis s'aplatit pour
        // garder la meme forme qu'avant sur le patient (au plus un sous-dossier par service,
        // donc pas de doublon).
        serviceFiles: {
          where: { serviceId: this.scope.serviceId },
          select: { enrollmentIssues: true, entryDate: true },
        },
      },
    })

    return patients.map(({ appointmentPatients, serviceFiles, ...patient }) => ({
      ...patient,
      pathwayTemplateTags: distinctMainTags(appointmentPatients),
      enrollmentIssues: serviceFiles.flatMap((f) => f.enrollmentIssues),
      entryDate: serviceFiles[0]?.entryDate ?? null,
    }))
  }

  async findForExport(filters: PatientExportFilters): Promise<PatientForExportEntityRepo[]> {
    const { search, pathwayTemplateTags } = filters

    const patients = await this.prisma.patient.findMany({
      where: {
        ...this.establishmentScope,
        ...(search
          ? {
              OR: [
                { firstName: { contains: search, mode: 'insensitive' } },
                { lastName: { contains: search, mode: 'insensitive' } },
              ],
            }
          : {}),
        ...(pathwayTemplateTags?.length
          ? {
              appointmentPatients: {
                some: {
                  serviceId: this.scope.serviceId,
                  appointment: {
                    slot: {
                      pathway: {
                        template: { mainTag: { in: pathwayTemplateTags } },
                      },
                    },
                  },
                },
              },
            }
          : {}),
      },
      include: {
        appointmentPatients: {
          where: { serviceId: this.scope.serviceId },
          select: {
            appointment: {
              select: {
                slot: {
                  select: {
                    pathway: {
                      select: {
                        template: { select: { mainTag: true } },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        // Sous-dossier du service courant : le parcours et le contenu clinique de l'export
        // (etape 3 du multi-tenant) y vivent desormais, plus sur Patient. Filtre de service
        // explicite requis par le garde-fou d'ORM (relation vers un modele de service). Les
        // problemes d'inscription, eux aussi rattaches au sous-dossier depuis la tache 6, sont
        // inclus ici pour la meme raison qu'avant : garder la forme `PatientWithTagsEntityRepo`.
        //
        // `include` (pas `select`) est necessaire ici, a la difference de `findAllWithTags` et
        // `findByID` : ceux-ci ne gardent que `enrollmentIssues` et jettent le reste du
        // sous-dossier, `select: { enrollmentIssues: true }` leur suffit donc. Cette methode-ci
        // expose au contraire le sous-dossier complet sous `serviceFile` (dix-neuf colonnes,
        // lues par EXPORT_COLUMNS dans patient.domain.ts) : il lui faut les scalaires ET la
        // relation. Prisma n'a pas de forme "tous les scalaires + une relation" hors `include` —
        // un `select` explicite obligerait a enumerer chaque colonne du sous-dossier ici, une
        // liste qui se desynchroniserait silencieusement de `prisma/schema.prisma` a la
        // prochaine colonne ajoutee. `enrollmentIssues` est donc retire explicitement plus bas,
        // apres la requete, plutot que par la forme de la requete elle-meme (I2, task-6-review.md
        // : `serviceFile` ne doit porter aucune cle que `PatientServiceFileEntityRepo` ne
        // declare pas).
        serviceFiles: {
          where: { serviceId: this.scope.serviceId },
          include: { enrollmentIssues: true },
        },
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    })

    return patients.map(({ appointmentPatients, serviceFiles, ...patient }) => {
      const [primaryServiceFile] = serviceFiles
      const serviceFile = primaryServiceFile
        ? ((({ enrollmentIssues: _enrollmentIssuesOnServiceFile, ...rest }) => rest)(primaryServiceFile))
        : null
      return {
        ...patient,
        pathwayTemplateTags: distinctMainTags(appointmentPatients),
        serviceFile,
        enrollmentIssues: serviceFiles.flatMap((f) => f.enrollmentIssues),
      }
    })
  }

  // Recherche d'identite existante avant creation (design §6, tache 13) : rend UNIQUEMENT
  // l'identite — id (necessaire pour choisir un resultat), prenom, nom, date de naissance —
  // jamais le contact (genre, telephones, email...), jamais le suivi, jamais un contenu de
  // service. `select` explicite, pas `include` ni l'entite complete : c'est la requete
  // elle-meme qui ne fait jamais entrer les autres colonnes en memoire, pas une projection
  // appliquee apres coup (une premiere version naive, qui renvoyait l'entite entiere, a ete
  // prouvee rouge contre le test de confidentialite avant ce correctif — voir
  // patient-search-identite.test.ts, "la recherche ne rend que l'identite").
  //
  // Establishment-scope, PAS `runAsSystem` : Patient est un modele d'etablissement (comme
  // `establishmentScope` ci-dessus le sert deja a `findByID`/`findAll`/`create`), donc le
  // garde-fou d'ORM normal — un `where` qui porte `establishmentId` — suffit a filtrer TOUT
  // l'etablissement courant sans avoir a l'assouplir. Voir le commentaire de
  // `PatientDomain.searchByIdentity` pour pourquoi ce choix n'etend pas l'exception de
  // `estSuiviAilleurs`.
  searchByIdentity(
    filters: PatientIdentitySearchFilters,
  ): Promise<PatientIdentitySearchResultRepo[]> {
    const { firstName, lastName, birthDate } = filters
    return this.prisma.patient.findMany({
      where: {
        ...this.establishmentScope,
        ...(firstName ? { firstName: { contains: firstName, mode: 'insensitive' } } : {}),
        ...(lastName ? { lastName: { contains: lastName, mode: 'insensitive' } } : {}),
        ...(birthDate ? { birthDate } : {}),
      },
      select: { id: true, firstName: true, lastName: true, birthDate: true },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      take: 20,
    })
  }

  async findByID(patientID: string): Promise<PatientWithAppointmentsDomain> {
    try {
      // Les problemes d'inscription vivent desormais sur le sous-dossier de service (etape 3 du
      // multi-tenant) : la lecture passe par lui, puis s'aplatit pour garder la meme forme
      // qu'avant sur le patient (au plus un sous-dossier par service, donc pas de doublon).
      const { serviceFiles, ...patient } = await this.prisma.patient.findUniqueOrThrow({
        where: { id_establishmentId: { id: patientID, ...this.establishmentScope } },
        include: {
          appointmentPatients: {
            where: { serviceId: this.scope.serviceId },
            include: {
              appointment: true,
            },
          },
          serviceFiles: {
            where: { serviceId: this.scope.serviceId },
            select: { enrollmentIssues: true },
          },
        },
      })
      return { ...patient, enrollmentIssues: serviceFiles.flatMap((f) => f.enrollmentIssues) }
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
        data: { ...patientCreateParams, ...this.establishmentScope },
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
        where: { id_establishmentId: { id: patientID, ...this.establishmentScope } },
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
        where: { id_establishmentId: { id: patientID, ...this.establishmentScope } },
      })
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({
        entityName: 'Patient',
        error: err,
      })
    }
  }

  async getPathwaysForPatient(
    patientID: string,
  ): Promise<PatientPathwayEntityRepo[]> {
    try {
      const pathways = await this.prisma.pathway.findMany({
        where: {
          ...this.scope,
          slots: {
            some: {
              appointments: {
                some: {
                  appointmentPatients: { some: { patientId: patientID } },
                },
              },
            },
          },
        },
        include: {
          template: {
            select: { id: true, name: true, color: true, mainTag: true },
          },
          patientPriorities: {
            where: { patientID, serviceId: this.scope.serviceId },
            select: { priority: true },
          },
        },
      })

      const result: PatientPathwayEntityRepo[] = pathways.map((p) => ({
        pathwayID: p.id,
        templateID: p.template?.id ?? null,
        templateName: p.template?.name ?? null,
        templateColor: p.template?.color ?? null,
        templateMainTag: p.template?.mainTag ?? null,
        startDate: p.startDate,
        priority: p.patientPriorities[0]?.priority ?? null,
      }))

      result.sort((a, b) => {
        const ap = a.priority ?? Number.POSITIVE_INFINITY
        const bp = b.priority ?? Number.POSITIVE_INFINITY
        if (ap !== bp) {
          return ap - bp
        }
        return a.startDate.getTime() - b.startDate.getTime()
      })

      return result
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({
        entityName: 'Pathway',
        error: err,
      })
    }
  }

  async setPathwayPriorities(
    patientID: string,
    orderedPathwayIDs: string[],
  ): Promise<void> {
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.patientPathwayPriority.deleteMany({ where: { patientID, ...this.scope } })
        if (orderedPathwayIDs.length === 0) {
          return
        }
        await tx.patientPathwayPriority.createMany({
          data: orderedPathwayIDs.map((pathwayID, index) => ({
            patientID,
            pathwayID,
            priority: index,
            ...this.scope,
          })),
        })
      })
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({
        entityName: 'PatientPathwayPriority',
        error: err,
      })
    }
  }

  async countAppointmentsInPathway(
    patientID: string,
    pathwayID: string,
  ): Promise<number> {
    try {
      const count = await this.prisma.appointmentPatient.count({
        where: {
          ...this.scope,
          patientId: patientID,
          appointment: {
            slot: {
              pathwayID: pathwayID,
            },
          },
        },
      })
      return count
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({
        entityName: 'Patient',
        error: err,
      })
    }
  }

  async removeFromPathway(
    patientID: string,
    pathwayID: string,
  ): Promise<{ deletedAppointments: number; removedFromGroup: number }> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const appointmentPatients = await tx.appointmentPatient.findMany({
          where: {
            ...this.scope,
            patientId: patientID,
            appointment: {
              slot: {
                pathwayID: pathwayID,
              },
            },
          },
          include: {
            appointment: {
              include: {
                appointmentPatients: true,
              },
            },
          },
        })

        if (appointmentPatients.length === 0) {
          return { deletedAppointments: 0, removedFromGroup: 0 }
        }

        let deletedAppointments = 0
        let removedFromGroup = 0

        for (const ap of appointmentPatients) {
          const isOnlyPatient = ap.appointment.appointmentPatients.length <= 1

          await tx.appointmentPatient.delete({
            where: { id_serviceId: { id: ap.id, serviceId: this.scope.serviceId } },
          })

          if (isOnlyPatient) {
            await tx.appointment.delete({
              where: { id_serviceId: { id: ap.appointment.id, serviceId: this.scope.serviceId } },
            })
            deletedAppointments++
          } else {
            removedFromGroup++
          }
        }

        return { deletedAppointments, removedFromGroup }
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
