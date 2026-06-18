# PDF Optional Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow the user to toggle optional pages (starting with a single "Page Test") in the patient programme PDF, via switches in the existing preview modal that update the preview live.

**Architecture:** A declarative registry (`OPTIONAL_PAGES`) lists each optional page with its id, label, default state, and `<Page>` component. `ProgrammePDF` filters the registry by an `enabledOptionalPageIds` prop and appends the matching pages after `TipsPage`. `ProgrammePDFModal` keeps the selection in local state, exposes a switch per registry entry in the header, and memoizes the document so `PDFViewer` and `PDFDownloadLink` re-render when the selection changes.

**Tech Stack:** React 19, TypeScript, `@react-pdf/renderer` v4.3.2, Radix UI Switch (existing shadcn wrapper at `front/src/components/ui/switch.tsx`), Tailwind CSS.

**Test strategy:** This codebase has no automated tests under `front/src/components/custom/Patient/pdf/`. Adding a test harness for `@react-pdf/renderer` components is out of scope per the design. Verification is **manual in the browser** (see Task 4).

---

## File Structure

**Created:**
- `front/src/components/custom/Patient/pdf/optional-pages.ts` — typed registry `OPTIONAL_PAGES` and helper to derive the default-enabled ids
- `front/src/components/custom/Patient/pdf/pages/test-page.pdf.tsx` — minimal `<Page>` component used as the first optional page

**Modified:**
- `front/src/components/custom/Patient/pdf/programme.pdf.tsx` — accepts `enabledOptionalPageIds`, renders matching registry entries after `TipsPage`
- `front/src/components/custom/Patient/pdf/programme-pdf-modal.tsx` — local state for selection, toggle UI in the header, memoized `pdfDocument`

---

## Task 1: Create the TestPage component and the optional-pages registry

**Files:**
- Create: `front/src/components/custom/Patient/pdf/pages/test-page.pdf.tsx`
- Create: `front/src/components/custom/Patient/pdf/optional-pages.ts`

- [ ] **Step 1: Create the TestPage component**

Path: `front/src/components/custom/Patient/pdf/pages/test-page.pdf.tsx`

```tsx
import { Page, StyleSheet, Text, View } from '@react-pdf/renderer'

import type { Patient } from '../../../../../types/patient.ts'
import type { Slot } from '../../../../../types/slot.ts'

const styles = StyleSheet.create({
  testPage: {
    padding: 36,
    fontFamily: 'Helvetica',
    backgroundColor: '#ffffff',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 32,
    fontFamily: 'Helvetica-Bold',
    color: '#221755',
  },
})

interface TestPageProps {
  patient: Patient
  upcomingSlots: Slot[]
}

export default function TestPage(_props: TestPageProps) {
  return (
    <Page size="A4" style={styles.testPage}>
      <View>
        <Text style={styles.title}>Page Test</Text>
      </View>
    </Page>
  )
}
```

Notes:
- The component accepts `patient` and `upcomingSlots` so every optional page has the same signature; the placeholder uses neither for now. Prefixing with `_` keeps the linter happy.
- The style block mirrors the conventions in `tips-page.pdf.tsx` (Helvetica/Helvetica-Bold, `#221755` for the brand purple, padding 36).

- [ ] **Step 2: Create the optional-pages registry**

Path: `front/src/components/custom/Patient/pdf/optional-pages.ts`

```ts
import type React from 'react'

import type { Patient } from '../../../../types/patient.ts'
import type { Slot } from '../../../../types/slot.ts'
import TestPage from './pages/test-page.pdf.tsx'

export interface OptionalPageProps {
  patient: Patient
  upcomingSlots: Slot[]
}

export interface OptionalPageDef {
  id: string
  label: string
  defaultEnabled: boolean
  Component: React.FC<OptionalPageProps>
}

export const OPTIONAL_PAGES: OptionalPageDef[] = [
  {
    id: 'test',
    label: 'Page Test',
    defaultEnabled: false,
    Component: TestPage,
  },
]

export function getDefaultEnabledOptionalPageIds(): string[] {
  return OPTIONAL_PAGES.filter((p) => p.defaultEnabled).map((p) => p.id)
}
```

- [ ] **Step 3: Type-check the front package**

Run from the repo root:

```bash
cd front && npx tsc --noEmit
```

Expected: no errors. (Two new files compile; nothing else is imported from them yet.)

- [ ] **Step 4: Commit**

```bash
git add front/src/components/custom/Patient/pdf/pages/test-page.pdf.tsx \
        front/src/components/custom/Patient/pdf/optional-pages.ts
git commit -m "feat(pdf): add TestPage and optional pages registry"
```

---

## Task 2: Render optional pages in ProgrammePDF

**Files:**
- Modify: `front/src/components/custom/Patient/pdf/programme.pdf.tsx`

- [ ] **Step 1: Update ProgrammePDF to accept and render the optional pages**

Replace the full content of `front/src/components/custom/Patient/pdf/programme.pdf.tsx` with:

```tsx
import { Document } from '@react-pdf/renderer'

import type { Patient } from '../../../../types/patient.ts'
import type { Slot } from '../../../../types/slot.ts'
import { OPTIONAL_PAGES } from './optional-pages.ts'
import CalendarPages from './pages/calendar-pages.pdf.tsx'
import CoverPage from './pages/cover-page.pdf.tsx'
import TipsPage from './pages/tips-page.pdf.tsx'

interface ProgrammePDFProps {
  patient: Patient
  upcomingSlots: Slot[]
  enabledOptionalPageIds: string[]
}

export default function ProgrammePDF({
  patient,
  upcomingSlots,
  enabledOptionalPageIds,
}: ProgrammePDFProps) {
  const optionalPages = OPTIONAL_PAGES.filter((p) =>
    enabledOptionalPageIds.includes(p.id),
  )

  return (
    <Document>
      <CoverPage patient={patient} upcomingSlots={upcomingSlots} />
      <CalendarPages upcomingSlots={upcomingSlots} />
      <TipsPage />
      {optionalPages.map((p) => (
        <p.Component
          key={p.id}
          patient={patient}
          upcomingSlots={upcomingSlots}
        />
      ))}
    </Document>
  )
}
```

Notes:
- Optional pages appear after `TipsPage` (per spec).
- The iteration order is the order in `OPTIONAL_PAGES`, so adding pages to the registry naturally orders them.

- [ ] **Step 2: Type-check the front package**

```bash
cd front && npx tsc --noEmit
```

Expected: a single error in `programme-pdf-modal.tsx` complaining that `enabledOptionalPageIds` is missing on `<ProgrammePDF ... />`. That's expected; Task 3 fixes it.

- [ ] **Step 3: Commit**

```bash
git add front/src/components/custom/Patient/pdf/programme.pdf.tsx
git commit -m "feat(pdf): render optional pages in ProgrammePDF"
```

---

## Task 3: Add the toggle UI and state to ProgrammePDFModal

**Files:**
- Modify: `front/src/components/custom/Patient/pdf/programme-pdf-modal.tsx`

- [ ] **Step 1: Replace the modal with the new version**

Replace the full content of `front/src/components/custom/Patient/pdf/programme-pdf-modal.tsx` with:

```tsx
import { PDFDownloadLink, PDFViewer } from '@react-pdf/renderer'
import dayjs from 'dayjs'
import { Download, X } from 'lucide-react'
import { useMemo, useState } from 'react'

import { useAllSlotsQuery } from '../../../../queries/useSlot.ts'
import type { Patient } from '../../../../types/patient.ts'
import { Button } from '../../../ui/button.tsx'
import { Switch } from '../../../ui/switch.tsx'
import {
  getDefaultEnabledOptionalPageIds,
  OPTIONAL_PAGES,
} from './optional-pages.ts'
import ProgrammePDF from './programme.pdf.tsx'

interface ProgrammePDFModalProps {
  patient: Patient
  onClose: () => void
  previewMode?: boolean // true = affiche le viewer, false = télécharge directement
}

export default function ProgrammePDFModal({
  patient,
  onClose,
  previewMode = true,
}: ProgrammePDFModalProps) {
  const { slots } = useAllSlotsQuery()

  const [enabledOptionalPageIds, setEnabledOptionalPageIds] = useState<
    string[]
  >(() => getDefaultEnabledOptionalPageIds())

  const toggleOptionalPage = (id: string) => {
    setEnabledOptionalPageIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    )
  }

  const patientSlots = useMemo(() => {
    if (!slots || !patient) {
      return []
    }

    const now = dayjs()
    const filtered = slots.filter((slot) =>
      slot.appointments?.some((appointment) =>
        appointment.appointmentPatients?.some(
          (ap) => ap.patient.id === patient.id,
        ),
      ),
    )

    return filtered
      .filter((s) => dayjs(s.startDate).isAfter(now))
      .sort((a, b) => dayjs(a.startDate).diff(dayjs(b.startDate)))
  }, [slots, patient])

  const fileName = `programme-${patient.lastName}-${patient.firstName}-${dayjs.utc().format('YYYY-MM-DD')}.pdf`

  const pdfDocument = useMemo(
    () => (
      <ProgrammePDF
        patient={patient}
        upcomingSlots={patientSlots}
        enabledOptionalPageIds={enabledOptionalPageIds}
      />
    ),
    [patient, patientSlots, enabledOptionalPageIds],
  )

  return (
    <div className="fixed inset-0 z-150 flex items-center justify-center bg-black/50">
      <div className="bg-background rounded-lg shadow-xl w-[90vw] h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 className="text-lg font-semibold">
            Aperçu du programme - {patient.firstName} {patient.lastName}
          </h2>
          <div className="flex items-center gap-4">
            {OPTIONAL_PAGES.length > 0 && (
              <div className="flex items-center gap-3">
                {OPTIONAL_PAGES.map((page) => {
                  const checked = enabledOptionalPageIds.includes(page.id)
                  return (
                    <label
                      key={page.id}
                      className="flex items-center gap-2 text-sm cursor-pointer"
                    >
                      <Switch
                        checked={checked}
                        onCheckedChange={() => toggleOptionalPage(page.id)}
                      />
                      <span>{page.label}</span>
                    </label>
                  )
                })}
              </div>
            )}
            <PDFDownloadLink document={pdfDocument} fileName={fileName}>
              {({ loading }) => (
                <Button variant="default" size="default" disabled={loading}>
                  <Download className="h-4 w-4" />
                  {loading ? 'Génération...' : 'Télécharger'}
                </Button>
              )}
            </PDFDownloadLink>
            <Button variant="outline" size="icon" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* PDF Viewer */}
        {previewMode && (
          <div className="flex-1 overflow-hidden">
            <PDFViewer width="100%" height="100%" showToolbar={false}>
              {pdfDocument}
            </PDFViewer>
          </div>
        )}
      </div>
    </div>
  )
}
```

Notes:
- The `Switch` component is the existing project pattern for toggles (`front/src/components/ui/switch.tsx`) — there is no Checkbox component in the UI kit and the design accepted "cases à cocher" generically.
- `pdfDocument` is now wrapped in `useMemo` so a toggle change reuses the same JSX reference for unchanged dependencies; both `PDFViewer` and `PDFDownloadLink` receive the updated document when `enabledOptionalPageIds` changes.
- The label wraps the Switch + text so clicking the label also toggles the switch (Radix Switch listens to the wrapping label).
- The `OPTIONAL_PAGES.length > 0` guard keeps the header clean if the registry is ever emptied.

- [ ] **Step 2: Type-check the front package**

```bash
cd front && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Lint the changed files**

```bash
cd front && npx biome check src/components/custom/Patient/pdf
```

Expected: no errors. (If biome flags unused imports or formatting issues, run `npx biome check --write src/components/custom/Patient/pdf` and re-check.)

- [ ] **Step 4: Commit**

```bash
git add front/src/components/custom/Patient/pdf/programme-pdf-modal.tsx
git commit -m "feat(pdf): add optional pages toggle to programme PDF modal"
```

---

## Task 4: Manual verification in the browser

**Files:** none modified.

This codebase has no automated test harness for `@react-pdf/renderer` components. Verification is manual.

- [ ] **Step 1: Start the dev server**

In one terminal:

```bash
cd front && npm run dev
```

In another terminal, start the backend if not already running (refer to `back/CLAUDE.md` for the exact command — typically `cd back && npm run dev`).

- [ ] **Step 2: Open a patient with at least one upcoming slot**

In the browser, log in, navigate to `/patient`, and click any patient that has future appointments (so the calendar pages are non-empty).

- [ ] **Step 3: Verify the initial state**

Click the `FileDown` icon in the patient header. Expected:
- The modal opens.
- A switch labelled "Page Test" appears in the header, **off**.
- The PDF preview shows Cover → Calendar → Tips (no Test page at the end).

- [ ] **Step 4: Toggle Page Test on**

Click the "Page Test" switch (or its label). Expected:
- The switch turns on.
- The preview refreshes (a brief flash is acceptable).
- The last page in the preview is a centered "Page Test" title.

- [ ] **Step 5: Download with Page Test on**

Click "Télécharger". Open the downloaded PDF. Expected:
- 4 sections present: Cover, Calendar pages, Tips, Page Test (in that order).

- [ ] **Step 6: Toggle off and re-download**

Toggle the switch off → confirm the preview drops the Test page. Click "Télécharger" → confirm the new PDF has 3 sections only.

- [ ] **Step 7: Reset on reopen**

Close the modal (the `X` button), then reopen it on the same patient. Expected:
- "Page Test" is off again (state reset on remount, as designed — persistence is out of scope).

- [ ] **Step 8: Cross-patient sanity**

Go back to `/patient`, pick another patient, open the modal. Expected:
- "Page Test" off by default, preview matches the new patient's data.

- [ ] **Step 9: Final commit (none expected)**

If steps 1–8 passed without code changes, there is nothing to commit. If you discovered any fix during verification, commit it with a clear message before moving on.

```bash
git status
```

Expected: clean working tree (or only un-related local files like `.env`).

---

## Self-Review Notes

**Spec coverage check:**
- Optional registry + TestPage → Task 1.
- ProgrammePDF rendering optional pages after Tips → Task 2.
- Modal local state, header toggles, live preview update via `useMemo` → Task 3.
- Manual verification (browser, dev server, golden path + edge cases) → Task 4.
- "Page Test" decochée par défaut → enforced by `defaultEnabled: false` in registry.
- State reset on modal close → no persistence layer; `useState` initialiser runs each mount.
- Out-of-scope items (configurable position, persistence, multiple optional pages, debounce) → not implemented anywhere.

**Type consistency:**
- `OptionalPageDef.id` is `string` everywhere; `enabledOptionalPageIds: string[]` matches.
- `OptionalPageProps` shape (`patient`, `upcomingSlots`) matches `TestPage`'s props and the spread in `ProgrammePDF`.

**Placeholder scan:** None found — all code blocks are full, all paths exact, all commands runnable.
