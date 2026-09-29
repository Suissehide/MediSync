import Boom from '@hapi/boom'

import { MembershipDomain } from '../../../main/domain/membership.domain'
import type { IocContainer } from '../../../main/types/application/ioc'
import type { MembershipRow } from '../../../main/types/infra/orm/repositories/membership.repository.interface'
import { TenantContext } from '../../../main/utils/tenant-context'

const user = (
  over: Partial<MembershipRow['user']> = {},
): MembershipRow['user'] => ({
  id: 'u1',
  email: 'a@b.fr',
  firstName: null,
  lastName: null,
  deactivatedAt: null,
  ...over,
})

const row = (over: Partial<MembershipRow>): MembershipRow => ({
  id: 'em1',
  userId: 'u1',
  establishmentId: 'e1',
  role: 'ADMIN',
  createdAt: new Date(),
  user: user(),
  serviceMemberships: [],
  ...over,
})

// `admins` est le nombre d'administrateurs **actifs** (ce que compte le
// repository) ; `establishments` le nombre d'etablissements de l'identite
// visee (tache 15 : lu via membershipRepository.estRattacheAilleurs, plus via un include).
// Marqueur du client transactionnel : les trois ecritures de `createAccount` (le compte, le
// rattachement, le lien) doivent TOUTES le recevoir, sans quoi elles ne partagent pas un sort.
const TX = Symbol('transaction')

// Le decor d'un compte GLOBAL : le drapeau super-admin et la liste des etablissements auxquels
// il est rattache. La garde du jeton (`assertIssuableToken`) lit les DEUX — un stub qui rendrait
// `[{}, {}]` sans identifiant d'etablissement, comme le faisait une version precedente de ce
// fichier, ne peut rien prouver d'un predicat qui compare des identifiants. Depuis la tache 15
// (etape 4a) ces deux faits sortent de DEUX lectures distinctes du domaine
// (`userRepository.findIdentity` et `membershipRepository.estRattacheAilleurs`), et non plus
// d'un seul arbre : les deux stubs ci-dessous lisent donc la meme description.
type CompteGlobal = { isSuperAdmin?: boolean; establishmentIds?: string[] }

const build = (
  rows: MembershipRow[],
  admins = 1,
  establishments = 1,
  comptesGlobaux: Record<string, CompteGlobal> = {},
) => {
  const ctx = new TenantContext()
  const calls: string[] = []
  const events: string[] = []
  // Par defaut : `establishments` rattachements dont le PREMIER est l'etablissement courant
  // (`e1`) et les suivants sont etrangers — ce qui preserve le comportement des tests anterieurs
  // (la garde comptait `length > 1` sur l'arbre entier) tout en donnant a la garde du jeton des
  // identifiants reels a comparer. `comptesGlobaux` permet a un test de decrire un compte
  // precis : super-admin, ou rattache AILLEURS seulement.
  const rattachementsDe = (userId: string): string[] =>
    comptesGlobaux[userId]?.establishmentIds ??
    Array.from({ length: establishments }, (_, index) =>
      index === 0 ? 'e1' : `e-ailleurs-${index}`,
    )
  const container = {
    tenantContext: ctx,
    appEventBus: {
      emit: (event: string) => {
        events.push(event)
      },
    },
    membershipRepository: {
      findAll: () => Promise.resolve(rows),
      findByID: (id: string) => {
        const found = rows.find((r) => r.id === id)
        return found ? Promise.resolve(found) : Promise.reject(Boom.notFound())
      },
      findByUserID: (userId: string) =>
        Promise.resolve(rows.find((r) => r.userId === userId) ?? null),
      countAdmins: () => Promise.resolve(admins),
      // TACHE 15 : le booleen qui a remplace la lecture de l'arbre complet des appartenances.
      // Derive de la MEME description de decor que `findIdentity` plus bas.
      estRattacheAilleurs: (userId: string) =>
        Promise.resolve(
          rattachementsDe(userId).some(
            (establishmentId) => establishmentId !== 'e1',
          ),
        ),
      create: (p: unknown, client?: unknown) => {
        calls.push(client === TX ? 'create(tx)' : 'create')
        return Promise.resolve(row({ id: 'new', ...(p as object) }))
      },
      update: (id: string, p: unknown) => {
        calls.push('update')
        return Promise.resolve(row({ id, ...(p as object) }))
      },
      delete: () => {
        calls.push('delete')
        return Promise.resolve()
      },
      serviceExists: (id: string) => Promise.resolve(id === 's1'),
    },
    postgresOrm: {
      executeWithTransactionClient: (fn: (tx: unknown) => Promise<unknown>) => {
        calls.push('transaction')
        return fn(TX)
      },
    },
    accessLinkDomain: {
      issue: (userId: string, issuedBy: string, client?: unknown) => {
        calls.push(
          `issue(${userId},${issuedBy},${client === TX ? 'tx' : 'hors-tx'})`,
        )
        return Promise.resolve({ token: 'JETON-FACTICE' })
      },
    },
    userRepository: {
      // Trois adresses : une inconnue (tout le reste), une connue et libre, une connue mais
      // deja membre (`u1`, present dans `rows`), une connue et desactivee.
      findByEmail: (email: string) => {
        const comptes: Record<
          string,
          { id: string; deactivatedAt: Date | null }
        > = {
          'new@b.fr': { id: 'u2', deactivatedAt: null },
          'deja@b.fr': { id: 'u1', deactivatedAt: null },
          'dormant@b.fr': { id: 'u3', deactivatedAt: new Date() },
          // Les deux comptes que la garde du jeton doit refuser (tour de correction 1).
          'superadmin@b.fr': { id: 'u8', deactivatedAt: null },
          'ailleurs@b.fr': { id: 'u9', deactivatedAt: null },
        }
        const compte = comptes[email]
        if (!compte) {
          return Promise.reject(Boom.notFound())
        }
        // `UserEntityRepo` EST la ligne `User` complete (findUniqueOrThrow sans `select`) :
        // elle porte donc `isSuperAdmin`, que `addByEmail` lit ici plutot que de refaire une
        // lecture. Le stub doit le rendre, sinon il ne peut pas prouver ce refus.
        return Promise.resolve({
          ...compte,
          isSuperAdmin: comptesGlobaux[compte.id]?.isSuperAdmin ?? false,
        })
      },
      create: (params: { email: string }, client?: unknown) => {
        calls.push(
          `user.create(${params.email},${client === TX ? 'tx' : 'hors-tx'})`,
        )
        return Promise.resolve({ id: 'u-neuf', deactivatedAt: null })
      },
      // TACHE 15 (etape 4a) : `findIdentity` — la LIGNE `User` seule — remplace `findByID` pour
      // les deux gardes du domaine. L'arbre des appartenances n'en sort plus : la question
      // « rattache ailleurs ? » est posee separement a
      // `membershipRepository.estRattacheAilleurs`, plus haut, qui lit la MEME description de
      // decor (`rattachementsDe`) pour que les deux stubs ne puissent pas diverger.
      findIdentity: (userId: string) =>
        Promise.resolve({
          id: userId,
          isSuperAdmin: comptesGlobaux[userId]?.isSuperAdmin ?? false,
          deactivatedAt: null,
        }),
      setDeactivated: () => {
        calls.push('deactivate')
        return Promise.resolve({})
      },
    },
    soignantRepository: {
      findByID: (id: string) =>
        id === 'so1'
          ? Promise.resolve({ id })
          : Promise.reject(Boom.notFound()),
    },
  } as unknown as IocContainer
  return { domain: new MembershipDomain(container), ctx, calls, events }
}

// Generique (tour de correction 1, Important n°3) : rendait `Promise<unknown>`, si bien que
// `(await asAdmin(...)).accessLink` etait une erreur TS18046 — invisible en test (swc ne type
// pas) mais reelle, et la seule erreur de type NEUVE du commit precedent.
const asAdmin = <T>(ctx: TenantContext, fn: () => Promise<T>) =>
  ctx.run(
    {
      userId: 'u1',
      establishmentId: 'e1',
      establishmentRole: 'ADMIN',
      serviceId: null,
      serviceRole: null,
      soignantId: null,
    },
    fn,
  )

// Les deux regles metier rendent toutes deux un 409 : on verrouille donc le
// message, sans quoi un test ne saurait pas laquelle s'est declenchee.
const LAST_ADMIN = 'Cannot remove the last administrator'
const SELF = 'Cannot apply this action to your own account'
const MULTI_ESTABLISHMENT =
  'This account belongs to several establishments; its activation cannot be changed from here'
const SELF_DEMOTION = 'Cannot remove your own administrator role'
const MULTI_ESTABLISHMENT_LINK =
  'This account belongs to several establishments; its access link cannot be reissued from here'
const ALREADY_MEMBER = 'This account is already a member of this establishment'
const DEACTIVATED_ACCOUNT =
  'This account is deactivated and cannot be added as a member'
const DEACTIVATED_LINK =
  'This account is deactivated; its access link cannot be reissued'
const UNADDABLE_EMAIL = 'This e-mail address cannot be added as a member'

const rejectsWith = (
  promise: Promise<unknown>,
  statusCode: number,
  message: string,
) =>
  expect(promise).rejects.toMatchObject({
    output: { payload: { statusCode, message } },
  })

describe('MembershipDomain', () => {
  it('rattache une identite existante par e-mail', async () => {
    const { domain, ctx, calls, events } = build([row({})])
    await asAdmin(ctx, () =>
      domain.addByEmail({
        email: 'new@b.fr',
        role: 'MEMBER',
        services: [{ serviceId: 's1', role: 'INTERVENANT' }],
      }),
    )
    expect(calls).toEqual(['create'])
    expect(events).toEqual(['member.added'])
  })

  it('refuse un service etranger', async () => {
    const { domain, ctx } = build([row({})])
    await rejectsWith(
      asAdmin(ctx, () =>
        domain.addByEmail({
          email: 'new@b.fr',
          role: 'MEMBER',
          services: [{ serviceId: 'zz', role: 'LECTURE' }],
        }),
      ),
      404,
      'Service zz not found',
    )
  })

  // Sinon un administrateur peut deviner quelles adresses ont un compte sur
  // la plateforme, en lisant la difference entre les deux refus.
  it('rend le meme refus pour une adresse inconnue et une adresse deja membre', async () => {
    const { domain, ctx, calls } = build([row({ userId: 'u2' })])
    const add = (email: string) =>
      asAdmin(ctx, () =>
        domain.addByEmail({
          email,
          role: 'MEMBER',
          services: [],
        }),
      ).catch((err: { output: { payload: unknown } }) => err.output.payload)

    const unknownEmail = await add('inconnu@b.fr')
    const alreadyMember = await add('new@b.fr')

    expect(unknownEmail).toEqual(alreadyMember)
    expect(unknownEmail).toMatchObject({ statusCode: 400 })
    expect(calls).toEqual([])
  })

  // Cible : un AUTRE administrateur, et il n'en reste qu'un actif. Seule la
  // regle du dernier administrateur peut se declencher.
  it('refuse de retrograder, retirer ou desactiver le dernier administrateur', async () => {
    const build1 = () =>
      build(
        [row({}), row({ id: 'em2', userId: 'u2', user: user({ id: 'u2' }) })],
        1,
      )
    const a = build1()
    await rejectsWith(
      asAdmin(a.ctx, () => a.domain.update('em2', { role: 'MEMBER' })),
      409,
      LAST_ADMIN,
    )
    const b = build1()
    await rejectsWith(
      asAdmin(b.ctx, () => b.domain.remove('em2')),
      409,
      LAST_ADMIN,
    )
    const c = build1()
    await rejectsWith(
      asAdmin(c.ctx, () => c.domain.setDeactivated('em2', true)),
      409,
      LAST_ADMIN,
    )
    expect([...a.calls, ...b.calls, ...c.calls]).toEqual([])
  })

  // Cible : soi-meme, et il reste deux administrateurs actifs. Seule la regle
  // du soi-meme peut se declencher.
  it('refuse de se retirer et de se desactiver soi-meme meme quand un autre administrateur subsiste', async () => {
    const { domain, ctx, calls } = build(
      [row({}), row({ id: 'em2', userId: 'u2', user: user({ id: 'u2' }) })],
      2,
    )
    await rejectsWith(
      asAdmin(ctx, () => domain.remove('em1')),
      409,
      SELF,
    )
    await rejectsWith(
      asAdmin(ctx, () => domain.setDeactivated('em1', true)),
      409,
      SELF,
    )
    expect(calls).toEqual([])
  })

  // Un compte ne reduit jamais seul ses propres droits, c'est un collegue qui
  // le fait — par symetrie avec la regle du soi-meme sur remove/setDeactivated.
  it('refuse a l utilisateur courant de se retrograder en MEMBER', async () => {
    const { domain, ctx, calls } = build(
      [row({}), row({ id: 'em2', userId: 'u2', user: user({ id: 'u2' }) })],
      2,
    )
    await rejectsWith(
      asAdmin(ctx, () => domain.update('em1', { role: 'MEMBER' })),
      409,
      SELF_DEMOTION,
    )
    expect(calls).toEqual([])
  })

  it('laisse retrograder un autre administrateur quand il en reste un', async () => {
    const { domain, ctx, calls } = build(
      [row({}), row({ id: 'em2', userId: 'u2', user: user({ id: 'u2' }) })],
      2,
    )
    await asAdmin(ctx, () => domain.update('em2', { role: 'MEMBER' }))
    expect(calls).toEqual(['update'])
  })

  it('autorise ces operations sur un autre membre quand il reste un administrateur', async () => {
    const { domain, ctx, calls, events } = build(
      [
        row({}),
        row({
          id: 'em2',
          userId: 'u2',
          role: 'ADMIN',
          user: user({ id: 'u2' }),
        }),
      ],
      2,
    )
    await asAdmin(ctx, () => domain.update('em2', { role: 'MEMBER' }))
    await asAdmin(ctx, () => domain.setDeactivated('em2', true))
    await asAdmin(ctx, () => domain.remove('em2'))
    expect(calls).toEqual(['update', 'deactivate', 'delete'])
    expect(events).toEqual([
      'member.updated',
      'member.deactivated',
      'member.removed',
    ])
  })

  // Un compte deja desactive ne compte pas parmi les administrateurs actifs :
  // le refuser ne protegerait rien et empecherait le menage.
  it('n oppose pas la regle du dernier administrateur a un compte deja desactive', async () => {
    const off = row({
      id: 'em2',
      userId: 'u2',
      role: 'ADMIN',
      user: user({ id: 'u2', deactivatedAt: new Date() }),
    })
    const { domain, ctx, calls } = build([row({}), off], 1)
    await asAdmin(ctx, () => domain.remove('em2'))
    await asAdmin(ctx, () => domain.update('em2', { role: 'MEMBER' }))
    expect(calls).toEqual(['delete', 'update'])
  })

  // `User.deactivatedAt` est porte par l'identite globale : l'ecrire depuis
  // un etablissement couperait aussi les autres.
  it('refuse de changer l activation d un compte appartenant a plusieurs etablissements', async () => {
    const other = row({
      id: 'em2',
      userId: 'u2',
      role: 'MEMBER',
      user: user({ id: 'u2' }),
    })
    const { domain, ctx, calls } = build([row({}), other], 2, 2)
    await rejectsWith(
      asAdmin(ctx, () => domain.setDeactivated('em2', true)),
      409,
      MULTI_ESTABLISHMENT,
    )
    await rejectsWith(
      asAdmin(ctx, () => domain.setDeactivated('em2', false)),
      409,
      MULTI_ESTABLISHMENT,
    )
    expect(calls).toEqual([])
  })

  // Le garde de l'etape 1 n'existait que parce qu'un administrateur sans
  // service se retrouvait sans aucun ecran accessible. Les taches 8 et 12
  // lui donnent l'administration d'etablissement sous une URL sans service :
  // vider sa propre liste de services est donc redevenu une operation comme
  // une autre.
  it('autorise l utilisateur courant a vider sa propre liste de services', async () => {
    const { domain, ctx, calls } = build(
      [row({ serviceMemberships: [{ serviceId: 's1', role: 'INTERVENANT' }] })],
      2,
    )
    await asAdmin(ctx, () => domain.update('em1', { services: [] }))
    expect(calls).toEqual(['update'])
  })

  it('laisse vider la liste de services d un tiers', async () => {
    const { domain, ctx, calls } = build(
      [row({}), row({ id: 'em2', userId: 'u2', user: user({ id: 'u2' }) })],
      2,
    )
    await asAdmin(ctx, () => domain.update('em2', { services: [] }))
    expect(calls).toEqual(['update'])
  })

  it('laisse l utilisateur courant modifier sa propre appartenance en gardant un service', async () => {
    const { domain, ctx, calls } = build([row({})], 2)
    await asAdmin(ctx, () =>
      domain.update('em1', {
        services: [{ serviceId: 's1', role: 'LECTURE' }],
      }),
    )
    // Une mise a jour qui ne touche pas du tout aux services reste permise.
    await asAdmin(ctx, () => domain.update('em1', { role: 'ADMIN' }))
    expect(calls).toEqual(['update', 'update'])
  })

  it('journalise la reactivation', async () => {
    const other = row({
      id: 'em2',
      userId: 'u2',
      role: 'MEMBER',
      user: user({ id: 'u2' }),
    })
    const { domain, ctx, events } = build([row({}), other], 2)
    await asAdmin(ctx, () => domain.setDeactivated('em2', false))
    expect(events).toEqual(['member.reactivated'])
  })

  // --- Tache 10, step 1 : creer un compte de membre ---

  it('cree le compte, le rattache et emet son lien dans une seule transaction', async () => {
    const { domain, ctx, calls } = build([row({})])
    const resultat = await asAdmin(ctx, () =>
      domain.createAccount({
        email: 'inconnu@b.fr',
        firstName: 'Neuf',
        lastName: 'Compte',
        role: 'MEMBER',
        services: [{ serviceId: 's1', role: 'INTERVENANT' }],
      }),
    )

    // L'ORDRE compte (le compte avant le rattachement, le lien en dernier) et le CLIENT
    // compte : les trois ecritures portent le meme `tx`, sinon elles ne partagent aucun sort.
    expect(calls).toEqual([
      'transaction',
      'user.create(inconnu@b.fr,tx)',
      'create(tx)',
      'issue(u-neuf,u1,tx)',
    ])
    expect(resultat.accessLink).toEqual({ token: 'JETON-FACTICE' })
  })

  it('reutilise un compte existant au lieu de le recreer', async () => {
    const { domain, ctx, calls } = build([row({})])
    await asAdmin(ctx, () =>
      domain.createAccount({
        email: 'new@b.fr',
        role: 'MEMBER',
        services: [],
      }),
    )

    // Aucun `user.create` : un compte deja connu n'est ni ecrase ni duplique.
    expect(calls).toEqual(['transaction', 'create(tx)', 'issue(u2,u1,tx)'])
  })

  it('emet l evenement de creation de compte, distinct du simple rattachement', async () => {
    const { domain, ctx, events } = build([row({})])
    await asAdmin(ctx, () =>
      domain.createAccount({
        email: 'inconnu@b.fr',
        role: 'MEMBER',
        services: [],
      }),
    )
    expect(events).toEqual(['member.accountCreated'])
  })

  it('refuse une adresse deja membre, et un compte desactive, sans rien ecrire', async () => {
    const { domain, ctx, calls } = build([row({})])
    const appel = (email: string) =>
      asAdmin(ctx, () =>
        domain.createAccount({
          email,
          role: 'MEMBER',
          services: [],
        }),
      )

    await rejectsWith(appel('deja@b.fr'), 409, ALREADY_MEMBER)
    await rejectsWith(appel('dormant@b.fr'), 409, DEACTIVATED_ACCOUNT)
    // Pas meme une transaction ouverte : les deux refus precedent toute ecriture.
    expect(calls).toEqual([])
  })

  it('verifie les references soumises avant d ouvrir la transaction', async () => {
    const { domain, ctx, calls } = build([row({})])
    await rejectsWith(
      asAdmin(ctx, () =>
        domain.createAccount({
          email: 'inconnu@b.fr',
          role: 'MEMBER',
          services: [{ serviceId: 'zz', role: 'LECTURE' }],
        }),
      ),
      404,
      'Service zz not found',
    )
    expect(calls).toEqual([])
  })

  // --- Tache 10, step 3 : reemettre un lien ---

  it('reemet un lien pour l identite portee par l appartenance, jamais pour un id soumis', async () => {
    const { domain, ctx, calls } = build([
      row({ id: 'em2', userId: 'u7', user: user({ id: 'u7' }) }),
    ])

    const resultat = await asAdmin(ctx, () => domain.reissueAccessLink('em2'))

    // `u7` vient de la LIGNE chargee par le repository (filtre sur l'etablissement courant),
    // pas d'un identifiant que le client aurait pu choisir. Hors transaction : une seule
    // ecriture, rien a rendre atomique.
    expect(calls).toEqual(['issue(u7,u1,hors-tx)'])
    expect(resultat).toEqual({ token: 'JETON-FACTICE' })
  })

  // La garde la plus importante de la tache : un lien reinitialise le mot de passe du `User`,
  // qui est GLOBAL. Sans elle, l'administrateur de A prend le controle de l'acces a B.
  it('refuse de reemettre un lien pour un compte appartenant a plusieurs etablissements', async () => {
    const { domain, ctx, calls } = build([row({})], 1, 2)
    await rejectsWith(
      asAdmin(ctx, () => domain.reissueAccessLink('em1')),
      409,
      MULTI_ESTABLISHMENT_LINK,
    )
    expect(calls).toEqual([])
  })

  it('refuse de reemettre un lien pour un compte desactive', async () => {
    const { domain, ctx, calls } = build([
      row({ user: user({ deactivatedAt: new Date() }) }),
    ])
    await rejectsWith(
      asAdmin(ctx, () => domain.reissueAccessLink('em1')),
      409,
      DEACTIVATED_LINK,
    )
    // Rien d'emis : `issue` invaliderait au passage les liens encore actifs du compte.
    expect(calls).toEqual([])
  })

  it('emet l evenement de reemission', async () => {
    const { domain, ctx, events } = build([row({})])
    await asAdmin(ctx, () => domain.reissueAccessLink('em1'))
    expect(events).toEqual(['member.accessLinkReissued'])
  })

  // --- Tour de correction 1 : LA GARDE DU JETON, partagee par les deux emissions ---

  const SUPER_ADMIN = { u8: { isSuperAdmin: true } }
  const RATTACHE_AILLEURS = { u9: { establishmentIds: ['e-autre'] } }

  const creerCompte = (
    domain: { createAccount: (p: never) => Promise<unknown> },
    ctx: TenantContext,
    email: string,
  ) =>
    asAdmin(ctx, () =>
      domain.createAccount({
        email,
        role: 'MEMBER',
        services: [],
      } as never),
    )

  it('ne cree aucun compte pour une adresse super-admin, du refus opaque partage', async () => {
    const { domain, ctx, calls } = build([row({})], 1, 1, SUPER_ADMIN)
    await rejectsWith(
      creerCompte(domain, ctx, 'superadmin@b.fr'),
      400,
      UNADDABLE_EMAIL,
    )
    expect(calls).toEqual([])
  })

  it('ne cree aucun compte pour une adresse rattachee a un autre etablissement', async () => {
    const { domain, ctx, calls } = build([row({})], 1, 1, RATTACHE_AILLEURS)
    // MEME refus, mot pour mot, que pour un super-admin ci-dessus et qu'une adresse inconnue :
    // les distinguer ferait de la route un detecteur de comptes.
    await rejectsWith(
      creerCompte(domain, ctx, 'ailleurs@b.fr'),
      400,
      UNADDABLE_EMAIL,
    )
    expect(calls).toEqual([])
  })

  it('rattache sans jeton une adresse deja en poste ailleurs, mais refuse un super-admin', async () => {
    // La question symetrique : `addByEmail` n'emet AUCUN jeton, donc le rattachement d'une
    // personne qui exerce dans deux structures reste permis. Seul le super-admin y est refuse
    // (premier maillon de la chaine de la Critique n°2).
    const permis = build([row({})], 1, 1, RATTACHE_AILLEURS)
    await asAdmin(permis.ctx, () =>
      permis.domain.addByEmail({
        email: 'ailleurs@b.fr',
        role: 'MEMBER',
        services: [],
      }),
    )
    expect(permis.calls).toEqual(['create'])

    const refuse = build([row({})], 1, 1, SUPER_ADMIN)
    await rejectsWith(
      asAdmin(refuse.ctx, () =>
        refuse.domain.addByEmail({
          email: 'superadmin@b.fr',
          role: 'MEMBER',
          services: [],
        }),
      ),
      400,
      UNADDABLE_EMAIL,
    )
    expect(refuse.calls).toEqual([])
  })

  it('ne reemet aucun lien pour un membre super-admin, meme avec une seule appartenance', async () => {
    // Le cas EXACT que l'ancienne garde laissait passer : une seule appartenance, donc
    // `assertSingleEstablishment` etait satisfaite — et le compte portait le drapeau.
    const { domain, ctx, calls } = build(
      [row({ id: 'em3', userId: 'u8', user: user({ id: 'u8' }) })],
      1,
      1,
      SUPER_ADMIN,
    )
    await rejectsWith(
      asAdmin(ctx, () => domain.reissueAccessLink('em3')),
      400,
      UNADDABLE_EMAIL,
    )
    expect(calls).toEqual([])
  })

  it('emet bien quand le compte n est rattache qu a l etablissement courant', async () => {
    // La garde ne doit pas fermer le cas ordinaire : un membre d ici, et d ici seulement.
    const { domain, ctx, calls } = build([row({})], 1, 1, {
      u1: { establishmentIds: ['e1'] },
    })
    await asAdmin(ctx, () => domain.reissueAccessLink('em1'))
    expect(calls).toEqual(['issue(u1,u1,hors-tx)'])
  })
})
