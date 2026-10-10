# Handoff : page Activité / Pilotage (v3)

## Objectif
Faire évoluer la page **Activité** existante (`front/src/routes/_authenticated/e/$establishmentId/s/$serviceId/activite.tsx`, MDS-40) vers le design v3.

La v3 garde **les libellés, les trois questions et les définitions actuelles**, à l'identique, et ajoute :
- les cartes à fond blanc ;
- les définitions affichées sous chaque indicateur ;
- une carte des absences triable, avec une ligne de totaux par jour et le regroupement des thématiques à faible volume ;
- les entrées et sorties par mois ;
- les bilans rapportés aux inclus et aux sorties ;
- des préréglages de période et un filtre par parcours.

Critère de fin (ticket) : le coordinateur répond en un écran à « combien de patients cette année, combien ont terminé, où sont les absences ».
Contrainte : **agrégats uniquement**, la page est accessible au rôle LECTURE (`activity:read`).

## Fichier de design
`Pilotage v3.dc.html` est une référence HTML (prototype cliquable, chiffres tirés des captures), pas du code de production. À recréer dans `activite.tsx` avec les composants et tokens existants.

Ne pas recréer la barre du haut : elle relève du handoff navigation (2a). L'onglet s'appelle « Activité ».

## Ce qui ne change pas
- La route, la garde `can(tenant, 'activity:read')`, `useActivityQuery(from, to)`, `queryState` et les états chargement / erreur / vide.
- `ACTIVITY_DEFINITIONS` (`constants/activity.constant.ts`) : **même texte à l'écran et dans le CSV**. Ne pas le réécrire.
- `activityCsv` et `telechargerCsv`.
- La règle « moins de 5 rendez-vous pointés : pas de taux », via `AbsenceCell.rate === null`.

## Structure (de haut en bas)
Conteneur : `max-w-[1320px] mx-auto flex flex-col gap-4`.

Style commun des cartes : `bg-white border border-border rounded-[10px] px-5 py-[18px]`, titre en 16px/600 `text-text`.

### 1. En-tête
- À gauche : `h1` « Activité » (24px/700). Dessous : icône `ShieldCheck` 14px et « Chiffres agrégés uniquement, aucune donnée nominative. » (13px `text-text-light`).
- À droite, avec retour à la ligne si nécessaire (`flex flex-wrap gap-2.5`) :
  1. `PeriodPicker` existant : années 2026 / 2025 / 2024.
  2. **Nouveau** : segmenté « 12 derniers mois » / « Trimestre ». Ce sont des préréglages qui remplissent du / au. L'élément actif a un fond #04182b et un texte blanc. Choisir une année désélectionne le préréglage, et inversement.
  3. du / au : les dates du `PeriodPicker`.
  4. **Nouveau** : filtre « Tous les parcours ». Il demande un paramètre `pathwayTemplateId` optionnel dans `useActivityQuery` et l'API.
  5. **Nouveau** : bouton bascule « Définitions » (`BookOpen`). Actif : fond #eff6ff, bordure et texte primary. Il remplace le `<details>` du bas.
  6. « Exporter en CSV » : inchangé, ajouter l'icône `Download`.

### 2. Les trois questions (`Reponse`)
Grille `repeat(auto-fit, minmax(min(100%,300px),1fr))` gap 12px. Chaque question devient une carte (remplace `border-l-2 border-primary pl-4`).
- Question : 14px `text-text-light`. Chiffre : 40px/700, `tracking-tight`, `tabular-nums`. Unité : 15px `text-text-dark`. Ligne de détail : 14px #475569.
- **Combien ont terminé** : ajouter une barre empilée de 10px, `rounded-full`, en trois parts proportionnelles :
  - terminés, #16a34a ;
  - abandons, #d97706 ;
  - autres sortis (`exited - completed - dropouts`), #cbd5e1.

  Avec la légende « N terminés · N abandons · N autres sortis » (13px). Elle remplace la ligne « N abandons ».
- Quand Définitions est actif, sous un filet en pointillés `border-t border-dashed`, en 12px `text-text-light` avec le libellé en gras `text-text-dark` :
  - patients : File active, Nouveaux inclus, Sortis ;
  - terminé : Ont terminé, Abandons, Taux de complétion ;
  - absences : Absentéisme.

### 3. Rangée de deux cartes
Grille `repeat(auto-fit, minmax(min(100%,520px),1fr))`.

**Entrées et sorties par mois** (nouveau)
- 12 colonnes : barres groupées « nouveaux inclus » (primary) et « sortis » (#94a3b8), hauteur 150px, normalisées sur le maximum, largeur max 14px, `rounded-t-sm`. Légende à droite du titre.
- Sous chaque mois : libellé court (Jan, Fév…) puis **file active du mois** (12px/600). Les mois futurs restent vides.
- `title` au survol : « Mois : N inclus, N sortis ».
- **Back à ajouter** : `ActivityReport.monthly: { month: 'YYYY-MM', newlyIncluded, exited, active }[]`, avec les mêmes règles que les totaux.

**Bilans et suivi éducatif** (nouveau)
- Deux lignes avec barre de 8px :
  - « Diagnostics éducatifs réalisés » : `sessions.educationalDiagnoses / patients.newlyIncluded`, base « Rapporté aux nouveaux inclus » ;
  - « Bilans de fin réalisés » : `sessions.finalReviews / patients.exited`, base « Rapporté aux sortis ».
- Texte : « **n** / total · x % ». Utiliser `white-space: nowrap` et une espace insécable avant `%`. La largeur de la barre se calcule à part (`n/total*100 + '%'`), avec `min-width: 2px`.
- Sous un filet : « Délai adressage → entrée », puis à droite « Non calculé », suivi de la définition existante.

### 4. Carte des absences (refonte de `CarteAbsences`)
- Titre et, à droite, « Trier par » avec un segmenté **Taux** / **A → Z**. Par défaut : taux total décroissant.
- Tableau dans `border rounded-lg overflow-auto`, avec `min-width: 760px`.
  - Colonnes : `minmax(220px,1fr)`, puis 5 × 96px (jours), puis 96px pour Total.
  - En-tête h 40px, fond #f8fafc, 13px `text-text-light`. La colonne Total a `border-l` et un texte en 600.
  - Lignes h 40px, `border-b border-muted`.
  - Nom : ellipse sur un `span` interne (`min-w-0`), avec `title`.
- Cellule (logique de `Case` conservée) :
  - taux : texte « x % » sur une teinte rouge proportionnelle au taux. La teinte actuelle `color-mix(... destructive ...)` est conservée ; prototype : `rgba(239,68,68, .04 + rate/0.40*.28)` ;
  - `rate === null` avec des rendez-vous pointés : « N rdv » en `text-text-light` ;
  - aucun rendez-vous pointé : « · » #94a3b8.
- **Nouveau, ligne « Toutes thématiques »** après les lignes principales : `border-t-2`, 600, h 44px, taux par jour (teinté) et total général.
  - **Back** : `absences.byWeekday: AbsenceCell[]`, si ce n'est pas déjà dérivable.
- **Nouveau, faible volume** : les thématiques dont `total.rate === null` sortent du tableau principal et passent sous une ligne repliable :
  - h 40px, fond #f8fafc, chevron qui tourne de 90°, texte « Autres thématiques · faible volume (N) », et à droite « Moins de 5 rendez-vous pointés : pas de taux » ;
  - une fois dépliées : lignes de 36px, fond #f8fafc, nom décalé de 36px, texte 13px `text-text-light`.
- Légende sous le tableau : « 0 % », un dégradé de 120×8px, « 40 % », puis « · aucun rendez-vous pointé ».
- **Par parcours** (existant), dans la même carte sous un filet : barres de 8px en rouge à 75 % d'opacité. « N rdv » en `text-text-light` si le taux est nul (null).

### 5. Rangée de deux cartes
Grille `minmax(min(100%,460px),1fr)`, `items-start`.

**Motifs d'arrêt** (existant)
- À droite du titre : « N abandons ».
- Barres #d97706, nombre en 600.
- **Nouveau** : n'afficher que les 6 premiers, puis le lien « Voir les N motifs » / « Afficher moins » (13px/600 primary).

**Séances et temps soignant** (existant, mise en forme)
- **Nouveau** : une barre empilée individuelles (primary) / collectives (#93c5fd), avec la légende en %.
- 4 mini-tuiles (`bg-[#f8fafc] rounded-lg px-3 py-2.5`) : chiffre 22px/700 et libellé 12px. Elles affichent les séances individuelles, les séances collectives, les diagnostics éducatifs et les bilans de fin.
  - Elles remplacent la phrase actuelle.
- Définitions (si actif) : Séances individuelles, Séances collectives, Diagnostics éducatifs réalisés, Bilans de fin.
- « Heures par métier » : composant `Barres` existant (primary), avec la définition « Heures soignant » en dessous si Définitions est actif.

### 6. Pied
Texte centré 12px `text-text-light` : « Moins de 5 rendez-vous pointés : pas de taux. Mêmes définitions à l'écran et dans l'export CSV. »

## Back / API
- `monthly[]` (graphique mensuel).
- `absences.byWeekday` (ligne de totaux), si absent.
- Filtre `pathwayTemplateId` optionnel.
- CSV : ajouter les colonnes mensuelles et la ligne par jour, avec les mêmes définitions.

## Incohérences à vérifier dans les données (relevées sur la capture)
- 429 sortis = 2 terminés + 336 abandons + **91 autres**. La règle « Ont terminé » (diagnostic éducatif + séance + réactualisation) semble trop stricte, ou mal reliée aux données. La nouvelle barre empilée rend cet écart visible.
- **1 diagnostic éducatif réalisé pour 560 nouveaux inclus**, alors que les inclus sont définis par la date du diagnostic éducatif. Ce chiffre compte les présences à une thématique de diagnostic : vérifier le rattachement de la thématique.

## Tests
- Le tri Taux et A → Z, ainsi que le regroupement en faible volume (`rate === null`).
- La ligne « Toutes thématiques » correspond aux agrégats par jour.
- La bascule Définitions affiche les textes de `ACTIVITY_DEFINITIONS`, à l'identique.
- Motifs : 6 affichés par défaut, tous après le clic.
- Les préréglages de période calculent bien from / to.
- Aucune donnée nominative n'apparaît, y compris dans les `title`.

## Tokens
primary #2563eb · text #04182b · text-dark #334155 · #475569 · text-light #64748b · border #e2e8f0 · muted #f1f5f9 / #f8fafc · terminé #16a34a · abandon #d97706 · absence #ef4444 · collectives #93c5fd.
Icônes lucide-react : ShieldCheck, Calendar, BookOpen, Download, ChevronDown, ChevronRight.
