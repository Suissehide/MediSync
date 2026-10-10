# Design : Pilotage, partie Indicateurs ARS

Date : 2026-10-10
Handoff de référence (dans le dépôt) : `docs/superpowers/specs/handoffs/indicateurs-ars/README.md`
et la maquette `Indicateurs ARS.dc.html` à côté. **Le handoff fait foi pour l'écran** ; ce document
fixe les décisions prises avec Léo et le modèle de données.

## 1. Décisions prises avec Léo

1. Les Indicateurs ARS rejoignent l'onglet **Pilotage** : une bascule « Activité | Indicateurs ARS »
   en tête des deux pages ; l'écran quitte le menu Administration. Le segment ARS n'apparaît
   qu'avec `stats:read` (un utilisateur `LECTURE` ne voit que l'Activité). Les adresses
   `/activite` et `/indicateurs-ars` ne changent pas.
2. **Saisie rangée par service et par année civile.** Les champs à saisir (2.5, 4.2) ne sont
   affichés et modifiables que si la période est exactement une année civile ; sur une plage
   libre ils sont désactivés avec « Choisissez une année civile pour saisir », et les exports
   laissent ces lignes sans valeur saisie.
3. **Nouvelle permission `stats:write`**, accordée au seul `COORDINATEUR` (le chef
   d'établissement l'a comme coordinateur implicite). Sans elle, les champs sont en lecture seule.

## 2. Données

- `ArsIndicatorResult` gagne :
  - `kind: 'computed' | 'unavailable' | 'manual'` ;
  - `input: 'number+text' | 'yesno' | null` (non nul pour `manual` seulement : 2.5 =
    `number+text`, 4.2 = `yesno`) ;
  - `answer: { numberValue: number | null; textValue: string | null; boolValue: boolean | null } | null`
    (non nul pour `manual` quand une réponse existe pour l'année).
  Codes, groupes, libellés et notes d'`ARS_INDICATORS` : mot pour mot.
- La réponse de `GET /indicateurs-ars` gagne `manualYear: number | null` : l'année civile quand
  `from` = 1er janvier et `to` = 31 décembre de la même année, sinon `null` (pas de saisie, pas de
  réponse jointe).
- Table `ArsManualAnswer` (modèle de service) :
  `id, establishmentId, serviceId, year Int, code String, numberValue Int?, textValue String?,
  boolValue Boolean?, updatedById String, updatedAt DateTime @updatedAt`, unique
  `(serviceId, year, code)`. Déclarée dans `SERVICE_MODELS` du garde-fou de tenant.
- `PUT /indicateurs-ars/saisies/:year/:code` (permission `stats:write`) : upsert.
  - `code` doit être un indicateur `manual` (sinon 400) ;
  - 2.5 : `{ numberValue: entier ≥ 0 | null, textValue: string ≤ 2000 | null }` ;
  - 4.2 : `{ boolValue: boolean | null }` ; un champ d'un autre type → 400 ;
  - `year` entre 2000 et 2100.
  Réponse : l'`answer` enregistrée.
- Exports Excel et CSV : pour un indicateur `manual` avec réponse, la valeur saisie remplace la
  note (2.5 : le nombre, et l'explication en note/colonne ; 4.2 : « Oui » / « Non »).

## 3. Navigation

- `navigation.ts` : l'entrée « Indicateurs ARS » quitte le groupe Administration ; l'onglet
  « Pilotage » porte `activeAlso: ['/e/$establishmentId/s/$serviceId/indicateurs-ars']` ;
  `/indicateurs-ars` entre dans `HORS_ONGLETS` (raison : « bascule de la page Pilotage »).
- Composant `BasculePilotage` (segmenté du handoff §1) rendu en tête des deux pages ; le segment
  ARS est un lien visible seulement avec `stats:read`.

## 4. Écran

Le handoff §2 à §5, section par section : en-tête (sous-titre, Excel et CSV avec icônes), bandeau
d'avancement (compteurs, barre en 4 parts, filtre segmenté avec pastilles), une carte par groupe,
sous-indicateurs « bis » avec % du parent (si parent > 0), états selon `kind` (copier avec
`aria-live` « Copié » ; badge « Non disponible » ; saisie avec fond ambre tant que vide,
sauvegarde au blur avec debounce et indication « Enregistré »), pied avec lien vers l'Activité.
Couleurs : tokens existants, sinon variables CSS nommées dans `_colors.css` (comme le chantier
Activité : `--color-termine` sert pour « calculé »).

## 5. Tests

Ceux du handoff, plus : unicité service/année/code ; code non saisissable ou mauvais type → 400 ;
`stats:write` absent → 403 (sonde de `permissions.test.ts`) ; isolation entre services ; réponse
reprise dans l'export Excel et le CSV ; pas de réponse jointe hors année civile ; bascule sans
segment ARS pour `LECTURE` ; écran : champs désactivés sans `stats:write` et hors année civile.
