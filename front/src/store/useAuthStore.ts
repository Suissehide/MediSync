import { create } from 'zustand'
import { devtools, persist, subscribeWithSelector } from 'zustand/middleware'

import type { TenantContext, User } from '../types/auth.ts'
import { defaultTenantContext, forgetContext } from '../utils/tenant-context.ts'

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
  setContext: (context: TenantContext) => void
}

// Délègue à `defaultTenantContext` (front/src/utils/tenant-context.ts), le
// module pur écrit pour l'étape 2 : même résolution du premier couple
// établissement/service, même repli sur le dernier contexte visité, même
// garde contre un `user` de forme inattendue (état persisté d'une version
// antérieure, stockage corrompu). Deux implémentations du même calcul
// avaient déjà divergé sur cette garde ; `deriveContext` ne reste ici que
// parce que ses appelants ne sont pas encore réécrits — sa suppression est
// portée par les tâches qui les remplacent.
export const deriveContext = (user: User | null): TenantContext | null => defaultTenantContext(user)

export const useAuthStore = create<AuthStoreState & AuthStoreActions>()(
  subscribeWithSelector(
    devtools(
      persist(
        (set, get) => ({
          isAuthenticated: false,
          isInitialLoading: false,
          user: null,
          context: null,

          // Ne touche plus a `context` : `deriveContext(user)` ici tournait
          // a chaque navigation (appele depuis la garde de `_authenticated`),
          // donc sur tout ecran hors service `context` valait le dernier
          // couple visite — pas seulement un flag de permission, mais le
          // tenant que lisent les fabriques d'URL a l'appel, pour les
          // lectures comme pour les ecritures. Le contexte appartient desormais
          // aux layouts de route (`setContext`), et a eux seuls.
          update: (user: User | undefined) => {
            if (user) {
              set({ user })
            }
          },

          // A la connexion, aucune URL ne porte encore de contexte : c'est
          // le seul moment ou le deriver ici reste legitime.
          authenticate: (user: User | undefined) => {
            if (user) {
              set({ isAuthenticated: true, user, context: deriveContext(user) })
            }
          },

          logout: () => {
            // Purge le dernier couple memorise : sans ca, il survit a la
            // deconnexion et ressert au prochain compte sur ce poste.
            const userId = get().user?.id
            if (userId) {
              forgetContext(userId)
            }
            set({ isAuthenticated: false, user: null, context: null })
          },

          // Pose le contexte lu dans l'URL. Ecrit sans condition : le layout
          // l'a deja valide contre les appartenances.
          setContext: (context: TenantContext) => {
            set({ context })
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
