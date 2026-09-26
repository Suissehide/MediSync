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

  // Etape 4a, tache 4, tour de correction 1, Important n°1 : un segment de CHEMIN (pas une
  // chaine de requete) sous ce prefixe precis doit disparaitre, quelle que soit sa forme — c'est
  // le vecteur qu'un jeton d'acces glisse par erreur dans une URL emprunterait (voir
  // access-link-token-leak.test.ts).
  it("tronque un segment de chemin supplementaire sous /auth/access-link/consume (le jeton n'y voyage jamais legitimement)", () => {
    expect(
      pathWithoutQuery('/auth/access-link/consume/UN-JETON-QUELCONQUE'),
    ).toBe('/auth/access-link/consume')
  })

  it('tronque aussi avec une chaine de requete en plus du segment de chemin', () => {
    expect(
      pathWithoutQuery('/auth/access-link/consume/UN-JETON?foo=bar'),
    ).toBe('/auth/access-link/consume')
  })

  it("laisse l'URL exacte du prefixe sensible inchangee (c'est la vraie route, rien a tronquer)", () => {
    expect(pathWithoutQuery('/auth/access-link/consume')).toBe(
      '/auth/access-link/consume',
    )
  })

  it("ne tronque pas une route voisine qui ne fait que COMMENCER PAR le meme texte sans etre le meme segment", () => {
    expect(pathWithoutQuery('/auth/access-link/consumers')).toBe(
      '/auth/access-link/consumers',
    )
  })

  it('ne touche pas une URL hors de la liste fermee des prefixes sensibles', () => {
    expect(pathWithoutQuery('/patient/export/UN-IDENTIFIANT')).toBe(
      '/patient/export/UN-IDENTIFIANT',
    )
  })
})
