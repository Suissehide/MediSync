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
}

export const usePathwayTemplateEditStore = create<
  PathwayTemplateEditState & PathwayTemplateEditActions
>((set) => ({
  editMode: false,
  startDate: '',
  currentPathwayTemplate: null,

  setEditMode: (mode) => set({ editMode: mode }),
  setStartDate: (date) => set({ startDate: date }),
  setPathwayTemplate: (template, startDate) =>
    set({
      currentPathwayTemplate: template,
      editMode: true,
      startDate,
    }),
  clearPathwayTemplate: () =>
    set({
      currentPathwayTemplate: null,
      editMode: false,
      startDate: '',
    }),
}))
