import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  ADMIN_SERVICE_ROLE_DESCRIPTION,
  ADMIN_SERVICE_ROLE_LABEL,
  ESTABLISHMENT_ROLE_DESCRIPTION,
  SERVICE_ROLE_DESCRIPTION,
} from '@/constants/member.constant.ts'
import { useAuthStore } from '@/store/useAuthStore.ts'
import { useToastStore } from '@/store/useToastStore.ts'
import type { User } from '@/types/auth.ts'
import type { Member } from '@/types/member.ts'
import EditMemberForm, { buildServiceAssignments } from './editMemberForm.tsx'

// « Affecter un membre à un service » est
// aujourd'hui IMPOSSIBLE depuis cet écran — `serviceId` valait toujours
// `null` (contexte du layout d'établissement, qui n'en porte jamais), la
// commande de rôle de service restait désactivée en permanence. Ce fichier
// verrouille le remplacement : la liste COMPLÈTE des services de
// l'établissement (`GET /e/:establishmentId/admin/services`, déjà listée
// par l'onglet des services), un rôle par service, et LA PROPRIÉTÉ QUE LE
// CODE PROTÉGEAIT DÉJÀ (à raison) : la mise à jour remplace l'ensemble des
// affectations côté back, donc une affectation qu'on ne montre pas ne doit
// jamais être effacée en silence.

const admin: User = {
  id: 'u1',
  email: 'admin@b.fr',
  firstName: null,
  lastName: null,
  isSuperAdmin: false,
  establishments: [{ id: 'e1', name: 'CHU', role: 'ADMIN', services: [] }],
}

const memberFixture: Member = {
  id: 'm1',
  role: 'MEMBER',
  user: {
    id: 'u2',
    email: 'membre@chu.fr',
    firstName: 'Un',
    lastName: 'Membre',
    deactivatedAt: null,
  },
  serviceMemberships: [
    { serviceId: 'svcA', role: 'COORDINATEUR' },
    { serviceId: 'svcB', role: 'INTERVENANT' },
  ],
}

const servicesFixture = [
  {
    id: 'svcA',
    name: 'Cardiologie',
    createdAt: '2026-01-01T00:00:00.000Z',
    deactivatedAt: null,
  },
  {
    id: 'svcB',
    name: 'Neurologie',
    createdAt: '2026-01-01T00:00:00.000Z',
    deactivatedAt: null,
  },
  {
    id: 'svcC',
    name: 'Pédiatrie',
    createdAt: '2026-01-01T00:00:00.000Z',
    deactivatedAt: null,
  },
  // Un service désactivé, sans affectation, reste proposé dans la liste
  // (avec son suffixe « (désactivé) ») — l'établissement peut le
  // réactiver, voir `admin/services.tsx`.
  {
    id: 'svcD',
    name: 'Urgences',
    createdAt: '2026-01-01T00:00:00.000Z',
    deactivatedAt: '2026-02-01T00:00:00.000Z',
  },
]

type Route = {
  match: (url: string, method: string) => boolean
  respond: () => { ok: boolean; status: number; json: () => Promise<unknown> }
}

const buildFetchMock = (routes: Route[]) =>
  vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = input.toString()
    const method = init?.method ?? 'GET'
    const route = routes.find((r) => r.match(url, method))
    if (!route) {
      throw new Error(`Appel fetch non attendu dans ce test : ${method} ${url}`)
    }
    const result = route.respond()
    return { ...result, url }
  })

const routeSoignants: Route = {
  match: (url, method) => url.endsWith('/admin/soignant') && method === 'GET',
  respond: () => ({ ok: true, status: 200, json: async () => [] }),
}

const routeServices = (services: unknown[] = servicesFixture): Route => ({
  match: (url, method) => url.endsWith('/admin/services') && method === 'GET',
  respond: () => ({ ok: true, status: 200, json: async () => services }),
})

const renderForm = (
  fetchMock: ReturnType<typeof buildFetchMock>,
  member = memberFixture,
) => {
  vi.stubGlobal('fetch', fetchMock)
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  render(
    <QueryClientProvider client={queryClient}>
      <EditMemberForm member={member} />
    </QueryClientProvider>,
  )
  return queryClient
}

const ouvrir = async () => {
  await userEvent.click(
    screen.getByRole('button', { name: /modifier le membre/i }),
  )
}

beforeEach(() => {
  useAuthStore.setState({
    isAuthenticated: true,
    user: admin,
    context: {
      establishmentId: 'e1',
      serviceId: null,
      establishmentRole: 'ADMIN',
      serviceRole: null,
      soignantId: null,
    },
  })
  useToastStore.setState({ toasts: [] })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('EditMemberForm — affecter un membre a un service', () => {
  // Verifie des valeurs par defaut PRECISES, une par service, chacune liee a
  // son propre libelle plutot qu'affirmee en vrac — la desactivation
  // conditionnelle de la commande de role a disparu du composant (il n'y a
  // plus DE commande a desactiver), un simple `toBeEnabled()` global serait
  // donc vrai par vacuite.
  it("propose TOUS les services de l'etablissement, chacun pre-rempli avec le role reellement affecte (ou Aucun), y compris un service desactive", async () => {
    renderForm(buildFetchMock([routeSoignants, routeServices()]))
    await ouvrir()

    await waitFor(() => {
      expect(screen.getByLabelText('Cardiologie')).toBeInTheDocument()
    })

    // Deux services deja affectes : chacun montre SON role, pas un autre.
    expect(screen.getByLabelText('Cardiologie')).toHaveTextContent(
      'Coordinateur',
    )
    expect(screen.getByLabelText('Neurologie')).toHaveTextContent('Intervenant')
    // Aucune affectation : « Aucun », jamais un role herite d'un autre service.
    expect(screen.getByLabelText('Pédiatrie')).toHaveTextContent('Aucun')

    // Service desactive, sans affectation : propose quand meme (avec son
    // suffixe), a « Aucun » comme les autres services non affectes.
    const libelleUrgences = screen.getByLabelText(/Urgences \(désactivé\)/i)
    expect(libelleUrgences).toBeInTheDocument()
    expect(screen.getByLabelText(/Urgences \(désactivé\)/i)).toHaveTextContent(
      'Aucun',
    )

    // Plus jamais desactivee : l'ancienne commande unique se desactivait
    // systematiquement (`serviceId === null`, toujours vrai sur cet ecran).
    expect(screen.getByLabelText('Cardiologie')).toBeEnabled()
    expect(screen.getByLabelText('Pédiatrie')).toBeEnabled()
  })

  // LE GESTE REEL DE L'UTILISATEUR : la fonction pure `buildServiceAssignments`
  // etait eprouvee, mais rien ne couvrait le CABLAGE React qui alimente
  // `serviceRoles` a chaque clic — remplacer la fusion (`setServiceRoles((prev) => ({ ...prev,
  // [id]: value }))`) par un ecrasement (`setServiceRoles({ [id]: value })`)
  // ne fait rougir aucun des neuf tests precedents. Necessite le
  // polyfill de `hasPointerCapture`/`scrollIntoView` (`src/test/setup.ts`) :
  // sans lui, RadixSelect leve a l'ouverture sous jsdom.
  it("changer le role d'un service via le VRAI composant ne touche pas le role deja choisi d'un autre service", async () => {
    const fetchMock = buildFetchMock([
      routeSoignants,
      routeServices(),
      {
        match: (url, method) =>
          url.endsWith('/admin/members/m1') && method === 'PATCH',
        respond: () => ({
          ok: true,
          status: 200,
          json: async () => ({ ...memberFixture }),
        }),
      },
    ])
    renderForm(fetchMock)
    await ouvrir()

    await waitFor(() => {
      expect(screen.getByLabelText('Cardiologie')).toHaveTextContent(
        'Coordinateur',
      )
    })
    expect(screen.getByLabelText('Neurologie')).toHaveTextContent('Intervenant')

    // Change UNIQUEMENT le role de Neurologie (svcB), par un vrai clic dans
    // le VRAI menu deroulant.
    await userEvent.click(screen.getByLabelText('Neurologie'))
    // Radix double le menu d'un `<select>` natif caché dans un `<form>` :
    // on vise l'option du menu ouvert, pas le texte.
    await userEvent.click(
      await screen.findByRole('option', { name: 'Secrétariat' }),
    )

    // Immediatement apres le clic, AVANT toute soumission : Cardiologie
    // (svcA), jamais touchee, doit toujours afficher SON role d'origine.
    expect(screen.getByLabelText('Cardiologie')).toHaveTextContent(
      'Coordinateur',
    )
    expect(screen.getByLabelText('Neurologie')).toHaveTextContent('Secrétariat')

    await userEvent.click(
      screen.getByRole('button', { name: /^enregistrer$/i }),
    )

    await waitFor(() => {
      const patchCall = fetchMock.mock.calls.find(
        ([url, init]) =>
          String(url).endsWith('/admin/members/m1') && init?.method === 'PATCH',
      )
      expect(patchCall).toBeDefined()
    })

    const patchCall = fetchMock.mock.calls.find(
      ([url, init]) =>
        String(url).endsWith('/admin/members/m1') && init?.method === 'PATCH',
    )
    const body = JSON.parse(String(patchCall?.[1]?.body))
    expect(body.services).toEqual(
      expect.arrayContaining([
        { serviceId: 'svcA', role: 'COORDINATEUR' },
        { serviceId: 'svcB', role: 'SECRETARIAT' },
      ]),
    )
    expect(body.services).toHaveLength(2)
  })

  it("soumettre sans rien changer renvoie EXACTEMENT les affectations existantes (aucune n'est effacee)", async () => {
    const fetchMock = buildFetchMock([
      routeSoignants,
      routeServices(),
      {
        match: (url, method) =>
          url.endsWith('/admin/members/m1') && method === 'PATCH',
        respond: () => ({
          ok: true,
          status: 200,
          json: async () => ({ ...memberFixture }),
        }),
      },
    ])
    renderForm(fetchMock)
    await ouvrir()

    await waitFor(() => {
      expect(screen.getByLabelText('Cardiologie')).toBeInTheDocument()
    })

    await userEvent.click(
      screen.getByRole('button', { name: /^enregistrer$/i }),
    )

    await waitFor(() => {
      const patchCall = fetchMock.mock.calls.find(
        ([url, init]) =>
          String(url).endsWith('/admin/members/m1') && init?.method === 'PATCH',
      )
      expect(patchCall).toBeDefined()
    })

    const patchCall = fetchMock.mock.calls.find(
      ([url, init]) =>
        String(url).endsWith('/admin/members/m1') && init?.method === 'PATCH',
    )
    const body = JSON.parse(String(patchCall?.[1]?.body))
    expect(body.services).toEqual(
      expect.arrayContaining([
        { serviceId: 'svcA', role: 'COORDINATEUR' },
        { serviceId: 'svcB', role: 'INTERVENANT' },
      ]),
    )
    expect(body.services).toHaveLength(2)
  })

  // LE SABOTAGE QUI COMPTE : une affectation a un service ABSENT de la
  // liste chargee (ex. course avec la creation d'un service, ou tout autre
  // ecart entre la liste montree et les affectations reelles) ne doit
  // JAMAIS disparaitre au premier enregistrement, meme sans y toucher — la
  // mise a jour remplace l'ensemble des affectations cote back.
  it('une affectation a un service absent de la liste chargee est preservee telle quelle', async () => {
    const memberAvecServiceOrphelin: Member = {
      ...memberFixture,
      serviceMemberships: [
        ...memberFixture.serviceMemberships,
        { serviceId: 'svc-disparu', role: 'LECTURE' },
      ],
    }
    const fetchMock = buildFetchMock([
      routeSoignants,
      routeServices(), // ne contient PAS 'svc-disparu'
      {
        match: (url, method) =>
          url.endsWith('/admin/members/m1') && method === 'PATCH',
        respond: () => ({
          ok: true,
          status: 200,
          json: async () => ({ ...memberAvecServiceOrphelin }),
        }),
      },
    ])
    renderForm(fetchMock, memberAvecServiceOrphelin)
    await ouvrir()

    await waitFor(() => {
      expect(screen.getByLabelText('Cardiologie')).toBeInTheDocument()
    })

    await userEvent.click(
      screen.getByRole('button', { name: /^enregistrer$/i }),
    )

    await waitFor(() => {
      const patchCall = fetchMock.mock.calls.find(
        ([url, init]) =>
          String(url).endsWith('/admin/members/m1') && init?.method === 'PATCH',
      )
      expect(patchCall).toBeDefined()
    })

    const patchCall = fetchMock.mock.calls.find(
      ([url, init]) =>
        String(url).endsWith('/admin/members/m1') && init?.method === 'PATCH',
    )
    const body = JSON.parse(String(patchCall?.[1]?.body))
    expect(body.services).toEqual(
      expect.arrayContaining([{ serviceId: 'svc-disparu', role: 'LECTURE' }]),
    )
  })

  it('etat de chargement des services distinct : ne pretend pas que la liste est vide pendant la requete', async () => {
    // Fetch dedie : la requete des services ne se regle jamais.
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        if (String(input).endsWith('/admin/soignant')) {
          return Promise.resolve(new Response('[]', { status: 200 }))
        }
        return new Promise(() => {
          // Ne se regle jamais : requete des services en cours.
        })
      }),
    )
    render(
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <EditMemberForm member={memberFixture} />
      </QueryClientProvider>,
    )
    await ouvrir()

    expect(
      await screen.findByText(/chargement des services/i),
    ).toBeInTheDocument()
    expect(screen.queryByText(/aucun service/i)).not.toBeInTheDocument()
  })

  it('etat vide distinct : aucun service dans cet etablissement', async () => {
    renderForm(buildFetchMock([routeSoignants, routeServices([])]))
    await ouvrir()

    expect(
      await screen.findByText(/aucun service dans cet établissement/i),
    ).toBeInTheDocument()
  })

  it("etat d'erreur distinct sur les services : le formulaire reste utilisable pour le role/la fonction", async () => {
    renderForm(
      buildFetchMock([
        routeSoignants,
        {
          match: (url, method) =>
            url.endsWith('/admin/services') && method === 'GET',
          respond: () => ({ ok: false, status: 500, json: async () => ({}) }),
        },
      ]),
    )
    await ouvrir()

    expect(
      await screen.findByText(/impossible de charger les services/i),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^enregistrer$/i })).toBeEnabled()
  })
})

describe('buildServiceAssignments (fonction pure)', () => {
  const services = [{ id: 'svcA' }, { id: 'svcB' }, { id: 'svcC' }]

  it('ne retient que les services dont le role choisi n est pas "aucun"', () => {
    const result = buildServiceAssignments({
      services,
      serviceRoles: { svcA: 'COORDINATEUR', svcB: 'NONE', svcC: 'LECTURE' },
      existingMemberships: [],
    })
    expect(result).toEqual(
      expect.arrayContaining([
        { serviceId: 'svcA', role: 'COORDINATEUR' },
        { serviceId: 'svcC', role: 'LECTURE' },
      ]),
    )
    expect(result).toHaveLength(2)
  })

  it("changer le role d'un service n'affecte jamais les autres (multi-service, un role par service)", () => {
    const before = buildServiceAssignments({
      services,
      serviceRoles: { svcA: 'COORDINATEUR', svcB: 'INTERVENANT', svcC: 'NONE' },
      existingMemberships: [],
    })
    const after = buildServiceAssignments({
      services,
      serviceRoles: { svcA: 'COORDINATEUR', svcB: 'SECRETARIAT', svcC: 'NONE' },
      existingMemberships: [],
    })
    expect(before.find((a) => a.serviceId === 'svcA')).toEqual(
      after.find((a) => a.serviceId === 'svcA'),
    )
    expect(after.find((a) => a.serviceId === 'svcB')?.role).toBe('SECRETARIAT')
  })

  it('preserve telles quelles les affectations a des services absents de la liste montree', () => {
    const result = buildServiceAssignments({
      services: [{ id: 'svcA' }],
      serviceRoles: { svcA: 'NONE' },
      existingMemberships: [{ serviceId: 'svc-disparu', role: 'LECTURE' }],
    })
    expect(result).toEqual([{ serviceId: 'svc-disparu', role: 'LECTURE' }])
  })
})

describe('EditMemberForm — description du rôle sous chaque champ', () => {
  it('décrit le rôle choisi, relié au champ, et suit le changement de rôle', async () => {
    renderForm(buildFetchMock([routeSoignants, routeServices()]))
    await ouvrir()

    await waitFor(() => {
      expect(screen.getByLabelText('Neurologie')).toBeInTheDocument()
    })

    expect(
      screen.getByLabelText('Rôle établissement'),
    ).toHaveAccessibleDescription(ESTABLISHMENT_ROLE_DESCRIPTION.MEMBER)
    expect(screen.getByLabelText('Neurologie')).toHaveAccessibleDescription(
      SERVICE_ROLE_DESCRIPTION.INTERVENANT,
    )

    await userEvent.click(screen.getByLabelText('Neurologie'))
    await userEvent.click(
      await screen.findByRole('option', { name: 'Secrétariat' }),
    )
    expect(screen.getByLabelText('Neurologie')).toHaveAccessibleDescription(
      SERVICE_ROLE_DESCRIPTION.SECRETARIAT,
    )
  })

  it("Chef d'établissement : chaque service affiche un champ désactivé, sans rôle à choisir", async () => {
    renderForm(buildFetchMock([routeSoignants, routeServices()]))
    await ouvrir()

    await waitFor(() => {
      expect(screen.getByLabelText('Neurologie')).toBeInTheDocument()
    })

    await userEvent.click(screen.getByLabelText('Rôle établissement'))
    await userEvent.click(
      await screen.findByRole('option', { name: "Chef d'établissement" }),
    )

    const neurologie = screen.getByLabelText('Neurologie')
    expect(neurologie).toBeDisabled()
    expect(neurologie).toHaveValue(ADMIN_SERVICE_ROLE_LABEL)
    expect(neurologie).toHaveAccessibleDescription(
      ADMIN_SERVICE_ROLE_DESCRIPTION,
    )
    expect(
      screen.getByLabelText('Rôle établissement'),
    ).toHaveAccessibleDescription(ESTABLISHMENT_ROLE_DESCRIPTION.ADMIN)
  })
})
