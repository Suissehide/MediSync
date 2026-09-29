import { Building2, Check, ChevronDown } from 'lucide-react'
import { Fragment } from 'react'

import {
  cleDestination,
  grouperDestinations,
  iconeDestination,
  intituleDestination,
  LibelleServices,
  TitreEtablissement,
  useOuvrirDestination,
} from '@/components/custom/destinations.tsx'
import { Button } from '@/components/ui/button.tsx'
import {
  PopoverContent,
  PopoverMenuItem,
  PopoverRoot,
  PopoverSeparator,
  PopoverSubGroup,
  PopoverTrigger,
} from '@/components/ui/popover.tsx'
import { type CurrentScale, useCurrentScale } from '@/navigation/navigation.ts'
import { useAuthStore } from '@/store/useAuthStore.ts'
import type { User } from '@/types/auth.ts'
import {
  accessibleDestinations,
  type Destination,
} from '@/utils/tenant-context.ts'

// Selecteur d'echelle (navigation par echelle, 2026-09-28). Remplace `TenantSelector`, qui ne
// connaissait que les couples etablissement › service : il liste TOUTES les destinations du
// compte — services, administration d'etablissement, plateforme — tirees de
// `accessibleDestinations`, la derivation que partage `/choose-context`, et presentees comme
// sur cette page (`destinations.tsx`). Pas de lien « Tous les accès… » : il menait a la meme
// liste ; `/choose-context` ne sert plus que de page de repli.
//
// Rendu seulement a partir de deux destinations : un compte qui n'en a qu'une n'a rien a
// choisir. L'entree Plateforme n'existe que pour un super-admin (jamais grisee ni annoncee :
// voir le commentaire de `sidebar.tsx` sur l'absence de la zone pour les autres comptes).
//
// Comme l'ancien selecteur, ce composant ne fait que naviguer : le client de requetes neuf et
// la reinitialisation des stores sont armes a l'arrivee sur la route (`useTenantSwitch.ts`,
// layouts de service et d'etablissement).

const nomEtablissement = (user: User | null, establishmentId: string) =>
  user?.establishments.find((e) => e.id === establishmentId)

// Le libelle suit l'echelle de la ROUTE, pas le store : sur `/user/settings`, le store porte
// encore le dernier service visite, qui n'est pas l'endroit ou l'on se trouve.
const libelle = (user: User | null, courant: CurrentScale | null): string => {
  if (courant?.scale === 'platform') {
    return 'Plateforme'
  }
  if (courant?.scale === 'establishment') {
    const etablissement = nomEtablissement(user, courant.establishmentId)
    return `${etablissement?.name ?? 'Établissement'} › Administration`
  }
  if (courant?.scale === 'service') {
    const etablissement = nomEtablissement(user, courant.establishmentId)
    const service = etablissement?.services.find(
      (s) => s.id === courant.serviceId,
    )
    if (etablissement && service) {
      return `${etablissement.name} › ${service.name}`
    }
  }
  return 'Choisir un accès'
}

export const ScaleSelector = () => {
  const ouvrir = useOuvrirDestination()
  const user = useAuthStore((state) => state.user)
  const courant = useCurrentScale()

  const destinations = accessibleDestinations(user)
  // A partir de deux destinations, il y a un choix. Avec une seule, le selecteur reste utile hors
  // des trois echelles (`/user/settings`…) : c'est le seul chemin nomme pour revenir, par exemple
  // pour un super-admin sans aucune appartenance, dont l'entree Plateforme a quitte le menu du
  // compte.
  if (
    destinations.length === 0 ||
    (destinations.length === 1 && courant !== null)
  ) {
    return null
  }

  const estCourante = (destination: Destination) =>
    (destination.kind === 'service' &&
      courant?.scale === 'service' &&
      courant.serviceId === destination.service.id) ||
    (destination.kind === 'admin' &&
      courant?.scale === 'establishment' &&
      courant.establishmentId === destination.establishment.id)

  return (
    <PopoverRoot>
      <PopoverTrigger asChild>
        {/* Meme rendu que la maquette : texte clair sur la barre sombre, fond et bordure
        legers. La variante `none` du bouton impose `text-primary` (bleu), d'ou la couleur
        redonnee ici. */}
        <Button
          variant="none"
          className="h-9 gap-2 px-3 max-w-72 truncate rounded-lg border border-solid border-border-sidebar bg-white/5 text-text hover:bg-white/10"
          aria-label={`Changer d'accès (actuellement : ${libelle(user, courant)})`}
        >
          <Building2 className="w-4 h-4 shrink-0" />
          <span className="truncate text-sm">{libelle(user, courant)}</span>
          <ChevronDown className="w-4 h-4 shrink-0" />
        </Button>
      </PopoverTrigger>
      {/* Meme largeur que le declencheur : le menu se lit comme le deroulant de ce bouton. */}
      <PopoverContent
        align="start"
        sideOffset={4}
        className="w-(--radix-popover-trigger-width) p-1.5"
      >
        {grouperDestinations(destinations).map((groupe, index) =>
          groupe.titre === null ? (
            <Fragment key="plateforme">
              {index > 0 && <PopoverSeparator />}
              {groupe.destinations.map((destination) => (
                <PopoverMenuItem
                  key={cleDestination(destination)}
                  icon={iconeDestination(destination)}
                  onClick={() => ouvrir(destination)}
                >
                  {intituleDestination(destination)}
                </PopoverMenuItem>
              ))}
            </Fragment>
          ) : (
            // L'etablissement en titre — cliquable vers son administration pour qui l'administre —
            // et ses services DECALES dessous : on lit d'un coup d'oeil qu'ils en relevent.
            <div key={groupe.id} className="flex flex-col">
              {index > 0 && <PopoverSeparator />}
              <TitreEtablissement
                titre={groupe.titre}
                onOuvrir={
                  groupe.administration
                    ? () => groupe.administration && ouvrir(groupe.administration)
                    : undefined
                }
                courant={
                  groupe.administration !== null &&
                  estCourante(groupe.administration)
                }
              />
              {groupe.destinations.length > 0 && (
                <PopoverSubGroup className="mb-1">
                  <LibelleServices />
                  {groupe.destinations.map((destination) => (
                    <PopoverMenuItem
                      key={cleDestination(destination)}
                      onClick={() => ouvrir(destination)}
                      className={
                        estCourante(destination)
                          ? 'bg-primary/10 font-semibold text-primary'
                          : undefined
                      }
                      ariaCurrent={estCourante(destination)}
                    >
                      <span className="truncate">
                        {intituleDestination(destination)}
                      </span>
                      {estCourante(destination) && (
                        <Check className="ml-auto w-4 h-4 shrink-0" />
                      )}
                    </PopoverMenuItem>
                  ))}
                </PopoverSubGroup>
              )}
            </div>
          ),
        )}
      </PopoverContent>
    </PopoverRoot>
  )
}
