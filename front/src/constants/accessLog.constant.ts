// Libellés des quatre actions distinguées par le journal des consultations
// (`back/src/main/types/domain/patientAccessLog.domain.interface.ts#AccessAction`). La colonne
// `action` est une chaîne libre côté back (voir le commentaire de ce fichier) : un libellé
// manquant retombe sur la valeur brute plutôt que de masquer une ligne.
export const ACCESS_LOG_ACTION_LABELS: Record<string, string> = {
  'dossier.ouvert': 'Dossier ouvert',
  'sousDossier.ouvert': 'Sous-dossier ouvert',
  'echecsInscription.consultes': "Échecs d'inscription consultés",
  export: 'Export',
}
