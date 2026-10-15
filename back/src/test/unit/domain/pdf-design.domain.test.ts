import { nomDeCopie, nomVierge } from '../../../main/domain/pdf-design.domain'

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

// Revue de branche, minor 1 : un design parti de rien s'appelait « Nouveau design (copie) »,
// copie de rien du tout. Il porte son nom, et ne se numerote que s'il est deja pris.
describe('nomVierge', () => {
  it('rend le nom nu quand il est libre', () => {
    expect(nomVierge([])).toBe('Nouveau design')
  })

  it('numerote a partir de 2 quand le nom nu est pris', () => {
    expect(nomVierge(['Nouveau design'])).toBe('Nouveau design 2')
  })

  it('reprend le premier numero libre', () => {
    expect(nomVierge(['Nouveau design', 'Nouveau design 3'])).toBe(
      'Nouveau design 2',
    )
  })

  it('ne dit jamais « copie »', () => {
    expect(nomVierge([])).not.toContain('copie')
  })
})
