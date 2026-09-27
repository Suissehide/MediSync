import type { PatientAccessLog } from '../../../../../generated/client'

export type PatientAccessLogEntityRepo = PatientAccessLog

// Omet `establishmentId`/`serviceId` : c'est le depot qui les pose depuis
// `tenantContext.scope()`, jamais l'appelant (voir service.repository.ts, le modele explicite
// du cahier des charges de cette tache).
//
// `accesParOctroi` (decision du 2026-09-27, etape 4b) N'EST PAS dans `RecordAccessInput`
// (types/domain/patientAccessLog.domain.interface.ts) : c'est `PatientAccessLogDomain.record`
// qui la calcule depuis `tenantContext.current().origine` et la fournit ici, exactement comme
// `ServiceRepository.create` recoit `creatorUserId` du domaine plutot que de l'appelant HTTP.
export type PatientAccessLogCreateEntityRepo = {
  // Optionnel depuis la tache 4 (etape 4b) : une ligne d'export n'a pas d'identifiant de patient
  // (voir le commentaire de `RecordAccessInput`, types/domain/patientAccessLog.domain.interface.ts).
  patientId?: string
  userID: string
  userFirstName: string | null
  userLastName: string | null
  action: string
  exportCount?: number
  exportFilters?: string
  accesParOctroi: boolean
}

// Tache 6, etape 4b : `GET /super-admin/access-log` (source=acces). Memes filtres, libres,
// qu'`activityLog.repository.interface.ts#PlatformAccessLogFilters` — dupliques plutot que
// partages entre deux depots de modeles distincts, comme `ACTIVITY_LOG_DETAIL_LIMIT`/
// `UNRESOLVED_ACCOUNT_EMAIL` (establishment.repository.ts) le font deja pour de petites
// declarations locales de ce genre.
//
// `sansEtablissement` FIGURE ICI SANS Y SERVIR, et c'est delibere plutot qu'un oubli : les deux
// depots partagent une seule forme de filtres parce que la route les traite d'un seul geste
// (routes/super-admin/access-log.ts), mais `PatientAccessLog.establishmentId` est NON NULLABLE
// (prisma/schema.prisma) — aucune ligne de consultation ne peut etre sans etablissement. Le
// schema HTTP refuse donc la combinaison en amont, par un 400 qui le DIT, plutot que de laisser
// ce depot rendre une liste vide qu'on lirait « aucune aujourd'hui ». L'implementation ci-dessous
// ne lit jamais ce champ.
//
// `compte` remplace `userID` (revue finale de branche, Important n°1) : identifiant exact ou
// fragment de prenom/nom — voir le commentaire du schema HTTP pour le pourquoi.
export type PlatformAccessLogFilters = {
  establishmentId?: string
  sansEtablissement?: boolean
  compte?: string
  action?: string
}

export interface PatientAccessLogRepositoryInterface {
  create: (params: PatientAccessLogCreateEntityRepo) => Promise<PatientAccessLogEntityRepo>
  // Etape 4b, tache 5 : les deux premieres LECTURES du journal. `findByPatientInService` filtre
  // par `tenantContext.scope()` (establishmentId + serviceId du tenant courant) : c'est ce filtre
  // qui isole les acces d'un service de ceux d'un autre, jamais un `where` recopie a la main.
  // `findByPatientInEstablishment` filtre par `tenantContext.establishmentScope()` (establishmentId
  // seul) : elle rend les acces de TOUS les services de l'etablissement, pour l'administrateur.
  findByPatientInService: (patientId: string) => Promise<PatientAccessLogEntityRepo[]>
  findByPatientInEstablishment: (patientId: string) => Promise<PatientAccessLogEntityRepo[]>
  // Etape 4b, tache 6 : la TROISIEME lecture, a l'echelle de la PLATEFORME entiere -- sous
  // `runAsSuperAdmin`, jamais sous un tenant. Voir le commentaire sur l'implementation.
  findAllPlatformWide: (filters: PlatformAccessLogFilters) => Promise<PatientAccessLogEntityRepo[]>
  // Tache 8, etape 4b : purge planifiee (retention parametrable, voir PatientAccessLogDomain.
  // cleanup). Voir le commentaire de l'implementation pour le mecanisme de bornage.
  deleteOlderThan: (date: Date) => Promise<number>
}
