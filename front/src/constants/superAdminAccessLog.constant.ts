import { toSelectOptions } from '../libs/utils.ts'
import type { SuperAdminAccessLogSource } from '../types/superAdminAccessLog.ts'
import { ACCESS_LOG_ACTION_LABELS } from './accessLog.constant.ts'
import { ACTION_LABELS } from './activityLog.constant.ts'

// Étape 4b, tâche 11 : l'écran plateforme lit UN SEUL des deux journaux à la fois (`source`
// obligatoire côté back — voir le commentaire de `superAdminAccessLogSourceSchema`, back) : jamais
// un merge des deux (leurs colonnes ne se recouvrent qu'en partie, voir le commentaire du schéma
// back).
//
// REVUE FINALE DE BRANCHE, Important n°2 — CE FICHIER RÉUTILISAIT UN DICTIONNAIRE TROP ÉTROIT.
// Le premier jet se justifiait ainsi : « les deux dictionnaires existent déjà, chacun éprouvé par
// l'écran qui les a introduits ». Vrai de leur PROVENANCE, faux de leur COUVERTURE ici.
// `ACTION_LABELS` a été écrit pour l'écran d'activité DE SERVICE, qui ne voit jamais les actions
// écrites hors d'un service : il portait **8** clés quand le journal d'activité peut en porter
// **19**. Manquaient les sept `member.*` (écrites sous le contexte d'administration),
// `patient.removedFromPathway` (oubliée depuis l'étape 2, corrigée dans `activityLog.constant.ts`),
// les deux actions du script d'amorçage, et surtout `user.accessLinkReissued` — la ligne que la
// tâche 7 existe pour créer, sur la route la plus puissante du système. Aucune des onze n'était
// proposée par le filtre « Action » de l'écran plateforme : on ne pouvait pas filtrer sur ce que
// cet écran est justement le seul à pouvoir montrer.
//
// LE PARTAGE EST DONC ASYMÉTRIQUE, ET C'EST VOULU : l'écran de service garde son dictionnaire
// (lui ajouter les `member.*` peuplerait son filtre de valeurs qui ne matchent jamais rien), et
// l'écran plateforme l'ÉTEND. `PLATFORM_ONLY_ACTIVITY_ACTION_LABELS` porte exactement ce qui
// s'ajoute, jamais une recopie de ce qui existe.
//
// CE QUI EMPÊCHE CE DICTIONNAIRE DE REDEVENIR ÉTROIT :
// `back/src/test/unit/utils/access-log-vocabulaire.test.ts` le lie à la SOURCE (les clés de
// `AppEvents` plus `ACTIVITY_LOG_SCRIPT_ACTIONS`, côté back) et rougit sur tout écart, dans les
// deux sens. Un vingtième événement ajouté au back fait échouer ce contrat plutôt que de
// s'afficher ici sous son nom technique — c'est exactement le défaut que la tâche 11 avait
// reproduit, et la raison pour laquelle le mineur « aucun test de contrat entre les deux dépôts »
// est traité en même temps que celui-ci.
export const SUPER_ADMIN_ACCESS_LOG_SOURCE_OPTIONS: {
  value: SuperAdminAccessLogSource
  label: string
}[] = [
  { value: 'acces', label: 'Journal des consultations' },
  { value: 'activite', label: "Journal d'activité" },
]

// Les onze actions du journal d'activité que l'écran DE SERVICE ne voit jamais, et que l'écran
// plateforme est le seul à pouvoir afficher. Chaque clé est un nom d'événement de `AppEvents`
// (back) ou une action du script d'amorçage (`ACTIVITY_LOG_SCRIPT_ACTIONS`, back).
export const PLATFORM_ONLY_ACTIVITY_ACTION_LABELS: Record<string, string> = {
  // Gestion des membres — écrite sous le contexte d'administration d'établissement.
  'member.added': 'Membre rattaché',
  'member.updated': 'Membre modifié',
  'member.removed': 'Membre retiré',
  'member.deactivated': 'Membre désactivé',
  'member.reactivated': 'Membre réactivé',
  'member.accountCreated': 'Compte de membre créé',
  'member.accessLinkReissued': "Lien d'accès réémis (établissement)",
  // La route la plus puissante du système : réémission d'un lien pour N'IMPORTE QUEL compte,
  // hors de la garde de jeton qui borne la variante d'établissement ci-dessus. Le libellé
  // distingue les deux explicitement — les confondre effacerait précisément ce que la tâche 7
  // a créé cet événement pour porter.
  'user.accessLinkReissued': "Lien d'accès réémis (super-admin)",
  // Script d'amorçage (`npm run bootstrap:super-admin`) : les lignes sans établissement, que
  // seul cet écran peut lire — et seulement, au-delà de 200 entrées, en filtrant sur
  // « Sans établissement ».
  'superAdmin.granted': 'Super-admin accordé (script)',
  'superAdmin.reactivated': 'Super-admin réactivé (script)',
}

export const PLATFORM_ACTIVITY_ACTION_LABELS: Record<string, string> = {
  ...ACTION_LABELS,
  ...PLATFORM_ONLY_ACTIVITY_ACTION_LABELS,
}

export const superAdminAccessLogActionLabels = (
  source: SuperAdminAccessLogSource,
): Record<string, string> =>
  source === 'activite'
    ? PLATFORM_ACTIVITY_ACTION_LABELS
    : ACCESS_LOG_ACTION_LABELS

export const superAdminAccessLogActionOptions = (
  source: SuperAdminAccessLogSource,
) => toSelectOptions(superAdminAccessLogActionLabels(source))

// Valeur RÉSERVÉE du filtre d'établissement — miroir exact de `SANS_ETABLISSEMENT`
// (`back/src/main/interfaces/http/fastify/schemas/superAdminAccessLog.schema.ts`). Voir le
// commentaire du schéma back pour le pourquoi : les lignes du script d'amorçage n'ont pas
// d'établissement, ce sont les plus ANCIENNES de la table, et la lecture est bornée à 200 lignes
// en `createdAt desc` — sans cette option, elles redeviennent illisibles dès que le journal
// dépasse 200 entrées, alors que la documentation présente leur lisibilité comme acquise.
//
// L'option n'est proposée QUE sur le journal d'activité : `PatientAccessLog.establishmentId` est
// non nullable, et le back répond 400 à la combinaison — voir `access-log.tsx`.
export const SANS_ETABLISSEMENT = 'aucun'
