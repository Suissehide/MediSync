import { LocalizationProvider } from '@mui/x-date-pickers'
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { AnyRoute } from '@tanstack/react-router'
import {
  createMemoryHistory,
  createRootRouteWithContext,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router'
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useAuthStore } from '@/store/useAuthStore.ts'
import type { AuthState, User } from '@/types/auth.ts'
import { Route as serviceLayoutRoute } from '../$serviceId.tsx'
import { Route as arsRoute } from './indicateurs-ars.tsx'

dayjs.extend(utc)

// Trois états TOUJOURS distincts — chargement, erreur, données — plus le refus de l'écran à qui
// n'a pas `stats:read`. Le tableau vide indiscernable d'une panne a déjà été livré deux fois sur
// ce dépôt (front/CLAUDE.md, § Testing) ; ici la grille a 30 lignes même quand le service n'a
// rien, donc « vide » n'est pas un état de cet écran : c'est précisément pourquoi une panne
// rendue en silence serait indétectable à l'œil.

const optionsDe = (route: AnyRoute) => route.options

const avecRole = (id: string, role: 'COORDINATEUR' | 'INTERVENANT'): User => ({
  id,
  email: `${id}@b.fr`,
  firstName: null,
  lastName: null,
  isSuperAdmin: false,
  establishments: [
    {
      id: 'e1',
      name: 'CHU',
      role: 'MEMBER',
      services: [{ id: 's1', name: 'Cardio', role }],
    },
  ],
})

const coordinateur = avecRole('u1', 'COORDINATEUR')
const intervenant = avecRole('u2', 'INTERVENANT')

const rootRoute = createRootRouteWithContext<{ authState: AuthState }>()({
  component: () => <Outlet />,
})
const authenticatedRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: '/_authenticated',
  component: () => <Outlet />,
})
const serviceRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: 'e/$establishmentId/s/$serviceId',
  beforeLoad: optionsDe(serviceLayoutRoute).beforeLoad,
  remountDeps: optionsDe(serviceLayoutRoute).remountDeps,
  component: () => <Outlet />,
})
const dashboardRoute = createRoute({
  getParentRoute: () => serviceRoute,
  path: 'dashboard',
  component: () => <p>Tableau de bord</p>,
})
const arsScreenRoute = createRoute({
  getParentRoute: () => serviceRoute,
  path: 'indicateurs-ars',
  beforeLoad: optionsDe(arsRoute).beforeLoad,
  component: optionsDe(arsRoute).component,
})
const routeTree = rootRoute.addChildren([
  authenticatedRoute.addChildren([
    serviceRoute.addChildren([dashboardRoute, arsScreenRoute]),
  ]),
])

const calcule = (code: string, group: string, value: number) => ({
  code,
  group,
  label: `Libelle ${code}`,
  value,
  note: null,
  kind: 'computed',
  input: null,
  answer: null,
})

// 2.5 restant, 4.2 deja repondu ; Entree et Sortie tout en calcule, masquees par le filtre.
const indicateurs = [
  calcule('1.1', 'Entrée', 560),
  calcule('1.1bis', 'Entrée', 140),
  {
    code: '2.3',
    group: 'Séances',
    label: 'Nombre de patients pris en charge en soins de ville uniquement',
    value: null,
    note: 'Aucune notion de soins de ville',
    kind: 'unavailable',
    input: null,
    answer: null,
  },
  {
    code: '2.5',
    group: 'Séances',
    label: 'Autre type de prise en charge à chiffrer et à expliquer',
    value: null,
    note: "Champ libre de l'enquête, à renseigner à la main",
    kind: 'manual',
    input: 'number+text',
    answer: null,
  },
  calcule('2.6', 'Séances', 0),
  calcule('2.6bis', 'Séances', 3),
  calcule('2.8', 'Séances', 3.7),
  calcule('3.1', 'Sortie', 2),
  {
    code: '4.2',
    group: 'Modalités',
    label: 'Une offre de suivi est-elle proposée ?',
    value: null,
    note: 'Question oui/non sur la structure, à renseigner à la main',
    kind: 'manual',
    input: 'yesno',
    answer: { numberValue: null, textValue: null, boolValue: true },
  },
  {
    code: '4.4',
    group: 'Modalités',
    label: 'Synthese transmise au medecin traitant',
    value: null,
    note: 'Aucun modele ne trace cet envoi',
    kind: 'unavailable',
    input: null,
    answer: null,
  },
]

const charge = {
  ok: true,
  status: 200,
  corps: {
    from: '2026-01-01',
    to: '2026-12-31',
    manualYear: 2026,
    indicators: indicateurs,
  },
}

const LIBELLE_25 = 'Autre type de prise en charge à chiffrer et à expliquer'

// L'annee civile saisissable suit la periode demandee, comme le serveur.
const parAnnee = {
  ...charge,
  corps: (url: string) => ({
    ...charge.corps,
    manualYear: Number(/from=(\d{4})/.exec(url)?.[1]),
  }),
}

const enregistrements = () =>
  (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls
    .filter(([, init]) => init?.method === 'PUT')
    .map(([entree, init]) => ({
      url: String(entree),
      body: JSON.parse(String(init.body)),
    }))

const monter = (
  reponse: { ok: boolean; status: number; corps?: unknown },
  user: User = coordinateur,
  enregistrement = { ok: true, status: 200 },
) => {
  // Le mock est SÉLECTIF : `DashboardLayout` monte aussi la barre et son panneau de tâches, qui
  // appellent d'autres routes. Une réponse unique pour tout ferait échouer l'écran pour une raison
  // qui n'a rien à voir avec ce qu'on éprouve ici.
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString()
      if (init?.method === 'PUT') {
        const corps = {
          numberValue: null,
          textValue: null,
          boolValue: null,
          ...JSON.parse(String(init.body)),
        }
        return { ...enregistrement, url, json: async () => corps }
      }
      if (url.includes('/indicateurs-ars')) {
        return {
          ok: reponse.ok,
          status: reponse.status,
          url,
          json: async () =>
            typeof reponse.corps === 'function'
              ? reponse.corps(url)
              : reponse.corps,
        }
      }
      return { ok: true, status: 200, url, json: async () => [] }
    }),
  )
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({
      initialEntries: ['/e/e1/s/s1/indicateurs-ars'],
    }),
    context: { authState: { isAuthenticated: true, user } },
  })
  render(
    <LocalizationProvider dateAdapter={AdapterDayjs} adapterLocale="fr">
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </LocalizationProvider>,
  )
}

beforeEach(() => {
  useAuthStore.setState({
    isAuthenticated: true,
    user: coordinateur,
    context: {
      establishmentId: 'e1',
      serviceId: 's1',
      establishmentRole: 'MEMBER',
      serviceRole: 'COORDINATEUR',
      soignantId: null,
    },
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  Reflect.deleteProperty(navigator, 'clipboard')
})

describe('écran des indicateurs ARS', () => {
  it('affiche les indicateurs rendus par le serveur', async () => {
    monter(charge)

    expect(await screen.findByText('560')).toBeInTheDocument()
    expect(
      screen.getByText('Aucune notion de soins de ville'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  // Le cas qui compte : une panne du serveur ne doit PAS ressembler à une grille chargée.
  it('annonce une erreur plutot que des tableaux muets quand la lecture echoue', async () => {
    monter({ ok: false, status: 500 })

    const alerte = await screen.findByRole('alert')
    expect(alerte).toHaveTextContent(/Impossible de charger les indicateurs/i)
    expect(screen.queryByText('Chargement...')).not.toBeInTheDocument()
    expect(screen.queryByRole('rowheader')).not.toBeInTheDocument()
    expect(screen.queryByText('Entrée')).not.toBeInTheDocument()
  })

  it('desactive l export tant que la lecture n a pas abouti', async () => {
    monter({ ok: false, status: 500 })

    await screen.findByRole('alert')
    expect(
      screen.getByRole('button', { name: 'Exporter en Excel' }),
    ).toBeDisabled()
    expect(
      screen.getByRole('button', { name: 'Exporter en CSV' }),
    ).toBeDisabled()
  })

  it('propose de reessayer quand la lecture echoue', async () => {
    monter({ ok: false, status: 500 })

    await screen.findByRole('alert')
    expect(screen.getByRole('button', { name: 'Réessayer' })).toBeEnabled()
  })

  it('active l export CSV une fois les indicateurs charges', async () => {
    monter(charge)

    await screen.findByText('560')
    expect(
      screen.getByRole('button', { name: 'Exporter en CSV' }),
    ).toBeEnabled()
  })

  // La période est le paramètre de l'écran : le raccourci d'année règle les deux bornes, et la
  // requête part sur l'année civile sélectionnée.
  it('interroge le serveur sur l annee civile du raccourci actif', async () => {
    monter(charge)

    await screen.findByText('560')
    const appels = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls
      .map(([entree]) => String(entree))
      .filter((url) => url.includes('/indicateurs-ars'))
    expect(appels[0]).toContain('from=2026-01-01')
    expect(appels[0]).toContain('to=2026-12-31')
  })

  it('propose les trois dernieres annees en raccourci, et les deux bornes de periode', async () => {
    monter(charge)

    await screen.findByText('560')
    for (const annee of ['2026', '2025', '2024']) {
      expect(screen.getByRole('radio', { name: annee })).toBeInTheDocument()
    }
    expect(screen.getByText('du')).toBeInTheDocument()
    expect(screen.getByText('au')).toBeInTheDocument()
  })

  it('rend chaque indicateur selon sa nature', async () => {
    monter(charge)

    await screen.findByText('560')
    expect(screen.getByText('3,7')).toBeInTheDocument()
    expect(screen.getAllByText('Non disponible')).toHaveLength(2)
    expect(
      screen.getByText('Aucune notion de soins de ville'),
    ).toBeInTheDocument()
    expect(
      screen.getByText("Champ libre de l'enquête, à renseigner à la main"),
    ).toBeInTheDocument()
    expect(screen.queryByText('Sans valeur')).not.toBeInTheDocument()
  })

  it('montre les champs de saisie remplis par la reponse', async () => {
    monter(charge)

    const nombre = await screen.findByRole('textbox', {
      name: 'Autre type de prise en charge à chiffrer et à expliquer',
    })
    expect(nombre).toHaveValue('')
    expect(
      screen.getByRole('textbox', { name: 'Explication du 2.5' }),
    ).toHaveValue('')
    expect(screen.getByRole('radio', { name: 'Oui' })).toHaveAttribute(
      'aria-checked',
      'true',
    )
    expect(screen.getByRole('radio', { name: 'Non' })).toHaveAttribute(
      'aria-checked',
      'false',
    )
  })

  it('resume l avancement de l enquete dans le bandeau', async () => {
    monter(charge)

    expect(
      await screen.findByText(
        '6 calculés · 2 à saisir (1 restant) · 2 non disponibles',
      ),
    ).toBeInTheDocument()
    const parts = Object.fromEntries(
      [...document.querySelectorAll<HTMLElement>('[data-statut]')].map((el) => [
        el.dataset.statut,
        el.style.flexGrow,
      ]),
    )
    expect(parts).toEqual({
      calcule: '6',
      saisi: '1',
      restant: '1',
      indisponible: '2',
    })
  })

  it('filtre les lignes et masque les sections vides', async () => {
    monter(charge)

    await screen.findByText('560')
    fireEvent.click(screen.getByRole('radio', { name: /À saisir/ }))
    expect(screen.queryByText('560')).not.toBeInTheDocument()
    expect(screen.queryByText('Entrée')).not.toBeInTheDocument()
    expect(screen.queryByText('Sortie')).not.toBeInTheDocument()
    expect(screen.getByText('2.5')).toBeInTheDocument()
    expect(screen.getByText('4.2')).toBeInTheDocument()
    expect(screen.queryByText('4.4')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('radio', { name: /Non disponibles/ }))
    expect(screen.getByText('2.3')).toBeInTheDocument()
    expect(screen.getByText('4.4')).toBeInTheDocument()
    expect(screen.queryByText('2.5')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('radio', { name: /Calculés/ }))
    expect(screen.getByText('Sortie')).toBeInTheDocument()
    expect(screen.queryByText('2.3')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('radio', { name: /Tous/ }))
    expect(screen.getByText('2.3')).toBeInTheDocument()
    expect(screen.getByText('2.5')).toBeInTheDocument()
  })

  it('donne la part d un sous-indicateur seulement si le parent est positif', async () => {
    monter(charge)

    expect(await screen.findByText('25 % du 1.1')).toBeInTheDocument()
    expect(screen.queryByText(/% du 2\.6/)).not.toBeInTheDocument()
  })

  it('copie la valeur brute et annonce la copie', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    })
    monter(charge)

    fireEvent.click(
      await screen.findByRole('button', { name: 'Copier la valeur 2.8' }),
    )
    expect(writeText).toHaveBeenCalledWith('3.7')
    expect(await screen.findByText('Copié')).toBeInTheDocument()
  })

  it('renvoie vers l activite en pied de page', async () => {
    monter(charge)

    const pied = await screen.findByText(/reprises dans l'export Excel/)
    expect(
      within(pied).getByRole('link', { name: 'Activité' }),
    ).toHaveAttribute('href', '/e/e1/s/s1/activite')
  })

  it('enregistre 2.5 une seule fois, apres la frappe, et l annonce', async () => {
    monter(charge)
    const nombre = await screen.findByRole('textbox', { name: LIBELLE_25 })
    const texte = screen.getByRole('textbox', { name: 'Explication du 2.5' })

    vi.useFakeTimers()
    fireEvent.change(nombre, { target: { value: '1' } })
    fireEvent.change(nombre, { target: { value: '12' } })
    fireEvent.change(texte, { target: { value: '  Ateliers en ville ' } })
    act(() => vi.advanceTimersByTime(499))
    expect(enregistrements()).toEqual([])
    act(() => vi.advanceTimersByTime(1))
    vi.useRealTimers()

    expect(await screen.findByText('Enregistré')).toBeInTheDocument()
    expect(enregistrements()).toEqual([
      {
        url: expect.stringContaining('/indicateurs-ars/saisies/2026/2.5'),
        body: { numberValue: 12, textValue: 'Ateliers en ville' },
      },
    ])
  })

  it('enregistre des que l on quitte le champ, champs vides a null', async () => {
    monter(charge)
    const nombre = await screen.findByRole('textbox', { name: LIBELLE_25 })

    vi.useFakeTimers()
    fireEvent.change(nombre, { target: { value: '7' } })
    fireEvent.change(nombre, { target: { value: '' } })
    fireEvent.blur(nombre)
    vi.useRealTimers()

    await waitFor(() => expect(enregistrements()).toHaveLength(1))
    expect(enregistrements()[0].body).toEqual({
      numberValue: null,
      textValue: null,
    })
  })

  it('n accepte que des chiffres dans le nombre de 2.5', async () => {
    monter(charge)
    const nombre = await screen.findByRole('textbox', { name: LIBELLE_25 })

    fireEvent.change(nombre, { target: { value: '-1,5a' } })
    expect(nombre).toHaveValue('15')
    fireEvent.blur(nombre)
    await waitFor(() =>
      expect(enregistrements()[0]?.body).toEqual({
        numberValue: 15,
        textValue: null,
      }),
    )
  })

  it('enregistre 4.2 au clic', async () => {
    monter(charge)

    fireEvent.click(await screen.findByRole('radio', { name: 'Non' }))

    await waitFor(() => expect(enregistrements()).toHaveLength(1))
    expect(enregistrements()[0]).toEqual({
      url: expect.stringContaining('/indicateurs-ars/saisies/2026/4.2'),
      body: { boolValue: false },
    })
  })

  it('passe la ligne 2.5 du fond ambre au blanc une fois enregistree', async () => {
    monter(charge)
    const nombre = await screen.findByRole('textbox', { name: LIBELLE_25 })
    const ligne = nombre.closest('tr')
    expect(ligne).toHaveClass('bg-a-saisir-fond')

    fireEvent.change(nombre, { target: { value: '12' } })
    fireEvent.blur(nombre)

    await waitFor(() => expect(ligne).not.toHaveClass('bg-a-saisir-fond'))
    expect(ligne).toHaveClass('bg-carte')
  })

  it('garde la valeur et affiche une erreur si l enregistrement echoue', async () => {
    monter(charge, coordinateur, { ok: false, status: 500 })
    const nombre = await screen.findByRole('textbox', { name: LIBELLE_25 })

    fireEvent.change(nombre, { target: { value: '12' } })
    fireEvent.blur(nombre)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /pas été enregistrée/,
    )
    expect(nombre).toHaveValue('12')
    expect(screen.queryByText('Enregistré')).not.toBeInTheDocument()
  })

  it('envoie la saisie en attente sur l annee ou elle a ete tapee', async () => {
    monter(parAnnee)
    const nombre = await screen.findByRole('textbox', { name: LIBELLE_25 })

    vi.useFakeTimers()
    fireEvent.change(nombre, { target: { value: '12' } })
    fireEvent.click(screen.getByRole('radio', { name: '2025' }))
    vi.useRealTimers()

    await waitFor(() => expect(enregistrements()).toHaveLength(1))
    expect(enregistrements()[0].url).toContain('/saisies/2026/2.5')
    await screen.findByRole('textbox', { name: LIBELLE_25 })
    expect(enregistrements()).toHaveLength(1)
  })

  it('desactive la saisie hors annee civile et le dit', async () => {
    monter({ ...charge, corps: { ...charge.corps, manualYear: null } })

    expect(
      await screen.findByRole('textbox', { name: LIBELLE_25 }),
    ).toBeDisabled()
    expect(
      screen.getByRole('textbox', { name: 'Explication du 2.5' }),
    ).toBeDisabled()
    expect(screen.getByRole('radio', { name: 'Oui' })).toBeDisabled()
    expect(
      screen.getAllByText('Choisissez une année civile pour saisir'),
    ).toHaveLength(2)
  })

  it('desactive la saisie sans stats:write, sans message', async () => {
    monter(charge)
    const nombre = await screen.findByRole('textbox', { name: LIBELLE_25 })

    act(() =>
      useAuthStore.setState((etat) => ({
        context: etat.context && { ...etat.context, serviceRole: 'LECTURE' },
      })),
    )

    expect(nombre).toBeDisabled()
    expect(
      screen.getByRole('textbox', { name: 'Explication du 2.5' }),
    ).toBeDisabled()
    expect(screen.getByRole('radio', { name: 'Non' })).toBeDisabled()
    expect(
      screen.queryByText('Choisissez une année civile pour saisir'),
    ).not.toBeInTheDocument()
  })

  it('renvoie au tableau de bord un role sans stats:read', async () => {
    monter(
      {
        ok: true,
        status: 200,
        corps: { from: '2026-01-01', to: '2026-12-31', indicators: [] },
      },
      intervenant,
    )

    await waitFor(() => {
      expect(screen.getByText('Tableau de bord')).toBeInTheDocument()
    })
    expect(screen.queryByText('Indicateurs ARS')).not.toBeInTheDocument()
  })
})
