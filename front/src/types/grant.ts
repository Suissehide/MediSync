// Miroir de `establishmentGrantResponseSchema`
// (`back/src/main/interfaces/http/fastify/schemas/superAdminGrant.schema.ts`) :
// `GET /e/:establishmentId/admin/grants` — les octrois EN COURS ET PASSÉS
// dont CET établissement a fait l'objet, avec leur motif et leur auteur.
// Délibérément asymétrique avec le super-admin (`back/CLAUDE.md`,
// `grants.ts`) : l'établissement voit qui dispose d'un accès chez lui, le
// super-admin ne dispose pas de la liste des siens (aucune route `GET` ne
// l'expose).
export type EstablishmentGrant = {
  id: string
  reason: string
  grantedAt: string
  expiresAt: string
  revokedAt: string | null
  grantedBy: {
    id: string
    email: string
    firstName: string | null
    lastName: string | null
  }
}
