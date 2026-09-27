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

// `patientId` est optionnel depuis la tache 4 (etape 4b) : `GET /patient/export` n'a aucun
// identifiant de patient dans son URL, structurellement -- voir `utils/access-log-routes.ts`
// (`PATIENT_EXPORT_ROUTE_URL`, `plannedPatientExportAccess`) pour le mecanisme dedie qui la
// journalise quand meme, en une seule ligne. ARBITRAGE DE LEO (2026-09-27) : plutot que de
// deplacer l'export dans `ActivityLog`, la colonne `PatientAccessLog.patientId` (prisma/
// schema.prisma) devient nullable -- verifie avant d'ecrire que la cle etrangere composite
// (patientId, establishmentId) le tolere : Postgres, par defaut, en `MATCH SIMPLE`, n'exige la
// correspondance que lorsque AUCUNE colonne referente n'est nulle. Une ligne d'export
// (patientId `NULL`, establishmentId renseigne) ne declenche donc jamais la contrainte.
export type RecordAccessInput = {
  patientId?: string
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
