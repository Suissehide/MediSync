export const JOURS = [
  'lundi',
  'mardi',
  'mercredi',
  'jeudi',
  'vendredi',
  'samedi',
  'dimanche',
]

// Les mêmes phrases à l'écran et dans le CSV : la spec MDS-40 §3 en est la source.
export const ACTIVITY_DEFINITIONS = [
  {
    label: 'File active',
    definition:
      'Patients distincts ayant au moins une présence dans la période.',
  },
  {
    label: 'Nouveaux inclus',
    definition:
      "Dossiers dont le diagnostic éducatif tombe dans la période (même règle que l'enquête ARS).",
  },
  {
    label: 'Sortis',
    definition: 'Dossiers dont la date de sortie tombe dans la période.',
  },
  {
    label: 'Ont terminé',
    definition:
      "Sortis dont le programme est complet : un diagnostic éducatif, au moins une séance, au moins une réactualisation, depuis l'entrée.",
  },
  {
    label: 'Abandons',
    definition:
      "Sortis avec un motif d'arrêt autre que « Plus de besoin / Fin de parcours ».",
  },
  {
    label: 'Absentéisme',
    definition:
      'Absents divisés par les rendez-vous pointés (présents et absents) ; les rendez-vous non pointés sont exclus. Moins de 5 rendez-vous pointés : pas de taux.',
  },
  {
    label: 'Séances individuelles',
    definition: 'Présences sur un créneau individuel.',
  },
  {
    label: 'Séances collectives',
    definition: 'Créneaux collectifs ayant eu au moins un présent.',
  },
  {
    label: 'Heures soignant',
    definition:
      'Durée de chaque créneau réalisé, comptée une fois pour chaque métier affecté au créneau.',
  },
  {
    label: 'Bilans de fin',
    definition:
      "Présences à une réactualisation : approximation, il n'existe pas de bilan de fin dédié.",
  },
  {
    label: 'Délai adressage → entrée',
    definition:
      "Non calculé : MediSync n'enregistre ni liste d'attente ni date d'adressage.",
  },
]
