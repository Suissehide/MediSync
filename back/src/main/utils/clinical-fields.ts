// Champs cliniques que le document d'habilitations réserve à `clinical:read`
// (le secrétariat et la lecture seule ne doivent pas les voir) :
//   - sur le patient : notes, details, medicalDiagnosis ;
//   - sur un patient inscrit à un rendez-vous : transmissionNotes.
//
// `etpDecision`, `goal`, `programType` et `stopReason` n'en font volontairement
// pas partie : ce sont des données administratives du programme, qu'un
// secrétariat a de bonnes raisons de voir.
//
// Chacun de ces quatre noms n'existe qu'une fois dans `prisma/schema.prisma`
// (Patient pour les trois premiers, AppointmentPatient pour le quatrième) :
// un retrait par nom de clé ne peut donc pas emporter un champ homonyme d'un
// autre modèle. Si le schéma venait à réutiliser un de ces noms ailleurs, il
// faudrait repasser à un filtrage par forme — un test le rappelle.
export const CLINICAL_FIELDS: readonly string[] = [
  'notes',
  'details',
  'medicalDiagnosis',
  'transmissionNotes',
]

const CLINICAL_FIELD_SET: ReadonlySet<string> = new Set(CLINICAL_FIELDS)

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' &&
  value !== null &&
  !Array.isArray(value) &&
  !(value instanceof Date) &&
  !Buffer.isBuffer(value)

// Copie la charge utile en retirant les champs cliniques, à tous les niveaux
// d'imbrication : un patient reste filtré même quand il est embarqué par un
// rendez-vous, lui-même embarqué par un créneau, lui-même embarqué par un
// parcours. Ne modifie jamais l'objet reçu.
export const withoutClinicalFields = <T>(payload: T): T => {
  if (Array.isArray(payload)) {
    return payload.map((item) => withoutClinicalFields(item)) as unknown as T
  }
  if (!isPlainObject(payload)) {
    return payload
  }
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(payload)) {
    if (CLINICAL_FIELD_SET.has(key)) {
      continue
    }
    result[key] = withoutClinicalFields(value)
  }
  return result as T
}
