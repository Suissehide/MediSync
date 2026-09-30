import Boom from '@hapi/boom'
import dayjs from 'dayjs'
import * as XLSX from 'xlsx'

import type { AppointmentType } from '../../generated/enums'
import {
  type TimeOfDay,
  timeOfDaySchema,
} from '../interfaces/http/fastify/schemas/patient.schema'
import type { IocContainer } from '../types/application/ioc'
import type { AppointmentPatientWithAppointmentDomain } from '../types/domain/appointmentPatient.domain.interface'
import type {
  EnrollExistingPatientInPathwaysInput,
  EnrollmentAppointment,
  EnrollmentResult,
  EnrollPatientInPathwaysInput,
  PathwayEnrollmentInput,
  PatientCreateEntityDomain,
  PatientDetailDomain,
  PatientDomainInterface,
  PatientEntityDomain,
  PatientExportFilters,
  PatientExportOptions,
  PatientExportResult,
  PatientIdentitySearchResultDomain,
  PatientPathwayDomain,
  PatientUpdateEntityDomain,
  PatientWithAppointmentsDomain,
  PatientWithTagsDomain,
  RemoveFromPathwayResult,
} from '../types/domain/patient.domain.interface'
import type { PatientServiceFileDomainInterface } from '../types/domain/patientServiceFile.domain.interface'
import type { AppointmentRepositoryInterface } from '../types/infra/orm/repositories/appointment.repository.interface'
import type { EnrollmentIssueRepositoryInterface } from '../types/infra/orm/repositories/enrollmentIssue.repository.interface'
import type {
  PathwayRepositoryInterface,
  PathwayWithSlotsRepo,
} from '../types/infra/orm/repositories/pathway.repository.interface'
import type { PathwayTemplateRepositoryInterface } from '../types/infra/orm/repositories/pathwayTemplate.repository.interface'
import type {
  PatientForExportEntityRepo,
  PatientIdentitySearchFilters,
  PatientRepositoryInterface,
} from '../types/infra/orm/repositories/patient.repository.interface'
import type { SlotWithTemplateAndAppointmentsRepo } from '../types/infra/orm/repositories/slot.repository.interface'
import type { ThematicRepositoryInterface } from '../types/infra/orm/repositories/thematic.repository.interface'
import type { Logger } from '../types/utils/logger'
import type { TenantContextInterface } from '../types/utils/tenant-context'
import type { AppEventBus } from '../utils/app-event-bus'
import { hasPermission } from '../utils/permissions'

const orEmpty = (value: string | null | undefined): string => value ?? ''
const formatDate = (value: Date | string | null | undefined): string =>
  value ? dayjs(value).format('DD/MM/YYYY') : ''

// Les deux boucles d'inscription (processEnrollments, enrollInSlot) attrapent toute erreur
// levee par un depot pour la transformer en echec partiel plutot qu'en 500 : la reponse
// (`failedEnrollments[].reason`, affichee a l'ecran par front/src/queries/usePatient.tsx) et le
// journal en portent le message. Un Boom est sans risque : son message est toujours ecrit par
// notre propre code (`boomErrorFromPrismaError`, ou un `Boom.xxx(...)` explicite d'un domaine).
// Mais 17 depots sur 19 ont des methodes sans `catch` : si l'une
// d'elles est appelee ici et jette une erreur brute (Prisma ou autre), ce n'est plus un Boom, et
// son message peut porter integralement les arguments de l'appel qui a echoue. On ne fait donc
// jamais confiance a `error.message` en dehors d'un Boom : seule sa classe, qui ne peut porter
// aucune valeur soumise, va au journal, et la reponse ne recoit qu'un texte generique.
const describeEnrollmentFailure = (
  context: string,
  error: unknown,
): { reason: string; logLine: string } => {
  if (Boom.isBoom(error)) {
    return {
      reason: error.message,
      logLine: `Erreur lors de l'inscription ${context}: ${error.message}`,
    }
  }
  const errorClass =
    error instanceof Error ? error.constructor.name : typeof error
  return {
    reason: `Erreur inattendue lors de l'inscription ${context}`,
    logLine: `Erreur inattendue lors de l'inscription ${context} [${errorClass}]`,
  }
}

// Une seule source de verite pour l'export Excel : en-tete, largeur de colonne et valeur lue
// vivent ensemble, dans cet ordre. `ws['!cols']` etait auparavant un tableau positionnel
// commente a la main, en regard de l'ordre des cles d'un objet construit juste au-dessus — rien
// (ni tsc, ni un schema Zod) ne les reliait, et un decalage entre les deux ne produisait aucune
// erreur, seulement des largeurs de colonnes fausses a l'ouverture du fichier. Les cles de
// `careMode`, `orientation`, `entryDate`, `exitDate`, `stopReason` et `medicalDiagnosis` vivent
// desormais sur le sous-dossier de service (`p.serviceFile`), plus sur `Patient` — `null` quand
// le patient n'a pas encore de sous-dossier dans le service courant.
type ExportColumn = {
  header: string
  width: number
  value: (p: PatientForExportEntityRepo) => string
  // Colonnes cliniques : presentes seulement pour qui a `clinical:read`.
  clinical?: boolean
}

const EXPORT_COLUMNS: ExportColumn[] = [
  { header: 'Prénom', width: 16, value: (p) => orEmpty(p.firstName) },
  { header: 'Nom', width: 16, value: (p) => orEmpty(p.lastName) },
  { header: 'Genre', width: 10, value: (p) => orEmpty(p.gender) },
  {
    header: 'Date de naissance',
    width: 18,
    value: (p) => formatDate(p.birthDate),
  },
  { header: 'Téléphone', width: 16, value: (p) => orEmpty(p.phone1) },
  { header: 'Téléphone 2', width: 16, value: (p) => orEmpty(p.phone2) },
  { header: 'Email', width: 28, value: (p) => orEmpty(p.email) },
  {
    header: "Date d'entrée",
    width: 14,
    value: (p) => formatDate(p.serviceFile?.entryDate),
  },
  {
    header: 'Date de sortie',
    width: 14,
    value: (p) => formatDate(p.serviceFile?.exitDate),
  },
  {
    header: 'Parcours',
    width: 30,
    value: (p) => p.pathwayTemplateTags.join(', '),
  },
  {
    header: 'Mode de prise en charge',
    width: 24,
    value: (p) => orEmpty(p.serviceFile?.careMode),
  },
  {
    header: 'Orientation',
    width: 18,
    value: (p) => orEmpty(p.serviceFile?.orientation),
  },
  { header: 'Profession', width: 20, value: (p) => orEmpty(p.occupation) },
  {
    header: "Niveau d'étude",
    width: 18,
    value: (p) => orEmpty(p.educationLevel),
  },
  { header: 'Distance', width: 14, value: (p) => orEmpty(p.distance) },
  {
    header: 'Motif de sortie',
    width: 22,
    value: (p) => orEmpty(p.serviceFile?.stopReason),
  },
  {
    header: 'Diagnostic médical',
    width: 28,
    value: (p) => orEmpty(p.serviceFile?.medicalDiagnosis),
    clinical: true,
  },
  {
    header: 'Notes',
    width: 40,
    value: (p) => orEmpty(p.serviceFile?.notes),
    clinical: true,
  },
]

class PatientDomain implements PatientDomainInterface {
  private readonly logger: Logger
  private readonly patientRepository: PatientRepositoryInterface
  private readonly pathwayRepository: PathwayRepositoryInterface
  private readonly pathwayTemplateRepository: PathwayTemplateRepositoryInterface
  private readonly appointmentRepository: AppointmentRepositoryInterface
  private readonly enrollmentIssueRepository: EnrollmentIssueRepositoryInterface
  private readonly thematicRepository: ThematicRepositoryInterface
  private readonly patientServiceFileDomain: PatientServiceFileDomainInterface
  private readonly tenantContext: TenantContextInterface
  private readonly appEventBus: AppEventBus

  constructor({
    patientRepository,
    pathwayRepository,
    pathwayTemplateRepository,
    appointmentRepository,
    enrollmentIssueRepository,
    thematicRepository,
    patientServiceFileDomain,
    tenantContext,
    appEventBus,
    logger,
  }: IocContainer) {
    this.patientRepository = patientRepository
    this.pathwayRepository = pathwayRepository
    this.pathwayTemplateRepository = pathwayTemplateRepository
    this.appointmentRepository = appointmentRepository
    this.enrollmentIssueRepository = enrollmentIssueRepository
    this.thematicRepository = thematicRepository
    this.patientServiceFileDomain = patientServiceFileDomain
    this.tenantContext = tenantContext
    this.appEventBus = appEventBus
    this.logger = logger
  }

  findAll(): Promise<PatientEntityDomain[]> {
    return this.patientRepository.findAll()
  }

  findAllWithTags(): Promise<PatientWithTagsDomain[]> {
    return this.patientRepository.findAllWithTags()
  }

  // Recherche d'identite existante avant creation (design §6) : passe-plat vers le
  // depot, SANS `runAsSystem`. Contrairement a `estSuiviAilleurs` (patientServiceFile.repository
  // .ts), qui doit traverser la frontiere entre SERVICES, cette recherche ne traverse qu'une
  // frontiere de SERVICE a l'interieur du MEME etablissement : Patient est un modele
  // d'etablissement (voir `establishmentScope` dans patient.repository.ts, deja utilise par
  // `findByID`/`findAll`/`create`), donc une lecture filtree sur l'etablissement courant du
  // garde-fou d'ORM normal suffit — nul besoin d'assouplir quoi que ce soit. Ne pas y ajouter
  // `runAsSystem` : l'exception unique ici reste `estSuiviAilleurs`, et
  // `runAsSystem-unicite.test.ts` le verifie par lecture de source.
  //
  // `hasMore` fait partie de la reponse depuis le depot lui-meme : c'est lui qui possede le
  // `take` et la limite, voir `PatientRepository.searchByIdentity`. Passe-plat pur, comme avant.
  searchByIdentity(
    filters: PatientIdentitySearchFilters,
  ): Promise<PatientIdentitySearchResultDomain> {
    return this.patientRepository.searchByIdentity(filters)
  }

  // Le signal de suivi ailleurs (spec §5.3/§6) est porte ici, pas sur le
  // sous-dossier de service. `followedElsewhere` n'est calcule, et present dans la reponse, QUE
  // si le service courant a deja son propre sous-dossier pour ce patient : tout patient cree ou
  // rattache dans un service y possede un sous-dossier (`ensureExists`), donc cette condition
  // recouvre exactement « ce patient est chez moi ». Le signal existe pour avertir un service
  // qui suit DEJA un patient qu'il est suivi ailleurs — pas pour renseigner
  // quelqu'un qui se contente de le chercher : la recherche (`searchByIdentity` ci-dessus) rend
  // un `id` accessible a `patient:read`, donc a LECTURE, et cet `id` mene ici. Sans cette garde,
  // deux requetes HTTP sans aucune ecriture suffisaient a apprendre qu'un patient est suivi dans
  // un autre service — exactement ce que la spec §6 interdit ("trouver quelqu'un ne revele que
  // son identite, jamais son suivi"). Voir `dossier-service.test.ts` pour les trois cas.
  //
  // `estSuiviAilleurs` traverse la frontiere entre services (spec §5.3) : seule la condition qui
  // decide de l'appeler a change ici.
  //
  // CE QU'IL REPOND, ET POURQUOI CE N'EST PAS LE MEME CALCUL QUE L'IMPACT D'UNE DESACTIVATION :
  // `estSuiviAilleurs` repond « un sous-dossier existe-t-il ailleurs », vrai MEME si cet ailleurs
  // est un service aujourd'hui desactive — le sous-dossier existe toujours, et ce service peut
  // etre reactive (reactiver rend tout). `ServiceDomain.impactDesactivation`
  // (via `PatientServiceFileRepository.impactDesactivation`) repond une question DIFFERENTE : «
  // ce patient va-t-il devenir invisible partout », et un ailleurs deja desactive ne protege de
  // rien — il compte donc les services ACTIFS seulement. Deux questions, deux reponses justes,
  // volontairement PAS alignees : les aligner casserait l'une des deux.
  async findByID(patientID: string): Promise<PatientDetailDomain> {
    const patient = await this.patientRepository.findByID(patientID)
    const hasFileHere =
      await this.patientServiceFileDomain.findByPatient(patientID)
    if (!hasFileHere) {
      return patient
    }
    const followedElsewhere =
      await this.patientServiceFileDomain.estSuiviAilleurs(patientID)
    return { ...patient, followedElsewhere }
  }

  async exportExcel(
    filters: PatientExportFilters,
    { includeClinicalFields }: PatientExportOptions,
  ): Promise<PatientExportResult> {
    const patients = await this.patientRepository.findForExport(filters)
    const columns = EXPORT_COLUMNS.filter(
      (c) => includeClinicalFields || !c.clinical,
    )

    const rows = patients.map((p) =>
      Object.fromEntries(columns.map((c) => [c.header, c.value(p)])),
    )

    const ws = XLSX.utils.json_to_sheet(rows)
    ws['!cols'] = columns.map((c) => ({ wch: c.width }))

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Patients')
    const buffer = XLSX.write(wb, {
      type: 'buffer',
      bookType: 'xlsx',
    }) as Buffer
    // `count` : le nombre de dossiers REELLEMENT rendus, pour le journal des
    // consultations -- voir `PatientExportResult` (types/domain/patient.domain.interface.ts).
    return { buffer, count: patients.length }
  }

  async create(
    patientCreateParams: PatientCreateEntityDomain,
    userID: string,
  ): Promise<PatientEntityDomain> {
    const patientInputParams = {
      ...patientCreateParams,
      createDate: new Date().toISOString(),
    }
    const patient = await this.patientRepository.create(patientInputParams)
    // Cree le sous-dossier de service des la creation du patient — troisieme appel a
    // `ensureExists`, meme forme que les deux autres (processEnrollments plus bas, et
    // DiagnosticEducatifDomain.create) : ni transaction, ni try/catch, une erreur remonte telle
    // quelle (Boom via errorHandler.boomErrorFromPrismaError). Avant ce correctif, seuls
    // processEnrollments et DiagnosticEducatifDomain.create appelaient `ensureExists` : un
    // patient cree par le bouton « Creer sans parcours » du formulaire d'ajout (POST /patient
    // seul, aucune inscription, aucun diagnostic) ne recevait donc aucun sous-dossier. Depuis
    // que la liste de patients filtre sur le sous-dossier du service courant (voir
    // PatientRepository.findAllWithTags), ce patient disparaissait de la liste de TOUT
    // service — y compris celui ou il vient d'etre cree : il restait en base et dans l'export,
    // mais plus aucune route normale ne permettait de le rouvrir. Une perte d'acces a un dossier
    // de sante, sur un chemin de creation qui existe dans l'interface.
    //
    // Decision : creer un patient depuis un service, c'est le
    // suivre dans ce service. Le cout est connu et assume : un patient cree par erreur dans le
    // mauvais service y laissera un sous-dossier vide IRREVERSIBLE (aucune route ne supprime un
    // sous-dossier, voir le commentaire au-dessus de `ensureExists` dans
    // patientServiceFile.repository.ts), qui allumera le signal « suivi ailleurs »
    // (`estSuiviAilleurs`) pour les autres services de l'etablissement. C'est exactement la
    // meme consequence, deja acceptee et documentee, qu'un diagnostic cree dans le mauvais
    // service (voir le test correspondant dans dossier-service.test.ts). Entre une trace de
    // trop — qui se voit, par le signal — et un dossier introuvable, la trace de trop est le
    // moindre mal : le signal ne revele jamais qu'un booleen (spec §5.3), quand l'absence de
    // sous-dossier privait le soignant de tout acces normal au dossier.
    await this.patientServiceFileDomain.ensureExists(patient.id)
    this.appEventBus.emit('patient.created', { userID, patientId: patient.id })
    return patient
  }

  async update(
    patientID: string,
    patientUpdateParams: PatientUpdateEntityDomain,
    userID: string,
  ): Promise<PatientEntityDomain> {
    const patient = await this.patientRepository.update(
      patientID,
      patientUpdateParams,
    )
    this.appEventBus.emit('patient.updated', { userID, patientId: patient.id })
    return patient
  }

  async delete(
    patientID: string,
    userID: string,
  ): Promise<PatientEntityDomain> {
    const patient = await this.patientRepository.findByID(patientID)
    const appointmentIDs = patient.appointmentPatients.map(
      (ap) => ap.appointment.id,
    )

    const deleted = await this.patientRepository.delete(patientID)

    if (appointmentIDs.length > 0) {
      await this.appointmentRepository.deleteOrphanedByIds(appointmentIDs)
    }

    this.appEventBus.emit('patient.deleted', { userID, patientId: deleted.id })
    return deleted
  }

  async countAppointmentsInPathway(
    patientID: string,
    pathwayID: string,
  ): Promise<{ count: number }> {
    const count = await this.patientRepository.countAppointmentsInPathway(
      patientID,
      pathwayID,
    )
    return { count }
  }

  async removeFromPathway(
    patientID: string,
    pathwayID: string,
    userID: string,
  ): Promise<RemoveFromPathwayResult> {
    const result = await this.patientRepository.removeFromPathway(
      patientID,
      pathwayID,
    )

    this.appEventBus.emit('patient.removedFromPathway', {
      userID,
      patientId: patientID,
      pathwayId: pathwayID,
    })

    return result
  }

  getPathways(patientID: string): Promise<PatientPathwayDomain[]> {
    return this.patientRepository.getPathwaysForPatient(patientID)
  }

  async setPathwayPriorities(
    patientID: string,
    orderedPathwayIDs: string[],
  ): Promise<void> {
    await this.patientRepository.setPathwayPriorities(
      patientID,
      orderedPathwayIDs,
    )
  }

  async enrollPatientInPathways(
    enrollmentData: EnrollPatientInPathwaysInput,
    userID: string,
  ): Promise<EnrollmentResult> {
    const patient = await this.create(enrollmentData.patientData, userID)
    return this.processEnrollments(
      { ...patient, appointmentPatients: [], enrollmentIssues: [] },
      enrollmentData.pathways,
      enrollmentData.startDate,
      userID,
    )
  }

  async enrollExistingPatientInPathways(
    enrollmentData: EnrollExistingPatientInPathwaysInput,
    userID: string,
  ): Promise<EnrollmentResult> {
    const patient = await this.patientRepository.findByID(
      enrollmentData.patientID,
    )
    return this.processEnrollments(
      patient,
      enrollmentData.pathways,
      enrollmentData.startDate,
      userID,
    )
  }

  private async resolveDuration(
    enrollment: PathwayEnrollmentInput,
  ): Promise<number> {
    if (enrollment.thematicID && !enrollment.duration) {
      const thematic = await this.thematicRepository.findByID(
        enrollment.thematicID,
      )
      return thematic.duration ?? 30
    }
    return enrollment.duration ?? 30
  }

  // `thematicID` finit en Appointment.thematicId (référence simple, sans
  // clé composite) sans passer par AppointmentDomain.create ici : on vérifie
  // donc nous-mêmes qu'il appartient au tenant, en le chargeant par son
  // repository filtré. Indépendant de resolveDuration ci-dessus, qui ne fait
  // ce même chargement que lorsque `duration` est absent.
  private async assertThematicBelongsToTenant(
    enrollment: PathwayEnrollmentInput,
  ): Promise<void> {
    if (enrollment.thematicID) {
      await this.thematicRepository.findByID(enrollment.thematicID)
    }
  }

  private selectValidPathway(
    pathways: PathwayWithSlotsRepo[],
    enrollment: PathwayEnrollmentInput,
    patient: PatientWithAppointmentsDomain,
    thematicDuration: number,
    firstAppointmentOnly: boolean,
    startDate: Date,
  ): PathwayWithSlotsRepo | undefined {
    if (!firstAppointmentOnly) {
      return pathways.find((pathway) =>
        this.isPathwayAvailable(
          pathway.slots,
          enrollment.timeOfDay,
          patient.appointmentPatients,
          1,
          thematicDuration,
        ),
      )
    }
    const startOfDay = new Date(startDate)
    startOfDay.setHours(0, 0, 0, 0)
    return pathways.find((pathway) =>
      pathway.slots
        .filter((slot) => new Date(slot.startDate) >= startOfDay)
        .sort(
          (a, b) =>
            new Date(a.startDate).getTime() - new Date(b.startDate).getTime(),
        )
        .some((slot) =>
          this.isSlotAvailable(
            slot,
            enrollment.timeOfDay,
            patient.appointmentPatients,
            1,
            thematicDuration,
          ),
        ),
    )
  }

  // Traite l'inscription du patient pour un tag de parcours donné et retourne
  // soit une inscription réussie, soit un échec (jamais les deux).
  private async enrollPatientInTag(
    patient: PatientWithAppointmentsDomain,
    enrollment: PathwayEnrollmentInput,
    startDate: Date,
  ): Promise<{
    enrollment?: EnrollmentResult['enrollments'][number]
    failure?: EnrollmentResult['failedEnrollments'][number]
  }> {
    await this.assertThematicBelongsToTenant(enrollment)
    const thematicDuration = await this.resolveDuration(enrollment)

    // Vérifier si le motif est requis
    const allTemplates = await this.pathwayTemplateRepository.findAll()
    const matchingTemplate = allTemplates.find(
      (t) => t.mainTag === enrollment.tag,
    )
    if (
      matchingTemplate?.motifRequired &&
      (!enrollment.motif || !enrollment.motif.trim())
    ) {
      return {
        failure: {
          slotTemplate: { id: enrollment.tag, name: enrollment.tag },
          reason: `Le motif est obligatoire pour le parcours "${enrollment.tag}"`,
        },
      }
    }

    const firstAppointmentOnly = matchingTemplate?.firstAppointmentOnly ?? false

    // Trouver les parcours disponibles par tag
    const pathways = firstAppointmentOnly
      ? await this.pathwayRepository.findByTemplateTagWithFutureSlots(
          enrollment.tag,
          startDate,
        )
      : await this.pathwayRepository.findByTemplateTagAndDate(
          enrollment.tag,
          startDate,
        )

    if (pathways.length === 0) {
      return {
        failure: {
          slotTemplate: { id: enrollment.tag },
          reason: `Aucun parcours disponible ou complet pour "${enrollment.tag}"`,
        },
      }
    }

    const validPathway = this.selectValidPathway(
      pathways,
      enrollment,
      patient,
      thematicDuration,
      firstAppointmentOnly,
      startDate,
    )

    if (!validPathway) {
      return {
        failure: {
          slotTemplate: { id: enrollment.tag, name: enrollment.tag },
          reason: `Aucun parcours disponible ou complet pour "${enrollment.tag}"`,
        },
      }
    }

    const appointments = await this.enrollOnPathway(
      patient,
      validPathway,
      enrollment,
      enrollment.thematicID,
      thematicDuration,
      firstAppointmentOnly,
      startDate,
    )
    return {
      enrollment: {
        slotTemplate: { id: enrollment.tag, name: enrollment.tag },
        appointments,
      },
    }
  }

  private async processEnrollments(
    patient: PatientWithAppointmentsDomain,
    pathwayTemplates: EnrollPatientInPathwaysInput['pathways'],
    startDate: Date,
    userID: string,
  ): Promise<EnrollmentResult> {
    // Point de passage unique de l'inscription en parcours (enrollPatientInPathways et
    // enrollExistingPatientInPathways y mènent toutes deux) : c'est donc ici, et nulle part
    // ailleurs, que la spec (§5.1) exige la création du sous-dossier de service, avant toute
    // écriture d'un `EnrollmentIssue` plus bas — sans quoi sa clé étrangère (patientId,
    // serviceId) → PatientServiceFile serait violée dès qu'une inscription échoue.
    await this.patientServiceFileDomain.ensureExists(patient.id)

    const enrollments: EnrollmentResult['enrollments'] = []
    const failedEnrollments: EnrollmentResult['failedEnrollments'] = []
    let currentPatient = patient

    for (const enrollment of pathwayTemplates) {
      try {
        const outcome = await this.enrollPatientInTag(
          currentPatient,
          enrollment,
          startDate,
        )
        if (outcome.enrollment) {
          enrollments.push(outcome.enrollment)
          // Recharger les rendez-vous du patient pour que les parcours
          // suivants de la même requête voient ceux qui viennent d'être créés.
          currentPatient = await this.patientRepository.findByID(patient.id)
        }
        if (outcome.failure) {
          failedEnrollments.push(outcome.failure)
        }
      } catch (error) {
        const { reason, logLine } = describeEnrollmentFailure(
          `au parcours avec tag "${enrollment.tag}"`,
          error,
        )
        this.logger.error(logLine)
        failedEnrollments.push({
          slotTemplate: {
            id: enrollment.tag,
          },
          reason,
        })
      }
    }

    if (failedEnrollments.length > 0) {
      await this.enrollmentIssueRepository.create(
        patient.id,
        failedEnrollments.map((f) => ({
          pathwayTemplateID: f.slotTemplate.id,
          pathwayName: f.slotTemplate.name,
          reason: f.reason,
          startDate,
        })),
      )
    }

    this.appEventBus.emit('patient.enrolled', { userID, patientId: patient.id })

    return {
      patient: await this.patientRepository.findByID(patient.id),
      enrollments,
      failedEnrollments,
    }
  }

  private isSlotAvailable(
    slot: SlotWithTemplateAndAppointmentsRepo,
    timeOfDay: TimeOfDay,
    patientAppointments: AppointmentPatientWithAppointmentDomain[],
    maxCapacity = 1,
    appointmentDuration = 30,
  ): boolean {
    const slotStart = dayjs(slot.startDate)
    const slotEnd = dayjs(slot.endDate)
    const slotHour = slotStart.hour()

    if (
      (timeOfDay === timeOfDaySchema.enum.MORNING && slotHour >= 13) ||
      (timeOfDay === timeOfDaySchema.enum.AFTERNOON && slotHour < 13)
    ) {
      return false
    }

    // Créneau individuel : disponible s'il reste une sous-fenêtre libre en
    // tenant compte des rendez-vous du créneau et de ceux du patient.
    if (slot.slotTemplate.isIndividual) {
      const nextSlot = this.getNextAvailableAppointment(
        slotStart.toDate(),
        slotEnd.toDate(),
        this.busyIntervals(slot, patientAppointments),
        appointmentDuration,
      )
      return nextSlot !== null
    }

    // Créneau multiple : le rendez-vous occupe tout le créneau, il ne doit
    // chevaucher aucun rendez-vous du patient.
    const overlapsPatient = patientAppointments.some((patientAppointment) => {
      const appointment = patientAppointment.appointment
      const appointmentStart = dayjs(appointment.startDate)
      const appointmentEnd = dayjs(appointment.endDate)
      return (
        slotStart.isBefore(appointmentEnd) && slotEnd.isAfter(appointmentStart)
      )
    })
    if (overlapsPatient) {
      return false
    }

    if (slot.appointments && slot.appointments.length > 0) {
      const allFull = slot.appointments.every(
        (appointment) =>
          (appointment.appointmentPatients?.length ?? 0) >=
          (slot.slotTemplate.capacity ?? maxCapacity),
      )
      if (allFull) {
        return false
      }
    }

    return true
  }

  private isPathwayAvailable(
    slots: SlotWithTemplateAndAppointmentsRepo[],
    timeOfDay: TimeOfDay,
    patientAppointments: AppointmentPatientWithAppointmentDomain[],
    maxCapacity = 1,
    appointmentDuration = 30,
  ): boolean {
    return slots.every((slot) =>
      this.isSlotAvailable(
        slot,
        timeOfDay,
        patientAppointments,
        maxCapacity,
        appointmentDuration,
      ),
    )
  }

  // Inscrit le patient sur un créneau donné et retourne les rendez-vous
  // produits (0 ou 1). En mode firstAppointmentOnly, un créneau individuel
  // sans place disponible ne produit pas d'échec (retourne un tableau vide).
  private async enrollInSlot(
    slot: SlotWithTemplateAndAppointmentsRepo,
    patient: PatientWithAppointmentsDomain,
    options: {
      type?: AppointmentType | null
      motif?: string | null
      thematicId?: string | null
      appointmentDuration: number
      firstAppointmentOnly: boolean
    },
  ): Promise<EnrollmentAppointment[]> {
    const {
      type,
      motif,
      thematicId,
      appointmentDuration,
      firstAppointmentOnly,
    } = options
    // `motif` vient du corps de la requête d'inscription : c'est du texte
    // libre saisi par l'utilisateur. `transmissionNotes` est une colonne
    // clinique, que le hook `stripClinicalInput` refuse en entrée à qui n'a
    // pas `clinical:write` — mais il ne reconnaît pas ce champ-ci, qui la
    // remplit sous un autre nom. Le report est donc soumis ici à la même
    // permission, sans quoi un compte SECRETARIAT ou LECTURE écrirait dans
    // une transmission clinique par la porte de service. Calculé une fois et
    // appliqué aux trois écritures ci-dessous.
    const { serviceRole, establishmentRole } = this.tenantContext.current()
    const canWriteClinical = hasPermission(
      { serviceRole, establishmentRole },
      'clinical:write',
    )
    const transmissionNotes = canWriteClinical
      ? (motif ?? undefined)
      : undefined

    if (slot.slotTemplate.isIndividual) {
      const nextSlot = this.getNextAvailableAppointment(
        slot.startDate,
        slot.endDate,
        this.busyIntervals(slot, patient.appointmentPatients),
        appointmentDuration,
      )
      if (!nextSlot) {
        return firstAppointmentOnly
          ? []
          : [
              {
                success: false,
                error: `Erreur lors de l'inscription au créneau du ${slot.startDate}`,
              },
            ]
      }
      const appointment = await this.appointmentRepository.create({
        startDate: nextSlot.startDate,
        endDate: nextSlot.endDate,
        thematicId: thematicId ?? undefined,
        type: type ?? undefined,
        slotID: slot.id,
        patientIDs: [patient.id],
        transmissionNotes,
      })
      return [
        {
          id: appointment.id,
          startDate: appointment.startDate,
          endDate: appointment.endDate,
          success: true,
        },
      ]
    }

    // Créneau multiple : rejoindre un rendez-vous existant avec de la place,
    // sinon en créer un nouveau.
    const existingAppointment = slot.appointments.find((apt) => {
      const currentCapacity = apt.appointmentPatients?.length || 0
      const maxCapacity = slot.slotTemplate.capacity || Number.POSITIVE_INFINITY
      return currentCapacity < maxCapacity
    })

    if (existingAppointment) {
      await this.appointmentRepository.addPatientToAppointment({
        appointmentID: existingAppointment.id,
        patientID: patient.id,
        transmissionNotes,
      })
      return [
        {
          id: existingAppointment.id,
          startDate: existingAppointment.startDate,
          endDate: existingAppointment.endDate,
          success: true,
        },
      ]
    }

    const appointment = await this.appointmentRepository.create({
      startDate: slot.startDate,
      endDate: slot.endDate,
      thematicId: thematicId ?? undefined,
      type: type ?? undefined,
      slotID: slot.id,
      patientIDs: [patient.id],
      transmissionNotes,
    })
    return [
      {
        id: appointment.id,
        startDate: appointment.startDate,
        endDate: appointment.endDate,
        success: true,
      },
    ]
  }

  private async enrollOnPathway(
    patient: PatientWithAppointmentsDomain,
    pathway: PathwayWithSlotsRepo,
    pathwayTemplate: PathwayEnrollmentInput,
    thematicId?: string,
    appointmentDuration = 30,
    firstAppointmentOnly = false,
    enrollmentDate?: Date,
  ): Promise<EnrollmentAppointment[]> {
    const { type, motif, timeOfDay } = pathwayTemplate
    let slots = [...pathway.slots].sort(
      (a, b) =>
        new Date(a.startDate).getTime() - new Date(b.startDate).getTime(),
    )

    // En mode firstAppointmentOnly, ne considérer que les slots futurs qui
    // respectent le moment de la journée et ne chevauchent pas les rendez-vous
    // existants du patient (le parcours a été choisi parce qu'au moins un de
    // ses slots convient, pas forcément le premier).
    if (firstAppointmentOnly && enrollmentDate) {
      const startOfDay = new Date(enrollmentDate)
      startOfDay.setHours(0, 0, 0, 0)
      slots = slots.filter(
        (slot) =>
          new Date(slot.startDate) >= startOfDay &&
          this.isSlotAvailable(
            slot,
            timeOfDay,
            patient.appointmentPatients,
            1,
            appointmentDuration,
          ),
      )
    }

    const enrollmentAppointments: EnrollmentAppointment[] = []

    for (const slot of slots) {
      try {
        const slotAppointments = await this.enrollInSlot(slot, patient, {
          type,
          motif,
          thematicId,
          appointmentDuration,
          firstAppointmentOnly,
        })
        enrollmentAppointments.push(...slotAppointments)

        // En mode firstAppointmentOnly, on s'arrête au premier créneau réussi.
        if (firstAppointmentOnly && slotAppointments.some((a) => a.success)) {
          return enrollmentAppointments
        }
      } catch (error) {
        // Catch muet corrige : c'est lui qui a laisse vivre trois jours, sans aucune trace,
        // le defaut de composite key de AppointmentRepository.create — une erreur de
        // programmation rendue au patient comme un probleme de disponibilite de creneau. Meme
        // forme que le catch de enrollPatientInPathways ci-dessus : describeEnrollmentFailure,
        // jamais le message brut d'une erreur qui n'est pas un Boom.
        const { reason, logLine } = describeEnrollmentFailure(
          `au créneau du ${slot.startDate}`,
          error,
        )
        this.logger.error(logLine)
        enrollmentAppointments.push({
          success: false,
          error: reason,
        })
      }
    }

    return enrollmentAppointments
  }

  // Intervalles à éviter dans un créneau individuel : les rendez-vous déjà
  // pris dans le créneau (tous patients) et les rendez-vous du patient
  // (parcours multiples, autres créneaux).
  private busyIntervals(
    slot: SlotWithTemplateAndAppointmentsRepo,
    patientAppointments: AppointmentPatientWithAppointmentDomain[],
  ): { startDate: Date; endDate: Date }[] {
    return [
      ...slot.appointments,
      ...patientAppointments.map((ap) => ap.appointment),
    ]
  }

  private getNextAvailableAppointment(
    slotStart: Date,
    slotEnd: Date,
    existingAppointments: { startDate: Date; endDate: Date }[],
    durationMinutes = 30,
  ) {
    // Trier les rendez-vous existants par startDate
    const sortedAppointments = [...existingAppointments].sort(
      (a, b) => a.startDate.getTime() - b.startDate.getTime(),
    )

    let nextAvailableStart = dayjs(slotStart)
    const slotEndDayjs = dayjs(slotEnd)

    // Avance la fenêtre candidate [start, start+durée] tant qu'elle chevauche
    // un rendez-vous existant. On ré-itère car repousser le début après un
    // rendez-vous peut faire entrer la fenêtre en collision avec le suivant.
    let collisionFound = true
    while (collisionFound) {
      collisionFound = false
      const candidateEnd = nextAvailableStart.add(durationMinutes, 'minute')

      for (const appointment of sortedAppointments) {
        const appointmentStart = dayjs(appointment.startDate)
        const appointmentEnd = dayjs(appointment.endDate)

        // Chevauchement d'intervalles : start < apptEnd && candidateEnd > apptStart
        if (
          nextAvailableStart.isBefore(appointmentEnd) &&
          candidateEnd.isAfter(appointmentStart)
        ) {
          nextAvailableStart = appointmentEnd
          collisionFound = true
          break
        }
      }

      // Sortie si la fenêtre ne tient plus dans le créneau.
      if (
        nextAvailableStart.add(durationMinutes, 'minute').isAfter(slotEndDayjs)
      ) {
        return null
      }
    }

    const nextAvailableEnd = nextAvailableStart.add(durationMinutes, 'minute')

    // Vérifier que ça tient dans le slot
    if (nextAvailableEnd.isAfter(slotEndDayjs)) {
      return null
    }

    return {
      startDate: nextAvailableStart.toDate(),
      endDate: nextAvailableEnd.toDate(),
    }
  }
}

export { PatientDomain }
