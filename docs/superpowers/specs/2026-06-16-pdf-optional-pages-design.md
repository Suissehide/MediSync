# Sélection de pages optionnelles dans le PDF du programme patient

## Contexte

Aujourd'hui, lorsqu'un utilisateur clique sur l'icône `FileDown` dans la page d'un patient (`front/src/routes/_authenticated/patient/$patientID.tsx:83-89`), une modale (`ProgrammePDFModal`) s'ouvre avec un aperçu du PDF généré via `@react-pdf/renderer`. Le PDF contient trois sections systématiques :

- `CoverPage` (page de garde)
- `CalendarPages` (planning multi-pages)
- `TipsPage` (conseils)

Aucune sélection n'est possible : l'utilisateur reçoit toujours ces trois sections.

## Objectif

Permettre à l'utilisateur de choisir, **avant le téléchargement**, des pages supplémentaires à inclure dans le PDF. Pour cette itération, on introduit **une seule page optionnelle** ("Page Test") afin de poser l'infrastructure ; les pages obligatoires (Cover, Calendar, Tips) restent toujours présentes.

## Décisions

1. La sélection est intégrée **dans la modale d'aperçu existante** (pas de popup intermédiaire).
2. Les cases à cocher sont placées dans le **header** de la modale, à côté du bouton "Télécharger".
3. L'aperçu PDF se **met à jour en live** quand l'utilisateur coche/décoche.
4. La "Page Test" est **décochée par défaut**.
5. La position de chaque page optionnelle dans le PDF n'est **pas configurable** pour cette itération : toutes les pages optionnelles cochées sont ajoutées **à la fin** du document, après `TipsPage`.

## Architecture

### Registre déclaratif des pages optionnelles

Nouveau fichier `front/src/components/custom/Patient/pdf/optional-pages.ts` :

```ts
import type { Patient } from '../../../../types/patient.ts'
import type { Slot } from '../../../../types/slot.ts'
import TestPage from './pages/test-page.pdf.tsx'

export interface OptionalPageDef {
  id: string
  label: string
  defaultEnabled: boolean
  Component: React.FC<{ patient: Patient; upcomingSlots: Slot[] }>
}

export const OPTIONAL_PAGES: OptionalPageDef[] = [
  {
    id: 'test',
    label: 'Page Test',
    defaultEnabled: false,
    Component: TestPage,
  },
]
```

Avantage : ajouter une nouvelle page optionnelle = pousser une entrée dans `OPTIONAL_PAGES`. Aucun autre fichier à modifier.

### Nouveau composant : `TestPage`

Nouveau fichier `front/src/components/custom/Patient/pdf/pages/test-page.pdf.tsx`. Composant `<Page>` react-pdf minimaliste contenant un titre centré "Page Test". Il suit la même structure de base (`StyleSheet`, `View`, `Text`) que les autres pages du dossier `pages/`, pour cohérence visuelle.

Il reçoit les mêmes props que les autres pages (`patient`, `upcomingSlots`) même s'il ne les utilise pas pour l'instant — cela permet aux futures pages optionnelles d'avoir une signature uniforme.

### Modification de `programme.pdf.tsx`

Le composant `ProgrammePDF` accepte une nouvelle prop :

```ts
interface ProgrammePDFProps {
  patient: Patient
  upcomingSlots: Slot[]
  enabledOptionalPageIds: string[]
}
```

Rendu :

```tsx
<Document>
  <CoverPage patient={patient} upcomingSlots={upcomingSlots} />
  <CalendarPages upcomingSlots={upcomingSlots} />
  <TipsPage />
  {OPTIONAL_PAGES
    .filter((p) => enabledOptionalPageIds.includes(p.id))
    .map((p) => (
      <p.Component key={p.id} patient={patient} upcomingSlots={upcomingSlots} />
    ))}
</Document>
```

### Modification de `programme-pdf-modal.tsx`

État local :

```ts
const [enabledOptionalPageIds, setEnabledOptionalPageIds] = useState<string[]>(
  () => OPTIONAL_PAGES.filter((p) => p.defaultEnabled).map((p) => p.id),
)
```

Helper toggle :

```ts
const toggleOptionalPage = (id: string) => {
  setEnabledOptionalPageIds((prev) =>
    prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
  )
}
```

`pdfDocument` est enveloppé dans un `useMemo` dépendant de `patient`, `patientSlots`, et `enabledOptionalPageIds`. À chaque toggle, le document est recalculé et `PDFViewer` + `PDFDownloadLink` réagissent automatiquement.

UI dans le header (ordre de gauche à droite) :

1. Titre `Aperçu du programme - {firstName} {lastName}`
2. Groupe de cases à cocher (une par page dans `OPTIONAL_PAGES`) — utilise le composant `Checkbox` shadcn existant avec un label cliquable.
3. Bouton "Télécharger" (existant)
4. Bouton de fermeture `X` (existant)

Layout indicatif :

```
[Aperçu du programme - Jean Dupont]  [☐ Page Test]  [Télécharger] [X]
```

## Flow utilisateur

1. L'utilisateur clique sur l'icône `FileDown` sur la fiche patient.
2. La modale s'ouvre. "Page Test" est **décochée**. L'aperçu affiche Cover + Calendar + Tips.
3. L'utilisateur coche "Page Test". L'aperçu se rafraîchit : Cover + Calendar + Tips + Test.
4. L'utilisateur clique "Télécharger". Le PDF téléchargé contient exactement les pages affichées dans l'aperçu.
5. L'utilisateur décoche → l'aperçu et le téléchargement reviennent à 3 pages.

## Vérification

Le projet n'a pas de tests unitaires dans `front/src/components/custom/Patient/pdf/`. Pas d'introduction de harness de test pour cette feature. **Vérification manuelle obligatoire** dans le navigateur avant de marquer la tâche terminée :

1. Ouvrir un patient → cliquer l'icône `FileDown`.
2. Confirmer que "Page Test" est décochée et que l'aperçu n'affiche pas la page Test.
3. Cocher "Page Test" → vérifier que l'aperçu se met à jour et inclut la page Test à la fin.
4. Cliquer "Télécharger" → ouvrir le PDF et confirmer qu'il contient la page Test.
5. Décocher → vérifier que la page disparaît dans l'aperçu.
6. Naviguer vers un autre patient, ouvrir la modale → confirmer que l'état initial est bien réinitialisé (case décochée).

## Hors-scope

- **Position configurable** des pages optionnelles : pour l'instant, toutes ajoutées en fin de document.
- **Persistance des préférences** : la sélection est ré-initialisée à chaque ouverture de la modale.
- **Plus d'une page optionnelle** : le registre est conçu pour en accueillir d'autres, mais on n'en livre qu'une.
- **Debounce / loading state** sur le rafraîchissement de l'aperçu : un léger flash de `PDFViewer` est acceptable.

## Fichiers impactés

**Créés :**
- `front/src/components/custom/Patient/pdf/optional-pages.ts`
- `front/src/components/custom/Patient/pdf/pages/test-page.pdf.tsx`

**Modifiés :**
- `front/src/components/custom/Patient/pdf/programme.pdf.tsx` — nouvelle prop `enabledOptionalPageIds`, rendu des pages optionnelles
- `front/src/components/custom/Patient/pdf/programme-pdf-modal.tsx` — état, toggle, `useMemo`, cases à cocher dans le header
