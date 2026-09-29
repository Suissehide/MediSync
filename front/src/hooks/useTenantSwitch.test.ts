import { QueryClient } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { createElement, StrictMode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  createTenantQueryClient,
  rehydratePersistedStores,
  resetOnTenantChange,
  restoreForTenant,
  snapshotForTenant,
  tenantKey,
  useTenantQueryClient,
} from '@/hooks/useTenantSwitch.ts'
import { scopedStorageName } from '@/store/scoped-storage.ts'
import { useAuthStore } from '@/store/useAuthStore.ts'
import { useDashboardFilterStore } from '@/store/useDashboardFilterStore.ts'
import { useDiagnosticStore } from '@/store/useDiagnosticStore.ts'
import { useDiagnosticTemplateStore } from '@/store/useDiagnosticTemplateStore.ts'
import { usePathwayTemplateEditStore } from '@/store/usePathwayTemplateEditStore.ts'
import { usePlanningStore } from '@/store/usePlanningStore.ts'
import { useSoignantStore } from '@/store/useSoignantStore.ts'
import { useTodoStore } from '@/store/useTodoStore.ts'
import type { TenantContext } from '@/types/auth.ts'
import type { Soignant } from '@/types/soignant.ts'
import type { Todo } from '@/types/todo.ts'

const serviceA: TenantContext = {
  establishmentId: 'e1',
  serviceId: 's1',
  establishmentRole: 'ADMIN',
  serviceRole: 'COORDINATEUR',
  soignantId: null,
}
const serviceB: TenantContext = { ...serviceA, serviceId: 's2' }
// Ecrans d'administration d'etablissement : aucun service.
const sansService: TenantContext = {
  ...serviceA,
  serviceId: null,
  serviceRole: null,
}

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
    usePathwayTemplateEditStore.setState({
      editMode: true,
      startDate: '2026-01-01',
    })
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
    // `selectedSoignantIDs` n'est PAS un de ces cinq : il est persiste, donc
    // indexe par service (`scoped-storage.ts`), jamais reinitialise — le
    // reinitialiser en plus de l'indexer serait contradictoire. Ici, le
    // contexte ne change pas (`beforeEach` le laisse a `null`) : la
    // rehydratation relit le meme tiroir et retrouve la meme selection.
    expect(useSoignantStore.getState().selectedSoignantIDs).toEqual(['so1'])
    expect(useTodoStore.getState().todos).toEqual([])
  })

  // Les miroirs sont realimentes par un effet des que la requete du nouveau
  // service revient. Remis a zero apres une frontiere asynchrone, un miroir
  // deja rempli serait vide sans que l'effet se rejoue : liste vide a l'ecran.
  it('reinitialise les stores avant toute attente, sans ceder la main', () => {
    const queryClient = new QueryClient()
    // Annulation qui ne se resout jamais pendant le test : tout ce qui suit
    // l'attente est hors de portee.
    vi.spyOn(queryClient, 'cancelQueries').mockImplementation(
      () => new Promise(() => undefined),
    )
    useSoignantStore.setState({ soignants: [soignantDuServiceA] })

    void resetOnTenantChange(queryClient)

    expect(useSoignantStore.getState().soignants).toEqual([])
  })
})

describe('restauration d une photo de cache', () => {
  beforeEach(() => {
    useAuthStore.setState({ context: serviceA })
  })

  it('renonce si le couple a change depuis la prise de la photo', () => {
    const queryClient = new QueryClient()
    queryClient.setQueryData(['patients'], [{ id: 'p1', nom: 'Service A' }])
    const photo = snapshotForTenant(queryClient, ['patients'])
    queryClient.removeQueries({ queryKey: ['patients'] })

    useAuthStore.setState({ context: serviceB })
    restoreForTenant(queryClient, photo)

    expect(queryClient.getQueryData(['patients'])).toBeUndefined()
  })

  it('restaure quand le couple est le meme', () => {
    const queryClient = new QueryClient()
    queryClient.setQueryData(['patients'], [{ id: 'p1', nom: 'Service A' }])
    const photo = snapshotForTenant(queryClient, ['patients'])
    queryClient.setQueryData(['patients'], [])

    restoreForTenant(queryClient, photo)

    expect(queryClient.getQueryData(['patients'])).toEqual([
      { id: 'p1', nom: 'Service A' },
    ])
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
    expect(
      new Set([tenantKey(null), tenantKey(sansService), tenantKey(serviceA)])
        .size,
    ).toBe(3)
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
    await waitFor(() =>
      expect(initial.getQueryData(['patients'])).toBeUndefined(),
    )
    expect(useSoignantStore.getState().soignants).toEqual([])
  })

  // Le mode strict rend deux fois : sans la forme fonctionnelle de
  // `setState`, un second client serait construit pour rien a chaque
  // changement, et le premier — deja expose — jamais retire.
  it('ne construit qu un client par couple en mode strict', () => {
    const initial = createTenantQueryClient()
    useAuthStore.setState({ context: serviceA })
    const { result, rerender } = renderHook(
      () => useTenantQueryClient(initial),
      {
        wrapper: strictWrapper,
      },
    )

    act(() => useAuthStore.setState({ context: serviceB }))
    const afterSwitch = result.current

    rerender()

    expect(afterSwitch).not.toBe(initial)
    expect(result.current).toBe(afterSwitch)
  })
})

// A la difference des cinq stores non persistes, ceux-ci ne sont jamais
// reinitialises par `resetOnTenantChange` : ils changent de tiroir avec le
// service (`scoped-storage.ts`) et sont rehydrates depuis ce nouveau tiroir.
describe('stores persistes rehydrates au changement de service', () => {
  beforeEach(() => {
    useAuthStore.setState({ context: null })
  })

  // Preuve a deux volets, dans le meme test : sans l'appel a
  // `rehydratePersistedStores` dans `resetOnTenantChange`, `selectedSoignantIDs`
  // resterait a `['so1']` (valeur du service A encore en memoire vive) apres
  // le passage au service B — et meme avec l'appel, sans le repli explicite
  // du `merge` de `useSoignantStore.ts`, la fusion par defaut de zustand
  // garderait cette meme valeur au lieu de repartir du tiroir (encore vide)
  // du service B.
  it('ne laisse rien du service precedent dans un service jamais visite, avant toute attente', () => {
    const queryClient = new QueryClient()
    // Comme dans « reinitialise les stores avant toute attente » : une
    // annulation qui ne se resout jamais pendant le test isole ce qui
    // precede l'attente de ce qui la suit.
    vi.spyOn(queryClient, 'cancelQueries').mockImplementation(
      () => new Promise(() => undefined),
    )

    // `rehydratePersistedStores()` active d'abord le tiroir de A (jamais
    // visite avant ce test) avant d'y ecrire une selection : sans cet appel,
    // l'ecriture viserait le tiroir encore actif d'un test precedent, pas
    // celui de A.
    useAuthStore.setState({ context: serviceA })
    rehydratePersistedStores()
    useSoignantStore.setState({ selectedSoignantIDs: ['so1'] })

    // Contexte change SANS passer par `resetOnTenantChange` : rien ne
    // rehydrate tout seul, la valeur du service A reste en memoire vive, ET
    // le tiroir actif reste celui de A (il ne bouge que depuis
    // `rehydratePersistedStores`).
    useAuthStore.setState({ context: serviceB })
    expect(useSoignantStore.getState().selectedSoignantIDs).toEqual(['so1'])

    void resetOnTenantChange(queryClient)

    expect(useSoignantStore.getState().selectedSoignantIDs).toEqual([])
  })

  // Le pendant positif du test precedent : revenir dans un service deja
  // visite retrouve sa selection, ce que la reinitialisation seule ne
  // pourrait pas offrir.
  it('retrouve la selection d un service deja visite en y revenant', () => {
    useAuthStore.setState({ context: serviceA })
    rehydratePersistedStores()
    useSoignantStore.setState({ selectedSoignantIDs: ['so1'] })

    useAuthStore.setState({ context: serviceB })
    rehydratePersistedStores()
    expect(useSoignantStore.getState().selectedSoignantIDs).toEqual([])

    useAuthStore.setState({ context: serviceA })
    rehydratePersistedStores()

    expect(useSoignantStore.getState().selectedSoignantIDs).toEqual(['so1'])
  })

  // Meme garantie pour les trois autres stores indexes : chacun ecrit sous
  // son propre tiroir de service et ne laisse rien filtrer d un service a
  // l autre dans celui qui n a jamais ete visite.
  it('isole les quatre stores persistes entre deux services jamais visites l un par l autre', () => {
    useAuthStore.setState({ context: serviceA })
    rehydratePersistedStores()
    useDashboardFilterStore.setState({
      mode: 'pathway',
      selectedPathwayTemplateIDs: ['pt1'],
    })
    useTodoStore.setState({ todos: [tacheDuServiceA] })
    useTodoStore.getState().markTodosAsSeen()
    usePlanningStore.getState().setPlanningDates({
      currentDate: '2026-01-01',
      viewStart: '2026-01-01',
      viewEnd: '2026-01-07',
    })

    useAuthStore.setState({ context: serviceB })
    rehydratePersistedStores()

    expect(useDashboardFilterStore.getState().mode).toBe('soignant')
    expect(
      useDashboardFilterStore.getState().selectedPathwayTemplateIDs,
    ).toEqual([])
    expect(useTodoStore.getState().seenTodoIds).toEqual(new Set())
    expect(usePlanningStore.getState().currentDate).toBe('')
    expect(usePlanningStore.getState().viewStart).toBe('')
    expect(usePlanningStore.getState().viewEnd).toBe('')
  })

  // Correction de revue (tour 1) : le tiroir etait recalcule depuis le
  // contexte a CHAQUE acces au stockage. Or `useTenantQueryClient` bascule le
  // contexte PENDANT le rendu, et ne rehydrate que dans l'effet du PARENT —
  // qui s'execute apres les effets des enfants. Toute ecriture programmee
  // par un enfant deja rendu avec le nouveau contexte (le calendrier, qui
  // reecrit ses dates de vue a chaque montage, en est un exemple reel)
  // visait donc deja le tiroir du nouveau service, avec une valeur encore
  // tiree de la memoire vive de l'ancien. `scoped-storage.ts` fige desormais
  // le tiroir : il ne bouge que depuis `switchScopedStorageContext`, appelee
  // par `rehydratePersistedStores` — jamais tout seul au fil d'un acces.
  it('n ecrit jamais dans le tiroir du nouveau service avant que la rehydratation ne l active', () => {
    useAuthStore.setState({ context: serviceA })
    rehydratePersistedStores()
    usePlanningStore.getState().setPlanningDates({
      currentDate: '2026-01-01',
      viewStart: '2026-01-01',
      viewEnd: '2026-01-07',
    })

    // Le rendu bascule le contexte ; l'effet qui rehydrate n'a pas encore
    // tourne. Un enfant deja rendu avec le nouveau contexte peut ecrire ici,
    // avec des valeurs qui viennent encore de la memoire vive du service A
    // (exactement ce que fait le calendrier au montage, via `datesSet`).
    useAuthStore.setState({ context: serviceB })
    const { currentDate, viewStart, viewEnd } = usePlanningStore.getState()
    usePlanningStore
      .getState()
      .setPlanningDates({ currentDate, viewStart, viewEnd })

    // Rien de cette ecriture ne doit atteindre le tiroir de B : il doit
    // rester intact (jamais visite) jusqu'a ce que la rehydratation
    // l'active explicitement.
    expect(
      localStorage.getItem(scopedStorageName('planning-storage', serviceB)),
    ).toBeNull()

    rehydratePersistedStores()
    expect(usePlanningStore.getState().currentDate).toBe('')
  })
})
