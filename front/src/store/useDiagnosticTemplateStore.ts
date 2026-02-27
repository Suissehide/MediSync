import { create } from 'zustand'

interface DiagnosticTemplateState {
  selectedId: string | null
  setSelectedId: (id: string | null) => void
}

export const useDiagnosticTemplateStore = create<DiagnosticTemplateState>()((set) => ({
  selectedId: null,
  setSelectedId: (id) => set({ selectedId: id }),
}))
