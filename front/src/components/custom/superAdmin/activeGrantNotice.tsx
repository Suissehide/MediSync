import { ShieldAlert } from 'lucide-react'

import { useSuperAdminRevokeGrant } from '../../../queries/useSuperAdmin.ts'
import { useAuthStore } from '../../../store/useAuthStore.ts'
import { useLastGrantStore } from '../../../store/useLastGrantStore.ts'
import { Button } from '../../ui/button.tsx'

interface ActiveGrantNoticeProps {
  establishmentId: string
}

// `GET /me` dit déjà, par établissement, si l'accès du compte connecté vient d'un octroi
// (`origine: 'octroi'`). Affiché sur l'écran de détail : ça décourage le doublon (le back refuse
// de toute façon un second octroi actif sur le même établissement,
// `ACTIVE_GRANT_EXISTS`), et ça rend `useSuperAdminRevokeGrant` atteignable
// pour l'octroi que CE client vient de créer (voir `useLastGrantStore.ts`
// pour la raison exacte de cette limite : aucune route ne liste les
// octrois existants, l'identifiant n'est jamais vu ailleurs qu'à la
// création).
export const ActiveGrantNotice = ({
  establishmentId,
}: ActiveGrantNoticeProps) => {
  const user = useAuthStore((state) => state.user)
  const origine = user?.establishments.find(
    (e) => e.id === establishmentId,
  )?.origine
  const grantId = useLastGrantStore(
    (state) => state.grantIdByEstablishment[establishmentId],
  )
  const revoke = useSuperAdminRevokeGrant()

  if (origine !== 'octroi') {
    return null
  }

  return (
    <div className="flex items-center justify-between gap-3 bg-primary/10 border border-primary/20 rounded-lg px-4 py-2 text-sm">
      <div className="flex items-center gap-2">
        <ShieldAlert className="w-4 h-4 text-primary shrink-0" />
        <span>
          Vous disposez déjà d'un accès actif sur cet établissement (octroi).
        </span>
      </div>
      {grantId ? (
        <Button
          variant="outline"
          size="sm"
          onClick={() => revoke.mutate(grantId)}
          isLoading={revoke.isPending}
        >
          Révoquer mon octroi
        </Button>
      ) : (
        // Créé par une autre session (un autre onglet, un précédent
        // chargement de page) : son identifiant n'a jamais été vu par
        // CELLE-ci, faute de route de lecture — voir useLastGrantStore.ts.
        <span className="text-xs text-text-light">
          Révocation indisponible depuis cette session
        </span>
      )}
    </div>
  )
}
