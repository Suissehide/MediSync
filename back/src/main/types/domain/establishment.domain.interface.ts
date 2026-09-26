import type { Establishment } from '../../../generated/client'

// Le premier administrateur d'un établissement neuf (spec §3.1, §4.1, §6.2, tâche 6). Une seule
// route l'appelle aujourd'hui : `POST /super-admin/establishments`.
export type CreateEstablishmentInput = {
  name: string
  email: string
  firstName?: string
  lastName?: string
}

// Tour de correction 1 (relecture externe), Important n°1 : la réponse ne porte plus AUCUNE
// information sur le compte au-delà de ce qui est strictement nécessaire à l'appelant —
// l'établissement créé et le lien. Elle portait `firstAdmin.{firstName,lastName}` : ces deux
// champs reflétaient la valeur STOCKÉE (celle d'un compte réutilisé), jamais celle SOUMISE dans
// la requête — un appel avec un nom différent sur une adresse déjà connue rendait l'ancien nom,
// jamais le nouveau. La divergence entre ce qui est envoyé et ce qui est reçu EST un oracle
// d'existence de comptes, exactement ce que le Review Focus n°4 interdit ; un statut et des
// clés identiques ne suffisaient pas à le fermer, puisque l'oracle vit dans une VALEUR, pas
// dans la forme. Voir `super-admin-establishments.test.ts`, qui envoie désormais des noms
// différents sur les deux appels pour le prouver.
export type CreateEstablishmentResult = {
  establishment: Establishment
  // Le jeton en clair, rendu une seule fois — voir `AccessLinkDomainInterface.issue`.
  accessLink: { token: string }
}

export interface EstablishmentDomainInterface {
  // Review Focus n°4 (task-6-brief.md) : si `email` désigne déjà un compte, il n'est NI écrasé
  // (ni le nom, ni le mot de passe) NI créé une seconde fois — il est seulement rattaché, en
  // ADMIN, au nouvel établissement. La forme ET le contenu du résultat sont identiques dans les
  // deux cas : rien ne permet à l'appelant de distinguer un compte créé d'un compte réutilisé.
  //
  // Lève `Boom.conflict` SANS RIEN CRÉER si le compte désigné par `email` est désactivé (tour de
  // correction 1, Important n°4) : un établissement dont l'unique administrateur ne peut ni se
  // connecter (compte désactivé) ni consommer son lien (`AccessLinkDomain.consume` refuse un
  // compte désactivé, Review Focus n°5 de la tâche 4) serait créé inutilisable, sans qu'aucun
  // signal ne le dise.
  createWithFirstAdmin: (
    input: CreateEstablishmentInput,
    issuedBy: string,
  ) => Promise<CreateEstablishmentResult>
}
