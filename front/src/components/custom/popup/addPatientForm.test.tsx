import { LocalizationProvider } from '@mui/x-date-pickers'
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useAuthStore } from '@/store/useAuthStore.ts'
import { useToastStore } from '@/store/useToastStore.ts'
import AddPatientForm from './addPatientForm.tsx'

// `main.tsx` enregistre ce greffon au démarrage ; le `DatePicker` de date de naissance en dépend
// via `AdapterDayjs` (même convention que `edit.patient.test.tsx`).
dayjs.extend(utc)

// Tâche 13 (étape 3 du multi-tenant, spec §6) : avant de créer un patient, l'écran cherche une
// identité existante dans l'établissement, pour éviter les doublons. Choisir un résultat crée
// le sous-dossier dans le service courant sans toucher à l'identité — ces tests verrouillent
// que le flux emprunte bien cette route (POST .../service-file), jamais POST /patient ni
// PATCH /patient/:id, et que le cas « déjà suivi ici » est distingué.

const context = {
  establishmentId: 'e1',
  serviceId: 's1',
  establishmentRole: 'ADMIN' as const,
  serviceRole: 'COORDINATEUR' as const,
  soignantId: null,
}

type Route = {
  match: (url: string, method: string) => boolean
  respond: (
    url: string,
    init?: RequestInit,
  ) => { ok: boolean; status: number; json: () => Promise<unknown> }
}

const buildFetchMock = (routes: Route[]) =>
  vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = input.toString()
    const method = init?.method ?? 'GET'
    const route = routes.find((r) => r.match(url, method))
    if (!route) {
      throw new Error(`Appel fetch non attendu dans ce test : ${method} ${url}`)
    }
    const result = route.respond(url, init)
    return { ...result, url }
  })

const renderForm = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <LocalizationProvider dateAdapter={AdapterDayjs} adapterLocale="fr">
        <AddPatientForm />
      </LocalizationProvider>
    </QueryClientProvider>,
  )
}

const openPopupAndFillIdentity = async (
  firstName: string,
  lastName: string,
) => {
  await userEvent.click(
    screen.getByRole('button', { name: /Ajouter un patient/i }),
  )
  const firstNameInput = await screen.findByLabelText('Prénom')
  await userEvent.type(firstNameInput, firstName)
  await userEvent.type(screen.getByLabelText('Nom'), lastName)
}

beforeEach(() => {
  useAuthStore.setState({ context })
  useToastStore.setState({ toasts: [] })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('AddPatientForm — recherche d’identité existante (tâche 13)', () => {
  it('le bouton de recherche est désactivé tant qu aucun prénom ni nom n est saisi', async () => {
    vi.stubGlobal('fetch', buildFetchMock([]))
    renderForm()

    await userEvent.click(
      screen.getByRole('button', { name: /Ajouter un patient/i }),
    )

    const searchButton = await screen.findByRole('button', {
      name: /Rechercher un patient existant/i,
    })
    expect(searchButton).toBeDisabled()
  })

  it('cherche par GET /patient/search avec le prénom et le nom saisis, et affiche uniquement l identité rendue', async () => {
    const fetchMock = buildFetchMock([
      {
        match: (url, method) =>
          url.includes('/patient/search') && method === 'GET',
        respond: () => ({
          ok: true,
          status: 200,
          json: async () => ({
            results: [
              {
                id: 'existing-1',
                firstName: 'Isabelle',
                lastName: 'Fontaine',
                birthDate: '1980-05-12T00:00:00.000Z',
              },
            ],
            hasMore: false,
          }),
        }),
      },
    ])
    vi.stubGlobal('fetch', fetchMock)

    renderForm()
    await openPopupAndFillIdentity('Isabelle', 'Fontaine')

    await userEvent.click(
      screen.getByRole('button', { name: /Rechercher un patient existant/i }),
    )

    expect(await screen.findByText(/Isabelle Fontaine/)).toBeInTheDocument()
    expect(screen.getByText(/12\/05\/1980/)).toBeInTheDocument()

    const searchCall = fetchMock.mock.calls.find(([url]) =>
      url.toString().includes('/patient/search'),
    )
    expect(searchCall).toBeDefined()
    const requestedUrl = (searchCall?.[0] as string).toString()
    expect(requestedUrl).toContain('firstName=Isabelle')
    expect(requestedUrl).toContain('lastName=Fontaine')
  })

  it('affiche un message explicite quand la recherche ne trouve aucune identité', async () => {
    const fetchMock = buildFetchMock([
      {
        match: (url, method) =>
          url.includes('/patient/search') && method === 'GET',
        respond: () => ({
          ok: true,
          status: 200,
          json: async () => ({ results: [], hasMore: false }),
        }),
      },
    ])
    vi.stubGlobal('fetch', fetchMock)

    renderForm()
    await openPopupAndFillIdentity('Inconnu', 'Personne')
    await userEvent.click(
      screen.getByRole('button', { name: /Rechercher un patient existant/i }),
    )

    expect(
      await screen.findByText(/Aucune identité existante trouvée/i),
    ).toBeInTheDocument()
  })

  it(
    'choisir une identité existante appelle POST .../patient/:id/service-file, jamais ' +
      'POST /patient ni PATCH /patient/:id (consigne 3 : ne touche pas à l identité)',
    async () => {
      const fetchMock = buildFetchMock([
        {
          match: (url, method) =>
            url.includes('/patient/search') && method === 'GET',
          respond: () => ({
            ok: true,
            status: 200,
            json: async () => ({
              results: [
                {
                  id: 'existing-1',
                  firstName: 'Robert',
                  lastName: 'Girard',
                  birthDate: null,
                },
              ],
              hasMore: false,
            }),
          }),
        },
        {
          match: (url, method) =>
            /\/patient\/existing-1\/service-file$/.test(url) &&
            method === 'POST',
          respond: () => ({
            ok: true,
            status: 200,
            json: async () => ({
              patientId: 'existing-1',
              alreadyFollowedHere: false,
            }),
          }),
        },
      ])
      vi.stubGlobal('fetch', fetchMock)

      renderForm()
      await openPopupAndFillIdentity('Robert', 'Girard')
      await userEvent.click(
        screen.getByRole('button', { name: /Rechercher un patient existant/i }),
      )

      const chooseButton = await screen.findByRole('button', {
        name: /Choisir/i,
      })
      await userEvent.click(chooseButton)

      await waitFor(() =>
        expect(
          fetchMock.mock.calls.some(
            ([url, init]) =>
              /\/patient\/existing-1\/service-file$/.test(url.toString()) &&
              (init as RequestInit | undefined)?.method === 'POST',
          ),
        ).toBe(true),
      )

      // Aucune écriture sur l'identité partagée : ni création, ni modification du patient.
      expect(
        fetchMock.mock.calls.some(([url, init]) => {
          const method = (init as RequestInit | undefined)?.method
          return (
            (/\/patient$/.test(url.toString()) && method === 'POST') ||
            (/\/patient\/existing-1$/.test(url.toString()) &&
              method === 'PATCH')
          )
        }),
      ).toBe(false)

      await waitFor(() =>
        expect(useToastStore.getState().toasts.length).toBeGreaterThan(0),
      )
      expect(useToastStore.getState().toasts[0].title).toMatch(/rattaché/i)
    },
  )

  it('le cas déjà suivi ici (consigne 4) : le dit clairement, sans laisser croire à une création', async () => {
    const fetchMock = buildFetchMock([
      {
        match: (url, method) =>
          url.includes('/patient/search') && method === 'GET',
        respond: () => ({
          ok: true,
          status: 200,
          json: async () => ({
            results: [
              {
                id: 'existing-2',
                firstName: 'Nadia',
                lastName: 'Roche',
                birthDate: null,
              },
            ],
            hasMore: false,
          }),
        }),
      },
      {
        match: (url, method) =>
          /\/patient\/existing-2\/service-file$/.test(url) && method === 'POST',
        respond: () => ({
          ok: true,
          status: 200,
          json: async () => ({
            patientId: 'existing-2',
            alreadyFollowedHere: true,
          }),
        }),
      },
    ])
    vi.stubGlobal('fetch', fetchMock)

    renderForm()
    await openPopupAndFillIdentity('Nadia', 'Roche')
    await userEvent.click(
      screen.getByRole('button', { name: /Rechercher un patient existant/i }),
    )

    const chooseButton = await screen.findByRole('button', { name: /Choisir/i })
    await userEvent.click(chooseButton)

    await waitFor(() =>
      expect(useToastStore.getState().toasts.length).toBeGreaterThan(0),
    )
    const toast = useToastStore.getState().toasts[0]
    expect(toast.title).toMatch(/déjà suivi/i)
    expect(toast.message).toMatch(/n'a pas été modifié|n a pas ete modifie/i)
  })

  // Tâche 13, tour de correction 1, point 4 : la troncature à vingt résultats ne doit pas être
  // muette — sinon un utilisateur qui ne voit pas l'identité qu'il cherche croit à tort qu'elle
  // n'existe pas et crée un doublon.
  it('affiche un message quand la recherche indique qu il y a plus de résultats (`hasMore`)', async () => {
    const fetchMock = buildFetchMock([
      {
        match: (url, method) =>
          url.includes('/patient/search') && method === 'GET',
        respond: () => ({
          ok: true,
          status: 200,
          json: async () => ({
            results: [
              {
                id: 'existing-3',
                firstName: 'Martin',
                lastName: 'Un',
                birthDate: null,
              },
            ],
            hasMore: true,
          }),
        }),
      },
    ])
    vi.stubGlobal('fetch', fetchMock)

    renderForm()
    await openPopupAndFillIdentity('Martin', 'X')
    await userEvent.click(
      screen.getByRole('button', { name: /Rechercher un patient existant/i }),
    )

    expect(await screen.findByText(/Martin Un/)).toBeInTheDocument()
    expect(screen.getByText(/plus de.*résultats/i)).toBeInTheDocument()
  })

  it('n affiche pas le message de troncature quand `hasMore` est faux', async () => {
    const fetchMock = buildFetchMock([
      {
        match: (url, method) =>
          url.includes('/patient/search') && method === 'GET',
        respond: () => ({
          ok: true,
          status: 200,
          json: async () => ({
            results: [
              {
                id: 'existing-4',
                firstName: 'Martin',
                lastName: 'Deux',
                birthDate: null,
              },
            ],
            hasMore: false,
          }),
        }),
      },
    ])
    vi.stubGlobal('fetch', fetchMock)

    renderForm()
    await openPopupAndFillIdentity('Martin', 'Y')
    await userEvent.click(
      screen.getByRole('button', { name: /Rechercher un patient existant/i }),
    )

    expect(await screen.findByText(/Martin Deux/)).toBeInTheDocument()
    expect(screen.queryByText(/plus de.*résultats/i)).not.toBeInTheDocument()
  })
})
