// Forme EXACTE de
// `patientAccessLogEntryResponseSchema`
// (back/src/main/interfaces/http/fastify/schemas/patientAccessLog.schema.ts), pour
// `GET /e/:establishmentId/s/:serviceId/patient/:patientID/acces`. Cette réponse est bornée à
// dessein (Zod, mode « strip » par défaut) à l'auteur, l'action, la date, le service et
// `accesParOctroi` — jamais `patientId`, `exportCount` ni `exportFilters`, MÊME SI le dépôt les
// calcule. Ce type ne doit donc PORTER aucun de ces trois derniers champs : lui en ajouter un
// laisserait croire qu'il peut arriver côté front alors que le back ne le sert jamais sur cette
// route.
//
// `accesParOctroi` : voir `columns/accessLog.column.tsx` pour comment ce booléen est rendu
// VISIBLE, pas seulement présent.

// PAGINÉE DEPUIS LE 2026-10-01 : cette lecture n'avait AUCUNE borne, ni de page ni de nombre de
// lignes — un dossier très consulté rendait tout son journal d'une traite, et ce journal grossit à
// chaque ouverture du dossier. `total` est le décompte hors page, ce que `ReactTable` attend en
// `rowCount`. Enveloppe identique aux deux autres journaux du dépôt (`ActivityLogsResponse`,
// `SuperAdminAccessLogResponse`).
export type PatientAccessLogResponse = {
  data: PatientAccessLogEntry[]
  total: number
  page: number
  pageSize: number
}

export type PatientAccessLogEntry = {
  id: string
  action: string
  createdAt: string
  serviceId: string
  userFirstName: string | null
  userLastName: string | null
  accesParOctroi: boolean
}
