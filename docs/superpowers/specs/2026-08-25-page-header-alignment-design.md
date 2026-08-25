# Aligner les titres de page de `/dashboard`, `/agenda`, `/patient` et `/suivi`

Date : 2026-08-25
Portée : front uniquement. Quatre en-têtes de page, uniquement des classes
utilitaires et une balise. Aucun composant nouveau, aucun changement back,
aucune migration.

## Problème

Les titres des quatre pages principales ne tombent ni à la même hauteur, ni dans
le même format. L'état actuel :

| Page | Padding du conteneur | Marges de la ligne | Balise | Typographie | Élément de tête |
| --- | --- | --- | --- | --- | --- |
| `/dashboard` | aucun, `gap-4` | `px-6 mt-6 mb-4` | `h1` | `text-xl font-semibold text-text-dark` | pastille `CalendarRange` |
| `/agenda` | `p-6`, `gap-4` | aucune | `h1` avec `h-9 flex items-center` | `text-xl font-semibold text-text-dark` | pastille `CalendarDays` |
| `/patient` | `p-6`, `gap-3` | aucune | **`h2`** | `text-xl font-semibold` **`text-text-foreground`** | bouton retour |
| `/suivi` | aucun, `gap-4` | `px-6 mt-4 mb-6` | `h1` | **`text-2xl font-bold`** | aucun |

Quatre causes distinctes, dont deux invisibles à la lecture d'un seul fichier :

1. **Deux stratégies de padding.** Deux pages paient leur marge par `p-6` sur le
   conteneur, deux par `px-6 mt-X mb-Y` sur la ligne de titre — avec des valeurs
   verticales différentes (`mt-6 mb-4` contre `mt-4 mb-6`).
2. **Des hauteurs de ligne différentes.** La hauteur d'une ligne est celle de son
   plus grand enfant. Sur `/dashboard` c'est la pastille d'icône (32 px), partout
   ailleurs c'est un bouton `size="icon"` (36 px). Le titre, centré
   verticalement, ne tombe donc pas au même endroit.
3. **Une typographie divergente** sur `/suivi`, et un jeton de couleur différent
   sur `/patient`.
4. **Un `h2` là où les trois autres ont un `h1`** — un défaut de structure de
   document, pas seulement de style.

## Solution

### La contrainte : les deux stratégies de padding restent

Il serait tentant d'imposer `p-6` sur les quatre conteneurs. Ce serait une
erreur : sur `/dashboard` le calendrier occupe le cadre entier sans padding, et
sur `/suivi` le tableau porte son propre `px-6`. Ajouter `p-6` au conteneur
**padderait ces contenus**, un changement que personne n'a demandé et qui
dépasse la question des titres.

Les deux stratégies sont donc conservées, et réglées pour produire **le même
décalage mesuré** : 24 px depuis le bord gauche du cadre, 24 px depuis son bord
haut, 16 px jusqu'au bloc suivant.

### La cible, identique sur les quatre pages

Ce qui doit être **identique sur les quatre** — c'est ce qui détermine où tombe
le titre :

- `min-h-9` et `items-center` sur la ligne de titre ;
- 24 px de padding gauche et 24 px au-dessus, obtenus soit par le `p-6` du
  conteneur, soit par `px-6 mt-6` sur la ligne ;
- 16 px sous la ligne, obtenus soit par le `gap` du conteneur, soit par `mb-4`
  sur la ligne — voir « Le piège de la marge basse » ;
- les classes du titre lui-même.

Ce qui reste **propre à chaque page**, parce que leurs en-têtes n'ont pas la même
composition :

- Les pages qui ont un groupe de contrôles à droite (`/agenda`, `/patient`,
  `/suivi`) gardent une ligne `justify-between gap-3 flex-wrap` dont le premier
  enfant est un bloc de titre `flex items-center gap-2`.
- `/dashboard` n'a aucun groupe à droite : sa ligne **est** le bloc de titre
  (`flex items-center gap-2`, contenant la pastille, le titre et le bouton
  d'effacement de sélection). Elle le reste — l'envelopper dans un niveau
  supplémentaire pour ressembler aux autres n'apporterait rien à l'alignement,
  qui ne dépend que du plancher de hauteur et du centrage.

**Titre, identique sur les quatre :**

```tsx
<h1 className="text-text-dark text-xl font-semibold">
```

sans hauteur propre.

### Pourquoi `min-h-9`

C'est la pièce qui répond à la demande. Un plancher commun de 36 px aligne la
ligne de titre des quatre pages sur la hauteur naturelle de la plus grande
(celles qui portent un bouton `size="icon"`), et `items-center` place alors le
titre au même endroit partout : son centre tombe à 42 px du bord haut du cadre
sur les quatre pages.

Il rend du même coup inutile le `h-9 flex items-center` isolé du titre de
`/agenda`, qui cherchait à obtenir localement ce que le plancher donne
globalement.

**Limite à connaître.** `min-h-9` est un plancher, pas un verrou. Une ligne dont
un enfant dépasserait 36 px grandirait, et son titre se recentrerait — l'aligne­
ment ne survit donc pas à l'ajout d'un contrôle plus haut, ni au retour à la
ligne autorisé par `flex-wrap` sur une fenêtre étroite. C'est acceptable ici :
tous les contrôles d'en-tête du projet sont des boutons `size="icon"` (36 px) ou
`size="default"` (36 px). Mais la propriété est conditionnelle, pas absolue, et
il vaut mieux que ce soit écrit que découvert.

### Le piège de la marge basse

Le `gap` du conteneur et la marge basse de la ligne **s'additionnent** — mais
seulement quand le conteneur a plusieurs enfants directs.

- `/suivi` : la ligne de titre et le bloc du tableau sont frères, donc le
  `gap-4` du conteneur s'applique. Sa ligne ne doit porter **aucune** marge
  basse : le `gap` fournit les 16 px. Son `mb-6` actuel produit aujourd'hui
  24 + 16 = 40 px.
- `/dashboard` : le conteneur n'a qu'un seul enfant direct (un `div` intermédiaire
  `flex flex-col h-full`), donc son `gap-4` ne s'applique jamais. Sa ligne
  **doit** garder `mb-4` pour produire les 16 px.

Les deux pages ont l'air symétriques et ne le sont pas. C'est exactement le genre
d'écart qui a produit la divergence d'origine.

### Ce que chaque page change

- **`/dashboard`** — la référence. Sa ligne gagne `min-h-9` ; `px-6 mt-6 mb-4`
  et le titre restent inchangés.
- **`/agenda`** — la ligne gagne `min-h-9` ; le titre perd `h-9 flex items-center`.
- **`/patient`** — `h2` → `h1` ; `text-text-foreground` → `text-text-dark` ;
  conteneur `gap-3` → `gap-4` ; la ligne gagne `min-h-9`.
- **`/suivi`** — `mt-4 mb-6` → `mt-6` (aucune marge basse) ; `gap-4` → `gap-3` ;
  la ligne gagne `min-h-9` ; le titre passe de `text-2xl font-bold` à
  `text-text-dark text-xl font-semibold`.

### Pas de composant partagé

Un `PageHeader` empêcherait la dérive de recommencer, et c'est le vrai remède.
Décision explicite : on ne le fait pas maintenant. Les quatre en-têtes n'ont pas
la même structure interne — l'un a un bouton de retour, un autre un bouton
d'effacement de sélection, deux ont un groupe de contrôles à droite et deux
n'en ont pas — et une abstraction qui les couvrirait tous prendrait plus de
props qu'elle n'économise de lignes. Aligner les classes est le changement
proportionné ; si une cinquième page rejoint le lot, la question se reposera
dans de meilleures conditions.

## Dette connue, laissée en place

Aligner les quatre titres sur `text-text-dark` étend un problème existant sans
le créer : dans `front/src/styles/_colors.css`, `--text-dark` vaut `#334155` en
thème clair **comme** en sombre, et `--text-foreground` n'a aucune déclinaison
sombre. Les titres seraient donc peu lisibles en thème sombre.

Deux pages sur quatre étaient déjà dans ce cas ; après ce lot, les quatre le
seront. Le problème reste latent : rien dans `front/src` n'applique la classe
`dark`, le thème sombre n'est pas atteignable au runtime. Corriger la palette
est un autre sujet, avec un autre périmètre.

## Ce qui ne change pas

- Les stratégies de padding des conteneurs, et donc la mise en page des contenus
  (calendrier plein cadre sur `/dashboard`, tableau à `px-6` sur `/suivi`).
- Les éléments de tête : la pastille reste sur `/dashboard` et `/agenda`, le
  bouton retour sur `/patient`, `/suivi` reste sans rien.
- Les groupes de contrôles à droite des en-têtes, y compris l'ordre corrigé le
  jour même sur `/agenda` et `/suivi`.
- `front/src/components/dashboard.layout.tsx`, qui fournit le cadre commun.
- Toute la logique métier des quatre pages.

## Vérification

Le front n'a pas d'infrastructure de test (`front/package.json` ne définit que
`dev`, `build`, `lint`, `preview`) et le `npm run lint` global est rouge sur une
dette préexistante sans rapport. Vérification par :

1. `cd front && npx tsc -b`
2. `cd front && npx biome lint` sur les seuls fichiers touchés
3. `cd front && npm run build`
4. Contrôle manuel — **et il doit être mesuré, pas jugé à l'œil** :
   - ouvrir les quatre pages tour à tour dans la même fenêtre, sans la
     redimensionner ;
   - dans les outils de développement, inspecter le `<h1>` de chaque page et
     relever le `top` de sa boîte englobante. Les quatre valeurs doivent être
     identiques ;
   - relever aussi la hauteur calculée de chaque ligne de titre : 36 px partout ;
   - vérifier que les quatre titres partagent la même taille, la même graisse et
     la même couleur ;
   - vérifier l'espace sous le titre : 16 px avant le bloc suivant sur les quatre
     pages — c'est le point où `/suivi` produisait 40 px ;
   - **contrôle anti-régression** : sur `/dashboard`, le calendrier touche
     toujours les bords du cadre ; sur `/suivi`, le tableau garde son retrait de
     24 px. Aucun des deux ne doit avoir gagné de padding ;
   - `/patient` : le bouton retour fonctionne toujours et reste aligné avec le
     titre.

## Hors périmètre

- Créer un composant `PageHeader` partagé.
- Corriger les jetons `--text-dark` / `--text-foreground` pour le thème sombre.
- Unifier les stratégies de padding des conteneurs.
- Ajouter ou retirer un élément de tête sur une page.
- Les autres pages du projet, y compris les écrans `/settings/*`.
- Toute modification back.
