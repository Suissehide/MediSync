import { designsUtilisant } from '../../../main/domain/pdf-asset.domain'

const contenu = (assetId?: string) => ({
  version: 1,
  pages: [
    {
      kind: 'canvas',
      id: 'p1',
      background: '#ffffff',
      elements: assetId
        ? [
            {
              id: 'img',
              kind: 'image',
              x: 0,
              y: 0,
              w: 10,
              h: 10,
              rotation: 0,
              source: { assetId },
              fit: 'contain',
            },
          ]
        : [],
    },
  ],
})

describe('designsUtilisant', () => {
  it('nomme le design qui porte l image', () => {
    const designs = [
      { name: 'Programme cardio', content: contenu('a1') },
      { name: 'Autre', content: contenu() },
    ]
    expect(designsUtilisant(designs, 'a1')).toEqual(['Programme cardio'])
  })

  it('ne nomme personne quand l image ne sert nulle part', () => {
    const designs = [{ name: 'Programme cardio', content: contenu('a2') }]
    expect(designsUtilisant(designs, 'a1')).toEqual([])
  })

  // Une image LIVREE n'a pas d'identifiant d'asset : elle ne doit jamais faire croire qu'une
  // image deposee est utilisee.
  it('ignore une image livree', () => {
    const livree = {
      version: 1,
      pages: [
        {
          kind: 'canvas',
          id: 'p1',
          background: '#ffffff',
          elements: [
            {
              id: 'img',
              kind: 'image',
              x: 0,
              y: 0,
              w: 10,
              h: 10,
              rotation: 0,
              source: { builtin: 'logo-chu' },
              fit: 'contain',
            },
          ],
        },
      ],
    }
    expect(
      designsUtilisant([{ name: 'Livree', content: livree }], 'a1'),
    ).toEqual([])
  })

  // Un contenu illisible ne doit pas faire echouer la question : il ne prouve rien sur l'usage
  // de l'image, on passe au suivant.
  it('ignore un contenu qui n a pas la forme attendue', () => {
    const designs = [
      { name: 'Casse', content: { pages: 'pas un tableau' } },
      { name: 'Bon', content: contenu('a1') },
    ]
    expect(designsUtilisant(designs, 'a1')).toEqual(['Bon'])
  })

  it('ne nomme un design qu une fois meme s il porte l image deux fois', () => {
    const page = contenu('a1').pages[0]
    const deuxFois = {
      version: 1,
      pages: [page, { ...page, id: 'p2' }],
    }
    expect(
      designsUtilisant([{ name: 'Double', content: deuxFois }], 'a1'),
    ).toEqual(['Double'])
  })

  // La page calendrier ne porte pas d'elements du tout.
  it('traverse un document dont une page est un calendrier', () => {
    const avecCalendrier = {
      version: 1,
      pages: [{ kind: 'calendar', id: 'c1' }, contenu('a1').pages[0]],
    }
    expect(
      designsUtilisant([{ name: 'Mixte', content: avecCalendrier }], 'a1'),
    ).toEqual(['Mixte'])
  })
})
