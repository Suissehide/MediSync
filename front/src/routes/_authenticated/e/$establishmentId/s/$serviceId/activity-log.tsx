import { createFileRoute, redirect } from '@tanstack/react-router'

// Ecran demenage a l'echelle de l'etablissement (navigation par echelle, 2026-09-28) : cette
// adresse, gardee pour les favoris, mene a son equivalent d'administration du MEME
// etablissement, parametres de recherche compris (TanStack Router ne les reporte pas de
// lui-meme ; `search: true` les reprend tels quels). Le layout d'administration refusera un
// compte qui n'administre pas cet etablissement, comme il le fait deja pour Membres.
export const Route = createFileRoute(
  '/_authenticated/e/$establishmentId/s/$serviceId/activity-log',
)({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: '/e/$establishmentId/admin/activity-log',
      params: { establishmentId: params.establishmentId },
      search: true,
    })
  },
})
