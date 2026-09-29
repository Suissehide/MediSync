import { Link, useMatchRoute } from '@tanstack/react-router'
import { ChevronDown, PanelLeft } from 'lucide-react'
import { Fragment } from 'react'

import { can } from '../hooks/useCan.ts'
import { MENU_GROUPS, NAVIGATION, type NavItem, useCurrentScale } from '../navigation/navigation.ts'
import { useAuthStore } from '../store/useAuthStore.ts'
import { ScaleSelector } from './custom/scaleSelector.tsx'
import TodoSheet from './custom/todo/todoSheet.tsx'
import { Button } from './ui/button.tsx'
import { PopoverClose, PopoverContent, PopoverRoot, PopoverTrigger } from './ui/popover.tsx'

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

// Un groupe d'ecrans derriere un seul bouton (l'organisation du service) : ses ecrans sont des
// SOUS-CATEGORIES, decales vers la droite sous le titre du groupe et reunis par un filet, pour
// qu'on lise d'un coup d'oeil qu'ils relevent de lui.
function MenuDeGroupe({
  nom,
  items,
  actif,
  params,
}: {
  nom: string
  items: NavItem[]
  actif: boolean
  params: object
}) {
  return (
    <PopoverRoot>
      <PopoverTrigger asChild>
        <Button
          variant="none"
          className={`h-9 gap-1.5 px-3 rounded-lg border border-solid text-sm ${
            actif ? 'border-primary text-text' : 'border-transparent text-text-light hover:text-text'
          } data-[state=open]:border-primary data-[state=open]:bg-white/10 data-[state=open]:text-text`}
        >
          {nom}
          <ChevronDown className="w-4 h-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={6} className="w-80 p-2">
        <p className="px-3 pt-1 pb-2 text-xs font-semibold uppercase tracking-wide text-text-light">{nom}</p>
        <div className="ml-3 flex flex-col gap-0.5 border-l-2 border-border pl-3">
          {items.map((item) => (
            <PopoverClose asChild key={item.to}>
              <Link
                to={item.to}
                params={params as never}
                className="flex flex-col gap-0.5 rounded-md px-3 py-2 hover:bg-primary/10 focus-visible:bg-primary/10 outline-none"
                activeProps={{ 'aria-current': 'page', className: 'bg-primary/10' }}
              >
                <span className="text-sm font-medium text-text-dark">{item.label}</span>
                {item.description && <span className="text-xs text-text-light">{item.description}</span>}
              </Link>
            </PopoverClose>
          ))}
        </div>
      </PopoverContent>
    </PopoverRoot>
  )
}

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
  // Groupes consecutifs de la table, dans l'ordre : un separateur entre deux groupes, et un menu
  // deroulant pour un groupe de `MENU_GROUPS`.
  const groupes: { nom: string; items: NavItem[] }[] = []
  for (const item of onglets) {
    const dernier = groupes.at(-1)
    if (dernier && dernier.nom === item.group) {
      dernier.items.push(item)
    } else {
      groupes.push({ nom: item.group, items: [item] })
    }
  }

  const estActif = (item: NavItem) =>
    !!matchRoute({
      to: item.to,
      params: params as never,
      fuzzy: item.matchPrefix ?? false,
    }) || (item.activeAlso ?? []).some((to) => !!matchRoute({ to, fuzzy: false }))

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

        {groupes.length > 0 && (
          <nav aria-label="Navigation" className="flex items-center gap-4 pl-2">
            {groupes.map((groupe, index) => (
              <Fragment key={groupe.nom || `groupe-${index}`}>
                {index > 0 && <span aria-hidden="true" className="h-5 w-px bg-border-sidebar" />}
                {MENU_GROUPS.has(groupe.nom) ? (
                  <MenuDeGroupe nom={groupe.nom} items={groupe.items} actif={groupe.items.some(estActif)} params={params} />
                ) : (
                  groupe.items.map((item) => (
                    <Link
                      key={item.to}
                      to={item.to}
                      params={params as never}
                      aria-current={estActif(item) ? 'page' : undefined}
                      className={`${TAB_CLASS} whitespace-nowrap ${estActif(item) ? 'text-text after:scale-x-100' : 'text-text-light'}`}
                    >
                      {item.label}
                    </Link>
                  ))
                )}
              </Fragment>
            ))}
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
