import { z } from 'zod/v4'

// Les identifiants que l'application EMET ou RECOIT ne sont pas tous des cuid, et les valider
// comme tels refuse les siens. La migration du socle multi-tenant
// (`20260922144905_multi_tenant_socle`) fabrique elle-meme, pour reprendre les donnees d'avant,
// l'etablissement (`est_<20 hex>`), son service (`svc_`), et les appartenances
// d'etablissement (`em_`) et de service (`sm_`) de chaque compte existant. Aucun n'est un cuid.
// Constate en vrai : `GET /admin/services` rendait 500 (serialisation refusee) et le front
// relancait la requete sans fin ; affecter un membre au service d'origine, ou modifier un membre
// preexistant, rendait 400. `establishment.schema.ts` employait deja `z.string()` — ce fichier
// s'aligne. Un identifiant de REPONSE n'a de toute facon pas a etre valide : c'est notre donnee.
export const serviceResponseSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  createdAt: z.coerce.date(),
  deactivatedAt: z.coerce.date().nullable(),
})
export const servicesResponseSchema = z.array(serviceResponseSchema)

export const serviceParamsSchema = z.object({ id: z.string().min(1) })

export const createServiceSchema = z.object({
  name: z.string().min(1),
})

export const updateServiceSchema = z.object({
  name: z.string().min(1).optional(),
  deactivated: z.boolean().optional(),
})

// Décision 3.6 (spec §3.6) : le second compte est celui qui importe — voir
// `ServiceDeactivationImpactDomain` (types/domain/service.domain.interface.ts).
export const serviceDeactivationImpactResponseSchema = z.object({
  suivisIci: z.number().int().nonnegative(),
  suivisNullePartAilleurs: z.number().int().nonnegative(),
})

export type ServiceResponse = z.infer<typeof serviceResponseSchema>
export type ServiceParams = z.infer<typeof serviceParamsSchema>
export type CreateServiceBody = z.infer<typeof createServiceSchema>
export type UpdateServiceBody = z.infer<typeof updateServiceSchema>
