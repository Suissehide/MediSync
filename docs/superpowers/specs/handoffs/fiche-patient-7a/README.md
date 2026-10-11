# Handoff : réglages « Fiche patient » (option 7a)

## Objectif
Alléger `front/src/routes/_authenticated/e/$establishmentId/s/$serviceId/_settings/fiche-patient.tsx` :
- une carte par catégorie ;
- actions de ligne en icônes discrètes (fini les 4 boutons bordés par ligne) ;
- type de champ en étiquette avec icône ;
- « Ajouter un champ » en pied de chaque carte ;
- **un seul bouton primary** sur la page.

**Aucun changement de logique ni d'API** : `useServiceFieldsQuery`, `useServiceFieldCategoriesQuery`, `useServiceFieldMutations`, `moveField`, `moveCategory`, l'édition inline du libellé de catégorie (`skipBlurCommit`), `ConfirmDeleteForm`, `ServiceFieldForm`, la garde `referentials:write` et `canManage` restent tels quels.

## Fichier de design
`Fiche patient.dc.html` est une référence HTML (prototype cliquable), pas du code de production. À recréer avec les composants existants (`Button`, `Switch`, `Label`, `Input`, tokens Tailwind). Le champ « Poids d'entrée » supprimé est fictif (il sert à montrer le mode Supprimés).

## En-tête de page
- À gauche : `h1` « Fiche patient » (22px/700). Dessous, sous-titre « Champs remplis sur la fiche de chaque patient du service. » (14px `text-text-light`).
- À droite (`flex items-center gap-4`) :
  1. Bascule « Supprimés » : `Switch` + `Label` existants, suivis d'un **compteur** (pastille 12px, `px-[7px] rounded-full bg-border text-[#475569]`) qui donne le nombre de champs supprimés, toutes catégories confondues.
  2. `AjouterCategorie` (inchangé, reste en `variant="default"`). C'est le seul bouton primary de la page.
- Quand Supprimés est actif : un bandeau sous l'en-tête (carte blanche `px-3.5 py-2.5 rounded-lg border`, icône `Archive` 16px `text-text-light`, 14px) : « Vous voyez les champs supprimés. Les patients qui les portent conservent leur valeur. »

## Carte de catégorie (`CategoryHeader` + liste)
Conteneur : `bg-white border border-border rounded-[10px] overflow-hidden`. Elle remplace le `div gap-3` et la liste de `li` bordés.

### En-tête : `flex items-center gap-3 pl-5 pr-3 py-3.5 border-b border-border`
- **Libellé** (16px/600), cliquable pour l'éditer, comme aujourd'hui. Juste après, une icône `Pencil` de 14px (#94a3b8) dans un bouton de 24px (survol `bg-muted`) qui lance aussi l'édition. Elle rend l'action visible, alors qu'aujourd'hui on ne devine pas que le titre est cliquable.
- **Compteur** « N champ(s) » (13px `text-text-light`), qui compte les champs actifs.
- **À droite**, dans l'ordre :
  - Monter et Descendre : `ArrowUp` / `ArrowDown`. Libellés accessibles conservés.
  - Un séparateur `w-px h-5 bg-border mx-1.5`.
  - Supprimer : `Trash2` #dc2626.
  - Les règles d'affichage et de désactivation sont celles d'aujourd'hui :
    - catégorie avec des champs actifs : Supprimer désactivé, avec le `title` « Déplacez ou supprimez d'abord ses champs » ;
    - `dateField !== null` : pas de bouton Supprimer ;
    - catégorie supprimée : bouton outline « Restaurer » (`Undo2`), qui remplace les icônes.

### Bouton icône (nouveau style partagé)
32×32, `rounded-md`, sans bordure, fond transparent. Survol `bg-[#e2e8f0]` (pour Supprimer : `bg-red-50`), icône 16px #475569. Désactivé : opacité .3, `cursor-not-allowed`. Toujours visible : on ne l'affiche pas seulement au survol, pour le clavier et le tactile. Garder un `title` en plus de l'`aria-label`.

Suggestion : une variante `size="icon-sm" variant="ghost"` de `Button`, si elle n'existe pas.

### Ligne de champ (`FieldRow`)
Grille `20px 1fr auto`, `gap-3`, h 52px, `pl-3.5 pr-3`, `border-b border-muted`, survol `bg-[#f8fafc]`. Elle remplace `li` bordé arrondi.
1. **Poignée** `GripVertical` 16px #cbd5e1 (`cursor-grab`), masquée sur les champs supprimés. Pour l'instant elle est **décorative** : le réordonnancement passe par les flèches. Brancher le glisser plus tard (dnd-kit), sur le même `reorder.mutate`.
2. **Contenu** (`flex items-center gap-2.5 min-w-0`) :
   - **Libellé** (15px/500, ellipse). Champ supprimé : `text-text-light`.
   - **Étiquette de type** : h 24px, `px-2 rounded bg-muted`, 13px #475569, icône de 13px, puis `SERVICE_FIELD_TYPE_LABELS[type]`. Elle remplace « — Choix unique ».
     - Icônes : choix unique `CircleDot` ; choix multiple `ListChecks` ; texte long `AlignLeft` ; texte court `Type` ; nombre `Hash` ; date `Calendar`. À compléter selon les types réels : ajouter une table `SERVICE_FIELD_TYPE_ICONS` à côté de `SERVICE_FIELD_TYPE_LABELS`.
   - **Clinique** (si `field.clinical`) : h 24px, `px-2 rounded bg-primary/10 text-primary-dark` (#1147bb), icône `Lock` 12px, puis « Clinique ». Au survol, le `title` « Contenu clinique : masqué aux rôles Secrétariat et Lecture ». **À vérifier** : cette règle est déduite des rôles.
3. **Actions**
   - Champ actif : Monter, Descendre, séparateur, Modifier (`Pencil` #334155, déclencheur de `ServiceFieldForm`), Supprimer (`Trash2` #dc2626, qui ouvre `ConfirmDeleteForm`). Ce sont tous des boutons icônes.
   - Champ supprimé : bouton outline « Restaurer » (`Undo2`, h 32px, 13px/600). La règle actuelle est conservée : si la catégorie est supprimée, il est désactivé avec le `title` « Restaurez d'abord sa catégorie ».

### Pied de carte
Si la catégorie est active et que Supprimés est désactivé : bouton pleine largeur, h 46px, `px-5`, aligné à gauche, 14px/600 `text-primary`, icône `Plus`, libellé « Ajouter un champ » (survol `bg-[#f8fafc]`). Il sert de déclencheur à `ServiceFieldForm`, et remplace le bouton primary de l'en-tête de catégorie.

État vide : « Aucun champ » ou « Aucun champ supprimé » (14px `text-text-light`, `px-5 py-4`), comme aujourd'hui.

## Tests à mettre à jour (`fiche-patient.test.tsx`)
- Les sélecteurs basés sur les textes de bouton « Modifier » et « Supprimer » doivent passer sur les `aria-label`.
- Garder les rôles et les libellés accessibles existants (« Monter la catégorie », « Supprimer la catégorie », « Monter », « Descendre »…), et ajouter « Modifier » et « Supprimer » aux boutons icônes.
- Le compteur Supprimés reflète bien le nombre de champs archivés.
- Le pied « Ajouter un champ » ouvre `ServiceFieldForm` avec le bon `categoryId`, et il est masqué en mode Supprimés.
- L'icône crayon lance l'édition inline du libellé.

## Tokens
primary #2563eb · primary-dark #1147bb · text #04182b · text-dark #334155 · #475569 · text-light #64748b · border #e2e8f0 · muted #f1f5f9 / #f8fafc · #cbd5e1 · #94a3b8 · suppression #dc2626 / red-50.
Icônes lucide-react : Plus, Archive, Pencil, ArrowUp, ArrowDown, Trash2, Undo2, GripVertical, Lock, CircleDot, ListChecks, AlignLeft, Type, Hash, Calendar.
