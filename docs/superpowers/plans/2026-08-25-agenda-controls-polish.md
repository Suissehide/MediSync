# Agenda : ordre des contrôles de date et lisibilité de la colonne Patients — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Empêcher le bandeau semaine de se déplacer quand `Aujourd'hui` apparaît, uniformiser la position du bouton calendrier avec `/suivi`, réduire à deux le nombre de pastilles affichées, et rendre visibles le bouton de dépliage et le bouton de gestion des patients.

**Architecture:** Trois changements indépendants. Le premier remonte le bouton `Aujourd'hui` de `WeekDayStrip` vers la page et réordonne les contrôles de deux en-têtes. Le deuxième est une constante. Le troisième change deux styles dans la cellule Patients.

**Tech Stack:** React 19, TypeScript, TanStack Router / Table, MUI X Date Pickers, dayjs, Tailwind, lucide-react.

**Spec:** `docs/superpowers/specs/2026-08-25-agenda-controls-polish-design.md`

## Global Constraints

- **Aucun changement back.** Ni Prisma, ni routes, ni repositories, ni schémas.
- **Pas de test runner dans le front.** `front/package.json` ne définit que `dev`, `build`, `lint`, `preview` : ni Vitest, ni Jest, ni Testing Library. **N'installez aucune dépendance de test et ne créez aucun fichier `*.test.*`.** Le cycle rouge/vert du TDD est remplacé, à chaque tâche, par `npx tsc -b` + `npx biome lint <fichiers touchés>` + `npm run build`.
- **Le lint global est rouge sur une dette préexistante** (~39 erreurs sur 205 fichiers, sans rapport). N'utilisez jamais `npm run lint` comme critère ; lintez uniquement les fichiers que vous touchez.
- **Toutes les commandes `npx` / `npm` se lancent depuis `front/`.**
- **Ne touchez ni `front/src/components/ui/button.tsx` ni `front/src/styles/_colors.css`.** La variante `ghost` a bien une bordure invisible (`--card` et `--muted` partagent la même valeur dans les deux thèmes), c'est la cause racine du bouton qui disparaît, et la décision explicite est de **ne pas** la corriger dans ce lot : elle changerait l'apparence d'écrans dont personne n'a signalé de problème.
- **Biome traite `noUnusedVariables` et `noUnusedImports` comme des erreurs**, pas des warnings.
- **Imports :** chemins relatifs avec extension explicite (`.ts` / `.tsx`).
- **Commits :** un par tâche, message en français, préfixe conventionnel.

## Structure des fichiers

| Fichier | Rôle | Tâche |
| --- | --- | --- |
| `front/src/components/custom/weekDayStrip.tsx` (modifié) | Perd son bouton `Aujourd'hui` ; redevient strictement le bandeau. | 1 |
| `front/src/routes/_authenticated/agenda.tsx` (modifié) | Porte le bouton `Aujourd'hui` et réordonne ses trois contrôles. | 1 |
| `front/src/routes/_authenticated/suivi.tsx` (modifié) | Le bouton calendrier passe en tête de son groupe. | 1 |
| `front/src/components/custom/agenda/chip.ts` (modifié) | `MAX_VISIBLE_CHIPS` passe à 2. | 2 |
| `front/src/components/custom/agenda/patientCell.tsx` (modifié) | Style du bouton de dépliage et variante du bouton de gestion. | 3 |

La tâche 1 réunit trois fichiers dans un commit : retirer le bouton de `WeekDayStrip` sans l'ajouter à la page ferait un commit intermédiaire où la fonctionnalité a disparu. `/suivi` y est joint parce que c'est le même livrable — la position des contrôles de date.

---

### Task 1: Réordonner les contrôles de date

**Files:**
- Modify: `front/src/components/custom/weekDayStrip.tsx` (la ligne `isOnToday` vers la 18, et le bloc du bouton vers les lignes 73-77)
- Modify: `front/src/routes/_authenticated/agenda.tsx` (ajout d'une constante dans le corps du composant, et le groupe de contrôles vers les lignes 103-127)
- Modify: `front/src/routes/_authenticated/suivi.tsx` (le groupe vers les lignes 202-233)

**Interfaces:**
- Consumes: `WeekDayStrip` (`value: Dayjs`, `onChange: (day: Dayjs) => void` — **inchangées**), `handleDayChange` déjà présent dans `agenda.tsx`.
- Produces: rien pour les autres tâches.

- [ ] **Step 1: Retirer le bouton de `WeekDayStrip`**

Dans `front/src/components/custom/weekDayStrip.tsx`, supprimer la ligne :

```tsx
  const isOnToday = value.isSame(today, 'day')
```

`today` est conservé : il sert toujours à `isCurrentDay`, le point sous le jour courant. Seul `isOnToday` disparaît — le laisser casserait le lint, `noUnusedVariables` étant une erreur ici.

Puis supprimer entièrement ce bloc, à la fin du rendu :

```tsx
      {!isOnToday && (
        <Button variant="outline" onClick={() => onChange(today)}>
          Aujourd&apos;hui
        </Button>
      )}
```

Le composant se termine désormais sur le bouton `Semaine suivante`. Ne touchez pas au reste : flèches, jours, point du jour courant, et les props `value` / `onChange` restent identiques.

- [ ] **Step 2: Calculer le jour courant dans la page**

Dans `front/src/routes/_authenticated/agenda.tsx`, immédiatement après l'accolade fermante de `handleDayChange`, ajouter :

```tsx
  const today = dayjs.utc().startOf('day')
```

Volontairement recalculé à chaque rendu, sans `useMemo` : mémoriser sur `[]` figerait « aujourd'hui » pour toute la vie de l'onglet, ce qui se verrait sur une session ouverte au passage de minuit.

- [ ] **Step 3: Réordonner le groupe de contrôles de l'agenda**

Le groupe est actuellement :

```tsx
          <div className="flex items-center gap-2">
            <WeekDayStrip value={selectedDay} onChange={handleDayChange} />

            <PopoverRoot>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label="Choisir une date"
                >
                  <CalendarDays className="w-4 h-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="p-0 w-auto">
```

Déplacer `<WeekDayStrip …/>` **à la fin** du groupe et insérer le bouton `Aujourd'hui` **au début**, ce qui donne :

```tsx
          <div className="flex items-center gap-2">
            {!selectedDay.isSame(today, 'day') && (
              <Button variant="outline" onClick={() => handleDayChange(today)}>
                Aujourd&apos;hui
              </Button>
            )}

            <PopoverRoot>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label="Choisir une date"
                >
                  <CalendarDays className="w-4 h-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="p-0 w-auto">
```

et, après la balise fermante `</PopoverRoot>` du sélecteur de date, avant le `</div>` qui ferme le groupe :

```tsx
            <WeekDayStrip value={selectedDay} onChange={handleDayChange} />
          </div>
```

Trois points :

- **C'est l'ordre qui règle le décalage.** Le groupe est aligné à droite (`justify-between` sur le conteneur parent, titre à gauche). Son bord droit est fixe : un élément qui apparaît **au début** du groupe le fait grandir vers la gauche, et tout ce qui est à sa droite — le bandeau — ne bouge pas. C'était l'inverse quand le bouton était en fin de groupe.
- Le bouton passe par `handleDayChange`, comme tous les autres chemins de changement de jour, donc le retour à aujourd'hui est persisté.
- Le contenu du `PopoverRoot` (le `DateCalendar`, sa reconstruction UTC, `align="end"`) ne change pas : seule sa position dans le groupe change.

- [ ] **Step 4: Déplacer le bouton calendrier de `/suivi`**

Dans `front/src/routes/_authenticated/suivi.tsx`, le groupe est :

```tsx
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" onClick={prevMonth}>
              <ChevronLeft className="w-5 h-5" />
            </Button>

            <span className="min-w-36 text-center font-medium capitalize">
              {date.format('MMMM YYYY')}
            </span>

            <PopoverRoot>
              …le sélecteur de mois…
            </PopoverRoot>

            <Button variant="outline" size="icon" onClick={nextMonth}>
              <ChevronRight className="w-5 h-5" />
            </Button>
          </div>
```

Déplacer le bloc `<PopoverRoot>…</PopoverRoot>` **avant** le bouton `prevMonth`, pour obtenir l'ordre `[🗓] [‹] [Mois AAAA] [›]` :

```tsx
          <div className="flex items-center gap-1">
            <PopoverRoot>
              …le sélecteur de mois, inchangé…
            </PopoverRoot>

            <Button variant="outline" size="icon" onClick={prevMonth}>
              <ChevronLeft className="w-5 h-5" />
            </Button>

            <span className="min-w-36 text-center font-medium capitalize">
              {date.format('MMMM YYYY')}
            </span>

            <Button variant="outline" size="icon" onClick={nextMonth}>
              <ChevronRight className="w-5 h-5" />
            </Button>
          </div>
```

Déplacez le bloc tel quel, sans en modifier une ligne : le `DateCalendar` de `/suivi` garde `views={['year', 'month']}`, `openTo="month"`, son `onChange` et son `align="center"`. Il raisonne par mois, contrairement à celui de l'agenda, et ce n'est pas le sujet ici.

Rien n'est instable dans cet en-tête, donc il n'y a aucun décalage à corriger : ce déplacement sert uniquement à ce que le bouton calendrier se trouve au même endroit sur les deux pages.

- [ ] **Step 5: Vérifier compilation, lint et build**

```bash
cd front && npx tsc -b
cd front && npx biome lint src/components/custom/weekDayStrip.tsx src/routes/_authenticated/agenda.tsx src/routes/_authenticated/suivi.tsx
cd front && npm run build
```

Attendu : `tsc` exit 0, zéro diagnostic biome sur les trois fichiers, build réussi. Un diagnostic `noUnusedVariables` sur `weekDayStrip.tsx` signale que `isOnToday` n'a pas été supprimé. Si `Button` devenait inutilisé dans `weekDayStrip.tsx`, ce serait le signe d'une suppression trop large — les flèches l'utilisent encore.

- [ ] **Step 6: Commit**

```bash
git add front/src/components/custom/weekDayStrip.tsx front/src/routes/_authenticated/agenda.tsx front/src/routes/_authenticated/suivi.tsx
git commit -m "fix(agenda): stabiliser le bandeau en plaçant Aujourd'hui et le calendrier à gauche"
```

---

### Task 2: Deux pastilles au lieu de trois

**Files:**
- Modify: `front/src/components/custom/agenda/chip.ts`

**Interfaces:**
- Consumes: rien.
- Produces: `MAX_VISIBLE_CHIPS` vaut désormais `2`. La colonne Soignant et la cellule Patients l'importent toutes deux et suivent donc le même seuil.

- [ ] **Step 1: Changer la constante**

Dans `front/src/components/custom/agenda/chip.ts`, remplacer :

```ts
/** Nombre de pastilles affichées avant le bouton de dépliage. */
export const MAX_VISIBLE_CHIPS = 3
```

par :

```ts
/** Nombre de pastilles affichées avant le bouton de dépliage. */
export const MAX_VISIBLE_CHIPS = 2
```

Ne touchez pas à `CHIP_CLASS`.

La constante est partagée avec la colonne Soignant de
`front/src/columns/dayAppointment.column.tsx`, qui suit donc le même seuil : un
créneau à trois soignants affichera désormais `(A) (B) +1`. C'est voulu — les
deux colonnes gardent une densité cohérente. **Ne scindez pas la constante en
deux valeurs** : c'est explicitement hors périmètre.

- [ ] **Step 2: Vérifier compilation, lint et build**

```bash
cd front && npx tsc -b
cd front && npx biome lint src/components/custom/agenda/chip.ts
cd front && npm run build
```

Attendu : `tsc` exit 0, zéro diagnostic biome, build réussi.

- [ ] **Step 3: Commit**

```bash
git add front/src/components/custom/agenda/chip.ts
git commit -m "feat(agenda): réduire à deux le nombre de pastilles affichées"
```

---

### Task 3: Rendre visibles les deux boutons de la cellule Patients

**Files:**
- Modify: `front/src/components/custom/agenda/patientCell.tsx` (constante de module en tête, la variante du bouton de gestion vers la ligne 22, la `className` du bouton de dépliage vers la ligne 84)

**Interfaces:**
- Consumes: `CHIP_CLASS` et `MAX_VISIBLE_CHIPS` depuis `./chip.ts` (inchangés dans cette tâche), `Button` depuis `../../ui/button.tsx`.
- Produces: rien pour les autres tâches.

- [ ] **Step 1: Déclarer la classe du bouton de dépliage**

Dans `front/src/components/custom/agenda/patientCell.tsx`, juste après le bloc d'imports et avant `type PatientCellProps`, ajouter :

```ts
/**
 * Le bouton de dépliage : même famille visuelle que les pastilles patients,
 * mais neutre et bordé, pour qu'il se lise comme un contrôle avant tout survol.
 */
const TOGGLE_CHIP_CLASS =
  'inline-flex items-center shrink-0 rounded-full border border-border px-2 py-0.5 text-xs font-medium text-muted-foreground cursor-pointer transition-colors hover:border-primary/40 hover:text-primary hover:bg-primary/5'
```

Cette classe reste **locale à ce fichier** et ne rejoint pas `chip.ts` : le `+N` de la colonne Soignant est un `<span>` inerte, et lui donner la même apparence annoncerait une interaction qui n'existe pas.

- [ ] **Step 2: Appliquer la classe au bouton de dépliage**

Le bouton porte aujourd'hui :

```tsx
            className="shrink-0 text-xs text-muted-foreground font-medium cursor-pointer hover:text-primary transition-colors"
```

Le remplacer par :

```tsx
            className={TOGGLE_CHIP_CLASS}
```

Ne touchez à rien d'autre sur ce bouton : `type="button"`, `onClick`, `aria-expanded`, `aria-label` et son contenu conditionnel (`{expanded ? 'Voir moins' : \`+${hidden}\`}`) restent identiques. Le `shrink-0` n'est pas perdu — il fait partie de `TOGGLE_CHIP_CLASS`.

- [ ] **Step 3: Rendre le bouton de gestion visible au survol de ligne**

Le bouton `+` est aujourd'hui :

```tsx
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label="Gérer les patients"
      className="shrink-0"
      onClick={() => onAddPatient(row)}
    >
```

Remplacer la variante :

```tsx
    <Button
      variant="outline"
      size="icon-sm"
      aria-label="Gérer les patients"
      className="shrink-0"
      onClick={() => onAddPatient(row)}
    >
```

Pourquoi il disparaissait : `ghost` vaut `bg-card border border-muted`, et `--card` comme `--muted` valent `#f1f5f9` en thème clair et `#1e293b` en sombre — la bordure est donc invisible par construction, et le fond gris très clair se confond avec le `hover:bg-primary/5` de la ligne survolée. `outline` vaut `border border-border bg-transparent` : `--border` est `#e2e8f0`, distinct de `--card`, donc la bordure se voit ; et le fond transparent laisse passer le survol de la ligne au lieu de le masquer.

**Ne corrigez pas la variante `ghost` elle-même** dans `button.tsx` : c'est la cause racine, elle est documentée comme dette connue dans la spec, et la toucher changerait l'apparence de tous les écrans qui l'utilisent. La taille `icon-sm` ne change pas non plus — la borne `max-w-[216px]` du conteneur déplié en dépend.

- [ ] **Step 4: Vérifier compilation, lint et build**

```bash
cd front && npx tsc -b
cd front && npx biome lint src/components/custom/agenda/patientCell.tsx
cd front && npm run build
```

Attendu : `tsc` exit 0, zéro diagnostic biome, build réussi.

- [ ] **Step 5: Contrôle manuel (couvre les trois tâches)**

Lancer `cd front && npm run dev`, se connecter, puis vérifier :

**Le décalage — le contrôle central :**
1. Sur `/agenda`, partir du jour courant, cliquer une flèche de semaine, puis revenir. Le bandeau des sept jours ne doit **pas** se déplacer horizontalement quand `Aujourd'hui` apparaît puis disparaît. Repère utile : fixer du regard le bord gauche du bouton `‹`.
2. `Aujourd'hui` et le bouton calendrier sont à gauche du bandeau, dans cet ordre.
3. Cliquer `Aujourd'hui` ramène au jour courant ; recharger la page confirme que le choix a bien été persisté.
4. Le calendrier s'ouvre toujours et choisir une date fonctionne comme avant.
5. Sur `/suivi`, le bouton calendrier est à gauche de la flèche `‹`, et le calendrier s'ouvre toujours sur la **vue mois**, pas sur une grille de jours.

**Les pastilles :**
6. Une ligne à trois patients affiche deux pastilles puis `+1` ; une ligne à deux patients n'affiche aucun bouton de dépliage.
7. La colonne Soignant suit le même seuil de deux.
8. Déplier fonctionne toujours : la ligne grandit, les pastilles passent à la ligne, la table ne s'élargit pas.

**La visibilité :**
9. Le `+X` se lit comme un bouton **sans le survoler** — bordure visible au repos — et vire au `primary` au survol. Idem pour `Voir moins` une fois déplié.
10. **Le défaut d'origine** : survoler une ligne du tableau. Le bouton `+` doit rester nettement visible, bordure comprise, sur le fond de survol.
11. Refaire le point 10 **en thème sombre** : la collision de couleurs existait dans les deux thèmes, la corriger dans l'un ne prouve rien pour l'autre.

Corriger tout écart avant de committer.

- [ ] **Step 6: Commit**

```bash
git add front/src/components/custom/agenda/patientCell.tsx
git commit -m "fix(agenda): rendre visibles le bouton de dépliage et le bouton de gestion"
```

---

## Hors périmètre (rappel de la spec)

- Corriger la variante `ghost` du design system.
- Scinder `MAX_VISIBLE_CHIPS` en deux seuils distincts.
- Rendre le `+N` de la colonne Soignant cliquable.
- Uniformiser autre chose entre `/agenda` et `/suivi`.
- Toute modification back.
