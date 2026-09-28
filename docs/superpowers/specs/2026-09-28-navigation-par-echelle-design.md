# Navigation par échelle — conception

**Date :** 2026-09-28
**Statut :** à valider par Léo avant le plan d'implémentation
**Plan :** `docs/superpowers/plans/2026-09-28-navigation-par-echelle.md`

## Le problème

L'application compte 20 écrans réels, rangés en quatre étapes successives sans décision
d'ensemble. L'inventaire du 2026-09-28 en tire six défauts :

1. **Trois grammaires pour un seul geste.** Passer d'un écran à son voisin se fait par les
   onglets de la barre du haut (4 écrans), le popover ⚙ (7 écrans) ou un bandeau d'onglets
   dans la page (`establishmentAdminNav.tsx`, `superAdminNav.tsx`, 6 écrans).
2. **Une zone invisible.** Le menu ⚙ annonce « Membres » ; Services et Accès temporaires ne se
   découvrent qu'une fois Membres ouvert.
3. **Trois écrans à la mauvaise échelle.** Soignants, Salles et Activité vivent sous
   `/e/:e/s/:s/…` mais sont gardés par des permissions d'établissement. Un ADMIN sans
   affectation de service ne peut pas les atteindre (`SettingsMenu` masque toute entrée de
   service quand `serviceId` est nul). Le schéma le confirme : `Soignant` et `Location` ne
   portent qu'un `establishmentId`.
4. **« Réglages » est un fourre-tout** : un outil hebdomadaire (Planning), des référentiels
   (Thématiques, Diagnostics) et un journal (Activité) dans le même tiroir.
5. **Trois journaux aux noms qui se confondent** : Activité, Consultations, Journal des accès.
6. **`/choose-context` n'est jamais un choix** : on n'y arrive que par redirection d'échec, et
   `TenantSelector` ne liste que les couples établissement › service. Il ignore
   l'administration d'établissement et la plateforme.

## Le parti pris : la navigation suit l'échelle

Chaque écran appartient à exactement une échelle : **service**, **établissement** ou
**plateforme**. Son URL, la permission qui le garde et l'endroit où on le trouve disent la même
chose.

### Une seule grammaire : les onglets de la barre du haut

La barre du haut affiche **les onglets de l'échelle courante, et seulement ceux-là**. Le popover ⚙
et les deux bandeaux d'onglets disparaissent.

L'échelle courante se déduit de la **route** (`useMatchRoute`), jamais du store. C'est
l'invariant déjà posé pour `TodoSheet` : sur `/user/settings`, le store porte encore le dernier
service visité.

Au sein d'une échelle, un séparateur vertical fin regroupe les onglets par nature du travail.
C'est l'idée retenue de l'option B.

| Échelle | Groupe | Onglet | Route | Permission |
|---|---|---|---|---|
| Service | Quotidien | Dashboard | `s/:s/dashboard` | — |
| | | Agenda | `s/:s/agenda` | — |
| | | Patients | `s/:s/patient` | — |
| | | Suivi | `s/:s/suivi` | — |
| | Organisation | Planning | `s/:s/planning` | `planning:write` |
| | | Thématiques | `s/:s/thematic` | `referentials:write` |
| | | Diagnostics | `s/:s/diagnostic-template` | `referentials:write` |
| Établissement | Accès | Membres | `admin/members` | `members:manage` |
| | | Services | `admin/services` | `services:manage` |
| | | Accès temporaires | `admin/grants` | `members:manage` |
| | Ressources | Soignants | `admin/soignants` *(nouveau)* | `soignants:manage` |
| | | Salles | `admin/locations` *(nouveau)* | `locations:manage` |
| | Traçabilité | Journal d'activité | `admin/activity-log` *(nouveau)* | `activity-log:read` |
| Plateforme | | Établissements | `/super-admin` | `isSuperAdmin` |
| | | Comptes | `/super-admin/users` | `isSuperAdmin` |
| | | Journaux | `/super-admin/access-log` | `isSuperAdmin` |

Restent hors onglets, car ce sont des écrans d'**objet** et non de section : Fiche patient,
Consultations du dossier (bouton dans la fiche), Fiche établissement (depuis la liste du
super-admin), Réglages du compte (menu du compte).

La table vit dans **un seul fichier déclaratif** (`front/src/navigation/navigation.ts`). La barre
la lit, et un test vérifie que chaque route de section de l'arbre généré y figure, ou figure dans
une liste d'exclusions nommée. C'est ce test qui empêche le défaut n° 2 de revenir.

**Écart par rapport à l'option A telle que présentée :** j'avais parlé d'un menu latéral unique.
Or le panneau latéral actuel (`sidebar.tsx`) porte les **filtres propres à chaque écran**
(soignants, parcours, diagnostics…) et les actions rapides. Y ajouter la navigation obligerait à
les faire cohabiter sur 256 px. La navigation reste donc dans la barre du haut, qui porte déjà les
onglets. Le principe (une seule grammaire, organisée par échelle) est inchangé.

### Le sélecteur d'échelle remplace `TenantSelector`

C'est un seul menu, à gauche de la barre, qui liste **toutes les destinations** du compte :

```
CHU Pellegrin › Diabétologie ▾
  ─ CHU Pellegrin
      Diabétologie
      Cardiologie
      Administration de l'établissement      (si ADMIN de cet établissement)
  ─ Clinique Saint-Martin
      Endocrinologie
  ────────────
  Plateforme                                  (si isSuperAdmin)
```

- Le libellé du bouton suit l'échelle : `Établ. › Service`, `Établ. › Administration` ou
  `Plateforme`.
- Le sélecteur est visible dès que le compte a **au moins deux destinations**. Aujourd'hui, il
  faut au moins deux couples de service. Un ADMIN rattaché à un seul service voit donc désormais
  le sélecteur, puisqu'il a deux destinations.
- Une fonction unique `accessibleDestinations(user)` alimente à la fois le sélecteur et
  `/choose-context`. La page de choix devient la version pleine page du même menu : elle reste la
  cible des redirections, mais elle n'est plus le seul endroit où l'on voit la liste (défaut n° 6).
- L'entrée « Super-administration » quitte le menu du compte pour le sélecteur. La règle
  d'absence est conservée : l'entrée n'existe pas pour qui n'a pas `isSuperAdmin`, elle n'est ni
  grisée ni annoncée.

## Les trois déménagements

### Soignants → `admin/soignants`, en liste nominative seule

Aujourd'hui, l'écran Soignants mélange deux échelles. La liste des soignants appartient à
l'établissement. La colonne « Thématiques » est une donnée de **service** : `SoignantThematic`
porte un `serviceId`, et l'édition passe par `updateThematic` (`referentials:write`).

- À l'échelle de l'établissement, l'écran ne garde que la liste nominative : nom, ajout,
  modification du nom, suppression. Il s'appuie sur `SoignantApi.getAllForEstablishment` (qui
  existe déjà).
- Le rattachement d'un soignant aux thématiques se fait **depuis l'écran Thématiques**, qui le
  propose déjà (`editThematicSoignantsForm.tsx`, colonne « Soignants »). Le coordinateur garde
  donc la main sur ce rattachement.
- `editSoignantThematicsForm.tsx` et la colonne « Thématiques » de `soignant.column.tsx` sont
  supprimés.

### Salles → `admin/locations`

- Côté back, `locationAdminRouter` n'expose pas de lecture de liste. On ajoute
  `GET /e/:e/admin/location` (`locations:manage`), sur le patron de `soignantAdminRouter`.
- Côté front, on ajoute `LocationApi.getAllForEstablishment`.

### Journal d'activité → `admin/activity-log`, pour tout l'établissement

- Côté back, `activityLogRouter` passe de `tenant.routes.ts` à `establishment-admin.routes.ts`.
- Dans `ActivityLogRepository.serviceFilter`, le contexte d'établissement (`serviceId` nul)
  ne filtre plus sur `serviceId: null` seulement. Il prend **tout l'établissement**, avec un
  paramètre facultatif `serviceId` dans la requête.
- C'est conforme à `docs/multi-tenant/habilitations.md`, qui décrit déjà `activity-log:read` comme
  « journal d'activité de l'établissement ». La restriction actuelle n'existait que parce que
  l'écran vivait sous un préfixe de service : son commentaire le dit (« l'activité des autres
  services n'a pas à apparaître dans un écran monté sous un préfixe de service »).
- Côté front, un sélecteur de service s'ajoute aux filtres existants (action, utilisateur, date),
  avec une option « Tous les services ».

## Les journaux : un nom par échelle

| Échelle | Nom affiché | Contenu | Où |
|---|---|---|---|
| Établissement | **Journal d'activité** | Ce qui a été modifié, par qui | Onglet Traçabilité |
| Dossier patient | **Consultations du dossier** | Qui a ouvert ce dossier, quand | Bouton dans la fiche |
| Plateforme | **Journaux** | Les deux sources, sans borne de tenant | Onglet plateforme |

Les permissions (`activity-log:read`, `consultations:read`) ne changent pas. Seuls les libellés
changent.

## Permissions

**Aucune permission ne change.** Soignants et Salles restent réservés à l'ADMIN, comme Léo l'a
décidé le 2026-09-28 : le COORDINATEUR n'y a pas accès, ni en lecture ni en écriture.
`referentials:read` continue de servir les listes de soignants et de salles dont les écrans de
service ont besoin (filtres, formulaires de créneau).

## Compatibilité des URL

- `s/:s/soignant`, `s/:s/location` et `s/:s/activity-log` deviennent de simples fichiers de
  redirection vers leur équivalent `admin/…`, en transmettant la chaîne de recherche (même règle
  qu'à l'étape 2 : TanStack Router ne le fait pas de lui-même).
- `/settings/soignant`, `/settings/location` et `/settings/activity-log` redirigent vers
  l'administration de l'établissement par défaut, et non plus vers le service par défaut.
- Le layout `_settings` perd `soignants:manage`, `locations:manage` et `activity-log:read` de
  `SETTINGS_PERMISSIONS`.

## Ce qui ne change pas

- `remountDeps` sur les deux layouts de tenant, et l'invariant de `root.layout.tsx`.
- Le panneau latéral : filtres, actions rapides, menu du compte (moins l'entrée
  super-administration).
- L'écran d'accueil (`_authenticated/index.tsx`) : un ADMIN sans service atterrit toujours sur
  `admin/members`.

## Risques

- **Largeur de la barre.** Un COORDINATEUR voit 7 onglets, plus le sélecteur et le panneau des
  tâches. C'est à vérifier à 1280 px ; en dessous, les libellés du groupe Organisation passent en
  icône + infobulle.
- **Journal d'activité élargi.** Un ADMIN voit désormais l'activité de tous les services de son
  établissement, alors qu'il ne voyait que celle du service courant. C'est l'intention documentée,
  mais c'est un changement visible, à mentionner au déploiement.
- **Signets vers les anciennes URL de service** : ils sont couverts par les redirections.
