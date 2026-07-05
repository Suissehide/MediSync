import { create } from 'zustand'

interface LoaderState {
  pendingCount: number
  isLoading: boolean
  startLoading: () => void
  stopLoading: () => void
}

export const useLoaderStore = create<LoaderState>()((set) => ({
  pendingCount: 0,
  isLoading: false,
  startLoading: () =>
    set((state) => {
      const pendingCount = state.pendingCount + 1
      return { pendingCount, isLoading: pendingCount > 0 }
    }),
  stopLoading: () =>
    set((state) => {
      const pendingCount = Math.max(0, state.pendingCount - 1)
      return { pendingCount, isLoading: pendingCount > 0 }
    }),
}))
