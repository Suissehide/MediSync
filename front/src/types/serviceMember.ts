import type { ServiceRole } from './auth.ts'
import type { InvitationStatus } from './member.ts'

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
    invitationStatus: InvitationStatus
    invitationResendableAt: string | null
  }
}

// Inviter dans le service courant (MDS-17). Ni service ni role d'etablissement : le back les
// pose lui-meme (le service vient du tenant resolu, le rattachement est toujours `MEMBER`).
export type InviteServiceMemberInput = {
  email: string
  firstName?: string
  lastName?: string
  role: ServiceRole
  soignantId?: string | null
}

// `accessLink` a `null` quand le compte etait deja rattache a l'etablissement : il a son mot de
// passe, il n'y a aucun lien a transmettre. La reponse ne porte rien d'autre, a dessein — voir
// `inviteServiceMemberResponseSchema` (back).
export type InviteServiceMemberResult = {
  accessLink: { token: string } | null
}
