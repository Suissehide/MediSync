# Agenda : URL, sélecteur de date, et gestion des participants

Date : 2026-08-24
Portée : front uniquement. Renommage d'une route, un sélecteur de date ajouté à
la page, et la popup d'ajout de patient transformée en popup de gestion des
participants. Aucun changement back, aucune migration.

Prolonge [la page Agenda](2026-08-11-agenda-day-table-design.md) et
[le bouton d'ajout de patient](2026-08-17-agenda-add-patient-design.md).

## Problème

Trois irritants sur la page Agenda :

1. L'URL est `/journee` alors que l'onglet s'appelle « Agenda ». Le décalage n'a
   aucune justification technique — les routes du projet sont en français sans
   accent, mais rien n'imposait un mot différent du libellé.
2. Le bandeau semaine ne permet de naviguer que de proche en proche. Atteindre
   une date lointaine demande autant de clics que de semaines d'écart.
3. La popup n'ajoute que. Retirer un patient d'un rendez-vous collectif oblige à
   ouvrir le panneau latéral, alors que la liste des participants est déjà là,
   sous les yeux, dans le tableau.

## Solution

### 1. `/journee` devient `/agenda`

Le fichier `front/src/routes/_authenticated/journee.tsx` est renommé en
`agenda.tsx`, son `createFileRoute('/_authenticated/journee')` devient
`createFileRoute('/_authenticated/agenda')`, et le lien de la navbar pointe vers
`/agenda` avec `isActive('/agenda')`. `routeTree.gen.ts` est régénéré par le
plugin TanStack Router.

Rien d'autre ne référence la route. Vérifié : hors `routeTree.gen.ts`, le mot
`journee` n'apparaît qu'à trois endroits — `navbar.tsx:123` (`to`),
`navbar.tsx:127` (`isActive`) et la déclaration `createFileRoute` du fichier de
route lui-même. Aucun `navigate({ to: '/journee' })` ailleurs.

### 2. Sélecteur de date

Un bouton icône `CalendarDays` est ajouté à droite du `WeekDayStrip`, dans le
même conteneur flex. Il ouvre un `PopoverRoot` / `PopoverTrigger` /
`PopoverContent` contenant un `DateCalendar`, reprenant la composition de
`suivi.tsx:204-222`. Une seule différence : `suivi.tsx` restreint la vue au mois
(`views={['year', 'month']} openTo="month"`) parce qu'il raisonne par mois ; ici
le `DateCalendar` est monté **sans prop `views`**, donc en vue jour par défaut,
puisqu'on sélectionne une date précise.

Le bandeau semaine reste : il sert la navigation quotidienne, le calendrier sert
les sauts lointains.

**Fuseau horaire.** `DateCalendar` renvoie un `Dayjs` dans son propre fuseau, et
toute la page raisonne en UTC. Le `onChange` reconstruit donc explicitement la
valeur plutôt que de se fier à l'inférence de MUI :

```tsx
onChange={(newDate) => {
  if (newDate) {
    setSelectedDay(dayjs.utc(newDate.format('YYYY-MM-DD')).startOf('day'))
  }
}}
```

Sans cette reconstruction, un utilisateur à l'est de Greenwich sélectionnant le
1er septembre obtiendrait le 31 août en UTC.

### 3. La popup gère les participants

Le `MultiSelect` est désormais **pré-rempli** avec les patients déjà inscrits.
Décocher l'un d'eux le retire du rendez-vous ; cocher un patient absent l'y
ajoute. C'est la même popup, mais elle édite une liste au lieu de l'augmenter.

Changements par rapport à l'état actuel de
`front/src/components/custom/popup/addPatientToAppointmentForm.tsx` :

| Aujourd'hui | Désormais |
| --- | --- |
| `selectedIDs` initialisé à `[]` | initialisé aux ids des patients inscrits |
| les patients inscrits sont retirés des options | ils y figurent, et sont cochés |
| `maxSelected={remaining}` | `maxSelected={row.capacity}` — total, pas restant |
| `disabled={isFull}` sur le `MultiSelect` | supprimé |
| bandeau « Le rendez-vous est complet » | supprimé |
| garde `isFull` dans `handleConfirm` | supprimée |
| compteur `{row.patients.length}/{capacity}` | `{selectedIDs.length}/{capacity}` |
| titre « Ajouter un patient » | « Patients du rendez-vous » |

**Le garde-fou `isFull` doit disparaître.** Il avait été ajouté pour contourner
le fait que `MultiSelect` traite `maxSelected={0}` comme « pas de limite »
(`select.tsx`, `!maxSelected || value.length < maxSelected`). Ce contournement
n'a plus lieu d'être : `maxSelected` vaut maintenant `capacity`, qui n'est jamais
nul. Le conserver rendrait un rendez-vous complet impossible à modifier — soit
exactement l'inverse du but recherché.

**Initialisation.** Le `useEffect` de remise à zéro sur `open` est remplacé par
un initialiseur paresseux de `useState` :

```ts
const [selectedIDs, setSelectedIDs] = useState<string[]>(() =>
  row.patients.map((appointmentPatient) => appointmentPatient.patient.id),
)
```

La page ne monte la popup que lorsqu'une cible existe, donc l'amorçage au montage
suffit et la remise à zéro par effet devient inutile. Surtout, cela **préserve la
sélection en cours** : la ligne étant dérivée des données vivantes, elle change
d'identité à chaque rafraîchissement de `GET /slots`, et un effet qui réamorcerait
sur ce changement écraserait ce que l'utilisateur est en train de faire.

**Visibilité du bouton.** La condition passe de
`!isIndividual && patients.length < capacity` à `!isIndividual` seul. Un
rendez-vous collectif complet doit exposer le bouton, sans quoi on ne peut plus
en retirer personne depuis le tableau. L'icône reste `+`, l'ajout demeurant
l'action dominante.

### 4. Payload bidirectionnel

Pour chaque patient sélectionné :

```ts
appointmentPatients: selectedIDs.map((patientID) => {
  const existing = row.patients.find((ap) => ap.patient.id === patientID)
  return existing
    ? {
        id: existing.id,
        patientID,
        accompanying: existing.accompanying,
        status: existing.status,
        rejectionReason: existing.rejectionReason,
        transmissionNotes: existing.transmissionNotes,
      }
    : { patientID }
})
```

`thematicId` et `type` restent repris tels quels de la ligne, comme aujourd'hui.

Les règles du back
(`back/src/main/infra/orm/repositories/appointment.repository.ts:107-177`) sont
inchangées, mais leur portée s'élargit : un participant décoché voit son `id`
absent de la liste, donc le `deleteMany` de la ligne 149 supprime sa
participation — **et avec elle son statut, son accompagnant et ses
transmissions, définitivement**. C'est le comportement voulu. Il faut simplement
mesurer qu'il devient atteignable en deux clics là où il exigeait auparavant de
passer par le panneau latéral.

Aucune confirmation n'est demandée pour le retrait d'un patient parmi d'autres :
l'action est visible (la case se décoche sous les yeux) et réversible tant que
l'on n'a pas validé.

### 5. Liste vidée : suppression du rendez-vous

Décocher tout le monde et valider supprime le rendez-vous, après confirmation
explicite.

La popup **n'envoie pas** une liste vide. Le back supprimerait bien le
rendez-vous (ligne 112), mais par un effet de bord qu'aucun appelant ne devrait
avoir à connaître. À la place, la popup expose un second callback :

```ts
onRequestDelete: () => void
```

appelé par `handleConfirm` quand `selectedIDs` est vide. La page ferme alors la
popup et ouvre le `ConfirmDeleteForm` **déjà présent**, en réutilisant l'état
`deleteTarget` :

```tsx
onRequestDelete={() => {
  setDeleteTarget(addPatientTarget)
  setAddPatientTargetId(null)
}}
```

Même dialogue, même mutation `deleteAppointment`, même toast que la corbeille de
la ligne. Aucune UI nouvelle, et la suppression emprunte le chemin explicite.

## Ce qui ne change pas

- `DayAppointmentRow` et `buildDayAppointmentRows` : aucun champ nouveau.
- Les colonnes autres que Patients.
- Le bandeau semaine `WeekDayStrip`.
- `front/src/components/ui/select.tsx` : toujours partagé, toujours pas touché.
  Conséquence connue et acceptée : sur un créneau de capacité 1, `MultiSelect`
  bascule dans sa branche `maxSelected === 1` et remplace la sélection au lieu de
  la bloquer. C'est cohérent avec le comportement du panneau latéral.
- L'absence d'invalidation de cache dans la page : `updateAppointment` et
  `deleteAppointment` invalident déjà `[APPOINTMENT.GET_ALL]` et
  `[SLOT.GET_ALL]` et affichent leurs propres toasts.

## Vérification

Le front n'a pas d'infrastructure de test (`front/package.json` ne définit que
`dev`, `build`, `lint`, `preview`) et le `npm run lint` global est rouge sur une
dette préexistante sans rapport. Vérification par :

1. `cd front && npx tsc -b`
2. `cd front && npx biome lint` sur les seuls fichiers touchés
3. `cd front && npm run build`
4. Contrôle manuel :
   - `/agenda` répond, l'onglet est actif, `/journee` ne répond plus ;
   - le bouton calendrier ouvre le popover, choisir une date change le jour
     affiché, et le bandeau semaine se recale sur la semaine correspondante ;
   - **contrôle de fuseau** : depuis un poste en heure d'été française, choisir
     le 1er du mois dans le calendrier doit afficher le 1er, pas le dernier jour
     du mois précédent ;
   - le `+` apparaît sur tous les créneaux collectifs, y compris complets, et
     jamais sur un créneau individuel ;
   - la popup s'ouvre avec les patients inscrits déjà cochés et le compteur au
     bon chiffre ;
   - ajouter un patient puis valider : la pastille apparaît dans la ligne ;
   - **contrôle anti-régression** : sur un rendez-vous dont un participant porte
     un statut et des transmissions, ajouter un autre patient puis rouvrir le
     panneau latéral — statut et transmissions du premier doivent être intacts ;
   - décocher un participant puis valider : sa pastille disparaît de la ligne ;
   - décocher tout le monde puis valider : la popup se ferme et le dialogue de
     suppression du rendez-vous s'ouvre ; annuler ne supprime rien.

## Hors périmètre

- Modifier statut, accompagnant ou transmissions depuis la popup (le panneau
  latéral reste seul à le faire).
- Confirmation au retrait d'un participant parmi d'autres.
- Créer un nouveau rendez-vous sur le créneau.
- Rendre le bouton disponible sur les rendez-vous individuels.
- Toute modification back, y compris l'ajout d'un contrôle de capacité côté
  serveur (absent aujourd'hui, hors sujet ici).
