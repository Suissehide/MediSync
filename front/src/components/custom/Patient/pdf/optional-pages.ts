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
