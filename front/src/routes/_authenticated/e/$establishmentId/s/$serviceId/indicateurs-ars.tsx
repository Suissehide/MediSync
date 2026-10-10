import { createFileRoute, Navigate, redirect } from '@tanstack/react-router'

import { can } from '@/hooks/useCan.ts'
import { useIndicatorSetsQuery } from '@/queries/useIndicatorSet.ts'
import { resolveTenantContext } from '@/utils/tenant-context.ts'

// Ancienne adresse de la grille ARS : le jeu « Grille ARS » du service, ou l'Activité s'il n'en a pas.
export const Route = createFileRoute(
  '/_authenticated/e/$establishmentId/s/$serviceId/indicateurs-ars',
)({
  beforeLoad: ({ context, params }) => {
    const tenant = resolveTenantContext(context.authState.user, params)
    if (!can(tenant, 'stats:read')) {
      throw redirect({
        to: '/e/$establishmentId/s/$serviceId/dashboard',
        params,
      })
    }
  },
  component: AncienneGrilleArs,
})

function AncienneGrilleArs() {
  const params = Route.useParams()
  const { sets, error } = useIndicatorSetsQuery()
  if (!sets && !error) {
    return null
  }
  const grille = sets?.find((set) => set.name === 'Grille ARS')
  return grille ? (
    <Navigate
      to="/e/$establishmentId/s/$serviceId/indicateurs/$setId"
      params={{ ...params, setId: grille.id }}
      replace
    />
  ) : (
    <Navigate
      to="/e/$establishmentId/s/$serviceId/activite"
      params={params}
      replace
    />
  )
}
