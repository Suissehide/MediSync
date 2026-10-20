import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { NotificationPrefsApi } from '@/api/notificationPrefs.api.ts'
import { useAuthStore } from '@/store/useAuthStore.ts'
import type { User } from '@/types/auth.ts'
import type { NotificationPrefs as Prefs } from '@/types/notificationPrefs.ts'
import { NotificationPrefs } from './notificationPrefs.tsx'

vi.mock('@/api/notificationPrefs.api.ts', () => ({
  NotificationPrefsApi: { get: vi.fn(), update: vi.fn() },
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
        { id: 's1', name: 'Cardio', role: 'INTERVENANT', affecte: true },
        { id: 's2', name: 'Diabeto', role: 'INTERVENANT', affecte: true },
        { id: 's3', name: 'Implicite', role: 'COORDINATEUR', affecte: false },
      ],
    },
  ],
}

const essentialSaufAbsent: Prefs = {
  level: 'essential',
  services: null,
  reminderDelay: 'eve',
  app: {
    reminder: true,
    added: true,
    moved: true,
    absent: false,
    diag: true,
    end: true,
    full: true,
    mention: true,
    due: true,
  },
}

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider
    client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
  >
    {children}
  </QueryClientProvider>
)

describe('NotificationPrefs', () => {
  const put = vi.mocked(NotificationPrefsApi.update)
  const get = vi.mocked(NotificationPrefsApi.get)

  beforeEach(() => {
    useAuthStore.setState({ user })
    get.mockReset().mockResolvedValue(essentialSaufAbsent)
    put.mockReset().mockImplementation(async (p) => p)
  })

  it('choisir Tout coche tout ; modifier une ligne passe en Personnalise', async () => {
    const u = userEvent.setup()
    render(<NotificationPrefs />, { wrapper })
    await u.click(await screen.findByRole('radio', { name: /Tout/ }))
    expect(put).toHaveBeenLastCalledWith(
      expect.objectContaining({
        level: 'all',
        app: expect.objectContaining({ absent: true }),
      }),
    )
    await u.click(screen.getByRole('switch', { name: /Absence non justifiée/ }))
    expect(put).toHaveBeenLastCalledWith(
      expect.objectContaining({
        level: 'custom',
        app: expect.objectContaining({ absent: false }),
      }),
    )
  })

  it('le dernier service coche ne se decoche pas', async () => {
    const u = userEvent.setup()
    render(<NotificationPrefs />, { wrapper })
    const cardio = await screen.findByRole('checkbox', { name: /Cardio/ })
    const diabeto = screen.getByRole('checkbox', { name: /Diabeto/ })
    expect(cardio).toHaveAttribute('aria-checked', 'true')
    expect(diabeto).toHaveAttribute('aria-checked', 'true')

    await u.click(cardio)
    expect(put).toHaveBeenLastCalledWith(
      expect.objectContaining({ services: ['s2'] }),
    )
    expect(diabeto).toBeDisabled()
  })

  it('delai du rappel', async () => {
    const u = userEvent.setup()
    render(<NotificationPrefs />, { wrapper })
    await u.click(await screen.findByRole('button', { name: '1 h avant' }))
    expect(put).toHaveBeenLastCalledWith(
      expect.objectContaining({ reminderDelay: '1h' }),
    )
  })

  it('services null = tous coches', async () => {
    render(<NotificationPrefs />, { wrapper })
    const cardio = await screen.findByRole('checkbox', { name: /Cardio/ })
    const diabeto = screen.getByRole('checkbox', { name: /Diabeto/ })
    expect(cardio).toHaveAttribute('aria-checked', 'true')
    expect(diabeto).toHaveAttribute('aria-checked', 'true')
  })
})
