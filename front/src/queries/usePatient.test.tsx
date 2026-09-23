import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { TenantContext } from '@/types/auth.ts'

import { PatientApi } from '@/api/patient.api.ts'
import { useAuthStore } from '@/store/useAuthStore.ts'
import { useToastStore } from '@/store/useToastStore.ts'

import { usePatientMutations } from './usePatient.tsx'

const serviceA: TenantContext = {
  establishmentId: 'e1',
  serviceId: 's1',
  establishmentRole: 'ADMIN',
  serviceRole: 'COORDINATEUR',
  soignantId: null,
}
const serviceB: TenantContext = { ...serviceA, serviceId: 's2' }

const wrapper = ({ children }: { children: ReactNode }) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  })
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}

// La suppression d'un patient n'est emise qu'apres une fenetre d'annulation
// de cinq secondes. L'URL de l'API est composee A L'APPEL depuis le contexte
// courant : si l'utilisateur a change de service entre-temps, la requete
// partirait vers le nouveau service. Elle y echouerait sur un 404 neutre,
// puis la branche d'erreur restaurerait dans le cache les patients de
// l'ANCIEN service — sous des cles que le nouveau service lit. Et meme sans
// cette fuite, emettre une suppression vers le mauvais service est une faute
// en soi : elle echoue en silence, et l'utilisateur croit avoir supprime.
describe('suppression differee de patient', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    useAuthStore.setState({ context: serviceA })
    useToastStore.setState({ toasts: [] })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('renonce si le contexte a change au declenchement', async () => {
    const deleteSpy = vi.spyOn(PatientApi, 'delete').mockResolvedValue(undefined)

    const { result } = renderHook(() => usePatientMutations(), { wrapper })

    act(() => {
      result.current.deletePatient('p1')
    })

    // Changement de service pendant la fenetre d'annulation.
    act(() => useAuthStore.setState({ context: serviceB }))

    await act(async () => {
      await vi.advanceTimersByTimeAsync(6000)
    })

    expect(deleteSpy).not.toHaveBeenCalled()
  })

  it('emet la suppression si le contexte n a pas change', async () => {
    const deleteSpy = vi.spyOn(PatientApi, 'delete').mockResolvedValue(undefined)

    const { result } = renderHook(() => usePatientMutations(), { wrapper })

    act(() => {
      result.current.deletePatient('p1')
    })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(6000)
    })

    expect(deleteSpy).toHaveBeenCalledWith('p1')
  })
})
