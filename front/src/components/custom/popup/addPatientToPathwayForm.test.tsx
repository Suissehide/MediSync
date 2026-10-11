import { LocalizationProvider } from '@mui/x-date-pickers'
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useAuthStore } from '@/store/useAuthStore.ts'
import { useToastStore } from '@/store/useToastStore.ts'
import type { PathwayEnrollment, Patient } from '@/types/patient.ts'
import { AddPatientToPathwayForm } from './addPatientToPathwayForm.tsx'

dayjs.extend(utc)

const context = {
  establishmentId: 'e1',
  serviceId: 's1',
  establishmentRole: 'ADMIN' as const,
  serviceRole: 'COORDINATEUR' as const,
  soignantId: null,
}

const template = (mainTag: string, extra = {}) => ({
  id: `t-${mainTag}`,
  name: mainTag,
  color: '#2563eb',
  mainTag,
  secondaryTags: [],
  motifRequired: false,
  firstAppointmentOnly: false,
  prerequisiteIDs: [],
  ...extra,
})

const TEMPLATES = [
  template('RI'),
  template('STRESS'),
  template('PSY', { motifRequired: true, firstAppointmentOnly: true }),
]

const PREVIEWS: Record<string, { startDate: string | null; reason?: string }> =
  {
    RI: { startDate: '2026-12-07T09:00:00.000Z' },
    STRESS: { startDate: null, reason: 'Aucune session disponible' },
    PSY: { startDate: '2026-10-14T09:00:00.000Z' },
  }

const json = (body: unknown) => ({
  ok: true,
  status: 200,
  json: () => Promise.resolve(body),
})

let enrolled: PathwayEnrollment[] | null = null

const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
  const url = input.toString()
  const path = new URL(url).pathname
  const body = init?.body ? JSON.parse(init.body as string) : undefined
  if (path.endsWith('/pathway-template')) {
    return { ...json(TEMPLATES), url }
  }
  if (path.endsWith('/thematic')) {
    return { ...json([]), url }
  }
  if (path.endsWith('/patient/enroll/preview')) {
    return {
      ...json(
        body.pathways.map((p: PathwayEnrollment) => ({
          tag: p.tag,
          ...PREVIEWS[p.tag],
        })),
      ),
      url,
    }
  }
  if (path.endsWith('/patient/p1/enroll')) {
    enrolled = body.pathways
    return {
      ...json({ patient: {}, enrollments: [], failedEnrollments: [] }),
      url,
    }
  }
  throw new Error(`Appel fetch non attendu dans ce test : ${url}`)
})

const patient = { id: 'p1', firstName: 'Sabrina', lastName: 'Bernadet' }

const renderForm = async () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  })
  render(
    <QueryClientProvider client={queryClient}>
      <LocalizationProvider dateAdapter={AdapterDayjs} adapterLocale="fr">
        <AddPatientToPathwayForm patient={patient as Patient} />
      </LocalizationProvider>
    </QueryClientProvider>,
  )
  await userEvent.click(
    screen.getByRole('button', { name: /Inscrire à un parcours/i }),
  )
  await screen.findByText('Bernadet Sabrina')
}

const addPathway = async (tag: string) => {
  await userEvent.click(
    screen.getByRole('button', { name: /Ajouter un parcours…/ }),
  )
  await userEvent.click(
    await screen.findByRole('button', { name: new RegExp(`^${tag}`) }),
  )
}

const rows = () =>
  within(screen.getByRole('list'))
    .getAllByRole('listitem')
    .map((li) => li.textContent ?? '')

beforeEach(() => {
  enrolled = null
  useAuthStore.setState({ context })
  useToastStore.setState({ toasts: [] })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('AddPatientToPathwayForm', () => {
  it('ajoute le parcours choisi sans autre clic, et le retire des options', async () => {
    await renderForm()
    await addPathway('RI')

    expect(rows()).toHaveLength(1)
    expect(rows()[0]).toContain('RI')
    await userEvent.click(
      screen.getByRole('button', { name: /Ajouter un parcours…/ }),
    )
    expect(
      screen.queryByRole('button', { name: /^RI/ }),
    ).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^STRESS/ })).toHaveTextContent(
      'Collectif',
    )
    expect(screen.getByRole('button', { name: /^PSY/ })).toHaveTextContent(
      'Individuel',
    )
  })

  it('affiche le départ ou le blocage de chaque parcours et n inscrit que les planifiables', async () => {
    await renderForm()
    await addPathway('RI')
    await addPathway('STRESS')

    expect(await screen.findByText('Départ le 07/12/2026')).toBeInTheDocument()
    expect(screen.getByText('Aucune date')).toBeInTheDocument()
    expect(screen.getByText('Aucune session disponible')).toBeInTheDocument()
    expect(
      screen.getByText('1 parcours planifiable · 1 sans date : il sera ignoré'),
    ).toBeInTheDocument()

    await userEvent.click(
      screen.getByRole('button', { name: 'Inscrire à 1 parcours' }),
    )
    await waitFor(() => expect(enrolled?.map((p) => p.tag)).toEqual(['RI']))
  })

  it('les flèches réordonnent la liste et l inscription suit le nouvel ordre', async () => {
    await renderForm()
    await addPathway('RI')
    await addPathway('PSY')
    await screen.findByText('Départ le 14/10/2026')

    const [, second] = screen.getAllByRole('button', { name: 'Monter' })
    await userEvent.click(second)
    expect(rows()[0]).toContain('PSY')
    expect(screen.getAllByRole('button', { name: 'Monter' })[0]).toBeDisabled()

    await userEvent.type(screen.getByLabelText(/Motif/), 'Anxiété')
    await userEvent.click(
      screen.getByRole('button', { name: 'Inscrire à 2 parcours' }),
    )
    await waitFor(() =>
      expect(enrolled?.map((p) => p.tag)).toEqual(['PSY', 'RI']),
    )
  })

  it('montre le motif obligatoire sans dépliage et bloque l inscription tant qu il est vide', async () => {
    await renderForm()
    await addPathway('PSY')
    await screen.findByText('Départ le 14/10/2026')

    const submit = screen.getByRole('button', { name: 'Inscrire à 1 parcours' })
    expect(screen.getByLabelText(/Motif/)).toBeVisible()
    expect(submit).toBeDisabled()

    await userEvent.type(screen.getByLabelText(/Motif/), 'Anxiété')
    expect(submit).toBeEnabled()
  })
})
