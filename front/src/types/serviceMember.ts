import type { ServiceRole } from './auth.ts'

// Un membre d'UN service, vu depuis ce service (2026-09-29) : son affectation (`id`), son role
// et le soignant (metier du service) qu'il y incarne. Miroir de
// `back/src/main/interfaces/http/fastify/schemas/serviceMembers.schema.ts`.
export type ServiceMember = {
  id: string
  role: ServiceRole
  soignantId: string | null
  user: {
    id: string
    email: string
    firstName: string | null
    lastName: string | null
    deactivatedAt: string | null
  }
}
