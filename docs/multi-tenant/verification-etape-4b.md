# Vérification manuelle de l'étape 4b (traçabilité des consultations)

Procédure à exécuter à la main contre le serveur de développement (front sur le port **4270**). Ce
document ne remplace pas les portes automatisées — il vérifie ce qu'elles ne peuvent pas vérifier :
**ce qu'un compte voit réellement à l'écran, et par quel chemin il y arrive**.

**Règle appliquée en écrivant cette procédure, et c'est le défaut exact que la revue finale de
l'étape 4a a trouvé dans ses propres documents de clôture** : *on n'envoie jamais l'opérateur faire
un appel HTTP à la main pour une action qui a un bouton.* Chaque point ci-dessous passe par
l'interface. Les **deux** endroits où un appel direct est proposé le sont parce qu'**aucun écran
n'existe** pour cette lecture — et c'est dit comme tel, à l'endroit où ça se produit, pas dilué.

**Ce que cette procédure n'a pas** : elle n'a **pas été exécutée**. Aucun agent de ce chantier ne se
connecte à l'application. Elle est écrite pour être déroulée par une personne, et le verdict de
chaque point est à reporter ici.

---

## Préalable

**Les comptes du seed suffisent pour la quasi-totalité de la procédure.** Vérifié :
`back/prisma/seed/user.ts` crée `admin@qwetle.fr`, `sabrina.bernadet@cepta.fr` et
`secretariat.cardiologie@cepta.fr`, et `back/prisma/seed.ts` crée un établissement à **deux
services** (Cardiologie, Pneumologie) avec deux listes de patients disjointes.

Trois rôles sont nécessaires, et **il faut savoir lequel a quoi** avant de commencer, sinon les
points 5 et 6 se lisent comme des pannes :

| Ce qu'il faut | Permission | Rôle qui la porte |
|---|---|---|
| Voir le bouton « Journal des accès » et l'écran de service | `consultations:read` | **COORDINATEUR** de service, et lui seul |
| Lire le journal à l'échelle de l'établissement (aucun écran, voir point 8) | `access-log:read` | **ADMIN** d'établissement |
| L'écran plateforme des deux journaux | aucune — le drapeau `User.isSuperAdmin` | super-admin |

Pour le super-admin, le script de l'étape 4a **promeut un compte qui existe déjà** :

```shell
cd back && npm run bootstrap:super-admin -- admin@qwetle.fr
```

**Attendu** : `OK — admin@qwetle.fr est maintenant super-admin.` (idempotent : relancer répond
`… était déjà super-admin et actif : rien à faire.`)

*Remarque, reprise de `verification-etape-4a.md`* : promouvoir `admin@qwetle.fr` en fait un compte à
la fois super-admin **et** membre du seed, ce qui est pratique pour dérouler vite mais masque le
comportement d'un super-admin pur. Sans importance ici : le point 9 ne dépend pas de l'atterrissage.

**Et un préalable propre à cette étape** : le journal est **vide** avant qu'on s'en serve. Les
premiers points de cette procédure **créent** les lignes que les suivants vérifient. Les dérouler
dans l'ordre.

---

## 1. Le serveur démarre — et c'est déjà une vérification

Lancer le back. **Attendu** : le démarrage aboutit, et dans les journaux, dans les premières
secondes, **deux** lignes de purge :

```
ActivityLog cleanup: 0 entrées supprimées
PatientAccessLog cleanup: 0 entrées supprimées
```

**Si le démarrage échoue en nommant une route**, ce n'est pas une panne : c'est l'un des garde-fous
de cette étape qui refuse de servir une route de lecture patient non déclarée. Le message dit quoi
faire ; le tableau complet est dans `deploiement-etape-4b.md`, §4.

**Si l'une des deux lignes de purge manque**, s'arrêter : rien d'autre ne signale une purge qui
n'écrit jamais (`deploiement-etape-4b.md`, §8).

## 2. Ouvrir un dossier laisse une trace — c'est la propriété centrale

Se connecter avec un **coordinateur** (`sabrina.bernadet@cepta.fr` sur le seed), entrer dans le
service Cardiologie, ouvrir la liste des patients, **cliquer sur un patient**.

Puis, sur la fiche du patient, cliquer le bouton **« Journal des accès »** (en haut à droite, à côté
des autres actions de la fiche, avec une icône d'historique).

**Attendu** : un écran « Journal des accès » avec un tableau, et **au moins une ligne** :

| Colonne | Valeur attendue |
|---|---|
| Date / Heure | l'instant où vous venez d'ouvrir la fiche |
| Auteur | **votre** nom |
| Action | **Dossier ouvert** |
| Service | **Cardiologie** — le nom, pas un identifiant |
| Origine | un accès **réel** (pas un octroi) |

**Ne doit PAS apparaître** : le nom du patient, sa date de naissance, une note, un diagnostic, un
critère d'export. Le journal dit *qui a regardé quoi et quand*, jamais *ce qui a été vu*.

**Et il ne doit pas y avoir de ligne pour la consultation du journal lui-même.** Recharger cet
écran, deux ou trois fois de suite. **Attendu** : le nombre de lignes **ne bouge pas**. Lire le
journal n'est pas consulter le dossier — sinon le journal grossirait à chaque fois qu'on le regarde,
jusqu'à noyer les accès de soin sous les accès d'audit (`decisions-etape-4b.md`, D9).

## 3. Les sous-dossiers comptent comme des consultations distinctes

Revenir sur la fiche du même patient. Ouvrir l'onglet **Diagnostic** (l'onglet n'est monté que
lorsqu'on le choisit : c'est un acte de consultation distinct de l'ouverture du dossier), puis
ouvrir un diagnostic s'il en existe un.

Revenir au **Journal des accès** du même patient.

**Attendu** : une ou plusieurs lignes supplémentaires, action **Sous-dossier ouvert**, à l'heure des
clics. Elles s'ajoutent à la ligne « Dossier ouvert » du point 2, elles ne la remplacent pas.

**Ce qui ne doit PAS ajouter de ligne** — à vérifier en revenant au journal après chaque geste :

- **revenir sur la liste des patients** (`GET /patient` n'est pas journalisée : voir le point 12) ;
- **utiliser la recherche de patients** ;
- l'affichage des parcours du patient, qui est appelé par l'écran du dossier **en même temps** que
  l'ouverture — le journaliser doublerait chaque ligne sans rien apprendre.

## 4. Un export laisse **une seule** ligne, avec son compte et ses critères

Depuis la liste des patients du service, appliquer un filtre (une recherche, ou une étiquette de
parcours), puis cliquer le **bouton d'export** — l'icône de téléchargement, à droite des filtres,
au-dessus de la liste. Laisser le fichier se télécharger.

Puis ouvrir le **Journal des accès** d'un patient quelconque du service… et constater qu'il n'y est
pas. **C'est normal** : l'export n'appartient à aucun dossier (il n'a pas de patient dans son URL),
donc il n'apparaît pas dans le journal d'un patient. Il s'observe sur **l'écran plateforme**
(point 9).

**Attendu, sur l'écran plateforme du super-admin, journal des consultations** : **une seule ligne**
pour cet export — action **Export**, votre nom, le service, et la colonne « Dossier (id) » **vide**.
Pas une ligne par patient exporté : une ligne par export.

> *Pourquoi ce point traverse deux écrans* : le nombre de dossiers rendus et les critères appliqués
> sont enregistrés (`decisions-etape-4b.md`, D2) mais ne sont affichés sur **aucun** des deux écrans
> — ni la colonne « nombre », ni la colonne « critères » n'existent. Ils sont en base et lisibles
> par une requête. **C'est une limite d'affichage, pas de traçabilité**, et elle est écrite ici
> plutôt que découverte.

## 5. Un rôle sans `consultations:read` ne voit **pas le bouton**, et n'atteint pas l'écran

Se déconnecter, se reconnecter avec un compte **SECRETARIAT** ou **LECTURE** du même service
(`secretariat.cardiologie@cepta.fr` sur le seed). Ouvrir la fiche du même patient.

**Attendu** :
1. **Le bouton « Journal des accès » est absent** de la fiche — pas grisé, pas présent-et-en-erreur :
   absent. Un lien vers un écran inaccessible est pire qu'une absence de lien.
2. Saisir malgré tout l'URL de l'écran dans la barre d'adresse
   (`/e/<etab>/s/<service>/patient/<id>/acces`). **Attendu** : redirection vers **le tableau de bord
   du service**, pas vers `/choose-context` — le contexte reste valide, c'est la permission qui
   manque.

**Et cette visite laisse-t-elle une trace ?** Revenir en coordinateur et rouvrir le journal du
patient. **Attendu** : l'ouverture de la fiche par le secrétariat au début de ce point **a bien créé
une ligne** (« Dossier ouvert », au nom du secrétariat) ; la tentative d'accès au journal, refusée,
**n'en a créé aucune** — une réponse en erreur n'est pas une consultation.

## 6. La colonne « Origine » distingue un accès de dépannage d'un accès de soin

C'est la colonne la plus importante de cet écran après l'auteur, et elle a failli n'exister pour
personne (`decisions-etape-4b.md`, D5).

En super-admin, s'accorder un **octroi temporaire** sur l'établissement : onglet
« Établissements » → ouvrir la ligne de l'établissement → le bouton d'octroi (motif **obligatoire**
et durée, mécanisme de l'étape 4a). Un bandeau « accès actif » doit apparaître. Puis, **sous cet
octroi**, entrer dans le service et ouvrir la fiche du **même patient** que le point 2.

Revenir en coordinateur, ouvrir le **Journal des accès** de ce patient.

**Attendu** : deux catégories de lignes visiblement distinctes dans la colonne **Origine** — les
vôtres et celles du secrétariat marquées comme accès **réels**, celle du super-admin sous octroi
marquée comme accès **par octroi**.

**Si les deux se ressemblent, c'est un défaut, pas un détail** : sans cette colonne, un accès de
dépannage est indiscernable d'un accès de soin, ce qui est exactement ce qu'un journal d'audit
existe pour empêcher.

## 7. Le cloisonnement entre établissements tient sur le journal aussi

Ce point a besoin d'un **second établissement**, et l'étape 4a donne le moyen de le construire de
zéro : en super-admin, onglet « Établissements » → créer un établissement, nommer son premier
administrateur, créer un service, rattacher un compte, créer un patient.

Dérouler alors, dans le second établissement, le point 2 en entier (ouvrir un dossier, ouvrir son
journal).

**Attendu** : le journal du patient de l'établissement **B** ne montre **que** les accès faits dans
B. Revenir dans A : le journal d'un patient de A ne montre **que** ceux de A. Aucune ligne ne
traverse.

> *Ce point est aussi tenu automatiquement* — `back/src/test/e2e/isolation.test.ts`, « un
> administrateur de A ne voit pas la ligne de B, meme en visant son propre etablissement avec l
> identifiant du patient de B ». Il est répété ici parce que la borne **n'était pas tenue de bout en
> bout** avant le tour de correction de la tâche 5 : retirer `establishmentId` du `where` laissait
> alors les 234 tests e2e verts.

## 8. La lecture à l'échelle de l'établissement — **aucun écran n'existe**

**C'est le seul point de cette procédure qui n'a pas de chemin d'interface, et c'est une limite, pas
une commodité de rédaction.**

Vérifié dans le dépôt en écrivant ce document : la route
`GET /e/:establishmentId/admin/patients/:patientID/acces` existe, exige `access-log:read`, est
éprouvée en e2e et en isolation — **et le front ne l'appelle nulle part**
(`front/src/api/`, `front/src/routes/_authenticated/e/$establishmentId/admin/` : aucun appel, aucun
écran). Elle n'est donc atteignable que par appel direct.

Depuis une session ouverte en **ADMIN d'établissement** (le cookie de session porte l'autorisation),
dans la console du navigateur :

```js
await fetch('/api/e/<etablissementId>/admin/patients/<patientId>/acces', { credentials: 'include' })
  .then(r => [r.status, r.json()])
```

**Attendu** : `200`, et **toutes** les lignes du patient **tous services confondus** de
l'établissement — là où l'écran du point 2 ne montre que celles du service courant. Si le patient est
suivi en Cardiologie **et** en Pneumologie, les deux apparaissent.

**Refaire le même appel depuis une session de simple membre** (non ADMIN). **Attendu** : **404**, pas
403 — la zone d'administration ne révèle pas son existence.

**Verdict à reporter** : cette route est prête et gardée ; **il manque l'écran**. Tant qu'il
n'existe pas, un administrateur d'établissement ne peut pas voir la vue consolidée de son
établissement depuis l'application.

## 9. L'écran plateforme du super-admin : les deux journaux, un à la fois

Se connecter en super-admin. Dans la barre de navigation de la super-administration, cliquer
**« Journal des accès »**.

**Attendu, à l'arrivée** : l'écran s'ouvre sur le **journal des consultations** (source `acces`) par
défaut — c'est celui où la colonne « Origine » signale l'anomalie qu'un super-admin cherche en
premier. Le tableau porte les colonnes **Date**, **Heure**, **Établissement**, **Compte**,
**Action**, **Dossier (id)**, **Origine**.

**Aucun nom de patient nulle part.** La colonne « Dossier (id) » porte un **identifiant**, jamais un
nom — exactement comme le journal d'activité porte déjà des identifiants d'entité sans jamais
révéler qui elles désignent.

Puis, point par point :

1. **Le sélecteur de source.** Basculer sur **Journal d'activité**. **Attendu** : le tableau change
   de contenu **et de libellés d'action** (ceux du journal d'activité, pas ceux des consultations),
   les colonnes propres aux consultations (« Dossier (id) », « Origine ») deviennent vides, et les
   colonnes propres à l'activité (« Entité ») se remplissent. **Jamais les deux journaux mélangés** :
   leurs colonnes ne se recouvrent qu'en partie, et un mélange masquerait plus qu'il n'éclairerait.
2. **Le filtre Établissement.** Revenir sur les consultations, choisir l'établissement A. **Attendu** :
   les lignes de B disparaissent, celles de A restent. Choisir B : l'inverse.
3. **Le filtre Action.** Choisir « Export ». **Attendu** : il ne reste que la ligne du point 4.
   Choisir « Dossier ouvert » : il ne reste que les ouvertures de fiche.
4. **Le filtre Compte.** Taper une partie du nom d'un des comptes utilisés. **Attendu** : seules ses
   lignes restent. (Ce filtre est appliqué côté navigateur, sur le nom **ou** l'identifiant : on ne
   tape pas un identifiant de mémoire sur un écran de diagnostic.)
5. **Les lignes du script d'amorçage.** Sur la source **Journal d'activité**, sans aucun filtre.
   **Attendu** : les lignes posées par `npm run bootstrap:super-admin` sont visibles — elles n'ont
   pas d'établissement, et **aucune autre route de l'application ne peut les lire**. C'est l'un des
   deux trous que cet écran ferme.
6. **Un compte ordinaire ne sait pas que la zone existe.** Se déconnecter, se reconnecter avec
   `sabrina.bernadet@cepta.fr`, saisir `/super-admin/access-log` dans la barre d'adresse.
   **Attendu** : exactement le même écran « Not Found » qu'une URL inventée (`/nimporte-quoi`) —
   **pas** une redirection, **pas** un message « accès refusé ». Comparer les deux côte à côte : ils
   doivent être indiscernables, caractère pour caractère.

## 10. Une consultation qui échoue ne laisse **rien**

Toujours en coordinateur, saisir dans la barre d'adresse l'URL d'une fiche patient avec un
identifiant **qui n'existe pas** (ou celui d'un patient d'un autre service).

**Attendu** : une erreur à l'écran (le dossier n'est pas trouvé), **et aucune ligne nouvelle** dans
le journal d'un patient quelconque. Un 404, un 403, un 500 ne sont pas des consultations : personne
n'a rien lu.

## 11. Une panne du journal n'empêche pas de soigner

Ce point n'a pas de chemin d'interface — il se provoque en coupant la base, ce qui coupe aussi la
lecture. **Il est donc laissé aux tests automatisés** et cité ici pour que la propriété soit connue :
si l'écriture du journal échoue, **la lecture du dossier est quand même servie**, et l'échec est
journalisé côté serveur (avec le `reqId`, et **seulement la classe de l'erreur** — jamais son
message, qui recopierait l'identifiant du patient et le nom de l'agent).

Ce qu'on peut vérifier **sans rien casser** : chercher dans les journaux du serveur, après avoir
déroulé toute la procédure, la chaîne `PatientAccessLog:`. **Attendu** : **aucune occurrence**. Toute
ligne `PatientAccessLog: echec de journalisation de …` ou
`PatientAccessLog: contexte de tenant absent ou etranger a la requete …` signale une trace perdue —
à traiter, pas à ignorer.

## 12. Ce que le journal ne trace pas, et qu'il faut avoir vu de ses yeux

Trois constats à faire **délibérément**, pour ne pas se tromper sur ce que ce journal promet. Chacun
est une décision assumée, développée dans `decisions-etape-4b.md`.

1. **La liste des patients n'est pas journalisée.** Ouvrir la liste, la faire défiler, la filtrer :
   aucune ligne. C'est voulu (D1 : une ligne par affichage d'écran noierait les ouvertures de
   dossier). **Mais regarder ce que cette liste affiche** : pour chaque patient, ses problèmes
   d'inscription, **avec leur motif en texte libre**. Le journal trace les routes qui **nomment** un
   patient, pas celles qui en **rendent** les données. Les deux ensembles diffèrent, et c'est la
   limite de conception de l'étape.
2. **Un rendez-vous n'est pas journalisé**, et sa lecture embarque les patients inscrits avec leurs
   **transmissions** (champ clinique). Même limite, autre exemple.
3. **L'action « Échecs d'inscription consultés » ne rendra jamais rien aujourd'hui.** Elle est
   déclarée, sa route est journalisée — mais **aucun écran n'appelle cette route** : les problèmes
   d'inscription arrivent embarqués dans la fiche patient, donc la consultation est tracée sous
   « Dossier ouvert ». Filtrer sur cette action sur l'écran plateforme rendra une liste vide, et
   **ce n'est pas une panne**.

---

## Tableau de verdict à remplir

| # | Point | Verdict | Remarque |
|---|---|---|---|
| 1 | Démarrage + deux lignes de purge | | |
| 2 | Ouvrir un dossier → une ligne, par le bouton de la fiche | | |
| 3 | Sous-dossiers = lignes distinctes ; liste/recherche/parcours = rien | | |
| 4 | Export → **une** ligne (visible sur l'écran plateforme) | | |
| 5 | Sans `consultations:read` : pas de bouton, redirection | | |
| 6 | Colonne « Origine » : octroi distinct d'un accès réel | | |
| 7 | Cloisonnement entre deux établissements | | |
| 8 | Lecture d'établissement — **aucun écran**, appel direct | | |
| 9 | Écran plateforme : source, 3 filtres, amorçage, 404 | | |
| 10 | Une consultation en erreur ne laisse rien | | |
| 11 | Aucune occurrence de `PatientAccessLog:` dans les journaux | | |
| 12 | Les trois non-couvertures, constatées de visu | | |
