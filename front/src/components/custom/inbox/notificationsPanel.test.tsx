import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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

// Le pied du panneau rend un `Link` (lien « Préférences ») : il lui faut toujours un
// `RouterProvider`, même quand le scénario ne clique pas ce lien. Arbre minimal avec une page de
// reglages distincte pour prouver une vraie navigation (et son ancre) depuis le lien.
const renderPanel = (ui: ReactNode) => {
  const rootRoute = createRootRoute({ component: Outlet })
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => <>{ui}</>,
  })
  const settingsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/user/settings',
    component: () => <div>Reglages du compte</div>,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute, settingsRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return router
}

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
    renderPanel(
      <NotificationsPanel
        services={[service]}
        notifications={notifications}
        onOpenNotification={vi.fn()}
        onClose={vi.fn()}
      />,
    )
    expect(await screen.findByText(/Appeler le labo/)).toBeInTheDocument()
    expect(screen.getByText(/^Notification ·/)).toBeInTheDocument()
  })

  it('le lien Preferences navigue vers /user/settings#notifications et ferme le panneau', async () => {
    const u = userEvent.setup()
    const onClose = vi.fn()
    const router = renderPanel(
      <NotificationsPanel
        services={[service]}
        notifications={[]}
        onOpenNotification={vi.fn()}
        onClose={onClose}
      />,
    )
    await u.click(screen.getByRole('link', { name: 'Préférences' }))
    expect(await screen.findByText('Reglages du compte')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/user/settings')
    expect(router.state.location.hash).toBe('notifications')
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
