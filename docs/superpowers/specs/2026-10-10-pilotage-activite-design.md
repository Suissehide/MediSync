# Design : Pilotage, partie Activité (refonte v3)

Date : 2026-10-10
Handoff de référence (copié dans le dépôt) : `docs/superpowers/specs/handoffs/pilotage-v3/README.md`
et la maquette `Pilotage v3.dc.html` à côté. **Le handoff fait foi pour l'écran** ; ce document
ajoute les décisions prises avec Léo et les définitions des nouveaux agrégats.

Préalable livré : le rôle des thématiques (`docs/superpowers/specs/2026-10-09-role-des-thematiques-design.md`),
qui rend justes les diagnostics éducatifs, les terminés et les bilans de fin.

## 1. Décisions prises avec Léo

1. **Filtre « Tous les parcours » = filtre de patients.** Choisir un modèle de parcours ne garde
   que les patients ayant au moins un rendez-vous (quel que soit son statut) sur un créneau d'un
   parcours de ce modèle, **à n'importe quelle date** ; tous leurs chiffres (dossiers et présences)
   restent comptés.
2. **Préréglages de période** :
   - « 12 derniers mois » : du 1er du mois d'il y a 11 mois jusqu'à aujourd'hui ;
   - « Trimestre » : le trimestre civil en cours (ex. du 1er octobre au 31 décembre 2026).
   Un préréglage est actif quand la période tombe pile sur lui (même règle que les années) : choisir
   une année désélectionne le préréglage et inversement, sans état supplémentaire.
3. **Onglet « Pilotage »** dans la barre (ancien « Activité ») ; le titre de la page reste
   « Activité » ; l'adresse `/activite` ne change pas. La bascule Activité | Indicateurs ARS est le
   chantier suivant.
4. **Graphique mensuel** : une colonne par mois de la période (12 pour une année, 3 pour un
   trimestre). Les mois postérieurs au mois courant restent vides à l'écran.

## 2. Nouveaux agrégats (back)

Mêmes bornes que le reste (`[from, finDeJournee(to)]`, UTC) et même cohorte.

- `monthly: { month: 'YYYY-MM', newlyIncluded: number, exited: number, active: number }[]`, un
  élément par mois civil touché par la période, dans l'ordre.
  - `newlyIncluded` : les dossiers comptés dans « Nouveaux inclus » sur la période, rangés dans le
    mois de leur date de diagnostic éducatif (`deDate` évaluée **une fois** sur la période). La somme
    des mois égale donc le total.
  - `exited` : les dossiers « Sortis », rangés dans le mois de leur `exitDate`. Somme = total.
  - `active` : patients distincts avec au moins une présence `yes` dans le mois (la somme des mois
    peut dépasser le total : un patient présent deux mois compte dans les deux).
- `absences.byWeekday: AbsenceCell[]` (7 éléments, lundi = 0) : toutes thématiques confondues,
  présences pointées du jour, même seuil de 5.
- Paramètre `pathwayTemplateId` (optionnel) sur `GET /activite` : appliqué à la cohorte avant le
  calcul (§1.1). La cohorte porte pour cela `pathwayTemplateId` sur chaque présence (modèle du
  parcours du créneau, null hors parcours). Un identifiant inconnu donne une cohorte vide, pas une
  erreur.

`ACTIVITY_DEFINITIONS` ne change pas (sauf ce que le chantier « rôle des thématiques » a déjà
changé) : même texte à l'écran et dans le CSV.

## 3. Front

- L'écran suit le handoff, section par section (en-tête, trois questions avec bascule
  Définitions, entrées et sorties par mois, bilans et suivi éducatif, carte des absences triable
  avec « Toutes thématiques » et regroupement à faible volume, motifs d'arrêt limités à 6, séances
  et temps soignant, pied).
- Couleurs : tokens Tailwind existants quand ils existent (primary, text-*, border, muted,
  destructive) ; les couleurs propres au handoff sans token (terminé #16a34a, abandon #d97706,
  autres #cbd5e1, collectives #93c5fd, actif #04182b, fond #f8fafc) sont déclarées une fois comme
  variables CSS dans `_colors.css`, avec leur pendant sombre, et utilisées par nom.
- `PeriodPicker` gagne une option `presets` (activée par l'Activité, pas par l'ARS) qui affiche le
  segmenté « 12 derniers mois » / « Trimestre ».
- Filtre parcours : liste des modèles de parcours du service (`usePathwayTemplateQueries`),
  « Tous les parcours » par défaut ; passé à `useActivityQuery(from, to, pathwayTemplateId?)`.
- CSV : ajoute une ligne par mois (`Entrées et sorties par mois`, libellé `YYYY-MM`, valeur
  « N inclus, N sortis, N en file active ») et une ligne par jour pour « Toutes thématiques ».
- Aucune nouvelle dépendance ; barres en CSS.
- Aucune donnée nominative, y compris dans les `title`.

## 4. Tests

Ceux du handoff (§ Tests), plus :
- back : filtre par patients (un patient ayant un rendez-vous dans le modèle garde ses présences
  hors parcours ; un autre patient est exclu) ; `monthly` sur une année et sur un trimestre (3
  éléments ; sommes des inclus et sortis = totaux) ; `byWeekday` (seuil 5) ; e2e du paramètre.
- front : préréglages (from/to calculés), tri, faible volume, ligne « Toutes thématiques »,
  bascule Définitions (texte identique à `ACTIVITY_DEFINITIONS`), motifs 6 puis tous, onglet
  « Pilotage ».

## 5. Hors périmètre

Indicateurs ARS (refonte, saisie manuelle, bascule de page) : chantier suivant.
