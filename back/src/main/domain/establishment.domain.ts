import type { AccessLinkDomainInterface } from '../types/domain/accessLink.domain.interface'
import type {
  CreateEstablishmentInput,
  CreateEstablishmentResult,
  EstablishmentDomainInterface,
} from '../types/domain/establishment.domain.interface'
import type { IocContainer } from '../types/application/ioc'
import type { EstablishmentRepositoryInterface } from '../types/infra/orm/repositories/establishment.repository.interface'
import type { UserRepositoryInterface } from '../types/infra/orm/repositories/user.repository.interface'
import { randomToken } from '../utils/hash'

// Longueur du mot de passe posé sur un compte fraîchement créé : jamais rendu, jamais
// journalisé, jamais transmis — le compte n'est utilisable qu'après consommation du lien de
// première connexion (spec §3.1). Même générateur que le jeton d'accès (utils/hash.ts), à un
// usage différent : ici une valeur jetée, jamais recomposée.
const PLACEHOLDER_PASSWORD_BYTES = 32

class EstablishmentDomain implements EstablishmentDomainInterface {
  private readonly establishmentRepository: EstablishmentRepositoryInterface
  private readonly userRepository: UserRepositoryInterface
  private readonly accessLinkDomain: AccessLinkDomainInterface

  constructor({
    establishmentRepository,
    userRepository,
    accessLinkDomain,
  }: IocContainer) {
    this.establishmentRepository = establishmentRepository
    this.userRepository = userRepository
    this.accessLinkDomain = accessLinkDomain
  }

  async createWithFirstAdmin(
    { name, email, firstName, lastName }: CreateEstablishmentInput,
    issuedBy: string,
  ): Promise<CreateEstablishmentResult> {
    const establishment = await this.establishmentRepository.create(name)

    // Review Focus n°4 (task-6-brief.md) : une lecture d'abord, une création SEULEMENT si
    // l'adresse est inconnue — jamais un upsert, qui écraserait le nom ou le mot de passe d'un
    // compte existant. `findByEmail` lève (compte inconnu) plutôt que de rendre `null` ;
    // absorbé ici, exactement comme `membership.domain.ts#addByEmail` absorbe la même
    // absence pour la même raison.
    const existing = await this.userRepository.findByEmail(email).catch(() => null)
    const admin =
      existing ??
      (await this.userRepository.create({
        email,
        password: randomToken(PLACEHOLDER_PASSWORD_BYTES),
        firstName,
        lastName,
      }))

    await this.establishmentRepository.attachAdmin(establishment.id, admin.id)

    // Émis que le compte soit neuf ou réutilisé : dans les deux cas, c'est ainsi que son
    // titulaire obtient un moyen de se connecter à CE nouvel établissement (spec §6.1 — le
    // même mécanisme sert la réémission d'un accès oublié).
    const accessLink = await this.accessLinkDomain.issue(admin.id, issuedBy)

    return {
      establishment,
      firstAdmin: {
        id: admin.id,
        email: admin.email,
        firstName: admin.firstName,
        lastName: admin.lastName,
      },
      accessLink,
    }
  }
}

export { EstablishmentDomain }
