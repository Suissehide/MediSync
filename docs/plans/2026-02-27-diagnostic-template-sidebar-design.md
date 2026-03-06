# Design: Sidebar Templates Diagnostic Éducatif

## Contexte

La page `settings/diagnostic-template.tsx` existe déjà avec une liste inline (colonne `w-64`) + un éditeur à droite. L'objectif est de migrer la liste vers la sidebar globale (pattern identique à `diagnostic.sidebar.tsx`), et de nettoyer le contenu principal pour n'afficher que l'éditeur.

## Composants à créer / modifier

### 1. `store/useDiagnosticTemplateStore.ts` (nouveau)
Store Zustand simple (non persisté) :
- `selectedId: string | null`
- `setSelectedId: (id: string | null) => void`

### 2. `sidebar/diagnosticTemplate.sidebar.tsx` (nouveau)
Auto-suffisant, calqué sur `diagnostic.sidebar.tsx` :
- Fetch propre via `useDiagnosticTemplatesQuery`
- Lit/écrit `selectedId` depuis le store
- Header : "Templates" + bouton `+` qui crée directement (nom par défaut) et sélectionne
- Liste des templates avec sélection visuelle + bouton supprimer sur chaque item
- Empty state avec icône si aucun template

### 3. `sidebar/sidebar.tsx` (modification)
- Import `SidebarDiagnosticTemplate`
- Ajout `diagnosticTemplate: <SidebarDiagnosticTemplate />` dans `componentMap`

### 4. `settings/diagnostic-template.tsx` (refactor)
- `DashboardLayout components={['diagnosticTemplate']}`
- Contenu principal : éditeur seul (input nom + toggles champs), lit `selectedId` du store
- Empty state si aucun template sélectionné

### 5. `navbar.tsx` (modification)
- Ajout entrée "Diagnostics éducatifs" dans le menu Settings popover avec icône `BriefcaseMedical`

## Décisions clés
- Création template : directe (pas de popup), nom "Nouveau template", sélection immédiate
- Store non persisté (session uniquement, cohérent avec `useDiagnosticStore`)
- Pattern identique à `diagnostic.sidebar.tsx` pour la cohérence visuelle
