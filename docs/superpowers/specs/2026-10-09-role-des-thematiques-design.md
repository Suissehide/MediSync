# Design : rôle des thématiques dans les indicateurs

Date : 2026-10-09
Prépare : la refonte « Pilotage » (handoffs Pilotage v3 et Indicateurs ARS).

## 1. Problème

Les indicateurs (écran ARS, MDS-26 ; écran Activité, MDS-40) reconnaissent le diagnostic éducatif et
la réactualisation par une **liste de noms exacts** (`ARS_THEMATIC_ROLES`,
`back/src/main/utils/ars-indicators.ts`). Les données migrées de Draxa préfixent leurs thématiques
(« SMCP Diagnostic éducatif », « SMCP Réactu 1 »…) et ne sont pas reconnues. Mesuré sur la base de
dev, année 2026 : 91 présences à « SMCP Diagnostic éducatif » ignorées contre 1 reconnue ; 87 aux
« SMCP Réactu » contre 2. Effets : « 1 diagnostic éducatif pour 560 inclus », « 2 terminés sur 429
sortis » à l'écran Activité, et les mêmes sous-comptes dans les indicateurs ARS qui dépendent du
diagnostic éducatif et des réactualisations.

Par ailleurs, « Bilans de fin réalisés » est une approximation (présences aux réactualisations) alors
que Cardiologie a une thématique « Bilan de sortie ».

## 2. Décisions prises avec Léo

1. Le rôle est **une propriété de la thématique**, réglée par le chef de service dans l'écran
   Thématiques. Chaque service règle ses propres thématiques ; les noms ne comptent plus.
2. Trois rôles : **Diagnostic éducatif**, **Réactualisation**, **Bilan de fin** (plus « aucun »).
3. Chantier séparé, livré **avant** la refonte Pilotage.

## 3. Données

- Enum Prisma `ThematicRole { DIAGNOSTIC_EDUCATIF REACTUALISATION BILAN_DE_FIN }`, colonne nullable
  `Thematic.role ThematicRole?` (null = aucun rôle).
- Migration SQL : ajoute l'enum et la colonne, puis **préremplit une fois** à partir du nom, comparé
  sans casse ni accents, préfixe libre toléré :
  - contient « diagnostic educatif » → `DIAGNOSTIC_EDUCATIF` ;
  - un mot commençant par « reactu » → `REACTUALISATION` ;
  - contient « bilan de sortie » ou « bilan de fin » → `BILAN_DE_FIN`.
  Les autres restent null. Sur la base de dev, les 11 thématiques concernées de Cardiologie sont
  couvertes. Le préremplissage n'est qu'un point de départ : le chef de service corrige ensuite.
- `deploy/scripts/import-draxa.py` applique la même règle aux thématiques qu'il crée (sinon le
  prochain export frais arriverait sans rôle).

## 4. Calculs

- `ARS_THEMATIC_ROLES` (liste de noms) est supprimé. `ArsPresence` gagne
  `thematicRole: ThematicRole | null`, chargé par `findCohort` avec la même règle de thématique que
  `thematicName` (celle du rendez-vous, à défaut celle du modèle de créneau).
- `isRole(role, presence)` lit `thematicRole`. Toutes les définitions ARS et Activité restent
  identiques dans leur logique ; seule la reconnaissance change.
- « Bilans de fin réalisés » (Activité) compte les présences `yes` sur une thématique
  `BILAN_DE_FIN`. Sa définition dans `ACTIVITY_DEFINITIONS` devient : « Présences à une thématique
  marquée « Bilan de fin » dans l'écran Thématiques. » C'est le seul texte de définition modifié.
- « Ont terminé » (règle ARS : un diagnostic éducatif, une séance, une réactualisation) ne change
  pas. Aucun indicateur ARS n'utilisait l'approximation « bilan de fin = réactualisation ».

## 5. Écran Thématiques

- Formulaire de création et de modification : champ « Rôle dans les indicateurs », choix Aucun /
  Diagnostic éducatif / Réactualisation / Bilan de fin.
- Liste : le rôle est visible (colonne ou badge), « — » sans rôle.
- Permission : celle de l'écran, `referentials:write`. Le back accepte `role` dans les schémas de
  création et de mise à jour de thématique (valeur de l'enum ou null).

## 6. Tests

- Unitaires ARS et Activité : les fabriques portent `thematicRole` au lieu de noms ; le test qui
  confrontait la liste de noms au front disparaît avec elle.
- e2e : la cohorte lit le rôle en base ; création et mise à jour d'une thématique avec un rôle ;
  un rôle invalide est refusé (400).
- Migration : un test SQL (ou e2e après migration) montre que « SMCP Réactu 2 » est préremplie en
  `REACTUALISATION`, « Bilan de sortie » en `BILAN_DE_FIN`, « Diététique » reste null.
- Front : le formulaire envoie le rôle choisi ; la liste l'affiche.

## 7. Vérification après fusion

Sur la base de dev, comparer l'écran Activité avant et après (diagnostics éducatifs, terminés,
bilans de fin) et l'écran ARS (1.1, 4.x), et rapporter les écarts.

## 8. Hors périmètre

La refonte Pilotage (Activité v3, Indicateurs ARS, bascule de page, onglet) : chantiers suivants.
