import { create } from 'zustand'
import { devtools, persist, subscribeWithSelector } from 'zustand/middleware'

import type { TenantContext, User } from '../types/auth.ts'

export interface AuthStoreState {
  isAuthenticated: boolean
  isInitialLoading: boolean
  user: User | null
  context: TenantContext | null
}

export interface AuthStoreActions {
  update: (user: User) => void
  authenticate: (user: User | undefined) => void
  logout: () => void
}

// Étape 1 : un seul contexte par session, le premier couple établissement/service
// trouvé. L'étape 2 apporte le sélecteur et la mémorisation du dernier contexte.
export const deriveContext = (user: User | null): TenantContext | null => {
  if (!user) {
    return null
  }
  for (const est of user.establishments) {
    const service = est.services[0]
    if (service) {
      return {
        establishmentId: est.id,
        serviceId: service.id,
        establishmentRole: est.role,
        serviceRole: service.role,
        soignantId: est.soignantId,
      }
    }
  }
  return null
}

export const useAuthStore = create<AuthStoreState & AuthStoreActions>()(
  subscribeWithSelector(
    devtools(
      persist(
        (set) => ({
          isAuthenticated: false,
          isInitialLoading: false,
          user: null,
          context: null,

          update: (user: User | undefined) => {
            if (user) {
              set({ user, context: deriveContext(user) })
            }
          },

          authenticate: (user: User | undefined) => {
            if (user) {
              set({ isAuthenticated: true, user, context: deriveContext(user) })
            }
          },

          logout: () => {
            set({ isAuthenticated: false, user: null, context: null })
          },
        }),
        {
          name: 'auth-store',
          // Le contexte est dérivé de `user`, mais on le persiste avec lui
          // pour éviter un flash sans contexte au rechargement de la page.
          partialize: (state) => ({
            isAuthenticated: state.isAuthenticated,
            user: state.user,
            context: state.context,
          }),
        },
      ),
    ),
  ),
)
