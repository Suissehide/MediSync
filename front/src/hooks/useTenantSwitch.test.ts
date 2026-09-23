import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'

import { resetOnTenantChange } from '@/hooks/useTenantSwitch.ts'
import { useDiagnosticStore } from '@/store/useDiagnosticStore.ts'

describe('changement de contexte', () => {
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
    vi.spyOn(queryClient, 'cancelQueries').mockImplementation(async () => {
      order.push('cancel')
    })
    vi.spyOn(queryClient, 'clear').mockImplementation(() => {
      order.push('clear')
    })

    await resetOnTenantChange(queryClient)

    expect(order).toEqual(['cancel', 'clear'])
  })

  it('reinitialise les stores non persistes', async () => {
    useDiagnosticStore.setState({ selectedId: 'd1' })
    await resetOnTenantChange(new QueryClient())
    expect(useDiagnosticStore.getState().selectedId).toBeNull()
  })
})
