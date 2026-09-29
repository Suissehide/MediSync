# Navigation par échelle : décisions

**Date :** 2026-09-28 · **Branche :** `feat/navigation-par-echelle`
**Spec :** `docs/superpowers/specs/2026-09-28-navigation-par-echelle-design.md`
**Plan :** `docs/superpowers/plans/2026-09-28-navigation-par-echelle.md`

## Chiffres

| | Avant (`main`, eca1ffb) | Après |
|---|---|---|
| Back, e2e | 280 | 295 (+ `activity-log-etablissement`, `activity-log-pagination`, `soignants-salles-service`, cas soignant/salle d'`isolation`) |
| Back, unitaires | 560 (hors tests liés à git et à la base) | 567, dont la migration `soignants_salles_par_service` jouée sur base jetable |
| Front, vitest | 51 fichiers, 255 tests | 54 fichiers, 283 tests |
| Front, lint | 0 erreur, 34 avertissements | 0 erreur, 34 avertissements |
| Front, `tsc -b` et `vite build` | verts | verts |

Chiffres relevés dans une copie Linux de travail : Postgres jetable (`embedded-postgres`) pour
les e2e, Node 22 avec `--experimental-vm-modules`. Les tests unitaires du back qui comparent le
code au dernier commit (`tenant-guard-monotonie`) ne peuvent pas tourner hors d'un dépôt git ;
ils sont à relancer sur le poste de développement.

## Ce que l'inventaire avait trouvé

Vingt écrans, rangés par quatre étapes successives sans décision d'ensemble :

1. trois façons de passer d'un écran à son voisin (onglets de la barre, popover ⚙, bandeau
   dans la page) ;
2. une zone invisible : Services et Accès temporaires sans point d'entrée nommé ;
3. Soignants, Salles et Activité sous une URL de service, gardés par des permissions
   d'établissement : un administrateur sans service ne les atteignait pas ;
4. « Réglages », tiroir unique pour un outil, des référentiels et un journal ;
5. trois journaux aux noms qui se confondent, « Journal des accès » titrant deux écrans ;
6. `/choose-context` atteignable seulement par redirection d'échec.

## Décisions

- **L'échelle décide de tout.** URL, permission et onglet disent la même chose. La barre du
  haut affiche les onglets de l'échelle de la route courante, et seulement ceux-là ; la table
  `front/src/navigation/navigation.ts` les décrit, un test refuse un écran sans onglet ni raison
  écrite (défauts 1, 2, 4), et un onglet gardé par une permission de l'autre échelle (défaut 3).
- **La navigation reste dans la barre du haut**, et non dans un menu latéral comme l'option A le
  présentait d'abord : le panneau latéral porte les filtres propres à chaque écran.
- **Le journal d'activité rejoint l'administration d'établissement.** Aucune permission ne
  change (ADMIN seul), et un administrateur sans affectation de service l'atteint enfin.
- **Soignants et salles sont propres à chaque service** (révision du 2026-09-29, sur remarque de
  Léo : « un soignant n'est pas unique, c'est plutôt un métier »). Une première version les avait
  rangés dans l'administration d'établissement ; ils sont revenus dans le service, modèle de
  données compris :
  - `Soignant` et `Location` portent `serviceId` et rejoignent `SERVICE_MODELS` ; leur gestion
    revient au coordinateur (`referentials:write`), `soignants:manage` et `locations:manage`
    disparaissent de la matrice ;
  - migration `soignants_salles_par_service` : chaque soignant et chaque salle est **copié dans
    chaque service** de son établissement (choix de Léo), la première copie garde son
    identifiant, et chaque référence (créneau, thématique, tâche, salle d'un créneau) vise la
    copie de son service. Refus explicite, sans rien écrire, pour un établissement qui a des
    soignants ou des salles mais aucun service ;
  - le rattachement d'un membre à un soignant passe de `EstablishmentMembership` à
    `ServiceMembership` (un membre peut incarner un métier différent dans chaque service). Il se
    règle **depuis le service** (colonne « Comptes » de l'écran Soignants, routes
    `GET /membres` et `PATCH /membres/:id/soignant`) : l'administration d'établissement n'a pas
    de service en contexte, et le garde-fou de tenant lui refuse toute lecture d'un modèle de
    service. Les écrans de membres de l'administration ne proposent donc plus de soignant ;
  - la mise à jour des affectations d'un membre ne supprime plus puis recrée ses lignes de
    service (ce qui aurait effacé ce rattachement) : elle retire, met à jour ou ajoute ;
  - mesure de monotonie du garde-fou contre le commit précédent : 917 refus « perdus », tous
    sur des chaînes soignant/salle devenues internes au service, ou sur la nouvelle relation
    affectation → soignant **filtrée** par service ; sa forme non filtrée reste refusée (vérifié
    directement, y compris par `EstablishmentMembership > serviceMemberships > soignant`).
- **Organisation devient un menu déroulant** de la barre du service : Planning, Thématiques,
  Diagnostics éducatifs, Soignants, Salles y sont des sous-catégories, décalées et réunies par un
  filet, avec une ligne d'explication. Sept onglets directs auraient saturé la barre.
- **Le journal d'activité couvre tout l'établissement**, filtrable par service, purge comprise.
  C'est le périmètre que `habilitations.md` donnait déjà à `activity-log:read` ; l'ancien filtre
  (service courant plus lignes sans service) ne tenait qu'à l'emplacement de l'écran. **Changement
  visible pour les administrateurs, à annoncer au déploiement.** Le champ `serviceId` n'est
  ajouté qu'à la réponse de ce journal, pas au détail d'établissement du super-admin, dont les
  clés sont figées par `super-admin-consultation.test.ts`.
- **Le journal d'activité est paginé et cherché par le serveur** (2026-09-29, relecture de
  branche). L'écran n'affichait que les 50 lignes les plus récentes, et sa recherche d'auteur ne
  portait que sur elles. Il envoie désormais la page, la taille (25 par défaut, 100 au plus) et
  le nom cherché (`user`, chaque mot dans le prénom ou le nom recopiés, sans casse), et affiche
  le total du serveur. `ReactTable` gagne une pagination serveur optionnelle
  (`serverPagination`), sans rien changer aux autres écrans. Changer de filtre revient à la
  première page dans la même mise à jour, pour n'envoyer qu'une requête. La date de début du
  filtre de période n'est plus recalculée à chaque rendu : elle faisait partie de la clé de
  requête et relançait la lecture à chaque réponse.
- **Un nom par journal** (défaut 5) : « Journal d'activité » (établissement), « Consultations du
  dossier » (fiche patient), « Journaux » (plateforme).
- **Un sélecteur d'échelle** remplace le sélecteur de service : services, administration,
  plateforme, et « Tous les accès… » vers `/choose-context`, qui partage la même dérivation
  (défaut 6). Il apparaît dès deux destinations : un administrateur coordinateur d'un seul
  service le voit désormais. L'entrée Plateforme a quitté le menu du compte ; elle reste absente,
  jamais grisée, sans le drapeau `isSuperAdmin`.
- **Les anciennes adresses du journal redirigent.** Sous un service, vers l'administration du
  même établissement ; sans tenant (`/settings/activity-log`), vers celle du premier
  établissement administré, sinon `/choose-context`. Paramètres de recherche conservés. La
  redirection de service vit hors du layout `_settings`, dont la garde la court-circuiterait.
- **Le préfixe d'administration répond 404, pas 403**, à qui n'administre pas l'établissement :
  contrat existant de `resolveEstablishmentAdmin`, suivi par les nouveaux tests.

## Ce qui reste ouvert

- **Déploiement de la migration `soignants_salles_par_service`** : dans un établissement à
  plusieurs services, chaque coordinateur retrouvera la liste complète des soignants et des salles
  d'avant, à trier. Les comptes gardent leur rattachement dans chacun de leurs services, vers la
  copie de ce service.
- L'ancienne adresse de service du journal (`/e/E/s/S/activity-log`) passe d'abord par la garde du
  layout de service : un administrateur retiré de ce service arrive sur `/choose-context`, pas sur
  l'administration.
- La barre d'un coordinateur (4 onglets, le menu Organisation, le sélecteur, le panneau des
  tâches) : à vérifier à 1280 px sur un vrai navigateur.
- `access-log:read` (journal des consultations de tout l'établissement) n'a toujours aucun
  écran ; il trouverait naturellement sa place dans le groupe Traçabilité de l'administration.
