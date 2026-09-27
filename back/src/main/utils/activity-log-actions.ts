// LES ACTIONS DE `ActivityLog` QUI NE VIENNENT PAS D'UN EVENEMENT.
//
// La colonne `ActivityLog.action` est une chaine libre, alimentee par DEUX chemins :
//   - le bus d'evenements (`utils/app-event-bus.ts` -> `services/activity-log.subscriber.ts`),
//     ou l'action EST le nom de l'evenement — dix-sept valeurs aujourd'hui ;
//   - le script d'amorcage (`domain/user.domain.ts#bootstrapSuperAdmin`), qui ecrit directement,
//     hors du bus, parce qu'un SCRIPT peut se terminer avant qu'une ecriture « tire et oublie »
//     n'aboutisse (voir le commentaire de cette methode) — deux valeurs, celles-ci.
//
// POURQUOI ELLES SONT NOMMEES ICI PLUTOT QU'ECRITES EN CLAIR A LEUR SITE D'ECRITURE (revue
// finale de branche, Important n°2). Le vocabulaire complet du journal d'activite vaut DIX-NEUF
// valeurs, et le front doit savoir les nommer toutes sur l'ecran plateforme. Les dix-sept
// premieres se lisent depuis `AppEvents` ; ces deux-la n'etaient lisibles nulle part sans
// chercher un litteral au milieu d'une transaction. Le contrat entre les deux depots
// (`src/test/unit/utils/access-log-vocabulaire.test.ts`) les lit ICI : une troisieme action de
// script ajoutee sans passer par cette liste fait rougir ce contrat, au lieu d'apparaitre en
// clair, non traduite, sur l'ecran du super-admin.
export const SUPER_ADMIN_GRANTED = 'superAdmin.granted'
export const SUPER_ADMIN_REACTIVATED = 'superAdmin.reactivated'

export const ACTIVITY_LOG_SCRIPT_ACTIONS = [
  SUPER_ADMIN_GRANTED,
  SUPER_ADMIN_REACTIVATED,
] as const

export type ActivityLogScriptAction = (typeof ACTIVITY_LOG_SCRIPT_ACTIONS)[number]
