import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { InboxApi } from '@/api/inbox.api.ts'
import { useAuthStore } from '@/store/useAuthStore.ts'
import type { User } from '@/types/auth.ts'
import { useInboxServices, useNotifications, useTasks } from './useInbox.ts'

vi.mock('@/api/inbox.api.ts', () => ({
  InboxApi: { tasks: vi.fn(), notifications: vi.fn() },
}))

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
        {
          id: 's1',
          name: 'Cardio',
          role: 'INTERVENANT',
          affecte: true,
          soignantId: 'soi1',
        },
        { id: 's2', name: 'Diabeto', role: 'LECTURE', affecte: true },
        { id: 's3', name: 'Implicite', role: 'COORDINATEUR', affecte: false },
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

describe('useInbox', () => {
  beforeEach(() => {
    useAuthStore.setState({ user })
    vi.mocked(InboxApi.tasks).mockReset()
    vi.mocked(InboxApi.notifications).mockReset()
  })

  it('ne retient que les vraies affectations, et marque celles qui ont les taches', () => {
    const { result } = renderHook(() => useInboxServices(), { wrapper })
    expect(result.current).toEqual([
      {
        establishmentId: 'e1',
        serviceId: 's1',
        name: 'Cardio',
        canTasks: true,
        soignantId: 'soi1',
      },
      {
        establishmentId: 'e1',
        serviceId: 's2',
        name: 'Diabeto',
        canTasks: false,
        soignantId: null,
      },
    ])
  })

  it('interroge chaque service et fusionne ; jamais /taches sur un service LECTURE', async () => {
    vi.mocked(InboxApi.notifications).mockImplementation(async (s) => [
      {
        id: `n-${s.serviceId}`,
        type: 'MENTION',
        payload: { taskId: 't', authorId: null, text: 'x' },
        readAt: null,
        createdAt: '2026-10-19T08:00:00Z',
      },
    ])
    vi.mocked(InboxApi.tasks).mockResolvedValue([])
    const { result } = renderHook(
      () => {
        const services = useInboxServices()
        return { n: useNotifications(services), t: useTasks(services) }
      },
      { wrapper },
    )
    await waitFor(() => expect(result.current.n.notifications).toHaveLength(2))
    expect(
      result.current.n.notifications.map((n) => n.service.serviceId),
    ).toEqual(['s1', 's2'])
    expect(
      vi.mocked(InboxApi.tasks).mock.calls.map(([s]) => s.serviceId),
    ).toEqual(['s1'])
  })
})
