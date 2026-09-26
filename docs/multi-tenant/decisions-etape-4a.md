# Décisions de l'étape 4a (administration : établissements, services, comptes)

Ce document conserve les décisions prises pendant la conception et l'exécution de l'étape 4a,
telles qu'elles ont été consignées au fil du chantier dans `progress.md` (le registre de tâches,
git-ignoré, qui disparaît avec l'espace de travail). Il fait pour l'étape 4a ce que
`decisions-etape-1.md`, `decisions-etape-2.md` et `decisions-etape-3.md` font pour les étapes
précédentes : dire ce qui a été décidé, pourquoi, et **ce que la décision coûte si elle se révèle
fausse** — pour une application qui manipule de vraies données de santé, ce raisonnement doit
rester lisible longtemps après le code qui le traduit.

Là où ce document contredit la spécification ou le plan d'origine de l'étape, **c'est lui qui fait
foi** : dix-huit fois pendant ce chantier, un implémenteur ou un relecteur a eu raison contre le
brief, et ce sont ces corrections-là qui sont écrites ici.

**Règle de lecture, et elle a été appliquée en écrivant ce document.** Quand une propriété est
tenue par un test, le fichier est nommé. Quand elle n'est tenue que par la relecture, c'est écrit.
Quand une limite est ouverte, elle est écrite comme une limite, dans la section « Ce qui reste
ouvert » — pas diluée dans une phrase rassurante. Le défaut dominant de ce chantier a été la
phrase qui promet plus que le code ne tient : à l'étape 3, un écran annonçait « 1 » là où la
réalité était « 2 », et il rassurait sur le chiffre même qui servait à décider.

Documents liés :

- `docs/superpowers/specs/2026-09-25-multi-tenant-etape-4a-administration-design.md` — la spécification de cette étape
- `docs/superpowers/specs/2026-09-22-multi-tenant-architecture-design.md` — la cible et son découpage en étapes
- `docs/multi-tenant/decisions-etape-3.md` — l'étape précédente, notamment le garde-fou d'ORM et le comptage détourné
- `docs/multi-tenant/habilitations.md` — les rôles et la matrice de permissions, qui fait foi
- `docs/multi-tenant/deploiement-etape-4a.md` — la procédure de déploiement issue de ces décisions
- `docs/multi-tenant/verification-etape-4a.md` — ce qui devient vérifiable à l'écran, et par quel chemin
- `back/CLAUDE.md`, `front/CLAUDE.md` — les conventions qui en sont nées, écrites pour le prochain implémenteur

---

## L'invariant d'où tout découle

**Un lien d'accès réinitialise le mot de passe du `User`, qui est global.** Pas celui de
l'appartenance. Un lien ne donne donc pas accès « à cet établissement » : il donne accès **au
compte**, donc à tout ce que ce compte atteint, partout.

C'est l'invariant qui gouverne toute route rendant un jeton, et **trois escalades de privilège en
ont découlé**, toutes fermées pendant la tâche 10 et vérifiées par rejeu complet (chaîne rejouée
jusqu'à la session obtenue, par un relecteur employant des sabotages différents de ceux de
l'implémenteur) :

1. l'administrateur de l'établissement A réémettait un lien pour un compte membre **aussi** de B,
   et prenait le contrôle de son accès à B ;
2. l'administrateur d'un établissement quelconque prenait le **compte super-admin**, en un appel
   via `POST /account`, ou en trois via `addByEmail` puis la réémission ;
3. un simple `ADMIN` d'établissement **désactivait le compte global d'un super-admin** —
   `User.deactivatedAt` est global de la même façon — et lui coupait l'accès à toute la
   plateforme. Trouvée par l'implémenteur **hors du périmètre de la consigne**, en traitant la
   deuxième.

Les trois se refusent aujourd'hui par une **garde unique partagée**, `assertIssuableToken`
(`back/src/main/domain/membership.domain.ts`), appelée avant chaque `issue()` du niveau
établissement — pas une copie par route. Ce qui la tient :
`back/src/test/unit/infra/access-link-issue-sites.test.ts`, qui énumère les sites d'appel de
`.issue(` dans `src/main` (volet A) et exige que le domaine appelle la garde **au moins autant de
fois qu'il émet** au niveau établissement (volet B). Même forme que
`runAsSystem-unicite.test.ts`. La troisième escalade est fermée par `assertNotSuperAdmin` dans
`setDeactivated`, et tenue par `back/src/test/e2e/members.test.ts` (« ne desactive pas le compte
global d un super-admin »).

*Coût si cet invariant est mal lu* : il l'a déjà été. Le brief de la tâche 10 avait formulé
l'arbitrage sur la seule réémission ; `POST /account` rendait lui aussi un jeton et n'avait reçu
aucune garde. **La garde se pose sur le jeton, jamais sur la route** — et c'est le test
d'énumération, pas la prose, qui empêche la prochaine route d'émettre sans passer par elle.

---

## Les six décisions de métier de la spécification (§3)

- **D1 — Le premier administrateur reçoit un lien de première connexion à usage unique, pas un
  mot de passe provisoire.** La cible prévoyait un mot de passe provisoire ; il n'existe aucune
  infrastructure de courriel dans l'application, le lien est donc transmis à la main.
  *Motif* : rien de secret ne transite ni ne se tape ; le lien expire (sept jours) et ne sert
  qu'une fois, un mot de passe provisoire ne fait ni l'un ni l'autre. Sept jours plutôt que deux :
  la transmission étant manuelle, un appel qui n'aboutit pas un vendredi ne doit pas tout faire
  recommencer le lundi.
  *Ce que le code tient, et par quel test* : la base ne voit **que** l'empreinte du jeton
  (`AccessLink.tokenHash`, `prisma/schema.prisma`), jamais le jeton ; l'usage unique est tenu
  **par la base** (`consumeIfActive`, une mise à jour conditionnée) et non par une lecture suivie
  d'une écriture — vérifié par `back/src/test/e2e/access-link.test.ts` (« deux consommations
  simultanees du meme lien n aboutissent qu une fois sur deux »), et le relecteur l'a re-prouvé
  en remplaçant la mise à jour conditionnée par une lecture-puis-écriture naïve, qui fait rougir
  le test. Un lien expiré, un lien déjà consommé et un compte désactivé sont refusés, chacun par
  son test dans le même fichier ; le refus pour compte désactivé **ne brûle pas le jeton**, qui
  reste utilisable si le compte est un jour réactivé.
  *Coût si faux* : une table et une route publique de plus, là où un mot de passe provisoire n'en
  demandait aucune.
  L'inscription publique **reste ouverte** : la fermer imposerait de décider du sort des comptes
  déjà inscrits sans rattachement, ce qui est un chantier à part.

- **D2 — Créer un service y rattache son créateur, comme coordinateur — sauf sous octroi
  temporaire.** La première moitié vient de la spécification ; la seconde a été tranchée à la
  tâche 9 et n'y figurait pas.
  *Motif de la règle* : la personne qui crée un service est déjà administratrice de son
  établissement, donc elle peut de toute façon s'y affecter en un clic. Le rattachement
  automatique ne lui accorde **rien qu'elle ne pouvait s'accorder** ; il lui épargne un détour et
  évite qu'un établissement neuf commence par un cul-de-sac.
  *Motif de l'exception* : un rattachement réel **survivrait à l'expiration de l'octroi**, ce que
  le mécanisme existe précisément pour interdire ; et l'octroi couvre déjà tous les services actifs
  de l'établissement, donc le créateur n'a rien à y gagner pendant sa durée.
  *Ce que cela produit, et c'est un manque assumé* : un service créé sous octroi reste
  **définitivement sans membre** tant qu'un administrateur réel n'y affecte personne. Voir « Ce
  qui reste ouvert ».
  *Coût si faux* : pour la règle, un accès à des données de santé accordé par un geste
  d'administration plutôt que par un geste explicite — borné par le fait que le geste explicite
  était à un clic. Pour l'exception, un super-admin qui crée un service doit se rattacher lui-même
  après expiration.

- **D3 — La liste du super-admin montre le nombre de dossiers.** Colonnes : nom, date de
  création, actif ou non, premier administrateur, nombre de services, nombre de comptes, date du
  dernier accès, nombre de dossiers. Identifiants copiables partout.
  **Le nombre de dossiers est une donnée de santé agrégée** : il dit combien de personnes sont
  suivies dans cet établissement. C'est la même forme de divulgation — par la cardinalité seule —
  que celle fermée à l'étape 3 sur le comptage détourné (`decisions-etape-3.md`). Elle est ici
  **assumée et bornée** : un nombre, jamais une identité, jamais un contenu.
  *Ce que le code tient* : la revue de la tâche 7 a cherché dix marqueurs de patient dans les
  trois corps bruts des routes de lecture du super-admin — **zéro occurrence**. Le tour 2 a
  refermé un défaut du **jeu d'essai** et non du code : retirer le filtre d'établissement du
  compteur de dossiers faisait afficher à chaque établissement le total de la base **sans qu'aucun
  des 148 tests de l'époque ne rougisse**, parce que la liste s'exécutait sur un jeu où le global
  égalait le local. Le jeu d'essai a été corrigé pour que les deux diffèrent.
  *Coût si faux* : un compte qui n'a aucun accès aux dossiers connaît le volume d'activité de
  chaque établissement.

- **D4 — Le super-admin voit tout sauf le contenu des dossiers, et les noms du personnel sont
  visibles partout où il regarde.** Comptes, rattachements, rôles, établissements, services,
  désactivations, journal d'activité, derniers accès, identifiants copiables — y compris ceux des
  patients. Aucune identité de patient, aucun contenu de dossier.
  *Motif* : les ennuis réels de production sont des problèmes de contexte et d'habilitation, pas
  de contenu. « Je ne vois plus mes patients » se diagnostique avec des rattachements et des
  dates. Pour le reste, l'exploitant dispose de `psql`, qui est l'outil juste : il ne passe pas
  par le navigateur, laisse une trace différente et relève de l'accès au serveur.
  *Correction en cours de route, sur ma propre décision* : j'avais d'abord gardé « adresse seule,
  pas de nom » pour les rattachements de la recherche de comptes. Le journal d'activité, lui, rend
  les noms du personnel : les cacher ailleurs était un théâtre, et l'incohérence est pire que l'un
  ou l'autre choix. Un nom de collègue n'est pas une donnée de santé et le diagnostic de support
  en a besoin. **Noms visibles partout où le super-admin regarde.**
  *Coût si faux* : une session de super-admin volée vaudrait la lecture de tous les dossiers de
  tous les établissements, derrière un simple cookie et sans second facteur.

- **D5 — L'accès d'intervention est temporaire, motivé et visible ; il confère administrateur
  d'établissement et coordinateur sur chaque service actif.** Quatre heures par défaut,
  vingt-quatre au maximum — une demande de quarante-huit heures est **refusée** (400), jamais
  silencieusement ramenée à vingt-quatre. Le motif est obligatoire, chaîne vide refusée.
  *Pourquoi administrateur et non simple membre — tranché à la tâche 3, la spécification ne
  tranchait que le rôle de service* : le but de l'octroi est le diagnostic, et le cas de support
  le plus fréquent est un problème de rattachement. Un accès qui ne voit pas la liste des membres
  ne diagnostique rien. L'écart avec un coordinateur réel est réel et assumé : l'octroi ouvre les
  écrans d'administration de l'établissement, qu'un coordinateur ne voit pas.
  *La moitié comptable* : l'administrateur de l'établissement voit ces octrois, **en cours et
  passés**, avec leur motif et le nom de leur auteur
  (`GET /e/:establishmentId/admin/grants`). Révoquer pose `revokedAt`, **ne supprime pas** la
  ligne : le `DELETE` de la route est un verbe HTTP, pas une suppression en base — et
  `SuperAdminAccessGrant.delete` n'est délibérément **pas** déclaré au garde-fou, précisément pour
  que la trace comptable ne puisse pas être détruite.
  *Motif* : s'accorder l'accès est légitime ; le faire sans que le responsable du dossier puisse
  le savoir ne l'est pas. Sans cette moitié, le mécanisme ne vaut rien.
  *Coût si faux* : un accès extérieur invisible de ceux qu'il concerne.

- **D6 — Désactiver un service avertit, plutôt que d'exiger un transfert ; et les deux compteurs
  de l'avertissement ne disent pas la même chose, volontairement.** L'écran annonce combien de
  patients le service suit (`suivisIci`) et combien ne sont suivis **nulle part ailleurs**
  (`suivisNullePartAilleurs`) — ceux-là deviendront invisibles de toutes les listes.
  *Motif* : c'est réversible — la revue de la tâche 9 a compté douze familles de lignes avant,
  pendant et après une désactivation puis une réactivation : rien détruit, tout revenu,
  sous-dossier au **même identifiant**, membres avec leurs **rôles distincts**, et le même cookie
  jamais renouvelé. C'est cette preuve qui rend défendable le choix d'avertir plutôt que d'exiger
  un transfert — lequel obligerait à construire ce transfert, qui est une opération de santé et
  non un geste d'administration.
  *Le défaut qu'il a fallu corriger, et c'est la leçon de l'étape* : le compteur qui décide
  **sous-estimait**. Un patient dont le seul autre sous-dossier vit dans un service **déjà
  désactivé** n'était pas compté, alors qu'il deviendra tout aussi invisible. L'écran annonçait
  « 1 » là où la réalité était « 2 » — et rassurait à tort sur le chiffre même qui sert à décider.
  Corrigé ; `impactDesactivation` ne compte désormais que les services **actifs** comme
  « ailleurs ».
  *Divergence volontaire, écrite aux deux endroits* : `impactDesactivation` n'est **pas** la même
  computation qu'`estSuiviAilleurs` (le signal « suivi ailleurs » de l'étape 3), qui reste vrai
  même si l'autre service est désactivé aujourd'hui. Aligner les deux en casserait une.
  *Ce que le code tient* : `back/src/test/unit/infra/repository-scope.test.ts` capture les
  arguments réellement envoyés à Prisma et vérifie que chaque requête porte ses propres bornes ;
  le compteur en ligne n'existe pas, l'écran appelle la route dédiée
  (`GET /e/:id/admin/services/:id/impact-desactivation`) **au moment d'avertir** et pas avant —
  tenu côté front par `front/src/routes/_authenticated/e/$establishmentId/admin/services.test.tsx`
  (« reactiver ne calcule aucun impact : la route dediee n est jamais appelee »).
  *Coût si faux* : des dossiers qui existent et que plus aucun écran ne montre, jusqu'à
  réactivation.
  **Le transfert d'un patient d'un service à l'autre n'existe pas et 4a ne le crée pas.**

---

## Le troisième contexte, et ce qu'il ne fait pas

- **D7 — Le contexte `superadmin` est une troisième forme de contexte, à liste déclarée, et il
  échoue fermé.** Le garde-fou d'ORM (`back/src/main/infra/orm/tenant-guard.ts`) refuse toute
  opération sur un modèle de tenant sans contexte de tenant. Le super-admin n'en a aucun. La
  décision de la spécification (§4.2) est de lui donner un contexte propre, dont la capacité est
  **énumérée couple par couple** dans deux tables, et non un laissez-passer :
    - `SUPERADMIN_OPERATIONS` pour les modèles de tenant : `Service` (`count`, `findMany`),
      `EstablishmentMembership` (`count`, `findMany`, `create`), `ServiceMembership` (`count`,
      `findMany`), `Patient` (`count` — et rien d'autre : jamais une ligne), `ActivityLog`
      (`findMany`, `count`).
    - `SUPERADMIN_GLOBAL_OPERATIONS` pour les modèles globaux, sa symétrique exacte : `User`,
      `Establishment`, `AccessLink`, `SuperAdminAccessGrant`, chacun avec ses lectures sans
      mutation plus les seules écritures nommées une par une (`User.create`,
      `Establishment.create`, `AccessLink.create` + `updateMany`, `SuperAdminAccessGrant.create` +
      `update`). **Ni `User.upsert`** (il écraserait un compte existant) **ni
      `SuperAdminAccessGrant.delete`** (il détruirait la trace comptable).
  *Ce que quatre tours de correction ont appris, et qui est la vraie substance de cette décision* :
  une liste déclarée ne suffit pas si un chemin la contourne. Trois contournements successifs ont
  été trouvés puis fermés — la branche `superadmin` qui sortait **avant** le contrôle de descente
  récursive ; le **pont par modèle global** (`Service.findMany` avec une inclusion remontant vers
  l'établissement puis redescendant vers les patients) ; et la **racine globale**
  (`Establishment.findUnique` avec `include: { patients: true }`). Le dernier balayage
  indépendant : 48 racines × 8 formes, **157 095 648 cas à profondeur 11, zéro fuite**. La
  monotonie — « aucun refus d'avant n'est perdu » — a été mesurée six fois, la dernière sur
  **7 031 232 cas, zéro divergence** hors super-admin.
  *Coût si faux* : le contraire de ce que cette étape prétend construire. C'est pour cela que la
  liste est exhaustive et que **tout couple absent est refusé**, y compris un modèle global ajouté
  au schéma sans entrée — refusé en entier, lecture comprise, et le refus dit quel couple manque.

- **D8 — L'octroi temporaire ne contourne rien : il confère des appartenances, il ne perce pas le
  garde-fou.** Un super-admin sous octroi n'entre **pas** dans le contexte `superadmin` pour
  atteindre les écrans de l'établissement : il emprunte le chemin de tenant ordinaire, avec les
  appartenances que l'octroi lui confère (`effectiveMemberships`,
  `back/src/main/domain/accessGrant.domain.ts`).
  *Ce que le code tient, et c'est la propriété centrale de la tâche 8* : vingt-six routes
  comparées entre un membre réel et le super-admin sous octroi, **statut et corps octet pour
  octet**, sur un jeu non trivial (deux établissements peuplés, six dossiers cliniques, total
  global différent du total local) — **aucun écart, dans aucun des deux sens** ; sans octroi, 404
  partout. Le journal enregistre l'action sous l'identité **réelle** de son auteur.
  Tenu par `back/src/test/e2e/super-admin-acces.test.ts` et
  `back/src/test/e2e/tenant-resolution.test.ts`.
  *La brèche qu'il a fallu fermer, née du temps qui passe entre deux tâches* : le code de création
  de service affirmait que l'appartenance du créateur « existe forcément ». C'était vrai à
  l'écriture, faux depuis la tâche 8, un octroi ne matérialisant jamais de rattachement. Un
  super-admin sous octroi **listait** les services mais ne pouvait pas en créer, avec un 404 au
  message trompeur. La propriété centrale avait été établie sur vingt-six routes, **mais en
  lecture**.
  *Coût si faux* : un mécanisme d'accès parallèle à auditer séparément, au lieu d'un accès qui se
  comporte exactement comme celui d'un membre.

- **D9 — Un octroi est conditionné au drapeau `isSuperAdmin`, évalué à la lecture, et le dépôt
  relit le drapeau lui-même.** Retirer le drapeau retire l'accès **immédiatement**, sans
  reconnexion : à la tâche 3, un compte ordinaire portant un octroi obtenait encore 200 — un accès
  qui survivait à la révocation de la qualité qui le justifiait.
  *Comment c'est fermé, après deux tentatives insuffisantes* : la fonction ne prend plus qu'un
  **identifiant nu** et le dépôt relit `isSuperAdmin` avant d'entrer dans le contexte. Les deux
  versions précédentes passaient un objet utilisateur — d'abord réduit à deux champs, puis complet
  à neuf : dans les deux cas un **littéral fabriqué** rouvrait la lecture et l'entrée dans le
  contexte, en passant le compilateur, le lint et les 401 tests de l'époque, **fuite démontrée à
  l'exécution**. Le coût du contournement était passé de deux champs à neuf ; la porte restait
  ouverte.
  *Ce qui reste, et il faut le dire* : « il ne reste aucun champ sur lequel mentir » promettait un
  cran de trop — **l'identifiant en est un**, démontré. La confiance ne s'élimine pas, elle se
  réduit et se nomme : elle portait sur neuf champs, elle porte sur un seul, et c'est ce seul-là
  qu'un test garde désormais par le nom d'appel
  (`back/src/test/unit/domain/accessGrant.domain.test.ts`,
  `back/src/test/unit/domain/effectiveMemberships-seul-appelant.test.ts`).
  *Coût de cette relecture* : une requête en base de plus par requête HTTP, pour tout utilisateur.

- **D10 — L'entrée dans le contexte `superadmin` est conditionnelle au drapeau, pas
  inconditionnelle.** La première version y entrait à chaque requête, pour tout le monde. Ce n'est
  pas qu'un coût : cela élargit la surface où ce contexte est actif — celle que la tâche 1 avait
  passé quatre tours à réduire.
  *Coût si faux* : une lecture de plus par requête pour les comptes ordinaires, et surtout un
  contexte privilégié ouvert là où il n'a rien à faire.

- **D11 — Un seul chemin calcule les appartenances effectives, et un test de dépôt le tient.**
  `me-mapper.ts` et le plugin de tenant appelaient chacun leur propre version ; la divergence
  entre « ce que `/me` affiche » et « ce que la route sert » est exactement la classe de défaut
  qui fait qu'un écran ment. `effectiveMemberships` est désormais la fonction unique, et
  `back/src/test/unit/domain/effectiveMemberships-seul-appelant.test.ts` rougit si un troisième
  appelant apparaît.
  *Limite nommée dans le test lui-même* : il **ne voit pas** une réimplémentation locale. Ce qui a
  réellement fermé le cas du tableau vide, ce n'est pas le typage (qui n'attrape que l'omission du
  paramètre et un `undefined` explicite) mais les deux tests e2e ajoutés au même tour. La phrase
  « fermé par le typage » était partiellement fausse et a été corrigée.
  *Coût si faux* : `/me` liste un établissement que la route refuse, ou l'inverse.

- **D12 — Le mode encadré (`runAsSystem`) a un troisième emploi, et l'invariant n'a jamais été un
  nombre d'appels.** Ma spécification disait « exactement deux emplois », ce qui aurait fait lire
  toute addition comme une régression. Le troisième — `impactDesactivation`, qui doit lire un
  modèle de **service** depuis un contexte d'**établissement** — a été accepté.
  *Ce que l'invariant est réellement* : chaque emploi est **déclaré et nommé**, et **la requête
  porte elle-même ses bornes**, le garde-fou ne vérifiant plus rien sous ce mode. La revue l'a
  prouvé en retirant *toutes* les bornes : l'administrateur recevait alors les onze sous-dossiers
  des **deux** établissements sans la moindre erreur.
  *Deux tests, deux propriétés distinctes — et une version antérieure de cette prose les
  confondait en une affirmation fausse* : `runAsSystem-unicite.test.ts` tient la **capacité**
  (tout endroit de `src/main` capable d'entrer en mode non-tenant est un site déclaré) et ne
  regarde jamais le contenu d'une requête ; `repository-scope.test.ts` tient les **bornes**.
  *Coût si faux* : un emploi de plus d'un mode qui désactive le cloisonnement — d'où l'exigence
  que la revue vérifie les bornes de la requête, à chaque ajout.

---

## Ce qu'un établissement ne peut pas faire à un super-admin

- **D13 — Un compte `isSuperAdmin` ne peut être ni rattaché, ni créé, ni réémis, ni désactivé, ni
  réactivé depuis l'administration d'un établissement.** Quatre refus, trois messages différents,
  et le choix de chaque message est délibéré :
    - rattachement (`addByEmail`) et création de compte (`POST /account`) : message **opaque**
      (`UNADDABLE_EMAIL`), identique au refus « adresse inconnue » et au refus « déjà membre
      ailleurs ». Un refus qui dirait « cette adresse est un super-admin » ferait de la route un
      **détecteur de super-admins**, utilisable sur n'importe quelle adresse ;
    - désactivation / réactivation : message **propre**. La cible est un membre déjà visible dans
      `GET /members`, il n'y a rien à cacher sur son existence, et l'administrateur a besoin de
      comprendre pourquoi le bouton ne marche pas.
  *Les deux sens sont refusés pour la (dés)activation*, délibérément : un super-admin désactivé
  l'a été à la plateforme, un administrateur d'établissement n'a pas à le réactiver. La sortie de
  secours est le script d'amorçage (D17).
  *Conséquence assumée, à dire sans détour* : **un super-admin qui exerce aussi en service a
  besoin d'un second compte, ordinaire.**
  *Constat honnête sur l'opacité* : elle ne vaut que sur `/account` et `POST /members`. Sur
  `POST /:membershipId/access-link`, les deux autres refus ont chacun leur message propre, donc le
  refus super-admin est identifiable **par élimination**, quel que soit son texte. Le message
  opaque y est gardé par cohérence, mais **il ne faut pas compter sur l'opacité à cet endroit**.
  *Coût si faux* : ce que les trois escalades décrites en tête de document coûtaient.

- **D14 — Retirer un super-admin de la liste des membres de son établissement (`remove`) reste
  permis.** Seule exception aux quatre refus ci-dessus.
  *Motif* : cela ne touche pas le compte global, et retirer quelqu'un de son propre établissement
  est l'autorité normale d'un administrateur ; le super-admin garde de toute façon son accès par
  octroi.
  *Coût si faux* : un administrateur peut évincer un super-admin de la liste des membres de son
  établissement, sans effet sur ses droits.

- **D15 — La soupape : la réémission pour un compte multi-établissement passe par le super-admin,
  sans garde de comptage, y compris pour un autre super-admin.**
  *Motif* : sans elle, D13 serait une impasse. Une personne réellement en poste dans deux
  établissements qui perd son mot de passe n'aurait **aucun recours** — il n'existe ni route de
  mot de passe oublié, ni changement de mot de passe sans l'ancien (`PATCH /me` ne change pas le
  mot de passe). Le super-admin est l'autorité qui traverse **légitimement** les établissements ;
  ce qui borne cette route, ce n'est pas un compteur mais le préfixe `/super-admin` et sa
  permission.
  *Réémettre pour un autre super-admin, sans garde* : même palier de confiance, assumé.
  *Ce que le code tient* : un compte désactivé est refusé en amont, **avant toute écriture** —
  sinon la route rendrait 201 sur un accès qui ne pourra jamais être consommé, et l'émission
  aurait au passage invalidé les liens encore actifs du compte
  (`back/src/test/e2e/super-admin-access-link.test.ts`).
  *Coût si faux* : une trentaine de lignes et des tests pour une route que l'étape 4b aurait pu
  porter.
  **⚠ Cette route — la plus puissante du système — n'émet aucun événement.** Voir « Ce qui reste
  ouvert ».

---

## L'amorçage, et l'état normal d'un super-admin neuf

- **D16 — Le drapeau `isSuperAdmin` ne se pose que par un script en ligne de commande. Aucune
  route ne l'écrit.**
  *Motif* : un compte privilégié posable en un clic serait plus dangereux qu'un script qui exige
  un accès au serveur. Le seed ne crée aucun super-admin non plus (vérifié : `isSuperAdmin`
  n'apparaît nulle part dans `back/prisma/seed/`).
  *Coût si faux* : obtenir le premier super-admin exige un accès au serveur — ce qui est le but,
  et ce qui doit figurer dans la procédure de déploiement.

- **D17 — Le script réactive aussi, et il l'annonce.** Promouvoir un compte désactivé créerait un
  **compte privilégié dormant** ; le script réactive donc toute identité désactivée qu'il promeut.
  Mais l'opérateur doit savoir qu'il a réactivé, pas seulement promu : la sortie le dit en toutes
  lettres. Le script est aussi **idempotent** (déjà super-admin et déjà actif : rien à faire, ni
  écriture ni ligne de journal), refuse une adresse inconnue, refuse un argument surnuméraire
  plutôt que de le deviner, et n'affiche jamais un message d'erreur dont il ne reconnaît pas la
  provenance (une erreur Prisma non absorbée peut recopier une valeur soumise).
  *Pourquoi la réactivation est ici et nulle part ailleurs* : `POST /e/:id/admin/members/:id/
  (de|re)activate` est la seule route qui écrive `User.deactivatedAt`, aucune sous `/super-admin`,
  et D13 en refuse les deux sens. **Un super-admin désactivé n'a aucun autre chemin de retour.**
  *Toutes les écritures d'un même appel partagent une seule transaction* : sans cela, un échec de
  la ligne de journal **après** la pose du drapeau faisait croire à l'appelant que rien n'avait eu
  lieu, tandis que l'idempotence empêchait ensuite tout second appel de rejournaliser — la trace
  de « qui a créé ce super-admin, et quand » était perdue pour toujours. Le rollback a été observé
  en base pendant la re-revue.
  *Coût si faux* : une réactivation qu'un opérateur n'avait pas demandée — désormais visible à
  l'écran.

- **D18 — L'acteur de la ligne de journal du script est un marqueur littéral fixe
  (`cli:bootstrap-super-admin`), jamais l'identifiant de la personne promue.**
  *Motif* : mettre l'identifiant du promu ferait dire à la ligne qu'il s'est promu lui-même, ce
  qui est faux et invérifiable des années plus tard. Le marqueur est structurellement incapable
  d'être un identifiant de compte (les cuid n'ont jamais de `:`), et un grep dessus retrouve
  directement le commentaire qui l'explique.
  *Coût si faux* : une ligne de journal qu'il faut savoir lire pour comprendre qu'elle vient d'une
  ligne de commande.
  **⚠ Ces lignes ne sont lisibles par personne.** Voir « Ce qui reste ouvert ».

- **D19 — L'état NORMAL d'un super-admin neuf est « aucune appartenance », et tout code qui
  traite « aucune appartenance » comme « compte en attente » se trompe sur lui.** C'est la
  conséquence directe de D16, et elle a produit le défaut le plus embarrassant du chantier : le
  front envoyait un super-admin fraîchement amorcé sur `/pending`, écran **sans barre latérale et
  sans lien sortant**, avec le message « compte en attente d'approbation ». **L'écran que tout le
  chantier existe pour servir n'était atteignable qu'en tapant l'URL à la main.** Aucun test ne
  faisait passer un super-admin par la racine.
  *Décision* : à la racine, le drapeau redirige vers `/super-admin` **avant** la redirection vers
  `/pending`. Tenu par `front/src/routes/_authenticated/index.test.ts` et
  `front/src/routes/_authenticated/super-admin-journey.test.tsx`.
  *Coût si faux* : un super-admin qui est aussi praticien verra l'administration avant son tableau
  de bord ; il y a un lien pour revenir.

- **D20 — `/super-admin` lève `notFound()` pour un compte sans le drapeau, il ne redirige pas.**
  Le back répond déjà 404 (jamais 403) sous ce préfixe, pour ne pas révéler l'existence d'une zone
  qu'on n'a pas le droit de voir. Une redirection silencieuse côté front rendait cette zone
  **déductible en deux essais**, ce que le 404 du back refuse justement de faire.
  *Limite qui subsiste, et elle est plus large que cette route* : il n'existe **aucun
  `notFoundComponent`** dans le front — une URL inconnue rend le « Not Found » par défaut de
  TanStack Router. Le cas de `/super-admin` est fermé ; le manque général ne l'est pas.
  *Coût si faux* : un super-admin qui perd son drapeau voit « Not Found » au lieu d'un retour au
  tableau de bord.

- **D21 — La garde de rôle des écrans d'administration d'établissement est portée par la
  RÉSOLUTION DE CONTEXTE, pas par le fichier de layout. Qui lit le layout seul ne la voit pas.**
  Cette décision est écrite ici parce qu'une revue s'est trompée dessus, et que je l'avais
  consignée à tort avant de la corriger : `front/src/routes/_authenticated/e/$establishmentId/
  admin.tsx` ne contient aucun contrôle de rôle visible, et le relecteur avait conclu de son
  silence qu'un `MEMBER` le franchissait. **C'est faux.** `resolveEstablishmentContext`
  (`front/src/utils/tenant-context.ts`) rend `null` dès que `establishment.role !== 'ADMIN'`, et
  le `beforeLoad` redirige alors vers `/choose-context`. Un test antérieur au chantier le tient
  déjà (« refuse un membre sans role ADMIN sur cet etablissement »). L'implémenteur a refusé la
  consigne et a eu raison.
  *Leçon, et elle vaut au-delà de ce fichier* : **une garde absente d'un fichier n'est pas une
  garde absente.**
  *Coût si faux* : si la garde avait réellement manqué, tout membre d'un établissement aurait
  atteint ses écrans d'administration côté front, le back restant le seul filet.

---

## Les deux mécanismes d'accès, et ce qui les borne

- **D22 — Le jeton d'un lien d'accès ne voyage QUE dans le corps d'un POST, jamais dans une URL
  d'API, jamais dans un journal.** Un jeton en segment d'URL fuit par le journal de requête : la
  garde structurelle du back ne tronque que les préfixes sensibles **déclarés**, et à l'étape 4a
  la fuite a été rouverte **par le 404** — `POST …/consume/<jeton>` produisait quatre lignes de
  journal sur trois canaux, plus le corps HTTP. Fermée par une **liste fermée et nommée** de
  préfixes plutôt qu'une détection générique, montrée rouge sans le correctif.
  *Ce que le code tient, et ce qu'il ne tient pas* :
  `back/src/test/unit/interfaces/access-link-token-leak.test.ts` surveille les canaux de journal ;
  le relecteur a prouvé **par sabotage** qu'il exerce le vrai domaine et le vrai dépôt, pas une
  copie. **Il ne couvre pas** un en-tête de réponse portant le jeton, ni une écriture directe sur
  la sortie standard — les deux passent, vérifiés sur le fil. La forme objet de `pino` (la forme
  recommandée, et celle du journal de requête) n'était pas non plus couverte à un tour donné. Le
  filet est nommé, pas universel.
  *Côté front, cinq canaux et non quatre* : le cinquième a été nommé par la revue de la tâche 13 —
  après consommation réussie, `navigate({to:'/'})` **sans `replace`** laissait le jeton dans
  l'historique du navigateur ; un retour arrière réaffichait l'URL avec le jeton et réarmait le
  formulaire. Corrigé, tenu par `front/src/routes/auth/access-link.test.tsx`.
  *Coût si faux* : un jeton qui réinitialise un mot de passe global, conservé en clair dans un
  journal ou un historique.

- **D23 — C'est la PAGE publique qui connecte, pas la route de consommation.** La route rend
  `{ success }` — aucun cookie, aucune identité ; la page appelle ensuite la connexion ordinaire
  avec le mot de passe que la personne vient de choisir.
  *Motif* : un seul endroit établit les sessions — celui qui pose déjà la date de dernier accès,
  refuse un compte désactivé et limite le débit. En dupliquer la logique dans la route de
  consommation créerait un **second chemin d'authentification à auditer**.
  *Coût si faux* : un aller-retour de plus à la première connexion.

- **D24 — La limite de débit de la route publique se fie au pair TCP, par plages privées, jamais à
  un en-tête ni à un nombre de sauts.** Trois versions, et les deux premières étaient pires que
  rien :
    - ignorer `x-forwarded-for` : derrière Dokploy, les dix requêtes par minute sont partagées par
      **tout le monde** — la limite protège beaucoup moins qu'annoncé et gêne beaucoup plus ;
    - `trustProxy: 1` : **régression Critique**, mesurée sur de vraies connexions. Un nombre vaut
      dans Fastify une confiance purement **positionnelle**, pas une confiance en une adresse : un
      appelant direct obtenait l'adresse qu'il s'attribuait en écrivant simplement l'en-tête.
      Vingt-cinq requêtes en faisant varier l'en-tête : **zéro refus** avec le réglage, **quinze**
      sans. Sur la route qui pose un mot de passe, un plafond de dix par minute devenait illimité.
    - la version livrée : confiance **par plages privées**, qui protège le code sans dépendre de ce
      qui est exposé au déploiement. Prouvée sur de vraies connexions TCP, montrée rouge en
      remettant l'ancien réglage, et aucune forme d'en-tête ne permet plus de se choisir une
      adresse (simple, chaîne, répété, espaces, `x-real-ip`, `forwarded`, `x-client-ip`, IPv6,
      IPv4 mappée). Tenu par `back/src/test/unit/interfaces/trust-proxy.test.ts`.
  *Réserve résiduelle, exacte et bornée* : `deploy/compose.yaml` publie le back **sur toutes les
  interfaces**, là où Postgres y est explicitement lié à l'adresse locale. Le remède rend cette
  asymétrie sans conséquence pour la limite de débit, **mais un autre conteneur légitimement
  présent sur le même réseau Docker resterait indistinguable du proxy.**
  *Coût si faux* : une route qui pose un mot de passe, sans plafond effectif.

- **D25 — Un second octroi vivant sur le même établissement est refusé à la création, ET
  dédoublonné à la lecture.** Deux octrois vivants produisaient deux appartenances effectives
  identiques, donc un établissement affiché **deux fois** dans `/me` et dans le sélecteur du
  front.
  *Pourquoi les deux moitiés* : le refus à la création ferme le cas courant ; le dédoublonnage à
  la lecture protège des lignes créées **avant** cette garde, ou par toute autre voie future. Sans
  perte d'information : deux octrois vivants sur le même établissement portent rigoureusement le
  même contenu utile.
  *Et la fenêtre de course n'est pas hypothétique, elle est systématique* — trois essais, trois
  fois deux octrois vivants. Sans conséquence de sûreté (le dédoublonnage rattrape), mais **la
  liste de l'administrateur d'établissement, qui ne dédoublonne pas parce qu'elle doit montrer les
  lignes réelles, en afficherait deux.**
  *Coût si faux* : une ligne en double dans un sélecteur.

- **D26 — Seul le titulaire d'un octroi peut le révoquer ; l'identifiant n'est jamais reçu du
  client comme désignant une personne.** `POST /super-admin/grants` s'accorde l'accès **à
  soi-même** — `userId` n'existe pas dans le corps, c'est toujours `request.currentUser.id` ; et
  `DELETE /super-admin/grants/:id` passe `callerId` au domaine.
  *Coût si faux* : personne ne peut révoquer l'octroi d'un autre. C'est le manque, pas le
  bénéfice — voir « Ce qui reste ouvert ».

- **D27 — Pas de route supplémentaire pour qu'un super-admin liste ses propres octrois :
  l'information est dérivée de `/me`.** La liste des octrois existe côté **établissement**
  (`GET /e/:id/admin/grants`), pas côté super-admin — l'établissement voit qui a un octroi chez
  lui, le super-admin ne voit pas les siens.
  *Motif* : « j'ai déjà un octroi actif ici » est dérivable de `/me`, dont les appartenances
  effectives portent `origine: 'reelle' | 'octroi'`. À montrer à l'écran plutôt qu'à exposer par
  une route de plus, parce que deux octrois simultanés se courent après (D25) et que personne ne
  peut révoquer celui d'un autre (D26) : l'écran doit **décourager le doublon**.
  *La condition que l'écran devait remplir, et qu'il remplit* : **l'absence du bouton de
  révocation ne doit jamais se lire comme « aucun octroi actif »**. Le signal d'octroi actif vient
  de `origine`, indépendamment du bouton. `ActiveGrantNotice` affiche donc un bandeau « accès
  actif » **et** « révocation indisponible depuis cette session », au lieu d'un bouton qui
  disparaît. Tenu par `front/src/components/custom/superAdmin/activeGrantNotice.test.tsx`.
  *Coût si faux* : une dérivation côté front là où une route serait plus explicite — et, si la
  condition ci-dessus n'était pas tenue, un mensonge d'écran.

- **D28 — `origine` est optionnel côté front, pas requis.** Le rendre requis aurait obligé à
  retoucher treize fixtures antérieures sans rapport avec la tâche, et l'absence du champ **échoue
  du bon côté** : aucun badge d'octroi, plutôt qu'un badge faux.
  *Coût si faux* : un accès par octroi affiché comme une appartenance réelle si le back cessait un
  jour de remplir le champ.

- **D29 — `User.lastLoginAt` est posé sur le chemin de connexion, pas par la route qui l'affiche.**
  La colonne est créée par la migration de cette étape et exigée non vide par la liste du
  super-admin ; rien ne l'alimentait. `AuthDomain.signIn` la pose désormais à la connexion
  réussie.
  *Défaut de comptage corrigé au passage* : la date du « dernier accès » d'un établissement était
  la dernière connexion **n'importe où** d'un de ses membres — une seule connexion d'un compte de
  deux établissements faisait bouger les deux lignes à la même milliseconde, ce qui défait l'usage
  même de la colonne.
  *Coût si faux* : la colonne reste vide et la liste affiche « jamais » pour tout le monde — une
  liste qui ment est pire qu'une colonne absente.

---

## Les divulgations assumées, nommées une par une

Elles sont écrites ici parce qu'un chantier qui en assume trois sans les nommer finit par en
assumer une quatrième par accident.

- **D30 — L'oracle d'existence de comptes est assumé, et il a été mesuré.**
  `POST /e/:id/admin/members/account` rend 201 si l'adresse a un compte libre et 400 sinon ; le
  couple (400, 400) avec `POST /members` identifie exactement un super-admin.
  *Pourquoi il ne se ferme pas* : toute réponse honnête à son appelant légitime le divulgue, et le
  seul moyen de le fermer serait de **mentir à l'administrateur sur le sort de sa demande** — un
  201 qui ne créerait rien laisserait attendre un accès qui n'arrivera jamais. Divulgation seule :
  aucun des trois verbes n'est actionnable pour autant. Constaté **par un test**, et ce sont les
  trois phrases du code qui prétendaient le contraire qui ont été corrigées.
  *Coût si faux* : un administrateur d'établissement peut savoir si une adresse est un
  super-admin, sans pouvoir rien en faire.

- **D31 — Le canal temporel de `POST /account` a été fermé malgré D30, et ce n'est pas
  redondant.** La tâche 6 avait assumé un écart de 49 ms contre 11 (PBKDF2 calculé seulement pour
  un compte neuf), au motif que l'appelant super-admin dispose par ailleurs d'une recherche de
  comptes. **Cette prémisse est fausse pour un administrateur d'établissement**, qui n'en a
  aucune. Et une correction de mon propre arbitrage : j'avais écrit « il ne reste que du
  renseignement », c'est faux pour une **quatrième nature de compte** que l'implémenteur a
  mesurée — un compte existant rattaché à **aucun** établissement rend le même couple 201/400
  qu'une adresse inconnue. Sur cette nature-là, le temps de réponse était le **dernier**
  discriminant. La fermeture du canal temporel n'est donc pas redondante avec D30 : **elle est ce
  qui la borne.** Écart mesuré après correction : 34,98 ms contre un seuil de 18,57.
  *Motif retenu* : le canal temporel est **gratuit et sans trace**, là où `POST /members` écrit une
  ligne de journal. C'est cette différence qui justifie la fermeture, pas l'absence d'oracle.
  *Coût si faux* : une quarantaine de millisecondes sur une action d'administration rare.

- **D32 — Le 409 « ce compte est désactivé » est une seconde divulgation, assumée et nommée.**
  Elle est plus étroite que D30 (elle ne porte que sur les comptes désactivés) et ne peut pas être
  masquée sans mentir à l'appelant. Elle est ordonnée **après** le refus opaque : un compte
  désactivé rattaché à un autre établissement reçoit le refus opaque, jamais le 409 qui dirait son
  état — le fait le plus sensible l'emporte.
  *Deux divulgations assumées valent mieux qu'une assumée et une tue.*

- **D33 — La réponse de `POST /account` ne porte plus du tout le compte, et c'est structurel.** La
  version initiale renvoyait le prénom **stocké** et non celui soumis : un même appel avec un autre
  nom trahissait le compte existant. Le test de la tâche ne pouvait pas le voir (il n'envoyait
  aucun nom et ne comparait que des noms de clés). Fermé en retirant le compte de la réponse ; les
  deux corps sont désormais identiques **à l'octet près** (204 o) à entrée identique.
  *Limite honnête, et elle est structurelle* : le **branchement** de la route vers cette projection
  n'est gardé par rien. Zod élague déjà, la sortie observable est identique avec ou sans l'appel,
  et aucun test HTTP ne peut les distinguer. Un remaniement peut donc retirer l'appel sans rouge —
  c'est exactement ce que le commentaire du code annonce aujourd'hui, après correction de trois
  phrases qui laissaient croire le contraire.

---

## Ce qui reste ouvert

Ces points **ne sont pas des réussites**. Ils sont écrits ici parce qu'un document qui rassure à
tort est pire que pas de document.

### Les deux qui désignent le même trou, et qui sont le sujet de l'étape 4b

**L'étape 4a construit des pouvoirs, et presque rien ne les regarde.** C'est l'information la plus
utile pour la suite, et elle se lit dans deux constats jumeaux :

1. **`UserDomain.reissueAccessLink` — la route la plus puissante du système — n'émet aucun
   événement et n'apparaît dans aucun journal d'activité.** Vérifié dans le code : la méthode lit
   le compte, refuse un compte désactivé, appelle `accessLinkDomain.issue`, et c'est tout — pas
   d'`appEventBus.emit`, pas d'écriture dans `ActivityLog`. Seule la colonne
   `AccessLink.createdBy` en garde trace, et aucune route ne la lit. Cette route permet à un
   super-admin de prendre le contrôle de **n'importe quel compte de la plateforme, y compris un
   autre super-admin** (D15). C'est cohérent avec le reste du préfixe super-admin, qui ne
   journalise pas ; il fallait le nommer.
2. **Les lignes de journal du script d'amorçage ne sont lisibles par personne.** Elles portent
   `establishmentId: null` et `serviceId: null`, et **aucune route ne lit le journal à l'échelle
   de la plateforme** — `GET /super-admin/establishments/:id` rend le journal **de cet
   établissement**. La trace de l'action la plus privilégiée du système existe en base et
   n'apparaît dans aucun écran.

Les deux désignent le même manque : **il n'existe aucune traçabilité à l'échelle de la
plateforme.** C'est le périmètre naturel de l'étape 4b.

### Les manques du mécanisme d'octroi

3. **La course sur l'émission simultanée de liens n'est pas fermée.**
   `invalidateActiveForUser` et `create` ne sont pas atomiques, et rien n'empêche N appels
   parallèles sur le même `userId`, chacun invalidant ce qui existait **avant** que les autres
   n'aient écrit. Il reste **plus d'un lien utilisable**. Le nombre de survivants est **variable,
   sans chiffre stable observé** d'une machine ou d'un tour à l'autre — deux chiffres avancés en
   cours de chantier (« quatre à six », « vingt-neuf fois sur trente ») ne se sont pas reproduits
   et ont été retirés ; un chiffre faux dans un commentaire se transmet comme une mesure. Ce qui
   reste vrai dans tous les cas mesurés : il en reste plus d'un, jamais réduit à un seul.
   *Ce qui reste vrai par ailleurs* : réémettre **en séquence** invalide bien le précédent.
   *Constaté, pas fermé* : `back/src/test/e2e/access-link.test.ts`, « emissions simultanees pour
   le meme compte : plus d un lien reste utilisable (course NON fermee, assume) ». Fermer le cas
   concurrent demanderait un index unique partiel ou un verrou consultatif par compte — une
   migration ou un mécanisme qu'aucune tâche du plan ne réclame, pour un scénario rare et
   auto-limité par l'expiration à sept jours.

4. **Personne ne peut révoquer l'octroi d'un autre.** Conséquence directe de D26. Un octroi
   oublié par un super-admin absent court jusqu'à son terme (vingt-quatre heures au maximum).

5. **`GET /me` ne rend pas l'identifiant de la ligne d'octroi**, seulement
   `origine: 'reelle' | 'octroi'`. Conséquence côté écran, et c'est le pendant du point 4 : le
   front ne peut révoquer que l'octroi **qu'il vient de créer dans la session courante**. Après un
   rechargement de page, ou pour l'octroi d'un autre super-admin, la révocation est hors de portée
   sans nouvelle route. L'écran le dit plutôt que de le taire (D27).

6. **Accorder un octroi sur un établissement désactivé n'est pas refusé à l'écriture** ; seul son
   effet en lecture est fermé. Le super-admin croirait donc avoir un accès qu'il n'a pas.

7. **Un service créé sous octroi temporaire reste définitivement sans membre** (D2).

### Les manques antérieurs que l'étape 4a ne ferme pas

8. **`GET /patient` (`findAll`) rend encore les patients de tout l'établissement, sans filtre de
   service.** Vérifié : `PatientRepository.findAll` n'applique que `establishmentScope`, là où
   `findAllWithTags` filtre bien par sous-dossier du service courant. Manque connu depuis
   l'étape 3, pas fermé par l'étape 4a.

9. **Le pont par modèle global sous contexte de TENANT ordinaire — FERMÉ par la tâche 15, et il
   n'était pas théorique.** Une relation partant d'un modèle global peut être à-plusieurs et
   traverser les établissements (`User.establishmentMemberships`) ; une chaîne d'inclusions
   franchissait donc la frontière, **en lecture et en écriture**. L'asymétrie explique qu'il ait
   échappé à tout : les relations *vers* un global sont toutes à-un, donc inoffensives ; ni la
   descente récursive de l'étape 3 ni la liste déclarée de la tâche 1 ne regardaient dans l'autre
   sens. Le défaut **préexiste** au chantier (verdict identique à `a13046b`) et n'avait aucun
   effet tant qu'il n'existait qu'un seul établissement : **c'est l'étape 4a qui l'a rendu
   atteignable**, en permettant d'en créer un second — et c'est pour cela qu'elle le referme.

   **Ce que nous croyions à tort, et qui doit être lu par quiconque reprend ce garde-fou** : le
   plan affirmait qu'« aucune lecture du dépôt n'emprunte ce pont aujourd'hui ». **C'était faux.**
   `UserRepository.findByID`, qui lit l'arbre complet des appartenances, était appelé **sous
   contexte de tenant** par le domaine des appartenances, et l'un de ces appels prend en entrée
   **une adresse choisie par l'administrateur**. Le pont était donc emprunté par un chemin de
   production réel, à entrée contrôlée par l'appelant. Deux fausses assurances successives ont
   protégé ce trou : d'abord trente lignes de commentaire qui le déclaraient impossible (retirées
   en cours de chantier), puis un commentaire du garde-fou qui affirmait une sûreté inexacte — et
   **c'est lui qui avait fait écrire quatre tests à l'envers**, sur la prémisse fausse qu'« une
   seule ligne implique un seul tenant ».

   *La correction* : la cardinalité est portée par `MODEL_RELATIONS` et tenue par le test de
   conformité au schéma **dans les trois sens** ; le franchissement depuis un global par une
   relation à-plusieurs est refusé sous tenant comme sous super-admin, en `include`/`select`
   comme en `data`. **L'appel a été corrigé, jamais le garde-fou** : le souscripteur et le domaine
   passent à `findIdentity` (la ligne `User` seule) plus un booléen borné (`estRattacheAilleurs`,
   cinquième emploi déclaré du mode système). Ce qui traverse la frontière passe de l'arbre entier
   à un bit. Monotonie mesurée et **rejouable** (`MONOTONIE_REF=<ref> PROFONDEUR=9`) : 61 923 360
   cas, zéro refus perdu, tous les changements de verdict sur le chemin de tenant.

   *Ce que le resserrement a cassé, et qu'aucune porte ne voyait* : le souscripteur du journal
   d'activité appelait lui aussi `findByID`, sous contexte de tenant — `appEventBus.emit` est
   synchrone, donc le rappel s'exécute dans la portée de la requête — et un `.catch(() => null)`
   transformait le refus en « auteur inconnu ». Mesuré sur la base : `"userFirstName":"Prenom"`
   devenait `null`, pour **toutes** les actions journalisées depuis une route de tenant, colonne
   que le front affiche. Le test unitaire bouchonnait le dépôt et le seul e2e **comptait des
   lignes** : la ligne existait toujours, amputée. Fermé, avec un test qui affirme désormais le
   **nom de l'auteur**. *Leçon de classe, pas d'incident* : **tout `.catch` qui avale une erreur
   est un endroit où un resserrement du garde-fou se convertit en dégradation silencieuse.** Les
   trois autres de `src/main` ont été relus (ils enveloppent `findByEmail`, une lecture nue,
   insensible) ; aucune porte ne surveille cette classe.

   *Deux limites délibérément laissées ouvertes*, nommées ici pour qu'on ne les redécouvre pas :
   la règle ne s'applique à **aucune route non tenant** — `routes/index.ts` appelle
   `tenantContext.clear()` à chaque requête et seul `tenant.plugin.ts` entre dans un contexte,
   donc `/me`, `/auth` et **tout le préfixe `/super-admin`** s'exécutent sans store ; et sous
   tenant, l'écriture **plate** sur une racine globale d'à côté reste ouverte (seules les
   écritures imbriquées sont vérifiées). Ni l'une ni l'autre n'est une régression — zéro
   changement de verdict hors chemin de tenant — mais la première a une conséquence concrète :
   une lecture future dans `/super-admin` pourrait atteindre des patients par
   `Establishment.findUnique + include`, **en contournant `SUPERADMIN_OPERATIONS`**, dont
   l'absence de `Patient.findMany` est pourtant motivée. *Coût si faux* : les fermer en fin de
   chantier aurait fait tomber des lectures légitimes sans le budget de relecture nécessaire ;
   elles ouvrent l'étape 4b.

   *Et une phrase à ne pas laisser croire* : **l'étape 4a n'est pas monotone vis-à-vis de
   `main`.** Le harnais versé, lancé contre `main`, rapporte 1 800 verdicts assouplis. Ils sont
   tous expliqués — 1 594 ont pour racine ou pour étape `AccessLink` ou `SuperAdminAccessGrant`,
   **les deux tables nées à la tâche 2**, qu'un garde-fou antérieur refusait faute de les
   connaître ; les 206 autres sont la réouverture délibérée de `SUPERADMIN_GLOBAL_OPERATIONS`.
   Rien d'inexpliqué, mais mieux vaut le lire ici que le découvrir en 4b.

10. **`Object.freeze` sur le store de contexte a d'abord été superficiel**, et le fichier déclarait
    la porte « FERMÉE » alors que muter `peek().tenant.establishmentId` réussissait et repointait
    tout le contexte. Corrigé au tour 4 (le tenant est gelé aussi, mesuré sur 1 800 900 cas). Reste
    déclaré comme non fermable statiquement : **le rejeu d'un instantané capturé dans une portée
    légitime**.

### Les portes et l'outillage

11. **La porte de lint du front est rouge, et l'était avant ce chantier.** Mesuré sur la branche
    au moment d'écrire ce document : **32 erreurs**, réparties sur **11 fichiers**, dont **aucun
    n'est touché par l'étape 4a** (vérifié fichier par fichier contre `git diff a13046b..HEAD`) —
    ce sont donc exactement les 32 erreurs de `main`. Une porte rouge en permanence ne prouve rien
    et une erreur neuve s'y noierait. Ce n'est pas au chantier en cours de la réparer, mais il
    faut le dire. Les avertissements sont passés de 72 à **75** ; les trois de plus sont dans
    `src/routeTree.gen.ts`, fichier **généré**, et viennent des routes ajoutées par l'étape.

12. **Aucune des quatre portes du back ne lint ni ne typecheck `src/test`.** `npm run build` ne
    typecheck que `src/main`, `npm run lint` ne couvre que `src/main` et `prisma`. Mesure faite en
    cours de chantier (`npx tsc --noEmit -p tsconfig.json`) : **0 erreur dans `src/main`, 28 dans
    `src/test`**, sur neuf fichiers. Les deux seules catégories qui pouvaient rendre un test
    faussement vert ont été vérifiées une par une et **aucune ne vide un test de sa substance** :
    trois `TS2554` (un troisième argument mort passé à un crochet qui n'en prend que deux) et un
    `TS2339` (artefact de résolution de surcharge sur un `inject`). Le reste est du « possibly
    undefined » et de l'assignabilité. **Constat, pas blocage — et ce qu'il faut écrire, c'est que
    la porte ne couvre pas `src/test`, pas « aucune erreur de type ».**

13. **`back/.env.test`, versionné, pointe sur le port 5432** — celui du Postgres d'un autre
    projet ; le nôtre est sur **5433**. Seul un `back/.env.test.local` non versionné sauve la
    porte e2e. Vérifié au moment d'écrire : les deux ports répondent sur cette machine. Un clone
    neuf lancerait les tests contre la base de quelqu'un d'autre. Ce qui limite les dégâts :
    `src/test/e2e/setup/db.ts` refuse de tourner contre toute base dont le nom n'est pas
    exactement `medisync_test`.

14. **Les requêtes Bruno 404ent toutes** : le `BASE_URL` de la collection n'a pas de préfixe de
    tenant. Corriger la variable d'environnement, pas les requêtes une à une. Antérieur à
    l'étape 4a.

15. **`back/package.json` déclare `check:unused-methods` → `./scripts/detect-unused-methods.ts`,
    qui n'existe pas.** Vérifié : `back/scripts/` ne contient que `bootstrap-super-admin.ts` et
    son `tsconfig.json`. Commande documentée dans `back/CLAUDE.md` et inexécutable. Antérieur à
    l'étape 4a.

16. **`with:tsx` (`npx -y tsx@4.13.2`) échoue sous Node 26** (`Cannot find module './plugins'`) ;
    il est partagé avec `seed`. Corrigé pour la seule entrée `bootstrap:super-admin`, qui emploie
    le `tsx` installé localement. **La refonte de `with:tsx` et de `seed` reste ouverte** — ce qui
    veut dire qu'aujourd'hui, sous Node 26, `npm run seed` ne fonctionne pas par ce chemin.

17. **Il n'existe aucun écran de création d'établissement.** La route back existe
    (`POST /super-admin/establishments`) ; le code front correspondant a été **retiré** comme code
    mort, non testé, et parce que son type portait un second jeton en clair qu'aucune garde ne
    surveillait. La zone super-admin n'a que deux onglets : Établissements (liste et détail) et
    Comptes. Créer un établissement se fait donc par un appel HTTP. Voir
    `verification-etape-4a.md`, qui en tire les conséquences sur le critère de sortie de la cible.

18. **`/e/:establishmentId/admin` n'a pas de route index** : y arriver directement rend un
    `<Outlet/>` vide. Antérieur, sans conséquence aujourd'hui (aucun lien n'y mène, tous pointent
    vers `/admin/members`), à garder en tête si l'onglet devient une destination.

19. **Depuis l'écran Membres, on ne peut affecter personne à un service.** Cet écran vit sous le
    layout d'établissement, donc sans service en contexte ; `EditMemberForm` y reçoit toujours
    `serviceId === null` et sa commande de rôle de service est désactivée. Une affectation ne peut
    être posée qu'**à la création** du compte ou du rattachement, et **une seule** : la liste des
    services proposés est par ailleurs celle des services **de l'administrateur connecté**
    (`user.establishments[].services`), pas celle de l'établissement. La route
    `PATCH /e/:id/admin/members/:id` accepte pourtant un tableau d'affectations : le manque est à
    l'écran, pas à l'API.

---

## Annexe — les arbitrages du chantier, dans l'ordre

Ces décisions ont été prises en cours d'exécution, tâche par tâche, quand une revue mettait en
cause la spécification, le plan, ou un choix d'implémentation. Elles vivaient dans un registre
git-ignoré que la fin du chantier supprime ; elles sont versées ici pour que le raisonnement reste
relisible. **Plusieurs corrigent un défaut de ma propre spécification ou de mon propre plan ; sur
ces points, c'est l'arbitrage qui fait foi.**

**Avant l'exécution, sur lecture du plan :**

- `User.lastLoginAt` est ajouté par une tâche et exigé non vide par une autre, mais **rien ne
  l'alimente** : le chemin de connexion n'est dans la liste de fichiers d'aucune des deux. Décidé :
  la tâche 7 touche aussi `auth.domain.ts`. Coût si faux : une liste qui ment (D29).
- `EffectiveMembership` n'était pas déclarée. Forme retenue :
  `{ establishmentId, role, services: { id, role }[], origine: 'reelle' | 'octroi' }`. `origine`
  n'est pas décoratif : c'est lui qui permet à l'écran de dire qu'un accès vient d'un octroi.
  Coût si faux : deux tâches inventent deux formes et la seconde réécrit la première.
- La route d'impact de désactivation manquait au tableau des routes de la spec : **c'est le
  tableau qui a tort**, il n'était pas exhaustif — l'écran ne peut pas avertir sans compter.
- `back/scripts/` n'existait pas alors qu'un script npm y renvoyait déjà. La tâche 11 le crée.

**Le garde-fou (tâche 1), quatre tours de correction :**

- **Le défaut venait de mon plan** : la branche `superadmin` sortait avant le contrôle de descente
  récursive, donc `Service.findMany` avec une inclusion imbriquée obtenait les patients — **sans**
  `Patient.findMany`, que ma garde surveillait. Décidé : la branche passe par les mêmes contrôles
  que les autres. Coût si faux : le contraire de ce que cette étape prétend construire.
- Le test d'unicité surveillait la **forme** et non la capacité : sur sept sabotages, cinq
  passaient. Réécrit pour surveiller la capacité par l'arbre syntaxique TypeScript, puis complété
  par un volet textuel — et les limites résiduelles sont **nommées dans le fichier** (dispatch
  dynamique par `.call`/`.apply` ou clé calculée, et le fait que `private` s'efface à l'exécution).
- **La réécriture avait perdu une couverture que l'ancienne version avait** : `enterWith` n'était
  plus surveillé du tout, alors qu'il entre réellement dans le mode. C'est la question posée à
  chaque tour — « le correctif n'a-t-il pas cassé ce qui marchait » — et cette fois la réponse
  était oui.
- **Le resserrement fermait trop** : dix-huit couples d'écriture sur modèle global sont passés de
  permis à refusés d'un seul geste, dont ceux dont quatre tâches du plan dépendaient. D'où la
  table **par modèle** du tour 4 (D7).
- **Passage à un implémenteur neuf au tour 4**, sur un modèle plus capable : trois tours de
  resserrement successifs par le même agent l'avaient conduit à ne plus voir l'effet de bord de
  ses propres correctifs. Il a immédiatement refermé, **en élargissant**, un trou que
  l'élargissement ouvrait — `assertGlobalScope` n'inspectait jamais les données, donc déclarer
  `Establishment.create` rouvrait le pont par création imbriquée : treize ponts sur quinze se
  rouvrent si l'on retire son unique appel ajouté.
- **Il a refusé deux de mes consignes, avec raison dans les deux cas** :
  `SuperAdminAccessGrant.delete` (le `DELETE` est un verbe HTTP, pas une suppression en base) et
  `User.upsert` (il écraserait un compte existant).
- **Une affirmation porteuse de l'implémenteur s'est révélée fausse**, et c'est le constat le plus
  important de la séquence : il soutenait que le chemin de tenant ordinaire ne porte pas le pont
  « géométriquement ». Prémisse juste, conclusion fausse. D'où la **tâche 15** ajoutée au plan,
  élargie ensuite au côté écriture. Coût si faux : une étape de plus ; contre une correction
  bâclée dans la pièce la plus sensible du dépôt.

**Le modèle (tâche 2) :**

- Ma spécification disait « à recopier tels quels » en **omettant les relations inverses**, sans
  lesquelles Prisma refuse de valider le schéma ; et son titre annonçait « deux colonnes » là où
  le corps n'en décrivait qu'une. Corrigés dans la spec plutôt que laissés à diverger. Le
  relecteur a **reproduit lui-même l'erreur Prisma** plutôt que de croire l'implémenteur sur
  parole.

**Les appartenances effectives (tâche 3) :**

- L'implémenteur a trouvé un défaut de concurrence réel et l'a reproduit hors du dépôt — puis la
  revue a établi que **ce n'était pas un problème de concurrence** : la forme promesse du crochet
  Fastify cassait une requête **seule et séquentielle**, 79 des 113 tests e2e échouaient. Ce
  n'était pas une course latente frôlée de peu, c'était une panne déterministe et indéployable, et
  le rapport la décrivait mal. Le mode de défaillance est par ailleurs une **perte totale**, jamais
  une contamination croisée : aucun chemin ne sert les données d'un établissement à un autre.

**Les octrois (tâche 8) :**

- Le rôle que confère un octroi est **administrateur** d'établissement, là où la spec disait
  « coordinateur » : décision de la tâche 3 qui ne vivait que dans un commentaire de code. Écrite
  dans la spec, avec son motif et l'écart assumé (D5). J'y ai aussi corrigé le **préfixe des routes
  d'administration**, que la spec omettait et que les tâches front auraient recopié.

**Les services (tâche 9) :**

- Ma spec disait « exactement deux emplois » du mode encadré, ce qui aurait fait lire toute
  addition comme une régression. **L'invariant est la déclaration, pas le nombre** (D12).
- Sous octroi, **on ne rattache pas** (D2).

**Les comptes de membre (tâche 10), deux tours et deux escalades :**

- Le chemin de mon brief (`/e/:id/members/account`) omettait `/admin`. Sans conséquence : l'autre
  chemin échoue au démarrage (`assertTenantShapedRoute`).
- L'étape « exposer la désactivation » de mon brief était **déjà faite** : consigne de vérifier et
  de le dire, pas de la réécrire.
- **Mon arbitrage était mauvais, par omission** : je l'avais formulé sur la réémission seule, alors
  que `POST /account` rend lui aussi un jeton. L'arbitrage devait porter sur **toute route qui rend
  un jeton** — d'où la garde posée sur le jeton, et le test d'énumération.
- L'oracle d'existence **ne se ferme pas**, mais le canal temporel, si (D30, D31).
- Le défaut wireit (`test:unit.files` ne déclarait pas `src/main/**`) est passé du carnet de notes
  au correctif quand la re-revue a montré qu'il **masquait un rouge réel** : la porte était servie
  depuis le cache après un changement de `src/main`. Une ligne, et elle affecte la boucle locale de
  toutes les tâches suivantes. **Incident fermé**, pas manque ouvert.

**Le script d'amorçage (tâche 11) :**

- L'implémenteur n'a pas fusionné sur `main` et a eu raison : le merge se fait à la fin du
  chantier, pas à chaque tâche. Il a signalé la tension au lieu de choisir en silence.

**Le front (tâches 12 et 13) :**

- `conventions-tenant-api-queries.test.ts` interdit de nommer `establishmentId` dans `src/api` et
  `src/queries` ; le super-admin en a légitimement besoin — il désigne un établissement comme
  **donnée**, pas comme contexte implicite. La voie est la **liste d'exceptions du test** (raison +
  nombre exact d'occurrences, vérifié dans les deux sens), **jamais** un renommage pour passer sous
  le motif. Tenu sans élargissement (trois sabotages, dont le renommage en `id` nu).
- **Mon message de dépêche était faux** : j'avais annoncé `GET /super-admin/grants`, qui n'existe
  pas — la liste des octrois vit côté établissement (D27).
- Deux Critiques du front étaient des **tests vrais par construction** : « le lien n'est affiché
  qu'une fois » passait que `reset()` soit appelé ou non (Radix démonte le contenu à la fermeture),
  et le test des deux compteurs n'attachait pas l'étiquette au nombre — **en échangeant les deux
  libellés**, l'écran annonçait « deviendront invisibles PARTOUT : 5 » au lieu de 2, et les neuf
  tests restaient verts. Une assertion était même tautologique. C'est le défaut du back de la
  tâche 9, déplacé du back vers le test.
- **Un constat de revue a été infirmé** : la garde de rôle du layout d'administration existe, elle
  vit un cran plus bas (D21).
- **Une phrase de rapport promettait plus qu'elle ne tenait** et a été corrigée sans effacer
  l'erreur : `error` et `empty` partagent le même rendu dans ces écrans, donc neutraliser `error`
  seul ne rougit pas. La garantie tient ; c'est la phrase qui promettait trop.
</content>
</invoke>
