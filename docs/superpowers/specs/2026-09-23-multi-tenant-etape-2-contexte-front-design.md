# Étape 2 — Contexte front explicite (spécification)

**Document d'architecture** : `docs/superpowers/specs/2026-09-22-multi-tenant-architecture-design.md`, section 6.
**Étape précédente** : `docs/superpowers/specs/2026-09-22-multi-tenant-etape-1-socle-design.md`, fusionnée le 2026-09-23.
**Décisions de l'étape 1** : `docs/multi-tenant/decisions-etape-1.md`.
**Habilitations** : `docs/multi-tenant/habilitations.md` fait foi.

## 1. Ce que cette étape change, et ce qu'elle ne change pas

À la fin de l'étape 1, le front connaît **un** contexte établissement/service, dérivé au
chargement du premier couple trouvé dans `/me`, rangé dans le store d'authentification et lu par
deux fabriques d'URL. Les URLs de l'application n'en portent aucune trace : `/agenda`,
`/patient/$id`, `/settings/planning`.

Cette étape rend ce contexte **explicite, choisi et partageable** :

- il figure dans l'URL, donc un lien renvoie au bon service ;
- l'utilisateur membre de plusieurs services en change sans se déconnecter ;
- passer d'un service à l'autre ne laisse jamais voir une donnée de l'autre, ni à l'écran, ni
  par le cache, ni par un réglage retenu d'une session précédente.

**Hors périmètre, et nommément** : le sous-dossier patient par service (étape 3), les écrans
d'administration d'établissement autres que Membres et le journal des accès (étape 4), la
création d'établissement et le super-administrateur (étape 4). Aucun changement de modèle de
données.

## 2. La décision qui gouverne toute l'étape

L'architecture prévoyait que le tenant devienne le premier argument des fonctions d'API et
traverse explicitement les requêtes. Le relevé de l'existant a montré un fait qu'elle ne pouvait
pas connaître : **toute construction d'URL passe déjà par deux fabriques uniques**,
`tenantApiUrl()` et `establishmentApiUrl()` dans `front/src/constants/config.constant.ts`. Les
dix-sept modules d'API les appellent, aucun ne compose d'URL à la main hors de
l'authentification.

Décision retenue, validée : **le contexte reste implicite, mais sa source change**. Il cesse
d'être dérivé de `/me` pour être lu dans l'URL. Les dix-sept modules d'API et les seize fichiers
de requêtes ne changent pas.

Ce choix a une conséquence qu'il faut assumer de front : si le contexte est implicite, rien dans
le typage n'empêche d'oublier de le prendre en compte quelque part. La sûreté ne peut donc pas
reposer sur la discipline d'écriture. Elle repose sur les mécanismes de la section 5, qui sont
conçus pour être **entiers ou absents**, jamais partiellement appliqués.

## 3. Arbre de routes

### 3.1 Cible

```
routes/
├── __root.tsx
├── auth/index.tsx
├── pending.tsx
├── _authenticated.tsx                     # authentifié
└── _authenticated/
    ├── index.tsx                          # → contexte par défaut, ou choose-context
    ├── choose-context.tsx                 # liste des couples accessibles
    ├── user/settings.tsx                  # hors tenant : compte de la personne
    ├── e/$establishmentId/
    │   ├── admin.tsx                      # layout établissement (sans service)
    │   ├── admin/members.tsx
    │   ├── s/$serviceId.tsx               # layout service
    │   └── s/$serviceId/
    │       ├── index.tsx                  # → dashboard
    │       ├── dashboard.tsx, agenda.tsx, suivi.tsx
    │       ├── patient/index.tsx, patient/$patientID.tsx
    │       └── _settings.tsx              # layout réglages de service
    │           └── _settings/
    │               ├── planning.tsx, thematic.tsx, soignant.tsx
    │               ├── location.tsx, diagnostic-template.tsx
    │               └── activity-log.tsx
    └── (redirections)                     # voir 3.3
```

Les écrans de réglages se répartissent selon le niveau de la donnée qu'ils administrent.
`members` administre des appartenances d'établissement : il passe sous `admin/`. Les six autres
administrent du référentiel de service : ils restent sous le service. Ce découpage suit les
permissions déjà écrites dans `habilitations.md` ; aucune permission n'est redéfinie ici.

### 3.2 Gardes

| Route | Garde |
|---|---|
| `_authenticated.tsx` | session ; sinon `/auth`. Ne dérive plus aucun contexte. |
| `_authenticated/index.tsx` | redirige vers le contexte par défaut (4.2) ; aucun couple accessible → `/pending`. |
| `e/$establishmentId/admin.tsx` | le couple `(établissement)` figure dans les appartenances **avec le rôle ADMIN** ; sinon `choose-context`. |
| `e/$establishmentId/s/$serviceId.tsx` | le couple `(établissement, service)` figure dans les appartenances ; sinon `choose-context`. |
| `_settings.tsx` | au moins une des six permissions de réglages de service ; sinon l'index du service. |
| chaque écran de réglages | sa propre permission, en `beforeLoad` et non seulement au rendu. |

Aujourd'hui, six des sept écrans de réglages ne se gardent qu'au rendu, par un `Navigate`. Cette
étape porte chacun en `beforeLoad`, comme `planning.tsx` le fait déjà : une garde au rendu laisse
partir les requêtes du chargeur avant de rediriger.

### 3.3 Anciennes URLs

`/dashboard`, `/agenda`, `/suivi`, `/patient`, `/patient/$patientID` et `/settings/*` sont
conservées et redirigent vers leur équivalent dans le contexte par défaut, paramètres de
recherche conservés. Elles restent **définitivement**, pas le temps d'une dépréciation : elles
coûtent un fichier de trois lignes chacune et protègent les liens que les utilisateurs ont mis en
favori depuis des mois. Une redirection ne devine jamais le service : elle applique la règle du
contexte par défaut (4.2).

## 4. Résolution du contexte

### 4.1 Source

Le couple est lu dans les paramètres de route par le layout correspondant, validé contre l'arbre
des appartenances du store d'authentification, puis **écrit dans le store** en `beforeLoad`. Les
deux fabriques d'URL continuent de lire le store : elles ne changent pas de code, seulement de
fournisseur.

L'écriture se fait en `beforeLoad` du layout, donc avant tout chargeur et tout rendu d'enfant.
C'est la seule position qui garantisse qu'aucune requête ne parte avec le contexte précédent.

Le layout d'établissement pose un contexte **sans service** (`serviceId: null`,
`serviceRole: null`). Le store et les fabriques doivent l'accepter : `establishmentApiUrl()`
fonctionne sans service, `tenantApiUrl()` lève, comme aujourd'hui, si on l'appelle sans.

### 4.2 Contexte par défaut

Dans l'ordre : le dernier contexte visité s'il figure toujours dans les appartenances, sinon le
premier couple de l'arbre, sinon aucun et la personne tombe sur `/pending`.

Le dernier contexte visité est retenu dans `localStorage` sous une clé **portant l'identifiant de
l'utilisateur**, pour qu'un poste partagé ne propose pas à l'un le contexte de l'autre. Il est
écrit par le layout de service, jamais par celui d'établissement.

### 4.3 Contexte devenu invalide

Un couple absent des appartenances — favori périmé, affectation retirée entre deux sessions —
redirige vers `choose-context`, jamais vers une erreur. Un `404` reçu du back sur une route de
tenant alors que le contexte paraissait valide redirige lui aussi vers `choose-context` : le back
fait foi, et cette réponse signifie que l'arbre des appartenances du front est périmé. Ce cas
déclenche au passage un rechargement de `/me`.

### 4.4 `/me` au chargement

L'étape 1 a laissé un défaut que cette étape corrige : **rien ne rafraîchit l'utilisateur au
chargement de l'application**. Le store persisté fait foi jusqu'à la connexion suivante, si bien
qu'une affectation accordée ou retirée n'apparaît qu'après une déconnexion. Le contexte devenant
choisi, ce n'est plus tenable.

`_authenticated.tsx` charge donc `/me` au montage et met le store à jour. Le contexte n'est pas
dérivé de cette réponse — il vient de l'URL — mais l'arbre des appartenances contre lequel les
gardes valident, si.

## 5. Ne jamais montrer la donnée d'un autre service

Trois surfaces retiennent de la donnée entre deux contextes. Chacune reçoit un mécanisme qui
s'applique en entier ou pas du tout.

### 5.1 Cache de requêtes

Les clés de requête sont aujourd'hui écrites à la main, sans préfixe de tenant, sur quatre-vingts
appels. Les préfixer toutes serait quatre-vingts occasions d'en oublier une, et une seule suffit à
montrer les patients du service A dans le service B.

Décision : **vider le cache au changement de contexte**, et ne pas toucher aux clés. Un seul
point d'application, impossible à appliquer à moitié. Concrètement, à tout changement du couple :
annuler les requêtes en vol puis vider le client de requêtes. L'annulation précède le vidage,
faute de quoi une réponse en vol réécrirait dans le cache qu'on vient de vider.

Le coût est un rechargement complet à chaque changement de contexte. C'est une opération rare,
et ce coût est le prix de la garantie.

### 5.2 Stores Zustand

Cinq stores retiennent des identifiants propres à un service sans les qualifier :
`useSoignantStore` (soignants sélectionnés), `useDashboardFilterStore` (modèles de parcours
sélectionnés), `useTodoStore` (tâches vues), `useDiagnosticStore` et
`useDiagnosticTemplateStore` (élément sélectionné), auxquels s'ajoute `usePathwayTemplateEditStore`
(édition en cours) et `usePlanningStore` (dates affichées).

Deux traitements, selon que le store est persisté ou non, et **pas les deux à la fois** :

- **Non persisté** (`useDiagnosticStore`, `useDiagnosticTemplateStore`,
  `usePathwayTemplateEditStore`) : réinitialisé au changement de contexte. Ces stores portent une
  sélection ou une édition en cours, qui n'a aucun sens dans un autre service.
- **Persisté** (`useSoignantStore`, `useDashboardFilterStore`, `useTodoStore`,
  `usePlanningStore`) : la clé de stockage inclut le service. Le changement de contexte n'efface
  alors rien, il change de tiroir — un retour dans un service y retrouve ses réglages. Les
  réinitialiser **et** les indexer par service serait contradictoire : l'indexation suffit, et
  elle préserve le confort d'usage.

Les réinitialisations sont déclenchées depuis un point central, le même que celui qui vide le
cache, et non dispersées dans chaque store.

`useCartStore` est un reliquat de démonstration sans rapport avec le métier. Il est supprimé.

### 5.3 Permissions à l'écran

`useCan` lit déjà le contexte du store et ne change pas. Ses quinze usages non plus. Le back
reste seul garant ; l'écran ne fait que cacher ce qui serait refusé.

## 6. Sélecteur

Sélecteur combiné « Établissement › Service » dans la barre de navigation, dans le bloc du logo,
à gauche. Affiché seulement si l'utilisateur a plus d'un couple accessible — la très grande
majorité n'en a qu'un et ne doit pas voir apparaître une commande sans objet.

Changer de contexte navigue vers **la même page dans le nouveau contexte si la route y existe**,
sinon vers l'index du service. Une fiche patient précise ne survit pas au changement : elle
appartient à un service, et l'étape 3 seule saura ce qu'un même patient devient dans un autre
service. Le sélecteur navigue donc vers l'index dans ce cas.

`choose-context.tsx` présente la même liste en pleine page, groupée par établissement, pour
l'arrivée et pour les cas de la section 4.3.

## 7. Travaux côté back

L'architecture annonce l'étape 2 comme « front seul ». Elle ne peut pas l'être tout à fait : les
écrans d'administration vivent sous une URL sans service, et trois points reportés de l'étape 1
appartiennent ici.

### 7.1 Contexte d'établissement sans service

Le back sait déjà résoudre un contexte d'établissement seul — `resolveEstablishmentAdmin` le pose
avec `serviceId: null`. Ce qui manque est côté front, traité en 4.1. Le back n'a donc rien à
changer pour ce point ; il est cité pour clore le report.

### 7.2 Contrôle des inclusions étendu aux modèles de tenant

Le garde-fou Prisma ne descend dans les `include` que depuis un modèle **global**. Une lecture
partant d'un modèle d'établissement et incluant un modèle de service n'est pas contrôlée —
c'était la cause de la fuite trouvée à l'étape 1 sur les problèmes d'inscription, corrigée alors
à la main, repository par repository. L'étape 3 va créer exactement cette forme de lecture, du
patient vers son sous-dossier. Le contrôle est donc étendu maintenant, avant d'en avoir besoin.

### 7.3 Un administrateur ne peut plus se rétrograder

`MembershipDomain.update` empêche déjà un administrateur de retirer ses propres services. Il ne
l'empêche pas de passer son propre rôle d'établissement à `MEMBER` et de perdre `members:manage`.
Même règle, même endroit, même forme de refus.

Conséquence à tirer dans le même geste : le garde ajouté à l'étape 1, qui refuse à un
administrateur de vider sa propre liste de services, avait pour seule raison qu'il se serait
retrouvé sans aucun écran accessible. Cette étape lui donne les écrans d'administration sous une
URL sans service ; **ce garde perd donc sa raison d'être et disparaît**, avec le test qui le
verrouillait. Le garde sur l'auto-rétrogradation le remplace, et lui protège quelque chose de
réel : la perte du droit de se rétablir.

### 7.4 Seed

Le seed crée aujourd'hui un établissement et un service. Il en crée deux, avec un utilisateur
membre des deux et un utilisateur membre d'un seul, afin que le sélecteur et le cloisonnement
soient vérifiables sans manipuler la base à la main. Le seed est déjà paramétré par tenant, ce
qui rend l'ajout mécanique.

## 8. Tests

- **Unitaires** : résolution du contexte depuis les paramètres de route contre un arbre
  d'appartenances (couple valide, service absent, établissement absent, rôle insuffisant pour
  `admin`) ; contexte par défaut (dernier visité valide, dernier visité périmé, aucun) ;
  réinitialisation des stores.
- **End-to-end back** : le garde-fou refuse une lecture incluant un modèle de service depuis un
  modèle d'établissement sans filtre ; un administrateur ne peut pas se rétrograder.
- **Le test qui compte** : un utilisateur membre de deux services charge une liste dans le
  premier, change de contexte, et la liste du second ne contient aucune ligne du premier — ni à
  l'écran, ni dans le cache. Ce test doit devenir rouge si l'on retire le vidage de cache de la
  section 5.1. Il est la raison d'être de cette étape ; il s'écrit avant le mécanisme.

Le front n'a aujourd'hui **aucun harnais de test**. C'est ce qui a laissé passer, à l'étape 1, le
défaut de l'état persisté. L'étape installe donc Vitest et Testing Library, et les tests
unitaires ci-dessus sont les premiers à s'en servir.

## 9. Critère de sortie

Un utilisateur membre de deux services passe de l'un à l'autre depuis la barre de navigation, et
ne voit jamais de donnée de l'autre. Une URL partagée ouvre le bon service. Un utilisateur d'un
seul service ne voit aucune différence avec aujourd'hui, sélecteur compris. Un administrateur
atteint l'écran Membres sans passer par un service.
