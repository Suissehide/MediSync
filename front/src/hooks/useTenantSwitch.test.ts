import { QueryClient } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { createElement, StrictMode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { TenantContext } from '@/types/auth.ts'
import type { Soignant } from '@/types/soignant.ts'
import type { Todo } from '@/types/todo.ts'

import {
  createTenantQueryClient,
  resetOnTenantChange,
  tenantKey,
  useTenantQueryClient,
} from '@/hooks/useTenantSwitch.ts'
import { useAuthStore } from '@/store/useAuthStore.ts'
import { useDiagnosticStore } from '@/store/useDiagnosticStore.ts'
import { useDiagnosticTemplateStore } from '@/store/useDiagnosticTemplateStore.ts'
import { usePathwayTemplateEditStore } from '@/store/usePathwayTemplateEditStore.ts'
import { useSoignantStore } from '@/store/useSoignantStore.ts'
import { useTodoStore } from '@/store/useTodoStore.ts'

const serviceA: TenantContext = {
  establishmentId: 'e1',
  serviceId: 's1',
  establishmentRole: 'ADMIN',
  serviceRole: 'COORDINATEUR',
  soignantId: null,
}
const serviceB: TenantContext = { ...serviceA, serviceId: 's2' }
// Ecrans d'administration d'etablissement : aucun service.
const sansService: TenantContext = { ...serviceA, serviceId: null, serviceRole: null }

const soignantDuServiceA: Soignant = { id: 'so1', name: 'Dupont', active: true }
const tacheDuServiceA: Todo = {
  id: 't1',
  title: 'Appeler la famille',
  createDate: new Date('2026-01-01'),
  completed: false,
}

describe('changement de contexte', () => {
  beforeEach(() => {
    useAuthStore.setState({ context: null })
  })

  it('vide entierement le cache de requetes', async () => {
    const queryClient = new QueryClient()
    queryClient.setQueryData(['patients'], [{ id: 'p1', nom: 'Service A' }])
    queryClient.setQueryData(['soignants'], [{ id: 'so1' }])

    await resetOnTenantChange(queryClient)

    expect(queryClient.getQueryData(['patients'])).toBeUndefined()
    expect(queryClient.getQueryData(['soignants'])).toBeUndefined()
  })

  // L'annulation doit preceder le vidage : sans elle, une reponse en vol
  // reecrirait dans le cache qu'on vient de vider, et la donnee du service
  // precedent reapparaitrait seule.
  it('annule les requetes en vol avant de vider', async () => {
    const queryClient = new QueryClient()
    const order: string[] = []
    vi.spyOn(queryClient, 'cancelQueries').mockImplementation(() => {
      order.push('cancel')
      // Rendre la promesse sans `async` : `resetOnTenantChange` l'attend, et
      // biome refuse une fonction `async` sans `await`.
      return Promise.resolve()
    })
    vi.spyOn(queryClient, 'clear').mockImplementation(() => {
      order.push('clear')
    })

    await resetOnTenantChange(queryClient)

    expect(order).toEqual(['cancel', 'clear'])
  })

  // Cinq stores, et non trois : `soignants` et `todos` sont des miroirs en
  // memoire de la donnee du service, exclus de leur `partialize` — donc hors
  // de portee d'une rehydratation de stores persistes — et affiches par six
  // composants. Ce sont ceux qui laissaient des noms et des taches de
  // l'ancien service a l'ecran.
  it('reinitialise les cinq stores non persistes, miroirs compris', async () => {
    useDiagnosticStore.setState({ selectedId: 'd1' })
    useDiagnosticTemplateStore.setState({ selectedId: 'dt1' })
    usePathwayTemplateEditStore.setState({ editMode: true, startDate: '2026-01-01' })
    useSoignantStore.setState({
      soignants: [soignantDuServiceA],
      selectedSoignantIDs: ['so1'],
    })
    useTodoStore.setState({ todos: [tacheDuServiceA] })

    await resetOnTenantChange(new QueryClient())

    expect(useDiagnosticStore.getState().selectedId).toBeNull()
    expect(useDiagnosticTemplateStore.getState().selectedId).toBeNull()
    expect(usePathwayTemplateEditStore.getState().editMode).toBe(false)
    expect(usePathwayTemplateEditStore.getState().startDate).toBe('')
    expect(useSoignantStore.getState().soignants).toEqual([])
    expect(useSoignantStore.getState().selectedSoignantIDs).toEqual([])
    expect(useTodoStore.getState().todos).toEqual([])
  })
})

describe('cle de contexte', () => {
  // « Pas de service » et « service absent de la cle » ne doivent jamais se
  // confondre : le separateur est toujours present et aucun identifiant n'est
  // vide.
  it('distingue l absence de contexte, l absence de service et un service', () => {
    expect(tenantKey(null)).toBe('')
    expect(tenantKey(sansService)).toBe('e1/')
    expect(tenantKey(serviceA)).toBe('e1/s1')
    expect(new Set([tenantKey(null), tenantKey(sansService), tenantKey(serviceA)]).size).toBe(3)
  })
})

describe('useTenantQueryClient', () => {
  beforeEach(() => {
    useAuthStore.setState({ context: null })
  })

  const strictWrapper = ({ children }: { children: ReactNode }) =>
    createElement(StrictMode, null, children)

  it('conserve le client initial au premier montage, sans rien vider', () => {
    const initial = createTenantQueryClient()
    initial.setQueryData(['patients'], [{ id: 'p1' }])
    useAuthStore.setState({ context: serviceA })

    const { result } = renderHook(() => useTenantQueryClient(initial))

    expect(result.current).toBe(initial)
    // Au rechargement d'une page, le cache est celui du contexte courant :
    // le vider serait une requete de plus pour rien.
    expect(initial.getQueryData(['patients'])).toEqual([{ id: 'p1' }])
  })

  // Le store reecrit un contexte equivalent a chaque navigation dans le meme
  // service : construire un client a chaque fois rechargerait tout a chaque
  // page.
  it('garde le meme client quand le couple ne change pas', () => {
    const initial = createTenantQueryClient()
    useAuthStore.setState({ context: serviceA })
    const { result } = renderHook(() => useTenantQueryClient(initial))

    act(() => useAuthStore.setState({ context: { ...serviceA } }))

    expect(result.current).toBe(initial)
  })

  it('construit un client neuf quand on passe d un contexte sans service a un service', () => {
    const initial = createTenantQueryClient()
    useAuthStore.setState({ context: sansService })
    const { result } = renderHook(() => useTenantQueryClient(initial))

    act(() => useAuthStore.setState({ context: serviceA }))

    expect(result.current).not.toBe(initial)
  })

  // Le constat central de l'etape : rien du service precedent ne doit
  // subsister. Le client neuf demarre vide, et l'ancien — celui que les
  // ecritures differees atteindront — est annule puis vide.
  it('construit un client neuf, vide, au changement de service et retire l ancien', async () => {
    const initial = createTenantQueryClient()
    initial.setQueryData(['patients'], [{ id: 'p1', nom: 'Service A' }])
    useSoignantStore.setState({ soignants: [soignantDuServiceA] })
    useAuthStore.setState({ context: serviceA })

    const { result } = renderHook(() => useTenantQueryClient(initial))

    act(() => useAuthStore.setState({ context: serviceB }))

    expect(result.current).not.toBe(initial)
    expect(result.current.getQueryData(['patients'])).toBeUndefined()
    await waitFor(() => expect(initial.getQueryData(['patients'])).toBeUndefined())
    expect(useSoignantStore.getState().soignants).toEqual([])
  })

  // Le mode strict rend deux fois : sans la forme fonctionnelle de
  // `setState`, un second client serait construit pour rien a chaque
  // changement, et le premier — deja expose — jamais retire.
  it('ne construit qu un client par couple en mode strict', () => {
    const initial = createTenantQueryClient()
    useAuthStore.setState({ context: serviceA })
    const { result, rerender } = renderHook(() => useTenantQueryClient(initial), {
      wrapper: strictWrapper,
    })


    act(() => useAuthStore.setState({ context: serviceB }))
    const afterSwitch = result.current

    rerender()

    expect(afterSwitch).not.toBe(initial)
    expect(result.current).toBe(afterSwitch)
  })
})
