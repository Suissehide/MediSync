# Navigation par échelle : décisions

**Date :** 2026-09-28 · **Branche :** `feat/navigation-par-echelle`
**Spec :** `docs/superpowers/specs/2026-09-28-navigation-par-echelle-design.md`
**Plan :** `docs/superpowers/plans/2026-09-28-navigation-par-echelle.md`

## Chiffres

| | Avant (`main`, eca1ffb) | Après |
|---|---|---|
| Back, e2e | 280 | 291 (+ `location-admin`, `activity-log-etablissement`, `activity-log-pagination`) |
| Front, vitest | 51 fichiers, 255 tests | 55 fichiers, 291 tests |
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
- **Soignants, Salles et le journal d'activité rejoignent l'administration d'établissement.**
  Aucune permission ne change ; Soignants et Salles restent réservés à l'ADMIN (décision de Léo,
  2026-09-28), le COORDINATEUR n'y a accès ni en lecture ni en écriture.
- **L'écran Soignants n'est plus qu'une liste nominative.** Le rattachement aux thématiques est
  une donnée de service (`SoignantThematic.serviceId`) : il se fait depuis Thématiques, dans
  chaque service. La création depuis le panneau latéral d'un écran de service propose toujours
  les thématiques du service courant.
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
- **Les anciennes adresses redirigent.** Sous un service, vers l'administration du même
  établissement ; sans tenant (`/settings/…`), vers celle du premier établissement administré,
  sinon `/choose-context`. Paramètres de recherche conservés. Les redirections de service vivent
  hors du layout `_settings`, dont la garde les court-circuiterait.
- **Le préfixe d'administration répond 404, pas 403**, à qui n'administre pas l'établissement :
  contrat existant de `resolveEstablishmentAdmin`, suivi par les nouveaux tests.

## Ce qui reste ouvert

- Une ancienne adresse de service (`/e/E/s/S/soignant`…) passe d'abord par la garde du layout de
  service : un administrateur retiré de ce service arrive sur `/choose-context`, pas sur
  l'administration.

- La largeur de la barre pour un coordinateur (7 onglets, le sélecteur, le panneau des tâches) :
  à vérifier à 1280 px sur un vrai navigateur.
- `access-log:read` (journal des consultations de tout l'établissement) n'a toujours aucun
  écran ; il trouverait naturellement sa place dans le groupe Traçabilité de l'administration.
