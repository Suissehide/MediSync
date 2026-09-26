import type {
  PatientServiceFile,
  Prisma,
} from '../../../../../generated/client'

export type PatientServiceFileEntityRepo = PatientServiceFile

// Le repository pose patientId, serviceId et establishmentId lui-meme : l'appelant ne les
// fournit pas. Derive de Prisma (comme PatientCreateEntityRepo) plutot qu'enumere a la main :
// patient.schema.ts reste le seul endroit du back ou ces seize colonnes sont ecrites en toutes
// lettres.
export type PatientServiceFileUpsertEntityRepo = Omit<
  Prisma.PatientServiceFileUncheckedCreateInput,
  'id' | 'patientId' | 'serviceId' | 'establishmentId' | 'createdAt' | 'diagnostics' | 'enrollmentIssues'
>

// Décision 3.6 (spec §3.6, tâche 9) : ce que l'écran affiche avant de désactiver un service.
// `suivisIci` est le nombre de patients qui y ont un sous-dossier ; `suivisNullePartAilleurs` —
// celui qui compte vraiment — est le sous-ensemble qui deviendra invisible de TOUTES les listes,
// faute d'aucun autre sous-dossier dans le même établissement. Calculé en miroir du signal de
// suivi ailleurs (`estSuiviAilleurs` ci-dessous), mais agrégé (deux nombres) plutôt que rendu
// patient par patient — jamais un identifiant, un nom de service ou un contenu.
export type PatientServiceFileDeactivationImpactRepo = {
  suivisIci: number
  suivisNullePartAilleurs: number
}

export interface PatientServiceFileRepositoryInterface {
  findByPatient: (patientId: string) => Promise<PatientServiceFileEntityRepo | null>
  upsert: (
    patientId: string,
    params: PatientServiceFileUpsertEntityRepo,
  ) => Promise<PatientServiceFileEntityRepo>
  // Cree le sous-dossier s'il n'existe pas encore, sans toucher a ses colonnes s'il existe deja.
  // Voir PatientServiceFileDomain.ensureExists pour qui l'appelle et pourquoi.
  ensureExists: (patientId: string) => Promise<void>
  // Signal de suivi ailleurs (design §5.3, tache 7) : vrai si ce patient a au moins un
  // sous-dossier dans un AUTRE service du MEME etablissement. Un booleen, rien d'autre — voir
  // PatientServiceFileRepository.estSuiviAilleurs pour la seule lecture de tout le back qui
  // traverse volontairement la frontiere entre services.
  estSuiviAilleurs: (patientId: string) => Promise<boolean>
  // Impact d'une désactivation (design §3.6, tâche 9) : appelée depuis le contexte
  // d'administration d'établissement (`/e/:establishmentId/admin/services/:id/impact-
  // desactivation`), où le tenant courant n'a PAS de service (`serviceId` null) — le
  // garde-fou refuse donc toute lecture directe de ce modèle de service. `serviceId` et
  // `establishmentId` sont fournis explicitement par l'appelant (le second est déjà celui de
  // l'établissement admin en cours ; le premier désigne le service dont on évalue la
  // désactivation, vérifié appartenir à cet établissement par `ServiceRepository.findByID`
  // avant cet appel).
  impactDesactivation: (
    serviceId: string,
    establishmentId: string,
  ) => Promise<PatientServiceFileDeactivationImpactRepo>
}
