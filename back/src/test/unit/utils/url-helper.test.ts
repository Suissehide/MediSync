import { pathWithoutQuery } from '../../../main/utils/url-helper'

describe('pathWithoutQuery', () => {
  it('retire la chaine de requete, qui peut porter une donnee personnelle (task-5-re-review-3.md, I3)', () => {
    expect(
      pathWithoutQuery('/patient/export?search=Dupont-Nom-Patient'),
    ).toBe('/patient/export')
  })

  it('laisse une URL sans chaine de requete inchangee', () => {
    expect(pathWithoutQuery('/patient/export')).toBe('/patient/export')
  })

  it('ne garde que ce qui precede le premier `?`, meme avec plusieurs parametres', () => {
    expect(
      pathWithoutQuery('/patient/export?search=Dupont&pathwayTemplateTags=x'),
    ).toBe('/patient/export')
  })
})
