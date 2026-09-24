// Champs cliniques que le document d'habilitations réserve à `clinical:read`
// (le secrétariat et la lecture seule ne doivent pas les voir) :
//   - sur le patient : notes, details, medicalDiagnosis ;
//   - sur un patient inscrit à un rendez-vous : transmissionNotes.
//
// `etpDecision`, `goal`, `programType` et `stopReason` n'en font volontairement
// pas partie : ce sont des données administratives du programme, qu'un
// secrétariat a de bonnes raisons de voir.
//
// `notes`, `details` et `medicalDiagnosis` existent à deux endroits de
// `prisma/schema.prisma` : sur `Patient`, et sur `PatientServiceFile`, son
// sous-dossier de service (étape 3 du multi-tenant — les deux copies
// coexistent tant que la donnée n'a pas été migrée). Les deux occurrences
// désignent la même donnée clinique, donc les stripper toutes les deux par
// nom de clé reste correct. `transmissionNotes` n'existe qu'une fois, sur
// `AppointmentPatient`. Si l'un de ces noms venait à apparaître sur un
// modèle qui n'a rien de clinique, il faudrait repasser à un filtrage par
// forme — un test le rappelle, en comptant les occurrences attendues.
export const CLINICAL_FIELDS: readonly string[] = [
  'notes',
  'details',
  'medicalDiagnosis',
  'transmissionNotes',
]

const CLINICAL_FIELD_SET: ReadonlySet<string> = new Set(CLINICAL_FIELDS)

// Strictement les objets simples : une instance de classe est laissee telle
// quelle. La recopier champ par champ la degraderait en objet nu, et la
// reponse differerait alors pour les seuls roles sans acces clinique — une
// divergence de comportement difficile a diagnostiquer. Date et Buffer sont
// deja exclus par la meme regle, comme toute instance.
const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const prototype: unknown = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

// Copie la charge utile en retirant les champs cliniques, à tous les niveaux
// d'imbrication : un patient reste filtré même quand il est embarqué par un
// rendez-vous, lui-même embarqué par un créneau, lui-même embarqué par un
// parcours. Ne modifie jamais l'objet reçu.
//
// Sert dans les deux sens : en sortie, pour ne pas livrer ce que l'appelant
// n'a pas le droit de lire ; en entrée, pour ne pas écrire ce qu'il n'a pas
// le droit de modifier. Retirer la clé d'un corps de requête laisse la
// colonne **inchangée** en base — Prisma ignore `undefined` dans un `update`
// — là où l'envoyer à vide l'écraserait.
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
