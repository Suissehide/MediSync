# Motif obligatoire sur PathwayTemplate

## Objectif

Permettre aux administrateurs de rendre obligatoire la saisie d'un motif lors de l'ajout d'un patient à un parcours. Le motif saisi est automatiquement enregistré comme "Notes de transmission" sur chaque rendez-vous créé.

## Modèle de données

Ajouter un champ `motifRequired` au modèle `PathwayTemplate` :

```prisma
model PathwayTemplate {
  // ... champs existants
  motifRequired Boolean @default(false)
}
```

Migration Prisma nécessaire.

## Backend

### PathwayTemplate (routes + schémas)

- Ajouter `motifRequired: boolean` (optionnel, défaut `false`) dans les schémas de création et modification de PathwayTemplate.
- Les routes `POST /pathway-template` et `PATCH /pathway-template/:id` acceptent et persistent ce champ.

### Enrollment (patient)

- Ajouter un champ optionnel `motif?: string` dans chaque élément du tableau `pathways` de la requête `POST /patient/:patientID/enroll`.
- Mettre à jour le schéma Zod/validation correspondant.

### Validation

- Lors du traitement de l'enrollment dans `patient.domain.ts` (`processEnrollments`), récupérer le `PathwayTemplate` associé au tag.
- Si `template.motifRequired === true` et que `motif` est absent ou vide, ajouter une `EnrollmentIssue` avec un message d'erreur explicite.

### Création des AppointmentPatient

- Dans `enrollOnPathway()`, passer le `motif` reçu comme valeur de `transmissionNotes` lors de la création de chaque `AppointmentPatient`.
- Le motif est le même pour tous les rendez-vous du parcours pour ce patient.

## Frontend

### AddPathwayForm (création de PathwayTemplate)

- Fichier : `front/src/components/custom/popup/addPathwayForm.tsx`
- Ajouter une checkbox "Motif obligatoire" dans le formulaire.
- Envoyer `motifRequired` dans la mutation `createPathwayTemplate`.

### PathwayTemplateSheet (modification de PathwayTemplate)

- Fichier : `front/src/components/custom/sheet/pathwayTemplateSheet.tsx`
- Ajouter la même checkbox "Motif obligatoire".
- Envoyer `motifRequired` dans la mutation `updatePathwayTemplate`.

### PathwaySelector (ajout patient au parcours)

- Fichier : `front/src/components/custom/pathwaySelector.tsx`
- Pour chaque parcours ajouté, vérifier si le template associé a `motifRequired: true`.
- Si oui, afficher un champ texte "Motif" (obligatoire) dans la zone d'options du parcours (à côté de type/thématique).
- Ajouter `motif` à l'interface `AddedPathway`.

### AddPatientToPathwayForm

- Fichier : `front/src/components/custom/popup/addPatientToPathwayForm.tsx`
- Passer le `motif` de chaque pathway dans la requête d'enrollment.
- Validation : empêcher la soumission si un parcours avec `motifRequired` n'a pas de motif renseigné.

### Types

- Mettre à jour le type `PathwayTemplate` frontend pour inclure `motifRequired: boolean`.
- Mettre à jour l'interface `AddedPathway` pour inclure `motif?: string`.

## Flux complet

1. Admin crée/modifie un PathwayTemplate et coche "Motif obligatoire"
2. Utilisateur ajoute un patient à ce parcours : un champ "Motif" obligatoire apparaît
3. Soumission du formulaire : le motif est envoyé avec la requête d'enrollment
4. Backend valide la présence du motif si requis
5. Backend crée les AppointmentPatient avec `transmissionNotes = motif`
6. Le motif est visible et éditable ensuite dans l'AppointmentSheet
