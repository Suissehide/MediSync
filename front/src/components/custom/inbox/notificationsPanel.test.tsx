import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { InboxApi } from '@/api/inbox.api.ts'
import type { InboxNotification, InboxService } from '@/queries/useInbox.ts'
import type { NotificationType } from '@/types/task.ts'
import { NotificationsPanel } from './notificationsPanel.tsx'

vi.mock('@/api/inbox.api.ts', () => ({
  InboxApi: {
    members: vi.fn(),
    markRead: vi.fn(),
    markAllRead: vi.fn(),
  },
}))

const service: InboxService = {
  establishmentId: 'e1',
  serviceId: 's1',
  name: 'Cardio',
  canTasks: true,
  soignantId: null,
}

const notif = (
  id: string,
  type: NotificationType,
  payload: Record<string, unknown>,
): InboxNotification => ({
  id,
  type,
  payload,
  readAt: null,
  createdAt: new Date().toISOString(),
  service,
})

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider
    client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
  >
    {children}
  </QueryClientProvider>
)

describe('NotificationsPanel', () => {
  beforeEach(() => {
    vi.mocked(InboxApi.members).mockReset().mockResolvedValue([])
    vi.mocked(InboxApi.markRead).mockReset().mockResolvedValue(undefined)
    vi.mocked(InboxApi.markAllRead).mockReset().mockResolvedValue(undefined)
  })

  it('un type inconnu ne plante pas le panneau, les autres lignes restent affichees', async () => {
    const notifications = [
      notif('n1', 'INCONNU' as NotificationType, { foo: 'bar' }),
      notif('n2', 'TASK_DUE', { taskId: 't1', text: 'Appeler le labo' }),
    ]
    render(
      <NotificationsPanel
        services={[service]}
        notifications={notifications}
        onOpenNotification={vi.fn()}
      />,
      { wrapper },
    )
    expect(await screen.findByText(/Appeler le labo/)).toBeInTheDocument()
    expect(screen.getByText(/^Notification ·/)).toBeInTheDocument()
  })
})
