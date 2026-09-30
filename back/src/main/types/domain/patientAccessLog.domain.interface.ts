import type { PatientAccessLog } from '../../../generated/client'
import type {
  PatientAccessLogPage,
  PatientAccessLogPageParams,
  PlatformAccessLogFilters,
} from '../infra/orm/repositories/patientAccessLog.repository.interface'

// Journal des consultations d'un dossier patient (etape 4b). Quatre evenements distingues, sans
// que le journal ne porte jamais lui-meme de contenu clinique (voir `record`,
// domain/patientAccessLog.domain.ts, et `utils/clinical-fields.ts` pour la liste des cles
// interdites dans `exportFilters`).
//
// `echecsInscription.consultes` est la quatrieme valeur, ajoutee a l'etape 4b tache 3 (tour de
// correction 1, arbitrage de Leo) pour `GET /patient/:patientID/enrollment-issue` : cette lecture
// designe nommement un dossier (la reponse porte `patientId`) et son champ `reason` est du texte
// libre, donc elle doit etre journalisee — mais aucune des trois autres valeurs ne la decrirait
// sans induire en erreur qui relit le journal. La colonne `action` de `PatientAccessLog` est une
// chaine libre en base (prisma/schema.prisma) : cet ajout n'a demande aucune migration.
export type AccessAction =
  | 'dossier.ouvert'
  | 'sousDossier.ouvert'
  | 'echecsInscription.consultes'
  | 'export'

// `patientId` est optionnel depuis la tache 4 (etape 4b) : `GET /patient/export` n'a aucun
// identifiant de patient dans son URL, structurellement -- voir `utils/access-log-routes.ts`
// (`PATIENT_EXPORT_ROUTE_URL`, `plannedPatientExportAccess`) pour le mecanisme dedie qui la
// journalise quand meme, en une seule ligne. ARBITRAGE DE LEO (2026-09-27) : plutot que de
// deplacer l'export dans `ActivityLog`, la colonne `PatientAccessLog.patientId` (prisma/
// schema.prisma) devient nullable -- verifie avant d'ecrire que la cle etrangere composite
// (patientId, establishmentId) le tolere : Postgres, par defaut, en `MATCH SIMPLE`, n'exige la
// correspondance que lorsque AUCUNE colonne referente n'est nulle. Une ligne d'export
// (patientId `NULL`, establishmentId renseigne) ne declenche donc jamais la contrainte.
export type RecordAccessInput = {
  patientId?: string
  userID: string
  userFirstName: string | null
  userLastName: string | null
  action: AccessAction
  exportCount?: number
  exportFilters?: string
}

// Etape 4b, tache 5 (tour de correction 1, tache 10) : ce que rendent les deux premieres
// LECTURES du journal. Le type complet (`PatientAccessLog`, importe ci-dessous) porte des
// colonnes que ni l'une ni l'autre route ne doit rendre (`patientId`, `exportCount`,
// `exportFilters`) : c'est le schema Zod de reponse
// (interfaces/http/fastify/schemas/patientAccessLog.schema.ts), pas ce type, qui borne ce qui
// sort reellement en HTTP — voir son commentaire pour la liste exacte des cinq champs (auteur,
// action, date, service, `accesParOctroi`). `accesParOctroi` figurait a tort dans la liste
// exclue ici avant le tour de correction 1 : voir le commentaire du schema pour la raison.
export type PatientAccessLogEntityDomain = PatientAccessLog

export interface PatientAccessLogDomainInterface {
  record: (input: RecordAccessInput) => Promise<void>
  findByPatientInService: (
    patientId: string,
    params: PatientAccessLogPageParams,
  ) => Promise<PatientAccessLogPage>
  findByPatientInEstablishment: (
    patientId: string,
    params: PatientAccessLogPageParams,
  ) => Promise<PatientAccessLogPage>
  // Etape 4b, tache 6 : la TROISIEME lecture, a l'echelle de la plateforme (super-admin). Simple
  // relais vers le depot, comme les deux precedentes — voir `PatientAccessLogRepository.
  // findAllPlatformWide` pour le cloisonnement (delibere absent : c'est le point de la tache).
  findAllPlatformWide: (
    filters: PlatformAccessLogFilters,
  ) => Promise<PatientAccessLogPage>
  // Tache 8, etape 4b : purge planifiee, retention parametrable (`config.logRetentionMonths`),
  // meme forme qu'`ActivityLogDomainInterface.cleanup`.
  cleanup: () => Promise<{ deleted: number }>
}
