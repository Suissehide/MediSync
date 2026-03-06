# Diagnostic Template Sidebar Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Migrer la liste des templates de diagnostic éducatif vers la sidebar globale, en suivant exactement le pattern de `diagnostic.sidebar.tsx`.

**Architecture:** Nouveau store Zustand `useDiagnosticTemplateStore` pour le `selectedId`. Nouveau composant `diagnosticTemplate.sidebar.tsx` auto-suffisant (fetch propre + store). Refactor de `diagnostic-template.tsx` pour n'afficher que l'éditeur dans le contenu principal, avec `DashboardLayout components={['diagnosticTemplate']}`.

**Tech Stack:** React, Zustand, TanStack Query, TanStack Router, Lucide, Tailwind CSS

---

### Task 1: Store Zustand `useDiagnosticTemplateStore`

**Files:**
- Create: `front/src/store/useDiagnosticTemplateStore.ts`

**Step 1: Créer le store**

```ts
import { create } from 'zustand'

interface DiagnosticTemplateState {
  selectedId: string | null
  setSelectedId: (id: string | null) => void
}

export const useDiagnosticTemplateStore = create<DiagnosticTemplateState>()((set) => ({
  selectedId: null,
  setSelectedId: (id) => set({ selectedId: id }),
}))
```

**Step 2: Vérifier TypeScript**

```bash
cd front && npx tsc --noEmit
```
Expected: aucune erreur

**Step 3: Commit**

```bash
git add front/src/store/useDiagnosticTemplateStore.ts
git commit -m "feat(store): add useDiagnosticTemplateStore for template selection"
```

---

### Task 2: Sidebar `diagnosticTemplate.sidebar.tsx`

**Files:**
- Create: `front/src/components/custom/sidebar/diagnosticTemplate.sidebar.tsx`

**Step 1: Créer le composant**

Calqué exactement sur `front/src/components/custom/sidebar/diagnostic.sidebar.tsx`.

```tsx
import { LayoutTemplate, Loader2Icon, Plus, Trash2 } from 'lucide-react'

import {
  useDiagnosticTemplateMutations,
  useDiagnosticTemplatesQuery,
} from '../../../queries/useDiagnosticEducatif.ts'
import { useDiagnosticTemplateStore } from '../../../store/useDiagnosticTemplateStore.ts'
import { Button } from '../../ui/button.tsx'

function SidebarDiagnosticTemplate() {
  const { selectedId, setSelectedId } = useDiagnosticTemplateStore()
  const { templates, isPending } = useDiagnosticTemplatesQuery()
  const { createTemplate, deleteTemplate } = useDiagnosticTemplateMutations()

  const handleCreate = () => {
    createTemplate.mutate(
      { name: 'Nouveau template', activeFields: [] },
      { onSuccess: (t) => setSelectedId(t.id) },
    )
  }

  return (
    <>
      <div className="pl-4 pr-2 flex justify-between items-center text-text-sidebar py-2">
        <p>Templates</p>
        <Button variant="gradient" size="icon" onClick={handleCreate}>
          <Plus className="w-5 h-5" />
        </Button>
      </div>

      <div className="px-2 pb-2 flex-1 flex flex-col min-h-0">
        {isPending ? (
          <div className="h-full flex justify-center items-center">
            <Loader2Icon className="size-10 animate-spin text-foreground" />
          </div>
        ) : (
          <ul className="flex-1 flex flex-col min-h-0 space-y-2 overflow-y-auto">
            {(!templates || templates.length === 0) && (
              <li className="bg-sidebar rounded-xl text-xs text-text-sidebar text-center py-36 flex flex-col items-center gap-2">
                <LayoutTemplate className="w-6 h-6 opacity-40" />
                Aucun template
              </li>
            )}
            {templates?.map((t) => {
              const isSelected = selectedId === t.id
              return (
                <li
                  key={t.id}
                  className={`group rounded border transition-all ${
                    isSelected
                      ? 'border-border-dark shadow-sm bg-primary/10'
                      : 'border-border-sidebar bg-sidebar'
                  }`}
                >
                  <div className="flex items-center gap-3 px-3 py-2">
                    <button
                      type="button"
                      onClick={() => setSelectedId(t.id)}
                      className="flex items-center gap-3 flex-1 min-w-0 text-left cursor-pointer"
                    >
                      <div className="flex-shrink-0 w-8 h-8 rounded-md flex items-center justify-center bg-primary/10 text-primary">
                        <LayoutTemplate className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-text truncate">{t.name}</div>
                        <div className="text-xs text-text-light">
                          {t.activeFields.length} champ(s) actif(s)
                        </div>
                      </div>
                    </button>
                    <Button
                      variant="none"
                      size="icon-sm"
                      className="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                      onClick={() => {
                        deleteTemplate.mutate(t.id, {
                          onSuccess: () => {
                            if (selectedId === t.id) setSelectedId(null)
                          },
                        })
                      }}
                    >
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </>
  )
}

export default SidebarDiagnosticTemplate
```

**Step 2: Vérifier TypeScript**

```bash
cd front && npx tsc --noEmit
```
Expected: aucune erreur

**Step 3: Commit**

```bash
git add front/src/components/custom/sidebar/diagnosticTemplate.sidebar.tsx
git commit -m "feat(sidebar): add SidebarDiagnosticTemplate component"
```

---

### Task 3: Enregistrer dans `sidebar.tsx`

**Files:**
- Modify: `front/src/components/custom/sidebar/sidebar.tsx`

**Step 1: Ajouter l'import et l'entrée dans `componentMap`**

Dans `sidebar.tsx`, après l'import de `SidebarDiagnostic` :
```tsx
import SidebarDiagnosticTemplate from './diagnosticTemplate.sidebar.tsx'
```

Dans `componentMap` :
```tsx
diagnosticTemplate: <SidebarDiagnosticTemplate />,
```

**Step 2: Vérifier TypeScript**

```bash
cd front && npx tsc --noEmit
```

**Step 3: Commit**

```bash
git add front/src/components/custom/sidebar/sidebar.tsx
git commit -m "feat(sidebar): register SidebarDiagnosticTemplate in componentMap"
```

---

### Task 4: Refactor `diagnostic-template.tsx`

**Files:**
- Modify: `front/src/routes/_authenticated/_admin/settings/diagnostic-template.tsx`

**Step 1: Réécrire la page**

La liste inline est supprimée. Le contenu principal = éditeur seul, qui lit `selectedId` depuis le store. `DashboardLayout` reçoit `components={['diagnosticTemplate']}`.

```tsx
import { createFileRoute } from '@tanstack/react-router'
import { LayoutTemplate } from 'lucide-react'
import { useEffect, useState } from 'react'

import DashboardLayout from '../../../../components/dashboard.layout.tsx'
import { Switch } from '../../../../components/ui/switch.tsx'
import { DIAGNOSTIC_SECTIONS } from '../../../../constants/diagnosticEducatif.constant.ts'
import {
  useDiagnosticTemplateMutations,
  useDiagnosticTemplatesQuery,
} from '../../../../queries/useDiagnosticEducatif.ts'
import { useDiagnosticTemplateStore } from '../../../../store/useDiagnosticTemplateStore.ts'
import type { DiagnosticEducatifTemplate } from '../../../../types/diagnosticEducatif.ts'

export const Route = createFileRoute(
  '/_authenticated/_admin/settings/diagnostic-template',
)({ component: DiagnosticTemplateSettings })

function DiagnosticTemplateSettings() {
  const { selectedId } = useDiagnosticTemplateStore()
  const { templates } = useDiagnosticTemplatesQuery()
  const { updateTemplate } = useDiagnosticTemplateMutations()

  const editing = templates?.find((t) => t.id === selectedId) ?? null
  const [editingName, setEditingName] = useState('')

  useEffect(() => {
    if (editing) setEditingName(editing.name)
  }, [editing?.id])

  const handleToggleField = (template: DiagnosticEducatifTemplate, fieldId: string) => {
    const activeFields = template.activeFields.includes(fieldId)
      ? template.activeFields.filter((id) => id !== fieldId)
      : [...template.activeFields, fieldId]
    updateTemplate.mutate({ id: template.id, activeFields })
  }

  return (
    <DashboardLayout components={['diagnosticTemplate']}>
      <div className="flex flex-col gap-4 h-full">
        <h1 className="text-xl font-semibold text-text-dark">
          Templates de diagnostic éducatif
        </h1>

        {!editing && (
          <div className="flex flex-col items-center justify-center flex-1 gap-3 text-text-light">
            <LayoutTemplate className="h-10 w-10" />
            <p className="text-sm">Sélectionnez ou créez un template dans la barre latérale</p>
          </div>
        )}

        {editing && (
          <div className="flex flex-col gap-4">
            <input
              className="h-9 rounded-md border border-border bg-background px-3 text-sm font-medium focus:outline-none focus:ring-1 focus:ring-ring w-72"
              value={editingName}
              onChange={(e) => setEditingName(e.target.value)}
              onBlur={() => {
                if (editingName !== editing.name) {
                  updateTemplate.mutate({ id: editing.id, name: editingName })
                }
              }}
            />

            {DIAGNOSTIC_SECTIONS.map((section) => (
              <div key={section.id} className="border border-border rounded-lg p-4">
                <h3 className="text-sm font-semibold text-text-dark mb-3">{section.label}</h3>
                <div className="flex flex-col gap-2 pl-2">
                  {section.fields.map((field) => (
                    <div key={field.id} className="flex items-center gap-3">
                      <Switch
                        checked={editing.activeFields.includes(field.id)}
                        onCheckedChange={() => handleToggleField(editing, field.id)}
                      />
                      <span className="text-sm text-text-dark">{field.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}
```

**Step 2: Vérifier TypeScript**

```bash
cd front && npx tsc --noEmit
```

**Step 3: Commit**

```bash
git add front/src/routes/_authenticated/_admin/settings/diagnostic-template.tsx
git commit -m "refactor(settings): migrate template list to global sidebar"
```

---

### Task 5: Ajouter l'entrée dans le menu Settings (`navbar.tsx`)

**Files:**
- Modify: `front/src/components/navbar.tsx`

**Step 1: Ajouter l'import de l'icône et l'entrée**

Ajouter `BriefcaseMedical` dans l'import Lucide existant.

Dans `SettingsMenu`, ajouter après l'entrée "Thématiques" :
```tsx
<PopoverMenuItem
  icon={<BriefcaseMedical className="w-4 h-4" />}
  onClick={() => router.navigate({ to: '/settings/diagnostic-template' })}
>
  Diagnostics éducatifs
</PopoverMenuItem>
```

**Step 2: Vérifier TypeScript**

```bash
cd front && npx tsc --noEmit
```

**Step 3: Commit**

```bash
git add front/src/components/navbar.tsx
git commit -m "feat(navbar): add Diagnostics éducatifs entry in settings menu"
```
