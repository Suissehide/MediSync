import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { DiagnosticEducatifTemplateApi } from '@/api/diagnosticEducatif.api.ts'
import { LocationApi } from '@/api/location.api.ts'
import { SoignantApi } from '@/api/soignant.api.ts'
import { ThematicApi } from '@/api/thematic.api.ts'
import { useAuthStore } from '@/store/useAuthStore.ts'
import { useToastStore } from '@/store/useToastStore.ts'
import type { TenantContext } from '@/types/auth.ts'
import { useDiagnosticTemplateMutations } from './useDiagnosticEducatif.ts'
import { useLocationMutations } from './useLocation.ts'
import { useSoignantMutations } from './useSoignant.ts'
import { useThematicMutations } from './useThematic.ts'

const service: TenantContext = {
  establishmentId: 'e1',
  serviceId: 's1',
  establishmentRole: 'ADMIN',
  serviceRole: 'COORDINATEUR',
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

// Quatre referentiels archivables, quatre cablages distincts du meme bouton.
// Le toast est rendu dans un autre arbre React que l'ecran et ne vit que
// quelques secondes : rien d'autre ne verifie que « Annuler » restaure bien.
const CAS = [
  {
    nom: 'thématique',
    api: ThematicApi,
    hook: useThematicMutations,
    archiver: (m: Record<string, { mutate: (id: string) => void }>) =>
      m.archiveThematic,
    titre: 'Thématique archivée',
  },
  {
    nom: 'salle',
    api: LocationApi,
    hook: useLocationMutations,
    archiver: (m: Record<string, { mutate: (id: string) => void }>) =>
      m.archiveLocation,
    titre: 'Salle archivée',
  },
  {
    nom: 'soignant',
    api: SoignantApi,
    hook: useSoignantMutations,
    archiver: (m: Record<string, { mutate: (id: string) => void }>) =>
      m.archiveSoignant,
    titre: 'Soignant archivé',
  },
  {
    nom: 'modèle de diagnostic',
    api: DiagnosticEducatifTemplateApi,
    hook: useDiagnosticTemplateMutations,
    archiver: (m: Record<string, { mutate: (id: string) => void }>) =>
      m.archiveTemplate,
    titre: 'Modèle archivé',
  },
] as const

describe('annulation immediate d un archivage', () => {
  beforeEach(() => {
    useAuthStore.setState({ context: service })
    useToastStore.setState({ toasts: [] })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it.each(CAS)(
    'le « Annuler » du toast restaure : $nom',
    async ({ api, hook, archiver, titre }) => {
      vi.spyOn(api, 'archive').mockResolvedValue(undefined)
      const update = vi
        .spyOn(api, 'update')
        .mockResolvedValue({ id: 'x1' } as never)

      const { result } = renderHook(() => hook(), { wrapper })

      act(() => {
        archiver(
          result.current as unknown as Record<
            string,
            { mutate: (id: string) => void }
          >,
        ).mutate('x1')
      })
      await waitFor(() =>
        expect(useToastStore.getState().toasts).toHaveLength(1),
      )

      const toast = useToastStore.getState().toasts[0]
      expect(toast?.title).toBe(titre)

      // Le toast porte un element React : on le rend pour cliquer dessus,
      // comme le Toaster le ferait.
      const { getByRole } = render(toast?.action ?? null, { wrapper })
      act(() => {
        getByRole('button', { name: 'Annuler' }).click()
      })

      await waitFor(() =>
        expect(update).toHaveBeenCalledWith({ id: 'x1', archived: false }),
      )
    },
  )
})
