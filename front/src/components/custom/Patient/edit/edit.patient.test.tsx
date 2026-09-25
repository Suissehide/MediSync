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
import type { Patient } from '@/types/patient.ts'

import EditPatient from './edit.patient.tsx'

// `main.tsx` enregistre ce greffon au démarrage de l'application ; les champs `DatePicker` du
// sous-dossier (`entryDate`, `exitDate`) en dépendent via `AdapterDayjs`. Le harnais de test ne
// passe pas par `main.tsx` et doit donc le reproduire (même convention que `navbar.test.tsx`).
dayjs.extend(utc)

// Décision 2.3 de la spec (`docs/superpowers/specs/2026-09-24-multi-tenant-etape-3-dossier-patient-design.md`) :
// la fiche patient sépare visiblement l'identité partagée entre les services (Patient) du
// dossier du service courant (PatientServiceFile). Ces tests verrouillent les deux règles qui
// priment sur tout le reste (task-11-brief.md) : le formulaire du sous-dossier ne s'affiche ni
// ne se soumet si sa lecture a échoué, et il n'envoie jamais que les champs réellement modifiés.

const context = {
  establishmentId: 'e1',
  serviceId: 's1',
  establishmentRole: 'ADMIN' as const,
  serviceRole: 'COORDINATEUR' as const,
  soignantId: null,
}

const patientFixture: Patient = {
  id: 'p1',
  firstName: 'Jean',
  lastName: 'Dupont',
}

const serviceFileFixture = {
  id: 'psf1',
  patientId: 'p1',
  serviceId: 's1',
  establishmentId: 'e1',
  createdAt: '2026-01-01T00:00:00.000Z',
  notes: 'note existante',
  goal: 'objectif existant',
}

type Route = {
  match: (url: string, method: string) => boolean
  respond: (url: string, init?: RequestInit) => { ok: boolean; status: number; json: () => Promise<unknown> }
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

const renderEditPatient = (patient: Patient = patientFixture) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <LocalizationProvider dateAdapter={AdapterDayjs} adapterLocale="fr">
        <EditPatient patient={patient} />
      </LocalizationProvider>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  useAuthStore.setState({ context })
  useToastStore.setState({ toasts: [] })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('EditPatient — une lecture du sous-dossier en échec (refus d’accès)', () => {
  it("n'affiche pas les champs du sous-dossier, tout en gardant le bloc d'identité partagée", async () => {
    const fetchMock = buildFetchMock([
      {
        match: (url, method) => url.includes('/service-file') && method === 'GET',
        respond: () => ({ ok: false, status: 403, json: async () => ({}) }),
      },
    ])
    vi.stubGlobal('fetch', fetchMock)

    renderEditPatient()

    // Le refus d'accès (403) doit remonter comme une vraie erreur affichée — pas comme une
    // absence de sous-dossier (ce dernier cas, la 404, est verrouillé côté hook par
    // `usePatientServiceFile.test.tsx`).
    await waitFor(() => expect(useToastStore.getState().toasts.length).toBeGreaterThan(0))

    // Bloc « dossier de ce service » (details.patient.tsx) : absent.
    expect(screen.queryByLabelText('Soignant référent')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Notes')).not.toBeInTheDocument()
    // Bloc « parcours & inclusion » (sous-dossier) : absent.
    expect(screen.queryByLabelText('Diagnostic médical')).not.toBeInTheDocument()
    // Bloc « identité partagée » (identite.patient.tsx, Patient) : toujours présent, sa lecture
    // n'a pas échoué.
    expect(screen.getByLabelText("Distance d'habitation")).toBeInTheDocument()
  })

  it('ne soumet rien du côté du sous-dossier quand on enregistre malgré tout', async () => {
    const fetchMock = buildFetchMock([
      {
        match: (url, method) => url.includes('/service-file') && method === 'GET',
        respond: () => ({ ok: false, status: 403, json: async () => ({}) }),
      },
      {
        match: (url, method) => /\/patient\/p1$/.test(url) && method === 'PATCH',
        respond: () => ({ ok: true, status: 200, json: async () => patientFixture }),
      },
    ])
    vi.stubGlobal('fetch', fetchMock)

    renderEditPatient()

    await waitFor(() => expect(useToastStore.getState().toasts.length).toBeGreaterThan(0))

    // Seul un champ du patient (identité, pas du sous-dossier) est modifié.
    const firstName = await screen.findByLabelText('Prénom')
    await userEvent.clear(firstName)
    await userEvent.type(firstName, 'Jeanne')

    const saveButton = await screen.findByRole('button', { name: /Sauvegarder/i })
    await userEvent.click(saveButton)

    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([, init]) => (init as RequestInit | undefined)?.method === 'PATCH')).toBe(
        true,
      ),
    )

    // Une tentative d'enregistrement a bien eu lieu (le patient), mais rien n'est parti vers le
    // sous-dossier : sa lecture avait échoué.
    const patchCalls = fetchMock.mock.calls.filter(
      ([, init]) => (init as RequestInit | undefined)?.method === 'PATCH',
    )
    expect(patchCalls).toHaveLength(1)
    expect((patchCalls[0][0] as string).toString()).toMatch(/\/patient\/p1$/)
    // La lecture du sous-dossier a bien été tentée (GET, en échec par le 403 configuré
    // ci-dessus) : c'est le PATCH qui ne doit jamais partir.
    expect(patchCalls.some(([url]) => url.toString().includes('/service-file'))).toBe(false)
  })
})

describe('EditPatient — le sous-dossier envoie une charge partielle', () => {
  it("une modification d'un seul champ n'envoie qu'un champ", async () => {
    const fetchMock = buildFetchMock([
      {
        match: (url, method) => url.includes('/service-file') && method === 'GET',
        respond: () => ({ ok: true, status: 200, json: async () => serviceFileFixture }),
      },
      {
        match: (url, method) => url.includes('/service-file') && method === 'PATCH',
        respond: () => ({ ok: true, status: 200, json: async () => serviceFileFixture }),
      },
      {
        match: (url, method) => /\/patient\/p1$/.test(url) && method === 'PATCH',
        respond: () => ({ ok: true, status: 200, json: async () => patientFixture }),
      },
    ])
    vi.stubGlobal('fetch', fetchMock)

    renderEditPatient()

    const notes = await screen.findByLabelText('Notes')
    expect(notes).toHaveValue('note existante')

    await userEvent.clear(notes)
    await userEvent.type(notes, 'note modifiée')

    const saveButton = await screen.findByRole('button', { name: /Sauvegarder/i })
    await userEvent.click(saveButton)

    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(([url, init]) => url.toString().includes('/service-file') && (init as RequestInit)?.method === 'PATCH'),
      ).toBe(true),
    )

    const serviceFilePatch = fetchMock.mock.calls.find(
      ([url, init]) => url.toString().includes('/service-file') && (init as RequestInit)?.method === 'PATCH',
    )
    expect(serviceFilePatch).toBeDefined()
    const body = JSON.parse((serviceFilePatch?.[1] as RequestInit).body as string)
    expect(body).toEqual({ notes: 'note modifiée' })
  })
})

describe('EditPatient — deux écritures indépendantes, la vérité si l’une échoue', () => {
  it('dit que le patient a échoué sans laisser croire que le dossier de service a échoué aussi', async () => {
    const fetchMock = buildFetchMock([
      {
        match: (url, method) => url.includes('/service-file') && method === 'GET',
        respond: () => ({ ok: true, status: 200, json: async () => serviceFileFixture }),
      },
      {
        match: (url, method) => url.includes('/service-file') && method === 'PATCH',
        respond: () => ({ ok: true, status: 200, json: async () => serviceFileFixture }),
      },
      {
        match: (url, method) => /\/patient\/p1$/.test(url) && method === 'PATCH',
        respond: () => ({ ok: false, status: 500, json: async () => ({}) }),
      },
    ])
    vi.stubGlobal('fetch', fetchMock)

    renderEditPatient()

    const firstName = await screen.findByLabelText('Prénom')
    await userEvent.clear(firstName)
    await userEvent.type(firstName, 'Jeanne')

    const notes = await screen.findByLabelText('Notes')
    await userEvent.clear(notes)
    await userEvent.type(notes, 'note modifiée')

    const saveButton = await screen.findByRole('button', { name: /Sauvegarder/i })
    await userEvent.click(saveButton)

    await waitFor(() =>
      expect(
        useToastStore.getState().toasts.some((t) => typeof t.title === 'string' && t.title.includes('mise à jour du patient')),
      ).toBe(true),
    )

    const titles = useToastStore.getState().toasts.map((t) => t.title)
    expect(titles.some((title) => typeof title === 'string' && title.includes('Erreur lors de la mise à jour du patient'))).toBe(
      true,
    )
    // Le dossier de service, lui, a réussi — rien ne doit le faire passer pour un échec global.
    await waitFor(() =>
      expect(
        useToastStore.getState().toasts.some((t) => typeof t.title === 'string' && t.title.includes('Dossier de service modifié')),
      ).toBe(true),
    )
  })

  it('dit que le dossier de service a échoué sans laisser croire que le patient a échoué aussi', async () => {
    const fetchMock = buildFetchMock([
      {
        match: (url, method) => url.includes('/service-file') && method === 'GET',
        respond: () => ({ ok: true, status: 200, json: async () => serviceFileFixture }),
      },
      {
        match: (url, method) => url.includes('/service-file') && method === 'PATCH',
        respond: () => ({ ok: false, status: 500, json: async () => ({}) }),
      },
      {
        match: (url, method) => /\/patient\/p1$/.test(url) && method === 'PATCH',
        respond: () => ({ ok: true, status: 200, json: async () => patientFixture }),
      },
    ])
    vi.stubGlobal('fetch', fetchMock)

    renderEditPatient()

    const firstName = await screen.findByLabelText('Prénom')
    await userEvent.clear(firstName)
    await userEvent.type(firstName, 'Jeanne')

    const notes = await screen.findByLabelText('Notes')
    await userEvent.clear(notes)
    await userEvent.type(notes, 'note modifiée')

    const saveButton = await screen.findByRole('button', { name: /Sauvegarder/i })
    await userEvent.click(saveButton)

    await waitFor(() =>
      expect(
        useToastStore
          .getState()
          .toasts.some((t) => typeof t.title === 'string' && t.title.includes('Erreur lors de la mise à jour du dossier de service')),
      ).toBe(true),
    )

    await waitFor(() =>
      expect(
        useToastStore.getState().toasts.some((t) => typeof t.title === 'string' && t.title.includes('Patient modifié')),
      ).toBe(true),
    )
  })
})
