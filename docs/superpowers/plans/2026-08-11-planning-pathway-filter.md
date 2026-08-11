# Filtre parcours sur le planning admin — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter sur `/settings/planning` un menu déroulant de filtrage des créneaux par parcours, avec les parcours à inscription unique et les parcours multi-inscriptions présentés dans deux sections distinctes.

**Architecture :** Le composant générique existant `ui/dropdownFilter.tsx` est étendu de façon additive (sections, pastilles de couleur, action de réinitialisation) plutôt que dupliqué. Un composant `custom/planning/pathwayFilter.tsx` traduit la liste des modèles de parcours en items de ce filtre. `planning.tsx` porte uniquement l'état des entrées masquées et applique le filtre aux créneaux avant construction des événements du calendrier. Côté back, une correction du schéma de réponse expose l'`id` du modèle de parcours, sans lequel le rattachement créneau → parcours est impossible.

**Tech Stack :** React 19 + TanStack Router/Query, Radix `@radix-ui/react-dropdown-menu`, Tailwind, Biome ; côté back Fastify + Zod v4 (`fastify-type-provider-zod`).

**Spec :** `docs/superpowers/specs/2026-08-11-planning-pathway-filter-design.md`

## Global Constraints

- Style Biome front : indentation 2 espaces, guillemets simples, pas de point-virgule, groupes d'imports `:NODE: / :PACKAGE: / :BLANK_LINE: / :ALIAS: / :PATH:`.
- Règles Biome front en **erreur** à respecter : `style/useBlockStatements` (toujours des accolades, y compris pour un `if` d'une ligne), `style/noNegationElse`, `correctness/noUnusedImports`, `correctness/noUnusedVariables`, `suspicious/useAwait`.
- `performance/noBarrelFile` est en erreur : ne créer aucun `index.ts` de ré-export.
- Le front n'a **aucune infrastructure de test** (`front/package.json` ne définit que `dev`, `build`, `lint`, `preview`). Les portes de vérification front sont le typecheck, le lint ciblé et le contrôle manuel. Ne pas inventer de commande `npm test` côté front.
- Le lint front n'est **pas vert sur `main`** (39 erreurs préexistantes). La règle est donc : *aucune nouvelle violation sur les fichiers touchés*, pas « lint global vert ». Baseline des fichiers concernés, mesurée au moment de l'écriture de ce plan :
  - `src/components/ui/dropdownFilter.tsx` : **0 violation** — doit le rester.
  - `src/routes/_authenticated/_admin/settings/planning.tsx` : **1 erreur, 5 avertissements** — `useExhaustiveDependencies` en 566:3, `useOptionalChain` en 312:11, `noExcessiveCognitiveComplexity` en 80:10, 423:5, 483:5, 710:36.
  - `back/src/main/interfaces/http/fastify/schemas/pathway.schema.ts` : **0 violation** — doit le rester.
- Le composant `Planning` (ligne 80) dépasse déjà le seuil de complexité cognitive. Toute logique nouvelle non triviale va dans `pathwayFilter.tsx`, pas dans `planning.tsx`, pour ne pas aggraver l'avertissement.
- Les typechecks passent sur la base actuelle : `back → npx tsc --noemit` et `front → npx tsc -b` sortent tous deux en succès. Toute erreur de typecheck après modification est donc imputable à la tâche en cours.

---

## Structure des fichiers

| Fichier | Rôle | Tâche |
|---|---|---|
| `back/src/main/interfaces/http/fastify/schemas/pathway.schema.ts` | Modifier — exposer `template.id` dans la réponse `pathway` | 1 |
| `front/src/components/ui/dropdownFilter.tsx` | Modifier — sections, pastilles de couleur, action de réinitialisation ; exporte le type `DropdownFilterItem` | 2 |
| `front/src/components/custom/planning/pathwayFilter.tsx` | Créer — traduit `PathwayTemplate[]` + entrées masquées en items de filtre ; exporte `NO_PATHWAY_KEY` | 3 |
| `front/src/routes/_authenticated/_admin/settings/planning.tsx` | Modifier — état des masqués, filtrage des créneaux, rendu du bouton | 4 |

La tâche 1 est indépendante des autres. Les tâches 2 → 3 → 4 sont séquentielles.

---

## Task 1 : exposer l'`id` du modèle de parcours dans la réponse API

**Files:**
- Modify: `back/src/main/interfaces/http/fastify/schemas/pathway.schema.ts:1-7`

**Interfaces:**
- Consomme : rien.
- Produit : `GET /slots` renvoie désormais `slot.pathway.template.id` (`string`, cuid). C'est la clé sur laquelle la tâche 4 rattache un créneau à son modèle de parcours.

**Contexte.** `slot.repository.ts` fait déjà `pathway: { include: { template: true } }`, donc l'`id` est présent en base et dans l'objet Prisma. Mais `pathwaySchema` (`schemas/index.ts:117-126`) déclare `template: pathwayTemplateSchema`, et `pathwayTemplateSchema` (`schemas/index.ts:102-115`) ne comporte pas de champ `id`. Le `serializerCompiler` de `fastify-type-provider-zod` parse la réponse avec ce schéma, et un `z.object` Zod strippe les clés non déclarées. L'`id` est donc silencieusement retiré à la sortie.

- [ ] **Step 1 : écrire le contrôle qui échoue**

Depuis `back/`, créer un fichier temporaire `__check.ts` à la racine du dossier :

```ts
import { pathwayResponseSchema } from './src/main/interfaces/http/fastify/schemas/pathway.schema'

const out = pathwayResponseSchema.parse({
  id: 'clzzzzzzzzzzzzzzzzzzzzzzzz',
  startDate: new Date(),
  template: {
    id: 'cltttttttttttttttttttttttt',
    name: 'Parcours BPCO',
    color: '#ff0000',
    tags: [],
    motifRequired: false,
    firstAppointmentOnly: true,
  },
})
console.log('template.id =', (out as { template?: { id?: string } }).template?.id)
```

- [ ] **Step 2 : lancer le contrôle et vérifier qu'il échoue**

```bash
cd back && node -r @swc-node/register __check.ts
```

Attendu : `template.id = undefined` — l'`id` fourni en entrée a bien été stripé.

(`-r @swc-node/register` et non `--import .../esm-register` : `back/package.json` ne déclare pas `"type": "module"`, le hook CommonJS est le bon.)

- [ ] **Step 3 : corriger le schéma**

Remplacer les lignes 1 à 7 de `back/src/main/interfaces/http/fastify/schemas/pathway.schema.ts` par :

```ts
import { z } from 'zod/v4'

import { pathwaySchema, pathwayTemplateSchema } from './index'

export const pathwayResponseSchema = pathwaySchema.extend({
  id: z.cuid(),
  template: pathwayTemplateSchema
    .extend({ id: z.cuid() })
    .optional()
    .nullable(),
})
```

Le reste du fichier est inchangé. `schemas/index.ts` est le barrel volontairement partagé de schémas mutuellement récursifs mentionné dans `back/CLAUDE.md` — importer `pathwayTemplateSchema` depuis là est la pratique attendue, ce n'est pas une nouvelle exception à `noBarrelFile`.

- [ ] **Step 4 : relancer le contrôle et vérifier qu'il passe**

```bash
cd back && node -r @swc-node/register __check.ts
```

Attendu : `template.id = cltttttttttttttttttttttttt`

- [ ] **Step 5 : supprimer le fichier temporaire**

```bash
cd back && rm -f __check.ts
```

- [ ] **Step 6 : typecheck et lint**

```bash
cd back && npx tsc --noemit && npx biome lint src/main/interfaces/http/fastify/schemas/pathway.schema.ts
```

Attendu : aucune sortie d'erreur pour `tsc`, et `Checked 1 file … No fixes applied.` sans violation pour Biome.

- [ ] **Step 7 : commit**

```bash
cd /Users/couffinhal/Documents/MediSync
git add back/src/main/interfaces/http/fastify/schemas/pathway.schema.ts
git commit -m "fix(pathway): expose template id in pathway response schema"
```

---

## Task 2 : sections, couleurs et réinitialisation dans `DropdownFilter`

**Files:**
- Modify: `front/src/components/ui/dropdownFilter.tsx` (fichier entier, 63 lignes)

**Interfaces:**
- Consomme : rien.
- Produit :
  - `export type DropdownFilterItem = { id: string; label: string; checked: boolean; group?: string; color?: string }`
  - `DropdownFilter` (export par défaut) accepte en plus : `onReset?: () => void`, `resetLabel?: string` (défaut `'Tout afficher'`).

**Contrainte de non-régression.** Deux appelants existants passent uniquement `filters` / `onFilterChange` (+ `triggerLabel` / `TriggerIcon`) : `front/src/routes/_authenticated/patient/index.tsx:127` et `front/src/components/custom/Patient/pdf/programme-pdf-modal.tsx:98`. Les nouveaux champs étant tous optionnels et sans valeur par défaut visible, leur rendu doit rester strictement identique : pas de section, pas de pastille, pas d'entrée de réinitialisation.

- [ ] **Step 1 : réécrire le composant**

Contenu complet de `front/src/components/ui/dropdownFilter.tsx` :

```tsx
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { Check, Filter, type LucideIcon, RotateCcw } from 'lucide-react'
import { Fragment } from 'react'

import { cn } from '../../libs/utils.ts'
import { Button } from './button'

export type DropdownFilterItem = {
  id: string
  label: string
  checked: boolean
  group?: string
  color?: string
}

const DropdownFilter = ({
  filters,
  onFilterChange,
  triggerLabel = 'Filtres',
  TriggerIcon = Filter,
  onReset,
  resetLabel = 'Tout afficher',
}: {
  filters: DropdownFilterItem[]
  onFilterChange: (id: string, checked: boolean) => void
  triggerLabel?: string
  TriggerIcon?: LucideIcon
  onReset?: () => void
  resetLabel?: string
}) => {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <Button
          variant="outline"
          size="default"
          className="font-normal rounded-lg"
        >
          <TriggerIcon size={16} />
          {triggerLabel}
        </Button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className="min-w-[220px] max-h-80 overflow-y-auto bg-primary-foreground rounded shadow-md border border-border p-2 z-50"
          align="end"
          sideOffset={5}
          collisionPadding={8}
        >
          {filters.map((filter, index) => {
            const startsGroup =
              Boolean(filter.group) && filter.group !== filters[index - 1]?.group

            return (
              <Fragment key={filter.id}>
                {startsGroup && (
                  <>
                    {index > 0 && (
                      <DropdownMenu.Separator className="my-2 h-px bg-border" />
                    )}
                    <DropdownMenu.Label className="px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-text-light select-none">
                      {filter.group}
                    </DropdownMenu.Label>
                  </>
                )}

                <DropdownMenu.CheckboxItem
                  checked={filter.checked}
                  onCheckedChange={(checked) =>
                    onFilterChange(filter.id, checked)
                  }
                  onSelect={(e) => e.preventDefault()}
                  className={cn(
                    'flex items-center gap-2 px-3 py-2 rounded cursor-pointer outline-none',
                    'hover:bg-primary/20',
                  )}
                >
                  <div className="w-4 h-4 border border-primary rounded flex items-center justify-center">
                    {filter.checked && (
                      <Check size={12} strokeWidth={3} className="text-primary" />
                    )}
                  </div>
                  {filter.color && (
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: filter.color }}
                    />
                  )}
                  <span className="flex-1 text-sm select-none">
                    {filter.label}
                  </span>
                </DropdownMenu.CheckboxItem>
              </Fragment>
            )
          })}

          {onReset && (
            <>
              <DropdownMenu.Separator className="my-2 h-px bg-border" />
              <DropdownMenu.Item
                onSelect={(e) => {
                  e.preventDefault()
                  onReset()
                }}
                className="flex items-center gap-2 px-3 py-2 rounded cursor-pointer outline-none hover:bg-primary/20 text-sm select-none"
              >
                <RotateCcw size={14} />
                {resetLabel}
              </DropdownMenu.Item>
            </>
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}

export default DropdownFilter
```

Note sur `startsGroup` : la comparaison se fait avec le groupe de l'item **précédent**, ce qui suppose que les items sont fournis triés par groupe. La tâche 3 les construit dans cet ordre. Un item sans `group` (`Hors parcours`) ne déclenche jamais de libellé de section, et une section dont aucun item n'existe n'est tout simplement jamais rendue — c'est ce qui satisfait l'exigence « une section vide n'est pas affichée » de la spec, sans code dédié.

- [ ] **Step 2 : typecheck**

```bash
cd front && npx tsc -b
```

Attendu : sortie vide, code de retour 0.

- [ ] **Step 3 : lint ciblé — zéro violation**

```bash
cd front && npx biome lint src/components/ui/dropdownFilter.tsx
```

Attendu : `Checked 1 file … No fixes applied.` sans aucune violation (le fichier était propre avant, il doit le rester).

- [ ] **Step 4 : vérifier la non-régression des appelants existants**

Démarrer le front (`cd front && npm run dev`) puis :
- ouvrir la liste des patients (`/patient`) : le bouton `Filtres` s'ouvre, affiche les tags sans pastille de couleur, sans intitulé de section et sans entrée `Tout afficher` ; cocher/décocher un tag filtre toujours la liste ;
- ouvrir l'aperçu PDF d'un patient : le bouton `Pages additionnelles` se comporte de la même façon.

- [ ] **Step 5 : commit**

```bash
cd /Users/couffinhal/Documents/MediSync
git add front/src/components/ui/dropdownFilter.tsx
git commit -m "feat(ui): add groups, color dots and reset action to DropdownFilter"
```

---

## Task 3 : composant `PathwayFilter`

**Files:**
- Create: `front/src/components/custom/planning/pathwayFilter.tsx`

**Interfaces:**
- Consomme : `DropdownFilter` et `DropdownFilterItem` de la tâche 2 ; le type `PathwayTemplate` de `front/src/types/pathwayTemplate.ts` (champs utilisés : `id`, `name`, `color`, `firstAppointmentOnly`).
- Produit :
  - `export const NO_PATHWAY_KEY = '__no_pathway__'`
  - export par défaut `PathwayFilter`, de props `{ templates: PathwayTemplate[]; hiddenIds: Set<string>; onToggle: (id: string, checked: boolean) => void; onReset: () => void }`

- [ ] **Step 1 : créer le fichier**

Contenu complet de `front/src/components/custom/planning/pathwayFilter.tsx` :

```tsx
import { Route } from 'lucide-react'

import type { PathwayTemplate } from '../../../types/pathwayTemplate.ts'
import DropdownFilter, {
  type DropdownFilterItem,
} from '../../ui/dropdownFilter.tsx'

export const NO_PATHWAY_KEY = '__no_pathway__'

const NO_PATHWAY_COLOR = '#94a3b8'

type PathwayFilterProps = {
  templates: PathwayTemplate[]
  hiddenIds: Set<string>
  onToggle: (id: string, checked: boolean) => void
  onReset: () => void
}

function PathwayFilter({
  templates,
  hiddenIds,
  onToggle,
  onReset,
}: PathwayFilterProps) {
  const toItem = (template: PathwayTemplate): DropdownFilterItem => ({
    id: template.id,
    label: template.name,
    checked: !hiddenIds.has(template.id),
    group: template.firstAppointmentOnly ? 'Individuels' : 'Multiples',
    color: template.color,
  })

  const filters: DropdownFilterItem[] = [
    {
      id: NO_PATHWAY_KEY,
      label: 'Hors parcours',
      checked: !hiddenIds.has(NO_PATHWAY_KEY),
      color: NO_PATHWAY_COLOR,
    },
    ...templates.filter((template) => template.firstAppointmentOnly).map(toItem),
    ...templates
      .filter((template) => !template.firstAppointmentOnly)
      .map(toItem),
  ]

  const hiddenCount = hiddenIds.size
  const triggerLabel =
    hiddenCount > 0
      ? `Parcours · ${hiddenCount} masqué${hiddenCount > 1 ? 's' : ''}`
      : 'Parcours'

  return (
    <DropdownFilter
      filters={filters}
      onFilterChange={onToggle}
      triggerLabel={triggerLabel}
      TriggerIcon={Route}
      onReset={hiddenCount > 0 ? onReset : undefined}
    />
  )
}

export default PathwayFilter
```

Points d'attention :
- L'ordre du tableau `filters` matérialise la mise en page décrite par la spec : `Hors parcours` isolé en tête (sans `group`, donc sans libellé de section au-dessus de lui), puis la section `Individuels`, puis la section `Multiples`.
- `Route` est l'icône lucide déjà utilisée pour les parcours dans `custom/sidebar/pathway.sidebar.tsx`. Elle n'est importée que dans ce fichier : ne pas l'importer dans `planning.tsx`, où l'identifiant `Route` est déjà pris par le `export const Route = createFileRoute(...)` de TanStack Router.
- `NO_PATHWAY_COLOR` est un gris neutre littéral, dans la même veine que la couleur de repli `'#2563eb'` déjà codée en dur dans `front/src/libs/utils.ts`.

- [ ] **Step 2 : typecheck**

```bash
cd front && npx tsc -b
```

Attendu : sortie vide, code de retour 0. Le composant n'est encore monté nulle part ; c'est normal, la tâche 4 s'en charge.

- [ ] **Step 3 : lint ciblé — zéro violation**

```bash
cd front && npx biome lint src/components/custom/planning/pathwayFilter.tsx
```

Attendu : `Checked 1 file … No fixes applied.` sans violation.

- [ ] **Step 4 : commit**

```bash
cd /Users/couffinhal/Documents/MediSync
git add front/src/components/custom/planning/pathwayFilter.tsx
git commit -m "feat(planning): add PathwayFilter component"
```

---

## Task 4 : brancher le filtre dans la page planning

**Files:**
- Modify: `front/src/routes/_authenticated/_admin/settings/planning.tsx` (imports en tête ; état vers la ligne 158 ; `useEffect` des événements lignes 185-194 ; en-tête lignes 640-666)

**Interfaces:**
- Consomme : `PathwayFilter` et `NO_PATHWAY_KEY` de la tâche 3 ; `slot.pathway.template.id` rendu disponible par la tâche 1.
- Produit : rien pour d'autres tâches.

- [ ] **Step 1 : ajouter l'import**

Dans le bloc d'imports `:PATH:`, en respectant l'ordre alphabétique des chemins, ajouter après l'import de `dashboard.layout.tsx` :

```tsx
import PathwayFilter, {
  NO_PATHWAY_KEY,
} from '../../../../components/custom/planning/pathwayFilter.tsx'
```

- [ ] **Step 2 : ajouter l'état et ses deux gestionnaires**

Juste après la déclaration `const [selectedSlotIds, setSelectedSlotIds] = useState<Set<string>>(new Set())` (ligne 158) :

```tsx
  const [hiddenPathwayIds, setHiddenPathwayIds] = useState<Set<string>>(
    new Set(),
  )

  const handleTogglePathwayFilter = useCallback(
    (id: string, checked: boolean) => {
      setHiddenPathwayIds((prev) => {
        const next = new Set(prev)
        if (checked) {
          next.delete(id)
        } else {
          next.add(id)
        }
        return next
      })
    },
    [],
  )

  const handleResetPathwayFilter = useCallback(() => {
    setHiddenPathwayIds(new Set())
  }, [])
```

On stocke les entrées **masquées** et non les visibles : un `Set` vide signifie « tout visible », ce qui évite d'initialiser l'état de façon asynchrone à l'arrivée de `pathwayTemplates`, et rend visible par défaut tout parcours créé après le chargement de la page.

- [ ] **Step 3 : filtrer les créneaux avant construction des événements**

Remplacer le `useEffect` des lignes 185-194 :

```tsx
  useEffect(() => {
    if (slots) {
      setEvents(
        buildCalendarEventsFromSlots(
          slots,
          editMode ? ['editable'] : ['default'],
        ),
      )
    }
  }, [slots, editMode])
```

par :

```tsx
  const visibleSlots = useMemo(() => {
    if (!slots) {
      return []
    }
    if (hiddenPathwayIds.size === 0) {
      return slots
    }
    return slots.filter(
      (slot) =>
        !hiddenPathwayIds.has(slot.pathway?.template?.id ?? NO_PATHWAY_KEY),
    )
  }, [slots, hiddenPathwayIds])

  useEffect(() => {
    setEvents(
      buildCalendarEventsFromSlots(
        visibleSlots,
        editMode ? ['editable'] : ['default'],
      ),
    )
  }, [visibleSlots, editMode])
```

Le garde `if (slots)` disparaît : `visibleSlots` vaut `[]` tant que la requête n'a pas répondu, et `events` est déjà initialisé à `[]`, donc le comportement observable est identique. `useMemo` est déjà importé en tête de fichier (ligne 21), il n'y a pas d'import à ajouter.

- [ ] **Step 4 : rendre le bouton dans l'en-tête**

Dans `<div className="flex justify-end items-center gap-2">` (ligne 640), insérer ce bloc **avant** le `{!editMode && (<DropdownMenu.Root>` du menu `Actions` :

```tsx
            {!editMode && view === 'calendar' && (
              <PathwayFilter
                templates={pathwayTemplates ?? []}
                hiddenIds={hiddenPathwayIds}
                onToggle={handleTogglePathwayFilter}
                onReset={handleResetPathwayFilter}
              />
            )}
```

`pathwayTemplates` est déjà récupéré ligne 83 via `usePathwayTemplateQueries()`, aucun appel de requête supplémentaire n'est nécessaire.

- [ ] **Step 5 : typecheck**

```bash
cd front && npx tsc -b
```

Attendu : sortie vide, code de retour 0.

- [ ] **Step 6 : lint ciblé — pas de nouvelle violation**

```bash
cd front && npx biome lint src/routes/_authenticated/_admin/settings/planning.tsx
```

Attendu : toujours **1 erreur et 5 avertissements**, et uniquement les six violations préexistantes listées dans les Global Constraints (`useExhaustiveDependencies`, `useOptionalChain`, quatre `noExcessiveCognitiveComplexity`). Les numéros de ligne auront bougé du fait des insertions ; ce sont les règles et le décompte qui font foi. Toute violation d'une règle absente de cette liste, ou tout décompte supérieur, doit être corrigé avant de commiter.

- [ ] **Step 7 : contrôle manuel**

`cd front && npm run dev`, puis sur `/settings/planning`, le back tournant (`cd deploy && docker compose --profile db up -d` puis `cd back && npm start`) :

1. Le bouton `Parcours` apparaît à gauche de `Actions` en vue Calendrier ; il disparaît en vue Timeline et lorsqu'on entre en mode édition d'un parcours depuis la sidebar.
2. Le menu affiche `Hors parcours` en tête, puis la section `INDIVIDUELS`, puis `MULTIPLES`. Un modèle dont la case « Inscription au premier RDV uniquement » est cochée (formulaire d'ajout/édition de parcours) apparaît sous `INDIVIDUELS`, les autres sous `MULTIPLES`.
3. Toutes les cases sont cochées à l'ouverture et l'entrée `Tout afficher` est absente.
4. Décocher un parcours retire ses créneaux du calendrier ; le libellé du bouton devient `Parcours · 1 masqué`, puis `Parcours · 2 masqués` au second décochage.
5. `Tout afficher` réaffiche tout et fait disparaître sa propre entrée.
6. Décocher `Hors parcours` retire les créneaux créés à la main (ceux qui n'ont pas été instanciés depuis un parcours).
7. Dans l'onglet réseau, la réponse de `GET /slots` contient bien `pathway.template.id` — s'il est absent, la tâche 1 n'a pas été appliquée et tous les créneaux seraient traités comme « hors parcours ».
8. La sélection multiple de créneaux et les actions groupées (dupliquer / déplacer) continuent de fonctionner ; masquer un parcours ne vide pas la sélection en cours.

- [ ] **Step 8 : commit**

```bash
cd /Users/couffinhal/Documents/MediSync
git add front/src/routes/_authenticated/_admin/settings/planning.tsx
git commit -m "feat(planning): filter calendar slots by pathway"
```

---

## Hors périmètre

- Filtrage de la vue Timeline.
- Persistance du filtre entre deux sessions.
- Filtrage par thématique, lieu ou soignant.
- Correction des violations Biome préexistantes de `planning.tsx`.
