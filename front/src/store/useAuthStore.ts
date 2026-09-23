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
//
// Appelée depuis les `beforeLoad` du routeur, donc avant tout rendu : elle doit
// tolérer un `user` de forme inattendue plutôt que de lever. Un utilisateur
// venant d'une version antérieure porte un `user` sans `establishments` dans
// son stockage local ; `migrate` ci-dessous le purge, mais ce garde reste la
// deuxième barrière — une exception ici remplace toute l'application par un
// écran d'erreur, sans même laisser atteindre la page de connexion.
export const deriveContext = (user: User | null): TenantContext | null => {
  if (!user || !Array.isArray(user.establishments)) {
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
          // `user` a changé de forme avec le multi-tenant : l'ancien portait un
          // `role` global, le nouveau un arbre `establishments`. Rien ne
          // rafraîchit `user` au chargement — le stockage local fait foi
          // jusqu'à la prochaine connexion — donc un état d'une version
          // antérieure survivrait indéfiniment. Incrémenter `version` à chaque
          // changement de forme de `user` et purger dans `migrate` : la
          // personne se reconnecte une fois, ce que son cookie de session rend
          // immédiat, au lieu de rester bloquée sur un écran d'erreur.
          version: 1,
          migrate: () => ({
            isAuthenticated: false,
            user: null,
            context: null,
          }),
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
