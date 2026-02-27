import { create } from 'zustand'

interface DiagnosticState {
  selectedId: string | null
  editMode: boolean
  setSelectedId: (id: string | null) => void
  setEditMode: (editMode: boolean) => void
}

export const useDiagnosticStore = create<DiagnosticState>()((set) => ({
  selectedId: null,
  editMode: false,
  setSelectedId: (id) => set({ selectedId: id }),
  setEditMode: (editMode) => set({ editMode }),
}))
