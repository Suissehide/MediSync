import { nomDeCopie } from '../../../main/domain/pdf-design.domain'

describe('nomDeCopie', () => {
  it('rend « (copie) » quand rien n est pris', () => {
    expect(nomDeCopie('Programme SMCV', [])).toBe('Programme SMCV (copie)')
  })

  it('passe a « (copie 2) » quand la premiere copie existe', () => {
    expect(nomDeCopie('Programme SMCV', ['Programme SMCV (copie)'])).toBe(
      'Programme SMCV (copie 2)',
    )
  })

  it('saute les numeros deja pris', () => {
    expect(nomDeCopie('P', ['P (copie)', 'P (copie 2)', 'P (copie 3)'])).toBe(
      'P (copie 4)',
    )
  })

  // Les noms pris incluent les supprimes : sans cela, restaurer une copie supprimee ferait
  // deux lignes du meme nom.
  it('reprend le premier numero libre, pas le suivant du plus grand', () => {
    expect(nomDeCopie('P', ['P (copie)', 'P (copie 3)'])).toBe('P (copie 2)')
  })

  it('ne se laisse pas troubler par un homonyme sans suffixe', () => {
    expect(nomDeCopie('P', ['P'])).toBe('P (copie)')
  })
})
