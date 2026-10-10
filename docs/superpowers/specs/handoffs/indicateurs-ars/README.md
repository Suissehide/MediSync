# Handoff : Indicateurs ARS (refonte)

## Objectif
Faire évoluer `front/src/routes/_authenticated/e/$establishmentId/s/$serviceId/indicateurs-ars.tsx` (MDS-26) dans le style de la page Activité (handoff Pilotage v3) :
- distinguer clairement les indicateurs **calculés**, **à saisir** et **non disponibles** ;
- montrer l'avancement de l'enquête ;
- permettre la saisie des champs manuels (2.5, 4.2) directement dans la page.

## Fichier de design
`Indicateurs ARS.dc.html` est une référence HTML (prototype cliquable), pas du code de production. Les valeurs jusqu'au 2.8 viennent d'une capture, les autres sont fictives. À recréer avec les composants et tokens existants.

Ne pas recréer la barre du haut : elle relève du handoff navigation (2a).

## Ce qui ne change pas
- La garde `can(tenant, 'stats:read')`, `useArsIndicatorsQuery(from, to)`, `PeriodPicker`, `queryState` et les états chargement / erreur.
- `ARS_INDICATORS` (back) : codes, groupes, libellés et notes (`unavailable` / `manual`), mot pour mot.
- Les exports Excel (`ArsIndicatorApi.exportExcel`) et CSV (`arsCsv`), ainsi que la gestion `erreurExport`.
- La forme de `ArsIndicator` : `{ code, group, label, value: number | null, note: string | null }`.

## Données à ajouter
Le front doit distinguer « non disponible » et « à saisir ». Aujourd'hui, les deux donnent `value: null` avec une `note`.
- Ajouter `kind: 'computed' | 'unavailable' | 'manual'` dans le résultat (`computeArsIndicators`), et le schéma Zod correspondant.
- Pour `manual`, ajouter `input: 'number+text' | 'yesno'` : 2.5 a un nombre et une explication, 4.2 un Oui / Non.

**Saisie manuelle (nouveau, back)** : enregistrer les réponses par service et par année.
- Table suggérée : `ArsManualAnswer { serviceId, establishmentId, year, code, numberValue?, textValue?, boolValue?, updatedBy, updatedAt }`, unique sur (serviceId, year, code).
- Routes GET/PUT. Reprendre ces valeurs dans l'export Excel et le CSV.
- Permission d'écriture à définir : `stats:write` ou coordinateur. En lecture seule, les champs restent désactivés.

## Structure

### 1. Bascule de page (nouveau, suggéré)
Segmenté « Activité | Indicateurs ARS », en haut à gauche du contenu : fond #e2e8f0, segment actif blanc avec ombre légère, h 30px.
- Il relie les deux routes sous un même onglet « Pilotage ».
- Il demande d'ajuster `navigation.ts` : Indicateurs ARS est aujourd'hui dans le groupe Administration. **À valider produit.**

### 2. En-tête
- `h1` « Indicateurs ARS » (24px/700). Sous-titre « Enquête annuelle ETP · chiffres agrégés, aucune donnée nominative. » (13px `text-text-light`).
- À droite, inchangé : `PeriodPicker` et du / au. Puis « Exporter en Excel » (primary, icône `FileSpreadsheet`) et « CSV » (outline, icône `Download`).

### 3. Bandeau d'avancement (nouveau)
Carte blanche, `px-5 py-4`, `flex flex-wrap justify-between`.
- À gauche :
  - « Prêt pour l'enquête » (15px/600), puis « N calculés · N à saisir (N restants | complets) · N non disponibles » (14px #475569) ;
  - dessous, une barre de 8px `rounded-full`, en 4 parts proportionnelles : calculés #16a34a, saisis #2563eb, à saisir restants #f59e0b, non disponibles #cbd5e1.
- À droite : filtre segmenté (fond `muted`), avec pour chaque option une pastille de couleur, un libellé et un nombre.
  - Options : Tous · Calculés · À saisir · Non disponibles.
  - « À saisir » montre les indicateurs saisis et ceux qui restent à saisir.
  - Les sections sans ligne visible sont masquées.

### 4. Une carte par groupe
Les groupes sont Entrée, Séances, Sortie et Modalités. Ce sont des cartes blanches, `rounded-[10px] overflow-hidden`, qui remplacent les bandes `bg-muted` du tableau.
- En-tête : numéro du groupe (13px/700 `text-text-light`) et nom (16px/600). À droite : « N indicateurs · N à saisir · N non disponibles » (13px).
- Ligne : grille `76px 1fr auto`, `gap-4`, `px-5 py-3`, `border-b border-muted`, `items-start`.
  - **Code** : 13px `text-text-light`, `tabular-nums`.
  - **Libellé** : 14px, `leading-relaxed`, `text-pretty`.
  - **Valeur** : colonne `min-w-[150px]`, alignée à droite.
- **Sous-indicateurs (`…bis`)** : `pt-2 pb-3`, libellé décalé (`pl-3.5 border-l-2 border-border`).
  - Si le parent et l'enfant sont numériques et que le parent est > 0, afficher à gauche de la valeur « x % du {parent} » (12px `text-text-light`).
  - Valeur en 15px, au lieu de 17px.
- **États :**
  - `computed` : valeur en 17px/600 `tabular-nums`, décimale avec virgule (3,7). Bouton copier de 26px (`Copy` 14px #94a3b8, survol `bg-muted`), qui copie la valeur brute dans le presse-papiers.
  - `unavailable` : libellé en `text-text-light`. Sous le libellé, la note avec une icône `Info` 13px (12px `text-text-light`). Valeur : badge « Non disponible » (12px, `rounded-full`, `bg-muted`).
  - `manual` :
    - sous le libellé, la note en 12px #b45309 ;
    - **2.5** : champ nombre de 96×34px, aligné à droite, 15px/600, placeholder « À saisir ». Sous le libellé, un `textarea` (max 560px, min-h 56px) « Expliquer le type de prise en charge… » ;
    - **4.2** : segmenté Oui / Non (h 28px) ;
    - tant que la réponse n'est pas saisie : ligne sur fond #fffbeb et bordure du champ #f59e0b. Une fois saisie : fond blanc et bordure `border`.
    - Sauvegarde automatique au blur, avec debounce ; indicateur « Enregistré » discret, à prévoir.

### 5. Pied
« Les valeurs saisies à la main sont reprises dans l'export Excel. Détail des patients, absences et séances dans Activité » (lien vers la route Activité), en 12px centré.

## Accessibilité
- Garder la sémantique de tableau (`table` / `th scope`), ou bien utiliser `role="table"`. Le `sr-only` de l'en-tête de colonnes est conservé.
- « — / Sans valeur » est remplacé par le badge « Non disponible », qui a son propre texte.
- Les champs manuels ont un label associé : le libellé de l'indicateur, via `aria-labelledby`.
- Le bouton copier a le libellé accessible « Copier la valeur {code} », et une annonce `aria-live` « Copié ».

## Tests
- Les 3 états s'affichent selon `kind`.
- Les filtres et les compteurs du bandeau sont cohérents avec les données.
- Le % des sous-indicateurs est calculé seulement quand le parent est > 0.
- La saisie manuelle est persistée, rechargée et reprise dans l'export.
- En lecture seule, les champs manuels sont désactivés.

## Tokens
primary #2563eb · text #04182b · #475569 · text-light #64748b · border #e2e8f0 · muted #f1f5f9 / #f8fafc · calculé #16a34a · à saisir #f59e0b / #fffbeb / #b45309 · non disponible #cbd5e1.
Icônes lucide-react : Calendar, FileSpreadsheet, Download, Info, Copy.
