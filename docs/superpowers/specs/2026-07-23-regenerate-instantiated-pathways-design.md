# Régénérer les parcours instanciés depuis le théorique mis à jour

**Date :** 2026-07-23
**Statut :** Design validé

## Problème

Quand on modifie un `PathwayTemplate` (le parcours « théorique »), les parcours
déjà instanciés (`Pathway`) ne reflètent pas les changements. On veut, depuis la
page planning admin, déclencher une action qui met à jour les parcours
instanciés à partir d'une date, en régénérant leurs créneaux selon le nouveau
théorique — **sans perdre les rendez-vous déjà pris**.

## Comportement attendu

- On agit sur les `Pathway` d'un `PathwayTemplate` donné dont `startDate ≥ fromDate`.
- Pour chaque parcours concerné :
  - Les **créneaux vides** (`Slot` sans `Appointment`) sont **supprimés** et
    **régénérés** depuis le nouveau théorique.
  - Les **créneaux avec au moins un `Appointment`** sont **conservés intacts**
    (les rendez-vous ne sont jamais modifiés ni supprimés).
- **Anti-doublon :** si un créneau conservé (avec RDV) correspond déjà à une étape
  du nouveau théorique, cette étape n'est pas recréée.
- Les `ForbiddenWeek` sont respectées lors du calcul des dates régénérées
  (réutilisation de la logique d'instanciation existante).

## Architecture

Approche retenue : **endpoint backend dédié**, toute la logique côté serveur dans
une transaction. Le front ne fait qu'un appel.

### Backend — `POST /pathway/regenerate`

**Fichiers concernés :**
- Route : `back/src/main/interfaces/http/fastify/routes/pathway.ts`
- Schéma : `back/src/main/interfaces/http/fastify/schemas/pathway.schema.ts`
- Domaine : `back/src/main/domain/pathway.domain.ts` (+ interface)
- Repository : `back/src/main/infra/orm/repositories/pathway.repository.ts` (+ interface)

**Entrée (Zod) :**
```ts
{
  pathwayTemplateID: z.cuid(),
  fromDate: z.coerce.date(),
}
```

**Logique (transaction Prisma) :**
1. Charger le `PathwayTemplate` cible + ses `SlotTemplate` (le nouveau théorique).
   Si introuvable → 404.
2. Trouver les `Pathway` où `templateID = pathwayTemplateID` et `startDate ≥ fromDate`.
3. Pour chaque parcours, charger ses `Slot` avec leurs `Appointment` :
   - Partitionner : créneaux **vides** (0 appointment) vs **occupés** (≥ 1 appointment).
   - Supprimer les créneaux vides (et leur `SlotTemplate` cloné associé).
4. Régénérer depuis le nouveau théorique : pour chaque `SlotTemplate` théorique,
   calculer la date/heure cible (`pathway.startDate + offsetDays`, ajustée pour les
   `ForbiddenWeek`, via la logique d'instanciation existante).
   - **Anti-doublon :** si un créneau conservé correspond déjà à cette étape
     (même date de créneau + même heure de début), ne pas recréer.
   - Sinon, cloner le `SlotTemplate` + créer le `Slot` rattaché au parcours.

**Sortie :**
```ts
{ pathwaysUpdated: number, slotsDeleted: number, slotsKept: number, slotsCreated: number }
```

### Frontend — bouton « Actions » + popup

**Fichiers concernés :**
- Page : `front/src/routes/_authenticated/_admin/settings/planning.tsx`
- API : `front/src/api/pathway.api.ts`
- Nouveau composant de dialog (dans le dossier des composants du planning)

**UI :**
- Bouton **« Actions »** dans la barre d'outils du planning, en `DropdownMenu`
  (extensible), avec une entrée : **« Mettre à jour les parcours instanciés »**.
- **Dialog** :
  - `Select` du `PathwayTemplate` (templates existants).
  - Champ **date** « À partir du » (les parcours de ce template avec
    `startDate ≥ date` seront régénérés).
  - Bouton **« Appliquer »** + confirmation simple (rappel : créneaux vides
    régénérés, RDV conservés).
  - À la validation : appel `POST /pathway/regenerate`, toast de résultat, puis
    invalidation TanStack Query pour rafraîchir le calendrier.
- Fonction API front : `regeneratePathways({ pathwayTemplateID, fromDate })`.

## Gestion d'erreurs

- Validation Zod de l'entrée.
- Template introuvable → 404.
- Aucun parcours concerné → succès avec résumé à zéro (pas une erreur), indiqué
  dans le toast.
- Opération transactionnelle : échec → rollback complet, rien n'est modifié.

## Vérification (manuelle)

Le projet n'a pas de suite de tests automatisés. Vérification manuelle après
implémentation :
- Parcours avec créneaux vides uniquement → tous régénérés.
- Parcours avec un créneau ayant un RDV → créneau conservé, RDV intact, pas de
  doublon pour cette étape.
- Parcours dont `startDate < fromDate` → ignoré.
- Nouveau théorique avec une étape ajoutée / supprimée → reflété dans les créneaux
  vides régénérés.
- Respect des `ForbiddenWeek` dans les dates régénérées.

## Hors périmètre

- Aucune sélection visuelle des parcours sur le calendrier (filtre template + date
  uniquement).
- Aucun aperçu/dry-run avant exécution (confirmation simple seulement).
- Les rendez-vous existants ne sont jamais modifiés.
