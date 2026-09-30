// Étape 4b, tâche 11 : forme EXACTE de `superAdminAccessLogEntryResponseSchema` (back,
// `superAdminAccessLog.schema.ts`), pour `GET /super-admin/access-log`. Une forme UNIQUE pour les
// deux journaux (jamais une union discriminée) : le back construit ce DTO champ par champ, jamais
// un `...row` étalé (voir le commentaire du schéma back) — ce type reprend exactement la même
// liste, ni plus ni moins, `patientId` compris (un IDENTIFIANT, jamais un nom : le super-admin
// compte les patients, il ne les lit pas — SUPERADMIN_OPERATIONS, `tenant-guard.ts`) et
// `accesParOctroi` compris (`boolean | null` : `null` sur les lignes `activite`, où cette notion
// n'existe pas — jamais `false`, qui affirmerait à tort un accès réel là où aucun octroi n'existe
// même conceptuellement).
export type SuperAdminAccessLogSource = 'activite' | 'acces'

export type SuperAdminAccessLogEntry = {
  id: string
  source: SuperAdminAccessLogSource
  establishmentId: string | null
  serviceId: string | null
  userID: string
  userFirstName: string | null
  userLastName: string | null
  action: string
  createdAt: string
  entityType: string | null
  entityID: string | null
  patientId: string | null
  accesParOctroi: boolean | null
}

// Miroir de `superAdminAccessLogQuerySchema` (back) : `source` est obligatoire (la route ne lit
// jamais les deux journaux à la fois), les trois autres sont les filtres optionnels de la spec
// (établissement, compte, action).
//
// REVUE FINALE DE BRANCHE, Important n°1 — deux évolutions, côté back comme ici :
//   - `establishmentId` accepte la valeur réservée `SANS_ETABLISSEMENT`
//     (`constants/superAdminAccessLog.constant.ts`), qui vise les lignes SANS établissement —
//     celles du script d'amorçage, les plus anciennes de la table. Elle existait parce qu'elles
//     tombaient hors de la page dure de 200 lignes (`PLATFORM_ACCESS_LOG_LIMIT`, back, supprimée
//     par la pagination du 2026-10-01) ; elle reste parce que les viser d'un filtre est plus court
//     que de paginer jusqu'aux plus anciennes lignes de la plateforme. Uniquement sur `activite` :
//     `PatientAccessLog.establishmentId` est non nullable, et le back répond 400 autrement.
//   - `compte` REMPLACE `userID` : identifiant exact **ou** fragment de prénom/nom, évalué EN
//     BASE. L'écran filtrait le compte dans le navigateur, sur la page déjà tronquée — chercher
//     un compte rendait « aucune entrée » alors que ses lignes existaient.
export type SuperAdminAccessLogQuery = {
  source: SuperAdminAccessLogSource
  establishmentId?: string
  compte?: string
  action?: string
  // PAGINATION (2026-10-01) : ferme la limite §8 de `docs/multi-tenant/decisions-etape-4b.md`.
  // Mêmes noms et mêmes bornes que les deux autres journaux (`GetActivityLogsParams`,
  // `api/activityLog.api.ts`). Optionnels ici comme là-bas : le back pose les défauts (1 et 50).
  page?: number
  pageSize?: number
}

// Miroir de `superAdminAccessLogsResponseSchema` (back) : une enveloppe, plus un tableau nu. `total`
// est le décompte du périmètre demandé HORS page — c'est lui que `ReactTable` reçoit en `rowCount`,
// et sans lui la dernière page n'existe pas pour la table.
export type SuperAdminAccessLogResponse = {
  data: SuperAdminAccessLogEntry[]
  total: number
  page: number
  pageSize: number
}
