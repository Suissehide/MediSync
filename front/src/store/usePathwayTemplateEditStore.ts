import type { PathwayTemplate } from '../types/pathwayTemplate'
import { create } from 'zustand'

interface PathwayTemplateEditState {
  editMode: boolean
  startDate: string
  currentPathwayTemplate: PathwayTemplate | null
}

interface PathwayTemplateEditActions {
  setEditMode: (mode: boolean) => void
  setStartDate: (date: string) => void
  setPathwayTemplate: (template: PathwayTemplate, startDate: string) => void
  clearPathwayTemplate: () => void
  reset: () => void
}

const initialState: PathwayTemplateEditState = {
  editMode: false,
  startDate: '',
  currentPathwayTemplate: null,
}

export const usePathwayTemplateEditStore = create<
  PathwayTemplateEditState & PathwayTemplateEditActions
>((set) => ({
  ...initialState,

  setEditMode: (mode) => set({ editMode: mode }),
  setStartDate: (date) => set({ startDate: date }),
  setPathwayTemplate: (template, startDate) =>
    set({
      currentPathwayTemplate: template,
      editMode: true,
      startDate,
    }),
  clearPathwayTemplate: () => set(initialState),
  // Appelee au changement de contexte : une edition en cours ne veut rien
  // dire dans un autre service.
  reset: () => set(initialState),
}))
