import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useAuthStore } from '@/store/useAuthStore.ts'
import { useToastStore } from '@/store/useToastStore.ts'
import {
  usePatientServiceFileMutations,
  usePatientServiceFileQuery,
} from './usePatientServiceFile.ts'

const context = {
  establishmentId: 'e1',
  serviceId: 's1',
  establishmentRole: 'ADMIN' as const,
  serviceRole: 'COORDINATEUR' as const,
  soignantId: null,
}

const wrapper = ({ children }: { children: ReactNode }) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  })
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

// Le sous-dossier peut ne pas exister : le back rend alors une 404, jamais un objet vide
// (délibéré — un objet vide et une absence ne se distingueraient pas côté appelant, voir
// `patientServiceFile.ts` côté back). C'est un état normal, pas une erreur à afficher : ce test
// verrouille les deux versants du hook — pas d'état d'erreur, pas de toast, `serviceFile` reste
// `undefined` plutôt qu'un objet fabriqué de toutes pièces.
describe('usePatientServiceFileQuery — le sous-dossier peut ne pas exister', () => {
  beforeEach(() => {
    useAuthStore.setState({ context })
    useToastStore.setState({ toasts: [] })
    vi.unstubAllGlobals()
  })

  it('traduit un 404 en absence normale, pas en erreur', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        url: 'http://localhost/e/e1/s/s1/patient/p1/service-file',
        json: async () => ({ message: 'Patient service file not found' }),
      }),
    )

    const { result } = renderHook(() => usePatientServiceFileQuery('p1'), {
      wrapper,
    })

    await waitFor(() => expect(result.current.isPending).toBe(false))

    expect(result.current.serviceFile).toBeNull()
    expect(result.current.isError).toBe(false)
    expect(result.current.error).toBeNull()
    // Le symptôme qu'il faut éviter : une absence normale poussée en toast d'erreur.
    expect(useToastStore.getState().toasts).toHaveLength(0)
  })

  it('rend le sous-dossier quand il existe', async () => {
    const serviceFile = {
      id: 'psf1',
      patientId: 'p1',
      serviceId: 's1',
      establishmentId: 'e1',
      createdAt: '2026-01-01T00:00:00.000Z',
      notes: 'une note',
    }
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        url: 'http://localhost/e/e1/s/s1/patient/p1/service-file',
        json: async () => serviceFile,
      }),
    )

    const { result } = renderHook(() => usePatientServiceFileQuery('p1'), {
      wrapper,
    })

    await waitFor(() => expect(result.current.isPending).toBe(false))

    expect(result.current.serviceFile).toEqual(serviceFile)
    expect(result.current.isError).toBe(false)
  })

  // Seul le 404 est une absence : un 403 est un refus d'accès, pas un sous-dossier manquant.
  // Le confondre avec une absence afficherait un dossier vide à un compte à qui l'on refuse
  // l'accès — sur un écran clinique, une confusion dangereuse entre « rien à voir » et « vous
  // n'avez pas le droit de voir ».
  it('laisse remonter un 403 comme une erreur affichée, jamais comme une absence', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        url: 'http://localhost/e/e1/s/s1/patient/p1/service-file',
        json: async () => ({}),
      }),
    )

    const { result } = renderHook(() => usePatientServiceFileQuery('p1'), {
      wrapper,
    })

    await waitFor(() => expect(result.current.isPending).toBe(false))

    expect(result.current.serviceFile).toBeUndefined()
    expect(result.current.isError).toBe(true)
    expect(useToastStore.getState().toasts.length).toBeGreaterThan(0)
  })

  // Seule la 404 est neutralisée : une vraie défaillance continue de remonter comme une erreur
  // affichée — sinon la neutralisation cacherait aussi des pannes réelles.
  it('laisse remonter une vraie erreur (500) comme une erreur affichée', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        url: 'http://localhost/e/e1/s/s1/patient/p1/service-file',
        json: async () => ({}),
      }),
    )

    const { result } = renderHook(() => usePatientServiceFileQuery('p1'), {
      wrapper,
    })

    await waitFor(() => expect(result.current.isPending).toBe(false))

    expect(result.current.isError).toBe(true)
    expect(useToastStore.getState().toasts.length).toBeGreaterThan(0)
  })
})

// Sans appelant aujourd'hui (la fiche patient en deux blocs, qui déclenchera cette mutation,
// est la tâche 11) : les six tests ajoutés à la tâche 10 ne touchaient que le module d'API et
// la requête de lecture, jamais ce hook (tâche 10, revue, mineur m3 — sabotage G, « suppression pure
// et simple du hook de mutation, que rien ne remarque »). Ces deux tests l'exercent directement
// — un test qui ne rougit pas quand on supprime ce qu'il teste ne teste rien.
describe('usePatientServiceFileMutations', () => {
  beforeEach(() => {
    useAuthStore.setState({ context })
    useToastStore.setState({ toasts: [] })
    vi.unstubAllGlobals()
  })

  it('emet un PATCH sur la bonne route via PatientServiceFileApi.update, avec le corps fourni', async () => {
    const serviceFile = {
      id: 'psf1',
      patientId: 'p1',
      serviceId: 's1',
      establishmentId: 'e1',
      createdAt: '2026-01-01T00:00:00.000Z',
      notes: 'nouvelle note',
    }
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      url: 'http://localhost/e/e1/s/s1/patient/p1/service-file',
      json: async () => serviceFile,
    })
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => usePatientServiceFileMutations(), {
      wrapper,
    })

    await act(async () => {
      await result.current.updatePatientServiceFile.mutateAsync({
        patientID: 'p1',
        notes: 'nouvelle note',
        goal: 'objectif',
      })
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [requestedUrl, init] = fetchMock.mock.calls[0] as [
      string,
      RequestInit,
    ]
    expect(requestedUrl).toMatch(/\/e\/e1\/s\/s1\/patient\/p1\/service-file$/)
    expect(init.method).toBe('PATCH')
    expect(JSON.parse(init.body as string)).toEqual({
      notes: 'nouvelle note',
      goal: 'objectif',
    })

    await waitFor(() =>
      expect(
        useToastStore
          .getState()
          .toasts.some(
            (t) => typeof t.title === 'string' && t.title.includes('modifié'),
          ),
      ).toBe(true),
    )
  })

  it('affiche une erreur, sans faire planter l appelant, quand la mutation echoue', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        url: 'http://localhost/e/e1/s/s1/patient/p1/service-file',
        json: async () => ({}),
      }),
    )

    const { result } = renderHook(() => usePatientServiceFileMutations(), {
      wrapper,
    })

    await act(async () => {
      await result.current.updatePatientServiceFile
        .mutateAsync({ patientID: 'p1', notes: 'n' })
        .catch(() => undefined)
    })

    await waitFor(() =>
      expect(
        useToastStore
          .getState()
          .toasts.some(
            (t) => typeof t.title === 'string' && t.title.includes('Erreur'),
          ),
      ).toBe(true),
    )
  })
})
