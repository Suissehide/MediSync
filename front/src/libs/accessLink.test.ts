import { describe, expect, it } from 'vitest'

import { buildAccessLinkUrl } from './accessLink.ts'

describe('buildAccessLinkUrl', () => {
  it("construit l'URL complète de consommation du lien, pas seulement le jeton nu", () => {
    const url = buildAccessLinkUrl('jeton-de-test')

    expect(url).toBe(`${window.location.origin}/auth/access-link#jeton-de-test`)
    // Le point precis du defaut corrige : un jeton nu n'est pas un lien.
    expect(url).not.toBe('jeton-de-test')
    expect(url).not.toContain('?')
  })
})
