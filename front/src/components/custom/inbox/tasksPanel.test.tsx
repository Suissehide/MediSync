import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { InboxApi } from '@/api/inbox.api.ts'
import type { InboxService } from '@/queries/useInbox.ts'
import { useAuthStore } from '@/store/useAuthStore.ts'
import type { User } from '@/types/auth.ts'
import type { Task } from '@/types/task.ts'
import { TasksPanel } from './tasksPanel.tsx'

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

// useMatchRoute leve hors d'un RouterProvider ; un seul service ici, le repli services[0] suffit.
vi.mock('@/navigation/navigation.ts', () => ({ useCurrentScale: () => null }))

const s1: InboxService = {
  establishmentId: 'e1',
  serviceId: 's1',
  name: 'Cardio',
  canTasks: true,
  soignantId: null,
}

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

describe('TasksPanel', () => {
  beforeEach(() => {
    useAuthStore.setState({ user })
    vi.mocked(InboxApi.createTask).mockReset()
    vi.mocked(InboxApi.setTaskDone).mockReset()
    vi.mocked(InboxApi.patients).mockReset().mockResolvedValue([])
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
            invitationStatus: 'ACCEPTED',
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
            invitationStatus: 'ACCEPTED',
            invitationResendableAt: null,
          },
        },
      ])
  })

  it('@cl propose Claire Leroy ; la choisir cree une etiquette et cree la tache avec elle', async () => {
    const u = userEvent.setup()
    vi.mocked(InboxApi.createTask).mockResolvedValue(task('new', ['u2']))
    render(
      <TasksPanel
        services={[s1]}
        tasks={[]}
        focus={null}
        onFocusDone={() => undefined}
      />,
      { wrapper },
    )
    const input = screen.getByPlaceholderText(
      'Nouvelle tâche… tapez @ pour mentionner',
    )
    await u.type(input, 'Vérifier les ordonnances @cl')
    await u.click(await screen.findByRole('option', { name: /Claire Leroy/ }))
    expect(screen.getByText('@Claire Leroy')).toBeInTheDocument()
    expect(input).toHaveValue('Vérifier les ordonnances ')
    await u.keyboard('{Enter}')
    expect(InboxApi.createTask).toHaveBeenCalledWith(s1, {
      text: 'Vérifier les ordonnances',
      assigneeIds: ['u2'],
      soignantIds: [],
    })
  })

  it('mention au clavier : fleches puis Entree', async () => {
    const u = userEvent.setup()
    render(
      <TasksPanel
        services={[s1]}
        tasks={[]}
        focus={null}
        onFocusDone={() => undefined}
      />,
      { wrapper },
    )
    const input = screen.getByPlaceholderText(
      'Nouvelle tâche… tapez @ pour mentionner',
    )
    await u.type(input, 'x @')
    await screen.findByRole('option', { name: /Léo/ })
    await u.keyboard('{ArrowDown}{Enter}')
    expect(screen.getByText('@Claire Leroy')).toBeInTheDocument()
    expect(InboxApi.createTask).not.toHaveBeenCalled()
  })

  it('Ajouter est grise quand le texte est vide', () => {
    render(
      <TasksPanel
        services={[s1]}
        tasks={[]}
        focus={null}
        onFocusDone={() => undefined}
      />,
      { wrapper },
    )
    expect(screen.getByRole('button', { name: 'Ajouter' })).toBeDisabled()
  })

  it('cocher envoie done, et la tache passe dans Terminees', async () => {
    const u = userEvent.setup()
    const t = { ...task('t1', ['u1']), service: s1 }
    const done = { ...t, doneAt: '2026-10-19T10:00:00Z' }
    vi.mocked(InboxApi.setTaskDone).mockResolvedValue(done)
    const { rerender } = render(
      <TasksPanel
        services={[s1]}
        tasks={[t]}
        focus={null}
        onFocusDone={() => undefined}
      />,
      { wrapper },
    )
    await u.click(screen.getByRole('checkbox', { name: /Tache t1/ }))
    expect(InboxApi.setTaskDone).toHaveBeenCalledWith(s1, 't1', true)
    rerender(
      <TasksPanel
        services={[s1]}
        tasks={[done]}
        focus={null}
        onFocusDone={() => undefined}
      />,
    )
    expect(
      screen.getByRole('button', { name: /Terminées · 1/ }),
    ).toBeInTheDocument()
    expect(screen.queryByText('Tache t1')).toBeNull()
    await u.click(screen.getByRole('button', { name: /Terminées · 1/ }))
    expect(screen.getByText('Tache t1')).toHaveClass('line-through')
  })

  it('tache migree sans auteur : pas de "Par ..." devant le quand', () => {
    const sansAuteur = { ...task('t1', ['u1']), authorId: null, service: s1 }
    render(
      <TasksPanel
        services={[s1]}
        tasks={[sansAuteur]}
        focus={null}
        onFocusDone={() => undefined}
      />,
      { wrapper },
    )
    const row = screen
      .getByText('Tache t1')
      .closest('[data-task]') as HTMLElement
    expect(row.textContent).not.toContain('Par')
    expect(row.textContent).toContain("l'instant")
  })

  it('Pour moi masque les taches ou je ne suis ni tague ni auteur', async () => {
    const u = userEvent.setup()
    const autre = { ...task('t2', ['u2']), authorId: 'u2', service: s1 }
    render(
      <TasksPanel
        services={[s1]}
        tasks={[autre]}
        focus={null}
        onFocusDone={() => undefined}
      />,
      { wrapper },
    )
    expect(screen.getByText('Aucune tâche en cours')).toBeInTheDocument()
    await u.click(screen.getByRole('button', { name: 'Toutes' }))
    expect(screen.getByText('Tache t2')).toBeInTheDocument()
  })

  it('une mention cliquee filtre sur le service et surligne la tache, meme terminee', () => {
    const t = {
      ...task('t1', ['u1']),
      doneAt: '2026-10-19T10:00:00Z',
      service: s1,
    }
    render(
      <TasksPanel
        services={[s1]}
        tasks={[t]}
        focus={{ serviceId: 's1', taskId: 't1' }}
        onFocusDone={() => undefined}
      />,
      { wrapper },
    )
    expect(screen.getByText('Tache t1').closest('[data-task]')).toHaveAttribute(
      'data-highlighted',
      'true',
    )
  })

  it('une mention cliquee sur une tache ouverte ne deplie pas Terminees', () => {
    const ouverte = { ...task('t1', ['u1']), service: s1 }
    const terminee = {
      ...task('t2', ['u1']),
      doneAt: '2026-10-19T10:00:00Z',
      service: s1,
    }
    render(
      <TasksPanel
        services={[s1]}
        tasks={[ouverte, terminee]}
        focus={{ serviceId: 's1', taskId: 't1' }}
        onFocusDone={() => undefined}
      />,
      { wrapper },
    )
    expect(screen.getByText('Tache t1').closest('[data-task]')).toHaveAttribute(
      'data-highlighted',
      'true',
    )
    expect(screen.queryByText('Tache t2')).toBeNull()
  })

  it('un @... non resolu (ex. une adresse e-mail) reste intact dans le texte envoye', async () => {
    const u = userEvent.setup()
    vi.mocked(InboxApi.createTask).mockResolvedValue(task('new', []))
    render(
      <TasksPanel
        services={[s1]}
        tasks={[]}
        focus={null}
        onFocusDone={() => undefined}
      />,
      { wrapper },
    )
    const input = screen.getByPlaceholderText(
      'Nouvelle tâche… tapez @ pour mentionner',
    )
    await u.type(input, 'Écrire à dr.martin@chu.fr')
    expect(screen.queryByRole('listbox')).toBeNull()
    await u.keyboard('{Enter}')
    expect(InboxApi.createTask).toHaveBeenCalledWith(s1, {
      text: 'Écrire à dr.martin@chu.fr',
      assigneeIds: [],
      soignantIds: [],
    })
  })

  it('@Psychologue propose le metier avant les personnes ; le choisir cree l etiquette et envoie soignantIds', async () => {
    const u = userEvent.setup()
    vi.mocked(InboxApi.soignants)
      .mockReset()
      .mockResolvedValue([{ id: 'so1', name: 'Psychologue' }])
    vi.mocked(InboxApi.createTask).mockResolvedValue(task('new', []))
    render(
      <TasksPanel
        services={[s1]}
        tasks={[]}
        focus={null}
        onFocusDone={() => undefined}
      />,
      { wrapper },
    )
    const input = screen.getByPlaceholderText(
      'Nouvelle tâche… tapez @ pour mentionner',
    )
    await u.type(input, 'Voir @psy')
    const option = await screen.findByRole('option', { name: /Psychologue/ })
    expect(option.textContent).toContain('métier')
    await u.click(option)
    expect(screen.getByText('@Psychologue')).toBeInTheDocument()
    await u.keyboard('{Enter}')
    expect(InboxApi.createTask).toHaveBeenCalledWith(s1, {
      text: 'Voir',
      assigneeIds: [],
      soignantIds: ['so1'],
    })
  })

  it('une tache taguee sur mon metier apparait sous Pour moi', () => {
    const monService: InboxService = { ...s1, soignantId: 'so1' }
    const autre = {
      ...task('t1', []),
      authorId: 'u2',
      soignantIds: ['so1'],
      service: monService,
    }
    render(
      <TasksPanel
        services={[monService]}
        tasks={[autre]}
        focus={null}
        onFocusDone={() => undefined}
      />,
      { wrapper },
    )
    expect(screen.getByText('Tache t1')).toBeInTheDocument()
  })

})
