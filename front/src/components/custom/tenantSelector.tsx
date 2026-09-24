import { useRouter } from '@tanstack/react-router'
import { Building2, ChevronDown } from 'lucide-react'

import { useAuthStore } from '@/store/useAuthStore.ts'
import { Button } from '@/components/ui/button.tsx'
import {
  PopoverContent,
  PopoverMenuItem,
  PopoverRoot,
  PopoverTrigger,
} from '@/components/ui/popover.tsx'
import { accessibleCouples } from '@/utils/tenant-context.ts'

// Affiche seulement si plus d'un couple est accessible : la tres grande
// majorite des comptes n'en a qu'un et ne doit pas voir apparaitre une
// commande sans objet.
//
// Ce composant ne fait que naviguer (`router.navigate`) : le client de
// requetes neuf, la reinitialisation des stores et la rehydratation du
// stockage sont declenches par le mecanisme arme a l'arrivee sur la route
// (voir `useTenantSwitch.ts` et les layouts de service/etablissement), pas
// par lui.
export const TenantSelector = () => {
  const router = useRouter()
  const user = useAuthStore((state) => state.user)
  const context = useAuthStore((state) => state.context)

  const couples = accessibleCouples(user)

  if (couples.length <= 1) {
    return null
  }

  const current = couples.find(
    (c) => c.establishment.id === context?.establishmentId && c.service.id === context?.serviceId,
  )

  return (
    <PopoverRoot>
      <PopoverTrigger asChild>
        <Button variant="none" className="gap-2 px-2 max-w-60 truncate" aria-label="Changer de service">
          <Building2 className="w-4 h-4 shrink-0" />
          <span className="truncate text-sm">
            {current ? `${current.establishment.name} › ${current.service.name}` : 'Choisir un service'}
          </span>
          <ChevronDown className="w-4 h-4 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={2}>
        {couples.map(({ establishment, service }) => (
          <PopoverMenuItem
            key={`${establishment.id}/${service.id}`}
            icon={<Building2 className="w-4 h-4" />}
            onClick={() =>
              // Une fiche patient precise n'a pas d'equivalent dans un autre
              // service tant que l'etape 3 n'a pas cree les sous-dossiers :
              // on ramene donc toujours a l'index du service.
              router.navigate({
                to: '/e/$establishmentId/s/$serviceId/dashboard',
                params: { establishmentId: establishment.id, serviceId: service.id },
              })
            }
          >
            {establishment.name} › {service.name}
          </PopoverMenuItem>
        ))}
      </PopoverContent>
    </PopoverRoot>
  )
}
