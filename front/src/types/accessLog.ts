// Etape 4b, tache 10 (tour de correction 1) : forme EXACTE de
// `patientAccessLogEntryResponseSchema`
// (back/src/main/interfaces/http/fastify/schemas/patientAccessLog.schema.ts), pour
// `GET /e/:establishmentId/s/:serviceId/patient/:patientID/acces`. Cette réponse est bornée à
// dessein (Zod, mode « strip » par défaut) à l'auteur, l'action, la date, le service et
// `accesParOctroi` — jamais `patientId`, `exportCount` ni `exportFilters`, MÊME SI le dépôt les
// calcule. Ce type ne doit donc PORTER aucun de ces trois derniers champs : lui en ajouter un
// laisserait croire qu'il peut arriver côté front alors que le back ne le sert jamais sur cette
// route.
//
// `accesParOctroi` a d'abord été omis ici (premier jet de cette tâche), suivant le schéma back
// de la tâche 5 qui l'excluait — un défaut du cahier des charges de CETTE tâche-là, pas un choix
// délibéré : voir le commentaire du schéma back pour le détail. Le back l'expose désormais ;
// voir `columns/accessLog.column.tsx` pour comment ce booléen est rendu VISIBLE, pas seulement
// présent.
export type PatientAccessLogEntry = {
  id: string
  action: string
  createdAt: string
  serviceId: string
  userFirstName: string | null
  userLastName: string | null
  accesParOctroi: boolean
}
