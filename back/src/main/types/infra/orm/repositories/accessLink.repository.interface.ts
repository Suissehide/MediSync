import type { AccessLink, User } from '../../../../../generated/client'

export type AccessLinkEntityRepo = AccessLink

// Jointure minimale nécessaire à `AccessLinkDomain.consume` : seul `deactivatedAt` du compte
// cible importe (Review Focus n°5), jamais le reste du profil — `select`, pas `include: true`.
export type AccessLinkWithUser = AccessLink & {
  user: Pick<User, 'id' | 'deactivatedAt'>
}

export type AccessLinkCreateEntityRepo = {
  userId: string
  tokenHash: string
  createdBy: string
  expiresAt: Date
}

export interface AccessLinkRepositoryInterface {
  // Invalide (marque consommés) tous les liens NON consommés de ce compte. Appelé avant de créer
  // le nouveau lien à l'émission : une réémission invalide les liens précédents du même compte
  // (spec §6.1). Un `updateMany` sans condition de course à protéger ici — contrairement à
  // `consumeIfActive`, qui, lui, doit résister à deux appels simultanés.
  invalidateActiveForUser: (userId: string, now: Date) => Promise<void>
  create: (params: AccessLinkCreateEntityRepo) => Promise<void>
  // Lecture SEULE, jamais de mutation : sert à distinguer un jeton inconnu (retourne `null`) d'un
  // jeton connu, pour lire le compte cible AVANT de décider de consommer (Review Focus n°5).
  findByTokenHashWithUser: (tokenHash: string) => Promise<AccessLinkWithUser | null>
  // Usage unique tenu PAR LA BASE (Review Focus n°1) : un `updateMany` conditionné sur
  // `usedAt: null` ET `expiresAt` non dépassé, jamais une lecture suivie d'une écriture — deux
  // appels simultanés sur le même jeton ne peuvent en toucher qu'un. Renvoie `true` si CETTE
  // invocation a bien consommé la ligne (une seule des deux, sous concurrence), `false` sinon
  // (jeton déjà consommé ou expiré entre-temps).
  consumeIfActive: (tokenHash: string, now: Date) => Promise<boolean>
}
