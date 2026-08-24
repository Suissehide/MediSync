# Agenda : dépliage de la cellule Patients et mémorisation du jour

Date : 2026-08-24
Portée : front uniquement. Un composant extrait, une prop d'option sur le
tableau partagé, et une clé de localStorage. Aucun changement back, aucune
migration.

Prolonge [la page Agenda](2026-08-11-agenda-day-table-design.md) et
[la gestion des participants](2026-08-24-agenda-manage-patients-design.md).

## Problème

Deux irritants indépendants sur la page Agenda :

1. La colonne Patients n'affiche que trois pastilles, puis un `+N` inerte. Sur un
   rendez-vous de groupe, la majorité des participants est invisible et rien ne
   permet de les voir sans ouvrir un autre écran.
2. Le jour sélectionné est perdu au rechargement. Quitter la page pour consulter
   une fiche patient et revenir ramène au jour courant, ce qui oblige à
   re-naviguer.

## Solution 1 : le `+N` déplie la cellule

Cliquer sur le `+N` fait passer la cellule en affichage complet : toutes les
pastilles, réparties sur plusieurs lignes, la ligne du tableau s'agrandissant en
conséquence. Le bouton devient `Voir moins` et referme la cellule.

```
Replié   │ (Martin) (Durand) (Petit)  [+3]  [+] │   ← une ligne
         
Déplié   │ (Martin) (Durand) (Petit)            │
         │ (Roy) (Bernard) (Thomas)             │   ← la ligne grandit
         │ [Voir moins]                    [+]  │
```

### Un composant dédié

La cellule accumule aujourd'hui quatre responsabilités : les pastilles, le
débordement, le bouton de gestion et la branche à zéro patient. Y ajouter un état
d'expansion ferait de `front/src/columns/dayAppointment.column.tsx` un fichier de
logique de rendu déguisé en définition de colonnes.

Nouveau fichier `front/src/components/custom/agenda/patientCell.tsx` :

```tsx
type PatientCellProps = {
  row: DayAppointmentRow
  onAddPatient: (row: DayAppointmentRow) => void
}
```

La colonne `patients` se réduit alors à
`cell: ({ row }) => <PatientCell row={row.original} onAddPatient={onAddPatient} />`.

**Les deux constantes partagées déménagent.** `CHIP_CLASS` et
`MAX_VISIBLE_CHIPS` sont aujourd'hui privées de `dayAppointment.column.tsx`, où
elles servent **à la fois** à la colonne Soignant (lignes 57-62) et à la cellule
Patients (lignes 104-115). Les laisser sur place obligerait `PatientCell` à
importer depuis un fichier de `columns/`, ce qui inverse la dépendance normale.

Elles sont donc extraites dans `front/src/components/custom/agenda/chip.ts` :

```ts
export const CHIP_CLASS =
  'inline-flex items-center shrink-0 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary'

export const MAX_VISIBLE_CHIPS = 3
```

importées telles quelles par la colonne (pour Soignant) et par `PatientCell`.
Les valeurs sont reprises à l'identique : la colonne Soignant doit continuer de
rendre exactement le même HTML qu'aujourd'hui.

L'état d'expansion est un `useState<boolean>` **local au composant**. Il ne
remonte pas à la page, ce qui évite de faire passer un ensemble d'ids dépliés
dans `getDayAppointmentColumns` et d'invalider le `useMemo([])` des colonnes à
chaque bascule.

Conséquence assumée : l'expansion est perdue quand la ligne est démontée —
changement de jour, ou défilement suffisant pour que la virtualisation la
recycle. C'est le comportement attendu d'un dépliage d'affichage, et le
reconstruire demanderait un état partagé pour un bénéfice nul.

### Comportement

- **Replié** (état initial) : les `MAX_VISIBLE_CHIPS` premières pastilles dans un
  conteneur `overflow-hidden`, puis le bouton `+N` si `patients.length` dépasse.
- **Déplié** : toutes les pastilles, conteneur en `flex-wrap`, bouton `Voir
  moins`.
- Le bouton de gestion (`+`) reste en bout de cellule, `shrink-0`, hors du
  conteneur des pastilles, dans les deux états.
- Le `+N` devient un `<button type="button">` et non plus un `<span>` : il est
  cliquable, il doit donc l'être au clavier. Il porte un `aria-label` explicite
  (`Afficher les N patients masqués` / `Réduire la liste des patients`).
- Le bouton n'est rendu que si `patients.length > MAX_VISIBLE_CHIPS`. Une cellule
  de trois patients ou moins n'a rien à déplier.
- Les pastilles restent des `Link` vers `/patient/$patientID` dans les deux
  états.

### La hauteur de ligne

`ReactTable` passe `rowHeight={40}` en dur (`reactTable.tsx:212`), et
`VirtualizedBodyTable` l'applique en style inline sur le `<tr>` **et** sur chaque
`<td>`. Une cellule dépliée déborderait au lieu d'agrandir la ligne.

Nouvelle prop **optionnelle** sur `ReactTable` :

```ts
autoRowHeight?: boolean
```

transmise telle quelle à `VirtualizedBodyTable`, où elle remplace `height:
rowHeight` par `minHeight: rowHeight` sur le `<tr>` et sur les `<td>`. Seule la
table de l'agenda l'active ; en son absence le rendu des six autres tables du
projet est strictement inchangé.

Deux raisons pour lesquelles ce changement est plus petit qu'il n'en a l'air :

- en CSS, `height` sur un élément de tableau se comporte déjà comme un minimum ;
  passer à `minHeight` rend l'intention explicite plutôt qu'implicite ;
- `VirtualizedBodyTable` appelle déjà `rowVirtualizer.measureElement(node)` sur
  chaque `<tr>` (`virtualizedBodyTable.tsx:115-119`), et le virtualiseur pagine
  par lignes de remplissage plutôt que par positionnement absolu. La mesure
  dynamique est donc déjà en place ; seule la hauteur inline l'empêchait d'agir.

La prop est ajoutée avec sa valeur par défaut `false` et n'est passée que par
`front/src/routes/_authenticated/agenda.tsx`.

## Solution 2 : le jour sélectionné persiste

Le jour choisi est écrit en localStorage sous la clé `agenda/selected-day`, au
format `YYYY-MM-DD`, et relu à l'ouverture de la page.

### Lecture

L'initialiseur paresseux du `useState` existant lit la clé, avec repli sur le
jour courant si elle est absente, vide ou illisible :

```ts
const [selectedDay, setSelectedDay] = useState(() => {
  const stored = localStorage.getItem('agenda/selected-day')
  const parsed = stored ? dayjs.utc(stored) : null
  return parsed?.isValid() ? parsed.startOf('day') : dayjs.utc().startOf('day')
})
```

La validation passe par `isValid()` plutôt que par un parsing strict : le plugin
`customParseFormat` n'est pas chargé dans `main.tsx`, et une clé corrompue doit
simplement retomber sur aujourd'hui, pas faire échouer le rendu.

### Écriture

Un unique `handleDayChange` remplace les deux appels directs à `setSelectedDay`
(le `onChange` de `WeekDayStrip` et celui du `DateCalendar`) :

```ts
const handleDayChange = (day: Dayjs) => {
  setSelectedDay(day)
  localStorage.setItem('agenda/selected-day', day.format('YYYY-MM-DD'))
}
```

Un `handleDayChange` plutôt qu'un `useEffect` sur `selectedDay` : l'effet
écrirait aussi au montage, réécrivant la valeur qu'il vient de lire, et
persisterait un jour courant que l'utilisateur n'a jamais choisi.

### Portée de la restauration

La date est restaurée **telle quelle**, quelle que soit son ancienneté. Rouvrir
la page une semaine plus tard ramène sur la date consultée une semaine plus tôt.
C'est le comportement le plus prévisible : la page reprend là où elle a été
laissée, et le bouton `Aujourd'hui` du bandeau semaine est là pour revenir.

**Ceci renverse une décision explicite** de la spec du 11 août, qui écartait la
persistance (« Pas de persistance, ni en store ni en URL : ouvrir la page ramène
toujours au jour courant »). Le renversement est délibéré, pas un oubli.

Le stockage reste local au navigateur : pas de store zustand, pas de paramètre
d'URL. Une seule page consomme cette valeur, un état partagé serait
disproportionné.

## Ce qui ne change pas

- `DayAppointmentRow` et `buildDayAppointmentRows` : aucun champ nouveau.
- Les colonnes autres que Patients.
- La popup de gestion des participants et son payload.
- `WeekDayStrip`, qui continue de dériver sa semaine de la valeur reçue.
- Le rendu des six autres tables du projet : sans `autoRowHeight`, le
  comportement de `VirtualizedBodyTable` est identique à aujourd'hui.

## Vérification

Le front n'a pas d'infrastructure de test (`front/package.json` ne définit que
`dev`, `build`, `lint`, `preview`) et le `npm run lint` global est rouge sur une
dette préexistante sans rapport. Vérification par :

1. `cd front && npx tsc -b`
2. `cd front && npx biome lint` sur les seuls fichiers touchés
3. `cd front && npm run build`
4. Contrôle manuel sur `/agenda` :
   - une ligne de plus de trois patients affiche `+N` ; cliquer déplie toutes les
     pastilles sur plusieurs lignes et **la ligne du tableau grandit** au lieu de
     rogner ;
   - le bouton devient `Voir moins` et referme la cellule ;
   - une ligne de trois patients ou moins n'affiche aucun bouton de dépliage ;
   - les pastilles restent cliquables et mènent à la fiche patient dans les deux
     états ;
   - la colonne **Soignant** est visuellement identique à avant le changement —
     mêmes pastilles, même `+N` — puisqu'elle consomme désormais les constantes
     depuis leur nouveau fichier ;
   - le bouton `+` de gestion reste visible et fonctionnel, déplié comme replié ;
   - le `+N` est atteignable au clavier (Tab) et s'active à l'Entrée ;
   - **contrôle anti-régression** : ouvrir `/patient`, `/settings/thematic` et
     `/settings/location` et vérifier que leurs lignes gardent la même hauteur
     qu'avant, et que le défilement reste fluide ;
   - déplier plusieurs lignes puis faire défiler loin et revenir : les lignes
     recyclées par la virtualisation reviennent repliées, sans décalage
     d'affichage ;
   - choisir une date, recharger la page : la même date est affichée ;
   - vider la clé `agenda/selected-day` dans les outils du navigateur puis
     recharger : la page revient au jour courant ;
   - y écrire une valeur absurde (`pas-une-date`) puis recharger : la page revient
     au jour courant sans erreur.

## Hors périmètre

- Rendre la hauteur variable pour les autres tables du projet.
- Mémoriser le jour dans l'URL ou dans un store partagé.
- Conserver l'état déplié entre deux jours ou après recyclage par la
  virtualisation.
- Rendre `MAX_VISIBLE_CHIPS` configurable.
- Toute modification back.
- Faire correspondre le libellé visible du bouton de dépliage (`+N`) à son nom
  accessible (`aria-label`) : c'est un écart WCAG 2.5.3 « Label in Name », qui
  gêne les utilisateurs de commande vocale. Accepté en l'état : le nom
  accessible est réellement plus utile aux utilisateurs de lecteur d'écran, et
  si l'écart est corrigé un jour, la bonne forme est un libellé visible
  complété d'un texte visuellement masqué, pas un `aria-label` raccourci.
- Ajouter `stopPropagation` au clic sur le bouton de dépliage : sans effet
  aujourd'hui puisque le `ReactTable` de l'agenda ne reçoit pas de
  `onRowClick`, mais quiconque câblera plus tard l'ouverture du rendez-vous au
  clic sur la ligne devra l'ajouter, sous peine que cliquer sur `+N` ouvre
  aussi le rendez-vous.
