import { create } from 'zustand'

interface DiagnosticState {
  selectedId: string | null
  setSelectedId: (id: string | null) => void
  reset: () => void
}

export const useDiagnosticStore = create<DiagnosticState>()((set) => ({
  selectedId: null,
  setSelectedId: (id) => set({ selectedId: id }),
  // Appelee au changement de contexte : une selection en cours ne veut rien
  // dire dans un autre service.
  reset: () => set({ selectedId: null }),
}))
