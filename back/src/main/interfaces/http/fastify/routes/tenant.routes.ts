import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'

import {
  EXEMPTED_ADMIN_PATIENT_ROUTES,
  patientIdParamOf,
} from '../../../../utils/access-log-routes'
import {
  assertNoDeadPatientAccessEntry,
  assertPatientReadLogged,
  assertRoutePermission,
  isReadRoute,
} from '../plugins/tenant.plugin'
import { appointmentRouter } from './appointment'
import { arsIndicatorRouter } from './arsIndicator'
import { diagnosticEducatifRouter } from './diagnosticEducatif'
import { diagnosticEducatifTemplateRouter } from './diagnosticEducatifTemplate'
import { enrollmentIssueRouter } from './enrollmentIssue'
import { forbiddenWeekRouter } from './forbiddenWeek'
import { locationReadRouter, locationWriteRouter } from './location'
import { pathwayRouter } from './pathway'
import { pathwayTemplateRouter } from './pathwayTemplate'
import { patientRouter } from './patient'
import { patientAccessLogRouter } from './patientAccessLog'
import { patientServiceFileRouter } from './patientServiceFile'
import { planningCycleRouter } from './planningCycle'
import { serviceMembersRouter } from './serviceMembers'
import { slotRouter } from './slot'
import { slotTemplateRouter } from './slotTemplate'
import { soignantReadRouter, soignantWriteRouter } from './soignant'
import { thematicRouter } from './thematic'
import { todoRouter } from './todo'

// Partagee avec le garde-fou racine ci-dessous et l'enregistrement du greffon (routes/index.ts),
// pour qu'un futur renommage du prefixe ne puisse pas faire diverger les deux en silence. Meme
// forme que `SUPER_ADMIN_PREFIX` (super-admin.routes.ts), et pour la meme raison.
export const TENANT_PREFIX = '/e/:establishmentId/s/:serviceId'

// TROISIEME garde-fou racine, frere d'`assertTenantShapedRoute` et d'`assertSuperAdminShapedRoute`.
//
// Le probleme qu'il ferme : `assertPatientReadLogged` et `recordPatientAccess` sont poses par
// `tenantRoutes`, donc invisibles a une route enregistree AILLEURS. Une route de lecture qui
// designerait un dossier depuis `/e/:establishmentId/admin/...`, depuis `/super-admin/...` ou
// depuis la racine ne serait ni journalisee ni signalee — le journal aurait un trou, et rien ne le
// dirait.
//
// Il refuse SECHEMENT, sans consulter aucune liste JOURNALISEE — et c'est le point : l'inscrire
// dans `LOGGED_PATIENT_ROUTES` afficherait une couverture que le crochet d'ecriture, absent de
// la, ne tiendrait pas. La seule reponse juste POUR UNE ROUTE QUI LIT UN DOSSIER est « remets
// cette route sous le prefixe de tenant ».
//
// CE QUE L'ABSOLU NE COUVRE PAS SANS Y PRENDRE GARDE : une route qui ne lit JAMAIS le dossier —
// une lecture du JOURNAL des consultations, qui filtre une table d'audit par un identifiant de
// patient sans jamais rendre le dossier — pourrait echapper au filet en renommant son parametre
// (`:patientID` -> un nom que `patientIdParamOf` ne reconnait pas). DEMONTRE FAUX PAR EXECUTION :
// une sonde reelle enregistree sous ce nom
// renomme (`GET /e/:establishmentId/admin/patients/:patientRef/sonde`, servie par un vrai
// `findUniqueOrThrow` sur `Patient`) rendait un dossier COMPLET, sans ecrire aucune ligne de
// journal, et rien ne le signalait — le meme code, le meme fichier, seul le nom du parametre
// change separe un dossier complet rendu du refus de demarrage. Un renommage n'est pas une
// exemption : il ne declare rien, et desarme le filet pour TOUTE route future qui choisirait ce
// nom, pas seulement celle qui l'a fait en premier.
//
// La reponse retenue est `EXEMPTED_ADMIN_PATIENT_ROUTES` (utils/access-log-routes.ts) :
// consultee ICI, juste apres le test du prefixe, pour les seules routes de lecture qui NE LISENT
// JAMAIS le dossier — une exemption ne promet aucune couverture par le crochet d'ecriture (elle
// n'en a pas besoin, contrairement a une entree de `EXEMPTED_PATIENT_ROUTES`), elle declare
// qu'aucune n'est due. `patientIdParamOf` continue de reconnaitre CE nom de parametre
// normalement (rien n'est desarme) : seule l'URL EXACTE declaree echappe au refus, une route non
// declaree de la meme forme reste refusee (`assertNoDeadAdminPatientExemption`, plus bas, en garde
// la contrepartie : une entree qui ne correspond plus a aucune route reelle fait echouer le
// demarrage, exactement comme `assertNoDeadPatientAccessEntry` pour l'autre liste).
//
// MEME LIMITE, elle, que ses deux freres, et leurs commentaires la disent deja : Fastify n'offre,
// au moment ou `onRoute` s'execute, aucun moyen public de savoir quelle chaine de crochets une
// route heritera reellement. Une route posee hors de `tenantRoutes` mais avec ce prefixe LITTERAL
// passerait donc ce controle sans pour autant heriter du crochet d'ecriture.
export const assertPatientRouteUnderTenant = (route: {
  method: unknown
  url: string
}): void => {
  if (!isReadRoute(route.method) || patientIdParamOf(route.url) === null) {
    return
  }
  if (route.url.startsWith(`${TENANT_PREFIX}/`)) {
    return
  }
  if (route.url in EXEMPTED_ADMIN_PATIENT_ROUTES) {
    return
  }
  throw new Error(
    `Route de lecture designant un dossier patient hors du greffon de tenant : GET ${route.url}. ` +
      `Le journal des consultations n'est pose que sous ${TENANT_PREFIX} : enregistrer cette ` +
      'route sous ce prefixe, ou la declarer dans EXEMPTED_ADMIN_PATIENT_ROUTES si elle ne lit ' +
      'jamais le dossier lui-meme (voir src/main/utils/access-log-routes.ts), sans quoi elle ne ' +
      'laissera aucune trace.',
  )
}

// L'autre sens de la meme comparaison, symetrique d'`assertNoDeadPatientAccessEntry`
// (tenant.plugin.ts) mais pour `EXEMPTED_ADMIN_PATIENT_ROUTES` : une entree qui ne correspond
// plus a aucune route GET reelle laisserait croire a une exemption qui ne protege plus rien —
// la route aurait disparu ou change d'URL, et l'entree resterait, muette. Posee en `onReady`
// A LA RACINE (routes/index.ts), avec les routes REELLEMENT vues par son propre crochet
// `onRoute` — jamais une liste recopiee — puisque c'est la, et non sous `tenantRoutes`, que vit
// `assertPatientRouteUnderTenant` lui-meme, et que les routes d'administration sont enregistrees
// ailleurs que sous `tenantRoutes`.
export const assertNoDeadAdminPatientExemption = (
  seenRoutes: readonly { method: unknown; url: string }[],
): void => {
  const readable = new Set(
    seenRoutes.filter((route) => isReadRoute(route.method)).map((r) => r.url),
  )
  const dead = Object.keys(EXEMPTED_ADMIN_PATIENT_ROUTES).filter(
    (url) => !readable.has(url),
  )
  if (dead.length > 0) {
    throw new Error(
      `Entrees mortes dans EXEMPTED_ADMIN_PATIENT_ROUTES : ${dead
        .map((url) => `GET ${url}`)
        .join(
          ', ',
        )}. Aucune route GET reelle ne porte cette URL ; retirer l'entree ou corriger ` +
        "l'URL dans src/main/utils/access-log-routes.ts.",
    )
  }
}

// Toute route enregistrée ici vit sous /e/:establishmentId/s/:serviceId et
// doit déclarer `config.permission`. Le hook onRoute fait échouer le
// démarrage sinon (fail-safe).
const tenantRoutes: FastifyPluginAsyncZod = async (fastify) => {
  fastify.addHook('onRoute', assertRoutePermission)
  // Journal des consultations — LA propriete centrale du chantier : toute
  // route GET posee ici dont l'URL designe un dossier patient est journalisee ou explicitement
  // exemptee, sinon le demarrage echoue. Voir assertPatientReadLogged (tenant.plugin.ts) et les
  // deux listes (utils/access-log-routes.ts).
  fastify.addHook('onRoute', assertPatientReadLogged)
  // L'autre sens de la comparaison. Les routes sont collectees TELLES QUE FASTIFY LES ENREGISTRE
  // — pas recopiees — puis confrontees aux deux listes une fois toutes posees, d'ou le `onReady`
  // (un `onRoute` ne peut pas savoir qu'il a vu la derniere route). Le tableau est cree ICI, a
  // chaque enregistrement du greffon, donc une seconde application dans le meme processus
  // (les tests en montent plusieurs) repart d'une collecte vierge.
  const seenTenantRoutes: { method: unknown; url: string }[] = []
  fastify.addHook('onRoute', (route) => {
    seenTenantRoutes.push({ method: route.method, url: route.url })
  })
  fastify.addHook('onReady', () => {
    assertNoDeadPatientAccessEntry(seenTenantRoutes)
    return Promise.resolve()
  })
  fastify.addHook('onRequest', fastify.resolveTenant)
  fastify.addHook('preHandler', fastify.enforcePermission)
  // Retire les champs cliniques du corps de la requête quand l'appelant n'a
  // pas `clinical:write` : il ne doit pas pouvoir écraser ce qu'il ne peut
  // pas lire. Voir tenant.plugin.ts.
  fastify.addHook('preValidation', fastify.stripClinicalInput)
  // Retire les champs cliniques des réponses quand l'appelant n'a pas
  // `clinical:read` (secrétariat, lecture seule). Voir tenant.plugin.ts.
  fastify.addHook('preSerialization', fastify.stripClinicalFields)
  // Ecrit la ligne du journal des consultations, apres que la reponse soit partie. Pose ici, a
  // cote des deux crochets cliniques, et jamais sur les routes individuelles : voir
  // tenant.plugin.ts.
  fastify.addHook('onResponse', fastify.recordPatientAccess)

  await fastify.register(todoRouter, { prefix: '/todo' })
  await fastify.register(appointmentRouter, { prefix: '/appointment' })
  await fastify.register(slotRouter, { prefix: '/slot' })
  await fastify.register(slotTemplateRouter, { prefix: '/slot-template' })
  await fastify.register(pathwayRouter, { prefix: '/pathway' })
  await fastify.register(pathwayTemplateRouter, { prefix: '/pathway-template' })
  await fastify.register(soignantReadRouter, { prefix: '/soignant' })
  await fastify.register(soignantWriteRouter, { prefix: '/soignant' })
  await fastify.register(thematicRouter, { prefix: '/thematic' })
  await fastify.register(locationReadRouter, { prefix: '/location' })
  await fastify.register(locationWriteRouter, { prefix: '/location' })
  await fastify.register(patientRouter, { prefix: '/patient' })
  await fastify.register(patientServiceFileRouter, {
    prefix: '/patient/:patientID/service-file',
  })
  await fastify.register(diagnosticEducatifTemplateRouter, {
    prefix: '/diagnostic-template',
  })
  await fastify.register(diagnosticEducatifRouter, {
    prefix: '/patient/:patientId/diagnostic',
  })
  await fastify.register(enrollmentIssueRouter, {
    prefix: '/patient/:patientID/enrollment-issue',
  })
  await fastify.register(patientAccessLogRouter, {
    prefix: '/patient/:patientID/acces',
  })
  await fastify.register(forbiddenWeekRouter, { prefix: '/forbidden-week' })
  await fastify.register(planningCycleRouter, { prefix: '/planning-cycle' })
  await fastify.register(serviceMembersRouter, { prefix: '/membres' })
  await fastify.register(arsIndicatorRouter, {
    prefix: '/indicateurs-ars',
  })
}

export { tenantRoutes }
