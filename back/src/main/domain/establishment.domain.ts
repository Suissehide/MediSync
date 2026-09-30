import Boom from '@hapi/boom'

import type { PostgresOrm } from '../infra/orm/postgres-client'
import type { IocContainer } from '../types/application/ioc'
import type { AccessLinkDomainInterface } from '../types/domain/accessLink.domain.interface'
import type {
  CreateEstablishmentInput,
  CreateEstablishmentResult,
  EstablishmentDomainInterface,
} from '../types/domain/establishment.domain.interface'
import type {
  EstablishmentDetail,
  EstablishmentListRow,
  EstablishmentRepositoryInterface,
  FirstAdmin,
} from '../types/infra/orm/repositories/establishment.repository.interface'
import type { UserRepositoryInterface } from '../types/infra/orm/repositories/user.repository.interface'
import type { TenantContextInterface } from '../types/utils/tenant-context'
import { randomToken } from '../utils/hash'

// Longueur du mot de passe posé sur un compte fraîchement créé : jamais rendu, jamais
// journalisé, jamais transmis — le compte n'est utilisable qu'après consommation du lien de
// première connexion (spec §3.1). Même générateur que le jeton d'accès (utils/hash.ts), à un
// usage différent : ici une valeur jetée, jamais recomposée.
const PLACEHOLDER_PASSWORD_BYTES = 32

// Message volontairement générique —
// il ne dit ni depuis quand le compte est désactivé, ni à combien d'établissements il appartient
// déjà ; juste assez pour qu'un super-admin comprenne pourquoi la création s'arrête là.
const DEACTIVATED_ACCOUNT =
  'This account is deactivated and cannot be attached as an administrator'

class EstablishmentDomain implements EstablishmentDomainInterface {
  private readonly establishmentRepository: EstablishmentRepositoryInterface
  private readonly userRepository: UserRepositoryInterface
  private readonly accessLinkDomain: AccessLinkDomainInterface
  private readonly tenantContext: TenantContextInterface
  private readonly postgresOrm: PostgresOrm

  constructor({
    establishmentRepository,
    userRepository,
    accessLinkDomain,
    tenantContext,
    postgresOrm,
  }: IocContainer) {
    this.establishmentRepository = establishmentRepository
    this.userRepository = userRepository
    this.accessLinkDomain = accessLinkDomain
    this.tenantContext = tenantContext
    this.postgresOrm = postgresOrm
  }

  async createWithFirstAdmin(
    { name, email, firstName, lastName }: CreateEstablishmentInput,
    issuedBy: string,
  ): Promise<CreateEstablishmentResult> {
    // Une lecture d'abord, jamais un upsert — voir le
    // commentaire détaillé sur `CreateEstablishmentResult` (types/domain/establishment.domain.
    // interface.ts) pour ce que cette lecture protège. `findByEmail` lève (compte inconnu)
    // plutôt que de rendre `null` ; absorbé ici, exactement comme
    // `membership.domain.ts#addByEmail` absorbe la même absence pour la même raison. Ce n'est
    // qu'une LECTURE sur un modèle global : aucun contexte de tenant n'est requis (spec §4.1),
    // et elle reste hors de toute transaction — seules les ÉCRITURES ci-dessous doivent être
    // atomiques entre elles.
    //
    // DIVULGATION ASSUMÉE ET BORNÉE (tranché explicitement par Léo, PAS fermée) : créer le
    // compte (branche `existing === null`, ci-dessous) calcule un PBKDF2 à 210 000 itérations
    // (`hashPassword`, utils/hash.ts) sur le mot de passe aléatoire, ce que la branche `existing`
    // ne fait pas — mesuré à 49 ms contre 11 ms, sans recouvrement. Cette différence dit donc,
    // par le seul temps de réponse, si l'adresse soumise a déjà un compte — la même information
    // que le refus ci-dessous ferme autrement (contenu de la réponse, jamais le temps).
    // Volontairement non fermée : cette route est réservée aux super-admins déjà authentifiés
    // (`requireSuperAdmin`), qui disposeront de toute façon d'une recherche de comptes par
    // adresse — un calcul factice ajouté ici compliquerait le code pour masquer un secret que
    // l'appelant légitime peut obtenir par un autre moyen, déjà prévu.
    const existing = await this.userRepository
      .findByEmail(email)
      .catch(() => null)

    // Refusé EN AMONT, avant la moindre écriture — un
    // compte désactivé ne peut ni se connecter, ni consommer le lien qu'on s'apprêterait à
    // émettre (AccessLinkDomain.consume refuse un compte désactivé). Sans ce refus, la route
    // rendait 201 et créait un établissement dont l'unique administrateur ne pouvait jamais y
    // entrer, sans qu'aucun signal ne le dise.
    //
    // SECONDE DIVULGATION ASSUMÉE ET BORNÉE : ce 409 dit « cette adresse a déjà un compte, et
    // il est désactivé » — un oracle plus commode que le canal temporel ci-dessus (aucun coût de
    // calcul, un statut HTTP sans ambiguïté à énumérer). Laissé ouvert pour le même motif que le
    // canal temporel : cette route est déjà réservée à des super-admins authentifiés, qui
    // disposeront d'une recherche de comptes par adresse — cacher ce refus (un 201 qui ne
    // créerait rien, par exemple) coûterait plus cher en confusion opérationnelle qu'il ne
    // fermerait de surface réellement nouvelle.
    if (existing && existing.deactivatedAt !== null) {
      throw Boom.conflict(DEACTIVATED_ACCOUNT)
    }

    // Les TROIS écritures (l'établissement, le
    // compte s'il est neuf, le rattachement) PLUS l'émission du lien sont désormais une seule
    // transaction Postgres, ouverte SOUS le contexte super-admin — un `$transaction` appelé
    // depuis l'intérieur de `runAsSuperAdmin` est accepté par le garde-fou (chaque écriture, une
    // fois entrée dans le callback transactionnel, est vérifiée exactement comme si elle ne
    // l'était pas : le garde-fou ne distingue pas une opération transactionnelle d'une
    // opération isolée, seul le contexte ambiant — ici `superadmin` — compte). Si le
    // rattachement échoue, l'établissement ET le compte fraîchement créé sont annulés : plus
    // aucun établissement, ni compte, orphelin. Si l'ÉMISSION DU LIEN échoue à son tour (un
    // compte administrateur dont le mot de passe est un jeton jeté, mais sans aucun lien pour
    // s'y connecter), la même transaction l'annule aussi — les trois écritures ET l'émission
    // partagent donc un seul sort. `await` À L'INTÉRIEUR du rappel transactionnel, à chaque
    // étape : la paresse de Prisma, toujours la même leçon.
    const { establishment, accessLink } =
      await this.tenantContext.runAsSuperAdmin(async () => {
        return await this.postgresOrm.executeWithTransactionClient(
          async (tx) => {
            const establishment = await this.establishmentRepository.create(
              name,
              tx,
            )

            const admin =
              existing ??
              (await this.userRepository.create(
                {
                  email,
                  password: randomToken(PLACEHOLDER_PASSWORD_BYTES),
                  firstName,
                  lastName,
                },
                tx,
              ))

            await this.establishmentRepository.attachAdmin(
              establishment.id,
              admin.id,
              tx,
            )

            // Émis que le compte soit neuf ou réutilisé : dans les deux cas, c'est ainsi que son
            // titulaire obtient un moyen de se connecter à CE nouvel établissement (spec §6.1 — le
            // même mécanisme sert la réémission d'un accès oublié).
            const accessLink = await this.accessLinkDomain.issue(
              admin.id,
              issuedBy,
              tx,
            )

            return { establishment, accessLink }
          },
        )
      })

    // Ne rend plus rien sur le compte au-delà de ce qui
    // est nécessaire — voir le commentaire sur `CreateEstablishmentResult`.
    return { establishment, accessLink }
  }

  // La liste du super-admin (spec §3.3). Une lecture nue (`findAll`, modèle global)
  // puis, PAR établissement, ses compteurs (`countersFor`, sous contexte superadmin) — voir le
  // commentaire de `EstablishmentCounters` pour ce que chaque compteur expose et pourquoi.
  rename(id: string, name: string) {
    return this.establishmentRepository.rename(id, name)
  }

  async list(): Promise<EstablishmentListRow[]> {
    const establishments = await this.establishmentRepository.findAll()
    return Promise.all(
      establishments.map(async (establishment) => {
        const counters = await this.establishmentRepository.countersFor(
          establishment.id,
        )
        return { ...establishment, ...counters }
      }),
    )
  }

  // Le détail d'UN établissement (spec §6.2) : la ligne de la liste,
  // augmentée de ses services, ses membres et son journal d'activité — pour que cet écran serve
  // réellement le diagnostic (« untel ne voit plus ses patients » se comprend par des
  // rattachements, pas par un compteur seul). `findByIdOrThrow` lève
  // `Boom.notFound` (via `errorHandler.boomErrorFromPrismaError`) si l'id est inconnu — avant
  // toute autre lecture, pour ne pas construire un détail sur un établissement qui n'existe pas.
  //
  // N'appelle PLUS `countersFor`, qui relirait une seconde fois
  // `Service`, `EstablishmentMembership` et `ActivityLog` — les mêmes tables que `servicesFor`,
  // `membersFor` et `activityLogFor` viennent de lire pour construire les trois tableaux
  // ci-dessous. `serviceCount`/`accountCount`/`firstAdmin`/`lastActivityAt` sont donc dérivés de
  // CES tableaux, déjà chargés ; `patientCount` reste une lecture à part
  // (`patientCountFor`) — c'est la seule que rien d'autre ici ne charge (`Patient.findMany`
  // n'est pas déclaré, spec §3.3). Les deux listes utilisées ici (`services`/`members`) portent
  // TOUJOURS les désactivés (arbitrage de Léo — voir le commentaire sur
  // `EstablishmentServiceRow`) ; seuls les compteurs filtrent, en re-dérivant depuis ces mêmes
  // tableaux plutôt qu'en refaisant la requête.
  async getById(id: string): Promise<EstablishmentDetail> {
    const establishment = await this.establishmentRepository.findByIdOrThrow(id)
    const [services, members, activityLog, patientCount] = await Promise.all([
      this.establishmentRepository.servicesFor(establishment.id),
      this.establishmentRepository.membersFor(establishment.id),
      this.establishmentRepository.activityLogFor(establishment.id),
      this.establishmentRepository.patientCountFor(establishment.id),
    ])

    const serviceCount = services.filter(
      (service) => service.deactivatedAt === null,
    ).length
    const accountCount = members.filter(
      (member) => member.deactivatedAt === null,
    ).length
    // `members` est déjà trié par [createdAt asc, userId asc] (membersFor) — même départage,
    // même ordre, que `countersFor` appliquait pour `firstAdmin`.
    const firstAdminMember = members.find(
      (member) => member.role === 'ADMIN' && member.deactivatedAt === null,
    )
    const firstAdmin: FirstAdmin = firstAdminMember
      ? {
          id: firstAdminMember.id,
          email: firstAdminMember.email,
          firstName: firstAdminMember.firstName,
          lastName: firstAdminMember.lastName,
        }
      : null
    // `activityLog` est trié par `createdAt` décroissant (activityLogFor) : son premier élément
    // EST la dernière activité, quelle que soit la borne de page appliquée à la liste — la borne
    // ne coupe que la QUEUE d'une liste déjà triée, jamais la tête.
    const lastActivityAt = activityLog[0]?.createdAt ?? null

    return {
      ...establishment,
      serviceCount,
      accountCount,
      patientCount,
      firstAdmin,
      lastActivityAt,
      services,
      members,
      activityLog,
    }
  }
}

export { EstablishmentDomain }
