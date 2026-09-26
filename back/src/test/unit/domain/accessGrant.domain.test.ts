import { effectiveMemberships } from '../../../main/domain/accessGrant.domain'
import type { LiveGrant } from '../../../main/types/domain/accessGrant.domain.interface'
import type { UserWithMemberships } from '../../../main/types/infra/orm/repositories/user.repository.interface'

const maintenant = new Date('2026-09-25T12:00:00Z')

// `isSuperAdmin: true` par défaut : un octroi (`SuperAdminAccessGrant`) n'existe dans ce dépôt
// que pour un compte qui l'est — voir la tâche 8, qui émet ces lignes. Les fixtures qui
// N'exercent aucun octroi (ex. `retire les etablissements et services desactives...`) restent
// valides quelle que soit cette valeur, puisqu'elles ne passent jamais de `grants`. Les tests qui
// veulent spécifiquement le cas « plus super-admin » (tour de correction 1) le disent en toutes
// lettres, en écrasant ce champ.
const baseUser = {
  id: 'u1',
  email: 'a@b.fr',
  password: '',
  salt: '',
  firstName: null,
  lastName: null,
  isSuperAdmin: true,
  deactivatedAt: null,
}

const utilisateurSansRattachement: UserWithMemberships = {
  ...baseUser,
  establishmentMemberships: [],
}

const utilisateurMembreDeE1: UserWithMemberships = {
  ...baseUser,
  establishmentMemberships: [
    {
      id: 'em1',
      userId: 'u1',
      establishmentId: 'e1',
      role: 'MEMBER',
      soignantId: null,
      createdAt: maintenant,
      establishment: { id: 'e1', name: 'E1', createdAt: maintenant, deactivatedAt: null },
      serviceMemberships: [],
    },
  ],
}

describe('effectiveMemberships', () => {
  it('ajoute une appartenance virtuelle tant que l octroi est vivant', () => {
    const effectives = effectiveMemberships(utilisateurSansRattachement, [
      { establishmentId: 'e1', expiresAt: new Date('2026-09-25T13:00:00Z'), revokedAt: null } as LiveGrant,
    ], maintenant)
    expect(effectives.map((m) => m.establishmentId)).toEqual(['e1'])
    expect(effectives[0]?.origine).toBe('octroi')
  })

  it('n ajoute rien quand l octroi est expire', () => {
    expect(
      effectiveMemberships(utilisateurSansRattachement, [
        { establishmentId: 'e1', expiresAt: new Date('2026-09-25T11:59:59Z'), revokedAt: null } as LiveGrant,
      ], maintenant),
    ).toEqual([])
  })

  it('n ajoute rien quand l octroi est revoque avant son terme', () => {
    expect(
      effectiveMemberships(utilisateurSansRattachement, [
        {
          establishmentId: 'e1',
          expiresAt: new Date('2026-09-25T13:00:00Z'),
          revokedAt: new Date('2026-09-25T11:00:00Z'),
        } as LiveGrant,
      ], maintenant),
    ).toEqual([])
  })

  it('ne double pas une appartenance reelle', () => {
    const effectives = effectiveMemberships(utilisateurMembreDeE1, [
      { establishmentId: 'e1', expiresAt: new Date('2026-09-25T13:00:00Z'), revokedAt: null } as LiveGrant,
    ], maintenant)
    expect(effectives).toHaveLength(1)
    expect(effectives[0]?.origine).toBe('reelle')
  })

  // Step 2 du brief : la spécification tranche le rôle de SERVICE (« coordinateur ») mais pas
  // le rôle d'ÉTABLISSEMENT qui l'accompagne — tranché ici (ADMIN), avec le motif écrit dans
  // accessGrant.domain.ts. Sur TOUS les services actifs : un octroi qui n'en couvrirait qu'une
  // partie laisserait par construction hors de portée le service où le problème à diagnostiquer
  // se trouve, et un service désactivé n'a justement plus lieu d'être diagnostiqué.
  it('confere ADMIN et COORDINATEUR sur tous les services actifs de l etablissement octroye', () => {
    const grant: LiveGrant = {
      establishmentId: 'e9',
      establishmentName: 'Etablissement 9',
      expiresAt: new Date('2026-09-25T13:00:00Z'),
      revokedAt: null,
      services: [
        { id: 's1', name: 'Service 1' },
        { id: 's2', name: 'Service 2' },
      ],
    }
    const effectives = effectiveMemberships(utilisateurSansRattachement, [grant], maintenant)
    expect(effectives).toEqual([
      {
        establishmentId: 'e9',
        role: 'ADMIN',
        services: [
          { id: 's1', role: 'COORDINATEUR' },
          { id: 's2', role: 'COORDINATEUR' },
        ],
        origine: 'octroi',
      },
    ])
  })

  // Un établissement ou un service désactivé disparaît de l'arbre RÉEL — jusqu'ici filtré
  // séparément par `me-mapper.ts` et par `resolveTenantFromUser` (tenant.plugin.ts) ; c'est
  // maintenant cette fonction, unique, qui en répond pour les deux.
  it('retire les etablissements et services desactives de l arbre reel', () => {
    const user: UserWithMemberships = {
      ...baseUser,
      establishmentMemberships: [
        {
          id: 'em1',
          userId: 'u1',
          establishmentId: 'e1',
          role: 'ADMIN',
          soignantId: 'so1',
          createdAt: maintenant,
          establishment: { id: 'e1', name: 'E1', createdAt: maintenant, deactivatedAt: null },
          serviceMemberships: [
            {
              id: 'sm1', establishmentMembershipId: 'em1', serviceId: 's1', establishmentId: 'e1',
              role: 'COORDINATEUR', createdAt: maintenant,
              service: { id: 's1', establishmentId: 'e1', name: 'S1', createdAt: maintenant, deactivatedAt: null },
            },
            {
              id: 'sm2', establishmentMembershipId: 'em1', serviceId: 's2', establishmentId: 'e1',
              role: 'LECTURE', createdAt: maintenant,
              service: { id: 's2', establishmentId: 'e1', name: 'S2', createdAt: maintenant, deactivatedAt: maintenant },
            },
          ],
        },
        {
          id: 'em2',
          userId: 'u1',
          establishmentId: 'e2',
          role: 'MEMBER',
          soignantId: null,
          createdAt: maintenant,
          establishment: { id: 'e2', name: 'E2', createdAt: maintenant, deactivatedAt: maintenant },
          serviceMemberships: [],
        },
      ],
    }
    expect(effectiveMemberships(user, [], maintenant)).toEqual([
      {
        establishmentId: 'e1',
        role: 'ADMIN',
        services: [{ id: 's1', role: 'COORDINATEUR' }],
        origine: 'reelle',
      },
    ])
  })

  // Tour de correction 1 (tâche 3) — Important n°1 de la revue : retirer le drapeau super-admin
  // ne retirait pas l'accès. Jugé ICI, contre le MÊME `user` que les appartenances réelles —
  // jamais mis en cache — donc éprouvable sans reconnexion, exactement comme l'expiration.
  it('un octroi ne confere rien si son titulaire n est plus super-admin', () => {
    const compteOrdinaire: UserWithMemberships = {
      ...baseUser,
      isSuperAdmin: false,
      establishmentMemberships: [],
    }
    expect(
      effectiveMemberships(compteOrdinaire, [
        { establishmentId: 'e1', expiresAt: new Date('2026-09-25T13:00:00Z'), revokedAt: null } as LiveGrant,
      ], maintenant),
    ).toEqual([])
  })

  // Tour de correction 1 (tâche 8) — Important n°2 de la relecture : deux octrois VIVANTS sur le
  // MÊME établissement (ex. un second s'accordé avant le terme du premier) ne doivent produire
  // qu'UNE SEULE entrée — sans quoi `/me` liste deux fois le même établissement, même
  // identifiant. Le contenu (services) est identique quelle que soit la ligne d'octroi qui le
  // porte (`AccessGrantRepository.findForUser` le dérive de l'établissement, jamais de l'octroi
  // lui-même) : rien ne se perd à n'en garder qu'un.
  it('dedoublonne deux octrois vivants sur le meme etablissement', () => {
    const premier: LiveGrant = {
      establishmentId: 'e1',
      establishmentName: 'E1',
      expiresAt: new Date('2026-09-25T13:00:00Z'),
      revokedAt: null,
      services: [{ id: 's1', name: 'S1' }],
    }
    const second: LiveGrant = {
      establishmentId: 'e1',
      establishmentName: 'E1',
      expiresAt: new Date('2026-09-25T15:00:00Z'),
      revokedAt: null,
      services: [{ id: 's1', name: 'S1' }],
    }
    const effectives = effectiveMemberships(
      utilisateurSansRattachement,
      [premier, second],
      maintenant,
    )
    expect(effectives).toEqual([
      {
        establishmentId: 'e1',
        role: 'ADMIN',
        services: [{ id: 's1', role: 'COORDINATEUR' }],
        origine: 'octroi',
      },
    ])
  })

  // Tour de correction 1 (tâche 3) — Important n°4 de la revue : un membre réel d'un
  // établissement DÉSACTIVÉ (donc invisible, comme partout ailleurs) ne doit pas voir cette
  // absence comblée par un octroi visant le même établissement — ce que ferait une primauté
  // « réelle sur octroi » calculée seulement sur les appartenances déjà filtrées actives.
  it('un octroi ne ressuscite pas une appartenance reelle a un etablissement desactive', () => {
    const membreDunEtablissementDesactive: UserWithMemberships = {
      ...baseUser,
      establishmentMemberships: [
        {
          id: 'em1',
          userId: 'u1',
          establishmentId: 'e1',
          role: 'MEMBER',
          soignantId: null,
          createdAt: maintenant,
          establishment: { id: 'e1', name: 'E1', createdAt: maintenant, deactivatedAt: maintenant },
          serviceMemberships: [],
        },
      ],
    }
    expect(
      effectiveMemberships(membreDunEtablissementDesactive, [
        {
          establishmentId: 'e1',
          establishmentName: 'E1',
          expiresAt: new Date('2026-09-25T13:00:00Z'),
          revokedAt: null,
          services: [{ id: 's1', name: 'S1' }],
        },
      ], maintenant),
    ).toEqual([])
  })
})
