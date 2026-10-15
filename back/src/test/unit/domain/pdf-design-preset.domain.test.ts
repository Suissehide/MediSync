import { PdfDesignPresetDomain } from '../../../main/domain/pdf-design-preset.domain'
import type { IocContainer } from '../../../main/types/application/ioc'
import type { PdfDesignPresetEntityRepo } from '../../../main/types/infra/orm/repositories/pdf-design-preset.repository.interface'

const CONTENU = {
  version: 1,
  pages: [{ kind: 'canvas', id: 'p1', background: '#ffffff', elements: [] }],
}

const ligne = (id: string, sortOrder: number): PdfDesignPresetEntityRepo =>
  ({
    id,
    name: id,
    content: CONTENU,
    sortOrder,
    archivedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  }) as PdfDesignPresetEntityRepo

// Un faux depot : le reordonnancement est une regle de DOMAINE (la liste recue doit decrire
// exactement l'ensemble existant), elle se tient sans base.
const monter = (existants: PdfDesignPresetEntityRepo[]) => {
  const reordonnes: string[][] = []
  const repository = {
    findAll: (archived = false) => Promise.resolve(archived ? [] : existants),
    findByID: (id: string) =>
      Promise.resolve(existants.find((p) => p.id === id) ?? null),
    create: jest.fn(),
    update: jest.fn(),
    reorder: (ids: string[]) => {
      reordonnes.push(ids)
      return Promise.resolve()
    },
  }
  const domain = new PdfDesignPresetDomain({
    pdfDesignPresetRepository: repository,
    logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  } as unknown as IocContainer)
  return { domain, reordonnes }
}

describe('PdfDesignPresetDomain.reorder', () => {
  const deux = [ligne('a', 0), ligne('b', 1)]

  it('accepte une permutation exacte et la transmet telle quelle', async () => {
    const { domain, reordonnes } = monter(deux)

    await domain.reorder(['b', 'a'])

    expect(reordonnes).toEqual([['b', 'a']])
  })

  // Une liste incomplete laisserait les modeles absents a leur ancien rang, donc entremeles
  // avec les nouveaux — l'ordre affiche ne serait plus celui de personne.
  it('refuse une liste a laquelle il manque un modele', async () => {
    const { domain, reordonnes } = monter(deux)

    await expect(domain.reorder(['a'])).rejects.toThrow()
    expect(reordonnes).toEqual([])
  })

  it('refuse une liste qui nomme un modele inconnu', async () => {
    const { domain, reordonnes } = monter(deux)

    await expect(domain.reorder(['a', 'inconnu'])).rejects.toThrow()
    expect(reordonnes).toEqual([])
  })

  // CE CAS N'EST PAS COUVERT PAR `sameIds` SEUL, et c'est pourquoi le domaine compare AUSSI
  // les longueurs : `sameIds(['a','b'], ['a','b','b'])` rend vrai — il compare des ENSEMBLES,
  // et l'ensemble est le bon. Ecrire les rangs tels quels donnerait le dernier a « b ».
  it('refuse une liste qui repete un modele', async () => {
    const { domain, reordonnes } = monter(deux)

    await expect(domain.reorder(['a', 'b', 'b'])).rejects.toThrow()
    expect(reordonnes).toEqual([])
  })

  it('accepte une liste vide quand il n y a aucun modele', async () => {
    const { domain, reordonnes } = monter([])

    await domain.reorder([])

    expect(reordonnes).toEqual([[]])
  })
})
