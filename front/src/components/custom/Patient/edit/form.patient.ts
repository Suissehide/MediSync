import { formOptions } from '@tanstack/react-form'

// Les seize champs de parcours, d'inclusion et de contenu clinique qui vivaient ici ont
// déménagé vers `patientServiceFileFormOpts`, plus bas dans ce fichier : ils appartiennent au
// sous-dossier de service (`types/patientServiceFile.ts`), pas au patient (étape 3 du
// multi-tenant, décision 2.3/3.2 de la spec). Les envoyer encore dans le corps du patient est
// précisément ce qui cassait ce formulaire : le back les refuse depuis la tâche 4 par un 400
// (`patient.schema.ts`, `.strict()`) — ne les réintroduis pas ici.
export const patientFormOpts = formOptions({
  defaultValues: {
    // Identity
    firstName: '',
    lastName: '',
    gender: '',
    birthDate: '',

    // Contact
    phone1: '',
    phone2: '',
    email: '',

    // Personal & Social Info — reste partagé entre les services de l'établissement (spec §3.2),
    // porté par le bloc « identité partagée » (`identite.patient.tsx`).
    distance: '',
    educationLevel: '',
    occupation: '',
    currentActivity: '',
  },
})

// Le sous-dossier de service (étape 3 du multi-tenant, `types/patientServiceFile.ts`) : les
// seize champs ci-dessus, avec les mêmes noms. Ces défauts à '' ne doivent JAMAIS partir tels
// quels sur le réseau — c'est le patron que `patientFormOpts` a laissé filer jusqu'à la tâche 4.
// `edit.patient.tsx` ne monte les blocs qui s'appuient sur ce formulaire (`serviceFileReady`)
// qu'une fois la lecture du sous-dossier résolue, moment où ces défauts sont déjà remplacés par
// les valeurs lues (ou restent vides si le sous-dossier n'existe pas encore — absence normale,
// spec §2.1/§5.1). Et à l'enregistrement, seuls les champs dont `isDefaultValue` est devenu faux
// partent dans le corps du PATCH (voir `edit.patient.tsx`) : une charge partielle, jamais un
// objet reconstruit à partir de ces défauts.
export const patientServiceFileFormOpts = formOptions({
  defaultValues: {
    // Referrals & Context
    referringCaregiver: '',
    followUpToDo: '',

    // Notes
    notes: '',
    details: '',

    // Inclusion Data
    medicalDiagnosis: '',
    entryDate: '',
    careMode: '',
    orientation: '',
    etpDecision: '',
    programType: '',
    nonInclusionDetails: '',
    customContentDetails: '',
    goal: '',

    // Exit Data
    exitDate: '',
    stopReason: '',
    etpFinalOutcome: '',
  },
})
