import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

import ts from 'typescript'

// `runAsSystem` (utils/tenant-context.ts) retire l'exigence du garde-fou d'ORM plutot que de la
// deplacer : sous ce mode, une requete peut lire N'IMPORTE QUEL etablissement et service, le
// garde-fou ne verifiant plus rien (voir infra/orm/tenant-guard.ts, `assertTenantScope`,
// `if (store.kind === 'system') { return }`). C'est une exception assumee au cloisonnement
// multi-tenant.
//
// TOUR DE CORRECTION 2 (relecture, tache 9) — CE FICHIER-CI NE GARDE QU'UNE SEULE DES DEUX
// PROPRIETES QUI RENDENT L'EXCEPTION SURE, ET IL FAUT LE DIRE PRECISEMENT : le tour precedent
// affirmait que « chaque emploi soit declare » ET que « sa requete porte ses propres bornes »
// etaient TOUS DEUX garantis ICI — FAUX, demontre par execution : poser un `where: {}` vide sur
// LES DEUX lectures de `patientServiceFile.repository.ts` (estSuiviAilleurs ET
// impactDesactivation) laisse CE FICHIER 3 tests sur 3 VERTS, puisqu'il ne lit jamais le contenu
// d'une requete — seulement OU (quel fichier, quelle methode nommee) la CAPACITE d'entrer dans
// un mode non-tenant est invoquee. Ce qui rougirait sur un `where` vide, c'est un AUTRE fichier :
// `back/src/test/unit/infra/repository-scope.test.ts` (describes `PatientServiceFileRepository.
// estSuiviAilleurs` et `.impactDesactivation`), qui capture les arguments REELS envoyes a Prisma
// et prouve, pour CHAQUE emploi, que sa forme precise serait refusee par le garde-fou hors du
// mode encadre. Les DEUX proprietes restent necessaires, aucune des deux ne remplace l'autre —
// mais DEUX tests distincts les gardent, pas un seul.
//
// Il n'y a pas de plafond a priori sur le NOMBRE d'emplois : ce que CE fichier garde, c'est que
// chacun soit DECLARE (enumere ci-dessous, avec sa raison, dans un fichier PRECIS). Une version
// anterieure de ce commentaire disait « deux fois seulement » avant que la tache 9 n'ajoute un
// troisieme emploi legitime dans le meme fichier que le second — la prose mentait alors que les
// assertions, elles, restaient justes ; corrige une premiere fois en pretendant a tort que la
// CAPACITE et les BORNES etaient toutes deux couvertes ici, corrige a nouveau ci-dessus. Six
// emplois declares a ce jour, tous dans le back de production (un quatrieme ajoute a la tache 11,
// etape 4a, un cinquieme a la tache 15, un sixieme a la tache 5 de l'etape 4b) — un SEPTIEME
// APPEL rejoint desormais le premier emploi ci-dessous (meme fichier, tache 8, etape 4b : la
// purge planifiee du journal des consultations, a cote de celle du journal d'activite) : le
// compte d'emplois DECLARES (des fichiers/raisons distincts) reste a six, mais le nombre
// D'APPELS total passe de sept a huit, `application/starter.ts` en portant desormais deux :
//
//   1. La purge planifiee des DEUX journaux (`application/starter.ts`,
//      `scheduleActivityLogCleanup` ET, depuis la tache 8, `schedulePatientAccessLogCleanup`) :
//      hors de toute requete HTTP, il n'existe alors aucun tenant a poser, et chaque purge doit
//      toucher TOUTE sa table, pas un seul etablissement. Retention parametrable
//      (`config.logRetentionMonths`) pour les deux, calculee independamment dans chaque domaine
//      (`ActivityLogDomain.cleanup`, `PatientAccessLogDomain.cleanup`) plutot que factorisee.
//   2. Le signal de suivi ailleurs (`infra/orm/repositories/patientServiceFile.repository.ts`,
//      `estSuiviAilleurs`, design §5.3) : une lecture qui traverse volontairement la frontiere
//      entre services, pour rendre un booleen et rien d'autre. Ses bornes (etablissement et
//      service courants, captures AVANT d'entrer dans le mode encadre) sont verifiees par
//      `repository-scope.test.ts`, pas par ce fichier-ci.
//   3. L'impact d'une desactivation de service (meme fichier, `impactDesactivation`, design
//      §3.6, tache 9) : appelee depuis l'administration d'etablissement (aucun service courant
//      a ce niveau), elle traverse la meme frontiere pour rendre DEUX NOMBRES agreges — jamais
//      un identifiant, un nom ou un contenu. Ses bornes (etablissement ET service dont on evalue
//      la desactivation, recus EXPLICITEMENT de l'appelant) sont, de meme, verifiees par
//      `repository-scope.test.ts`. CE N'EST PAS LE MEME CALCUL que le signal de suivi ailleurs
//      (question differente : « ce patient va-t-il devenir invisible » contre « un sous-dossier
//      existe-t-il ailleurs ») — voir le commentaire sur `impactDesactivation` pour le detail.
//   4. Le script d'amorcage du super-admin (`domain/user.domain.ts`, `bootstrapSuperAdmin`,
//      tache 11, etape 4a) : seul appelant `scripts/bootstrap-super-admin.ts`, hors de toute
//      requete HTTP — meme motif que 1. L'ecriture qu'elle encadre n'est pas la meme table
//      (`User`, un modele GLOBAL, pour poser `isSuperAdmin` et, si besoin, reactiver le compte)
//      mais aussi `ActivityLog` (modele d'ETABLISSEMENT) pour sa ligne de journal — cette
//      deuxieme ecriture est la raison structurelle de l'encadrement : un modele global n'exige
//      pas `runAsSystem` pour lui-meme, `ActivityLog` si.
//   5. « Ce compte est-il rattache ailleurs ? » (`infra/orm/repositories/membership.repository.ts`,
//      `estRattacheAilleurs`, tache 15, etape 4a) : meme forme que 2 et 3 — une traversee
//      volontaire de frontiere qui ne rend qu'un BOOLEEN, jamais un identifiant ni un nom
//      d'etablissement. Elle REMPLACE une lecture strictement plus large : `MembershipDomain`
//      chargeait l'arbre COMPLET des appartenances du compte (`UserRepository.findByID`, un
//      `include` qui repart du modele GLOBAL `User` par une relation a-plusieurs) pour n'en
//      garder qu'un `length` — un pont que le garde-fou refuse desormais sous contexte de tenant
//      (`assertNoGlobalToManyBridge`, tenant-guard.ts). Ce cinquieme emploi RESSERRE donc ce qui
//      traverse, il ne l'elargit pas. Ses bornes (compte vise, etablissement courant EXCLU,
//      capture AVANT d'entrer dans le mode encadre) sont verifiees par `repository-scope.test.ts`,
//      pas par ce fichier-ci.
//   6. La lecture du journal des consultations, a l'echelle de l'etablissement
//      (`infra/orm/repositories/patientAccessLog.repository.ts`, `findByPatientInEstablishment`,
//      tache 5, etape 4b) : appelee depuis l'administration d'etablissement (aucun service
//      courant a ce niveau), pour rendre TOUTES les lignes du journal d'un patient, tous
//      services confondus — jamais de contenu clinique (voir le schema de reponse HTTP). Meme
//      forme que 2 et 3 : la borne (`establishmentId`, capturee AVANT d'entrer dans le mode
//      encadre) est verifiee par `repository-scope.test.ts`. `PatientAccessLog` reste dans
//      `SERVICE_MODELS` (tenant-guard.ts) : le reclasser en `ESTABLISHMENT_MODELS` pour eviter
//      ce sixieme emploi a ete essaye et rejete par la preuve de monotonie
//      (`tenant-guard-monotonie.test.ts`, profondeur 4), qui a montre **855 refus perdus** (110
//      chemins d'inclusion imbriquee distincts), repartis sur QUATRE contextes — 111 sans
//      contexte, 119 sous superadmin, mais surtout 325 sous tenant ORDINAIRE et 300 sous
//      administration d'etablissement, la majorite du total.
//
// `runAsSuperAdmin` (meme fichier, tache 1 / etape 4a) y ajoute un troisieme mode, qui ne retire
// rien mais substitue au filtre de tenant une liste declaree et exhaustive de couples (modele,
// operation) — SUPERADMIN_OPERATIONS, infra/orm/tenant-guard.ts.
//
// CE QUE CE FICHIER NE FAIT PAS, A DIRE PLUTOT QUE LAISSER SUPPOSER (revue finale, mineur) : le
// volet A ci-dessus (AUTORISES, un tableau nomme fichier par fichier) N'EXISTE QUE POUR
// `runAsSystem`. Les APPELS a `.runAsSuperAdmin(` (douze dans src/main, aujourd'hui) ne sont
// enumeres nulle part ici — un treizieme site, ajoute n'importe ou dans src/main, laisserait les
// trois volets de ce fichier entierement verts. Seule sa CONSTRUCTION reste unique (volets B et
// C : un seul appel a `run` pour ce mode, une seule ecriture litterale de `{ kind: "superadmin" }`,
// tous deux dans `tenant-context.ts`) — ce qui ferme « une seconde facon d'ENTRER dans ce mode »,
// pas « qui a le droit de l'INVOQUER une fois entre ». C'est defendable tel quel : une fois dans
// ce mode, chaque operation reste bornee par la liste declaree et exhaustive de
// `SUPERADMIN_OPERATIONS`/`SUPERADMIN_GLOBAL_OPERATIONS` (tenant-guard.ts), qui refuse tout
// couple absent — un treizieme APPEL a `runAsSuperAdmin` ne peut donc pas, a lui seul, elargir ce
// qu'il est possible d'y faire. Mais ce n'est pas la meme garantie que « chaque site est nomme et
// justifie », et rien ne doit laisser croire le contraire.
//
// Une exception a une regle de cloisonnement ne vaut que si chaque emploi reste declare et
// borne — spec §5.3 : "cela se verifie par un test, pas par une relecture." Ce test relit les
// sources plutot que de faire confiance a la memoire, a la maniere de
// `front/src/test/lecture-directe-du-cache.test.ts`.
//
// REVUE tache 7, tour 1, constat Critique C1 : une garde qui ne surveille que le NOM
// `runAsSystem` se contourne par trois idiomes ordinaires qu'un simple extract-variable ou un
// espace produisent sans y penser — `const f = ctx.runAsSystem.bind(ctx)`, `.runAsSystem (fn)`
// (espace avant la parenthese), et, le plus grave, une SECONDE methode qui entre en mode
// systeme sans jamais prononcer le nom `runAsSystem` : `uneAutreMethode(fn) { return
// this.storage.run({ kind: 'system' }, fn) }`. La revue a prouve par execution que cette
// derniere forme desactive reellement le garde-fou (un `findMany` sans aucun filtre de tenant
// passe sous elle). Ce fichier surveille donc deux choses, pas une :
//
//   A. tout ce qui REFERENCE la methode `runAsSystem` (au-dela du seul appel direct — voir
//      APPEL_RUN_AS_SYSTEM ci-dessous) ;
//   B. tout ce qui INVOQUE la capacite d'entrer dans un mode non-tenant (system OU superadmin),
//      par QUELQUE PORTE que ce soit de `AsyncLocalStorage` — REECRIT au tour de correction 1 de
//      la tache 1, puis a nouveau resserre au tour de correction 2 (voir le commentaire
//      d'appelsCapaciteDeStore plus bas pour le detail des deux tours) ;
//   C. tout ce qui ECRIT LITTERALEMENT la valeur `{ kind: 'system' }` / `{ kind: 'superadmin' }`
//      — l'ANCIEN volet B, retabli au tour de correction 3 a cote du nouveau plutot qu'a sa
//      place : les deux se completent, aucun des deux seul ne suffit (voir le commentaire juste
//      avant METHODES_QUI_POSENT_UN_STORE pour le detail).
//
// Volet A : reference a `runAsSystem`, sous forme d'ACCES A LA PROPRIETE plutot que du seul
// appel `.runAsSystem(`. `\b` (limite de mot) ferme la forme sur `.bind` (V2) et sur l'espace
// avant la parenthese (V5) sans exiger l'appel immediat ; le point exige en tete exclut la
// declaration de la methode elle-meme (`runAsSystem<T>(fn...) {`, ligne qui ne porte aucun point
// avant le nom) et l'entree d'interface (`runAsSystem<T>(fn...): Promise<T>` dans
// types/utils/tenant-context.ts, meme raison).
const APPEL_RUN_AS_SYSTEM = /\.runAsSystem\b/

// Les seuls emplois legitimes du back de production, pour le volet A. Chaque entree porte
// un nombre D'APPELS, pas un nombre de fichiers : un second appel ajoute dans un fichier deja
// permis doit etre discute, pas herite silencieusement.
const AUTORISES = [
  {
    fichier: 'application/starter.ts',
    raison:
      'purge planifiee des DEUX journaux, hors de toute requete : le journal d activite ' +
      '(scheduleActivityLogCleanup) et, depuis la tache 8 (etape 4b), le journal des ' +
      'consultations (schedulePatientAccessLogCleanup) — retention parametrable ' +
      '(config.logRetentionMonths) pour les deux',
    appels: 2,
  },
  {
    fichier: 'infra/orm/repositories/patientServiceFile.repository.ts',
    raison:
      'estSuiviAilleurs — le signal de suivi ailleurs — ET impactDesactivation — les ' +
      'compteurs de l ecran de desactivation d un service (design §3.6, tache 9)',
    appels: 2,
  },
  {
    fichier: 'domain/user.domain.ts',
    raison:
      'bootstrapSuperAdmin (tache 11, etape 4a) — seul point qui pose User.isSuperAdmin, ' +
      'appele par scripts/bootstrap-super-admin.ts, hors de toute requete HTTP',
    appels: 1,
  },
  {
    fichier: 'infra/orm/repositories/membership.repository.ts',
    raison:
      'estRattacheAilleurs (tache 15, etape 4a) — « ce compte est-il rattache a un AUTRE ' +
      'etablissement que le courant ? », un BOOLEEN et rien d autre. La question porte par ' +
      'nature sur les autres etablissements (User.deactivatedAt et un lien d acces sont ' +
      'GLOBAUX : agir dessus depuis un etablissement toucherait les autres, ce que les gardes ' +
      'appelantes refusent), donc aucune requete bornee au tenant courant ne peut y repondre. ' +
      'REMPLACE une lecture PLUS LARGE : MembershipDomain lisait l arbre COMPLET des ' +
      'appartenances via UserRepository.findByID pour n en garder qu un length — un include qui ' +
      'repart du modele GLOBAL User par une relation a-plusieurs, que le garde-fou refuse ' +
      'desormais sous contexte de tenant (assertNoGlobalToManyBridge). Ce qui traverse la ' +
      'frontiere passe de l arbre entier a un bit. Bornes verifiees par repository-scope.test.ts',
    appels: 1,
  },
  {
    fichier: 'infra/orm/repositories/patientAccessLog.repository.ts',
    raison:
      'findByPatientInEstablishment (tache 5, etape 4b) — la route d administration ' +
      'd etablissement du journal des consultations, sans service courant. PatientAccessLog ' +
      'reste dans SERVICE_MODELS (tenant-guard.ts), dont le garde-fou exige serviceId pour ' +
      'toute operation ; reclasser le modele en ESTABLISHMENT_MODELS pour eviter runAsSystem a ' +
      'ete essaye et rejete par la preuve de monotonie (tenant-guard-monotonie.test.ts), qui a ' +
      'montre 855 refus perdus (110 chemins distincts), sur quatre contextes dont le tenant ' +
      'ORDINAIRE (325) et l administration d etablissement (300), pas seulement superadmin (119) ' +
      'et l absence de contexte (111). Rend les acces de TOUS les services de l etablissement, ' +
      'jamais de contenu clinique. Bornes verifiees par repository-scope.test.ts',
    appels: 1,
  },
  {
    fichier: 'services/activity-log.subscriber.ts',
    raison:
      'la reemission de lien par le super-admin (tache 7, etape 4b, evenement ' +
      '`user.accessLinkReissued`) : `/super-admin` s execute sans AUCUN contexte (pas seulement ' +
      'sans tenant), et `ActivityLog` est un modele d ETABLISSEMENT (tenant-guard.ts, ' +
      'ESTABLISHMENT_MODELS) — le garde-fou refuse categoriquement une ecriture dessus en ' +
      'l absence de store, avant meme de regarder son contenu (mesure par execution : sans ce ' +
      'contournement, la ligne de journal n est jamais posee, l ecriture refusee etant avalee ' +
      'par le `catch` de `#log`). Meme motif que `bootstrapSuperAdmin` (domain/user.domain.ts, ' +
      'ci-dessus) et la purge planifiee (application/starter.ts) : hors de toute requete de ' +
      'tenant, il n y a pas d etablissement a poser, seulement `establishmentId: null`. N encadre ' +
      'QUE cette souscription, pas les onze autres actions de ce fichier : les elargir toutes ' +
      'masquerait silencieusement une VRAIE perte de contexte sur une route de tenant.',
    appels: 1,
  },
]

// Seul fichier ou le volet B a le droit de trouver un appel : celui qui DEFINIT `enter`, `clear`,
// `run`, `runAsSystem` et `runAsSuperAdmin`, et qui est donc, par construction, le seul endroit
// legitime d'ou peut naitre un changement de store — tenant, non-tenant, ou son effacement.
const SEUL_CONSTRUCTEUR_LEGITIME = 'utils/tenant-context.ts'

// Volet C (retabli au tour de correction 3) : construction TEXTUELLE de la valeur
// `{ kind: 'system' }` / `{ kind: 'superadmin' }` (avec ou sans espaces, guillemets simples ou
// doubles) — PAS sa lecture (`store.kind === 'system'`, dans tenant-guard.ts, ne matche pas : il
// n'y a pas de `:` entre `kind` et `'system'`). Ligne par ligne, comme l'ancien volet B : les
// limites connues (multi-ligne, virgule finale, gabarit, etalement, constante intermediaire) sont
// les memes qu'au tour de correction 1, et c'est PRECISEMENT pour ca que ce volet ne remplace pas
// le volet B — il le complete, sur les formes que le volet B ne voit pas (`.call`, `.apply`,
// `Reflect.apply`, cle de crochet calculee, tant que la VALEUR reste ecrite en clair).
//
// SES FAUX POSITIFS, declares plutot que decouverts en CI (tour de correction 4, mineur de la
// re-revue, les deux prouves par execution) : ce volet lit du TEXTE, pas du code, donc il ne
// distingue pas un litteral executable d'une simple mention. Un COMMENTAIRE qui cite l'idiome
// (`// … storage.run({ kind: 'system' }, fn)`) et une CHAINE DE CARACTERES qui le contient
// (`const DOC = "… { kind: 'superadmin' } …"`) le font rougir tous les deux, alors qu'aucun des
// deux n'active quoi que ce soit. Le mode d'echec est visible (la CI rougit, le message donne le
// fichier et la ligne) mais il oriente mal : devant un test rouge sur un commentaire, le premier
// reflexe est d'assouplir la regex — c'est le contraire qu'il faut faire. Le remede est de
// REECRIRE la mention (parler de l'idiome sans l'ecrire en clair : « la valeur de mode systeme »,
// ou couper le litteral), jamais d'elargir ce volet. Le reste de l'echelle est plus sur : les
// tests de ce depot construisent librement ces valeurs et ne rougissent pas, `RACINE` ne lisant
// que `src/main` (voir la note de fin de fichier). Et le cas voisin qui ne rougit PAS, verifie
// lui aussi : une LECTURE (`store.kind === 'system'`, dans tenant-guard.ts) n'a pas de `:` entre
// `kind` et la valeur, donc elle n'est pas captee.
const CONSTRUCTION_MODE_SYSTEME = /\{\s*kind\s*:\s*['"]system['"]\s*\}/
const CONSTRUCTION_MODE_SUPERADMIN = /\{\s*kind\s*:\s*['"]superadmin['"]\s*\}/

// `types/utils/tenant-context.ts` declare le TYPE `TenantStore = { kind: 'tenant'; ... } | {
// kind: 'system' } | { kind: 'superadmin' }` : la meme sous-chaine y apparait textuellement, mais
// a titre de membre d'union TypeScript, jamais construite comme valeur executee. Un fichier de
// declaration de type pur ne peut, par construction, faire entrer aucun contexte en mode
// non-tenant — il est donc exclu du volet C plutot que de tenter de distinguer par regex un
// litteral de type d'un litteral de valeur (les deux s'ecrivent `{ kind: 'system' }`).
const FICHIER_DECLARATION_TYPE = 'types/utils/tenant-context.ts'

// Jest tourne via @swc/jest en module CommonJS (jest.config.ts) : __dirname est disponible.
const RACINE = join(__dirname, '../../../main')

const fichiersDeProduction = (dossier: string): string[] =>
  readdirSync(dossier, { withFileTypes: true }).flatMap((entree) => {
    const chemin = join(dossier, entree.name)
    if (entree.isDirectory()) {
      return fichiersDeProduction(chemin)
    }
    if (!/\.ts$/.test(entree.name)) {
      return []
    }
    return [chemin]
  })

const lignesCorrespondantes = (racine: string, motif: RegExp) =>
  fichiersDeProduction(racine).flatMap((chemin) => {
    const relatif = relative(racine, chemin).split(sep).join('/')
    return readFileSync(chemin, 'utf8')
      .split('\n')
      .map((ligne, index) => ({ fichier: relatif, ligne: index + 1, texte: ligne.trim() }))
      .filter((emplacement) => motif.test(emplacement.texte))
  })

// TOUR DE CORRECTION 1 (tache 1) — Critique 2 de la revue : l'ancien volet B cherchait la VALEUR
// `{ kind: 'system' }` / `{ kind: 'superadmin' }` comme une chaine de caracteres, ligne par
// ligne. Sur sept sabotages soumis a l'epreuve, cinq passaient a travers : gabarit
// (`` `system` `` plutot que `'system'`), litteral etale sur plusieurs lignes, virgule finale
// avant l'accolade, etalement (`{ ...marqueurExistant }`) et constante intermediaire construite
// hors du litteral inline. Les trois premiers ne sont que des artefacts du DECOUPAGE PAR LIGNE
// (une regex qui ne regarde qu'une ligne a la fois ne peut pas voir un litteral qui en occupe
// trois, ni tolerer une virgule ou un guillemet different) ; les deux derniers sont plus profonds
// : ils deguisent la VALEUR sans jamais re-ecrire `{ kind: 'system' }` nulle part ailleurs que
// dans le fichier legitime — aucun scan de texte, aussi soigneusement ecrit soit-il, ne peut
// distinguer un `{ ...x }` legitime d'un `{ ...x }` qui propage la capacite ailleurs.
//
// Ce que ces cinq sabotages ont EN COMMUN, et qui ne change JAMAIS quelle que soit la facon dont
// la valeur est ecrite : aucun n'a d'effet sans un appel a une METHODE DE `AsyncLocalStorage` qui
// pose un nouveau store. C'est ce geste — pas la forme du premier argument — qui fait que
// `tenantContext.peek()` lira ensuite `{ kind: 'system' }` ou `{ kind: 'superadmin' }` pendant
// toute la portee ou elle s'applique. Le volet B surveille donc desormais CE geste, analyse comme
// du CODE (l'AST TypeScript, via le compilateur deja present dans ce depot pour `tsc`) plutot que
// comme du texte ligne par ligne : analyser l'AST ferme au passage le multi-ligne et la virgule
// finale (des artefacts du decoupage par ligne, pas des idiomes distincts) ; ne plus regarder la
// VALEUR du premier argument ferme l'etalement et la constante intermediaire, puisque ni l'un ni
// l'autre ne change la FORME de l'appel lui-meme.
//
// TOUR DE CORRECTION 2 (tache 1) — deux angles morts trouves dans CETTE reecriture, l'un par la
// re-revue (Critique 2), l'autre nomme par elle sans etre encore ferme (Important) :
//
//   - Critique 2 : la version precedente ne cherchait qu'un appel a la methode `run` — or
//     `AsyncLocalStorage` pose aussi un store avec `enterWith(store)`, une porte DIFFERENTE, tout
//     aussi capable d'entrer dans un mode non-tenant (prouve par execution par la revue :
//     `peek()` rend bien `{ kind: 'superadmin' }` apres un `storage.enterWith({ kind:
//     'superadmin' })`, et une operation sans filtre passe ensuite), et qui figure DEJA
//     legitimement trois lignes plus haut dans ce meme fichier (`enter`, `clear`). Une regle qui
//     ne visait qu'un nom de methode (`run`) a donc reproduit exactement le defaut que la
//     reecriture visait a corriger — un nom, pas une capacite. Volet B surveille maintenant les
//     DEUX portes : `run` et `enterWith`.
//   - Important : la condition `arguments.length === 2` sur `run` etait trop etroite — la
//     signature reelle est variadique (`run(store, callback, ...args)`), donc
//     `storage.run(store, fn, undefined)` ou un appel par etalement (`storage.run(...args)`, ou
//     `argsArray.length` different de 2 au runtime) y echappaient. Aucune des deux methodes
//     surveillees n'impose plus de condition sur le nombre d'arguments : le NOM de la methode
//     visee (par acces direct ou par crochet a cle litterale) est desormais la seule condition,
//     ce qui couvre aussi bien `run(store, fn)` que `run(store, fn, undefined)` ou un appel
//     etale.
//
// TOUR DE CORRECTION 3 (tache 1) — Important de la re-revue : le volet B (nom de methode) perd
// quatre couvertures que l'ANCIEN volet, purement textuel, tenait sans meme les viser
// deliberement — `.call`, `.apply`, `Reflect.apply` et une cle de crochet CALCULEE partagent un
// point commun que le volet B, fonde sur le nom de la methode APPELEE, ne peut pas voir : aucun
// n'ecrit litteralement `run(` ou `enterWith(` a l'endroit de l'appel — mais TOUS, dans leur
// forme la plus simple, continuent d'ecrire la VALEUR `{ kind: 'system' }` ou
// `{ kind: 'superadmin' }` en clair, quelque part sur la meme ligne. C'est exactement ce que
// l'ancien volet textuel (Critique 2, tour 1) surveillait, et qu'aucun volet n'a plus surveille
// depuis qu'il a ete remplace plutot que complete. Remede retenu ici, estime a dix lignes par la
// revue : GARDER l'ancien volet textuel comme TROISIEME volet, a cote du volet B plutot qu'a sa
// place — les deux se completent, aucun des deux ne remplace l'autre (voir Volet C plus bas).
//
// CE QUE CES TROIS VOLETS NE COUVRENT TOUJOURS PAS, dit honnetement plutot que par une expression
// qui ferait semblant de le couvrir : une valeur CONSTRUITE PROGRESSIVEMENT SANS jamais ecrire le
// litteral complet nulle part (`const s = {}; s.kind = 'sys' + 'tem'`, ou une cle de crochet dont
// la valeur ET le nom sont tous deux indirects). Fermer ce reste exigerait une analyse de flux de
// donnees complete, ou une instrumentation a l'execution (intercepter reellement
// `AsyncLocalStorage.prototype.run`/`.enterWith`) plutot qu'une lecture statique des sources — un
// chantier a part, hors de ce qu'un test de conformite des sources peut honnetement garantir.
// C'est aussi, plus fondamentalement, une limite du langage plutot que de ce test : le champ
// `storage` de `TenantContext` est marque `private`, mais `private` en TypeScript s'efface
// entierement a la compilation — a l'execution, n'importe quel code qui detient une reference
// vers l'instance injectee de `tenantContext` (et elle est injectee presque partout via le
// conteneur Awilix) peut lire `(tenantContext as any).storage` et l'invoquer directement, sans
// qu'aucune analyse de SOURCE ne puisse s'y opposer — une vraie frontiere exigerait une
// encapsulation qui survit a l'execution (`#champPrive` ou `WeakMap`), pas seulement au typage.
//
// DEUX PORTES SUPPLEMENTAIRES, TROUVEES PAR EXECUTION AU TOUR 3, DECLAREES ICI FAUTE DE POUVOIR
// LES FERMER PAR UNE LECTURE STATIQUE DES SOURCES :
//
//   1. MUTER EN PLACE l'objet que `peek()`/`getStore()` renvoie (`const s = tenantContext.peek();
//      (s as any).kind = 'superadmin'`) — aucun appel a `run`/`enterWith`, aucun litteral
//      `{ kind: ... }` nulle part : rien qu'un des trois volets ci-dessous puisse voir. FERMEE,
//      elle, mais PAS par un volet de ce fichier : le store est desormais gele
//      (`Object.freeze`) a sa construction dans `utils/tenant-context.ts`, donc une mutation de
//      ce genre echoue a l'execution (`TypeError` en mode strict — voir
//      `tenant-context.test.ts`, qui le prouve par execution) plutot que de reussir en silence.
//      C'est un remede a l'execution, pas une declaration : « si peek() peut rendre une copie
//      figee sans casser d'appelant, c'est mieux qu'une declaration » — verifie, ca ne casse
//      aucun appelant connu (les deux emplois de `peek()` hors de ce fichier ne font que LIRE).
//      TOUR DE CORRECTION 4 : au tour 3, cette declaration promettait plus que le code ne tenait.
//      Le gel etait SUPERFICIEL — il protegeait `kind`, pas `store.tenant`, et la re-revue a
//      prouve par execution que `peek().tenant.establishmentId = 'e9'` reussissait, survivait a un
//      tick, et repointait tout le contexte sur un autre etablissement (une porte PLUS large que
//      celle qui etait fermee : tous les modeles d'un autre etablissement, pas seulement les cinq
//      de la liste declaree), la meme reference etant en outre distribuee aux handlers par
//      `request.tenant`. Le tenant imbrique est desormais gele lui aussi ; `Tenant` ne portant que
//      des scalaires, ce gel est total, et un test de `tenant-context.test.ts` rougit si une
//      colonne imbriquee y apparaissait un jour.
//   2. REJOUER UN INSTANTANE D'`AsyncLocalStorage` CAPTURE DANS UNE PORTEE LEGITIME — Node expose
//      `AsyncLocalStorage.snapshot()` (statique) et `asyncLocalStorage.bind(fn)` (instance), qui
//      capturent le contexte COURANT dans une fonction ordinaire, rejouable n'importe ou, y
//      compris hors de la portee ou elle a ete capturee. Une capture faite legitimement
//      A L'INTERIEUR d'un `runAsSuperAdmin` produit une fonction qui, invoquee PLUS TARD depuis
//      N'IMPORTE QUEL fichier, y fait retomber `peek()` sur le contexte superadmin — sans jamais
//      ecrire `run(`, `enterWith(`, ni aucun litteral `{ kind: ... }` au point d'appel : le site
//      d'invocation est un appel de fonction ORDINAIRE, syntaxiquement indiscernable de n'importe
//      quel autre. NI le volet B (nom de methode) NI le volet C (litteral de valeur) ne peuvent
//      la voir, et elle n'est PAS fermee : `AsyncLocalStorage.snapshot`/`.bind` ne sont utilises
//      nulle part dans ce depot a ce jour (verifie), donc rien ne l'exploite aujourd'hui — mais
//      rien dans ce fichier ne le garantirait si quelqu'un commencait a les utiliser.
const METHODES_QUI_POSENT_UN_STORE = new Set(['run', 'enterWith'])

const appelsCapaciteDeStore = (racine: string): { fichier: string; ligne: number }[] =>
  fichiersDeProduction(racine).flatMap((chemin) => {
    const relatif = relative(racine, chemin).split(sep).join('/')
    const texte = readFileSync(chemin, 'utf8')
    const source = ts.createSourceFile(chemin, texte, ts.ScriptTarget.Latest, true)
    const trouvailles: { fichier: string; ligne: number }[] = []

    const nommeCapaciteDeStore = (expression: ts.Expression): boolean => {
      if (ts.isPropertyAccessExpression(expression)) {
        return METHODES_QUI_POSENT_UN_STORE.has(expression.name.text)
      }
      if (ts.isElementAccessExpression(expression)) {
        const cle = expression.argumentExpression
        return ts.isStringLiteralLike(cle) && METHODES_QUI_POSENT_UN_STORE.has(cle.text)
      }
      return false
    }

    const visiter = (noeud: ts.Node): void => {
      if (ts.isCallExpression(noeud) && nommeCapaciteDeStore(noeud.expression)) {
        const { line } = source.getLineAndCharacterOfPosition(noeud.getStart(source))
        trouvailles.push({ fichier: relatif, ligne: line + 1 })
      }
      ts.forEachChild(noeud, visiter)
    }
    visiter(source)
    return trouvailles
  })

describe('unicite de l exception runAsSystem au cloisonnement multi-tenant', () => {
  it('n apparait, dans back/src/main, qu aux emplacements autorises (volet A : le nom, et ses detours)', () => {
    const trouvees = lignesCorrespondantes(RACINE, APPEL_RUN_AS_SYSTEM)

    const interdits = trouvees.filter(
      (emplacement) => !AUTORISES.some((permis) => permis.fichier === emplacement.fichier),
    )

    // Sens 1 : un emploi ajoute ailleurs doit faire rougir ce test. runAsSystem() hors des deux
    // emplacements autorises : cette exception au cloisonnement multi-tenant doit rester unique
    // et declaree (design §5.3, back/CLAUDE.md). Le tableau (vide s'il n'y a rien d'interdit)
    // s'affiche dans le diff Jest en cas d'echec : chaque entree porte deja fichier et ligne.
    expect(interdits).toEqual([])

    // Sens 2 : un emplacement autorise retire de la liste alors qu il est toujours employe (ou
    // dont le nombre d appels a change en silence) doit faire rougir aussi, sans quoi la liste
    // pourrit au premier refactor. `permis.raison` documente pourquoi l'emplacement est permis ;
    // si ce compte tombe a zero ou change, c'est ce commentaire qu'il faut relire.
    for (const permis of AUTORISES) {
      expect(
        trouvees.filter((emplacement) => emplacement.fichier === permis.fichier).length,
      ).toBe(permis.appels)
    }
  })

  it('n invoque la capacite de poser un store (run OU enterWith) qu au seul endroit legitime (volet B, reecrit : la capacite, pas un nom de methode)', () => {
    const appels = appelsCapaciteDeStore(RACINE)

    // Cinq appels legitimes dans tout src/main, tous dans utils/tenant-context.ts : deux
    // `enterWith` (`enter` pose le tenant, `clear` efface la portee) et trois `run` (`run` pour
    // le tenant, `runAsSystem`, `runAsSuperAdmin`). Un sixieme appel — a l'une ou l'autre methode
    // — ou un appel deplace hors de ce fichier, pousse ce compte au-dela de 5 et fait rougir
    // cette assertion, quelle que soit la facon dont l'argument de store est ecrit (litteral,
    // gabarit, multi-ligne, virgule finale, etalement, constante importee, argument
    // supplementaire : aucun ne change le NOM de la methode appelee, voir le commentaire
    // d'appelsCapaciteDeStore ci-dessus).
    expect(appels).toHaveLength(5)
    for (const appel of appels) {
      expect(appel.fichier).toBe(SEUL_CONSTRUCTEUR_LEGITIME)
    }
  })

  it('n ecrit litteralement la valeur { kind: "system" } / { kind: "superadmin" } qu au seul endroit legitime (volet C : le texte, en complement du volet B)', () => {
    const constructionsSysteme = lignesCorrespondantes(RACINE, CONSTRUCTION_MODE_SYSTEME).filter(
      (emplacement) => emplacement.fichier !== FICHIER_DECLARATION_TYPE,
    )
    const constructionsSuperadmin = lignesCorrespondantes(RACINE, CONSTRUCTION_MODE_SUPERADMIN).filter(
      (emplacement) => emplacement.fichier !== FICHIER_DECLARATION_TYPE,
    )

    // Une seule construction textuelle de chaque valeur dans tout src/main (hors declaration de
    // type), et elle doit vivre dans le fichier qui possede `runAsSystem`/`runAsSuperAdmin`. Ce
    // volet attrape ce que le volet B (nom de methode) ne peut pas voir : `.call`, `.apply`,
    // `Reflect.apply`, une cle de crochet calculee — tant que la valeur elle-meme reste ecrite en
    // clair, peu importe la forme de l'appel qui la consomme.
    expect(constructionsSysteme).toHaveLength(1)
    expect(constructionsSysteme[0]?.fichier).toBe(SEUL_CONSTRUCTEUR_LEGITIME)
    expect(constructionsSuperadmin).toHaveLength(1)
    expect(constructionsSuperadmin[0]?.fichier).toBe(SEUL_CONSTRUCTEUR_LEGITIME)
  })
})

// Ce que ces trois volets NE couvrent PAS, dit honnetement plutot que par une expression qui
// ferait semblant de le couvrir (revue tache 7, tour 1 ; complete aux tours de correction 1, 2 et
// 3 de la tache 1 — voir le commentaire d'appelsCapaciteDeStore pour le detail des trois volets,
// et les deux portes declarees juste apres lui) : un appel a `runAsSystem`/`runAsSuperAdmin`, une
// invocation directe de `.run(`/`.enterWith(`, ou une construction litterale de
// `{ kind: 'system' }`/`{ kind: 'superadmin' }`, depuis `back/src/test` (par exemple un test qui
// fabriquerait un contexte systeme ou superadmin de toutes pieces). `RACINE` ne lit que
// `src/main` — le code de production livre — jamais `src/test`. Ce n'est pas un oubli : les
// tests unitaires legitimes de ce depot construisent deja `{ kind: 'system' }` et
// `{ kind: 'superadmin' }` directement (repository-scope.test.ts, tenant-context.test.ts,
// tenant-guard.test.ts) pour eprouver le garde-fou lui-meme, si bien qu'etendre ce scan a
// `src/test` exigerait une liste d'autorisation separee pour les tests — un chantier a part, hors
// du remede demande ici, et qui recoupe la meme limite deja actee pour la porte de typage
// (`npm run build` ne type pas `src/test` non plus : voir tache 7, revue, mineur m4). Un
// `runAsSystem`, un `runAsSuperAdmin`, un appel `.run(`/`.enterWith(` ou une construction
// litterale ecrits dans un fichier de test n'activent d'ailleurs rien en production : ils ne
// peuvent agir que sur l'execution de ce test-la.
