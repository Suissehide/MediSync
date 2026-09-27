import { AsyncLocalStorage } from 'node:async_hooks'

import type {
  ServiceTenant,
  Tenant,
  TenantContextInterface,
  TenantStore,
} from '../types/utils/tenant-context'
import { TenantContextMissingError } from './tenant-errors'

// Porte le tenant de la requête courante. `enter` est appelé par le hook
// onRequest du plugin tenant (même mécanisme que @fastify/request-context) ;
// `run` sert aux tests et aux traitements encadrés ; `runAsSystem` aux
// tâches hors requête (purge planifiée) ; `clear` referme la portée en tête
// de chaque requête.
//
// Le stockage est typé `TenantStore | undefined` : `enterWith` teinte le
// contexte asynchrone jusqu'à la fin de la chaîne, sans refermer sa portée.
// Sur un worker réutilisé, une requête sans tenant hériterait donc du tenant
// de la précédente. `clear()` pose explicitement l'absence de tenant, et le
// hook onRequest global (interfaces/http/fastify/routes/index.ts) l'appelle
// en toute première instruction : chaque requête démarre sans tenant.
class TenantContext implements TenantContextInterface {
  private readonly storage = new AsyncLocalStorage<TenantStore | undefined>()

  // TOUR DE CORRECTION 3 (tâche 1) — la revue a trouvé, par exécution, une porte que ni le nom
  // d'une méthode ni la forme d'un appel ne peuvent surveiller : muter en place l'objet que
  // `peek()`/`getStore()` renvoie (`const s = tenantContext.peek(); (s as any).kind =
  // 'superadmin'`) change le store que TOUT code lira ensuite dans la même portée asynchrone —
  // sans jamais appeler `run` ni `enterWith`. `Object.freeze` sur le store CONSTRUIT ICI, avant
  // qu'il n'entre dans le stockage, ferme cette porte à l'exécution plutôt que de se contenter de
  // la nommer comme irréductible : une mutation ultérieure échoue silencieusement en mode non
  // strict, ou lève un `TypeError` en mode strict (les modules ES le sont — voir
  // `tenant-context.test.ts` pour la preuve par exécution).
  //
  // TOUR DE CORRECTION 4 — ce gel était SUPERFICIEL, et la re-revue a montré par exécution que la
  // porte restait grande ouverte à côté : `Object.freeze` ne gèle que l'enveloppe, donc
  // `peek().tenant.establishmentId = 'e9'` réussissait, survivait à une frontière asynchrone, et
  // repointait TOUT le contexte sur un autre établissement — une lecture filtrée sur
  // l'établissement substitué passait alors le garde-fou. Pire que le trou : ce fichier et
  // `runAsSystem-unicite.test.ts` déclaraient cette porte « fermée ». Le `tenant` imbriqué est
  // donc gelé lui aussi. `Tenant` ne porte que des scalaires (voir types/utils/tenant-context.ts,
  // six colonnes : chaînes, ou `null`), donc ce second gel est TOTAL, pas un niveau de plus dans
  // une récursion inachevée — un test le tient (`tenant-context.test.ts`, « aucune colonne de
  // Tenant n'est un objet »), pour que l'ajout d'une colonne imbriquée fasse rougir plutôt que de
  // rouvrir la porte en silence.
  //
  // Vérifié dans l'autre sens, celui qui casse : aucun appelant ne mute un tenant. Les
  // emplois de `peek()` hors de ce fichier ne font que LIRE ses colonnes
  // (`activityLog.repository.ts`, `tenant-guard.ts`, `tenant.plugin.ts` — le compte figurait ici
  // en toutes lettres et dérivait en silence à chaque nouvel emploi, il a donc été retiré),
  // `resolveTenantFromUser` (`tenant.plugin.ts`) construit un objet
  // NEUF à chaque requête, et `currentService()` plus bas en rend une copie étalée plutôt que de
  // l'amender. Le gel se propage volontairement à `request.tenant`, qui est le MÊME objet que
  // celui posé ici (`tenant.plugin.ts` : `request.tenant = tenant` puis `tenantContext.enter(tenant)`)
  // et que `requireTenant` distribue à tous les handlers : c'était l'autre chemin par lequel la
  // re-revue atteignait le store sans jamais appeler `peek()`.
  enter(tenant: Tenant): void {
    this.storage.enterWith(Object.freeze({ kind: 'tenant', tenant: Object.freeze(tenant) }))
  }

  clear(): void {
    this.storage.enterWith(undefined)
  }

  // Même gel, et pour la même raison, que `enter` ci-dessus : l'enveloppe ET le tenant.
  run<T>(tenant: Tenant, fn: () => Promise<T>): Promise<T> {
    return this.storage.run(Object.freeze({ kind: 'tenant', tenant: Object.freeze(tenant) }), fn)
  }

  peek(): TenantStore | undefined {
    return this.storage.getStore()
  }

  current(): Tenant {
    const store = this.storage.getStore()
    if (!store || store.kind !== 'tenant') {
      throw new TenantContextMissingError('no tenant in the current request')
    }
    return store.tenant
  }

  currentService(): ServiceTenant {
    const tenant = this.current()
    if (tenant.serviceId === null || tenant.serviceRole === null) {
      throw new TenantContextMissingError('no service in the current tenant')
    }
    return { ...tenant, serviceId: tenant.serviceId, serviceRole: tenant.serviceRole }
  }

  scope(): { serviceId: string; establishmentId: string } {
    const { serviceId, establishmentId } = this.currentService()
    return { serviceId, establishmentId }
  }

  establishmentScope(): { establishmentId: string } {
    return { establishmentId: this.current().establishmentId }
  }

  runAsSystem<T>(fn: () => Promise<T>): Promise<T> {
    return this.storage.run(Object.freeze({ kind: 'system' }), fn)
  }

  // Troisieme contexte du garde-fou (tache 1, etape 4a) : substitue au filtre de tenant une
  // liste declaree et exhaustive de couples (modele, operation) permis — voir
  // SUPERADMIN_OPERATIONS, infra/orm/tenant-guard.ts.
  //
  // LE PIEGE REEL, MESURE (etape 4b, tache 6, tour de correction 1 — l'enonce precedent de ce
  // commentaire etait imprecis ; corrige ici, a la source qui fait autorite). Un rappel
  // SYNCHRONE NU — `runAsSuperAdmin(() => prisma.x.count(...))`, sans `async` — perd bien le
  // contexte : rien ne rattache la continuation reelle de la requete Prisma (paresseuse, comme
  // partout ailleurs sur ce chantier) a la portee posee par `this.storage.run` ci-dessous, qui
  // s'acheve des que le rappel revient (synchronement) — le garde-fou lit alors le tenant
  // ambiant. Mesure par execution, par sabotage e2e sur un appelant reel
  // (`PatientAccessLogRepository.findAllPlatformWide`, task-6-report.md) : cette forme fait
  // echouer 5 tests sur 244, tous avec `TenantScopeMissingError` (500).
  //
  // CE QUI TIENT LA PROPRIETE N'EST PAS LE MOT-CLE `await`, C'EST L'ENROBAGE `async` DU RAPPEL.
  // Rejoue sur le meme appelant reel : `runAsSuperAdmin(async () => { return
  // prisma.x.findMany(...) })` — SANS aucun `await` interne — reste CORRECT (244/244 verts). Une
  // fonction `async` qui rend une valeur "thenable" la fait passer par une resolution de
  // promesse que Node associe a la portee `AsyncLocalStorage` active au moment de l'appel,
  // exactement comme le ferait un `await` explicite ; c'est cette resolution implicite qui
  // rattache la continuation, pas la presence litterale du mot-cle `await`. Vaut a l'identique
  // pour `run`/`runAsSystem` ci-dessus : meme primitive (`this.storage.run`), meme mecanisme.
  //
  // CE QUI RESTE VRAI, ET POURQUOI ECRIRE `await` A L'INTERIEUR DEMEURE LA CONVENTION DE CE
  // DEPOT : la regle Biome `suspicious/useAwait` (voir CLAUDE.md, section Code style) REFUSE un
  // rappel `async` sans aucun `await` — verifie, `npm run lint` echoue exactement sur cette
  // forme — et un rappel qui ne suspend jamais se lit mal a cote de ses voisins qui, eux,
  // suspendent reellement. Le rappel doit donc etre `async` (necessaire au contexte), l'`await`
  // interne satisfait le lint et la lisibilite (plus necessaire au contexte lui-meme, contrairement
  // a ce que l'ancien enonce affirmait).
  runAsSuperAdmin<T>(fn: () => Promise<T>): Promise<T> {
    return this.storage.run(Object.freeze({ kind: 'superadmin' }), fn)
  }
}

export { TenantContext }
