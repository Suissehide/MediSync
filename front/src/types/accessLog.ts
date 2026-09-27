// Etape 4b, tache 10 : forme EXACTE de `patientAccessLogEntryResponseSchema`
// (back/src/main/interfaces/http/fastify/schemas/patientAccessLog.schema.ts), pour
// `GET /e/:establishmentId/s/:serviceId/patient/:patientID/acces`. Cette réponse est bornée à
// dessein (Zod, mode « strip » par défaut) à l'auteur, l'action, la date et le service — jamais
// `patientId`, `exportCount`, `exportFilters` ni `accesParOctroi`, MÊME SI le dépôt les calcule
// (voir le commentaire du schéma back, et celui de `columns/accessLog.column.tsx` pour ce que
// cela change ici). Ce type ne doit donc PORTER aucun de ces champs : lui en ajouter un
// laisserait croire qu'il peut arriver côté front alors que le back ne le sert jamais sur cette
// route.
export type PatientAccessLogEntry = {
  id: string
  action: string
  createdAt: string
  serviceId: string
  userFirstName: string | null
  userLastName: string | null
}
