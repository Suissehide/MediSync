import { formOptions } from '@tanstack/react-form'

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

    // Personal & Social Info
    distance: '',
    educationLevel: '',
    occupation: '',
    currentActivity: '',

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
