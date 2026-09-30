import type { Establishment } from '../../../generated/client'
import type { PlatformAccessLogPage } from '../infra/orm/repositories/activityLog.repository.interface'
import type {
  EstablishmentDetail,
  EstablishmentListRow,
} from '../infra/orm/repositories/establishment.repository.interface'

// Le premier administrateur d'un établissement neuf (spec §3.1, §4.1, §6.2). Une seule
// route l'appelle aujourd'hui : `POST /super-admin/establishments`.
export type CreateEstablishmentInput = {
  name: string
  email: string
  firstName?: string
  lastName?: string
}

// La réponse ne porte AUCUNE information sur le compte au-delà de ce qui est strictement
// nécessaire à l'appelant — l'établissement créé et le lien. Elle ne porte PAS
// `firstAdmin.{firstName,lastName}` : ces deux champs refléteraient la valeur STOCKÉE (celle
// d'un compte réutilisé), jamais celle SOUMISE dans la requête — un appel avec un nom
// différent sur une adresse déjà connue rendrait l'ancien nom, jamais le nouveau. La
// divergence entre ce qui est envoyé et ce qui est reçu serait un oracle d'existence de
// comptes ; un statut et des clés identiques ne suffiraient pas à le fermer, puisque l'oracle
// vit dans une VALEUR, pas dans la forme. Voir `super-admin-establishments.test.ts`, qui
// envoie des noms différents sur les deux appels pour le prouver.
export type CreateEstablishmentResult = {
  establishment: Establishment
  // Le jeton en clair, rendu une seule fois — voir `AccessLinkDomainInterface.issue`.
  accessLink: { token: string }
}

export interface EstablishmentDomainInterface {
  // Si `email` désigne déjà un compte, il n'est NI écrasé
  // (ni le nom, ni le mot de passe) NI créé une seconde fois — il est seulement rattaché, en
  // ADMIN, au nouvel établissement. La forme ET le contenu du résultat sont identiques dans les
  // deux cas : rien ne permet à l'appelant de distinguer un compte créé d'un compte réutilisé.
  //
  // Lève `Boom.conflict` SANS RIEN CRÉER si le compte désigné par `email` est désactivé : un
  // établissement dont l'unique administrateur ne peut ni se connecter (compte désactivé) ni
  // consommer son lien (`AccessLinkDomain.consume` refuse un compte désactivé) serait créé
  // inutilisable, sans qu'aucun signal ne le dise.
  createWithFirstAdmin: (
    input: CreateEstablishmentInput,
    issuedBy: string,
  ) => Promise<CreateEstablishmentResult>
  // La liste du super-admin et ses compteurs (spec §3.3). Une donnée de santé
  // agrégée, assumée et bornée — voir le commentaire sur `EstablishmentCounters`.
  list: () => Promise<EstablishmentListRow[]>
  // Le détail d'UN établissement (spec §6.2) : la ligne de la liste,
  // augmentée des services, membres et journal d'activité de cet établissement. `Boom.notFound`
  // si l'id est inconnu (`findByIdOrThrow`).
  getById: (id: string) => Promise<EstablishmentDetail>
  // Le journal d'activité d'UN établissement, paginé (2026-10-01) : extrait de `getById`, qui le
  // rendait borné à 100 lignes et sans moyen d'aller au-delà. Voir l'implémentation pour pourquoi
  // cette route ne vérifie PAS l'existence de l'établissement (elle rend une page vide).
  activityLogFor: (
    id: string,
    params: { page: number; pageSize: number },
  ) => Promise<PlatformAccessLogPage>
  rename: (id: string, name: string) => Promise<Establishment>
}
