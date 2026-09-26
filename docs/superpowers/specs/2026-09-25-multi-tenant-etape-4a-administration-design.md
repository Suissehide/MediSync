# Étape 4a — Administration : établissements, services, comptes

**Date** : 2026-09-25
**Étape précédente** : `2026-09-24-multi-tenant-etape-3-dossier-patient-design.md`, fusionnée le 2026-09-25 (merge `a13046b`)
**Cible** : `2026-09-22-multi-tenant-architecture-design.md`, étape 4
**Habilitations** : `docs/multi-tenant/habilitations.md` fait foi

## 1. Pourquoi l'étape 4 se coupe en deux

La cible décrit une étape 4 unique : administration **et** traçabilité des consultations. Le
relevé montre que ce sont deux chantiers sans rapport.

Le critère de sortie que la cible fixe — « un second établissement se crée et se peuple
entièrement depuis l'interface, sans accès à la base » — ne concerne que l'administration. La
traçabilité des consultations (`PatientAccessLog`) touche d'autres routes, d'autres écrans, et
son enjeu est réglementaire ; la cible note d'ailleurs qu'elle est délibérément séparée du journal
d'activité existant pour des raisons de volume et de rétention.

**Cette spécification couvre 4a, l'administration.** `PatientAccessLog` fera l'objet de 4b.

L'ordre importe : 4a rend enfin possible ce que trois étapes ont préparé sans pouvoir le
démontrer. Tant qu'un établissement ne peut pas avoir deux services, le cloisonnement par service
ne se vérifie pas à l'écran, et les deux vérifications manuelles en attente
(`verification-etape-2.md`, `verification-etape-3.md`) ne peuvent pas s'exécuter.

## 2. Ce qui existe déjà, et qu'il ne faut pas reconstruire

Le relevé a montré plus d'acquis que la cible ne le laisse croire :

| Acquis | Où |
|---|---|
| Drapeau `User.isSuperAdmin`, remonté par `/me` | `me-mapper.ts` |
| `deactivatedAt` sur `User`, `Establishment`, `Service`, **et déjà appliqué** — un compte désactivé ne peut plus se connecter, les établissements et services désactivés sont filtrés de `/me` | `auth.domain.ts`, `me-mapper.ts`, `membership.repository.ts` |
| Gestion des membres d'un établissement : six routes, écran `admin/members` | `routes/members.ts` |
| Rattachement d'un compte **par adresse** (`addByEmail`) | `membership.domain.ts` |
| Permissions `services:manage`, `members:manage`, `establishments:manage` définies | `habilitations.md` |

Ce qui manque réellement : créer un **service**, créer un **établissement** et son premier
administrateur, créer un **compte** (aujourd'hui seule l'inscription publique le permet), et
désactiver depuis l'écran.

## 3. Les six décisions de métier, prises avec Léo

### 3.1 Le premier administrateur reçoit un lien, pas un mot de passe

La cible prévoyait que l'administrateur « peut aussi créer directement le compte avec un mot de
passe provisoire ». **Remplacé par un lien de première connexion à usage unique**, transmis à la
main — il n'existe aucune infrastructure de courriel dans l'application.

*Motif* : rien de secret ne transite ni ne se tape ; le lien expire et ne sert qu'une fois, un mot
de passe provisoire ne fait ni l'un ni l'autre.
*Coût si faux* : une table et une route publique de plus, là où un mot de passe provisoire n'en
demandait aucune.

L'inscription publique **reste ouverte** : la fermer imposerait de décider du sort des comptes
déjà inscrits sans rattachement, ce qui est un chantier à part.

### 3.2 Créer un service y rattache son créateur, comme coordinateur

*Motif* : la personne qui crée un service est déjà administratrice de son établissement, donc elle
peut de toute façon s'y affecter en un clic. Le rattachement automatique ne lui accorde **rien
qu'elle ne pouvait s'accorder** ; il lui épargne un détour et évite qu'un établissement neuf
commence par un cul-de-sac.
*Coût si faux* : un accès à des données de santé accordé par un geste d'administration plutôt que
par un geste explicite. Borné par le fait que le geste explicite était à un clic.

### 3.3 La liste du super-admin montre le nombre de dossiers

Colonnes : nom, date de création, actif ou non, premier administrateur, nombre de services, nombre
de comptes, date du dernier accès, **nombre de dossiers**. Identifiants copiables partout.

**Le nombre de dossiers est une donnée de santé agrégée** : il dit combien de personnes sont
suivies dans cet établissement. C'est la même forme de divulgation — par la cardinalité seule —
que celle fermée à l'étape 3 sur le comptage détourné (`decisions-etape-3.md`). Elle est ici
**assumée et bornée** : un nombre, jamais une identité, jamais un contenu.

*Motif* : juger de la taille réelle d'un établissement sans ouvrir aucun dossier.
*Coût si faux* : un compte qui n'a aucun accès aux dossiers connaît le volume d'activité de chaque
établissement.

### 3.4 Le super-admin voit tout sauf le contenu des dossiers

Comptes, rattachements, rôles, établissements, services, désactivations, journal d'activité,
derniers accès, et **tous les identifiants copiables — y compris ceux des patients**. Aucune
identité de patient, aucun contenu de dossier.

*Motif* : les ennuis réels de production sont des problèmes de contexte et d'habilitation, pas de
contenu. « Je ne vois plus mes patients » se diagnostique avec des rattachements et des dates.
Pour le reste, l'exploitant dispose de `psql`, qui est l'outil juste : il ne passe pas par le
navigateur, laisse une trace différente et relève de l'accès au serveur.
*Coût si faux* : une session de super-admin volée vaudrait la lecture de tous les dossiers de tous
les établissements, derrière un simple cookie et sans second facteur.

### 3.5 L'accès d'intervention est temporaire, motivé et visible

Le super-admin peut s'accorder l'accès à un établissement pour une durée courte, en le justifiant.
Pendant cette durée il est **un membre ordinaire** de cet établissement, avec le rôle de
coordinateur. **Quatre heures par défaut, vingt-quatre au maximum** : assez pour comprendre un
ennui et agir, trop peu pour qu'un octroi oublié devienne un accès permanent.

L'administrateur de l'établissement **voit ces octrois**, en cours et passés, avec leur motif.

*Motif* : s'accorder l'accès est légitime ; le faire sans que le responsable du dossier puisse le
savoir ne l'est pas. C'est la moitié comptable du mécanisme, et sans elle il ne vaut rien.
*Coût si faux* : un accès extérieur invisible de ceux qu'il concerne.

### 3.6 Désactiver un service avertit, plutôt que d'exiger un transfert

L'écran annonce, chiffres à l'appui, combien de patients le service suit et combien ne sont suivis
nulle part ailleurs — ceux-là deviendront invisibles de toutes les listes. L'administrateur décide
en connaissance de cause.

*Motif* : c'est réversible — réactiver le service rend tout — et exiger un transfert obligerait à
construire ce transfert, qui est une opération de santé et non un geste d'administration.
*Coût si faux* : des dossiers qui existent et que plus aucun écran ne montre, jusqu'à
réactivation.

**Le transfert d'un patient d'un service à l'autre n'existe pas et 4a ne le crée pas.**

## 4. Comment le super-admin accède — les trois chemins

C'est le cœur de cette étape, parce qu'elle se heurte à l'invariant posé à l'étape 3 : le
garde-fou d'ORM refuse toute opération sur un modèle de tenant sans contexte de tenant, y compris
depuis une racine globale (`decisions-etape-3.md`, tâche 9).

### 4.1 Le chemin ordinaire — aucune exception

Créer un établissement, créer un compte : `Establishment` et `User` sont des modèles **globaux**.
Le garde-fou les laisse déjà passer sans contexte. Rien à faire.

### 4.2 Le chemin de consultation — un troisième type de contexte, à liste déclarée

Les compteurs de la liste, la recherche d'un compte et ses rattachements, le journal d'activité
d'un établissement, et l'unique écriture du premier rattachement : tout cela porte sur des modèles
d'établissement, sans contexte de tenant.

`TenantStore` gagne un troisième type, `{ kind: 'superadmin' }`, à côté de `tenant` et `system`.
Il n'autorise **qu'une liste déclarée** de couples (modèle, opération) — tout le reste est refusé
comme aujourd'hui. La liste est tenue par un test de conformité au schéma, dans les deux
directions, comme les quatre tables existantes du garde-fou.

**Ce type n'est pas `runAsSystem`.** Le mode encadré retire l'exigence de filtre pour *toute*
opération ; il a exactement **deux** emplois en production, et un test surveille cette unicité en
en gardant la capacité et non le nom (`runAsSystem-unicite.test.ts`). Lui donner dix nouveaux
points d'appel tuerait cette propriété. Le type `superadmin` est au contraire une liste courte et
énumérable.

**Ce n'est pas non plus un second client Prisma sans garde-fou**, que la cible prescrivait (§6 de
`2026-09-22`). Un tel client accorde **tout** — lecture et écriture, tous modèles, tous
établissements — là où le besoin réel est court ; et s'il était un jour injecté dans le mauvais
dépôt, toute la protection disparaîtrait **en silence**, sans qu'aucun test ne rougisse. C'est la
forme de défaut que l'étape 3 a passé son temps à traquer. **Cette spécification s'écarte donc de
la cible sur ce point, délibérément.**

### 4.3 Le chemin d'intervention — aucune exception non plus

L'octroi temporaire ne crée **pas** de passage de faveur : pendant sa durée, le super-admin est un
membre ordinaire de l'établissement. Le garde-fou s'applique intégralement — mêmes filtres, mêmes
refus, même traçabilité. Il n'y a pas de « mode super-admin » qui verrait autrement.

**L'octroi est évalué à chaque requête, jamais matérialisé en rattachement réel.** La différence
est de sûreté : un rattachement qu'une tâche planifiée devrait venir retirer est un accès qui
**survit si la tâche ne tourne pas**, sans que personne le voie. Un octroi évalué à la lecture
expire tout seul, sans rien à exécuter.

## 5. Modèle de données

Deux tables neuves, une colonne — et les relations inverses que Prisma exige pour valider le
schéma, qui ne portent aucune donnée de tenant.

```prisma
model AccessLink {
  id        String    @id @default(cuid())
  userId    String
  tokenHash String    @unique
  createdBy String
  createdAt DateTime  @default(now())
  expiresAt DateTime
  usedAt    DateTime?

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
}

model SuperAdminAccessGrant {
  id              String    @id @default(cuid())
  userId          String
  establishmentId String
  reason          String
  grantedAt       DateTime  @default(now())
  expiresAt       DateTime
  revokedAt       DateTime?

  user          User          @relation(fields: [userId], references: [id], onDelete: Cascade)
  establishment Establishment @relation(fields: [establishmentId], references: [id])

  @@index([establishmentId, expiresAt])
  @@index([userId])
}
```

`AccessLink` stocke une **empreinte** du jeton, jamais le jeton : la table ne doit pas suffire à
fabriquer un accès. `usedAt` rend l'usage unique ; réémettre invalide les liens précédents du même
compte.

`SuperAdminAccessGrant` est un modèle **global** au sens du garde-fou — il traverse les
établissements par nature, et c'est lui qui décide du contexte plutôt que d'en dépendre.

Colonne ajoutée : `User.lastLoginAt DateTime?` — la date du dernier accès, que rien ne porte
aujourd'hui. `Establishment.createdAt` existe déjà (vérifié dans le schéma), il n'y a rien à y
ajouter.

## 6. Back

### 6.1 Le lien de première connexion

Émission par `establishments:manage` (premier administrateur) et par `members:manage` (membre d'un
établissement). Jeton aléatoire, **sept jours**, usage unique. Sept plutôt que deux : la
transmission est manuelle, et un appel qui n'aboutit pas un vendredi ne doit pas tout faire
recommencer le lundi.

Le lien s'affiche **une seule fois**, à la création. Il n'est pas récupérable ensuite ; on en
réémet un.

**Le jeton est un identifiant de connexion : il ne doit apparaître dans aucun journal.** Il passe
donc dans le **corps** d'une requête `POST`, jamais dans une URL — l'étape 3 a fermé cinq fuites de
cette forme, dont une qui recopiait la chaîne de requête dans les journaux applicatifs. Un test
garde cette propriété.

Le même mécanisme sert la **réinitialisation d'un accès oublié**, qui n'existe aujourd'hui par
aucun moyen. Compté dans 4a, sans rien construire de plus.

### 6.2 Routes

| Route | Permission | Ce qu'elle fait |
|---|---|---|
| `GET /super-admin/establishments` | `establishments:manage` | La liste et ses compteurs |
| `POST /super-admin/establishments` | `establishments:manage` | Crée l'établissement, le compte du premier administrateur, son rattachement et son lien |
| `GET /super-admin/establishments/:id` | `establishments:manage` | Services, membres, journal d'activité |
| `GET /super-admin/users?email=` | `establishments:manage` | Recherche d'un compte et ses rattachements |
| `POST /super-admin/users/:id/access-link` | `establishments:manage` | Réémet un lien |
| `POST /super-admin/grants` | `establishments:manage` | S'accorde un accès temporaire, motif obligatoire |
| `DELETE /super-admin/grants/:id` | `establishments:manage` | Révoque avant terme |
| `GET /e/:establishmentId/services` | `services:manage` | Liste, avec les compteurs de désactivation |
| `POST /e/:establishmentId/services` | `services:manage` | Crée, et rattache son créateur comme coordinateur |
| `PATCH /e/:establishmentId/services/:id` | `services:manage` | Renomme, désactive, réactive |
| `GET /e/:establishmentId/grants` | `members:manage` | Les octrois dont l'établissement a fait l'objet |
| `POST /e/:establishmentId/members/account` | `members:manage` | Crée un compte et son lien |
| `POST /auth/access-link/consume` | publique | Consomme un lien et pose le mot de passe |

Tout ce qui est sous `/super-admin` rend **404** à un compte sans le drapeau, jamais 403 : ne pas
révéler l'existence d'une zone qu'on n'a pas le droit de voir. C'est ce que la cible prévoit
(§5.2).

Mécaniquement : un crochet `requireSuperAdmin` posé sur le plugin, qui lève `Boom.notFound()` — la
même forme que le plugin de tenant emploie déjà pour un tenant inconnu. Et le plugin reprend le
crochet `assertRoutePermission` existant, qui **fait échouer le démarrage** si une de ses routes
oublie de déclarer sa permission : le dépôt a déjà ce garde-fou pour les routes de tenant et
d'administration, il n'y a rien à inventer.

### 6.3 Script d'amorçage

`npm run bootstrap:super-admin -- <email>` pose le drapeau sur une identité existante et écrit une
ligne dans le journal d'activité. Sans lui, personne ne peut créer le premier établissement.

## 7. Front

Sous `/super-admin`, trois écrans : la **liste des établissements** ; le **détail** d'un
établissement, avec ses services, ses membres, son journal et le bouton d'octroi ; la **recherche
d'un compte**, qui répond à « untel ne voit plus ses patients » et permet de lui réémettre un lien.

L'écran d'administration d'établissement existant gagne deux onglets : les **services** — créer,
renommer, désactiver avec l'avertissement chiffré, réactiver — et les **accès temporaires**
accordés à cet établissement, en cours et passés, avec leur motif.

L'onglet des membres existe ; il gagne la création de compte par lien à côté du rattachement par
adresse, et la désactivation.

Une page publique consomme le lien : elle demande un mot de passe, le pose, et connecte.

Les deux conventions du front s'appliquent sans exception : le contexte est implicite et vient de
l'URL ; les clés de requête ne portent pas le tenant. Une garde les tient déjà
(`conventions-tenant-api-queries.test.ts`).

## 8. Tests

Trois propriétés portent des **gardes**, pas des cas :

1. **Un compte sans le drapeau reçoit 404 partout sous `/super-admin`**, et non 403 — éprouvé
   route par route, pas sur un échantillon.
2. **Un octroi expiré ne donne plus rien**, sans qu'aucune tâche n'ait eu à tourner : l'épreuve
   avance l'horloge plutôt que d'attendre, et vérifie qu'un octroi révoqué avant terme ne donne
   rien non plus.
3. **Le lien n'apparaît dans aucun journal**, à aucun niveau de verbosité, ni dans le corps d'une
   réponse d'erreur.

Plus, dans la forme établie aux étapes précédentes : le type `superadmin` du garde-fou est tenu
par un test de conformité au schéma **dans les deux directions** ; un cas d'isolation vérifie
qu'un octroi sur l'établissement A ne donne rien sur B ; et chaque test nouveau est montré **rouge
sans son mécanisme** avant d'être compté.

## 9. Critère de sortie

Un second établissement se crée depuis l'interface, reçoit son premier administrateur par un lien,
se dote de deux services, y rattache des comptes, et rien de tout cela n'a demandé d'accès à la
base.

Et, en corollaire : les deux vérifications manuelles en attente deviennent exécutables.
