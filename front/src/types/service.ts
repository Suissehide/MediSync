// Miroir de `back/src/main/interfaces/http/fastify/schemas/service.schema.ts`
// (tâche 13, onglet des services de l'administration d'établissement).
export type Service = {
  id: string
  name: string
  createdAt: string
  deactivatedAt: string | null
}

export type CreateServiceInput = { name: string }

export type UpdateServiceInput = {
  id: string
  name?: string
  deactivated?: boolean
}

// `GET /e/:establishmentId/admin/services/:id/impact-desactivation` (back,
// tâche 9) : les deux compteurs NE DISENT PAS LA MÊME CHOSE — voir
// `back/CLAUDE.md` § « Multi-tenant » et `service.schema.ts`.
// `suivisIci` : combien de patients ce service suit aujourd'hui.
// `suivisNullePartAilleurs` : combien d'entre eux ne sont suivis dans AUCUN
// AUTRE service actif — ceux-là deviendront invisibles PARTOUT si le
// service est désactivé. C'est ce second nombre qui décide, jamais le
// premier — ne jamais les afficher comme deux façons de dire la même chose.
export type ServiceDeactivationImpact = {
  suivisIci: number
  suivisNullePartAilleurs: number
}
