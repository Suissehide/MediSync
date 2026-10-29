import { LocalizationProvider } from '@mui/x-date-pickers'
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { InboxApi } from '@/api/inbox.api.ts'
import { useAuthStore } from '@/store/useAuthStore.ts'
import type { User } from '@/types/auth.ts'
import type { Notification, Task } from '@/types/task.ts'
import { Inbox } from './inbox.tsx'

// `main.tsx` enregistre ce greffon au demarrage ; le DatePicker d'echeance en depend (dayjs.utc).
dayjs.extend(utc)

vi.mock('@/api/inbox.api.ts', () => ({
  InboxApi: {
    tasks: vi.fn(),
    notifications: vi.fn(),
    members: vi.fn(),
    soignants: vi.fn(),
    patients: vi.fn(),
    markRead: vi.fn(),
    markAllRead: vi.fn(),
    createTask: vi.fn(),
    setTaskDone: vi.fn(),
  },
}))

// Le panneau Taches lit l'echelle courante, inutile hors RouterProvider dans ces scenarios.
vi.mock('@/navigation/navigation.ts', () => ({ useCurrentScale: () => null }))

const notif = (
  id: string,
  readAt: string | null,
  text = 'Appeler le labo',
): Notification => ({
  id,
  type: 'MENTION',
  payload: { taskId: 't1', authorId: 'u2', text },
  readAt,
  createdAt: new Date().toISOString(),
})
const task = (id: string, assigneeIds: string[]): Task => ({
  id,
  text: `Tache ${id}`,
  authorId: 'u2',
  assigneeIds,
  soignantIds: [],
  patient: null,
  dueDate: null,
  doneAt: null,
  createdAt: new Date().toISOString(),
})

const user: User = {
  id: 'u1',
  email: 'a@b.fr',
  firstName: 'Léo',
  lastName: 'C',
  isSuperAdmin: false,
  establishments: [
    {
      id: 'e1',
      name: 'CHU',
      role: 'MEMBER',
      services: [
        { id: 's1', name: 'Cardio', role: 'INTERVENANT', affecte: true },
        { id: 's2', name: 'Diabeto', role: 'LECTURE', affecte: true },
      ],
    },
  ],
}

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider
    client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
  >
    {children}
  </QueryClientProvider>
)

describe('Inbox', () => {
  beforeEach(() => {
    useAuthStore.setState({ user })
    vi.mocked(InboxApi.tasks).mockReset().mockResolvedValue([])
    vi.mocked(InboxApi.notifications).mockReset().mockResolvedValue([])
    vi.mocked(InboxApi.markRead).mockReset().mockResolvedValue(undefined)
    vi.mocked(InboxApi.markAllRead).mockReset().mockResolvedValue(undefined)
    vi.mocked(InboxApi.soignants).mockReset().mockResolvedValue([])
    vi.mocked(InboxApi.members)
      .mockReset()
      .mockResolvedValue([
        {
          id: 'm1',
          role: 'INTERVENANT',
          soignantId: null,
          user: {
            id: 'u1',
            email: 'a@b.fr',
            firstName: 'Léo',
            lastName: 'C',
            deactivatedAt: null,
            invitationStatus: null,
            invitationResendableAt: null,
          },
        },
        {
          id: 'm2',
          role: 'INTERVENANT',
          soignantId: null,
          user: {
            id: 'u2',
            email: 'c@t.fr',
            firstName: 'Claire',
            lastName: 'Leroy',
            deactivatedAt: null,
            invitationStatus: null,
            invitationResendableAt: null,
          },
        },
      ])
  })

  it('pastilles : non lues en rouge, taches ouvertes ou je suis tague en bleu, rien a 0', async () => {
    vi.mocked(InboxApi.notifications).mockImplementation(async (s) =>
      s.serviceId === 's1'
        ? [notif('n1', null), notif('n2', '2026-10-19T09:00:00Z')]
        : [],
    )
    vi.mocked(InboxApi.tasks).mockResolvedValue([
      task('t1', ['u1']),
      task('t2', ['u2']),
      { ...task('t3', ['u1']), doneAt: '2026-10-19T09:00:00Z' },
    ])
    render(<Inbox />, { wrapper })
    expect(await screen.findByTestId('badge-notifs')).toHaveTextContent('1')
    expect(await screen.findByTestId('badge-tasks')).toHaveTextContent('1')
  })

  it('aucune pastille a 0', async () => {
    vi.mocked(InboxApi.notifications).mockResolvedValue([])
    vi.mocked(InboxApi.tasks).mockResolvedValue([])
    render(<Inbox />, { wrapper })
    await screen.findByRole('button', { name: 'Notifications' })
    expect(screen.queryByTestId('badge-notifs')).toBeNull()
    expect(screen.queryByTestId('badge-tasks')).toBeNull()
  })

  it('un seul panneau ouvert a la fois', async () => {
    const u = userEvent.setup()
    render(<Inbox />, { wrapper })
    await u.click(await screen.findByRole('button', { name: 'Notifications' }))
    expect(
      await screen.findByRole('heading', { name: /Notifications/ }),
    ).toBeInTheDocument()
    await u.click(screen.getByRole('button', { name: 'Tâches' }))
    expect(
      await screen.findByRole('heading', { name: /Tâches/ }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /Notifications/ })).toBeNull()
  })

  it('pas d icone Taches pour un compte qui n a que LECTURE', async () => {
    useAuthStore.setState({
      user: {
        ...user,
        establishments: [
          {
            ...user.establishments[0],
            services: [
              { id: 's2', name: 'Diabeto', role: 'LECTURE', affecte: true },
            ],
          },
        ],
      },
    })
    render(<Inbox />, { wrapper })
    await screen.findByRole('button', { name: 'Notifications' })
    expect(screen.queryByRole('button', { name: 'Tâches' })).toBeNull()
    expect(InboxApi.tasks).not.toHaveBeenCalled()
  })

  it('Tout lu appelle tout-lu sur chaque service qui a des non lues', async () => {
    const u = userEvent.setup()
    vi.mocked(InboxApi.notifications).mockImplementation(async (s) =>
      s.serviceId === 's1' ? [notif('n1', null)] : [],
    )
    render(<Inbox />, { wrapper })
    await u.click(await screen.findByRole('button', { name: 'Notifications' }))
    await u.click(await screen.findByRole('button', { name: /Tout lu/ }))
    expect(
      vi.mocked(InboxApi.markAllRead).mock.calls.map(([s]) => s.serviceId),
    ).toEqual(['s1'])
  })

  it('filtre Non lues / Toutes et par service', async () => {
    const u = userEvent.setup()
    vi.mocked(InboxApi.notifications).mockImplementation(async (s) =>
      s.serviceId === 's1'
        ? [
            notif('n1', null, 'Appeler'),
            notif('n2', '2026-10-19T09:00:00Z', 'Deja lu'),
          ]
        : [],
    )
    render(<Inbox />, { wrapper })
    await u.click(await screen.findByRole('button', { name: 'Notifications' }))
    expect(await screen.findByText(/Appeler/)).toBeInTheDocument()
    expect(screen.queryByText(/Deja lu/)).toBeNull()
    await u.click(screen.getByRole('button', { name: 'Toutes' }))
    expect(await screen.findByText(/Deja lu/)).toBeInTheDocument()
  })

  it('mention sur un service retombe en LECTURE : marque lue, sans ouvrir les taches ni lien', async () => {
    const u = userEvent.setup()
    vi.mocked(InboxApi.notifications).mockImplementation(async (s) =>
      s.serviceId === 's2' ? [notif('n1', null)] : [],
    )
    render(<Inbox />, { wrapper })
    await u.click(await screen.findByRole('button', { name: 'Notifications' }))
    await screen.findByText(/Appeler le labo/)
    expect(screen.queryByText('Ouvrir la tâche')).toBeNull()
    await u.click(screen.getByText(/Appeler le labo/))
    expect(InboxApi.markRead).toHaveBeenCalled()
    expect(screen.queryByRole('heading', { name: /Tâches/ })).toBeNull()
    expect(
      screen.getByRole('heading', { name: /Notifications/ }),
    ).toBeInTheDocument()
  })

  it('Echap ferme la liste de mention sans fermer le panneau Taches', async () => {
    const u = userEvent.setup()
    render(<Inbox />, { wrapper })
    await u.click(await screen.findByRole('button', { name: 'Tâches' }))
    const input = await screen.findByPlaceholderText(
      'Nouvelle tâche… tapez @ pour mentionner',
    )
    await u.type(input, 'x @')
    await screen.findByRole('option', { name: /Léo/ })
    await u.keyboard('{Escape}')
    expect(screen.queryByRole('listbox')).toBeNull()
    expect(screen.getByRole('heading', { name: /Tâches/ })).toBeInTheDocument()
  })

  it('la pastille bleue compte une tache taguee sur mon metier', async () => {
    useAuthStore.setState({
      user: {
        ...user,
        establishments: [
          {
            ...user.establishments[0],
            services: [
              {
                id: 's1',
                name: 'Cardio',
                role: 'INTERVENANT',
                affecte: true,
                soignantId: 'so1',
              },
              { id: 's2', name: 'Diabeto', role: 'LECTURE', affecte: true },
            ],
          },
        ],
      },
    })
    vi.mocked(InboxApi.tasks).mockImplementation(async (s) =>
      s.serviceId === 's1'
        ? [{ ...task('t1', []), authorId: 'u2', soignantIds: ['so1'] }]
        : [],
    )
    render(<Inbox />, { wrapper })
    expect(await screen.findByTestId('badge-tasks')).toHaveTextContent('1')
  })

  it('Echap ferme la ligne Échéance sans fermer le panneau Taches', async () => {
    const u = userEvent.setup()
    render(
      <LocalizationProvider dateAdapter={AdapterDayjs} adapterLocale="fr">
        <Inbox />
      </LocalizationProvider>,
      { wrapper },
    )
    await u.click(await screen.findByRole('button', { name: 'Tâches' }))
    await u.click(await screen.findByRole('button', { name: 'Échéance' }))
    expect(await screen.findByRole('grid')).toBeInTheDocument()
    await u.keyboard('{Escape}')
    expect(screen.queryByRole('grid')).toBeNull()
    expect(screen.getByRole('heading', { name: /Tâches/ })).toBeInTheDocument()
  })
})
