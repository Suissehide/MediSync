import type { PrimaTransactionClient } from '../client'

export type ActivityLogEntityRepo = {
  id: string
  establishmentId: string | null
  serviceId: string | null
  userID: string
  userFirstName: string | null
  userLastName: string | null
  action: string
  entityType: string
  entityID: string
  createdAt: Date
}

export type ActivityLogCreateEntityRepo = Omit<
  ActivityLogEntityRepo,
  'id' | 'createdAt' | 'establishmentId' | 'serviceId'
>

export type ActivityLogFindManyParams = {
  page: number
  // Absente : 50, la taille historique de la page.
  pageSize?: number
  action?: string
  userID?: string
  // Recherche par nom (prenom ou nom recopies dans la ligne), mot par mot.
  user?: string
  from?: Date
  // Navigation par echelle (2026-09-28) : filtre facultatif sur un service, honore seulement
  // sous le contexte d'etablissement (voir `ActivityLogRepository.scopeFilter`).
  serviceId?: string
}

export type ActivityLogScopeFilters = {
  serviceId?: string
}

export type ActivityLogFindManyResult = {
  data: ActivityLogEntityRepo[]
  total: number
  page: number
  pageSize: number
}

// Tâche 6, étape 4b : `GET /super-admin/access-log` (source=activite). Filtres libres — sous
// superadmin, `assertTenantReadScope` (tenant-guard.ts) ne s'applique qu'au contexte `tenant`,
// jamais à `superadmin` : rien n'exige donc un `where` particulier ici, contrairement au
// `findMany` ci-dessus (tenant ordinaire). Les trois filtres sont optionnels ; `page`/`pageSize`
// ne le sont pas.
//
// PAGINATION (2026-10-01) — CE CHAMP REMPLACE UNE BORNE DURE, ce n'est pas une commodité ajoutée
// à côté d'elle. La lecture était tronquée à 200 lignes (`PLATFORM_ACCESS_LOG_LIMIT`,
// `createdAt desc`) SANS aucun moyen de remonter plus loin : au-delà, les plus anciennes lignes du
// périmètre demandé étaient inatteignables, et la seule parade était de resserrer les filtres
// jusqu'à ce que le périmètre tienne sous la borne. C'était la limite §8 de
// `docs/multi-tenant/decisions-etape-4b.md`, écrite comme ouverte ; elle est fermée ici, du même
// geste et avec la même forme que le journal d'administration l'a été le 2026-09-29
// (`ActivityLogFindManyParams` ci-dessus). `sansEtablissement` reste utile après coup : viser les
// lignes du script d'amorçage par un filtre est plus court que de pousser la pagination jusqu'aux
// plus anciennes lignes de la plateforme.
//
// REVUE FINALE DE BRANCHE, Important n°1 — deux champs ont changé, et le mot « libres » ci-dessus
// ne doit pas laisser croire qu'ils sont interchangeables :
//   - `sansEtablissement` cible les lignes à `establishmentId: null` — celles du script
//     d'amorçage, les plus ANCIENNES de la table, donc les premières à tomber hors de la page de
//     200. Exclusif d'`establishmentId` par construction en amont (une seule valeur de requête,
//     `SANS_ETABLISSEMENT`, voir le schéma HTTP) ; si les deux arrivaient quand même ici,
//     l'implémentation tranche en faveur de `sansEtablissement`, jamais silencieusement des deux.
//   - `compte` remplace `userID` : identifiant EXACT **ou** fragment de prénom/nom, insensible à
//     la casse. Le filtrage par nom vivait dans le navigateur, sur la page déjà tronquée ; il est
//     désormais évalué en base, sur toute la table.
export type PlatformAccessLogFilters = {
  establishmentId?: string
  sansEtablissement?: boolean
  compte?: string
  action?: string
  page: number
  pageSize: number
}

// `page`/`pageSize` ne figurent PAS ici : la route les connaît déjà (elle vient de les lire dans
// sa requête) et les recopie dans sa réponse. Un dépôt qui les renverrait donnerait à croire
// qu'il peut les corriger — il ne le fait pas, il les applique. `total` est le décompte du même
// `where`, hors page : c'est lui, et lui seul, qui rend la dernière page atteignable.
export type PlatformAccessLogPage = {
  data: ActivityLogEntityRepo[]
  total: number
}

export interface ActivityLogRepositoryInterface {
  // `client` optionnel (tâche 11, étape 4a, tour de correction 1) : voir le commentaire sur
  // l'implémentation.
  create: (
    params: ActivityLogCreateEntityRepo,
    client?: PrimaTransactionClient,
  ) => Promise<void>
  findMany: (
    params: ActivityLogFindManyParams,
  ) => Promise<ActivityLogFindManyResult>
  findAllPlatformWide: (
    filters: PlatformAccessLogFilters,
  ) => Promise<PlatformAccessLogPage>
  deleteOlderThan: (
    date: Date,
    filters?: ActivityLogScopeFilters,
  ) => Promise<number>
}
