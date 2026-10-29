import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen } from '@testing-library/react'
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

  it('delai du rappel, sans toucher au niveau (pas une ligne de la grille)', async () => {
    const u = userEvent.setup()
    render(<NotificationPrefs />, { wrapper })
    await u.click(await screen.findByRole('button', { name: '1 h avant' }))
    expect(put).toHaveBeenLastCalledWith(
      expect.objectContaining({ reminderDelay: '1h', level: 'essential' }),
    )
  })

  it('deux bascules rapprochees : un premier PUT qui echoue apres le succes du second ne doit pas effacer ce dernier', async () => {
    const u = userEvent.setup()
    let resolveSecond!: () => void
    let rejectFirst!: (error: unknown) => void
    const firstPut = new Promise<void>((_resolve, reject) => {
      rejectFirst = reject
    })
    const secondPut = new Promise<void>((resolve) => {
      resolveSecond = resolve
    })
    const tick = () => new Promise<void>((r) => setTimeout(r, 0))
    put
      .mockReset()
      .mockImplementationOnce((body: Prefs) => firstPut.then(() => body))
      .mockImplementationOnce((body: Prefs) => secondPut.then(() => body))

    render(<NotificationPrefs />, { wrapper })
    await u.click(
      await screen.findByRole('switch', {
        name: /Diagnostic éducatif à réaliser/,
      }),
    )
    await u.click(
      screen.getByRole('switch', { name: /Fin de parcours : bilan à faire/ }),
    )

    // Le second PUT (la bascule la plus recente) reussit en premier.
    await act(async () => {
      resolveSecond()
      await tick()
    })
    // Le premier PUT, en retard, echoue ensuite : son retour arriere n'efface pas le second.
    await act(async () => {
      rejectFirst(new Error('reseau'))
      await tick()
    })

    expect(
      screen.getByRole('switch', { name: /Fin de parcours : bilan à faire/ }),
    ).toHaveAttribute('aria-checked', 'false')
    expect(
      screen.getByRole('switch', {
        name: /Diagnostic éducatif à réaliser/,
      }),
    ).toHaveAttribute('aria-checked', 'false')
  })

  it('service quitte depuis l enregistrement : ni affiche, ni compte, ni renvoye', async () => {
    get.mockReset().mockResolvedValue({
      ...essentialSaufAbsent,
      services: ['s1', 'parti'],
    })
    const u = userEvent.setup()
    render(<NotificationPrefs />, { wrapper })
    const cardio = await screen.findByRole('checkbox', { name: /Cardio/ })
    expect(screen.getAllByRole('checkbox')).toHaveLength(2)
    expect(cardio).toHaveAttribute('aria-checked', 'true')
    expect(cardio).toBeDisabled()

    await u.click(screen.getByRole('button', { name: '1 h avant' }))
    expect(put).toHaveBeenLastCalledWith(
      expect.objectContaining({ services: ['s1'] }),
    )
    await u.click(screen.getByRole('checkbox', { name: /Diabeto/ }))
    expect(put).toHaveBeenLastCalledWith(
      expect.objectContaining({ services: ['s1', 's2'] }),
    )
  })

  it('seuls des services quittes : tous les services affiches sont coches, rien de bloque', async () => {
    get.mockReset().mockResolvedValue({
      ...essentialSaufAbsent,
      services: ['parti'],
    })
    const u = userEvent.setup()
    render(<NotificationPrefs />, { wrapper })
    const cardio = await screen.findByRole('checkbox', { name: /Cardio/ })
    expect(cardio).toHaveAttribute('aria-checked', 'true')
    expect(cardio).not.toBeDisabled()
    await u.click(screen.getByRole('button', { name: '2 h avant' }))
    expect(put).toHaveBeenLastCalledWith(
      expect.objectContaining({ services: null }),
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
