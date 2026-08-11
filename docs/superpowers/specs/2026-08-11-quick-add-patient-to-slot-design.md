# Action rapide « Ajouter un patient à un rendez-vous »

Date : 2026-08-11
Portée : front uniquement.

- Nouveau : `front/src/components/custom/popup/addPatientToSlotForm.tsx`
- Nouveau : `front/src/components/custom/appointmentDetailsFields.tsx`
- Modifiés : `front/src/components/custom/popup/addAppointmentForm.tsx`,
  `front/src/routes/_authenticated/dashboard.tsx`,
  `front/src/routes/_authenticated/patient/index.tsx`

Aucune modification backend : `GET /slot?action=getAllSlots` expose déjà
`slotTemplate.thematicId`, `capacity`, `isIndividual`, `soignants`, ainsi que les
`appointments` et leurs `appointmentPatients`.

## Problème

Inscrire un patient à un rendez-vous impose aujourd'hui de partir du calendrier :
il faut connaître à l'avance la date du créneau, naviguer jusqu'à la bonne
semaine, puis cliquer sur le créneau. Le besoin réel est l'inverse — on part du
patient et du type de rendez-vous, et on cherche la prochaine disponibilité.

## Solution

Un bouton dans les « Actions rapides » de la barre latérale ouvre une popup en
deux étapes : on choisit un patient et une thématique, la popup liste les dix
prochains créneaux disponibles, et le clic sur l'un d'eux mène à une étape de
confirmation qui crée le rendez-vous.

Le « type de rendez-vous » est la **thématique** (`Thematic`), pas la modalité
`Ambulatoire / Hôpital / Téléphonique` — c'est la thématique qui détermine quels
créneaux sont proposés. La modalité reste renseignée à l'étape 2.

## Emplacement du bouton

Ajouté aux `quickActions` de deux pages, à côté de « Ajouter un patient » :

- `dashboard.tsx:140`
- `patient/index.tsx:97`

Libellé « Ajouter un patient à un RDV », variante `outline` pour le distinguer du
`gradient` de « Ajouter un patient ».

Comme `addPatientForm.tsx`, le composant porte son propre `PopupTrigger` et
accepte une prop `trigger?: React.ReactNode` optionnelle ; il gère en interne son
état `open` et son `step`.

## Étape 1 — sélection

```
┌──────────────────────────────────────────────┐
│ Ajouter un patient à un rendez-vous          │
├──────────────────────────────────────────────┤
│ Patient      [ Dupont Marie            ▾ ]   │
│ Thématique   [ Diététique              ▾ ]   │
│                                              │
│ Prochains créneaux disponibles               │
│ ┌──────────────────────────────────────────┐ │
│ │ ● Lundi 17 août    9h00-10h00            │ │
│ │   Dr Martin                     3/6      │ │
│ │ ──────────────────────────────────────── │ │
│ │ ● Mardi 18 août    14h00-15h00           │ │
│ │   Dr Martin, Dr Blanc                    │ │
│ │ ──────────────────────────────────────── │ │
│ │ ○ Jeudi 20 août    9h00-10h00            │ │
│ │   Dr Martin              déjà inscrit    │ │
│ └──────────────────────────────────────────┘ │
├──────────────────────────────────────────────┤
│                                   [ Annuler ]│
└──────────────────────────────────────────────┘
```

- **Patient** : `Select` avec `searchable` (déjà supporté, `select.tsx:22`),
  options triées par nom de famille puis prénom via `localeCompare(…, 'fr')`,
  comme `addAppointmentForm.tsx:60-68`.
- **Thématique** : `Select` alimenté par `useThematicQueries()`, désactivé tant
  qu'aucun patient n'est sélectionné.
- **Liste** : affichée seulement quand patient et thématique sont renseignés.
  Conteneur `max-h` + `overflow-y-auto`. Chaque ligne montre une pastille
  `slotTemplate.color` (cohérence avec le calendrier), la date au format
  `dddd D MMMM` première lettre capitalisée, les horaires, les soignants, et pour
  un créneau collectif le compteur `patients/capacité`.
- **États vides** : « Sélectionnez un patient et une thématique » avant
  sélection ; « Aucun créneau disponible pour cette thématique » après.

### Règles de sélection des créneaux

Un créneau est retenu si toutes ces conditions sont vraies :

1. `slot.slotTemplate.thematicId === thematicId` ;
2. `slot.startDate` est postérieur à maintenant (`dayjs.utc()`) ;
3. `slot.locked === false` ;
4. il reste de la place :
   - créneau **collectif** (`isIndividual === false`) : la somme des
     `appointmentPatients` de tous ses `appointments` est strictement inférieure à
     `capacity ?? 1` ;
   - créneau **individuel** : il subsiste au moins un intervalle libre de 15 min
     ou plus entre les rendez-vous existants et les bornes du créneau. Même règle
     de non-chevauchement que le `selectAllow` du dashboard
     (`dashboard.tsx:174-217`).

Tri par `startDate` croissant, puis `slice(0, 10)`.

Un créneau où le patient sélectionné a **déjà** un rendez-vous est conservé dans
la liste, marqué « déjà inscrit », non cliquable et compté dans les dix — y
compris s'il est complet, auquel cas la règle 4 est ignorée pour lui.

## Étape 2 — confirmation

Récapitulatif figé (patient, thématique, date, soignants), puis les champs
partagés, puis « Retour » / « Ajouter ». Trois cas :

| Cas | Champs | Mutation |
|---|---|---|
| Créneau individuel | Heure pré-remplie au début du premier intervalle libre. Durée par défaut : `thematic.duration` si elle tient dans l'intervalle, sinon la durée de l'intervalle. Options de durée bornées par la fin de l'intervalle. Modalité à choisir. | `createAppointment` |
| Collectif **sans** rendez-vous existant | Heure et durée figées aux bornes du créneau, champs désactivés (règle actuelle `type === 'multiple'`). Modalité à choisir. | `createAppointment` |
| Collectif **avec** rendez-vous existant non plein | Le patient **rejoint** le rendez-vous du groupe : heure, durée et modalité en lecture seule. Mention « Vous rejoignez un rendez-vous existant (2/6 patients) ». | `updateAppointment` |

Le troisième cas est nécessaire : `createAppointment` créerait un second
rendez-vous parallèle sur le même créneau collectif, ce que le dashboard interdit
déjà (`dashboard.tsx:91-96`). L'appel `updateAppointment` reprend le contrat de
`appointmentSheet.tsx` — on renvoie la liste **complète** des
`appointmentPatients` existants, chacun avec son `id` et son `patientID`, plus une
entrée pour le nouveau patient, et on conserve les `thematicId` et `type` du
rendez-vous existant.

### Composant partagé

`front/src/components/custom/appointmentDetailsFields.tsx` regroupe les trois
champs communs :

- heure de début (`TimePicker`) ;
- durée (`Select` alimenté par `generateDurationOptions(startDate, maxDate)`) ;
- modalité (`Select` sur `APPOINTMENT_TYPE_OPTIONS`).

Il reçoit les champs du formulaire parent en props et expose un `disabled` par
champ, ce qui couvre les trois cas ci-dessus sans logique métier interne — le
composant ne décide de rien, il affiche.

`addAppointmentForm.tsx` (lignes 137-234) est réécrit pour le consommer. Son
comportement observable ne change pas : heure et durée restent désactivées quand
`type === 'multiple'`, la validation des patients et de la capacité reste dans le
formulaire.

## Erreurs et cas limites

- **Aucune thématique, aucun patient** : les `Select` affichent leur placeholder
  vide habituel ; la liste reste sur son état vide.
- **Créneau devenu indisponible entre l'étape 1 et l'étape 2** (autre
  utilisateur) : l'API rejette la mutation, le toast d'erreur existant de
  `useAppointmentMutations` s'affiche et la popup reste ouverte sur l'étape 2.
  Pas de verrouillage optimiste, cohérent avec le reste de l'application.
- **Réinitialisation** : à la fermeture, `step` revient à 1 et le formulaire est
  remis à zéro (`resetAll` de `addPatientForm.tsx:76-80` comme modèle).
- **Rafraîchissement** : `createAppointment` et `updateAppointment` invalident
  déjà `APPOINTMENT.GET_ALL` et `SLOT.GET_ALL`
  (`useAppointment.ts:109-110, 197-198`) ; le calendrier du dashboard et la liste
  se mettent à jour sans invalidation manuelle.

## Vérification

Le front n'a pas de suite de tests (`front/package.json` n'expose que `dev`,
`build`, `lint`, `preview`). La vérification est donc :

1. `npm run lint` et `npm run build` dans `front/` — sans erreur ;
2. parcours manuel des trois cas de l'étape 2 : créneau individuel, créneau
   collectif vide, créneau collectif déjà entamé ;
3. non-régression de `AddAppointmentForm` depuis le calendrier du dashboard, sur
   un créneau individuel et sur un créneau collectif, après l'extraction des
   champs partagés ;
4. vérification qu'un créneau « déjà inscrit » apparaît bien grisé et refuse le
   clic.

## Hors périmètre

- Filtrer par soignant ou par parcours dans la popup.
- Modifier ou annuler un rendez-vous existant depuis cette popup.
- Toute pagination au-delà des dix premiers créneaux.
