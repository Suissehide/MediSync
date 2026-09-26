import { Link, useMatchRoute } from '@tanstack/react-router'

// Navigation locale entre les trois onglets de l'administration
// d'établissement (services, accès temporaires, membres) — même parti pris
// que `superAdminNav.tsx` (tâche 12) : chaque écran vit sous sa propre
// route et rend son propre `DashboardLayout`, ce bandeau tient lieu
// d'onglets une fois entré dans la zone.
interface EstablishmentAdminNavProps {
  establishmentId: string
}

export const EstablishmentAdminNav = ({
  establishmentId,
}: EstablishmentAdminNavProps) => {
  const matchRoute = useMatchRoute()
  const isActive = (to: string) =>
    !!matchRoute({
      to,
      params: { establishmentId },
      fuzzy: false,
    })

  const linkClassName = (active: boolean) =>
    `text-sm pb-2 border-b-2 transition-colors ${
      active
        ? 'border-primary text-text-dark font-semibold'
        : 'border-transparent text-text-light hover:text-text-dark'
    }`

  return (
    <nav className="flex gap-4 border-b border-border">
      <Link
        to="/e/$establishmentId/admin/services"
        params={{ establishmentId }}
        className={linkClassName(isActive('/e/$establishmentId/admin/services'))}
      >
        Services
      </Link>
      <Link
        to="/e/$establishmentId/admin/grants"
        params={{ establishmentId }}
        className={linkClassName(isActive('/e/$establishmentId/admin/grants'))}
      >
        Accès temporaires
      </Link>
      <Link
        to="/e/$establishmentId/admin/members"
        params={{ establishmentId }}
        className={linkClassName(isActive('/e/$establishmentId/admin/members'))}
      >
        Membres
      </Link>
    </nav>
  )
}
