# Filtre parcours sur le planning admin

Date : 2026-08-11
Portée : `front/src/routes/_authenticated/_admin/settings/planning.tsx`, plus une
correction ponctuelle du schéma de réponse `pathway` côté back.

## Problème

La page `/settings/planning` affiche en vue Calendrier l'intégralité des créneaux
(`useAllSlotsQuery`), tous parcours confondus. Il n'existe aucun moyen de se
concentrer sur un ou plusieurs parcours, ni de distinguer visuellement les
parcours à inscription unique des parcours multi-inscriptions.

## Solution

Un bouton `Parcours` placé immédiatement à gauche du bouton `Actions` dans
l'en-tête de la page. Il ouvre un menu déroulant de cases à cocher qui masque ou
affiche les créneaux du calendrier selon le parcours auquel ils appartiennent.

### Structure du menu

```
[ Filter Parcours · 2 masqués ▾ ]  [ Settings2 Actions ]  [ Cal | Timeline ]
┌────────────────────────────────┐
│ ☑ ○ Hors parcours              │
│ ────────────────────────────── │
│ INDIVIDUELS                    │
│ ☑ ● Suivi diététique           │
│ ☐ ● Bilan initial              │
│ ────────────────────────────── │
│ MULTIPLES                      │
│ ☑ ● Parcours BPCO              │
│ ☐ ● Parcours Obésité           │
│ ────────────────────────────── │
│ ↺ Tout afficher                │
└────────────────────────────────┘
```

- `Hors parcours` est une entrée isolée **en haut** du menu, avant les deux
  sections. Elle couvre les créneaux sans parcours rattaché (`slot.pathway`
  absent), qui ne relèvent ni de la section individuels ni de la section
  multiples.
- Section **INDIVIDUELS** : les `pathwayTemplates` dont
  `firstAppointmentOnly === true` (libellé du formulaire de parcours :
  « Inscription au premier RDV uniquement »).
- Section **MULTIPLES** : les `pathwayTemplates` dont
  `firstAppointmentOnly === false`.
- Chaque modèle de parcours apparaît dans **exactement une** section, puisque le
  critère porte sur le modèle et non sur le créneau.
- Les deux sections listent tous les `pathwayTemplates`, y compris ceux sans
  créneau instancié, pour que la liste reste stable. Une section vide (aucun
  modèle du côté concerné) n'est pas rendue, séparateur compris.
- Chaque entrée de parcours porte une pastille de la couleur du modèle
  (`pathwayTemplate.color`) ; `Hors parcours` porte une pastille neutre.
- `Tout afficher` réinitialise le filtre. L'entrée n'est rendue que lorsqu'au
  moins une case est décochée.

### Comportement

- État initial : toutes les cases cochées, donc aucun créneau masqué.
- Décocher une entrée retire du calendrier les créneaux du parcours
  correspondant. Le filtre est purement visuel : aucune requête, aucune
  mutation.
- Le libellé du bouton affiche le nombre d'entrées décochées quand le filtre est
  actif (`Parcours · 2 masqués`), et `Parcours` seul sinon.
- Le bouton n'est rendu que si `!editMode && view === 'calendar'` :
  - en vue Timeline, les événements sont des blocs de parcours entiers
    (`pathwayEvents`), la distinction individuel/multiple n'y a pas de sens ;
  - en mode édition, le calendrier affiche les `slotTemplates` du modèle en
    cours d'édition, qui n'ont pas de parcours instancié.
- Aucune persistance : le filtre est un état de composant, réinitialisé au
  rechargement de la page.
- Un parcours créé après l'ouverture de la page est visible par défaut (voir
  choix de représentation de l'état ci-dessous).

## Implémentation

### Prérequis back : exposer l'`id` du modèle de parcours

`GET /slots` renvoie `slot.pathway.template`, mais l'`id` du modèle n'atteint
jamais le front. `pathwaySchema` (`schemas/index.ts`) déclare
`template: pathwayTemplateSchema`, et `pathwayTemplateSchema` ne comporte pas de
champ `id` ; le `serializerCompiler` de `fastify-type-provider-zod` parse la
réponse avec ce schéma, et Zod strippe les clés inconnues. Vérifié en reproduisant
la structure de schéma : seules `name`, `color`, `tags`, `motifRequired` et
`firstAppointmentOnly` survivent à la sérialisation.

Correction, dans `back/src/main/interfaces/http/fastify/schemas/pathway.schema.ts` :

```ts
export const pathwayResponseSchema = pathwaySchema.extend({
  id: z.cuid(),
  template: pathwayTemplateSchema.extend({ id: z.cuid() }).optional().nullable(),
})
```

(`pathwayTemplateSchema` est importé depuis `./index`, comme `pathwaySchema`.)

Changement purement additif : pas de migration, pas de modification du
repository — `slot.repository.ts` fait déjà `pathway: { include: { template: true } }`,
l'`id` est présent en base et n'était que masqué à la sortie. Le type
`Pathway` du front déclare déjà `template.id`, il n'y a donc rien à y changer.

Alternative écartée : rapprocher les créneaux des modèles par `template.name`.
Les noms sont libres et modifiables, donc non fiables comme clé.

### Nouveau composant

`front/src/components/custom/planning/pathwayFilter.tsx` — composant de
présentation sans état ni accès aux queries.

Props :

- `templates: PathwayTemplate[]`
- `hiddenIds: Set<string>`
- `onToggle(id: string): void`
- `onReset(): void`

Construit avec `@radix-ui/react-dropdown-menu` (`Root` / `Trigger` / `Portal` /
`Content` / `CheckboxItem` / `Label` / `Separator` / `Item`), en reprenant les
classes du menu `Actions` existant dans `planning.tsx` pour rester homogène.

### Modifications de `planning.tsx`

- Constante de module `NO_PATHWAY_KEY = '__no_pathway__'`, clé de l'entrée
  `Hors parcours`.
- Nouvel état `hiddenPathwayIds: Set<string>`. On stocke les entrées **masquées**
  plutôt que les visibles : un `Set` vide signifie « tout visible », ce qui évite
  d'initialiser l'état de façon asynchrone quand `pathwayTemplates` arrive, et
  rend visible par défaut tout parcours créé ensuite.
- `visibleSlots` (`useMemo`) : renvoie `slots` tel quel si `hiddenPathwayIds` est
  vide, sinon filtre sur `slot.pathway?.template?.id ?? NO_PATHWAY_KEY`
  (l'`id` étant rendu disponible par la correction back ci-dessus).
- Le `useEffect` qui alimente `events` consomme `visibleSlots` au lieu de
  `slots`.
- Rendu du composant dans l'en-tête, avant le bloc `DropdownMenu` de `Actions`,
  sous la condition `!editMode && view === 'calendar'`.

Ce qui n'est pas touché : `pathwayEvents` (Timeline), `eventTemplates` (mode
édition), `forbiddenWeekBackgroundEvents`, et toutes les mutations.

### Sélection multiple

La sélection de créneaux (`selectedSlotIds`) est indépendante du filtre. Masquer
un parcours ne désélectionne pas ses créneaux : ils restent dans la sélection et
les actions groupées continuent de s'appliquer. C'est cohérent avec le fait que
le filtre est un simple masque d'affichage, et évite une perte de sélection
silencieuse.

## Vérification

Le front n'a pas d'infrastructure de test (`front/package.json` ne définit que
`dev`, `build`, `lint`, `preview`). Vérification par :

1. `cd back && npm run lint && npx tsc --noemit`
2. `cd front && npx tsc -b`
3. `cd front && npm run lint`
4. Vérifier que `GET /slots` renvoie bien `pathway.template.id` (requête Bruno ou
   onglet réseau) — sans quoi le filtre masquerait tout comme « hors parcours ».
5. Contrôle manuel sur `/settings/planning` :
   - le bouton apparaît en vue Calendrier hors mode édition, disparaît en
     Timeline et en mode édition ;
   - décocher un parcours retire ses créneaux, `Tout afficher` les rétablit ;
   - décocher `Hors parcours` retire les créneaux créés à la main ;
   - un modèle avec « Inscription au premier RDV uniquement » coché apparaît bien
     sous INDIVIDUELS, les autres sous MULTIPLES.

## Hors périmètre

- Filtrage de la vue Timeline.
- Persistance du filtre entre deux sessions.
- Filtrage par thématique, lieu ou soignant.
- Toute modification du modèle de données Prisma (le seul changement back est
  l'ajout de l'`id` du modèle dans le schéma de réponse).
