import { create } from 'zustand'

interface LastGrantState {
  // Établissement -> identifiant du DERNIER octroi créé PAR CE CLIENT pour
  // cet établissement. Volontairement
  // en mémoire, jamais persisté : `GET /me` dit qu'un octroi est actif
  // (`origine: 'octroi'`) mais ne rend jamais l'identifiant de la ligne
  // (`EffectiveMembership`, back/src/main/types/domain/
  // accessGrant.domain.interface.ts, ne porte que l'établissement, le rôle
  // et les services — aucun id de `SuperAdminAccessGrant`), et aucune route
  // super-admin ne liste les octrois existants pour les relire après coup.
  // Le seul moment où le front voit jamais cet identifiant est la réponse
  // de `POST /super-admin/grants` au moment de la création. Se souvenir de
  // celui-là, et seulement de celui-là, rend `useSuperAdminRevokeGrant`
  // atteignable pour l'octroi qu'ON vient de créer, dans la même session —
  // jamais pour un octroi créé par un autre super-admin, ni pour le sien
  // après un rechargement de page : limitation acceptée, documentée sur
  // `ActiveGrantNotice`, faute d'une route de lecture qui n'existe pas.
  grantIdByEstablishment: Record<string, string>
  recordGrant: (establishmentId: string, grantId: string) => void
}

export const useLastGrantStore = create<LastGrantState>()((set) => ({
  grantIdByEstablishment: {},
  recordGrant: (establishmentId, grantId) =>
    set((state) => ({
      grantIdByEstablishment: {
        ...state.grantIdByEstablishment,
        [establishmentId]: grantId,
      },
    })),
}))
