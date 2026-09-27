import Boom from '@hapi/boom'

import type { PostgresOrm } from '../infra/orm/postgres-client'
import type { IocContainer } from '../types/application/ioc'
import type { AccessLinkDomainInterface } from '../types/domain/accessLink.domain.interface'
import type {
  AccountSearchResult,
  BootstrapSuperAdminResult,
  PasswordChangeDomain,
  UserDomainInterface,
  UserEntityDomain,
  UserProfileUpdateDomain,
} from '../types/domain/user.domain.interface'
import type { ActivityLogRepositoryInterface } from '../types/infra/orm/repositories/activityLog.repository.interface'
import type { EstablishmentRepositoryInterface } from '../types/infra/orm/repositories/establishment.repository.interface'
import type {
  UserEntityRepo,
  UserRepositoryInterface,
} from '../types/infra/orm/repositories/user.repository.interface'
import type { TenantContextInterface } from '../types/utils/tenant-context'
import {
  SUPER_ADMIN_GRANTED,
  SUPER_ADMIN_REACTIVATED,
} from '../utils/activity-log-actions'
import type { AppEventBus } from '../utils/app-event-bus'
import { verifyPassword } from '../utils/hash'

// Repli défensif, nommé plutôt que laissé en `?? ''` silencieux (tour de correction 1, mineur) :
// `establishmentIds` vient d'être extrait des rattachements eux-mêmes, `findManyByIds` DEVRAIT
// donc toujours résoudre un nom pour chacun — sauf incohérence (aucune route ne supprime un
// établissement aujourd'hui). Une chaîne vide plutôt qu'une exception, pour la même raison que
// `UNRESOLVED_ACCOUNT_EMAIL` (establishment.repository.ts) : un diagnostic de super-admin doit
// rester utilisable face à une incohérence, pas s'arrêter dessus.
const UNRESOLVED_ESTABLISHMENT_NAME = ''

// Même refus, même motif qu'au niveau établissement : `AccessLinkDomain.consume` refuse un compte
// désactivé, donc la route rendrait 201 sur un accès qui ne pourra jamais être consommé — et
// l'émission aurait au passage invalidé les liens encore actifs du compte.
const DEACTIVATED_ACCOUNT =
  'This account is deactivated; its access link cannot be reissued'

// Tâche 11 (étape 4a) : adresse inconnue — même refus qu'à la recherche de compte
// (`searchByEmail`), mais depuis un script en ligne de commande plutôt qu'une route HTTP.
const UNKNOWN_EMAIL = 'No account with this email'

// Acteur du journal d'activité pour une écriture faite HORS de toute requête, par un script en
// ligne de commande plutôt qu'une personne connectée (tâche 11, arbitrage de rapport — absent du
// brief, qui ne dit rien de cette ligne). Deux refus délibérés :
//   - PAS d'acteur inventé (un `'system'` ou un `'cli'` qui ne renverrait sur rien) : la relecture
//     du souscripteur (`activity-log.subscriber.ts` — ici contournée, voir plus bas) chercherait
//     un compte, ne le trouverait jamais, et laisserait les deux noms à `null`, ce qui est
//     PRÉCISÉMENT le comportement voulu, pas un accident.
//   - SURTOUT PAS l'identifiant du compte promu : la ligne dirait alors qu'il s'est promu
//     lui-même, ce qui est faux et invérifiable des années plus tard.
// Le marqueur doit être structurellement incapable d'être un identifiant de compte : les cuids
// générés par `@default(cuid())` (schema.prisma) sont entièrement en minuscules alphanumériques,
// jamais de `:`. Un grep futur sur cette valeur retrouve directement ce commentaire.
const CLI_ACTOR = 'cli:bootstrap-super-admin'

class UserDomain implements UserDomainInterface {
  private readonly userRepository: UserRepositoryInterface
  private readonly establishmentRepository: EstablishmentRepositoryInterface
  private readonly accessLinkDomain: AccessLinkDomainInterface
  private readonly activityLogRepository: ActivityLogRepositoryInterface
  private readonly tenantContext: TenantContextInterface
  private readonly postgresOrm: PostgresOrm
  private readonly appEventBus: AppEventBus

  constructor({
    userRepository,
    establishmentRepository,
    accessLinkDomain,
    activityLogRepository,
    tenantContext,
    postgresOrm,
    appEventBus,
  }: IocContainer) {
    this.userRepository = userRepository
    this.establishmentRepository = establishmentRepository
    this.accessLinkDomain = accessLinkDomain
    this.activityLogRepository = activityLogRepository
    this.tenantContext = tenantContext
    this.postgresOrm = postgresOrm
    this.appEventBus = appEventBus
  }

  findByID(userID: string): Promise<UserEntityDomain> {
    return this.userRepository.findByID(userID)
  }

  updateProfile(
    userID: string,
    params: UserProfileUpdateDomain,
  ): Promise<UserEntityRepo> {
    return this.userRepository.updateProfile(userID, params)
  }

  async changePassword(
    userID: string,
    { currentPassword, newPassword }: PasswordChangeDomain,
  ): Promise<void> {
    const user = await this.userRepository.findByID(userID)
    const valid = verifyPassword({
      password: currentPassword,
      salt: user.salt,
      hash: user.password,
    })
    if (!valid) {
      throw Boom.forbidden('Current password is incorrect')
    }
    await this.userRepository.updatePassword(userID, newPassword)
  }

  // Tâche 7 (étape 4a) : recherche d'un compte (spec §3.4). `findByEmail` lève `Boom.notFound`
  // pour une adresse inconnue (findUniqueOrThrow), mais avec le message générique de
  // `errorHandler.boomErrorFromPrismaError` (« User with this ID doesn't exist ») — juste pour
  // une recherche par IDENTIFIANT technique, trompeur ici où l'appelant a cherché par ADRESSE
  // (tour de correction 1, mineur). Recomposé avec un message propre à cette route ; c'est le
  // SEUL endroit du fichier où `findByEmail` peut atteindre un appelant HTTP sans avoir d'abord
  // été absorbé (`AuthDomain.signIn` retombe sur un 401 générique, `EstablishmentDomain.
  // createWithFirstAdmin` sur `null`) — les autres n'ont donc pas ce problème.
  //
  // Les rattachements et le nom de chaque établissement viennent de DEUX lectures séparées
  // (`membershipsForUser`, `findManyByIds`) jointes ici EN MÉMOIRE — jamais un `include`, voir le
  // commentaire au-dessus de `SUPERADMIN_OPERATIONS` (tenant-guard.ts).
  async searchByEmail(email: string): Promise<AccountSearchResult> {
    const user = await this.userRepository
      .findByEmail(email)
      .catch((err: unknown) => {
        if (Boom.isBoom(err) && err.output.statusCode === 404) {
          throw Boom.notFound('No account with this email')
        }
        throw err
      })
    const memberships = await this.establishmentRepository.membershipsForUser(
      user.id,
    )
    const establishmentIds = [
      ...new Set(memberships.map((m) => m.establishmentId)),
    ]
    const establishments =
      await this.establishmentRepository.findManyByIds(establishmentIds)
    const nameById = new Map(establishments.map((e) => [e.id, e.name]))

    return {
      id: user.id,
      email: user.email,
      // Tour de correction 2 (arbitrage de Léo) : le nom est visible, comme partout où le
      // super-admin regarde — voir le commentaire sur `FirstAdmin`
      // (establishment.repository.interface.ts).
      firstName: user.firstName,
      lastName: user.lastName,
      deactivatedAt: user.deactivatedAt,
      lastLoginAt: user.lastLoginAt,
      memberships: memberships.map((m) => ({
        establishmentId: m.establishmentId,
        establishmentName:
          nameById.get(m.establishmentId) ?? UNRESOLVED_ESTABLISHMENT_NAME,
        role: m.role,
        createdAt: m.createdAt,
      })),
    }
  }

  // LA SOUPAPE de la garde du jeton (tâche 10, tour de correction 1, arbitrage n°3) — voir le
  // commentaire sur `UserDomainInterface.reissueAccessLink`, et celui d'
  // `assertIssuableToken` (membership.domain.ts) pour ce qu'elle rend tenable.
  //
  // AUCUNE garde de comptage d'établissements ici, et c'est le but : le super-admin est
  // l'autorité qui traverse légitimement les établissements. Ce qui la borne, ce n'est pas un
  // compteur mais le préfixe `/super-admin` — `requireSuperAdmin` (404 à qui n'a pas le drapeau)
  // et la permission `establishments:manage`.
  //
  // `findByID` lève `Boom.notFound` sur un identifiant inconnu (findUniqueOrThrow via
  // `errorHandler.boomErrorFromPrismaError`) : le compte est donc lu AVANT toute écriture, ce
  // qui vaut aussi pour le refus ci-dessous.
  async reissueAccessLink(
    userID: string,
    issuedBy: string,
  ): Promise<{ token: string }> {
    const user = await this.userRepository.findByID(userID)
    if (user.deactivatedAt !== null) {
      throw Boom.conflict(DEACTIVATED_ACCOUNT)
    }
    const accessLink = await this.accessLinkDomain.issue(user.id, issuedBy)
    // Tache 7 (etape 4b) : la route la plus puissante du systeme n'emettait rien — seule la
    // colonne `AccessLink.createdBy` en gardait trace. `issuedBy` est le super-admin qui agit
    // (`request.currentUser.id`, superAdminUser.ts) : pas `this.tenantContext.current().userId`
    // comme dans `MembershipDomain.emit`, cette route n'a AUCUN contexte de tenant a lire
    // (`/super-admin`, back/CLAUDE.md).
    this.appEventBus.emit('user.accessLinkReissued', { userID: issuedBy, targetUserId: user.id })
    return accessLink
  }

  // Tâche 11 (étape 4a) : voir le commentaire sur `UserDomainInterface.bootstrapSuperAdmin` pour
  // le pourquoi (adresse inconnue refusée, réactivation, idempotence). Encadrée en mode système
  // (`runAsSystem`, ci-dessous) : hors de toute requête, il n'existe aucun tenant à poser, et
  // l'écriture dans `ActivityLog` (modèle d'établissement, pas global) l'exige — même motif que
  // `scheduleActivityLogCleanup` (application/starter.ts), déclarée à côté dans
  // `runAsSystem-unicite.test.ts`. PIÈGE DÉJÀ DOCUMENTÉ SUR `runAsSuperAdmin` (tenant-context.ts),
  // valable à l'identique ici : Prisma est paresseux, chaque appel ci-dessous est donc `await`É
  // À L'INTÉRIEUR du rappel plutôt que rendu tel quel, faute de quoi l'exécution partirait hors
  // de la portée du contexte système.
  //
  // ARCHITECTURE, ÉCART DÉLIBÉRÉ : partout ailleurs (membership.domain.ts), une écriture du
  // journal passe par `appEventBus.emit` puis `ActivityLogSubscriber`, en mode « tire et
  // oublie » (jamais attendu par l'appelant) — tenable dans un serveur HTTP qui reste vivant le
  // temps que la file de microtâches se vide. Un SCRIPT ne l'est pas : il peut se terminer
  // (`process.exit`, ou simplement la fin de `main()`) avant qu'une écriture non attendue n'ait
  // eu le temps d'aboutir, perdant la ligne de journal en silence. `activityLogRepository.create`
  // est donc appelé ICI directement, `await`É, plutôt que par l'intermédiaire du bus d'événements.
  //
  // TOUR DE CORRECTION 1, Important n°1 (revue) : les écritures sur `User` et sur `ActivityLog`
  // partageaient deux appels distincts, sans transaction — si la ligne de journal échouait APRÈS
  // que le drapeau ait été posé, l'appelant recevait un rejet (le compte SEMBLE ne pas avoir été
  // promu), alors que la promotion avait réellement eu lieu ; et l'idempotence (délibérée,
  // ci-dessus) empêchait ensuite tout second appel de rejouer cette branche, pour rejournaliser
  // ou simplement constater l'écart. La trace de « qui a créé ce super-admin, et quand » était
  // alors perdue pour toujours. Toutes les écritures d'un même appel partagent donc désormais UNE
  // seule transaction (précédent : `EstablishmentDomain.createWithFirstAdmin`,
  // `postgresOrm.executeWithTransactionClient`, ouverte ICI aussi depuis l'intérieur d'un mode
  // non-tenant — `runAsSystem` plutôt que `runAsSuperAdmin` — le garde-fou ne distinguant pas une
  // opération transactionnelle d'une opération isolée, seul le contexte ambiant compte). Piège
  // Prisma paresseux, toujours le même : chaque étape est `await`ée À L'INTÉRIEUR du rappel
  // transactionnel.
  async bootstrapSuperAdmin(email: string): Promise<BootstrapSuperAdminResult> {
    return await this.tenantContext.runAsSystem(async () => {
      const user = await this.userRepository
        .findByEmail(email)
        .catch((err: unknown) => {
          if (Boom.isBoom(err) && err.output.statusCode === 404) {
            throw Boom.notFound(UNKNOWN_EMAIL)
          }
          throw err
        })

      const wasSuperAdmin = user.isSuperAdmin
      const wasDeactivated = user.deactivatedAt !== null

      if (wasSuperAdmin && !wasDeactivated) {
        // Idempotence choisie (voir l'interface) : déjà super-admin ET déjà actif, rien à
        // changer — donc aucune transaction à ouvrir, ni écriture, ni ligne de journal.
        return { user, granted: false, reactivated: false }
      }

      const current = await this.postgresOrm.executeWithTransactionClient(
        async (tx) => {
          // Reporte l'état le plus à jour connu, sans lecture supplémentaire : chaque écriture
          // rend déjà l'entité mise à jour, il suffit d'accumuler la dernière plutôt que de relire.
          let latest = user

          if (!wasSuperAdmin) {
            latest = await this.userRepository.grantSuperAdmin(user.id, tx)
            await this.activityLogRepository.create(
              {
                userID: CLI_ACTOR,
                userFirstName: null,
                userLastName: null,
                action: SUPER_ADMIN_GRANTED,
                entityType: 'user',
                entityID: user.id,
              },
              tx,
            )
          }

          if (wasDeactivated) {
            latest = await this.userRepository.setDeactivated(user.id, null, tx)
            await this.activityLogRepository.create(
              {
                userID: CLI_ACTOR,
                userFirstName: null,
                userLastName: null,
                action: SUPER_ADMIN_REACTIVATED,
                entityType: 'user',
                entityID: user.id,
              },
              tx,
            )
          }

          return latest
        },
      )

      return {
        user: current,
        granted: !wasSuperAdmin,
        reactivated: wasDeactivated,
      }
    })
  }
}

export { UserDomain }
