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
export type SuperAdminAccessLogQuery = {
  source: SuperAdminAccessLogSource
  establishmentId?: string
  userID?: string
  action?: string
}
