// Journal des consultations d'un dossier patient (etape 4b). Trois evenements distingues, sans
// que le journal ne porte jamais lui-meme de contenu clinique (voir `record`,
// domain/patientAccessLog.domain.ts, et `utils/clinical-fields.ts` pour la liste des cles
// interdites dans `exportFilters`).
export type AccessAction = 'dossier.ouvert' | 'sousDossier.ouvert' | 'export'

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
