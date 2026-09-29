import Boom from '@hapi/boom'

import type { IocContainer } from '../types/application/ioc'
import type {
  GrantInput,
  SuperAdminGrantDomainInterface,
} from '../types/domain/superAdminGrant.domain.interface'
import type {
  AccessGrantRepositoryInterface,
  EstablishmentGrantRow,
  SuperAdminGrantEntityRepo,
} from '../types/infra/orm/repositories/accessGrant.repository.interface'
import type { EstablishmentRepositoryInterface } from '../types/infra/orm/repositories/establishment.repository.interface'

// Tour de correction 1 (tâche 8) — Important n°2 de la relecture : deux octrois vivants sur le
// même établissement dédoublaient la ligne dans `/me` (`effectiveMemberships` en absorbe
// désormais le cas en défense, voir domain/accessGrant.domain.ts, `dedoublonneParEtablissement`)
// — mais la revue demandait aussi de trancher : empêcher un second octroi, ou se contenter du
// dédoublonnage. CHOIX RETENU : empêcher. S'accorder un DEUXIÈME octroi sur un établissement où
// l'on en détient déjà un ACTIF n'a aucune valeur d'usage (l'accès existe déjà) et ne fait que
// semer la confusion comptable (deux lignes pour la même intervention, avec des motifs et des
// échéances possiblement différents). Le message ci-dessous ne cache pas la raison : révoquer
// l'octroi existant, ou attendre son terme, est le chemin explicite pour en obtenir un autre.
const ACTIVE_GRANT_EXISTS =
  'An active grant already exists for this establishment — revoke it before requesting a new one'

// Mineur signalé en relecture (tâche 8, tour de correction 1) : un octroi sur un établissement
// désactivé était accepté (201) et sans le moindre effet — `AccessGrantRepository.findForUser`
// l'exclut déjà de toute lecture (CONTRAT 1, accessGrant.repository.interface.ts), donc l'accès
// promis n'existerait jamais. Refusé ICI, à l'écriture, plutôt que de laisser l'appelant croire
// qu'il a obtenu quelque chose : un établissement désactivé n'a de toute façon plus personne à
// diagnostiquer (spec « désactivé = invisible partout »).
const ESTABLISHMENT_DEACTIVATED =
  'Cannot grant access to a deactivated establishment'

// Quatre heures par défaut (spec §3.5) : « assez pour comprendre un ennui et agir, trop peu pour
// qu'un octroi oublié devienne un accès permanent ». Le plafond de vingt-quatre heures, lui,
// n'est PAS appliqué ici : il est tenu par le schéma HTTP (`superAdminGrant.schema.ts`,
// `durationHours: z.number().positive().max(24)`), qui REFUSE une demande hors bornes plutôt que
// de la ramener silencieusement à la limite — « un plafond qui tronque sans le dire fait croire à
// ce qu'on a demandé » (task-8-brief.md). Dupliquer la borne ici serait une seconde source de
// vérité pour la même règle, avec le risque qu'elles divergent un jour.
const DEFAULT_GRANT_DURATION_HOURS = 4
const MS_PER_HOUR = 60 * 60 * 1000

class SuperAdminGrantDomain implements SuperAdminGrantDomainInterface {
  private readonly accessGrantRepository: AccessGrantRepositoryInterface
  private readonly establishmentRepository: EstablishmentRepositoryInterface

  constructor({
    accessGrantRepository,
    establishmentRepository,
  }: IocContainer) {
    this.accessGrantRepository = accessGrantRepository
    this.establishmentRepository = establishmentRepository
  }

  // `findByIdOrThrow` lève `Boom.notFound` si `establishmentId` est inconnu — vérifié AVANT
  // d'écrire, plutôt que de laisser la contrainte de clé étrangère de `SuperAdminAccessGrant`
  // échouer et retomber sur un message d'erreur générique pensé pour une suppression
  // (`errorHandler.boomErrorFromPrismaError`, code `FOREIGN_KEY_CONSTRAINT_FAILED` : « cannot be
  // deleted because... », trompeur ici puisqu'il s'agit d'une création).
  async grant({
    userId,
    establishmentId,
    reason,
    durationHours,
  }: GrantInput): Promise<SuperAdminGrantEntityRepo> {
    const establishment =
      await this.establishmentRepository.findByIdOrThrow(establishmentId)
    if (establishment.deactivatedAt !== null) {
      throw Boom.conflict(ESTABLISHMENT_DEACTIVATED)
    }
    const now = new Date()
    // Tour de correction 1 : refuse AVANT d'écrire — voir le commentaire au-dessus de
    // `ACTIVE_GRANT_EXISTS`. COURSE SYSTÉMATIQUE, PAS HYPOTHÉTIQUE (tour de correction 2 — la
    // relecture a mesuré, et je l'ai reproduit par exécution : trois essais, trois fois deux
    // octrois vivants créés) : deux requêtes concurrentes qui visent le MÊME établissement
    // passent TOUJOURS ce contrôle toutes les deux avant que l'une n'écrive — la fenêtre s'ouvre
    // à chaque fois, elle ne se referme jamais d'elle-même. Sans conséquence de sûreté : le
    // dédoublonnage (`effectiveMemberships`, `dedoublonneParEtablissement`) absorbe le cas et
    // `/me` ne montre qu'une ligne. Conséquence réelle, assumée : la liste de l'administrateur
    // d'établissement (`GET /e/:establishmentId/admin/grants`) montre alors DEUX lignes vivantes,
    // simultanément — elle ne dédoublonne pas, spec §3.5 exige « en cours ET passés », donc
    // chaque ligne réelle. Pas de contrainte Postgres qui ferme proprement cette fenêtre-là ici
    // (une expiration COURANTE, `expiresAt > now()`, n'est pas un prédicat d'index partiel
    // valide : elle varie dans le temps, contrairement à `revokedAt IS NULL`, qui bloquerait à
    // tort un octroi FUTUR après la simple expiration naturelle d'un précédent jamais révoqué).
    // Porté au journal de décisions de l'étape (tâche 14) plutôt que fermé ici.
    const dejaVivant = await this.accessGrantRepository.hasLiveGrant(
      userId,
      establishmentId,
      now,
    )
    if (dejaVivant) {
      throw Boom.conflict(ACTIVE_GRANT_EXISTS)
    }
    const hours = durationHours ?? DEFAULT_GRANT_DURATION_HOURS
    const expiresAt = new Date(now.getTime() + hours * MS_PER_HOUR)
    return this.accessGrantRepository.create({
      userId,
      establishmentId,
      reason,
      expiresAt,
    })
  }

  revoke(id: string, callerId: string): Promise<void> {
    return this.accessGrantRepository.revoke(id, callerId, new Date())
  }

  forEstablishment(): Promise<EstablishmentGrantRow[]> {
    return this.accessGrantRepository.findForEstablishment()
  }
}

export { SuperAdminGrantDomain }
