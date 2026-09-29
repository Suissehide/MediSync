import { beforeEach, describe, expect, it } from 'vitest'

import {
  establishmentApiUrl,
  tenantApiUrl,
} from '@/constants/config.constant.ts'
import { useAuthStore } from '@/store/useAuthStore.ts'

const withService = {
  establishmentId: 'e1',
  serviceId: 's1',
  establishmentRole: 'ADMIN' as const,
  serviceRole: 'COORDINATEUR' as const,
  soignantId: null,
}
const withoutService = { ...withService, serviceId: null, serviceRole: null }

describe('fabriques d URL', () => {
  beforeEach(() => {
    useAuthStore.setState({ context: null })
  })

  it('compose les deux prefixes quand le contexte porte un service', () => {
    useAuthStore.setState({ context: withService })
    expect(tenantApiUrl()).toMatch(/\/e\/e1\/s\/s1$/)
    expect(establishmentApiUrl()).toMatch(/\/e\/e1\/admin$/)
  })

  // Un administrateur sur /e/$id/admin n'a pas de service : l'URL
  // d'etablissement doit fonctionner, celle de service doit refuser
  // bruyamment plutot que composer `/s/null`.
  it('compose l URL d etablissement sans service, et refuse celle de service', () => {
    useAuthStore.setState({ context: withoutService })
    expect(establishmentApiUrl()).toMatch(/\/e\/e1\/admin$/)
    expect(() => tenantApiUrl()).toThrow(/service/i)
  })

  it('refuse les deux sans contexte du tout', () => {
    expect(() => tenantApiUrl()).toThrow()
    expect(() => establishmentApiUrl()).toThrow()
  })
})
