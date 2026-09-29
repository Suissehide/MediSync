import { useRouter } from '@tanstack/react-router'
import { Building2, ChevronDown, Globe, ShieldCheck } from 'lucide-react'
import { Fragment } from 'react'

import { Button } from '@/components/ui/button.tsx'
import {
  PopoverContent,
  PopoverMenuItem,
  PopoverRoot,
  PopoverSeparator,
  PopoverTrigger,
} from '@/components/ui/popover.tsx'
import { type CurrentScale, useCurrentScale } from '@/navigation/navigation.ts'
import { useAuthStore } from '@/store/useAuthStore.ts'
import type { User } from '@/types/auth.ts'
import { accessibleDestinations, type Destination } from '@/utils/tenant-context.ts'

// Selecteur d'echelle (navigation par echelle, 2026-09-28). Remplace `TenantSelector`, qui ne
// connaissait que les couples etablissement › service : il liste TOUTES les destinations du
// compte — services, administration d'etablissement, plateforme — tirees de
// `accessibleDestinations`, la derivation que partage `/choose-context`.
//
// Rendu seulement a partir de deux destinations : un compte qui n'en a qu'une n'a rien a
// choisir. L'entree Plateforme n'existe que pour un super-admin (jamais grisee ni annoncee :
// voir le commentaire de `sidebar.tsx` sur l'absence de la zone pour les autres comptes).
//
// Comme l'ancien selecteur, ce composant ne fait que naviguer : le client de requetes neuf et
// la reinitialisation des stores sont armes a l'arrivee sur la route (`useTenantSwitch.ts`,
// layouts de service et d'etablissement).

// `id` : l'etablissement (ou `null` pour la plateforme). Deux etablissements peuvent porter le
// meme nom ; le regroupement et la cle React se font donc sur l'identifiant, jamais sur le titre.
type Groupe = { id: string | null; titre: string | null; destinations: Destination[] }

const grouper = (destinations: Destination[]): Groupe[] => {
  const groupes: Groupe[] = []
  for (const destination of destinations) {
    const id = destination.kind === 'platform' ? null : destination.establishment.id
    const titre = destination.kind === 'platform' ? null : destination.establishment.name
    const dernier = groupes.at(-1)
    if (dernier && dernier.id === id) {
      dernier.destinations.push(destination)
    } else {
      groupes.push({ id, titre, destinations: [destination] })
    }
  }
  return groupes
}

const cle = (destination: Destination): string => {
  switch (destination.kind) {
    case 'service':
      return `${destination.establishment.id}/${destination.service.id}`
    case 'admin':
      return `${destination.establishment.id}/admin`
    default:
      return 'plateforme'
  }
}

const icone = (destination: Destination) => {
  switch (destination.kind) {
    case 'service':
      return <Building2 className="w-4 h-4" />
    case 'admin':
      return <ShieldCheck className="w-4 h-4" />
    default:
      return <Globe className="w-4 h-4" />
  }
}

const intitule = (destination: Destination): string => {
  switch (destination.kind) {
    case 'service':
      return destination.service.name
    case 'admin':
      return "Administration de l'établissement"
    default:
      return 'Plateforme'
  }
}

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
    const service = etablissement?.services.find((s) => s.id === courant.serviceId)
    if (etablissement && service) {
      return `${etablissement.name} › ${service.name}`
    }
  }
  return 'Choisir un accès'
}

export const ScaleSelector = () => {
  const router = useRouter()
  const user = useAuthStore((state) => state.user)
  const courant = useCurrentScale()

  const destinations = accessibleDestinations(user)
  // A partir de deux destinations, il y a un choix. Avec une seule, le selecteur reste utile hors
  // des trois echelles (`/user/settings`…) : c'est le seul chemin nomme pour revenir, par exemple
  // pour un super-admin sans aucune appartenance, dont l'entree Plateforme a quitte le menu du
  // compte.
  if (destinations.length === 0 || (destinations.length === 1 && courant !== null)) {
    return null
  }

  const ouvrir = (destination: Destination) => {
    if (destination.kind === 'service') {
      void router.navigate({
        to: '/e/$establishmentId/s/$serviceId/dashboard',
        params: { establishmentId: destination.establishment.id, serviceId: destination.service.id },
      })
    } else if (destination.kind === 'admin') {
      void router.navigate({
        to: '/e/$establishmentId/admin/members',
        params: { establishmentId: destination.establishment.id },
      })
    } else {
      void router.navigate({ to: '/super-admin' })
    }
  }

  return (
    <PopoverRoot>
      <PopoverTrigger asChild>
        {/* Meme rendu que la maquette : texte clair sur la barre sombre, fond et bordure
        legers. La variante `none` du bouton impose `text-primary` (bleu), d'ou la couleur
        redonnee ici. */}
        <Button
          variant="none"
          className="h-9 gap-2 px-3 max-w-72 truncate rounded-lg border border-border-sidebar bg-white/5 text-text hover:bg-white/10"
          aria-label={`Changer d'accès (actuellement : ${libelle(user, courant)})`}
        >
          <Building2 className="w-4 h-4 shrink-0" />
          <span className="truncate text-sm">{libelle(user, courant)}</span>
          <ChevronDown className="w-4 h-4 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={2}>
        {grouper(destinations).map((groupe, index) => (
          <Fragment key={groupe.id ?? 'plateforme'}>
            {groupe.titre === null ? (
              index > 0 && <PopoverSeparator />
            ) : (
              <div className="px-2 pt-2 pb-1 text-xs font-semibold uppercase tracking-wide text-text-light">
                {groupe.titre}
              </div>
            )}
            {groupe.destinations.map((destination) => (
              <PopoverMenuItem
                key={cle(destination)}
                icon={icone(destination)}
                onClick={() => ouvrir(destination)}
              >
                {intitule(destination)}
              </PopoverMenuItem>
            ))}
          </Fragment>
        ))}
        <PopoverSeparator />
        <PopoverMenuItem onClick={() => void router.navigate({ to: '/choose-context' })}>
          Tous les accès…
        </PopoverMenuItem>
      </PopoverContent>
    </PopoverRoot>
  )
}
