# Cycle de numérotation des semaines du planning

**Date :** 2026-09-17
**Statut :** Design validé

## Problème

Le planning du service affiche les semaines avec leur numéro ISO (`s1` à `s53`,
comptés depuis janvier). Ce repère ne correspond pas à la façon dont le service
raisonne : son organisation suit un **cycle** qui démarre à une semaine choisie
et se répète toutes les N semaines.

On veut pouvoir configurer, depuis la page planning, une semaine de départ et
une longueur de cycle, puis voir partout la position dans le cycle au lieu du
numéro ISO.

## Comportement attendu

### Numérotation

Avec une semaine de départ au lundi 05/01 et un cycle de 6 semaines :

| Semaine du | Numéro affiché |
|---|---|
| 22/12 | S5 |
| 29/12 | S6 |
| 05/01 | S1 |
| 12/01 | S2 |
| … | … |
| 09/02 | S6 |
| 16/02 | S1 |
| 23/02 | S2 |

- Le cycle est **cyclique** : après SN on repart à S1.
- Il **se prolonge vers l'arrière** : les semaines antérieures à la semaine de
  départ sont numérotées par le même modulo, il n'y a donc jamais de trou ni de
  discontinuité.
- Tant qu'**aucun cycle n'est configuré**, tous les affichages conservent le
  numéro ISO actuel. La fonctionnalité est opt-in et ne change rien à
  l'existant.

### Portée du réglage

Le réglage est **partagé par tous les utilisateurs** : il est stocké côté
serveur, pas dans le navigateur. Sa modification est réservée aux **ADMIN** ;
sa lecture est ouverte à tout utilisateur authentifié.

### Emplacements concernés

La numérotation de cycle remplace le numéro ISO dans quatre affichages :

1. **Vue Calendrier** — titre `s12 / 16 mars` → `S3 / 16 mars`.
2. **Vue Timeline** — colonne des numéros de semaine de la grille annuelle.
3. **Export PDF** — titre de page `Semaine 12` → `Semaine 3`.
4. **Popups « Dupliquer / Déplacer sur une semaine »** — rappel du numéro de
   cycle de la semaine cible sélectionnée.

**Hors périmètre, à ne pas toucher :** la numérotation relative aux *parcours*.
Le mode édition de parcours (`weekAnchorDate` dans `calendar.tsx`, et
`EditModeContent` dans les popups dupliquer/déplacer) compte déjà les semaines
depuis le début du parcours théorique — c'est une autre notion, indépendante du
cycle du service.

## Architecture

Approche retenue : **entité dédiée `PlanningCycle`, ligne unique côté serveur**.

Deux alternatives écartées :
- Une table clé/valeur générique `AppSetting { key, value Json }` : extensible
  sans migration, mais on perd le typage de bout en bout et on paie une
  abstraction pour un besoin qui n'existe pas encore (YAGNI).
- Des champs greffés sur une entité existante : le schéma ne contient aucune
  table de configuration globale, il faudrait en détourner une.

### Backend

#### Modèle Prisma

```prisma
model PlanningCycle {
  id          String   @id @default("default")
  startOfWeek DateTime @db.Date
  weekCount   Int
  updatedAt   DateTime @updatedAt
}
```

`startOfWeek` est toujours un lundi : la normalisation (`isoWeekday(1)`) est
faite dans le domaine, pas laissée à l'appelant. `weekCount` est borné à
`1..52`. La table contient au plus une ligne, d'id `"default"` — les écritures
passent par un `upsert` sur cet id, il n'y a donc pas de POST : `PUT` crée ou
met à jour indifféremment, et `DELETE` remet le planning en numérotation ISO.

Migration créée avec `npm run prisma:migrate:create`, puis
`npm run prisma:generate` (le client Prisma est généré dans `src/generated/`).

#### Fichiers, en miroir strict de `ForbiddenWeek`

- `back/src/main/domain/planningCycle.domain.ts`
  + `back/src/main/types/domain/planningCycle.domain.interface.ts`
- `back/src/main/infra/orm/repositories/planningCycle.repository.ts`
  + `back/src/main/types/infra/orm/repositories/planningCycle.repository.interface.ts`
- `back/src/main/interfaces/http/fastify/schemas/planningCycle.schema.ts`
- `back/src/main/interfaces/http/fastify/routes/planningCycle.ts`
- Enregistrement dans `awilix-ioc-container.ts`, `types/application/ioc.ts` et
  `routes/index.ts`.

#### Routes

**`GET /planning-cycle`** — `onRequest: [fastify.verifySessionCookie]`, ouvert à
tout utilisateur authentifié.

Réponse `200` :
```ts
{ startOfWeek: string, weekCount: number } | null
```
`null` quand aucun cycle n'est configuré.

**`PUT /planning-cycle`** — ADMIN uniquement, via le même contrôle que les
routes `ForbiddenWeek` :
```ts
const currentUser = await userDomain.findByID(request.user.userID)
if (currentUser?.role !== Role.ADMIN) {
  throw Boom.forbidden('Forbidden')
}
```

Corps (Zod) :
```ts
{
  startOfWeek: z.coerce.date(),
  weekCount: z.number().int().min(1).max(52),
}
```

Réponse `200` : l'objet enregistré. Réponse `403` : `{ message: string }`.

**`DELETE /planning-cycle`** — ADMIN uniquement. Supprime la ligne, ce qui fait
revenir tous les affichages aux numéros ISO. Réponse `204`.

### Calcul partagé (front)

Toute la logique de numérotation tient dans un util pur,
`front/src/utils/weekCycle.ts` :

```ts
export type PlanningCycle = { startOfWeek: string; weekCount: number }

export function cycleWeekNumber(date: Dayjs, cycle: PlanningCycle): number
```

Implémentation : modulo **positif** de
`date.startOf('isoWeek').diff(cycleStart.startOf('isoWeek'), 'week')` par
`weekCount`, puis `+ 1`. Le modulo positif (`((n % m) + m) % m`) est ce qui rend
le calcul valable avant la semaine de départ.

C'est la seule logique non triviale du lot : elle est développée en TDD et
testée isolément. Cas couverts :

- semaine de départ → `1` ;
- semaine suivante → `2` ;
- dernière semaine du cycle → `weekCount` ;
- semaine juste après la fin du cycle → retour à `1` ;
- semaine juste avant le départ → `weekCount` ;
- plusieurs cycles en arrière ;
- `weekCount = 1` → toujours `1` ;
- traversée d'un changement d'année ;
- une date en milieu de semaine donne le même numéro que son lundi.

Les quatre points d'affichage ne font qu'appeler cette fonction ; aucun ne
refait le calcul.

### Frontend

#### Accès aux données

- `front/src/api/planningCycle.api.ts` — `get`, `update`, `reset`, sur le
  modèle de `forbiddenWeek.api.ts` (`fetchWithAuth` + `handleHttpError`).
- `front/src/types/planningCycle.ts` — le type partagé.
- `front/src/queries/usePlanningCycle.ts` — `usePlanningCycleQueries()` et
  `usePlanningCycleMutations()`, calqués sur `useForbiddenWeek.ts` (toast sur
  succès et erreur, `invalidateQueries` en `onSettled`).
- Nouvelle clé de process dans `front/src/constants/process.constant.ts`.

#### Popup de configuration

`front/src/components/custom/popup/planningCycleForm.tsx`, bâtie sur les
primitives `Popup / PopupContent / PopupHeader / PopupTitle / PopupBody /
PopupFooter` déjà utilisées par les autres popups.

Contenu :
- **Semaine de départ** : le composant `WeekPicker` existant
  (`components/ui/weekPicker.tsx`).
- **Longueur du cycle** : le compteur −/+ déjà écrit dans
  `planning-export-modal.tsx`, borné à `1..52`.
- **Aperçu** : une ligne de texte qui confirme le réglage avant validation —
  « S1 = semaine du 05/01/2026, retour à S1 le 16/02/2026 ».
- **Pied** : « Annuler », « Enregistrer », et « Réinitialiser » (appelle
  `DELETE`, revient aux numéros ISO) affiché seulement si un cycle existe.

La popup est ouverte depuis un nouvel item du menu **Actions** de
`front/src/routes/_authenticated/_admin/settings/planning.tsx`, à côté de
« Exporter le planning (PDF) » :

```tsx
<DropdownMenu.Item onSelect={() => setCycleOpen(true)} …>
  <CalendarRange size={16} />
  Configurer le cycle de semaines
</DropdownMenu.Item>
```

L'item reste visible pour tous les utilisateurs ; c'est le serveur qui refuse
l'écriture aux non-ADMIN, et l'erreur remonte par le toast d'erreur de la
mutation.

#### Branchement des quatre affichages

1. **`front/src/components/custom/Calendar/calendar.tsx`** — nouvelle prop
   optionnelle `planningCycle`. Dans `titleFormat`, la branche `anchorMonday`
   (mode édition de parcours) est **inchangée** ; c'est la branche par défaut
   qui remplace `s${start.isoWeek()}` par `S${cycleWeekNumber(start, cycle)}`
   quand un cycle est fourni.

2. **Vue Timeline** (même fichier de route, instance `FullCalendar` de la vue
   `multiMonthYear`) — on remplace `weekNumberFormat={{ week: 'numeric' }}` par
   `weekNumberCalculation={(date) => cycleWeekNumber(dayjs.utc(date), cycle)}`
   quand un cycle est configuré, et on garde le comportement ISO sinon.
   `weekNumberCalculation` accepte une fonction en FullCalendar 6.

3. **Export PDF** — `buildPlanningWeeks`
   (`front/src/components/custom/planning/pdf/planning-pdf.utils.ts`) reçoit le
   cycle en paramètre optionnel et renseigne un champ `weekLabel` à côté de
   l'actuel `isoWeek`. `planning-weeks.pdf.tsx` affiche `weekLabel`.
   `planning-export-modal.tsx` lit le cycle via le hook et le transmet.

4. **Popups dupliquer / déplacer** —
   `bulkDuplicateForm.tsx` et `bulkMoveForm.tsx` reçoivent le cycle en prop
   optionnelle. Seul `NormalModeContent` est modifié : la phrase de rappel
   « Semaine du 05 janvier au 09 janvier » devient « S1 — semaine du 05 janvier
   au 09 janvier ». `EditModeContent` (semaine cible du *parcours*) reste
   inchangé.

## Gestion des erreurs

- Cycle absent (`null`) : tous les affichages retombent sur le numéro ISO. C'est
  l'état initial en base, donc le chemin par défaut.
- `GET` en échec : `useDataFetching` affiche déjà l'erreur, et l'absence de
  cycle fait retomber sur l'ISO — le planning reste utilisable.
- `PUT`/`DELETE` refusés (403 non-ADMIN) : toast d'erreur de la mutation, le
  réglage affiché n'est pas modifié.
- `weekCount` hors bornes : rejeté par Zod côté serveur (400) et par le
  compteur borné côté client.

## Tests

- **Unitaires (back)** : `PlanningCycleDomain`, en TDD avec un repository
  factice, sur le modèle de `src/test/unit/domain/patient.domain.test.ts` —
  normalisation de `startOfWeek` sur le lundi ISO, et rejet d'un `weekCount`
  hors bornes.
- **Front** : le projet n'a aucun runner de test (ni script `test`, ni fichier
  de test). Décision prise : on n'en introduit pas dans le cadre de cette
  feature. `cycleWeekNumber` est donc couvert par une **vérification manuelle
  scriptée**, avec les dates de la table « Numérotation » ci-dessus contrôlées
  une à une dans l'interface — en particulier les semaines **antérieures** à la
  semaine de départ, où une erreur de modulo négatif ne se verrait pas
  autrement.
- **Routes back** : vérification manuelle via Bruno (`back/bruno/`), le harnais
  e2e n'existant pas encore dans le projet.
- **Vérification manuelle d'ensemble** : configurer un cycle de 6 semaines,
  contrôler la cohérence des quatre affichages, puis le retour aux numéros ISO
  après réinitialisation.

## Hors périmètre

- La numérotation relative aux parcours (mode édition), qui reste ISO-agnostique
  et inchangée.
- Tout historique ou versionnement du réglage : une seule valeur courante.
- Plusieurs cycles simultanés (par service, par parcours) : un seul cycle global.
- Le tableau de bord (`dashboard.tsx`) et la vue planning du dossier patient
  (`planning.patient.tsx`) restent en numérotation ISO : ils rendent le même
  composant `Calendar` sans lui passer `planningCycle`. C'est une limitation
  assumée de cette itération, la spec n'énumérant que les quatre emplacements
  de la page planning ci-dessus. Cette page est elle-même sous le garde de
  route `_admin`, donc tous les emplacements branchés sont réservés aux
  ADMIN : un soignant non-ADMIN ne voit jamais la numérotation de cycle.
  Étendre le tableau de bord et la vue patient coûterait deux lignes par vue,
  le composant `Calendar` acceptant déjà la prop.
