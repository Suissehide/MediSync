# Vérification manuelle de l'étape 4a — et ce qui devient enfin vérifiable des étapes 2 et 3

Procédure à exécuter à la main contre le serveur de développement (port **4270**). Ce document ne
remplace pas les portes automatisées — il vérifie ce qu'elles ne peuvent pas vérifier : ce qu'un
compte voit réellement à l'écran.

Il a deux parties, et la seconde est le vrai enjeu :

1. **la procédure propre à l'étape 4a** — ce que l'administration permet désormais de faire ;
2. **le verdict, point par point, sur `verification-etape-2.md` et `verification-etape-3.md`** —
   deux procédures qui **n'ont jamais été exécutées**, ni l'une ni l'autre.

## ⚠ Une correction qu'il faut faire d'emblée, parce qu'elle change la lecture de tout ce qui suit

Il a été dit, pendant ce chantier, que les deux vérifications en attente étaient inexécutables
« faute d'un moyen de créer les comptes nécessaires ». **C'est faux pour la quasi-totalité de
leurs points, et il vaut mieux le dire que de laisser croire que l'étape 4a débloque plus qu'elle
ne débloque.**

Vérifié dans le dépôt : `back/prisma/seed/user.ts` crée déjà les trois comptes que les deux
procédures nomment (`admin@qwetle.fr`, `sabrina.bernadet@cepta.fr`,
`secretariat.cardiologie@cepta.fr`), et `back/prisma/seed.ts` crée déjà un établissement **à deux
services** (Cardiologie, Pneumologie) avec, depuis l'étape 3, deux listes de patients disjointes.
Les deux procédures comptent **seize points au total** (huit chacune) : sur le seed, **quinze
étaient déjà exécutables avant l'étape 4a**, et le seizième — le point 7 de l'étape 2 — ne l'était
qu'à moitié. Ce qui les a bloquées, ce n'est donc pas un manque d'outillage : c'est que **personne
ne les a lancées** — aucun agent de ce chantier ne se connecte à l'application.

Ce que l'étape 4a apporte réellement est plus étroit, et plus intéressant :

- **un point précis devient exécutable**, celui que `verification-etape-2.md` déclarait lui-même
  « non couvrable avec les comptes actuels du seed » (point 7 : un administrateur d'établissement
  **sans aucune** affectation de service) ;
- **et surtout, les deux procédures deviennent rejouables contre un second établissement construit
  de zéro**, au lieu du seul arbre du seed — ce qui est le critère de sortie de la cible et la
  seule façon de prouver que le cloisonnement tient entre deux établissements réels, pas entre
  deux services du même arbre pré-fabriqué.

---

# Partie 1 — La procédure de l'étape 4a

## Préalable : obtenir un super-admin

Aucune route n'écrit `User.isSuperAdmin`, et le seed n'en crée aucun (vérifié : le drapeau
n'apparaît nulle part dans `back/prisma/seed/`). Le script promeut un compte **qui existe déjà**.

```shell
cd back && npm run bootstrap:super-admin -- admin@qwetle.fr
```

**Attendu** : `OK — admin@qwetle.fr est maintenant super-admin.` Relancer la même commande doit
répondre `… était déjà super-admin et actif : rien à faire.`

*Remarque* : promouvoir `admin@qwetle.fr` en fait un compte **à la fois** super-admin et
administrateur/coordinateur du seed. C'est pratique pour dérouler vite, mais cela masque un
comportement : à la racine, un compte qui a une vraie appartenance y atterrit d'abord, et
n'arrive sur `/super-admin` que par la barre latérale. Pour observer le comportement d'un
super-admin **pur**, promouvoir plutôt un compte inscrit par l'inscription publique et sans aucun
rattachement.

1. **Un super-admin sans aucune appartenance atterrit sur `/super-admin`, pas sur l'écran
   d'attente.** Se connecter avec un compte promu et dépourvu de tout rattachement. **Attendu** :
   l'application arrive directement sur la liste des établissements, avec la barre latérale et
   son entrée « Super-administration ». **Ne doit PAS** afficher « compte en attente
   d'approbation » : c'était le défaut le plus embarrassant du chantier (l'écran que tout le
   chantier existe pour servir n'était atteignable qu'en tapant l'URL à la main).

2. **Un compte ordinaire ne sait pas que la zone existe.** Se déconnecter, se connecter avec
   `sabrina.bernadet@cepta.fr`, saisir `/super-admin` dans la barre d'adresse. **Attendu** :
   exactement le même écran « Not Found » qu'une URL inventée (`/nimporte-quoi`) — **pas** une
   redirection silencieuse, **pas** un message « accès refusé ». Comparer les deux écrans
   côte à côte : ils doivent être indiscernables.

3. **La liste des établissements et ses compteurs.** De retour en super-admin, onglet
   « Établissements ». **Attendu** : une ligne par établissement, avec nom, date de création,
   actif ou non, premier administrateur, nombre de services, nombre de comptes, date du dernier
   accès et **nombre de dossiers**. Les identifiants sont copiables. **Aucun nom de patient nulle
   part** : le nombre de dossiers est une donnée agrégée assumée (`decisions-etape-4a.md`, D3), une
   identité ne l'est pas.

4. **Le détail d'un établissement.** Ouvrir la ligne. **Attendu** : ses services, ses membres
   (avec noms et rôles — c'est voulu, un nom de collègue n'est pas une donnée de santé) et son
   journal d'activité. **Vérifier qu'aucun champ de patient n'apparaît**, y compris dans le
   journal.

5. **La recherche de comptes.** Onglet « Comptes », saisir l'adresse d'un compte connu.
   **Attendu** : ses rattachements avec le nom de chaque établissement, ses rôles, sa
   désactivation éventuelle, son dernier accès. Saisir une adresse inconnue : refus explicite.

6. **L'octroi temporaire, et sa moitié comptable.** Depuis le détail d'un établissement dont le
   super-admin n'est **pas** membre, créer un octroi avec un motif. **Attendu** : l'établissement
   apparaît immédiatement dans le sélecteur de contexte, et ses écrans s'ouvrent comme pour un
   administrateur réel. Puis **se connecter en tant qu'administrateur de cet établissement** et
   ouvrir son onglet « Accès temporaires » : l'octroi doit y figurer, **avec son motif et le nom
   de son auteur**. C'est la moitié sans laquelle le mécanisme ne vaut rien.
   Vérifier aussi qu'un motif vide est refusé, et qu'une durée de 48 heures est **refusée** (et
   non silencieusement ramenée à 24).

7. **L'octroi ne se révoque que depuis la session qui l'a créé — et l'écran le dit.** Sur le
   détail de l'établissement octroyé, **recharger la page**. **Attendu** : le bandeau « accès
   actif » reste affiché, accompagné de « révocation indisponible depuis cette session ». **Le
   bandeau ne doit jamais disparaître au point de laisser croire qu'il n'y a aucun octroi actif** :
   c'est la condition explicite posée à ce compromis (`decisions-etape-4a.md`, D27).

8. **Créer un service, et constater le rattachement automatique.** En tant qu'administrateur
   **réel** d'un établissement, onglet « Services », créer un service. **Attendu** : il apparaît
   dans la liste, et le créateur en devient **coordinateur** — donc le service apparaît dans son
   sélecteur de service. Le renommer, vérifier que le nouveau nom apparaît partout.

9. **Désactiver un service avertit avec deux chiffres qui ne disent pas la même chose.** Sur un
   service qui suit des patients, cliquer « Désactiver ». **Attendu** : la confirmation annonce
   deux nombres distincts — combien de patients ce service suit, et combien **ne sont suivis
   nulle part ailleurs**. Le second est celui qui décide : ces personnes disparaîtront de toutes
   les listes. **Vérifier qu'ils sont bien étiquetés dans le bon sens** : c'est exactement
   l'erreur qui a été trouvée deux fois pendant ce chantier, une fois côté back (le compteur
   sous-estimait : l'écran annonçait 1 pour 2) et une fois côté test du front (les deux libellés
   échangés laissaient neuf tests verts).
   Puis **réactiver** le service : tout doit revenir — patients, sous-dossiers, membres avec leurs
   rôles distincts.

10. **Créer un compte de membre, et son lien de première connexion.** Onglet « Membres », « Créer
    un compte ». **Attendu** : le lien s'affiche **une seule fois**, dans la fenêtre. Le noter.
    Fermer puis rouvrir la fenêtre : le lien **ne doit pas réapparaître**.
    **Vérifier ensuite qu'il n'a fuité nulle part** : ouvrir la console du navigateur et l'onglet
    Réseau, et chercher le jeton. Il doit apparaître **uniquement** dans le corps d'un `POST`,
    jamais dans une URL, jamais dans une ligne de journal.

11. **Consommer le lien.** Ouvrir `/auth/access-link?token=<le jeton>` **dans une fenêtre de
    navigation privée** (pas de session). **Attendu** : un formulaire qui demande l'adresse et un
    nouveau mot de passe, puis une connexion automatique. Vérifier ensuite **le cinquième canal**,
    celui qu'on a failli manquer : appuyer sur « précédent ». Le jeton **ne doit pas réapparaître
    dans la barre d'adresse**, et le formulaire ne doit pas se réarmer.
    Rouvrir la même URL : **attendu**, lien invalide — l'usage est unique.

12. **Un établissement ne peut rien faire à un super-admin.** En tant qu'administrateur
    d'établissement, tenter de rattacher, de créer un compte pour, ou de réémettre un lien vers
    l'adresse du super-admin. **Attendu** : refusé, avec un message **indiscernable** de celui
    renvoyé pour une adresse inconnue — la route ne doit pas devenir un détecteur de super-admins.
    Tenter de désactiver un membre qui est super-admin : refusé, avec un message **explicite**
    cette fois (la cible est déjà visible dans la liste, il n'y a rien à cacher).

13. **La soupape.** En tant que super-admin, onglet « Comptes », rechercher un compte membre de
    **deux** établissements et réémettre son lien. **Attendu** : le lien est émis — c'est la seule
    autorité qui traverse légitimement les établissements, et sans elle un tel compte qui perd son
    mot de passe n'aurait aucun recours.
    **À savoir en le faisant** : cette action **n'écrit aucune ligne de journal et n'émet aucun
    événement**. Elle n'apparaîtra dans aucun écran. Voir `decisions-etape-4a.md`, « Ce qui reste
    ouvert ».

---

# Partie 2 — Verdict point par point sur les deux vérifications en attente

Légende :

- **✅ jouable** — exécutable aujourd'hui, et déjà exécutable avant l'étape 4a (sur le seed).
- **🆕 débloqué par 4a** — n'était pas exécutable avant.
- **⚠ jouable avec une réserve** — exécutable, mais quelque chose est à savoir avant.

## `verification-etape-2.md` — huit points

| # | Point | Verdict | Par quel chemin |
|---|---|---|---|
| 1 | Compte à un seul service : aucun sélecteur | ✅ jouable | Seed, `sabrina.bernadet@cepta.fr`. |
| 2 | Compte à deux services : le sélecteur apparaît, changer de service recharge l'écran | ✅ jouable | Seed, `admin@qwetle.fr`. |
| 3 | Panneau « Mes tâches » après un changement de service | ✅ jouable | Seed : deux tâches par service, citant chacune un patient propre. |
| 4 | Filtres de soignants persistés par service | ✅ jouable | Seed, tableau de bord. |
| 5 | Anciennes URL redirigées, chaîne de recherche conservée | ✅ jouable | N'importe quel compte connecté. |
| 6 | URL d'un service auquel on n'appartient pas → `/choose-context` | ✅ jouable | Seed : Sabrina + l'identifiant de Pneumologie. |
| 7 | Administrateur atteignant l'écran Membres sans passer par un service | ✅ pour la première moitié — **🆕 pour la seconde** | Voir ci-dessous. |
| 8 | Déconnexion / reconnexion : le dernier service visité est retrouvé | ✅ jouable | Seed, `admin@qwetle.fr`. |

**Le point 7 est le seul que l'étape 4a débloque réellement, et il le débloque complètement.** Sa
seconde moitié était explicitement marquée « point complémentaire recommandé, **non couvrable avec
les comptes actuels du seed** (tous ont au moins un service) » : un administrateur d'établissement
**sans aucune** affectation de service doit atterrir sur l'écran Membres depuis l'index et depuis
`/choose-context`, pas sur l'écran d'attente. C'est le scénario exact corrigé à l'étape 2 (D15).

**Ce n'est plus un compte à fabriquer à la main : c'est désormais l'état NORMAL d'un premier
administrateur.** Le chemin, de bout en bout :

1. obtenir un super-admin (préalable de la partie 1) ;
2. créer un établissement et son premier administrateur — **par un appel HTTP, il n'y a pas
   d'écran** (voir la réserve ci-dessous) ;
3. ouvrir le lien rendu par cet appel, poser un mot de passe, être connecté ;
4. **observer** : ce compte a `ADMIN` sur un établissement et **aucun service**. L'index doit le
   rediriger vers `/e/:establishmentId/admin/members`. S'il atterrit sur `/pending`, c'est la
   régression que le point 7 existe pour attraper.

**⚠ La réserve de l'étape 2 : créer un établissement n'a pas d'écran.** La route existe, le front
non (le code correspondant a été retiré comme code mort, non testé, et parce que son type portait
un second jeton en clair qu'aucune garde ne surveillait). Il faut donc, connecté en super-admin,
un appel authentifié :

```
POST /super-admin/establishments
{ "name": "<nom>", "email": "<adresse du premier administrateur>",
  "firstName": "<optionnel>", "lastName": "<optionnel>" }
```

La réponse porte l'établissement créé et `accessLink.token` — **le jeton en clair, rendu une seule
fois**. Ne le recopier nulle part : il ouvre `/auth/access-link?token=…`.

## `verification-etape-3.md` — huit points

| # | Point | Verdict | Par quel chemin |
|---|---|---|---|
| 1 | Deux services, deux listes de patients réellement différentes | ✅ jouable | Seed : 10 en Cardiologie, 6 en Pneumologie, zéro recouvrement. |
| 2 | La fiche patient affiche deux blocs nommés et séparés | ✅ jouable | Seed, Claire Martin. |
| 3 | Le secrétariat voit le sous-dossier moins trois champs cliniques | ✅ jouable | Seed, `secretariat.cardiologie@cepta.fr`, Pierre Bernard. |
| 4 | Un sous-dossier d'un service reste inatteignable depuis l'autre | ✅ jouable | Seed, `admin@qwetle.fr`. |
| 5 | Rechercher une identité ne révèle que l'identité | ✅ jouable | Seed, « Nadia ». |
| 6 | Rattacher une identité crée un sous-dossier vide et allume le signal, dans les deux sens | ⚠ jouable, **irréversible** | Seed. Aucun écran ne retire le sous-dossier créé : rejouer ce point exige de re-seeder. |
| 7 | Créer un patient sans parcours l'affiche immédiatement dans la liste | ✅ jouable | Seed. |
| 8 | Compte à un seul service, accès clinique complet | ✅ jouable | Seed, `sabrina.bernadet@cepta.fr`. |

**Aucun point de `verification-etape-3.md` n'était bloqué par l'absence d'administration, et aucun
ne l'est aujourd'hui.** Les huit reposent sur des données et des comptes que le seed fournit déjà.
Dire autre chose serait inventer un mérite à cette étape.

**Ce que l'étape 4a change quand même pour eux, et c'est substantiel** : ces huit points peuvent
désormais être rejoués sur un **second établissement construit entièrement depuis l'interface**,
avec ses propres services, ses propres comptes et ses propres patients — c'est-à-dire dans la
configuration que le cloisonnement multi-établissement existe pour protéger, et qu'aucun jeu
d'essai pré-fabriqué ne peut simuler honnêtement. Le point 4 en particulier (« un sous-dossier
d'un service reste inatteignable depuis l'autre ») change de portée quand les deux services
appartiennent à deux **établissements** différents.

## Le critère de sortie de la cible, et où il tombe exactement

La cible fixait : « un second établissement se crée et se peuple **entièrement depuis
l'interface, sans accès à la base** ». Voici ce qui est vrai, marche par marche.

| Marche | Depuis l'interface ? |
|---|---|
| Poser le drapeau `isSuperAdmin` | **Non** — script en ligne de commande, délibérément (`decisions-etape-4a.md`, D16). |
| Créer l'établissement et son premier administrateur | **Non** — la route existe, l'écran n'existe pas. |
| Poser le mot de passe du premier administrateur | **Oui** — `/auth/access-link?token=…`. |
| Créer les services | **Oui**, et le créateur en devient coordinateur. |
| Créer les comptes de membres et leurs liens | **Oui**, une affectation de service à la création. |
| Affecter un membre à un **second** service | **Non** — l'écran Membres vit sans service en contexte, sa commande de rôle de service y est désactivée. La route l'accepte pourtant. |
| Créer les soignants, lieux, thématiques, gabarits de parcours | **Oui** — écrans antérieurs. |
| Créer les patients et leurs dossiers | **Oui** — écrans antérieurs, sous le service. |
| Désactiver un service, un compte | **Oui**, avec l'avertissement chiffré. |

**Le critère de sortie n'est donc pas atteint au pied de la lettre : il reste deux appels hors
interface (le script d'amorçage, l'appel de création d'établissement) et une affectation
impossible à l'écran.** Le premier est un choix assumé et défendable ; les deux autres sont des
manques. Le deuxième est un travail de front d'une taille modeste (la route, ses types et son
schéma existent) ; le troisième est décrit dans `decisions-etape-4a.md`, « Ce qui reste ouvert ».

## Ce qu'aucune de ces procédures ne couvre, et qu'il ne faut pas croire couvert

- **Aucune traçabilité à l'échelle de la plateforme.** La réémission d'un lien par le super-admin
  et les lignes de journal du script d'amorçage n'apparaissent dans aucun écran. Rien, dans ces
  procédures, ne peut le constater — il n'y a rien à regarder. C'est le sujet de l'étape 4b.
- **`GET /patient` rend encore les patients de tout l'établissement**, sans filtre de service.
  C'est la liste servie par la route, pas celle affichée par l'écran des patients (qui, elle,
  filtre bien par sous-dossier du service courant). Un contrôle à l'œil ne le verra donc pas :
  il faut regarder la réponse réseau.
- **La course sur l'émission simultanée de liens** ne se constate pas à la main : elle suppose
  deux émissions au même instant pour le même compte.
- **Les écrans qui ne montrent aucune différence entre deux services avec les données du seed**
  restent ceux que `verification-etape-2.md` énumère (planning, suivi, thématiques, gabarits,
  soignants, lieux, modèles de diagnostic, journal). Sur un établissement construit à la main, ils
  deviennent discriminants — à condition d'y avoir saisi des données différentes de part et
  d'autre.
</content>
