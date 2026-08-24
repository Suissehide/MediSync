# Agenda : ordre des contrôles de date et lisibilité de la colonne Patients

Date : 2026-08-25
Portée : front uniquement. Réordonnancement de l'en-tête de deux pages, une
constante, et deux changements de style. Aucun changement back, aucune
migration.

Prolonge [la page Agenda](2026-08-11-agenda-day-table-design.md) et
[le dépliage de la cellule Patients](2026-08-24-agenda-cell-expansion-and-day-persistence-design.md).

## Problème

Quatre irritants, tous visuels, tous sur la même page.

1. **Le bandeau semaine se déplace tout seul.** Quitter le jour courant fait
   apparaître le bouton `Aujourd'hui`, et le bandeau glisse latéralement.
2. La colonne Patients montre trois pastilles là où deux suffiraient à laisser
   de la place au reste.
3. Le `+X` et le `Voir moins` sont du texte gris nu : rien n'indique qu'ils sont
   cliquables avant qu'on les survole — ce qui est précisément le moment où il
   est trop tard pour découvrir l'affordance.
4. **Le bouton `+` de gestion disparaît au survol de la ligne.**

## Solution 1 : les contrôles instables passent à gauche

### Pourquoi le bandeau bouge

Le groupe de droite de l'en-tête est aligné à droite : le conteneur est
`flex justify-between`, avec le titre à gauche. `WeekDayStrip` rend, dans
l'ordre, `[‹] [7 jours] [›] [Aujourd'hui]` — l'élément qui apparaît et
disparaît est **en bout de groupe**.

Le bord droit du groupe étant fixe, l'apparition du bouton fait grandir le
groupe vers la gauche, et tout ce qui se trouve à gauche du bouton — donc le
bandeau entier — se décale.

### La correction

Placer les éléments instables **au début** du groupe aligné à droite. Le bord
droit reste pinné, l'insertion pousse la gauche du groupe, et **tout ce qui est
à droite de l'insertion ne bouge pas**.

Nouvel ordre dans l'en-tête de `/agenda` :

```
[Aujourd'hui]  [🗓]  [ ‹  lun 24  mar 25  …  dim 30  › ]
     ↑          ↑
  instable   stable      ← le bandeau, à droite, ne bouge jamais
```

### Une limite au raisonnement : le bord droit n'est pinné que sans retour à la ligne

Le raisonnement ci-dessus suppose que le bord droit du groupe est fixe. C'est
vrai tant que le titre et le groupe de contrôles tiennent sur une seule ligne.
Mais le conteneur qui les porte est `flex justify-between items-center gap-3
flex-wrap` : sous ~1200–1320px de largeur de viewport, il retourne à la ligne,
et **chaque ligne flex se justifie alors indépendamment**. Une ligne qui ne
contient plus qu'un seul élément — le groupe de contrôles, une fois le titre
passé sur sa propre ligne — voit cet élément posé à `flex-start`, pas à
`flex-end`. Le bord gauche du groupe devient le bord fixe, et insérer un
élément instable en tête du groupe pousse alors tout ce qui le suit vers la
droite : c'est exactement le bug d'origine, reproduit dans ce régime de
largeur plutôt que dans l'autre.

Réordonner ne suffit donc pas à lui seul. La correction retenue ne s'appuie
pas sur cette prémisse : voir « Conséquence structurelle » ci-dessous, le
bouton `Aujourd'hui` reste **toujours monté** et seule sa visibilité change,
si bien que la largeur du groupe ne varie jamais — ni quand la ligne est
justifiée à droite, ni quand elle est justifiée à gauche. Le réordonnancement
en tête de groupe est conservé (il rapproche les contrôles connexes et prépare
la cohérence avec `/suivi`), mais ce n'est plus lui qui empêche le bandeau de
bouger.

### Conséquence structurelle : `Aujourd'hui` sort de `WeekDayStrip`

Le bouton vit aujourd'hui **dans** `front/src/components/custom/weekDayStrip.tsx`,
rendu en dernier. Pour l'intercaler avant le bouton calendrier — qui vit dans la
page — il faut le remonter dans la page.

`WeekDayStrip` perd donc son bouton `Aujourd'hui` et redevient strictement le
bandeau : flèches et sept jours. Ses props (`value`, `onChange`) ne changent
pas.

La page porte désormais les deux contrôles auxiliaires. Le bouton n'est plus
rendu conditionnellement : il reste toujours monté, pour que la largeur du
groupe ne dépende jamais de sa présence, et seule sa visibilité change selon
le jour courant :

```tsx
const today = dayjs.utc().startOf('day')
// …
<Button
  variant="outline"
  onClick={() => handleDayChange(today)}
  className={
    selectedDay.isSame(today, 'day')
      ? 'invisible pointer-events-none'
      : undefined
  }
>
  Aujourd&apos;hui
</Button>
```

`visibility: hidden` conserve la boîte de l'élément dans le flux — la largeur
du groupe ne varie donc jamais, quel que soit le régime de justification —
tout en le retirant de l'ordre de tabulation et de l'arbre d'accessibilité.
`pointer-events-none` neutralise la zone morte. Aucune gestion manuelle
d'`aria-hidden` ou de `tabIndex` n'est nécessaire.

Les trois éléments restent dans le conteneur `flex items-center gap-2` déjà
présent à droite de l'en-tête ; seul leur ordre change, et le bouton calendrier
avec son `PopoverRoot` reste où il vit aujourd'hui, dans la page.

`WeekDayStrip` garde sa propre notion de « aujourd'hui », qui sert au point
discret sous le jour courant. Ce n'est pas une duplication à éliminer : les deux
usages sont indépendants, et lier le composant à la page pour économiser une
ligne serait un mauvais échange.

Le bouton passe par `handleDayChange`, comme tout changement de jour, donc il
est persisté au même titre que les autres.

### `/suivi` reçoit le même ordre

`front/src/routes/_authenticated/suivi.tsx` rend aujourd'hui
`[‹] [Mois AAAA] [🗓] [›]` — le bouton calendrier est coincé entre le libellé et
la flèche droite. Il passe en tête du groupe :

```
[🗓]  [ ‹  Septembre 2026  › ]
```

Rien n'est instable dans cet en-tête, donc il n'y a aucun décalage à corriger :
le changement est purement une mise en cohérence, pour que le bouton calendrier
se trouve au même endroit sur les deux pages. Le `DateCalendar` de `/suivi`
garde ses props (`views={['year', 'month']}`, `openTo="month"`) : il raisonne
par mois, contrairement à celui de l'agenda.

## Solution 2 : deux pastilles au lieu de trois

`MAX_VISIBLE_CHIPS` passe de `3` à `2` dans
`front/src/components/custom/agenda/chip.ts`.

La constante est partagée avec la colonne Soignant, qui suit donc le même
seuil : un créneau à trois soignants affichera `(A) (B) +1`. C'est assumé — les
deux colonnes gardent une densité cohérente, et scinder la constante pour deux
valeurs différentes serait du code en plus sans besoin établi.

## Solution 3 : le `+X` devient une pastille bordée

Le bouton de dépliage passe du texte gris nu à une pastille bordée, de la même
famille visuelle que les pastilles patients mais neutre :

```
inline-flex items-center shrink-0 rounded-full border border-border
px-2 py-0.5 text-xs font-medium text-muted-foreground cursor-pointer
transition-colors hover:border-primary/40 hover:text-primary hover:bg-primary/5
```

La bordure au repos est ce qui manquait : elle dit « je suis un contrôle » avant
tout survol. Le survol renforce en virant au `primary`.

Cette classe reste **locale à `patientCell.tsx`** et ne rejoint pas `chip.ts`.
Le `+N` de la colonne Soignant est un `<span>` inerte et le reste : lui donner
la même apparence annoncerait une interaction qui n'existe pas. Les deux `+N`
diffèrent désormais visuellement, et c'est correct — l'un se clique, l'autre
non.

La borne `max-w-[216px]` du conteneur déplié **ne change pas**. Son calcul
dépend de la largeur de la colonne (`size: 280`) et de celle du bouton de
gestion (`size="icon-sm"`, 24 px), et aucune des deux n'est modifiée ici.

## Solution 4 : le bouton `+` devient `outline`

Le bouton de gestion passe de `variant="ghost"` à `variant="outline"`.

**Pourquoi il disparaissait.** Dans `front/src/components/ui/button.tsx`, la
variante `ghost` est `bg-card border border-muted`. Or `front/src/styles/_colors.css`
donne à `--card` et `--muted` **la même valeur** : `#f1f5f9` en thème clair,
`#1e293b` en sombre. La bordure est donc invisible par construction, dans les
deux thèmes, et le fond gris très clair se confond avec le `hover:bg-primary/5`
appliqué à la ligne survolée.

`outline` est `border border-border bg-transparent` : `--border` vaut `#e2e8f0`,
distinct de `--card`, donc la bordure se voit ; et le fond transparent laisse
passer le survol de la ligne au lieu de le masquer.

### Dette connue, laissée en place

La variante `ghost` reste à bordure invisible **partout ailleurs dans
l'application**. C'est la cause racine, et la corriger d'une ligne
(`border-muted` → `border-border`) réparerait tous les boutons `ghost` d'un
coup — mais changerait aussi l'apparence d'écrans dont personne n'a signalé de
problème. Décision explicite : on ne la touche pas dans ce lot. Écrit ici pour
que le prochain qui bute dessus trouve le diagnostic déjà fait.

## Ce qui ne change pas

- Les props de `WeekDayStrip` (`value`, `onChange`) et le point sous le jour
  courant.
- La persistance du jour : le bouton `Aujourd'hui` passe par `handleDayChange`
  comme les autres chemins.
- Le comportement de dépliage lui-même, la borne de largeur, l'état local du
  composant.
- `front/src/components/ui/button.tsx` et `front/src/styles/_colors.css`.
- Le `+N` inerte de la colonne Soignant, qui reste un `<span>`.
- Toute la logique de `/suivi` autre que la position d'un bouton.

## Vérification

Le front n'a pas d'infrastructure de test (`front/package.json` ne définit que
`dev`, `build`, `lint`, `preview`) et le `npm run lint` global est rouge sur une
dette préexistante sans rapport. Vérification par :

1. `cd front && npx tsc -b`
2. `cd front && npx biome lint` sur les seuls fichiers touchés
3. `cd front && npm run build`
4. Contrôle manuel :
   - **le contrôle central** : sur `/agenda`, partir du jour courant, cliquer
     une flèche de semaine, revenir. Le bandeau des sept jours ne doit **pas**
     bouger horizontalement quand `Aujourd'hui` apparaît puis disparaît ;
   - `Aujourd'hui` et le bouton calendrier sont à gauche du bandeau, dans cet
     ordre ;
   - cliquer `Aujourd'hui` ramène au jour courant, et recharger la page
     confirme que le choix a été persisté ;
   - sur `/suivi`, le bouton calendrier est à gauche de la flèche `‹`, et le
     calendrier s'ouvre toujours sur la vue mois ;
   - une ligne à trois patients affiche deux pastilles puis `+1` ; une ligne à
     deux patients n'affiche aucun bouton de dépliage ;
   - la colonne Soignant suit le même seuil de deux ;
   - le `+X` se lit comme un bouton **sans le survoler** — bordure visible au
     repos — et vire au `primary` au survol ; idem pour `Voir moins` une fois
     déplié ;
   - **contrôle du défaut d'origine** : survoler une ligne du tableau. Le bouton
     `+` doit rester nettement visible, bordure comprise, sur le fond de survol ;
   - vérifier ce même survol en thème sombre, puisque la collision de couleurs
     existait dans les deux thèmes.

## Hors périmètre

- Corriger la variante `ghost` du design system (voir « Dette connue »).
- Scinder `MAX_VISIBLE_CHIPS` en deux seuils distincts.
- Rendre le `+N` de la colonne Soignant cliquable.
- Uniformiser autre chose entre `/agenda` et `/suivi`.
- Toute modification back.
