# PDF patient, étape 3 — le multi-pages

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un service compose un document de plusieurs pages — il en ajoute, en supprime, les réordonne, insère la page calendrier là où il veut, et voit ce qu'il manipule dans une bande de vraies vignettes.

**Architecture:** La liste des pages devient une donnée qu'on manipule, pas une suite figée. Les opérations sont des fonctions pures (`pages.ts`) testées sans DOM, branchées sur le point d'entrée unique de `useEdition` comme les opérations d'éléments de l'étape 2. La bande est un composant à part (`bande-pages.tsx`) et la vignette un autre (`vignette.tsx`), parce que la vignette sert aussi aux cartes de l'écran liste. Le back gagne la seule règle qu'il doit tenir lui-même : au plus une page calendrier.

**Tech Stack:** Zod v4 côté back ; React 19, TanStack Router/Query, Tailwind, vitest côté front. Aucune dépendance nouvelle — le réordonnancement réutilise `MoveButtons` (`front/src/components/settings/iconButton.tsx`), déjà employé par la fiche patient et les jeux d'indicateurs.

**Spec:** `docs/superpowers/specs/2026-10-14-pdf-patient-designs-design.md` (§ « Découpage, cinq étapes livrables », étape 3)

## Global Constraints

- **Au plus une page calendrier par design.** Choix tranché avec le propriétaire du produit : deux exemplaires rendraient deux fois les mêmes créneaux. Elle reste insérable et supprimable — un design purement éditorial est légitime.
- **Réordonnancement par flèches, pas par glisser-déposer.** C'est le motif du dépôt (`MoveButtons`), zéro dépendance, accessible au clavier et testable sans DOM.
- **Vignettes rendues, dans la bande de l'éditeur ET sur les cartes de l'écran liste.** `render-canvas` sait déjà dessiner une page à n'importe quelle échelle.
- **Un design a toujours au moins une page** : `pdfDesignContentSchema` impose `pages.min(1)`. L'écran doit l'empêcher, pas le découvrir au 400.
- **Biome, jamais ESLint ni Prettier.** Jamais de `biome-ignore` : on corrige le code.
- **Commentaires synthétiques** : une ligne qui dit *pourquoi*, ou rien.
- Le libellé d'une suppression dans l'UI est « Supprimer », jamais « Archiver ».

## Review Focus

Cinq classes d'entrée que la spec implique et qu'aucune tâche n'exerce spontanément. Chacune reçoit son test dans la tâche qui possède le code.

1. **Supprimer la page qu'on est en train d'éditer.** La sélection doit retomber sur une page existante — jamais sur un identifiant disparu, qui laisserait la zone centrale vide sans rien dire. → Tâche 3.
2. **Supprimer la dernière page.** Le schéma exige au moins une page : l'écran doit refuser le geste (bouton désactivé), pas laisser découvrir un 400 à l'enregistrement. → Tâches 2 et 5.
3. **Insérer une seconde page calendrier.** Impossible depuis l'écran (le bouton disparaît), et le back refuse de toute façon — une règle d'UI n'est pas une garantie. → Tâches 1 et 5.
4. **Réordonner pendant qu'un élément est sélectionné.** L'élément appartient à sa page, qui a changé de rang : la sélection doit rester sur le même élément, pas sauter à celui qui occupe désormais la place. → Tâche 3.
5. **Un design dont la seule page est le calendrier.** L'éditeur n'a aucune toile à montrer : il doit le dire en une phrase, pas afficher une zone vide qu'on prend pour un bug. → Tâche 6.

---

### Task 1: Le back — au plus une page calendrier

**Files:**
- Modify: `back/src/main/interfaces/http/fastify/schemas/pdf-design-content.schema.ts`
- Test: `back/src/test/e2e/pdf-design.test.ts`
- Test: `back/src/test/unit/interfaces/pdf-design-content.schema.test.ts` (créer si absent ; sinon y ajouter le describe)

**Interfaces:**
- Consumes: `pdfDesignContentSchema` (étape 1).
- Produces: la garantie que tout contenu stocké porte 0 ou 1 page calendrier. Les tâches front s'appuient dessus pour n'avoir à gérer que ce cas.

- [ ] **Step 1: Écrire les tests qui échouent**

Créer `back/src/test/unit/interfaces/pdf-design-content.schema.test.ts` :

```ts
import { pdfDesignContentSchema } from '../../../main/interfaces/http/fastify/schemas/pdf-design-content.schema'

const toile = (id: string) => ({ kind: 'canvas' as const, id, elements: [] })
const calendrier = (id: string) => ({ kind: 'calendar' as const, id })

describe('pdfDesignContentSchema, les pages', () => {
  it('accepte un design sans page calendrier', () => {
    const r = pdfDesignContentSchema.safeParse({
      version: 1,
      pages: [toile('a'), toile('b')],
    })
    expect(r.success).toBe(true)
  })

  it('accepte une page calendrier', () => {
    const r = pdfDesignContentSchema.safeParse({
      version: 1,
      pages: [toile('a'), calendrier('c')],
    })
    expect(r.success).toBe(true)
  })

  // Deux exemplaires rendraient deux fois les memes creneaux : le document repeterait le
  // planning a l'identique, sans que rien ne le signale.
  it('refuse deux pages calendrier', () => {
    const r = pdfDesignContentSchema.safeParse({
      version: 1,
      pages: [calendrier('c1'), toile('a'), calendrier('c2')],
    })
    expect(r.success).toBe(false)
  })

  it('refuse un design sans aucune page', () => {
    const r = pdfDesignContentSchema.safeParse({ version: 1, pages: [] })
    expect(r.success).toBe(false)
  })
})
```

- [ ] **Step 2: Lancer le test pour le voir échouer**

```bash
cd back && NODE_OPTIONS=--experimental-vm-modules npx -y dotenv-cli@7.3.0 -e .env.test.local -e .env.test -- npx jest --runInBand -c src/test/jest.config.ts src/test/unit/interfaces/pdf-design-content.schema.test.ts
```

Attendu : ÉCHEC du seul cas « refuse deux pages calendrier » (les trois autres passent déjà).

- [ ] **Step 3: Ajouter la règle au schéma**

Dans `pdf-design-content.schema.ts`, remplacer l'export du schéma par :

```ts
export const pdfDesignContentSchema = z.object({
  version: z.literal(1),
  pages: z
    .array(z.discriminatedUnion('kind', [canvasPage, calendarPage]))
    .min(1)
    // Une seule page calendrier : elle rend les creneaux du patient, deux exemplaires
    // repeteraient le meme planning. L'ecran l'empeche deja, mais une regle d'UI n'est pas
    // une garantie — c'est ici que ca se tient.
    .refine(
      (pages) => pages.filter((page) => page.kind === 'calendar').length <= 1,
      { message: 'Un design ne porte qu une seule page calendrier' },
    ),
})
```

- [ ] **Step 4: Lancer le test pour le voir passer**

```bash
cd back && NODE_OPTIONS=--experimental-vm-modules npx -y dotenv-cli@7.3.0 -e .env.test.local -e .env.test -- npx jest --runInBand -c src/test/jest.config.ts src/test/unit/interfaces/pdf-design-content.schema.test.ts
```

Attendu : PASS, 4 tests.

- [ ] **Step 5: Vérifier que le preset de référence passe toujours**

Le preset livré porte trois pages (couverture, calendrier, conseils) : une seule calendrier, il doit passer. Le vérifier plutôt que le supposer — un `refine` mal écrit casserait le seed.

```bash
cd back && NODE_OPTIONS=--experimental-vm-modules npx -y dotenv-cli@7.3.0 -e .env.test.local -e .env.test -- npx jest --runInBand -c src/test/jest.config.ts src/test/unit/utils
```

Attendu : PASS. Si un test du preset de référence rougit, c'est le `refine` qu'il faut relire, pas le preset.

- [ ] **Step 6: Ajouter l'e2e de la route**

Dans `back/src/test/e2e/pdf-design.test.ts`, après le test « refuse un contenu qui ne passe pas le schema » :

```ts
  // Review Focus 3 : l'ecran fait disparaitre le bouton, mais la route se garde elle-meme.
  it('refuse un contenu portant deux pages calendrier', async () => {
    const design = await testDb.pdfDesign.create({
      data: {
        name: 'A deux calendriers',
        content: CONTENT,
        establishmentId: scenario.est.id,
        serviceId: scenario.serviceA.id,
      },
    })

    const res = await modifier(
      scenario.serviceA.id,
      scenario.cookiesA,
      design.id,
      {
        content: {
          version: 1,
          pages: [
            { kind: 'calendar', id: 'c1' },
            { kind: 'canvas', id: 'p1', elements: [] },
            { kind: 'calendar', id: 'c2' },
          ],
        },
      },
    )

    expect(res.statusCode).toBe(400)
  })
```

- [ ] **Step 7: Lancer, typechecker, linter, commiter**

```bash
cd back && npx tsc --noEmit -p src/main/tsconfig.json
cd back && NODE_OPTIONS=--experimental-vm-modules npx -y dotenv-cli@7.3.0 -e .env.test.local -e .env.test -- npx jest --runInBand -c src/test/jest.config.ts src/test/e2e/pdf-design.test.ts
cd back && npx biome check --write src
git add back && git commit -m "feat(pdf): au plus une page calendrier par design"
```

Attendu : typecheck muet, e2e vert.

---

### Task 2: `pages.ts` — les opérations sur la liste, sans DOM

**Files:**
- Create: `front/src/components/custom/pdf-design/editor/pages.ts`
- Create: `front/src/components/custom/pdf-design/editor/pages.test.ts`

**Interfaces:**
- Consumes: `PdfPage`, `PdfCanvasPage`, `PdfDesignContent` (`front/src/types/pdfDesign.ts`).
- Produces: `pageVierge()`, `pageCalendrier()`, `aUnCalendrier(pages)`, `ajouterPage(pages, page)`, `supprimerPage(pages, id)`, `deplacerPage(pages, id, sens)` — toutes pures, toutes rendant un nouveau tableau.

- [ ] **Step 1: Écrire les tests qui échouent**

```ts
import { describe, expect, it } from 'vitest'

import type { PdfPage } from '../../../../types/pdfDesign.ts'
import {
  aUnCalendrier,
  ajouterPage,
  deplacerPage,
  pageCalendrier,
  pageVierge,
  supprimerPage,
} from './pages.ts'

const toile = (id: string): PdfPage => ({
  kind: 'canvas',
  id,
  background: '#ffffff',
  elements: [],
})
const calendrier = (id: string): PdfPage => ({ kind: 'calendar', id })

describe('pageVierge', () => {
  it('rend une toile blanche et vide', () => {
    const p = pageVierge()
    expect(p.kind).toBe('canvas')
    expect(p.elements).toEqual([])
    expect(p.background).toBe('#ffffff')
  })

  it('donne un identifiant unique a chaque appel', () => {
    expect(pageVierge().id).not.toBe(pageVierge().id)
  })
})

describe('aUnCalendrier', () => {
  it('voit la page calendrier', () => {
    expect(aUnCalendrier([toile('a'), calendrier('c')])).toBe(true)
  })

  it('ne la voit pas quand il n y en a pas', () => {
    expect(aUnCalendrier([toile('a')])).toBe(false)
  })
})

describe('ajouterPage', () => {
  it('ajoute a la fin', () => {
    const r = ajouterPage([toile('a')], pageVierge())
    expect(r).toHaveLength(2)
    expect(r[0]?.id).toBe('a')
  })

  it('ne touche pas le tableau d origine', () => {
    const depart = [toile('a')]
    ajouterPage(depart, pageVierge())
    expect(depart).toHaveLength(1)
  })
})

describe('supprimerPage', () => {
  it('retire la page nommee', () => {
    const r = supprimerPage([toile('a'), toile('b')], 'a')
    expect(r.map((p) => p.id)).toEqual(['b'])
  })

  // Review Focus 2 : le schema exige au moins une page. Supprimer la derniere ne doit pas
  // produire un contenu que l'enregistrement refusera.
  it('refuse de retirer la derniere page', () => {
    const depart = [toile('a')]
    expect(supprimerPage(depart, 'a')).toEqual(depart)
  })

  it('ignore un identifiant inconnu', () => {
    const depart = [toile('a'), toile('b')]
    expect(supprimerPage(depart, 'absente')).toEqual(depart)
  })
})

describe('deplacerPage', () => {
  it('avance une page d un rang', () => {
    const r = deplacerPage([toile('a'), toile('b'), toile('c')], 'c', 'avant')
    expect(r.map((p) => p.id)).toEqual(['a', 'c', 'b'])
  })

  it('recule une page d un rang', () => {
    const r = deplacerPage([toile('a'), toile('b'), toile('c')], 'a', 'arriere')
    expect(r.map((p) => p.id)).toEqual(['b', 'a', 'c'])
  })

  it('ne fait rien sur la premiere page qu on avance', () => {
    const depart = [toile('a'), toile('b')]
    expect(deplacerPage(depart, 'a', 'avant')).toEqual(depart)
  })

  it('ne fait rien sur la derniere page qu on recule', () => {
    const depart = [toile('a'), toile('b')]
    expect(deplacerPage(depart, 'b', 'arriere')).toEqual(depart)
  })
})
```

- [ ] **Step 2: Lancer les tests pour les voir échouer**

```bash
cd front && npx vitest run src/components/custom/pdf-design/editor/pages.test.ts
```

Attendu : ÉCHEC, module introuvable.

- [ ] **Step 3: Écrire les opérations**

`front/src/components/custom/pdf-design/editor/pages.ts` :

```ts
import type { PdfCanvasPage, PdfPage } from '../../../../types/pdfDesign.ts'

// « avant » rapproche de la couverture, « arriere » en eloigne — le vocabulaire d'une bande
// horizontale, la ou `MoveButtons` dit monter/descendre pour une liste verticale.
export type SensDePage = 'avant' | 'arriere'

export const pageVierge = (): PdfCanvasPage => ({
  kind: 'canvas',
  id: crypto.randomUUID(),
  background: '#ffffff',
  elements: [],
})

export const pageCalendrier = (): PdfPage => ({
  kind: 'calendar',
  id: crypto.randomUUID(),
})

export const aUnCalendrier = (pages: PdfPage[]): boolean =>
  pages.some((page) => page.kind === 'calendar')

export const ajouterPage = (pages: PdfPage[], page: PdfPage): PdfPage[] => [
  ...pages,
  page,
]

// Le schema exige au moins une page : retirer la derniere produirait un contenu que
// l'enregistrement refuserait, et l'utilisateur ne l'apprendrait qu'au 400.
export const supprimerPage = (pages: PdfPage[], id: string): PdfPage[] =>
  pages.length <= 1 ? pages : pages.filter((page) => page.id !== id)

export const deplacerPage = (
  pages: PdfPage[],
  id: string,
  sens: SensDePage,
): PdfPage[] => {
  const rang = pages.findIndex((page) => page.id === id)
  const cible = sens === 'avant' ? rang - 1 : rang + 1
  if (rang < 0 || cible < 0 || cible >= pages.length) {
    return pages
  }
  const suivantes = [...pages]
  const [deplacee] = suivantes.splice(rang, 1)
  if (!deplacee) {
    return pages
  }
  suivantes.splice(cible, 0, deplacee)
  return suivantes
}
```

- [ ] **Step 4: Lancer les tests pour les voir passer**

```bash
cd front && npx vitest run src/components/custom/pdf-design/editor/pages.test.ts && npx tsc -b
```

Attendu : PASS, 13 tests. Typecheck muet.

- [ ] **Step 5: Lint et commit**

```bash
cd front && npx biome check --write src/components/custom/pdf-design/editor
git add front && git commit -m "feat(pdf): operations pures sur la liste des pages"
```

---

### Task 3: `useEdition` — les pages comme la liste d'éléments

**Files:**
- Modify: `front/src/components/custom/pdf-design/editor/use-edition.ts`
- Test: `front/src/components/custom/pdf-design/editor/use-edition.test.ts`

**Interfaces:**
- Consumes: `pages.ts` (tâche 2).
- Produces: `useEdition` expose désormais `pages` (toutes, dans l'ordre), `pageCourante` (la page sélectionnée, de n'importe quel `kind`), `ajouterToile()`, `ajouterCalendrier()`, `supprimerPage(id)`, `deplacerPage(id, sens)`, `peutAjouterCalendrier`. `pagesEditables` disparaît : la bande montre toutes les pages.

**Ce qui change dans l'existant, et pourquoi.** L'étape 2 n'exposait que les toiles (`pagesEditables`) parce que seules elles s'éditent. La bande doit montrer la page calendrier — on la déplace et on la supprime comme les autres. `pageCourante` devient donc une `PdfPage`, et la zone centrale décide quoi afficher selon son `kind` (tâche 6). Les trois tests de `use-edition.test.ts` qui parlent de `pagesEditables` sont réécrits ci-dessous ; ne pas les supprimer sans les remplacer.

- [ ] **Step 1: Réécrire les tests existants qui changent de contrat**

Dans `use-edition.test.ts`, remplacer le test « ne propose a l edition que les pages composables » par :

```ts
  it('propose TOUTES les pages, calendrier compris', () => {
    const { result } = renderHook(() => useEdition(CONTENU))
    expect(result.current.pages.map((p) => p.id)).toEqual([
      'cover',
      'calendrier',
      'tips',
    ])
  })
```

Le test « ouvre sur la premiere page composable, pas sur le calendrier » ne change pas : l'éditeur ouvre toujours sur la première toile, pas sur le calendrier.

- [ ] **Step 2: Écrire les tests des nouvelles opérations**

Ajouter à `use-edition.test.ts` :

```ts
describe('useEdition, operations sur les pages', () => {
  it('ajoute une toile a la fin et s y place', () => {
    const { result } = renderHook(() => useEdition(CONTENU))
    act(() => result.current.ajouterToile())
    expect(result.current.pages).toHaveLength(4)
    expect(result.current.pageCourante?.id).toBe(
      result.current.pages[3]?.id,
    )
  })

  it('ajoute la page calendrier quand il n y en a pas', () => {
    const sansCalendrier: PdfDesignContent = {
      version: 1,
      pages: [CONTENU.pages[0] as PdfPage],
    }
    const { result } = renderHook(() => useEdition(sansCalendrier))
    expect(result.current.peutAjouterCalendrier).toBe(true)
    act(() => result.current.ajouterCalendrier())
    expect(result.current.pages.map((p) => p.kind)).toEqual([
      'canvas',
      'calendar',
    ])
  })

  // Review Focus 3 : deux calendriers repeteraient le meme planning.
  it('ne propose pas une seconde page calendrier', () => {
    const { result } = renderHook(() => useEdition(CONTENU))
    expect(result.current.peutAjouterCalendrier).toBe(false)
    act(() => result.current.ajouterCalendrier())
    expect(result.current.pages).toHaveLength(3)
  })

  it('supprime une page', () => {
    const { result } = renderHook(() => useEdition(CONTENU))
    act(() => result.current.supprimerPage('tips'))
    expect(result.current.pages.map((p) => p.id)).toEqual([
      'cover',
      'calendrier',
    ])
  })

  // Review Focus 1 : la page courante disparait sous les pieds de l'editeur.
  it('se replace sur une page existante quand on supprime la courante', () => {
    const { result } = renderHook(() => useEdition(CONTENU))
    act(() => result.current.choisirPage('tips'))
    act(() => result.current.supprimerPage('tips'))
    expect(result.current.pageCourante?.id).toBe('cover')
    expect(
      result.current.pages.some((p) => p.id === 'tips'),
    ).toBe(false)
  })

  // Review Focus 2 : le schema exige au moins une page.
  it('refuse de supprimer la derniere page', () => {
    const uneSeule: PdfDesignContent = {
      version: 1,
      pages: [CONTENU.pages[0] as PdfPage],
    }
    const { result } = renderHook(() => useEdition(uneSeule))
    act(() => result.current.supprimerPage(result.current.pages[0]?.id ?? ''))
    expect(result.current.pages).toHaveLength(1)
    expect(result.current.modifie).toBe(false)
  })

  it('deplace une page dans la bande', () => {
    const { result } = renderHook(() => useEdition(CONTENU))
    act(() => result.current.deplacerPage('tips', 'avant'))
    expect(result.current.pages.map((p) => p.id)).toEqual([
      'cover',
      'tips',
      'calendrier',
    ])
  })

  // Review Focus 4 : l'element selectionne appartient a sa page, pas a son rang.
  it('garde l element selectionne quand sa page change de rang', () => {
    const { result } = renderHook(() => useEdition(CONTENU))
    act(() => result.current.choisirElement('titre'))
    act(() => result.current.deplacerPage('cover', 'arriere'))
    expect(result.current.selection).toBe('titre')
    expect(result.current.pageCourante?.id).toBe('cover')
  })

  // Review Focus 5 : il n'y a aucune toile sur laquelle ouvrir. Le hook doit quand meme
  // designer une page courante, sinon l'ecran n'a rien a afficher et ne sait pas pourquoi.
  it('ouvre sur le calendrier quand c est la seule page', () => {
    const calendrierSeul: PdfDesignContent = {
      version: 1,
      pages: [{ kind: 'calendar', id: 'calendrier' }],
    }
    const { result } = renderHook(() => useEdition(calendrierSeul))
    expect(result.current.pageCourante?.id).toBe('calendrier')
    expect(result.current.pageCourante?.kind).toBe('calendar')
  })
})
```

Importer `PdfPage` dans les imports de type du fichier de test.

- [ ] **Step 3: Lancer les tests pour les voir échouer**

```bash
cd front && npx vitest run src/components/custom/pdf-design/editor/use-edition.test.ts
```

Attendu : ÉCHEC des huit nouveaux cas plus celui réécrit (`result.current.pages` indéfini, `ajouterToile` n'est pas une fonction).

- [ ] **Step 4: Étendre le hook**

Dans `use-edition.ts`, remplacer le bloc `pagesEditables` / `pageCourante` / `choisirPage` par :

```ts
  // Toutes les pages, dans l'ordre : la bande les montre toutes, y compris le calendrier,
  // qu'on deplace et qu'on supprime comme les autres meme s'il ne se compose pas.
  const pages = contenu.pages

  // L'editeur OUVRE sur la premiere toile : le calendrier n'a rien a composer. Une fois
  // ouvert, la page courante peut etre n'importe laquelle — c'est la bande qui mene.
  const premiereToile = pages.find((page) => page.kind === 'canvas')
  const pageCourante =
    pages.find((page) => page.id === pageId) ?? premiereToile ?? pages[0] ?? null

  const choisirPage = useCallback((id: string) => {
    setPageId(id)
    // Une selection qui survit au changement de page ferait pointer l'inspecteur sur un
    // element absent de la toile affichee.
    setSelection(null)
  }, [])

  const peutAjouterCalendrier = !aUnCalendrier(pages)
```

Puis, à côté de `majElements`, ajouter le point d'entrée des pages et les quatre opérations :

```ts
  // Meme discipline que `majElements` : un seul endroit modifie la liste des pages, et
  // l'historique de la tache 8 de l'etape 2 continue de s'y brancher sans rien savoir.
  const majPages = useCallback(
    (transformer: (pages: PdfPage[]) => PdfPage[]) => {
      setContenu((avant) => ({ ...avant, pages: transformer(avant.pages) }))
    },
    [],
  )

  const ajouterToile = useCallback(() => {
    const page = pageVierge()
    majPages((avant) => ajouterPage(avant, page))
    setPageId(page.id)
    setSelection(null)
  }, [majPages])

  const ajouterCalendrier = useCallback(() => {
    if (!peutAjouterCalendrier) {
      return
    }
    const page = pageCalendrier()
    majPages((avant) => ajouterPage(avant, page))
    setPageId(page.id)
    setSelection(null)
  }, [majPages, peutAjouterCalendrier])

  // La page courante peut disparaitre sous les pieds de l'editeur : on repasse sur la
  // premiere toile plutot que de garder un identifiant qui ne designe plus rien.
  const supprimerUnePage = useCallback(
    (id: string) => {
      if (pages.length <= 1) {
        return
      }
      majPages((avant) => supprimerPage(avant, id))
      if (pageId === id) {
        setPageId(null)
        setSelection(null)
      }
    },
    [majPages, pageId, pages.length],
  )

  const deplacerUnePage = useCallback(
    (id: string, sens: SensDePage) => {
      majPages((avant) => deplacerPage(avant, id, sens))
    },
    [majPages],
  )
```

Et compléter le retour du hook :

```ts
  return {
    contenu,
    pages,
    pageCourante,
    peutAjouterCalendrier,
    choisirPage,
    ajouterToile,
    ajouterCalendrier,
    supprimerPage: supprimerUnePage,
    deplacerPage: deplacerUnePage,
    selection,
    choisirElement: setSelection,
    modifierElement,
    ajouterElement,
    supprimerSelection,
    dupliquerSelection,
    changerOrdre,
    remplacerContenu,
    marquerEnregistre,
    modifie,
  }
```

Imports à ajouter en tête du fichier :

```ts
import type { PdfPage } from '../../../../types/pdfDesign.ts'
import {
  aUnCalendrier,
  ajouterPage,
  deplacerPage,
  pageCalendrier,
  pageVierge,
  type SensDePage,
  supprimerPage,
} from './pages.ts'
```

**Attention au typage de `majElements`.** Il filtre sur `page.kind === 'canvas' && page.id === idCourant` ; `idCourant` vaut maintenant `pageCourante?.id` quel que soit le `kind`. Quand la page courante est le calendrier, aucune page ne correspond au filtre et les opérations d'éléments ne font rien — c'est le comportement voulu, pas un cas à traiter à part.

**`useMemo` devient inutilisé.** Il ne servait qu'à `pagesEditables` ; `pages` est désormais `contenu.pages`, sans calcul. Retirer `useMemo` de l'import de `react` en tête du fichier, sinon `correctness/noUnusedImports` casse le lint — c'est une erreur chez Biome dans ce dépôt, pas un avertissement.

- [ ] **Step 5: Lancer les tests pour les voir passer**

```bash
cd front && npx vitest run src/components/custom/pdf-design/editor/use-edition.test.ts && npx tsc -b
```

Attendu : PASS. Le typecheck signalera les appelants de `pagesEditables` — c'est la tâche 6 qui les corrige ; si le typecheck est bruyant ici, laisser l'erreur de `$designId.tsx` et la résoudre en tâche 6 plutôt que de bricoler un pont temporaire.

- [ ] **Step 6: Commit**

```bash
cd front && npx biome check --write src/components/custom/pdf-design/editor
git add front && git commit -m "feat(pdf): ajouter, supprimer et reordonner les pages d'un design"
```

---

### Task 4: `vignette.tsx` — une page en miniature

**Files:**
- Create: `front/src/components/custom/pdf-design/vignette.tsx`
- Create: `front/src/components/custom/pdf-design/vignette.test.tsx`
- Modify: `front/src/components/custom/pdf-design/render-canvas.tsx`
- Test: `front/src/components/custom/pdf-design/render-canvas.test.tsx`

**Interfaces:**
- Consumes: `CanvasPage` (étape 2) ; `A4_WIDTH`, `A4_HEIGHT`.
- Produces: `<Vignette page={...} largeur={72} />`, et une prop `interactif` sur `CanvasPage` (défaut `true`).

**Pourquoi `CanvasPage` doit changer.** Il rend chaque élément dans un `<button>`, ce qu'il faut pour éditer mais pas pour une miniature : une bande de quatre vignettes ajouterait des dizaines d'arrêts de tabulation vers des boutons qui ne font rien. `interactif={false}` les rend en `<div>`.

- [ ] **Step 1: Écrire le test de `CanvasPage` non interactif**

Ajouter à `render-canvas.test.tsx` :

```tsx
  // Une miniature n'est pas un editeur : ses elements ne doivent etre ni cliquables ni
  // atteignables au clavier, sinon une bande de quatre vignettes ajoute des dizaines
  // d'arrets de tabulation vers des boutons qui ne font rien.
  it('ne rend aucun bouton quand elle n est pas interactive', () => {
    render(<CanvasPage page={page([texte])} echelle={0.2} interactif={false} />)
    expect(screen.queryAllByRole('button')).toHaveLength(0)
    expect(screen.getByTestId('element-e1')).toBeInTheDocument()
  })

  it('rend des boutons par defaut', () => {
    render(<CanvasPage page={page([texte])} echelle={1} />)
    expect(screen.getAllByRole('button')).toHaveLength(1)
  })
```

- [ ] **Step 2: Écrire le test de la vignette**

`front/src/components/custom/pdf-design/vignette.test.tsx` :

```tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type { PdfPage } from '../../../types/pdfDesign.ts'
import Vignette from './vignette.tsx'

const toile: PdfPage = {
  kind: 'canvas',
  id: 'p1',
  background: '#ffffff',
  elements: [
    {
      id: 'e1',
      kind: 'rect',
      x: 10,
      y: 20,
      w: 100,
      h: 30,
      rotation: 0,
      fill: '#e05a5a',
      radius: 0,
    },
  ],
}

describe('Vignette', () => {
  it('dessine le contenu de la toile', () => {
    render(<Vignette page={toile} largeur={72} />)
    expect(screen.getByTestId('element-e1')).toBeInTheDocument()
  })

  it('garde le rapport de la page A4', () => {
    render(<Vignette page={toile} largeur={100} />)
    const cadre = screen.getByTestId('vignette-p1')
    expect(cadre.style.width).toBe('100px')
    // 100 x 841,89 / 595,28 = 141,4...
    expect(Math.round(Number.parseFloat(cadre.style.height))).toBe(141)
  })

  // La page calendrier est produite par du code, pas par la toile : il n'y a rien a
  // dessiner, et inventer un faux planning mentirait sur ce que le PDF contiendra.
  it('annonce la page calendrier au lieu de la dessiner', () => {
    render(<Vignette page={{ kind: 'calendar', id: 'c1' }} largeur={72} />)
    expect(screen.getByText('Calendrier')).toBeInTheDocument()
  })

  it('ne met aucun element de la toile dans l ordre de tabulation', () => {
    render(<Vignette page={toile} largeur={72} />)
    expect(screen.queryAllByRole('button')).toHaveLength(0)
  })
})
```

- [ ] **Step 3: Lancer les deux fichiers pour les voir échouer**

```bash
cd front && npx vitest run src/components/custom/pdf-design/vignette.test.tsx src/components/custom/pdf-design/render-canvas.test.tsx
```

Attendu : ÉCHEC — module `vignette.tsx` introuvable, et `interactif` inconnu de `CanvasPage`.

- [ ] **Step 4: Rendre `CanvasPage` non interactif sur demande**

Dans `render-canvas.tsx`, ajouter `interactif` aux props et remplacer le `<button>` par un élément choisi :

```tsx
type CanvasPageProps = {
  page: PdfCanvasPage
  echelle: number
  selectionId?: string | null
  onSelect?: (id: string) => void
  // `false` pour une miniature : les elements deviennent de simples boites, sans clic ni
  // arret de tabulation.
  interactif?: boolean
}
```

et dans le `map`, à la place du `<button …>` :

```tsx
        const commun = {
          key: element.id,
          'data-testid': `element-${element.id}`,
          'data-selectionne': selectionne ? 'true' : 'false',
          style: {
            ...elementStyle(element, echelle),
            outline: selectionne ? '1px solid var(--color-primary)' : 'none',
            padding: 0,
            border: 'none',
            ...(element.kind === 'text' || element.kind === 'image'
              ? { background: 'transparent' }
              : {}),
          },
        }
        if (!interactif) {
          return <div {...commun}>{contenu(element)}</div>
        }
        return (
          <button
            type="button"
            {...commun}
            style={{ ...commun.style, cursor: 'move' }}
            onClick={() => onSelect?.(element.id)}
          >
            {contenu(element)}
          </button>
        )
```

avec `interactif = true` dans la déstructuration des props.

- [ ] **Step 5: Écrire la vignette**

`front/src/components/custom/pdf-design/vignette.tsx` :

```tsx
import { CalendarDays } from 'lucide-react'

import { A4_HEIGHT, A4_WIDTH, type PdfPage } from '../../../types/pdfDesign.ts'
import CanvasPage from './render-canvas.tsx'

// Une page en petit, au rapport de l'A4. Le meme moteur que la toile, a une autre echelle :
// ce qu'on voit dans la bande est ce que l'editeur dessine, pas une approximation de plus.
export default function Vignette({
  page,
  largeur,
}: {
  page: PdfPage
  largeur: number
}) {
  const hauteur = (largeur * A4_HEIGHT) / A4_WIDTH

  if (page.kind === 'calendar') {
    return (
      <div
        data-testid={`vignette-${page.id}`}
        className="flex flex-col items-center justify-center gap-1 bg-muted text-text-light border border-border rounded-xs"
        style={{ width: largeur, height: hauteur }}
      >
        <CalendarDays className="w-4 h-4" />
        <span className="text-[10px]">Calendrier</span>
      </div>
    )
  }

  return (
    <div
      data-testid={`vignette-${page.id}`}
      className="overflow-hidden border border-border rounded-xs bg-white"
      style={{ width: largeur, height: hauteur }}
    >
      <CanvasPage page={page} echelle={largeur / A4_WIDTH} interactif={false} />
    </div>
  )
}
```

- [ ] **Step 6: Lancer les tests pour les voir passer**

```bash
cd front && npx vitest run src/components/custom/pdf-design/vignette.test.tsx src/components/custom/pdf-design/render-canvas.test.tsx && npx tsc -b
```

Attendu : PASS, 4 + 15 tests.

- [ ] **Step 7: Lint et commit**

```bash
cd front && npx biome check --write src/components/custom/pdf-design
git add front && git commit -m "feat(pdf): vignette d'une page, au rapport de l'A4"
```

---

### Task 5: `bande-pages.tsx` — la bande et ses actions

**Files:**
- Create: `front/src/components/custom/pdf-design/editor/bande-pages.tsx`
- Create: `front/src/components/custom/pdf-design/editor/bande-pages.test.tsx`

**Interfaces:**
- Consumes: `Vignette` (tâche 4) ; `MoveButtons` (`front/src/components/settings/iconButton.tsx`) ; `SensDePage` (tâche 2).
- Produces: `<BandePages pages courantId peutAjouterCalendrier onChoisir onAjouterToile onAjouterCalendrier onSupprimer onDeplacer />`.

- [ ] **Step 1: Écrire les tests qui échouent**

```tsx
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import type { PdfPage } from '../../../../types/pdfDesign.ts'
import BandePages from './bande-pages.tsx'

const toile = (id: string): PdfPage => ({
  kind: 'canvas',
  id,
  background: '#ffffff',
  elements: [],
})

const monter = (
  pages: PdfPage[],
  over: Partial<Parameters<typeof BandePages>[0]> = {},
) => {
  const props = {
    pages,
    courantId: pages[0]?.id ?? null,
    peutAjouterCalendrier: true,
    onChoisir: vi.fn(),
    onAjouterToile: vi.fn(),
    onAjouterCalendrier: vi.fn(),
    onSupprimer: vi.fn(),
    onDeplacer: vi.fn(),
    ...over,
  }
  render(<BandePages {...props} />)
  return props
}

const carte = (id: string) =>
  within(screen.getByTestId(`page-${id}`))

describe('BandePages', () => {
  it('montre une vignette par page, dans l ordre', () => {
    monter([toile('a'), { kind: 'calendar', id: 'c' }, toile('b')])
    const cartes = screen.getAllByTestId(/^page-/)
    expect(cartes.map((n) => n.dataset.testid)).toEqual([
      'page-a',
      'page-c',
      'page-b',
    ])
  })

  it('signale la page courante', () => {
    monter([toile('a'), toile('b')], { courantId: 'b' })
    expect(screen.getByTestId('page-b')).toHaveAttribute(
      'data-courante',
      'true',
    )
    expect(screen.getByTestId('page-a')).toHaveAttribute(
      'data-courante',
      'false',
    )
  })

  it('previent du choix d une page', async () => {
    const props = monter([toile('a'), toile('b')])
    await userEvent.click(carte('b').getByRole('button', { name: /Page 2/ }))
    expect(props.onChoisir).toHaveBeenCalledWith('b')
  })

  it('nomme la page calendrier au lieu de la numeroter', () => {
    monter([toile('a'), { kind: 'calendar', id: 'c' }])
    expect(
      carte('c').getByRole('button', { name: /Calendrier/ }),
    ).toBeInTheDocument()
  })

  it('avance et recule une page', async () => {
    const props = monter([toile('a'), toile('b')], { courantId: 'b' })
    await userEvent.click(carte('b').getByRole('button', { name: 'Avancer' }))
    expect(props.onDeplacer).toHaveBeenCalledWith('b', 'avant')
    await userEvent.click(carte('a').getByRole('button', { name: 'Reculer' }))
    expect(props.onDeplacer).toHaveBeenCalledWith('a', 'arriere')
  })

  it('n avance pas la premiere ni ne recule la derniere', () => {
    monter([toile('a'), toile('b')])
    expect(carte('a').getByRole('button', { name: 'Avancer' })).toBeDisabled()
    expect(carte('b').getByRole('button', { name: 'Reculer' })).toBeDisabled()
  })

  it('supprime une page', async () => {
    const props = monter([toile('a'), toile('b')])
    await userEvent.click(
      carte('a').getByRole('button', { name: /Supprimer/ }),
    )
    expect(props.onSupprimer).toHaveBeenCalledWith('a')
  })

  // Review Focus 2 : le schema exige au moins une page, l'ecran l'empeche avant le 400.
  it('ne propose pas de supprimer la seule page', () => {
    monter([toile('a')])
    expect(
      carte('a').getByRole('button', { name: /Supprimer/ }),
    ).toBeDisabled()
  })

  it('ajoute une toile', async () => {
    const props = monter([toile('a')])
    await userEvent.click(screen.getByRole('button', { name: /Ajouter une page/ }))
    expect(props.onAjouterToile).toHaveBeenCalled()
  })

  // Review Focus 3 : le bouton disparait quand le calendrier est deja la.
  it('ne propose la page calendrier que s il n y en a pas', async () => {
    const props = monter([toile('a')])
    await userEvent.click(
      screen.getByRole('button', { name: /Ajouter le calendrier/ }),
    )
    expect(props.onAjouterCalendrier).toHaveBeenCalled()

    screen.getByRole('button', { name: /Ajouter une page/ })
    monter([toile('a'), { kind: 'calendar', id: 'c' }], {
      peutAjouterCalendrier: false,
    })
    expect(
      screen.queryAllByRole('button', { name: /Ajouter le calendrier/ }),
    ).toHaveLength(1)
  })
})
```

**Note sur le dernier cas** : `render` est appelé deux fois dans le même test, donc deux arbres coexistent — d'où le `toHaveLength(1)` (le bouton du premier montage seulement). C'est volontaire et c'est la raison du commentaire ; si vous préférez, scindez en deux `it` avec un `cleanup()` entre les deux.

- [ ] **Step 2: Lancer les tests pour les voir échouer**

```bash
cd front && npx vitest run src/components/custom/pdf-design/editor/bande-pages.test.tsx
```

Attendu : ÉCHEC, module introuvable.

- [ ] **Step 3: Écrire la bande**

```tsx
import { CalendarPlus, FilePlus, Trash2 } from 'lucide-react'

import type { PdfPage } from '../../../../types/pdfDesign.ts'
import { MoveButtons } from '../../../settings/iconButton.tsx'
import { Button } from '../../../ui/button.tsx'
import Vignette from '../vignette.tsx'
import type { SensDePage } from './pages.ts'

const LARGEUR_VIGNETTE = 72

type BandePagesProps = {
  pages: PdfPage[]
  courantId: string | null
  peutAjouterCalendrier: boolean
  onChoisir: (id: string) => void
  onAjouterToile: () => void
  onAjouterCalendrier: () => void
  onSupprimer: (id: string) => void
  onDeplacer: (id: string, sens: SensDePage) => void
}

// Le calendrier porte son nom plutot qu'un numero : il n'est pas une page qu'on compose, et
// l'appeler « Page 2 » laisserait croire qu'on peut y poser un texte.
const nomDePage = (page: PdfPage, rang: number) =>
  page.kind === 'calendar' ? 'Calendrier' : `Page ${rang + 1}`

export default function BandePages({
  pages,
  courantId,
  peutAjouterCalendrier,
  onChoisir,
  onAjouterToile,
  onAjouterCalendrier,
  onSupprimer,
  onDeplacer,
}: BandePagesProps) {
  // Les toiles sont numerotees entre elles : inserer le calendrier au milieu ne doit pas
  // faire sauter la couverture de « Page 1 » a « Page 2 ».
  let rangDeToile = -1

  return (
    <div className="flex items-start gap-3 overflow-x-auto pb-1">
      {pages.map((page, rang) => {
        if (page.kind === 'canvas') {
          rangDeToile += 1
        }
        const courante = page.id === courantId
        return (
          <div
            key={page.id}
            data-testid={`page-${page.id}`}
            data-courante={courante ? 'true' : 'false'}
            className="flex flex-col items-center gap-1 flex-shrink-0"
          >
            <button
              type="button"
              onClick={() => onChoisir(page.id)}
              className={
                courante
                  ? 'rounded-xs outline outline-2 outline-primary'
                  : 'rounded-xs outline outline-1 outline-transparent'
              }
            >
              <Vignette page={page} largeur={LARGEUR_VIGNETTE} />
              <span className="sr-only">{nomDePage(page, rangDeToile)}</span>
            </button>
            <span className="text-[11px] text-text-light" aria-hidden="true">
              {nomDePage(page, rangDeToile)}
            </span>
            <div className="flex items-center">
              <MoveButtons
                upLabel="Avancer"
                downLabel="Reculer"
                upDisabled={rang === 0}
                downDisabled={rang === pages.length - 1}
                onUp={() => onDeplacer(page.id, 'avant')}
                onDown={() => onDeplacer(page.id, 'arriere')}
              />
              <Button
                variant="ghost"
                size="sm"
                aria-label={`Supprimer ${nomDePage(page, rangDeToile)}`}
                disabled={pages.length <= 1}
                onClick={() => onSupprimer(page.id)}
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )
      })}

      <div className="flex flex-col gap-2 flex-shrink-0 pt-1">
        <Button variant="outline" size="sm" onClick={onAjouterToile}>
          <FilePlus className="w-4 h-4" />
          Ajouter une page
        </Button>
        {peutAjouterCalendrier && (
          <Button variant="outline" size="sm" onClick={onAjouterCalendrier}>
            <CalendarPlus className="w-4 h-4" />
            Ajouter le calendrier
          </Button>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Lancer les tests pour les voir passer**

```bash
cd front && npx vitest run src/components/custom/pdf-design/editor/bande-pages.test.tsx && npx tsc -b
```

Attendu : PASS, 10 tests.

- [ ] **Step 5: Lint et commit**

```bash
cd front && npx biome check --write src/components/custom/pdf-design
git add front && git commit -m "feat(pdf): bande de pages avec vignettes, ordre et suppression"
```

---

### Task 6: Brancher la bande dans l'éditeur, et la vignette sur les cartes

**Files:**
- Modify: `front/src/routes/_authenticated/e/$establishmentId/s/$serviceId/_settings/pdf-patient/$designId.tsx`
- Test: `front/src/routes/_authenticated/e/$establishmentId/s/$serviceId/_settings/pdf-patient/$designId.test.tsx`
- Modify: `front/src/components/custom/pdf-design/design-card.tsx`
- Test: `front/src/routes/_authenticated/e/$establishmentId/s/$serviceId/_settings/pdf-patient/index.test.tsx`

**Interfaces:**
- Consumes: `BandePages` (tâche 5), `Vignette` (tâche 4), le `useEdition` élargi (tâche 3).
- Produces: rien pour les tâches suivantes.

- [ ] **Step 1: Écrire les tests de l'éditeur qui échouent**

Ajouter à `$designId.test.tsx`. Le harnais `monter()` du fichier sert un design à une seule page ; ces cas ont besoin d'un contenu à deux pages, d'où le paramètre.

Remplacer la fabrique `contenu` du fichier par :

```tsx
const contenu = (x: number, avecCalendrier = false): PdfDesignContent => ({
  version: 1,
  pages: [
    {
      kind: 'canvas',
      id: 'cover',
      background: '#ffffff',
      elements: [
        {
          id: 'titre',
          kind: 'rect',
          x,
          y: 20,
          w: 100,
          h: 30,
          rotation: 0,
          fill: '#e05a5a',
          radius: 0,
        },
      ],
    },
    ...(avecCalendrier
      ? [{ kind: 'calendar' as const, id: 'calendrier' }]
      : []),
  ],
})
```

et `design` / `monter` pour qu'ils passent le drapeau :

```tsx
const design = (x: number, avecCalendrier = false) => ({
  id: 'd1',
  name: 'Mon programme',
  content: contenu(x, avecCalendrier),
  isDefault: false,
})

const monter = (avecCalendrier = false) => {
  let enBase = design(10, avecCalendrier)
  // … le reste du corps est inchangé
}
```

Puis les nouveaux cas :

```tsx
describe('editeur de design, les pages', () => {
  it('montre une vignette par page', async () => {
    monter(true)
    expect(await screen.findByTestId('page-cover')).toBeInTheDocument()
    expect(screen.getByTestId('page-calendrier')).toBeInTheDocument()
  })

  it('ajoute une page et s y place', async () => {
    monter()
    await screen.findByTestId('page-cover')

    await userEvent.click(
      screen.getByRole('button', { name: /Ajouter une page/ }),
    )

    await waitFor(() => {
      expect(screen.getAllByTestId(/^page-/)).toHaveLength(2)
    })
  })

  // Review Focus 5 : une page calendrier n'a pas de toile. L'editeur doit le dire.
  it('explique qu une page calendrier ne se compose pas', async () => {
    monter(true)
    await userEvent.click(
      within(await screen.findByTestId('page-calendrier')).getByRole('button', {
        name: /Calendrier/,
      }),
    )

    expect(
      screen.getByText(/produite a partir des rendez-vous/i),
    ).toBeInTheDocument()
  })

  it('ne propose pas une seconde page calendrier', async () => {
    monter(true)
    await screen.findByTestId('page-cover')
    expect(
      screen.queryByRole('button', { name: /Ajouter le calendrier/ }),
    ).not.toBeInTheDocument()
  })
})
```

Importer `within` depuis `@testing-library/react` en tête du fichier s'il n'y est pas.

- [ ] **Step 2: Lancer pour voir échouer**

```bash
cd front && npx vitest run "src/routes/_authenticated/e/\$establishmentId/s/\$serviceId/_settings/pdf-patient/\$designId.test.tsx"
```

Attendu : ÉCHEC des quatre nouveaux cas (`page-cover` introuvable).

- [ ] **Step 3: Brancher la bande dans l'éditeur**

Dans `$designId.tsx`, remplacer la déstructuration de `useEdition` (`pagesEditables` → `pages` et les nouvelles opérations) :

```tsx
  const {
    contenu,
    pages,
    pageCourante,
    peutAjouterCalendrier,
    choisirPage,
    ajouterToile,
    ajouterCalendrier,
    supprimerPage,
    deplacerPage,
    selection,
    choisirElement,
    modifierElement,
    ajouterElement,
    supprimerSelection,
    dupliquerSelection,
    changerOrdre,
    remplacerContenu,
    marquerEnregistre,
    modifie,
  } = useEdition(design?.content ?? CONTENU_VIDE)
```

`elementSelectionne` doit tenir compte du `kind` :

```tsx
  const toileCourante = pageCourante?.kind === 'canvas' ? pageCourante : null
  const elementSelectionne =
    toileCourante?.elements.find((e) => e.id === selection) ?? null
```

Remplacer le bloc de boutons `{pagesEditables.length > 1 && !apercu && (…)}` par :

```tsx
        {!apercu && (
          <BandePages
            pages={pages}
            courantId={pageCourante?.id ?? null}
            peutAjouterCalendrier={peutAjouterCalendrier}
            onChoisir={choisirPage}
            onAjouterToile={ajouterToile}
            onAjouterCalendrier={ajouterCalendrier}
            onSupprimer={supprimerPage}
            onDeplacer={deplacerPage}
          />
        )}
```

Et la zone centrale rend la toile ou l'explication :

```tsx
            <div
              ref={cadre}
              className="flex-1 min-w-0 overflow-hidden flex items-start justify-center"
            >
              {toileCourante ? (
                <ToileEditable
                  page={toileCourante}
                  echelle={echelle}
                  selection={selection}
                  onSelect={choisirElement}
                  onModifier={modifierElement}
                />
              ) : (
                <p className="text-sm text-text-light self-center max-w-md text-center">
                  Cette page est produite à partir des rendez-vous du patient :
                  son contenu change d'un patient à l'autre, il ne se compose
                  pas ici. L'aperçu PDF la montre telle qu'elle sortira.
                </p>
              )}
            </div>
```

La palette et l'inspecteur n'ont de sens que sur une toile :

```tsx
            <aside className="w-40 flex-shrink-0 overflow-auto">
              {toileCourante && <Palette onAjouter={ajouterElement} />}
            </aside>
```

Ajouter l'import : `import BandePages from '@/components/custom/pdf-design/editor/bande-pages.tsx'`.

- [ ] **Step 4: Lancer pour voir passer**

```bash
cd front && npx vitest run "src/routes/_authenticated/e/\$establishmentId/s/\$serviceId/_settings/pdf-patient/\$designId.test.tsx" && npx tsc -b
```

Attendu : PASS, 10 tests.

- [ ] **Step 5: Écrire le test de la vignette sur les cartes**

Ajouter à `index.test.tsx` :

```tsx
  // La carte montrait « 3 pages » ; elle montre maintenant ce que le design donne.
  it('montre une vignette de la premiere page sur chaque carte', async () => {
    monter({ presets: [design('p1', 'Programme SMCV')], designs: [] })
    const carte = await carteDe('Programme SMCV')
    expect(carte.getByTestId('vignette-p1')).toBeInTheDocument()
  })
```

Le `CONTENU` du fichier porte déjà une page `p1`.

- [ ] **Step 6: Ajouter la vignette à la carte**

Dans `design-card.tsx`, au-dessus du titre :

```tsx
      {premierePage && (
        <Vignette page={premierePage} largeur={96} />
      )}
```

avec, en tête du composant :

```tsx
  const pages = design.content.pages
  const premierePage = pages[0]
```

et l'import `import Vignette from './vignette.tsx'`. Le bloc titre passe dans un conteneur horizontal :

```tsx
      <div className="flex items-start gap-3">
        {premierePage && <Vignette page={premierePage} largeur={96} />}
        <div className="flex items-start justify-between gap-2 flex-1 min-w-0">
          {/* le bloc nom + nombre de pages + badge, inchangé */}
        </div>
      </div>
```

- [ ] **Step 7: Lancer les deux écrans, typechecker, linter, commiter**

```bash
cd front && npx vitest run "src/routes/_authenticated/e/\$establishmentId/s/\$serviceId/_settings/pdf-patient" && npx tsc -b
cd front && npx biome check --write src/components/custom/pdf-design src/routes
git add front && git commit -m "feat(pdf): bande de pages dans l'editeur, vignette sur les cartes"
```

Attendu : les deux fichiers d'écran verts, typecheck muet.

---

### Task 7: Vérification à l'écran et cas limites

Aucun test ne remplace cette tâche : la bande est une affaire de gestes, et l'étape 2 a montré que trois défauts sur quatre ne se voyaient qu'à l'écran.

**Avant de commencer, deux pièges de cette session, relevés à l'étape 2 :**
- L'éditeur pose un `beforeunload`. **Enregistrer ou annuler AVANT toute navigation**, sinon la boîte « Quitter le site ? » fige l'onglet et le navigateur piloté ne répond plus.
- Le back du worktree tourne sur un port libre (3007) avec `CORS_ORIGIN` pointant sur le front du worktree (4277) ; ne pas toucher aux serveurs 3000/4270 de l'utilisateur.

- [ ] **Step 1: Le parcours complet**

Dupliquer « Programme SMCV », ouvrir l'éditeur. Vérifier : la bande montre trois vignettes (couverture, Calendrier, conseils) avec la couverture entourée ; cliquer la page conseils la montre dans la zone centrale ; cliquer Calendrier affiche la phrase d'explication et fait disparaître palette et inspecteur ; « Ajouter une page » crée une quatrième vignette blanche et s'y place ; y poser un texte et le voir apparaître dans la vignette ; « Avancer » sur la dernière la remonte d'un rang, et la numérotation des pages suit ; supprimer une page ; enregistrer ; recharger et retrouver l'ordre.

- [ ] **Step 2: Les cas limites**

- **Supprimer la page affichée** : la zone centrale doit montrer une autre page, jamais du vide.
- **Un design d'une seule page** : le bouton Supprimer de cette page est désactivé.
- **Le calendrier déjà présent** : « Ajouter le calendrier » est absent. Le supprimer le fait réapparaître.
- **Calendrier en première page** : le déplacer tout à gauche, enregistrer, générer le PDF d'un vrai patient — le planning doit sortir en premier, le reste derrière, sans erreur.
- **Une page vierge ajoutée puis laissée vide** : le PDF doit contenir une page blanche, pas sauter la page ni échouer.
- **L'écran liste** : chaque carte montre la vignette de sa première page, et le modèle livré comme les designs du service.

- [ ] **Step 3: Comparer l'aperçu au vrai PDF**

Basculer « Aperçu PDF » : le nombre de pages et leur ordre doivent correspondre exactement à la bande. Un écart d'ordre est un défaut, pas une approximation de rendu.

- [ ] **Step 4: Toutes les suites, lint, commit**

```bash
cd back && npx tsc --noEmit -p src/main/tsconfig.json && npx biome ci src
cd back && NODE_OPTIONS=--experimental-vm-modules npx -y dotenv-cli@7.3.0 -e .env.test.local -e .env.test -- npx jest --runInBand -c src/test/jest.config.ts
cd front && npx tsc -b && npx vitest run
git add -A && git commit -m "feat(pdf): etape 3 verifiee a l'ecran"
```

Attendu : back et front verts, aucun constat Biome nouveau sur les fichiers de la branche.

---

## Ce que l'étape 3 ne fait pas

Nommé ici pour qu'aucun de ces manques ne passe pour un oubli :

- **Dupliquer une page** — copier une toile entière avec ses éléments. Facile à ajouter sur `pages.ts` quand l'envie viendra ; personne ne l'a demandé.
- **Glisser-déposer dans la bande** — choix explicite : les flèches sont le motif du dépôt, sans dépendance.
- **Choisir le format ou l'orientation d'une page** — tout est A4 portrait, comme dans la spec.
- **Un fond par page autre que blanc** — le schéma porte `background`, l'inspecteur ne l'expose pas encore (il n'expose que les éléments).
- **Déposer ses propres images** — étape 4.
- **L'écran super-admin des presets** — étape 5.
- **Un verrou optimiste à l'enregistrement** — toujours pas : deux onglets, le dernier gagne.
