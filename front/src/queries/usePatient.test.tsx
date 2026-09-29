import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { PatientApi } from '@/api/patient.api.ts'
import { PATIENT } from '@/constants/process.constant.ts'
import { useAuthStore } from '@/store/useAuthStore.ts'
import { useToastStore } from '@/store/useToastStore.ts'
import type { TenantContext } from '@/types/auth.ts'
import type { CreatePatientParams, Patient } from '@/types/patient.ts'
import { usePatientMutations } from './usePatient.tsx'

const serviceA: TenantContext = {
  establishmentId: 'e1',
  serviceId: 's1',
  establishmentRole: 'ADMIN',
  serviceRole: 'COORDINATEUR',
  soignantId: null,
}
const serviceB: TenantContext = { ...serviceA, serviceId: 's2' }

const patientDuServiceA: Patient = {
  id: 'p1',
  firstName: 'Anne',
  lastName: 'Service A',
}
const nouveauPatient: CreatePatientParams = {
  firstName: 'Nouveau',
  lastName: 'Patient',
}

const wrapper = ({ children }: { children: ReactNode }) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  })
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

// Une mutation DEJA EN VOL au moment du changement de contexte ne reste pas
// sur l'ancien client : React Query reassocie ses options des que le composant
// qui l'heberge rend avec le nouveau client, et lit `onError` au moment du
// reglement. La photo prise sous le service A serait donc restauree dans le
// cache du service B — et ce n'est pas une ligne, c'est la liste entiere.
describe('restauration optimiste apres un changement de contexte', () => {
  beforeEach(() => {
    useAuthStore.setState({ context: serviceA })
    useToastStore.setState({ toasts: [] })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // Un seul client pour tout le test : son identite ne doit pas changer d'un
  // rendu a l'autre, sans quoi la situation decrite n'est pas exercee. L'appel
  // d'API reste en vol jusqu'a ce que le test le fasse echouer, ce qui donne
  // la fenetre pendant laquelle le contexte change.
  const monterAvecUneMutationEnVol = () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    })
    const stableWrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )
    queryClient.setQueryData([PATIENT.GET_ALL], [patientDuServiceA])

    let faireEchouer: () => void = () => undefined
    vi.spyOn(PatientApi, 'create').mockImplementation(
      () =>
        new Promise((_, reject) => {
          faireEchouer = () => reject(new Error('echec'))
        }),
    )

    const { result } = renderHook(() => usePatientMutations(), {
      wrapper: stableWrapper,
    })
    const reglee = result.current.createPatient
      .mutateAsync(nouveauPatient)
      .catch(() => undefined)

    return { queryClient, reglee, faireEchouer: () => faireEchouer() }
  }

  const listeDe = (queryClient: QueryClient): Patient[] | undefined =>
    queryClient.getQueryData<Patient[]>([PATIENT.GET_ALL])

  it('n ecrit rien quand le couple a change depuis le depart de la mutation', async () => {
    const { queryClient, reglee, faireEchouer } = monterAvecUneMutationEnVol()

    // `onMutate` a photographie la liste du service A et ajoute le patient.
    await waitFor(() => expect(listeDe(queryClient)).toHaveLength(2))

    // Changement de service pendant que la mutation est en vol, et cache du
    // service courant tel que le nouveau client le presente : vide.
    act(() => useAuthStore.setState({ context: serviceB }))
    queryClient.removeQueries({ queryKey: [PATIENT.GET_ALL] })

    await act(async () => {
      faireEchouer()
      await reglee
    })

    // Sans la garde, `onError` restaurerait ici la liste du service A.
    expect(listeDe(queryClient)).toBeUndefined()
  })

  it('restaure normalement quand le couple n a pas change', async () => {
    const { queryClient, reglee, faireEchouer } = monterAvecUneMutationEnVol()

    await waitFor(() => expect(listeDe(queryClient)).toHaveLength(2))

    await act(async () => {
      faireEchouer()
      await reglee
    })

    // L'ajout optimiste est annule : la liste retrouve son seul patient.
    expect(listeDe(queryClient)).toEqual([patientDuServiceA])
  })
})

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
    const deleteSpy = vi
      .spyOn(PatientApi, 'delete')
      .mockResolvedValue(undefined)

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
    const deleteSpy = vi
      .spyOn(PatientApi, 'delete')
      .mockResolvedValue(undefined)

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
