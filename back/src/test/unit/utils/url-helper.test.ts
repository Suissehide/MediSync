import { pathWithoutQuery } from '../../../main/utils/url-helper'

describe('pathWithoutQuery', () => {
  it('retire la chaine de requete, qui peut porter une donnee personnelle', () => {
    expect(pathWithoutQuery('/patient/export?search=Dupont-Nom-Patient')).toBe(
      '/patient/export',
    )
  })

  it('laisse une URL sans chaine de requete inchangee', () => {
    expect(pathWithoutQuery('/patient/export')).toBe('/patient/export')
  })

  it('ne garde que ce qui precede le premier `?`, meme avec plusieurs parametres', () => {
    expect(
      pathWithoutQuery('/patient/export?search=Dupont&pathwayTemplateTags=x'),
    ).toBe('/patient/export')
  })

  // Un segment de CHEMIN (pas une chaine de requete) sous ce prefixe precis doit disparaitre,
  // quelle que soit sa forme — c'est le vecteur qu'un jeton d'acces glisse par erreur dans une
  // URL emprunterait (voir access-link-token-leak.test.ts).
  it("tronque un segment de chemin supplementaire sous /auth/access-link/consume (le jeton n'y voyage jamais legitimement)", () => {
    expect(
      pathWithoutQuery('/auth/access-link/consume/UN-JETON-QUELCONQUE'),
    ).toBe('/auth/access-link/consume')
  })

  it('tronque aussi avec une chaine de requete en plus du segment de chemin', () => {
    expect(pathWithoutQuery('/auth/access-link/consume/UN-JETON?foo=bar')).toBe(
      '/auth/access-link/consume',
    )
  })

  it("laisse l'URL exacte du prefixe sensible inchangee (c'est la vraie route, rien a tronquer)", () => {
    expect(pathWithoutQuery('/auth/access-link/consume')).toBe(
      '/auth/access-link/consume',
    )
  })

  it('ne tronque pas une route voisine qui ne fait que COMMENCER PAR le meme texte sans etre le meme segment', () => {
    expect(pathWithoutQuery('/auth/access-link/consumers')).toBe(
      '/auth/access-link/consumers',
    )
  })

  it('ne touche pas une URL hors de la liste fermee des prefixes sensibles', () => {
    expect(pathWithoutQuery('/patient/export/UN-IDENTIFIANT')).toBe(
      '/patient/export/UN-IDENTIFIANT',
    )
  })

  // La comparaison ne doit pas reconnaitre le prefixe qu'a l'octet pres — dix variantes de la
  // MEME route sabotee y echapperaient sinon. Chacune des cinq formes ci-dessous doit tronquer
  // IDENTIQUEMENT a la forme nue.
  it('tronque quelle que soit la casse du chemin', () => {
    expect(pathWithoutQuery('/AUTH/Access-Link/CONSUME/UN-JETON')).toBe(
      '/auth/access-link/consume',
    )
  })

  it("tronque un segment encode en pourcent (%63 = 'c')", () => {
    expect(pathWithoutQuery('/auth/access-link/%63onsume/UN-JETON')).toBe(
      '/auth/access-link/consume',
    )
  })

  it('tronque quand le separateur `/` lui-meme est encode (%2F)', () => {
    expect(pathWithoutQuery('/auth/access-link/consume%2FUN-JETON')).toBe(
      '/auth/access-link/consume',
    )
  })

  it('tronque malgre un double encodage (une seule passe ne suffirait pas)', () => {
    // %2563 decode une premiere fois en %63, puis une seconde fois en 'c'.
    expect(pathWithoutQuery('/auth/access-link/%2563onsume/UN-JETON')).toBe(
      '/auth/access-link/consume',
    )
  })

  it('tronque malgre un slash double dans le chemin', () => {
    expect(pathWithoutQuery('/auth//access-link/consume/UN-JETON')).toBe(
      '/auth/access-link/consume',
    )
  })

  it('tronque malgre un parametre matriciel HTTP (`;cle=valeur`) insere sur un segment', () => {
    expect(
      pathWithoutQuery('/auth/access-link/consume;jsessionid=x/UN-JETON'),
    ).toBe('/auth/access-link/consume')
  })

  it('ne leve pas sur un `%` mal forme dans le chemin : garde la chaine telle quelle plutot que planter', () => {
    expect(() => pathWithoutQuery('/patient/export%')).not.toThrow()
    expect(pathWithoutQuery('/patient/export%')).toBe('/patient/export%')
  })

  // Six formes voisines peuvent fuir : un caractere blanc ou invisible glisse au milieu d'un
  // segment, ou une traversee de chemin (`.`/`..`) qui casse la continuite litterale du prefixe.
  // Chacune doit tronquer IDENTIQUEMENT a la forme nue.
  it('tronque malgre un espace glisse au milieu du segment (encode en %20)', () => {
    expect(pathWithoutQuery('/auth/access-link/con%20sume/UN-JETON')).toBe(
      '/auth/access-link/consume',
    )
  })

  it('tronque malgre une tabulation glissee au milieu du segment (encodee en %09)', () => {
    expect(pathWithoutQuery('/auth/access-link/con%09sume/UN-JETON')).toBe(
      '/auth/access-link/consume',
    )
  })

  it('tronque malgre un octet nul glisse au milieu du segment (encode en %00)', () => {
    expect(pathWithoutQuery('/auth/access-link/cons%00ume/UN-JETON')).toBe(
      '/auth/access-link/consume',
    )
  })

  it('tronque malgre un espace de largeur nulle (U+200B, encode en %E2%80%8B) glisse au milieu du segment', () => {
    expect(
      pathWithoutQuery('/auth/access-link/cons%E2%80%8Bume/UN-JETON'),
    ).toBe('/auth/access-link/consume')
  })

  it('tronque malgre un segment `.` insere avant le prefixe sensible', () => {
    expect(pathWithoutQuery('/auth/./access-link/consume/UN-JETON')).toBe(
      '/auth/access-link/consume',
    )
  })

  it('tronque malgre une traversee de chemin (`..`) qui redescend sous le meme prefixe', () => {
    expect(
      pathWithoutQuery('/auth/access-link/autre-route/../consume/UN-JETON'),
    ).toBe('/auth/access-link/consume')
  })

  it('ne fait PAS matcher une traversee de chemin qui ne redescend jamais sous le prefixe sensible', () => {
    expect(
      pathWithoutQuery('/auth/access-link/consume/../../etc/UN-IDENTIFIANT'),
    ).toBe('/auth/access-link/consume/../../etc/UN-IDENTIFIANT')
  })
})
