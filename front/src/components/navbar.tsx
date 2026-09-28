import { Link, useMatchRoute } from '@tanstack/react-router'
import { PanelLeft } from 'lucide-react'
import { Fragment } from 'react'

import { can } from '../hooks/useCan.ts'
import { NAVIGATION, type NavItem, useCurrentScale } from '../navigation/navigation.ts'
import { useAuthStore } from '../store/useAuthStore.ts'
import { ScaleSelector } from './custom/scaleSelector.tsx'
import TodoSheet from './custom/todo/todoSheet.tsx'
import { Button } from './ui/button.tsx'

interface NavbarProps {
  toggleSidebar: () => void
}

// Navigation par echelle (2026-09-28) : une seule grammaire. La barre affiche les onglets de
// l'echelle de la ROUTE courante (`useCurrentScale`), tires de la table `NAVIGATION`, et
// seulement ceux-la. Le popover de reglages et les bandeaux d'onglets des zones
// d'administration ont disparu ; un ecran de section sans onglet fait rougir
// `navigation.test.ts`.
const TAB_CLASS = `relative cursor-pointer transition-colors duration-300
  after:content-[''] after:absolute after:left-0 after:top-full after:w-full after:h-[3px] after:bg-primary after:scale-x-0 after:origin-right after:transition-transform after:duration-300
  hover:after:scale-x-100 hover:after:origin-left`

function Navbar({ toggleSidebar }: NavbarProps) {
  const matchRoute = useMatchRoute()
  const courant = useCurrentScale()
  // Les permissions se lisent sur le contexte que le layout de la route a pose — le store ne
  // decide jamais de l'ECHELLE (voir `useCurrentScale`), seulement, a l'interieur de celle-ci,
  // des onglets que le role autorise.
  const context = useAuthStore((state) => state.context)
  const user = useAuthStore((state) => state.user)

  const params =
    courant?.scale === 'service'
      ? { establishmentId: courant.establishmentId, serviceId: courant.serviceId }
      : courant?.scale === 'establishment'
        ? { establishmentId: courant.establishmentId }
        : {}

  const visible = (item: NavItem) =>
    courant?.scale === 'platform'
      ? user?.isSuperAdmin === true
      : item.permission === undefined || can(context, item.permission)

  const onglets = courant ? NAVIGATION[courant.scale].filter(visible) : []

  // INVARIANT MULTI-TENANT — cette condition porte sur la ROUTE, jamais sur
  // le store. Cette barre est rendue par `DashboardLayout`, donc aussi par
  // `/user/settings`, qui vit HORS des deux layouts de tenant : le contexte
  // du store y porte encore le dernier service visite, et s'y fier ferait
  // apparaitre le panneau des taches sur un ecran qu'aucun changement de
  // contexte ne demonte (seuls `e/$establishmentId/s/$serviceId` et
  // `e/$establishmentId/admin` declarent `remountDeps`). L'observateur de
  // `useTodoQueries` resterait alors lie a l'ANCIEN client de requetes —
  // React Query lie l'observateur au client a la construction et ne le relie
  // jamais — et afficherait les taches d'un autre service.
  // Verrouille par `navbar.test.tsx`.
  const sousLayoutDeService = courant?.scale === 'service'

  return (
    <div className="fixed top-0 left-0 right-0 z-50 px-4 h-16 flex justify-between items-center bg-foreground text-text border-b border-border-sidebar">
      <div className="flex items-center gap-4 min-w-0">
        <div className="flex items-center gap-2 shrink-0">
          <h2 className="px-2 text-3xl font-bold">
            <span className="text-primary">Medi</span>Sync
          </h2>
          <Button
            variant="none"
            size="icon"
            onClick={toggleSidebar}
            className="cursor-pointer text-text"
            aria-label="Afficher ou masquer le panneau latéral"
          >
            <PanelLeft className="w-5 h-5" />
          </Button>
          <ScaleSelector />
        </div>

        {onglets.length > 0 && (
          <nav aria-label="Navigation" className="flex items-center gap-4 pl-2">
            {onglets.map((item, index) => {
              const actif = !!matchRoute({
                to: item.to,
                params: params as never,
                fuzzy: item.matchPrefix ?? false,
              })
              const nouveauGroupe = index > 0 && onglets[index - 1].group !== item.group
              return (
                <Fragment key={item.to}>
                  {nouveauGroupe && (
                    <span aria-hidden="true" className="h-5 w-px bg-border-sidebar" />
                  )}
                  <Link
                    to={item.to}
                    params={params as never}
                    aria-current={actif ? 'page' : undefined}
                    className={`${TAB_CLASS} whitespace-nowrap ${actif ? 'text-text after:scale-x-100' : 'text-text-light'}`}
                  >
                    {item.label}
                  </Link>
                </Fragment>
              )
            })}
          </nav>
        )}
      </div>
      <div className="flex gap-8 pl-4 border-l border-border-sidebar">
        <div className="flex items-center gap-2">
          {/* Les todos sont un objet de service (`todo:own` est une
          permission de service, pas d'etablissement) : hors du layout de
          service, `useTodoQueries` appellerait `tenantApiUrl`, qui leve
          volontairement. La condition est celle de la ROUTE et non celle du
          store : voir le commentaire de `sousLayoutDeService` ci-dessus, qui
          dit pourquoi les deux ne coincident pas. */}
          {sousLayoutDeService && <TodoSheet />}
        </div>
      </div>
    </div>
  )
}

export default Navbar
