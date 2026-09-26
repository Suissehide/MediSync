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

describe('routes membres', () => {
  let testApp: TestApp
  let cookies: { access_token: string }
  let establishmentId: string
  let serviceId: string
  let soignantId: string
  let selfMembershipId: string

  beforeAll(async () => {
    await truncateAll()
    const establishment = await createEstablishment('E')
    establishmentId = establishment.id
    const service = await createService(establishmentId, 'S')
    serviceId = service.id
    const soignant = await testDb.soignant.create({
      data: { establishmentId, name: 'So' },
    })
    soignantId = soignant.id

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
      soignantId,
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
          url: `/e/${establishmentId}/s/${serviceId}/activity-log`,
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

  it('refuse un soignant etranger et deux affectations au meme service', async () => {
    const foreignSoignant = await testDb.soignant.create({
      data: {
        establishmentId: (await createEstablishment('Autre')).id,
        name: 'Etranger',
      },
    })
    expect(
      (
        await call('POST', '/', {
          email: 'new@b.fr',
          role: 'MEMBER',
          soignantId: foreignSoignant.id,
        })
      ).statusCode,
    ).toBe(404)
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
      soignantId,
      services: [{ serviceId, role: 'INTERVENANT' }],
    })

    expect(res.statusCode).toBe(201)
    expect(Object.keys(res.json()).sort()).toEqual(['accessLink', 'member'])
    expect(res.json().member.serviceMemberships).toEqual([
      { serviceId, role: 'INTERVENANT' },
    ])
    expect(res.json().member.soignantId).toBe(soignantId)

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

  it('rend la meme forme pour une adresse deja pourvue d un compte, sans ecraser son identite', async () => {
    await peuplerAutreEtablissement()
    const deja = await createUser({
      email: 'partage@autre.fr',
      memberships: [
        {
          establishmentId: autreEtablissementId,
          role: 'MEMBER',
          services: [{ serviceId: autreServiceId, role: 'LECTURE' }],
        },
      ],
    })
    await testDb.user.update({
      where: { id: deja.id },
      data: { firstName: 'Ancien', lastName: 'Nom' },
    })

    const res = await createAccount({
      email: 'partage@autre.fr',
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

    // Le compte n'est ni duplique, ni ecrase, et son appartenance a B est intacte.
    expect(await testDb.user.count({ where: { email: 'partage@autre.fr' } })).toBe(1)
    const relu = await testDb.user.findUniqueOrThrow({ where: { id: deja.id } })
    expect(relu.firstName).toBe('Ancien')
    expect(relu.password).toBe(deja.password)
    expect(
      await testDb.establishmentMembership.count({ where: { userId: deja.id } }),
    ).toBe(2)
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

  const membershipDe = async (email: string, dansEtablissement = establishmentId) => {
    const compte = await testDb.user.findUniqueOrThrow({ where: { email } })
    const appartenance = await testDb.establishmentMembership.findFirstOrThrow({
      where: { userId: compte.id, establishmentId: dansEtablissement },
    })
    return { compte, membershipId: appartenance.id }
  }

  it('reemet un lien : le precedent devient inutilisable, le nouveau ouvre une session', async () => {
    // `compte-neuf@b.fr` n'appartient qu'a cet etablissement : la garde
    // multi-etablissement ne peut donc pas se declencher ici, seule la reemission est
    // eprouvee.
    const { membershipId } = await membershipDe('compte-neuf@b.fr')
    // Le lien remis a la creation du compte a deja ete consomme plus haut : on en reemet
    // un premier, qui sert de « precedent » a invalider.
    const precedent = await reissue(membershipId)
    expect(precedent.statusCode).toBe(201)
    const premier = precedent.json().accessLink.token as string

    const res = await reissue(membershipId)

    expect(res.statusCode).toBe(201)
    expect(Object.keys(res.json())).toEqual(['accessLink'])
    // Le lien precedent est invalide, le nouveau pose un mot de passe qui ouvre une session.
    expect((await consume(premier)).statusCode).toBe(410)
    const AUTRE_MDP = 'EncoreUnAutreMotDePasse123!!'
    expect((await consume(res.json().accessLink.token, AUTRE_MDP)).statusCode).toBe(200)
    await expect(
      signIn(testApp.app, 'compte-neuf@b.fr', AUTRE_MDP),
    ).resolves.toEqual(expect.objectContaining({ access_token: expect.any(String) }))
  })

  it('refuse de reemettre un lien pour un compte membre de plusieurs etablissements', async () => {
    await peuplerAutreEtablissement()
    const { compte, membershipId } = await membershipDe('partage@autre.fr')
    // La fixture est reellement double : sans ces deux appartenances, le test serait vrai
    // par vacuite.
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
    const { compte, membershipId } = await membershipDe('chrono-neuf-0@b.fr')
    expect((await call('POST', `/${membershipId}/deactivate`)).statusCode).toBe(200)
    const avant = await testDb.accessLink.count({ where: { userId: compte.id } })

    const res = await reissue(membershipId)

    expect(res.statusCode).toBe(409)
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
  it('journalise la creation de compte et la reemission de lien', async () => {
    const attendues = ['member.accountCreated', 'member.accessLinkReissued']
    for (let essai = 0; essai < 40; essai += 1) {
      const res = await testApp.app.inject({
        method: 'GET',
        url: `/e/${establishmentId}/s/${serviceId}/activity-log`,
        cookies,
      })
      expect(res.statusCode).toBe(200)
      const actions = new Set(
        (res.json().data as { action: string; entityType: string }[])
          .filter((entree) => entree.entityType === 'member')
          .map((entree) => entree.action),
      )
      if (attendues.every((action) => actions.has(action))) {
        return
      }
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
    throw new Error(`journal incomplet : ${attendues.join(', ')} attendues`)
  })

})
