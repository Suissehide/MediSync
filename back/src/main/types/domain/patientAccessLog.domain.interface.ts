// Journal des consultations d'un dossier patient (etape 4b). Quatre evenements distingues, sans
// que le journal ne porte jamais lui-meme de contenu clinique (voir `record`,
// domain/patientAccessLog.domain.ts, et `utils/clinical-fields.ts` pour la liste des cles
// interdites dans `exportFilters`).
//
// `echecsInscription.consultes` est la quatrieme valeur, ajoutee a l'etape 4b tache 3 (tour de
// correction 1, arbitrage de Leo) pour `GET /patient/:patientID/enrollment-issue` : cette lecture
// designe nommement un dossier (la reponse porte `patientId`) et son champ `reason` est du texte
// libre, donc elle doit etre journalisee — mais aucune des trois autres valeurs ne la decrirait
// sans induire en erreur qui relit le journal. La colonne `action` de `PatientAccessLog` est une
// chaine libre en base (prisma/schema.prisma) : cet ajout n'a demande aucune migration.
export type AccessAction =
  | 'dossier.ouvert'
  | 'sousDossier.ouvert'
  | 'echecsInscription.consultes'
  | 'export'

export type RecordAccessInput = {
  patientId: string
  userID: string
  userFirstName: string | null
  userLastName: string | null
  action: AccessAction
  exportCount?: number
  exportFilters?: string
}

export interface PatientAccessLogDomainInterface {
  record: (input: RecordAccessInput) => Promise<void>
}
