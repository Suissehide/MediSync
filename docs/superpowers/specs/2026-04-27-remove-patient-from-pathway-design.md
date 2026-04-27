# Design : Retirer un patient d'un parcours

## Contexte

Depuis la page d'un patient (onglet "Aperçu général"), l'utilisateur doit pouvoir retirer le patient d'un parcours. Cela implique la suppression de tous les rendez-vous (Appointments) liés à ce patient dans ce parcours.

## Relations de données

Un patient est lié à un parcours de manière indirecte :
`Patient → AppointmentPatient → Appointment → Slot → Pathway`

Il n'existe pas de relation directe Patient-Pathway dans le schéma Prisma.

## API Backend

### Endpoint de preview

`GET /patient/:patientID/pathway/:pathwayID/appointments-count`

Retourne le nombre de rendez-vous qui seront impactés par le retrait.

**Réponse** : `{ count: number }`

### Endpoint de suppression

`DELETE /patient/:patientID/pathway/:pathwayID`

**Logique** (dans `patient.domain.ts`, dans une transaction Prisma) :

1. Trouver tous les Slots du Pathway
2. Pour chaque Slot, trouver les Appointments ayant un AppointmentPatient lié au patient
3. Pour chaque Appointment trouvé :
   - Si l'appointment n'a qu'un seul patient (ou est individuel) → supprimer l'Appointment entier (cascade supprime l'AppointmentPatient)
   - Si l'appointment est de groupe avec d'autres patients → supprimer uniquement l'AppointmentPatient
4. Si après suppression de l'AppointmentPatient un appointment de groupe n'a plus aucun patient → supprimer l'appointment orphelin
5. Retourne `{ deletedAppointments: number, removedFromGroup: number }`

## Frontend

### Section parcours dans "Aperçu général"

Nouvelle section dans `overview.patient.tsx` affichant la liste des parcours du patient.

Pour chaque parcours :
- Nom du template (ou "Parcours sans template")
- Couleur du template
- Date de début du parcours
- Bouton "Retirer" à côté

Les pathways du patient sont déduits en groupant les appointments par `slot.pathwayID`.

### Modale de confirmation

Au clic sur "Retirer" :

1. Appel `GET /patient/:patientID/pathway/:pathwayID/appointments-count`
2. Affichage d'une modale :
   > "Êtes-vous sûr de vouloir retirer ce patient du parcours **{nom}** ? **{X} rendez-vous** seront supprimés."
   > [Annuler] [Confirmer]
3. Au clic sur "Confirmer" : appel `DELETE /patient/:patientID/pathway/:pathwayID`
4. Invalidation des queries React Query concernées
5. Fermeture de la modale

## Gestion des erreurs et cas limites

- **Patient non inscrit dans le pathway** : le DELETE retourne 404
- **Pathway inexistant** : 404
- **Aucun rendez-vous à supprimer** : le DELETE réussit (idempotent), retourne `{ deletedAppointments: 0, removedFromGroup: 0 }`
- **Appointments orphelins** : supprimés automatiquement (cohérence avec la logique existante de suppression de patient)

## Comportement pour les rendez-vous de groupe

- Retirer le patient du rendez-vous de groupe (supprimer l'AppointmentPatient)
- Garder le rendez-vous pour les autres patients inscrits
- Si plus aucun patient après retrait → supprimer le rendez-vous

## Scope

- Tous les rendez-vous sont supprimés (passés et futurs)
- Pas de toast undo : modale de confirmation uniquement
