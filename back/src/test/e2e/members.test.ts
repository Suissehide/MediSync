import { hashPassword, randomToken } from '../../main/utils/hash'
import { buildTestApp, type TestApp } from './setup/app'
import { testDb, truncateAll } from './setup/db'
import {
  adminUrl,
  createEstablishment,
  createService,
  createUser,
  signIn,
} from './setup/fixtures'

// Les deux regles metier rendent toutes deux un 409 : on verrouille donc le
// message, sans quoi un test ne saurait pas laquelle s'est declenchee.
const LAST_ADMIN = 'Cannot remove the last administrator'
const SELF = 'Cannot apply this action to your own account'
const ALREADY_MEMBER = 'This account is already a member of this establishment'
// Le refus opaque partage par `addByEmail` et `createAccount` : adresse inconnue, deja membre,
// super-admin, ou deja rattachee ailleurs — un seul et meme message, pour qu'un administrateur
// ne puisse pas enumerer les comptes de la plateforme.
const UNADDABLE_EMAIL = 'This e-mail address cannot be added as a member'
const DEACTIVATED_LINK =
  'This account is deactivated; its access link cannot be reissued'
const MDP_ATTAQUANT = 'MotDePasseDeLAttaquant123!!'

describe('routes membres', () => {
  let testApp: TestApp
  let cookies: { access_token: string }
  let establishmentId: string
  let serviceId: string
  let selfMembershipId: string

  beforeAll(async () => {
    await truncateAll()
    const establishment = await createEstablishment('E')
    establishmentId = establishment.id
    const service = await createService(establishmentId, 'S')
    serviceId = service.id

    // Le compte administrateur est aussi coordinateur du service : c'est ce
    // qui lui permet d'atteindre le journal d'activite, monte sous le prefixe
    // de service.
    const admin = await createUser({
      email: 'admin@b.fr',
      memberships: [
        {
          establishmentId,
          role: 'ADMIN',
          services: [{ serviceId, role: 'COORDINATEUR' }],
        },
      ],
    })
    const adminMembership =
      await testDb.establishmentMembership.findFirstOrThrow({
        where: { userId: admin.id, establishmentId },
      })
    selfMembershipId = adminMembership.id
    await createUser({ email: 'new@b.fr' })

    testApp = await buildTestApp()
    cookies = await signIn(testApp.app, 'admin@b.fr')
  })

  afterAll(async () => {
    await testApp.close()
    await testDb.$disconnect()
  })

  const call = (
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    url: string,
    payload?: unknown,
  ) =>
    testApp.app.inject({
      method,
      url: adminUrl(establishmentId, `/members${url}`),
      cookies,
      payload: payload as never,
    })

  const addSecondAdmin = async () => {
    const res = await call('POST', '/', { email: 'new@b.fr', role: 'ADMIN' })
    expect(res.statusCode).toBe(201)
    return res.json().id as string
  }

  it('liste, ajoute, met a jour, desactive, reactive et retire un membre', async () => {
    const list0 = await call('GET', '/')
    expect(list0.statusCode).toBe(200)
    expect(list0.json()).toHaveLength(1)

    const added = await call('POST', '/', {
      email: 'new@b.fr',
      role: 'MEMBER',
      services: [{ serviceId, role: 'INTERVENANT' }],
    })
    expect(added.statusCode).toBe(201)
    const membershipId = added.json().id as string
    expect(added.json().serviceMemberships).toEqual([
      { serviceId, role: 'INTERVENANT' },
    ])

    const patched = await call('PATCH', `/${membershipId}`, {
      role: 'ADMIN',
      services: [{ serviceId, role: 'COORDINATEUR' }],
    })
    expect(patched.statusCode).toBe(200)
    expect(patched.json().role).toBe('ADMIN')
    expect(patched.json().serviceMemberships).toEqual([
      { serviceId, role: 'COORDINATEUR' },
    ])

    const off = await call('POST', `/${membershipId}/deactivate`)
    expect(off.statusCode).toBe(200)
    expect(off.json().user.deactivatedAt).not.toBeNull()

    const on = await call('POST', `/${membershipId}/reactivate`)
    expect(on.statusCode).toBe(200)
    expect(on.json().user.deactivatedAt).toBeNull()

    const removed = await call('DELETE', `/${membershipId}`)
    expect(removed.statusCode).toBe(204)
    expect((await call('GET', '/')).json()).toHaveLength(1)
  })

  // Le journal est ecrit de façon asynchrone par le souscripteur : on laisse
  // un court delai plutot que de supposer l'ecriture immediate.
  //
  // Place avant le test de connexion qui suit : celui-ci ajoute puis retire
  // un second administrateur et emettrait des evenements supplementaires
  // qui fausseraient le compte de 5 actions attendu ici.
  it('journalise les operations de gestion des membres', async () => {
    const read = async () => {
      for (let attempt = 0; attempt < 30; attempt += 1) {
        const res = await testApp.app.inject({
          method: 'GET',
          url: `/e/${establishmentId}/admin/activity-log`,
          cookies,
        })
        expect(res.statusCode).toBe(200)
        const actions = (
          res.json().data as { action: string; entityType: string }[]
        )
          .filter((entry) => entry.entityType === 'member')
          .map((entry) => entry.action)
        if (actions.length >= 5) {
          return actions
        }
        await new Promise((resolve) => setTimeout(resolve, 50))
      }
      return []
    }

    expect((await read()).sort()).toEqual([
      'member.added',
      'member.deactivated',
      'member.reactivated',
      'member.removed',
      'member.updated',
    ])
  })

  // Le pendant cote session du test precedent : un membre desactive doit
  // perdre l'acces, pas seulement porter un champ `deactivatedAt`.
  it('un membre desactive ne peut plus se connecter, et le retrouve apres reactivation', async () => {
    const membershipId = await addSecondAdmin()

    expect((await call('POST', `/${membershipId}/deactivate`)).statusCode).toBe(
      200,
    )
    await expect(signIn(testApp.app, 'new@b.fr')).rejects.toThrow(
      'sign-in failed: 401',
    )

    expect((await call('POST', `/${membershipId}/reactivate`)).statusCode).toBe(
      200,
    )
    await expect(signIn(testApp.app, 'new@b.fr')).resolves.toEqual(
      expect.objectContaining({ access_token: expect.any(String) }),
    )

    // Nettoyage : les tests suivants attendent 'new@b.fr' sans appartenance.
    expect((await call('DELETE', `/${membershipId}`)).statusCode).toBe(204)
  })

  // Sinon un administrateur peut deviner quelles adresses ont un compte sur
  // la plateforme, en lisant la difference entre les deux refus.
  it('rend le meme refus pour une adresse inconnue et une adresse deja membre', async () => {
    const unknownEmail = await call('POST', '/', {
      email: 'inconnu@b.fr',
      role: 'MEMBER',
    })
    const alreadyMember = await call('POST', '/', {
      email: 'admin@b.fr',
      role: 'MEMBER',
    })

    expect(unknownEmail.statusCode).toBe(alreadyMember.statusCode)
    expect(unknownEmail.json()).toEqual(alreadyMember.json())
    expect(unknownEmail.statusCode).toBe(400)
  })

  it('refuse deux affectations au meme service', async () => {
    expect(
      (
        await call('POST', '/', {
          email: 'new@b.fr',
          role: 'MEMBER',
          services: [
            { serviceId, role: 'LECTURE' },
            { serviceId, role: 'COORDINATEUR' },
          ],
        })
      ).statusCode,
    ).toBe(400)
  })

  // Un seul administrateur, et `update` ne verifie pas la regle du soi-meme :
  // seule la regle du dernier administrateur peut se declencher ici.
  it('refuse de retrograder le dernier administrateur', async () => {
    const res = await call('PATCH', `/${selfMembershipId}`, { role: 'MEMBER' })
    expect(res.statusCode).toBe(409)
    expect(res.json().message).toBe(LAST_ADMIN)
  })

  // Deux administrateurs actifs : la regle du dernier administrateur ne peut
  // pas se declencher, seule celle du soi-meme le peut.
  it('refuse de se retirer et de se desactiver soi-meme meme quand un autre administrateur subsiste', async () => {
    const secondAdmin = await addSecondAdmin()

    const removed = await call('DELETE', `/${selfMembershipId}`)
    expect(removed.statusCode).toBe(409)
    expect(removed.json().message).toBe(SELF)

    const off = await call('POST', `/${selfMembershipId}/deactivate`)
    expect(off.statusCode).toBe(409)
    expect(off.json().message).toBe(SELF)

    expect((await call('DELETE', `/${secondAdmin}`)).statusCode).toBe(204)
  })

  // `User.deactivatedAt` porte sur l'identite globale : la changer depuis un
  // etablissement couperait aussi les autres.
  it('refuse de changer l activation d un compte appartenant a plusieurs etablissements', async () => {
    const membershipId = await addSecondAdmin()
    const other = await createEstablishment('Ailleurs')
    const account = await testDb.user.findUniqueOrThrow({
      where: { email: 'new@b.fr' },
    })
    await testDb.establishmentMembership.create({
      data: { userId: account.id, establishmentId: other.id, role: 'MEMBER' },
    })

    for (const action of ['deactivate', 'reactivate']) {
      const res = await call('POST', `/${membershipId}/${action}`)
      expect(res.statusCode).toBe(409)
      expect(res.json().message).toContain('several establishments')
    }
  })

  // Une route d'administration reste hors de portee d'un role de service,
  // meme le plus outille : seul le role d'etablissement ADMIN y donne acces.
  it('refuse a un intervenant sans role ADMIN d etablissement l acces aux routes membres', async () => {
    await createUser({
      email: 'intervenant@b.fr',
      memberships: [
        {
          establishmentId,
          role: 'MEMBER',
          services: [{ serviceId, role: 'INTERVENANT' }],
        },
      ],
    })
    const intervenantCookies = await signIn(testApp.app, 'intervenant@b.fr')

    const res = await testApp.app.inject({
      method: 'GET',
      url: adminUrl(establishmentId, '/members'),
      cookies: intervenantCookies,
    })
    expect(res.statusCode).toBe(404)
  })

  // ------------------------------------------------------------------
  // Tache 10, step 1 : creer un compte de membre et rendre son lien.
  //
  // La route vit sous `/e/:establishmentId/admin/members/account`, PAS
  // `/e/:establishmentId/members/account` comme l'ecrit le brief : `membersRouter` est
  // monte sous le prefixe `/admin` (establishment-admin.routes.ts), et une route portant
  // `:establishmentId` enregistree hors de ces greffons fait echouer le demarrage
  // (`assertTenantShapedRoute`, tenant.plugin.ts).
  // ------------------------------------------------------------------

  const NOUVEAU_MDP = 'MotDePasseQuiConvient123!!'

  const createAccount = (payload: Record<string, unknown>) =>
    call('POST', '/account', payload)

  const consume = (token: string, password = NOUVEAU_MDP) =>
    testApp.app.inject({
      method: 'POST',
      url: '/auth/access-link/consume',
      payload: { token, password },
    })

  // Un SECOND etablissement REELLEMENT peuple : son service, son administrateur, ses
  // membres. Sans lui, « un compte qui existe deja ailleurs » ne serait qu'une ligne
  // `User` orpheline, et tout ce qui suit serait vrai par vacuite.
  let autreEtablissementId = ''
  let autreServiceId = ''

  const peuplerAutreEtablissement = async () => {
    if (autreEtablissementId !== '') {
      return
    }
    const autre = await createEstablishment('Etablissement B')
    autreEtablissementId = autre.id
    autreServiceId = (await createService(autre.id, 'Service de B')).id
    await createUser({
      email: 'admin-b@autre.fr',
      memberships: [
        {
          establishmentId: autre.id,
          role: 'ADMIN',
          services: [{ serviceId: autreServiceId, role: 'COORDINATEUR' }],
        },
      ],
    })
  }

  it('cree un compte, le rattache, et rend un lien reellement utilisable', async () => {
    const res = await createAccount({
      email: 'compte-neuf@b.fr',
      firstName: 'Neuf',
      lastName: 'Compte',
      role: 'MEMBER',
      services: [{ serviceId, role: 'INTERVENANT' }],
    })

    expect(res.statusCode).toBe(201)
    expect(Object.keys(res.json()).sort()).toEqual(['accessLink', 'member'])
    expect(res.json().member.serviceMemberships).toEqual([
      { serviceId, role: 'INTERVENANT' },
    ])

    // 201 ne prouverait rien seul : le compte doit exister, porter le nom soumis, et le
    // jeton doit reellement poser un mot de passe qui ouvre une session.
    const compte = await testDb.user.findUniqueOrThrow({
      where: { email: 'compte-neuf@b.fr' },
    })
    expect(compte.firstName).toBe('Neuf')
    expect((await consume(res.json().accessLink.token)).statusCode).toBe(200)
    await expect(
      signIn(testApp.app, 'compte-neuf@b.fr', NOUVEAU_MDP),
    ).resolves.toEqual(expect.objectContaining({ access_token: expect.any(String) }))
  })

  // TOUR DE CORRECTION 1 : ce test attachait auparavant un compte membre d'un AUTRE
  // etablissement, et attendait 201. Sa fixture ETAIT l'escalade de la Critique n°1 — c'est
  // desormais un 400 opaque (voir « ne remet aucun jeton pour une adresse rattachee a un AUTRE
  // etablissement »). Le cas legitime que ce test doit garder est celui d'un compte qui existe
  // deja mais n'est rattache NULLE PART : une personne dont le compte a ete cree puis
  // l'appartenance retiree, ou qui n'a jamais ete rattachee.
  it('rend la meme forme pour une adresse deja pourvue d un compte, sans ecraser son identite', async () => {
    const deja = await createUser({ email: 'compte-libre@autre.fr' })
    await testDb.user.update({
      where: { id: deja.id },
      data: { firstName: 'Ancien', lastName: 'Nom' },
    })
    // La fixture est bien un compte SANS aucun rattachement : sinon la garde du jeton la
    // refuserait, et ce test ne dirait rien de la branche « compte reutilise ».
    expect(
      await testDb.establishmentMembership.count({ where: { userId: deja.id } }),
    ).toBe(0)

    const res = await createAccount({
      email: 'compte-libre@autre.fr',
      firstName: 'Soumis',
      lastName: 'Different',
      role: 'MEMBER',
    })

    expect(res.statusCode).toBe(201)
    expect(Object.keys(res.json()).sort()).toEqual(['accessLink', 'member'])
    // La reponse ne porte AUCUNE valeur que l'appelant n'ait pas soumise : ni le nom
    // stocke (qui differe du nom soumis — c'est l'oracle d'existence ferme a la tache 6),
    // ni l'identifiant du compte (un cuid encode l'instant de sa creation).
    const corps = JSON.stringify(res.json())
    expect(corps).not.toContain('Ancien')
    expect(corps).not.toContain('Soumis')
    expect(corps).not.toContain(deja.id)

    // Le compte n'est ni duplique, ni ecrase, et il est desormais rattache — une seule fois.
    expect(await testDb.user.count({ where: { email: 'compte-libre@autre.fr' } })).toBe(1)
    const relu = await testDb.user.findUniqueOrThrow({ where: { id: deja.id } })
    expect(relu.firstName).toBe('Ancien')
    expect(relu.password).toBe(deja.password)
    expect(
      await testDb.establishmentMembership.count({ where: { userId: deja.id } }),
    ).toBe(1)
  })

  // Le raisonnement de la tache 6 (« divulgation assumee : le super-admin dispose de toute
  // facon d'une recherche de comptes par adresse ») NE TIENT PAS ici : l'appelant est un
  // administrateur d'etablissement, qui n'a aucune recherche de comptes. Le canal est donc
  // ferme, et mesure ici plutot qu'affirme.
  it('ne dit pas, par son temps de reponse, si l adresse a deja un compte', async () => {
    const chrono = async (fn: () => Promise<unknown>) => {
      const debut = process.hrtime.bigint()
      const valeur = await fn()
      return { ms: Number(process.hrtime.bigint() - debut) / 1e6, valeur }
    }
    const mediane = (valeurs: number[]) =>
      [...valeurs].sort((a, b) => a - b)[Math.floor(valeurs.length / 2)] ?? 0

    // Etalon mesure SUR CETTE MACHINE : le cout d'un PBKDF2 a 210 000 iterations, seul
    // poste de calcul qui separait les deux branches. Le seuil s'y calibre, plutot que
    // d'etre un nombre de millisecondes ecrit en dur.
    const coutDuHash = mediane(
      Array.from({ length: 5 }, () => {
        const debut = process.hrtime.bigint()
        hashPassword(randomToken(32))
        return Number(process.hrtime.bigint() - debut) / 1e6
      }),
    )

    const neuf: number[] = []
    const deja: number[] = []
    for (let i = 0; i < 5; i += 1) {
      await createUser({ email: `chrono-existe-${i}@autre.fr` })
      const a = await chrono(() =>
        createAccount({ email: `chrono-existe-${i}@autre.fr`, role: 'MEMBER' }),
      )
      const b = await chrono(() =>
        createAccount({ email: `chrono-neuf-${i}@b.fr`, role: 'MEMBER' }),
      )
      // Sans ceci le test serait vrai par vacuite : deux branches qui echouent toutes
      // deux en 404 ont, elles aussi, le meme temps de reponse.
      expect([
        (a.valeur as { statusCode: number }).statusCode,
        (b.valeur as { statusCode: number }).statusCode,
      ]).toEqual([201, 201])
      deja.push(a.ms)
      neuf.push(b.ms)
    }

    expect(Math.abs(mediane(neuf) - mediane(deja))).toBeLessThan(coutDuHash / 2)
  })

  it('refuse un compte desactive avant la moindre ecriture', async () => {
    const dormant = await createUser({ email: 'dormant@autre.fr' })
    await testDb.user.update({
      where: { id: dormant.id },
      data: { deactivatedAt: new Date() },
    })

    const res = await createAccount({ email: 'dormant@autre.fr', role: 'MEMBER' })

    expect(res.statusCode).toBe(409)
    expect(
      await testDb.establishmentMembership.count({ where: { userId: dormant.id } }),
    ).toBe(0)
    expect(await testDb.accessLink.count({ where: { userId: dormant.id } })).toBe(0)
  })

  it('refuse une adresse deja membre de cet etablissement, sans emettre de lien', async () => {
    const moi = await testDb.user.findUniqueOrThrow({
      where: { email: 'admin@b.fr' },
    })

    const res = await createAccount({ email: 'admin@b.fr', role: 'MEMBER' })

    expect(res.statusCode).toBe(409)
    // Le MESSAGE, pas seulement le statut : sans la verification explicite du domaine,
    // la contrainte unique `(userId, establishmentId)` rend elle aussi un 409 — le test
    // serait alors vrai par un autre mecanisme que celui qu'il pretend garder.
    expect(res.json().message).toBe(ALREADY_MEMBER)
    expect(await testDb.accessLink.count({ where: { userId: moi.id } })).toBe(0)
  })

  // Le compte, le rattachement et le lien partagent un seul sort. Eprouve en faisant
  // echouer la DERNIERE etape (l'emission) : sans transaction, un compte orphelin,
  // rattache et sans aucun moyen de se connecter, resterait en base.
  it('annule le compte et le rattachement si l emission du lien echoue', async () => {
    const { accessLinkDomain } = testApp.instances
    const vraiIssue = accessLinkDomain.issue
    accessLinkDomain.issue = () => Promise.reject(new Error('panne simulee'))
    try {
      const res = await createAccount({ email: 'jamais-cree@b.fr', role: 'MEMBER' })
      expect(res.statusCode).toBe(500)
    } finally {
      accessLinkDomain.issue = vraiIssue
    }

    expect(await testDb.user.count({ where: { email: 'jamais-cree@b.fr' } })).toBe(0)
  })


  // ------------------------------------------------------------------
  // Tache 10, step 3 : reemettre un lien pour un membre existant.
  //
  // C'EST L'ETAPE LA PLUS DANGEREUSE DE LA TACHE, et le brief ne le dit pas. Un lien
  // d'acces reinitialise le mot de passe du `User`, qui est GLOBAL — pas celui de
  // l'appartenance. Un administrateur de A qui reemet un lien pour un compte membre de A
  // ET de B prendrait le controle de son acces a B, ou il n'a aucun droit. La reemission
  // porte donc la MEME garde que `setDeactivated` (`assertSingleEstablishment`), pour le
  // motif jumeau.
  // ------------------------------------------------------------------

  const reissue = (membershipId: string) =>
    call('POST', `/${membershipId}/access-link`)

  // Fabrique un membre de CET etablissement, avec son compte et son lien, sans dependre
  // d'aucun autre test (mineur n°3 du tour de correction 1 : les dependances d'ordre entre
  // tests e2e).
  const nouveauMembre = async (email: string) => {
    const res = await createAccount({ email, role: 'MEMBER' })
    expect(res.statusCode).toBe(201)
    const { compte, membershipId } = await membershipDe(email)
    return { compte, membershipId, token: res.json().accessLink.token as string }
  }

  const membershipDe = async (email: string, dansEtablissement = establishmentId) => {
    const compte = await testDb.user.findUniqueOrThrow({ where: { email } })
    const appartenance = await testDb.establishmentMembership.findFirstOrThrow({
      where: { userId: compte.id, establishmentId: dansEtablissement },
    })
    return { compte, membershipId: appartenance.id }
  }

  it('reemet un lien : le precedent devient inutilisable, le nouveau ouvre une session', async () => {
    // Fabrique son propre membre, n'appartenant qu'a cet etablissement : aucune dependance
    // d'ordre avec un autre test, et la garde multi-etablissement ne peut pas se declencher.
    const { membershipId, token: premier } = await nouveauMembre('reemission@b.fr')

    const res = await reissue(membershipId)

    expect(res.statusCode).toBe(201)
    expect(Object.keys(res.json())).toEqual(['accessLink'])
    // Le lien precedent est invalide, le nouveau pose un mot de passe qui ouvre une session.
    expect((await consume(premier)).statusCode).toBe(410)
    const AUTRE_MDP = 'EncoreUnAutreMotDePasse123!!'
    expect((await consume(res.json().accessLink.token, AUTRE_MDP)).statusCode).toBe(200)
    await expect(
      signIn(testApp.app, 'reemission@b.fr', AUTRE_MDP),
    ).resolves.toEqual(expect.objectContaining({ access_token: expect.any(String) }))
  })

  it('refuse de reemettre un lien pour un compte membre de plusieurs etablissements', async () => {
    await peuplerAutreEtablissement()
    // La fixture est construite par le CHEMIN LEGITIME : un compte deja en poste dans B, que
    // `POST /members` (sans jeton) rattache aussi a A — le cas ordinaire d'un soignant qui
    // exerce dans deux structures. C'est exactement lui que la reemission doit refuser.
    const compte = await createUser({
      email: 'deux-etablissements@autre.fr',
      memberships: [
        {
          establishmentId: autreEtablissementId,
          role: 'MEMBER',
          services: [{ serviceId: autreServiceId, role: 'LECTURE' }],
        },
      ],
    })
    expect(
      (
        await call('POST', '/', {
          email: 'deux-etablissements@autre.fr',
          role: 'MEMBER',
        })
      ).statusCode,
    ).toBe(201)
    const { membershipId } = await membershipDe('deux-etablissements@autre.fr')
    // Sans ces deux appartenances reelles, le test serait vrai par vacuite.
    expect(
      await testDb.establishmentMembership.count({ where: { userId: compte.id } }),
    ).toBe(2)
    const avant = await testDb.accessLink.count({ where: { userId: compte.id } })

    const res = await reissue(membershipId)

    expect(res.statusCode).toBe(409)
    expect(res.json().message).toContain('several establishments')
    expect(await testDb.accessLink.count({ where: { userId: compte.id } })).toBe(avant)
  })

  it('refuse de reemettre un lien pour un compte desactive', async () => {
    const { compte, membershipId } = await nouveauMembre('dormant-reemission@b.fr')
    expect((await call('POST', `/${membershipId}/deactivate`)).statusCode).toBe(200)
    const avant = await testDb.accessLink.count({ where: { userId: compte.id } })

    const res = await reissue(membershipId)

    expect(res.statusCode).toBe(409)
    // Le MESSAGE, pas seulement le statut : trois refus de cette route rendent 409, et le
    // rapport justifie leurs messages distincts par « pour qu'un test sache lequel s'est
    // declenche ». Sans cette ligne, cette justification etait creuse.
    expect(res.json().message).toBe(DEACTIVATED_LINK)
    expect(await testDb.accessLink.count({ where: { userId: compte.id } })).toBe(avant)
  })

  it('refuse un membershipId d un autre etablissement', async () => {
    await peuplerAutreEtablissement()
    const { compte, membershipId } = await membershipDe(
      'admin-b@autre.fr',
      autreEtablissementId,
    )

    const res = await reissue(membershipId)

    expect(res.statusCode).toBe(404)
    expect(await testDb.accessLink.count({ where: { userId: compte.id } })).toBe(0)
  })


  // Creer un compte et reemettre un lien sont les deux operations les plus fortes de cet
  // ecran : l'une fabrique une identite, l'autre remet le pouvoir de reinitialiser un mot de
  // passe. Elles doivent etre imputables au meme titre qu'un changement de role — un
  // commentaire qui l'affirme ne suffit pas.
  // IMPUTABLE, pas seulement journalise (tour de correction 1, mineur n°2) : la version
  // precedente de ce test n'affirmait ni l'ACTEUR ni l'appartenance VISEE, alors que le
  // souscripteur ecrit les deux — le nom du test promettait plus que ses assertions.
  it('journalise la creation de compte et la reemission de lien, avec leur auteur et leur cible', async () => {
    const { compte, membershipId } = await nouveauMembre('journal@b.fr')
    expect((await reissue(membershipId)).statusCode).toBe(201)
    const auteur = await testDb.user.findUniqueOrThrow({
      where: { email: 'admin@b.fr' },
    })
    // L'auteur n'est pas la cible : sans cette difference, une confusion entre les deux
    // passerait inapercue.
    expect(auteur.id).not.toBe(compte.id)

    type Entree = {
      action: string
      entityType: string
      entityID: string
      userID: string
    }
    const attendues = ['member.accountCreated', 'member.accessLinkReissued']
    for (let essai = 0; essai < 40; essai += 1) {
      const res = await testApp.app.inject({
        method: 'GET',
        url: `/e/${establishmentId}/admin/activity-log`,
        cookies,
      })
      expect(res.statusCode).toBe(200)
      const lesNotres = (res.json().data as Entree[]).filter(
        (entree) =>
          entree.entityType === 'member' && entree.entityID === membershipId,
      )
      if (attendues.every((action) => lesNotres.some((e) => e.action === action))) {
        // Chaque ligne porte l'administrateur qui a agi — jamais le compte vise.
        expect(lesNotres.map((e) => e.userID)).toEqual(lesNotres.map(() => auteur.id))
        return
      }
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
    throw new Error(`journal incomplet : ${attendues.join(', ')} attendues`)
  })


  // ------------------------------------------------------------------
  // Tour de correction 1 — les deux escalades de privilege.
  //
  // La garde porte sur LE JETON, pas sur la route : toute route de ce niveau qui rend un
  // jeton la porte, parce qu'un jeton d'acces reinitialise le mot de passe du `User`, qui
  // est GLOBAL. Les tests ci-dessous jouent la CHAINE COMPLETE (jeton -> consume ->
  // session -> acces a l'etablissement vise), parce que c'est l'acces obtenu qui est le
  // defaut, pas le statut du premier appel.
  // ------------------------------------------------------------------

  // Joue l'attaque jusqu'au bout et rend ce qu'elle a REELLEMENT obtenu : un jeton
  // consomme, une session ouverte, un statut sur la ressource convoitee. Rend 0 quand
  // aucun jeton n'a ete remis — c'est le resultat attendu une fois la garde en place.
  const chaineComplete = async (
    reponse: { json: () => unknown },
    email: string,
    urlConvoitee: string,
  ): Promise<number> => {
    const jeton = (reponse.json() as { accessLink?: { token: string } }).accessLink?.token
    if (jeton === undefined) {
      return 0
    }
    expect((await consume(jeton, MDP_ATTAQUANT)).statusCode).toBe(200)
    const session = await signIn(testApp.app, email, MDP_ATTAQUANT)
    const atteinte = await testApp.app.inject({
      method: 'GET',
      url: urlConvoitee,
      cookies: session,
    })
    return atteinte.statusCode
  }

  // CRITIQUE n°1. L'administrateur de A soumet l'adresse d'une personne administratrice de
  // B seulement. Sans garde : 201 + jeton, `consume` pose le mot de passe, et
  // `GET /e/B/admin/members` rend 200 — l'administrateur de A administre B.
  it('ne remet aucun jeton pour une adresse rattachee a un AUTRE etablissement', async () => {
    await peuplerAutreEtablissement()
    const victime = await createUser({
      email: 'victime-b@autre.fr',
      memberships: [
        {
          establishmentId: autreEtablissementId,
          role: 'ADMIN',
          services: [{ serviceId: autreServiceId, role: 'COORDINATEUR' }],
        },
      ],
    })

    const res = await createAccount({ email: 'victime-b@autre.fr', role: 'MEMBER' })
    const priseDeControle = await chaineComplete(
      res,
      'victime-b@autre.fr',
      adminUrl(autreEtablissementId, '/members'),
    )

    // Un seul `expect` pour les deux faits : le diff montre d'un coup le statut ET l'acces
    // reellement obtenu sur B, plutot que de s'arreter au premier.
    expect({ statut: res.statusCode, adminDeB: priseDeControle }).toEqual({
      statut: 400,
      adminDeB: 0,
    })
    expect(res.json().message).toBe(UNADDABLE_EMAIL)
    // Rien ecrit : ni rattachement a A, ni lien.
    expect(
      await testDb.establishmentMembership.count({ where: { userId: victime.id } }),
    ).toBe(1)
    expect(await testDb.accessLink.count({ where: { userId: victime.id } })).toBe(0)
  })

  // CRITIQUE n°2, chemin court : le super-admin n'est membre de rien, un seul appel suffit.
  it('ne remet aucun jeton pour un compte super-admin', async () => {
    const sa = await createUser({ email: 'sa-libre@plateforme.fr', isSuperAdmin: true })
    // La fixture porte REELLEMENT le drapeau : sans cela le test ne prouverait rien.
    expect(
      (await testDb.user.findUniqueOrThrow({ where: { id: sa.id } })).isSuperAdmin,
    ).toBe(true)

    const res = await createAccount({ email: 'sa-libre@plateforme.fr', role: 'MEMBER' })
    const priseDeControle = await chaineComplete(
      res,
      'sa-libre@plateforme.fr',
      '/super-admin/establishments',
    )

    expect({ statut: res.statusCode, superAdmin: priseDeControle }).toEqual({
      statut: 400,
      superAdmin: 0,
    })
    expect(res.json().message).toBe(UNADDABLE_EMAIL)
    expect(await testDb.accessLink.count({ where: { userId: sa.id } })).toBe(0)
  })

  // CRITIQUE n°2, premier maillon : `addByEmail` rattachait un super-admin sans rien dire.
  // Le refus doit etre INDISCERNABLE de celui d'une adresse inconnue — sinon la route
  // devient un detecteur de super-admins, utilisable sur n'importe quelle adresse.
  it('refuse de rattacher un super-admin, du meme refus exactement qu une adresse inconnue', async () => {
    await createUser({ email: 'sa-rattachement@plateforme.fr', isSuperAdmin: true })

    const superAdmin = await call('POST', '/', {
      email: 'sa-rattachement@plateforme.fr',
      role: 'MEMBER',
    })
    const inconnue = await call('POST', '/', {
      email: 'personne-du-tout@b.fr',
      role: 'MEMBER',
    })

    expect(superAdmin.statusCode).toBe(inconnue.statusCode)
    expect(superAdmin.json()).toEqual(inconnue.json())
    expect(superAdmin.statusCode).toBe(400)
    expect(superAdmin.json().message).toBe(UNADDABLE_EMAIL)
  })

  // CRITIQUE n°2, second maillon : un super-admin DEJA membre de cet etablissement — ce que
  // `EstablishmentDomain.createWithFirstAdmin` peut produire legitimement. L'ancienne garde
  // (`assertSingleEstablishment`) le laissait passer, puisqu'il n'a qu'une appartenance.
  // LA CHAINE EN TROIS APPELS, D'UN SEUL TENANT (tour de correction 2, point n°5). Le tour
  // precedent eprouvait chaque maillon separement : la JONCTION n'etait tenue par rien.
  it('la chaine en trois appels meurt au premier maillon, et le second refuserait aussi', async () => {
    const sa = await createUser({
      email: 'sa-chaine@plateforme.fr',
      isSuperAdmin: true,
    })

    // MAILLON 1, PAR LA ROUTE : rattacher le super-admin a cet etablissement.
    const rattachement = await call('POST', '/', {
      email: 'sa-chaine@plateforme.fr',
      role: 'MEMBER',
    })
    expect(rattachement.statusCode).toBe(400)
    expect(
      await testDb.establishmentMembership.count({ where: { userId: sa.id } }),
    ).toBe(0)

    // LA CHAINE S'ARRETE ICI : sans appartenance, le maillon 2 n'a rien a viser. Le second
    // maillon est donc eprouve sur le seul etat qui puisse ENCORE le produire —
    // `EstablishmentDomain.createWithFirstAdmin`, qui rattache legitimement un super-admin
    // quand il est le premier administrateur d'un etablissement qu'il vient de creer. Cet etat
    // est reproduit en base parce qu'AUCUNE route de ce niveau ne peut plus le fabriquer.
    await testDb.establishmentMembership.create({
      data: { userId: sa.id, establishmentId, role: 'MEMBER' },
    })
    const { membershipId } = await membershipDe('sa-chaine@plateforme.fr')
    // UNE seule appartenance : l'etat exact qui contournait l'ancienne garde.
    expect(
      await testDb.establishmentMembership.count({ where: { userId: sa.id } }),
    ).toBe(1)

    // MAILLONS 2 ET 3 : reemettre, puis jouer le jeton jusqu'a la session et au prefixe vise.
    const res = await reissue(membershipId)
    const priseDeControle = await chaineComplete(
      res,
      'sa-chaine@plateforme.fr',
      '/super-admin/establishments',
    )

    expect({ statut: res.statusCode, superAdmin: priseDeControle }).toEqual({
      statut: 400,
      superAdmin: 0,
    })
    expect(await testDb.accessLink.count({ where: { userId: sa.id } })).toBe(0)
  })

  // LA QUESTION SYMETRIQUE : la garde ne doit pas fermer ce qui doit rester ouvert.
  // Rattacher (SANS jeton) une personne qui exerce deja dans un autre etablissement reste
  // permis — c'est le cas ordinaire d'un soignant qui travaille dans deux structures.
  it('laisse rattacher, sans jeton, une personne qui exerce deja dans un autre etablissement', async () => {
    await peuplerAutreEtablissement()
    const bilocal = await createUser({
      email: 'deux-postes@autre.fr',
      memberships: [
        {
          establishmentId: autreEtablissementId,
          role: 'MEMBER',
          services: [{ serviceId: autreServiceId, role: 'INTERVENANT' }],
        },
      ],
    })

    const res = await call('POST', '/', {
      email: 'deux-postes@autre.fr',
      role: 'MEMBER',
    })

    expect(res.statusCode).toBe(201)
    expect(
      await testDb.establishmentMembership.count({ where: { userId: bilocal.id } }),
    ).toBe(2)
    // Aucun jeton : `addByEmail` n'en a jamais emis, et ce n'est pas ce tour qui le change.
    expect(await testDb.accessLink.count({ where: { userId: bilocal.id } })).toBe(0)
  })


  // TROUVE EN TRAITANT LA CRITIQUE n°2, HORS DES TROIS VERBES DEMANDES — meme classe, autre
  // consequence : ce n'est pas une prise de controle mais un DENI DE SERVICE. `deactivatedAt`
  // vit sur le `User`, global : un simple ADMIN d'etablissement coupait l'acces du super-admin
  // A TOUTE LA PLATEFORME. L'ancienne garde ne s'y opposait pas (une seule appartenance), et la
  // regle du dernier administrateur non plus des qu'un second administrateur existe.
  it('ne desactive pas le compte global d un super-admin depuis un etablissement', async () => {
    const sa = await createUser({
      email: 'sa-desactivable@b.fr',
      isSuperAdmin: true,
      // MEMBER, et non ADMIN : sinon c'est la regle du dernier administrateur qui refuserait,
      // et le test serait vrai pour une autre raison que celle qu'il garde.
      memberships: [{ establishmentId, role: 'MEMBER' }],
    })
    const { membershipId } = await membershipDe('sa-desactivable@b.fr')

    const res = await call('POST', `/${membershipId}/deactivate`)

    // La chaine complete : le super-admin doit toujours pouvoir se connecter ET atteindre son
    // prefixe. Un 409 seul ne dirait pas que son acces est intact.
    const session = await signIn(testApp.app, 'sa-desactivable@b.fr').catch(() => null)
    const acces =
      session === null
        ? 0
        : (
            await testApp.app.inject({
              method: 'GET',
              url: '/super-admin/establishments',
              cookies: session,
            })
          ).statusCode

    expect({ statut: res.statusCode, superAdminIntact: acces }).toEqual({
      statut: 409,
      superAdminIntact: 200,
    })
    expect(
      (await testDb.user.findUniqueOrThrow({ where: { id: sa.id } })).deactivatedAt,
    ).toBeNull()
  })

  // LE SENS INVERSE (tour de correction 2, point n°4) : il n'etait assure que par la POSITION
  // du code, aucun test ne le tenait, alors que le rapport annoncait « les deux sens ». Un
  // super-admin desactive l'a ete deliberement, au niveau de la plateforme ; un administrateur
  // d'etablissement n'a pas a defaire cette decision.
  it('ne reactive pas non plus le compte global d un super-admin depuis un etablissement', async () => {
    const sa = await createUser({
      email: 'sa-dormant@plateforme.fr',
      isSuperAdmin: true,
      memberships: [{ establishmentId, role: 'MEMBER' }],
    })
    // Desactive en base : l'etat que seule la plateforme peut produire aujourd'hui, et que
    // cette route ne doit pas defaire.
    await testDb.user.update({
      where: { id: sa.id },
      data: { deactivatedAt: new Date() },
    })
    const { membershipId } = await membershipDe('sa-dormant@plateforme.fr')

    const res = await call('POST', `/${membershipId}/reactivate`)

    expect(res.statusCode).toBe(409)
    expect(
      (await testDb.user.findUniqueOrThrow({ where: { id: sa.id } })).deactivatedAt,
    ).not.toBeNull()
  })


  // TEST DE CONSTAT (tour de correction 2, Important) — il n'affirme pas une propriete
  // souhaitable, il MESURE une divulgation qui reste ouverte, a la maniere de
  // « emissions simultanees » (access-link.test.ts, tache 4).
  //
  // CE QU'IL CONSTATE : les deux routes d'ajout du niveau administrateur, prises ENSEMBLE,
  // rendent un couple de statuts DIFFERENT pour chacune des trois natures d'adresse — et le
  // couple (400, 400), celui du super-admin, s'obtient SANS LA MOINDRE ECRITURE. Un
  // administrateur d'etablissement peut donc, sur n'importe quelle adresse et sans laisser de
  // trace, apprendre : « inconnue », « a un compte ordinaire rattache ailleurs », ou « est un
  // super-admin ».
  //
  // POURQUOI ON NE LE FERME PAS (arbitrage de Leo, tour 2) : toute reponse honnete a
  // l'appelant legitime divulgue ce fait, et le seul moyen de le fermer serait de MENTIR a
  // l'administrateur sur le sort de sa demande — lui rendre 201 sans rien creer le laisserait
  // attendre un acces qui n'arrivera jamais. Ce n'est plus une prise de controle : les trois
  // verbes (rattacher, creer, reemettre) sont refuses ; il ne reste que du renseignement.
  //
  // CE TEST A ETE ECRIT D'ABORD TEL QUE LE COMMENTAIRE D'`UNADDABLE_EMAIL` DECRIVAIT LE
  // SYSTEME — trois couples identiques (400, 400) et zero ecriture partout. Il est tombe rouge
  // en imprimant la realite ci-dessous : c'est cette execution, pas une relecture, qui a
  // etabli que deux phrases du code etaient fausses.
  it('constat : le couple de refus des deux routes d ajout identifie la nature du compte', async () => {
    await peuplerAutreEtablissement()
    await createUser({
      email: 'sonde-ailleurs@autre.fr',
      memberships: [{ establishmentId: autreEtablissementId, role: 'MEMBER' }],
    })
    await createUser({ email: 'sonde-sa@plateforme.fr', isSuperAdmin: true })
    // Un compte qui existe, ordinaire, rattache NULLE PART : la quatrieme nature d'adresse.
    await createUser({ email: 'sonde-libre@autre.fr' })

    // Toute ecriture que les deux appels pourraient produire : un compte, un rattachement,
    // un lien. Le journal d'activite n'est pas compte ici — il est ecrit de facon asynchrone
    // par le souscripteur, et seulement A LA SUITE d'une de ces trois ecritures (`emit` n'est
    // appele qu'apres succes) : zero ligne ecrite implique zero ligne journalisee.
    const totaux = async () => {
      const [comptes, appartenances, liens] = await Promise.all([
        testDb.user.count(),
        testDb.establishmentMembership.count(),
        testDb.accessLink.count(),
      ])
      return comptes + appartenances + liens
    }

    // Les DEUX routes d'ajout du meme routeur, avec la meme permission, sur la meme adresse.
    const sonder = async (email: string) => {
      const avant = await totaux()
      const parCreation = await call('POST', '/account', { email, role: 'MEMBER' })
      const parRattachement = await call('POST', '/', { email, role: 'MEMBER' })
      return {
        couple: [parCreation.statusCode, parRattachement.statusCode],
        lignesEcrites: (await totaux()) - avant,
      }
    }

    const inconnue = await sonder('sonde-inconnue@b.fr')
    const ailleurs = await sonder('sonde-ailleurs@autre.fr')
    const superAdmin = await sonder('sonde-sa@plateforme.fr')
    const libre = await sonder('sonde-libre@autre.fr')

    // Mesure, pas souhait. Les trois couples sont DISTINCTS deux a deux — c'est la
    // divulgation elle-meme ; et seule la troisieme sonde est GRATUITE (aucune ecriture),
    // donc repetable a volonte sans laisser de trace.
    expect({ inconnue, ailleurs, superAdmin, libre }).toEqual({
      // `/account` cree le compte : la sonde reussit, et ecrit trois lignes (compte,
      // rattachement, lien). `POST /members` rend ensuite 400, l'adresse etant desormais
      // membre d'ici.
      inconnue: { couple: [201, 400], lignesEcrites: 3 },
      // Refusee a la creation (elle aurait remis un jeton), rattachee sans jeton : une ligne.
      ailleurs: { couple: [400, 201], lignesEcrites: 1 },
      // LE CAS QUI COMPTE : refusee des deux cotes, et RIEN d'ecrit. Le journal d'activite ne
      // bouge donc pas non plus.
      superAdmin: { couple: [400, 400], lignesEcrites: 0 },
      // Compte existant, rattache nulle part : MEME couple que l'adresse inconnue — seul le
      // nombre de lignes ecrites differe (deux, pas trois : le compte existait deja), et
      // l'appelant ne voit pas ce nombre.
      libre: { couple: [201, 400], lignesEcrites: 2 },
    })

    // TROIS natures distinguables sur QUATRE : « inconnue » et « compte libre » rendent le
    // MEME couple, et la reponse de `/account` ne porte, dans les deux cas, que des valeurs
    // soumises par l'appelant. C'est ce qui rend la fermeture du canal temporel NON REDONDANTE
    // avec la divulgation constatee ici : sur ces deux natures-la, le temps de reponse etait
    // le SEUL discriminant qui restait (voir « ne dit pas, par son temps de reponse ... »).
    const couples = [inconnue, ailleurs, superAdmin, libre].map((sonde) =>
      sonde.couple.join('/'),
    )
    expect(new Set(couples).size).toBe(3)
    expect(libre.couple).toEqual(inconnue.couple)
  })

})
