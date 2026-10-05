# Design : export des indicateurs de l'enquête annuelle ARS (MDS-26)

Date : 2026-10-05
Ticket : MDS-26 — « Export des indicateurs de l'enquête annuelle ARS (Nouvelle-Aquitaine d'abord) »
Statut du ticket : En cours, P2, estimation L, échéance 2026-12-11

## 1. Intention

Chaque programme ETP autorisé remplit une auto-évaluation annuelle pour l'ARS. Aujourd'hui le
coordinateur la remplit à la main depuis des tableurs. MDS-26 demande un écran « Indicateurs ARS »
par service et par année, avec un export tableur, en **chiffres agrégés uniquement, sans aucune
donnée nominative**.

Critère de fin du ticket : le coordinateur du pilote remplit son enquête annuelle à partir de
l'export.

Ce que ce chantier n'est pas : MDS-40 (« Tableau de bord d'activité du service ») couvre les tuiles
et graphiques de pilotage, destinés aussi au rôle LECTURE. Les deux tickets partagent leurs
définitions d'indicateurs ; celui-ci produit la grille réglementaire, pas le tableau de bord.

## 2. Décisions prises en amont

Quatre points tranchés avec Léo avant l'écriture de cette spec, qui cadrent tout le reste :

1. **Référentiel d'indicateurs** : à défaut du modèle régional Nouvelle-Aquitaine, on reprend la
   grille de l'ancienne application Draxa (`src/Controller/StatistiqueController.php`), qui est la
   grille nationale du rapport d'activité ETP — 30 indicateurs en quatre groupes, dont 24 calculables
à partir des données MediSync. Les définitions
   vivent dans une table éditable, pour que l'arrivée du modèle régional soit une édition de liste
   et non une refonte.
2. **Aucune liste nominative.** Draxa affichait cinq listes de patients aux dossiers incomplets.
   Elles servaient au débogage et ne sont pas reprises. L'écran est strictement agrégé, ce qui
   aligne la page sur la lettre du ticket et évite de créer un second endroit où des noms de
   patients s'affichent.
3. **Reconnaissance des thématiques de réactualisation** : par liste nommée, pas par préfixe (voir
   §5.2). Réglage par service plus tard, au besoin du chef de service.
4. **Accès** : le chef de service, c'est-à-dire `COORDINATEUR`.

## 3. Mapping des 24 indicateurs

Vocabulaire commun à tout le document :

- **Période** `[from, to]` — par défaut l'année civile choisie.
- **Cohorte** — les `PatientServiceFile` du service courant (le dossier d'un patient dans ce
  service), et les rendez-vous de leurs patients.
- **Présence honorée** — `AppointmentPatient.status = 'yes'`. C'est l'équivalent exact du
  `etat = "Oui"` de Draxa.
- **Date de diagnostic éducatif (date de DE)** — `PatientServiceFile.entryDate`, équivalent du
  `dedate` de Draxa ; à défaut, la date du premier rendez-vous honoré dans la période portant une
  thématique de rôle `diagnosticEducatif`. C'est la transposition de `getDiagnosticEducatifDate`.
- **Séance individuelle / collective** — `Slot.slotTemplate.isIndividual`. Draxa distinguait par un
  champ texte `categorie` (`Entretien`/`Consultation`/`Coaching` contre `Atelier`) ; MediSync porte
  l'information en booléen, la règle devient exacte au lieu d'être une énumération à maintenir.
- **Thématique d'un rendez-vous** — `Appointment.thematic.name`, à défaut
  `Slot.slotTemplate.thematic.name` (le champ est nullable sur le rendez-vous).

### 3.1 Groupe 1 — Entrée dans le programme

| Code | Libellé | Règle MediSync |
| --- | --- | --- |
| 1.1 | Patients ayant bénéficié d'un diagnostic éducatif | Dossiers dont la date de DE tombe dans la période |
| 1.1bis | Dont en distanciel | Parmi 1.1, ceux dont le rendez-vous de DE honoré dans la période est de `type = telephonic` |
| 1.2 | Orientés par un professionnel de santé hors hôpital | 1.1 et `orientation = 'Orientation pro santé ext hôpital'` |
| 1.3 | Orientés au cours d'une hospitalisation | 1.1 et `orientation = 'Orientation pro santé au cours hospit'` |
| 1.4 | Orientés à l'hôpital en consultation externe | 1.1 et `orientation = 'Orientation pro santé en Cs'` |

Les trois valeurs d'orientation existent telles quelles dans `ORIENTATION`
(`front/src/constants/patient.constant.ts`), héritées de Draxa.

### 3.2 Groupe 2 — Séances d'ETP et mode de prise en charge

| Code | Libellé | Règle MediSync |
| --- | --- | --- |
| 2.1 | Pris en charge en hospitalisation uniquement | Date de DE dans la période, au moins une présence honorée depuis cette date, et **toutes** de `type = hospital` |
| 2.2 | Pris en charge en soins externes uniquement | Idem avec `type ∈ {ambulatory, telephonic}` |
| 2.3 | Pris en charge en soins de ville uniquement | **Indisponible** — aucune notion de soins de ville dans le modèle |
| 2.4 | Programme mixte | Date de DE dans la période, au moins une présence honorée depuis, et ni 2.1 ni 2.2 |
| 2.5 | Autre type de prise en charge | **À renseigner à la main** — champ libre de l'enquête, pas un calcul |
| 2.6 | Total des séances individuelles réalisées | Présences honorées dans la période sur un créneau individuel |
| 2.6bis | Dont en distanciel | Parmi 2.6, celles de `type = telephonic` |
| 2.7 | Total des séances collectives réalisées | Créneaux collectifs distincts portant au moins une présence honorée dans la période |
| 2.7bis | Dont en distanciel | Parmi 2.7, les créneaux dont toutes les présences honorées sont de `type = telephonic` |
| 2.8 | Nombre moyen de patients par séance collective | Présences honorées sur créneaux collectifs ÷ 2.7 |
| 2.9 | Proches et/ou aidants ayant participé | Patients distincts ayant au moins une présence honorée avec `accompanying = 'Oui'` |
| 2.10 | Total des séances avec participation d'un proche | Présences honorées avec `accompanying = 'Oui'` |
| 2.11 | Séances destinées exclusivement aux proches | **Indisponible** — un rendez-vous est toujours rattaché à des patients |

Note sur 2.7 et 2.8 : on compte des **créneaux distincts**, pas des rendez-vous. Le schéma autorise
plusieurs `Appointment` sur un même `Slot` ; compter les créneaux rend le chiffre juste quelle que
soit cette cardinalité, et c'est aussi ce que faisait Draxa.

### 3.3 Groupe 3 — Sortie du programme

Un « programme personnalisé complet » au sens de Draxa : une date de DE dans la période, au moins
une séance honorée depuis, **et** au moins une séance de réactualisation.

| Code | Libellé | Règle MediSync |
| --- | --- | --- |
| 3.1 | Programme complet, tous modes | DE dans la période + ≥ 1 séance + ≥ 1 réactualisation, depuis la date de DE |
| 3.2 | Programme complet en hospitalisation | 3.1 restreint aux présences de `type = hospital` |
| 3.3 | Programme complet en soins externes | 3.1 restreint à `type = ambulatory` |
| 3.4 | Programme complet en parcours mixte | 3.1 et ni 3.2 ni 3.3 |
| 3.5 | Programme complet en soins de ville | **Indisponible** — même motif que 2.3 |
| 3.6 | Évaluation individuelle des compétences acquises | Au moins une présence honorée dans la période sur une thématique de réactualisation |

Incohérence héritée, conservée volontairement : 2.2 compte les soins externes en incluant le
distanciel (`ambulatory` ou `telephonic`), alors que 3.3 exige `ambulatory` seul. Les deux libellés
parlent pourtant de soins externes. C'est ainsi dans Draxa (`statistique22` contre `statistique33`)
et on ne le change pas sans arbitrage : une séance téléphonique compte-t-elle comme une venue en
soins externes ? Question à poser au coordinateur du pilote lors de la validation sur une année
réelle (dernière case du ticket), avec la ligne à modifier déjà identifiée.

### 3.4 Groupe 4 — Modalités de suivi et coordination

| Code | Libellé | Règle MediSync |
| --- | --- | --- |
| 4.1 | Offre initiale complète | Date de DE dans la période et ≥ 3 présences honorées depuis |
| 4.1bis | Dont terminée par une réactualisation | ≥ 3 présences honorées **avant** la dernière réactualisation |
| 4.2 | Une offre de suivi est-elle proposée dans la structure ? | **À renseigner à la main** — question oui/non sur la structure |
| 4.3 | Offre de suivi ou de renforcement | ≥ 3 présences honorées **après** la première réactualisation |
| 4.3bis | Dont terminée aussi par une réactualisation | ≥ 2 réactualisations et ≥ 3 présences honorées **entre** la première et la dernière |
| 4.4 | Synthèse transmise au médecin traitant | **Indisponible** — rien ne trace cet envoi (relève de MDS-« Envoi du bilan par MSSanté ») |

4.1 reprend la simplification de Draxa : la définition réglementaire exige aussi l'évaluation des
compétences et la proposition d'une modalité de suivi, que Draxa ne vérifiait pas. On garde sa
règle pour que les chiffres restent comparables, et c'est noté ici plutôt qu'enfoui dans le code.

### 3.5 Ce qui manque dans MediSync

C'est la réponse à la deuxième case du ticket. Six des 30 indicateurs ne sont pas calculables :

- **2.3 et 3.5 — soins de ville.** `AppointmentType` vaut `ambulatory`, `hospital` ou `telephonic`.
  Aucune valeur ne distingue une prise en charge en ville (MSP, association, réseau libéral). Déjà
  des stubs à `0` dans Draxa, donc jamais renseignés non plus dans l'ancienne application.
- **2.11 — séances réservées aux proches.** Un `Appointment` existe par ses `AppointmentPatient` ;
  une séance sans patient n'est pas représentable.
- **4.4 — transmission au médecin traitant.** Aucun modèle ne porte cet envoi.
- **2.5 et 4.2** ne sont pas des manques de données : l'un est un champ libre à expliquer, l'autre
  une question oui/non sur la structure. Ils restent à la main du coordinateur.

Les six apparaissent dans l'écran et dans l'export comme des lignes à valeur vide, accompagnées de
leur raison. Elles ne sont pas masquées : une enquête ARS se remplit case par case, et un
indicateur absent de l'écran devient une case oubliée dans le formulaire.

### 3.6 Trois écarts de Draxa qui ne sont pas reportés

Les chiffres de l'ancienne application sont faux sur ces trois lignes. À savoir avant de comparer
les deux écrans sur une même année :

- **3.4** (`statistique34`) est un `return $this->statistique31(...)` littéral : le parcours mixte
  renvoyait le total tous modes. Recalculé ici comme le complément de 3.2 et 3.3.
- **2.9** (`statistique29`) est une copie littérale de `statistique210` : les deux comptaient des
  séances, alors que 2.9 compte des personnes. Recalculé ici en patients distincts — faute de
  pouvoir identifier les proches eux-mêmes, `accompanying` étant un simple Oui/Non.
- **2.7bis** (`statistique27bis`) est un `return 0` : MediSync sait le calculer.

Chacun de ces trois écarts a son cas de test, pour que la correction soit démontrée et non
seulement affirmée.

## 4. Accès

Nouvelle permission de service **`stats:read`**, accordée au seul `COORDINATEUR` dans
`SERVICE_PERMISSIONS` (`back/src/main/utils/permissions.ts`). Le chef d'établissement l'obtient
automatiquement, étant coordinateur implicite de tous les services actifs
(`domain/accessGrant.domain.ts`).

Elle n'est pas accordée à `LECTURE`, bien que la page soit en lecture seule et sans donnée
nominative : la direction lira le tableau de bord de MDS-40, qui est conçu pour elle. Si cela doit
changer, c'est une ligne dans la matrice.

`docs/multi-tenant/habilitations.md` est mis à jour dans le même commit que la matrice : c'est le
document présenté en audit, il ne doit jamais diverger du code.

## 5. Architecture

### 5.1 Où le calcul a lieu

Le calcul se fait **en TypeScript, après un chargement unique**, et non en SQL agrégé.

L'agrégation SQL (`groupBy` Prisma) suffirait aux six indicateurs de comptage simple. Elle échoue
sur les autres, qui sont des prédicats portant sur *la séquence des rendez-vous d'un patient* —
« toutes ses présences depuis la date de DE sont de type hospital », « au moins trois présences
avant sa dernière réactualisation ». Les exprimer en SQL demanderait des CTE écrites à la main, que
Prisma ne génère pas ; on se retrouverait avec deux mécanismes de calcul pour une seule grille, et
la moitié des indicateurs impossibles à tester isolément.

Plafond assumé : on charge en mémoire les dossiers du service et leurs rendez-vous, **sans borne de
date basse** — plusieurs indicateurs remontent jusqu'à la date de DE, qui précède souvent la
période demandée. À l'échelle d'un service (centaines de dossiers, milliers de rendez-vous) le coût
est négligeable. Le code porte un commentaire `ponytail:` nommant ce plafond et sa sortie (filtrer
en base sur `entryDate >= from - N ans`, ou agréger par année en tâche de fond) si un service
devait un jour peser trop lourd.

### 5.2 La table de définitions

Un seul fichier porte toute la grille : `back/src/main/utils/ars-indicators.ts`.

```ts
export const ARS_THEMATIC_ROLES = {
  reactualisation: ['Réactu 1', 'Réactu 2', 'Réactu 3', 'Réactu 4'],
  diagnosticEducatif: [
    'Diagnostic éducatif',
    'Diagnostic Éducatif – Bilan CEPTA',
    'Diagnostic Éducatif – HDJ SMR',
    'Diagnostic Éducatif – Ambulatoire',
  ],
} as const

export const ARS_INDICATORS: readonly ArsIndicator[] = [
  { code: '1.1', group: 'Entrée', label: '…', compute: (c) => … },
  { code: '2.3', group: 'Séances', label: '…', unavailable: 'Pas de notion de soins de ville' },
  { code: '2.5', group: 'Séances', label: '…', manual: true },
  …
]
```

**Pourquoi une liste nommée et non un préfixe.** Draxa testait
`substr_compare($thematique, "Réactu", 0, 5) === 0`. Les données réelles contiennent quatre
thématiques de diagnostic éducatif dont trois s'écrivent « Diagnostic **É**ducatif » avec une
majuscule accentuée : un match par préfixe sur « Diagnostic éducatif » en raterait trois sur quatre,
sans rien signaler. Les thématiques sont par service et librement nommées ; la liste explicite rend
le rattachement auditable et son erreur visible.

**Chemin d'évolution**, demandé par Léo : ce rattachement doit devenir configurable par le chef de
service. Quand ce sera le cas, la constante devient une lecture de table (un champ de rôle sur
`Thematic`, ou une table de liaison) et **aucune des fonctions `compute` ne change** — elles
reçoivent déjà les rôles résolus, pas des noms. Un commentaire `ponytail:` le dit sur place.

### 5.3 Découpage

- `back/src/main/utils/ars-indicators.ts` — rôles de thématiques, définitions, `compute` par
  indicateur. Aucune dépendance à Prisma : ces fonctions prennent une cohorte en mémoire et rendent
  un nombre. C'est ce qui les rend testables une par une.
- `back/src/main/infra/orm/repositories/arsIndicator.repository.ts` — le chargement de la cohorte,
  une requête, scopée par le tenant comme tous les autres dépôts.
- `back/src/main/domain/arsIndicator.domain.ts` — orchestre : charge, applique la grille, rend la
  liste `{ code, group, label, value | unavailable | manual }`. Porte aussi `exportExcel`.
- `back/src/main/interfaces/http/fastify/routes/arsIndicator.ts` — deux routes, montées par
  `tenantRoutes`.
- `back/src/main/interfaces/http/fastify/schemas/arsIndicator.schema.ts` — Zod, requête et réponse.
- Enregistrement du dépôt et du domaine dans `awilix-ioc-container.ts`, seul site de câblage.

### 5.4 Routes

```
GET /e/:establishmentId/s/:serviceId/indicateurs-ars?from=YYYY-MM-DD&to=YYYY-MM-DD
GET /e/:establishmentId/s/:serviceId/indicateurs-ars/export?from=…&to=…
```

Les deux portent `config: { permission: 'stats:read' }`. La route d'export rend un Buffer, sur le
patron de l'export Excel des patients (`patient.domain.ts`, `routes/patient.ts`) — y compris le
contournement du hook `preSerialization` déjà en place pour ce cas.

Le paramétrage est en `from`/`to` et non en année, bien que l'écran ne propose qu'une année :
l'enquête quadriennale mentionnée dans le contexte du ticket demandera une plage, et c'est le même
code.

### 5.5 Export

`xlsx` (0.18.5), déjà dépendance du back. Une feuille, trois colonnes : code, libellé, valeur. Les
lignes indisponibles portent leur raison en valeur. L'en-tête nomme le service et la période — un
tableur d'enquête sans sa période est inexploitable six mois plus tard.

### 5.6 Front

Route `front/src/routes/_authenticated/e/$establishmentId/s/$serviceId/indicateurs-ars.tsx`, page en
lecture seule :

- un sélecteur d'année (défaut : l'année en cours) ;
- quatre blocs, un par groupe, chacun une table code / libellé / valeur ;
- les lignes indisponibles grisées avec leur raison, les lignes manuelles marquées « à renseigner » ;
- un bouton d'export.

Un lien dans la navigation de service, visible selon `stats:read` comme les autres entrées
conditionnées par permission.

## 6. Tests

- **Unitaires, un par indicateur calculé** (24 des 30), sur une cohorte construite à la main. C'est
  là que vivent les règles, et c'est là qu'étaient les bugs de Draxa. Les trois écarts du §3.6 ont
  chacun leur cas, construit pour être rouge avec la règle de Draxa et vert avec la nôtre.
- **Unitaire sur la résolution des rôles de thématiques** : une thématique « Diagnostic Éducatif –
  HDJ SMR » est bien reconnue, une thématique inconnue ne l'est pas.
- **e2e permission** : `COORDINATEUR` passe ; `INTERVENANT`, `SECRETARIAT` et `LECTURE` reçoivent un
  403, sur les deux routes.
- **e2e export** : la route rend un classeur non vide dont la première feuille porte la période.
- **e2e isolation tenant** : les chiffres d'un service ne comptent pas les dossiers d'un autre
  service du même établissement.

## 7. Hors périmètre

- Le modèle régional Nouvelle-Aquitaine lui-même (première case du ticket, pas encore récupéré) :
  la grille nationale sert de référentiel, l'ajustement se fera dans `ars-indicators.ts`.
- Le réglage par service des rôles de thématiques (§5.2).
- Le tableau de bord d'activité et ses graphiques (MDS-40).
- Le filtrage par programme ETP déclaré (ticket « Fiche programme ETP déclaré et export ARS par
  programme »).
- Toute donnée nominative, y compris les listes de complétude de Draxa.
