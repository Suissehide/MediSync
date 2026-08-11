# Page Agenda : tableau des rendez-vous du jour

Date : 2026-08-11
Portée : essentiellement front — nouvelle route, nouveau composant sélecteur de
jour, nouveau fichier de colonnes, un helper dans `libs/utils.ts`, un lien de
navigation. Côté back, une seule ligne additive (`location: true` dans les
`include` de `slot.repository.ts`, voir « Données »). Aucune migration.

## Problème

Le planning et le dashboard n'affichent les rendez-vous que sous forme de
calendrier. Pour préparer une journée — savoir qui vient, à quelle heure, avec
quel soignant et sous quelle modalité — il faut cliquer créneau par créneau. Il
manque une vue dense, lisible d'un coup d'œil, des rendez-vous d'un jour donné.

## Solution

Une page affichant un tableau des rendez-vous du jour sélectionné, avec un
sélecteur de jour en bandeau semaine au-dessus. Chemin technique `/journee`,
libellé affiché `Agenda` (voir « Route et navigation »).

```
[ ‹   lun 10   ( mar 11 )   mer 12   jeu 13   ven 14   sam 15   dim 16   ›  ]   [Aujourd'hui]

┌──────────────┬──────────────┬────────────┬──────────────┬────────────────┬──────────────┬─────────┐
│ Horaire      │ Thématique   │ Lieu       │ Soignant     │ Patients       │ Type         │ Actions │
├──────────────┼──────────────┼────────────┼──────────────┼────────────────┼──────────────┼─────────┤
│ 09:00 – 10:00│ Diététique   │ Salle 2    │ (Dupont)     │ (Martin)       │ Ambulatoire  │  👁  🗑  │
│ 10:00 – 12:00│ Activité phy.│ Gymnase    │ (Petit) (Roy)│ (A.) (B.) +3   │ Hôpital      │  👁  🗑  │
└──────────────┴──────────────┴────────────┴──────────────┴────────────────┴──────────────┴─────────┘
```

### Une ligne = un rendez-vous

Une ligne correspond à un `Appointment`, pas à un créneau. Les créneaux sans
rendez-vous n'apparaissent pas : la page répond à « qui vient aujourd'hui », pas
à « quelles disponibilités reste-t-il ». Un jour sans rendez-vous affiche l'état
vide du tableau.

### Périmètre des données

Tous les rendez-vous du jour, quel que soit le soignant. La page ne dépend pas de
`useSoignantStore` : contrairement au dashboard, elle n'est pas centrée sur un
soignant.

## Implémentation

### Route et navigation

- `front/src/routes/_authenticated/journee.tsx` déclarant la route `/journee`,
  hors segment `_admin` : accessible à tout utilisateur connecté.
- Lien `Agenda` dans `front/src/components/navbar.tsx`, inséré entre `Dashboard`
  et `Patients`, avec les mêmes classes et le même appel `isActive('/journee')`
  que les liens voisins.
- `routeTree.gen.ts` est régénéré par le plugin TanStack Router au `dev` /
  `build` ; il n'est pas édité à la main.

Le chemin technique reste `/journee` (les routes du projet sont en français et
sans accent) tandis que le libellé affiché est `Agenda`.

### Données

La page consomme `useAllSlotsQuery()`, déjà utilisée par le dashboard et par
`/settings/planning`. Même `queryKey` (`[SLOT.GET_ALL]`), donc cache React Query
partagé : aucune requête supplémentaire, et les mutations existantes qui
invalident cette clé rafraîchissent aussi l'agenda.

`GET /slots` renvoie déjà `slot.appointments[].appointmentPatients[].patient`
et `slot.slotTemplate.soignants`. En revanche `slot.slotTemplate.location`
n'était pas inclus : il a fallu ajouter `location: true` aux quatre `include`
de `slotTemplate` dans `slot.repository.ts`. Modification purement additive,
sans migration, le schéma de réponse autorisant déjà le champ.

#### Helper d'aplatissement

Ajouté à `front/src/libs/utils.ts`, à côté de `buildCalendarEventsFromSlots` qui
joue un rôle équivalent pour le calendrier :

```ts
export type DayAppointmentRow = {
  id: string // appointment.id
  slotId: string
  startDate: string
  endDate: string
  thematic: string
  location: string
  soignants: Soignant[]
  patients: AppointmentPatient[]
  type?: string
}

export const buildDayAppointmentRows = (
  slots: Slot[] | undefined,
  day: Dayjs,
): DayAppointmentRow[] => { /* ... */ }
```

Règles :

- Parcourt chaque `slot`, puis chaque `slot.appointments`.
- Retient les rendez-vous dont `dayjs.utc(apt.startDate).isSame(day, 'day')`.
- `thematic` : `apt.thematic ?? slot.slotTemplate.thematic ?? ''`. Un rendez-vous
  peut porter sa propre thématique ; sinon celle du créneau.
- `location` : `slot.slotTemplate.location?.name ?? ''`.
- `soignants` : `slot.slotTemplate.soignants ?? []` — les soignants sont portés
  par le créneau, pas par le rendez-vous.
- `patients` : `apt.appointmentPatients ?? []`.
- `type` : `apt.type`.
- Tri final croissant sur `startDate`.

Les champs vides sont laissés en chaîne vide dans les données ; c'est la couche
colonne qui affiche `—`. Cela garde le tri et un futur filtrage cohérents.

#### Fuseau horaire

Tout le projet raisonne en UTC : `DatePicker` est monté avec `timezone="UTC"` et
`planning.tsx` manipule les dates via `dayjs.utc`. Le helper et le sélecteur de
jour utilisent donc `dayjs.utc` de bout en bout. `selectedDay` est initialisé à
`dayjs.utc().startOf('day')`.

### Sélecteur de jour

Nouveau composant `front/src/components/custom/weekDayStrip.tsx`, purement
présentationnel : pas de query, pas d'accès au store.

Props :

- `value: Dayjs` — jour sélectionné
- `onChange: (day: Dayjs) => void`

Rendu : une flèche gauche, sept boutons `lun 10` … `dim 16` couvrant la semaine
qui contient `value` (semaine commençant le lundi), une flèche droite, puis un
bouton `Aujourd'hui`.

- Les flèches décalent la semaine affichée de sept jours et sélectionnent le
  même jour de semaine dans la nouvelle semaine. La sélection suit donc toujours
  la navigation : il n'y a pas d'état « semaine affichée » distinct de `value`,
  ce qui évite un second état à synchroniser.
- Le jour sélectionné est mis en avant (fond `primary`, texte clair) ; le jour
  courant réel porte un point discret sous le libellé, y compris quand il n'est
  pas sélectionné.
- Le bouton `Aujourd'hui` n'est rendu que si `value` n'est pas le jour courant.
- La semaine est délimitée par `value.isoWeekday(1)`, idiome déjà employé dans
  `libs/utils.ts` : le plugin `isoWeek` est chargé dans `main.tsx`, tout comme
  `dayjs.locale('fr')` qui produit les libellés `lun`, `mar`, etc.

### Colonnes

Nouveau fichier `front/src/columns/dayAppointment.column.tsx`, sur le modèle de
`thematic.column.tsx` : un `createColumnHelper<DayAppointmentRow>()` et une
factory exportée.

```ts
export const getDayAppointmentColumns = ({
  onOpen,
  onDelete,
}: {
  onOpen: (row: DayAppointmentRow) => void
  onDelete: (row: DayAppointmentRow) => void
}) => [ /* ... */ ]
```

| id | Header | Contenu |
| --- | --- | --- |
| `schedule` | Horaire | `09:00 – 10:00` depuis `startDate`/`endDate` en UTC, largeur 140 |
| `thematic` | Thématique | texte, `—` si vide |
| `location` | Lieu | texte, `—` si vide |
| `soignants` | Soignant | pastilles, 3 visibles puis `+N` |
| `patients` | Patients | pastilles cliquables, 3 visibles puis `+N` |
| `type` | Type | libellé issu de `APPOINTMENT_TYPE`, `—` si vide |
| `actions` | (vide) | bouton œil, bouton corbeille, `meta: { align: 'right' }` |

- Les pastilles soignants reprennent exactement le rendu de la colonne
  `soignants` de `thematic.column.tsx` (`rounded-full bg-primary/10 px-2.5
  py-0.5 text-xs font-medium text-primary`) pour rester homogène.
- Les pastilles patients utilisent le même rendu, enveloppées dans un
  `Link` vers la fiche patient (voir « Actions »).
- `type` est traduit via `APPOINTMENT_TYPE` de
  `front/src/constants/appointment.constant.ts` (`ambulatory` → `Ambulatoire`,
  `hospital` → `Hôpital`, `telephonic` → `Téléphonique`).
- Le tri est celui fourni par défaut par `ReactTable` ; le tableau est présenté
  trié par horaire puisque les données arrivent déjà dans cet ordre.

Pas de filtres de colonne dans cette version : aucune table de l'application n'en
câble aujourd'hui (`meta.filter` n'est utilisé nulle part), et le couple
jour + tri couvre le besoin. `DropdownFilter` (`components/ui/dropdownFilter.tsx`)
reste disponible si un filtre soignant ou type s'avère nécessaire ensuite.

### Composition de la page

`journee.tsx` reprend la structure de `thematic.tsx` :

```tsx
<DashboardLayout>
  <div className="flex-1 bg-background p-6 rounded-lg flex flex-col w-full gap-4">
    <div className="flex justify-between items-center gap-3">
      <h1 …>Agenda</h1>
      <WeekDayStrip value={selectedDay} onChange={setSelectedDay} />
    </div>

    <ReactTable<DayAppointmentRow>
      data={rows}
      columns={columns}
      filterId="day-appointment"
      isLoading={isPending}
      emptyState={…}
    />
    …
  </div>
</DashboardLayout>
```

- `selectedDay` : `useState(dayjs.utc().startOf('day'))`. Pas de persistance, ni
  en store ni en URL : ouvrir la page ramène toujours au jour courant, ce qui est
  le comportement attendu d'une vue « journée ».
- `rows` : `useMemo(() => buildDayAppointmentRows(slots, selectedDay), [slots, selectedDay])`.
- `columns` : `useMemo` sur la factory, avec les callbacks `onOpen` / `onDelete`.
- `emptyState` : « Aucun rendez-vous ce jour-là ».
- Pas de `onRowClick` : l'ouverture du rendez-vous passe uniquement par le bouton
  œil, afin que le clic sur une pastille patient reste sans ambiguïté.

### Actions

**Ouvrir** (bouton œil) : `setOpenAppointmentId(row.id)` et
`setSheetSoignants(row.soignants)`, puis rendu du `AppointmentSheet` existant
avec `open`, `setOpen`, `eventID={openAppointmentId}` et `soignants`. C'est la
même façon de l'appeler que dans `dashboard.tsx`, à ceci près que les soignants
sont déjà présents dans la ligne et n'ont pas à être retrouvés depuis les slots.

**Supprimer** (bouton corbeille) : `setDeleteTarget(row)` ouvre
`ConfirmDeleteForm` (titre « Supprimer le rendez-vous », description avertissant
que l'action est irréversible). À la confirmation, `deleteAppointment.mutate(id)`
depuis `useAppointmentMutations()`. Aucune invalidation à ajouter côté page : le
`onSettled` de cette mutation invalide déjà `[APPOINTMENT.GET_ALL]` **et**
`[SLOT.GET_ALL]`, et affiche le toast de confirmation.

**Fiche patient** : `Link` TanStack Router vers `/patient/$patientID` avec
`params={{ patientID: p.patient.id }}` depuis chaque pastille patient, sans état
intermédiaire. Le libellé de la pastille est
`` `${patient.firstName} ${patient.lastName}` ``.

## Vérification

Le front n'a pas d'infrastructure de test (`front/package.json` ne définit que
`dev`, `build`, `lint`, `preview`). Vérification par :

1. `cd front && npx tsc -b`
2. `cd front && npm run lint`
3. Contrôle manuel sur `/journee` :
   - le lien `Agenda` apparaît dans la navbar et marque l'onglet actif ;
   - à l'ouverture, le jour courant est sélectionné et le bouton `Aujourd'hui`
     est masqué ;
   - les flèches changent de semaine, le bouton `Aujourd'hui` réapparaît et
     ramène au jour courant ;
   - un jour avec rendez-vous affiche une ligne par rendez-vous, horaires et
     thématiques conformes à ce que montre le calendrier du dashboard pour ce
     même jour ;
   - un rendez-vous de groupe montre plusieurs pastilles patients, et `+N`
     au-delà de trois ;
   - le bouton œil ouvre le panneau du rendez-vous avec les bons soignants ;
   - une pastille patient mène à la fiche du patient ;
   - la suppression retire la ligne après confirmation ;
   - un jour sans rendez-vous affiche l'état vide.

## Hors périmètre

- Affichage des créneaux libres (sans rendez-vous).
- Création d'un rendez-vous depuis cette page.
- Filtres de colonne et filtre soignant global.
- Persistance du jour sélectionné entre deux visites ou dans l'URL.
- Export ou impression du tableau.
- Toute modification back, à une exception près : `slot.repository.ts` a dû
  ajouter `location: true` aux quatre `include` de `slotTemplate` pour que
  `GET /slots` renvoie le lieu du créneau (voir section Données). Ni schéma,
  ni route, ni autre repository n'ont été touchés.
