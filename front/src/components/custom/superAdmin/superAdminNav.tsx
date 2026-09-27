import { Link, useMatchRoute } from '@tanstack/react-router'

// Navigation locale entre les deux sections du super-admin (établissements,
// comptes) : ces écrans vivent hors de tout tenant (voir
// `routes/_authenticated/super-admin.tsx`), la barre de navigation
// principale n'a donc qu'une seule entrée vers eux (`/super-admin`, voir
// `sidebar.tsx`) — ce petit bandeau tient lieu d'onglets une fois entré
// dans la zone.
export const SuperAdminNav = () => {
  const matchRoute = useMatchRoute()
  const isActive = (to: string) => !!matchRoute({ to, fuzzy: false })

  const linkClassName = (active: boolean) =>
    `text-sm pb-2 border-b-2 transition-colors ${
      active
        ? 'border-primary text-text-dark font-semibold'
        : 'border-transparent text-text-light hover:text-text-dark'
    }`

  return (
    <nav className="flex gap-4 border-b border-border">
      <Link to="/super-admin" className={linkClassName(isActive('/super-admin'))}>
        Établissements
      </Link>
      <Link
        to="/super-admin/users"
        className={linkClassName(isActive('/super-admin/users'))}
      >
        Comptes
      </Link>
      <Link
        to="/super-admin/access-log"
        className={linkClassName(isActive('/super-admin/access-log'))}
      >
        Journal des accès
      </Link>
    </nav>
  )
}
