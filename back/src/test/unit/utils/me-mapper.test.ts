import { toMeResponse } from '../../../main/utils/me-mapper'
import type { UserWithMemberships } from '../../../main/types/infra/orm/repositories/user.repository.interface'

const base = {
  id: 'u1',
  email: 'a@b.fr',
  password: 'x',
  salt: 'y',
  firstName: 'A',
  lastName: 'B',
  isSuperAdmin: false,
  deactivatedAt: null,
}
const est = (id: string, deactivatedAt: Date | null = null) => ({
  id,
  name: `Etab ${id}`,
  createdAt: new Date(),
  deactivatedAt,
})
const svc = (
  id: string,
  establishmentId: string,
  deactivatedAt: Date | null = null,
) => ({
  id,
  establishmentId,
  name: `Svc ${id}`,
  createdAt: new Date(),
  deactivatedAt,
})

describe('toMeResponse', () => {
  it('construit l arbre des appartenances sans les elements desactives', () => {
    const user: UserWithMemberships = {
      ...base,
      establishmentMemberships: [
        {
          id: 'em1',
          userId: 'u1',
          establishmentId: 'e1',
          role: 'ADMIN',
          createdAt: new Date(),
          establishment: est('e1'),
          serviceMemberships: [
            {
              id: 'sm1',
              establishmentMembershipId: 'em1',
              serviceId: 's1',
              establishmentId: 'e1',
              role: 'COORDINATEUR',
              soignantId: 'so1',
              createdAt: new Date(),
              service: svc('s1', 'e1'),
            },
            {
              id: 'sm2',
              establishmentMembershipId: 'em1',
              serviceId: 's2',
              establishmentId: 'e1',
              role: 'LECTURE',
              soignantId: null,
              createdAt: new Date(),
              service: svc('s2', 'e1', new Date()),
            },
          ],
        },
        {
          id: 'em2',
          userId: 'u1',
          establishmentId: 'e2',
          role: 'MEMBER',
          createdAt: new Date(),
          establishment: est('e2', new Date()),
          serviceMemberships: [],
        },
      ],
    }
    // `[]` explicite : `grants` n'a plus de valeur par défaut (tour de correction 1, tâche 3),
    // précisément pour qu'un appel qui l'omettrait ne compile plus silencieusement.
    expect(toMeResponse(user, [])).toEqual({
      id: 'u1',
      email: 'a@b.fr',
      firstName: 'A',
      lastName: 'B',
      isSuperAdmin: false,
      establishments: [
        {
          id: 'e1',
          name: 'Etab e1',
          role: 'ADMIN',
          services: [{ id: 's1', name: 'Svc s1', role: 'COORDINATEUR', soignantId: 'so1' }],
          origine: 'reelle',
        },
      ],
    })
  })
})
