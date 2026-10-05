import type { AccessLink, User } from '../../../../../generated/client'
import type { PrimaTransactionClient } from '../client'

export type AccessLinkEntityRepo = AccessLink

// Jointure minimale nécessaire à `AccessLinkDomain.consume` : seul `deactivatedAt` du compte
// cible importe, jamais le reste du profil — `select`, pas `include: true`.
export type AccessLinkWithUser = AccessLink & {
  user: Pick<User, 'id' | 'deactivatedAt'>
}

export type AccessLinkCreateEntityRepo = {
  userId: string
  tokenHash: string
  createdBy: string
  expiresAt: Date
}

export type LatestAccessLink = {
  userId: string
  createdAt: Date
  usedAt: Date | null
  expiresAt: Date
}

export interface AccessLinkRepositoryInterface {
  findLatestCreatedAt: (userId: string) => Promise<Date | null>
  findLatestLinks: (userIds: string[]) => Promise<LatestAccessLink[]>
  // Invalide (marque consommés) tous les liens NON consommés de ce compte. Appelé avant de créer
  // le nouveau lien à l'émission : une réémission invalide les liens précédents du même compte
  // (spec §6.1), pour un appelant SÉQUENTIEL (l'usage attendu). Ceci NE ferme PAS la course entre
  // deux appels concurrents à `AccessLinkDomain.issue` pour le même compte — voir le commentaire
  // détaillé sur `issue`, `domain/accessLink.domain.ts` — contrairement à `consumeIfActive`, ci-dessous, qui, lui, doit résister à
  // deux appels simultanés.
  // `client` optionnel : le client de
  // transaction (`PrimaTransactionClient`) quand cet appel doit faire partie d'une transaction
  // ouverte par l'appelant — `EstablishmentDomain.createWithFirstAdmin`, aujourd'hui, est seul à
  // le fournir. Omis, retombe sur `this.prisma` (comportement inchangé pour tout appelant
  // existant, `AccessLinkDomain.issue` en tête).
  invalidateActiveForUser: (
    userId: string,
    now: Date,
    client?: PrimaTransactionClient,
  ) => Promise<void>
  create: (
    params: AccessLinkCreateEntityRepo,
    client?: PrimaTransactionClient,
  ) => Promise<void>
  // Lecture SEULE, jamais de mutation : sert à distinguer un jeton inconnu (retourne `null`) d'un
  // jeton connu, pour lire le compte cible AVANT de décider de consommer.
  findByTokenHashWithUser: (
    tokenHash: string,
  ) => Promise<AccessLinkWithUser | null>
  // Usage unique tenu PAR LA BASE : un `updateMany` conditionné sur
  // `usedAt: null` ET `expiresAt` non dépassé, jamais une lecture suivie d'une écriture — deux
  // appels simultanés sur le même jeton ne peuvent en toucher qu'un. Renvoie `true` si CETTE
  // invocation a bien consommé la ligne (une seule des deux, sous concurrence), `false` sinon
  // (jeton déjà consommé ou expiré entre-temps).
  consumeIfActive: (tokenHash: string, now: Date) => Promise<boolean>
}
