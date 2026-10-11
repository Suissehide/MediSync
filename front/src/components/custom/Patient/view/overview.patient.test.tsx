import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useAuthStore } from '@/store/useAuthStore.ts'
import type { Patient } from '@/types/patient.ts'
import OverviewPatient from './overview.patient.tsx'

dayjs.extend(utc)

// L'aperçu de la fiche patient, refait sur le handoff « fiche patient, aperçu général » : prochain
// rendez-vous mis en avant, avancement par parcours, rendez-vous groupés par jour et dépliables.
// Rien de tout cela n'avait de test — ni l'ancien écran.
const context = {
  establishmentId: 'e1',
  serviceId: 's1',
  establishmentRole: 'MEMBER' as const,
  serviceRole: 'COORDINATEUR' as const,
  soignantId: 'so1',
}

const patient = {
  id: 'p1',
  firstName: 'Sabrina',
  lastName: 'Bernadet',
} as Patient

const jour = (decalage: number) =>
  dayjs.utc().add(decalage, 'day').format('YYYY-MM-DD')

type FauxCreneau = {
  pathwayID?: string
  decalage: number
  heure: string
  fin: string
  status?: string
}

const creneau = ({ pathwayID, decalage, heure, fin, status }: FauxCreneau) => ({
  id: `slot-${decalage}-${heure}`,
  startDate: `${jour(decalage)}T${heure}:00.000Z`,
  endDate: `${jour(decalage)}T${fin}:00.000Z`,
  locked: false,
  pathway: pathwayID ? { id: pathwayID, startDate: '2026-01-01' } : undefined,
  slotTemplate: {
    isIndividual: false,
    thematic: 'Rééducation',
    color: '#20b2aa',
    location: { id: 'l1', name: 'Salle 1' },
    soignants: [{ id: 'so1', name: 'Kiné1' }],
  },
  appointments: [
    {
      id: `apt-${decalage}-${heure}`,
      startDate: `${jour(decalage)}T${heure}:00.000Z`,
      endDate: `${jour(decalage)}T${fin}:00.000Z`,
      appointmentPatients: [{ patient: { id: 'p1' }, status }],
    },
  ],
})

// Quatre journées à venir (une de plus que les trois montrées d'emblée) et une passée, notée
// présente.
const CRENEAUX = [
  creneau({ pathwayID: 'ri', decalage: 1, heure: '09:00', fin: '10:00' }),
  creneau({ pathwayID: 'ri', decalage: 3, heure: '10:00', fin: '11:00' }),
  creneau({ pathwayID: 'ri', decalage: 5, heure: '11:00', fin: '12:00' }),
  creneau({ pathwayID: 'ri', decalage: 8, heure: '14:00', fin: '15:00' }),
  creneau({
    pathwayID: 'ri',
    decalage: -2,
    heure: '08:00',
    fin: '09:00',
    status: 'yes',
  }),
]

const PARCOURS = [
  {
    pathwayID: 'ri',
    templateID: 't-ri',
    templateName: 'Réhabilitation initiale',
    templateColor: '#ff69b4',
    templateMainTag: 'RI',
    startDate: `${jour(-2)}T08:00:00.000Z`,
    priority: 1,
  },
  {
    pathwayID: 'psy',
    templateID: 't-psy',
    templateName: 'Consultation Psychologue',
    templateColor: '#9370db',
    templateMainTag: 'PSY',
    startDate: `${jour(20)}T14:00:00.000Z`,
    priority: 2,
  },
]

const json = (body: unknown) => ({
  ok: true,
  status: 200,
  json: () => Promise.resolve(body),
})

const monter = (
  creneaux: unknown[] = CRENEAUX,
  parcours: unknown[] = PARCOURS,
  onOpenPlanning?: () => void,
) => {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL) => {
      const url = input.toString()
      const { pathname } = new URL(url)
      if (pathname.endsWith('/slot')) {
        return { ...json(creneaux), url }
      }
      if (pathname.endsWith('/patient/p1/pathways')) {
        return { ...json(parcours), url }
      }
      // Montées par `AppointmentSheet`, fermé : sans rapport avec cet écran.
      if (pathname.endsWith('/thematic') || pathname.endsWith('/patient')) {
        return { ...json([]), url }
      }
      throw new Error(`Appel fetch non attendu dans ce test : ${url}`)
    }),
  )
  return rendre(
    <OverviewPatient patient={patient} onOpenPlanning={onOpenPlanning} />,
  )
}

// Routeur minimal, sans arbre de routes réel (même convention que `patientAccessLogButton.test.tsx`)
// : `AppointmentSheet`, monté fermé par l'aperçu, appelle `useNavigate`.
const rendre = (element: React.ReactElement) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  })
  const router = createRouter({
    routeTree: createRootRoute({ component: () => element }),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
}

// Les en-têtes de journée portent seuls l'écart relatif : les compter ne dépend d'aucune locale,
// là où « Jeudi 15 octobre » dépendrait de dayjs.
const enTetesDeJour = () =>
  screen.queryAllByText(/^· (demain|hier|dans \d+ jours|il y a \d+ jours)$/)

beforeEach(() => {
  useAuthStore.setState({ isAuthenticated: true, context })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('prochain rendez-vous', () => {
  it('met en avant le premier rendez-vous à venir, avec son parcours', async () => {
    monter()

    const bloc = await screen.findByText(/^Prochain rendez-vous ·/)
    expect(bloc).toHaveTextContent('Prochain rendez-vous · demain')
    expect(screen.getByText(/09:00 – 10:00 · Kiné1/)).toBeInTheDocument()
    // Le nom du parcours remplace l'étiquette colorée pleine de l'ancien écran.
    expect(screen.getByText('RI · Salle 1')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Ouvrir/ })).toBeInTheDocument()
  })

  it("est absent quand il n'y a aucun rendez-vous à venir", async () => {
    monter([
      creneau({
        pathwayID: 'ri',
        decalage: -2,
        heure: '08:00',
        fin: '09:00',
        status: 'yes',
      }),
    ])

    await screen.findByText('Aucun rendez-vous à venir')
    expect(screen.queryByText(/^Prochain rendez-vous ·/)).toBeNull()
  })
})

describe('rendez-vous groupés par jour', () => {
  it('montre trois journées, puis les déplie toutes sur « Voir plus »', async () => {
    const onOpenPlanning = vi.fn()
    monter(CRENEAUX, PARCOURS, onOpenPlanning)

    await waitFor(() => expect(enTetesDeJour()).toHaveLength(3))
    // Un rendez-vous qui n'a pas eu lieu annonce « À venir », jamais « non renseigné ».
    expect(screen.getAllByText('À venir')).toHaveLength(3)

    await userEvent.click(
      screen.getByRole('button', { name: 'Voir plus de rendez-vous' }),
    )

    expect(enTetesDeJour()).toHaveLength(4)
    // Tout déplié, le même bouton mène au planning complet.
    const planning = screen.getByRole('button', {
      name: 'Ouvrir le planning complet',
    })
    await userEvent.click(planning)
    expect(onOpenPlanning).toHaveBeenCalledTimes(1)
  })

  it('bascule sur les rendez-vous passés, avec leur présence notée', async () => {
    monter()

    await userEvent.click(
      await screen.findByRole('tab', { name: 'Passés · 1' }),
    )

    expect(screen.getByText('Vu')).toBeInTheDocument()
    expect(screen.getByText('08:00 – 09:00')).toBeInTheDocument()
    expect(enTetesDeJour()).toHaveLength(1)
    // La liste est bien celle de l'onglet choisi, et elle seule a changé : un rendez-vous à venir
    // n'y figure plus, alors que le bloc « prochain rendez-vous » reste affiché.
    expect(screen.queryByText('10:00 – 11:00')).toBeNull()
    expect(screen.getByText(/^Prochain rendez-vous ·/)).toBeInTheDocument()
  })

  it('distingue un onglet vide d’un onglet plein', async () => {
    monter([
      creneau({ pathwayID: 'ri', decalage: 1, heure: '09:00', fin: '10:00' }),
    ])

    await screen.findByRole('tab', { name: 'À venir · 1' })
    await userEvent.click(screen.getByRole('tab', { name: 'Passés · 0' }))

    expect(screen.getByText('Aucun rendez-vous passé')).toBeInTheDocument()
  })
})

describe('avancement des parcours', () => {
  it('rapporte les présences notées au total des rendez-vous du parcours', async () => {
    monter()

    expect(await screen.findByText('1 / 5 réalisés')).toBeInTheDocument()
  })

  it('masque la barre pour un parcours dont aucun rendez-vous n’est connu', async () => {
    monter()

    // `PSY` est bien listé, mais sans créneau : aucun « 0 / 0 réalisés » n'est affiché.
    expect(await screen.findByText('PSY')).toBeInTheDocument()
    expect(screen.queryByText(/0 \/ 0 réalisés/)).toBeNull()
  })

  it('annonce un état vide plutôt que rien quand le patient n’a aucun parcours', async () => {
    monter(CRENEAUX, [])

    expect(
      await screen.findByText(/Aucun parcours\. Inscrivez le patient/),
    ).toBeInTheDocument()
  })
})

describe('retrait d’un parcours', () => {
  it('demande confirmation avant de retirer, en annonçant les rendez-vous perdus', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const url = input.toString()
        const { pathname } = new URL(url)
        if (pathname.endsWith('/slot')) {
          return { ...json(CRENEAUX), url }
        }
        if (pathname.endsWith('/patient/p1/pathways')) {
          return { ...json(PARCOURS), url }
        }
        if (pathname.endsWith('/appointments-count')) {
          return { ...json({ count: 5 }), url }
        }
        if (pathname.endsWith('/thematic') || pathname.endsWith('/patient')) {
          return { ...json([]), url }
        }
        throw new Error(`Appel fetch non attendu dans ce test : ${url}`)
      }),
    )
    rendre(<OverviewPatient patient={patient} />)

    const retraits = await screen.findAllByRole('button', {
      name: 'Retirer du parcours',
    })
    await userEvent.click(retraits[0])

    expect(
      await screen.findByText(/5 rendez-vous seront supprimés/),
    ).toBeInTheDocument()
  })
})
