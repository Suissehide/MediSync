# Patient pathway priority — design

## Context

Sur la page `Patient/$id` (`front/src/components/custom/Patient/view/overview.patient.tsx`), la section "Parcours" liste les `PathwayTemplate` auxquels le patient est inscrit. Actuellement :

- Chaque carte affiche le **nom** du template.
- Les parcours sont dérivés côté client à partir de `useAllSlotsQuery` (download de tous les slots, filtre par `patient.id`).
- La page de garde du PDF (`front/src/components/custom/Patient/pdf/pages/cover-page.pdf.tsx`) concatène les **noms** de tous les parcours avec `' / '`.

## Goal

1. Remplacer le nom du template par ses **tags** (`PathwayTemplate.tags: String[]`) dans la liste des parcours.
2. Permettre à l'utilisateur de **réordonner** les parcours par drag & drop, avec une priorité **persistée en base et par patient**.
3. Sur la couverture du PDF, ne montrer que les tags du parcours en première position (priorité la plus haute), au lieu de tous les noms.

## Non-goals

- Ne pas modifier `displayOrder` sur `PathwayTemplate` (c'est l'ordre global utilisé dans la sidebar du planning admin).
- Ne pas refactoriser la liste des rendez-vous "À venir / Passés" de la même page (elle continue d'utiliser `useAllSlotsQuery`).
- Ne pas modifier les autres consommateurs de `useAllSlotsQuery` (`planning.patient.tsx`, `programme-pdf-modal.tsx`, dashboard, settings/planning).

## Data model

Un `Pathway` peut techniquement être partagé entre plusieurs patients (séances de groupe : un Pathway agrège plusieurs slots, chaque slot peut avoir plusieurs `AppointmentPatient`). La priorité doit donc être stockée **par (patient, pathway)**, pas sur `Pathway` directement.

Nouvelle table de jonction dans `prisma/schema.prisma` :

```prisma
model PatientPathwayPriority {
  patientID String
  pathwayID String
  priority  Int

  patient Patient @relation(fields: [patientID], references: [id], onDelete: Cascade)
  pathway Pathway @relation(fields: [pathwayID], references: [id], onDelete: Cascade)

  @@id([patientID, pathwayID])
  @@index([patientID, priority])
}
```

Relations inverses ajoutées sur `Patient` et `Pathway` (`pathwayPriorities PatientPathwayPriority[]`).

**Sémantique** : `priority = 0` est le plus prioritaire (s'affiche en premier, c'est lui qui apparaît sur le PDF). Un parcours sans entrée tombe en queue (priorité considérée comme `+Infinity`). On crée des entrées **paresseusement** : à la première réorganisation explicite par l'utilisateur, on insère 0..n-1 pour tous les parcours actuellement affichés. Pas besoin d'instrumenter chaque chemin d'enrôlement (`enroll`, `enrollExisting`, etc.).

## Backend

### Migration
- `npm run prisma:migrate:create -- --name add_patient_pathway_priority` puis ajout des champs comme ci-dessus.

### Repository
Étendre `patient.repository.ts` avec une seule méthode :
- `setPathwayPriorities(patientID: string, orderedPathwayIDs: string[]): Promise<void>` — transaction atomique qui `deleteMany({ patientID })` puis `createMany` avec `priority = index`.

Étendre la lecture des pathways d'un patient :
- Ajouter `getPathwaysForPatient(patientID)` → retourne `[{ pathwayID, templateID, templateName, templateColor, templateTags, startDate, priority }]` trié par `priority ASC NULLS LAST`, puis `pathway.startDate ASC` comme tie-break.

### Route HTTP
Nouveau routeur `interfaces/http/fastify/routes/patient/pathways.ts` (ou ajouts dans `patient.ts` existant) :
- `GET /patients/:id/pathways` → liste triée comme ci-dessus.
- `PUT /patients/:id/pathway-priorities` body `{ pathwayIDs: string[] }` — validation Zod : array de cuid, len > 0. Toutes les routes protégées par `verifySessionCookie`.
- Schémas Zod dans `interfaces/http/fastify/schemas/patient.schema.ts` (ou un fichier dédié).

### Domain
Pas de logique métier complexe : pass-through `PatientDomain.setPathwayPriorities` → repo. Garde la cohérence de couche.

## Frontend

### API + queries
- `front/src/api/patient.api.ts` :
  - `getPathways(patientID)` → `GET /patients/:id/pathways`.
  - `reorderPathways(patientID, pathwayIDs)` → `PUT /patients/:id/pathway-priorities`.
- `front/src/queries/usePatient.tsx` :
  - `usePatientPathwaysQuery(patientID)` → `queryKey: ['patient', patientID, 'pathways']`.
  - Mutation `reorderPatientPathways` dans `usePatientMutations` : optimistic update via `queryClient.setQueryData` (réécrit l'ordre + priorité), rollback en cas d'erreur (même pattern que `reorderPathwayTemplates` dans `usePathwayTemplate.ts:208`).

### Carte parcours (refonte de `PathwayCard` dans `overview.patient.tsx:88-132`)

Reprend le pattern DnD natif HTML5 de `front/src/components/custom/pathwaySelector.tsx:94-111` :

- State `draggedIndex: number | null` dans `OverviewPatient` (les cartes ne sont pas autonomes — il faut un state partagé pour réordonner).
- Chaque carte est un `<li draggable onDragStart onDragOver onDragEnd>`.
- `onDragOver` : `preventDefault`, splice/insert dans une copie locale de la liste (réordonnancement visuel instantané via `queryClient.setQueryData`).
- `onDragEnd` : déclenche `reorderPatientPathways.mutate({ patientID, pathwayIDs })` avec la nouvelle liste d'IDs, reset `draggedIndex`.
- Visuel : `GripVertical` à gauche (icône lucide), `cursor-move` sur la zone draggable, `opacity-50` sur l'élément en cours de drag.
- **Contenu de la carte** : à la place du nom du template, afficher **toutes les pastilles** des `templateTags` (style identique aux pastilles déjà en place dans `PathwayCard:109-118` : `inline-block px-2 py-1 rounded text-xs font-medium border`, fond `hexToRGBA(color, 0.15)`, texte `getContrastTextColor(color)`, bord `hexToRGBA(color, 0.6)`).
- Fallback si `templateTags` est vide → afficher le nom du template (sinon la carte serait vide et inutilisable).
- Date de début + bouton X de suppression conservés.

### Remplacement de la dérivation `patientPathways`
- Supprimer le `useMemo patientPathways` dans `overview.patient.tsx:163-192` (qui itère sur `slots`).
- Remplacer par les données de `usePatientPathwaysQuery(patient.id)`.
- `useAllSlotsQuery` reste utilisé pour les listes "À venir / Passés".

## PDF cover

Dans `cover-page.pdf.tsx:103-145` :
- Le composant `CoverPage` ne reçoit plus seulement `patient` + `upcomingSlots`, mais aussi la liste triée des parcours du patient (déjà chargée par la query). À transmettre depuis `programme-pdf-modal.tsx`.
- Remplacer la construction de `pathwayNames` (l. 112-116) par :
  - `firstPathway = sortedPathways[0]`
  - `programLabel = firstPathway?.templateTags?.length ? firstPathway.templateTags.join(' / ') : firstPathway?.templateName ?? 'Programme'`
- Fallbacks : pas de parcours → `'Programme'` (comportement actuel).

## Edge cases

- Patient sans aucun parcours → section "Parcours" cachée (comportement actuel conservé).
- Patient avec un seul parcours → DnD non bloquant mais sans effet ; carte affichable, pas d'erreur.
- Suppression d'un parcours (bouton X existant) → cascade sur `PatientPathwayPriority` via `onDelete: Cascade`, pas d'incohérence.
- Nouveau parcours ajouté **après** un premier réordonnancement → pas d'entrée dans la table, donc tombe en queue (`+Infinity`). La prochaine action drag&drop normalise les priorités.

## Testing

- Pas de framework de test installé pour l'instant dans ce repo (CLAUDE.md indique que `src/test/` n'existe pas encore). On valide manuellement :
  - Vérifier que le drag&drop met à jour l'ordre visuel et persiste (refresh → ordre conservé).
  - Vérifier que la couverture PDF reflète bien les tags du parcours #1 après reordering.
  - Vérifier la cascade : supprimer un parcours (X) puis recharger → pas d'entrée orpheline.
  - Vérifier l'optimistic update : couper le réseau, drag → UI bouge, erreur visible, ordre revient.

## Layered impact summary

| Couche | Fichier | Type d'impact |
|---|---|---|
| Prisma | `prisma/schema.prisma` | Nouvelle table + relations |
| Prisma | `prisma/migrations/*` | Nouvelle migration |
| Domain | `domain/patient.domain.ts` | Méthode `setPathwayPriorities` |
| Repo | `infra/orm/repositories/patient.repository.ts` | `getPathwaysForPatient`, `setPathwayPriorities` |
| HTTP | `interfaces/http/fastify/routes/patient.ts` | 2 nouvelles routes |
| HTTP | `interfaces/http/fastify/schemas/patient.schema.ts` | Schemas Zod request/response |
| Front API | `api/patient.api.ts` | 2 helpers |
| Front queries | `queries/usePatient.tsx` | Query + mutation |
| Front UI | `components/custom/Patient/view/overview.patient.tsx` | Refonte de `PathwayCard` + DnD + suppression de la dérivation depuis slots |
| Front PDF | `components/custom/Patient/pdf/pages/cover-page.pdf.tsx` | Source = parcours triés au lieu de slots |
| Front PDF | `components/custom/Patient/pdf/programme-pdf-modal.tsx` | Passer la liste triée des parcours en prop |
