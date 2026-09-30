import Boom from '@hapi/boom'

import type { EstablishmentRole } from '../../generated/enums'
import type { PostgresOrm } from '../infra/orm/postgres-client'
import type { IocContainer } from '../types/application/ioc'
import type { AccessLinkDomainInterface } from '../types/domain/accessLink.domain.interface'
import type {
  MembershipAddByEmailDomain,
  MembershipCreateAccountDomain,
  MembershipCreateAccountResult,
  MembershipDomainInterface,
  MembershipRowDomain,
  MembershipUpdateDomain,
  ServiceMemberRowDomain,
} from '../types/domain/membership.domain.interface'
import type {
  MembershipRepositoryInterface,
  ServiceAssignment,
} from '../types/infra/orm/repositories/membership.repository.interface'
import type { SoignantRepositoryInterface } from '../types/infra/orm/repositories/soignant.repository.interface'
import type { UserRepositoryInterface } from '../types/infra/orm/repositories/user.repository.interface'
import type { TenantContextInterface } from '../types/utils/tenant-context'
import type { AppEventBus } from '../utils/app-event-bus'
import { hashPassword, randomToken } from '../utils/hash'

// QUATRE refus, un seul message : adresse inconnue, adresse déjà membre d'ici, compte
// super-admin, compte rattaché à un AUTRE établissement.
//
// CE QUE CE MESSAGE ACHÈTE, ET CE QU'IL N'ACHÈTE PAS. « Sinon un administrateur pourrait
// énumérer les adresses qui ont un compte » est vrai pour `addByEmail` (une adresse inconnue y
// reçoit le MÊME 400, donc les quatre refus y sont réellement indiscernables), FAUX pour
// `createAccount`, où une adresse inconnue reçoit 201 — le seul fait d'y être refusé annonce donc
// « cette adresse a un compte ». Mesuré, pas supposé : voir « constat : le couple de refus des
// deux routes d ajout identifie la nature du compte » (members.test.ts).
//
// Ce que le message partagé achète réellement : le MOTIF du refus reste caché. Un 400 sur
// `createAccount` ne dit pas « super-admin » plutôt que « rattaché ailleurs » — il faut croiser
// avec `POST /members` pour les séparer. Ce que l'appelant apprend de toute façon, et qu'on
// n'essaie plus de nier ici : qu'il y a un compte.
const UNADDABLE_EMAIL = 'This e-mail address cannot be added as a member'

// Message lu tel quel par `front/src/api/members.api.ts`, qui le fait
// correspondre au texte français affiché : le modifier ici sans mettre à jour
// la table du front ferait retomber l'écran sur son message générique.
const SELF_DEMOTION = 'Cannot remove your own administrator role'

// Longueur du mot de passe posé sur un compte fraîchement créé : jamais rendu, jamais
// journalisé, jamais transmis — le compte n'est utilisable qu'après consommation du lien
// (spec §3.1). Même valeur, même raison qu'`establishment.domain.ts`.
const PLACEHOLDER_PASSWORD_BYTES = 32

// Volontairement générique : ne dit ni depuis quand le compte est désactivé, ni à combien
// d'établissements il appartient. Voir `establishment.domain.ts`, même refus, même motif.
const DEACTIVATED_ACCOUNT =
  'This account is deactivated and cannot be added as a member'

// Contrairement à `UNADDABLE_EMAIL`, ceci ne divulgue RIEN de nouveau : l'appelant est
// administrateur de cet établissement, et `GET /members` lui montre déjà cette adresse.
const ALREADY_MEMBER = 'This account is already a member of this establishment'

// `setDeactivated` et la réémission d'un lien refusent l'une comme l'autre un compte
// multi-établissement, pour le MÊME motif (`User` est global) mais avec des conséquences
// différentes : deux messages distincts, pour qu'un test sache lequel s'est déclenché.
const MULTI_ESTABLISHMENT_ACTIVATION =
  'This account belongs to several establishments; its activation cannot be changed from here'
const MULTI_ESTABLISHMENT_LINK =
  'This account belongs to several establishments; its access link cannot be reissued from here'

const DEACTIVATED_LINK =
  'This account is deactivated; its access link cannot be reissued'

const SUPER_ADMIN_ACTIVATION =
  'This account cannot be activated or deactivated from an establishment'

class MembershipDomain implements MembershipDomainInterface {
  private readonly membershipRepository: MembershipRepositoryInterface
  private readonly userRepository: UserRepositoryInterface
  private readonly tenantContext: TenantContextInterface
  private readonly appEventBus: AppEventBus
  private readonly accessLinkDomain: AccessLinkDomainInterface
  private readonly postgresOrm: PostgresOrm
  private readonly soignantRepository: SoignantRepositoryInterface

  constructor({
    membershipRepository,
    soignantRepository,
    userRepository,
    tenantContext,
    appEventBus,
    accessLinkDomain,
    postgresOrm,
  }: IocContainer) {
    this.membershipRepository = membershipRepository
    this.userRepository = userRepository
    this.tenantContext = tenantContext
    this.appEventBus = appEventBus
    this.accessLinkDomain = accessLinkDomain
    this.postgresOrm = postgresOrm
    this.soignantRepository = soignantRepository
  }

  // Sous le contexte de SERVICE (2026-09-29) : les membres du service courant, et le soignant
  // que chacun y incarne. Le coordinateur regle ce rattachement depuis son service, le seul
  // endroit ou les soignants — propres a chaque service — sont lisibles.
  findServiceMembers(): Promise<ServiceMemberRowDomain[]> {
    return this.membershipRepository.findServiceMembers()
  }

  async setServiceSoignant(
    serviceMembershipId: string,
    soignantId: string | null,
  ): Promise<ServiceMemberRowDomain> {
    // Le soignant est lu par un depot borne au service courant : un soignant d'un autre service
    // (ou d'un autre etablissement) rend 404, jamais un rattachement.
    if (soignantId) {
      await this.soignantRepository.findByID(soignantId)
    }
    const updated = await this.membershipRepository.setServiceSoignant(
      serviceMembershipId,
      soignantId,
    )
    if (!updated) {
      throw Boom.notFound('Service member not found')
    }
    this.emit('member.updated', updated.establishmentMembershipId)
    return updated
  }

  findAll(): Promise<MembershipRowDomain[]> {
    return this.membershipRepository.findAll()
  }

  // Les services venus du client sont vérifiés dans l'établissement courant avant toute
  // écriture, par un `count` filtré. Le rattachement à un soignant n'est plus posé ici : les
  // soignants sont propres à chaque service depuis le 2026-09-29, et le coordinateur le règle
  // depuis son service (`ServiceMemberDomain`).
  private async assertReferences(
    services: ServiceAssignment[] | undefined,
  ): Promise<void> {
    for (const service of services ?? []) {
      if (!(await this.membershipRepository.serviceExists(service.serviceId))) {
        throw Boom.notFound(`Service ${service.serviceId} not found`)
      }
    }
  }

  async addByEmail({
    email,
    role,
    services,
  }: MembershipAddByEmailDomain): Promise<MembershipRowDomain> {
    const user = await this.userRepository.findByEmail(email).catch(() => {
      throw Boom.badRequest(UNADDABLE_EMAIL)
    })
    if (await this.membershipRepository.findByUserID(user.id)) {
      throw Boom.badRequest(UNADDABLE_EMAIL)
    }
    // PREMIER MAILLON de la chaîne : rattacher un
    // super-admin à son établissement lui donnait ensuite une appartenance UNIQUE, donc une
    // réémission que l'ancienne garde laissait passer. Cette méthode n'émet aucun jeton — elle
    // n'appelle donc pas `assertIssuableToken` —, mais elle prépare le terrain de celle qui en
    // émet. Même message que les deux refus ci-dessus : indiscernable, un test l'exige.
    // Le rattachement d'une personne qui exerce DÉJÀ ailleurs reste permis, lui : sans jeton,
    // il ne déplace aucun pouvoir (elle garde son propre mot de passe).
    if (user.isSuperAdmin) {
      throw Boom.badRequest(UNADDABLE_EMAIL)
    }
    await this.assertReferences(services)
    const membership = await this.membershipRepository.create({
      userId: user.id,
      role,
      services,
    })
    this.emit('member.added', membership.id)
    return membership
  }

  // Un établissement doit garder au moins un administrateur actif. Un compte
  // déjà désactivé ne compte pas parmi eux (`countAdmins` l'exclut) : refuser
  // de le retirer ou de le rétrograder ne protégerait donc rien, et
  // empêcherait de faire le ménage.
  private async assertNotLastAdmin(
    membership: MembershipRowDomain,
  ): Promise<void> {
    if (membership.role !== 'ADMIN' || membership.user.deactivatedAt !== null) {
      return
    }
    if ((await this.membershipRepository.countAdmins()) <= 1) {
      throw Boom.conflict('Cannot remove the last administrator')
    }
  }

  private isSelf(membership: MembershipRowDomain): boolean {
    return membership.userId === this.currentUserId()
  }

  // Un administrateur ne peut ni se retirer ni se désactiver lui-même.
  private assertNotSelf(membership: MembershipRowDomain): void {
    if (this.isSelf(membership)) {
      throw Boom.conflict('Cannot apply this action to your own account')
    }
  }

  // Un compte ne reduit jamais seul ses propres droits, c'est un collegue qui
  // le fait — par symetrie avec `assertNotSelf` ci-dessus. Retrograder
  // quelqu'un d'autre reste permis.
  private assertNotSelfDemotion(
    membership: MembershipRowDomain,
    role: EstablishmentRole | undefined,
  ): void {
    if (role === 'MEMBER' && this.isSelf(membership)) {
      throw Boom.conflict(SELF_DEMOTION)
    }
  }

  // `User.deactivatedAt` porte sur l'identité globale, partagée par tous les
  // établissements du compte : l'écrire depuis un établissement couperait
  // aussi l'accès aux autres, où l'administrateur n'a aucun droit. Tant que
  // la désactivation n'est pas portée par l'appartenance, on refuse les deux
  // sens (couper comme rétablir) sur un compte multi-établissement.
  //
  // CE QUI A CHANGÉ, ET CE QUI NE CHANGE PAS. Le prédicat était
  // `user.establishmentMemberships.length > 1`, lu sur l'arbre COMPLET des appartenances que
  // `UserRepository.findByID` embarquait. Cette lecture-là repart du modèle global `User` par une
  // relation à-plusieurs : le garde-fou la refuse désormais sous un contexte de tenant (voir
  // `assertNoGlobalToManyBridge`, infra/orm/tenant-guard.ts), et c'est l'APPEL qui est corrigé,
  // pas le garde-fou. La question est posée directement — « rattaché ailleurs ? » — à
  // `MembershipRepository.estRattacheAilleurs`, qui rend un booléen et rien d'autre.
  //
  // Le verdict est le MÊME, et plus fidèle à l'intention écrite ci-dessus : l'appartenance visée
  // est celle de l'établissement courant, donc `length > 1` voulait déjà dire « il y en a une
  // ailleurs » (`@@unique([userId, establishmentId])` interdit deux appartenances au même
  // établissement, donc les deux prédicats coïncident exactement). Ce qui traverse la frontière
  // passe, lui, de l'arbre entier — noms des autres établissements, leurs services — à un bit.
  private async assertRattachementUnique(
    userId: string,
    message: string,
  ): Promise<void> {
    if (await this.membershipRepository.estRattacheAilleurs(userId)) {
      throw Boom.conflict(message)
    }
  }

  // AUTRE CONSÉQUENCE DE LA MÊME CLASSE DE PROBLÈME, vérifiée de bout en bout par
  // `members.test.ts` (« ne desactive pas le compte global d un super-admin »).
  // Ce n'est pas une prise de contrôle mais un DÉNI DE SERVICE : `deactivatedAt` vit sur le
  // `User`, global, et un simple ADMIN d'établissement coupait l'accès du super-admin à TOUTE
  // la plateforme. Ni `assertRattachementUnique` (aucun rattachement ailleurs suffit à la
  // satisfaire) ni `assertNotLastAdmin` (muette dès qu'un second administrateur existe) ne s'y
  // opposaient.
  //
  // Les DEUX sens sont refusés, comme pour le compte multi-établissement juste au-dessus et
  // pour la même raison : ce qui se décide au niveau de la plateforme ne se défait pas depuis
  // un établissement. Message propre plutôt qu'opaque : la cible est un membre déjà visible
  // dans `GET /members`, il n'y a rien à cacher sur son existence — et l'administrateur a
  // besoin de comprendre pourquoi le bouton ne marche pas.
  private assertNotSuperAdmin(user: { isSuperAdmin: boolean }): void {
    if (user.isSuperAdmin) {
      throw Boom.conflict(SUPER_ADMIN_ACTIVATION)
    }
  }

  // LA GARDE DU JETON. Appelée avant CHAQUE
  // `issue()` de ce niveau — une seule méthode, pas une copie par route : c'est
  // `access-link-issue-sites.test.ts` qui exige que chaque site d'émission de `src/main` soit
  // déclaré, et que ce fichier en appelle autant que d'émissions.
  //
  // POURQUOI ELLE PORTE SUR LE JETON ET NON SUR LA ROUTE. Un lien d'accès réinitialise le mot
  // de passe du `User`, qui est GLOBAL : il ne donne pas accès « à cet établissement », il donne
  // accès AU COMPTE, donc à tout ce que ce compte atteint. Poser cette garde sur la seule
  // réémission ne suffit pas : `POST /account` la contournerait entièrement —
  // l'administrateur de A soumettrait l'adresse d'une personne administratrice de B, recevrait un
  // jeton, et administrerait B. Deux refus :
  //
  //   1. UN COMPTE SUPER-ADMIN NE SE DÉPANNE JAMAIS DEPUIS UN ÉTABLISSEMENT.
  //      Rien, ailleurs, ne lisait `isSuperAdmin` : un simple ADMIN prenait le compte
  //      super-admin en un appel, ou en trois via `addByEmail` puis la réémission. Message
  //      OPAQUE (`UNADDABLE_EMAIL`) plutôt qu'un motif propre : un refus qui dirait « cette
  //      adresse est un super-admin » ferait de la route un détecteur de super-admins,
  //      utilisable sur n'importe quelle adresse. CONSÉQUENCE ASSUMÉE : un super-admin qui
  //      exerce aussi en service devra avoir un second compte, ordinaire.
  //   2. AUCUN RATTACHEMENT AILLEURS. Compté par rapport à l'établissement COURANT, pas par un
  //      `length > 1` : à la création, le compte n'est pas encore membre d'ici (zéro ou N
  //      rattachements étrangers) ; à la réémission, il l'est déjà (un rattachement d'ici, plus
  //      les étrangers). Le même prédicat couvre les deux, là où `length > 1` n'aurait été juste
  //      que pour la seconde.
  //
  // LA SOUPAPE, sans laquelle cette garde serait une impasse : une personne réellement en poste
  // dans deux établissements qui perd son mot de passe n'a aucun recours ici (il n'existe ni
  // route de mot de passe oublié, ni changement de mot de passe sans l'ancien). Elle passe par
  // `UserDomain.reissueAccessLink`, sous le préfixe super-admin — l'autorité qui traverse
  // légitimement les établissements. C'est elle qui rend ce refus tenable ; ne pas la retirer
  // sans rouvrir la question.
  private async assertIssuableToken(
    userId: string,
    refusRattachementAilleurs: () => Error,
  ): Promise<void> {
    // `findIdentity` (la ligne `User` seule) et non `findByID` (qui embarque l'arbre
    // des appartenances de TOUS les établissements). Les deux faits dont cette garde a besoin
    // sont désormais lus séparément : `isSuperAdmin` est une colonne du compte, et « rattaché
    // ailleurs » un booléen — voir `assertRattachementUnique` plus haut pour le détail.
    const user = await this.userRepository.findIdentity(userId)
    if (user.isSuperAdmin) {
      throw Boom.badRequest(UNADDABLE_EMAIL)
    }
    if (await this.membershipRepository.estRattacheAilleurs(userId)) {
      throw refusRattachementAilleurs()
    }
  }

  private currentUserId(): string {
    return this.tenantContext.current().userId
  }

  private emit(
    event:
      | 'member.added'
      | 'member.updated'
      | 'member.removed'
      | 'member.deactivated'
      | 'member.reactivated'
      | 'member.accountCreated'
      | 'member.accessLinkReissued',
    membershipId: string,
  ): void {
    this.appEventBus.emit(event, { userID: this.currentUserId(), membershipId })
  }

  async update(
    id: string,
    params: MembershipUpdateDomain,
  ): Promise<MembershipRowDomain> {
    const membership = await this.membershipRepository.findByID(id)
    if (params.role === 'MEMBER') {
      await this.assertNotLastAdmin(membership)
    }
    this.assertNotSelfDemotion(membership, params.role)
    await this.assertReferences(params.services)
    const updated = await this.membershipRepository.update(id, params)
    this.emit('member.updated', id)
    return updated
  }

  async remove(id: string): Promise<void> {
    const membership = await this.membershipRepository.findByID(id)
    this.assertNotSelf(membership)
    await this.assertNotLastAdmin(membership)
    await this.membershipRepository.delete(id)
    this.emit('member.removed', id)
  }

  // LE RAISONNEMENT QU'ON NE REPREND PAS (voir `establishment.domain.ts#createWithFirstAdmin`).
  // Là-bas, créer un compte calcule un PBKDF2 à
  // 210 000 itérations là où réutiliser un compte existant ne le fait pas : le temps de réponse
  // dit donc, à lui seul, si l'adresse a déjà un compte. Cette fuite y a été ASSUMÉE au motif que
  // l'appelant est un super-admin, qui dispose de toute façon d'une recherche de comptes par
  // adresse (`GET /super-admin/users?email=`). CETTE PRÉMISSE EST FAUSSE ICI :
  // l'appelant est un administrateur d'établissement, qui n'a pas la recherche de comptes du
  // super-admin (`GET /super-admin/users?email=`).
  //
  // CE QUE CE HACHAGE NE FERME PAS. Il existe une route de recherche de comptes
  // (`POST /e/:establishmentId/admin/members`), et le couple (400, 400) rendu par les deux
  // routes d'ajout identifie EXACTEMENT un super-admin, en deux appels, sans écrire une seule
  // ligne (« constat : le couple de refus … », members.test.ts). Il existe donc bel et bien un
  // oracle gratuit et sans trace, que ce hachage ne ferme pas.
  //
  // CE QUE CE HACHAGE FERME, LUI, ET QUE RIEN D'AUTRE NE FERME. Deux natures d'adresse rendent
  // le MÊME couple `201 / 400` : une adresse inconnue, et un compte qui existe déjà mais n'est
  // rattaché nulle part. Sur ces deux-là, le statut est identique, la réponse ne porte que des
  // valeurs soumises par l'appelant (voir `createMemberAccountResponseSchema`), et le TEMPS DE
  // RÉPONSE était le dernier discriminant — 49 ms contre 11 ms, sans recouvrement. C'est ce
  // couple-là, et lui seul, que l'égalisation rend indistinguable ; le test de constat le
  // vérifie explicitement (`expect(libre.couple).toEqual(inconnue.couple)`).
  //
  // Autrement dit : la fermeture n'est pas redondante avec la divulgation constatée, elle porte
  // sur une distinction que la divulgation constatée ne permet PAS de faire.
  //
  // Le canal est donc fermé plutôt que documenté : la branche « compte réutilisé » paie
  // EXACTEMENT le même PBKDF2, sur un mot de passe jeté qui n'est écrit nulle part.
  //
  // Ce que ce calcul ferme, et ce qu'il ne ferme pas (mesuré, pas supposé — voir
  // « ne dit pas, par son temps de reponse… », members.test.ts) : il supprime l'écart dominant,
  // celui d'un hachage entier, dont les deux distributions ne se recouvraient pas. Il subsiste
  // la différence d'UN `INSERT` (le compte neuf), de l'ordre de la milliseconde, noyée dans la
  // variance des quatre autres allers-retours que les deux branches partagent. Fermé « au coût
  // d'un hachage près », donc, pas « à zéro près ».
  private equalizeAccountCreationCost(): void {
    // NE PAS SUPPRIMER en croyant à un calcul mort : c'est le coût lui-même qui est l'effet
    // recherché. `hashPassword` est synchrone (`crypto.pbkdf2Sync`), le temps est donc bien
    // brûlé ici, et le résultat volontairement jeté.
    hashPassword(randomToken(PLACEHOLDER_PASSWORD_BYTES))
  }

  async createAccount({
    email,
    firstName,
    lastName,
    role,
    services,
  }: MembershipCreateAccountDomain): Promise<MembershipCreateAccountResult> {
    // Une LECTURE d'abord, jamais un `upsert` : un compte déjà connu ne doit être écrasé ni
    // dans son nom ni dans son mot de passe. `findByEmail` lève
    // plutôt que de rendre `null` ; absorbé ici comme dans `addByEmail` ci-dessus.
    const existing = await this.userRepository
      .findByEmail(email)
      .catch(() => null)

    if (existing) {
      // Dans cet ordre : « déjà membre ici » est le refus que l'administrateur peut lire et
      // corriger, et il ne lui apprend rien (`GET /members` le lui montre déjà).
      if (await this.membershipRepository.findByUserID(existing.id)) {
        throw Boom.conflict(ALREADY_MEMBER)
      }
      // AVANT le refus « désactivé » ci-dessous, à dessein.
      // Un compte désactivé rattaché à un AUTRE établissement reçoit ainsi le refus opaque,
      // jamais le 409 qui dirait son état — le fait le plus sensible l'emporte.
      await this.assertIssuableToken(existing.id, () =>
        Boom.badRequest(UNADDABLE_EMAIL),
      )
      // Refusé EN AMONT, avant la moindre écriture : `AccessLinkDomain.consume` refuse un compte
      // désactivé, donc la route rendrait 201 sur un accès qui ne pourra jamais être consommé.
      //
      // DIVULGATION RÉSIDUELLE, ASSUMÉE ET NOMMÉE : ce 409 dit « cette adresse
      // a un compte, et il est désactivé ». Elle est plus étroite que l'oracle général (elle ne
      // porte que sur les comptes désactivés) et elle ne peut pas être masquée sans mentir à
      // l'appelant — un 201 qui ne créerait rien laisserait un administrateur attendre un accès
      // qui n'arrivera jamais.
      if (existing.deactivatedAt !== null) {
        throw Boom.conflict(DEACTIVATED_ACCOUNT)
      }
    }

    // Les références soumises sont vérifiées dans l'établissement courant AVANT d'ouvrir la
    // transaction : un 404/400 ne doit rien avoir écrit, ni rien avoir gardé ouvert.
    await this.assertReferences(services)

    if (existing) {
      // Hors transaction : brûler ~50 ms de CPU la garderait ouverte pour rien.
      this.equalizeAccountCreationCost()
    }

    // Le compte (s'il est neuf), le rattachement ET l'émission du lien : une seule transaction,
    // un seul sort. Si l'émission échoue, il ne reste ni compte orphelin, ni membre sans moyen
    // de se connecter. `await` À L'INTÉRIEUR de chaque étape : la paresse de Prisma ferait
    // repartir l'exécution hors de la portée, et le garde-fou lirait le tenant ambiant.
    // (Ici le contexte est posé par `enterWith` pour toute la requête, donc il ne serait pas
    // perdu ; on garde la discipline plutôt que de dépendre de ce détail.)
    const { membership, accessLink } =
      await this.postgresOrm.executeWithTransactionClient(async (tx) => {
        const account =
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
        const membership = await this.membershipRepository.create(
          { userId: account.id, role, services },
          tx,
        )
        const accessLink = await this.accessLinkDomain.issue(
          account.id,
          this.currentUserId(),
          tx,
        )
        return { membership, accessLink }
      })

    this.emit('member.accountCreated', membership.id)
    return { member: membership, accessLink }
  }

  // LE POINT LE PLUS DANGEREUX DE CETTE MÉTHODE : un lien d'accès
  // réinitialise le mot de passe du `User`, qui est GLOBAL — pas celui de l'appartenance. Un
  // administrateur de l'établissement A qui réémet un lien pour un compte membre AUSSI de B
  // prendrait, par ce lien, le contrôle de son accès à B, où il n'a aucun droit.
  // `assertRattachementUnique` — la garde que `setDeactivated` porte déjà, pour le motif
  // JUMEAU (`User.deactivatedAt` est global de la même façon) — refuse donc ici aussi, en 409.
  //
  // L'identité visée n'est JAMAIS un `userId` reçu du client : c'est `membership.userId`, lu
  // sur une ligne que `findByID` a chargée par une clé composite `(id, establishmentId)` —
  // un `membershipId` d'un autre établissement rend 404, jamais un lien.
  async reissueAccessLink(id: string): Promise<{ token: string }> {
    const membership = await this.membershipRepository.findByID(id)
    // La MÊME garde que `createAccount`, pas une copie : voir `assertIssuableToken`. Le refus
    // « rattaché ailleurs » garde ici son message propre (409) plutôt que le message opaque :
    // le compte est DÉJÀ membre d'ici, donc visible dans `GET /members` — il n'y a rien à
    // cacher sur son existence, et l'administrateur a besoin de savoir quoi faire.
    await this.assertIssuableToken(membership.userId, () =>
      Boom.conflict(MULTI_ESTABLISHMENT_LINK),
    )
    // Un lien émis pour un compte désactivé ne pourrait jamais être consommé
    // (`AccessLinkDomain.consume` le refuse) : la route rendrait 201 sur un accès inutilisable.
    // Refusé avant l'émission, qui invaliderait au passage les liens encore actifs du compte.
    if (membership.user.deactivatedAt !== null) {
      throw Boom.conflict(DEACTIVATED_LINK)
    }
    const accessLink = await this.accessLinkDomain.issue(
      membership.userId,
      this.currentUserId(),
    )
    this.emit('member.accessLinkReissued', id)
    return accessLink
  }

  async setDeactivated(
    id: string,
    deactivated: boolean,
  ): Promise<MembershipRowDomain> {
    const membership = await this.membershipRepository.findByID(id)
    // La ligne `User` seule pour la garde super-admin, qui porte sur une colonne du compte ; le
    // rattachement ailleurs se demande à part, en un booléen.
    const user = await this.userRepository.findIdentity(membership.userId)
    this.assertNotSuperAdmin(user)
    await this.assertRattachementUnique(
      membership.userId,
      MULTI_ESTABLISHMENT_ACTIVATION,
    )
    if (deactivated) {
      this.assertNotSelf(membership)
      await this.assertNotLastAdmin(membership)
    }
    await this.userRepository.setDeactivated(
      membership.userId,
      deactivated ? new Date() : null,
    )
    this.emit(deactivated ? 'member.deactivated' : 'member.reactivated', id)
    return await this.membershipRepository.findByID(id)
  }
}

export { MembershipDomain }
