import type { LiveGrant } from '../../../domain/accessGrant.domain.interface'

// Tâche 8 (étape 4a) : la moitié « écriture » du mécanisme — s'accorder un octroi, le révoquer
// avant terme. `SuperAdminAccessGrant.create` et `.update` sont déclarées pour le contexte
// superadmin (SUPERADMIN_GLOBAL_OPERATIONS, tenant-guard.ts) ; PAS `.delete`/`.deleteMany` — la
// révocation pose `revokedAt`, elle ne supprime jamais la ligne (spec §4.3 : « les octrois en
// cours ET PASSÉS », colonne comptable du mécanisme).
export type SuperAdminGrantEntityRepo = {
  id: string
  userId: string
  establishmentId: string
  reason: string
  grantedAt: Date
  expiresAt: Date
  revokedAt: Date | null
}

export type CreateGrantRepo = {
  userId: string
  establishmentId: string
  reason: string
  expiresAt: Date
}

// Vue depuis l'établissement (`GET /e/:establishmentId/admin/grants`, spec §6.2) : PAS
// `establishmentId` (déjà le tenant courant), et l'auteur — c'est toujours le TITULAIRE de
// l'octroi lui-même (spec §3.5 : « s'accorder l'accès »), `SuperAdminAccessGrant` ne porte
// aucune colonne d'émetteur distincte de `userId`. Nom visible, comme partout ailleurs où un
// administrateur regarde un compte (voir `FirstAdmin`, establishment.repository.interface.ts) :
// un nom de collègue n'est pas une donnée de santé.
export type EstablishmentGrantRow = {
  id: string
  reason: string
  grantedAt: Date
  expiresAt: Date
  revokedAt: Date | null
  grantedBy: {
    id: string
    email: string
    firstName: string | null
    lastName: string | null
  }
}

export interface AccessGrantRepositoryInterface {
  // Octrois NON révoqués de cet utilisateur, un par établissement, chacun enrichi du nom de
  // l'établissement et de ses services actifs. Peut inclure des octrois déjà expirés dans le
  // temps : c'est `effectiveMemberships` qui tranche la vivacité, pas cette lecture — voir
  // `types/domain/accessGrant.domain.interface.ts`.
  //
  // CONTRAT (tâche 8, étape 4a — écrit ici après une revue qui a montré, par exécution, qu'il
  // n'était écrit NULLE PART) : cette méthode DOIT exclure tout octroi dont l'établissement est
  // désactivé — `AccessGrantRepository.findForUser` le fait par un `deactivatedAt: null` sur la
  // lecture d'`Establishment` qui enrichit chaque octroi. `effectiveMemberships`
  // (domain/accessGrant.domain.ts, section « Ce qu'elle ne garantit PAS ») fait CONFIANCE à cette
  // exclusion sans la reproduire : elle ne porte, sur `LiveGrant`, aucune colonne qui lui
  // permettrait de la vérifier elle-même. Retirer ce filtre ici rouvre donc un accès COMPLET
  // (rôle ADMIN d'établissement, COORDINATEUR sur tous les services) à un établissement désactivé
  // pour quiconque détient un octroi dessus — sans qu'aucune couche au-dessus ne le rattrape, et
  // sans qu'aucune porte de conformité existante (build, lint, unitaires, e2e d'alors) ne rougisse :
  // aucun test ne portait sur CE croisement précis (octroi + établissement désactivé) avant
  // `tenant-resolution.test.ts`, « un octroi sur un établissement désactivé ne redonne rien ».
  // Toute réimplémentation de cette méthode doit préserver ce filtre ; ce test rougit sinon.
  findForUser: (userId: string) => Promise<LiveGrant[]>

  // `POST /super-admin/grants` : encadré par `runAsSuperAdmin` dans l'implémentation
  // (`SuperAdminAccessGrant.create` n'est déclarée que sous ce contexte).
  create: (params: CreateGrantRepo) => Promise<SuperAdminGrantEntityRepo>

  // `DELETE /super-admin/grants/:id` : encadré par `runAsSuperAdmin`, pose `revokedAt`, ne
  // supprime jamais la ligne — voir le commentaire sur `SuperAdminGrantEntityRepo`. Lève
  // `Boom.notFound` (via `errorHandler.boomErrorFromPrismaError`) si l'id est inconnu.
  revoke: (id: string, at: Date) => Promise<void>

  // `GET /e/:establishmentId/admin/grants` : les octrois EN COURS ET PASSÉS de CET établissement,
  // triés du plus récent au plus ancien. Appelée depuis une route déjà sous contexte tenant réel
  // (`resolveEstablishmentAdmin`, `members:manage`) — PAS besoin de `runAsSuperAdmin` : `
  // SuperAdminAccessGrant` est un modèle global, et un modèle global se lit sans restriction
  // supplémentaire sous un contexte tenant ordinaire (spec §4.1 ; voir aussi le commentaire au-
  // dessus de `SUPERADMIN_GLOBAL_OPERATIONS`, tenant-guard.ts, dont la porte ne s'applique QUE
  // sous `store.kind === 'superadmin'`). Aucun `establishmentId` en paramètre — l'implémentation
  // le lit via `tenantContext.establishmentScope()`, jamais du paramètre d'URL brut (même parti
  // pris que `MembershipRepository`).
  findForEstablishment: () => Promise<EstablishmentGrantRow[]>
}
