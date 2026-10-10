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
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ACTIVITY_DEFINITIONS } from '@/constants/activity.constant.ts'
import { useAuthStore } from '@/store/useAuthStore.ts'
import type { ActivityReport } from '@/types/activity.ts'
import type { AuthState, User } from '@/types/auth.ts'
import { Route as serviceLayoutRoute } from '../$serviceId.tsx'
import { Route as activiteRoute } from './activite.tsx'

dayjs.extend(utc)

// Trois états TOUJOURS distincts — chargement, erreur, données — plus le refus de l'écran à qui
// n'a pas `activity:read`. Harnais recopié d'`indicateurs-ars.test.tsx`.

const optionsDe = (route: AnyRoute) => route.options

const avecRole = (
  id: string,
  role: 'COORDINATEUR' | 'INTERVENANT' | 'LECTURE',
): User => ({
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
const lecture = avecRole('u3', 'LECTURE')

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
const activiteScreenRoute = createRoute({
  getParentRoute: () => serviceRoute,
  path: 'activite',
  beforeLoad: optionsDe(activiteRoute).beforeLoad,
  component: optionsDe(activiteRoute).component,
})
const routeTree = rootRoute.addChildren([
  authenticatedRoute.addChildren([
    serviceRoute.addChildren([dashboardRoute, activiteScreenRoute]),
  ]),
])

const vide = { absent: 0, pointed: 0, rate: null }

// Type concret (jamais nul), pour pouvoir l'etaler sans que `completion` redevienne optionnel.
const completionDefaut = {
  completed: 31,
  exited: 42,
  rate: 31 / 42,
  dropouts: 11,
  dropoutReasons: [{ reason: 'PERDU_DE_VUE', label: 'Perdu de vue', count: 5 }],
}

const rapport: ActivityReport = {
  from: '2026-01-01',
  to: '2026-12-31',
  patients: { active: 148, newlyIncluded: 57, exited: 42 },
  monthly: [
    '01',
    '02',
    '03',
    '04',
    '05',
    '06',
    '07',
    '08',
    '09',
    '10',
    '11',
    '12',
  ].map((m, i) => ({
    month: `2026-${m}`,
    newlyIncluded: m === '10' ? 9 : i,
    exited: m === '10' ? 4 : 1,
    active: m === '11' ? 999 : 100 + i,
  })),
  completion: completionDefaut,
  absences: {
    overall: { absent: 12, pointed: 100, rate: 0.12 },
    worst: { thematic: 'Coaching; PRM', weekday: 1 },
    weekdays: [1],
    byWeekday: Array.from({ length: 7 }, () => vide),
    byThematic: [
      {
        thematic: 'Coaching; PRM',
        total: { absent: 4, pointed: 10, rate: 0.4 },
        cells: [
          vide,
          { absent: 4, pointed: 10, rate: 0.4 },
          vide,
          vide,
          vide,
          vide,
          vide,
        ],
      },
    ],
    byPathway: [],
  },
  sessions: {
    individual: 312,
    collective: 96,
    educationalDiagnoses: 41,
    finalReviews: 28,
  },
  hoursBySoignant: [{ soignant: 'IDE', hours: 120.5 }],
}

const calme: ActivityReport = {
  ...rapport,
  patients: { active: 0, newlyIncluded: 0, exited: 0 },
  monthly: [],
  completion: {
    completed: 0,
    exited: 0,
    rate: null,
    dropouts: 0,
    dropoutReasons: [],
  },
  absences: {
    overall: { absent: 0, pointed: 0, rate: null },
    worst: null,
    weekdays: [],
    byWeekday: Array.from({ length: 7 }, () => vide),
    byThematic: [],
    byPathway: [],
  },
  sessions: {
    individual: 0,
    collective: 0,
    educationalDiagnoses: 0,
    finalReviews: 0,
  },
  hoursBySoignant: [],
}

const monter = (
  reponse: { ok: boolean; status: number; corps?: unknown },
  user: User = coordinateur,
) => {
  // Le mock est SÉLECTIF : `DashboardLayout` monte aussi la barre et son panneau de tâches, qui
  // appellent d'autres routes. Une réponse unique pour tout ferait échouer l'écran pour une raison
  // qui n'a rien à voir avec ce qu'on éprouve ici.
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL) => {
      const url = input.toString()
      if (url.includes('/pathway-template')) {
        return {
          ok: true,
          status: 200,
          url,
          json: async () => [{ id: 'pt1', name: 'Insuffisance cardiaque' }],
        }
      }
      if (url.includes('/activite')) {
        return {
          ok: reponse.ok,
          status: reponse.status,
          url,
          json: async () => reponse.corps,
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
      initialEntries: ['/e/e1/s/s1/activite'],
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
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('ecran d activite', () => {
  it('repond aux trois questions du critere de fin', async () => {
    monter({ ok: true, status: 200, corps: rapport }, lecture)
    expect(await screen.findByText('148')).toBeInTheDocument()
    expect(screen.getByText(/31 sur 42 sortis/)).toBeInTheDocument()
    const absences = screen
      .getByText('Où sont les absences')
      .closest('section') as HTMLElement
    expect(within(absences).getByText('12 %')).toBeInTheDocument()
    expect(screen.getByText(/Coaching; PRM, le mardi/)).toBeInTheDocument()
  })

  it('annonce une erreur plutot que des chiffres muets', async () => {
    monter({ ok: false, status: 500 })
    expect(await screen.findByRole('alert')).toHaveTextContent(
      /Impossible de charger l'activité/,
    )
    expect(
      screen.getByRole('button', { name: 'Exporter en CSV' }),
    ).toBeDisabled()
    expect(
      screen.getByRole('button', { name: 'Réessayer' }),
    ).toBeInTheDocument()
  })

  it('invite a changer de periode quand rien ne s est passe', async () => {
    monter({ ok: true, status: 200, corps: calme })
    expect(
      await screen.findByText(
        'Aucune activité sur cette période. Choisissez une autre année ou élargissez la plage.',
      ),
    ).toBeInTheDocument()
  })

  it('invite a changer de parcours quand le filtre explique l absence de resultat', async () => {
    monter({ ok: true, status: 200, corps: calme })
    await screen.findByText(/Aucune activité sur cette période\./)
    await userEvent.click(screen.getByLabelText('Parcours'))
    await userEvent.click(
      await screen.findByRole('option', { name: 'Insuffisance cardiaque' }),
    )
    expect(
      await screen.findByText(
        'Aucune activité sur cette période pour ce parcours. Choisissez une autre période ou « Tous les parcours ».',
      ),
    ).toBeInTheDocument()
  })

  // Review Focus 5, côté écran.
  it('renvoie un intervenant au tableau de bord', async () => {
    monter({ ok: true, status: 200, corps: rapport }, intervenant)
    expect(await screen.findByText('Tableau de bord')).toBeInTheDocument()
  })

  it('rappelle que les chiffres sont agreges', async () => {
    monter({ ok: true, status: 200, corps: rapport })
    expect(
      await screen.findByText(
        'Chiffres agrégés uniquement, aucune donnée nominative.',
      ),
    ).toBeInTheDocument()
  })

  it('decompose les sortis en termines, abandons et autres sortis', async () => {
    monter({
      ok: true,
      status: 200,
      corps: {
        ...rapport,
        completion: { ...completionDefaut, completed: 21, rate: 21 / 42 },
      },
    })
    const carte = (await screen.findByText('Combien ont terminé')).closest(
      'section',
    ) as HTMLElement
    expect(within(carte).getByText('21 terminés')).toBeInTheDocument()
    expect(within(carte).getByText('11 abandons')).toBeInTheDocument()
    expect(within(carte).getByText('10 autres sortis')).toBeInTheDocument()
  })

  // Decision 4 (spec §2.4) : sans reglage de motif d'arret, pas de completion.
  it('masque la completion et les motifs sans reglage', async () => {
    monter({ ok: true, status: 200, corps: { ...rapport, completion: null } })
    await screen.findByText('148')
    expect(screen.queryByText('Combien ont terminé')).not.toBeInTheDocument()
    expect(screen.queryByText("Motifs d'arrêt")).not.toBeInTheDocument()
  })

  it('accorde les trois bascules de sortie au singulier', async () => {
    monter({
      ok: true,
      status: 200,
      corps: {
        ...rapport,
        completion: {
          ...completionDefaut,
          completed: 1,
          dropouts: 1,
          exited: 3,
        },
      },
    })
    const carte = (await screen.findByText('Combien ont terminé')).closest(
      'section',
    ) as HTMLElement
    expect(within(carte).getByText('1 terminé')).toBeInTheDocument()
    expect(within(carte).getByText('1 abandon')).toBeInTheDocument()
    expect(within(carte).getByText('1 autre sorti')).toBeInTheDocument()
  })

  it('ne fait fuiter aucune donnee nominative, y compris dans les attributs title', async () => {
    const NOM_PATIENT_1 = 'Isabelle Rocher'
    const NOM_PATIENT_2 = 'Thierry Lefebvre'
    const utilisateur: User = {
      ...coordinateur,
      firstName: 'Isabelle',
      lastName: 'Rocher',
    }
    monter(
      {
        ok: true,
        status: 200,
        corps: {
          ...rapport,
          absences: {
            ...rapport.absences,
            byPathway: [
              {
                pathway: 'Insuffisance cardiaque',
                cell: { absent: 2, pointed: 20, rate: 0.1 },
              },
            ],
          },
        },
      },
      utilisateur,
    )
    await screen.findByText('148')
    const page = screen.getByRole('main')
    for (const el of page.querySelectorAll('[title],[aria-label]')) {
      expect(el.getAttribute('title') ?? '').not.toContain(NOM_PATIENT_1)
      expect(el.getAttribute('title') ?? '').not.toContain(NOM_PATIENT_2)
      expect(el.getAttribute('aria-label') ?? '').not.toContain(NOM_PATIENT_1)
      expect(el.getAttribute('aria-label') ?? '').not.toContain(NOM_PATIENT_2)
    }
    expect(page.textContent).not.toContain(NOM_PATIENT_1)
    expect(page.textContent).not.toContain(NOM_PATIENT_2)
  })

  it('ne compte jamais d autres sortis negatifs', async () => {
    monter({
      ok: true,
      status: 200,
      corps: {
        ...rapport,
        completion: { ...completionDefaut, completed: 35, dropouts: 11 },
      },
    })
    const carte = (await screen.findByText('Combien ont terminé')).closest(
      'section',
    ) as HTMLElement
    expect(within(carte).getByText('0 autres sortis')).toBeInTheDocument()
  })

  it('affiche les definitions a l identique sur demande', async () => {
    monter({ ok: true, status: 200, corps: rapport })
    const fileActive = ACTIVITY_DEFINITIONS.find(
      (d) => d.label === 'File active',
    )?.definition as string
    const bascule = await screen.findByRole('button', { name: 'Définitions' })
    expect(bascule).toHaveAttribute('aria-pressed', 'false')
    expect(screen.queryByText(fileActive)).not.toBeInTheDocument()
    await userEvent.click(bascule)
    expect(bascule).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText(fileActive)).toBeInTheDocument()
  })

  it('laisse vides les mois a venir', async () => {
    vi.setSystemTime(new Date('2026-10-10'))
    monter({ ok: true, status: 200, corps: rapport })
    expect(
      await screen.findByTitle('Oct : 9 inclus, 4 sortis'),
    ).toBeInTheDocument()
    expect(screen.getByText('109')).toBeInTheDocument()
    expect(screen.getByText('Nov')).toBeInTheDocument()
    expect(screen.queryByTitle(/^Nov/)).not.toBeInTheDocument()
    expect(screen.queryByText('999')).not.toBeInTheDocument()
  })

  it('rapporte les bilans a leur base', async () => {
    monter({
      ok: true,
      status: 200,
      corps: {
        ...rapport,
        patients: { ...rapport.patients, newlyIncluded: 567 },
        sessions: { ...rapport.sessions, educationalDiagnoses: 92 },
      },
    })
    expect(
      await screen.findByText(
        (_, el) =>
          el?.tagName === 'SPAN' && el.textContent === '92 / 567 · 16\u00a0%',
      ),
    ).toBeInTheDocument()
  })

  it('relance la requete pour le parcours choisi', async () => {
    monter({ ok: true, status: 200, corps: rapport })
    await screen.findByText('148')
    await userEvent.click(screen.getByLabelText('Parcours'))
    await userEvent.click(
      await screen.findByRole('option', { name: 'Insuffisance cardiaque' }),
    )
    await vi.waitFor(() =>
      expect(
        vi
          .mocked(fetch)
          .mock.calls.some(([u]) =>
            u.toString().includes('pathwayTemplateId=pt1'),
          ),
      ).toBe(true),
    )
  })

  describe('carte des absences, motifs, seances', () => {
    const c = (absent: number, pointed: number) => ({
      absent,
      pointed,
      rate: pointed < 5 ? null : absent / pointed,
    })
    const ligne = (thematic: string, lundi: ReturnType<typeof c>) => ({
      thematic,
      total: lundi,
      cells: [lundi, vide, vide, vide, vide, vide, vide],
    })
    const completionCarte = {
      ...completionDefaut,
      dropoutReasons: [
        'PERDU_DE_VUE',
        'REFUS',
        'NS',
        'TRANSPORT',
        'DECES',
        'DEMENAGEMENT',
        'INDISPONIBILITE',
        'SOUHAIT_ARRET',
      ].map((reason, i) => ({ reason, label: reason, count: 20 - i })),
    }
    const carte: ActivityReport = {
      ...rapport,
      completion: completionCarte,
      absences: {
        ...rapport.absences,
        weekdays: [0],
        overall: { absent: 21, pointed: 70, rate: 0.3 },
        byWeekday: [c(7, 35), vide, vide, vide, vide, vide, vide],
        byThematic: [
          ligne('Zeta', c(3, 10)),
          ligne('Alpha', c(1, 10)),
          ligne('Mid', c(2, 10)),
          {
            thematic: 'Bas volume jour',
            total: c(5, 20),
            cells: [c(1, 3), c(4, 17), vide, vide, vide, vide, vide],
          },
          ligne('Rare', c(1, 3)),
        ],
      },
    }
    const tableau = async () =>
      within(
        (await screen.findByText('Carte des absences')).closest(
          'section',
        ) as HTMLElement,
      ).getByRole('table')
    const noms = (t: HTMLElement) =>
      within(t)
        .getAllByRole('rowheader')
        .map((th) => th.textContent)

    it('trie par taux total decroissant puis de A a Z', async () => {
      monter({ ok: true, status: 200, corps: carte })
      const t = await tableau()
      expect(noms(t)).toEqual([
        'Zeta',
        'Bas volume jour',
        'Mid',
        'Alpha',
        'Toutes thématiques',
      ])
      await userEvent.click(screen.getByRole('radio', { name: 'A → Z' }))
      expect(noms(t)).toEqual([
        'Alpha',
        'Bas volume jour',
        'Mid',
        'Zeta',
        'Toutes thématiques',
      ])
    })

    it('garde 220 px a la colonne des thematiques sur sept jours', async () => {
      monter({
        ok: true,
        status: 200,
        corps: {
          ...carte,
          absences: { ...carte.absences, weekdays: [0, 1, 2, 3, 4, 5, 6] },
        },
      })
      const t = await tableau()
      expect(t.style.minWidth).toBe(`${220 + 8 * 96}px`)
    })

    it('accorde abandon au singulier', async () => {
      monter({
        ok: true,
        status: 200,
        corps: {
          ...carte,
          completion: { ...completionCarte, dropouts: 1 },
        },
      })
      const motifs = (await screen.findByText("Motifs d'arrêt")).closest(
        'section',
      ) as HTMLElement
      expect(within(motifs).getByText('1 abandon')).toBeInTheDocument()
    })

    it('replie les thematiques a faible volume', async () => {
      monter({ ok: true, status: 200, corps: carte })
      const t = await tableau()
      expect(noms(t)).not.toContain('Rare')
      expect(within(t).getByText('3 rdv')).toBeInTheDocument()
      const replie = within(t).getByRole('button', {
        name: /Autres thématiques · faible volume \(1\)/,
      })
      expect(replie).toHaveAttribute('aria-expanded', 'false')
      await userEvent.click(replie)
      expect(replie).toHaveAttribute('aria-expanded', 'true')
      expect(noms(t)).toContain('Rare')
    })

    it('totalise toutes thematiques par jour', async () => {
      monter({ ok: true, status: 200, corps: carte })
      const t = await tableau()
      const total = within(t)
        .getByRole('rowheader', { name: 'Toutes thématiques' })
        .closest('tr') as HTMLElement
      const cases = within(total).getAllByRole('cell')
      expect(cases.map((td) => td.textContent)).toEqual(['20 %', '30 %'])
    })

    it('montre six motifs puis tous', async () => {
      monter({ ok: true, status: 200, corps: carte })
      const motifs = (await screen.findByText("Motifs d'arrêt")).closest(
        'section',
      ) as HTMLElement
      expect(within(motifs).getByText('11 abandons')).toBeInTheDocument()
      expect(within(motifs).getAllByRole('listitem')).toHaveLength(6)
      await userEvent.click(
        within(motifs).getByRole('button', { name: 'Voir les 8 motifs' }),
      )
      expect(within(motifs).getAllByRole('listitem')).toHaveLength(8)
      await userEvent.click(
        within(motifs).getByRole('button', { name: 'Afficher moins' }),
      )
      expect(within(motifs).getAllByRole('listitem')).toHaveLength(6)
    })

    it('repartit les seances et les resume en tuiles', async () => {
      monter({ ok: true, status: 200, corps: carte })
      const seances = (
        await screen.findByText('Séances et temps soignant')
      ).closest('section') as HTMLElement
      expect(
        within(seances).getByText('Individuelles 76 %'),
      ).toBeInTheDocument()
      expect(within(seances).getByText('Collectives 24 %')).toBeInTheDocument()
      for (const [n, libelle] of [
        ['312', 'séances individuelles'],
        ['96', 'séances collectives'],
        ['41', 'diagnostics éducatifs'],
        ['28', 'bilans de fin'],
      ]) {
        const tuile = within(seances).getByText(libelle).parentElement
        expect(tuile).toHaveTextContent(n)
      }
    })

    it('affiche les definitions des seances et des heures', async () => {
      monter({ ok: true, status: 200, corps: carte })
      await userEvent.click(
        await screen.findByRole('button', { name: 'Définitions' }),
      )
      for (const libelle of [
        'Séances individuelles',
        'Séances collectives',
        'Diagnostics éducatifs réalisés',
        'Bilans de fin',
        'Heures soignant',
      ]) {
        const texte = ACTIVITY_DEFINITIONS.find((d) => d.label === libelle)
          ?.definition as string
        expect(screen.getByText(texte)).toBeInTheDocument()
      }
    })

    it('rappelle la regle des taux en pied de page', async () => {
      monter({ ok: true, status: 200, corps: carte })
      expect(
        await screen.findByText(
          "Moins de 5 rendez-vous pointés : pas de taux. Mêmes définitions à l'écran et dans l'export CSV.",
        ),
      ).toBeInTheDocument()
    })
  })
})
