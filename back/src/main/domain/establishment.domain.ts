import Boom from '@hapi/boom'

import type { AccessLinkDomainInterface } from '../types/domain/accessLink.domain.interface'
import type {
  CreateEstablishmentInput,
  CreateEstablishmentResult,
  EstablishmentDomainInterface,
} from '../types/domain/establishment.domain.interface'
import type { EstablishmentListRow } from '../types/infra/orm/repositories/establishment.repository.interface'
import type { IocContainer } from '../types/application/ioc'
import type { PostgresOrm } from '../infra/orm/postgres-client'
import type { EstablishmentRepositoryInterface } from '../types/infra/orm/repositories/establishment.repository.interface'
import type { UserRepositoryInterface } from '../types/infra/orm/repositories/user.repository.interface'
import type { TenantContextInterface } from '../types/utils/tenant-context'
import { randomToken } from '../utils/hash'

// Longueur du mot de passe posé sur un compte fraîchement créé : jamais rendu, jamais
// journalisé, jamais transmis — le compte n'est utilisable qu'après consommation du lien de
// première connexion (spec §3.1). Même générateur que le jeton d'accès (utils/hash.ts), à un
// usage différent : ici une valeur jetée, jamais recomposée.
const PLACEHOLDER_PASSWORD_BYTES = 32

// Tour de correction 1 (relecture externe), Important n°4 : message volontairement générique —
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
    // Review Focus n°4 (task-6-brief.md) : une lecture d'abord, jamais un upsert — voir le
    // commentaire détaillé sur `CreateEstablishmentResult` (types/domain/establishment.domain.
    // interface.ts) pour ce que cette lecture protège. `findByEmail` lève (compte inconnu)
    // plutôt que de rendre `null` ; absorbé ici, exactement comme
    // `membership.domain.ts#addByEmail` absorbe la même absence pour la même raison. Ce n'est
    // qu'une LECTURE sur un modèle global : aucun contexte de tenant n'est requis (spec §4.1),
    // et elle reste hors de toute transaction — seules les ÉCRITURES ci-dessous doivent être
    // atomiques entre elles.
    //
    // DIVULGATION ASSUMÉE ET BORNÉE (tour de correction 1, relecture externe — tranché
    // explicitement par Léo, PAS fermée) : créer le compte (branche `existing === null`,
    // ci-dessous) calcule un PBKDF2 à 210 000 itérations (`hashPassword`, utils/hash.ts) sur le
    // mot de passe aléatoire, ce que la branche `existing` ne fait pas — mesuré à 49 ms contre
    // 11 ms, sans recouvrement. Cette différence dit donc, par le seul temps de réponse, si
    // l'adresse soumise a déjà un compte — la même information que Review Focus n°4 ferme
    // autrement (contenu de la réponse, jamais le temps). Volontairement non fermée : cette
    // route est réservée aux super-admins déjà authentifiés (`requireSuperAdmin`), qui
    // disposeront de toute façon d'une recherche de comptes par adresse (tâche 7) — un calcul
    // factice ajouté ici compliquerait le code pour masquer un secret que l'appelant légitime
    // peut obtenir par un autre moyen, déjà prévu.
    const existing = await this.userRepository.findByEmail(email).catch(() => null)

    // Tour de correction 1, Important n°4 : refusé EN AMONT, avant la moindre écriture — un
    // compte désactivé ne peut ni se connecter, ni consommer le lien qu'on s'apprêterait à
    // émettre (AccessLinkDomain.consume refuse un compte désactivé). Sans ce refus, la route
    // rendait 201 et créait un établissement dont l'unique administrateur ne pouvait jamais y
    // entrer, sans qu'aucun signal ne le dise.
    //
    // SECONDE DIVULGATION ASSUMÉE ET BORNÉE (tour de correction 2, mineur signalé par le
    // coordinateur) : ce 409 dit « cette adresse a déjà un compte, et il est désactivé » — un
    // oracle plus commode que le canal temporel ci-dessus (aucun coût de calcul, un statut HTTP
    // sans ambiguïté à énumérer). Laissé ouvert pour le même motif que le canal temporel : cette
    // route est déjà réservée à des super-admins authentifiés, qui disposeront d'une recherche
    // de comptes par adresse (tâche 7) — cacher ce refus (un 201 qui ne créerait rien, par
    // exemple) coûterait plus cher en confusion opérationnelle qu'il ne fermerait de surface
    // réellement nouvelle.
    if (existing && existing.deactivatedAt !== null) {
      throw Boom.conflict(DEACTIVATED_ACCOUNT)
    }

    // Tour de correction 1, Importants n°2 et n°3 : les TROIS écritures (l'établissement, le
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
    const { establishment, accessLink } = await this.tenantContext.runAsSuperAdmin(async () => {
      return await this.postgresOrm.executeWithTransactionClient(async (tx) => {
        const establishment = await this.establishmentRepository.create(name, tx)

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

        await this.establishmentRepository.attachAdmin(establishment.id, admin.id, tx)

        // Émis que le compte soit neuf ou réutilisé : dans les deux cas, c'est ainsi que son
        // titulaire obtient un moyen de se connecter à CE nouvel établissement (spec §6.1 — le
        // même mécanisme sert la réémission d'un accès oublié).
        const accessLink = await this.accessLinkDomain.issue(admin.id, issuedBy, tx)

        return { establishment, accessLink }
      })
    })

    // Tour de correction 1, Important n°1 : ne rend plus rien sur le compte au-delà de ce qui
    // est nécessaire — voir le commentaire sur `CreateEstablishmentResult`.
    return { establishment, accessLink }
  }

  // Tâche 7 : la liste du super-admin (spec §3.3). Une lecture nue (`findAll`, modèle global)
  // puis, PAR établissement, ses compteurs (`countersFor`, sous contexte superadmin) — voir le
  // commentaire de `EstablishmentCounters` pour ce que chaque compteur expose et pourquoi.
  async list(): Promise<EstablishmentListRow[]> {
    const establishments = await this.establishmentRepository.findAll()
    return Promise.all(
      establishments.map(async (establishment) => {
        const counters = await this.establishmentRepository.countersFor(establishment.id)
        return { ...establishment, ...counters }
      }),
    )
  }

  // Le détail d'UN établissement : la même ligne que dans la liste (spec §3.3). `findByIdOrThrow`
  // lève `Boom.notFound` (via `errorHandler.boomErrorFromPrismaError`) si l'id est inconnu.
  async getById(id: string): Promise<EstablishmentListRow> {
    const establishment = await this.establishmentRepository.findByIdOrThrow(id)
    const counters = await this.establishmentRepository.countersFor(establishment.id)
    return { ...establishment, ...counters }
  }
}

export { EstablishmentDomain }
