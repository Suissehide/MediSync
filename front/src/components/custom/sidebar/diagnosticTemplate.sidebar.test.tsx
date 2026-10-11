import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { DiagnosticEducatifTemplateApi } from '@/api/diagnosticEducatif.api.ts'
import { useAuthStore } from '@/store/useAuthStore.ts'
import type { TenantContext } from '@/types/auth.ts'
import SidebarDiagnosticTemplate from './diagnosticTemplate.sidebar.tsx'

const service: TenantContext = {
  establishmentId: 'e1',
  serviceId: 's1',
  establishmentRole: 'MEMBER',
  serviceRole: 'COORDINATEUR',
  soignantId: null,
}

afterEach(() => {
  vi.restoreAllMocks()
})

// La confirmation de purge doit rester distincte de la suppression restaurable : même
// ConfirmDeleteForm, mais un libellé différent sur le bouton (sinon les deux actions se
// confondent).
describe('purge d un modele de diagnostic', () => {
  it('le bouton de confirmation dit « Supprimer définitivement », pas « Supprimer »', async () => {
    useAuthStore.setState({ context: service })
    vi.spyOn(DiagnosticEducatifTemplateApi, 'getAll').mockResolvedValue([
      { id: 't1', name: 'Vieux modèle', activeFields: [] },
    ])

    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <SidebarDiagnosticTemplate />
      </QueryClientProvider>,
    )

    await userEvent.click(await screen.findByRole('switch'))
    await userEvent.click(
      await screen.findByRole('button', {
        name: 'Supprimer définitivement Vieux modèle',
      }),
    )

    expect(
      await screen.findByRole('button', { name: 'Supprimer définitivement' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Supprimer' }),
    ).not.toBeInTheDocument()
  })
})
