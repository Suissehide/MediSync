import { toSelectOptions } from '../libs/utils.ts'

// Les actions que l'écran d'activité DE SERVICE peut rencontrer
// (`routes/.../s/$serviceId/_settings/activity-log.tsx`) : celles écrites sous un contexte de
// tenant AVEC un service courant. Les actions de gestion des membres (`member.*`) sont écrites
// sous le contexte d'ADMINISTRATION, qui n'a pas de service : leurs libellés vivent dans
// `constants/superAdminAccessLog.constant.ts`, qui COMPLÈTE ce dictionnaire, et la colonne
// « Action » (`columns/activityLog.column.tsx`) lit l'union des deux.
//
// `patient.removedFromPathway` A ÉTÉ AJOUTÉ récemment. Il manquait
// depuis longtemps : l'événement existe sur `main` depuis l'origine du bus, il est bien écrit
// sous un contexte de service, et le filtre « Action » de cet écran-ci ne le proposait pas —
// une ligne réelle s'affichait donc sous son nom technique, et aucune valeur du filtre ne
// permettait de l'isoler. Trouvé par le contrat de vocabulaire
// (`back/src/test/unit/utils/access-log-vocabulaire.test.ts`), qui lie désormais ce fichier à
// `AppEvents`.
export const ACTION_LABELS: Record<string, string> = {
  'patient.created': 'Patient créé',
  'patient.updated': 'Patient modifié',
  'patient.deleted': 'Patient supprimé',
  'patient.enrolled': 'Patient inscrit à un parcours',
  'patient.removedFromPathway': "Patient retiré d'un parcours",
  'diagnostic.created': 'Diagnostic créé',
  'diagnostic.updated': 'Diagnostic modifié',
  'appointment.created': 'Rendez-vous créé',
  'appointment.updated': 'Rendez-vous modifié',
  // Gestion de l'équipe du service par son coordinateur : écrite sous un contexte de service,
  // donc visible ici — à la différence des `member.*` de l'administration d'établissement.
  'serviceMember.added': 'Membre affecté au service',
  'serviceMember.accountCreated': 'Compte créé et affecté au service',
  'serviceMember.updated': 'Rôle dans le service modifié',
  'serviceMember.removed': 'Membre retiré du service',
}

export const ACTION_OPTIONS = toSelectOptions(ACTION_LABELS)

export const TYPE_LABELS: Record<string, string> = {
  patient: 'Patient',
  diagnostic: 'Diagnostic',
  appointment: 'Rendez-vous',
  slot: 'Créneau',
  slotTemplate: 'Template',
  pathway: 'Parcours',
  member: 'Membre',
  user: 'Compte',
}

export const PERIOD_DAYS: Record<string, string> = {
  '7': '7 derniers jours',
  '30': '30 derniers jours',
  '90': '3 derniers mois',
  '365': '12 derniers mois',
}

export const PERIOD_OPTIONS = toSelectOptions(PERIOD_DAYS)
