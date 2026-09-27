import Boom from '@hapi/boom'
import type {
  FastifyInstance,
  FastifyReply,
  FastifyRequest,
  HookHandlerDoneFunction,
  onRequestHookHandler,
  onResponseAsyncHookHandler,
  preHandlerAsyncHookHandler,
  preSerializationAsyncHookHandler,
  preValidationAsyncHookHandler,
} from 'fastify'
import type { FastifyPluginAsync } from 'fastify/types/plugin'
import fastifyPlugin from 'fastify-plugin'

import {
  effectiveMemberships,
  liveGrantsForUser,
} from '../../../../domain/accessGrant.domain'
import type { LiveGrant } from '../../../../types/domain/accessGrant.domain.interface'
import type { UserWithMemberships } from '../../../../types/infra/orm/repositories/user.repository.interface'
import type { Tenant } from '../../../../types/utils/tenant-context'
import {
  EXEMPTED_PATIENT_ROUTES,
  LOGGED_PATIENT_ROUTES,
  patientIdParamOf,
  plannedPatientAccess,
} from '../../../../utils/access-log-routes'
import { withoutClinicalFields } from '../../../../utils/clinical-fields'
import { hasPermission, type Permission } from '../../../../utils/permissions'

declare module 'fastify' {
  export interface FastifyRequest {
    // Optionnel, et c'est important : le tenant n'existe qu'une fois
    // `resolveTenant` passé. Sur le chemin d'échec — établissement ou service
    // qui ne correspond à aucune appartenance — il n'est jamais posé, et les
    // hooks suivants s'exécutent quand même sur la réponse d'erreur. Le
    // déclarer non optionnel faisait passer les déstructurations pour sûres.
    tenant?: Tenant
  }
  export interface FastifyContextConfig {
    permission?: Permission
  }
  export interface FastifyInstance {
    // Style callback (done), pas promesse : voir le commentaire au-dessus de leur définition
    // plus bas — un `enterWith` appelé après un `await` réel, sous forme promesse, perd le
    // contexte asynchrone entre deux requêtes concurrentes (démontré par exécution).
    resolveTenant: onRequestHookHandler
    resolveEstablishmentAdmin: onRequestHookHandler
    enforcePermission: preHandlerAsyncHookHandler
    stripClinicalFields: preSerializationAsyncHookHandler
    stripClinicalInput: preValidationAsyncHookHandler
    // Journal des consultations (etape 4b, tache 3). Pose en `onResponse`, donc APRES que la
    // reponse soit partie : le code de statut est connu (on ne journalise pas un echec), et une
    // ecriture lente n'allonge jamais la lecture du dossier.
    recordPatientAccess: onResponseAsyncHookHandler
  }
}

type TenantParams = { establishmentId: string; serviceId?: string }

// De l'arbre des appartenances EFFECTIVES (réelles + octrois vivants — voir
// `effectiveMemberships`, domain/accessGrant.domain.ts, LA seule fonction qui décide de cet
// arbre, aussi employée par `/me` : voir
// src/test/unit/domain/effectiveMemberships-seul-appelant.test.ts) et des paramètres d'URL vers
// le tenant. 404 dans tous les cas d'échec, y compris un octroi qui vient d'expirer, pour ne pas
// révéler l'existence d'un établissement ou d'un service auquel on n'a plus accès.
//
// `grants` N'A PAS de valeur par défaut, à dessein (tour de correction 1, tâche 3) : un défaut
// à `[]` compilerait sans broncher pour un appelant qui aurait oublié de lire les octrois — la
// divergence exacte que cette tâche existe pour empêcher, silencieuse puisque ce fichier est
// typé et vérifié par `tsc` (voir back/CLAUDE.md). Chaque appelant, y compris un test, doit donc
// dire explicitement « aucun octroi » (`[]`) plutôt que de le recevoir par omission. `now` garde
// un défaut (`new Date()`) : aucun appelant ne peut se tromper en omettant l'heure réelle, ce
// n'est pas la même classe de risque.
export const resolveTenantFromUser = (
  user: UserWithMemberships,
  params: TenantParams,
  options: { requireEstablishmentAdmin: boolean },
  grants: LiveGrant[],
  now: Date = new Date(),
): Tenant => {
  const effectives = effectiveMemberships(user, grants, now)
  const membership = effectives.find(
    (m) => m.establishmentId === params.establishmentId,
  )
  if (!membership) {
    throw Boom.notFound()
  }
  // Le soignant lié n'existe que pour une appartenance RÉELLE (un octroi n'en pose jamais) : lu
  // séparément sur `user.establishmentMemberships`, une simple consultation de donnée déjà
  // chargée — pas une seconde décision sur ce qui est accessible, qui reste entièrement celle
  // d'`effectiveMemberships` ci-dessus.
  const soignantId =
    membership.origine === 'reelle'
      ? (user.establishmentMemberships.find(
          (m) => m.establishmentId === params.establishmentId,
        )?.soignantId ?? null)
      : null
  if (options.requireEstablishmentAdmin) {
    if (membership.role !== 'ADMIN') {
      throw Boom.notFound()
    }
    return {
      userId: user.id,
      establishmentId: membership.establishmentId,
      establishmentRole: membership.role,
      serviceId: null,
      serviceRole: null,
      soignantId,
      // Etape 4b, tache 2 : le journal des consultations (`PatientAccessLogDomain.record`) doit
      // pouvoir distinguer un acces obtenu par octroi temporaire d'un acces reel — sans quoi les
      // deux seraient indiscernables l'un de l'autre dans le journal, precisement ce qu'un
      // journal d'audit existe pour empecher. `membership.origine` le sait deja
      // (`effectiveMemberships` ci-dessus) ; il ne restait qu'a le transmettre plutot que de le
      // laisser disparaitre a la sortie de cette fonction.
      origine: membership.origine,
    }
  }
  const service = membership.services.find((s) => s.id === params.serviceId)
  if (!service) {
    throw Boom.notFound()
  }
  return {
    userId: user.id,
    establishmentId: membership.establishmentId,
    establishmentRole: membership.role,
    serviceId: service.id,
    serviceRole: service.role,
    soignantId,
    origine: membership.origine,
  }
}

const paramsOf = (request: FastifyRequest): TenantParams =>
  request.params as TenantParams

// Fail-safe : une route tenant ou admin sans `config.permission` fait échouer
// le démarrage. Utilisé par les hooks onRoute des plugins de routes.
export const assertRoutePermission = (route: {
  method: unknown
  url: string
  config?: { permission?: Permission }
}): void => {
  if (!route.config?.permission) {
    throw new Error(
      `Route without permission: ${String(route.method)} ${route.url}`,
    )
  }
}

// Second fail-safe, posé à la racine des routes plutôt que dans les deux
// plugins de tenant. `assertRoutePermission` ne voit que les routes déclarées
// *sous* ces plugins, donc sous leurs hooks de résolution, de permission et de
// filtrage clinique. Une route dont l'URL porte un identifiant
// d'établissement mais qui serait enregistrée ailleurs échapperait à tous ces
// hooks sans que rien ne le signale : elle lirait la base sans tenant, et le
// garde-fou Prisma serait la seule barrière restante. Ici, la forme de l'URL
// suffit à exiger la déclaration, où que la route soit posée.
export const assertTenantShapedRoute = (route: {
  method: unknown
  url: string
  config?: { permission?: Permission }
}): void => {
  if (route.url.includes(':establishmentId')) {
    assertRoutePermission(route)
  }
}

// `route.method` vaut une chaine pour `fastify.get(...)` et un tableau pour un
// `fastify.route({ method: ['GET', 'POST'] })`. Les deux formes existent dans Fastify ; ne
// traiter que la premiere aurait laissé un trou silencieux.
const methodsOf = (method: unknown): string[] =>
  Array.isArray(method) ? method.map(String) : [String(method)]

// Troisieme fail-safe de demarrage, frere des deux ci-dessus, et LA propriete centrale de
// l'etape 4b : une route de lecture qui designe un dossier patient est journalisee par defaut,
// ou le serveur refuse de demarrer. Sans lui, la couverture du journal serait une liste tenue a
// la main, qui se desynchronise au premier routeur ajoute — en silence, et dans le sens qui
// perd des traces.
//
// Portee, dite exactement : seules les lectures (GET) sont concernees — les ecritures sont deja
// tracees par `ActivityLog`. Le nom du parametre de patient n'est pas uniforme dans ce depot
// (`:patientID` chez les uns, `:patientId` chez `diagnosticEducatifRouter`) : c'est
// `patientIdParamOf` (utils/access-log-routes.ts) qui le reconnait, pas une comparaison
// litterale, sans quoi les trois routes de diagnostic seraient passees au travers.
//
// Meme limite, assumee, que `assertTenantShapedRoute` ci-dessus : ce crochet est pose par
// `tenantRoutes` (routes/tenant.routes.ts), au meme endroit que le crochet d'ecriture
// `recordPatientAccess` — donc tout ce qu'il examine est aussi ce que le crochet couvre, et
// inversement. Une route de forme « patient » enregistree HORS de `tenantRoutes` echapperait aux
// deux, et rien ici ne la rattraperait.
export const assertPatientReadLogged = (route: {
  method: unknown
  url: string
}): void => {
  if (!methodsOf(route.method).includes('GET')) {
    return
  }
  if (patientIdParamOf(route.url) === null) {
    return
  }
  if (
    route.url in LOGGED_PATIENT_ROUTES ||
    route.url in EXEMPTED_PATIENT_ROUTES
  ) {
    return
  }
  throw new Error(
    `Route de lecture patient hors du journal des consultations : GET ${route.url}. ` +
      'Inscrire cette route dans LOGGED_PATIENT_ROUTES (avec son action) ou dans ' +
      'EXEMPTED_PATIENT_ROUTES (avec sa raison), src/main/utils/access-log-routes.ts.',
  )
}

// L'autre sens de la meme comparaison, et il compte autant : une entree qui ne correspond plus a
// aucune route reelle (route renommee, routeur retire) laisserait croire a une couverture qui
// n'existe plus. Posee en `onReady` par `tenantRoutes`, une fois toutes les routes enregistrees,
// avec les routes REELLEMENT vues par son crochet `onRoute` — jamais une liste recopiee.
export const assertNoDeadPatientAccessEntry = (
  seenRoutes: readonly { method: unknown; url: string }[],
): void => {
  const readable = new Set(
    seenRoutes
      .filter((route) => methodsOf(route.method).includes('GET'))
      .map((route) => route.url),
  )
  const dead = [
    ...Object.keys(LOGGED_PATIENT_ROUTES).map((url) => ({
      url,
      list: 'LOGGED_PATIENT_ROUTES',
    })),
    ...Object.keys(EXEMPTED_PATIENT_ROUTES).map((url) => ({
      url,
      list: 'EXEMPTED_PATIENT_ROUTES',
    })),
  ].filter((entry) => !readable.has(entry.url))
  if (dead.length > 0) {
    throw new Error(
      `Entrees mortes dans le journal des consultations : ${dead
        .map((entry) => `${entry.list} -> GET ${entry.url}`)
        .join(', ')}. Aucune route GET reelle ne porte cette URL ; retirer l'entree ou corriger ` +
        "l'URL dans src/main/utils/access-log-routes.ts.",
    )
  }
}

// À utiliser dans un handler qui a besoin du tenant. `enforcePermission` l'a
// déjà exigé en `preHandler`, donc il est présent — mais le type ne le sait
// pas, et le faire croire par une assertion rendrait muette la prochaine route
// qui oublierait le hook. Ici l'absence coûte un 404, comme partout ailleurs.
export const requireTenant = (request: FastifyRequest): Tenant => {
  if (!request.tenant) {
    throw Boom.notFound()
  }
  return request.tenant
}

const tenantPlugin: FastifyPluginAsync = fastifyPlugin(
  (fastify: FastifyInstance) => {
    const { tenantContext, accessGrantRepository, patientAccessLogDomain } =
      fastify.iocContainer

    // Depuis la tâche 3 (étape 4a), résoudre le tenant lit aussi les octrois vivants de
    // l'utilisateur (`liveGrantsForUser` — depuis le tour de correction 1 de la tâche 8, un
    // relais qui appelle TOUJOURS `AccessGrantRepository.findForUser` ; c'est cette dernière qui
    // décide, en interne, si la lecture va plus loin qu'une seule colonne — voir
    // accessGrant.domain.ts) AVANT d'appeler `tenantContext.enter` — alors qu'avant, `enter` était
    // le tout premier geste, synchrone, du hook. Ce délai réel change la forme qu'exige
    // `tenantContext.enter` (qui repose sur `AsyncLocalStorage.enterWith`).
    //
    // CE N'EST PAS UN DÉFAUT DE CONCURRENCE — corrigé dans la description après une revue qui l'a
    // démontré par exécution (tour de correction 1, tâche 3) : posé en mode PROMESSE (fonction
    // `async` à un seul argument, comme le reste de ce fichier), le contexte posé par
    // `enterWith` ne survivait pas jusqu'au handler pour une requête SEULE et SÉQUENTIELLE — pas
    // seulement sous deux requêtes concurrentes. La suite e2e entière le démontrait (79 des 113
    // tests rougissaient, un échec déterministe, pas une course rare frôlée de peu). Sa seule
    // bonne nouvelle : c'était une perte TOTALE du contexte pour la requête qui le posait, jamais
    // une contamination croisée vers une autre — huit tenants résolus ensemble donnaient huit
    // résultats corrects une fois le remède posé, et les deux façons naïves d'écrire encore le
    // crochet échouaient elles aussi fermé (404/500), jamais en silence.
    //
    // Remède, vérifié par exécution (`tenant-plugin-concurrency.test.ts` et par la suite e2e
    // entière) : repasser en mode CALLBACK (troisième paramètre `done`, type
    // `onRequestHookHandler` plutôt qu'`onRequestAsyncHookHandler`) et n'appeler `done()`
    // qu'APRÈS `enter()`, à l'intérieur du `.then()` de la promesse asynchrone — Fastify enchaîne
    // alors la phase suivante à même cette continuation, et le contexte survit.
    const resolve = (options: {
      requireEstablishmentAdmin: boolean
    }): onRequestHookHandler =>
      function (
        this: FastifyInstance,
        request: FastifyRequest,
        _reply: FastifyReply,
        done: HookHandlerDoneFunction,
      ) {
        liveGrantsForUser(request.currentUser.id, accessGrantRepository)
          .then((grants) => {
            // Horloge prise ICI, à l'instant de la résolution — jamais mise en cache d'une
            // requête à l'autre : c'est ce qui fait qu'un octroi qui vient d'expirer est refusé
            // dès la requête suivante, sans attendre une reconnexion (Review Focus n°2).
            const tenant = resolveTenantFromUser(
              request.currentUser,
              paramsOf(request),
              options,
              grants,
              new Date(),
            )
            request.tenant = tenant
            tenantContext.enter(tenant)
            done()
          })
          .catch(done)
      }

    fastify.decorate(
      'resolveTenant',
      resolve({ requireEstablishmentAdmin: false }),
    )
    fastify.decorate(
      'resolveEstablishmentAdmin',
      resolve({ requireEstablishmentAdmin: true }),
    )

    // Lit la permission déclarée dans `config` de la route ; le fail-safe
    // onRoute des plugins de routes garantit qu'elle existe.
    fastify.decorate(
      'enforcePermission',
      function (this: FastifyInstance, request: FastifyRequest) {
        const permission = request.routeOptions.config.permission
        if (!permission) {
          throw Boom.internal('Route without permission')
        }
        // Sans tenant, on ne peut rien autoriser : même 404 que
        // `resolveTenantFromUser`, pour ne pas distinguer « service inconnu »
        // de « service auquel vous n'appartenez pas ».
        if (!request.tenant) {
          throw Boom.notFound()
        }
        const { serviceRole, establishmentRole } = request.tenant
        if (!hasPermission({ serviceRole, establishmentRole }, permission)) {
          throw Boom.forbidden('Insufficient permission')
        }
        return Promise.resolve()
      },
    )
    // Filtre de sortie des champs cliniques. Posé en hook plutôt que recopié
    // dans chaque handler : une route nouvelle qui renverrait un patient — ou
    // qui en embarquerait un via un rendez-vous, un créneau ou un parcours —
    // est filtrée sans que son auteur ait à y penser. C'est le même parti pris
    // de refus par défaut que le garde `onRoute` des permissions.
    fastify.decorate(
      'stripClinicalFields',
      function (
        this: FastifyInstance,
        request: FastifyRequest,
        _reply: unknown,
        payload: unknown,
      ) {
        // Ce hook s'exécute aussi sur la charge d'une réponse d'erreur, donc
        // sur le chemin où le tenant n'a jamais été résolu. Sans tenant, on
        // filtre : refus par défaut, et surtout pas une exception, qui
        // remplacerait le corps du 404 par un message interne.
        if (!request.tenant) {
          return Promise.resolve(withoutClinicalFields(payload))
        }
        const { serviceRole, establishmentRole } = request.tenant
        if (
          hasPermission({ serviceRole, establishmentRole }, 'clinical:read')
        ) {
          return Promise.resolve(payload)
        }
        return Promise.resolve(withoutClinicalFields(payload))
      },
    )
    // Pendant du filtre de sortie, sur l'entrée. Sans lui, un rôle qui ne peut
    // pas *lire* le contenu clinique peut quand même l'*écraser* : le
    // secrétariat a `patient:write` et enverrait `notes` à vide sans jamais
    // pouvoir relire ce qu'il détruit. Posé en `preValidation` : le champ est
    // retiré avant même la validation, donc ni le schéma ni le handler ne le
    // voient. Retirer la clé — plutôt que la mettre à vide — laisse la colonne
    // inchangée en base.
    fastify.decorate(
      'stripClinicalInput',
      function (this: FastifyInstance, request: FastifyRequest) {
        // Même parti pris que le filtre de sortie : sans tenant, on retire.
        if (!request.tenant) {
          request.body = withoutClinicalFields(request.body)
          return Promise.resolve()
        }
        const { serviceRole, establishmentRole } = request.tenant
        if (
          !hasPermission({ serviceRole, establishmentRole }, 'clinical:write')
        ) {
          request.body = withoutClinicalFields(request.body)
        }
        return Promise.resolve()
      },
    )
    // Journal des consultations (etape 4b, tache 3). Pose en crochet plutot que recopie dans
    // chaque handler, pour la meme raison que les deux filtres cliniques ci-dessus : une route de
    // lecture nouvelle est couverte sans que son auteur ait a y penser — et, ici, le garde-fou de
    // demarrage `assertPatientReadLogged` le lui rappelle de toute facon.
    //
    // LE CONTEXTE DE TENANT, QUI EST TOUTE LA DIFFICULTE DE CE CROCHET. `record`
    // (domain/patientAccessLog.domain.ts) lit `tenantContext.current().origine`, et le depot y
    // lit `scope()` : sans contexte, aucune ligne ne s'ecrit ; avec le MAUVAIS contexte, une
    // ligne FAUSSE s'ecrirait, attribuee au mauvais etablissement — de loin le pire des deux.
    //
    // Un crochet `onResponse` s'execute apres la fin de la reponse, donc rien ne garantit a
    // priori qu'il herite encore de la portee `AsyncLocalStorage` teintee par `resolveTenant`.
    // MESURE plutot que supposee (sonde jetable, voir le rapport de tache) : le contexte survit,
    // par `app.inject` COMME par une vraie connexion TCP. Mais une mesure n'est pas une
    // garantie, et ce crochet ne peut pas non plus reposer le store lui-meme : poser un store
    // hors de `utils/tenant-context.ts` est precisement ce que le volet B de
    // `runAsSystem-unicite.test.ts` interdit, a dessein.
    //
    // D'ou la VERIFICATION, qui ne coute rien et ne suppose rien : `peek()` doit rendre LE MEME
    // OBJET que `request.tenant` — pas un tenant qui lui ressemble, le meme, par identite.
    // `resolveTenant` (plus haut) pose les deux a partir d'une seule valeur gelee, donc cette
    // egalite ne peut etre vraie que pour la portee de CETTE requete. Si elle est fausse, rien
    // n'est ecrit et l'incident est journalise : perdre une ligne se voit, une ligne attribuee
    // au mauvais etablissement ne se voit pas.
    fastify.decorate(
      'recordPatientAccess',
      (request: FastifyRequest, reply: FastifyReply) => {
        // 1. Une reponse en erreur n'est pas une consultation : un 404 sur un identifiant
        //    inconnu, un 403, un 500 ne doivent laisser aucune ligne.
        if (reply.statusCode >= 400) {
          return Promise.resolve()
        }
        // 2. Seules les routes declarees journalisees le sont. `routeOptions.url` est l'URL
        //    DECLAREE (avec ses `:parametres`), la meme chaine exactement que celle que
        //    `assertPatientReadLogged` a vue au demarrage — les deux ne peuvent pas diverger.
        const prevu = plannedPatientAccess(
          request.routeOptions.url,
          request.params as Record<string, string | undefined>,
        )
        if (prevu === null) {
          return Promise.resolve()
        }
        const { action, patientId } = prevu
        // 3. UNE SEULE comparaison, qui couvre DEUX choses — et c'est voulu, plutot qu'une garde
        //    `if (!request.tenant)` en plus, qu'aucun test n'aurait pu faire rougir seule
        //    (mesure : celle-ci la subsume entierement). Elle refuse a la fois le tenant absent
        //    — `request.tenant` est optionnel par construction, voir la declaration en tete de
        //    ce fichier, et `store.tenant` n'est jamais `undefined` — et le contexte d'une AUTRE
        //    portee, qui ferait ecrire une ligne au nom du mauvais etablissement. On sort sans
        //    lever, comme les deux filtres cliniques, mais PAS en silence.
        const store = tenantContext.peek()
        if (store?.kind !== 'tenant' || store.tenant !== request.tenant) {
          fastify.log.error(
            `PatientAccessLog: contexte de tenant absent ou etranger a la requete, ${action} non journalise`,
          )
          return Promise.resolve()
        }
        return patientAccessLogDomain
          .record({
            patientId,
            // `store.tenant.userId` plutot que `request.user.userID` : c'est la meme valeur,
            // mais celle-ci vient du contexte dont l'identite vient d'etre verifiee.
            userID: store.tenant.userId,
            userFirstName: request.currentUser?.firstName ?? null,
            userLastName: request.currentUser?.lastName ?? null,
            action,
          })
          .catch((err: unknown) => {
            // UNE ECRITURE DE JOURNAL QUI ECHOUE NE DOIT PAS EMPECHER DE SOIGNER : la reponse est
            // deja partie, et refuser l'acces a un dossier parce que le journal est indisponible
            // transformerait un incident de base de donnees en impossibilite de soin. Mais elle
            // ne doit pas non plus disparaitre en silence — c'est la lecon de l'etape precedente,
            // ou un `.catch` a vide la colonne « auteur » de toutes les lignes neuves sans que
            // rien ne le signale (voir services/activity-log.subscriber.ts).
            //
            // Jamais `${err}` ni `err.message` : une erreur Prisma non attrapee recopie
            // integralement le `data` de l'ecriture ratee — donc l'identifiant du patient et le
            // nom de l'agent. Seule la CLASSE de l'erreur, qui ne peut porter aucune valeur
            // soumise, va au journal technique.
            const errorClass =
              err instanceof Error ? err.constructor.name : typeof err
            fastify.log.error(
              `PatientAccessLog: echec de journalisation de ${action} [${errorClass}]`,
            )
          })
      },
    )
    return Promise.resolve()
  },
)

export { tenantPlugin }
