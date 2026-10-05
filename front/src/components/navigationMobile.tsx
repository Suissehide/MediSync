import { Link } from '@tanstack/react-router'
import { Globe } from 'lucide-react'
import { Fragment } from 'react'

import { FilAriane } from './custom/filAriane.tsx'
import { useOnglets } from './navbar.tsx'

// Sous `md`, les onglets du quotidien descendent sous le pouce, en bas de l'ecran.
export function BarreOnglets() {
  const { groupes, params, estActif } = useOnglets()
  if (groupes.length === 0) {
    return null
  }

  return (
    <nav
      aria-label="Onglets"
      className="md:hidden fixed bottom-0 inset-x-0 z-20 flex items-stretch bg-foreground border-t border-border-sidebar pb-[env(safe-area-inset-bottom)]"
    >
      {groupes.map((groupe, index) => (
        <Fragment key={groupe.nom || `groupe-${index}`}>
          {index > 0 && (
            <span
              aria-hidden="true"
              className="my-4 w-px shrink-0 bg-border-sidebar"
            />
          )}
          {groupe.items.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              params={params as never}
              activeOptions={{ exact: true }}
              aria-current={estActif(item) ? 'page' : undefined}
              className={`relative flex-1 min-w-0 h-14 flex items-center justify-center px-1 text-[13px] font-medium truncate transition-colors before:absolute before:top-0 before:inset-x-3 before:h-[3px] before:rounded-b before:bg-primary before:transition-transform ${
                estActif(item)
                  ? 'text-text before:scale-x-100'
                  : 'text-text-light before:scale-x-0'
              }`}
            >
              {item.label}
            </Link>
          ))}
        </Fragment>
      ))}
    </nav>
  )
}

// Tete du tiroir sous `md` : ce que la barre du haut n'a plus la place de porter.
export function TeteDuTiroir() {
  const { courant, user, params, administration, estActif } = useOnglets()

  return (
    <div className="md:hidden shrink-0 flex flex-col gap-1 py-3 border-b border-border-sidebar">
      <FilAriane className="h-auto flex-wrap gap-y-1 px-2 border-l-0" />

      {administration.length > 0 && (
        <>
          <div className="px-4 pt-3 pb-1 uppercase text-xs text-text-sidebar">
            Administration
          </div>
          {administration.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              params={params as never}
              activeOptions={{ exact: true }}
              aria-current={estActif(item) ? 'page' : undefined}
              className={`mx-2 px-3 py-2 rounded-md text-sm ${
                estActif(item)
                  ? 'bg-primary/20 text-text font-semibold'
                  : 'text-text-light hover:bg-white/8'
              }`}
            >
              {item.label}
            </Link>
          ))}
        </>
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
    </div>
  )
}
