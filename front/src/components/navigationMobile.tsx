import { Link } from '@tanstack/react-router'
import { ChevronDown, Globe } from 'lucide-react'
import { Fragment } from 'react'

import type { NavItem } from '../navigation/navigation.ts'
import { FilAriane } from './custom/filAriane.tsx'
import { useOnglets } from './navbar.tsx'

const lien = (actif: boolean) =>
  `mx-2 px-3 py-2 rounded-md text-sm ${
    actif
      ? 'bg-primary/20 text-text font-semibold'
      : 'text-text-light hover:bg-white/8'
  }`

// Tete du tiroir sous `md` : ce que la barre du haut n'a plus la place de porter.
export function TeteDuTiroir() {
  const { courant, user, params, groupes, administration, estActif } =
    useOnglets()

  const lienVers = (item: NavItem) => (
    <Link
      key={item.to}
      to={item.to}
      params={params as never}
      activeOptions={{ exact: true }}
      aria-current={estActif(item) ? 'page' : undefined}
      className={lien(estActif(item))}
    >
      {item.label}
    </Link>
  )

  return (
    <nav
      aria-label="Menu"
      className="md:hidden shrink-0 flex flex-col gap-1 py-3 border-b border-border-sidebar"
    >
      <FilAriane className="h-auto flex-wrap gap-y-1 px-2 pb-2 border-l-0" />

      {groupes.map((groupe, index) => (
        <Fragment key={groupe.nom || `groupe-${index}`}>
          {index > 0 && (
            <span
              aria-hidden="true"
              className="mx-4 my-1 h-px bg-border-sidebar"
            />
          )}
          {groupe.items.map(lienVers)}
        </Fragment>
      ))}

      {administration.length > 0 && (
        <details className="group flex flex-col gap-1 mt-1">
          <summary
            className={`${lien(administration.some(estActif))} flex items-center justify-between cursor-pointer list-none [&::-webkit-details-marker]:hidden`}
          >
            Administration
            <ChevronDown className="w-4 h-4 transition-transform group-open:rotate-180" />
          </summary>
          <div className="flex flex-col gap-1 mt-1 ml-3 pl-1 border-l border-border-sidebar">
            {administration.map(lienVers)}
          </div>
        </details>
      )}

      {/* Absent, jamais grise, pour un compte sans le drapeau : voir `sidebar.tsx`. */}
      {user?.isSuperAdmin && (
        <Link
          to="/super-admin"
          className={`mx-2 mt-2 px-3 py-2.5 flex items-center gap-2 rounded-md text-sm font-semibold ${
            courant?.scale === 'platform'
              ? 'bg-secondary-dark text-white'
              : 'text-text-light hover:bg-white/8'
          }`}
        >
          <Globe className="w-4 h-4" />
          Plateforme
        </Link>
      )}
    </nav>
  )
}
