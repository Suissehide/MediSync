import type { IocContainer } from '../../../types/application/ioc'
import type { PatientWithAppointmentsDomain } from '../../../types/domain/patient.domain.interface'
import type {
  PatientCreateEntityRepo,
  PatientEntityRepo,
  PatientExportFilters,
  PatientForExportEntityRepo,
  PatientIdentitySearchFilters,
  PatientIdentitySearchRepoResult,
  PatientPathwayEntityRepo,
  PatientRepositoryInterface,
  PatientUpdateEntityRepo,
  PatientWithTagsEntityRepo,
} from '../../../types/infra/orm/repositories/patient.repository.interface'
import type { ErrorHandlerInterface } from '../../../types/utils/error-handler'
import type { TenantContextInterface } from '../../../types/utils/tenant-context'
// `escapeLikePattern` vivait en tete de ce fichier ; extrait a la revue finale de branche
// (etape 4b) pour servir aussi le filtre « compte » de la lecture plateforme des deux journaux.
import { escapeLikePattern } from '../../../utils/like-pattern'
import type { PostgresPrismaClient } from '../postgres-client'

type AppointmentPatientWithMainTag = {
  appointment: {
    slot: { pathway: { template: { mainTag: string } | null } | null } | null
  } | null
}

// Nombre maximum de resultats affiches par une recherche d'identite (design §6, tache 13) —
// voir `PatientRepository.searchByIdentity` pour la garde anti-doublon (`hasMore`) qui en
// depend. Exporte pour que la source de verite reste unique (pas un `20` duplique ailleurs).
export const IDENTITY_SEARCH_LIMIT = 20

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

    return patients.map(
      ({ appointmentPatients, serviceFiles, ...patient }) => ({
        ...patient,
        pathwayTemplateTags: distinctMainTags(appointmentPatients),
        enrollmentIssues: serviceFiles.flatMap((f) => f.enrollmentIssues),
        entryDate: serviceFiles[0]?.entryDate ?? null,
      }),
    )
  }

  async findForExport(
    filters: PatientExportFilters,
  ): Promise<PatientForExportEntityRepo[]> {
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
        // apres la requete, plutot que par la forme de la requete elle-meme (tache 6, revue,
        // Important I2 : `serviceFile` ne doit porter aucune cle que `PatientServiceFileEntityRepo` ne
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
        ? (({ enrollmentIssues: _enrollmentIssuesOnServiceFile, ...rest }) =>
            rest)(primaryServiceFile)
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
  // patient-search-identite.test.ts, "la recherche ne rend que l'identite"). Ce `select` est un
  // renfort, pas la garantie qui compte : voir `patientIdentitySearchResponseSchema`
  // (patient.schema.ts) pour ce qui tient reellement la forme de la reponse HTTP (revue tache
  // 13, tour 1, point 5).
  //
  // Establishment-scope, PAS `runAsSystem` : Patient est un modele d'etablissement (comme
  // `establishmentScope` ci-dessus le sert deja a `findByID`/`findAll`/`create`), donc le
  // garde-fou d'ORM normal — un `where` qui porte `establishmentId` — suffit a filtrer TOUT
  // l'etablissement courant sans avoir a l'assouplir. Voir le commentaire de
  // `PatientDomain.searchByIdentity` pour pourquoi ce choix n'etend pas l'exception de
  // `estSuiviAilleurs`.
  //
  // `escapeLikePattern` (revue tache 13, tour 1, point 2) : `contains`/`mode: insensitive` se
  // traduit en `ILIKE` sur Postgres, et `%`/`_` y sont des jokers — un nom cherche contenant l'un
  // des deux (ou meme un simple `%`, sans nom) faisait sinon remonter tout l'etablissement,
  // exactement ce que le `.refine` du schema de requete (searchPatientIdentityQuerySchema) est
  // cense empecher. Prisma ne les echappe pas lui-meme : la valeur saisie est inseree telle
  // quelle dans le motif `%valeur%` envoye a Postgres. Ce n'est pas une injection SQL — Prisma
  // parametre deja la requete — seul le MOTIF `LIKE` est affecte.
  //
  // `take: IDENTITY_SEARCH_LIMIT + 1` (revue tache 13, tour 1, point 4) : une ligne de plus que
  // ce qu'on affiche jamais, uniquement pour savoir s'il y en a davantage — `hasMore` le dit,
  // sans jamais compter combien exactement (un `count()` sur toute la table couterait une
  // seconde requete a chaque recherche, pour un ecran qui n'a besoin que de savoir qu'il faut
  // affiner).
  async searchByIdentity(
    filters: PatientIdentitySearchFilters,
  ): Promise<PatientIdentitySearchRepoResult> {
    const { firstName, lastName, birthDate } = filters
    const matches = await this.prisma.patient.findMany({
      where: {
        ...this.establishmentScope,
        ...(firstName
          ? {
              firstName: {
                contains: escapeLikePattern(firstName),
                mode: 'insensitive',
              },
            }
          : {}),
        ...(lastName
          ? {
              lastName: {
                contains: escapeLikePattern(lastName),
                mode: 'insensitive',
              },
            }
          : {}),
        ...(birthDate ? { birthDate } : {}),
      },
      select: { id: true, firstName: true, lastName: true, birthDate: true },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      take: IDENTITY_SEARCH_LIMIT + 1,
    })
    const hasMore = matches.length > IDENTITY_SEARCH_LIMIT
    return {
      results: hasMore ? matches.slice(0, IDENTITY_SEARCH_LIMIT) : matches,
      hasMore,
    }
  }

  async findByID(patientID: string): Promise<PatientWithAppointmentsDomain> {
    try {
      // Les problemes d'inscription vivent desormais sur le sous-dossier de service (etape 3 du
      // multi-tenant) : la lecture passe par lui, puis s'aplatit pour garder la meme forme
      // qu'avant sur le patient (au plus un sous-dossier par service, donc pas de doublon).
      const { serviceFiles, ...patient } =
        await this.prisma.patient.findUniqueOrThrow({
          where: {
            id_establishmentId: { id: patientID, ...this.establishmentScope },
          },
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
      return {
        ...patient,
        enrollmentIssues: serviceFiles.flatMap((f) => f.enrollmentIssues),
      }
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
        where: {
          id_establishmentId: { id: patientID, ...this.establishmentScope },
        },
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
        where: {
          id_establishmentId: { id: patientID, ...this.establishmentScope },
        },
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
        await tx.patientPathwayPriority.deleteMany({
          where: { patientID, ...this.scope },
        })
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
            where: {
              id_serviceId: { id: ap.id, serviceId: this.scope.serviceId },
            },
          })

          if (isOnlyPatient) {
            await tx.appointment.delete({
              where: {
                id_serviceId: {
                  id: ap.appointment.id,
                  serviceId: this.scope.serviceId,
                },
              },
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
