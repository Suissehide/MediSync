# Alignement des titres de page — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Faire tomber les titres de `/dashboard`, `/agenda`, `/patient` et `/suivi` exactement à la même hauteur, dans la même taille et le même format.

**Architecture:** Uniquement des classes utilitaires et une balise, réparties sur quatre fichiers de route. Un plancher `min-h-9` sur chaque ligne de titre égalise leur hauteur ; les marges verticales sont réglées pour produire le même décalage malgré deux stratégies de padding différentes, délibérément conservées.

**Tech Stack:** React 19, TypeScript, TanStack Router, Tailwind v4.

**Spec:** `docs/superpowers/specs/2026-08-25-page-header-alignment-design.md`

## Global Constraints

- **Aucun changement back.** Ni Prisma, ni routes, ni repositories, ni schémas.
- **Aucun composant nouveau.** Le remède de fond serait un `PageHeader` partagé ; la décision explicite est de ne pas le créer maintenant. N'introduisez aucune abstraction.
- **Ne touchez pas aux stratégies de padding des conteneurs.** `/dashboard` et `/suivi` n'ont volontairement pas de `p-6` : le calendrier de l'un est plein cadre, le tableau de l'autre porte son propre `px-6`. Ajouter du padding au conteneur padderait ces contenus. La seule exception autorisée est le `gap` de `/patient`, explicitement demandé par la tâche 2.
- **Ne touchez pas à `front/src/styles/_colors.css`.** `--text-dark` ne s'inverse pas en thème sombre et `--text-foreground` n'a pas de déclinaison sombre ; c'est une dette connue, documentée dans la spec, hors périmètre ici.
- **Ne touchez pas aux groupes de contrôles à droite des en-têtes** ni aux éléments de tête (pastilles, bouton retour) : ce lot ne concerne que la position, la hauteur et le format du titre.
- **Pas de test runner dans le front.** `front/package.json` ne définit que `dev`, `build`, `lint`, `preview` : ni Vitest, ni Jest, ni Testing Library. **N'installez aucune dépendance de test et ne créez aucun fichier `*.test.*`.** Le cycle rouge/vert est remplacé, à chaque tâche, par `npx tsc -b` + `npx biome lint <fichiers touchés>` + `npm run build`.
- **Le lint global est rouge sur une dette préexistante** (~39 erreurs sur 205 fichiers). N'utilisez jamais `npm run lint` comme critère ; lintez uniquement les fichiers que vous touchez.
- **Toutes les commandes `npx` / `npm` se lancent depuis `front/`.**
- **Commits :** un par tâche, message en français, préfixe conventionnel.

## Structure des fichiers

| Fichier | Ce qui change | Tâche |
| --- | --- | --- |
| `front/src/routes/_authenticated/dashboard.tsx` (modifié) | `min-h-9` sur la ligne de titre. | 1 |
| `front/src/routes/_authenticated/agenda.tsx` (modifié) | `min-h-9` sur la ligne, `h-9 flex items-center` retiré du titre. | 1 |
| `front/src/routes/_authenticated/patient/index.tsx` (modifié) | `gap-4`, `min-h-9`, `h2` → `h1`, jeton de couleur. | 2 |
| `front/src/routes/_authenticated/suivi.tsx` (modifié) | Marges, `gap-3`, `min-h-9`, typographie du titre. | 2 |

Le découpage sépare les deux pages qui ne changent **que** d'alignement (tâche 1, aucun changement de typographie) de celles qui changent aussi d'apparence (tâche 2). Un relecteur peut rejeter l'une en approuvant l'autre.

---

### Task 1: Aligner `/dashboard` et `/agenda`

**Files:**
- Modify: `front/src/routes/_authenticated/dashboard.tsx` (la ligne de titre, vers la ligne 155)
- Modify: `front/src/routes/_authenticated/agenda.tsx` (la ligne de titre vers la ligne 93, le `<h1>` vers la ligne 98)

**Interfaces:**
- Consumes: rien.
- Produces: rien pour la tâche 2 — les deux tâches sont indépendantes.

- [ ] **Step 1: Poser le plancher de hauteur sur `/dashboard`**

Dans `front/src/routes/_authenticated/dashboard.tsx`, la ligne de titre est :

```tsx
          <div className="px-6 mt-6 mb-4 flex gap-2 items-center">
```

La remplacer par :

```tsx
          <div className="px-6 mt-6 mb-4 min-h-9 flex gap-2 items-center">
```

C'est le **seul** changement sur cette page : ses marges (`px-6 mt-6 mb-4`) et son titre sont déjà à la cible, c'est la page de référence. Son `mb-4` doit être conservé : son conteneur n'a qu'un seul enfant direct, donc le `gap-4` de celui-ci ne s'applique jamais et la marge est ce qui produit les 16 px sous le titre.

Ne touchez ni à la pastille d'icône, ni au bouton d'effacement de la sélection, ni au `gap-2` — qui est l'écart entre la pastille et le titre, pas entre le titre et un groupe de contrôles.

- [ ] **Step 2: Poser le plancher de hauteur sur `/agenda`**

Dans `front/src/routes/_authenticated/agenda.tsx`, la ligne de titre est :

```tsx
        <div className="flex justify-between items-center gap-3 flex-wrap">
```

La remplacer par :

```tsx
        <div className="min-h-9 flex justify-between items-center gap-3 flex-wrap">
```

Cette page n'a pas de marges propres : le `p-6` de son conteneur fournit déjà les 24 px en haut et à gauche, et le `gap-4` du conteneur les 16 px en dessous. N'ajoutez pas de marge.

- [ ] **Step 3: Retirer la hauteur locale du titre de `/agenda`**

Le titre est :

```tsx
            <h1 className="h-9 flex items-center text-text-dark text-xl font-semibold">
```

Le remplacer par :

```tsx
            <h1 className="text-text-dark text-xl font-semibold">
```

Le `h-9 flex items-center` cherchait localement ce que le plancher de l'étape 2 donne désormais à toute la ligne. Le garder ne casserait rien, mais laisserait deux mécanismes concurrents pour un seul effet.

Ne touchez pas au contenu du titre (le `selectedDay.format(...).replace(...)`).

- [ ] **Step 4: Vérifier compilation, lint et build**

```bash
cd front && npx tsc -b
cd front && npx biome lint src/routes/_authenticated/dashboard.tsx src/routes/_authenticated/agenda.tsx
cd front && npm run build
```

Attendu : `tsc` exit 0, zéro diagnostic biome sur les deux fichiers, build réussi.

- [ ] **Step 5: Commit**

```bash
git add front/src/routes/_authenticated/dashboard.tsx front/src/routes/_authenticated/agenda.tsx
git commit -m "fix(ui): aligner la hauteur des en-têtes du dashboard et de l'agenda"
```

---

### Task 2: Aligner `/patient` et `/suivi`

**Files:**
- Modify: `front/src/routes/_authenticated/patient/index.tsx` (le conteneur vers la ligne 104, la ligne de titre vers la 105, le titre vers les lignes 113-115)
- Modify: `front/src/routes/_authenticated/suivi.tsx` (la ligne de titre vers la ligne 199, le titre vers la 200)

**Interfaces:**
- Consumes: rien.
- Produces: rien.

- [ ] **Step 1: Régler l'espacement du conteneur de `/patient`**

Dans `front/src/routes/_authenticated/patient/index.tsx` :

```tsx
      <div className="flex-1 bg-background p-6 rounded-lg flex flex-col w-full gap-3">
```

devient :

```tsx
      <div className="flex-1 bg-background p-6 rounded-lg flex flex-col w-full gap-4">
```

**Conséquence à connaître et à assumer :** ce `gap` s'applique entre **tous** les enfants directs du conteneur, pas seulement sous le titre. La barre de recherche et le tableau seront donc eux aussi espacés de 16 px au lieu de 12. C'est le prix d'obtenir les 16 px sous le titre par le `gap` plutôt que par une marge locale, et c'est le choix retenu : ajouter une marge au seul titre créerait un troisième mécanisme d'espacement sur une page qui en a déjà deux.

- [ ] **Step 2: Poser le plancher de hauteur sur `/patient`**

La ligne de titre est :

```tsx
        <div className="flex items-center gap-3">
```

La remplacer par :

```tsx
        <div className="min-h-9 flex items-center gap-3">
```

Gardez `gap-3` : c'est l'écart entre le bouton retour et le titre, pas entre le titre et un groupe de contrôles — cette page n'en a pas, sa barre de filtres est un bloc frère.

- [ ] **Step 3: Corriger la balise et la couleur du titre de `/patient`**

Le titre est :

```tsx
          <h2 className="text-text-foreground text-xl font-semibold">
            Liste des patients
          </h2>
```

Le remplacer par :

```tsx
          <h1 className="text-text-dark text-xl font-semibold">
            Liste des patients
          </h1>
```

Deux changements dans le même bloc : `h2` → `h1`, parce que c'est le titre de premier niveau de la page et que les trois autres pages utilisent `h1` — c'est une correction de structure de document, pas de style ; et `text-text-foreground` → `text-text-dark`, le jeton employé par les trois autres.

- [ ] **Step 4: Régler les marges et l'espacement de `/suivi`**

Dans `front/src/routes/_authenticated/suivi.tsx`, la ligne de titre est :

```tsx
        <div className="px-6 mt-4 mb-6 flex justify-between items-center gap-4">
```

La remplacer par :

```tsx
        <div className="px-6 mt-6 min-h-9 flex justify-between items-center gap-3">
```

Trois changements, chacun pour une raison distincte :

- `mt-4` → `mt-6` : porte le décalage haut à 24 px, comme les trois autres pages.
- `mb-6` **supprimée, et non remplacée par `mb-4`** : le conteneur de cette page a deux enfants directs — la ligne de titre et le bloc du tableau — donc son `gap-4` s'applique et fournit déjà les 16 px. Ajouter une marge basse s'y **additionnerait** : le `mb-6` actuel produit 24 + 16 = 40 px, et un `mb-4` produirait encore 32 px. C'est le piège de cette page, et il est invisible si on la compare naïvement à `/dashboard`, dont le conteneur n'a qu'un seul enfant et dont la marge basse est donc nécessaire.
- `gap-4` → `gap-3` : aligne l'écart titre / contrôles sur celui de `/agenda`.

- [ ] **Step 5: Corriger la typographie du titre de `/suivi`**

Le titre est :

```tsx
          <h1 className="text-2xl font-bold">Suivi</h1>
```

Le remplacer par :

```tsx
          <h1 className="text-text-dark text-xl font-semibold">Suivi</h1>
```

C'est le seul titre du lot qui change de taille et de graisse : les trois autres pages sont déjà en `text-xl font-semibold`, et c'est cette majorité qui a été retenue comme référence.

- [ ] **Step 6: Vérifier compilation, lint et build**

```bash
cd front && npx tsc -b
cd front && npx biome lint src/routes/_authenticated/patient/index.tsx src/routes/_authenticated/suivi.tsx
cd front && npm run build
```

Attendu : `tsc` exit 0, build réussi. Sur `suivi.tsx`, attendez-vous à **exactement un** diagnostic — le warning préexistant `suivi.tsx lint/complexity/noExcessiveCognitiveComplexity` dans le rendu du corps de table, hors périmètre et à ne pas refactorer. `patient/index.tsx` doit être totalement propre.

- [ ] **Step 7: Contrôle manuel — mesuré, pas jugé à l'œil**

Lancer `cd front && npm run dev`, se connecter, puis, **sans redimensionner la fenêtre entre les pages** :

1. Ouvrir tour à tour `/dashboard`, `/agenda`, `/patient` et `/suivi`. Sur chacune, inspecter le `<h1>` dans les outils de développement et relever le `top` de sa boîte englobante. **Les quatre valeurs doivent être identiques.** C'est le contrôle qui valide tout le lot ; un écart de 2 px est précisément le défaut d'origine, et il ne se voit pas à l'œil nu.
2. Relever la hauteur calculée de chaque ligne de titre : 36 px sur les quatre.
3. Vérifier que les quatre titres partagent la même taille, la même graisse et la même couleur.
4. Mesurer l'espace entre le bas de la ligne de titre et le bloc suivant : 16 px sur les quatre. C'est le point où `/suivi` produisait 40 px.
5. **Contrôle anti-régression, le plus important après le point 1 :** sur `/dashboard`, le calendrier doit toujours toucher les bords du cadre ; sur `/suivi`, le tableau doit garder son retrait de 24 px. Ni l'un ni l'autre ne doit avoir gagné de padding.
6. Sur `/patient`, vérifier que le bouton retour fonctionne toujours, qu'il reste aligné avec le titre, et que l'espacement plus large entre la barre de recherche et le tableau (12 → 16 px, conséquence assumée de l'étape 1) ne casse rien.

Corriger tout écart avant de committer. Si l'écart mesuré au point 1 vient de
`/dashboard` ou `/agenda` — les pages livrées par la tâche 1, déjà commitées —
corrigez-les dans un commit supplémentaire plutôt qu'en réécrivant l'historique,
et dites-le dans votre rapport.

- [ ] **Step 8: Commit**

```bash
git add front/src/routes/_authenticated/patient/index.tsx front/src/routes/_authenticated/suivi.tsx
git commit -m "fix(ui): aligner les en-têtes des pages patients et suivi"
```

---

## Hors périmètre (rappel de la spec)

- Créer un composant `PageHeader` partagé.
- Corriger les jetons `--text-dark` / `--text-foreground` pour le thème sombre.
- Unifier les stratégies de padding des conteneurs.
- Ajouter ou retirer un élément de tête sur une page.
- Les autres pages du projet, y compris les écrans `/settings/*`.
- Refactorer la complexité cognitive du corps de table de `/suivi`.
- Toute modification back.
