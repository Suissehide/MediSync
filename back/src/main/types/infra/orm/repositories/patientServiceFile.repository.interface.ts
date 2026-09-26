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
// faute d'aucun autre sous-dossier dans un AUTRE SERVICE ACTIF du même établissement — jamais un
// identifiant, un nom de service ou un contenu, seulement deux nombres.
//
// CE N'EST PAS UN MIROIR d'`estSuiviAilleurs` (tour de correction 2, tâche 9 — le brief initial
// employait ce mot, à tort, et le coordinateur l'a tranché) : les deux répondent à des questions
// différentes, et c'est voulu. `estSuiviAilleurs` répond « un sous-dossier existe-t-il ailleurs »
// — vrai même si ce service est aujourd'hui désactivé, puisque le sous-dossier existe et que ce
// service peut être réactivé. Ce type-ci répond « ce patient deviendra-t-il invisible partout »
// — et un ailleurs déjà désactivé ne protège de rien. Aligner les deux casserait l'un des deux ;
// voir le commentaire sur `PatientServiceFileRepository.impactDesactivation` pour le détail.
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
  // sous-dossier dans un AUTRE service du MEME etablissement, ACTIF OU NON — un booleen, rien
  // d'autre. Voir PatientServiceFileRepository.estSuiviAilleurs pour la question precise a
  // laquelle il repond, et pourquoi ce n'est pas la meme que celle d'`impactDesactivation`.
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
