# Multi-soignant par créneau (SlotTemplate)

## Contexte

Aujourd'hui, un `SlotTemplate` est lié à **un seul** `Soignant` via une clé étrangère unique optionnelle (`soignantID`). Les thématiques proposées dans le formulaire de création/édition d'un créneau sont filtrées par les thématiques associées à ce soignant unique.

On veut autoriser **0 ou plusieurs** soignants par créneau et afficher l'union de leurs thématiques.

## Choix structurants

- **Portée** : uniquement `SlotTemplate` (et donc `Slot` qui pointe vers lui). `Appointment` n'est pas modifié — il continue d'hériter du soignant via son slot.
- **Cardinalité** : 0..N soignants par créneau. Pas de soignant principal, pas de minimum.
- **Thématique** : reste **un champ texte unique** par créneau (`SlotTemplate.thematic: string`). Seule la liste de choix proposée dans l'UI change : union dédupliquée des thématiques de tous les soignants sélectionnés.
- **Migration BDD** : pas de préservation des données existantes. Reset de la BDD de dev + mise à jour du `seed.ts`.

## Modèle de données (Prisma)

Dans `back/prisma/schema.prisma` :

**Avant** (extrait `SlotTemplate`) :
```prisma
model SlotTemplate {
  // ...
  soignantID String?
  soignant   Soignant? @relation(fields: [soignantID], references: [id])
  // ...
}

model Soignant {
  // ...
  slotTemplates SlotTemplate[]
  // ...
}
```

**Après** :
```prisma
model SlotTemplate {
  // ...
  soignants Soignant[] @relation("SlotTemplateSoignants")
  // ...
}

model Soignant {
  // ...
  slotTemplates SlotTemplate[] @relation("SlotTemplateSoignants")
  // ...
}
```

Prisma génère automatiquement la table de jointure `_SlotTemplateSoignants(A, B)`. Aucun champ supplémentaire (ordre, rôle) — relation pure.

**Migration** : `npm run prisma:migrate:dev` génère et applique la migration. Comme la colonne `soignantID` est supprimée et qu'aucune donnée n'est préservée, Prisma émettra des warnings de perte de données — ils sont attendus et acceptés (BDD dev).

**Seed** (`back/prisma/seed.ts`) : adapter la création des `SlotTemplate` pour utiliser `soignants: { connect: [{ id: soignantA.id }, { id: soignantB.id }] }` au lieu de `soignantID: soignantA.id`. Maintenir au moins un créneau avec un soignant, un avec plusieurs, et un avec aucun pour tester les trois cas.

## Backend

### Types domain (`back/src/main/types/domain/slotTemplate.domain.interface.ts`)

- Renommer `SlotTemplateWithSoignantDomain` en `SlotTemplateWithSoignantsDomain`. Champ `soignants: SoignantEntityDomain[]` (jamais null, tableau vide possible).
- `SlotTemplateDTODomain` : remplacer `soignant: SoignantEntityDomain | null` par `soignants: SoignantEntityDomain[]`.
- `SlotTemplateCreateEntityDomain` : remplacer `soignantID?: string` par `soignantIDs?: string[]`. Sémantique : `undefined` = aucun soignant ; `[]` = aucun soignant ; tableau non vide = liste à connecter.
- `SlotTemplateUpdateEntityDomain` : remplacer `soignantID?: string` par `soignantIDs?: string[]`. Sémantique : `undefined` = pas de changement ; `[]` = retirer tous les soignants ; tableau non vide = remplacer par cette liste.

### Repository (`back/src/main/infra/orm/repositories/slotTemplate.repository.ts`)

- `findAll`, `findByID` : `include: { soignants: true }` au lieu de `include: { soignant: true }`.
- `create` : si `soignantIDs` est fourni, mapper vers `soignants: { connect: soignantIDs.map(id => ({ id })) }` dans le `data` Prisma.
- `update` : si `soignantIDs` est fourni (même `[]`), mapper vers `soignants: { set: soignantIDs.map(id => ({ id })) }`. `set` remplace l'intégralité de la relation — gère ajout, retrait et réordonnancement en une seule opération.
- Adapter aussi `slot.repository.ts` qui inclut le slotTemplate : `include: { slotTemplate: { include: { soignants: true, ... } } }`.

### Schemas Zod

**`back/src/main/interfaces/http/fastify/schemas/slotTemplate.schema.ts`** :
- `slotTemplateResponseSchema` : remplacer `soignant: soignantResponseSchema.extend({ id: z.cuid() }).optional().nullable()` par `soignants: z.array(soignantResponseSchema.extend({ id: z.cuid() }))`.
- `createSlotTemplateSchema` : remplacer `.extend({ soignantID: z.cuid().optional(), templateID: ... })` par `.extend({ soignantIDs: z.array(z.cuid()).optional(), templateID: ... })`.
- `updateSlotTemplateByIdSchema.body` : même substitution.

**`back/src/main/interfaces/http/fastify/schemas/slot.schema.ts`** : le bloc inline `slotTemplate` utilisé dans `CreateSlotBody` contient `soignantID` — appliquer la même substitution `soignantID` → `soignantIDs: z.array(z.cuid()).optional()`. La réponse slot expose `slotTemplate.soignants: Soignant[]`.

### Routes

Pas de changement structurel dans `routes/slot.ts` et `routes/slotTemplate.ts`. Les contrôleurs forwardent `soignantIDs` vers le domain sans transformation. Les réponses suivent automatiquement le nouveau schema Zod (`soignants` au lieu de `soignant`).

### Endpoints affectés (vue récap)

- `POST /slot` (ou équivalent) : body accepte `slotTemplate.soignantIDs: string[]` au lieu de `slotTemplate.soignantID: string`.
- `PATCH /slot-template/:id` : body accepte `soignantIDs: string[]`.
- Toutes les réponses contenant un `slotTemplate` renvoient `soignants: Soignant[]`.

## Frontend

### Types

- `front/src/types/slotTemplate.ts` : `soignant?: Soignant | null` → `soignants: Soignant[]`.
- `front/src/types/slot.ts` : dérivé via `slotTemplate.soignants`.

### Composants — formulaires d'édition

**Schéma de form partagé** (`front/src/components/custom/sheet/form/eventFormOpts.ts`) :
- `EventFormValues.soignant: string` → `soignantIDs: string[]`.
- `defaultValues` : `soignantIDs: []`.

**`front/src/components/custom/popup/addSlotForm.tsx`** :
- Store du formulaire : remplacer le champ `soignant: string` (ligne 77) par `soignantIDs: string[]` (default `[]`).
- Remplacer le `field.Select` du soignant (ligne 269) par un usage direct du composant `MultiSelect` (`front/src/components/ui/select.tsx:241`), enveloppé dans un `<form.Field name="soignantIDs">` et utilisant `field.state.value` / `field.handleChange`. Pattern identique à celui de `addAppointmentForm.tsx:242` ou `editSoignantThematicsForm.tsx:137`.
- Supprimer la validation `onSubmit: if (!value) 'Ce champ est requis'` (lignes 259-265) — la cardinalité 0..N rend le soignant optionnel.
- Calcul `thematicOptions` (lignes 137-143) :
  ```ts
  const selectedSoignants = soignants.filter(s => soignantIDs.includes(s.id))
  const thematicOptions = useMemo(() => {
    const set = new Map<string, { value: string; label: string }>()
    for (const soignant of selectedSoignants) {
      for (const t of thematics?.filter(t => t.soignants.some(ss => ss.id === soignant.id)) ?? []) {
        set.set(t.id, { value: t.name, label: t.name })
      }
    }
    return [...set.values()].sort((a, b) => a.label.localeCompare(b.label, 'fr'))
  }, [selectedSoignants, thematics])
  ```
- `useEffect` qui reset la thématique (lignes 145-149) : déclenche un reset uniquement si la valeur courante n'est plus présente dans `thematicOptions` (au lieu de reset à chaque changement de soignant).
- Placeholder/disabled du champ thématique : disabled si `soignantIDs.length === 0` OU `thematicOptions.length === 0`.
- Soumission : envoyer `soignantIDs` au backend.

**`front/src/components/custom/sheet/eventTemplateSheet.tsx`** :
- `defaultValues` (lignes 55, 106) : `soignantIDs: slotTemplate?.soignants?.map(s => s.id) ?? []`.
- Body de mutation : `soignantIDs: value.soignantIDs` au lieu de `soignantID: value.soignant`.
- Mêmes substitutions de Select → MultiSelect que `addSlotForm.tsx`.
- Mêmes adaptations sur le calcul `thematicOptions` et le reset conditionnel.

**`front/src/components/custom/sheet/eventSheet.tsx`** :
- Mêmes changements que `eventTemplateSheet.tsx` aux lignes 60-61, 77-82, 133-134 : champ form `soignantIDs`, lecture initiale depuis `slot.slotTemplate?.soignants?.map(s => s.id) ?? []`, soumission `soignantIDs`.

### Composants — consommateurs (lecture)

**`front/src/components/custom/popup/addAppointmentForm.tsx`** :
- Prop `soignant?: Soignant` (ligne 36) → `soignants: Soignant[]` (default `[]` si non passé).
- Calcul `thematicOptions` (lignes 102-110) : union dédupliquée sur l'ensemble des `soignants` reçus, même logique que ci-dessus.
- Affichage du nom (ligne 190) : `soignant?.name ?? 'Aucun soignant associé'` devient `soignants.length > 0 ? soignants.map(s => s.name).join(', ') : 'Aucun soignant associé'`.

**`front/src/components/custom/Patient/view/planning.patient.tsx`** :
- Renommer l'état `selectedSlotSoignant` (singulier) en `selectedSlotSoignants` (tableau).
- Toutes les lectures `slot.slotTemplate?.soignant ?? undefined` (lignes 189, 200, 215, 224, 229) → `slot.slotTemplate?.soignants ?? []`.
- Le prop passé à `addAppointmentForm` (lignes 318, 329) : `soignants={selectedSlotSoignants}`.

**`front/src/components/custom/Patient/view/overview.patient.tsx`** :
- Ligne 37 : `slot.slotTemplate?.soignant?.name` → `slot.slotTemplate?.soignants.map(s => s.name).join(', ')` (liste complète des noms séparée par virgule).
- Ligne 56 : `{soignant ?? thematic}` devient `{soignantsLabel || thematic}` où `soignantsLabel` est la string vide si pas de soignant, sinon la liste jointe.

**`front/src/components/custom/Calendar/calendar.tsx`** :
- Ligne 122 : le type `CalendarEvent.extendedProps.soignant?: string` est un label d'affichage (non un filtre). Le renommer en `soignantsLabel?: string` pour clarté, ou le laisser tel quel et y stocker la string jointe. Décision : **laisser le nom `soignant?: string`** (changement minimal) et y mettre la liste jointe des noms.

**`front/src/libs/utils.ts`** (constructeurs d'événements calendrier) :
- Ligne 75 (`buildCalendarEventsFromSlots`) : `title: slot.slotTemplate?.soignant?.name ?? 'Soignant inconnu'` → `title: slot.slotTemplate?.soignants?.length ? slot.slotTemplate.soignants.map(s => s.name).join(', ') : 'Soignant inconnu'`.
- Ligne 112 (`buildCalendarEventsFromSlotTemplates`) : même substitution.

**`front/src/routes/_authenticated/dashboard.tsx`** (filtre de soignant) :
- Ligne 49 : état `slotSoignant: Soignant | undefined` → `slotSoignants: Soignant[]` (passé à `addAppointmentForm`).
- Ligne 55 : filtre `slot.slotTemplate?.soignant?.id === selectedID` → `slot.slotTemplate?.soignants?.some(s => s.id === selectedID)`. Comportement attendu : un créneau multi-soignant apparaît si l'un de ses soignants correspond au filtre sélectionné. Le filtre lui-même reste sur **un seul** soignant (pas de changement de l'UI de filtre).
- Ligne 94 : `setSlotSoignant(slot?.slotTemplate?.soignant ?? undefined)` → `setSlotSoignants(slot?.slotTemplate?.soignants ?? [])`.

**`front/src/queries/useSlot.ts`** (ligne 160, mutation optimistic update) :
- Le champ `soignant: oldSlot.slotTemplate.soignant` dans le rollback → `soignants: oldSlot.slotTemplate.soignants`. Sinon, l'optimistic update casse la forme du cache.

### Non modifié

- **`front/src/components/custom/Patient/pdf/pages/calendar-pages.pdf.tsx`** : continue à n'afficher que `slot.slotTemplate?.thematic`. Pas de changement.
- **`front/src/queries/useSlot.ts`** (hors la ligne 160 mentionnée ci-dessus) : pas de changement structurel — les types des réponses suivent automatiquement le nouveau schema backend.

## Tests à valider manuellement

Après implémentation, vérifier dans l'app :
1. Créer un créneau avec 0 soignant — la liste de thématiques est vide/désactivée et le créneau se crée.
2. Créer un créneau avec 1 soignant — comportement identique à l'existant.
3. Créer un créneau avec 3 soignants ayant des thématiques chevauchantes — l'union dédupliquée est proposée.
4. Éditer un créneau pour ajouter/retirer des soignants — la persistance est correcte (vérifier en BDD).
5. Sur la vue patient (planning) — affichage des noms multiples en liste, RDV récupère bien l'union des thématiques disponibles.
6. Sur la vue overview patient — liste des soignants séparée par virgule s'affiche correctement.
7. Filtre soignant du calendrier — un créneau multi-soignant apparaît si on filtre sur l'un quelconque de ses soignants.

## Hors scope (explicitement)

- Ordre des soignants dans la liste (utilisera l'ordre naturel Prisma).
- Notion de soignant "principal" ou de rôles (animateur/co-animateur).
- Migration des données de production (BDD dev uniquement).
- Affichage des soignants dans le PDF calendrier.
- Modification du champ `Appointment.thematic` (reste un string unique).
