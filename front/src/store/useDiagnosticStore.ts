import { create } from 'zustand'

interface DiagnosticState {
  selectedId: string | null
  setSelectedId: (id: string | null) => void
}

export const useDiagnosticStore = create<DiagnosticState>()((set) => ({
  selectedId: null,
  setSelectedId: (id) => set({ selectedId: id }),
}))
