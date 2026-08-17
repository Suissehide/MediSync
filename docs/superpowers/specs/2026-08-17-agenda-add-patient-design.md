# Agenda : bouton « + » pour inscrire un patient à un rendez-vous collectif

Date : 2026-08-17
Portée : front uniquement. Trois champs ajoutés à `DayAppointmentRow`, un bouton
dans la colonne Patients, une nouvelle popup, un branchement dans la page.
Aucun changement back, aucune migration.

Prolonge [la page Agenda](2026-08-11-agenda-day-table-design.md).

## Problème

Dans le tableau de l'agenda, inscrire un patient supplémentaire à un rendez-vous
collectif oblige à ouvrir le panneau latéral, faire défiler jusqu'au champ
Patients, puis enregistrer. Le tableau affiche pourtant déjà les patients
inscrits : c'est là que l'action devrait se trouver, et seulement quand il reste
de la place.

## Solution

Un bouton `+` à droite des pastilles patients, rendu uniquement sur les
rendez-vous collectifs non complets. Il ouvre une popup légère qui ne fait qu'une
chose : ajouter un ou plusieurs patients au rendez-vous.

```
│ Patients                    │
├─────────────────────────────┤
│ (Martin) (Durand)  [+]      │   ← collectif, 2/6 → bouton visible
│ (Petit) (A.) (B.) +3   [+]  │   ← collectif, 6/9 → bouton visible
│ (Roy)                       │   ← collectif complet ou RDV individuel → rien
```

### Condition d'affichage

Le bouton est rendu si et seulement si :

```
!row.isIndividual && row.patients.length < row.capacity
```

C'est la règle qu'applique déjà `AppointmentSheet` (`appointmentSheet.tsx:162-166`,
`capacity = isIndividual ? 1 : (slotTemplate.capacity ?? 1)`), reprise à
l'identique pour éviter deux notions divergentes de « complet ».

Un rendez-vous individuel n'a donc jamais de `+` : sa capacité est de 1 et il est
créé avec son patient.

## Implémentation

### Données : trois champs de plus sur la ligne

`GET /slots` transporte déjà tout le nécessaire — vérifié dans les schémas de
réponse : `slotResponseSchema` (`slot.schema.ts:12-27`) expose
`appointments[].id` et `slotTemplate.id`, `appointmentResponseSchema`
(`appointmentSchema`, `schemas/index.ts:29-44`) expose `thematicId`,
`appointmentPatientResponseSchema` (`appointmentPatient.schema.ts:6-13`) expose
l'`id` de chaque participation, et `slotTemplateSchema`
(`schemas/index.ts:57-83`) expose `isIndividual` et `capacity`. **Aucune
modification back n'est nécessaire.**

`DayAppointmentRow`, dans `front/src/libs/utils.ts`, gagne :

```ts
isIndividual: boolean       // slot.slotTemplate?.isIndividual ?? false
capacity: number            // slot.slotTemplate?.capacity ?? 1
thematicId?: string | null  // appointment.thematicId
```

`buildDayAppointmentRows` les renseigne avec ces expressions exactes. `capacity`
retombe sur `1` plutôt que `0` pour qu'une capacité absente ne fasse jamais
apparaître le bouton sur un rendez-vous déjà peuplé.

### Le bouton

Dans `front/src/columns/dayAppointment.column.tsx`, la factory prend un troisième
callback :

```ts
export const getDayAppointmentColumns = ({
  onOpen,
  onDelete,
  onAddPatient,
}: {
  onOpen: (row: DayAppointmentRow) => void
  onDelete: (row: DayAppointmentRow) => void
  onAddPatient: (row: DayAppointmentRow) => void
}) => [ /* ... */ ]
```

Le bouton est rendu dans la cellule `patients`, **après** le conteneur
`overflow-hidden` qui porte les pastilles et le `+N`, dans un parent
`flex items-center gap-1`. Le placer à l'extérieur du conteneur, et lui donner
`shrink-0`, garantit qu'il reste visible quel que soit le nombre de pastilles.

```tsx
<Button
  variant="ghost"
  size="icon-sm"
  aria-label="Ajouter un patient"
  onClick={() => onAddPatient(row.original)}
>
  <Plus className="w-3 h-3" />
</Button>
```

La cellule patients retourne aujourd'hui la chaîne `'—'` par sortie anticipée
quand `patients.length === 0`. Cette sortie doit devenir un fragment contenant le
`—` **et** le bouton, sans quoi une ligne sans patient ne pourrait jamais en
recevoir un. Le cas est rare — le back supprime un rendez-vous dont la liste de
patients devient vide — mais la cellule ne doit pas être écrite comme s'il était
impossible.

### La popup

Nouveau fichier
`front/src/components/custom/popup/addPatientToAppointmentForm.tsx`, purement
présentationnel sur le modèle de `addAppointmentForm.tsx` : il ne connaît aucune
mutation, la page lui passe un callback.

Props :

```ts
{
  open: boolean
  setOpen: (open: boolean) => void
  row: DayAppointmentRow
  onConfirm: (params: UpdateAppointmentParams) => void
  isPending?: boolean
}
```

Contenu, dans les composants `Popup*` existants :

- titre « Ajouter un patient » ;
- une ligne de contexte reprenant le compteur du panneau latéral :
  `{patients.length}/{capacity} patient{capacity > 1 ? 's' : ''}` ;
- un `MultiSelect` (`components/ui/select.tsx`) dont les `options` sont les
  patients de `usePatientQueries()`, **privées de ceux déjà inscrits**
  (`row.patients` comparés sur `patient.id`), triées par `nom prénom` puis
  affichées `prénom nom` — exactement la construction de `patientOptions` dans
  `addAppointmentForm.tsx:60-68` ;
- `maxSelected={row.capacity - row.patients.length}` ;
- boutons `Ajouter` / `Annuler`.

La validation refuse une sélection vide (« Au moins un patient est requis »).
La borne haute est déjà tenue par `maxSelected`, qui empêche la sélection au-delà
de la place restante.

### Construction du payload — le point à ne pas rater

`updateAppointment` n'offre pas d'ajout incrémental. Le back
(`back/src/main/infra/orm/repositories/appointment.repository.ts:107-177`) :

- **supprime le rendez-vous entier** si `appointmentPatients` est un tableau vide
  (ligne 112) ;
- laisse les participants intacts si le champ est absent (ligne 132) ;
- sinon `deleteMany` tout `appointmentPatient` dont l'`id` n'est pas dans la
  liste reçue (ligne 149), puis `upsert` chaque entrée.

Le payload doit donc être **la liste complète** :

```ts
onConfirm({
  id: row.id,
  thematicId: row.thematicId,
  type: row.type,
  appointmentPatients: [
    ...row.patients.map((ap) => ({
      id: ap.id,
      patientID: ap.patient.id,
      accompanying: ap.accompanying,
      status: ap.status,
      rejectionReason: ap.rejectionReason,
      transmissionNotes: ap.transmissionNotes,
    })),
    ...selectedPatientIDs.map((patientID) => ({ patientID })),
  ],
})
```

Trois conséquences à respecter :

- les participations existantes sont remappées **avec leur `id` et tous leurs
  champs** ; omettre `id` les ferait supprimer puis recréer, et omettre
  `accompanying` / `status` / `rejectionReason` / `transmissionNotes` effacerait
  les statuts et les transmissions déjà saisis ;
- les nouveaux patients n'ont pas d'`id` : l'`upsert` les crée ;
- `thematicId` et `type` sont repris tels quels de la ligne. Les omettre les
  passerait à `null`, puisque `appointmentData` est envoyé tel quel à
  `tx.appointment.update`.

### Câblage dans la page

`front/src/routes/_authenticated/journee.tsx` :

- nouvel état `addPatientTarget: DayAppointmentRow | null` ;
- `updateAppointment` récupéré depuis `useAppointmentMutations()`, à côté de
  `deleteAppointment` déjà présent ;
- `onAddPatient: (row) => setAddPatientTarget(row)` ajouté à l'appel de
  `getDayAppointmentColumns` ;
- la popup rendue sous condition `addPatientTarget &&`, son `onConfirm` appelant
  `updateAppointment.mutate(params)` puis `setAddPatientTarget(null)`.

Aucune invalidation de cache à écrire : le `onSettled` de `updateAppointment`
invalide déjà `[APPOINTMENT.GET_ALL]` et `[SLOT.GET_ALL]`
(`front/src/queries/useAppointment.ts:196-199`), et la mutation affiche son
propre toast.

## Vérification

Le front n'a pas d'infrastructure de test (`front/package.json` ne définit que
`dev`, `build`, `lint`, `preview`) ; le `npm run lint` global est rouge sur une
dette préexistante sans rapport. Vérification par :

1. `cd front && npx tsc -b`
2. `cd front && npx biome lint` sur les seuls fichiers touchés — ils sont propres
   aujourd'hui, toute diagnostic est donc une régression
3. `cd front && npm run build`
4. Contrôle manuel sur `/journee` :
   - un RDV collectif non complet affiche le `+`, un RDV complet et un RDV
     individuel ne l'affichent pas ;
   - la popup montre le bon compteur et ne propose pas les patients déjà
     inscrits ;
   - la sélection est bloquée au-delà de la place restante ;
   - après validation, la nouvelle pastille apparaît dans la ligne et le toast
     « Rendez-vous modifié avec succès » s'affiche ;
   - **contrôle anti-régression indispensable** : rouvrir le panneau latéral du
     rendez-vous modifié et vérifier que les statuts, accompagnants et
     transmissions des patients déjà présents sont intacts, et que la thématique
     et le type n'ont pas été vidés ;
   - le `+` disparaît une fois la capacité atteinte.

## Hors périmètre

- Retirer un patient depuis le tableau (le panneau latéral s'en charge).
- Modifier statut, accompagnant ou transmissions depuis la popup.
- Créer un nouveau rendez-vous sur le créneau.
- Toute modification back.
